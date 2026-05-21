"""
Direct scoring script — bypasses n8n entirely.
Scores ALL calls with status 'processing' or 'pending' that have a transcript.
Uses Anthropic API (Haiku) directly with 5 parallel threads.

Run: python scripts/direct_score.py
Log: scripts/score_log.txt
"""
import json, re, os, time, urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# ── Load .env ──────────────────────────────────────────────────────────────────
env = {}
env_path = Path(__file__).parent.parent / '.env'
for line in env_path.read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL  = env['SUPABASE_URL'].strip()
SUPABASE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'].strip()
ANTHROPIC_KEY = env['ANTHROPIC_API_KEY'].strip()

MAX_TRANSCRIPT = 5000   # chars to send to Claude
MAX_WORKERS    = 5      # parallel threads
MAX_TOTAL      = 9999   # safety cap
MAX_TOKENS     = 4096   # tokens in Claude response

_print_lock = threading.Lock()
_counter    = {'ok': 0, 'fail': 0, 'skip': 0}

def log(msg):
    with _print_lock:
        print(msg, flush=True)

# ── Supabase helpers ───────────────────────────────────────────────────────────
def _sb_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }

def sb_get(path: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers=_sb_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_post(table: str, body) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=_sb_headers(), method='POST')
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read())
        return result[0] if isinstance(result, list) and result else result

def sb_patch(table: str, filter_str: str, body: dict) -> int:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{filter_str}"
    data = json.dumps(body).encode()
    h = {**_sb_headers(), 'Prefer': 'return=minimal'}
    req = urllib.request.Request(url, data=data, headers=h, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

# ── Anthropic ──────────────────────────────────────────────────────────────────
SYSTEM = """You are an expert sales coach for WeBuildTrades, a UK marketing agency for trade businesses.
Analyze the transcript and return ONE JSON object — no markdown, no explanation, ONLY the JSON.

Required fields (use [] if nothing relevant, never omit):
overall_score (0-10), summary (2-3 sentences), meeting_phase (discovery/onboarding/kick_off/ai_onboarding/strategy_review/status_update/sales_pitch/demo/training/internal_sync/one_on_one/project_review/quarterly_review/closing_call/renewal/escalation/feedback_session/content_review/other),
attendees (array of "Name — role"), talk_time_breakdown (array of {speaker,seconds,percentage}),
key_points (array), decisions (array), action_items (array "[HIGH/MED/LOW] Task — Owner: X — Due: Y"),
next_steps (array), open_questions (array), risks (array), suggestions (array), projects (array),
banned_phrases (array of weak/filler phrases spoken),
strengths (array of {criterion,score,description,evidence_quote,timestamp_seconds}),
improvements (array of {criterion,score,description,evidence_quote,timestamp_seconds}),
coaching_priorities (top 3 for sales calls only, else [] — {priority,area,what_happened,what_to_do_instead,impact}),
meeting_effectiveness ({score,agenda_clarity,decisions_ratio,action_coverage,focus_score,summary})"""

def call_anthropic(transcript: str) -> str:
    url = 'https://api.anthropic.com/v1/messages'
    payload = {
        'model': 'claude-haiku-4-5-20251001',
        'max_tokens': MAX_TOKENS,
        'system': SYSTEM,
        'messages': [{'role': 'user', 'content': f'Analyze:\n\n{transcript[:MAX_TRANSCRIPT]}'}]
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    }, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        result = json.loads(r.read())
    return result['content'][0]['text']

def parse_score(text: str) -> dict:
    clean = text.strip()
    # Strip markdown code fences
    if clean.startswith('```'):
        lines = clean.split('\n')
        clean = '\n'.join(lines[1:])
        if clean.endswith('```'):
            clean = clean[:-3]
    clean = clean.strip()
    # If model returned markdown prose, extract embedded JSON object
    if not clean.startswith('{'):
        start = clean.find('{')
        end = clean.rfind('}')
        if start != -1 and end > start:
            clean = clean[start:end + 1]
    def _repair(s: str) -> str:
        s = re.sub(r',\s*([}\]])', r'\1', s)          # remove trailing commas
        s = re.sub(r'([}\]"0-9])\s*\n(\s*[{\["])',    # add missing commas between elements
                   lambda m: m.group(1) + ',\n' + m.group(2), s)
        return s

    clean = _repair(clean)
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Second attempt: also strip unescaped control characters
        clean2 = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', clean)
        return json.loads(_repair(clean2))

def build_evidence(sc: dict) -> list:
    ev = []
    if sc.get('meeting_phase'):
        ev.append({'criterion_key': 'meeting_phase', 'quote': str(sc['meeting_phase']).strip(), 'timestamp_seconds': None})
    for a in (sc.get('attendees') or []):
        ev.append({'criterion_key': 'attendee', 'quote': str(a), 'timestamp_seconds': None})
    if sc.get('talk_time_breakdown'):
        ev.append({'criterion_key': 'talk_time_breakdown', 'quote': json.dumps(sc['talk_time_breakdown']), 'timestamp_seconds': None})
    for s in (sc.get('strengths') or []):
        if s.get('evidence_quote'):
            ev.append({'criterion_key': s.get('criterion','strength'), 'quote': s['evidence_quote'], 'timestamp_seconds': s.get('timestamp_seconds')})
    for s in (sc.get('improvements') or []):
        if s.get('evidence_quote'):
            ev.append({'criterion_key': s.get('criterion','improvement'), 'quote': s['evidence_quote'], 'timestamp_seconds': s.get('timestamp_seconds')})
    for field, key in [('key_points','key_point'),('decisions','decision'),('action_items','action_item'),
                       ('next_steps','next_step'),('open_questions','open_question'),('risks','risk'),
                       ('suggestions','suggestion'),('projects','project'),('banned_phrases','banned_phrase')]:
        for item in (sc.get(field) or []):
            ev.append({'criterion_key': key, 'quote': str(item), 'timestamp_seconds': None})
    for p in (sc.get('coaching_priorities') or []):
        pri = p.get('priority', 0)
        if 1 <= pri <= 3:
            ev.append({'criterion_key': f'coaching_priority_{pri}', 'quote': json.dumps(p), 'timestamp_seconds': None})
    if sc.get('meeting_effectiveness'):
        ev.append({'criterion_key': 'meeting_effectiveness', 'quote': json.dumps(sc['meeting_effectiveness']), 'timestamp_seconds': None})
    return ev

# ── Score a single call ────────────────────────────────────────────────────────
def score_call(call: dict, rubric_id: str, idx: int, total: int) -> str:
    call_id   = call['id']
    transcript = (call.get('transcript_raw') or '').strip()
    if len(transcript) < 50:
        _counter['skip'] += 1
        return 'skip'
    try:
        raw = call_anthropic(transcript)
        sc  = parse_score(raw)
        overall = round(float(sc.get('overall_score', 0)) * 10) / 10
        scorecard = sb_post('scorecards', {
            'call_id':       call_id,
            'rubric_id':     rubric_id,
            'overall_score': overall,
            'summary':       sc.get('summary', ''),
            'strengths':     sc.get('strengths', []),
            'improvements':  sc.get('improvements', []),
            'llm_model':     'claude-haiku-4-5-20251001',
        })
        sc_id = scorecard.get('id') if isinstance(scorecard, dict) else None
        if sc_id:
            ev_rows = [{'scorecard_id': sc_id, **e} for e in build_evidence(sc) if e.get('quote')]
            if ev_rows:
                try:
                    sb_post('scorecard_evidence', ev_rows)
                except Exception:
                    pass
        sb_patch('calls', f'id=eq.{call_id}', {'status': 'scored'})
        _counter['ok'] += 1
        if _counter['ok'] % 5 == 0 or idx <= 5:
            log(f"  [{idx}/{total}] ok={_counter['ok']} fail={_counter['fail']} score={overall} call={call_id[:8]}")
        return 'ok'
    except Exception as e:
        _counter['fail'] += 1
        sb_patch('calls', f'id=eq.{call_id}', {'status': 'failed'})
        log(f"  [{idx}/{total}] ERROR {call_id[:8]}: {str(e)[:120]}")
        return 'fail'

# ── Main ───────────────────────────────────────────────────────────────────────
log(f"=== Direct Scorer started ===")
log("Fetching active rubric...")
rubrics   = sb_get('rubrics?is_active=eq.true&select=id&limit=1')
rubric_id = rubrics[0]['id'] if rubrics else None
log(f"Rubric: {rubric_id}")

log("\nFetching calls to score...")
all_calls = []
for status in ('processing', 'pending'):
    page = 0
    while len(all_calls) < MAX_TOTAL:
        offset = page * 500
        batch  = sb_get(f'calls?status=eq.{status}&select=id,transcript_raw&limit=500&offset={offset}')
        valid  = [c for c in batch if c.get('transcript_raw') and len(c['transcript_raw'].strip()) >= 50]
        all_calls.extend(valid)
        log(f"  {status} p{page+1}: {len(batch)} fetched, {len(valid)} with transcript (total {len(all_calls)})")
        if len(batch) < 500:
            break
        page += 1

total = min(len(all_calls), MAX_TOTAL)
log(f"\nScoring {total} calls with {MAX_WORKERS} parallel workers...")
log(f"Estimated time: ~{int(total * 5 / MAX_WORKERS / 60)} min\n")

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
    futures = {pool.submit(score_call, c, rubric_id, i+1, total): c['id'] for i, c in enumerate(all_calls[:total])}
    for f in as_completed(futures):
        pass  # logging happens inside score_call

log(f"\n=== DONE === ok={_counter['ok']} fail={_counter['fail']} skip={_counter['skip']}")

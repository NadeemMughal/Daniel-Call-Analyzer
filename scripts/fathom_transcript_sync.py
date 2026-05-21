"""
Fathom Transcript Sync
1. Paginate all Fathom meetings via /external/v1/meetings
2. Match each meeting's share_url → Supabase calls.audio_url
3. For matched calls, fetch Fathom transcript via /recordings/{id}/transcript
4. Update transcript_raw + transcript_segments in Supabase

Run from project root:  python scripts/fathom_transcript_sync.py
Add --dry-run to preview matches without writing to DB.
"""
import json, sys, time, urllib.request, urllib.error, urllib.parse
from pathlib import Path

DRY_RUN = '--dry-run' in sys.argv

# ── Load .env ──────────────────────────────────────────────────────────────────
env = {}
env_path = Path(__file__).parent.parent / '.env'
for line in env_path.read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")

FATHOM_KEY   = env['FATHOM_API_KEY']
SUPABASE_URL = env['SUPABASE_URL']
SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

FATHOM_BASE  = 'https://api.fathom.ai/external/v1'
HEADERS_SB   = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def fathom_get(path: str, retries: int = 5) -> dict:
    url = f'{FATHOM_BASE}{path}'
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={'X-API-Key': FATHOM_KEY})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                wait = attempt * 5
                print(f"    [retry {attempt}/{retries}] HTTP {e.code}, waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
        except Exception:
            if attempt < retries:
                time.sleep(attempt * 2)
            else:
                raise

def sb_get(path: str, range_hdr: str = '0-999') -> list:
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    req = urllib.request.Request(
        url,
        headers={**HEADERS_SB, 'Range': range_hdr}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_patch(table: str, query: str, body: dict) -> int:
    url = f'{SUPABASE_URL}/rest/v1/{table}?{query}'
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={**HEADERS_SB, 'Prefer': 'return=minimal'},
        method='PATCH'
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

# ── Step 1: Paginate ALL Fathom meetings ───────────────────────────────────────
print("=" * 60)
print("Step 1: Fetching all Fathom meetings...")
print("=" * 60)

fathom_map: dict[str, dict] = {}  # share_url → {recording_id, title}
cursor = None
page   = 0

while True:
    qs = 'limit=100'
    if cursor:
        qs += '&cursor=' + urllib.parse.quote(str(cursor))
    data  = fathom_get(f'/meetings?{qs}')
    items = data.get('items', [])

    for m in items:
        share_url = (m.get('share_url') or '').strip()
        rid       = m.get('recording_id')
        if share_url and rid:
            fathom_map[share_url] = {
                'recording_id': rid,
                'title':        m.get('title') or m.get('meeting_title') or '',
                'started':      m.get('recording_start_time') or '',
            }

    page  += 1
    print(f"  Page {page}: {len(items)} meetings  |  cumulative map: {len(fathom_map)}")

    cursor = data.get('next_cursor')
    if not cursor or not items:
        break
    time.sleep(0.25)

print(f"\nFathom total unique share_urls: {len(fathom_map)}\n")

# ── Step 2: Fetch all Supabase calls with audio_url ────────────────────────────
print("=" * 60)
print("Step 2: Fetching Supabase calls with audio_url...")
print("=" * 60)

all_sb_calls: list[dict] = []
pg = 0
while True:
    start = pg * 1000
    end   = start + 999
    batch = sb_get(
        'calls?select=id,audio_url,transcript_raw&audio_url=not.is.null',
        range_hdr=f'{start}-{end}'
    )
    if not batch:
        break
    all_sb_calls.extend(batch)
    print(f"  Page {pg+1}: {len(batch)} calls  |  total: {len(all_sb_calls)}")
    if len(batch) < 1000:
        break
    pg += 1

# Build audio_url → call lookup
sb_by_url: dict[str, dict] = {c['audio_url']: c for c in all_sb_calls if c.get('audio_url')}
print(f"\nSupabase calls with audio_url: {len(sb_by_url)}\n")

# ── Step 3: Match ──────────────────────────────────────────────────────────────
print("=" * 60)
print("Step 3: Matching Fathom share_url -> Supabase audio_url...")
print("=" * 60)

matches: list[dict] = []
no_match_in_sb: list[dict] = []

for share_url, fathom_meta in fathom_map.items():
    sb_call = sb_by_url.get(share_url)
    if sb_call:
        matches.append({
            'call_id':       sb_call['id'],
            'recording_id':  fathom_meta['recording_id'],
            'title':         fathom_meta['title'],
            'started':       fathom_meta['started'],
            'has_transcript': bool(sb_call.get('transcript_raw')),
        })
    else:
        no_match_in_sb.append({**fathom_meta, 'share_url': share_url})

print(f"  Matched:          {len(matches)} calls")
print(f"  Not in Supabase:  {len(no_match_in_sb)} Fathom meetings (never ingested)")
print(f"  Of matched: {sum(1 for m in matches if m['has_transcript'])} already have transcript_raw")
print()

if DRY_RUN:
    print("[DRY RUN] Matches:")
    for m in matches[:20]:
        print(f"  {m['call_id'][:8]}  rid={m['recording_id']}  '{m['title'][:50]}'")
    if len(matches) > 20:
        print(f"  ... and {len(matches)-20} more")
    print("\nNot in Supabase (recent / never ingested):")
    for m in no_match_in_sb[:10]:
        print(f"  rid={m['recording_id']}  {m['started'][:10]}  '{m['title'][:50]}'")
    print("\n[DRY RUN] Re-run without --dry-run to write to DB.")
    raise SystemExit

# ── Step 4: Fetch Fathom transcript + update Supabase ─────────────────────────
print("=" * 60)
print("Step 4: Fetching transcripts from Fathom and updating Supabase...")
print("=" * 60)

ok = 0; fail = 0; skip = 0

for i, m in enumerate(matches, 1):
    rid = m['recording_id']
    try:
        tdata     = fathom_get(f'/recordings/{rid}/transcript')
        utterances = tdata.get('utterances', [])

        if not utterances:
            skip += 1
            if i <= 10 or i % 50 == 0:
                print(f"  [{i}/{len(matches)}] SKIP  {m['call_id'][:8]} rid={rid} — 0 utterances")
            continue

        full_text = '\n'.join(
            f"{u.get('speaker', 'Unknown')}: {u.get('text', '')}"
            for u in utterances
        )
        segments  = [
            {
                'speaker':    u.get('speaker', 'Unknown'),
                'start_time': u.get('start_time', 0),
                'end_time':   u.get('end_time', 0),
                'text':       u.get('text', ''),
            }
            for u in utterances
        ]

        status = sb_patch(
            'calls',
            f'id=eq.{m["call_id"]}',
            {
                'transcript_raw':      full_text,
                'transcript_segments': segments,
            }
        )

        if status in (200, 204):
            ok += 1
        else:
            fail += 1
            print(f"  [{i}/{len(matches)}] PATCH {status}  {m['call_id'][:8]}")

    except Exception as e:
        fail += 1
        print(f"  [{i}/{len(matches)}] ERROR rid={rid}: {e}")

    if i % 25 == 0 or i == len(matches):
        print(f"  [{i}/{len(matches)}] updated={ok}  failed={fail}  skipped={skip}")

    time.sleep(0.2)

print()
print("=" * 60)
print(f"Done!  updated={ok}  failed={fail}  skipped={skip} (0 utterances)")
print()
if no_match_in_sb:
    print(f"NOTE: {len(no_match_in_sb)} Fathom meetings have no matching Supabase call.")
    print("These are likely new calls not yet ingested via n8n webhook.")
    print("To ingest them, run: node scripts/ingest-from-fathom.mjs")

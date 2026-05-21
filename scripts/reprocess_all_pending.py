"""
Re-trigger 02-classify for ALL pending calls (status='pending').
Run after resetting stuck 'processing' calls back to 'pending'.
Run from project root: python scripts/reprocess_all_pending.py
"""
import json, os, time, urllib.request, urllib.error
from pathlib import Path

# ── Load .env ──────────────────────────────────────────────────────────────────
env = {}
env_path = Path(__file__).parent.parent / '.env'
for line in env_path.read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL     = env['SUPABASE_URL']
SUPABASE_KEY     = env['SUPABASE_SERVICE_ROLE_KEY']
N8N_BASE_URL     = env.get('N8N_BASE_URL', 'https://n8nserver.metaviz.pro')
CLASSIFY_WEBHOOK = f"{N8N_BASE_URL}/webhook/classify-call"
BATCH_PRINT      = 50
DELAY            = 0.2   # seconds between calls — polite rate

HEADERS_SB = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Range': '0-4999',
}

def sb_get(path: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers=HEADERS_SB)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def post_json(url: str, body: dict) -> int:
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0

# ── Fetch all pending calls ────────────────────────────────────────────────────
print("Fetching all pending calls...")
page = 0
all_calls = []
while True:
    start = page * 1000
    end   = start + 999
    headers = {**HEADERS_SB, 'Range': f'{start}-{end}'}
    url = f"{SUPABASE_URL}/rest/v1/calls?status=eq.pending&select=id,call_type"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch:
        break
    all_calls.extend(batch)
    print(f"  Page {page+1}: got {len(batch)} calls (total so far: {len(all_calls)})")
    if len(batch) < 1000:
        break
    page += 1

print(f"\nTotal pending calls to process: {len(all_calls)}")
if not all_calls:
    print("Nothing to do.")
    raise SystemExit

type_counts = {}
for c in all_calls:
    t = c.get('call_type') or 'null'
    type_counts[t] = type_counts.get(t, 0) + 1
print("Call type breakdown:", type_counts)
print()

# ── Trigger classify webhook for each ─────────────────────────────────────────
ok = 0; fail = 0; skip = 0
for i, call in enumerate(all_calls, 1):
    status = post_json(CLASSIFY_WEBHOOK, {"call_id": call['id']})
    if status in (200, 201, 202):
        ok += 1
    elif status == 0:
        fail += 1
    else:
        fail += 1

    if i % BATCH_PRINT == 0 or i == len(all_calls):
        print(f"  [{i}/{len(all_calls)}] ok={ok}  fail={fail}")

    time.sleep(DELAY)
    # Extra pause every 200 to avoid overwhelming n8n
    if i % 200 == 0:
        print("  (pausing 5s to let n8n breathe...)")
        time.sleep(5)

print(f"\nDone — triggered={ok}, failed={fail}")
print("Monitor n8n execution log. Scoring follows classify automatically.")
print("Full pipeline: classify → rule-engine → scorecard → notify")

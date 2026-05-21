"""
Re-trigger 02-classify for all calls currently typed as 'other'.
Run from project root: python scripts/reclassify_other_calls.py

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_BASE_URL from .env
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
BATCH            = 50    # calls per batch
DELAY            = 0.15  # seconds between requests

HEADERS_SB = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
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
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0

# ── 1. Fetch all calls that are 'other' type ───────────────────────────────────
print("Fetching calls with call_type='other'...")
calls = sb_get("calls?call_type=eq.other&select=id,status&limit=3000")
print(f"  Found {len(calls)} calls to re-classify")

if not calls:
    print("Nothing to do.")
    raise SystemExit

# ── 2. Trigger classify webhook for each call ──────────────────────────────────
ok = 0; fail = 0
for i, call in enumerate(calls, 1):
    status = post_json(CLASSIFY_WEBHOOK, {"call_id": call['id']})
    if status in (200, 201, 202):
        ok += 1
    else:
        fail += 1
    if i % BATCH == 0:
        print(f"  {i}/{len(calls)}: ok={ok} fail={fail}")
        time.sleep(1.0)
    else:
        time.sleep(DELAY)

print(f"\nDone: triggered={ok}, failed={fail}")
print("Monitor n8n for progress — scoring will follow classify automatically.")

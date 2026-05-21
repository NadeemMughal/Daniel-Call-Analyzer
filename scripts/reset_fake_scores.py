"""
Reset fake-scored calls (overall_score = 0.0 with no-transcript summaries)
back to 'pending' so they get re-scored by the pipeline.

Steps:
1. Find scorecards with overall_score = 0
2. Delete those scorecards (+ evidence cascades automatically)
3. Set calls back to status='pending'

Run from project root: python scripts/reset_fake_scores.py
"""
import json, urllib.request, urllib.error
from pathlib import Path

env = {}
env_path = Path(__file__).parent.parent / '.env'
for line in env_path.read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = env['SUPABASE_URL']
SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Range':         '0-4999',
}

def sb_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}', headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_req(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{path}',
        data=data,
        headers={**H, 'Prefer': 'return=minimal'},
        method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

# 1. Find zero-scored scorecards
print("Finding zero-scored scorecards...")
fake = sb_get('scorecards?select=id,call_id,overall_score&overall_score=lte.0.001')
print(f"  Found {len(fake)} scorecards with score <= 0")
if not fake:
    print("Nothing to reset.")
    raise SystemExit

call_ids = [s['call_id'] for s in fake]
scorecard_ids = [s['id'] for s in fake]
print(f"  Affected call IDs: {len(call_ids)}")

# 2. Delete scorecard_evidence for these scorecards (if no cascade)
print("\nDeleting scorecard evidence for fake scorecards...")
for sc_id in scorecard_ids:
    status = sb_req('DELETE', f'scorecard_evidence?scorecard_id=eq.{sc_id}')
    if status not in (200, 204):
        print(f"  WARN: DELETE evidence for scorecard {sc_id} returned {status}")

print(f"  Evidence deleted for {len(scorecard_ids)} scorecards")

# 3. Delete the fake scorecards
print("\nDeleting fake scorecards (score=0)...")
status = sb_req('DELETE', 'scorecards?overall_score=lte.0.001')
print(f"  DELETE scorecards returned HTTP {status}")

# 4. Reset calls to pending
print("\nResetting affected calls to status='pending'...")
reset_ok = 0
reset_fail = 0
for cid in call_ids:
    s = sb_req('PATCH', f'calls?id=eq.{cid}', {'status': 'pending'})
    if s in (200, 204):
        reset_ok += 1
    else:
        reset_fail += 1
        print(f"  WARN: PATCH call {cid[:8]} returned {s}")

print(f"  Reset {reset_ok} calls to pending, {reset_fail} failed")

print(f"""
Done!
  - Deleted {len(fake)} zero-scored scorecards
  - Reset {reset_ok} calls back to pending

Next steps:
  1. Re-import n8n workflows 02-classify.json and 04-scorecard.json
     (they now reference the 'Anthropic account 3' credential)
  2. Run: python scripts/reprocess_all_pending.py
     (this will re-trigger the full pipeline for all pending calls)
""")

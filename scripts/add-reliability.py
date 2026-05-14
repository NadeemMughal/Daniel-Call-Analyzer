import os
#!/usr/bin/env python3
"""Phase A reliability:
  A2 - import the 99-error-handler workflow into n8n, capture its ID
  A3 - add retryOnFail+maxTries to every Groq HTTP node in 00-master-pipeline.json
  A4 - add a Generate Meeting Summary (8B fallback) branch that fires when 70B fails
  Then push master pipeline (settings.errorWorkflow = <new id>) and activate both.
"""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
ERROR_WF_PATH = 'n8n/workflows/99-error-handler.json'
MASTER_WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_BASE = 'https://n8nserver.metaviz.pro/api/v1'
N8N_KEY = os.environ.get("N8N_API_KEY", "")


def call_n8n(method, path, body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(
        f'{N8N_BASE}{path}',
        data=data, method=method,
        headers={'Content-Type': 'application/json; charset=utf-8', 'X-N8N-API-KEY': N8N_KEY}
    )
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode('utf-8') or '{}'
            return json.loads(text) if text.strip().startswith(('{', '[')) else {}
    except urllib.error.HTTPError as e:
        return {'__err': e.code, '__body': e.read().decode()[:300]}


# === A2: import error workflow ===
with open(ERROR_WF_PATH, 'r', encoding='utf-8') as f:
    err_wf = json.load(f)
err_wf.pop('active', None); err_wf.pop('versionId', None); err_wf.pop('id', None)

# Look up if a workflow with this name already exists
existing = call_n8n('GET', '/workflows?limit=250')
err_id = None
for w in (existing.get('data') or []):
    if w.get('name') == err_wf['name']:
        err_id = w['id']
        break

if err_id:
    # Update in place
    resp = call_n8n('PUT', f'/workflows/{err_id}', err_wf)
    print(f"Updated existing error workflow id={err_id}")
else:
    resp = call_n8n('POST', '/workflows', err_wf)
    err_id = resp.get('id')
    print(f"Created error workflow id={err_id}")

# Activate it
ar = call_n8n('POST', f'/workflows/{err_id}/activate')
print(f"Error workflow active={ar.get('active')}")

# === A3+A4: load master and modify ===
with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

# A3: retryOnFail on each Groq node
GROQ_NODES = {'Classify with Groq', 'Score with Groq', 'Generate Meeting Summary'}
for node in wf['nodes']:
    if node['name'] in GROQ_NODES:
        node['retryOnFail'] = True
        node['maxTries'] = 3
        node['waitBetweenTries'] = 2000
        print(f"Set retry on {node['name']}")

# A4: Add Generate Meeting Summary (8B fallback)
# Build by deep-copying the existing 70B node, then swap the model.
src = None
for n in wf['nodes']:
    if n['name'] == 'Generate Meeting Summary':
        src = n
        break
if not src:
    print('ERROR: Generate Meeting Summary not found')
    raise SystemExit(1)

fallback = json.loads(json.dumps(src))  # deep copy
fallback['id'] = 'master-0022b'
fallback['name'] = 'Generate Meeting Summary (8B)'
fallback['position'] = [src['position'][0], src['position'][1] + 180]
# Replace the model name in the jsonBody
body = fallback['parameters'].get('jsonBody', '')
fallback['parameters']['jsonBody'] = body.replace(
    "'llama-3.3-70b-versatile'", "'llama-3.1-8b-instant'"
)
# Don't retry the fallback itself - it's the last resort
fallback['retryOnFail'] = False
fallback['continueOnFail'] = True
fallback['alwaysOutputData'] = True

# Also flag the primary to continueOnFail so we can branch on error
for n in wf['nodes']:
    if n['name'] == 'Generate Meeting Summary':
        n['continueOnFail'] = True
        n['alwaysOutputData'] = True

# Add an IF node that detects whether the 70B output is valid
has_output_if = {
    "id": "master-0022c",
    "name": "70B Succeeded?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2,
    "position": [src['position'][0] + 200, src['position'][1]],
    "parameters": {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{
                "id": "cond-success",
                "leftValue": "={{ $json.choices && $json.choices[0] && $json.choices[0].message ? true : false }}",
                "rightValue": True,
                "operator": {"type": "boolean", "operation": "equals"}
            }],
            "combinator": "and"
        }
    }
}

# Remove any prior fallback nodes
wf['nodes'] = [n for n in wf['nodes'] if n['id'] not in ('master-0022b', 'master-0022c')]
wf['nodes'].extend([has_output_if, fallback])

# Rewire connections:
#   Generate Meeting Summary -> 70B Succeeded?
#     TRUE  -> Parse Meeting Summary
#     FALSE -> Generate Meeting Summary (8B) -> Parse Meeting Summary
wf['connections']['Generate Meeting Summary']['main'] = [[{"node": "70B Succeeded?", "type": "main", "index": 0}]]
wf['connections']['70B Succeeded?'] = {
    "main": [
        [{"node": "Parse Meeting Summary", "type": "main", "index": 0}],
        [{"node": "Generate Meeting Summary (8B)", "type": "main", "index": 0}]
    ]
}
wf['connections']['Generate Meeting Summary (8B)'] = {
    "main": [[{"node": "Parse Meeting Summary", "type": "main", "index": 0}]]
}

# Wire error workflow into master settings
wf.setdefault('settings', {})
wf['settings']['errorWorkflow'] = err_id

with open(WORKFLOW_PATH, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print(f"Saved master with {len(wf['nodes'])} nodes; errorWorkflow={err_id}")

# Push
push = {k: v for k, v in wf.items() if k not in ('active', 'versionId', 'id')}
try: call_n8n('POST', f'/workflows/{MASTER_WF_ID}/deactivate')
except Exception: pass
resp = call_n8n('PUT', f'/workflows/{MASTER_WF_ID}', push)
print(f"Master nodes after push: {len(resp.get('nodes', []))}")
ar = call_n8n('POST', f'/workflows/{MASTER_WF_ID}/activate')
print(f"Master active: {ar.get('active')}")

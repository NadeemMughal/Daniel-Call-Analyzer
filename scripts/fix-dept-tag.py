import os
#!/usr/bin/env python3
"""Replace broken Tag Department HTTP-with-IIFE node with a Compute (Code) + Patch (HTTP) pair on both branches."""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = os.environ.get("N8N_API_KEY", "")
SVC = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

DEPT_MAP_JS = """const map = {
  executive: '00000000-0000-0000-0000-000000000010',
  exec: '00000000-0000-0000-0000-000000000010',
  sales: '00000000-0000-0000-0000-000000000001',
  seo: '00000000-0000-0000-0000-000000000011',
  ops: '00000000-0000-0000-0000-000000000012',
  operations: '00000000-0000-0000-0000-000000000012',
  ai: '00000000-0000-0000-0000-000000000012',
  finance: '00000000-0000-0000-0000-000000000013',
  content: '00000000-0000-0000-0000-000000000014',
  marketing: '00000000-0000-0000-0000-000000000014'
};
"""

COMPUTE_TEAM_JS = DEPT_MAP_JS + """const summaryObj = ($('Parse Meeting Summary').first().json.summary) || {};
const slug = String(summaryObj.host_department || 'ops').toLowerCase().trim();
const departmentId = map[slug] || map.ops;
const callId = $('Parse Classification').first().json.call_id;
return [{ json: { call_id: callId, department_id: departmentId, department_slug: slug } }];"""

COMPUTE_SALES_JS = DEPT_MAP_JS + """const sc = $('Parse Scorecard').first().json;
const slug = String(sc.host_department || 'sales').toLowerCase().trim();
const departmentId = map[slug] || map.sales;
return [{ json: Object.assign({}, sc, { department_id: departmentId, department_slug: slug }) }];"""

def make_patch_node(node_id, name, position):
    return {
        "id": node_id, "name": name,
        "type": "n8n-nodes-base.httpRequest", "typeVersion": 4,
        "position": position,
        "parameters": {
            "method": "PATCH",
            "url": "https://fybvnwidpnxnouaukrnb.supabase.co/rest/v1/calls",
            "sendQuery": True,
            "queryParameters": {"parameters": [{"name": "id", "value": "=eq.{{ $json.call_id }}"}]},
            "sendHeaders": True,
            "headerParameters": {"parameters": [
                {"name": "apikey", "value": SVC},
                {"name": "Authorization", "value": f"Bearer {SVC}"},
                {"name": "Content-Type", "value": "application/json"},
                {"name": "Prefer", "value": "return=minimal"}
            ]},
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ department_id: $json.department_id }) }}",
            "options": {}
        }
    }

COMPUTE_TEAM = {
    "id": "master-0037", "name": "Compute Department",
    "type": "n8n-nodes-base.code", "typeVersion": 2,
    "position": [3290, 60],
    "parameters": {"mode": "runOnceForAllItems", "jsCode": COMPUTE_TEAM_JS}
}
PATCH_TEAM = make_patch_node("master-0037b", "Patch Department", [3460, 60])

COMPUTE_SALES = {
    "id": "master-0038", "name": "Compute Department (Sales)",
    "type": "n8n-nodes-base.code", "typeVersion": 2,
    "position": [3290, 400],
    "parameters": {"mode": "runOnceForAllItems", "jsCode": COMPUTE_SALES_JS}
}
PATCH_SALES = make_patch_node("master-0038b", "Patch Department (Sales)", [3460, 400])

# Remove any prior dept-tag nodes
ids_to_remove = {'master-0037', 'master-0038', 'master-0037b', 'master-0038b'}
wf['nodes'] = [n for n in wf['nodes'] if n['id'] not in ids_to_remove]
wf['nodes'].extend([COMPUTE_TEAM, PATCH_TEAM, COMPUTE_SALES, PATCH_SALES])

# Remove old "Tag Department" connections
for k in list(wf['connections'].keys()):
    if k in ('Tag Department', 'Tag Department (Sales)'):
        del wf['connections'][k]

# Rewire team branch: Parse Meeting Summary -> Compute Department -> Patch Department -> Store Meeting Scorecard
wf['connections']['Parse Meeting Summary']['main'] = [[{"node": "Compute Department", "type": "main", "index": 0}]]
wf['connections']['Compute Department'] = {"main": [[{"node": "Patch Department", "type": "main", "index": 0}]]}
wf['connections']['Patch Department'] = {"main": [[{"node": "Store Meeting Scorecard", "type": "main", "index": 0}]]}

# Rewire sales branch: Parse Scorecard -> Compute Department (Sales) -> Patch Department (Sales) -> Insert Scorecard
wf['connections']['Parse Scorecard']['main'] = [[{"node": "Compute Department (Sales)", "type": "main", "index": 0}]]
wf['connections']['Compute Department (Sales)'] = {"main": [[{"node": "Patch Department (Sales)", "type": "main", "index": 0}]]}
wf['connections']['Patch Department (Sales)'] = {"main": [[{"node": "Insert Scorecard", "type": "main", "index": 0}]]}

with open(WORKFLOW_PATH, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print(f'Nodes total: {len(wf["nodes"])}')

for k in ['active', 'versionId', 'id']: wf.pop(k, None)
try:
    urllib.request.urlopen(urllib.request.Request(
        f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}/deactivate',
        data=b'{}', method='POST',
        headers={'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_KEY}))
except Exception: pass
payload = json.dumps(wf, ensure_ascii=False).encode('utf-8')
with urllib.request.urlopen(urllib.request.Request(
    f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}',
    data=payload, method='PUT',
    headers={'Content-Type': 'application/json; charset=utf-8', 'X-N8N-API-KEY': N8N_KEY})) as r:
    print(f'Pushed: {len(json.loads(r.read()).get("nodes",[]))} nodes')
with urllib.request.urlopen(urllib.request.Request(
    f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}/activate',
    data=b'{}', method='POST',
    headers={'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_KEY})) as r:
    print(f'Active: {json.loads(r.read())["active"]}')

# Clear stale row
try:
    urllib.request.urlopen(urllib.request.Request(
        'https://fybvnwidpnxnouaukrnb.supabase.co/rest/v1/calls?source_id=eq.660416881',
        method='DELETE',
        headers={'apikey': SVC, 'Authorization': f'Bearer {SVC}'}))
    print('Stale row cleared.')
except Exception as e:
    print('Delete:', e)

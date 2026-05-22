import json

WF_PATH = r"c:\Users\User\Desktop\Daniel-Call-Analyzer\n8n\workflows\04-scorecard.json"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c"

# ── JS for Code nodes ─────────────────────────────────────────────────────────

FETCH_HISTORY_JS = r"""const SUPABASE_URL = 'https://fybvnwidpnxnouaukrnb.supabase.co';
const SUPABASE_KEY = '""" + SUPABASE_KEY + r"""';

async function sb(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  return r.json();
}

const callId = $('Webhook').first().json.body.call_id;
const { systemPrompt, userMessage } = $('Build Score Request').first().json;
let repName = '';
let repHistorySummary = 'No previous call history available.';

try {
  const parts = await sb('call_participants?call_id=eq.' + callId + '&is_external=eq.false&select=team_member_id,team_members(id,name)&limit=1');
  if (Array.isArray(parts) && parts[0] && parts[0].team_members) {
    const m = parts[0].team_members;
    repName = m.name || '';
    const hist = await sb('call_participants?team_member_id=eq.' + m.id + '&is_external=eq.false&select=calls(recorded_at,scorecards(overall_score,summary))&order=created_at.desc&limit=5');
    const lines = (Array.isArray(hist) ? hist : [])
      .map(p => p.calls)
      .filter(c => c && c.scorecards && c.scorecards[0] && c.scorecards[0].overall_score != null)
      .map(c => '- ' + (c.recorded_at || '').substring(0, 10) + ': ' + c.scorecards[0].overall_score + '/10 — ' + (c.scorecards[0].summary || '').split('.')[0]);
    if (lines.length > 0) repHistorySummary = repName + "'s last " + lines.length + ' scored calls:\n' + lines.join('\n');
  }
} catch(e) {}

return [{ json: { systemPrompt, userMessage, repHistorySummary } }];"""

BUILD_ENRICHED_JS = r"""const { systemPrompt, userMessage, repHistorySummary } = $input.first().json;

const turn2UserMsg = userMessage +
  '\n\n--- REP HISTORY FOR CONTEXT ---\n' + repHistorySummary +
  '\n\nScore this call. Add to your JSON: "rep_trajectory" (improving/declining/stable vs history) and "comparison_note" (one sentence vs rep\'s baseline).';

return [{ json: { systemPrompt, turn2UserMsg } }];"""

MERGE_FINAL_JS = r"""const t2 = ($('Turn 2: Score Call').first().json.content || [{}])[0].text || '';
const t3 = ($('Turn 3: Synthesis').first().json.content || [{}])[0].text || '';

let sc = {};
let cleanT2 = t2.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
try { sc = JSON.parse(cleanT2); } catch(e) {}

try {
  const c3 = JSON.parse(t3.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim());
  if (c3.manager_summary) sc.manager_summary = c3.manager_summary;
  if (c3.positive_reinforcement) sc.positive_reinforcement = c3.positive_reinforcement;
} catch(e) {}

return [{ json: { text: JSON.stringify(sc) } }];"""

# ── Credential stub (user will reconnect on import) ───────────────────────────
ANTHROPIC_CRED = {"httpHeaderAuth": {"id": "anthropic-header-auth", "name": "Anthropic Header Auth"}}

def make_anthropic_http_node(node_id, name, position, body_expression):
    return {
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4,
        "position": position,
        "credentials": ANTHROPIC_CRED,
        "parameters": {
            "method": "POST",
            "url": "https://api.anthropic.com/v1/messages",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "anthropic-version", "value": "2023-06-01"},
                    {"name": "content-type", "value": "application/json"},
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": body_expression,
            "options": {},
        },
    }

def make_code_node(node_id, name, position, js_code):
    return {
        "id": node_id,
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": position,
        "parameters": {"mode": "runOnceForAllItems", "jsCode": js_code},
    }

# ── New nodes ─────────────────────────────────────────────────────────────────
FETCH_HISTORY = make_code_node(
    "aa001-fetch-rep-history", "Fetch Rep History", [1320, 180], FETCH_HISTORY_JS
)
BUILD_ENRICHED = make_code_node(
    "aa002-build-enriched", "Build Enriched Request", [1540, 180], BUILD_ENRICHED_JS
)
TURN2_BODY = "={{ { model: 'claude-sonnet-4-6', max_tokens: 4000, system: $json.systemPrompt, messages: [{ role: 'user', content: $json.turn2UserMsg }] } }}"
TURN2 = make_anthropic_http_node(
    "aa003-turn2-score", "Turn 2: Score Call", [1760, 180], TURN2_BODY
)
TURN3_BODY = (
    "={{ { model: 'claude-sonnet-4-6', max_tokens: 500, "
    "system: 'You are a sales coaching assistant. Return only raw JSON.', "
    "messages: ["
    "  { role: 'user', content: $('Build Enriched Request').first().json.turn2UserMsg },"
    "  { role: 'assistant', content: ($('Turn 2: Score Call').first().json.content || [{}])[0].text || '' },"
    "  { role: 'user', content: 'Synthesis as raw JSON only: {\"manager_summary\":\"2-sentence manager summary\",\"positive_reinforcement\":\"one specific strength\"}' }"
    "] } }}"
)
TURN3 = make_anthropic_http_node(
    "aa004-turn3-synthesis", "Turn 3: Synthesis", [1980, 180], TURN3_BODY
)
MERGE_FINAL = make_code_node(
    "aa005-merge-final", "Merge Agent Output", [2200, 180], MERGE_FINAL_JS
)

# ── Load and update workflow ──────────────────────────────────────────────────
with open(WF_PATH, "r", encoding="utf-8") as f:
    wf = json.load(f)

# Remove "Multi-Step Score Agent" (or old "Score with Anthropic") node
wf["nodes"] = [
    n for n in wf["nodes"]
    if n["name"] not in ("Score with Anthropic", "Multi-Step Score Agent")
]
print("Removed old agent node")

# Also fix Parse Scorecard — strip any extra evidence blocks we previously added
# (restore it to clean state then add once)
EXTRA_BLOCK = """// Store new agent fields as evidence
if (sc.manager_summary) allEvidence.push({ criterion_key: 'manager_summary', quote: String(sc.manager_summary), timestamp_seconds: null });
if (sc.positive_reinforcement) allEvidence.push({ criterion_key: 'positive_reinforcement', quote: String(sc.positive_reinforcement), timestamp_seconds: null });
if (sc.rep_trajectory) allEvidence.push({ criterion_key: 'rep_trajectory', quote: String(sc.rep_trajectory), timestamp_seconds: null });
if (sc.comparison_note) allEvidence.push({ criterion_key: 'comparison_note', quote: String(sc.comparison_note), timestamp_seconds: null });"""

for i, node in enumerate(wf["nodes"]):
    if node["name"] == "Parse Scorecard":
        js = node["parameters"]["jsCode"]
        # Remove all previous insertions
        while EXTRA_BLOCK in js:
            js = js.replace(EXTRA_BLOCK, "")
        # Clean up extra blank lines
        while "\n\n\n" in js:
            js = js.replace("\n\n\n", "\n\n")
        # Insert once before the final return
        js = js.replace("return [{ json: {", EXTRA_BLOCK + "\n\nreturn [{ json: {", 1)
        wf["nodes"][i]["parameters"]["jsCode"] = js
        print(f"Parse Scorecard: manager_summary count = {js.count('manager_summary')}")
        break

    if node["name"] == "Insert Scorecard":
        body = node["parameters"].get("jsonBody", "")
        if "coaching_priorities" not in body and "llm_model: $json.llm_model }" in body:
            wf["nodes"][i]["parameters"]["jsonBody"] = body.replace(
                "llm_model: $json.llm_model }",
                "llm_model: $json.llm_model, coaching_priorities: $json.coaching_priorities }"
            )
            print("Insert Scorecard: added coaching_priorities field")

# Add new nodes
for n in [FETCH_HISTORY, BUILD_ENRICHED, TURN2, TURN3, MERGE_FINAL]:
    wf["nodes"].append(n)
print(f"Added 5 new nodes. Total nodes: {len(wf['nodes'])}")

# ── Rebuild connections ───────────────────────────────────────────────────────
conn = wf["connections"]

# Remove old connections from/to the removed node
for name in ("Score with Anthropic", "Multi-Step Score Agent"):
    conn.pop(name, None)

# Remove connection Build Score Request → (old node)
if "Build Score Request" in conn:
    # Clear and rebuild
    conn["Build Score Request"] = {"main": [[{"node": "Fetch Rep History", "type": "main", "index": 0}]]}

# Parse Scorecard was previously connected FROM Score with Anthropic — now from Merge Agent Output
# Remove any stale reference; connection will come from new node below

# Add new chain connections
conn["Fetch Rep History"] = {"main": [[{"node": "Build Enriched Request", "type": "main", "index": 0}]]}
conn["Build Enriched Request"] = {"main": [[{"node": "Turn 2: Score Call", "type": "main", "index": 0}]]}
conn["Turn 2: Score Call"] = {"main": [[{"node": "Turn 3: Synthesis", "type": "main", "index": 0}]]}
conn["Turn 3: Synthesis"] = {"main": [[{"node": "Merge Agent Output", "type": "main", "index": 0}]]}
conn["Merge Agent Output"] = {"main": [[{"node": "Parse Scorecard", "type": "main", "index": 0}]]}

wf["connections"] = conn
print("Updated connections")

# ── Write ─────────────────────────────────────────────────────────────────────
with open(WF_PATH, "w", encoding="utf-8") as f:
    json.dump(wf, f, ensure_ascii=False, indent=4)

# Verify
with open(WF_PATH, "r", encoding="utf-8") as f:
    v = json.load(f)
names = [n["name"] for n in v["nodes"]]
print("Nodes:", names)
chain = ["Build Score Request", "Fetch Rep History", "Build Enriched Request",
         "Turn 2: Score Call", "Turn 3: Synthesis", "Merge Agent Output", "Parse Scorecard"]
for n in chain:
    assert n in names, f"MISSING: {n}"
print("All chain nodes present. Done.")

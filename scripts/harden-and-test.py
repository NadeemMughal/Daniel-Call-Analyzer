#!/usr/bin/env python3
"""Add HTTP timeout to Groq nodes (so 70B doesn't 30s-timeout), force-push, then fire test."""
import json
import urllib.request
import time

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YTE2ODM3Ni0yMDlmLTRkNGMtODgyYi1kZGI4NzlkZDRjNjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMTA0YzEwZTUtNGQ1NC00Zjg5LThhY2YtZjhhZTA0OTYwMDhjIiwiaWF0IjoxNzc4MjQyMTAyLCJleHAiOjE3ODA3OTA0MDB9.aMdMCODnGUjCX2Lk8v5F1ufxTYfdlPz2BJY1gZt6MmI"
SVC = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c"

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

GROQ_NODES = {'Classify with Groq', 'Score with Groq', 'Generate Meeting Summary'}
for node in wf['nodes']:
    if node['name'] in GROQ_NODES:
        node['parameters'].setdefault('options', {})
        node['parameters']['options']['timeout'] = 120000  # 120 seconds
        print(f'  Set 120s timeout on {node["name"]}')

# Harden Parse Scorecard against null/missing input
HARDENED_PARSE_SCORECARD = """// Hardened: tolerates missing input, fence-stripped output, prose around JSON, and Groq timeouts.
const inputs = $input.all();
const firstJson = (inputs && inputs[0] && inputs[0].json) || {};
const choices = firstJson.choices;
let responseText = String((choices && choices[0] && choices[0].message && choices[0].message.content) || '');

// Strip markdown fences
const fence = String.fromCharCode(96, 96, 96);
if (responseText.indexOf(fence) === 0) {
  responseText = responseText.substring(3);
  if (responseText.indexOf('json') === 0) responseText = responseText.substring(4);
  responseText = responseText.trim();
  if (responseText.endsWith(fence)) responseText = responseText.substring(0, responseText.length - 3);
}
// Strip prose before first { and after last }
const fb = responseText.indexOf('{');
if (fb > 0) responseText = responseText.substring(fb);
const lb = responseText.lastIndexOf('}');
if (lb > -1 && lb < responseText.length - 1) responseText = responseText.substring(0, lb + 1);
responseText = responseText.trim();

const callId = $('Parse Classification').first().json.call_id;
const rubric = $('Get Active Rubric').first().json;

let a;
if (!responseText) {
  a = { overall_score: null, summary: 'Score model returned no content (likely timeout).', executive_summary: '', strengths: [], improvements: [], key_points: [], action_items: [], decisions_made: [], open_questions: [], next_steps: [], risks: [], suggestions: [] };
} else {
  try { a = JSON.parse(responseText); }
  catch (e) {
    a = { overall_score: null, summary: 'Score model JSON parse failed.', executive_summary: '', strengths: [], improvements: [], key_points: [], action_items: [], decisions_made: [], open_questions: [], next_steps: [], risks: [], suggestions: [], _raw: responseText.substring(0, 200) };
  }
}

if (typeof a.overall_score !== 'number' && a.overall_score !== null) a.overall_score = null;
const arrFields = ['strengths', 'improvements', 'key_points', 'action_items', 'decisions_made', 'open_questions', 'next_steps', 'risks', 'suggestions'];
for (const f of arrFields) if (!Array.isArray(a[f])) a[f] = [];
if (!a.summary) a.summary = '';
if (!a.executive_summary) a.executive_summary = '';

const allEvidence = [];
for (const s of a.strengths) if (s && s.evidence_quote) allEvidence.push({ criterion_key: 'strength_' + (s.criterion || 'item'), quote: String(s.evidence_quote), timestamp_seconds: s.timestamp_seconds || null });
for (const s of a.improvements) if (s && s.evidence_quote) allEvidence.push({ criterion_key: 'improvement_' + (s.criterion || 'item'), quote: String(s.evidence_quote), timestamp_seconds: s.timestamp_seconds || null });
for (const p of a.key_points) if (p) allEvidence.push({ criterion_key: 'key_point', quote: String(p), timestamp_seconds: null });
for (const ai of a.action_items) {
  if (ai && ai.task) {
    const owner = ai.owner ? ' - Owner: ' + ai.owner : '';
    const due = ai.due ? ' - Due: ' + ai.due : '';
    const priority = ai.priority ? ' [' + String(ai.priority).toUpperCase() + ']' : '';
    allEvidence.push({ criterion_key: 'action_item', quote: String(ai.task) + owner + due + priority, timestamp_seconds: null });
  }
}
for (const d of a.decisions_made) if (d && d.decision) {
  const by = d.decided_by ? ' (by ' + d.decided_by + ')' : '';
  const ctx = d.context ? ' - ' + d.context : '';
  allEvidence.push({ criterion_key: 'decision', quote: String(d.decision) + by + ctx, timestamp_seconds: null });
}
for (const q of a.open_questions) if (q) allEvidence.push({ criterion_key: 'open_question', quote: String(q), timestamp_seconds: null });
for (const n of a.next_steps) if (n) allEvidence.push({ criterion_key: 'next_step', quote: String(n), timestamp_seconds: null });
for (const r of a.risks) if (r) allEvidence.push({ criterion_key: 'risk', quote: String(r), timestamp_seconds: null });
for (const s of a.suggestions) if (s) allEvidence.push({ criterion_key: 'suggestion', quote: String(s), timestamp_seconds: null });

return [{ json: {
  call_id: callId,
  rubric_id: rubric.id,
  overall_score: typeof a.overall_score === 'number' ? Math.round(a.overall_score * 10) / 10 : null,
  summary: a.summary || a.executive_summary || '',
  executive_summary: a.executive_summary || '',
  strengths: a.strengths,
  improvements: a.improvements,
  key_points: a.key_points,
  action_items: a.action_items,
  decisions_made: a.decisions_made,
  open_questions: a.open_questions,
  next_steps: a.next_steps,
  risks: a.risks,
  suggestions: a.suggestions,
  llm_model: 'llama-3.3-70b-versatile',
  all_evidence: allEvidence
} }];"""

# Also harden Parse Classification — handle missing choices, fence stripping is the same
HARDENED_PARSE_CLASS = """const inputs = $input.all();
const firstJson = (inputs && inputs[0] && inputs[0].json) || {};
const choices = firstJson.choices;
let responseText = String((choices && choices[0] && choices[0].message && choices[0].message.content) || '');
const fence = String.fromCharCode(96, 96, 96);
if (responseText.indexOf(fence) === 0) {
  responseText = responseText.substring(3);
  if (responseText.indexOf('json') === 0) responseText = responseText.substring(4);
  responseText = responseText.trim();
  if (responseText.endsWith(fence)) responseText = responseText.substring(0, responseText.length - 3);
}
const fb = responseText.indexOf('{');
if (fb > 0) responseText = responseText.substring(fb);
const lb = responseText.lastIndexOf('}');
if (lb > -1 && lb < responseText.length - 1) responseText = responseText.substring(0, lb + 1);
responseText = responseText.trim();

const callId = $('Insert Call').first().json.id;
const validTypes = ['discovery', 'ads_intro', 'launch', 'follow_up', 'team', 'other'];
let c;
try { c = JSON.parse(responseText); }
catch (e) { c = { call_type: 'other', confidence: 0, reasoning: 'parse error: ' + responseText.substring(0, 200) }; }
if (!validTypes.includes(c.call_type)) c.call_type = 'other';
return [{ json: Object.assign({}, c, { call_id: callId }) }];"""

# Also harden Parse Meeting Summary
HARDENED_PARSE_MEETING = """const inputs = $input.all();
const firstJson = (inputs && inputs[0] && inputs[0].json) || {};
const choices = firstJson.choices;
let responseText = String((choices && choices[0] && choices[0].message && choices[0].message.content) || '');
const fence = String.fromCharCode(96, 96, 96);
if (responseText.indexOf(fence) === 0) {
  responseText = responseText.substring(3);
  if (responseText.indexOf('json') === 0) responseText = responseText.substring(4);
  responseText = responseText.trim();
  if (responseText.endsWith(fence)) responseText = responseText.substring(0, responseText.length - 3);
}
const fb = responseText.indexOf('{');
if (fb > 0) responseText = responseText.substring(fb);
const lb = responseText.lastIndexOf('}');
if (lb > -1 && lb < responseText.length - 1) responseText = responseText.substring(0, lb + 1);
responseText = responseText.trim();

const callId = $('Parse Classification').first().json.call_id;
let s;
if (!responseText) {
  s = { title: '', one_line_summary: 'Model returned no content', executive_summary: '', key_points: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [] };
} else {
  try { s = JSON.parse(responseText); }
  catch (e) { s = { title: '', one_line_summary: 'Model JSON parse failed', executive_summary: '', key_points: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [] }; }
}
const arrFields = ['key_points', 'decisions_made', 'action_items', 'open_questions', 'next_steps', 'risks', 'suggestions'];
for (const f of arrFields) if (!Array.isArray(s[f])) s[f] = [];

return [{ json: { call_id: callId, summary: s } }];"""

for node in wf['nodes']:
    if node['name'] == 'Parse Scorecard': node['parameters']['jsCode'] = HARDENED_PARSE_SCORECARD; print('Hardened Parse Scorecard')
    if node['name'] == 'Parse Classification': node['parameters']['jsCode'] = HARDENED_PARSE_CLASS; print('Hardened Parse Classification')
    if node['name'] == 'Parse Meeting Summary': node['parameters']['jsCode'] = HARDENED_PARSE_MEETING; print('Hardened Parse Meeting Summary')

with open(WORKFLOW_PATH, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

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
    print('Cleared stale row.')
except Exception as e:
    print('Delete err:', e)

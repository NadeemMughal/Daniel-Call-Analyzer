import os
#!/usr/bin/env python3
"""Workflow enrichment:
- Meeting Summary prompt extracts: meeting_title, attendees, projects_discussed (with status/owner/dept),
  plus MORE depth in key_points, action_items, decisions, risks, suggestions
- Score prompt extracts same enriched fields
- Adds 'Detect Department' code node that maps the analyzed call to a department UUID
- Patches Build Email List / Store Meeting Evidence to persist projects + attendees
"""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = os.environ.get("N8N_API_KEY", "")

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

# === Enriched Meeting Summary prompt ===
# Asks the LLM for: meeting_title, attendees, projects_discussed, host_department, banned_phrases_observed
NEW_MEETING = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 6000, "
    "messages: [ "
    "{ role: 'system', content: 'You are a senior meeting analyst at WeBuildTrades. Read this internal team-meeting transcript and produce a FULL business-grade analysis. Be SPECIFIC: use real names, real project names, real numbers, real dates. DO NOT invent or generalize. If a section had nothing in the transcript, return an empty array. "
    "Aim for COMPLETENESS - if 12 projects were mentioned, list all 12; if 15 action items, list all 15. "
    "Return ONLY valid JSON with these keys: "
    "meeting_title (a specific 5-10 word title naming the actual topic, NOT generic like \\\"Team Meeting\\\"), "
    "one_line_summary (1 sentence: the most important outcome), "
    "executive_summary (4-6 sentences: who attended, the topics covered, what was decided, what is at stake, what happens next), "
    "host_department (one of: executive, sales, seo, ops, finance, content, ai. Pick the team that OWNS the conversation. Daniel-led strategy goes to executive. AI/automation discussions go to ops. Marketing/content go to content.), "
    "attendees (array of objects: name (from transcript or attendee list), role (e.g. Founder, AI Lead, Sales Manager), is_internal (boolean)), "
    "key_points (array of 8-15 strings - every important topic discussed, each one specific, e.g. \\\"Closeboard live chat widget delivered to Keystone Property Claims, replacing GoHighLevel chat\\\"), "
    "projects_discussed (array of objects naming every distinct project/product/initiative mentioned, with keys: name (project name), status (delivered|in_progress|paused|proposed|blocked), owner (real person), department (one of: sales, seo, ops, finance, content, ai, executive), summary (1-2 sentences what was said about it), next_action (the next concrete step)), "
    "decisions_made (array of objects: decision, decided_by, context, impact (1 sentence)), "
    "action_items (array of objects: task (specific actionable thing), owner (real name), due (date or empty), priority (high|medium|low), context (1 sentence why this matters)), "
    "open_questions (array of strings - questions raised but NOT resolved), "
    "next_steps (array of strings - concrete things that will happen after this meeting), "
    "risks (array of objects: risk (1 sentence), severity (high|medium|low), area (which dept/project this risks)), "
    "suggestions (array of objects: suggestion, suggested_by (real name), value (1 sentence why it might be worth doing)), "
    "banned_phrases_observed (array of strings - any phrases the speaker used that are casual/unprofessional in a sales/client context, e.g. mate, basically. Empty for internal team calls.)' }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\nDuration: ' + (($('Verify HMAC').first().json.body.duration) || 0) + ' seconds\\n\\nFull transcript:\\n' + "
    "(($('Verify HMAC').first().json.body.transcript || {}).full_transcript || 'No transcript.') } "
    "] }) }}"
)

# === Enriched Score prompt (for sales calls) - same rich structure ===
NEW_SCORE = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 6000, "
    "messages: [ "
    "{ role: 'system', content: 'You are an expert sales coach for WeBuildTrades, a UK marketing agency for trade businesses. Score the rep against the rubric using EXACT transcript quotes. Use the rep real name. Do NOT invent - every claim must cite a quote. Be specific. Never write generic praise. "
    "Return ONLY valid JSON with these keys: "
    "meeting_title (5-10 word specific title), "
    "overall_score (number 0-10), summary (1 sentence), executive_summary (4-6 sentences), "
    "host_department (sales for client calls), "
    "attendees (array of objects: name, role, is_internal), "
    "key_points (array of strings - actual topics discussed), "
    "projects_discussed (array of objects: name, status, owner, department, summary, next_action), "
    "strengths (array of objects: criterion (snake_case), score (0-10), description (specific, names rep, cites what worked), evidence_quote (exact quote)), "
    "improvements (array of objects: criterion (snake_case), score (0-10), description (specific issue, why it hurt, concrete next-time action), evidence_quote (exact quote)), "
    "action_items (array of objects: task, owner, due, priority, context), "
    "decisions_made (array of objects: decision, decided_by, context, impact), "
    "open_questions (array of strings), next_steps (array of strings), "
    "risks (array of objects: risk, severity, area), "
    "suggestions (array of objects: suggestion, suggested_by, value), "
    "banned_phrases_observed (array of strings - banned words/phrases the rep used). "
    "Rubric: ' + JSON.stringify($('Get Active Rubric').first().json.content) }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\nCall type: ' + ($('Parse Classification').first().json.call_type || 'unknown') + "
    "'\\nTranscript:\\n' + ($('Get Call Data').first().json.transcript_raw || 'No transcript.') } "
    "] }) }}"
)

# === Update Parse Meeting Summary to handle the new fields ===
PARSE_MEETING = """const inputs = $input.all();
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
  s = { meeting_title: '', one_line_summary: 'Model returned no content', executive_summary: '', host_department: '', attendees: [], key_points: [], projects_discussed: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] };
} else {
  try { s = JSON.parse(responseText); }
  catch (e) { s = { meeting_title: '', one_line_summary: 'Model JSON parse failed', executive_summary: '', host_department: '', attendees: [], key_points: [], projects_discussed: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] }; }
}
const arr = ['attendees', 'key_points', 'projects_discussed', 'decisions_made', 'action_items', 'open_questions', 'next_steps', 'risks', 'suggestions', 'banned_phrases_observed'];
for (const f of arr) if (!Array.isArray(s[f])) s[f] = [];
if (!s.meeting_title) s.meeting_title = '';
if (!s.host_department) s.host_department = 'ops';

return [{ json: { call_id: callId, summary: s } }];"""

# Parse Scorecard hardened (same as before but supports new fields)
PARSE_SCORECARD = """const inputs = $input.all();
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
const rubric = $('Get Active Rubric').first().json;

let a;
if (!responseText) {
  a = { meeting_title: '', overall_score: null, summary: 'Score model returned no content.', executive_summary: '', host_department: 'sales', attendees: [], strengths: [], improvements: [], key_points: [], projects_discussed: [], action_items: [], decisions_made: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] };
} else {
  try { a = JSON.parse(responseText); }
  catch (e) { a = { meeting_title: '', overall_score: null, summary: 'Score model JSON parse failed.', executive_summary: '', host_department: 'sales', attendees: [], strengths: [], improvements: [], key_points: [], projects_discussed: [], action_items: [], decisions_made: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] }; }
}

if (typeof a.overall_score !== 'number' && a.overall_score !== null) a.overall_score = null;
const arr = ['strengths', 'improvements', 'key_points', 'projects_discussed', 'attendees', 'action_items', 'decisions_made', 'open_questions', 'next_steps', 'risks', 'suggestions', 'banned_phrases_observed'];
for (const f of arr) if (!Array.isArray(a[f])) a[f] = [];
if (!a.summary) a.summary = '';
if (!a.executive_summary) a.executive_summary = '';
if (!a.meeting_title) a.meeting_title = '';
if (!a.host_department) a.host_department = 'sales';

const allEvidence = [];
for (const s of a.strengths) if (s && s.evidence_quote) allEvidence.push({ criterion_key: 'strength_' + (s.criterion || 'item'), quote: String(s.evidence_quote), timestamp_seconds: s.timestamp_seconds || null });
for (const s of a.improvements) if (s && s.evidence_quote) allEvidence.push({ criterion_key: 'improvement_' + (s.criterion || 'item'), quote: String(s.evidence_quote), timestamp_seconds: s.timestamp_seconds || null });
for (const p of a.key_points) if (p) allEvidence.push({ criterion_key: 'key_point', quote: String(p), timestamp_seconds: null });
for (const p of a.projects_discussed) if (p && p.name) {
  const status = p.status ? ' [' + String(p.status).toUpperCase() + ']' : '';
  const owner = p.owner ? ' - Owner: ' + p.owner : '';
  const dept = p.department ? ' (' + p.department + ')' : '';
  const next = p.next_action ? ' --> ' + p.next_action : '';
  const summary = p.summary ? ' - ' + p.summary : '';
  allEvidence.push({ criterion_key: 'project', quote: p.name + status + dept + owner + summary + next, timestamp_seconds: null });
}
for (const ai of a.action_items) if (ai && ai.task) {
  const owner = ai.owner ? ' - Owner: ' + ai.owner : '';
  const due = ai.due ? ' - Due: ' + ai.due : '';
  const priority = ai.priority ? ' [' + String(ai.priority).toUpperCase() + ']' : '';
  const context = ai.context ? ' - ' + ai.context : '';
  allEvidence.push({ criterion_key: 'action_item', quote: String(ai.task) + owner + due + priority + context, timestamp_seconds: null });
}
for (const d of a.decisions_made) if (d && d.decision) {
  const by = d.decided_by ? ' (by ' + d.decided_by + ')' : '';
  const ctx = d.context ? ' - ' + d.context : '';
  const impact = d.impact ? ' [impact: ' + d.impact + ']' : '';
  allEvidence.push({ criterion_key: 'decision', quote: String(d.decision) + by + ctx + impact, timestamp_seconds: null });
}
for (const q of a.open_questions) if (q) allEvidence.push({ criterion_key: 'open_question', quote: String(q), timestamp_seconds: null });
for (const n of a.next_steps) if (n) allEvidence.push({ criterion_key: 'next_step', quote: String(n), timestamp_seconds: null });
for (const r of a.risks) {
  if (!r) continue;
  if (typeof r === 'string') allEvidence.push({ criterion_key: 'risk', quote: r, timestamp_seconds: null });
  else if (r.risk) {
    const sev = r.severity ? ' [' + String(r.severity).toUpperCase() + ']' : '';
    const area = r.area ? ' (' + r.area + ')' : '';
    allEvidence.push({ criterion_key: 'risk', quote: r.risk + sev + area, timestamp_seconds: null });
  }
}
for (const s of a.suggestions) {
  if (!s) continue;
  if (typeof s === 'string') allEvidence.push({ criterion_key: 'suggestion', quote: s, timestamp_seconds: null });
  else if (s.suggestion) {
    const by = s.suggested_by ? ' (by ' + s.suggested_by + ')' : '';
    const v = s.value ? ' - ' + s.value : '';
    allEvidence.push({ criterion_key: 'suggestion', quote: s.suggestion + by + v, timestamp_seconds: null });
  }
}
for (const att of a.attendees) if (att && att.name) {
  const role = att.role ? ' (' + att.role + ')' : '';
  const ext = att.is_internal === false ? ' [external]' : '';
  allEvidence.push({ criterion_key: 'attendee', quote: att.name + role + ext, timestamp_seconds: null });
}
for (const bp of a.banned_phrases_observed) if (bp) allEvidence.push({ criterion_key: 'banned_phrase', quote: String(bp), timestamp_seconds: null });

return [{ json: {
  call_id: callId,
  rubric_id: rubric.id,
  meeting_title: a.meeting_title,
  host_department: a.host_department,
  overall_score: typeof a.overall_score === 'number' ? Math.round(a.overall_score * 10) / 10 : null,
  summary: (a.meeting_title ? a.meeting_title + '. ' : '') + (a.summary || a.executive_summary || ''),
  executive_summary: a.executive_summary,
  strengths: a.strengths,
  improvements: a.improvements,
  llm_model: 'llama-3.3-70b-versatile',
  all_evidence: allEvidence
} }];"""

# === Store Meeting Evidence ===
STORE_MEETING_EVIDENCE = """const scorecardId = $('Store Meeting Scorecard').first().json.id;
const summary = $('Parse Meeting Summary').first().json.summary;
const rows = [];
for (const p of (summary.key_points || [])) if (p) rows.push({ scorecard_id: scorecardId, criterion_key: 'key_point', quote: String(p), timestamp_seconds: null });
for (const p of (summary.projects_discussed || [])) if (p && p.name) {
  const status = p.status ? ' [' + String(p.status).toUpperCase() + ']' : '';
  const owner = p.owner ? ' - Owner: ' + p.owner : '';
  const dept = p.department ? ' (' + p.department + ')' : '';
  const next = p.next_action ? ' --> ' + p.next_action : '';
  const sum = p.summary ? ' - ' + p.summary : '';
  rows.push({ scorecard_id: scorecardId, criterion_key: 'project', quote: p.name + status + dept + owner + sum + next, timestamp_seconds: null });
}
for (const a of (summary.action_items || [])) if (a && a.task) {
  const owner = a.owner ? ' - Owner: ' + a.owner : '';
  const due = a.due ? ' - Due: ' + a.due : '';
  const priority = a.priority ? ' [' + String(a.priority).toUpperCase() + ']' : '';
  const context = a.context ? ' - ' + a.context : '';
  rows.push({ scorecard_id: scorecardId, criterion_key: 'action_item', quote: a.task + owner + due + priority + context, timestamp_seconds: null });
}
for (const d of (summary.decisions_made || [])) if (d && d.decision) {
  const by = d.decided_by ? ' (by ' + d.decided_by + ')' : '';
  const ctx = d.context ? ' - ' + d.context : '';
  const impact = d.impact ? ' [impact: ' + d.impact + ']' : '';
  rows.push({ scorecard_id: scorecardId, criterion_key: 'decision', quote: d.decision + by + ctx + impact, timestamp_seconds: null });
}
for (const q of (summary.open_questions || [])) if (q) rows.push({ scorecard_id: scorecardId, criterion_key: 'open_question', quote: String(q), timestamp_seconds: null });
for (const n of (summary.next_steps || [])) if (n) rows.push({ scorecard_id: scorecardId, criterion_key: 'next_step', quote: String(n), timestamp_seconds: null });
for (const r of (summary.risks || [])) {
  if (!r) continue;
  if (typeof r === 'string') rows.push({ scorecard_id: scorecardId, criterion_key: 'risk', quote: r, timestamp_seconds: null });
  else if (r.risk) {
    const sev = r.severity ? ' [' + String(r.severity).toUpperCase() + ']' : '';
    const area = r.area ? ' (' + r.area + ')' : '';
    rows.push({ scorecard_id: scorecardId, criterion_key: 'risk', quote: r.risk + sev + area, timestamp_seconds: null });
  }
}
for (const s of (summary.suggestions || [])) {
  if (!s) continue;
  if (typeof s === 'string') rows.push({ scorecard_id: scorecardId, criterion_key: 'suggestion', quote: s, timestamp_seconds: null });
  else if (s.suggestion) {
    const by = s.suggested_by ? ' (by ' + s.suggested_by + ')' : '';
    const v = s.value ? ' - ' + s.value : '';
    rows.push({ scorecard_id: scorecardId, criterion_key: 'suggestion', quote: s.suggestion + by + v, timestamp_seconds: null });
  }
}
for (const att of (summary.attendees || [])) if (att && att.name) {
  const role = att.role ? ' (' + att.role + ')' : '';
  const ext = att.is_internal === false ? ' [external]' : '';
  rows.push({ scorecard_id: scorecardId, criterion_key: 'attendee', quote: att.name + role + ext, timestamp_seconds: null });
}
for (const bp of (summary.banned_phrases_observed || [])) if (bp) rows.push({ scorecard_id: scorecardId, criterion_key: 'banned_phrase', quote: String(bp), timestamp_seconds: null });

if (rows.length === 0) return [{ json: { __skip: true, call_id: $('Parse Meeting Summary').first().json.call_id } }];
return [{ json: { evidence: rows, call_id: $('Parse Meeting Summary').first().json.call_id } }];"""

# === Store Meeting Scorecard - include meeting_title in summary ===
STORE_MEETING_SCORECARD = (
    "={{ JSON.stringify({ "
    "call_id: $json.call_id, "
    "rubric_id: '00000000-0000-0000-0000-000000000002', "
    "overall_score: null, "
    "summary: ($json.summary.meeting_title || '') + (($json.summary.meeting_title && $json.summary.one_line_summary) ? '. ' : '') + ($json.summary.one_line_summary || '') + ($json.summary.executive_summary ? '\\n\\n' + $json.summary.executive_summary : ''), "
    "strengths: ($json.summary.key_points || []).map(function(p){return {point:p};}), "
    "improvements: $json.summary.suggestions || [], "
    "llm_model: 'llama-3.3-70b-versatile' "
    "}) }}"
)

# === Department lookup - PATCH on calls table to assign department_id by name ===
# We embed a tiny JS map; if more departments come we add them here or query departments table.
# For now: matches host_department string to a known department_id.
DEPT_MAP = """const slug = ($('Parse Meeting Summary').first().json.summary.host_department || 'ops').toLowerCase().trim();
const map = {
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
const departmentId = map[slug] || map.ops;
return [{ json: { call_id: $('Parse Meeting Summary').first().json.call_id, department_id: departmentId } }];"""

for node in wf['nodes']:
    n = node['name']
    if n == 'Generate Meeting Summary':
        node['parameters']['jsonBody'] = NEW_MEETING
        print('Upgraded Meeting Summary prompt with depth + projects + attendees')
    if n == 'Score with Groq':
        node['parameters']['jsonBody'] = NEW_SCORE
        print('Upgraded Score prompt with depth + projects + attendees')
    if n == 'Parse Meeting Summary':
        node['parameters']['jsCode'] = PARSE_MEETING
        print('Upgraded Parse Meeting Summary')
    if n == 'Parse Scorecard':
        node['parameters']['jsCode'] = PARSE_SCORECARD
        print('Upgraded Parse Scorecard')
    if n == 'Store Meeting Evidence':
        node['parameters']['jsCode'] = STORE_MEETING_EVIDENCE
        print('Upgraded Store Meeting Evidence')
    if n == 'Store Meeting Scorecard':
        node['parameters']['jsonBody'] = STORE_MEETING_SCORECARD
        print('Updated Store Meeting Scorecard with meeting_title')

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

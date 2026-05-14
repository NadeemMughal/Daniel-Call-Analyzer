import os
#!/usr/bin/env python3
"""Add meeting_phase field to the LLM extraction so each call gets a
specific phase tag (discovery, onboarding, kick_off, ai_onboarding,
strategy_review, status_update, sales_pitch, demo, training, internal_sync,
one_on_one, project_review, quarterly_review, closing_call, renewal,
escalation, feedback_session, other).
- Update Meeting Summary + Score prompts to request meeting_phase
- Update Parse Meeting Summary + Parse Scorecard to extract it
- Update Store Meeting Evidence to write a meeting_phase evidence row
- Update Compute Department code to also include phase in stored summary
"""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = os.environ.get("N8N_API_KEY", "")

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

PHASE_VALUES = (
    "discovery, onboarding, kick_off, ai_onboarding, strategy_review, "
    "status_update, sales_pitch, demo, training, internal_sync, one_on_one, "
    "project_review, quarterly_review, closing_call, renewal, escalation, "
    "feedback_session, content_review, other"
)

PHASE_GUIDE = (
    "meeting_phase (one of: " + PHASE_VALUES + ". "
    "Pick the SPECIFIC purpose of this meeting. "
    "discovery = first conversation with a new prospect. "
    "onboarding = bringing a new client into the service. "
    "kick_off = formally starting a project or campaign. "
    "ai_onboarding = setting up an AI tool/agent for a client or team. "
    "strategy_review = discussing high-level direction and decisions. "
    "status_update = checking progress on ongoing work. "
    "sales_pitch = presenting a paid offer to a prospect. "
    "demo = walking through a product or feature. "
    "training = teaching the team or client a workflow. "
    "internal_sync = team coordination on multiple projects (the most common type). "
    "one_on_one = manager + report 1:1. "
    "project_review = retrospective or status on a specific project. "
    "quarterly_review = formal periodic review. "
    "closing_call = asking for the sale / signing the deal. "
    "renewal = renewing an existing contract. "
    "escalation = handling a problem or complaint. "
    "feedback_session = giving or receiving feedback. "
    "content_review = reviewing produced content like blogs/videos/ads. "
    "If none fit, use other.), "
)

# Replace the meeting_title key in the prompts with meeting_title + meeting_phase
MEETING_SYS = (
    "You are extracting structured business intelligence from a meeting transcript. "
    "Your job is COMPLETENESS, not summarization. Be exhaustive. "
    ""
    "CRITICAL RULES - VIOLATING ANY OF THESE PRODUCES UNUSABLE OUTPUT: "
    "1. EXTRACT EVERYTHING. If the transcript has 12 action items, list ALL 12. "
    "2. USE EXACT WORDS. Every action_item, decision, key_point MUST use phrasing from the transcript. "
    "3. NAME REAL PEOPLE. Use actual attendee names from the attendee list. Never invent roles like \\\"Senior Meeting Analyst\\\". "
    "4. ASSIGN DEPARTMENTS by keyword: sales/prospects/closing/proposal->sales; SEO/blog/website/search->seo; "
    "content/social/video/images/posts->content; finance/budget/revenue->finance; "
    "operations/apps/AI projects/automation->ops; strategy/pause WeBuildTrades/vision/Daniel-led->executive. "
    "5. NO SHORTCUTS. No \\\"continue\\\" or \\\"review\\\" - cite the specific action. "
    "6. RISKS must be actually raised in the transcript. "
    "7. BANNED PHRASES must be ACTUAL occurrences (mate, basically, essentially, obviously, you know, etc.). "
    ""
    "Return ONLY valid JSON with these keys: "
    "meeting_title (specific 5-10 word title), "
    + PHASE_GUIDE +
    "one_line_summary (one clear sentence of the main outcome), "
    "executive_summary (5-8 sentences flowing prose: who attended, topics in order, decisions and by whom, outcome, what happens next), "
    "meeting_outcome (1-2 sentences: what changed because of this meeting), "
    "host_department (one of: executive, sales, seo, ops, finance, content), "
    "attendees (array of {name, role, is_internal}), "
    "key_points (array of 8-15+ specific topics quoted), "
    "projects_discussed (array of {name, status (delivered|in_progress|paused|proposed|blocked), owner, department, summary, next_action}), "
    "decisions_made (array of {decision, decided_by, context, impact}), "
    "action_items (array of {task, owner, due, priority (high|medium|low), context}), "
    "open_questions (array of strings), "
    "next_steps (array of strings), "
    "risks (array of {risk, severity (high|medium|low), area}), "
    "suggestions (array of {suggestion, suggested_by, value}), "
    "banned_phrases_observed (array of strings - actual usages)"
)

MEETING_BODY = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 5000, "
    "messages: [ "
    "{ role: 'system', content: '" + MEETING_SYS.replace("'", "\\'") + "' }, "
    "{ role: 'user', content: 'Attendees:\\n' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\n\\nDuration: ' + (($('Verify HMAC').first().json.body.duration) || 0) + ' seconds\\n\\nFULL TRANSCRIPT (extract EVERYTHING quote-anchored):\\n\\n' + "
    "(($('Verify HMAC').first().json.body.transcript || {}).full_transcript || 'No transcript.') } "
    "] }) }}"
)

# Score prompt with meeting_phase
SCORE_SYS = (
    "You are coaching a sales rep at WeBuildTrades. Score against the rubric using EXACT transcript quotes. "
    "Be exhaustive. Use real names. Quote-anchored. Every claim must cite a real quote. "
    ""
    "Return ONLY valid JSON: "
    "meeting_title (5-10 words), "
    + PHASE_GUIDE +
    "overall_score (number 0-10), "
    "summary (1 sentence), "
    "executive_summary (5-8 sentence narrative), "
    "meeting_outcome (1-2 sentences: what changed), "
    "host_department (sales for client calls), "
    "attendees (array of {name, role, is_internal}), "
    "key_points (array of strings), "
    "projects_discussed (array of {name, status, owner, department, summary, next_action}), "
    "strengths (array of {criterion, score, description, evidence_quote}), "
    "improvements (array of {criterion, score, description, evidence_quote}), "
    "action_items (array of {task, owner, due, priority, context}), "
    "decisions_made (array of {decision, decided_by, context, impact}), "
    "open_questions (array of strings), next_steps (array of strings), "
    "risks (array of {risk, severity, area}), "
    "suggestions (array of {suggestion, suggested_by, value}), "
    "banned_phrases_observed (array of strings). "
    "Rubric: "
)

SCORE_BODY = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 5000, "
    "messages: [ "
    "{ role: 'system', content: '" + SCORE_SYS.replace("'", "\\'") + "' + JSON.stringify($('Get Active Rubric').first().json.content) }, "
    "{ role: 'user', content: 'Attendees:\\n' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\nCall type: ' + ($('Parse Classification').first().json.call_type || 'unknown') + "
    "'\\n\\nFULL TRANSCRIPT:\\n\\n' + ($('Get Call Data').first().json.transcript_raw || 'No transcript.') } "
    "] }) }}"
)

# Parse Meeting Summary - keep meeting_phase in the output
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
  s = { meeting_title: '', meeting_phase: 'other', one_line_summary: 'Model returned no content', executive_summary: '', host_department: '', attendees: [], key_points: [], projects_discussed: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] };
} else {
  try { s = JSON.parse(responseText); }
  catch (e) { s = { meeting_title: '', meeting_phase: 'other', one_line_summary: 'Model JSON parse failed', executive_summary: '', host_department: '', attendees: [], key_points: [], projects_discussed: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] }; }
}
const arr = ['attendees', 'key_points', 'projects_discussed', 'decisions_made', 'action_items', 'open_questions', 'next_steps', 'risks', 'suggestions', 'banned_phrases_observed'];
for (const f of arr) if (!Array.isArray(s[f])) s[f] = [];
if (!s.meeting_title) s.meeting_title = '';
if (!s.host_department) s.host_department = 'ops';
if (!s.meeting_phase) s.meeting_phase = 'other';

return [{ json: { call_id: callId, summary: s } }];"""

# Parse Scorecard - same with meeting_phase
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
  a = { meeting_title: '', meeting_phase: 'other', overall_score: null, summary: 'Score model returned no content.', executive_summary: '', host_department: 'sales', attendees: [], strengths: [], improvements: [], key_points: [], projects_discussed: [], action_items: [], decisions_made: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] };
} else {
  try { a = JSON.parse(responseText); }
  catch (e) { a = { meeting_title: '', meeting_phase: 'other', overall_score: null, summary: 'Score model JSON parse failed.', executive_summary: '', host_department: 'sales', attendees: [], strengths: [], improvements: [], key_points: [], projects_discussed: [], action_items: [], decisions_made: [], open_questions: [], next_steps: [], risks: [], suggestions: [], banned_phrases_observed: [] }; }
}

if (typeof a.overall_score !== 'number' && a.overall_score !== null) a.overall_score = null;
const arr = ['strengths', 'improvements', 'key_points', 'projects_discussed', 'attendees', 'action_items', 'decisions_made', 'open_questions', 'next_steps', 'risks', 'suggestions', 'banned_phrases_observed'];
for (const f of arr) if (!Array.isArray(a[f])) a[f] = [];
if (!a.summary) a.summary = '';
if (!a.executive_summary) a.executive_summary = '';
if (!a.meeting_title) a.meeting_title = '';
if (!a.host_department) a.host_department = 'sales';
if (!a.meeting_phase) a.meeting_phase = 'other';

const allEvidence = [];
// Add meeting_phase as evidence row so the portal can read it without a schema change
if (a.meeting_phase) allEvidence.push({ criterion_key: 'meeting_phase', quote: String(a.meeting_phase), timestamp_seconds: null });

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
  meeting_phase: a.meeting_phase,
  host_department: a.host_department,
  overall_score: typeof a.overall_score === 'number' ? Math.round(a.overall_score * 10) / 10 : null,
  summary: (a.meeting_title ? a.meeting_title + '. ' : '') + (a.summary || a.executive_summary || ''),
  executive_summary: a.executive_summary,
  strengths: a.strengths,
  improvements: a.improvements,
  llm_model: 'llama-3.3-70b-versatile',
  all_evidence: allEvidence
} }];"""

# Store Meeting Evidence - also include meeting_phase row
STORE_MEETING_EVIDENCE = """const scorecardId = $('Store Meeting Scorecard').first().json.id;
const summary = $('Parse Meeting Summary').first().json.summary;
const rows = [];

// Meeting phase as a dedicated evidence row
if (summary.meeting_phase) rows.push({ scorecard_id: scorecardId, criterion_key: 'meeting_phase', quote: String(summary.meeting_phase), timestamp_seconds: null });

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

return [{ json: { evidence: rows, call_id: $('Parse Meeting Summary').first().json.call_id, row_count: rows.length } }];"""

# Compute Department - prepend meeting_phase to scorecard.summary for visibility
COMPUTE_TEAM_JS = """const map = {
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
const s = ($('Parse Meeting Summary').first().json.summary) || {};
const slug = String(s.host_department || 'ops').toLowerCase().trim();
const departmentId = map[slug] || map.ops;
const callId = $('Parse Classification').first().json.call_id;

const NL = String.fromCharCode(10);
const title = s.meeting_title || '';
const phase = s.meeting_phase || '';
const oneLine = s.one_line_summary || '';
const exec = s.executive_summary || '';
const outcome = s.meeting_outcome || '';
let combinedSummary = '';
if (title) combinedSummary += title;
if (title && oneLine) combinedSummary += '. ';
if (oneLine) combinedSummary += oneLine;
if (exec) combinedSummary += NL + NL + exec;
if (outcome) combinedSummary += NL + NL + 'Outcome: ' + outcome;
if (phase) combinedSummary += NL + NL + 'Phase: ' + phase;

const scorecardBody = {
  call_id: callId,
  rubric_id: '00000000-0000-0000-0000-000000000002',
  overall_score: null,
  summary: combinedSummary,
  strengths: (s.key_points || []).map(function(p){ return { point: p }; }),
  improvements: s.suggestions || [],
  llm_model: 'llama-3.3-70b-versatile'
};

return [{ json: { call_id: callId, department_id: departmentId, department_slug: slug, scorecard_body: scorecardBody } }];"""

for node in wf['nodes']:
    n = node['name']
    if n == 'Generate Meeting Summary':
        node['parameters']['jsonBody'] = MEETING_BODY
        print('Meeting Summary prompt: added meeting_phase field')
    if n == 'Generate Meeting Summary (8B)':
        node['parameters']['jsonBody'] = MEETING_BODY.replace("'llama-3.3-70b-versatile'", "'llama-3.1-8b-instant'")
        print('8B fallback: added meeting_phase field')
    if n == 'Score with Groq':
        node['parameters']['jsonBody'] = SCORE_BODY
        print('Score prompt: added meeting_phase field')
    if n == 'Parse Meeting Summary':
        node['parameters']['jsCode'] = PARSE_MEETING
        print('Parse Meeting Summary: extract meeting_phase')
    if n == 'Parse Scorecard':
        node['parameters']['jsCode'] = PARSE_SCORECARD
        print('Parse Scorecard: extract meeting_phase + write evidence row')
    if n == 'Store Meeting Evidence':
        node['parameters']['jsCode'] = STORE_MEETING_EVIDENCE
        print('Store Meeting Evidence: write meeting_phase row')
    if n == 'Compute Department':
        node['parameters']['jsCode'] = COMPUTE_TEAM_JS
        print('Compute Department: include phase in summary')

with open(WORKFLOW_PATH, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

for k in ['active', 'versionId', 'id']: wf.pop(k, None)
try:
    urllib.request.urlopen(urllib.request.Request(
        f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}/deactivate',
        data=b'{}', method='POST', headers={'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_KEY}))
except Exception: pass
payload = json.dumps(wf, ensure_ascii=False).encode('utf-8')
with urllib.request.urlopen(urllib.request.Request(
    f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}',
    data=payload, method='PUT', headers={'Content-Type': 'application/json; charset=utf-8', 'X-N8N-API-KEY': N8N_KEY})) as r:
    print(f'Pushed: {len(json.loads(r.read()).get("nodes",[]))} nodes')
with urllib.request.urlopen(urllib.request.Request(
    f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}/activate',
    data=b'{}', method='POST', headers={'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_KEY})) as r:
    print(f'Active: {json.loads(r.read())["active"]}')

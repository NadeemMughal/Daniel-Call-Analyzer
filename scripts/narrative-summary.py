#!/usr/bin/env python3
"""Refine prompts so executive_summary is a NARRATIVE paragraph (not bulleted),
and add a meeting_outcome field that explicitly captures what changed."""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YTE2ODM3Ni0yMDlmLTRkNGMtODgyYi1kZGI4NzlkZDRjNjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMTA0YzEwZTUtNGQ1NC00Zjg5LThhY2YtZjhhZTA0OTYwMDhjIiwiaWF0IjoxNzc4MjQyMTAyLCJleHAiOjE3ODA3OTA0MDB9.aMdMCODnGUjCX2Lk8v5F1ufxTYfdlPz2BJY1gZt6MmI"

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

MEETING_SYSTEM = (
    "You are a senior meeting analyst at WeBuildTrades. Read this internal team-meeting transcript "
    "and produce a FULL business-grade analysis. Be SPECIFIC: use real names, real project names, "
    "real numbers, real dates. DO NOT invent or generalize. If a section had nothing in the transcript, "
    "return an empty array. Aim for COMPLETENESS - if 12 projects were mentioned, list all 12. "
    "Return ONLY valid JSON with these keys: "
    "meeting_title (a specific 5-10 word title naming the actual topic, NOT generic like \\\"Team Meeting\\\"), "
    "one_line_summary (one clear sentence stating the main outcome of this meeting), "
    "executive_summary (a NARRATIVE paragraph of 5-8 sentences written for a manager who did NOT attend. "
    "Cover: who attended and their roles, the main topics discussed in order, what was decided and by whom, "
    "what is the result or takeaway, what happens next. Write it as flowing prose, NOT a bulleted list. "
    "Be specific - name the actual projects and people.), "
    "meeting_outcome (1-2 sentences describing the CONCRETE RESULT of this meeting. What changed because "
    "this meeting happened? What is the team going to do that they were not before?), "
    "host_department (one of: executive, sales, seo, ops, finance, content, ai), "
    "attendees (array of objects: name, role, is_internal), "
    "key_points (array of 8-15 strings - every important topic discussed, each specific), "
    "projects_discussed (array of objects: name, status (delivered|in_progress|paused|proposed|blocked), "
    "owner, department, summary (1-2 sentences), next_action), "
    "decisions_made (array of objects: decision, decided_by, context, impact), "
    "action_items (array of objects: task, owner, due, priority, context), "
    "open_questions (array of strings), next_steps (array of strings), "
    "risks (array of objects: risk, severity, area), "
    "suggestions (array of objects: suggestion, suggested_by, value), "
    "banned_phrases_observed (array of strings)"
)

NEW_MEETING = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 6000, "
    "messages: [ "
    "{ role: 'system', content: '" + MEETING_SYSTEM.replace("'", "\\'") + "' }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\nDuration: ' + (($('Verify HMAC').first().json.body.duration) || 0) + ' seconds\\n\\nFull transcript:\\n' + "
    "(($('Verify HMAC').first().json.body.transcript || {}).full_transcript || 'No transcript.') } "
    "] }) }}"
)

SCORE_SYSTEM = (
    "You are an expert sales coach for WeBuildTrades. Score the rep against the rubric using EXACT "
    "transcript quotes. Use the rep real name. Do NOT invent - every claim must cite a quote. "
    "Return ONLY valid JSON with these keys: "
    "meeting_title, overall_score (0-10), summary (1 sentence), "
    "executive_summary (NARRATIVE paragraph 5-8 sentences for a manager who did not attend. Cover: "
    "attendees, main topics, what worked and what did not, what the rep should do differently. "
    "Flowing prose, not bullets.), "
    "meeting_outcome (1-2 sentences: what concretely changed because of this call - did the deal advance, "
    "is a follow-up booked, is the prospect more or less likely to buy?), "
    "host_department (sales for client calls), attendees, key_points, projects_discussed, "
    "strengths (array of objects: criterion, score, description, evidence_quote), "
    "improvements (array of objects: criterion, score, description, evidence_quote), "
    "action_items, decisions_made, open_questions, next_steps, risks, suggestions, "
    "banned_phrases_observed. Rubric: "
)

NEW_SCORE = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 6000, "
    "messages: [ "
    "{ role: 'system', content: '" + SCORE_SYSTEM.replace("'", "\\'") + "' + JSON.stringify($('Get Active Rubric').first().json.content) }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\nCall type: ' + ($('Parse Classification').first().json.call_type || 'unknown') + "
    "'\\nTranscript:\\n' + ($('Get Call Data').first().json.transcript_raw || 'No transcript.') } "
    "] }) }}"
)

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
const oneLine = s.one_line_summary || '';
const exec = s.executive_summary || '';
const outcome = s.meeting_outcome || '';
let combinedSummary = '';
if (title) combinedSummary += title;
if (title && oneLine) combinedSummary += '. ';
if (oneLine) combinedSummary += oneLine;
if (exec) combinedSummary += NL + NL + exec;
if (outcome) combinedSummary += NL + NL + 'Outcome: ' + outcome;

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

for n in wf['nodes']:
    if n['name'] == 'Generate Meeting Summary':
        n['parameters']['jsonBody'] = NEW_MEETING
        print('Refined Meeting Summary prompt')
    if n['name'] == 'Generate Meeting Summary (8B)':
        n['parameters']['jsonBody'] = NEW_MEETING.replace("'llama-3.3-70b-versatile'", "'llama-3.1-8b-instant'")
        print('Updated 8B fallback')
    if n['name'] == 'Score with Groq':
        n['parameters']['jsonBody'] = NEW_SCORE
        print('Refined Score prompt')
    if n['name'] == 'Compute Department':
        n['parameters']['jsCode'] = COMPUTE_TEAM_JS
        print('Updated Compute Department to include meeting_outcome')

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

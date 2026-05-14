import os
#!/usr/bin/env python3
"""Upgrade prompts and parsing for accuracy:
- Classifier uses attendee emails so internal-only meetings are correctly tagged 'team'
- Meeting Summary and Score prompts: anti-hallucination, exact-quote rules, real names
- Parse Meeting Summary: robust JSON extraction
- Store Meeting Evidence: all sections (key_points, decisions, action_items, etc.) saved
"""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = os.environ.get("N8N_API_KEY", "")

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

# Classifier that USES attendee email domains
NEW_CLASSIFY = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.1-8b-instant', "
    "max_tokens: 300, "
    "messages: [ "
    "{ role: 'system', content: 'You classify business calls. Types: "
    "discovery (first meeting with a prospective new client), "
    "ads_intro (introducing advertising services to a prospect or warm lead), "
    "launch (onboarding/kickoff with a new client), "
    "follow_up (check-in with an existing client about ongoing work), "
    "team (INTERNAL meeting between WeBuildTrades staff only, no external clients), "
    "other. CRITICAL: if EVERY attendee email ends with @webuildtrades.com, the call is ALWAYS team. "
    "If ANY attendee email is from outside @webuildtrades.com, it is a client or prospect call. "
    "Return JSON only: {\\\"call_type\\\":\\\"...\\\",\\\"confidence\\\":0.9,\\\"reasoning\\\":\\\"one sentence citing attendee emails or transcript content\\\"}' }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name,email:a.email};})) + "
    "'\\nTranscript excerpt:\\n' + (($('Verify HMAC').first().json.body.transcript || {}).full_transcript || '').substring(0, 2000) } "
    "] }) }}"
)

NEW_MEETING_SUMMARY = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 4500, "
    "messages: [ "
    "{ role: 'system', content: 'You are a meeting intelligence analyst. Read this internal team meeting transcript and extract ONLY what was actually said. Do NOT invent or generalize. Use the real names from the transcript. Be specific to THIS meeting (project names, decisions, owners). "
    "Return ONLY valid JSON with these top-level keys: "
    "title (5-8 word descriptive title), "
    "one_line_summary (one sentence: what this meeting was about and the most important outcome), "
    "executive_summary (3-5 sentences: who attended, the main topics covered, what was decided, what is at stake), "
    "key_points (array of 6-12 specific topics actually discussed - name the projects, clients, tools by name. E.g. \\\"Closeboard live chat widget delivered to Keystone Property\\\" not \\\"new feature\\\"), "
    "decisions_made (array of objects: decision, decided_by (real name), context), "
    "action_items (array of objects: task, owner (real name), due (date or empty), priority (high|medium|low)), "
    "open_questions (array of strings raised but not resolved), "
    "next_steps (array of strings - concrete things to do after), "
    "risks (array of strings - actual concerns raised), "
    "suggestions (array of strings - improvement ideas anyone proposed). "
    "If a section had nothing in the transcript, return an empty array. NEVER invent.' }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return a.name;})) + "
    "'\\nDuration: ' + (($('Verify HMAC').first().json.body.duration) || 0) + ' seconds\\n\\nFull transcript:\\n' + "
    "(($('Verify HMAC').first().json.body.transcript || {}).full_transcript || 'No transcript.') } "
    "] }) }}"
)

NEW_SCORE = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 4500, "
    "messages: [ "
    "{ role: 'system', content: 'You are an expert sales coach for WeBuildTrades, a UK marketing agency for trade businesses. Score the rep against the rubric using EXACT TRANSCRIPT QUOTES. Use the rep real name. Do NOT invent or generalize - every claim must cite a real quote from this transcript. Be specific. Never write generic praise. "
    "Return ONLY valid JSON with these keys: "
    "overall_score (number 0-10), summary (1 sentence), executive_summary (3-5 sentences), "
    "key_points (array of strings - actual topics discussed in THIS call), "
    "strengths (array of objects: criterion, score 0-10, description specific to this call, evidence_quote exact quote), "
    "improvements (array of objects: criterion, score 0-10, description with concrete next-call action, evidence_quote exact quote), "
    "action_items (array of objects: task, owner, due, priority), "
    "decisions_made (array of objects: decision, decided_by, context), "
    "open_questions (array of strings), next_steps (array of strings), "
    "risks (array of strings), suggestions (array of strings). "
    "Rubric: ' + JSON.stringify($('Get Active Rubric').first().json.content) }, "
    "{ role: 'user', content: 'Attendees: ' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return a.name;})) + "
    "'\\nCall type: ' + ($('Parse Classification').first().json.call_type || 'unknown') + "
    "'\\nTranscript:\\n' + ($('Get Call Data').first().json.transcript_raw || 'No transcript.') } "
    "] }) }}"
)

PARSE_MEETING_SUMMARY = """const choices = $input.first().json.choices;
let responseText = (choices && choices[0] && choices[0].message && choices[0].message.content) || '';
const fence = String.fromCharCode(96, 96, 96);
if (responseText.indexOf(fence) === 0) {
  responseText = responseText.substring(3);
  if (responseText.indexOf('json') === 0) responseText = responseText.substring(4);
  responseText = responseText.trim();
  if (responseText.endsWith(fence)) responseText = responseText.substring(0, responseText.length - 3);
}
const firstBrace = responseText.indexOf('{');
if (firstBrace > 0) responseText = responseText.substring(firstBrace);
const lastBrace = responseText.lastIndexOf('}');
if (lastBrace > -1 && lastBrace < responseText.length - 1) responseText = responseText.substring(0, lastBrace + 1);
responseText = responseText.trim();

const callId = $('Parse Classification').first().json.call_id;
let s;
try { s = JSON.parse(responseText); }
catch (e) {
  s = { title: '', one_line_summary: 'Parse error', executive_summary: '', key_points: [], decisions_made: [], action_items: [], open_questions: [], next_steps: [], risks: [], suggestions: [] };
}
if (!Array.isArray(s.key_points)) s.key_points = [];
if (!Array.isArray(s.decisions_made)) s.decisions_made = [];
if (!Array.isArray(s.action_items)) s.action_items = [];
if (!Array.isArray(s.open_questions)) s.open_questions = [];
if (!Array.isArray(s.next_steps)) s.next_steps = [];
if (!Array.isArray(s.risks)) s.risks = [];
if (!Array.isArray(s.suggestions)) s.suggestions = [];

return [{ json: { call_id: callId, summary: s } }];"""

STORE_MEETING_EVIDENCE = """const scorecardId = $('Store Meeting Scorecard').first().json.id;
const summary = $('Parse Meeting Summary').first().json.summary;
const rows = [];
for (const p of (summary.key_points || [])) if (p) rows.push({ scorecard_id: scorecardId, criterion_key: 'key_point', quote: String(p), timestamp_seconds: null });
for (const a of (summary.action_items || [])) {
  if (a && a.task) {
    const owner = a.owner ? ' - Owner: ' + a.owner : '';
    const due = a.due ? ' - Due: ' + a.due : '';
    const priority = a.priority ? ' [' + String(a.priority).toUpperCase() + ']' : '';
    rows.push({ scorecard_id: scorecardId, criterion_key: 'action_item', quote: a.task + owner + due + priority, timestamp_seconds: null });
  }
}
for (const d of (summary.decisions_made || [])) {
  if (d && d.decision) {
    const by = d.decided_by ? ' (by ' + d.decided_by + ')' : '';
    const ctx = d.context ? ' - ' + d.context : '';
    rows.push({ scorecard_id: scorecardId, criterion_key: 'decision', quote: d.decision + by + ctx, timestamp_seconds: null });
  }
}
for (const q of (summary.open_questions || [])) if (q) rows.push({ scorecard_id: scorecardId, criterion_key: 'open_question', quote: String(q), timestamp_seconds: null });
for (const n of (summary.next_steps || [])) if (n) rows.push({ scorecard_id: scorecardId, criterion_key: 'next_step', quote: String(n), timestamp_seconds: null });
for (const r of (summary.risks || [])) if (r) rows.push({ scorecard_id: scorecardId, criterion_key: 'risk', quote: String(r), timestamp_seconds: null });
for (const s of (summary.suggestions || [])) if (s) rows.push({ scorecard_id: scorecardId, criterion_key: 'suggestion', quote: String(s), timestamp_seconds: null });

if (rows.length === 0) return [{ json: { __skip: true, call_id: $('Parse Meeting Summary').first().json.call_id } }];
return [{ json: { evidence: rows, call_id: $('Parse Meeting Summary').first().json.call_id } }];"""

STORE_MEETING_SCORECARD = (
    "={{ JSON.stringify({ "
    "call_id: $json.call_id, "
    "rubric_id: '00000000-0000-0000-0000-000000000002', "
    "overall_score: null, "
    "summary: ($json.summary.one_line_summary || '') + ($json.summary.executive_summary ? '\\n\\n' + $json.summary.executive_summary : ''), "
    "strengths: ($json.summary.key_points || []).map(function(p){return {point:p};}), "
    "improvements: $json.summary.suggestions || [], "
    "llm_model: 'llama-3.3-70b-versatile' "
    "}) }}"
)

for node in wf['nodes']:
    n = node['name']
    if n == 'Classify with Groq':
        node['parameters']['jsonBody'] = NEW_CLASSIFY
        print('Upgraded Classifier (attendee-aware)')
    if n == 'Generate Meeting Summary':
        node['parameters']['jsonBody'] = NEW_MEETING_SUMMARY
        print('Upgraded Meeting Summary prompt (anti-hallucination)')
    if n == 'Score with Groq':
        node['parameters']['jsonBody'] = NEW_SCORE
        print('Upgraded Score prompt (real names, exact quotes)')
    if n == 'Parse Meeting Summary':
        node['parameters']['jsCode'] = PARSE_MEETING_SUMMARY
        print('Upgraded Parse Meeting Summary')
    if n == 'Store Meeting Evidence':
        node['parameters']['jsCode'] = STORE_MEETING_EVIDENCE
        print('Upgraded Store Meeting Evidence (all sections)')
    if n == 'Store Meeting Scorecard':
        node['parameters']['jsonBody'] = STORE_MEETING_SCORECARD
        print('Updated Store Meeting Scorecard')

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

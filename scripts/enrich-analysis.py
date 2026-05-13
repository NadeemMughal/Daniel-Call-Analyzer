#!/usr/bin/env python3
"""Upgrade the master pipeline to extract full meeting intelligence + scoring."""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
N8N_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YTE2ODM3Ni0yMDlmLTRkNGMtODgyYi1kZGI4NzlkZDRjNjIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMTA0YzEwZTUtNGQ1NC00Zjg5LThhY2YtZjhhZTA0OTYwMDhjIiwiaWF0IjoxNzc4MjQyMTAyLCJleHAiOjE3ODA3OTA0MDB9.aMdMCODnGUjCX2Lk8v5F1ufxTYfdlPz2BJY1gZt6MmI"
SVC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c"
WF_ID = 'Z1WdzpBv7u1DjB2L'

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

# === 1. ENRICHED SCORE PROMPT — returns full intelligence + scoring ===
SCORE_PROMPT = ('You are an expert meeting analyst and sales coach for WeBuildTrades. '
    'Analyze the call transcript and return ONE valid JSON object with EVERY field below. '
    'Be specific - cite exact quotes from the transcript. Never write generic praise. '
    'Required keys: '
    'overall_score (number 0-10, weighted across sales criteria - use null for purely internal team meetings), '
    'summary (1-sentence one-liner), '
    'executive_summary (3-5 sentence overview of what happened, what was decided, what is at stake), '
    'key_points (array of 5-8 important discussion points from the call), '
    'strengths (array of objects with keys: criterion (snake_case string like "pain_surfacing"), score (number 0-10), description (2-3 sentences explaining what the rep did well and why it mattered), evidence_quote (exact 1-2 sentence quote from transcript)), '
    'improvements (array of objects with keys: criterion (snake_case string), score (number 0-10), description (2-3 sentences: what was off, why it matters, and SPECIFIC action to take next time), evidence_quote (exact quote showing the issue)), '
    'action_items (array of objects with keys: task (specific actionable thing to do), owner (person name from the transcript), due (date or empty string), priority (one of: high, medium, low)), '
    'decisions_made (array of objects with keys: decision (what was decided), decided_by (person name), context (one sentence explaining the why)), '
    'open_questions (array of strings - questions raised but not resolved in this call), '
    'next_steps (array of strings - concrete next things that should happen after this call), '
    'risks (array of strings - any risks, concerns, or red flags identified), '
    'suggestions (array of strings - improvement suggestions made by anyone in the call). '
    'For sales criteria scoring, use these 5: talk_ratio, question_stack, pain_surfacing, objection_handling, solution_timing. '
    'Active rubric: ')

NEW_SCORE_BODY = (
    "={{ JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 4500, "
    "messages: [ "
    "{ role: 'system', content: '" + SCORE_PROMPT.replace("'", "\\'") + "' + JSON.stringify($('Get Active Rubric').first().json.content) }, "
    "{ role: 'user', content: 'Call type: ' + ($('Parse Classification').first().json.call_type || 'unknown') + "
    "'. Duration: ' + (($('Get Call Data').first().json.duration_seconds) || 0) + ' seconds. Transcript: ' + "
    "($('Get Call Data').first().json.transcript_raw || 'No transcript.') } "
    "] }) }}"
)

# === 2. ENRICHED PARSE SCORECARD — extracts ALL fields ===
FENCE_PREFIX = """const choices = $input.first().json.choices;
let responseText = (choices && choices[0] && choices[0].message && choices[0].message.content) || '';
const fence = String.fromCharCode(96, 96, 96);
if (responseText.indexOf(fence) === 0) {
  responseText = responseText.substring(3);
  if (responseText.indexOf('json') === 0) responseText = responseText.substring(4);
  responseText = responseText.trim();
  if (responseText.endsWith(fence)) responseText = responseText.substring(0, responseText.length - 3);
  responseText = responseText.trim();
}"""

PARSE_SCORECARD_JS = FENCE_PREFIX + """
const callId = $('Parse Classification').first().json.call_id;
const rubric = $('Get Active Rubric').first().json;
let a;
try { a = JSON.parse(responseText); } catch (e) { throw new Error('Failed to parse scorecard: ' + responseText.substring(0, 300)); }

if (typeof a.overall_score !== 'number' && a.overall_score !== null) a.overall_score = 0;
if (!Array.isArray(a.strengths)) a.strengths = [];
if (!Array.isArray(a.improvements)) a.improvements = [];
if (!Array.isArray(a.key_points)) a.key_points = [];
if (!Array.isArray(a.action_items)) a.action_items = [];
if (!Array.isArray(a.decisions_made)) a.decisions_made = [];
if (!Array.isArray(a.open_questions)) a.open_questions = [];
if (!Array.isArray(a.next_steps)) a.next_steps = [];
if (!Array.isArray(a.risks)) a.risks = [];
if (!Array.isArray(a.suggestions)) a.suggestions = [];
if (!a.summary) a.summary = '';
if (!a.executive_summary) a.executive_summary = '';

// Build categorized evidence rows for scorecard_evidence table
const allEvidence = [];
// Strengths + improvements evidence quotes
for (const s of a.strengths) { if (s.evidence_quote) allEvidence.push({ criterion_key: 'strength_' + (s.criterion || 'item'), quote: s.evidence_quote, timestamp_seconds: s.timestamp_seconds || null }); }
for (const s of a.improvements) { if (s.evidence_quote) allEvidence.push({ criterion_key: 'improvement_' + (s.criterion || 'item'), quote: s.evidence_quote, timestamp_seconds: s.timestamp_seconds || null }); }
// Meeting-intelligence items
for (const p of a.key_points) { if (p) allEvidence.push({ criterion_key: 'key_point', quote: String(p), timestamp_seconds: null }); }
for (const ai of a.action_items) {
  if (ai && ai.task) {
    const owner = ai.owner ? ' — Owner: ' + ai.owner : '';
    const due = ai.due ? ' — Due: ' + ai.due : '';
    const priority = ai.priority ? ' [' + String(ai.priority).toUpperCase() + ']' : '';
    allEvidence.push({ criterion_key: 'action_item', quote: ai.task + owner + due + priority, timestamp_seconds: null });
  }
}
for (const d of a.decisions_made) {
  if (d && d.decision) {
    const by = d.decided_by ? ' (by ' + d.decided_by + ')' : '';
    const ctx = d.context ? ' — ' + d.context : '';
    allEvidence.push({ criterion_key: 'decision', quote: d.decision + by + ctx, timestamp_seconds: null });
  }
}
for (const q of a.open_questions) { if (q) allEvidence.push({ criterion_key: 'open_question', quote: String(q), timestamp_seconds: null }); }
for (const n of a.next_steps) { if (n) allEvidence.push({ criterion_key: 'next_step', quote: String(n), timestamp_seconds: null }); }
for (const r of a.risks) { if (r) allEvidence.push({ criterion_key: 'risk', quote: String(r), timestamp_seconds: null }); }
for (const s of a.suggestions) { if (s) allEvidence.push({ criterion_key: 'suggestion', quote: String(s), timestamp_seconds: null }); }

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

# === 3. ENRICHED BUILD EMAIL LIST — show all sections ===
BUILD_EMAIL_JS = """const scorecardRes = $('Get Final Scorecard').first().json;
const scorecard = Array.isArray(scorecardRes) ? scorecardRes[0] : scorecardRes;
const callId = $('Parse Classification').first().json.call_id;
const callType = $('Parse Classification').first().json.call_type;
const portalUrl = 'http://localhost:5173/calls/' + callId;
const safe = scorecard || { overall_score: null, summary: '', strengths: [], improvements: [] };
const evidenceRows = (safe.scorecard_evidence || []).filter(function(e){ return e && e.criterion_key; });
const findingsRaw = $('Get Rule Findings').all() || [];
const findings = findingsRaw.map(function(f){return f.json;}).filter(function(f){return f && f.rule_key;})
  .sort(function(a,b){ const o={critical:0,warning:1,info:2}; return (o[a.severity]||9)-(o[b.severity]||9); });

function group(key) { return evidenceRows.filter(function(e){ return e.criterion_key === key; }).map(function(e){ return e.quote; }); }
const keyPoints = group('key_point');
const actionItems = group('action_item');
const decisions = group('decision');
const openQuestions = group('open_question');
const nextSteps = group('next_step');
const risks = group('risk');
const suggestions = group('suggestion');

function humanize(k) { if (!k) return ''; return String(k).split('_').map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(' '); }
function scoreColor(s) { if (s===null||s===undefined) return '#64748b'; if (s>=8) return '#10b981'; if (s>=6) return '#3b82f6'; if (s>=4) return '#f59e0b'; return '#ef4444'; }
function sev(s) { if (s==='critical') return {bg:'#fee2e2',fg:'#991b1b',l:'CRITICAL'}; if (s==='warning') return {bg:'#fef3c7',fg:'#92400e',l:'WARNING'}; return {bg:'#dbeafe',fg:'#1e40af',l:'INFO'}; }

const strengths = (safe.strengths || []).slice(0, 5);
const improvements = (safe.improvements || []).slice(0, 5);

function critRow(item) {
  const label = humanize(item.criterion || '');
  const sc = typeof item.score === 'number' ? item.score : null;
  const col = scoreColor(sc);
  const sct = sc!==null ? sc+'/10' : '';
  return '<tr><td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<span style="font-weight:600;color:#1a1a2e;font-size:14px;">'+label+'</span>' +
      (sc!==null?'<span style="background:'+col+';color:#fff;font-weight:700;font-size:12px;padding:3px 11px;border-radius:12px;">'+sct+'</span>':'') +
    '</div>' +
    '<div style="color:#475569;font-size:13px;line-height:1.55;margin-bottom:6px;">'+(item.description||'')+'</div>' +
    (item.evidence_quote?'<div style="background:#f8fafc;border-left:3px solid #cbd5e1;padding:9px 13px;margin-top:8px;color:#475569;font-size:12px;font-style:italic;">&ldquo;'+item.evidence_quote.substring(0,240)+'&rdquo;</div>':'') +
  '</td></tr>';
}

function listSection(title, items, accent, bullet) {
  if (!items || !items.length) return '';
  return '<h2 style="color:'+accent+';font-size:13px;margin:28px 0 12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">'+title+' ('+items.length+')</h2>' +
    '<ul style="margin:0;padding-left:0;list-style:none;">' +
    items.slice(0,10).map(function(t){return '<li style="background:#fff;border:1px solid #e2e8f0;border-left:3px solid '+accent+';border-radius:6px;padding:11px 14px;margin-bottom:8px;color:#374151;font-size:13px;line-height:1.55;">'+bullet+' '+t+'</li>';}).join('') +
    '</ul>';
}

const scoreColor1 = scoreColor(safe.overall_score);
const headerScore = safe.overall_score !== null && safe.overall_score !== undefined
  ? '<div style="font-size:48px;font-weight:800;color:#1a1a2e;line-height:1;">'+safe.overall_score+'<span style="font-size:20px;color:#64748b;font-weight:500;"> / 10</span></div><div style="color:#64748b;font-size:11px;margin-top:6px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Overall call score</div>'
  : '<div style="font-size:26px;font-weight:700;color:#1a1a2e;">Meeting Analysis</div><div style="color:#64748b;font-size:12px;margin-top:4px;">'+humanize(callType)+' call</div>';

const strengthsHtml = strengths.length ? '<h2 style="color:#16a34a;font-size:13px;margin:28px 0 4px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">What worked</h2><table style="width:100%;border-collapse:collapse;">'+strengths.map(critRow).join('')+'</table>' : '';
const improvementsHtml = improvements.length ? '<h2 style="color:#d97706;font-size:13px;margin:28px 0 4px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Coach on this next time</h2><table style="width:100%;border-collapse:collapse;">'+improvements.map(critRow).join('')+'</table>' : '';

const findingsHtml = findings.length ? '<h2 style="color:#1a1a2e;font-size:13px;margin:28px 0 12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Rule findings ('+findings.length+')</h2>' +
  findings.slice(0,8).map(function(f){
    const s = sev(f.severity);
    return '<div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid '+s.fg+';border-radius:6px;padding:13px 15px;margin-bottom:10px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="background:'+s.bg+';color:'+s.fg+';font-weight:700;font-size:10px;padding:3px 9px;border-radius:10px;letter-spacing:0.06em;">'+s.l+'</span><span style="font-weight:600;color:#1a1a2e;font-size:13px;">'+humanize(f.rule_key)+'</span></div><div style="color:#475569;font-size:13px;line-height:1.55;">'+((f.value && f.value.suggestion) || '')+'</div></div>';
  }).join('') : '';

const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f8fafc;padding:24px 0;">' +
  '<div style="background:#1a1a2e;padding:30px 36px;border-radius:14px 14px 0 0;">' +
    '<h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;">WeBuildTrades Call Analyzer</h1>' +
    '<p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">'+humanize(callType)+' call analysis &middot; AI-generated coaching feedback</p>' +
  '</div>' +
  '<div style="background:#fff;padding:34px 36px;border:1px solid #e2e8f0;border-top:0;">' +
    '<p style="color:#334155;font-size:15px;margin:0 0 22px;">Hi Admin,</p>' +
    '<div style="background:#f1f5f9;border-left:4px solid '+scoreColor1+';padding:20px 26px;border-radius:0 8px 8px 0;margin-bottom:26px;">'+headerScore+'</div>' +
    (safe.executive_summary ? '<h2 style="color:#1a1a2e;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Executive Summary</h2><p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 8px;">'+safe.executive_summary+'</p>' : '') +
    listSection('Key Points', keyPoints, '#1a1a2e', '&#9679;') +
    listSection('Decisions Made', decisions, '#3b82f6', '&#10003;') +
    listSection('Action Items', actionItems, '#d97706', '&#9656;') +
    listSection('Open Questions', openQuestions, '#8b5cf6', '?') +
    listSection('Next Steps', nextSteps, '#10b981', '&rarr;') +
    listSection('Risks', risks, '#ef4444', '&#9888;') +
    listSection('Suggestions', suggestions, '#0891b2', '&#9788;') +
    strengthsHtml + improvementsHtml + findingsHtml +
    '<div style="margin-top:34px;padding-top:24px;border-top:1px solid #e2e8f0;text-align:center;">' +
      '<a href="'+portalUrl+'" style="background:#1a1a2e;color:#fff;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">View Full Report &rarr;</a>' +
      '<p style="color:#94a3b8;font-size:12px;margin:14px 0 0;">Open the portal for the full transcript and historical trends.</p>' +
    '</div>' +
  '</div>' +
  '<div style="padding:18px 36px;text-align:center;">' +
    '<p style="color:#94a3b8;font-size:11px;margin:0;">'+keyPoints.length+' key points &middot; '+actionItems.length+' action items &middot; '+decisions.length+' decisions &middot; '+findings.length+' rule findings</p>' +
  '</div>' +
'</div>';

return [{ json: {
  to: 'muhammadammaralibhutta@gmail.com',
  subject: 'Call Analysis: ' + humanize(callType) + ' &mdash; ' + (safe.overall_score !== null && safe.overall_score !== undefined ? safe.overall_score+'/10' : (actionItems.length + ' action items')),
  html: html,
  portal_url: portalUrl,
  call_id: callId
} }];"""

# === 4. Update Get Final Scorecard to embed scorecard_evidence ===
for node in wf['nodes']:
    if node['name'] == 'Get Final Scorecard':
        # Find and update the select param
        for p in node['parameters']['queryParameters']['parameters']:
            if p['name'] == 'select':
                p['value'] = '*,scorecard_evidence(*)'
        print('Updated Get Final Scorecard select to embed scorecard_evidence')
    if node['name'] == 'Score with Groq':
        node['parameters']['jsonBody'] = NEW_SCORE_BODY
        print('Upgraded Score with Groq prompt for full intelligence')
    if node['name'] == 'Parse Scorecard':
        node['parameters']['jsCode'] = PARSE_SCORECARD_JS
        print('Upgraded Parse Scorecard to extract all sections')
    if node['name'] == 'Build Email List':
        node['parameters']['jsCode'] = BUILD_EMAIL_JS
        print('Upgraded Build Email List with all sections')

with open(WORKFLOW_PATH, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print('Saved local workflow.')

for k in ['active', 'versionId', 'id']: wf.pop(k, None)
try:
    urllib.request.urlopen(urllib.request.Request(
        f'https://n8nserver.metaviz.pro/api/v1/workflows/{WF_ID}/deactivate',
        data=b'{}', method='POST',
        headers={'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_KEY}))
except Exception:
    pass
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

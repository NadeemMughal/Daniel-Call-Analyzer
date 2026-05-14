import os
#!/usr/bin/env python3
"""Update master pipeline: add Get Rule Findings, beef up email template, improve Score prompt."""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
N8N_KEY = os.environ.get("N8N_API_KEY", "")
SVC_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
WF_ID = 'Z1WdzpBv7u1DjB2L'

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

# --- 1. Add Get Rule Findings node ---
get_findings_node = {
    "id": "master-0036",
    "name": "Get Rule Findings",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4,
    "position": [4500, 500],
    "alwaysOutputData": True,
    "parameters": {
        "method": "GET",
        "url": "https://fybvnwidpnxnouaukrnb.supabase.co/rest/v1/rule_findings",
        "sendQuery": True,
        "queryParameters": {
            "parameters": [
                {"name": "call_id", "value": "=eq.{{ $('Parse Classification').first().json.call_id }}"},
                {"name": "select", "value": "*"},
                {"name": "order", "value": "severity.asc"}
            ]
        },
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {"name": "apikey", "value": SVC_KEY},
                {"name": "Authorization", "value": f"Bearer {SVC_KEY}"}
            ]
        },
        "options": {}
    }
}
existing_ids = {n['id'] for n in wf['nodes']}
if 'master-0036' not in existing_ids:
    wf['nodes'].append(get_findings_node)
    print('Added Get Rule Findings node')
else:
    for i, n in enumerate(wf['nodes']):
        if n['id'] == 'master-0036':
            wf['nodes'][i] = get_findings_node
    print('Replaced existing Get Rule Findings node')

# Rewire: Get Final Scorecard -> Get Rule Findings -> Build Email List
wf['connections']['Get Final Scorecard']['main'] = [[{"node": "Get Rule Findings", "type": "main", "index": 0}]]
wf['connections']['Get Rule Findings'] = {"main": [[{"node": "Build Email List", "type": "main", "index": 0}]]}

# --- 2. Beef up Build Email List ---
BUILD_EMAIL_JS = r"""const scorecardRes = $('Get Final Scorecard').first().json;
const scorecard = Array.isArray(scorecardRes) ? scorecardRes[0] : scorecardRes;
const callId = $('Parse Classification').first().json.call_id;
const callType = $('Parse Classification').first().json.call_type;
const portalUrl = 'http://localhost:5173/calls/' + callId;
const safe = scorecard || { overall_score: null, summary: 'No scorecard generated.', strengths: [], improvements: [] };

function humanize(key) {
  if (!key) return '';
  return String(key).split('_').map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ');
}
function scoreColor(s) {
  if (s === null || s === undefined) return '#64748b';
  if (s >= 8) return '#16a34a';
  if (s >= 6) return '#3b82f6';
  if (s >= 4) return '#d97706';
  return '#dc2626';
}
function sevColors(sev) {
  if (sev === 'critical') return { bg: '#fee2e2', fg: '#991b1b', label: 'CRITICAL' };
  if (sev === 'warning') return { bg: '#fef3c7', fg: '#92400e', label: 'WARNING' };
  return { bg: '#dbeafe', fg: '#1e40af', label: 'INFO' };
}

const findingsRaw = $('Get Rule Findings').all() || [];
const findings = findingsRaw
  .map(function(f){return f.json;})
  .filter(function(f){return f && f.rule_key;})
  .sort(function(a, b){ const order = { critical: 0, warning: 1, info: 2 }; return (order[a.severity] || 9) - (order[b.severity] || 9); });

const strengths = (safe.strengths || []).slice(0, 5);
const improvements = (safe.improvements || []).slice(0, 5);

function criterionRow(item) {
  const label = humanize(item.criterion || '');
  const score = (typeof item.score === 'number') ? item.score : null;
  const sc = scoreColor(score);
  const scoreText = score !== null ? score + '/10' : '';
  const desc = item.description || '';
  const quote = item.evidence_quote || '';
  return '<tr><td style="padding:14px 0;border-bottom:1px solid #f1f5f9;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<span style="font-weight:600;color:#1a1a2e;font-size:14px;">' + label + '</span>' +
      (score !== null ? '<span style="background:' + sc + ';color:#fff;font-weight:700;font-size:12px;padding:3px 11px;border-radius:12px;">' + scoreText + '</span>' : '') +
    '</div>' +
    '<div style="color:#475569;font-size:13px;line-height:1.55;margin-bottom:6px;">' + desc + '</div>' +
    (quote ? '<div style="background:#f8fafc;border-left:3px solid #cbd5e1;padding:9px 13px;margin-top:8px;color:#475569;font-size:12px;font-style:italic;">&ldquo;' + quote.substring(0, 240) + (quote.length > 240 ? '&hellip;' : '') + '&rdquo;</div>' : '') +
  '</td></tr>';
}

const strengthsHtml = strengths.length === 0 ? '' :
  '<h2 style="color:#16a34a;font-size:13px;margin:28px 0 4px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">What worked</h2>' +
  '<table style="width:100%;border-collapse:collapse;">' + strengths.map(criterionRow).join('') + '</table>';

const improvementsHtml = improvements.length === 0 ? '' :
  '<h2 style="color:#d97706;font-size:13px;margin:28px 0 4px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Coach on this next time</h2>' +
  '<table style="width:100%;border-collapse:collapse;">' + improvements.map(criterionRow).join('') + '</table>';

const findingsHtml = findings.length === 0 ? '' :
  '<h2 style="color:#1a1a2e;font-size:13px;margin:28px 0 12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Rule findings (' + findings.length + ')</h2>' +
  findings.slice(0, 8).map(function(f){
    const sev = sevColors(f.severity);
    const v = f.value || {};
    const suggestion = v.suggestion || '';
    return '<div style="background:#fff;border:1px solid #e2e8f0;border-left:4px solid ' + sev.fg + ';border-radius:6px;padding:13px 15px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '<span style="background:' + sev.bg + ';color:' + sev.fg + ';font-weight:700;font-size:10px;padding:3px 9px;border-radius:10px;letter-spacing:0.06em;">' + sev.label + '</span>' +
        '<span style="font-weight:600;color:#1a1a2e;font-size:13px;">' + humanize(f.rule_key) + '</span>' +
      '</div>' +
      '<div style="color:#475569;font-size:13px;line-height:1.55;">' + suggestion + '</div>' +
    '</div>';
  }).join('');

const scoreBoxColor = scoreColor(safe.overall_score);
const overallScoreHtml = safe.overall_score !== null && safe.overall_score !== undefined
  ? '<div style="font-size:48px;font-weight:800;color:#1a1a2e;line-height:1;">' + safe.overall_score + '<span style="font-size:20px;color:#64748b;font-weight:500;"> / 10</span></div>' +
    '<div style="color:#64748b;font-size:11px;margin-top:6px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Overall call score</div>'
  : '<div style="font-size:26px;font-weight:700;color:#1a1a2e;">Meeting Summary</div>' +
    '<div style="color:#64748b;font-size:12px;margin-top:4px;">Internal team call</div>';

const html = '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f8fafc;padding:24px 0;">' +
  '<div style="background:#1a1a2e;padding:30px 36px;border-radius:14px 14px 0 0;">' +
    '<h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;">WeBuildTrades Call Analyzer</h1>' +
    '<p style="color:#94a3b8;margin:6px 0 0;font-size:13px;">Automated coaching feedback &middot; ' + humanize(callType) + ' call</p>' +
  '</div>' +
  '<div style="background:#fff;padding:34px 36px;border:1px solid #e2e8f0;border-top:0;">' +
    '<p style="color:#334155;font-size:15px;margin:0 0 22px;">Hi Admin,</p>' +
    '<div style="background:#f1f5f9;border-left:4px solid ' + scoreBoxColor + ';padding:20px 26px;border-radius:0 8px 8px 0;margin-bottom:26px;">' +
      overallScoreHtml +
    '</div>' +
    '<p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Summary</p>' +
    '<p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 8px;">' + (safe.summary || 'No summary available.') + '</p>' +
    strengthsHtml + improvementsHtml + findingsHtml +
    '<div style="margin-top:34px;padding-top:24px;border-top:1px solid #e2e8f0;text-align:center;">' +
      '<a href="' + portalUrl + '" style="background:#1a1a2e;color:#fff;padding:14px 40px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">View Full Report &rarr;</a>' +
      '<p style="color:#94a3b8;font-size:12px;margin:14px 0 0;">Open the portal for the full transcript, evidence quotes, and trend history.</p>' +
    '</div>' +
  '</div>' +
  '<div style="padding:18px 36px;text-align:center;">' +
    '<p style="color:#94a3b8;font-size:11px;margin:0;">Generated by WeBuildTrades Call Analyzer &middot; ' + findings.length + ' rule findings &middot; ' + (strengths.length + improvements.length) + ' criteria scored</p>' +
  '</div>' +
'</div>';

return [{ json: {
  to: 'muhammadammaralibhutta@gmail.com',
  subject: 'Call Scorecard: ' + humanize(callType) + ' — ' + (safe.overall_score !== null && safe.overall_score !== undefined ? safe.overall_score + '/10' : 'Meeting Summary'),
  html: html,
  portal_url: portalUrl,
  call_id: callId
} }];"""

for node in wf['nodes']:
    if node['name'] == 'Build Email List':
        node['parameters']['jsCode'] = BUILD_EMAIL_JS
        print('Updated Build Email List')
    if node['name'] == 'Send Email':
        node['parameters']['sendTo'] = '={{ $json.to }}'
        node['parameters']['subject'] = '={{ $json.subject }}'
        node['parameters']['message'] = '={{ $json.html }}'
        print('Updated Send Email to use prebuilt subject + html')
    if node['name'] == 'Score with Groq':
        node['parameters']['jsonBody'] = "={{ JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 4000, messages: [ { role: 'system', content: 'You are an expert sales coach for WeBuildTrades, a UK marketing agency for trade businesses. Score the rep against the rubric. Be SPECIFIC and ACTIONABLE - never write generic praise. Every strength and improvement MUST include an exact transcript quote and a concrete next-call action embedded in the description. Return ONLY valid JSON with these keys: overall_score (number 0 to 10), summary (2-3 sentence performance summary), strengths (array of objects), improvements (array of objects). Score 5 criteria total: talk_ratio, question_stack, pain_surfacing, objection_handling, solution_timing. Each criterion object has keys: criterion (string snake_case), score (number 0 to 10), description (2-3 sentences specific to THIS call - say what happened, why it matters, and what to do next time - never generic), evidence_quote (exact 1-2 sentence quote from transcript), timestamp_seconds (number or null). Rubric: ' + JSON.stringify($('Get Active Rubric').first().json.content) }, { role: 'user', content: 'Score this call. Be specific. Use exact transcript quotes. Transcript: ' + ($('Get Call Data').first().json.transcript_raw || 'No transcript available.') } ] }) }}"
        print('Improved Score prompt')

with open(WORKFLOW_PATH, 'w', encoding='utf-8') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print('Saved local.')

# Push to n8n
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

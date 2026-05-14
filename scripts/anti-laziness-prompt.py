import os
#!/usr/bin/env python3
"""Aggressive anti-laziness prompt: force the LLM to be exhaustive, quote-anchored, dept-aware.
Replaces the previous Meeting Summary prompt with explicit rules that target Llama's shortcut tendencies."""
import json
import urllib.request

WORKFLOW_PATH = 'n8n/workflows/00-master-pipeline.json'
WF_ID = 'Z1WdzpBv7u1DjB2L'
N8N_KEY = os.environ.get("N8N_API_KEY", "")

with open(WORKFLOW_PATH, 'r', encoding='utf-8') as f:
    wf = json.load(f)

# Aggressive anti-laziness system prompt for Meeting Summary
MEETING_SYS = (
    "You are extracting structured business intelligence from a meeting transcript. "
    "Your job is COMPLETENESS, not summarization. Be exhaustive. "
    ""
    "CRITICAL RULES - VIOLATING ANY OF THESE PRODUCES UNUSABLE OUTPUT: "
    "1. EXTRACT EVERYTHING. If the transcript has 12 action items, list ALL 12. Do NOT consolidate similar items. Do NOT skip minor ones. Do NOT generalize. "
    "2. USE THE EXACT WORDS. Every action_item, decision, key_point MUST use phrasing from the transcript. NEVER write generic phrases like \\\"continue development\\\" or \\\"review and provide feedback\\\" - quote what was actually said. "
    "3. NAME REAL PEOPLE. Use the actual attendee names from the attendee list provided. NEVER invent roles like \\\"Senior Meeting Analyst\\\". Use the role you can infer from the transcript (e.g. Founder, AI Lead, Sales Manager, Operations). If unsure, use \\\"Team Member\\\". "
    "4. ASSIGN DEPARTMENTS CORRECTLY by keyword: "
    "   - sales / sales calls / prospects / leads / closing / proposal -> sales "
    "   - SEO / blog / website / search / Kool -> seo "
    "   - content / social media / video / Cameron / images / posts -> content "
    "   - finance / budget / revenue / cost -> finance "
    "   - operations / infrastructure / apps / Zain / AI projects / automation -> ops "
    "   - strategy / pause WeBuildTrades / vision / business model / Daniel-led decisions -> executive "
    "5. NO SHORTCUTS. If you find yourself writing \\\"continue\\\" or \\\"review\\\" or \\\"explore\\\" - STOP and re-read the transcript for the specific action mentioned. "
    "6. RISKS must be from the transcript. Do NOT invent generic risks like \\\"may not deliver on time\\\". Only include risks that someone in the call actually raised. "
    "7. BANNED PHRASES must be ACTUAL occurrences in the transcript. Search for: mate, basically, essentially, obviously, you know, sort of, kind of, honestly, literally, um, uh. List each one ACTUALLY USED (not the rule description). "
    ""
    "Return ONLY valid JSON with these keys: "
    "meeting_title (specific 5-10 word title naming the actual subject), "
    "one_line_summary (one clear sentence of the main outcome), "
    "executive_summary (5-8 sentences of flowing prose: who attended, topics covered in order, what was decided and by whom, what the outcome was, what happens next), "
    "meeting_outcome (1-2 sentences explicitly describing what CHANGED because of this meeting - what is the team going to do that they were not before), "
    "host_department (one of: executive, sales, seo, ops, finance, content), "
    "attendees (array of {name, role, is_internal} - use real names from attendee list), "
    "key_points (array of 8-15+ specific topics actually discussed - quote the substance), "
    "projects_discussed (array of {name, status (delivered|in_progress|paused|proposed|blocked), owner, department (use the dept rule above), summary (1-2 sentences of what was said about it), next_action}), "
    "decisions_made (array of {decision, decided_by, context, impact} - extract EVERY decision, including small ones), "
    "action_items (array of {task, owner, due, priority (high|medium|low), context} - quote-anchored. If 12 actions in transcript, return 12 entries), "
    "open_questions (array of strings - questions raised but not resolved), "
    "next_steps (array of strings - concrete things to happen after this meeting), "
    "risks (array of {risk, severity (high|medium|low), area} - only ACTUAL risks raised, not generic), "
    "suggestions (array of {suggestion, suggested_by, value}), "
    "banned_phrases_observed (array of strings - each ACTUAL usage in the transcript, formatted as \\\"<phrase> (<context fragment>)\\\")"
)

NEW_MEETING_BODY = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 8000, "
    "messages: [ "
    "{ role: 'system', content: '" + MEETING_SYS.replace("'", "\\'") + "' }, "
    "{ role: 'user', content: 'Attendees:\\n' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\n\\nDuration: ' + (($('Verify HMAC').first().json.body.duration) || 0) + ' seconds\\n\\nFULL TRANSCRIPT (read every line, extract EVERYTHING actionable):\\n\\n' + "
    "(($('Verify HMAC').first().json.body.transcript || {}).full_transcript || 'No transcript.') + "
    "'\\n\\n---\\nReminder: EXTRACT EVERYTHING. No summarization. Quote-anchored.' } "
    "] }) }}"
)

# Score prompt - same anti-laziness rules
SCORE_SYS = (
    "You are coaching a sales rep at WeBuildTrades. Score them against the rubric using EXACT transcript quotes. "
    "Be exhaustive: extract every action, decision, risk, and suggestion. Use real names. Quote-anchored. "
    ""
    "CRITICAL: Every claim must cite a real transcript quote. Never paraphrase or consolidate. "
    "Never write generic feedback like \\\"could improve\\\" - cite specific moments. "
    ""
    "Return ONLY valid JSON: "
    "meeting_title (5-10 words), "
    "overall_score (number 0-10), "
    "summary (1 sentence), "
    "executive_summary (5-8 sentence narrative), "
    "meeting_outcome (1-2 sentences: what concretely changed - did the deal advance, follow-up booked, prospect more or less likely to buy), "
    "host_department (one of: sales for client calls), "
    "attendees (array of {name, role, is_internal}), "
    "key_points (array of strings - actual topics), "
    "projects_discussed (array of {name, status, owner, department, summary, next_action}), "
    "strengths (array of {criterion, score 0-10, description (specific moment), evidence_quote (exact)}), "
    "improvements (array of {criterion, score 0-10, description (specific issue + concrete next-time action), evidence_quote (exact)}), "
    "action_items (array of {task (quoted/near-quoted), owner, due, priority, context}), "
    "decisions_made (array of {decision, decided_by, context, impact}), "
    "open_questions (array of strings), "
    "next_steps (array of strings), "
    "risks (array of {risk, severity, area}), "
    "suggestions (array of {suggestion, suggested_by, value}), "
    "banned_phrases_observed (array of strings - actual usages from this rep, formatted: \\\"phrase (count: N, context: ...)\\\"). "
    "Rubric: "
)

NEW_SCORE_BODY = (
    "={{ JSON.stringify({ "
    "model: 'llama-3.3-70b-versatile', "
    "max_tokens: 8000, "
    "messages: [ "
    "{ role: 'system', content: '" + SCORE_SYS.replace("'", "\\'") + "' + JSON.stringify($('Get Active Rubric').first().json.content) }, "
    "{ role: 'user', content: 'Attendees:\\n' + JSON.stringify((($('Verify HMAC').first().json.body.attendees) || []).map(function(a){return {name:a.name, email:a.email};})) + "
    "'\\nCall type: ' + ($('Parse Classification').first().json.call_type || 'unknown') + "
    "'\\n\\nFULL TRANSCRIPT (extract EVERYTHING - quote-anchored):\\n\\n' + "
    "($('Get Call Data').first().json.transcript_raw || 'No transcript.') } "
    "] }) }}"
)

for node in wf['nodes']:
    if node['name'] == 'Generate Meeting Summary':
        node['parameters']['jsonBody'] = NEW_MEETING_BODY
        print('Anti-laziness Meeting Summary prompt installed')
    if node['name'] == 'Generate Meeting Summary (8B)':
        node['parameters']['jsonBody'] = NEW_MEETING_BODY.replace("'llama-3.3-70b-versatile'", "'llama-3.1-8b-instant'")
        print('Anti-laziness 8B fallback updated')
    if node['name'] == 'Score with Groq':
        node['parameters']['jsonBody'] = NEW_SCORE_BODY
        print('Anti-laziness Score prompt installed')

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

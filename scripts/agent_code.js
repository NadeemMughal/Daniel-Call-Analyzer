const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set in n8n environment variables');
const SUPABASE_URL = 'https://fybvnwidpnxnouaukrnb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnZud2lkcG54bm91YXVrcm5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA2NjM2NSwiZXhwIjoyMDkzNjQyMzY1fQ.sCP7tiT6_Pc_nME6HqmfH5PUZjaNzrfl45R8JK6Ay4c';

async function callAnthropic(messages, system, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens || 4000, system, messages }),
  });
  if (!res.ok) throw new Error('Anthropic error ' + res.status + ': ' + (await res.text()).substring(0, 200));
  const data = await res.json();
  return data.content[0].text;
}

async function sbFetch(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
  });
  return res.json();
}

const { systemPrompt, userMessage } = $input.first().json;

// Turn 1: Identify rep and key moments
const turn1Raw = await callAnthropic(
  [{ role: 'user', content: 'From this call transcript, identify the internal sales rep first name and the 3 most critical moments that will determine call quality. Do NOT score yet. Respond with ONLY raw JSON, no markdown: {"rep_name":"string","key_moments":["string","string","string"]}\n\n' + userMessage }],
  'You analyze sales call transcripts. Return only raw JSON.',
  600
);
let repName = '';
let keyMoments = [];
try {
  const clean1 = turn1Raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const t1 = JSON.parse(clean1);
  repName = (t1.rep_name || '').trim();
  keyMoments = Array.isArray(t1.key_moments) ? t1.key_moments : [];
} catch(e) {}

// Fetch rep history from Supabase
let repHistorySummary = 'No previous call history available.';
if (repName) {
  try {
    const members = await sbFetch('team_members?name=ilike.*' + encodeURIComponent(repName) + '*&select=id,name&limit=1');
    if (Array.isArray(members) && members[0]) {
      const memberId = members[0].id;
      const parts = await sbFetch('call_participants?team_member_id=eq.' + memberId + '&is_external=eq.false&select=calls(recorded_at,scorecards(overall_score,summary))&order=created_at.desc&limit=5');
      const history = (Array.isArray(parts) ? parts : [])
        .map(p => p.calls)
        .filter(c => c && c.scorecards && c.scorecards[0] != null && c.scorecards[0].overall_score != null)
        .map(c => '- ' + (c.recorded_at || '').substring(0, 10) + ': ' + c.scorecards[0].overall_score + '/10 — ' + (c.scorecards[0].summary || '').split('.')[0]);
      if (history.length > 0) repHistorySummary = members[0].name + "'s last " + history.length + ' scored calls:\n' + history.join('\n');
    }
  } catch(e) {}
}

// Turn 2: Contextual scoring with history
const turn2UserMsg = userMessage +
  '\n\n--- REP HISTORY ---\n' + repHistorySummary +
  '\n\n--- KEY MOMENTS ---\n' + keyMoments.map((m, i) => (i + 1) + '. ' + m).join('\n') +
  '\n\nNow score this call. Also add to your JSON: "rep_trajectory" (improving/declining/stable based on history) and "comparison_note" (one sentence vs baseline).';

const turn2Raw = await callAnthropic(
  [{ role: 'user', content: turn2UserMsg }],
  systemPrompt,
  4000
);

// Turn 3: Coaching synthesis
const turn3Raw = await callAnthropic(
  [
    { role: 'user', content: turn2UserMsg },
    { role: 'assistant', content: turn2Raw },
    { role: 'user', content: 'Provide a coaching synthesis as raw JSON only: {"manager_summary":"2-sentence manager summary","positive_reinforcement":"one specific strength to reinforce"}' }
  ],
  'You are a sales coaching assistant. Return only raw JSON.',
  500
);

// Merge Turn 3 into Turn 2 scorecard JSON
let cleanFinal = turn2Raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
try {
  const sc = JSON.parse(cleanFinal);
  try {
    const t3 = JSON.parse(turn3Raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim());
    if (t3.manager_summary) sc.manager_summary = t3.manager_summary;
    if (t3.positive_reinforcement) sc.positive_reinforcement = t3.positive_reinforcement;
  } catch(e) {}
  cleanFinal = JSON.stringify(sc);
} catch(e) {}

return [{ json: { text: cleanFinal } }];

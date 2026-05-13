const SYSTEM_PROMPT = `You are a rubric design consultant for WeBuildTrades. When a user wants to add, edit, or remove a scoring criterion from the sales rubric, help them define it precisely.

A good rubric criterion has:
1. A clear key (snake_case, under 5 words)
2. A display name
3. A weight (0–100; all weights across all criteria must sum to 100)
4. A scoring guide describing exactly what 0, 5, and 10 look like on this criterion
5. Example evidence phrases heard in a call at low vs high score levels

Check: does this new criterion overlap with any existing ones? If weights would exceed 100 after adding, flag it.

Return ONLY valid JSON. No markdown. No explanation outside the JSON.

If adding/editing a criterion, return:
{
  "action": "upsert",
  "criterion": {
    "key": "snake_case_key",
    "name": "Display Name",
    "weight": 10,
    "description": "What this criterion measures in one sentence",
    "scoring_guide": { "0": "...", "5": "...", "10": "..." },
    "example_evidence": { "low": "...", "high": "..." }
  },
  "weight_warning": null
}

If removing a criterion, return:
{ "action": "remove", "key": "criterion_key_to_remove" }

If there is a weight conflict, set "weight_warning" to a string explaining the issue.`;

export async function assistRubricEdit(
  currentCriteria: unknown[],
  userRequest: string
): Promise<unknown> {
  const userPrompt =
    `Current rubric criteria:\n${JSON.stringify(currentCriteria, null, 2)}\n\n` +
    `User request: ${userRequest}\n\n` +
    `Return only the JSON.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim() ?? '{}';
  return JSON.parse(content);
}

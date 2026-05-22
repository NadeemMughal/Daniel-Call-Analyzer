import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, unauthorized, forbidden } from '@/lib/auth'

const SYSTEM_PROMPT = `You are a rubric design consultant for WeBuildTrades. When a user wants to add, edit, or remove a scoring criterion from the sales rubric, help them define it precisely.

A good rubric criterion has:
1. A clear key (snake_case, under 5 words)
2. A display name
3. A weight (0–100; all weights across all criteria must sum to 100)
4. A scoring guide describing exactly what 0, 5, and 10 look like on this criterion
5. Example evidence phrases heard in a call at low vs high score levels

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
{ "action": "remove", "key": "criterion_key_to_remove" }`

export async function OPTIONS() { return new Response(null, { status: 204 }) }

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden('Admin access required')

  const { current_criteria, user_request } = await req.json()
  if (!user_request || typeof user_request !== 'string') {
    return NextResponse.json({ error: 'user_request string is required' }, { status: 400 })
  }

  const userPrompt = `Current rubric criteria:\n${JSON.stringify(current_criteria ?? [], null, 2)}\n\nUser request: ${user_request}\n\nReturn only the JSON.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) throw new Error(`Anthropic error ${response.status}`)
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const suggestion = JSON.parse(data.content?.[0]?.text?.trim() ?? '{}')
  return NextResponse.json({ suggestion })
}

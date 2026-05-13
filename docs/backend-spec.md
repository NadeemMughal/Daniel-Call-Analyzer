# Backend Service Spec (Phase C — for when Anthropic API key arrives)

## Why

The current pipeline lives in n8n. That worked for the prototype but has cost us roughly half the development time to escape-character bugs, expression-evaluator quirks, missing error visibility, and Groq's rate limits. At ~50 calls/day in production, ~10 will silently fail because n8n's error reporting is opaque.

Moving the analysis into a real Node.js backend service achieves four things:

1. **Typed, validated outputs** — Zod schemas catch malformed LLM responses with a useful error, not "Unknown error [line 14]"
2. **Structured logging** — every failure goes to a file we can grep, plus to the `failed_executions` table
3. **Better model** — Anthropic Claude Sonnet 4.6 follows instructions far better than Groq Llama 70B; one Sonnet call replaces three Groq calls
4. **n8n shrinks to a thin webhook receiver** — three nodes: receive Fathom payload, POST to `/api/analyze`, respond 200

When Daniel's Anthropic key arrives, this is the plan.

---

## Architecture

```
[Fathom call.completed webhook]
            │
            ▼
   ┌────────────────────────────┐
   │ n8n: thin forwarder        │
   │   Webhook → POST backend → │
   │   Respond 200              │
   └────────────────────────────┘
            │ POST /api/analyze { call_id, fathom_payload }
            ▼
   ┌────────────────────────────────────────┐
   │ backend/ (Node + Express + TS)         │
   │                                        │
   │   1. Validate Fathom payload (Zod)     │
   │   2. Upsert calls row                  │
   │   3. Classify (Claude Haiku)           │
   │   4. Analyze (Claude Sonnet)           │
   │      ↳ single call returns everything: │
   │        title · summary · projects ·    │
   │        decisions · actions · risks ·   │
   │        scorecard · banned phrases      │
   │   5. Validate output (Zod)             │
   │   6. Write scorecards + evidence       │
   │   7. Send Gmail email                  │
   │   8. Log failure to failed_executions  │
   └────────────────────────────────────────┘
            │
            ▼
        Supabase (unchanged schema)
            │
            ▼
        Web portal (unchanged)
```

---

## Module layout

```
backend/
├── package.json
├── tsconfig.json
├── .env                          (gitignored)
├── src/
│   ├── server.ts                 Express bootstrap, mounts routes
│   ├── routes/
│   │   ├── analyze.ts            POST /api/analyze - the main orchestrator
│   │   └── health.ts             GET /health
│   ├── services/
│   │   ├── anthropic.ts          Wrapped SDK client, retries, logging
│   │   ├── classification.ts     Claude Haiku 4.5 - returns CallType
│   │   ├── analysis.ts           Claude Sonnet 4.6 - returns full Analysis
│   │   ├── ruleEngine.ts         Pure JS - banned words, fillers, talk ratio
│   │   ├── email.ts              Gmail OAuth2 (or Nodemailer with SMTP)
│   │   └── failedExecutions.ts   Write to Supabase failed_executions
│   ├── db/
│   │   └── supabase.ts           Service-role client + typed helpers
│   ├── schemas/
│   │   ├── fathomPayload.ts      Zod schema for incoming Fathom body
│   │   ├── analysis.ts           Zod for Claude analysis output (the strict shape)
│   │   └── classification.ts     Zod for Haiku classification output
│   ├── lib/
│   │   ├── logger.ts             Pino instance
│   │   └── env.ts                Zod-validated env vars
│   └── prompts/
│       ├── classifier.ts         System prompt for Haiku
│       └── analyzer.ts           System prompt for Sonnet
└── README.md                     How to run + deploy
```

---

## Key implementation notes

### `src/schemas/analysis.ts` — the source of truth

```typescript
import { z } from 'zod'

export const CallTypeEnum = z.enum([
  'discovery', 'ads_intro', 'launch', 'follow_up', 'team', 'other'
])

export const DepartmentEnum = z.enum([
  'executive', 'sales', 'seo', 'ops', 'finance', 'content', 'ai'
])

export const ProjectSchema = z.object({
  name: z.string(),
  status: z.enum(['delivered', 'in_progress', 'paused', 'proposed', 'blocked']),
  owner: z.string().optional(),
  department: DepartmentEnum.optional(),
  summary: z.string(),
  next_action: z.string().optional(),
})

export const ActionItemSchema = z.object({
  task: z.string(),
  owner: z.string().optional(),
  due: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']),
  context: z.string().optional(),
})

export const DecisionSchema = z.object({
  decision: z.string(),
  decided_by: z.string().optional(),
  context: z.string().optional(),
  impact: z.string().optional(),
})

export const RiskSchema = z.object({
  risk: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  area: z.string().optional(),
})

export const AttendeeSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  is_internal: z.boolean(),
})

export const CriterionScoreSchema = z.object({
  criterion: z.string(),
  score: z.number().min(0).max(10),
  description: z.string(),
  evidence_quote: z.string(),
  timestamp_seconds: z.number().nullable().optional(),
})

export const AnalysisSchema = z.object({
  meeting_title: z.string(),
  one_line_summary: z.string(),
  executive_summary: z.string(),
  meeting_outcome: z.string(),
  call_type: CallTypeEnum,
  host_department: DepartmentEnum,
  attendees: z.array(AttendeeSchema),
  key_points: z.array(z.string()),
  projects_discussed: z.array(ProjectSchema),
  decisions_made: z.array(DecisionSchema),
  action_items: z.array(ActionItemSchema),
  open_questions: z.array(z.string()),
  next_steps: z.array(z.string()),
  risks: z.array(RiskSchema),
  suggestions: z.array(z.object({
    suggestion: z.string(),
    suggested_by: z.string().optional(),
    value: z.string().optional(),
  })),
  banned_phrases_observed: z.array(z.string()),
  // Sales-only fields:
  overall_score: z.number().min(0).max(10).nullable(),
  strengths: z.array(CriterionScoreSchema),
  improvements: z.array(CriterionScoreSchema),
})

export type Analysis = z.infer<typeof AnalysisSchema>
```

### `src/services/analysis.ts` — the single LLM call

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { AnalysisSchema, type Analysis } from '../schemas/analysis'
import { logger } from '../lib/logger'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function analyzeCall(args: {
  transcript: string
  attendees: { name: string; email: string }[]
  durationSeconds: number
  rubric: any
}): Promise<Analysis> {
  const system = buildSystemPrompt(args.rubric)
  const user = buildUserPrompt(args)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 6000,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('\n')

  // Strip code fences if present (Claude rarely does this, but be safe)
  let json = text.trim()
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    logger.error({ raw: text.slice(0, 500) }, 'JSON parse failed')
    throw new Error(`Claude returned non-JSON: ${text.slice(0, 200)}`)
  }

  // Zod validation - catches every schema violation with a clear error
  const result = AnalysisSchema.safeParse(parsed)
  if (!result.success) {
    logger.error({ issues: result.error.issues, raw: parsed }, 'Schema mismatch')
    throw new Error(`Analysis schema mismatch: ${result.error.issues[0]?.message}`)
  }

  return result.data
}
```

### `src/routes/analyze.ts` — the orchestrator

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../db/supabase'
import { classify } from '../services/classification'
import { analyzeCall } from '../services/analysis'
import { runRuleEngine } from '../services/ruleEngine'
import { sendEmail } from '../services/email'
import { logFailure } from '../services/failedExecutions'
import { FathomPayloadSchema } from '../schemas/fathomPayload'
import { logger } from '../lib/logger'

const RequestSchema = z.object({
  call_id: z.string().uuid().optional(),
  fathom_payload: FathomPayloadSchema,
})

export const analyzeRouter = Router()

analyzeRouter.post('/analyze', async (req, res) => {
  const parsed = RequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payload', issues: parsed.error.issues })
  }
  const { fathom_payload } = parsed.data

  try {
    // 1. Upsert call row
    const { data: callRow, error: upsertErr } = await supabase
      .from('calls')
      .upsert({
        source: 'fathom',
        source_id: fathom_payload.id,
        status: 'pending',
        transcript_raw: fathom_payload.transcript.full_transcript,
        transcript_segments: fathom_payload.transcript.segments,
        audio_url: fathom_payload.recording_url,
        recorded_at: fathom_payload.start_time,
        duration_seconds: fathom_payload.duration,
      }, { onConflict: 'source_id' })
      .select()
      .single()
    if (upsertErr) throw upsertErr

    // 2. Get active rubric
    const { data: rubric } = await supabase
      .from('rubrics')
      .select('*')
      .eq('is_active', true)
      .single()

    // 3. Classify (cheap Haiku call, parallel with rule engine)
    const [classification, ruleFindings] = await Promise.all([
      classify({
        attendees: fathom_payload.attendees ?? [],
        transcriptHead: fathom_payload.transcript.full_transcript.slice(0, 2000),
      }),
      runRuleEngine({
        transcriptSegments: fathom_payload.transcript.segments,
        duration: fathom_payload.duration,
        rubric: rubric.content,
      }),
    ])

    // 4. Single Sonnet call for everything
    const analysis = await analyzeCall({
      transcript: fathom_payload.transcript.full_transcript,
      attendees: fathom_payload.attendees ?? [],
      durationSeconds: fathom_payload.duration,
      rubric: rubric.content,
    })

    // 5. Write back to Supabase (in a single Promise.all)
    const departmentId = await resolveDepartment(analysis.host_department)
    await Promise.all([
      supabase.from('calls').update({
        call_type: classification.call_type,
        status: 'scored',
        department_id: departmentId,
      }).eq('id', callRow.id),
      writeScorecard(callRow.id, analysis),
      writeRuleFindings(callRow.id, ruleFindings),
    ])

    // 6. Email (non-fatal)
    sendEmail({ analysis, callId: callRow.id }).catch(err => {
      logger.warn({ err }, 'Email send failed')
    })

    res.status(200).json({ ok: true, call_id: callRow.id, call_type: classification.call_type })
  } catch (err) {
    logger.error({ err, fathom_id: fathom_payload.id }, 'Analysis failed')
    await logFailure({
      workflow_name: 'backend/analyze',
      error_message: err instanceof Error ? err.message : String(err),
      error_stack: err instanceof Error ? err.stack : null,
      payload_excerpt: { fathom_id: fathom_payload.id },
    })
    res.status(500).json({ error: 'analysis failed' })
  }
})
```

### `.env.example` for the backend

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
SUPABASE_URL=https://fybvnwidpnxnouaukrnb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Gmail (if not relying on n8n for email)
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...

# Server
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
```

---

## Migration path (zero-downtime)

1. **Build backend** with all the modules above. Deploy to Railway/Render.
2. **Keep n8n master pipeline alive** in parallel. It still works.
3. **Add a single test webhook** in n8n that POSTs to `https://<backend>/api/analyze` with the same Fathom payload. Run side-by-side: both write to Supabase, both send emails.
4. **Diff the results** on a real call. The backend should produce richer, more accurate analysis (Sonnet > Llama 70B).
5. **Flip Fathom's webhook URL** to point at the backend (or to a thin n8n forwarder that calls the backend).
6. **Disable the master pipeline** in n8n once confident.
7. **Keep the error-handler workflow** (99) for any remaining n8n usage.

---

## Estimated effort when key arrives

| Task | Time |
|---|---|
| Scaffold backend/ (package.json, tsconfig, server) | 30 min |
| Zod schemas (Fathom payload + Analysis + Classification) | 1 h |
| Anthropic SDK wrapper + classification service | 1 h |
| Analysis service + prompt | 1.5 h |
| Rule engine (port from n8n Run Rules node JS) | 30 min |
| Supabase write helpers | 30 min |
| Email service (Gmail OAuth or Nodemailer) | 1 h |
| Express routes + error handling | 1 h |
| Testing with real payload | 1 h |
| Deploy to Railway | 30 min |
| **Total** | **~8 hours** of focused work |

---

## Out of scope (for now)

- Auth (rely on a simple backend-side API key for the Fathom→backend hop)
- Multi-tenant (Agency Disrupt) — separate effort once core works
- Live in-meeting suggestions — V2, needs Recall.ai bot
- Streaming responses — analysis is async via webhook anyway

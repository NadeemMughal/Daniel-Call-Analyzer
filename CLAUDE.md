# Call Analyzer — LLM Working Context

This file is the canonical context any LLM agent should load before doing work in this repo. Read it fully before answering anything beyond a trivial question.

---

## 1. What this project is

**Call Analyzer** is an AI sales-coaching system for **WeBuildTrades** (a UK-based marketing agency for trade businesses, run by Daniel Brown). It ingests recorded sales and team calls (from Fathom), analyzes them against Daniel's sales playbook, and produces per-call scorecards plus per-member coaching trends.

The system is part of a larger internal product called **Command HQ**, which WeBuildTrades intends to white-label and resell to other agencies under the brand **Agency Disrupt**.

### The "why" in one sentence
Daniel wants AI to act as the sales manager — giving every team member objective, consistent feedback after every call, so new hires (Ben, Ruben, Cole, Dom) can ramp without one-on-one coaching from Daniel or Jazz.

### Primary users
- **Sales reps** — view their own scorecards and trends
- **Managers** (Daniel, Jazz) — review team performance, audit calls
- **Eventually external agencies** — when this becomes part of Agency Disrupt

---

## 2. Source of truth: the playbook

Daniel's sales playbook IS the product. Treat it as first-class data, not as a hardcoded prompt.

Specific rules captured from the kickoff meeting (`Meeting Transcript.txt`, lines 411–417):

- **"Mate" is banned on first-meeting calls.** Reason: too friendly, removes authority/alpha position. ("You don't go to the doctor and have him say 'how are you, mate?'")
- **Filler words to count:** "um", "essentially", others to be added.
- **Talk-to-listen ratio matters.** A rep on a sales call should ask a question, shut up, listen, then dig deeper into the prospect's pain.
- **Question-stack pattern:** ask → listen → dig deeper → repeat. Only after pain is fully surfaced does the rep prescribe a solution.

These rules MUST live in the `rubrics` table and be editable from the UI. Do not bake them into prompts. The reasons:
1. Daniel will iterate on them.
2. Different Agency Disrupt customers will fork their own.
3. Rubric changes need to be A/B testable against historical calls.

---

## 3. Scope boundaries

### In scope for V1 (this repo, now)
- Ingest Fathom webhook on call completion
- Store transcript, audio reference, metadata in Supabase
- Classify call by **type** (discovery / ads_intro / launch / follow_up / team) and match to **client** (via LeadHub/GoHighLevel ID where possible)
- Run **deterministic rule engine** (banned words, filler counts, talk ratio)
- Run **LLM scorecard** against the active rubric
- Hierarchical browser: **Client → Department → Team Member → Calls**
- Per-call view with transcript, scorecard, quoted evidence
- Per-member trend dashboard

### Explicitly out of scope for V1
- Live in-meeting suggestions (V2 — will use Recall.ai bot)
- Proposal Generator (sibling Sales AI project, separate repo)
- Discovery Call Prep (paused — Jazz said it adds no value)
- Anything outside the post-call coaching loop

---

## 4. Tech stack and rationale

| Layer | Choice | Why |
|---|---|---|
| Workflow orchestration | **n8n** | Pipeline is async, multi-step, and frequently tweaked. n8n makes it inspectable and editable without redeploys. Daniel/Zain can see the flow. |
| Database + Auth + Storage | **Supabase** (Postgres + pgvector) | One service for relational data, vector search, auth, RLS, and file storage. Avoids 4 separate vendors. |
| Backend API | **Node.js + Express + TypeScript** | Thin layer between React and Supabase. Owns auth verification, aggregations, rubric CRUD, and n8n trigger calls. |
| Frontend | **React + Vite + TypeScript + Tailwind + shadcn/ui** | Matches the broader Command HQ frontend stack (per Naren). Reuse the design system. |
| LLM | **Anthropic Claude** — Sonnet 4.6 for scorecards, Haiku 4.5 for classification | Sonnet handles long transcripts and nuanced coaching; Haiku is fast/cheap for triage. Use prompt caching on the rubric system prompt — same on every call. |
| Transcription fallback | **Deepgram Nova-3** | If Fathom transcript is unavailable. Better diarization than Whisper. |
| Meeting capture (V2) | **Recall.ai** | Standard "bot joins any meeting" infra for live-suggestion mode. |

### Constraints worth knowing
- The `JAS_API_KEY` in `.env` is for an unrelated WBT service — do not reuse it for new integrations.
- Other WBT systems integrate via **LeadHub / GoHighLevel** — match call→client via LeadHub IDs where possible.
- All meetings already pass through **Fathom** — that is the primary ingest source.

---

## 5. Repo layout

```
.
├── frontend/                 React + Vite + TS app
│   ├── src/
│   │   ├── pages/            Route components
│   │   ├── components/       Shared UI
│   │   ├── lib/supabase.ts   Supabase browser client (anon key)
│   │   └── api/              Typed wrappers around backend endpoints
│   └── package.json
│
├── backend/                  Node.js + Express + TS API
│   ├── src/
│   │   ├── routes/           HTTP route handlers
│   │   ├── services/         Business logic
│   │   ├── db/               Supabase admin client + queries
│   │   ├── middleware/       Auth, error handling
│   │   └── server.ts         Entry point
│   └── package.json
│
├── n8n/
│   └── workflows/            Exported workflow JSONs (commit these)
│       ├── 01-ingest.json
│       ├── 02-classify.json
│       ├── 03-rule-engine.json
│       ├── 04-scorecard.json
│       └── 05-notify.json
│
├── supabase/
│   ├── migrations/           Numbered SQL files
│   └── seed.sql              Initial rubric, call types, demo data
│
├── docs/
│   ├── rubric-v1.md          Daniel's playbook in human-readable form
│   ├── architecture.md       Diagrams + sequence flows
│   └── api.md                Backend endpoint contracts
│
├── Meeting Transcript.txt    Original kickoff meeting (do not edit)
├── .env.example
├── CLAUDE.md                 (this file)
└── README.md
```

---

## 6. Data model (initial)

Core tables to create in `supabase/migrations/0001_init.sql`:

- `clients` — id, name, leadhub_id, created_at
- `departments` — id, name, kind (sales/ops/seo/...)
- `team_members` — id, name, email, department_id, role, supabase_user_id
- `calls` — id, client_id, department_id, call_type, source (fathom/manual), source_id, recorded_at, duration_seconds, audio_url, transcript_raw, transcript_segments (jsonb), status (pending/processing/scored/failed)
- `call_participants` — call_id, team_member_id, role (host/guest), is_external
- `rubrics` — id, name, version, content (jsonb), is_active, created_at
- `scorecards` — id, call_id, rubric_id, overall_score, summary, strengths (jsonb), improvements (jsonb), llm_model, created_at
- `scorecard_evidence` — id, scorecard_id, criterion_key, quote, timestamp_seconds
- `rule_findings` — id, call_id, rule_key, value, severity, context_snippets (jsonb)

`call_type` is a Postgres enum: `discovery`, `ads_intro`, `launch`, `follow_up`, `team`, `other`.

RLS policies (write before exposing any data):
- A `team_member` can read calls where they are a participant.
- A `manager` role can read calls within their department.
- An `admin` (Daniel) can read everything.
- Rubrics: read for all authenticated users, write for `admin` only.

---

## 7. n8n workflows (contracts)

Each workflow is triggered via webhook and writes back to Supabase via REST.

| Workflow | Trigger | Inputs | Outputs |
|---|---|---|---|
| `01-ingest` | Fathom webhook | Fathom call payload | New row in `calls` (status=pending), kicks off `02-classify` |
| `02-classify` | Internal webhook from `01` | call_id | Sets `call_type`, `client_id` on calls; kicks off `03` and `04` in parallel |
| `03-rule-engine` | Internal | call_id | Inserts rows into `rule_findings` |
| `04-scorecard` | Internal | call_id, rubric_id (active) | Inserts scorecard + evidence rows |
| `05-notify` | Triggered after `04` | call_id | Sends email to participants with scorecard link |

Workflows MUST be exported to `n8n/workflows/` as JSON and committed. They are part of the codebase.

---

## 8. Conventions

- **TypeScript strict mode** in both frontend and backend.
- **No `any`** unless escaping a third-party type gap; comment why.
- **Database access only via the backend** — frontend never holds the service role key.
- **Frontend reads via Supabase client (anon key + RLS)** are OK for simple list/detail. Anything aggregated or mutating goes through the Node API.
- **Migrations are append-only.** Never edit a numbered migration that has been applied.
- **No emojis in code or commits** unless Daniel asks.
- **Commit n8n workflows on every meaningful change** — they are not infra, they are code.

---

## 9. Local development

Read `README.md` for setup commands. High-level:
1. `cp .env.example .env` and fill in keys.
2. Start Supabase locally (`supabase start`) or point to a hosted project.
3. Run migrations (`supabase db push`).
4. Start n8n locally (Docker), import workflows.
5. `cd backend && npm run dev`.
6. `cd frontend && npm run dev`.

---

## 10. References inside the repo

- `Meeting Transcript.txt` — the kickoff meeting with Daniel. The Call Analyzer section is roughly lines 401–430. Read it if you need context on a design decision.
- `docs/rubric-v1.md` — Daniel's playbook, human-readable. Source of truth for what the LLM scorecard should evaluate.
- `docs/architecture.md` — diagrams and sequence flows.

---

## 11. Things to ask before assuming

- Whether a call type belongs in the enum (don't add new types silently — Daniel cares about this taxonomy).
- Whether a new rubric criterion should be a hard rule or LLM-evaluated.
- Whether a feature is V1 or V2 (when in doubt, it's V2).
- Anything that would change what reps see in their scorecard — that's a behavior change Daniel will want to review.

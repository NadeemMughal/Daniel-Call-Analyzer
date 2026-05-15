# Call Analyzer

> AI sales-coaching system for **WeBuildTrades**. Ingests recorded calls from Fathom, scores them against an editable sales playbook, and surfaces per-call feedback and per-member trends in a portal.

Part of the broader **Command HQ** platform; intended to be white-labeled later as part of **Agency Disrupt**.

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, data flow diagrams, design decisions |
| [docs/SETUP.md](docs/SETUP.md) | Local and production setup guide |
| [docs/N8N_WORKFLOWS.md](docs/N8N_WORKFLOWS.md) | Workflow-by-workflow reference with node maps |
| [docs/SUPABASE_SCHEMA.md](docs/SUPABASE_SCHEMA.md) | Full table + RPC function reference |
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | Dashboard features, data sources, theming guide |
| [docs/backend-spec.md](docs/backend-spec.md) | Express API endpoint contracts |
| [docs/master-pipeline.md](docs/master-pipeline.md) | Detailed master pipeline node reference |

---

## How it works

1. A call finishes in Fathom and a webhook fires.
2. **n8n** picks it up, classifies the call (discovery, ads-intro, launch, follow-up, team), matches it to a client, runs a deterministic rule pass (banned words, fillers, talk ratio), then asks **Claude** to score it against the active rubric.
3. Results land in **Supabase**.
4. The **React** portal lets the team browse `Client -> Department -> Member -> Calls`, view scorecards with quoted evidence, and track trends over time.

## Stack

| Layer | Tech |
| --- | --- |
| Workflow orchestration | n8n |
| Database / auth / storage | Supabase (Postgres + pgvector + Auth + Storage) |
| Backend API | Node.js + Express + TypeScript |
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui |
| LLM | Groq (llama-3.3-70b for scoring + trends, llama-3.1-8b for classification) |
| Transcription fallback | Deepgram Nova-3 |
| Meeting capture | Fathom (V1), Recall.ai (V2 live mode) |

## Repo layout

```
.
├── frontend/              React app (Vite + TS)
├── backend/               Express API (TS)
├── n8n/
│   └── workflows/         Exported n8n workflow JSONs (committed)
├── supabase/
│   ├── migrations/        SQL migrations (append-only)
│   └── seed.sql           Initial rubric + call-type seed data
├── docs/
│   ├── rubric-v1.md       Daniel's sales playbook
│   ├── architecture.md    Diagrams + sequence flows
│   └── api.md             Backend endpoint contracts
├── Meeting Transcript.txt Kickoff meeting (do not edit)
├── CLAUDE.md              Context for any LLM agent working in this repo
├── README.md              You are here
└── .env.example
```

## Prerequisites

- Node.js 20 or newer
- Docker (for n8n; optional for local Supabase)
- A Supabase project (hosted, or local via the `supabase` CLI)
- API keys: Anthropic, Fathom webhook secret. Optional: Deepgram, LeadHub/GoHighLevel.

## Setup

### 1. Environment

```bash
cp .env.example .env
```

Fill in the values. See the [Environment variables](#environment-variables) section below.

### 2. Database 

**Hosted Supabase:**

```bash
cd supabase
supabase link --project-ref <your-project-ref>
supabase db push
psql "$SUPABASE_DB_URL" -f seed.sql
```

**Local Supabase:**
 
```bash
supabase start
supabase db reset    # applies migrations + seed
```

### 3. n8n

```bash
docker run -it --rm \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

Open http://localhost:5678 and import each workflow from `n8n/workflows/`. Add the Supabase service-role key and Anthropic key as n8n credentials.

### 4. Backend

```bash
cd backend
npm install
npm run dev    # http://localhost:4000
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

### 6. Wire Fathom

In Fathom, point the **call completed** webhook at:

```
https://<your-n8n-host>/webhook/fathom-call-completed
```

Set the shared secret to match `FATHOM_WEBHOOK_SECRET` in your n8n credential.

## Development workflow

- **Schema change?** Add a new file to `supabase/migrations/`. Never edit a migration that has already been applied.
- **n8n workflow change?** Re-export the workflow JSON to `n8n/workflows/` and commit it. Workflows are code, not infra.
- **Rubric change?** Edit through the portal (writes a new row in `rubrics` with a bumped version). Mirror the change to `docs/rubric-v1.md` for human readability. Do not bake rubric rules into prompts.
- **New backend route?** Add the route to `backend/src/routes/`, the business logic to `backend/src/services/`, and the typed wrapper to `frontend/src/api/`.

## Environment variables

See `.env.example` for the full list. The key ones:

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=             # frontend
SUPABASE_SERVICE_ROLE_KEY=     # backend + n8n only — never expose to frontend

# Anthropic
ANTHROPIC_API_KEY=

# Fathom
FATHOM_WEBHOOK_SECRET=

# Optional
DEEPGRAM_API_KEY=
LEADHUB_API_KEY=

# n8n
N8N_BASE_URL=
N8N_TRIGGER_TOKEN=             # used by the backend to retrigger workflows

# Backend
PORT=4000
NODE_ENV=development
```

## V1 scope

- Post-call ingest, classification, deterministic rule pass, LLM scorecard
- Hierarchical browser: Client -> Department -> Member -> Calls
- Per-call view (transcript, scorecard, quoted evidence)
- Per-member trend dashboard
- Editable, versioned rubric

## Out of scope for V1

- Live in-meeting suggestions (V2, will use Recall.ai bot)
- Proposal Generator (separate project)
- Discovery Call Prep (paused — Jazz feedback)

## Owners

- **Product** — Daniel Brown (WeBuildTrades)
- **AI / automation** — Zain Ali
- **Command HQ platform** — Naren

## License

Proprietary — WeBuildTrades. Not for redistribution.

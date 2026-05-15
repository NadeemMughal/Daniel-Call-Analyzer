# Setup Guide

Complete local and production setup for Daniel Call Analyzer.

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 20+ | Backend + Frontend |
| npm | 9+ | Package manager |
| Git | any | Source control |
| Supabase account | — | Database + Auth |
| n8n account / server | — | Workflow automation |
| Groq account | — | LLM inference (fast + free tier) |

---

## Step 1 — Clone and install

```bash
git clone <repo-url>
cd Daniel-Call-Analyzer

# Install backend deps
cd backend && npm install && cd ..

# Install frontend deps
cd frontend && npm install && cd ..
```

---

## Step 2 — Supabase setup

### 2a. Create a project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and both API keys (anon + service_role)

### 2b. Apply migrations

In the Supabase dashboard → **SQL Editor**, run each migration file in order:

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_rubric_criteria.sql
supabase/migrations/0003_rls_policies.sql
supabase/migrations/0004_rule_findings.sql
supabase/migrations/0005_member_trends.sql
supabase/migrations/0006_analytics_views.sql   ← analytics RPCs (required for dashboard charts)
```

Alternatively with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 2c. Seed initial data

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

This inserts the initial rubric + call-type configuration.

---

## Step 3 — Environment variables

### Backend (`backend/.env`)

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...   # service role — never expose to frontend
PORT=4000
NODE_ENV=development
PORTAL_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...      # anon key — safe to expose
VITE_BACKEND_URL=http://localhost:4000
```

### n8n environment variables

In your n8n instance: **Settings → Variables** (or edit `~/.n8n/config` for self-hosted):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (full DB access) |
| `GROQ_API_KEY` | From console.groq.com |
| `FATHOM_WEBHOOK_SECRET` | Shared secret set in Fathom |
| `PORTAL_URL` | Frontend URL for email links |
| `N8N_INSTANCE_URL` | Your n8n base URL |

All n8n workflow nodes reference these as `={{ $env.VARIABLE_NAME }}` — never hardcoded.

---

## Step 4 — Run locally

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# → http://localhost:4000

# Terminal 2 — Frontend
cd frontend
npm run dev
# → http://localhost:5173
```

Verify the backend is healthy:

```bash
curl http://localhost:4000/health
# → {"ok":true,"service":"call-analyzer-backend"}
```

---

## Step 5 — n8n workflows

### Import workflows

1. Open your n8n instance
2. Go to **Workflows → Import from File**
3. Import each file from `n8n/workflows/` in order:
   - `00-master-pipeline.json`
   - `07-trend-analysis.json`
   - `99-error-handler.json`

### Configure credentials

n8n will prompt you to map credentials. The workflows use **environment variables** (no stored credentials needed) — just ensure your n8n env vars are set as above.

### Activate workflows

- **99-error-handler** — activate first (master pipeline references it)
- **00-master-pipeline** — activate (starts listening for Fathom webhooks)
- **07-trend-analysis** — activate (starts weekly schedule + enables webhook trigger)

### Wire Fathom

In Fathom settings → Webhooks:

```
URL:     https://your-n8n-host/webhook/fathom-call-completed
Secret:  <value of FATHOM_WEBHOOK_SECRET>
Events:  Call Completed
```

---

## Step 6 — Verify end-to-end

1. Trigger a test call in Fathom (or use the test payload from `docs/test-payload.json`)
2. Check n8n execution history — look for a green run of `00-master-pipeline`
3. Open the dashboard at `http://localhost:5173` — the call should appear under the relevant member
4. Check `member_trends` in Supabase — a new row should exist within ~30 seconds of scoring

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Dashboard charts empty | Migration 0006 not applied | Run `0006_analytics_views.sql` in Supabase SQL editor |
| n8n webhook 401 | Wrong `FATHOM_WEBHOOK_SECRET` | Match the secret in Fathom and n8n env |
| "Failed to load weekly stats" | Backend not running | Start `npm run dev` in `backend/` |
| Scorecard missing | Groq API key invalid or quota exceeded | Check console.groq.com |
| Leaderboard empty | No `call_participants` rows | Ensure calls have participants with `is_external=false` |
| Backend CORS error | `PORTAL_URL` mismatch | Set `PORTAL_URL` in `backend/.env` to match your frontend URL |

---

## Production deployment

See [backend/render.yaml](../backend/render.yaml) for Render deployment config, and [frontend/vercel.json](../frontend/vercel.json) for Vercel SPA routing.

Environment variables must be set in your hosting provider's dashboard — do not commit `.env` files.

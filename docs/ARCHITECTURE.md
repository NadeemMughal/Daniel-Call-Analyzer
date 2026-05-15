# System Architecture

> Daniel Call Analyzer — AI-powered sales coaching system for WeBuildTrades.

---

## High-Level Overview

```
Fathom (call recorder)
        │  webhook POST (HMAC-signed)
        ▼
  n8n Master Pipeline (00-master-pipeline.json)
        │  validates → classifies → scores → stores
        ▼
  Supabase (PostgreSQL)
        │  data API + RPCs
        ▼
  React Portal  ◄──  Express Backend API
  (frontend/)         (backend/)
```

Every recorded call flows through a single deterministic pipeline. No calls are stored or scored outside this flow.

---

## Data Flow — Single Call (Sales/External)

```
1. Fathom webhook fires
       │
       ▼
2. Verify HMAC → reject if invalid
       │
       ▼
3. Dedup check (calls table, external_id)
       │
       ▼
4. INSERT into calls (status = 'pending')
       │
       ▼
5. Classify with Groq (llama-3.1-8b-instant)
   → call_type: DISCOVERY | FOLLOW_UP | ADS_INTRO | LAUNCH
   → Update call.call_type, call.meeting_phase
       │
       ▼
6. Is Team Call? ──yes──▶ Team Meeting Path (see below)
       │ no
       ▼
7. Fetch active rubric from Supabase
8. Run deterministic rule pass (banned words, filler count, talk ratio)
9. INSERT rule_findings rows
       │
       ▼
10. Score with Groq (llama-3.3-70b-versatile)
    → JSON scorecard with criterion scores + quoted evidence
       │
       ▼
11. Parse Scorecard
12. Compute Department (Sales branch)
13. INSERT scorecards row (overall_score, summary)
14. INSERT scorecard_evidence rows (per criterion, with quotes)
15. UPDATE calls.status = 'scored'
       │
       ├──▶ Get Participants → Build email list → Send email notification
       │
       └──▶ Get Host for Trend → POST /webhook/trend-refresh
              (triggers 07-trend-analysis.json for that rep immediately)
```

## Data Flow — Team/Internal Meeting

```
Classifies as TEAM
       │
       ▼
Generate Meeting Summary with Groq (70b, fallback to 8b)
       │
       ▼
Parse Meeting Summary
       │
       ▼
Patch Department on call
INSERT scorecards (meeting intelligence summary)
```

## Data Flow — Weekly Trend Analysis (07-trend-analysis.json)

```
Schedule: Sunday 00:00 UTC   OR   POST /webhook/trend-refresh { member_id }
       │
       ▼
Get all reps (or single rep from webhook)
       │
       ▼ (loop per rep)
Get call_participants for rep (last 20 calls)
       │
       ▼
Get scorecards for those calls
       │
       ▼
Build trend prompt → Groq (llama-3.3-70b)
       │
       ▼
UPSERT member_trends (score_trend, analysis_json, period_start, period_end)
```

---

## Component Map

| Component | Path | Purpose |
|-----------|------|---------|
| React portal | `frontend/` | Dashboard, call browser, scorecard viewer, rubric editor |
| Express API | `backend/` | Analytics aggregations, rubric CRUD, trend endpoints |
| n8n workflows | `n8n/workflows/` | All automation: ingest, score, notify, trend |
| Supabase DB | `supabase/migrations/` | Source of truth: calls, scorecards, rubrics, members |
| Docs | `docs/` | Architecture (here), setup, schema, workflows, dashboard |

---

## Database Tables (Supabase)

```
clients
  └── departments
        └── team_members
              └── call_participants ──▶ calls
                                          └── scorecards
                                                └── scorecard_evidence
                                          └── rule_findings
                                    └── member_trends (per period)

rubrics
  └── rubric_criteria
        └── rubric_rules
```

See [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md) for full column details.

---

## Key Design Decisions

**Why n8n instead of Lambda/Cloud Functions?**
Visual workflow editor makes the pipeline inspectable and modifiable without code deploys. Error handling, retries, and execution history are built-in.

**Why Supabase SECURITY DEFINER functions for analytics?**
The frontend (anon key) cannot join across all rows — RLS would block it. SECURITY DEFINER functions run as the function owner (superuser) and bypass RLS, enabling org-wide aggregations safely.

**Why Groq instead of OpenAI?**
Speed. Groq's LPU inference runs llama-3.3-70b at 400+ tokens/sec, completing a full scorecard in under 10 seconds vs 30+ with OpenAI.

**Why a separate backend API alongside Supabase PostgREST?**
Complex aggregations (weekly stats, leaderboard ranking) are better expressed as SQL RPCs than chained PostgREST calls. The backend also adds a CORS layer and can enforce business logic that PostgREST can't.

---

## Security Boundary

```
                  PUBLIC              │              PRIVATE
                                      │
  Browser ──── Supabase anon key ─────┤──── Supabase service role key
  Browser ──── Backend API ───────────┤──── Groq API key
                                      │──── Fathom webhook secret
                                      │──── n8n environment variables
```

- The anon key is safe to expose in the frontend bundle (RLS enforces row access).
- The service role key **bypasses all RLS** — never expose it in frontend code.
- All sensitive keys live in n8n environment variables (`$env.KEY_NAME`) — not hardcoded.

---

## Related Docs

- [SETUP.md](SETUP.md) — Local and production setup
- [N8N_WORKFLOWS.md](N8N_WORKFLOWS.md) — Workflow-by-workflow reference
- [SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md) — Table and function reference
- [DASHBOARD.md](DASHBOARD.md) — Frontend dashboard feature guide
- [backend-spec.md](backend-spec.md) — Express API endpoint reference
- [master-pipeline.md](master-pipeline.md) — Detailed master pipeline node map

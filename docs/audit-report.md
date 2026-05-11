# Project Audit Report
**Date:** 2026-05-11  
**Project:** WeBuildTrades Call Analyzer  
**Audited by:** Claude Code  

---

## Project Status Overview

| Area | Status | Notes |
|---|---|---|
| n8n Workflows (01–06) | Live & Active | All imported to n8nserver.metaviz.pro |
| n8n Master Pipeline (00) | Imported, needs SMTP | ID: Z1WdzpBv7u1DjB2L |
| Supabase Schema | Ready to apply | Run 0001_init.sql in SQL editor |
| Supabase Seed | Ready to apply | Run seed.sql after migration |
| Frontend | Scaffolded, deps installed | Run `npm run dev` to start |
| Backend API | Not yet built | Planned for next phase |

---

## Bugs Found & Fixed

### CRITICAL — Fixed

#### Bug 1: `.item` instead of `.first()` in 01-ingest.json
- **File:** `n8n/workflows/01-ingest.json`
- **Node:** Trigger Classify
- **Problem:** `$('Insert Call').item.json[0].id` — `.item` only works when n8n is processing a single item in a loop. In webhook execution context, `.first()` must be used to reliably get the first result.
- **Impact:** Would have caused `call_id` to be `undefined` when triggering workflow 02, breaking the entire pipeline.
- **Fix:** Changed to `$('Insert Call').first().json[0].id`
- **Status:** Fixed ✓

#### Bug 2: `.item` instead of `.first()` in 02-classify.json
- **File:** `n8n/workflows/02-classify.json`
- **Node:** Parse Classification (jsCode)
- **Problem:** `$('Webhook').item.json.call_id` — same issue as Bug 1.
- **Impact:** `call_id` would be `undefined` in all downstream nodes, corrupting the scorecard and findings database rows.
- **Fix:** Changed to `$('Webhook').first().json.call_id`
- **Status:** Fixed ✓

#### Bug 3: `.item` instead of `.first()` in 05-notify.json (×2 occurrences)
- **File:** `n8n/workflows/05-notify.json`
- **Nodes:** Get Participants, Get Rule Findings (both query parameters)
- **Problem:** `$('Webhook').item.json.call_id` in Supabase query filter.
- **Impact:** Both Supabase GET requests would query for `call_id=eq.undefined`, returning empty results. No email would ever be sent.
- **Fix:** Changed both to `$('Webhook').first().json.call_id`
- **Status:** Fixed ✓

---

### MEDIUM — Fixed

#### Bug 4: Rule findings sorted alphabetically, not by importance
- **File:** `frontend/src/pages/CallDetailPage.tsx`
- **Problem:** Findings were fetched with `.order('severity', ascending: true)` which sorts alphabetically (critical < info < warning). While critical happened to appear first due to alphabet, "info" appeared before "warning" which is wrong.
- **Impact:** Minor UX issue — low-importance findings (info) appeared above warnings.
- **Fix:** Removed DB-level sort, added client-side sort with explicit priority: `{ critical: 0, warning: 1, info: 2 }`
- **Status:** Fixed ✓

---

### LOW — No fix needed

#### Note: `TranscriptSegment.text` vs `.content`
- **File:** `frontend/src/types.ts`, `n8n/workflows/03-rule-engine.json`
- **Observation:** The rule engine JS code uses `s.text || s.content || ''` as a defensive fallback. The `types.ts` only defines `text`.
- **Assessment:** The fallback is intentional — Fathom's API may return either `text` or `content` depending on version. Rule engine handles both. Frontend types.ts only needs `text` since it only displays transcripts (doesn't run rules).
- **Status:** No fix needed — defensive fallback is correct ✓

#### Note: RubricPage JSON parse/stringify cycle
- **File:** `frontend/src/pages/RubricPage.tsx`
- **Observation:** Every form field change does `JSON.parse(content)` → modify → `JSON.stringify(...)`. Slightly inefficient.
- **Assessment:** Content is a ~2KB JSON string. The overhead is negligible. Keeping it simple is the right call.
- **Status:** No fix needed ✓

---

## n8n Workflow Status

| Workflow | n8n ID | Status | Webhook Path |
|---|---|---|---|
| 00 - Master Pipeline | Z1WdzpBv7u1DjB2L | Imported (needs SMTP) | `/webhook/fathom-master` |
| 01 - Ingest Fathom Call | e1thyy5mKJAgi3Rz | **Active** | `/webhook/fathom-call-completed` |
| 02 - Classify Call | 4g8tfyCY1OVaufEQ | **Active** | `/webhook/call-classify` |
| 03 - Rule Engine | yFh2i1iKtx5DcY60 | **Active** | `/webhook/call-rule-engine` |
| 04 - LLM Scorecard | bzjBTtDYINXPrHk9 | **Active** | `/webhook/call-scorecard` |
| 05 - Notify Participants | 90Jnx5CmYqyJZMlT | **Needs SMTP** | `/webhook/call-notify` |
| 06 - Meeting Summary | tJ5RU2YXNgM3Mz8X | **Active** | `/webhook/call-meeting-summary` |

**Note:** Workflows 01–04 and 06 are fully active. Workflow 05 (email) requires SMTP credentials to be added in n8n before it can activate.

---

## Pending Actions Before Going Live

### Must Do (Blockers)

| # | Action | Where | Time |
|---|---|---|---|
| 1 | Run `supabase/migrations/0001_init.sql` | Supabase SQL Editor | 2 min |
| 2 | Run `supabase/seed.sql` | Supabase SQL Editor | 1 min |
| 3 | Add SMTP credential in n8n | n8n → Credentials → New → SMTP | 5 min |
| 4 | Assign SMTP credential to "Send Email" node in workflow 05 | n8n workflow editor | 2 min |
| 5 | Set Fathom webhook URL to `https://n8nserver.metaviz.pro/webhook/fathom-call-completed` | Fathom dashboard | 2 min |

### Should Do (Improves reliability)

| # | Action | Notes |
|---|---|---|
| 6 | Set `FATHOM_WEBHOOK_SECRET` in `.env` and in n8n environment vars | Enables HMAC signature verification on incoming webhooks |
| 7 | Move workflows into the correct n8n project folder | Drag to: `projects/svGqOV1xWvX7Qt0g/folders/V40zEZftjTIUFjwh` |
| 8 | Re-import fixed workflows 01, 02, 05 to n8n | Bug fixes applied locally, need to push to n8n |

### Next Phase

| # | Action | Notes |
|---|---|---|
| 9 | Build backend API | `backend/` folder — Node.js + Express + TypeScript |
| 10 | Wire Supabase participants on call ingest | Fathom includes attendee info in webhook payload |
| 11 | LeadHub/GoHighLevel client matching | Stub in 02-classify "Match Client" node |

---

## File Inventory

```
Daniel-Call-Analyzer/
├── .env                              ← All credentials (Supabase, Groq, n8n, Fathom)
├── CLAUDE.md                         ← LLM working context for this repo
├── README.md
├── docs/
│   ├── rubric-v1.md                  ← Daniel's playbook, human-readable
│   ├── master-pipeline.md            ← Full node-by-node pipeline explanation
│   └── audit-report.md               ← This file
├── n8n/workflows/
│   ├── 00-master-pipeline.json       ← All 6 workflows in one canvas (34 nodes)
│   ├── 01-ingest.json                ← Fathom → DB ingest
│   ├── 02-classify.json              ← Groq 8B call type classification + routing
│   ├── 03-rule-engine.json           ← Deterministic rules (banned words, fillers, talk ratio)
│   ├── 04-scorecard.json             ← Groq 70B LLM scoring against rubric
│   ├── 05-notify.json                ← Email to reps with scorecard
│   └── 06-meeting-summary.json       ← Meeting intelligence for team calls
├── supabase/
│   ├── migrations/0001_init.sql      ← Full schema: 9 tables, enums, RLS, indexes
│   └── seed.sql                      ← Sales dept, 6 team members, rubric v1
└── frontend/
    ├── .env                          ← VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
    ├── package.json                  ← React 18, Vite, Tailwind, Supabase, Recharts
    └── src/
        ├── App.tsx                   ← Router: /calls, /calls/:id, /trends, /rubric
        ├── types.ts                  ← All TypeScript interfaces
        ├── lib/
        │   ├── supabase.ts           ← Supabase browser client (anon key)
        │   └── utils.ts              ← formatDate, scoreColor, CALL_TYPE_LABELS, etc.
        ├── components/
        │   ├── Layout.tsx            ← Sidebar nav + Outlet
        │   ├── Badge.tsx             ← Reusable pill badge
        │   └── ScoreRing.tsx         ← Circular score indicator (SVG)
        └── pages/
            ├── CallsPage.tsx         ← Filterable calls table
            ├── CallDetailPage.tsx    ← Transcript + scorecard + rule findings tabs
            ├── TrendsPage.tsx        ← Per-member score chart (Recharts line chart)
            └── RubricPage.tsx        ← Live rubric editor (banned words, fillers, talk ratio)
```

---

## Environment Variables Reference

| Variable | Used In | Value Location |
|---|---|---|
| `SUPABASE_URL` | n8n workflows, backend | `.env` |
| `SUPABASE_ANON_KEY` | Frontend | `frontend/.env` as `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | n8n workflows | `.env` — never expose to frontend |
| `GROQ_API_KEY` | n8n workflows 02, 04, 06, 00 | `.env` |
| `N8N_API_KEY` | Import scripts | `.env` |
| `N8N_BASE_URL` | n8n inter-workflow calls | `.env` = `https://n8nserver.metaviz.pro` |
| `FATHOM_WEBHOOK_SECRET` | 01-ingest, 00-master | `.env` — currently empty |
| `PORTAL_URL` | 05-notify email links | `.env` = `http://localhost:5173` (update for production) |

---

## How to Start the Frontend Locally

```bash
cd frontend
npm run dev
# Opens at http://localhost:5173
```

**Pages:**
- `/calls` — All calls with filters (type, status, search by client/rep)
- `/calls/:id` — Call detail: scorecard, rule findings, transcript
- `/trends` — Per-rep score chart over time
- `/rubric` — Live rubric editor (banned words, filler thresholds, talk ratio)

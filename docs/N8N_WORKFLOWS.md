# n8n Workflows Reference

All automation lives in `n8n/workflows/`. Each file is a self-contained workflow exported as JSON. Import them into n8n and activate them.

---

## Workflow List

| File | Name | Trigger | Purpose |
|------|------|---------|---------|
| `00-master-pipeline.json` | Master Pipeline | Fathom webhook | Main ingest → classify → score → store → notify |
| `07-trend-analysis.json` | Weekly Trend Analysis | Weekly schedule + webhook | Compute per-rep score trends, upsert `member_trends` |
| `99-error-handler.json` | Error Handler | Workflow error event | Log errors to Supabase `workflow_errors` table |

---

## 00 — Master Pipeline

**Trigger:** `POST /webhook/fathom-call-completed`

This is the core pipeline. Every recorded call passes through here exactly once.

### Node map

```
Fathom Webhook
  → Verify HMAC           (rejects bad signatures)
  → Check Duplicate       (SELECT calls WHERE external_id = ?)
  → Count Duplicates
  → Is Duplicate?
      ├─ yes → Respond 200 Duplicate (stops processing)
      └─ no  →
          → Insert Call               (status = 'pending')
          → Classify with Groq        (llama-3.1-8b-instant)
          → Parse Classification      (extracts call_type, meeting_phase, call_id)
          → Update Call Type          (PATCH calls SET call_type, meeting_phase)
          → Is Team Call?
              ├─ yes → Team Meeting Branch (see below)
              └─ no  → Sales Branch (see below)
```

### Sales branch (DISCOVERY / FOLLOW_UP / ADS_INTRO / LAUNCH)

```
Get Active Rubric
  → Get Rubric Criteria
  → Get Rubric Rules
  → Run Rule Pass         (deterministic: banned words, filler count, talk ratio)
  → Build Findings Array
  → Insert Rule Findings
  → Score with Groq       (llama-3.3-70b-versatile, full rubric scoring)
  → Parse Scorecard
  → Compute Department (Sales)
  → Patch Department (Sales)
  → Insert Scorecard      (overall_score, summary, call_id)
  → Build Evidence Array
  → Has Evidence?
      ├─ yes → Insert Evidence → Update Call Scored
      └─ no  → Update Call Scored
  → Update Call Scored    (SET status = 'scored')
      ├──→ Get Participants → Build Email List → Has Recipients?
      │         └─ yes → Send Email Notification
      └──→ Get Host for Trend → Refresh Rep Trend  ← triggers 07 immediately
```

### Team meeting branch (TEAM / INTERNAL)

```
Generate Meeting Summary (Groq 70b)
  → 70B Succeeded?
      ├─ yes → Parse Meeting Summary
      └─ no  → Generate Meeting Summary (8B fallback)
                → Parse Meeting Summary
  → Patch Department
  → Store Meeting Scorecard
```

### Environment variables used

| Variable | Used in |
|----------|---------|
| `SUPABASE_URL` | All Supabase HTTP nodes |
| `SUPABASE_SERVICE_ROLE_KEY` | All Supabase HTTP nodes |
| `GROQ_API_KEY` | Classify with Groq, Score with Groq, Generate Meeting Summary |
| `FATHOM_WEBHOOK_SECRET` | Verify HMAC |
| `PORTAL_URL` | Email notification links |

---

## 07 — Weekly Trend Analysis

**Triggers:**
1. Weekly schedule: every Sunday at 00:00 UTC
2. Webhook: `POST /webhook/trend-refresh` with body `{ "member_id": "<uuid>" }`

The webhook trigger fires automatically from the master pipeline after each scored call, so trend data is always fresh (not stale for up to 7 days).

### Node map

```
Weekly Schedule ─────────────────────────────────────────────────────────────┐
                                                                              │
Webhook Trigger (POST /webhook/trend-refresh) → Extract Member ──────────────┤
                                                                              │
                                                                              ▼
                                                              Get All Reps (weekly path)
                                                                              │
                                                              Loop Over Members (splitInBatches 1)
                                                                              │
                                                              Get Member Call IDs
                                                                              │
                                                              Build Call ID List
                                                                              │
                                                              Has Calls?
                                                              ├─ no  → back to Loop
                                                              └─ yes →
                                                                  Get Scorecards
                                                                    → Build Trend Prompt
                                                                    → Call Groq (70b)
                                                                    → Parse Trend Response
                                                                    → Upsert member_trends
                                                                    → back to Loop
```

**Weekly path:** Gets all team members, loops over each, analyzes their last 20 calls.

**Webhook path:** Receives a single `member_id`, skips the loop, runs directly for that one rep.

### Trend output (`member_trends` table)

Each run upserts a row with:

| Field | Description |
|-------|-------------|
| `score_trend` | `IMPROVING` \| `DECLINING` \| `PLATEAUING` \| `INSUFFICIENT_DATA` |
| `average_score` | Numeric average of last N scored calls |
| `calls_analyzed` | How many calls were in the window |
| `analysis_json` | Full Groq response with strengths, weaknesses, coaching notes |
| `period_start` / `period_end` | Analysis window dates |

### Environment variables used

| Variable | Used in |
|----------|---------|
| `SUPABASE_URL` | Get All Reps, Get Member Call IDs, Get Scorecards, Upsert |
| `SUPABASE_SERVICE_ROLE_KEY` | All Supabase nodes |
| `GROQ_API_KEY` | Call Groq |

---

## 99 — Error Handler

**Trigger:** Workflow error event (fires when any other workflow throws an unhandled error)

Logs the error details to a `workflow_errors` table in Supabase so errors are visible in the dashboard rather than silently lost.

### What it logs

- Workflow name and ID
- Error message and stack trace
- Execution timestamp
- Node name where the error occurred

---

## Adding a new workflow

1. Create the workflow in n8n UI
2. Export as JSON: **Workflow menu → Export**
3. Save to `n8n/workflows/` with a sequential prefix (`08-`, `09-`, etc.)
4. Commit the JSON file — workflows are code, not infra

**Important:** All Supabase and API calls must use `$env.VARIABLE_NAME` syntax, never hardcoded keys.

---

## Testing a workflow

Use the test payloads in `docs/test-payload.json` to trigger the master pipeline manually:

```bash
curl -X POST https://your-n8n/webhook/fathom-call-completed \
  -H "Content-Type: application/json" \
  -H "X-Fathom-Signature: <computed-hmac>" \
  -d @docs/test-payload.json
```

For the trend webhook:

```bash
curl -X POST https://your-n8n/webhook/trend-refresh \
  -H "Content-Type: application/json" \
  -d '{"member_id": "<team_member_uuid>"}'
```

# Call Analyzer — Demo Runbook

One page. Follow it top to bottom. The demo is fully wired and ready to fire.

---

## What this demo proves

You POST a Fathom-style webhook payload → in under 30 seconds:

1. n8n receives it, deduplicates, classifies the call (Groq Llama 8B)
2. For team calls → meeting summary with action items + decisions (Groq 70B)
   For sales calls → rule engine (banned words, fillers, talk ratio) + scorecard (Groq 70B)
3. All data lands in Supabase
4. HTML email arrives in your Gmail inbox via your Gmail OAuth2 credential
5. Frontend portal shows the call with full scorecard

---

## One-time setup (~5 minutes)

### 1. Apply Supabase migration + seed
- Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/fybvnwidpnxnouaukrnb/sql)
- **New query** → paste contents of [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql) → **Run**
- **New query** → paste contents of [supabase/seed.sql](../supabase/seed.sql) → **Run**

> Creates 9 tables, RLS, then inserts Sales department + 6 team members + rubric v1 (banned words, fillers, talk ratio).

### 2. Move workflow into the right n8n folder
- Open [n8n workflows list](https://n8nserver.metaviz.pro/projects/svGqOV1xWvX7Qt0g/folders/V40zEZftjTIUFjwh/workflows)
- Find "00 - Master Pipeline"
- Drag it into folder `V40zEZftjTIUFjwh` (Daniel Call Analyzer)

### 3. Verify Gmail credential is wired
- Open workflow "00 - Master Pipeline" in n8n
- Click the **Send Email** node (far right)
- Confirm the credential shows **"Gmail account 7"** (ID `9EQjy57dlQKwSMkn`)
- Workflow should already be **Active** (toggle on, top right)

### 4. Start the frontend portal
```powershell
cd c:\Users\User\Desktop\Daniel-Call-Analyzer\frontend
npm install
npm run dev
```
Opens at [localhost:5173](http://localhost:5173)

---

## Fire the demo

### Send the test payload
```powershell
cd c:\Users\User\Desktop\Daniel-Call-Analyzer
curl.exe -X POST https://n8nserver.metaviz.pro/webhook/fathom-master `
  -H "Content-Type: application/json" `
  -d "@docs/test-payload.json"
```

Expected response (within ~15 seconds):
```json
{"ok": true, "call_id": "<uuid>", "call_type": "team"}
```

> The test payload is the real **May 04 Daniel + Zain meeting** (56 min). It will classify as `team`, run the meeting summary branch, and extract ~12 action items.

---

## What to show during the demo

| Stop | Where | What it proves |
|---|---|---|
| 1 | [n8n executions](https://n8nserver.metaviz.pro/workflow/Z1WdzpBv7u1DjB2L/executions) | All 34 nodes green — visual proof the pipeline works end-to-end |
| 2 | [Supabase calls table](https://supabase.com/dashboard/project/fybvnwidpnxnouaukrnb/editor) | New row, `status: scored`, `call_type: team`, full transcript stored |
| 3 | Supabase `scorecards` table | Meeting summary as JSON in `summary` column |
| 4 | Supabase `scorecard_evidence` table | Action items + decisions + open questions as individual rows |
| 5 | Gmail Sent folder | Outgoing email entry (sent from your own Gmail) |
| 6 | Gmail Inbox | Formatted HTML email with score, summary, strengths, improvements, portal CTA |
| 7 | [localhost:5173/calls](http://localhost:5173/calls) | Call appears in the list |
| 8 | localhost:5173/calls/`<id>` | Full scorecard view with tabs for scorecard, findings, transcript |

---

## How the pipeline works (one-line summary per node)

**Ingest section (5 nodes)**
- **Fathom Webhook** — receives POST at `/webhook/fathom-master`
- **Verify HMAC** — SHA256 signature check (skipped when `FATHOM_WEBHOOK_SECRET` empty)
- **Check Duplicate** — `GET /rest/v1/calls?source_id=eq.X` returns `[]` if first time
- **Is Duplicate?** — IF node; routes to either Insert Call or short-circuit Respond 200
- **Insert Call** — `POST /rest/v1/calls` writes the new row, returns the UUID

**Classify section (3 nodes)**
- **Classify with Groq** — Llama 3.1 8B with first 2000 chars → returns `call_type` JSON
- **Parse Classification** — validates against enum, attaches `call_id`
- **Update Call Type** — `PATCH /rest/v1/calls?id=eq.X` sets call_type + status=processing

**Routing**
- **Is Team Call?** — IF node; team → Meeting Summary branch, otherwise → Rule Engine + Scorecard branch

**Sales branch — Rule Engine (4 nodes)**
- **Get Active Rubric / Get Call Data** — parallel GETs
- **Run Rules** — pure JS: banned words, filler counts, talk ratio
- **Build Findings Array / Insert Rule Findings** — POST to `rule_findings`

**Sales branch — LLM Scorecard (5 nodes)**
- **Score with Groq** — Llama 3.3 70B with full transcript + rubric
- **Parse Scorecard** — validates 0–10 score, strengths, improvements arrays
- **Insert Scorecard / Build Evidence Array / Has Evidence? / Insert Evidence**

**Team branch — Meeting Summary (5 nodes)**
- **Generate Meeting Summary** — Llama 3.3 70B → JSON of title, key_points, decisions, action_items, open_questions
- **Parse Meeting Summary** — validates arrays
- **Store Meeting Scorecard / Store Meeting Evidence / Insert Meeting Evidence**

**Notify section (5 nodes)**
- **Update Call Scored** — status: scored
- **Get Participants** — internal team members for this call (parallel)
- **Get Final Scorecard** — most recent scorecard for this call (parallel)
- **Build Email List** — combines them; **falls back to muhammadammaralibhutta@gmail.com if no participants found** (demo-friendly)
- **Has Recipients?** — gates the email send
- **Send Email** — Gmail node using OAuth2 credential `9EQjy57dlQKwSMkn` → sends HTML email
- **Respond 200** — final webhook response

---

## Re-running the demo

The pipeline deduplicates by `source_id`. To re-run the same payload:
- Either change `"id": "660416881"` in `docs/test-payload.json` to something else
- Or delete the row in Supabase: `DELETE FROM calls WHERE source_id = '660416881';`

---

## If something fails

| Symptom | Most likely cause | Fix |
|---|---|---|
| `"workflow has issues"` error | Gmail credential not accessible from workflow scope | Share credential `9EQjy57dlQKwSMkn` with this workflow in n8n |
| 500 on `Check Duplicate` | Supabase tables don't exist | Run migration `0001_init.sql` |
| 401 on Supabase requests | Service role key invalid | Check `.env` `SUPABASE_SERVICE_ROLE_KEY` |
| `Parse Classification` errors | Groq quota hit | Check Groq dashboard / wait |
| Email not delivered | Gmail OAuth token revoked | Re-authorize the credential in n8n |
| Frontend shows no calls | Migration not applied OR RLS blocking | Use SQL editor to verify rows exist |

---

## Environment

| | |
|---|---|
| Webhook URL | `https://n8nserver.metaviz.pro/webhook/fathom-master` |
| Workflow ID | `Z1WdzpBv7u1DjB2L` |
| Workflow folder | `projects/svGqOV1xWvX7Qt0g/folders/V40zEZftjTIUFjwh` |
| Supabase project | `fybvnwidpnxnouaukrnb` |
| Gmail credential | `9EQjy57dlQKwSMkn` ("Gmail account 7") |
| Demo recipient | `muhammadammaralibhutta@gmail.com` |
| Frontend | `http://localhost:5173` |

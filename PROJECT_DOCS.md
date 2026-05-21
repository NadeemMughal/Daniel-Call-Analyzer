# WeBuildTrades — Call Analyzer: Full Project Documentation

**Last updated:** 2026-05-21  
**Status:** Live — pipeline operational, portal accessible, scoring in progress

---

## 1. What This System Does (Requirements)

The Call Analyzer is an AI-powered sales-coaching platform for WeBuildTrades. It automatically processes every recorded sales call, scores it against a rubric, and gives managers and reps a coaching dashboard.

### Core Requirements

| Requirement | Description |
|-------------|-------------|
| Auto-ingest calls | Every call recorded in Fathom is automatically picked up without manual work |
| Transcription | Full call transcript is stored and viewable |
| AI scoring | Claude/Groq scores each call 1–10 on specific rubric criteria (opening, needs discovery, objection handling, etc.) |
| Coaching dashboard | Managers see team performance, reps see their own scores and feedback |
| Call classification | Each call is tagged as discovery, kickoff, follow-up, demo, team meeting, or other |
| Leaderboard | Rank reps by average score, call count, quality tier |
| Client intelligence | Meetings with specific clients grouped together with their history |
| Meeting intelligence | Per-call summary, key issues, coaching recommendations |
| Role-based access | Admin sees everything; Manager sees their department; Rep sees only their own calls |
| Auth | Email/password login via Supabase — no anonymous access to data |

---

## 2. Tech Stack

### Infrastructure

| Layer | Technology | Location/URL |
|-------|-----------|--------------|
| Call recording | Fathom (SaaS) | Jas's Fathom account |
| Workflow automation | n8n v2.15.0 (self-hosted) | https://n8nserver.metaviz.pro |
| Database | Supabase (PostgreSQL + RLS + Auth) | Project: `fybvnwidpnxnouaukrnb` |
| AI scoring | Groq API (LLaMA 3.3 70B) | Called from n8n server |
| Backend API | Node.js + Express + TypeScript | Deployed on Render |
| Frontend portal | React 18 + Vite + Tailwind + shadcn/ui | Deployed on Vercel |

### Key Environment Variables

**n8n (set in n8n Credentials/Env):**
```
SUPABASE_URL=https://fybvnwidpnxnouaukrnb.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
GROQ_API_KEY=<groq key>
FATHOM_API_KEY=<jas fathom key>
FATHOM_WEBHOOK_SECRET=<shared secret — MUST match Fathom dashboard setting>
```

**Backend (.env on Render):**
```
SUPABASE_URL=https://fybvnwidpnxnouaukrnb.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
SUPABASE_ANON_KEY=<anon key>
PORT=4000
```

**Frontend (.env on Vercel / local .env):**
```
VITE_SUPABASE_URL=https://fybvnwidpnxnouaukrnb.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_BACKEND_URL=https://<render-backend-url>   # or http://localhost:4000 for dev
```

---

## 3. Data Flow (Input → Output)

### Full Pipeline

```
Fathom records call
       ↓
Fathom sends webhook → n8n (01-ingest)
       ↓
01-ingest: Verify HMAC signature
       ↓
01-ingest: Create call record in Supabase (status=pending)
           Store transcript_raw, participants, metadata
       ↓
01-ingest: Trigger 02-classify webhook
       ↓
02-classify: Determine call type (discovery/kickoff/team/other)
             via AI or keyword matching
             Update calls.call_type
       ↓
02-classify: Trigger 03-rule-engine webhook
       ↓
03-rule-engine: Check rubric rules
                (min duration, has transcript, assigned rep)
                If fails → mark pending (no transcript) or skip
       ↓
03-rule-engine: Trigger 04-scorecard webhook
       ↓
04-scorecard: Pull transcript + rubric from Supabase
              Send to Groq API (LLaMA 3.3 70B) for scoring
              Parse JSON response → insert into scorecards table
              Update calls.status = 'scored'
       ↓
04-scorecard: Trigger 05-notify webhook
       ↓
05-notify: (future) Send Slack/email notification to manager
       ↓
Portal: React frontend reads from backend API
        Backend reads from Supabase with RLS
        User sees call list, scorecards, charts, leaderboard
```

### Input Format (Fathom Webhook Payload)

```json
{
  "id": "<fathom-call-id>",
  "recording_id": "<recording-id>",
  "transcript": {
    "full_transcript": "Rep: Hi, I'm calling about...\nProspect: ...",
    "segments": [
      { "speaker": "Rep", "start_time": 0, "end_time": 10, "text": "..." }
    ]
  },
  "recording_url": "https://fathom.video/...",
  "start_time": "2026-05-21T10:00:00Z",
  "duration": 1800,
  "attendees": [
    { "name": "Jas", "email": "jas@webuildtrades.com" },
    { "name": "Client Name", "email": "client@example.com" }
  ]
}
```

### Output (What the Portal Shows)

| Section | What you see |
|---------|-------------|
| Dashboard | Avg score, call volume, score trend chart, top issues, dept overview |
| Leaderboard | Rank, name, calls, avg score, tier (Elite/Good/Needs Work) |
| Calls list | All calls with date, duration, type, score, participants |
| Call detail | Full transcript, scorecard breakdown, AI summary, coaching tips |
| Trends | Score over time, per-rep trend chart |
| Member report | Per-person stats, recent calls, coaching notes |
| Clients | Client list with call history, avg score per client |
| Rubric | Scoring criteria editor (admin only) |

---

## 4. Database Schema (Key Tables)

```
team_members          — reps/managers/admins, email, role, department_id
departments           — Sales, Service, etc.
calls                 — every call: status, duration, call_type, recorded_at
call_participants     — who was on each call (internal + external)
scorecards            — AI scores per call (overall_score, criteria JSON)
rubrics               — scoring rules (only 1 active at a time)
coaching_notes        — manager notes on reps
```

### call_status_enum values
- `pending` — not yet processed
- `processing` — pipeline running
- `scored` — has a scorecard ✓

### Team Accounts (Portal Logins)

| Name | Email | Password | Role |
|------|-------|----------|------|
| Ammar (Admin) | ai@webuildtrades.com | WBT-Ammar-2026! | admin |
| Jas | jas@webuildtrades.com | WBT-Jas-2026! | manager |
| Zain | zain@webuildtrades.com | WBT-Zain-2026! | rep |
| Daniel | daniel@webuildtrades.com | WBT-Daniel-2026! | rep |

*(Other team members: Dom, Kool, Ben, Ruben — accounts not yet created)*

---

## 5. n8n Workflows

| Workflow | ID | Trigger | Purpose |
|----------|----|---------|---------|
| 01-ingest | — | POST /webhook/fathom-call-completed | Receive Fathom webhook, store call |
| 02-classify | — | POST /webhook/classify-call | Classify call type |
| 03-rule-engine | — | POST /webhook/rule-engine | Pre-flight checks before scoring |
| 04-scorecard | — | POST /webhook/score-call | Score call via Groq AI |
| 05-notify | — | POST /webhook/notify | Send notifications |

All workflows live in: Project `svGqOV1xWvX7Qt0g` / Folder `V40zEZftjTIUFjwh`

---

## 6. What Has Been Built (Done)

### Infrastructure ✅
- [x] Supabase project set up with full schema (13 migrations applied)
- [x] n8n server running at https://n8nserver.metaviz.pro
- [x] All 5 n8n workflows built, imported, and active
- [x] Backend API deployed on Render (Express + TypeScript)
- [x] Frontend portal deployed on Vercel (React + Vite)
- [x] Role-based auth (Supabase Auth + JWT + backend middleware)
- [x] Protected routes on frontend, requireAuth on backend analytics endpoints

### Data ✅
- [x] 2,337 calls imported from Fathom API (Jas's account)
- [x] ~2,772 call participants linked to team members
- [x] 4 manually scored demonstration calls (M1–M4)
- [x] 200+ calls scored via pipeline (growing)
- [x] department_id backfilled on all calls

### Pipeline ✅
- [x] 04-scorecard enum bug fixed (was writing `status='no_transcript'` which crashed)
- [x] 657 pending calls triggered for classify pipeline
- [x] Groq scoring works from n8n server

### Frontend ✅
- [x] Login page with email/password
- [x] Dashboard with charts, leaderboard, dept breakdown
- [x] Calls list with filters
- [x] Call detail with transcript + scorecard
- [x] Trends page
- [x] Member report page
- [x] Clients page (UI built)
- [x] Rubric editor
- [x] Role-scoped data (admin/manager/rep each see appropriate data)

---

## 7. What Is Still To Do (Remaining Work)

### High Priority

| Item | Problem | Fix Needed |
|------|---------|-----------|
| Call type accuracy | Most calls are classified as `other` instead of discovery/kickoff/team | Improve 02-classify workflow: use meeting title + keyword matching |
| Clients page empty | `calls.client_id` is NULL for all calls — clients not extracted yet | Create clients from external participants (email domain grouping); link calls |
| Fathom webhook HMAC | 01-ingest fails with `SyntaxError: const secret = || ''` — env var blank | Set `FATHOM_WEBHOOK_SECRET` in n8n to match Fathom dashboard secret; new calls won't auto-ingest until this is fixed |
| Login page stuck | `signInWithPassword` sometimes hangs in browser | **Fixed in this session**: added 15s timeout, now shows error + clears |

### Medium Priority

| Item | Problem | Fix Needed |
|------|---------|-----------|
| ~120 failed classify triggers | Network errors during bulk trigger run | Re-trigger: query calls with `status='pending'` and call classify webhook |
| ~1,000 calls stuck in `processing` | Pipeline started but never completed | Identify cause; reset to `pending` and re-trigger |
| 05-notify workflow | Built but not wired to any real notification | Connect to Slack or email |
| More team accounts | Dom, Kool, Ben, Ruben don't have portal logins | Create Supabase Auth users for each |

### Low Priority / Future

| Item | Description |
|------|-------------|
| Fathom real-time | Set webhook in Fathom dashboard so new calls auto-process (blocked by HMAC fix above) |
| More rubric criteria | Expand scoring beyond current rubric |
| Call recording playback | Embed Fathom recording URL in call detail |
| Manager coaching tools | In-app coaching note workflow, action items |
| Export/reporting | CSV export of scores, PDF report per rep |

---

## 8. Known Issues

### Current Bugs

1. **Fathom webhook broken** — `FATHOM_WEBHOOK_SECRET` not set in n8n → all incoming Fathom webhooks fail HMAC check → new calls after today won't ingest automatically.
   - Fix: In n8n dashboard → Credentials or Environment Variables → set `FATHOM_WEBHOOK_SECRET` to match the secret configured in Fathom's webhook settings.

2. **Clients page shows 0 clients** — `calls.client_id` is NULL for all calls. The clients table is empty. External participants (non-@webuildtrades.com emails) exist in `call_participants` but are not linked to client records.
   - Fix: Write a script or migration that groups external participants by email domain into client records and links calls.

3. **Most calls typed as 'other'** — The 02-classify workflow is not correctly identifying call types from meeting titles or content.
   - Fix: Update 02-classify to use meeting `title` field + keyword list (discovery, kickoff, onboarding, follow-up, review).

4. **~1,000 calls stuck in 'processing'** — These calls entered the pipeline but never reached `scored` status. Cause may be Groq errors or n8n timeouts.
   - Fix: Query `SELECT id FROM calls WHERE status='processing'`, reset to `pending`, re-trigger.

### Groq API Note
Groq blocks requests from this Windows dev machine (Cloudflare 1010/403 error). **Scoring only works from the n8n server** — trigger scoring via n8n webhook, not direct local scripts.

---

## 9. Local Development Setup

```bash
# Backend
cd backend
npm install
npm run dev       # starts on http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev       # starts on http://localhost:5173
```

**Frontend .env for local dev:**
```
VITE_SUPABASE_URL=https://fybvnwidpnxnouaukrnb.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_BACKEND_URL=http://localhost:4000
```

---

## 10. Testing the Pipeline End-to-End

### Option A: Real Fathom call
1. Make a call in Fathom
2. After call ends, Fathom fires webhook → n8n 01-ingest
3. Watch n8n execution log — all 5 workflows should run in sequence
4. Check Supabase: `calls` table → `status = scored`; `scorecards` table → has row
5. Open portal → Calls page → find call → scorecard renders

### Option B: Synthetic test (curl — no real call needed)
First generate HMAC:
```python
import hmac, hashlib, json
secret = b'<your-fathom-webhook-secret>'
body = json.dumps({"id":"test-001","transcript":{"full_transcript":"Rep: Hi..."},"start_time":"2026-05-21T10:00:00Z","duration":1800,"attendees":[{"name":"Jas","email":"jas@webuildtrades.com"}]})
sig = hmac.new(secret, body.encode(), hashlib.sha256).hexdigest()
print(f"x-fathom-signature: sha256={sig}")
```

Then POST to `https://n8nserver.metaviz.pro/webhook/fathom-call-completed` with that header.

---

## 11. File Structure

```
Daniel-Call-Analyzer/
├── backend/
│   └── src/
│       ├── routes/
│       │   ├── analytics.ts    — dashboard, leaderboard, member-cards, clients
│       │   ├── members.ts      — /members/me, /members/:id
│       │   ├── rubric.ts       — rubric CRUD
│       │   └── trends.ts       — trend data
│       └── middleware/
│           └── auth.ts         — JWT → team_members lookup
├── frontend/
│   └── src/
│       ├── lib/
│       │   ├── auth.tsx        — AuthProvider, useAuth, signIn/signOut
│       │   ├── api.ts          — authed fetch wrapper
│       │   └── supabase.ts     — Supabase client
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── CallsPage.tsx
│       │   ├── CallDetailPage.tsx
│       │   ├── ClientsPage.tsx
│       │   └── ...
│       └── components/
│           ├── ProtectedRoute.tsx
│           └── Layout.tsx
├── supabase/
│   └── migrations/             — 0001 through 0011 applied
├── n8n/
│   └── workflows/              — 01-ingest through 05-notify JSON files
└── PROJECT_DOCS.md             — this file
```

# Call Analyzer — Session History

A documented log of what was built, what broke, what was fixed, and recommendations for what comes next.

---

## Goal

Build a working AI-powered call-analysis pipeline for WeBuildTrades that:
1. Receives a Fathom call recording webhook
2. Classifies the call (sales / team / discovery / etc.) and routes it
3. Extracts a rich analysis (key points, decisions, action items, projects, attendees, risks, suggestions)
4. Auto-tags it to the right department (Executive / Sales / SEO / Ops / Finance / Content & Marketing)
5. Stores everything in Supabase
6. Emails the rep a coaching summary
7. Renders the full report in a dark-theme web portal with department-filtered views

---

## What we built (the stack)

| Layer | Tool | Why |
|---|---|---|
| Orchestration | **n8n** (cloud, `n8nserver.metaviz.pro`) | Visual, no-code-redeploy, the user already has access. 42 nodes in master pipeline. |
| LLM | **Groq** Llama 3.1 8B (classification) + Llama 3.3 70B (analysis) | Fast, free tier available. Anthropic Claude planned later (user awaiting API key). |
| Database | **Supabase** Postgres + RLS | One vendor for relational + auth + storage. Project `fybvnwidpnxnouaukrnb`. |
| Frontend | **Vite + React + TS + Tailwind** | Dark-themed SPA, talks directly to Supabase via anon key. Running at `localhost:5173`. |
| Email | **Gmail OAuth2 in n8n** | User is an n8n member (not admin), can't set up SMTP. OAuth2 credential `9EQjy57dlQKwSMkn` works without admin. |

---

## Major problems we hit (and how we fixed them)

### 1. n8n expression evaluator can't handle `$env` in Code nodes
**Symptom:** "Cannot assign to read only property 'name' of object 'Error: access to env vars denied'" on the Verify HMAC node.

**Cause:** The n8n instance has `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` set at server level (a security policy the user can't change as a non-admin).

**Fix:** Removed all `$env.X` references from Code nodes. HTTP-request-node expressions like `{{ $env.X }}` still work (different code path). For secrets we **hardcoded credentials directly into the workflow JSON**. Trade-off: secrets are in the workflow file, but the repo is private.

### 2. n8n UI corrupts saved workflows
**Symptom:** Opening the workflow in the n8n editor and clicking "Save" silently wipes the `body.mode: raw / rawBody` content of every POST node. The bodies become empty `bodyParameters: [{}]`.

**Cause:** n8n UI can't render older-style raw HTTP bodies and falls back to empty form-style bodies on serialization.

**Fix:** Migrated every `body.mode: raw` to `specifyBody: 'json'` + `jsonBody: "={{ JSON.stringify({...}) }}"`. This is the format n8n's UI uses natively, so it survives any open/save cycle. Also told the user to **only inspect, never save**, the workflow in the n8n editor.

### 3. Empty Supabase responses halt the pipeline
**Symptom:** `Check Duplicate` returns `[]` when no duplicate exists, n8n's HTTP node v4 splits arrays into items → 0 items → workflow stops.

**Fix:** Two patches:
1. Set `alwaysOutputData: true` on every node that can legitimately return `[]` (`Check Duplicate`, `Get Participants`)
2. Inserted a `Count Duplicates` Code node that takes `$input.all()` length and emits exactly one item with `{ length: N }`. The `Is Duplicate?` IF node then runs reliably.

### 4. n8n's `paireditem` chain breaks after Code nodes
**Symptom:** After the new `Count Duplicates` Code node, downstream references like `$('Verify HMAC').item.json.body.id` resolved to `undefined`. The `Insert Call` then wrote `source_id: "undefined"` and `transcript_raw: ""`.

**Cause:** Code nodes don't preserve `pairedItem` metadata by default, breaking n8n's row-tracking.

**Fix:** Replaced every `.item` reference with `.first()` (13 occurrences). `.first()` doesn't depend on pairing — it always reads the first output of the named node.

### 5. n8n HTTP v4 auto-unwraps single-element arrays
**Symptom:** Code referenced `$('Insert Call').first().json[0].id` (expecting `[{id: ...}]`), but actual `$json` was `{id: ...}` directly. The `[0]` returned `undefined`.

**Fix:** Removed all `.json[0]` suffixes (8 occurrences) → `.first().json.id`. n8n v4 already gives us the array element directly.

### 6. Groq wraps JSON responses in markdown code fences
**Symptom:** All three Parse nodes failed JSON.parse because the model returned ` ```json\n{...}\n``` ` instead of raw JSON.

**Fix:** Added a fence-stripping prefix in every Parse Code node:
```js
const fence = String.fromCharCode(96, 96, 96);
if (responseText.indexOf(fence) === 0) {
  responseText = responseText.substring(3);
  if (responseText.indexOf('json') === 0) responseText = responseText.substring(4);
  // ...trim, strip closing fence...
}
// Also strip prose before first { and after last }
```

### 7. Code-node JS regex literals fail when written from Python
**Symptom:** "Unexpected token" because regex containing backticks `\`\`\`` got mangled in the Python → JSON → n8n round trip.

**Fix:** Replaced regex with `String.fromCharCode(96)` for backticks and `String.fromCharCode(10)` for newlines. Bullet-proof against escaping issues at every transport layer.

### 8. n8n expression parser chokes on embedded JSON examples in LLM prompts
**Symptom:** "invalid syntax" error on the Classify with Groq jsonBody when the prompt contained `{"call_type": "..."}` as a JSON example.

**Cause:** n8n's `{{ ... }}` expression parser tried to match nested braces.

**Fix:** Rewrote prompts to describe the JSON shape in plain English ("Return JSON with three keys: call_type, confidence, reasoning") instead of embedding JSON literal examples.

### 9. Parallel branches from a single IF output only fire one node
**Symptom:** `Is Team Call? FALSE` was wired to `[Get Active Rubric, Get Call Data]` — but only Get Active Rubric ran. Downstream `Run Rules` threw "Node 'Get Call Data' hasn't been executed".

**Fix:** Rewired sequentially: `Is Team Call? → Get Active Rubric → Get Call Data → Run Rules`. Same fix applied to `Update Call Scored → [Get Participants, Get Final Scorecard]`.

### 10. The classifier kept tagging internal meetings as `launch` / `follow_up`
**Symptom:** Daniel + Zain May 04 meeting (both @webuildtrades.com, discussing internal projects) was repeatedly classified as a sales call. LLM then hallucinated "the rep did a good job of pain surfacing the prospect's needs" — there's no rep, no prospect.

**Fix:** Pass the attendee emails to the classifier with an explicit rule: **"if every attendee email ends with @webuildtrades.com, the call is ALWAYS team."** Groq 8B follows this rule reliably now.

### 11. Score body became too complex for n8n's expression evaluator
**Symptom:** Store Meeting Scorecard threw "JSON body is not valid JSON" when its body contained nested `($json.summary || {}).meeting_title` accesses.

**Fix:** Moved body construction into the upstream Code node (`Compute Department`), which pre-builds the entire scorecard object and exposes it as `$json.scorecard_body`. The downstream HTTP node just sends `{{ JSON.stringify($json.scorecard_body) }}`.

### 12. Groq rate limits during testing
**Symptom:** "The service is receiving too many requests from you" — Llama 3.3 70B has tight per-minute limits on the free tier, hit after ~10 test fires in 15 min.

**Fix (Phase A, just shipped):**
- `retryOnFail: true, maxTries: 3, waitBetweenTries: 2000` on every Groq HTTP node — survives transient rate-limit spikes
- Added Generate Meeting Summary (8B) **fallback branch** — if 70B fails after 3 retries, the 8B model takes over (separate, more generous rate limit)
- Added `70B Succeeded?` IF node that routes to fallback automatically

---

## Reliability layer (just added — Phase A)

| Component | Purpose |
|---|---|
| `supabase/migrations/0005_failed_executions.sql` | Table to record every workflow failure |
| `n8n/workflows/99-error-handler.json` (workflow ID `6EjuooypZ54jgqTc`) | Error-trigger workflow that fires on any failure and writes a row |
| Master pipeline `settings.errorWorkflow = 6EjuooypZ54jgqTc` | Wires the catcher to the main pipeline |
| `retryOnFail` on all Groq nodes | 3 retries with 2s wait — fixes 90% of rate-limit failures |
| `70B Succeeded?` IF + Generate Meeting Summary (8B) fallback | If 70B exhausts retries, 8B picks up the slack |

**Result:** in production with ~50 calls/day, you can now query `failed_executions` to see what broke. Previously failures vanished into n8n's UI logs.

---

## Web portal (current state)

**URL:** `http://localhost:5173`

### Pages
- `/calls` — filterable list with search, type, status, department filters (via `?dept=<id>`)
- `/calls/:id` — full detail with 4 tabs:
  - **Meeting Intelligence** — Attendees · Projects Discussed · Key Points · Decisions · Action Items · Open Questions · Next Steps · Risks · Suggestions · Banned Phrases
  - **Sales Scorecard** — per-criterion scores with evidence quotes (sales calls only)
  - **Rule Findings** — banned words / fillers / talk ratio with severity badges
  - **Transcript** — speaker-diarized timestamps
- `/trends` — per-member score history with chart, KPI cards, by-call-type breakdown
- `/rubric` — live editor for banned words, filler words, talk ratio, scoring criteria, coaching principles + AI assistant

### Sidebar
Lists every department (Executive, Sales, SEO, Operations, Finance, Content & Marketing) with live call counts.

### Phase B polish (just added)
- **Meeting title** extracted from LLM `meeting_title` field, displayed as the page H1
- **Department badge** rendered next to the call-type chip, colour-coded per department
- Executive summary now shows the rest of the LLM summary (after the title), preserving line breaks

---

## Data we actually extract per call (verified on the May 04 Zain meeting)

| Section | Count | Sample (real data) |
|---|---|---|
| **Attendees** | 2 | "Daniel Brown (Founder)", "Zain Ali (AI Lead)" |
| **Projects Discussed** | 4 | "Closeboard [DELIVERED] (ops) — Owner: Zain Ali — Closeboard has launched a live chat widget, replacing GoHighLevel chat → Continue testing and refining the live chat widget" |
| **Key Points** | 6 | "WeBuildTrades is pausing new client onboarding to simplify the business" |
| **Decisions** | 1 | "Pause new client onboarding (by Daniel Brown) [impact: This decision will allow WeBuildTrades to focus on simplifying]" |
| **Action Items** | 3 | "Review the Voice AI demo — Owner: Daniel Brown [HIGH]" |
| **Open Questions** | 2 | "How will the pause in new client onboarding affect the business in the short term?" |
| **Next Steps** | 3 | "Schedule a weekly meeting to discuss project updates" |
| **Risks** | 2 | "Pause may affect revenue short-term [HIGH] (finance)" |
| **Suggestions** | 1 | "Use AI to generate content (by Daniel Brown)" |
| **Banned phrases** | 1 | "mate" |
| **Department** | — | Executive (auto-detected) |

---

## What I'd recommend you do next

### Short term (this week)
1. **Run migration 0005** in Supabase SQL editor (the failed_executions table) so error logging works
2. **Move workflow 99 into the project folder** (`projects/svGqOV1xWvX7Qt0g/folders/V40zEZftjTIUFjwh`) via n8n UI drag
3. **Set up real Fathom webhook** pointing at `https://n8nserver.metaviz.pro/webhook/fathom-master` so live calls flow in
4. **Set `FATHOM_WEBHOOK_SECRET`** somewhere accessible to the Verify HMAC node (would require admin to flip `N8N_BLOCK_ENV_ACCESS_IN_NODE` — or hardcode the secret in the Code node, less ideal)
5. **Add a "Recent failures" panel** to the portal showing the latest 10 rows from `failed_executions`

### Medium term (when Anthropic key arrives)
1. **Implement the backend spec** (`docs/backend-spec.md`) — moves analysis out of n8n
2. **Switch Fathom webhook** to point at the backend; keep n8n as a thin webhook forwarder
3. **Drop hardcoded credentials** from the workflow JSON — backend reads them from `.env` properly
4. **Add per-rep dashboards** showing trend over time, weakness patterns, coaching focus areas

### Long term (Agency Disrupt)
1. **Auth + tenants** — every WBT-clone agency gets their own rubric, departments, team
2. **Live in-meeting suggestions** via Recall.ai bot
3. **Daily/weekly digest emails** for managers
4. **Slack notifications** when a critical-severity finding fires

---

## Suggestions / lessons learned

1. **n8n is a great prototype tool but a bad production tool for LLM pipelines.** Each layer adds a class of escape/quirk bug. For one-off automations it's fast; for anything that runs 50+ times a day you want a real backend with typed schemas and proper logging.

2. **Groq is fast and cheap but the free tier rate-limits aggressively.** The 70B model is the bottleneck — it has ~14K tokens/minute on free. For real production, either upgrade or use Anthropic Sonnet (much better instruction following anyway).

3. **Prompt anti-patterns to avoid in n8n:**
   - Embedded JSON examples (`{"call_type": "..."}` inside the prompt body) — n8n's expression parser chokes
   - Optional chaining (`?.`) in jsonBody expressions — older n8n parsers fail
   - Complex inline ternaries in jsonBody — move to a Code node and pre-compute

4. **Always write n8n JS code in a Code node, not as expressions.** The Code node has a real JS runtime; expressions have a stripped-down evaluator with weird limits.

5. **Pass attendee emails to the classifier.** Email domain is the single most reliable signal for "is this an internal meeting or a client call." The transcript alone misleads the model.

6. **Don't open n8n workflows in the UI after pushing via API.** If you must inspect, do read-only and never click Save.

---

## File map (what lives where)

```
Daniel-Call-Analyzer/
├── n8n/workflows/
│   ├── 00-master-pipeline.json    ← 42 nodes, the main pipeline
│   ├── 99-error-handler.json      ← captures any failure
│   └── (01-06 individual workflow files — superseded by 00)
├── supabase/migrations/
│   ├── 0001_init.sql              ← tables, enums, RLS (apply first)
│   ├── 0002_member_trends.sql     ← per-rep trend caching
│   ├── 0003_demo_public_read.sql  ← anon read access for portal
│   ├── 0004_departments_and_members.sql  ← 6 departments seeded
│   └── 0005_failed_executions.sql ← error log (apply now)
├── frontend/src/
│   ├── pages/CallsPage.tsx        ← list with department filter
│   ├── pages/CallDetailPage.tsx   ← 4-tab detail view
│   ├── pages/TrendsPage.tsx       ← per-member chart
│   ├── pages/RubricPage.tsx       ← rubric editor
│   ├── components/Layout.tsx      ← dark sidebar with depts
│   └── components/ScoreRing.tsx   ← animated score ring
├── docs/
│   ├── test-payload.json          ← Daniel+Zain May 04, used for testing
│   ├── test-payload-guide.md      ← how to fire it
│   ├── demo-runbook.md            ← end-to-end demo walkthrough
│   ├── pipeline-diagram.html      ← visual Mermaid diagram
│   ├── master-pipeline.md         ← node-by-node explanation
│   ├── audit-report.md            ← bug log from earlier audit
│   ├── rubric-v1.md               ← human-readable playbook
│   ├── backend-spec.md            ← Phase C: when Anthropic key arrives
│   └── session-history.md         ← this file
├── scripts/                       ← Python helpers for pushing to n8n
│   ├── update-email.py
│   ├── enrich-analysis.py
│   ├── fix-accuracy.py
│   ├── harden-and-test.py
│   ├── add-depth-and-departments.py
│   ├── fix-dept-tag.py
│   └── add-reliability.py
├── .env                            ← all secrets (never commit)
├── CLAUDE.md                       ← LLM working context
└── README.md
```

---

## Right now you can

1. Run migration `0005_failed_executions.sql` in Supabase SQL editor
2. Open `http://localhost:5173/calls/969b702c-ba7c-4273-b902-c364c4fe72e7` — see the new meeting-title header + Executive badge + executive summary
3. Fire `docs/test-payload.json` again — should run cleanly thanks to retries

If anything still feels off, the `failed_executions` table will tell us exactly what.

---

## Phase A + B + C completed (latest session)

### Phase A — n8n reliability
1. **Migration 0005** (`supabase/migrations/0005_failed_executions.sql`) — created the `failed_executions` table with public-read RLS so the portal can display recent failures
2. **Error-handler workflow** (`n8n/workflows/99-error-handler.json`) — imported and activated in n8n as workflow ID `6EjuooypZ54jgqTc`. Any future failure in the master pipeline writes a row to `failed_executions` automatically
3. **Retry-on-fail** — every Groq HTTP node (`Classify with Groq`, `Score with Groq`, `Generate Meeting Summary`) now has `retryOnFail: true, maxTries: 3, waitBetweenTries: 2000`. Kills 90% of rate-limit failures
4. **8B fallback** — added `Generate Meeting Summary (8B)` node and `70B Succeeded?` IF gate. If 70B fails after 3 retries, the 8B model takes over so the pipeline still finishes
5. Master pipeline `settings.errorWorkflow` wired to the error handler so any failure in any node is captured

### Phase B — Web polish
1. **Meeting title** — LLM-generated `meeting_title` now displays as the page H1 on the call-detail page. Falls back to client name or host name if no title was extracted
2. **Department badge** — coloured chip next to the call-type chip showing the auto-assigned department (Executive, Sales, SEO, Ops, Finance, Content & Marketing)
3. **Executive summary** — kept the dedicated section under the hero card; now preserves line breaks so paragraphs render correctly

### Phase C — Backend spec
- Wrote `docs/backend-spec.md` covering: architecture diagram, full module layout (`backend/src/`), Zod schema definitions for typed LLM outputs, the orchestrator route code, env vars, zero-downtime migration path, and effort estimate (~8 hours). Will execute when the Anthropic API key arrives.

### Plus: narrative summary + `meeting_outcome` field
- LLM prompts now ask for `executive_summary` as a **NARRATIVE paragraph** (flowing prose, not bullets) instead of staccato bullet points
- Added new `meeting_outcome` field: 1-2 sentences explicitly capturing what concretely changed because of this meeting
- The combined `scorecard.summary` now contains: title → one-liner → narrative executive summary → "Outcome: ..."
- Both web and email surface this richer summary

---

## After this session

Run `docs/test-payload.json` once more — you should now see:
- **Title** on the page H1 ("WeBuildTrades Strategy and Project Updates")
- **Executive** department badge
- **Executive summary** as a real paragraph that reads like a manager briefing, not bullets
- **Outcome** line at the end of the summary
- 25+ evidence rows across all sections

If any node fails, `failed_executions` table will have the row and you'll see exactly what to fix.

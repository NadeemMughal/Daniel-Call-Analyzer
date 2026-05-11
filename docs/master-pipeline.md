# Master Pipeline — Full Documentation

**File:** `n8n/workflows/00-master-pipeline.json`  
**n8n ID:** `Z1WdzpBv7u1DjB2L`  
**Webhook entry point:** `POST /webhook/fathom-master`

This is the single-canvas version of the entire Call Analyzer pipeline. Every node that previously lived across 6 separate workflows (01–06) exists here in one place. You can use this for monitoring, debugging, and understanding the full flow at a glance.

---

## Pipeline at a Glance

```
Fathom Call Ends
      │
      ▼
[INGEST] Receive → Verify → Deduplicate → Store
      │
      ▼
[CLASSIFY] Groq 8B → Identify call type
      │
      ├── call_type = "team" ──────────────────────────────────────────────────┐
      │                                                                         │
      └── call_type = sales/discovery/etc                                       │
              │                                                                 │
      ┌───────┴───────┐                                                        │
      ▼               ▼                                                        │
[RULE ENGINE]   [LLM SCORECARD]                                          [MEETING SUMMARY]
  Banned words    Groq 70B                                                 Groq 70B
  Filler words    Score 0–10                                               Key points
  Talk ratio      Evidence quotes                                          Action items
      │               │                                                   Decisions
      └───────┬────────┘                                                        │
              ▼                                                                  │
      Update call → "scored" ◄──────────────────────────────────────────────────┘
              │
              ▼
[NOTIFY] Build email → Send per participant
              │
              ▼
          Respond 200
```

---

## Section 1 — Ingest (Nodes 1–5)

### Node 1: Fathom Webhook
**Type:** Webhook (POST)  
**Path:** `/webhook/fathom-master`

This is the entry point of the entire pipeline. Fathom calls this URL automatically whenever a recorded call ends. The payload contains:
- `body.id` — Fathom's unique call ID (used for deduplication)
- `body.transcript.full_transcript` — full plain-text transcript
- `body.transcript.segments` — speaker-diarized segments with timestamps
- `body.recording_url` — link to the audio file
- `body.start_time` — when the call started (ISO datetime)
- `body.duration` — call length in seconds

**Why it exists:** Fathom is the source of all calls. Every recording automatically flows into the system without any manual upload step.

---

### Node 2: Verify HMAC
**Type:** Code (JavaScript)

Verifies the `x-fathom-signature` header on the incoming webhook request using HMAC-SHA256 against the `FATHOM_WEBHOOK_SECRET` environment variable.

```
Expected: sha256=HMAC(secret, body)
Actual:   x-fathom-signature header value
```

If the secret is set and the signatures don't match, the node **throws an error** and the workflow stops — no data is processed.

If `FATHOM_WEBHOOK_SECRET` is empty (not yet configured), the check is skipped and all requests pass through.

**Why it exists:** Prevents anyone who knows your webhook URL from injecting fake calls into the system.

---

### Node 3: Check Duplicate
**Type:** HTTP Request → Supabase REST API

```
GET /rest/v1/calls?source_id=eq.{fathom_call_id}&select=id
```

Queries the `calls` table to see if a row already exists with the same `source_id` (Fathom's call ID).

Returns: an array. If length > 0, this call was already processed.

**Why it exists:** Fathom can sometimes fire the webhook more than once for the same call (retries on timeout, server restarts). Without this check, the same call would be scored twice and two sets of scorecards/findings would be created.

---

### Node 4: Is Duplicate? (IF node)
**Condition:** `$json.length === 0` (TRUE = not a duplicate, proceed)

- **TRUE branch (not seen before):** → Insert Call
- **FALSE branch (already exists):** → Respond 200 Duplicate (silently skip)

---

### Node 5: Insert Call
**Type:** HTTP Request → Supabase REST API

```
POST /rest/v1/calls
```

Creates the initial row in the `calls` table with status `"pending"`. Stores:

| Field | Value | Source |
|---|---|---|
| `source` | `"fathom"` | hardcoded |
| `source_id` | Fathom call ID | `body.id` |
| `status` | `"pending"` | hardcoded |
| `transcript_raw` | Full plain text | `body.transcript.full_transcript` |
| `transcript_segments` | Speaker-diarized JSON | `body.transcript.segments` |
| `audio_url` | Recording link | `body.recording_url` |
| `recorded_at` | Call start datetime | `body.start_time` |
| `duration_seconds` | Length in seconds | `body.duration` |

Returns the new row with its UUID `id` — this `call_id` is passed to every subsequent node.

---

## Section 2 — Classify (Nodes 6–9)

### Node 6: Classify with Groq
**Type:** HTTP Request → Groq API  
**Model:** `llama-3.1-8b-instant`  
**Max tokens:** 300

Sends the first **2,000 characters** of the transcript to Groq with a system prompt describing the 6 call types:

| Type | Description |
|---|---|
| `discovery` | First call with a new prospect |
| `ads_intro` | Introducing Facebook/Google ads |
| `launch` | Onboarding/launch call with new client |
| `follow_up` | Follow-up with existing client |
| `team` | Internal team meeting, no prospect |
| `other` | Anything else |

Uses the fast, cheap 8B model because classification only needs the opening ~2 minutes of the transcript — no deep reasoning required.

**Response format (JSON):**
```json
{
  "call_type": "discovery",
  "confidence": 0.92,
  "reasoning": "Prospect introduced themselves and asked about pricing"
}
```

---

### Node 7: Parse Classification
**Type:** Code (JavaScript)

Parses the Groq JSON response. If parsing fails or returns an unknown type, it falls back to `"other"`. Attaches `call_id` (from the Insert Call node) to the output so all downstream nodes know which call they're working on.

---

### Node 8: Update Call Type
**Type:** HTTP Request → Supabase REST API

```
PATCH /rest/v1/calls?id=eq.{call_id}
Body: { "call_type": "discovery", "status": "processing" }
```

Updates the `calls` row with the detected call type and moves status from `pending` → `processing`. This is what you see in the portal when a call shows "processing".

---

### Node 9: Is Team Call? (IF node)
**Condition:** `call_type === "team"`

This is the pipeline's main branch point:

- **TRUE (team call):** → Meeting Summary branch (Nodes 22–26)
- **FALSE (client call):** → Sales analysis branch (Nodes 10–21)

**Why the split:** Team meetings have no prospect to score against a sales rubric. They need a different kind of output: action items, decisions, and meeting notes — not a 0–10 score.

---

## Section 3A — Sales Branch: Rule Engine (Nodes 10–15)

*This section runs in parallel with the LLM Scorecard (Nodes 16–21).*

### Node 10: Get Active Rubric
**Type:** HTTP Request → Supabase REST API

```
GET /rest/v1/rubrics?is_active=eq.true&limit=1
```

Fetches the currently active rubric from the database. The rubric is stored as JSON and contains:
- `banned_words` — words not allowed on certain call types
- `filler_words` — overused words with count thresholds
- `talk_ratio` — maximum percentage the rep should speak
- `scoring_criteria` — criteria for the LLM scorecard
- `coaching_principles` — guiding context for LLM feedback

**Why from the database:** The rubric is editable from the UI (Rubric Editor page). Daniel can add new banned words, change filler thresholds, or adjust scoring weights without touching any code.

---

### Node 11: Get Call Data
**Type:** HTTP Request → Supabase REST API

Fetches the full call row including `transcript_segments` (the diarized array). This is needed by the rule engine to identify which speaker is the rep.

---

### Node 12: Run Rules
**Type:** Code (JavaScript) — *No LLM, pure deterministic logic*

This is the most complex code node. It runs three checks:

#### Rule 1 — Banned Words
```
For each banned word in the rubric:
  1. Check if this call type is in the word's applies_to list
  2. Count occurrences (whole-word regex, case-insensitive)
  3. If count > 0 → create finding with coaching suggestion
```

**Example:** "mate" is banned on `discovery` and `ads_intro` calls. If the rep says it 3 times on a discovery call, a `critical` finding is created: *"Do not use the word 'mate' on discovery calls. It removes your authority and expert positioning. You said it 3 times on this call."*

#### Rule 2 — Filler Words
```
For each filler word in the rubric:
  1. Count occurrences in the rep's speech
  2. If count > threshold → create finding
```

**Example:** "um" has a threshold of 5. If the rep says it 11 times, a `warning` finding is created with context snippets of where it was used.

#### Rule 3 — Talk Ratio
```
1. Identify the rep (speaker labelled "host", or first speaker)
2. Sum up seconds where the rep was talking
3. Calculate: rep_seconds / total_seconds * 100
4. If > max_rep_percentage (default 60%) → create finding
```

**Example:** Rep talked for 72% of a 45-minute discovery call. Finding: *"You spoke for 72% of this call — target is under 60%. Ask a question, then stop talking."*

Each finding is stored with:
- `rule_key` — e.g. `banned_word_mate`, `filler_word_um`, `talk_ratio`
- `value` — count, percentage, suggestion text
- `severity` — `critical`, `warning`, or `info`
- `context_snippets` — exact quotes from the transcript where the issue occurred

---

### Node 13: Has Findings? (IF node)
**Condition:** `$json.__no_findings !== true`

- **TRUE (has findings):** → Build Findings Array → Insert Rule Findings → Score with Groq
- **FALSE (no violations):** → Score with Groq (skip the insert step)

---

### Node 14: Build Findings Array
**Type:** Code (JavaScript)

Collects all the individual finding items into a single array for batch insert into Supabase.

---

### Node 15: Insert Rule Findings
**Type:** HTTP Request → Supabase REST API

```
POST /rest/v1/rule_findings
Body: [array of finding objects]
```

Bulk inserts all findings into the `rule_findings` table. These are what appear as the red/orange coaching badges in the portal and email.

---

## Section 3B — Sales Branch: LLM Scorecard (Nodes 16–21)

*Runs after rule findings are inserted (sequential in master workflow).*

### Node 16: Score with Groq
**Type:** HTTP Request → Groq API  
**Model:** `llama-3.3-70b-versatile`  
**Max tokens:** 4,000

Sends the **full transcript** + **full rubric** to the 70B model. The system prompt:
1. Tells the model it's a WeBuildTrades sales coach
2. Injects the entire active rubric as JSON (scoring criteria + weights + coaching principles)
3. Instructs the model to score each criterion 0–10 with a weighted overall score
4. Requires exact transcript quotes as evidence for every strength and improvement

**Why 70B not 8B:** The scorecard requires deep reasoning across a full transcript (often 40–60 minutes of speech). It needs to identify subtle patterns like whether the rep asked follow-up questions, whether they introduced the solution too early, how they handled objections. The 8B model lacks the nuance for this.

**Response format (JSON):**
```json
{
  "overall_score": 7.2,
  "summary": "Ben showed strong rapport-building but introduced pricing before surfacing the prospect's full pain...",
  "strengths": [
    {
      "criterion": "question_stack",
      "score": 8,
      "description": "Consistently asked follow-up questions after initial answers",
      "evidence_quote": "So when you say leads are inconsistent — what does that look like week to week?",
      "timestamp_seconds": 342
    }
  ],
  "improvements": [
    {
      "criterion": "solution_timing",
      "score": 4,
      "description": "Solution was introduced at minute 8, before pain was fully explored",
      "evidence_quote": "Our Facebook ads package starts at £1,500/month...",
      "timestamp_seconds": 487
    }
  ]
}
```

---

### Node 17: Parse Scorecard
**Type:** Code (JavaScript)

Parses the Groq response. Validates required fields, rounds `overall_score` to 1 decimal place, and collects all evidence quotes into a flat array (`all_evidence`) for batch insertion.

---

### Node 18: Insert Scorecard
**Type:** HTTP Request → Supabase REST API

```
POST /rest/v1/scorecards
```

Inserts the scorecard row with:
- `call_id`, `rubric_id` — foreign keys
- `overall_score` — e.g. 7.2
- `summary` — 2–3 sentence coaching summary
- `strengths` — JSON array (criterion, score, description, evidence_quote, timestamp)
- `improvements` — JSON array (same structure)
- `llm_model` — `"llama-3.3-70b-versatile"` (audit trail — if you ever switch models, old scorecards are still attributed correctly)

Returns the new row with its UUID `id` — used to insert evidence in the next step.

---

### Node 19: Build Evidence Array
**Type:** Code (JavaScript)

Maps each strength and improvement that has an `evidence_quote` into a flat `scorecard_evidence` row: `{ scorecard_id, criterion_key, quote, timestamp_seconds }`.

---

### Node 20: Has Evidence? (IF node)
**Condition:** `$json.__skip_evidence !== true`

- **TRUE:** → Insert Evidence
- **FALSE (no quotes):** → Update Call Scored (skip insert)

---

### Node 21: Insert Evidence
**Type:** HTTP Request → Supabase REST API

```
POST /rest/v1/scorecard_evidence
Body: [array of evidence rows]
```

These rows power the "quoted evidence" blocks shown in the portal's call detail view — the exact sentences from the transcript that support each score.

---

## Section 3C — Team Branch: Meeting Summary (Nodes 22–26)

*Only runs when `call_type === "team"`.*

### Node 22: Generate Meeting Summary
**Type:** HTTP Request → Groq API  
**Model:** `llama-3.3-70b-versatile`  
**Max tokens:** 3,000

Sends the full transcript to Groq with a different system prompt — this one acts as a meeting intelligence agent, not a sales coach. It extracts:

| Field | Description |
|---|---|
| `title` | Short meeting title (5–8 words) |
| `one_line_summary` | Single sentence: what was decided |
| `key_points` | Bullet list of important updates/decisions |
| `decisions_made` | Each decision with who decided it and why |
| `action_items` | Tasks with owner name, due date, priority |
| `improvements_suggested` | Process suggestions raised in the meeting |
| `open_questions` | Questions raised but not answered |
| `next_meeting_topics` | What to cover next time |

---

### Node 23: Parse Meeting Summary
**Type:** Code (JavaScript)

Parses the JSON response and ensures all array fields exist (even if empty). Prevents downstream errors if the model omits a field.

---

### Node 24: Store Meeting Scorecard
**Type:** HTTP Request → Supabase REST API

Stores the meeting summary *as a scorecard row* (reusing the same table, `overall_score = null`). This means the portal can display meeting summaries using the same UI components as sales scorecards — just without a numeric score.

`strengths` = key points, `improvements` = improvements suggested.

---

### Node 25: Store Meeting Evidence
**Type:** Code (JavaScript)

Converts action items, decisions, and open questions into `scorecard_evidence` rows with `criterion_key` values of `action_item`, `decision`, and `open_question`. This allows the portal to display them as structured blocks rather than raw text.

---

### Node 26: Insert Meeting Evidence
**Type:** HTTP Request → Supabase REST API

Bulk inserts the meeting evidence rows.

---

## Section 4 — Converge + Notify (Nodes 27–33)

Both the sales branch and team branch merge here.

### Node 27: Update Call Scored
**Type:** HTTP Request → Supabase REST API

```
PATCH /rest/v1/calls?id=eq.{call_id}
Body: { "status": "scored" }
```

Moves the call status from `"processing"` → `"scored"`. This is what triggers the green "Scored" badge to appear in the portal. Also marks the pipeline as complete from an audit perspective.

---

### Node 28: Get Participants
**Type:** HTTP Request → Supabase REST API

```
GET /rest/v1/call_participants
  ?call_id=eq.{call_id}
  &is_external=eq.false
  &select=*,team_members(name,email,role)
```

Fetches all **internal** participants (WeBuildTrades team members, not the client/prospect). For each participant, it joins in the `team_members` record to get their name and email address.

**Why only internal:** The client/prospect should not receive the rep's coaching scorecard.

---

### Node 29: Get Final Scorecard
**Type:** HTTP Request → Supabase REST API

Fetches the scorecard that was just created (ordered by `created_at desc`, limit 1). This is passed to the email builder.

---

### Node 30: Build Email List
**Type:** Code (JavaScript)

For each internal participant with a valid email address, builds a personalised email payload:
- `to` — participant email
- `name` — participant name
- `overall_score` — numeric score (or null for team calls)
- `summary` — coaching summary sentence
- `strengths` — top 3 strengths
- `improvements` — top 3 improvements
- `portal_url` — direct link to the call detail page (`/calls/{call_id}`)

If no scorecard exists or no valid email addresses are found, returns a skip flag.

---

### Node 31: Has Recipients? (IF node)
**Condition:** `!$json.__no_recipients && !$json.__no_scorecard`

- **TRUE:** → Send Email (one execution per recipient)
- **FALSE:** → Respond 200 (nothing to send)

---

### Node 32: Send Email
**Type:** Email Send (SMTP)

Sends an HTML coaching email to each rep. The email contains:
- Overall score badge
- 2–3 sentence coaching summary
- Top 3 strengths with descriptions
- Top 3 improvements with descriptions
- "View Full Scorecard" CTA button linking to the portal

*Requires SMTP credential to be configured in n8n.*

---

### Node 33: Respond 200
**Type:** Respond to Webhook

Returns `{ "ok": true, "call_id": "...", "call_type": "..." }` to Fathom, completing the webhook handshake.

Fathom expects a 2xx response within its timeout window. Responding here (after the full pipeline) tells Fathom the call was successfully processed.

---

## Node 34: Respond 200 Duplicate

Returns `{ "ok": true, "duplicate": true }` when the call was already processed. Fathom gets a valid response, no duplicate work is done.

---

## Environment Variables Used

| Variable | Used By | Description |
|---|---|---|
| `FATHOM_WEBHOOK_SECRET` | Node 2 | HMAC signature verification |
| `SUPABASE_URL` | Nodes 3,5,8,10,11,15,18,21,24,26,27,28,29 | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Same nodes | Bypasses RLS — n8n has full DB access |
| `GROQ_API_KEY` | Nodes 6,16,22 | Groq API authentication |
| `PORTAL_URL` | Node 30 | Base URL for the frontend portal |

---

## Data Flow Summary

```
calls table
  └── id, source_id, call_type, status, transcript_raw, transcript_segments

rule_findings table
  └── call_id, rule_key, value (JSON with suggestion), severity, context_snippets

scorecards table
  └── call_id, rubric_id, overall_score, summary, strengths (JSON), improvements (JSON)

scorecard_evidence table
  └── scorecard_id, criterion_key, quote, timestamp_seconds
```

---

## Timing (approximate per call)

| Step | Time |
|---|---|
| Ingest + Dedup | < 1 second |
| Classification (8B) | 1–2 seconds |
| Rule Engine | < 1 second |
| LLM Scorecard (70B, long transcript) | 8–20 seconds |
| Email send | 1–2 seconds |
| **Total** | **~15–25 seconds per call** |

---

## Key Design Decisions

1. **Rubric lives in the DB, not the prompt** — Daniel can change banned words, filler thresholds, and scoring criteria from the UI. No redeployment needed. Historical scorecards keep a reference to the rubric version they used.

2. **Rule engine is pure JS (no LLM)** — Word counts and talk ratios are deterministic. Using an LLM for these would be slower, more expensive, and less accurate.

3. **Two LLM calls, two models** — 8B for fast/cheap classification, 70B for deep coaching analysis. Using 70B for classification would waste ~10x the cost and add latency.

4. **Evidence quotes are required** — The LLM scorecard system prompt explicitly demands exact transcript quotes for every strength and improvement. Vague feedback like "good listening skills" is useless to a rep. Feedback needs to be anchored to a real moment in the call.

5. **Team calls get a different pipeline** — A sales rubric scoring a team meeting would produce meaningless output. Meeting summary extracts actionable value (decisions, action items) instead.

6. **Status progression** — `pending` → `processing` → `scored` (or `failed`). The portal can show exactly what stage a call is at, and the system avoids re-processing calls that are already being handled.

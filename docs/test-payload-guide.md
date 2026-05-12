# Test Payload — How to Use

This payload simulates a Fathom webhook for the **May 04 Impromptu Zoom Meeting** (Daniel Brown + Zain Ali, 56 min).

It is a **team call** — so when you fire it, the pipeline will route through **06-meeting-summary** and produce:
- Meeting title
- Key decisions made
- Action items (with owner names)
- Open questions

---

## What the payload contains

| Field | Value |
|---|---|
| Fathom call ID | `660416881` |
| Duration | `3360` seconds (56 minutes) |
| Speakers | Daniel Brown, Zain Ali |
| Call type | `team` (internal — no prospect) |
| Start time | `2025-05-04T09:00:00Z` |
| Transcript segments | 28 segments with timestamps |

---

## Option 1 — n8n Webhook Test Panel (easiest)

1. Open n8n → workflow **01 - Ingest Fathom Call** (or **00 - Master Pipeline**)
2. Click the **Webhook** node
3. Click **"Listen for test event"**
4. In Postman or the curl command below, POST the payload to the **test URL** shown in n8n
5. n8n will capture it and you can step through the execution

### curl command

```bash
curl -X POST https://n8nserver.metaviz.pro/webhook-test/fathom-call-completed \
  -H "Content-Type: application/json" \
  -d @docs/test-payload.json
```

> **Note:** The test URL uses `/webhook-test/` not `/webhook/`. The production URL is `/webhook/fathom-call-completed`.

---

## Option 2 — Fire directly at production webhook

Only do this after Supabase migrations are applied. This will write real rows to the database.

```bash
curl -X POST https://n8nserver.metaviz.pro/webhook/fathom-call-completed \
  -H "Content-Type: application/json" \
  -d @docs/test-payload.json
```

---

## Option 3 — Postman

1. Method: `POST`
2. URL: `https://n8nserver.metaviz.pro/webhook-test/fathom-call-completed`
3. Headers: `Content-Type: application/json`
4. Body: Raw JSON → paste contents of `test-payload.json`

---

## HMAC signature (optional)

`FATHOM_WEBHOOK_SECRET` is currently **empty**, so the HMAC check is **disabled** — no signature header is needed.

When you set the secret, generate the header like this:

```bash
# Generate signature
SECRET="your-secret-here"
BODY=$(cat docs/test-payload.json)
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
echo $SIG

# Then add header:
# -H "x-fathom-signature: $SIG"
```

Or in Node.js:
```js
const crypto = require('crypto');
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
```

---

## What to expect after firing

### Pipeline route

```
Webhook → Verify HMAC (skip, no secret) → Check Duplicate → Insert Call
→ Trigger Classify (02) → Classify with Groq → call_type: "team"
→ Trigger Meeting Summary (06)
→ Groq Llama 3.3 70B extracts:
    - Title: "WeBuildTrades AI Strategy & Project Updates"
    - Key points: AI transition, Closeboard, Voice AI, SEO automation, Call Analyzer
    - Decisions made: Pause WBT onboarding / waitlist; Pause Discovery Call Prep
    - Action items: 10+ items with owners (Daniel, Zain, Naren, Jazz)
    - Open questions: Fathom vs Fireflies for live suggestions
→ Store in scorecards (overall_score = null)
→ Send email to participants
```

### Database rows written

| Table | What gets inserted |
|---|---|
| `calls` | New row, status: `scored`, source_id: `660416881` |
| `scorecards` | Meeting summary, `overall_score = null` |
| `scorecard_evidence` | Action items, decisions, key points as individual rows |

### Re-running the test

The pipeline checks for duplicates using `source_id`. If you fire the same payload twice:
- Second fire → **silent 200 duplicate response**, no processing
- To re-test: either delete the `calls` row in Supabase where `source_id = '660416881'`, or change `"id"` in the payload to a different value like `"660416882"`

---

## Key action items in this call (what the LLM should extract)

| # | Owner | Action item |
|---|---|---|
| 1 | Daniel | Call Voice AI demo numbers; send feedback to Zain |
| 2 | Zain | Publish Voice AI demo landing page (keep v1 on subfolder) |
| 3 | Zain | Build Remotion/Hyperframes demo for 30–60s marketing videos |
| 4 | Zain | Update social writer: human-like captions, random length/emoji, no emoji-start |
| 5 | Zain | Add image generation to social writer and blog writer |
| 6 | Daniel | Upload recording to AI portal; draft content strategy |
| 7 | Zain | Build CRO agent to crawl Reddit/FB/YouTube groups |
| 8 | Daniel | Add weekly update prompts to Command HQ for Zain, Naren, Dom, Jazz |
| 9 | Zain | Implement Command HQ content pipeline (Ideas→Script→Film→Assets→Review→Schedule→Publish) |
| 10 | Zain | Pause Discovery Call Prep; prioritize Proposal Generator and Call Analyzer |
| 11 | Daniel | Watch SEO writer demo |
| 12 | Daniel | Schedule weekly team meeting with Naren, Zain |

---

## Key decisions made

1. **WeBuildTrades transition** — pause new client onboarding, move to waitlist while rebuilding with AI-first model
2. **Discovery Call Prep paused** — Jazz confirmed it adds no value; deprioritised
3. **Content calendar structure** — WBT posts M/W/F; Trade Business School posts T/Th/Sat; weekly newsletter on Sunday
4. **Image generation added** to social writer and blog writer (OpenAI Images)
5. **Call Analyzer v1 scoped** — post-call analysis, organized by client → department → team member → call type

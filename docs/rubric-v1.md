# Rubric v1 — WeBuildTrades Sales Playbook

This document is the human-readable version of the active rubric stored in the `rubrics` table. The rubric drives both the deterministic rule engine (03) and the LLM scorecard (04).

---

## Call Types

| Type | Description |
|---|---|
| `discovery` | First call with a new prospect — understand their business and pain points |
| `ads_intro` | Introducing Facebook/Google ads to a prospect |
| `launch` | Onboarding or launch call with a new client |
| `follow_up` | Follow-up call with an existing client |
| `team` | Internal team meeting — no prospect present |
| `other` | Anything that does not fit the above |

---

## Hard Rules (Deterministic — Rule Engine)

### 1. Banned Words

| Word | Applies To | Severity | Reason |
|---|---|---|---|
| `mate` | `discovery`, `ads_intro` | `critical` | Too casual on first-impression calls. Removes authority and alpha positioning. "You don't go to the doctor and have him say 'how are you, mate?'" — Daniel |
| `basically` | all | `warning` | Filler that undermines confidence |
| `obviously` | all | `warning` | Can make prospects feel patronised |

### 2. Filler Words

| Word | Threshold (per call) | Severity |
|---|---|---|
| `um` | 5 | `warning` |
| `uh` | 5 | `warning` |
| `essentially` | 3 | `warning` |
| `you know` | 5 | `warning` |
| `like` | 10 | `info` |
| `sort of` | 5 | `warning` |
| `kind of` | 5 | `warning` |

Replace filler with a deliberate pause. Silence sounds more confident than filler.

### 3. Talk-to-Listen Ratio

- **Max rep talk time:** 60% of total call duration
- **Applies to:** `discovery`, `ads_intro`, `follow_up`
- **Severity:** `warning`
- The more the prospect talks, the more pain they reveal — and the easier it is to prescribe a solution.

---

## LLM Scoring Criteria

Scored 0–10. `overall_score` = weighted average.

### 1. Talk Ratio & Listening (weight: 20%)

Does the rep ask questions and then genuinely listen? Are they dominating the conversation or letting the prospect speak?

**10** — Rep talks <40%, asks probing questions, lets prospect finish without interruption  
**5** — Roughly balanced but rep interrupts occasionally  
**0** — Rep monologues; prospect barely speaks

### 2. Question Stack — Ask → Listen → Dig Deeper (weight: 25%)

The core pattern: ask an open question → let them answer → dig into the pain behind that answer → repeat. Only after pain is fully surfaced should the rep move to solution.

**10** — Consistent ask-listen-dig pattern; multiple layers of pain uncovered before any solution mention  
**5** — Some follow-up questions but often moves to solution before pain is fully explored  
**0** — Fires off solution immediately after first answer; no depth

### 3. Pain Surfacing (weight: 25%)

Does the rep surface the prospect's real problems — budget constraints, failed past solutions, urgency, emotional stakes?

**10** — Uncovers 3+ specific pain points with emotional and financial context  
**5** — Identifies surface-level problems but doesn't dig into root cause or stakes  
**0** — Jumps to pitch without understanding prospect's situation

### 4. Objection Handling (weight: 15%)

How does the rep respond when a prospect pushes back ("it's too expensive", "I need to think about it", "I tried ads before")?

**10** — Acknowledges objection, asks a question to understand the real concern, re-anchors to the pain  
**5** — Attempts to handle but falls back to features/price justification  
**0** — Gets flustered, drops the objection, or immediately discounts

### 5. Solution Timing & Prescription (weight: 15%)

Is the solution presented only after pain is fully surfaced? Is it framed as a specific prescription for their exact problem, not a generic pitch?

**10** — Solution introduced late in the call, tailored specifically to pain points discussed  
**5** — Solution appears at a reasonable time but is somewhat generic  
**0** — Solution pitched in the first few minutes before any discovery

---

## Coaching Principles

These are the underlying principles the LLM should reference when writing coaching feedback:

1. **Authority positioning** — The rep is the expert, the doctor prescribing a cure. Not a vendor pitching a product.
2. **Pain before prescription** — Never pitch a solution before the prospect has articulated their problem in their own words.
3. **Questions are the product** — A great sales call is 70% questions, 30% answers. The best reps talk least.
4. **Specific > vague** — Feedback must reference exact moments in the transcript. Generic praise is worthless.
5. **Actionable** — Every improvement point must tell the rep exactly what to do differently next time.

---

## Version History

| Version | Date | Changes |
|---|---|---|
| v1 | 2026-05 | Initial rubric based on Daniel's kickoff playbook |

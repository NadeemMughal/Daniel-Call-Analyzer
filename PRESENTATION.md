# WeBuildTrades — Call Analyzer
## Complete Project Presentation & Technical Documentation

**Version:** 1.0 | **Status:** Live & Operational | **Date:** May 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [The Problem We Solved](#2-the-problem-we-solved)
3. [Full Tech Stack](#3-full-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [n8n Pipeline — All 9 Workflows](#6-n8n-pipeline--all-9-workflows)
7. [Backend API Routes](#7-backend-api-routes)
8. [Frontend Portal — All Pages](#8-frontend-portal--all-pages)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [AI Scoring System](#10-ai-scoring-system)
11. [Data Flow — Call to Dashboard](#11-data-flow--call-to-dashboard)
12. [Deployment Architecture](#12-deployment-architecture)
13. [What's Been Built](#13-whats-been-built)
14. [Demo Script](#14-demo-script)

---

## 1. Project Overview

**WeBuildTrades Call Analyzer** is a fully automated AI sales coaching platform. It records every sales call, transcribes it, scores it against a rubric using AI, and delivers actionable coaching insights to managers and reps through a live web portal.

```
┌─────────────────────────────────────────────────────────┐
│           WEBUILDTRADES CALL ANALYZER                   │
│                                                         │
│  "Every call scored. Every rep coached. Zero effort."  │
└─────────────────────────────────────────────────────────┘
```

### Key Numbers

| Metric | Value |
|--------|-------|
| Time from call end → score in portal | Under 2 minutes |
| n8n automation workflows | 9 |
| Database tables | 12 |
| Database migrations | 14 |
| Portal pages | 12 |
| User roles | 3 (Admin / Manager / Rep) |
| AI model for scoring | Anthropic claude-sonnet-4-6 |
| AI model for classification | Anthropic claude-haiku-4-5 |

---

## 2. The Problem We Solved

### Before This System

```
❌  Manager manually listens to calls (hours per week)
❌  No consistent scoring — subjective feedback
❌  Reps don't know what they did wrong
❌  No visibility into team performance trends
❌  Banned words / filler words never caught
❌  No record of who said what on each call
```

### After This System

```
✅  Every call scored automatically in < 2 minutes
✅  Objective AI scoring against agreed rubric criteria
✅  Reps see exact quotes from their own calls
✅  Manager sees full team leaderboard and trends
✅  Banned words and talk ratio flagged automatically
✅  Full participant records and call history per client
```

---

## 3. Full Tech Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TECH STACK                                   │
│                                                                     │
│  FRONTEND          BACKEND           DATABASE        AUTOMATION     │
│  ──────────        ───────────       ──────────      ──────────     │
│  React 18          Node.js 20        Supabase        n8n            │
│  TypeScript        Express.js        PostgreSQL      9 Workflows    │
│  Vite 6            TypeScript        RLS + Auth                     │
│  Tailwind CSS      Zod validation                   AI / LLM        │
│  Recharts                            HOSTING         ──────────     │
│  Radix UI          DEPLOYMENT        ──────────      Anthropic      │
│  React Router      ──────────        Vercel          sonnet-4-6     │
│  Lucide Icons      Render            (Frontend)      haiku-4-5      │
│                    (Backend)                                         │
│  INTEGRATIONS                                                        │
│  ──────────────────────────────                                     │
│  Fathom (call recording + transcription)                            │
│  Supabase Auth (email/password login)                               │
│  Google Drive (OAuth — future use)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer by Layer

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Call Recording** | Fathom (SaaS) | Records calls, generates transcripts, fires webhook |
| **Automation Engine** | n8n (self-hosted) | Runs the full pipeline when a call arrives |
| **AI Scoring** | Anthropic API (claude-sonnet-4-6) | Scores calls against rubric, extracts evidence quotes |
| **AI Classification** | Anthropic API (claude-haiku-4-5) | Fast, cheap call type classification |
| **Database** | Supabase PostgreSQL | Stores all calls, scores, users, rubrics |
| **Auth** | Supabase Auth | Email/password login, JWT sessions |
| **Backend API** | Express.js + TypeScript | Aggregations, RBAC enforcement, rubric management |
| **Frontend** | React 18 + Vite + Tailwind | Web portal for managers and reps |
| **Backend Hosting** | Render | Auto-deploys from GitHub push |
| **Frontend Hosting** | Vercel | Auto-deploys from GitHub push |

---

## 4. System Architecture

### High-Level Architecture

```
┌──────────────┐     webhook      ┌─────────────────────────────────┐
│              │ ──────────────→  │         n8n Server              │
│    FATHOM    │                  │   (n8nserver.metaviz.pro)       │
│  (Recorder)  │                  │                                 │
└──────────────┘                  │  ┌─────────────────────────┐   │
                                  │  │   00 - Master Pipeline  │   │
                                  │  │   (Orchestrator)        │   │
                                  │  └────────────┬────────────┘   │
                                  │               │                 │
                                  │    ┌──────────┼──────────┐     │
                                  │    ↓          ↓          ↓     │
                                  │  01-ingest  02-classify  03-rule│
                                  │    ↓          ↓          ↓     │
                                  │  04-score  05-notify  06-summary│
                                  │                                 │
                                  └──────────────┬──────────────────┘
                                                 │ HTTP (Supabase REST)
                                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                        │
│  calls  │  scorecards  │  team_members  │  rubrics  │  clients  │
└─────────────────────────────────────────┬───────────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              │   EXPRESS BACKEND API  │
                              │   (Render)             │
                              │   /analytics           │
                              │   /members             │
                              │   /rubrics             │
                              │   /clients             │
                              └───────────┬────────────┘
                                          │ REST API
                                          ↓
                              ┌───────────────────────┐
                              │   REACT PORTAL        │
                              │   (Vercel)            │
                              │   Dashboard           │
                              │   Call Browser        │
                              │   Member Reports      │
                              │   Rubric Editor       │
                              └───────────────────────┘
                                          ↑
                              ┌───────────────────────┐
                              │   USERS               │
                              │   Admin  Manager  Rep │
                              └───────────────────────┘
```

---

## 5. Database Schema

### Tables Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE TABLES                             │
│                                                                 │
│  departments ──────────────────────────────────────────┐       │
│  (Sales, SEO, Ops, Content, Exec)                      │       │
│                                                         │       │
│  team_members ─────────────────────────────────────────┤       │
│  (id, name, email, role, department_id)                 │       │
│                                                         │       │
│  clients                     calls ───────────────────→│       │
│  (companies from calls)      (id, call_type, status,   │       │
│                               transcript, duration)    │       │
│                                     │                  │       │
│                    ┌────────────────┼────────────────┐ │       │
│                    ↓                ↓                ↓ │       │
│             scorecards       call_participants  rule_findings   │
│             (score, summary, (who was on call) (banned words,  │
│              strengths,                         fillers,        │
│              improvements)                      talk ratio)     │
│                    │                                            │
│                    ↓                                            │
│             scorecard_evidence                                  │
│             (exact quotes from transcript)                      │
│                                                                 │
│  rubrics           member_trends       member_notes             │
│  (scoring rubric   (weekly score       (manager coaching        │
│   versioned)        rollups)            notes on reps)          │
│                                                                 │
│  failed_executions                                              │
│  (n8n error log)                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Key Relationships

```
departments
    └── team_members (many)
            └── call_participants (many)
                    └── calls (many)
                            ├── scorecards (one)
                            │       └── scorecard_evidence (many)
                            └── rule_findings (many)

clients
    └── calls (many)

rubrics (versioned, one active)
    └── scorecards reference active rubric
```

### Call Status Lifecycle

```
   NEW CALL
      │
      ▼
  ┌─────────┐     n8n ingest     ┌─────────────┐
  │  Fathom │ ──────────────────→│   pending   │
  │ webhook │                    └──────┬──────┘
  └─────────┘                           │
                                        │ n8n scoring starts
                                        ▼
                                  ┌─────────────┐
                                  │ processing  │
                                  └──────┬──────┘
                                         │
                          ┌──────────────┴──────────────┐
                          ▼                              ▼
                    ┌──────────┐                  ┌──────────┐
                    │  scored  │                  │  failed  │
                    │ (normal) │                  │ (error)  │
                    └──────────┘                  └──────────┘
```

---

## 6. n8n Pipeline — All 9 Workflows

### Workflow Map

```
                    ┌─────────────────────────┐
                    │  FATHOM WEBHOOK FIRES   │
                    │  (call_completed event) │
                    └────────────┬────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│              00 - MASTER PIPELINE (Orchestrator)               │
│                                                                │
│  Fathom Webhook → Verify HMAC → Check Duplicate               │
│       → Is Duplicate? ──YES──→ Stop (ignore)                  │
│               │                                                │
│              NO                                                │
│               ↓                                                │
│  Trigger 01-ingest ──→ Trigger 02-classify ──→ ...            │
└────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ 01-ingest│  │02-classify│  │03-rules  │  │04-score  │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │05-notify │  │06-summary│  │07-trends │  │99-errors │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

---

### Workflow 00 — Master Pipeline

**Purpose:** Entry point for all calls. Receives Fathom webhook, validates it, deduplicates, then fires sub-workflows in sequence.

```
Fathom Webhook (POST /fathom-pipeline)
        │
        ▼
Verify HMAC signature
(security check — ensures request is from Fathom)
        │
        ▼
Check Duplicate
(query Supabase: does this call already exist?)
        │
        ├── YES → Send 200 OK, stop processing
        │
        └── NO  → Trigger 01-ingest
                   (pass: call_id, title, transcript,
                    participants, duration, recorded_at)
```

**Key nodes:** Webhook, Code (HMAC verify), HTTP Request (Supabase check), IF (duplicate check), HTTP Request (trigger sub-workflows)

---

### Workflow 01 — Ingest

**Purpose:** Creates the call record in Supabase. Stores transcript, participants, and metadata.

```
Webhook (receives from master pipeline)
        │
        ▼
Check if call exists in Supabase
        │
        ├── EXISTS → Return existing call_id, stop
        │
        └── NEW    →  INSERT into calls table
                       (transcript_raw, duration, recorded_at,
                        source='fathom', status='pending')
                            │
                            ▼
                      INSERT call_participants
                       (for each attendee: name, email,
                        is_external based on email domain)
                            │
                            ▼
                      Return call_id to master pipeline
```

---

### Workflow 02 — Classify

**Purpose:** Determines what type of call it was (discovery, follow-up, team meeting, etc.) using fast AI classification.

```
Webhook (receives call_id + transcript snippet)
        │
        ▼
Fetch full call from Supabase
        │
        ▼
Send to Anthropic claude-haiku-4-5
  Prompt: "What type of call is this? Options:
           discovery / ads_intro / launch /
           follow_up / team / other"
        │
        ▼
Parse classification response
        │
        ▼
UPDATE calls SET call_type = '<result>'
        │
        ▼
Also classify meeting_phase
(intro / discovery / pitch / objections / close / post-sale)
        │
        ▼
Return to master pipeline
```

**AI Model:** Anthropic claude-haiku-4-5 (fast, cheap — classification only)

---

### Workflow 03 — Rule Engine

**Purpose:** Deterministic checks — no AI needed. Flags banned words, counts filler words, checks talk ratio.

```
Webhook (receives call_id)
        │
        ▼
Fetch transcript + rubric from Supabase
        │
        ▼
Run rule checks:
  ├── Banned words check
  │    (scan transcript for words in rubric.banned_words)
  │    → INSERT rule_findings (severity: critical)
  │
  ├── Filler words check
  │    (count: um, uh, like, basically, you know, etc.)
  │    → INSERT rule_findings (severity: warning)
  │
  └── Talk ratio check
       (what % of words did the rep speak?)
       → If rep > 70% of talk time: flag it
       → INSERT rule_findings (severity: warning)
        │
        ▼
Return findings count to master pipeline
```

---

### Workflow 04 — Scorecard ⭐ (Core Workflow)

**Purpose:** The main AI scoring engine. Sends the full transcript to Anthropic Claude, gets a structured scorecard back, saves it with evidence quotes.

```
Webhook (receives call_id)
        │
        ▼
Fetch call from Supabase
(transcript_raw, participants, duration)
        │
        ▼
Check Transcript Length
  ├── < 50 characters → Mark as 'pending', stop
  │   (no real content — was a calendar event, not a call)
  │
  └── ≥ 50 characters → Continue
        │
        ▼
Fetch Active Rubric from Supabase
(scoring criteria, weights, coaching principles)
        │
        ▼
Build Score Request
(construct detailed prompt with transcript + rubric)
        │
        ▼
Send to Anthropic claude-sonnet-4-6
  System prompt: "You are an expert sales coach.
                  Score this call against these criteria..."
  Response format: JSON with overall_score, per-criterion
                   scores, evidence quotes, summary
        │
        ▼
Parse Scorecard
  (strip markdown code fences if LLM adds them)
  (validate JSON structure)
        │
        ▼
INSERT into scorecards table
  (overall_score, summary, strengths, improvements)
        │
        ▼
Extract Evidence Array
  (quotes from transcript for each criterion)
        │
        ▼
Has Evidence? ──NO──→ Skip evidence insert
        │
       YES
        ▼
INSERT into scorecard_evidence table
  (criterion_key, quote, timestamp_seconds)
        │
        ▼
UPDATE calls SET status = 'scored'
        │
        ▼
Trigger 05-notify
```

**AI Model:** Anthropic claude-sonnet-4-6 (most capable, used for full scoring)

---

### Workflow 05 — Notify

**Purpose:** Sends email notifications to call participants when scoring is complete.

```
Webhook (receives call_id + scorecard)
        │
        ▼
Fetch call + participants + score from Supabase
        │
        ▼
For each internal participant (team member):
  Send email:
    "Your call has been scored: X/10
     [Summary]
     View full report: [link]"
        │
        ▼
Return notification count
```

---

### Workflow 06 — Meeting Summary

**Purpose:** Handles team/group calls differently. Generates a meeting summary with key decisions, action items, and participants.

```
Webhook (receives call_id)
        │
        ▼
Fetch call from Supabase
        │
        ▼
Is this a team call? (call_type = 'team')
  ├── NO  → Return, skip
  │
  └── YES → Send to Groq (llama-3.3-70b) for summary:
               - Key discussion points
               - Decisions made
               - Action items
               - Participants
                    │
                    ▼
             UPDATE call with meeting_summary JSON
```

---

### Workflow 07 — Trend Analysis

**Purpose:** Calculates weekly performance trends per team member. Triggered after each scoring or on a weekly schedule.

```
Trigger (webhook or weekly cron)
        │
        ▼
For each team member with scored calls:
        │
        ▼
Calculate rolling stats:
  - avg_score (last 4 weeks)
  - call_count
  - improvement trend (up/down/flat)
  - top strength
  - top weakness
        │
        ▼
UPSERT member_trends table
(one row per member per week period)
```

---

### Workflow 99 — Error Handler

**Purpose:** Catches any failures in any of the above workflows and logs them.

```
Any workflow fails
        │
        ▼
INSERT into failed_executions table
  (workflow_name, error_message, call_id, timestamp)
        │
        ▼
Send alert notification to admin
```

---

## 7. Backend API Routes

### Base URL
```
Production:  https://call-analyzer-backend.onrender.com
Development: http://localhost:4000
```

### All Endpoints

```
AUTH (all routes require Bearer token in Authorization header)
──────────────────────────────────────────────────────────────

ANALYTICS
  GET  /analytics/dashboard        → KPIs for current user's scope
  GET  /analytics/overview         → weekly score trends
  GET  /analytics/leaderboard      → ranked team members
  GET  /analytics/member-cards     → team cards with scores
  GET  /analytics/clients          → client call summaries

MEMBERS
  GET  /members/me                 → current logged-in user's profile
  GET  /members/:id                → full member report (calls + scores + trend)
  GET  /members/:id/notes          → coaching notes for this member
  POST /members/:id/notes          → add a coaching note (manager/admin only)
  DEL  /members/:id/notes/:noteId  → delete a note (author or admin only)

CLIENTS
  GET  /clients/:id                → client detail + all their calls

RUBRICS
  GET  /rubrics                    → list all rubric versions
  GET  /rubrics/active             → fetch the currently active rubric
  POST /rubrics                    → create a new rubric version
  PUT  /rubrics/:id                → update a rubric

TRENDS
  GET  /trends/:memberId           → trend data for one member

ASSIST
  POST /assist/rubric              → AI-assisted rubric suggestions (Groq/Anthropic)
```

### RBAC — Who Can Access What

```
Endpoint                     Admin    Manager    Rep
──────────────────────────────────────────────────
/analytics/dashboard          ALL     own dept   own only
/analytics/member-cards       ALL     own dept   own only
/analytics/clients            ALL     own dept   own only
/analytics/leaderboard        ALL     own dept   ─
/members/:id                  ALL     own dept   own only
/members/:id/notes (POST)     ✅       ✅         ❌
/rubrics (POST/PUT)           ✅       ❌         ❌
```

---

## 8. Frontend Portal — All Pages

### Navigation Map

```
┌─────────────────────────────────────────────────────────────────┐
│  SIDEBAR NAVIGATION                                             │
│                                                                 │
│  📊 Dashboard      → KPIs, leaderboard, score charts           │
│  📞 All Calls      → Browsable call list with filters          │
│  🏢 Clients        → Companies + their call history            │
│  📈 Trends         → Score trends over time                    │
│  🎯 Coaching       → Low-scoring calls needing attention       │
│  📋 Rubric         → Edit scoring criteria [ADMIN ONLY]        │
│  ⚠️  Failures       → Pipeline errors [ADMIN ONLY]             │
│                                                                 │
│  DEPARTMENTS (quick filters)                                    │
│  Sales / SEO / Ops / Content / Exec                            │
│                                                                 │
│  USER PANEL (bottom)                                           │
│  [Avatar] Name · Role badge · Department · Sign out            │
└─────────────────────────────────────────────────────────────────┘
```

---

### Page 1 — Dashboard (`/dashboard`)

**What it shows:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Welcome, [Name] — [role-specific subtitle]                     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Avg     │  │  Total   │  │  Scored  │  │  Top     │       │
│  │  Score   │  │  Calls   │  │  Calls   │  │  Issue   │       │
│  │   7.2    │  │   134    │  │   119    │  │  Filler  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  Score Trend (line chart — 8 weeks)                            │
│  ████████████████████████████████████████                      │
│                                                                 │
│  Team Leaderboard              Call Type Breakdown             │
│  1. Jas Nijjar    8.4          Discovery   45%                 │
│  2. Zain Ali      7.9          Follow-up   30%                 │
│  3. Cameron       7.1          Team        15%                 │
│                                Other       10%                 │
│                                                                 │
│  Member Performance Cards                                      │
│  [Jas] [Zain] [Cameron] [Jazz] ...                             │
└─────────────────────────────────────────────────────────────────┘
```

---

### Page 2 — All Calls (`/calls`)

**What it shows:**
```
┌─────────────────────────────────────────────────────────────────┐
│  All Calls                          [Filter by dept/type/score] │
│                                                                 │
│  Date       Rep        Client       Type        Score  Status  │
│  ─────────────────────────────────────────────────────────────  │
│  May 21     Jas        Acme Corp    Discovery    8.1   scored  │
│  May 20     Zain       BuildRight   Follow-up    6.4   scored  │
│  May 20     Cameron    TechBuild    Discovery    7.8   scored  │
│  May 19     Jazz       HomeBuilt    Ads Intro    5.2   scored  │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

### Page 3 — Call Detail (`/calls/:id`)

**What it shows:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Call with Acme Corp — May 21, 2026 — 32 min                   │
│  Rep: Jas Nijjar  │  Type: Discovery  │  Score: 8.1/10 ✅      │
│                                                                 │
│  AI SUMMARY                                                     │
│  "Strong opening and rapport building. Good needs discovery     │
│   questions. Could improve objection handling around pricing."  │
│                                                                 │
│  SCORECARD                                                      │
│  Opening & Rapport         9.0  ██████████████████░  Excellent  │
│  Needs Discovery           8.5  █████████████████░░  Strong     │
│  Objection Handling        6.5  █████████████░░░░░░  Needs work │
│  Closing Technique         7.8  ███████████████░░░░  Good       │
│  Professionalism           9.2  ██████████████████░  Excellent  │
│                                                                 │
│  EVIDENCE QUOTES                                                │
│  ✅ "Tell me more about your current situation..." (9:32)       │
│  ⚠️  "The price is what it is..." (18:45) — weak on price obj.  │
│                                                                 │
│  RULE FINDINGS                                                  │
│  ⚠️  Filler words: "um" used 12 times, "basically" used 7 times │
│  ✅  Talk ratio: 48% rep / 52% client — good balance            │
└─────────────────────────────────────────────────────────────────┘
```

---

### Page 4 — Member Report (`/members/:id`)

**What it shows:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Jas Nijjar — Sales Manager                                     │
│  Avg Score: 8.1  │  Calls: 24  │  Trend: ↑ +0.4 this month    │
│                                                                 │
│  SCORE HISTORY (bar chart, last 10 calls)                      │
│  ████ ████ ████ ████ ████ ████ ████ ████ ████ ████             │
│  7.2  7.8  8.1  7.9  8.3  8.0  8.4  8.1  7.9  8.2             │
│                                                                 │
│  COACHING INSIGHTS                                              │
│  💪 Strength: Opening & Rapport (avg 8.9)                      │
│  📈 Improving: Needs Discovery (+0.8 last 4 weeks)             │
│  ⚠️  Focus area: Objection Handling (avg 6.2)                  │
│                                                                 │
│  ALL CALLS                                                      │
│  May 21  Acme Corp    Discovery  8.1  scored                   │
│  May 20  BuildRight   Follow-up  7.9  scored                   │
│  ...                                                            │
│                                                                 │
│  MANAGER NOTES  [Add Note...]                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Ammar Ali · May 20                                      │    │
│  │ "Good improvement on discovery questions. Focus on      │    │
│  │  price objections — review the objection handling       │    │
│  │  framework before next discovery call."                 │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

### Page 5 — Clients (`/clients`)

Shows all external companies that appeared in calls, with total call count and average score.

### Page 6 — Trends (`/trends`)

Score trend lines per team member over the last 8–12 weeks.

### Page 7 — Coaching (`/coaching`)

Low-scoring calls and reps that need attention. Ranked by score or number of red flags.

### Page 8 — Rubric (`/rubric`) — Admin Only

```
┌─────────────────────────────────────────────────────────────────┐
│  Scoring Rubric — Version 3 (Active)                           │
│                                                                 │
│  SCORING CRITERIA                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Opening & Rapport          Weight: 20%                  │   │
│  │ "Evaluate how well the rep built connection..."         │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Needs Discovery            Weight: 25%                  │   │
│  │ "Did the rep ask enough questions..."                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ...                                                            │
│                                                                 │
│  BANNED WORDS                                                   │
│  [cheap] [discount] [can't] [won't] [not sure]                 │
│                                                                 │
│  FILLER WORDS                                                   │
│  [um] [uh] [like] [basically] [you know] [actually]            │
│                                                                 │
│  [Save New Version]  [AI Suggest Improvements]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Role-Based Access Control

### Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      RBAC SYSTEM                                │
│                                                                 │
│  ADMIN (Ammar Ali, Daniel Brown)                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sees ALL data — all departments, all reps              │   │
│  │  Can edit rubric                                        │   │
│  │  Can see pipeline failures                              │   │
│  │  Can add/delete any note                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  MANAGER (Jas, Jazz, Zain, Kool, Cameron)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sees own dept data only                                │   │
│  │  Sees own team's member cards                          │   │
│  │  Can write coaching notes on any rep                   │   │
│  │  Cannot see other departments                          │   │
│  │  Cannot edit rubric                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  REP (Ben, Dom, Ruben, Cole)                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sees own calls ONLY                                    │   │
│  │  Sees own scorecard details                            │   │
│  │  Reads notes their manager left                        │   │
│  │  Cannot see other reps' data                           │   │
│  │  No rubric, no failures, no org KPIs                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### How It's Enforced

```
1. USER LOGS IN
   Supabase Auth → issues JWT token

2. FRONTEND calls backend API
   Bearer token sent in Authorization header

3. BACKEND middleware checks:
   a. Is token valid? (Supabase JWT verification)
   b. What is the user's role? (lookup in team_members)
   c. Apply data filter:
      - admin  → no filter (all data)
      - manager → filter by department_id
      - rep    → filter by team_member_id

4. DATABASE also has RLS (Row Level Security)
   Second layer of protection at the database level
```

---

## 10. AI Scoring System

### How a Call Gets Scored

```
INPUT: Full call transcript (plain text, can be 5,000+ words)

SYSTEM PROMPT to Anthropic claude-sonnet-4-6:
┌─────────────────────────────────────────────────────────────────┐
│  "You are an expert sales coach for WeBuildTrades.              │
│   Score this sales call against the following rubric.           │
│   For each criterion, provide:                                  │
│   - A score from 1-10                                          │
│   - Whether it was a strength or needs improvement             │
│   - An exact quote from the transcript as evidence             │
│   - The timestamp if available                                  │
│                                                                 │
│   RUBRIC CRITERIA:                                              │
│   [opening_rapport: 20% weight — description...]               │
│   [needs_discovery: 25% weight — description...]               │
│   [objection_handling: 20% weight — description...]            │
│   [closing_technique: 20% weight — description...]             │
│   [professionalism: 15% weight — description...]               │
│                                                                 │
│   Return ONLY valid JSON in this exact format: {...}"           │
└─────────────────────────────────────────────────────────────────┘

OUTPUT from Claude:
{
  "overall_score": 8.1,
  "summary": "Strong call with good rapport...",
  "strengths": [
    {
      "criterion": "opening_rapport",
      "score": 9.0,
      "evidence_quote": "Tell me about your situation...",
      "timestamp_seconds": 572
    }
  ],
  "improvements": [
    {
      "criterion": "objection_handling",
      "score": 6.5,
      "evidence_quote": "The price is the price...",
      "timestamp_seconds": 1125
    }
  ]
}

STORED IN DATABASE:
scorecards → overall_score, summary, strengths, improvements
scorecard_evidence → exact quotes per criterion
```

### Rubric Versioning

```
Version 1 → initial rubric (launch)
Version 2 → refined criteria after first 20 calls
Version 3 → current active version

Each scorecard records which rubric version it was scored against.
Changing the rubric never retroactively changes old scores.
```

---

## 11. Data Flow — Call to Dashboard

### Complete End-to-End Timeline

```
TIME 0:00  ─── Call ends in Fathom
TIME 0:05  ─── Fathom processes recording + transcript
TIME 0:15  ─── Fathom fires webhook to n8n
TIME 0:16  ─── n8n verifies HMAC, checks duplicate
TIME 0:17  ─── 01-ingest: call saved to Supabase (status=pending)
TIME 0:18  ─── 02-classify: Claude Haiku classifies call type
TIME 0:19  ─── 03-rule-engine: banned words, fillers, talk ratio
TIME 0:25  ─── 04-scorecard: Claude Sonnet scores full transcript
TIME 0:28  ─── Scorecard + evidence saved to Supabase
TIME 0:28  ─── 05-notify: email sent to rep + manager
TIME 0:29  ─── Status updated to 'scored'
TIME 0:30  ─── Call appears in portal with full scorecard ✅
```

### Data Transformations Along the Way

```
FATHOM RAW DATA              →  DATABASE                →  PORTAL
────────────────────────────────────────────────────────────────────
call_id (Fathom)             →  calls.source_id        →  (internal)
meeting title                →  calls.title            →  Call name
participants list            →  call_participants      →  Rep linked
transcript (full text)       →  calls.transcript_raw   →  Viewed in detail
duration (seconds)           →  calls.duration_seconds →  "32 min"
recorded_at (ISO timestamp)  →  calls.recorded_at      →  "May 21, 2026"

AFTER AI PROCESSING:
Claude JSON response         →  scorecards.overall_score → "8.1 / 10"
Claude criterion scores      →  scorecards.strengths   →  Scorecard bars
Claude evidence quotes       →  scorecard_evidence     →  Quote cards
Claude summary text          →  scorecards.summary     →  AI summary box
Rule findings                →  rule_findings          →  Flags in detail view
```

---

## 12. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION DEPLOYMENT                        │
│                                                                 │
│  GitHub Repository (NadeemMughal/Daniel-Call-Analyzer)         │
│  branch: main                                                   │
│       │                                                         │
│       ├──────────────────→  RENDER                             │
│       │   push triggers      Backend API                        │
│       │   auto-deploy        Node.js + Express                  │
│       │                      Port 4000                          │
│       │                      Env vars: SUPABASE_*, GROQ_*       │
│       │                                                         │
│       └──────────────────→  VERCEL                             │
│           push triggers      React Frontend                     │
│           auto-deploy        Vite build → static files          │
│                              Env vars: VITE_*                   │
│                                                                 │
│  SUPABASE (always-on cloud)                                     │
│  PostgreSQL database                                            │
│  Auth service                                                   │
│  project: fybvnwidpnxnouaukrnb.supabase.co                     │
│                                                                 │
│  n8n (self-hosted, always-on)                                   │
│  n8nserver.metaviz.pro                                          │
│  Runs pipeline 24/7, no downtime                               │
│                                                                 │
│  FATHOM (SaaS, external)                                        │
│  Records all calls                                              │
│  Fires webhooks on call completion                              │
└─────────────────────────────────────────────────────────────────┘
```

### Environment Variables Summary

```
BACKEND (Render)                   FRONTEND (Vercel)
──────────────────────────────     ──────────────────────────────
SUPABASE_URL                       VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY          VITE_SUPABASE_ANON_KEY
GROQ_API_KEY                       VITE_BACKEND_URL
PORT=4000
NODE_ENV=production
PORTAL_URL=https://[vercel-url]

n8n (stored in n8n credential vault)
──────────────────────────────────────
SUPABASE_URL
SUPABASE_SERVICE_KEY
GROQ_API_KEY
FATHOM_API_KEY
```

---

## 13. What's Been Built

### Completed Features ✅

| Feature | Status |
|---------|--------|
| Fathom → n8n webhook pipeline | ✅ Live |
| Call ingestion + deduplication | ✅ Live |
| AI call classification | ✅ Live |
| Rule engine (banned words, fillers, talk ratio) | ✅ Live |
| AI scoring with evidence quotes | ✅ Live |
| Scorecard storage | ✅ Live |
| Email notifications | ✅ Live |
| Member trend analysis | ✅ Live |
| Supabase Auth (login/logout) | ✅ Live |
| Role-based access control | ✅ Live |
| Dashboard with KPIs + charts | ✅ Live |
| All Calls page with filters | ✅ Live |
| Call Detail page with scorecard | ✅ Live |
| Member Report page | ✅ Live |
| Manager coaching notes | ✅ Built |
| Client detail pages | ✅ Built |
| Trends page | ✅ Built |
| Coaching page | ✅ Built |
| Rubric editor (versioned) | ✅ Built |
| Role-aware sidebar (name, role badge) | ✅ Built |
| Personalised dashboard per role | ✅ Built |
| Pipeline error handling | ✅ Live |

### Database Migrations Applied

| Migration | What it Created |
|-----------|----------------|
| 0001 | Core schema (all main tables) |
| 0002 | member_trends table |
| 0003 | Demo public read (temp) |
| 0004 | Departments + member structure |
| 0005 | Failed executions log |
| 0006 | Analytics views + SQL functions |
| 0007 | Disable demo public read |
| 0008 | Analytics RPC functions |
| 0009 | RLS fix for authenticated users |
| 0010 | Jas Nijjar → manager role |
| 0011 | Link participants to team members |
| 0011b | Member notes table |
| 0012 | Create clients from external emails |
| 0013 | Remove Finance department |
| 0014 | Reset all calls for re-scoring |

---

## 14. Demo Script

### Suggested Demo Order (10 minutes)

```
STEP 1 — Login as Admin (2 min)
  URL: [portal URL]
  Email: ai@webuildtrades.com
  → Show: full Dashboard with all KPIs and leaderboard
  → Point out: score trend chart, top issues, member cards

STEP 2 — Open a Call Detail (2 min)
  → Click any scored call from All Calls
  → Show: AI summary, scorecard bars, evidence quotes
  → Point out: "This is an exact quote from the call at 18:45"
  → Show: rule findings (filler words, talk ratio)

STEP 3 — Open a Member Report (2 min)
  → Click a rep name or go to /members/:id
  → Show: score history chart, coaching insights
  → Show: manager notes section
  → Add a note live: "Focus on objection handling"

STEP 4 — Show the Rubric (1 min)
  → Go to /rubric
  → Show: criteria, weights, banned words
  → Mention: this is what the AI scores against

STEP 5 — Login as Rep (2 min)
  → Log out, login as rep (e.g. dom@webuildtrades.com)
  → Show: limited dashboard (own calls only)
  → Show: sidebar has no Rubric or Failures links
  → Show: sidebar shows "Dom · Rep" badge
  → Show: they can see notes their manager left

STEP 6 — Explain the Pipeline (1 min)
  → Open n8n (n8nserver.metaviz.pro)
  → Show: the 9 workflows
  → Show: 04-scorecard workflow nodes
  → "This all runs automatically — zero manual work"
```

### Key Talking Points

1. **"Every call scored in under 2 minutes"** — fully automated, no human in the loop
2. **"Evidence-based coaching"** — AI quotes the exact moment in the call, not just a number
3. **"Role-based access"** — reps see only their own data, no office politics
4. **"The rubric is live-editable"** — managers can update scoring criteria without any code change
5. **"9 automated workflows"** — from call recording to dashboard, zero manual steps
6. **"Scales to any team size"** — whether 5 reps or 50, the system handles it identically

---

*Document generated: May 2026 | WeBuildTrades Call Analyzer v1.0*

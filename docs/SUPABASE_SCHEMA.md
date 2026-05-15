# Supabase Schema Reference

All schema changes live in `supabase/migrations/` as append-only SQL files.

---

## Tables

### `clients`

Top-level entity. One client = one company (e.g., WeBuildTrades).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | Company name |
| `created_at` | timestamptz | |

---

### `departments`

Divisions within a client (Sales, SEO, Content, Ops, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `name` | text | e.g., "Sales", "SEO" |
| `created_at` | timestamptz | |

---

### `team_members`

Individual reps/employees.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `department_id` | uuid FK → departments | |
| `name` | text | Full name |
| `email` | text | Used for email notifications |
| `role` | text | `rep` \| `manager` \| `admin` |
| `created_at` | timestamptz | |

---

### `calls`

One row per recorded call.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `external_id` | text unique | Fathom call ID (dedup key) |
| `call_type` | text | `DISCOVERY` \| `FOLLOW_UP` \| `ADS_INTRO` \| `LAUNCH` \| `TEAM` |
| `meeting_phase` | text | Granular phase (see classification) |
| `recorded_at` | timestamptz | When the call was recorded |
| `duration_seconds` | integer | Call length |
| `status` | text | `pending` \| `scored` \| `error` |
| `department` | text | Computed department label |
| `created_at` | timestamptz | |

---

### `call_participants`

Many-to-many: calls ↔ team_members. Also stores external participants.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `call_id` | uuid FK → calls | |
| `team_member_id` | uuid FK → team_members | null if external |
| `name` | text | Participant name |
| `email` | text | |
| `is_external` | boolean | true = prospect/client, false = internal rep |
| `role` | text | `host` \| `participant` |
| `created_at` | timestamptz | |

**Index:** `idx_call_participants_external (team_member_id, is_external)` — speeds up leaderboard queries.

---

### `rubrics`

Versioned scoring rubrics. Only one rubric is `is_active = true` at a time.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `version` | integer | Auto-incremented on publish |
| `name` | text | e.g., "WeBuildTrades Sales Playbook v3" |
| `is_active` | boolean | Only one row true at a time |
| `created_at` | timestamptz | |

---

### `rubric_criteria`

Scoring dimensions within a rubric.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `rubric_id` | uuid FK → rubrics | |
| `key` | text | Stable identifier, e.g., `rapport_building` |
| `label` | text | Display name |
| `weight` | numeric | Contribution to overall score |
| `description` | text | What this criterion measures |
| `order_index` | integer | Display order |

---

### `rubric_rules`

Deterministic pass rules (run before LLM scoring).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `rubric_id` | uuid FK → rubrics | |
| `criterion_id` | uuid FK → rubric_criteria | |
| `key` | text | e.g., `banned_word_mate` |
| `rule_type` | text | `banned_word` \| `filler_word` \| `talk_ratio` |
| `config_json` | jsonb | Rule parameters (word, threshold, etc.) |

---

### `scorecards`

One row per scored call.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `call_id` | uuid FK → calls | |
| `rubric_id` | uuid FK → rubrics | Rubric version used |
| `overall_score` | numeric | 0–10 |
| `summary` | text | LLM coaching summary |
| `criterion_scores` | jsonb | `{ criterion_key: score }` |
| `created_at` | timestamptz | |

**Index:** `idx_scorecards_not_null_score (overall_score) WHERE overall_score IS NOT NULL`

---

### `scorecard_evidence`

Quoted transcript evidence per criterion.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `scorecard_id` | uuid FK → scorecards | |
| `criterion_key` | text | Matches `rubric_criteria.key` |
| `quote` | text | Verbatim quote from transcript |
| `note` | text | Coaching note for this evidence |
| `sentiment` | text | `positive` \| `negative` \| `neutral` |
| `created_at` | timestamptz | |

**Index:** `idx_scorecard_evidence_criterion_key (criterion_key)`

---

### `rule_findings`

Results from the deterministic rule pass.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `call_id` | uuid FK → calls | |
| `rule_key` | text | e.g., `banned_word_mate` |
| `finding` | text | Human-readable description |
| `severity` | text | `high` \| `medium` \| `low` |
| `count` | integer | Occurrences |
| `created_at` | timestamptz | |

**Index:** `idx_rule_findings_rule_key (rule_key)`

---

### `member_trends`

Per-rep trend analysis. Upserted by `07-trend-analysis.json`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `member_id` | uuid FK → team_members | |
| `period_start` | date | Analysis window start |
| `period_end` | date | Analysis window end (upsert key with member_id) |
| `calls_analyzed` | integer | |
| `average_score` | numeric | |
| `score_trend` | text | `IMPROVING` \| `DECLINING` \| `PLATEAUING` \| `INSUFFICIENT_DATA` |
| `analysis_json` | jsonb | Full Groq coaching analysis |
| `created_at` | timestamptz | |

**Unique constraint:** `(member_id, period_end)` — safe to re-run without duplicates.

**Index:** `idx_member_trends_member_period (member_id, period_end DESC)`

---

## RPC Functions (Analytics)

Both functions use `SECURITY DEFINER` (bypass RLS) and are granted to `anon` + `authenticated`.

### `get_weekly_stats(weeks_back integer default 8)`

Returns one row per ISO week for the last N weeks.

```sql
returns table(
  week_start   timestamptz,
  week_label   text,           -- e.g. "May 12"
  total_calls  bigint,
  scored_calls bigint,
  avg_score    numeric
)
```

Called by: `GET /analytics/overview?weeks=8` (backend) and directly from frontend.

### `get_team_leaderboard()`

Returns all team members with at least one call, ranked by avg score.

```sql
returns table(
  member_id    uuid,
  member_name  text,
  total_calls  bigint,
  scored_calls bigint,
  avg_score    numeric,
  score_trend  text    -- from member_trends, latest period
)
```

Called by: `GET /analytics/leaderboard` (backend) and directly from frontend.

---

## Migrations

| File | What it adds |
|------|-------------|
| `0001_initial_schema.sql` | clients, departments, team_members, calls, call_participants |
| `0002_rubric_criteria.sql` | rubrics, rubric_criteria, rubric_rules, scorecards, scorecard_evidence |
| `0003_rls_policies.sql` | Row-level security policies for anon/authenticated |
| `0004_rule_findings.sql` | rule_findings table |
| `0005_member_trends.sql` | member_trends table + indexes |
| `0006_analytics_views.sql` | `get_weekly_stats` + `get_team_leaderboard` RPCs + performance indexes |

**Never edit a migration that has been applied.** Always add a new file.

---

## RLS Policy Summary

All tables have RLS enabled. For the demo/anon access pattern:

- `calls`, `scorecards`, `scorecard_evidence`, `rule_findings`, `call_participants`, `team_members`, `member_trends` — `anon` can SELECT (demo mode)
- All INSERT/UPDATE/DELETE — authenticated users only (n8n uses service role which bypasses RLS)
- `rubrics`, `rubric_criteria`, `rubric_rules` — authenticated users can manage; anon can read active rubric

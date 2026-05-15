# Dashboard Guide

The React portal (`frontend/`) is the primary interface for WeBuildTrades managers to review call performance.

---

## Page Map

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `DashboardPage` | Analytics command center (default landing) |
| `/calls` | `CallsPage` | All calls list with filters |
| `/calls/:id` | `CallDetailPage` | Single call scorecard + evidence |
| `/rubric` | `RubricEditorPage` | Edit and publish scoring rubric |
| `/trends` | `TrendsPage` | Per-member trend deep-dive |

---

## Dashboard Page (`/`)

The dashboard is a single-page analytics command center. It loads data from two sources in parallel on mount:

1. **Supabase Anon API** — direct RPC calls for scorecards, calls, trends
2. **Backend API** — `/analytics/overview` and `/analytics/leaderboard` endpoints

### KPI Strip

Four headline metrics at the top:

| Card | Metric | Delta indicator |
|------|--------|----------------|
| Total Calls | All calls in period | ↑↓ vs prior week |
| Avg Score | Mean overall_score | ↑↓ vs prior period |
| Team Members | Active members | — |
| Scored Calls | Calls with complete scorecard | — |

The delta (`weekDelta`, `scoreDelta`) compares the current 7-day window against the previous 7-day window.

### Dual Trend Charts

Two Recharts charts side by side:

**Weekly Call Volume (BarChart)**
- X-axis: last 8 ISO weeks (week labels from `get_weekly_stats`)
- Bars: stacked scored (teal) + unscored (indigo) calls
- Source: `get_weekly_stats` Supabase RPC

**Weekly Avg Score (AreaChart)**
- X-axis: last 8 ISO weeks
- Y-axis: 0–10
- Area: gradient fill (teal → transparent)
- Reference line: dashed at 7.0 (target threshold)
- Source: `get_weekly_stats` Supabase RPC

### Team Leaderboard

Ranked table of all reps who have at least one call:

| Column | Description |
|--------|-------------|
| Rank | Gold/silver/bronze badges for top 3, number for rest |
| Member | Avatar initials + name |
| Score ring | SVG ring showing avg score (0–10) |
| Calls | Total calls |
| Avg Score | Numeric |
| Trend | Badge: Improving (green ↑) / Declining (red ↓) / Steady (gray —) / Limited (gray) / New (blue) |

Source: `get_team_leaderboard` Supabase RPC.

### Score Distribution Donut

Pie chart showing how many calls fall into each score tier:

| Tier | Range | Color |
|------|-------|-------|
| Excellent | ≥ 9 | Teal |
| Good | 7–9 | Blue |
| Needs Work | 5–7 | Amber |
| Poor | < 5 | Red |

### Call Type Cards

Grid of cards, one per call type (DISCOVERY, FOLLOW_UP, ADS_INTRO, LAUNCH, TEAM). Each card shows call count and avg score for that type.

### Top Issues

Horizontal bar chart of the most common `rule_findings` violations across all recent calls. Shows rule key + count.

### Strategic Insights

Auto-generated coaching bullets from the most recent scorecard summaries.

### Meeting Phases

Breakdown of calls by `meeting_phase` with color-coded horizontal bars.

### Action Items

Extracted action items from recent scorecards, sorted by priority.

### Recent Calls

Table of the last 10 calls with: member name, call type, score, date, link to detail page.

---

## Data Loading Pattern

```typescript
useEffect(() => {
  async function load() {
    const [weeklyResult, leaderResult, scorecardsResult, ...] = await Promise.all([
      supabase.rpc('get_weekly_stats', { weeks_back: 8 }),
      supabase.rpc('get_team_leaderboard'),
      supabase.from('scorecards').select('...').order('created_at', { ascending: false }).limit(50),
      // ...
    ])
    // set state
  }
  load()
}, [])
```

All data loads in a single parallel batch on page mount. Loading spinner shows until all resolved.

---

## Empty States

Every section handles empty data gracefully:

- Charts show axes with no data points (no crash)
- Leaderboard shows "No team data yet" row
- Donut shows a single gray segment labeled "No Data"
- Recent Calls shows "No calls found"

---

## Adding a New Dashboard Section

1. Add a new interface to the `DashData` type at the top of `DashboardPage.tsx`
2. Add the data fetch inside the `Promise.all` in `load()`
3. Add a new `<section>` block in the JSX return
4. Use existing Recharts components for consistency (`BarChart`, `AreaChart`, `PieChart`)
5. Always add an empty-state guard

---

## Recharts Usage

Recharts v2 is already installed. Common patterns used in this project:

```tsx
// Bar chart
<ResponsiveContainer width="100%" height={220}>
  <BarChart data={weekly}>
    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
    <XAxis dataKey="week_label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
    <Bar dataKey="scored_calls" stackId="a" fill="#14b8a6" />
    <Bar dataKey="unscored" stackId="a" fill="#6366f1" />
  </BarChart>
</ResponsiveContainer>

// Area chart with gradient
<AreaChart data={weekly}>
  <defs>
    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
    </linearGradient>
  </defs>
  <ReferenceLine y={7} stroke="#f59e0b" strokeDasharray="4 4" />
  <Area type="monotone" dataKey="avg_score" fill="url(#scoreGrad)" stroke="#14b8a6" />
</AreaChart>
```

---

## ScoreRing Component

Reusable at `frontend/src/components/ScoreRing.tsx`. Renders an SVG donut ring with the score number in the center.

```tsx
<ScoreRing score={8.4} size={48} strokeWidth={4} />
```

Props:
- `score`: 0–10 (number)
- `size`: diameter in px (default 64)
- `strokeWidth`: ring thickness (default 6)
- Color auto-adjusts: ≥7 → teal, ≥5 → amber, <5 → red

---

## Theme

The portal uses a dark theme throughout:

| Token | Value |
|-------|-------|
| Background | `#0f172a` (slate-900) |
| Card background | `#1e293b` (slate-800) |
| Border | `#334155` (slate-700) |
| Primary accent | `#14b8a6` (teal-500) |
| Secondary accent | `#6366f1` (indigo-500) |
| Text primary | `#f1f5f9` (slate-100) |
| Text secondary | `#94a3b8` (slate-400) |
| Success | `#10b981` (emerald-500) |
| Danger | `#ef4444` (red-500) |
| Warning | `#f59e0b` (amber-500) |

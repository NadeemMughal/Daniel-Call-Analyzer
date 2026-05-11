export type CallType = 'discovery' | 'ads_intro' | 'launch' | 'follow_up' | 'team' | 'other'
export type CallStatus = 'pending' | 'processing' | 'scored' | 'failed'
export type Severity = 'critical' | 'warning' | 'info'
export type MemberRole = 'admin' | 'manager' | 'rep'

export interface Department {
  id: string
  name: string
  kind: string
}

export interface TeamMember {
  id: string
  name: string
  email: string
  department_id: string | null
  role: MemberRole
  departments?: Department
}

export interface Client {
  id: string
  name: string
  leadhub_id: string | null
}

export interface CallParticipant {
  id: string
  call_id: string
  team_member_id: string | null
  name: string | null
  email: string | null
  role: 'host' | 'guest'
  is_external: boolean
  team_members?: TeamMember
}

export interface Call {
  id: string
  client_id: string | null
  department_id: string | null
  call_type: CallType | null
  source: 'fathom' | 'manual'
  source_id: string | null
  recorded_at: string | null
  duration_seconds: number | null
  audio_url: string | null
  transcript_raw: string | null
  transcript_segments: TranscriptSegment[] | null
  status: CallStatus
  created_at: string
  clients?: Client
  departments?: Department
  call_participants?: CallParticipant[]
  scorecards?: Scorecard[]
}

export interface TranscriptSegment {
  speaker: string
  start_time: number
  end_time: number
  text: string
}

export interface ScorecardStrength {
  criterion: string
  score: number
  description: string
  evidence_quote: string
  timestamp_seconds: number | null
}

export interface ScorecardImprovement {
  criterion: string
  score: number
  description: string
  evidence_quote: string
  timestamp_seconds: number | null
}

export interface Scorecard {
  id: string
  call_id: string
  rubric_id: string | null
  overall_score: number | null
  summary: string | null
  strengths: ScorecardStrength[] | null
  improvements: ScorecardImprovement[] | null
  llm_model: string | null
  created_at: string
  scorecard_evidence?: ScorecardEvidence[]
}

export interface ScorecardEvidence {
  id: string
  scorecard_id: string
  criterion_key: string
  quote: string
  timestamp_seconds: number | null
}

export interface RuleFinding {
  id: string
  call_id: string
  rule_key: string
  value: {
    word?: string
    count?: number
    threshold?: number
    rep_percentage?: number
    max_allowed?: number
    suggestion?: string
  }
  severity: Severity
  context_snippets: Array<{ text: string; timestamp: number }> | null
  created_at: string
}

export interface Rubric {
  id: string
  name: string
  version: number
  content: RubricContent
  is_active: boolean
  created_at: string
}

export interface RubricContent {
  banned_words: Array<{
    word: string
    applies_to_call_types: string[]
    severity: Severity
    reason: string
  }>
  filler_words: Array<{
    word: string
    threshold_per_call: number
    severity: Severity
  }>
  talk_ratio: {
    max_rep_percentage: number
    applies_to_call_types: string[]
    severity: Severity
  }
  scoring_criteria: Array<{
    key: string
    label: string
    weight: number
    description: string
  }>
  coaching_principles: string[]
}

export interface TrendDataPoint {
  date: string
  overall_score: number
  call_id: string
  call_type: CallType
}

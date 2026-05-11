-- =============================================================
-- seed.sql — Initial data for Call Analyzer
-- Run this once after 0001_init.sql
-- =============================================================

-- Sales department
insert into departments (id, name, kind) values
  ('00000000-0000-0000-0000-000000000001', 'Sales', 'sales');

-- Team members
insert into team_members (id, name, email, department_id, role) values
  ('00000000-0000-0000-0001-000000000001', 'Daniel Brown',  'daniel@webuildtrades.com',  '00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0001-000000000002', 'Jazz',          'jazz@webuildtrades.com',    '00000000-0000-0000-0000-000000000001', 'manager'),
  ('00000000-0000-0000-0001-000000000003', 'Ben',           'ben@webuildtrades.com',     '00000000-0000-0000-0000-000000000001', 'rep'),
  ('00000000-0000-0000-0001-000000000004', 'Ruben',         'ruben@webuildtrades.com',   '00000000-0000-0000-0000-000000000001', 'rep'),
  ('00000000-0000-0000-0001-000000000005', 'Cole',          'cole@webuildtrades.com',    '00000000-0000-0000-0000-000000000001', 'rep'),
  ('00000000-0000-0000-0001-000000000006', 'Dom',           'dom@webuildtrades.com',     '00000000-0000-0000-0000-000000000001', 'rep');

-- Active rubric v1 — Daniel's sales playbook
insert into rubrics (id, name, version, is_active, content) values (
  '00000000-0000-0000-0000-000000000002',
  'WeBuildTrades Sales Playbook v1',
  1,
  true,
  '{
    "banned_words": [
      {
        "word": "mate",
        "applies_to_call_types": ["discovery", "ads_intro"],
        "severity": "critical",
        "reason": "Too casual on first-impression calls. Removes authority and expert positioning. The rep is the doctor, not a friend."
      },
      {
        "word": "basically",
        "applies_to_call_types": [],
        "severity": "warning",
        "reason": "Undermines confidence and sounds unprepared."
      },
      {
        "word": "obviously",
        "applies_to_call_types": [],
        "severity": "warning",
        "reason": "Can make prospects feel patronised."
      }
    ],
    "filler_words": [
      { "word": "um",         "threshold_per_call": 5,  "severity": "warning" },
      { "word": "uh",         "threshold_per_call": 5,  "severity": "warning" },
      { "word": "essentially","threshold_per_call": 3,  "severity": "warning" },
      { "word": "you know",   "threshold_per_call": 5,  "severity": "warning" },
      { "word": "like",       "threshold_per_call": 10, "severity": "info"    },
      { "word": "sort of",    "threshold_per_call": 5,  "severity": "warning" },
      { "word": "kind of",    "threshold_per_call": 5,  "severity": "warning" }
    ],
    "talk_ratio": {
      "max_rep_percentage": 60,
      "applies_to_call_types": ["discovery", "ads_intro", "follow_up"],
      "severity": "warning"
    },
    "scoring_criteria": [
      {
        "key": "talk_ratio",
        "label": "Talk Ratio & Listening",
        "weight": 0.20,
        "description": "Does the rep ask questions and genuinely listen? Are they dominating the conversation or letting the prospect speak?"
      },
      {
        "key": "question_stack",
        "label": "Question Stack (Ask → Listen → Dig Deeper)",
        "weight": 0.25,
        "description": "The core pattern: ask an open question, let them answer, dig into the pain behind that answer, repeat. Only after pain is fully surfaced should the rep prescribe a solution."
      },
      {
        "key": "pain_surfacing",
        "label": "Pain Surfacing",
        "weight": 0.25,
        "description": "Does the rep surface the prospect real problems — budget constraints, failed past solutions, urgency, emotional stakes?"
      },
      {
        "key": "objection_handling",
        "label": "Objection Handling",
        "weight": 0.15,
        "description": "How does the rep respond when a prospect pushes back (too expensive, need to think about it, tried ads before)?"
      },
      {
        "key": "solution_timing",
        "label": "Solution Timing & Prescription",
        "weight": 0.15,
        "description": "Is the solution presented only after pain is fully surfaced? Is it framed as a specific prescription for their exact problem, not a generic pitch?"
      }
    ],
    "coaching_principles": [
      "Authority positioning: the rep is the expert doctor prescribing a cure, not a vendor pitching a product.",
      "Pain before prescription: never pitch a solution before the prospect has articulated their problem in their own words.",
      "Questions are the product: a great sales call is 70% questions, 30% answers.",
      "Specific feedback only: reference exact moments in the transcript. Generic praise is worthless.",
      "Actionable improvements: every coaching point must tell the rep exactly what to do differently next time."
    ]
  }'
);

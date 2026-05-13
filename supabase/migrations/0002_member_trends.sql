CREATE TABLE member_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  calls_analyzed INT NOT NULL DEFAULT 0,
  average_score NUMERIC(5,2),
  score_trend TEXT CHECK (score_trend IN ('IMPROVING','DECLINING','PLATEAUING','INSUFFICIENT_DATA')),
  analysis_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX ON member_trends (member_id, period_end);
CREATE INDEX ON member_trends (member_id, period_end DESC);

ALTER TABLE member_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_trends_access" ON member_trends
  USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.id = auth.uid()
      AND (
        tm.role = 'admin'
        OR (
          tm.role = 'manager'
          AND tm.department_id = (
            SELECT department_id FROM team_members WHERE id = member_trends.member_id
          )
        )
      )
    )
  );

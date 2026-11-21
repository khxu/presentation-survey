CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  admin_key_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  results_visible INTEGER NOT NULL DEFAULT 0,
  accepting_responses INTEGER NOT NULL DEFAULT 1,
  audience_facets INTEGER NOT NULL DEFAULT 0,
  questions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL,
  sid TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (survey_id, sid)
);

CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id);

CREATE TABLE IF NOT EXISTS question_proposals (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  proposer_sid TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_question_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_proposals_survey ON question_proposals(survey_id, status, created_at);

CREATE TABLE IF NOT EXISTS proposal_votes (
  proposal_id TEXT NOT NULL,
  sid TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (proposal_id, sid)
);

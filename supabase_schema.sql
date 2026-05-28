-- ================================================================
--  ProjectHub — Supabase 데이터베이스 스키마
--  Supabase Dashboard → SQL Editor에 그대로 붙여넣어 실행하세요.
-- ================================================================

-- ── 1. 교사 계정 (Supabase Auth 대신 자체 테이블 사용) ──────────
CREATE TABLE IF NOT EXISTS teachers (
  id          TEXT PRIMARY KEY,          -- 아이디 (로그인용)
  password    TEXT NOT NULL,             -- 비밀번호 (평문; 필요시 bcrypt 적용 권장)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. 과목 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          TEXT PRIMARY KEY DEFAULT ('subj_' || gen_random_uuid()::text),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. 프로젝트(가이드라인) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY DEFAULT ('proj_' || gen_random_uuid()::text),
  subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '제목 없음',
  description TEXT DEFAULT '',
  stages      JSONB NOT NULL DEFAULT '[]',  -- [{title, items:[{type,content}]}]
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. 학생 제출 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id           BIGSERIAL PRIMARY KEY,
  year         INT NOT NULL,
  grade        INT NOT NULL,
  cls          INT NOT NULL,       -- 반
  no           INT NOT NULL,       -- 번호
  student_id   TEXT NOT NULL,      -- 학번 5자리
  student_name TEXT NOT NULL,
  subject_id   TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_title TEXT NOT NULL,
  answers      JSONB NOT NULL DEFAULT '{}',  -- {"0_0":"...", "0_1":"..."}
  file_name    TEXT,
  file_size    TEXT,
  submitted_at TEXT,
  submitted    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, project_id)
);

-- ── 5. 임시 답변 저장 (자동저장용) ─────────────────────────────
CREATE TABLE IF NOT EXISTS answer_drafts (
  id           BIGSERIAL PRIMARY KEY,
  student_id   TEXT NOT NULL,
  subject_id   TEXT NOT NULL,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, project_id)
);

-- ── 6. 인덱스 ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_subject   ON projects(subject_id);
CREATE INDEX IF NOT EXISTS idx_submissions_year   ON submissions(year);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_drafts_student     ON answer_drafts(student_id, project_id);

-- ── 7. updated_at 자동 갱신 트리거 ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_drafts_updated ON answer_drafts;
CREATE TRIGGER trg_drafts_updated
  BEFORE UPDATE ON answer_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 8. RLS (Row Level Security) ──────────────────────────────────
--  이 앱은 Supabase Auth 대신 자체 세션을 사용하므로
--  공개 읽기/쓰기를 허용합니다 (프로덕션에서는 강화 권장).
ALTER TABLE teachers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_drafts ENABLE ROW LEVEL SECURITY;

-- 전체 공개 정책 (anon key로 모든 작업 허용)
CREATE POLICY "allow_all_teachers"   ON teachers   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_subjects"   ON subjects   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_projects"   ON projects   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_submissions" ON submissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_drafts"     ON answer_drafts FOR ALL USING (true) WITH CHECK (true);

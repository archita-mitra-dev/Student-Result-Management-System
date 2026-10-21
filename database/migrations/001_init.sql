-- SRMS schema, migration 001. Recreates the full database from scratch.

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  login_id        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('student','faculty','admin')),
  full_name       TEXT NOT NULL,
  email           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_pw  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id         SERIAL PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  department_id INT REFERENCES departments(id),
  total_semesters INT NOT NULL DEFAULT 8 CHECK (total_semesters BETWEEN 1 AND 12),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE academic_years (
  id         SERIAL PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,         -- e.g. 2025-2026
  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_academic_year ON academic_years (is_active) WHERE is_active;

CREATE TABLE batches (
  id         SERIAL PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,         -- e.g. 2022-2026
  course_id  INT REFERENCES courses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_profiles (
  user_id          INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  roll_no          TEXT NOT NULL UNIQUE,
  registration_no  TEXT NOT NULL UNIQUE,
  department_id    INT REFERENCES departments(id),
  course_id        INT REFERENCES courses(id),
  batch_id         INT REFERENCES batches(id),
  current_semester INT NOT NULL DEFAULT 1 CHECK (current_semester BETWEEN 1 AND 12),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faculty_profiles (
  user_id       INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_id   TEXT NOT NULL UNIQUE,
  department_id INT REFERENCES departments(id),
  designation   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assessment schemes are versioned. A change creates a new version row.
-- config holds the raw maxima and contribution weights, see docs/assessment-rules.md.
CREATE TABLE assessment_schemes (
  id          SERIAL PRIMARY KEY,
  scheme_type TEXT NOT NULL CHECK (scheme_type IN ('theory','practical','sessional')),
  version     INT NOT NULL,
  name        TEXT NOT NULL,
  config      JSONB NOT NULL,
  is_current  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheme_type, version)
);

CREATE TABLE subjects (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('theory','practical','sessional')),
  department_id INT REFERENCES departments(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Credits are stored per subject and effective semester so they can differ by offering.
CREATE TABLE subject_offerings (
  id               SERIAL PRIMARY KEY,
  subject_id       INT NOT NULL REFERENCES subjects(id),
  academic_year_id INT NOT NULL REFERENCES academic_years(id),
  semester_no      INT NOT NULL CHECK (semester_no BETWEEN 1 AND 12),
  batch_id         INT REFERENCES batches(id),
  credits          NUMERIC(4,1),            -- NULL means credits not configured yet
  scheme_id        INT NOT NULL REFERENCES assessment_schemes(id),
  wca_max          NUMERIC(6,2),            -- theory only, teacher configured
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','submitted','approved','published','locked')),
  result_version   INT NOT NULL DEFAULT 1,
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  locked_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_id, academic_year_id, semester_no, batch_id)
);

CREATE TABLE faculty_subject_assignments (
  id          SERIAL PRIMARY KEY,
  faculty_id  INT NOT NULL REFERENCES faculty_profiles(user_id) ON DELETE CASCADE,
  offering_id INT NOT NULL REFERENCES subject_offerings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (faculty_id, offering_id)
);

CREATE TABLE student_enrollments (
  id          SERIAL PRIMARY KEY,
  student_id  INT NOT NULL REFERENCES student_profiles(user_id) ON DELETE CASCADE,
  offering_id INT NOT NULL REFERENCES subject_offerings(id) ON DELETE CASCADE,
  attempt_no  INT NOT NULL DEFAULT 1,       -- >1 for repeated or supplementary attempts
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, offering_id)
);
CREATE INDEX idx_enroll_offering ON student_enrollments(offering_id);

-- One row per assessment component of one offering (CA1, CA2, ECA, WCA, ESE, PCA1, PCA2, PESE, or sessional items).
CREATE TABLE assessment_components (
  id               SERIAL PRIMARY KEY,
  offering_id      INT NOT NULL REFERENCES subject_offerings(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('internal','external')),
  raw_max          NUMERIC(7,2) NOT NULL CHECK (raw_max > 0),
  contribution_max NUMERIC(7,2) NOT NULL CHECK (contribution_max >= 0), -- weight in the final 100 (sessional) or informational
  sort_order       INT NOT NULL DEFAULT 0,
  conducted_by     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, code)
);

CREATE TABLE student_assessment_marks (
  id           SERIAL PRIMARY KEY,
  component_id INT NOT NULL REFERENCES assessment_components(id) ON DELETE CASCADE,
  student_id   INT NOT NULL REFERENCES student_profiles(user_id) ON DELETE CASCADE,
  raw_score    NUMERIC(7,2) CHECK (raw_score >= 0),
  feedback     TEXT,
  entered_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (component_id, student_id)
);
CREATE INDEX idx_marks_student ON student_assessment_marks(student_id);

-- Assessment history: every change to a raw mark.
CREATE TABLE mark_history (
  id           BIGSERIAL PRIMARY KEY,
  component_id INT NOT NULL,
  student_id   INT NOT NULL,
  old_score    NUMERIC(7,2),
  new_score    NUMERIC(7,2),
  changed_by   INT REFERENCES users(id),
  reason       TEXT,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mark_history_student ON mark_history(student_id, component_id);

CREATE TABLE grading_schemes (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  is_placeholder BOOLEAN NOT NULL DEFAULT TRUE,   -- TRUE until the institution confirms the bands
  pass_marks_percent NUMERIC(5,2) NOT NULL DEFAULT 40,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_grading_scheme ON grading_schemes (is_active) WHERE is_active;

CREATE TABLE grading_bands (
  id          SERIAL PRIMARY KEY,
  scheme_id   INT NOT NULL REFERENCES grading_schemes(id) ON DELETE CASCADE,
  letter      TEXT NOT NULL,
  min_marks   NUMERIC(6,2) NOT NULL,
  grade_point NUMERIC(4,2) NOT NULL,
  is_pass     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (scheme_id, letter),
  UNIQUE (scheme_id, min_marks)
);

-- Final computed result per student per offering. Breakdown JSON keeps raw and converted values.
CREATE TABLE subject_results (
  id              SERIAL PRIMARY KEY,
  offering_id     INT NOT NULL REFERENCES subject_offerings(id),
  student_id      INT NOT NULL REFERENCES student_profiles(user_id),
  result_version  INT NOT NULL DEFAULT 1,
  scheme_id       INT NOT NULL REFERENCES assessment_schemes(id),
  scheme_version  INT NOT NULL,
  grading_scheme_id INT REFERENCES grading_schemes(id),
  internal_marks  NUMERIC,           -- full precision, not rounded
  internal_max    NUMERIC(6,2),
  final_marks     NUMERIC(8,4),
  breakdown       JSONB NOT NULL,
  letter_grade    TEXT,
  grade_point     NUMERIC(4,2),
  credits         NUMERIC(4,1),
  credit_points   NUMERIC(8,2),
  is_pass         BOOLEAN,
  result_status   TEXT NOT NULL CHECK (result_status IN ('pass','fail','incomplete')),
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, student_id, result_version)
);
CREATE INDEX idx_subject_results_student ON subject_results(student_id);

CREATE TABLE semester_results (
  id             SERIAL PRIMARY KEY,
  student_id     INT NOT NULL REFERENCES student_profiles(user_id),
  academic_year_id INT NOT NULL REFERENCES academic_years(id),
  semester_no    INT NOT NULL,
  total_credits  NUMERIC(6,1),
  total_credit_points NUMERIC(10,2),
  sgpa           NUMERIC(5,2),
  cgpa           NUMERIC(5,2),
  result_status  TEXT NOT NULL CHECK (result_status IN ('pass','fail','incomplete')),
  subjects_counted INT NOT NULL DEFAULT 0,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id, semester_no)
);

CREATE TABLE result_publications (
  id          SERIAL PRIMARY KEY,
  offering_id INT NOT NULL REFERENCES subject_offerings(id),
  action      TEXT NOT NULL CHECK (action IN ('submit','approve','publish','lock','reopen','correction')),
  result_version INT NOT NULL,
  acted_by    INT REFERENCES users(id),
  reason      TEXT,
  acted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    INT REFERENCES users(id),
  actor_name  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defaults. Items marked awaiting configuration must be confirmed by the institution.
INSERT INTO system_settings (key, value, note) VALUES
 ('institution_name',        '"Institution name (configure in Settings)"', 'Shown on grade cards'),
 ('university_name',         '"University name (configure in Settings)"',  'Shown on grade cards'),
 ('university_former_name',  'null',                                        'Only set if officially applicable'),
 ('exam_name',               '"End Semester Examination"',                  'Examination title on grade cards'),
 ('exam_session',            '""',                                          'Example: 2025-2026'),
 ('rounding_decimals',       '2',                                           'Applied once to final subject marks'),
 ('include_failed_in_sgpa',  'true',                                        'Awaiting institutional confirmation'),
 ('cgpa_to_percentage_factor','null',                                       'Awaiting configuration. No percentage is shown while null'),
 ('show_ygpa',               'false',                                       'Awaiting configuration'),
 ('mar_enabled',             'false',                                       'Mandatory additional requirement, awaiting configuration');

-- Default scheme version 1 for each type, using the raw maxima in the supplied architecture.
INSERT INTO assessment_schemes (scheme_type, version, name, config) VALUES
 ('theory', 1, 'Theory v1',
  '{"ca_max":25,"ca_contribution":10,"eca_max":70,"eca_contribution":10,"wca_contribution":10,"ese_max":70,"ese_contribution":70}'),
 ('practical', 1, 'Practical v1',
  '{"pca_max":40,"pca_contribution":40,"pese_max":60,"pese_contribution":60}'),
 ('sessional', 1, 'Sessional v1',
  '{"total":100,"note":"Components are defined per offering. Weights must sum to 100."}');

CREATE TABLE IF NOT EXISTS workout_sessions (
    id            SERIAL PRIMARY KEY,
    workout_id    TEXT NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    total_weight  NUMERIC(10,2),
    notes         TEXT
);

CREATE TABLE IF NOT EXISTS exercise_sets (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_name   TEXT NOT NULL,
    exercise_order  INTEGER NOT NULL,
    equipment       TEXT NOT NULL,
    weight          NUMERIC(7,2) NOT NULL,
    reps            INTEGER NOT NULL,
    set_number      INTEGER NOT NULL DEFAULT 1,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_warmup       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS personal_records (
    id            SERIAL PRIMARY KEY,
    exercise_name TEXT NOT NULL,
    equipment     TEXT NOT NULL,
    max_weight    NUMERIC(7,2) NOT NULL,
    max_one_rm    NUMERIC(7,2),
    achieved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id    INTEGER REFERENCES workout_sessions(id),
    UNIQUE(exercise_name, equipment)
);

CREATE TABLE IF NOT EXISTS exercise_times (
    id                SERIAL PRIMARY KEY,
    session_id        INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_name     TEXT NOT NULL,
    duration_seconds  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(session_id, exercise_name)
);

-- Migrations
ALTER TABLE exercise_sets ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_started ON workout_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sets_session ON exercise_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workout ON workout_sessions(workout_id);
CREATE INDEX IF NOT EXISTS idx_exercise_times_session ON exercise_times(session_id);

CREATE TABLE IF NOT EXISTS exercise_notes (
    exercise_name TEXT PRIMARY KEY,
    note          TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

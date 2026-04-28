CREATE TABLE workout_sessions (
    id            SERIAL PRIMARY KEY,
    workout_id    TEXT NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    total_weight  NUMERIC(10,2),
    notes         TEXT
);

CREATE TABLE exercise_sets (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_name   TEXT NOT NULL,
    exercise_order  INTEGER NOT NULL,
    equipment       TEXT NOT NULL,
    weight          NUMERIC(7,2) NOT NULL,
    reps            INTEGER NOT NULL,
    set_number      INTEGER NOT NULL DEFAULT 1,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE personal_records (
    id            SERIAL PRIMARY KEY,
    exercise_name TEXT NOT NULL,
    equipment     TEXT NOT NULL,
    max_weight    NUMERIC(7,2) NOT NULL,
    max_one_rm    NUMERIC(7,2),
    achieved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id    INTEGER REFERENCES workout_sessions(id),
    UNIQUE(exercise_name, equipment)
);

CREATE INDEX idx_sessions_started ON workout_sessions(started_at DESC);
CREATE INDEX idx_sets_session ON exercise_sets(session_id);
CREATE INDEX idx_sessions_workout ON workout_sessions(workout_id);

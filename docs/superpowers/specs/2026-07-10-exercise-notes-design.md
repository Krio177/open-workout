# Exercise Notes Feature Design

**Date:** 2026-07-10  
**Status:** Approved

## Summary

Global per-exercise notes: a user-editable text note attached to an exercise by name, persisted in the database, visible and editable during any workout session.

## Database

New table in `schema.sql` (Migrations section):

```sql
CREATE TABLE IF NOT EXISTS exercise_notes (
    exercise_name TEXT PRIMARY KEY,
    note          TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Empty string / deletion: saving an empty note deletes the row (upsert on non-empty, DELETE on empty).

## API

Two endpoints added to `server.js`:

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/api/exercises/:name/note` | Returns `{ note: "..." }` or `{ note: null }` if no row |
| `PUT` | `/api/exercises/:name/note` | Body `{ note }`. Upserts if non-empty, deletes row if empty. Returns `{ note, updated_at }` |

## UI (workout.html)

Location: exercise header card, below the existing read-only `currentExercise.notes` hint.

- Alpine state: `exerciseNote: ''`, `noteSaving: false`
- On `switchExercise(i)`: fetch `GET /api/exercises/:name/note` and populate `exerciseNote`
- On page init: same fetch for the initial exercise
- Textarea with auto-save on `blur` — calls `PUT`, sets `noteSaving` briefly for feedback
- Empty blur → sends empty string → backend deletes row → note becomes null

## Out of scope

- Per-session exercise notes (workout_sessions.notes column already exists but unused here)
- Note history / versioning
- Notes visible in history.html (can be added later)

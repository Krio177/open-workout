# Exercise Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global, per-exercise persistent note that the user can edit inline during any workout session.

**Architecture:** New `exercise_notes` DB table (exercise_name PK), two REST endpoints on the existing Hono server, Alpine.js textarea in the exercise header card that auto-saves on blur.

**Tech Stack:** Node.js / Hono, PostgreSQL (pg pool), Alpine.js, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `db/schema.sql` | Add `CREATE TABLE IF NOT EXISTS exercise_notes` migration |
| `server.js` | Add `GET /api/exercises/:name/note` and `PUT /api/exercises/:name/note` |
| `public/workout.html` | Add `exerciseNote`, `noteSaving` Alpine state; fetch on init + exercise switch; textarea UI |

---

### Task 1: DB migration

**Files:**
- Modify: `db/schema.sql` (Migrations section, after existing `ALTER TABLE` lines)

- [ ] **Step 1: Add the table migration**

In `db/schema.sql`, append after the existing `ALTER TABLE exercise_sets ADD COLUMN IF NOT EXISTS is_warmup ...` line:

```sql
CREATE TABLE IF NOT EXISTS exercise_notes (
    exercise_name TEXT PRIMARY KEY,
    note          TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Apply migration**

The app calls `connect()` which runs schema.sql on startup. Restart the server (or run the SQL manually):

```bash
node -e "
import('./db/client.js').then(async m => {
  await m.connect();
  console.log('Migration applied');
  process.exit(0);
});
"
```

Or simply: restart the dev server — `connect()` runs the full schema.sql with `IF NOT EXISTS` guards.

Expected: no error, table created.

- [ ] **Step 3: Verify table exists**

```bash
psql $DATABASE_URL -c "\d exercise_notes"
```

Expected output includes: `exercise_name text`, `note text`, `updated_at timestamptz`.

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add exercise_notes table migration"
```

---

### Task 2: API endpoints

**Files:**
- Modify: `server.js` (add after the existing `/api/exercises/:name/images` endpoint, around line 100)

- [ ] **Step 1: Add GET endpoint**

In `server.js`, after the `app.get('/api/exercises/:exerciseName/images', ...)` block, add:

```js
app.get('/api/exercises/:name/note', async (c) => {
  const name = decodeURIComponent(c.req.param('name'));
  const res = await pool.query(
    'SELECT note, updated_at FROM exercise_notes WHERE exercise_name = $1',
    [name]
  );
  return c.json({ note: res.rows[0]?.note ?? null });
});
```

- [ ] **Step 2: Add PUT endpoint**

Immediately after the GET, add:

```js
app.put('/api/exercises/:name/note', async (c) => {
  const name = decodeURIComponent(c.req.param('name'));
  const { note } = await c.req.json();
  if (!note || !note.trim()) {
    await pool.query('DELETE FROM exercise_notes WHERE exercise_name = $1', [name]);
    return c.json({ note: null });
  }
  const res = await pool.query(
    `INSERT INTO exercise_notes (exercise_name, note, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (exercise_name)
     DO UPDATE SET note = $2, updated_at = NOW()
     RETURNING note, updated_at`,
    [name, note.trim()]
  );
  return c.json(res.rows[0]);
});
```

- [ ] **Step 3: Test GET (no note yet)**

```bash
curl -s http://localhost:3000/api/exercises/Bench%20Press/note
```

Expected: `{"note":null}`

- [ ] **Step 4: Test PUT (save note)**

```bash
curl -s -X PUT http://localhost:3000/api/exercises/Bench%20Press/note \
  -H 'Content-Type: application/json' \
  -d '{"note":"Maradj feszes lapockával, ne emeld le a hátat."}'
```

Expected: `{"note":"Maradj feszes lapockával, ne emeld le a hátat.","updated_at":"..."}`

- [ ] **Step 5: Test GET (note exists)**

```bash
curl -s http://localhost:3000/api/exercises/Bench%20Press/note
```

Expected: `{"note":"Maradj feszes lapockával, ne emeld le a hátat."}`

- [ ] **Step 6: Test PUT empty (delete)**

```bash
curl -s -X PUT http://localhost:3000/api/exercises/Bench%20Press/note \
  -H 'Content-Type: application/json' \
  -d '{"note":""}'
```

Expected: `{"note":null}`

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat: add GET/PUT exercise note endpoints"
```

---

### Task 3: UI — Alpine state + textarea

**Files:**
- Modify: `public/workout.html`

**Context:** The Alpine app is initialized with `x-data="workoutApp()"`. The exercise header card is around line 119–174. `switchExercise(i)` is the function called when changing exercises.

- [ ] **Step 1: Add Alpine state**

In the `workoutApp()` function's data object (where other state like `exerciseHistory`, `carouselIndex` etc. are defined), add:

```js
exerciseNote: '',
noteSaving: false,
```

- [ ] **Step 2: Add note loading helper**

Add a new method `loadExerciseNote` to the Alpine app:

```js
async loadExerciseNote(name) {
  const res = await fetch(`/api/exercises/${encodeURIComponent(name)}/note`);
  const data = await res.json();
  this.exerciseNote = data.note || '';
},
```

- [ ] **Step 3: Call loadExerciseNote on init**

In the `init()` method, after the existing `loadExerciseImages` call (or wherever exercise data is first loaded), add:

```js
if (this.currentExercise) await this.loadExerciseNote(this.currentExercise.name);
```

- [ ] **Step 4: Call loadExerciseNote on exercise switch**

In `switchExercise(i)`, after setting `this.currentExerciseIndex = i` and the existing async calls, add:

```js
await this.loadExerciseNote(this.workout.exercises[i].name);
```

- [ ] **Step 5: Add save note method**

```js
async saveExerciseNote() {
  if (!this.currentExercise) return;
  this.noteSaving = true;
  await fetch(`/api/exercises/${encodeURIComponent(this.currentExercise.name)}/note`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: this.exerciseNote }),
  });
  this.noteSaving = false;
},
```

- [ ] **Step 6: Add textarea to exercise header card**

In the exercise header card (after the existing `<template x-if="currentExercise.notes">` block around line 170–173), add:

```html
<!-- User note -->
<div class="mt-3">
  <textarea
    x-model="exerciseNote"
    @blur="saveExerciseNote()"
    placeholder="Megjegyzés..."
    rows="2"
    class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500 transition"
  ></textarea>
  <span x-show="noteSaving" class="text-[10px] text-zinc-600 mt-1 block">Mentés...</span>
</div>
```

- [ ] **Step 7: Manual test in browser**

1. Open `http://localhost:3000/workout.html`, start a workout
2. Click an exercise — textarea should appear empty
3. Type a note, click elsewhere (blur) — "Mentés..." briefly flashes
4. Switch to another exercise — note clears
5. Switch back to the first exercise — note reappears
6. Delete the note text, blur — note is cleared from DB
7. Reload page, start same workout, switch to the exercise — note persists

- [ ] **Step 8: Commit**

```bash
git add public/workout.html
git commit -m "feat: exercise note textarea with auto-save on blur"
```

---

## Done

Feature complete when:
- DB table exists
- GET returns null for new exercises, saved text for known ones
- PUT upserts; empty PUT deletes
- Textarea in workout UI loads and saves correctly on exercise switch and blur

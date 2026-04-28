import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Workout definitions loader ---
const workouts = new Map();

async function loadWorkouts() {
  const dir = path.join(__dirname, 'workouts');
  const files = await fs.readdir(dir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(dir, file), 'utf-8');
    const def = JSON.parse(raw);
    workouts.set(def.id, def);
  }
  console.log(`Loaded ${workouts.size} workout(s)`);
}

// --- Helpers ---
function brzycki1RM(weight, reps) {
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
}

// --- App ---
const app = new Hono();

// Static files
app.use('/*', serveStatic({ root: './public' }));

// --- Workout definition endpoints ---
app.get('/api/workouts', (c) => {
  return c.json([...workouts.values()]);
});

app.get('/api/workouts/:id', (c) => {
  const w = workouts.get(c.req.param('id'));
  if (!w) return c.json({ error: 'Workout not found' }, 404);
  return c.json(w);
});

// --- Session endpoints ---
app.post('/api/sessions', async (c) => {
  const { workout_id } = await c.req.json();
  if (!workouts.has(workout_id)) {
    return c.json({ error: 'Unknown workout' }, 400);
  }
  const res = await pool.query(
    'INSERT INTO workout_sessions (workout_id) VALUES ($1) RETURNING *',
    [workout_id]
  );
  return c.json(res.rows[0], 201);
});

app.get('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const sessionRes = await pool.query(
    'SELECT * FROM workout_sessions WHERE id = $1', [id]
  );
  if (sessionRes.rows.length === 0) return c.json({ error: 'Session not found' }, 404);
  const setsRes = await pool.query(
    'SELECT * FROM exercise_sets WHERE session_id = $1 ORDER BY exercise_order, set_number',
    [id]
  );
  return c.json({ ...sessionRes.rows[0], sets: setsRes.rows });
});

app.put('/api/sessions/:id/finish', async (c) => {
  const id = c.req.param('id');
  const totalRes = await pool.query(
    'SELECT COALESCE(SUM(weight * reps), 0) as total FROM exercise_sets WHERE session_id = $1',
    [id]
  );
  const totalWeight = totalRes.rows[0].total;
  const res = await pool.query(
    'UPDATE workout_sessions SET finished_at = NOW(), total_weight = $2 WHERE id = $1 AND finished_at IS NULL RETURNING *',
    [id, totalWeight]
  );
  if (res.rows.length === 0) return c.json({ error: 'Session not found or already finished' }, 400);

  const setsRes = await pool.query(
    'SELECT * FROM exercise_sets WHERE session_id = $1 ORDER BY exercise_order, set_number',
    [id]
  );
  const prRes = await pool.query(
    'SELECT pr.* FROM personal_records pr WHERE pr.session_id = $1', [id]
  );

  return c.json({ session: res.rows[0], sets: setsRes.rows, newPrs: prRes.rows });
});

app.delete('/api/sessions/:id', async (c) => {
  await pool.query('DELETE FROM workout_sessions WHERE id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

// --- History (date range) ---
app.get('/api/sessions', async (c) => {
  const from = c.req.query('from') || '2000-01-01';
  const to = c.req.query('to') || '2099-12-31';
  const res = await pool.query(
    `SELECT s.*, COUNT(es.id) as set_count
     FROM workout_sessions s
     LEFT JOIN exercise_sets es ON es.session_id = s.id
     WHERE s.started_at >= $1 AND s.started_at <= $2
     GROUP BY s.id
     ORDER BY s.started_at DESC`,
    [from, to]
  );
  return c.json(res.rows);
});

// --- Set logging with PR detection ---
app.post('/api/sessions/:id/sets', async (c) => {
  const sessionId = c.req.param('id');
  const { exercise_name, exercise_order, equipment, weight, reps, set_number } = await c.req.json();

  const setRes = await pool.query(
    `INSERT INTO exercise_sets (session_id, exercise_name, exercise_order, equipment, weight, reps, set_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [sessionId, exercise_name, exercise_order, equipment, weight, reps, set_number || 1]
  );

  const oneRM = brzycki1RM(weight, reps);
  let isNewPr = false;
  let previousPr = null;

  const currentPr = await pool.query(
    'SELECT * FROM personal_records WHERE exercise_name = $1 AND equipment = $2',
    [exercise_name, equipment]
  );
  if (currentPr.rows.length > 0) {
    previousPr = currentPr.rows[0];
  }

  const prRes = await pool.query(
    `INSERT INTO personal_records (exercise_name, equipment, max_weight, max_one_rm, session_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (exercise_name, equipment)
     DO UPDATE SET
       max_weight = CASE WHEN EXCLUDED.max_weight > personal_records.max_weight
                     THEN EXCLUDED.max_weight ELSE personal_records.max_weight END,
       max_one_rm = CASE WHEN EXCLUDED.max_one_rm > personal_records.max_one_rm
                    THEN EXCLUDED.max_one_rm ELSE personal_records.max_one_rm END,
       achieved_at = CASE WHEN EXCLUDED.max_weight > personal_records.max_weight
                     THEN NOW() ELSE personal_records.achieved_at END,
       session_id = CASE WHEN EXCLUDED.max_weight > personal_records.max_weight
                    THEN EXCLUDED.session_id ELSE personal_records.session_id END
     RETURNING *`,
    [exercise_name, equipment, weight, oneRM, sessionId]
  );

  if (previousPr && prRes.rows[0].session_id == sessionId && weight > previousPr.max_weight) {
    isNewPr = true;
  } else if (!previousPr) {
    isNewPr = true;
  }

  return c.json({ set: setRes.rows[0], isNewPr, previousPr }, 201);
});

// --- Delete a set ---
app.delete('/api/sessions/:sessionId/sets/:setId', async (c) => {
  const { sessionId, setId } = c.req.param();
  await pool.query('DELETE FROM exercise_sets WHERE id = $1 AND session_id = $2', [setId, sessionId]);
  return c.json({ ok: true });
});

// --- Last session for a workout (for pre-filling sets) ---
app.get('/api/workouts/:id/last-session', async (c) => {
  const workoutId = c.req.param('id');
  const sessionRes = await pool.query(
    `SELECT s.id FROM workout_sessions s
     JOIN exercise_sets es ON es.session_id = s.id
     WHERE s.workout_id = $1 AND s.finished_at IS NOT NULL
     GROUP BY s.id
     ORDER BY MAX(s.started_at) DESC LIMIT 1`,
    [workoutId]
  );
  if (sessionRes.rows.length === 0) return c.json(null);
  const setsRes = await pool.query(
    'SELECT * FROM exercise_sets WHERE session_id = $1 ORDER BY exercise_order, set_number',
    [sessionRes.rows[0].id]
  );
  return c.json({ sessionId: sessionRes.rows[0].id, sets: setsRes.rows });
});

// --- Personal records ---
app.get('/api/prs', async (c) => {
  const res = await pool.query('SELECT * FROM personal_records ORDER BY exercise_name');
  return c.json(res.rows);
});

// --- Start ---
const port = process.env.PORT || 3000;

await loadWorkouts();
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { connect } from './db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Slugify helper ---
function slugify(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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

// --- Exercise image upload ---
const EXERCISE_IMAGES_DIR = path.join(__dirname, 'public', 'images', 'exercises');
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

app.post('/api/upload/:exerciseName', async (c) => {
  const slug = slugify(c.req.param('exerciseName'));
  const dir = path.join(EXERCISE_IMAGES_DIR, slug);
  fsSync.mkdirSync(dir, { recursive: true });

  const body = await c.req.parseBody();
  const file = body['image'];
  if (!file || !(file instanceof File)) return c.json({ error: 'No image provided' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: 'Invalid file type' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'File too large (max 10MB)' }, 400);

  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_');
  let filename = `${baseName}.${ext}`;
  let filePath = path.join(dir, filename);
  let counter = 1;
  while (fsSync.existsSync(filePath)) {
    filename = `${baseName}_${counter++}.${ext}`;
    filePath = path.join(dir, filename);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  fsSync.writeFileSync(filePath, buffer);

  return c.json({ filename, url: `/images/exercises/${slug}/${filename}` }, 201);
});

app.delete('/api/upload/:exerciseName/:filename', async (c) => {
  const slug = slugify(c.req.param('exerciseName'));
  const filePath = path.join(EXERCISE_IMAGES_DIR, slug, c.req.param('filename'));
  if (!filePath.startsWith(EXERCISE_IMAGES_DIR)) return c.json({ error: 'Invalid path' }, 400);
  if (!fsSync.existsSync(filePath)) return c.json({ error: 'File not found' }, 404);
  fsSync.unlinkSync(filePath);
  return c.json({ ok: true });
});

app.get('/api/exercises/:exerciseName/images', async (c) => {
  const slug = slugify(c.req.param('exerciseName'));
  const dir = path.join(EXERCISE_IMAGES_DIR, slug);
  if (!fsSync.existsSync(dir)) return c.json({ images: [] });
  const files = await fs.readdir(dir);
  const images = files
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .sort()
    .map(f => ({ filename: f, url: `/images/exercises/${slug}/${f}` }));
  return c.json({ images });
});

// --- Workout definition endpoints ---
app.get('/api/workouts', (c) => {
  return c.json([...workouts.values()]);
});

// --- Workout rotation (must be before :id to avoid matching "rotation" as id) ---
app.get('/api/workouts/rotation', async (c) => {
  const list = [...workouts.values()]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const lastRes = await pool.query(
    `SELECT workout_id FROM workout_sessions
     WHERE finished_at IS NOT NULL
     ORDER BY finished_at DESC LIMIT 1`
  );

  let nextIndex = 0;
  if (lastRes.rows.length > 0) {
    const lastId = lastRes.rows[0].workout_id;
    const idx = list.findIndex(w => w.id === lastId);
    if (idx !== -1) {
      nextIndex = (idx + 1) % list.length;
    }
  }

  return c.json({ workouts: list, nextIndex });
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
  // Prevent duplicate active sessions
  const existing = await pool.query(
    'SELECT id FROM workout_sessions WHERE finished_at IS NULL LIMIT 1'
  );
  if (existing.rows.length > 0) {
    return c.json(existing.rows[0], 200);
  }
  const res = await pool.query(
    'INSERT INTO workout_sessions (workout_id) VALUES ($1) RETURNING *',
    [workout_id]
  );
  return c.json(res.rows[0], 201);
});

// Static routes BEFORE parameterized ones to avoid route shadowing
app.get('/api/sessions/active', async (c) => {
  const res = await pool.query(
    `SELECT * FROM workout_sessions WHERE finished_at IS NULL ORDER BY started_at DESC`
  );
  return c.json(res.rows);
});

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

app.get('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const sessionRes = await pool.query(
    'SELECT * FROM workout_sessions WHERE id = $1', [id]
  );
  if (sessionRes.rows.length === 0) return c.json({ error: 'Session not found' }, 404);
  const [setsRes, timesRes] = await Promise.all([
    pool.query('SELECT * FROM exercise_sets WHERE session_id = $1 ORDER BY exercise_order, set_number', [id]),
    pool.query('SELECT * FROM exercise_times WHERE session_id = $1', [id])
  ]);
  return c.json({ ...sessionRes.rows[0], sets: setsRes.rows, exercise_times: timesRes.rows });
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

  const [setsRes, prRes, timesRes] = await Promise.all([
    pool.query('SELECT * FROM exercise_sets WHERE session_id = $1 ORDER BY exercise_order, set_number', [id]),
    pool.query('SELECT pr.* FROM personal_records pr WHERE pr.session_id = $1', [id]),
    pool.query('SELECT * FROM exercise_times WHERE session_id = $1', [id])
  ]);

  return c.json({ session: res.rows[0], sets: setsRes.rows, newPrs: prRes.rows, exercise_times: timesRes.rows });
});

app.delete('/api/sessions/:id', async (c) => {
  await pool.query('DELETE FROM workout_sessions WHERE id = $1', [c.req.param('id')]);
  return c.json({ ok: true });
});

// --- Exercise time tracking ---
app.put('/api/sessions/:id/exercise-time', async (c) => {
  const sessionId = c.req.param('id');
  const { exercise_name, duration_seconds } = await c.req.json();
  const res = await pool.query(
    `INSERT INTO exercise_times (session_id, exercise_name, duration_seconds)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, exercise_name)
     DO UPDATE SET duration_seconds = $3
     RETURNING *`,
    [sessionId, exercise_name, Math.round(duration_seconds)]
  );
  return c.json(res.rows[0]);
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

// --- Dashboard stats ---
app.get('/api/stats', async (c) => {
  const [weekly, volume, distribution] = await Promise.all([
    // Workouts per week (last 8 weeks)
    pool.query(`
      SELECT date_trunc('week', started_at)::date as week,
             COUNT(*) as count
      FROM workout_sessions
      WHERE finished_at IS NOT NULL
        AND started_at >= NOW() - INTERVAL '8 weeks'
      GROUP BY week ORDER BY week
    `),
    // Total weight per session (last 20 finished sessions)
    pool.query(`
      SELECT id, workout_id, started_at::date as date, total_weight
      FROM workout_sessions
      WHERE finished_at IS NOT NULL AND total_weight > 0
      ORDER BY started_at DESC LIMIT 20
    `),
    // Workout type distribution (all time)
    pool.query(`
      SELECT workout_id, COUNT(*) as count
      FROM workout_sessions
      WHERE finished_at IS NOT NULL
      GROUP BY workout_id ORDER BY count DESC
    `)
  ]);

  // Enrich distribution with workout names
  const dist = distribution.rows.map(r => ({
    ...r,
    name: workouts.get(r.workout_id)?.name || r.workout_id,
    color: workouts.get(r.workout_id)?.color || '#ef4444'
  }));

  return c.json({
    weekly: weekly.rows,
    volume: volume.rows.reverse(),
    distribution: dist
  });
});

// --- Personal records ---
app.get('/api/prs', async (c) => {
  const res = await pool.query('SELECT * FROM personal_records ORDER BY exercise_name');
  return c.json(res.rows);
});

// --- Start ---
const port = process.env.PORT || 3000;

await connect();
await loadWorkouts();
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});

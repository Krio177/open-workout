# SparkyFitness Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a workout finishes in open-workout, automatically POST the session as an exercise entry to SparkyFitness — no extra user action required.

**Architecture:** A standalone `integrations/sparky.js` module handles all SparkyFitness communication. After `PUT /api/sessions/:id/finish` completes, it calls this module fire-and-forget — errors are logged to console but never surface to the client. Config lives in `.env` (3 new vars). If vars are unset, the integration silently no-ops. One entry per workout session is logged as a configurable exercise type (e.g. "Strength Training"), recording total duration and an estimated calorie burn.

**Tech Stack:** Node.js ESM, Hono backend, native `fetch` (Node 18+), SparkyFitness REST API with Bearer token auth

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `integrations/sparky.js` | Create | SparkyFitness API client + calorie estimation |
| `server.js` | Modify line ~212 | Wire integration call into PUT /finish handler |
| `.env` | Modify | Add 3 new config vars |

---

### Task 1: Add SparkyFitness config to .env

**Files:**
- Modify: `.env`

- [ ] **Step 1: Append config vars to .env**

Open `.env` and append these three lines:

```
# SparkyFitness integration (all three required — leave blank to disable)
SPARKY_FITNESS_URL=
SPARKY_FITNESS_API_KEY=
SPARKY_FITNESS_EXERCISE_ID=
```

`SPARKY_FITNESS_URL` — base URL of your SparkyFitness instance, e.g. `http://localhost:3004`

`SPARKY_FITNESS_API_KEY` — API key with `health_data_write` permission (create in SparkyFitness → Settings → API Keys)

`SPARKY_FITNESS_EXERCISE_ID` — UUID of the exercise to log under (e.g. "Strength Training"). Find it:

```bash
curl -s -H "Authorization: Bearer <your-api-key>" \
  http://<sparky-host>/api/exercises \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>
      JSON.parse(Buffer.concat(d)).forEach(e=>console.log(e.id, e.name)))"
```

- [ ] **Step 2: Verify server still starts cleanly**

```bash
node --env-file=.env server.js
```

Expected output (all three lines):
```
Database connected
Database schema applied
Server running on http://localhost:3000
```

Kill with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add .env
git commit -m "config: add SparkyFitness integration env vars (disabled by default)"
```

---

### Task 2: Create the SparkyFitness integration module

**Files:**
- Create: `integrations/sparky.js`

- [ ] **Step 1: Create the file**

Create `integrations/sparky.js` with this exact content:

```js
/**
 * SparkyFitness integration — posts finished workout as a single exercise entry.
 *
 * Required env vars (all three must be set, else this is a no-op):
 *   SPARKY_FITNESS_URL          — base URL, e.g. http://localhost:3004
 *   SPARKY_FITNESS_API_KEY      — Bearer token with health_data_write permission
 *   SPARKY_FITNESS_EXERCISE_ID  — UUID of the exercise to log under (e.g. "Strength Training")
 */

const CALORIES_PER_MINUTE = 5; // ~3 MET × 70 kg average, rough weight-training approximation

/**
 * Pushes a finished workout session to SparkyFitness.
 *
 * @param {{ session: object, exercise_times: Array<{duration_seconds: number}> }} finishResult
 *   The object returned by PUT /api/sessions/:id/finish
 */
export async function pushToSparkyFitness({ session, exercise_times }) {
  const url = process.env.SPARKY_FITNESS_URL;
  const apiKey = process.env.SPARKY_FITNESS_API_KEY;
  const exerciseId = process.env.SPARKY_FITNESS_EXERCISE_ID;

  if (!url || !apiKey || !exerciseId) return; // not configured

  const totalSeconds = exercise_times.reduce((sum, t) => sum + t.duration_seconds, 0);
  const durationMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const caloriesBurned = Math.round(durationMinutes * CALORIES_PER_MINUTE);
  const entryDate = new Date(session.started_at).toISOString().slice(0, 10); // YYYY-MM-DD

  const res = await fetch(`${url}/api/exercise-entries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      exercise_id: exerciseId,
      duration_minutes: durationMinutes,
      calories_burned: caloriesBurned,
      entry_date: entryDate,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SparkyFitness API ${res.status}: ${text}`);
  }

  return res.json();
}
```

- [ ] **Step 2: Verify the module loads without errors**

```bash
node --env-file=.env --input-type=module <<'EOF'
import { pushToSparkyFitness } from './integrations/sparky.js';
console.log('OK, type:', typeof pushToSparkyFitness);
EOF
```

Expected: `OK, type: function`

- [ ] **Step 3: Verify no-op when env vars are unset**

(The current `.env` has the vars blank, so this tests the disabled path.)

```bash
node --env-file=.env --input-type=module <<'EOF'
import { pushToSparkyFitness } from './integrations/sparky.js';
const result = await pushToSparkyFitness({
  session: { started_at: new Date().toISOString() },
  exercise_times: [{ duration_seconds: 3600 }],
});
console.log('result:', result); // should be undefined (no-op)
EOF
```

Expected: `result: undefined`

- [ ] **Step 4: Commit**

```bash
git add integrations/sparky.js
git commit -m "feat: add SparkyFitness integration module with calorie estimation"
```

---

### Task 3: Wire integration into PUT /finish endpoint

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add import at top of server.js**

After the existing imports in `server.js` (after line 8, the `import pool` line), add:

```js
import { pushToSparkyFitness } from './integrations/sparky.js';
```

- [ ] **Step 2: Replace the final return in PUT /finish handler**

Find this line in `server.js` (currently line ~212, inside `app.put('/api/sessions/:id/finish', ...)`):

```js
  return c.json({ session: res.rows[0], sets: setsRes.rows, newPrs: prRes.rows, exercise_times: timesRes.rows });
```

Replace it with:

```js
  const finishResult = { session: res.rows[0], sets: setsRes.rows, newPrs: prRes.rows, exercise_times: timesRes.rows };

  // Fire-and-forget: push to SparkyFitness without blocking the response
  pushToSparkyFitness(finishResult).catch(err =>
    console.error('[SparkyFitness] push failed:', err.message)
  );

  return c.json(finishResult);
```

- [ ] **Step 3: Restart server and verify clean startup**

```bash
node --env-file=.env server.js
```

Expected: same 3 startup lines as before, no import errors. Kill with Ctrl-C.

- [ ] **Step 4: Smoke test — finish a workout, verify response is not blocked**

Start server, then in another terminal:

```bash
# Create a session
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"workout_id":"back-day"}' \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(Buffer.concat(d)).id))")

echo "Session: $SESSION_ID"

# Finish it immediately (no sets, duration will be 0 → defaults to 1 min)
curl -s -X PUT http://localhost:3000/api/sessions/$SESSION_ID/finish \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{
      const r=JSON.parse(Buffer.concat(d));
      console.log('has session:', !!r.session, '| has sets:', Array.isArray(r.sets));
    })"
```

Expected: `has session: true | has sets: true`

Server logs should show nothing (integration is no-op since env vars are blank).

- [ ] **Step 5: Smoke test — verify fire-and-forget error handling**

Temporarily override env vars to point at a non-existent host:

```bash
SPARKY_FITNESS_URL=http://localhost:9999 \
SPARKY_FITNESS_API_KEY=fake \
SPARKY_FITNESS_EXERCISE_ID=fake-uuid \
node --env-file=.env server.js &
SERVER_PID=$!
sleep 1

SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"workout_id":"back-day"}' \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(JSON.parse(Buffer.concat(d)).id))")

RESP=$(curl -s -X PUT http://localhost:3000/api/sessions/$SESSION_ID/finish)
echo "Response has session: $(echo $RESP | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>console.log(!!JSON.parse(Buffer.concat(d)).session))")"
sleep 1  # wait for async push attempt
kill $SERVER_PID 2>/dev/null
```

Expected:
- Response line: `Response has session: true` (HTTP call not blocked)
- Server logs contain: `[SparkyFitness] push failed: fetch failed` or similar connection error

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: wire SparkyFitness push into workout finish (fire-and-forget)"
```

---

### Task 4: Live integration test with real SparkyFitness

**Files:** none (verification only)

- [ ] **Step 1: Fill in real values in .env**

```
SPARKY_FITNESS_URL=http://<your-sparky-host>:<port>
SPARKY_FITNESS_API_KEY=<your-api-key>
SPARKY_FITNESS_EXERCISE_ID=<uuid-from-step-1>
```

- [ ] **Step 2: Complete a full workout in the UI**

1. Open `http://localhost:3000`
2. Start a workout
3. Log at least one set on one exercise
4. Click "Finish Workout"

- [ ] **Step 3: Verify entry appeared in SparkyFitness**

```bash
TODAY=$(date +%Y-%m-%d)
curl -s \
  -H "Authorization: Bearer $SPARKY_FITNESS_API_KEY" \
  "$SPARKY_FITNESS_URL/api/exercise-entries?date=$TODAY" \
  | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{
      const entries=JSON.parse(Buffer.concat(d));
      console.log('entries today:', entries.length);
      if(entries[0]) console.log('latest:', JSON.stringify(entries[0], null, 2));
    })"
```

Expected: at least 1 entry with `entry_date` = today, `duration_minutes` > 0, `calories_burned` > 0.

- [ ] **Step 4: Bump version to 1.15.0**

```bash
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const p = JSON.parse(readFileSync('./package.json', 'utf-8'));
p.version = '1.15.0';
writeFileSync('./package.json', JSON.stringify(p, null, 2) + '\n');
console.log('Version set to', p.version);
EOF
```

- [ ] **Step 5: Final commit**

```bash
git add package.json
git commit -m "v1.15.0: auto-push workouts to SparkyFitness on finish"
```

---

## Self-Review

**Spec coverage:**
- ✅ Automatic trigger: PUT /finish handler
- ✅ API key auth: `Authorization: Bearer`
- ✅ Calorie estimation: `duration_minutes × 5`
- ✅ Fire-and-forget: errors logged, response not blocked
- ✅ Disabled when env vars unset (no-op)
- ✅ Config in .env (YAGNI — no settings UI needed)

**No placeholder issues found.**

**Type consistency:** `pushToSparkyFitness` is named and called consistently across all tasks.

**Known limitation documented:** SparkyFitness's exact `/api/exercise-entries` request schema was inferred from research; if the live API rejects the payload, check `/api/api-docs` on the SparkyFitness instance for the authoritative schema and adjust the `body` object in `integrations/sparky.js`.

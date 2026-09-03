/**
 * SparkyFitness integration — posts one exercise entry per exercise type in the finished workout.
 *
 * Required env vars:
 *   SPARKY_FITNESS_URL          — base URL, e.g. http://localhost:3004
 *   SPARKY_FITNESS_API_KEY      — Bearer token with health_data_write permission
 *
 * Exercise → Sparky UUID mapping comes from the workout JSON files (sparkyId field).
 * Call buildSparkyMap(workoutsMap) at startup to populate the map.
 *
 * Optional:
 *   SPARKY_FITNESS_BODY_MASS_KG — body mass in kg for calorie calculation (default: 70)
 */

if (!process.env.SPARKY_FITNESS_BODY_MASS_KG) {
  console.warn('[SparkyFitness] SPARKY_FITNESS_BODY_MASS_KG nincs beállítva — 70 kg default használatban, a kalóriaértékek pontatlanok lesznek');
}

/**
 * MET (metabolic equivalent) per exercise — ACSM/Compendium resistance-training ballpark
 * values, already scaled to effort level (heavy sets are "vigorous", not extra multiplier).
 * Unknown exercises fall back to DEFAULT.
 */
const MET_TABLE = {
  // Compound — alsótest
  squat: 5.0, 'front squat': 5.0, 'guggolás': 5.0, guggolas: 5.0,
  'romanian deadlift': 5.0, 'romaniai felhuzas': 5.0, rdl: 5.0,
  deadlift: 5.0, 'felhúzás': 5.0, felhuzas: 5.0, 'sumo deadlift': 5.0,
  'hip thrust': 5.0, 'glute bridge': 4.0, 'leg press': 4.5,
  lunge: 5.0, 'kitörés': 5.0, kitores: 5.0,
  'bulgarian split squat': 5.0,

  // Compound — felsőtest nyomás
  'bench press': 4.5, 'fekvenyomás': 4.5, fekvenyomas: 4.5,
  'incline bench': 4.5, 'decline bench': 4.5,
  'overhead press': 4.5, 'shoulder press': 4.5, 'military press': 4.5,
  'vállból nyomás': 4.5, 'nyomas allva': 4.5, 'push press': 5.0,
  dip: 4.5,

  // Compound — felsőtest húzás
  'pull up': 5.5, pullup: 5.5, 'chin up': 5.5, chinup: 5.5,
  'lat pulldown': 4.5, 'lat huzas': 4.5,
  'seated row': 4.5, 'cable row': 4.5, 'barbell row': 4.5,
  'bent over row': 4.5, 't-bar row': 4.5, evezes: 4.5,

  // Izoláció
  'calf raise': 3.0, 'vadli emeles': 3.0,
  'leg curl': 3.0, 'leg extension': 3.0, 'nordic ham curl': 3.5,
  'chest fly': 3.0, 'cable fly': 3.0, 'kabel keresztezes': 3.0,
  'tamas kar elore': 3.0,
  'tricep pushdown': 3.0, 'triceps pushdown': 3.0, 'skull crusher': 3.0,
  'bicep curl': 3.0, 'biceps curl': 3.0, bicepsz: 3.0,
  'hammer curl': 3.0, 'preacher curl': 3.0,
  'face pull': 3.0, arckezeles: 3.0,
  shrug: 3.0, 'trapex emeles': 3.0,
  'oldal emeles': 3.0, 'far emeles': 3.0,
  'rear delt fly': 3.0,
  'cable kickback': 3.0,

  // Core
  'sit up': 3.5, 'decline sit up': 3.5, 'hanging leg raise': 3.5,
  plank: 3.0, 'ab wheel': 3.5,

  DEFAULT: 3.5,
};

/**
 * Look up MET by exercise name. Tries exact match (case-insensitive), then substring match.
 * Substring fallback checks longest keys first so e.g. 'decline bench' doesn't get
 * shadowed by a shorter unrelated key that also happens to be a substring.
 */
function getMET(name) {
  const key = name.toLowerCase().trim();
  if (MET_TABLE[key] != null) return MET_TABLE[key];
  for (const [k, v] of Object.entries(MET_TABLE).sort((a, b) => b[0].length - a[0].length)) {
    if (k !== 'DEFAULT' && key.includes(k)) return v;
  }
  return MET_TABLE.DEFAULT;
}

/**
 * Net kcal burned for an exercise — the excess over resting metabolism.
 * (MET - 1) subtracts the resting component so this adds cleanly on top of TDEE
 * without double-counting the session's resting cost.
 * 1.05 = 3.5 ml/kg/min × 60 / 200 — the MET → kcal/kg/hour conversion factor.
 * No load-based multiplier: the MET already encodes effort level, so scaling by
 * relative load again would double-count it.
 */
function kcalForExercise(exerciseName, workSets, durationMinutes, bodyMassKg) {
  const met = getMET(exerciseName);
  return Math.max(0, met - 1) * 1.05 * bodyMassKg * (durationMinutes / 60);
}

// exerciseName.toLowerCase() → sparkyId UUID
// ponytail: module-level map, populated once at startup via buildSparkyMap
const sparkyIdMap = new Map();

/**
 * Call this once after loading workout JSONs.
 * @param {Map<string, object>} workoutsMap — the server's workouts Map (id → workout def)
 */
export function buildSparkyMap(workoutsMap) {
  sparkyIdMap.clear();
  for (const workout of workoutsMap.values()) {
    for (const exercise of workout.exercises ?? []) {
      if (exercise.sparkyId) {
        sparkyIdMap.set(exercise.name.toLowerCase(), exercise.sparkyId);
      }
    }
  }
  console.log(`[SparkyFitness] mapped ${sparkyIdMap.size} exercise(s)`);
}

/**
 * Pushes a finished workout session to SparkyFitness — one entry per exercise type,
 * including all sets with weight/reps data.
 *
 * @param {{ session: object, sets: Array, exercise_times: Array }} finishResult
 * @returns {string|null} Sparky entry ID of the last pushed exercise (for later note/rating update)
 */
export async function pushToSparkyFitness({ session, sets, exercise_times }) {
  const url = process.env.SPARKY_FITNESS_URL;
  const apiKey = process.env.SPARKY_FITNESS_API_KEY;

  if (!url || !apiKey) return null; // not configured

  const bodyMassKg = parseFloat(process.env.SPARKY_FITNESS_BODY_MASS_KG) || 70;
  const entryDate = new Date(session.started_at).toISOString().slice(0, 10);
  const entryTime = new Date(session.started_at).toTimeString().slice(0, 5); // "HH:MM"

  // Group ALL sets by exercise name (warmup + working)
  const byExercise = new Map();
  for (const s of sets) {
    if (!byExercise.has(s.exercise_name)) byExercise.set(s.exercise_name, []);
    byExercise.get(s.exercise_name).push(s);
  }

  let lastEntryId = null;

  for (const [exerciseName, exerciseSets] of byExercise) {
    const sparkyId = sparkyIdMap.get(exerciseName.toLowerCase());
    if (!sparkyId) {
      console.error(`[SparkyFitness] no sparkyId for exercise "${exerciseName}" — skipping`);
      continue;
    }

    const workSets = exerciseSets.filter(s => !s.is_warmup);

    const timeEntry = exercise_times.find(t => t.exercise_name === exerciseName);
    const durationMinutes = timeEntry
      ? Math.max(1, Math.round(timeEntry.duration_seconds / 60))
      : 1;

    const caloriesBurned = Math.round(kcalForExercise(exerciseName, workSets, durationMinutes, bodyMassKg));

    const sparkySets = exerciseSets.map(s => ({
      set_number: s.set_number,
      set_type: s.is_warmup ? 'Warm-up Set' : 'Working Set',
      reps: s.reps,
      weight: Number(s.weight),
      rpe: null,
      duration: null,
      rest_time: null,
    }));

    const res = await fetch(`${url}/api/exercise-entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        exercise_id: sparkyId,
        sets: sparkySets,
        notes: '',
        entry_date: entryDate,
        entry_time: entryTime,
        calories_burned: caloriesBurned,
        duration_minutes: durationMinutes,
        distance: null,
        avg_heart_rate: null,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SparkyFitness API ${res.status} for "${exerciseName}": ${text}`);
    }

    const data = await res.json();
    lastEntryId = data.id;
    console.log(`[SparkyFitness] "${exerciseName}": ${workSets.length} sets, ${caloriesBurned} kcal → entry ${data.id}`);
  }

  return lastEntryId;
}

/**
 * Updates the notes field of a Sparky exercise entry (for session note + rating).
 * GET current entry first to preserve all existing data, then PUT with notes updated.
 * @param {string} entryId — Sparky entry ID
 * @param {string} notes — formatted note text
 */
export async function updateSparkyEntryNotes(entryId, notes) {
  const url = process.env.SPARKY_FITNESS_URL;
  const apiKey = process.env.SPARKY_FITNESS_API_KEY;
  if (!url || !apiKey || !entryId) return;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // GET current entry to preserve existing fields (set IDs etc.)
  const getRes = await fetch(`${url}/api/exercise-entries/${entryId}`, { headers });
  if (!getRes.ok) throw new Error(`SparkyFitness GET ${getRes.status}`);
  const current = await getRes.json();

  const putRes = await fetch(`${url}/api/exercise-entries/${entryId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...current, notes }),
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`SparkyFitness PUT ${putRes.status}: ${text}`);
  }
  console.log(`[SparkyFitness] entry ${entryId} notes updated`);
}

// ponytail: self-check for the kcalForExercise formula — run with `node integrations/sparky.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const bodyMass = 80;
  const KCAL_PER_MET_KG_H = 1.05;
  const expect = (met, min) => (met - 1) * KCAL_PER_MET_KG_H * bodyMass * (min / 60);

  const squat = kcalForExercise('squat', [{ weight: 100, reps: 10 }], 3, bodyMass);
  console.assert(Math.abs(squat - expect(5.0, 3)) < 1e-9,
    'squat = (MET-1) × 1.05 × bodyMass × hours');

  // Load must NOT affect the result anymore
  const light = kcalForExercise('squat', [{ weight: 20, reps: 10 }], 3, bodyMass);
  console.assert(Math.abs(squat - light) < 1e-9,
    'load must not multiply the MET — effort level is already baked into the MET');

  const unknown = kcalForExercise('made up exercise xyz', [{ weight: 0, reps: 10 }], 3, bodyMass);
  console.assert(Math.abs(unknown - expect(3.5, 3)) < 1e-9,
    'unknown exercise → DEFAULT MET');

  const isolation = kcalForExercise('bicep curl', [{ weight: 20, reps: 10 }], 3, bodyMass);
  console.assert(isolation < squat, 'isolation < compound for the same duration');

  const zeroDuration = kcalForExercise('squat', [{ weight: 100, reps: 10 }], 0, bodyMass);
  console.assert(zeroDuration === 0, 'zero duration → zero kcal');

  console.log('[sparky.js] self-check passed');
}

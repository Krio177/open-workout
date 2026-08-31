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

// How much a heavy relative load (weight ÷ bodyweight) can boost the base MET.
// avgRelLoad is capped here so e.g. a 2x-bodyweight deadlift can't blow up the multiplier.
const LOAD_CAP = 1.5;

/**
 * MET (metabolic equivalent) per exercise — ACSM resistance-training ballpark values:
 *   3.5 = light/isolation, 5.0 = general/default, 6.0 = vigorous compound.
 * Unknown exercises fall back to DEFAULT.
 */
const MET_TABLE = {
  // Lower body compound (vigorous)
  squat: 6.0, 'front squat': 6.0, guggolás: 6.0, guggolas: 6.0,
  lunge: 6.0, kitörés: 6.0, kitores: 6.0,
  'romanian deadlift': 6.0, 'romaniai felhuzas': 6.0, rdl: 6.0,
  deadlift: 6.0, felhúzás: 6.0, felhuzas: 6.0, 'sumo deadlift': 6.0,
  'hip thrust': 6.0, 'glute bridge': 5.0,
  'leg press': 5.0, 'leg curl': 3.5, 'leg extension': 3.5,
  'calf raise': 3.5, 'vadli emeles': 3.5,

  // Upper body push
  'bench press': 5.0, fekvenyomás: 5.0, fekvenyomas: 5.0,
  'incline bench': 5.0, 'decline bench': 5.0,
  'overhead press': 5.0, 'shoulder press': 5.0, 'nyomas allva': 5.0,
  'vállból nyomás': 5.0, 'military press': 5.0, 'push press': 6.0,
  dip: 5.0, 'chest fly': 3.5, 'tamas kar elore': 3.5,
  'cable fly': 3.5, 'kabel keresztezes': 3.5,
  'tricep pushdown': 3.5, 'triceps pushdown': 3.5, 'skull crusher': 3.5,

  // Upper body pull
  'pull up': 6.0, pullup: 6.0, 'chin up': 6.0, chinup: 6.0,
  'lat pulldown': 5.0, 'lat huzas': 5.0,
  'seated row': 5.0, 'cable row': 5.0,
  'bent over row': 5.0, 'barbell row': 5.0, evezes: 5.0, 't-bar row': 5.0,
  'face pull': 3.5, arckezeles: 3.5, shrug: 3.5, 'trapex emeles': 3.5,
  'oldal emeles': 3.5, 'far emeles': 3.5,
  'bicep curl': 3.5, 'biceps curl': 3.5, bicepsz: 3.5,
  'hammer curl': 3.5, 'preacher curl': 3.5,

  DEFAULT: 5.0,
};

/**
 * Look up MET by exercise name. Tries exact match (case-insensitive), then substring match.
 */
function getMET(name) {
  const key = name.toLowerCase().trim();
  if (MET_TABLE[key] != null) return MET_TABLE[key];
  for (const [k, v] of Object.entries(MET_TABLE)) {
    if (k !== 'DEFAULT' && key.includes(k)) return v;
  }
  return MET_TABLE.DEFAULT;
}

/**
 * Calculate kcal burned for an exercise using MET, time-under-load, and relative load.
 *
 *   avgRelLoad = avg(weight × reps) / totalReps / bodyMass   — how heavy the sets were vs. bodyweight
 *   kcal = MET × (1 + min(avgRelLoad, LOAD_CAP)) × bodyMass(kg) × duration(hours)
 *
 * The MET alone (ACSM tables) ignores how much weight was actually moved, so the same
 * duration would burn the same calories whether the set was empty-bar or maxed out.
 * The relative-load term nudges the MET up for heavier sets, closer to the old physics model.
 */
function kcalForExercise(exerciseName, workSets, durationMinutes, bodyMassKg) {
  const met = getMET(exerciseName);
  const totalReps = workSets.reduce((sum, s) => sum + s.reps, 0);
  const avgRelLoad = totalReps
    ? workSets.reduce((sum, s) => sum + Number(s.weight) * s.reps, 0) / totalReps / bodyMassKg
    : 0;
  const intensity = 1 + Math.min(avgRelLoad, LOAD_CAP);
  return met * intensity * bodyMassKg * (durationMinutes / 60);
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

  const bodyweightOnly = kcalForExercise('squat', [{ weight: 0, reps: 10 }], 3, bodyMass);
  console.assert(Math.abs(bodyweightOnly - 6.0 * bodyMass * (3 / 60)) < 1e-9, 'bodyweight-only should equal base MET × bodyMass × hours');

  const heavy = kcalForExercise('squat', [{ weight: bodyMass, reps: 10 }], 3, bodyMass);
  console.assert(heavy > bodyweightOnly * 1.9, 'a bodyweight-equivalent load should roughly double the base burn');

  const capped = kcalForExercise('squat', [{ weight: bodyMass * 10, reps: 10 }], 3, bodyMass);
  const maxPossible = 6.0 * (1 + LOAD_CAP) * bodyMass * (3 / 60);
  console.assert(Math.abs(capped - maxPossible) < 1e-9, 'load multiplier must be capped at LOAD_CAP');

  const unknown = kcalForExercise('made up exercise xyz', [{ weight: 0, reps: 10 }], 3, bodyMass);
  console.assert(Math.abs(unknown - 5.0 * bodyMass * (3 / 60)) < 1e-9, 'unknown exercise should fall back to DEFAULT MET');

  console.log('[sparky.js] self-check passed');
}

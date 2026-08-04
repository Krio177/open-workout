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

// Physics constants
const G = 9.81;          // m/s²
const J_TO_KCAL = 4184;  // joules per kcal
const EFFICIENCY = 0.22; // human muscle mechanical efficiency (concentric)
const ECCENTRIC = 1.2;   // multiplier to account for eccentric (lowering) phase energy cost

/**
 * Exercise parameters: [ROM in metres, fraction of body mass that moves with the bar]
 *
 * ROM: average range of motion for the concentric phase
 * bodyFraction: fraction of lifter's body mass that travels the same ROM as the bar
 *   (e.g. squat moves ~65% of body mass up/down with the bar)
 *
 * Unknown exercises fall back to DEFAULT.
 */
const EXERCISE_PARAMS = {
  // Lower body compound
  squat:                [0.50, 0.65],
  'front squat':        [0.50, 0.65],
  guggolás:             [0.50, 0.65],
  guggolas:             [0.50, 0.65],
  lunge:                [0.45, 0.65],
  kitörés:              [0.45, 0.65],
  kitores:              [0.45, 0.65],
  'leg press':          [0.40, 0.00],
  'romanian deadlift':  [0.55, 0.10],
  'romaniai felhuzas':  [0.55, 0.10],
  'rdl':                [0.55, 0.10],
  deadlift:             [0.60, 0.10],
  felhúzás:             [0.60, 0.10],
  felhuzas:             [0.60, 0.10],
  'sumo deadlift':      [0.55, 0.10],
  'hip thrust':         [0.25, 0.55],
  'glute bridge':       [0.20, 0.55],
  'leg curl':           [0.40, 0.00],
  'leg extension':      [0.40, 0.00],
  'calf raise':         [0.10, 0.00],
  'vadli emeles':       [0.10, 0.00],

  // Upper body push
  'bench press':        [0.40, 0.05],
  fekvenyomás:          [0.40, 0.05],
  fekvenyomas:          [0.40, 0.05],
  'incline bench':      [0.40, 0.05],
  'decline bench':      [0.35, 0.05],
  'overhead press':     [0.50, 0.05],
  'shoulder press':     [0.50, 0.05],
  'nyomas allva':       [0.50, 0.05],
  'vállból nyomás':     [0.50, 0.05],
  'military press':     [0.50, 0.05],
  'push press':         [0.55, 0.05],
  dip:                  [0.45, 0.40],
  'chest fly':          [0.50, 0.02],
  'tamas kar elore':    [0.50, 0.02],
  'cable fly':          [0.50, 0.02],
  'kabel keresztezes':  [0.50, 0.02],
  'tricep pushdown':    [0.35, 0.00],
  'triceps pushdown':   [0.35, 0.00],
  'skull crusher':      [0.35, 0.02],

  // Upper body pull
  'pull up':            [0.55, 0.65],
  'pullup':             [0.55, 0.65],
  'chin up':            [0.55, 0.65],
  'chinup':             [0.55, 0.65],
  'lat pulldown':       [0.55, 0.00],
  'lat huzas':          [0.55, 0.00],
  'seated row':         [0.45, 0.00],
  'cable row':          [0.45, 0.00],
  'bent over row':      [0.40, 0.10],
  'barbell row':        [0.40, 0.10],
  evezes:               [0.40, 0.10],
  't-bar row':          [0.40, 0.10],
  'face pull':          [0.35, 0.00],
  arckezeles:           [0.35, 0.00],
  shrug:                [0.10, 0.00],
  'trapex emeles':      [0.10, 0.00],
  'oldal emeles':       [0.30, 0.00],
  'far emeles':         [0.30, 0.00],
  'bicep curl':         [0.35, 0.02],
  'biceps curl':        [0.35, 0.02],
  bicepsz:              [0.35, 0.02],
  'hammer curl':        [0.35, 0.02],
  'preacher curl':      [0.30, 0.00],

  // Default fallback for unrecognised exercises
  DEFAULT:              [0.45, 0.05],
};

/**
 * Look up exercise parameters by name.
 * Tries exact match (case-insensitive), then substring match.
 */
function getExerciseParams(name) {
  const key = name.toLowerCase().trim();
  if (EXERCISE_PARAMS[key]) return EXERCISE_PARAMS[key];
  // Substring match — pick the first key that appears in the exercise name
  for (const [k, v] of Object.entries(EXERCISE_PARAMS)) {
    if (k !== 'DEFAULT' && key.includes(k)) return v;
  }
  return EXERCISE_PARAMS.DEFAULT;
}

/**
 * Calculate kcal burned for a single set using the mechanical work formula.
 *
 *   W (J) = reps × (externalWeight + bodyMass × bodyFraction) × g × ROM
 *   kcal  = W / J_TO_KCAL × ECCENTRIC / EFFICIENCY
 */
function kcalForSet(exerciseName, weightKg, reps, bodyMassKg) {
  const [rom, bodyFraction] = getExerciseParams(exerciseName);
  const totalMass = weightKg + bodyMassKg * bodyFraction;
  const joules = reps * totalMass * G * rom;
  return (joules / J_TO_KCAL) * ECCENTRIC / EFFICIENCY;
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
    const caloriesBurned = Math.round(
      workSets.reduce((sum, s) => sum + kcalForSet(exerciseName, Number(s.weight), s.reps, bodyMassKg), 0)
    );

    const timeEntry = exercise_times.find(t => t.exercise_name === exerciseName);
    const durationMinutes = timeEntry
      ? Math.max(1, Math.round(timeEntry.duration_seconds / 60))
      : 1;

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

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

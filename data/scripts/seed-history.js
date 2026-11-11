import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Brzycki 1RM formula (matches server.js)
function brzycki1RM(weight, reps) {
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
}

// Map exercise names to equipment types
const EQUIPMENT_MAP = {
  'Barbell Squat': 'barbell',
  'Standing Calf Raise (Barbell)': 'barbell',
  'Romanian Deadlift (Barbell)': 'barbell',
  'Bulgarian Split Squat': 'dumbbell',
  'Decline Sit Up': 'barbell',
  'Cable Kickback': 'cable',
  'Cable Side Bend': 'cable',
  'Hanging Leg Raise': 'bodyweight',
  'Conventional Deadlift (Barbell)': 'barbell',
  'Pull Up': 'bodyweight',
  'Neutral Grip Pull Up': 'bodyweight',
  'EZ-Bar Curl': 'barbell',
  'Seated Cable Row': 'cable',
  'Face Pull': 'cable',
  'Hammer Curl (Cable)': 'cable',
  'Barbell Bench Press': 'barbell',
  'Decline Bench Press (Barbell)': 'barbell',
  'Incline Dumbbell Press': 'dumbbell',
  'Seated Overhead Press (Barbell)': 'barbell',
  'Dumbbell Pullover': 'dumbbell',
  'Overhead Triceps Extension (Barbell)': 'barbell',
  'Cable Lateral Raise': 'cable',
  'Triceps Pushdown (Cable)': 'cable',
  'Incline Bench Press (Barbell)': 'barbell',
  'Push Up': 'bodyweight',
  'Bench Press (Dumbbell)': 'dumbbell',
  'Dumbbell Lateral Raise': 'dumbbell',
  'Cable Fly': 'cable',
  'Cable Rear Delt Fly': 'cable',
  'Lat Pulldown (Cable)': 'cable',
  'Cable Bicep Curl': 'cable',
  'Ring Dip': 'bodyweight',
};

// Map workout titles to workout definition IDs
const WORKOUT_ID_MAP = {
  'Legs + Core': 'legs-core',
  'Pull A (Heavy)': 'pull-a-heavy',
  'Push A (Heavy)': 'push-a-heavy',
  'Push B + Pull B (Volume)': 'push-b-pull-b-volume',
};

// Historical workout sessions data
// Each session: { title, start_time, end_time, description, exercises: [{ name, sets: [{ weight_kg, reps }] }] }
const SESSIONS = [
  // === LEGS + CORE sessions ===
  // Apr 28, 2026
  {
    title: 'Legs + Core',
    started_at: '2026-04-28 18:06:00+02',
    finished_at: '2026-04-28 20:03:00+02',
    notes: '',
    exercises: [
      { name: 'Barbell Squat', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 90, reps: 8 },
        { weight: 110, reps: 6 }, { weight: 130, reps: 2 }
      ]},
      { name: 'Standing Calf Raise (Barbell)', order: 2, sets: [
        { weight: 110, reps: 12 }, { weight: 110, reps: 12 }, { weight: 110, reps: 13 }
      ]},
      { name: 'Romanian Deadlift (Barbell)', order: 3, sets: [
        { weight: 110, reps: 8 }, { weight: 120, reps: 8 }, { weight: 130, reps: 8 }
      ]},
      { name: 'Bulgarian Split Squat', order: 4, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Decline Sit Up', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 30, reps: 8 }, { weight: 30, reps: 8 }
      ]},
      { name: 'Cable Kickback', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 7 }, { weight: 20, reps: 7 }
      ]},
      { name: 'Cable Side Bend', order: 7, sets: [
        { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]}
    ]
  },
  // Apr 16, 2026
  {
    title: 'Legs + Core',
    started_at: '2026-04-16 18:15:00+02',
    finished_at: '2026-04-16 19:59:00+02',
    notes: '',
    exercises: [
      { name: 'Barbell Squat', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 90, reps: 8 },
        { weight: 110, reps: 6 }, { weight: 130, reps: 2 }
      ]},
      { name: 'Standing Calf Raise (Barbell)', order: 2, sets: [
        { weight: 110, reps: 12 }, { weight: 110, reps: 12 }, { weight: 110, reps: 13 }
      ]},
      { name: 'Romanian Deadlift (Barbell)', order: 3, sets: [
        { weight: 110, reps: 8 }, { weight: 120, reps: 8 }, { weight: 130, reps: 8 }
      ]},
      { name: 'Bulgarian Split Squat', order: 4, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Decline Sit Up', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 30, reps: 8 }, { weight: 30, reps: 8 }
      ]}
    ]
  },
  // Mar 21, 2026
  {
    title: 'Legs + Core',
    started_at: '2026-03-21 18:09:00+01',
    finished_at: '2026-03-21 20:03:00+01',
    notes: '',
    exercises: [
      { name: 'Barbell Squat', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 90, reps: 8 },
        { weight: 110, reps: 6 }, { weight: 130, reps: 2 }
      ]},
      { name: 'Standing Calf Raise (Barbell)', order: 2, sets: [
        { weight: 110, reps: 12 }, { weight: 110, reps: 12 }, { weight: 110, reps: 12 }
      ]},
      { name: 'Romanian Deadlift (Barbell)', order: 3, sets: [
        { weight: 110, reps: 8 }, { weight: 120, reps: 8 }, { weight: 130, reps: 8 }
      ]},
      { name: 'Bulgarian Split Squat', order: 4, sets: [
        { weight: 14, reps: 10 }, { weight: 14, reps: 10 }, { weight: 18, reps: 10 }, { weight: 18, reps: 10 }
      ]},
      { name: 'Decline Sit Up', order: 5, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Cable Kickback', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 4 }, { weight: 20, reps: 4 }
      ]},
      { name: 'Cable Side Bend', order: 7, sets: [
        { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }
      ]},
      { name: 'Hanging Leg Raise', order: 8, sets: [
        { weight: 0, reps: 8 }, { weight: 0, reps: 8 }, { weight: 0, reps: 8 }
      ]}
    ]
  },
  // Mar 3, 2026
  {
    title: 'Legs + Core',
    started_at: '2026-03-03 18:15:00+01',
    finished_at: '2026-03-03 18:16:00+01',
    notes: '',
    exercises: [
      { name: 'Barbell Squat', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 90, reps: 8 },
        { weight: 110, reps: 6 }, { weight: 130, reps: 2 }
      ]},
      { name: 'Standing Calf Raise (Barbell)', order: 2, sets: [
        { weight: 110, reps: 12 }, { weight: 110, reps: 12 }, { weight: 110, reps: 12 }
      ]},
      { name: 'Romanian Deadlift (Barbell)', order: 3, sets: [
        { weight: 110, reps: 8 }, { weight: 120, reps: 8 }, { weight: 130, reps: 8 }
      ]},
      { name: 'Bulgarian Split Squat', order: 4, sets: [
        { weight: 14, reps: 10 }, { weight: 14, reps: 10 }, { weight: 18, reps: 10 }, { weight: 18, reps: 10 }
      ]},
      { name: 'Decline Sit Up', order: 5, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Cable Kickback', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Cable Side Bend', order: 7, sets: [
        { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }
      ]},
      { name: 'Hanging Leg Raise', order: 8, sets: [
        { weight: 0, reps: 8 }, { weight: 0, reps: 8 }, { weight: 0, reps: 8 }
      ]}
    ]
  },
  // Feb 27, 2025
  {
    title: 'Legs + Core',
    started_at: '2025-02-27 09:00:00+01',
    finished_at: '2025-02-27 10:30:00+01',
    notes: 'Leg focus day - squat + calf together then RDL core',
    exercises: [
      { name: 'Barbell Squat', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 90, reps: 8 },
        { weight: 110, reps: 6 }, { weight: 130, reps: 2 }
      ]},
      { name: 'Standing Calf Raise (Barbell)', order: 2, sets: [
        { weight: 110, reps: 12 }, { weight: 110, reps: 12 }, { weight: 110, reps: 12 }, { weight: 110, reps: 12 }
      ]},
      { name: 'Romanian Deadlift (Barbell)', order: 3, sets: [
        { weight: 110, reps: 8 }, { weight: 120, reps: 8 }, { weight: 130, reps: 8 }
      ]},
      { name: 'Bulgarian Split Squat', order: 4, sets: [
        { weight: 12, reps: 10 }, { weight: 16, reps: 10 }, { weight: 16, reps: 10 }
      ]},
      { name: 'Decline Sit Up', order: 5, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Cable Kickback', order: 6, sets: [
        { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }
      ]},
      { name: 'Cable Side Bend', order: 7, sets: [
        { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }
      ]},
      { name: 'Hanging Leg Raise', order: 8, sets: [
        { weight: 0, reps: 8 }, { weight: 0, reps: 8 }, { weight: 0, reps: 8 }
      ]}
    ]
  },

  // === PULL A (HEAVY) sessions ===
  // Apr 26, 2026
  {
    title: 'Pull A (Heavy)',
    started_at: '2026-04-26 18:19:00+02',
    finished_at: '2026-04-26 19:17:00+02',
    notes: '',
    exercises: [
      { name: 'Conventional Deadlift (Barbell)', order: 1, sets: [
        { weight: 110, reps: 4 }, { weight: 130, reps: 4 }, { weight: 155, reps: 4 }, { weight: 155, reps: 4 }
      ]},
      { name: 'Pull Up', order: 2, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]},
      { name: 'Neutral Grip Pull Up', order: 3, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 4 }, { weight: 0, reps: 6 }
      ]},
      { name: 'EZ-Bar Curl', order: 4, sets: [
        { weight: 20, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Seated Cable Row', order: 5, sets: [
        { weight: 60, reps: 8 }, { weight: 70, reps: 8 }, { weight: 74, reps: 8 }
      ]},
      { name: 'Face Pull', order: 6, sets: [
        { weight: 10, reps: 15 }, { weight: 14, reps: 15 }, { weight: 18, reps: 15 }
      ]},
      { name: 'Hammer Curl (Cable)', order: 7, sets: [
        { weight: 18, reps: 10 }, { weight: 22, reps: 10 }, { weight: 24, reps: 8 }
      ]}
    ]
  },
  // Mar 31, 2026
  {
    title: 'Pull A (Heavy)',
    started_at: '2026-03-31 18:08:00+02',
    finished_at: '2026-03-31 19:52:00+02',
    notes: '',
    exercises: [
      { name: 'Conventional Deadlift (Barbell)', order: 1, sets: [
        { weight: 110, reps: 4 }, { weight: 130, reps: 4 }, { weight: 155, reps: 4 }, { weight: 155, reps: 4 }
      ]},
      { name: 'Pull Up', order: 2, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]},
      { name: 'Neutral Grip Pull Up', order: 3, sets: [
        { weight: 0, reps: 4 }, { weight: 0, reps: 4 }, { weight: 0, reps: 6 }
      ]},
      { name: 'EZ-Bar Curl', order: 4, sets: [
        { weight: 20, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Seated Cable Row', order: 5, sets: [
        { weight: 60, reps: 8 }, { weight: 70, reps: 8 }, { weight: 74, reps: 8 }
      ]},
      { name: 'Face Pull', order: 6, sets: [
        { weight: 10, reps: 15 }, { weight: 14, reps: 15 }, { weight: 18, reps: 15 }
      ]},
      { name: 'Hammer Curl (Cable)', order: 7, sets: [
        { weight: 18, reps: 8 }, { weight: 22, reps: 8 }, { weight: 22, reps: 10 }
      ]}
    ]
  },
  // Mar 10, 2026
  {
    title: 'Pull A (Heavy)',
    started_at: '2026-03-10 18:07:00+01',
    finished_at: '2026-03-10 18:40:00+01',
    notes: '',
    exercises: [
      { name: 'Conventional Deadlift (Barbell)', order: 1, sets: [
        { weight: 110, reps: 4 }, { weight: 130, reps: 4 }, { weight: 155, reps: 4 }, { weight: 155, reps: 4 }
      ]},
      { name: 'Pull Up', order: 2, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]},
      { name: 'Neutral Grip Pull Up', order: 3, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 4 }, { weight: 0, reps: 6 }
      ]}
    ]
  },
  // Mar 1, 2026
  {
    title: 'Pull A (Heavy)',
    started_at: '2026-03-01 17:47:00+01',
    finished_at: '2026-03-01 19:19:00+01',
    notes: '',
    exercises: [
      { name: 'Conventional Deadlift (Barbell)', order: 1, sets: [
        { weight: 110, reps: 4 }, { weight: 130, reps: 4 }, { weight: 155, reps: 4 }, { weight: 155, reps: 4 }
      ]},
      { name: 'Pull Up', order: 2, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]},
      { name: 'Neutral Grip Pull Up', order: 3, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 4 }
      ]},
      { name: 'EZ-Bar Curl', order: 4, sets: [
        { weight: 20, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Seated Cable Row', order: 5, sets: [
        { weight: 60, reps: 8 }, { weight: 65, reps: 8 }, { weight: 70, reps: 8 }
      ]},
      { name: 'Face Pull', order: 6, sets: [
        { weight: 10, reps: 15 }, { weight: 14, reps: 15 }, { weight: 14, reps: 15 }
      ]},
      { name: 'Hammer Curl (Cable)', order: 7, sets: [
        { weight: 14, reps: 8 }, { weight: 18, reps: 8 }, { weight: 14, reps: 8 }
      ]}
    ]
  },
  // Feb 25, 2025
  {
    title: 'Pull A (Heavy)',
    started_at: '2025-02-25 09:00:00+01',
    finished_at: '2025-02-25 10:30:00+01',
    notes: 'Heavy pulling day - deadlift pull-ups cable work',
    exercises: [
      { name: 'Conventional Deadlift (Barbell)', order: 1, sets: [
        { weight: 130, reps: 4 }, { weight: 155, reps: 4 }, { weight: 155, reps: 4 }, { weight: 155, reps: 4 }
      ]},
      { name: 'Pull Up', order: 2, sets: [
        { weight: 0, reps: 4 }, { weight: 0, reps: 6 }, { weight: 0, reps: 4 }, { weight: 0, reps: 5 }, { weight: 0, reps: 4 }
      ]},
      { name: 'Neutral Grip Pull Up', order: 3, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]},
      { name: 'EZ-Bar Curl', order: 4, sets: [
        { weight: 20, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Seated Cable Row', order: 5, sets: [
        { weight: 60, reps: 8 }, { weight: 65, reps: 8 }, { weight: 70, reps: 8 }
      ]},
      { name: 'Face Pull', order: 6, sets: [
        { weight: 10, reps: 15 }, { weight: 14, reps: 15 }, { weight: 14, reps: 15 }
      ]},
      { name: 'Hammer Curl (Cable)', order: 7, sets: [
        { weight: 14, reps: 8 }, { weight: 18, reps: 8 }, { weight: 14, reps: 8 }, { weight: 18, reps: 8 }
      ]}
    ]
  },

  // === PUSH A (HEAVY) sessions ===
  // Apr 23, 2026
  {
    title: 'Push A (Heavy)',
    started_at: '2026-04-23 18:04:00+02',
    finished_at: '2026-04-23 20:00:00+02',
    notes: '',
    exercises: [
      { name: 'Barbell Bench Press', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 80, reps: 6 },
        { weight: 80, reps: 8 }, { weight: 90, reps: 4 }
      ]},
      { name: 'Decline Bench Press (Barbell)', order: 2, sets: [
        { weight: 70, reps: 8 }, { weight: 80, reps: 8 }, { weight: 90, reps: 4 }
      ]},
      { name: 'Incline Dumbbell Press', order: 3, sets: [
        { weight: 24, reps: 8 }, { weight: 24, reps: 8 }, { weight: 30, reps: 6 }
      ]},
      { name: 'Seated Overhead Press (Barbell)', order: 4, sets: [
        { weight: 50, reps: 8 }, { weight: 50, reps: 8 }, { weight: 50, reps: 8 }
      ]},
      { name: 'Dumbbell Pullover', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 40, reps: 8 }, { weight: 45, reps: 8 }
      ]},
      { name: 'Overhead Triceps Extension (Barbell)', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Cable Lateral Raise', order: 7, sets: [
        { weight: 9, reps: 10 }, { weight: 9, reps: 10 }, { weight: 11, reps: 10 }, { weight: 0, reps: 10 }
      ]}
    ]
  },
  // Apr 12, 2026
  {
    title: 'Push A (Heavy)',
    started_at: '2026-04-12 17:46:00+02',
    finished_at: '2026-04-12 19:45:00+02',
    notes: '',
    exercises: [
      { name: 'Barbell Bench Press', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 80, reps: 8 },
        { weight: 90, reps: 3 }, { weight: 90, reps: 2 }
      ]},
      { name: 'Decline Bench Press (Barbell)', order: 2, sets: [
        { weight: 70, reps: 8 }, { weight: 80, reps: 8 }, { weight: 90, reps: 4 }
      ]},
      { name: 'Incline Dumbbell Press', order: 3, sets: [
        { weight: 24, reps: 8 }, { weight: 24, reps: 8 }, { weight: 30, reps: 6 }
      ]},
      { name: 'Seated Overhead Press (Barbell)', order: 4, sets: [
        { weight: 50, reps: 8 }, { weight: 50, reps: 7 }, { weight: 50, reps: 8 }
      ]},
      { name: 'Dumbbell Pullover', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 40, reps: 8 }, { weight: 45, reps: 8 }
      ]},
      { name: 'Overhead Triceps Extension (Barbell)', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Cable Lateral Raise', order: 7, sets: [
        { weight: 9, reps: 10 }, { weight: 9, reps: 10 }, { weight: 11, reps: 7 }, { weight: 11, reps: 7 }
      ]},
      { name: 'Triceps Pushdown (Cable)', order: 8, sets: [
        { weight: 20, reps: 10 }, { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]}
    ]
  },
  // Mar 29, 2026
  {
    title: 'Push A (Heavy)',
    started_at: '2026-03-29 16:57:00+01',
    finished_at: '2026-03-29 18:50:00+01',
    notes: '',
    exercises: [
      { name: 'Barbell Bench Press', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 80, reps: 8 },
        { weight: 90, reps: 2 }, { weight: 90, reps: 2 }
      ]},
      { name: 'Decline Bench Press (Barbell)', order: 2, sets: [
        { weight: 70, reps: 8 }, { weight: 80, reps: 8 }, { weight: 90, reps: 3 }
      ]},
      { name: 'Incline Dumbbell Press', order: 3, sets: [
        { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Seated Overhead Press (Barbell)', order: 4, sets: [
        { weight: 50, reps: 8 }, { weight: 50, reps: 6 }, { weight: 50, reps: 6 }
      ]},
      { name: 'Dumbbell Pullover', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 40, reps: 8 }, { weight: 45, reps: 8 }
      ]},
      { name: 'Overhead Triceps Extension (Barbell)', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Cable Lateral Raise', order: 7, sets: [
        { weight: 9, reps: 10 }, { weight: 9, reps: 10 }, { weight: 11, reps: 7 }, { weight: 11, reps: 7 }
      ]},
      { name: 'Triceps Pushdown (Cable)', order: 8, sets: [
        { weight: 20, reps: 10 }, { weight: 24, reps: 7 }, { weight: 24, reps: 8 }
      ]}
    ]
  },
  // Mar 8, 2026
  {
    title: 'Push A (Heavy)',
    started_at: '2026-03-08 18:10:00+01',
    finished_at: '2026-03-08 20:02:00+01',
    notes: '',
    exercises: [
      { name: 'Barbell Bench Press', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 80, reps: 8 },
        { weight: 90, reps: 3 }, { weight: 90, reps: 4 }
      ]},
      { name: 'Decline Bench Press (Barbell)', order: 2, sets: [
        { weight: 70, reps: 8 }, { weight: 80, reps: 8 }, { weight: 90, reps: 4 }
      ]},
      { name: 'Incline Dumbbell Press', order: 3, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 8 }, { weight: 30, reps: 5 }
      ]},
      { name: 'Seated Overhead Press (Barbell)', order: 4, sets: [
        { weight: 50, reps: 8 }, { weight: 50, reps: 5 }, { weight: 50, reps: 7 }
      ]},
      { name: 'Dumbbell Pullover', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 40, reps: 8 }, { weight: 45, reps: 8 }
      ]},
      { name: 'Overhead Triceps Extension (Barbell)', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Cable Lateral Raise', order: 7, sets: [
        { weight: 5, reps: 15 }, { weight: 5, reps: 15 }, { weight: 7, reps: 10 }, { weight: 7, reps: 10 }
      ]},
      { name: 'Triceps Pushdown (Cable)', order: 8, sets: [
        { weight: 15, reps: 10 }, { weight: 20, reps: 8 }, { weight: 24, reps: 8 }
      ]}
    ]
  },
  // Feb 28, 2026
  {
    title: 'Push A (Heavy)',
    started_at: '2026-02-28 18:06:00+01',
    finished_at: '2026-02-28 20:10:00+01',
    notes: '',
    exercises: [
      { name: 'Barbell Bench Press', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 80, reps: 6 },
        { weight: 90, reps: 3 }, { weight: 80, reps: 6 }
      ]},
      { name: 'Decline Bench Press (Barbell)', order: 2, sets: [
        { weight: 70, reps: 8 }, { weight: 80, reps: 8 }, { weight: 90, reps: 4 }
      ]},
      { name: 'Incline Dumbbell Press', order: 3, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Seated Overhead Press (Barbell)', order: 4, sets: [
        { weight: 50, reps: 4 }, { weight: 50, reps: 4 }, { weight: 50, reps: 6 }
      ]},
      { name: 'Dumbbell Pullover', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 40, reps: 8 }, { weight: 45, reps: 8 }
      ]},
      { name: 'Overhead Triceps Extension (Barbell)', order: 6, sets: [
        { weight: 20, reps: 8 }, { weight: 20, reps: 8 }, { weight: 20, reps: 8 }
      ]},
      { name: 'Cable Lateral Raise', order: 7, sets: [
        { weight: 5, reps: 12 }, { weight: 5, reps: 12 }, { weight: 7, reps: 8 }, { weight: 7, reps: 8 }
      ]},
      { name: 'Triceps Pushdown (Cable)', order: 8, sets: [
        { weight: 10, reps: 14 }, { weight: 20, reps: 8 }, { weight: 24, reps: 7 }
      ]}
    ]
  },
  // Feb 24, 2025
  {
    title: 'Push A (Heavy)',
    started_at: '2025-02-24 09:00:00+01',
    finished_at: '2025-02-24 10:30:00+01',
    notes: 'Heavy pressing day - pyramid sets then shoulder + triceps',
    exercises: [
      { name: 'Barbell Bench Press', order: 1, sets: [
        { weight: 50, reps: 8 }, { weight: 70, reps: 8 }, { weight: 80, reps: 6 },
        { weight: 90, reps: 4 }, { weight: 80, reps: 6 }
      ]},
      { name: 'Incline Bench Press (Barbell)', order: 2, sets: [
        { weight: 70, reps: 8 }, { weight: 80, reps: 8 }, { weight: 90, reps: 6 }
      ]},
      { name: 'Incline Dumbbell Press', order: 3, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Seated Overhead Press (Barbell)', order: 4, sets: [
        { weight: 50, reps: 8 }, { weight: 50, reps: 8 }, { weight: 50, reps: 8 }
      ]},
      { name: 'Dumbbell Pullover', order: 5, sets: [
        { weight: 30, reps: 8 }, { weight: 40, reps: 8 }, { weight: 45, reps: 8 }
      ]},
      { name: 'Overhead Triceps Extension (Barbell)', order: 6, sets: [
        { weight: 15, reps: 10 }, { weight: 20, reps: 10 }, { weight: 20, reps: 10 }
      ]},
      { name: 'Cable Lateral Raise', order: 7, sets: [
        { weight: 5, reps: 12 }, { weight: 7, reps: 12 }, { weight: 7, reps: 12 }
      ]},
      { name: 'Triceps Pushdown (Cable)', order: 8, sets: [
        { weight: 10, reps: 10 }, { weight: 14, reps: 10 }, { weight: 14, reps: 10 }
      ]}
    ]
  },

  // === PUSH B + PULL B (VOLUME) sessions ===
  // Apr 7, 2026
  {
    title: 'Push B + Pull B (Volume)',
    started_at: '2026-04-07 18:21:00+02',
    finished_at: '2026-04-07 19:49:00+02',
    notes: '',
    exercises: [
      { name: 'Push Up', order: 1, sets: [
        { weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 10 }
      ]},
      { name: 'Bench Press (Dumbbell)', order: 2, sets: [
        { weight: 30, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Dumbbell Lateral Raise', order: 3, sets: [
        { weight: 10, reps: 10 }, { weight: 10, reps: 10 }, { weight: 10, reps: 10 }
      ]},
      { name: 'Cable Fly', order: 4, sets: [
        { weight: 25, reps: 8 }, { weight: 35, reps: 8 }, { weight: 40, reps: 4 }
      ]},
      { name: 'Cable Rear Delt Fly', order: 5, sets: [
        { weight: 10, reps: 15 }, { weight: 12, reps: 15 }, { weight: 12, reps: 13 }
      ]},
      { name: 'Lat Pulldown (Cable)', order: 6, sets: [
        { weight: 60, reps: 8 }, { weight: 65, reps: 8 }, { weight: 70, reps: 6 }
      ]},
      { name: 'Cable Bicep Curl', order: 7, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 5 }, { weight: 24, reps: 6 }
      ]},
      { name: 'Ring Dip', order: 8, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]}
    ]
  },
  // Mar 24, 2026
  {
    title: 'Push B + Pull B (Volume)',
    started_at: '2026-03-24 18:07:00+01',
    finished_at: '2026-03-24 19:44:00+01',
    notes: '',
    exercises: [
      { name: 'Push Up', order: 1, sets: [
        { weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 10 }
      ]},
      { name: 'Bench Press (Dumbbell)', order: 2, sets: [
        { weight: 30, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Dumbbell Lateral Raise', order: 3, sets: [
        { weight: 8, reps: 15 }, { weight: 8, reps: 15 }, { weight: 10, reps: 10 }
      ]},
      { name: 'Cable Fly', order: 4, sets: [
        { weight: 25, reps: 8 }, { weight: 35, reps: 8 }, { weight: 40, reps: 4 }
      ]},
      { name: 'Cable Rear Delt Fly', order: 5, sets: [
        { weight: 10, reps: 15 }, { weight: 12, reps: 15 }, { weight: 14, reps: 12 }
      ]},
      { name: 'Lat Pulldown (Cable)', order: 6, sets: [
        { weight: 60, reps: 8 }, { weight: 65, reps: 6 }, { weight: 70, reps: 6 }
      ]},
      { name: 'Cable Bicep Curl', order: 7, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 8 }, { weight: 24, reps: 6 }
      ]},
      { name: 'Ring Dip', order: 8, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 6 }, { weight: 0, reps: 6 }
      ]}
    ]
  },
  // Mar 5, 2026
  {
    title: 'Push B + Pull B (Volume)',
    started_at: '2026-03-05 18:11:00+01',
    finished_at: '2026-03-05 19:54:00+01',
    notes: '',
    exercises: [
      { name: 'Push Up', order: 1, sets: [
        { weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 12 }
      ]},
      { name: 'Bench Press (Dumbbell)', order: 2, sets: [
        { weight: 24, reps: 8 }, { weight: 30, reps: 8 }, { weight: 34, reps: 8 }
      ]},
      { name: 'Dumbbell Lateral Raise', order: 3, sets: [
        { weight: 6, reps: 15 }, { weight: 8, reps: 15 }, { weight: 8, reps: 15 }
      ]},
      { name: 'Cable Fly', order: 4, sets: [
        { weight: 25, reps: 8 }, { weight: 35, reps: 8 }, { weight: 37, reps: 6 }
      ]},
      { name: 'Cable Rear Delt Fly', order: 5, sets: [
        { weight: 10, reps: 15 }, { weight: 14, reps: 12 }, { weight: 12, reps: 4 }
      ]},
      { name: 'Lat Pulldown (Cable)', order: 6, sets: [
        { weight: 60, reps: 8 }, { weight: 65, reps: 8 }, { weight: 70, reps: 6 }
      ]},
      { name: 'Cable Bicep Curl', order: 7, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 8 }, { weight: 24, reps: 8 }
      ]},
      { name: 'Ring Dip', order: 8, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 4 }, { weight: 0, reps: 5 }
      ]}
    ]
  },
  // Feb 26, 2026
  {
    title: 'Push B + Pull B (Volume)',
    started_at: '2026-02-26 18:27:00+01',
    finished_at: '2026-02-26 20:16:00+01',
    notes: '',
    exercises: [
      { name: 'Push Up', order: 1, sets: [
        { weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 12 }
      ]},
      { name: 'Bench Press (Dumbbell)', order: 2, sets: [
        { weight: 24, reps: 8 }, { weight: 24, reps: 8 }, { weight: 30, reps: 8 }
      ]},
      { name: 'Dumbbell Lateral Raise', order: 3, sets: [
        { weight: 6, reps: 15 }, { weight: 8, reps: 11 }, { weight: 8, reps: 11 }
      ]},
      { name: 'Cable Fly', order: 4, sets: [
        { weight: 25, reps: 8 }, { weight: 35, reps: 8 }, { weight: 37, reps: 6 }
      ]},
      { name: 'Cable Rear Delt Fly', order: 5, sets: [
        { weight: 10, reps: 8 }, { weight: 10, reps: 15 }, { weight: 12, reps: 12 }
      ]},
      { name: 'Lat Pulldown (Cable)', order: 6, sets: [
        { weight: 60, reps: 8 }, { weight: 65, reps: 6 }, { weight: 70, reps: 5 }
      ]},
      { name: 'Cable Bicep Curl', order: 7, sets: [
        { weight: 20, reps: 8 }, { weight: 24, reps: 5 }, { weight: 24, reps: 10 }
      ]},
      { name: 'Ring Dip', order: 8, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 4 }, { weight: 0, reps: 4 }
      ]}
    ]
  },
  // Mar 1, 2025
  {
    title: 'Push B + Pull B (Volume)',
    started_at: '2025-03-01 09:00:00+01',
    finished_at: '2025-03-01 10:30:00+01',
    notes: 'Lighter volume day push pull accessories ring dips',
    exercises: [
      { name: 'Push Up', order: 1, sets: [
        { weight: 0, reps: 12 }, { weight: 0, reps: 12 }, { weight: 0, reps: 12 }
      ]},
      { name: 'Bench Press (Dumbbell)', order: 2, sets: [
        { weight: 24, reps: 10 }, { weight: 24, reps: 10 }, { weight: 30, reps: 10 }
      ]},
      { name: 'Dumbbell Lateral Raise', order: 3, sets: [
        { weight: 6, reps: 15 }, { weight: 8, reps: 15 }, { weight: 8, reps: 15 }
      ]},
      { name: 'Cable Fly', order: 4, sets: [
        { weight: 25, reps: 12 }, { weight: 35, reps: 12 }, { weight: 37, reps: 12 }
      ]},
      { name: 'Cable Rear Delt Fly', order: 5, sets: [
        { weight: 7, reps: 15 }, { weight: 10, reps: 15 }, { weight: 10, reps: 15 }
      ]},
      { name: 'Lat Pulldown (Cable)', order: 6, sets: [
        { weight: 60, reps: 10 }, { weight: 65, reps: 10 }, { weight: 70, reps: 10 }
      ]},
      { name: 'Cable Bicep Curl', order: 7, sets: [
        { weight: 14, reps: 10 }, { weight: 18, reps: 10 }, { weight: 18, reps: 10 }
      ]},
      { name: 'Ring Dip', order: 8, sets: [
        { weight: 0, reps: 6 }, { weight: 0, reps: 8 }, { weight: 0, reps: 8 }
      ]}
    ]
  }
];

async function seed() {
  console.log('Connecting to database...');
  await pool.query('SELECT 1');

  // Check if already seeded
  const { rows } = await pool.query('SELECT COUNT(*) FROM workout_sessions');
  if (parseInt(rows[0].count) > 0) {
    console.log(`Database already has ${rows[0].count} sessions. Skipping seed.`);
    await pool.end();
    return;
  }

  // Sort sessions chronologically (oldest first) so PRs build up correctly
  SESSIONS.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  console.log(`Seeding ${SESSIONS.length} sessions...`);

  // Track PRs across sessions to compute correctly
  const prMap = new Map(); // key: "exercise_name|equipment" -> { max_weight, max_one_rm }

  for (const session of SESSIONS) {
    const workoutId = WORKOUT_ID_MAP[session.title];
    if (!workoutId) {
      console.warn(`Skipping unknown workout: ${session.title}`);
      continue;
    }

    // Create session
    const sessionRes = await pool.query(
      `INSERT INTO workout_sessions (workout_id, started_at, finished_at, notes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [workoutId, session.started_at, session.finished_at, session.notes || null]
    );
    const sessionId = sessionRes.rows[0].id;

    let totalWeight = 0;

    for (const exercise of session.exercises) {
      const equipment = EQUIPMENT_MAP[exercise.name] || 'barbell';

      for (let i = 0; i < exercise.sets.length; i++) {
        const set = exercise.sets[i];
        // Handle null/undefined weight (bodyweight exercises)
        const weight = set.weight ?? 0;

        // Insert set with backdated completed_at
        const setCompletedAt = new Date(new Date(session.started_at).getTime() + (i + 1) * 120000);
        await pool.query(
          `INSERT INTO exercise_sets (session_id, exercise_name, exercise_order, equipment, weight, reps, set_number, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sessionId, exercise.name, exercise.order, equipment, weight, set.reps, i + 1, setCompletedAt]
        );

        totalWeight += weight * set.reps;

        // Update PR tracking
        const prKey = `${exercise.name}|${equipment}`;
        const oneRM = weight > 0 ? brzycki1RM(weight, set.reps) : 0;
        const current = prMap.get(prKey);
        if (!current || weight > current.max_weight) {
          prMap.set(prKey, {
            max_weight: weight,
            max_one_rm: oneRM,
            session_id: sessionId,
            exercise_name: exercise.name,
            equipment
          });
        }
      }
    }

    // Update session total
    await pool.query(
      'UPDATE workout_sessions SET total_weight = $1 WHERE id = $2',
      [totalWeight, sessionId]
    );

    console.log(`  Created session #${sessionId}: ${session.title} (${session.started_at}) - ${totalWeight}kg total`);
  }

  // Now upsert all PRs
  for (const pr of prMap.values()) {
    await pool.query(
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
                      THEN EXCLUDED.session_id ELSE personal_records.session_id END`,
      [pr.exercise_name, pr.equipment, pr.max_weight, pr.max_one_rm, pr.session_id]
    );
  }

  console.log(`\nDone! Seeded ${SESSIONS.length} sessions with ${prMap.size} personal records.`);

  const sessionCount = await pool.query('SELECT COUNT(*) FROM workout_sessions');
  const setCount = await pool.query('SELECT COUNT(*) FROM exercise_sets');
  const prCount = await pool.query('SELECT COUNT(*) FROM personal_records');
  console.log(`Database now has: ${sessionCount.rows[0].count} sessions, ${setCount.rows[0].count} sets, ${prCount.rows[0].count} PRs`);

  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

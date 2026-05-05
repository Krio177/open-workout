# Workout Rotation

## Overview

Number workouts in a fixed rotation order. The next workout in the sequence is highlighted on the dashboard, always shown first. After the last workout, it wraps back to the first.

## Data Model

- Add `order` (integer, >= 1) field to each workout JSON definition
- Workouts without `order` are placed at the end (backward compatible)
- Order is unique per workout but no DB constraint needed (enforced by config)

## API

### New endpoint: `GET /api/workouts/rotation`

Returns workouts sorted by `order` with rotation state:

```json
{
  "workouts": [
    { "id": "chest-day", "name": "Mell nap", "order": 1, ... },
    { "id": "back-day", "name": "Hat nap", "order": 2, ... },
    { "id": "shoulder-day", "name": "Vall nap", "order": 3, ... },
    { "id": "leg-day", "name": "Lab nap", "order": 4, ... }
  ],
  "nextIndex": 0
}
```

**Next workout logic:**
1. Query: `SELECT workout_id FROM workout_sessions WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`
2. Find that workout's index in the ordered list
3. `nextIndex = (index + 1) % workouts.length`
4. If no finished session exists: `nextIndex = 0`

## Frontend (Dashboard)

- Replace `GET /api/workouts` call with `GET /api/workouts/rotation`
- Display workouts in order with number badges
- Card at `nextIndex`: highlighted border, glow effect, "Kovetkezo edzes" label
- Other cards: dimmed (opacity: 0.6), disabled start button
- Active session overrides highlight (Resume button takes priority)
- Section header shows "Kovetkezo: #N" badge

## Workout JSON Example

```json
{
  "id": "chest-day",
  "name": "Mell nap",
  "order": 1,
  "color": "#ef4444",
  "exercises": [...]
}
```

# Workout Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add numbered workout rotation to the dashboard — workouts display in a configurable order, with the next workout highlighted.

**Architecture:** Server-side rotation logic via a new `/api/workouts/rotation` endpoint that queries the last finished session and calculates the next workout index. Frontend displays numbered cards with the next workout highlighted.

**Tech Stack:** Node.js/Hono backend, Alpine.js frontend, PostgreSQL, Tailwind CSS

---

### Task 1: Add `order` field to workout JSON files

**Files:**
- Modify: `workouts/chest-day.json`
- Modify: `workouts/back-day.json`
- Modify: `workouts/shoulder-day.json`
- Modify: `workouts/leg-day.json`

- [ ] **Step 1: Add `order` to each workout JSON**

`workouts/chest-day.json` — add `"order": 1` after `"id"`:
```json
{
  "id": "chest-day",
  "order": 1,
  "name": "Mell nap",
```

`workouts/back-day.json` — add `"order": 2`:
```json
{
  "id": "back-day",
  "order": 2,
  "name": "Hat nap",
```

`workouts/shoulder-day.json` — add `"order": 3`:
```json
{
  "id": "shoulder-day",
  "order": 3,
  "name": "Vall nap",
```

`workouts/leg-day.json` — add `"order": 4`:
```json
{
  "id": "leg-day",
  "order": 4,
  "name": "Lab nap",
```

- [ ] **Step 2: Commit**

```bash
git add workouts/*.json
git commit -m "feat: add order field to workout definitions for rotation"
```

---

### Task 2: Add `/api/workouts/rotation` endpoint

**Files:**
- Modify: `server.js` (after line 110, before the session endpoints)

- [ ] **Step 1: Add rotation endpoint**

Insert this block after the `app.get('/api/workouts/:id')` route (after line 110), before the session endpoints:

```javascript
// --- Workout rotation ---
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
```

- [ ] **Step 2: Verify endpoint works**

Run: `node server.js` (or your start command)
Then test: `curl http://localhost:3000/api/workouts/rotation`
Expected: JSON with `workouts` array sorted by `order` and `nextIndex` integer.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add /api/workouts/rotation endpoint with next-workout logic"
```

---

### Task 3: Update dashboard frontend

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Update the `init()` method to fetch rotation data**

Replace the `init()` method in `dashboardApp()` (lines 108-119):

```javascript
async init() {
  const [rotation, active] = await Promise.all([
    fetch('/api/workouts/rotation').then(r => r.json()),
    fetch('/api/sessions/active').then(r => r.json())
  ]);
  this.workouts = rotation.workouts;
  this.nextIndex = rotation.nextIndex;
  this.activeSessions = Object.fromEntries(active.map(s => [s.workout_id, s]));
  const allExercises = this.workouts.flatMap(w => w.exercises);
  await Promise.all(allExercises.map(ex =>
    fetch(`/api/exercises/${encodeURIComponent(ex.name)}/images`).then(r => r.json())
      .then(data => { this.exerciseImages[ex.name] = data.images || []; })
  ));
},
```

- [ ] **Step 2: Add `nextIndex` to the Alpine data**

Add `nextIndex: 0` to the return object in `dashboardApp()`, making it:

```javascript
return {
  workouts: [],
  exerciseImages: {},
  activeSessions: {},
  nextIndex: 0,
  async init() { ... },
```

- [ ] **Step 3: Add `isNext` helper**

Add this computed getter after the `hasAnyActive` getter:

```javascript
get isNext() {
  return (index) => index === this.nextIndex && !this.hasAnyActive;
},
```

- [ ] **Step 4: Update the section header to show rotation badge**

Replace line 40 (`<h2 ...>Valassz edzestipust</h2>`) with:

```html
<div class="flex items-center gap-3 mb-6">
  <h2 class="text-xs font-medium uppercase tracking-[0.2em] text-zinc-600">Valassz edzestipust</h2>
  <div class="flex-1 h-px bg-zinc-800"></div>
  <span class="text-[9px] uppercase tracking-[0.15em] text-green-400 bg-green-400/10 px-2.5 py-1 rounded border border-green-400/25" x-text="'Kovetkezo: #' + (nextIndex + 1)"></span>
</div>
```

- [ ] **Step 5: Update the card template — add number badge, highlight, and dimming**

Replace the entire `<template x-for>` block (lines 42-98) with:

```html
<template x-for="(w, i) in workouts" :key="w.id">
  <div @click="startWorkout(w.id)"
       class="card-glow animate-slide-up group cursor-pointer border rounded-lg overflow-hidden transition-all duration-300"
       :class="isNext(i) ? 'border-2 hover:border-opacity-80' : 'border-zinc-800 hover:border-zinc-600'"
       :style="isNext(i)
         ? `--glow: ${w.color || '#ef4444'}; border-color: ${w.color || '#ef4444'}80; animation-delay: ${i * 80}ms; box-shadow: 0 0 40px -15px ${(w.color || '#ef4444')}40`
         : `--glow: ${w.color || '#ef4444'}; opacity: ${hasAnyActive ? '1' : '0.55'}; animation-delay: ${i * 80}ms`">
    <!-- Color accent bar -->
    <div class="h-1" :style="`background: ${w.color || '#ef4444'}`"></div>
    <div class="p-6 bg-zinc-900/80">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <span class="font-display text-2xl font-700 leading-none w-10 h-10 flex items-center justify-center rounded-lg"
                :style="`color: ${w.color || '#ef4444'}; background: ${w.color || '#ef4444'}15`"
                x-text="w.order || (i + 1)"></span>
          <div>
            <h3 class="font-display text-2xl font-600 uppercase tracking-wide" x-text="w.name"></h3>
            <span x-show="isNext(i)" class="text-[9px] uppercase tracking-[0.15em] text-green-400 mt-0.5">Kovetkezo edzes</span>
          </div>
        </div>
        <span class="text-[10px] uppercase tracking-widest text-zinc-600 border border-zinc-700 px-2 py-0.5 rounded" x-text="w.exercises.length + ' gyakorlat'"></span>
      </div>
      <!-- Exercise preview with images -->
      <div class="space-y-2 mb-6">
        <template x-for="ex in w.exercises" :key="ex.order">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded bg-zinc-800 flex-shrink-0 overflow-hidden relative flex items-center justify-center">
              <img x-show="exerciseImages[ex.name]?.length > 0"
                   :src="exerciseImages[ex.name]?.[0]?.url"
                   class="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition">
              <img x-show="!(exerciseImages[ex.name]?.length > 0) && ex.image"
                   :src="ex.image" class="w-6 h-6 opacity-60 group-hover:opacity-100 transition"
                   :style="`color: ${w.color || '#ef4444'}`">
              <span x-show="!(exerciseImages[ex.name]?.length > 0) && !ex.image"
                    class="text-[10px] text-zinc-600 font-medium" x-text="ex.order"></span>
            </div>
            <span class="text-sm text-zinc-500 group-hover:text-zinc-300 transition" x-text="ex.name"></span>
          </div>
        </template>
      </div>
      <template x-if="activeSessions[w.id]">
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-400">
            <div class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>
            Folyamatban
          </div>
          <button @click="resumeWorkout(w.id)"
                  class="w-full py-2.5 text-xs font-medium uppercase tracking-widest rounded transition-all duration-200 border"
                  :style="`border-color: ${w.color || '#ef4444'}; color: ${w.color || '#ef4444'}; background: ${w.color || '#ef4444'}15`"
                  @mouseover="$el.style.background = (w.color || '#ef4444'); $el.style.color = '#000'"
                  @mouseout="$el.style.background = (w.color || '#ef4444') + '15'; $el.style.color = (w.color || '#ef4444')">
            Folytatás
          </button>
        </div>
      </template>
      <template x-if="!activeSessions[w.id]">
        <button @click="startWorkout(w.id)"
                :disabled="hasAnyActive"
                class="w-full py-2.5 text-xs font-medium uppercase tracking-widest rounded transition-all duration-200 border disabled:opacity-30 disabled:cursor-not-allowed"
                :style="isNext(i) ? `border-color: ${w.color || '#ef4444'}; color: ${w.color || '#ef4444'}; background: ${(w.color || '#ef4444')}15` : `border-color: ${(w.color || '#ef4444')}40; color: ${w.color || '#ef4444'}`"
                @mouseover="if(!hasAnyActive){ $el.style.background = (w.color || '#ef4444'); $el.style.color = '#000' }"
                @mouseout="if(!hasAnyActive){ $el.style.background = isNext(i) ? (w.color || '#ef4444') + '15' : 'transparent'; $el.style.color = (w.color || '#ef4444') }">
          Inditas
        </button>
      </template>
    </div>
  </div>
</template>
```

Key changes from original:
- Number badge (`w.order`) displayed before workout name with colored background
- "Kovetkezo edzes" label shown under the next workout's name
- Next card has `border-2`, colored border, glow box-shadow
- Non-next cards dimmed with `opacity: 0.55` (unless there's an active session, then all show normally)
- Next card's start button has colored background fill

- [ ] **Step 6: Verify in browser**

Run the server, open the dashboard, check:
1. Workouts appear in order (Mell → Hát → Váll → Láb)
2. Each card has a number badge
3. The next workout is highlighted with glow + "Kovetkezo edzes"
4. Other cards are dimmed
5. Starting/completing a workout shifts the highlight to the next one
6. Active session (Resume) overrides the dimming

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: dashboard workout rotation with numbered order and next-workout highlight"
```

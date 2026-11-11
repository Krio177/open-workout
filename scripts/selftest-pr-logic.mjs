import assert from 'node:assert/strict';
import { brzycki1RM, computeIsNewPr } from '../lib/pr-logic.js';

// No previous PR -> always new
assert.equal(computeIsNewPr(50, 55, null), true);

// Heavier weight -> PR
assert.equal(computeIsNewPr(60, 60, { max_weight: 50, max_one_rm: 69 }), true);

// Same weight, more reps (better 1RM) -> PR
assert.equal(computeIsNewPr(50, 75, { max_weight: 50, max_one_rm: 69 }), true);

// Heavier weight but fewer reps so lower 1RM -> still a PR (weight wins)
assert.equal(computeIsNewPr(60, 60, { max_weight: 50, max_one_rm: 69.2 }), true);

// Nothing improved -> no PR
assert.equal(computeIsNewPr(45, 60, { max_weight: 50, max_one_rm: 69 }), false);

// Repeating the exact PR set -> not a new PR (DB stores 1RM as NUMERIC(7,2))
const oneRm = brzycki1RM(80, 8);
assert.equal(computeIsNewPr(80, oneRm, { max_weight: '80.00', max_one_rm: oneRm.toFixed(2) }), false);

console.log('selftest-pr-logic: ok');

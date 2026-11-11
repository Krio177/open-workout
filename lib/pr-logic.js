// Rounded to 2 decimals like the NUMERIC(7,2) column, so repeating a PR set compares equal instead of "new PR".
export function brzycki1RM(weight, reps) {
  if (reps >= 37) return weight;
  return Math.round(weight * (36 / (37 - reps)) * 100) / 100;
}

// A new PR is either a heavier weight OR a better estimated 1RM (e.g. same weight, more reps)
export function computeIsNewPr(weight, oneRM, previousPr) {
  if (!previousPr) return true;
  return weight > Number(previousPr.max_weight) || oneRM > Number(previousPr.max_one_rm || 0);
}

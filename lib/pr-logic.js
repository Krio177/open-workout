export function brzycki1RM(weight, reps) {
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
}

// A new PR is either a heavier weight OR a better estimated 1RM (e.g. same weight, more reps)
export function computeIsNewPr(weight, oneRM, previousPr) {
  if (!previousPr) return true;
  return weight > Number(previousPr.max_weight) || oneRM > Number(previousPr.max_one_rm || 0);
}

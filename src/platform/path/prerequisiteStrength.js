// How strongly one skill depends on another.
//
// Before this file every prerequisite edge was a boolean — `required: true` or
// `required: false` — and `required` meant "may lock". That is too blunt for a
// branch-based path. Two very different claims were being written the same way:
//
//   "you cannot solve a system without solving a linear equation"   (a gate)
//   "factoring makes solving quadratics easier"                     (not a gate)
//
// The second is true and useful for ranking, but if it locks, a student who is
// shaky at factoring is shut out of the quadratic formula — a method that does
// not use factoring at all. Enough of those and every branch closes at once and
// the path collapses into a single remedial corridor. So strength is explicit:
//
//   HARD          the target skill normally should not open yet. May lock.
//   SOFT          readiness is meaningfully better with it. Ranks and scaffolds.
//                 Never locks.
//   REINFORCEMENT related, and useful again later, but not a dependency. Only
//                 raises relevance.
//
// Only HARD can lock. That rule lives here, in one predicate, so no screen or
// engine can quietly reintroduce locking on a soft edge.

export const STRENGTH = Object.freeze({
  HARD: 'hard',
  SOFT: 'soft',
  REINFORCEMENT: 'reinforcement',
});

const STRENGTH_VALUES = new Set(Object.values(STRENGTH));

export const isStrength = (value) => STRENGTH_VALUES.has(value);

/**
 * How much an edge contributes to a readiness average. A soft edge counts, but
 * it cannot outvote the hard ones; a reinforcement edge is not readiness at all.
 */
export const STRENGTH_WEIGHT = Object.freeze({
  [STRENGTH.HARD]: 1,
  [STRENGTH.SOFT]: 0.4,
  [STRENGTH.REINFORCEMENT]: 0,
});

/**
 * The mastery bar per strength. Hard edges gate at the higher bar because
 * crossing them decides access; soft edges only tilt ranking, so a lower bar is
 * enough to stop flagging a shortfall.
 */
export const DEFAULT_MINIMUM_MASTERY = Object.freeze({
  [STRENGTH.HARD]: 0.7,
  [STRENGTH.SOFT]: 0.6,
  [STRENGTH.REINFORCEMENT]: 0,
});

/**
 * The single rule. Everything that asks "can this edge close a door?" asks here.
 */
export const canLock = (strength) => strength === STRENGTH.HARD;

/**
 * Accept an edge written either way. Legacy edges carrying only `required`
 * still resolve — `required: true` was exactly the old meaning of hard — so a
 * half-migrated graph behaves rather than throwing.
 */
export const normalizeStrength = (edge) => {
  if (typeof edge === 'string') return isStrength(edge) ? edge : STRENGTH.SOFT;
  if (edge && isStrength(edge.strength)) return edge.strength;
  if (edge && edge.required === true) return STRENGTH.HARD;
  if (edge && edge.required === false) return STRENGTH.SOFT;
  return STRENGTH.SOFT;
};

export const minimumMasteryFor = (strength) => DEFAULT_MINIMUM_MASTERY[strength] ?? DEFAULT_MINIMUM_MASTERY[STRENGTH.SOFT];

export const describeStrength = (strength) => {
  if (strength === STRENGTH.HARD) return 'Required first — this can hold the skill closed.';
  if (strength === STRENGTH.REINFORCEMENT) return 'Related — it becomes useful again here, but it is not required.';
  return 'Helpful — it improves readiness and ranking, but never blocks access.';
};

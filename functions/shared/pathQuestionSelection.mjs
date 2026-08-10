// Which family a five-question session asks next.
//
// THE BUG THIS REPLACES. Selection narrowed to the single nearest difficulty
// band and then cycled positionally inside it. A standard with one Band 2, two
// Band 3, one Band 4 and one Band 5 family, offered to a student whose readiness
// says Band 3, would alternate between the same two Band 3 items for the whole
// session — five questions, two distinct problems, and three families the
// student never saw. The obvious workaround is five families in every band,
// which is twenty-five items per standard. Fixing the selector is cheaper and
// better mathematics.
//
// THE RULE, in order:
//
//   1. an unused family in the preferred band;
//   2. failing that, an unused family in the closest adjacent band — closest
//      first, and below before above at equal distance, because dropping to
//      easier work is the kinder direction when a student has already seen
//      everything at their level;
//   3. only when every family has been used, repeat — and repeat the one used
//      least, longest ago, rather than the first one again.
//
// Difficulty still leads. This never reaches past an unused family at distance
// 1 to find a used one at distance 0, because a student meeting a genuinely new
// problem one band away learns more than one meeting the same problem twice.

const bandOf = (question) => {
  const band = Number(question?.difficultyBand);
  return Number.isFinite(band) ? band : 3;
};

/**
 * Order candidates the way selection should consider them.
 *
 * Exposed so a test — and a teacher-facing explanation — can see the whole
 * ranking rather than only the winner.
 */
export const rankCandidates = (candidates = [], { preferredBand = 3, usage = {} } = {}) => (
  [...candidates].map((question, index) => {
    const timesUsed = Number(usage[question.id]?.timesUsed ?? usage[question.id] ?? 0) || 0;
    const lastUsedAt = Number(usage[question.id]?.lastUsedAt ?? 0) || 0;
    const band = bandOf(question);
    const distance = Math.abs(band - preferredBand);
    return {
      question,
      index,
      band,
      distance,
      timesUsed,
      lastUsedAt,
    };
  }).sort((a, b) => (
    // Unused always outranks used, whatever the band.
    (a.timesUsed === 0 ? 0 : 1) - (b.timesUsed === 0 ? 0 : 1)
    // Then how far from the readiness band.
    || a.distance - b.distance
    // At equal distance, the easier side first.
    || (a.band - preferredBand) - (b.band - preferredBand)
    // Among used families, least used and least recently used.
    || a.timesUsed - b.timesUsed
    || a.lastUsedAt - b.lastUsedAt
    // Deterministic tiebreak, so the same session state gives the same question.
    || a.index - b.index
  ))
);

/**
 * The next family, and why it was chosen.
 *
 * `usage` is what the session has already issued: `{ [bankId]: { timesUsed,
 * lastUsedAt } }`. A bare number is accepted too, so an older session document
 * that stored only counts still selects sensibly.
 */
export const selectNextFamily = (candidates = [], { preferredBand = 3, usage = {} } = {}) => {
  if (!candidates.length) return null;
  const ranked = rankCandidates(candidates, { preferredBand, usage });
  const chosen = ranked[0];
  const unusedRemaining = ranked.filter((entry) => entry.timesUsed === 0).length;

  return {
    question: chosen.question,
    band: chosen.band,
    preferredBand,
    // Why, in terms a teacher-facing explanation can use directly.
    reason: chosen.timesUsed > 0
      ? 'all_families_used_repeating_least_used'
      : chosen.distance === 0
        ? 'unused_family_in_preferred_band'
        : 'unused_family_in_adjacent_band',
    distanceFromPreferred: chosen.distance,
    unusedRemaining: Math.max(0, unusedRemaining - 1),
    isRepeat: chosen.timesUsed > 0,
  };
};

/** The usage record after issuing a family. */
export const recordFamilyUse = (usage = {}, bankId, now = Date.now()) => {
  if (!bankId) return usage;
  const previous = usage[bankId];
  const timesUsed = Number(previous?.timesUsed ?? previous ?? 0) || 0;
  return { ...usage, [bankId]: { timesUsed: timesUsed + 1, lastUsedAt: now } };
};

/**
 * Can this standard supply a full session without repeating?
 *
 * The reason MathMaster's minimum is five families rather than one: a session
 * is five questions, and a student who meets the same problem twice in one
 * sitting has been told the bank is thin, whatever the coverage screen says.
 */
export const canFillSessionWithoutRepeats = (candidates = [], requiredQuestions = 5) => (
  candidates.length >= requiredQuestions
);

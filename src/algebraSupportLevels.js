// How much help the algebra workspace gives, on one scale from 1 to 5.
//
// WHAT THIS REPLACES. The workspace had two modes, `rigorous` and
// `exploratory`, and they bundled unrelated decisions together. "Rigorous"
// meant *both* "spend an attempt on an unproductive move" *and* "show fewer
// cues"; "exploratory" meant neither. A teacher who wanted a student to work
// freely without burning attempts, but still wanted cancellation cues, could
// not say so. Worse, the names described the student rather than the support —
// a student is not "exploratory", the workspace is.
//
// The scale below separates the decisions, so a level is a set of support
// choices rather than a personality:
//
//   1 Guided       strongest cues; routine opposite-side arithmetic is done for
//                  the student so they can concentrate on the balance idea.
//   2 Supported    cancellation cues shown; the student simplifies the other
//                  side themselves.
//   3 Standard     no silent simplification; hints available on request.
//   4 Independent  minimal cues.
//   5 Open         minimal coaching. Inefficient but equivalence-preserving
//                  work is expected and costs nothing.
//
// THREE THINGS THAT ARE NOT THE SAME. The old code had one flag, `productive`,
// doing the work of three ideas, which is why an unhelpful-but-legal move was
// punished like an illegal one:
//
//   validity     does the move preserve the solution set? Only this may be
//                blocked. Multiplying by zero is invalid; adding 7 to both
//                sides never is.
//   efficiency   did the move help? A move can be perfectly valid and take the
//                student further from the answer, and that is allowed —
//                mathematics does not become wrong when it becomes long.
//   progress     is the equation closer to solved than it was?
//
// Pure, so the workspace, the contract and the tests agree on what a level means.

export const SUPPORT_LEVELS = Object.freeze([
  {
    level: 1,
    id: 'guided',
    label: 'Guided',
    description: 'Strongest cues. Routine arithmetic on the opposite side is simplified automatically.',
    autoSimplifyOppositeSide: true,
    showCancellationHints: true,
    inefficientMoveCostsAttempt: false,
    coaching: 'full',
  },
  {
    level: 2,
    id: 'supported',
    label: 'Supported',
    description: 'Cancellation cues are shown. The student simplifies the other side.',
    autoSimplifyOppositeSide: false,
    showCancellationHints: true,
    inefficientMoveCostsAttempt: false,
    coaching: 'full',
  },
  {
    level: 3,
    id: 'standard',
    label: 'Standard',
    description: 'Nothing is simplified for the student. Hints are available on request.',
    autoSimplifyOppositeSide: false,
    showCancellationHints: true,
    inefficientMoveCostsAttempt: true,
    coaching: 'onRequest',
  },
  {
    level: 4,
    id: 'independent',
    label: 'Independent',
    description: 'Minimal cancellation cues.',
    autoSimplifyOppositeSide: false,
    showCancellationHints: false,
    inefficientMoveCostsAttempt: true,
    coaching: 'onRequest',
  },
  {
    level: 5,
    id: 'open',
    label: 'Open',
    description: 'Minimal coaching. Longer routes are allowed and cost nothing.',
    autoSimplifyOppositeSide: false,
    showCancellationHints: false,
    inefficientMoveCostsAttempt: false,
    coaching: 'minimal',
  },
]);

export const DEFAULT_SUPPORT_LEVEL = 3;

const BY_LEVEL = new Map(SUPPORT_LEVELS.map((entry) => [entry.level, entry]));

// Old saved records and old assignment JSON. `rigorous` spent attempts and
// showed fewer cues, which is Standard; `exploratory` spent none, which is Open.
const LEGACY_MODES = Object.freeze({ rigorous: 3, exploratory: 5 });

/**
 * The level for a question, from whichever of the old or new fields it carries.
 * Always returns a real level — an unreadable value falls back to Standard
 * rather than throwing inside a render.
 */
export const resolveSupportLevel = (source = {}) => {
  const raw = source?.workspaceDifficulty ?? source?.supportLevel ?? null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && BY_LEVEL.has(Math.round(numeric))) return Math.round(numeric);

  const legacy = String(source?.mode || raw || '').toLowerCase();
  if (LEGACY_MODES[legacy]) return LEGACY_MODES[legacy];

  const byId = SUPPORT_LEVELS.find((entry) => entry.id === legacy);
  return byId ? byId.level : DEFAULT_SUPPORT_LEVEL;
};

export const getSupportPolicy = (level) => BY_LEVEL.get(resolveSupportLevel({ workspaceDifficulty: level })) || BY_LEVEL.get(DEFAULT_SUPPORT_LEVEL);

/**
 * Judge one move on all three axes at once.
 *
 * `blocked` is deliberately narrow: only a move that breaks equivalence is
 * refused. Everything else is accepted and described. A student who adds 7 to
 * both sides of 3x + 6 = 21 has done correct algebra by a longer road, and the
 * workspace says so rather than rejecting it.
 */
export const evaluateMove = (move, level = DEFAULT_SUPPORT_LEVEL) => {
  const policy = getSupportPolicy(level);
  const valid = move?.preservesSolution !== false;
  const efficient = move?.productive === true;
  const progress = move?.solved === true
    || (Number.isFinite(move?.complexityAfter) && Number.isFinite(move?.complexityBefore)
      ? move.complexityAfter < move.complexityBefore
      : efficient);

  return {
    valid,
    efficient,
    progress,
    blocked: !valid,
    // An inefficient move is never an error. At levels 3 and 4 it costs an
    // attempt, which is a pacing decision, not a judgment about the mathematics.
    countsAttempt: valid && !efficient && policy.inefficientMoveCostsAttempt,
    tone: !valid ? 'error' : efficient ? 'success' : 'growth',
    message: !valid
      ? 'That move would change the solution set, so the equation would no longer be the same problem.'
      : efficient
        ? 'Balanced, and it moved you closer.'
        : progress
          ? 'Balanced and correct. The equation is simpler, though there was a shorter route.'
          : 'Balanced and correct — this is valid algebra, just a longer way round. Look for a pair that cancels.',
    policy,
  };
};

/**
 * F4 — what the student is shown after a move is accepted.
 *
 * Above level 1 the opposite side keeps its unsimplified form until the student
 * simplifies it. Subtracting 6 from both sides of 3x + 6 = 21 shows `21 - 6`,
 * not `15`: doing that arithmetic silently removes the step the exercise is
 * about.
 */
export const resolveEquationAfterMove = (move, level = DEFAULT_SUPPORT_LEVEL, cancelledSides = []) => {
  const policy = getSupportPolicy(level);
  if (!move) return null;
  if (policy.autoSimplifyOppositeSide) return move.simplified;

  const cancelled = new Set(Array.isArray(cancelledSides) ? cancelledSides : []);
  // A side the student actually cancelled is simplified — that was their work.
  // Every other side keeps the operation visible.
  return {
    ...move.simplified,
    left: cancelled.has('left') ? move.simplified.left : move.unsimplified.left,
    right: cancelled.has('right') ? move.simplified.right : move.unsimplified.right,
  };
};

export const describeSupportLevel = (level) => {
  const policy = getSupportPolicy(level);
  return `${policy.level} · ${policy.label}`;
};

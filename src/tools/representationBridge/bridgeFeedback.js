/*
 * WHAT THE REPRESENTATION BRIDGE SAYS ABOUT EACH STAGE THAT MISSED (student
 * pass 3, TOOL-5).
 *
 * Its list said "Recheck: generalForm." — the grader's internal stage id. Each
 * line now names the stage as its panel on screen does and what in it to
 * recheck, from the grader's own part: a stage left with a box blank says so.
 * The grader returns no key-derived evidence (which of m and b is off), on
 * purpose, so no line says more than the part does.
 *
 * Shown only where the activity shows outcome feedback: the tool's `feedback`
 * is null otherwise (useToolSubmission), and this is read from it.
 */

const STAGE_LINES = Object.freeze({
  rateEvidence: { name: 'Table & rate of change', recheck: 'recheck the Δx, Δy and rate you recorded for each interval, and your conclusion.' },
  generalForm: { name: 'Equations, y = mx + b', recheck: 'recheck m, b and the equation you wrote.' },
  factoredForm: { name: 'Equations, y = a(x − c)', recheck: 'recheck a, c and the equation you wrote.' },
  graph: { name: 'Graph', recheck: 'recheck your two points: one must be the x-intercept, and both must be on the line.' },
  meaning: { name: 'What the parts mean', recheck: 'recheck the unit, meaning and role you chose for m, b and c.' },
});

export const BRIDGE_CONSISTENCY_LINE = 'Your representations do not all describe the same line — recheck them against each other.';

/** One line for a part the grader marked wrong. Never the part's id. */
export const bridgeStageLine = (part = {}) => {
  if (part.id === 'crossRepresentationConsistency') return BRIDGE_CONSISTENCY_LINE;
  const known = STAGE_LINES[part.id];
  const name = known?.name || (typeof part.label === 'string' && part.label.trim()) || 'One stage';
  if (part.isComplete === false) return `${name}: a box is still blank. Fill in every box in this stage.`;
  return `${name}: ${known?.recheck || 'recheck your work in this stage.'}`;
};

/** The lines for every part that missed, in the grader's order. */
export const bridgeFeedbackLines = (parts) => (Array.isArray(parts) ? parts : [])
  .filter((part) => part && typeof part === 'object' && part.isCorrect !== true)
  .map((part) => ({ id: part.id, text: bridgeStageLine(part) }));

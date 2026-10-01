// STRUCTURED MISCONCEPTION CODES — THE ONLY WAY AN ERROR PATTERN IS NAMED.
//
// A wrong answer is not a misconception. MathMaster names an error pattern
// only when a tool that understood the student's work said so, in a
// structured code from this catalog, on the stored record. Nothing infers a
// code afterwards — not the case review, not a teacher screen, not a language
// model. (The Test Cycle corrections planner states the same rule:
// "When a misconception cannot be inferred, it is not invented.")
//
// WHERE A CODE MAY BE STORED (the case review reads exactly these):
//   grades/{sid}/evidenceEvents/{key}.performance.misconceptionCodes   per attempt
//   grades/{sid}.gradesByAssignment[aid][i].partGrades[].misconceptionCode   latest attempt, per part
//   Test Cycle grading.misconceptionCode   (read by testCycleCorrections.mjs)
//
// HOW A FUTURE TOOL EMITS ONE: put catalog ids on the grading result
// (`misconceptionCodes: ['slope-direction']`, or `misconceptionCode` on a
// part). Three seams must then carry it, none of which carries it today:
//   1. part compaction in functions/shared/attemptPolicy.mjs recordQuestionAttempt
//      (keep `misconceptionCode` on each compact part);
//   2. functions/shared/attemptEvidenceEvent.mjs buildAttemptEvidenceEvent
//      (copy normalizeMisconceptionCodes(result.misconceptionCodes) onto
//      `performance`);
//   3. src/QuestionEngine.jsx's registry-tool forwarder, which today passes only
//      `payload.metadata.parts` and `responseKey` (tool categories such as
//      graphing2's are computed and dropped there).
// Until a tool does, every case review reads "Error pattern not determinable
// from stored evidence."

export const MISCONCEPTION_CODE_CATALOG = Object.freeze([
  { id: 'sign-error', label: 'Sign error', domain: 'operations' },
  { id: 'distribution-error', label: 'Incorrect distribution', domain: 'operations' },
  { id: 'combining-unlike-terms', label: 'Combined unlike terms', domain: 'operations' },
  { id: 'one-sided-operation', label: 'Operation applied to one side of an equation only', domain: 'equations' },
  { id: 'slope-direction', label: 'Incorrect slope direction', domain: 'linear' },
  { id: 'slope-run-over-rise', label: 'Slope computed as run over rise', domain: 'linear' },
  { id: 'intercept-confusion', label: 'Intercept confusion (x- and y-intercept)', domain: 'linear' },
  { id: 'equation-form-confusion', label: 'Equation-form confusion', domain: 'linear' },
  { id: 'coordinate-order', label: 'Coordinates in reversed order', domain: 'graphing' },
  { id: 'graph-endpoint-error', label: 'Graph endpoint error (open / closed)', domain: 'inequalities' },
  { id: 'inequality-boundary-error', label: 'Inequality boundary error', domain: 'inequalities' },
  { id: 'inequality-direction-not-reversed', label: 'Inequality direction not reversed', domain: 'inequalities' },
  { id: 'substitution-setup-error', label: 'Substitution setup error', domain: 'systems' },
  { id: 'elimination-setup-error', label: 'Elimination setup error', domain: 'systems' },
  { id: 'domain-range-confusion', label: 'Domain and range confused', domain: 'functions' },
].map((entry) => Object.freeze(entry)));

const BY_ID = new Map(MISCONCEPTION_CODE_CATALOG.map((entry) => [entry.id, entry]));
export const MAX_CODES_PER_RECORD = 5;

export const isMisconceptionCode = (id) => BY_ID.has(String(id ?? '').trim());
export const misconceptionLabel = (id) => BY_ID.get(String(id ?? '').trim())?.label || null;

/** Catalog ids only, de-duplicated, capped. Anything else is dropped, never guessed into a code. */
export const normalizeMisconceptionCodes = (codes) => {
  const values = Array.isArray(codes) ? codes : (codes ? [codes] : []);
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(isMisconceptionCode))].slice(0, MAX_CODES_PER_RECORD);
};

export default MISCONCEPTION_CODE_CATALOG;

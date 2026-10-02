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
// HOW A TOOL EMITS ONE: put a catalog id on the PART of its grading result the
// error concerns — `misconceptionCode: 'slope-direction'` on an entry of a
// registry tool's `metadata.parts`, or on a grader's `parts`. Every path then
// carries it, and drops anything that is not a catalog id:
//   1. src/QuestionEngine.jsx's registry-tool forwarder copies it onto the part
//      it hands the attempt recorder (composed and step questions hand their
//      parts over unchanged);
//   2. functions/shared/attemptPolicy.mjs recordQuestionAttempt keeps it on
//      the compact part — so it is on the record the browser queues, the record
//      server ingestion accepts for a type it cannot re-mark, and the record a
//      server grader's own parts produce (ingestion, the deadline finalizer);
//   3. functions/shared/attemptEvidenceEvent.mjs buildAttemptEvidenceEvent
//      copies the attempt's part codes onto `performance.misconceptionCodes`,
//      which the case review's callable projects (caseReviewEvidence.mjs).
// A part without a code, and every record and event written before this, keeps
// exactly its earlier shape. A code for the question as a whole has no slot:
// the question record stores codes per part only, and the server rebuilds the
// result of a type it cannot re-mark from that record — so a tool names the
// part a code concerns. (A question-level slot would be new data design.)
//
// No classroom tool or grader sets a code yet (graphing2 reports a
// construction `category`, for example, which is not a catalog id and is not
// mapped to one). Until one does, every case review reads "Error pattern not
// determinable from stored evidence."

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

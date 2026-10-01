/*
 * representationBridge — linear mode graders: { [mode]: (question, work) => result }.
 * Every mode declared SHARED in ../../declarations/representationBridge/linear.mjs
 * must have a grader here, and no other.
 *
 * THE VERDICT IS scoreRepresentationBridge — the one function the bridge has
 * always graded with (toolMath/representationBridge/representationBridgeMath.mjs).
 * This file adds nothing to correctness. It only:
 *
 *   1. reads the student's work into the exact shape that function reads, so
 *      a tampered field of the wrong type is a blank box, never a crash and
 *      never a coerced match (an array `[5]` is not the slope 5);
 *   2. reports which required inputs are present (`isComplete`), which the
 *      bridge never needed on screen but a deadline does — only complete work
 *      is ever auto-submitted;
 *   3. turns the per-stage booleans into result parts.
 *
 * The score is the bridge's own: correct parts / parts, over the required
 * stages plus, when the question asks for two or more line-bearing stages,
 * `crossRepresentationConsistency` (true only when at least two of the
 * student's own lines parse and agree).
 *
 * Nothing derived from the answer key (m, b, the zero, the anchor point, the
 * meaning key) is returned; `evidence` from the scorer is dropped.
 */
import { gradedResult } from '../../gradingResult.mjs';
import { intervalTruth, pairKey } from '../../../toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';
import { EXPRESSION_MEANING_DIMENSIONS } from '../../../toolMath/expressionMeaning/expressionMeaningMath.mjs';
import {
  bridgeMeaningQuestion,
  scoreRepresentationBridge,
} from '../../../toolMath/representationBridge/representationBridgeMath.mjs';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// Every box in the bridge is typed text. A number is the same answer written
// without quotes; anything else (object, array, boolean) is not an entry.
const entryText = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};
const filled = (value) => entryText(value).trim() !== '';
const rowIndex = (value) => (Number.isInteger(value) && value >= 0 ? value : null);
const isPoint = (point) => Array.isArray(point)
  && point.length === 2
  && point.every((value) => typeof value === 'number' && Number.isFinite(value));

/** The student's work in exactly the shape scoreRepresentationBridge reads. */
const readLinearBridgeWork = (question = {}, work = {}) => {
  const source = isPlainObject(work) ? work : {};
  const general = isPlainObject(source.generalForm) ? source.generalForm : {};
  const factored = isPlainObject(source.factoredForm) ? source.factoredForm : {};
  const graph = isPlainObject(source.graphConstruction) ? source.graphConstruction : {};
  const meaning = isPlainObject(source.meaningAssignments) ? source.meaningAssignments : {};
  const meaningIds = bridgeMeaningQuestion(question).expressions.map((expression) => expression.id);
  return {
    // A recorded entry that is not an interval stays an (invalid) entry, so it
    // still costs the stage exactly as it did in the browser.
    tableEvidence: (Array.isArray(source.tableEvidence) ? source.tableEvidence : []).map((raw) => {
      const entry = isPlainObject(raw) ? raw : {};
      return { i: rowIndex(entry.i), j: rowIndex(entry.j), dx: entryText(entry.dx), dy: entryText(entry.dy), rate: entryText(entry.rate) };
    }),
    studentSlope: entryText(source.studentSlope),
    rateConclusion: entryText(source.rateConclusion),
    generalForm: { m: entryText(general.m), b: entryText(general.b), equation: entryText(general.equation) },
    factoredForm: { a: entryText(factored.a), c: entryText(factored.c), equation: entryText(factored.equation) },
    graphConstruction: { points: (Array.isArray(graph.points) ? graph.points : []).filter(isPoint).map(([x, y]) => [x, y]) },
    meaningAssignments: Object.fromEntries(meaningIds.map((id) => {
      const given = isPlainObject(meaning[id]) ? meaning[id] : {};
      return [id, Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, entryText(given[dimension])]))];
    })),
  };
};

const STAGE_LABELS = Object.freeze({
  rateEvidence: 'Table and rate of change',
  generalForm: 'General form y = mx + b',
  factoredForm: 'Factored form y = a(x − c)',
  graph: 'Graph',
  meaning: 'Meaning of m, b and c',
  crossRepresentationConsistency: 'Representations agree',
});

/*
 * Every input a stage needs, present. Matches what the bridge itself asks
 * for: enough distinct recorded intervals (the conclusion buttons unlock at
 * `requiredComparisons`), every recorded Δx/Δy/rate box, the conclusion and
 * m; m, b and the equation; a, c and the equation; two plotted points; and
 * a unit, meaning and role for each of m, b and c (the meaning stage's own
 * `meaningComplete`).
 */
const stageComplete = (stage, response, scored, meaningIds) => {
  if (stage === 'rateEvidence') {
    const rows = scored.derived?.rows || [];
    const entries = response.tableEvidence;
    const distinctIntervals = new Set(entries
      .filter((entry) => entry.i !== null && entry.j !== null && intervalTruth(rows[entry.i], rows[entry.j]))
      .map((entry) => pairKey(entry.i, entry.j))).size;
    return distinctIntervals >= scored.requiredComparisons
      && entries.every((entry) => filled(entry.dx) && filled(entry.dy) && filled(entry.rate))
      && filled(response.studentSlope)
      && filled(response.rateConclusion);
  }
  if (stage === 'generalForm') {
    const { m, b, equation } = response.generalForm;
    return filled(m) && filled(b) && filled(equation);
  }
  if (stage === 'factoredForm') {
    const { a, c, equation } = response.factoredForm;
    return filled(a) && filled(c) && filled(equation);
  }
  if (stage === 'graph') return response.graphConstruction.points.length >= 2;
  if (stage === 'meaning') {
    return meaningIds.every((id) => EXPRESSION_MEANING_DIMENSIONS.every((dimension) => filled(response.meaningAssignments[id]?.[dimension])));
  }
  // Consistency has no box of its own: it compares the stages above.
  return true;
};

// What the student entered for a stage, for the part record. Student work only.
const stageResponse = (stage, response, meaningIds) => {
  if (stage === 'rateEvidence') {
    const intervals = response.tableEvidence
      .map((entry) => `R${entry.i === null ? '?' : entry.i + 1}→R${entry.j === null ? '?' : entry.j + 1}: ${entry.dx || '—'}, ${entry.dy || '—'}, ${entry.rate || '—'}`)
      .join('; ');
    return `${intervals || 'no intervals'} | m = ${response.studentSlope || '—'} | ${response.rateConclusion || 'no conclusion'}`;
  }
  if (stage === 'generalForm') return `m = ${response.generalForm.m || '—'}, b = ${response.generalForm.b || '—'}, ${response.generalForm.equation || '—'}`;
  if (stage === 'factoredForm') return `a = ${response.factoredForm.a || '—'}, c = ${response.factoredForm.c || '—'}, ${response.factoredForm.equation || '—'}`;
  if (stage === 'graph') return response.graphConstruction.points.map(([x, y]) => `(${x}, ${y})`).join(' ');
  if (stage === 'meaning') {
    return meaningIds
      .map((id) => `${id}: ${EXPRESSION_MEANING_DIMENSIONS.map((dimension) => response.meaningAssignments[id]?.[dimension] || '—').join(' / ')}`)
      .join('; ');
  }
  return '';
};

const linear = (question, work) => {
  const response = readLinearBridgeWork(question, work);
  const scored = scoreRepresentationBridge(question, response);
  const meaningIds = Object.keys(response.meaningAssignments);
  // `scored.parts` holds the required stages, in the bridge's stage order,
  // followed by crossRepresentationConsistency when it is scored.
  const parts = Object.entries(scored.parts).map(([stage, correct]) => ({
    id: stage,
    label: STAGE_LABELS[stage] || stage,
    isComplete: stageComplete(stage, response, scored, meaningIds),
    isCorrect: correct === true,
    response: stageResponse(stage, response, meaningIds),
  }));
  return gradedResult({
    parts,
    isComplete: parts.every((part) => part.isComplete),
    isCorrect: scored.isCorrect === true,
    score: scored.score,
  });
};

export default {
  linear,
};

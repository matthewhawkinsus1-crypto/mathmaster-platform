/*
 * Shared grader for the `functionInvestigation2` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from FunctionInvestigation2.jsx: the same default
 * function for an unauthored question (rational, a = 2, h = 1, k = -2), the
 * same compare defaults (f(x) = x, g(x) = x², x = 2), the same family
 * mathematics (functionInvestigationMath.mjs), the same 0.01 tolerance on
 * typed coordinates and intercepts, the same number of checks per mode and
 * the same score — the share of checks that are right.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE PRE-SHARED TOOL: an untouched box is not
 * an answer. The tool used to read `Number(anchorX)`, which is 0 for an empty
 * box, so every linear question (whose y-intercept sits at x = 0) awarded the
 * x-coordinate to a student who never typed it; and its intercept parser read
 * an empty box as "none", so y = 2/x scored 100% with both boxes empty. A
 * blank box is now incomplete and therefore incorrect, which is also what lets
 * a deadline tell finished work from untouched work. Typing `0` or `none` is
 * graded exactly as before.
 */
import declaration from '../declarations/functionInvestigation2.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { nearlyEqual } from '../../toolMath/shared/toolMath.mjs';
import {
  behaviorForSpec,
  compareFunctionValues,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  normalizeInvestigationSpec,
  numericSetsMatch,
  parseNumericList,
} from '../../toolMath/functionInvestigation2/functionInvestigationMath.mjs';

const TOLERANCE = 0.01;

// A typed box holds a string (a number reads the same way). Any other type is
// not something the tool's inputs can produce, so it counts as no entry.
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';
// A <select> holds '' until the student chooses, then one of its codes.
const chosen = (value) => typeof value === 'string' && value !== '';

// The tool's own function for a question that does not author one.
const investigatedSpec = (question) => normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...question.function });

// A typed coordinate or asymptote: read with Number(), as the tool's
// type="number" inputs deliver it, within the tool's 0.01.
const typedNumberPart = (id, label, value, expected) => ({
  id,
  label,
  isComplete: filled(value),
  isCorrect: filled(value) && nearlyEqual(Number(entry(value)), expected, TOLERANCE),
  response: entry(value),
});

// A typed intercept list: "-2, 3", "3 -2", "none". Order and repeats do not
// matter (parseNumericList sorts and de-duplicates).
const typedListPart = (id, label, value, expected) => {
  const complete = filled(value);
  return {
    id,
    label,
    isComplete: complete,
    isCorrect: complete && numericSetsMatch(parseNumericList(entry(value)), expected, TOLERANCE),
    response: entry(value),
  };
};

// A chosen code, compared strictly with the key — never by its position in a
// list of choices, so a trimmed choice list cannot shift the answer.
const choicePart = (id, label, value, expectedCode) => ({
  id,
  label,
  isComplete: chosen(value),
  isCorrect: chosen(value) && value === expectedCode,
  response: chosen(value) ? value : '',
});

const features = (question, work) => {
  const result = investigationFeatures(investigatedSpec(question));
  const { label, point } = result.anchor;
  const parts = [
    typedNumberPart('anchor-x', `${label} x-coordinate`, work.anchorX, point[0]),
    typedNumberPart('anchor-y', `${label} y-coordinate`, work.anchorY, point[1]),
  ];
  // Asked only for a family that has them — exactly the boxes the tool shows.
  if (result.verticalAsymptotes.length) {
    parts.push(typedNumberPart('vertical-asymptote', 'Vertical asymptote', work.verticalAsymptote, result.verticalAsymptotes[0]));
  }
  if (result.horizontalAsymptotes.length) {
    parts.push(typedNumberPart('horizontal-asymptote', 'Horizontal asymptote', work.horizontalAsymptote, result.horizontalAsymptotes[0]));
  }
  return gradedResult({ parts });
};

const domainRange = (question, work) => {
  const key = domainRangeForSpec(investigatedSpec(question));
  return gradedResult({
    parts: [
      choicePart('domain', 'Domain', work.domainCode, key.domainCode),
      choicePart('range', 'Range', work.rangeCode, key.rangeCode),
    ],
  });
};

const intercepts = (question, work) => {
  const key = interceptsForSpec(investigatedSpec(question));
  // A function has at most one y-intercept, and none where f(0) is undefined.
  const expectedY = key.y == null ? [] : [key.y];
  return gradedResult({
    parts: [
      typedListPart('x-intercepts', 'x-intercepts', work.xIntercepts, key.x),
      typedListPart('y-intercept', 'y-intercept', work.yIntercept, expectedY),
    ],
  });
};

const behavior = (question, work) => gradedResult({
  parts: [choicePart('behavior', 'Behavior', work.behavior, behaviorForSpec(investigatedSpec(question)))],
});

const compare = (question, work) => {
  const left = normalizeInvestigationSpec(question.left || { type: 'linear', a: 1, h: 0, k: 0 });
  const right = normalizeInvestigationSpec(question.right || { type: 'quadratic', a: 1, h: 0, k: 0 });
  const x = Number(question.x ?? 2);
  const { relation } = compareFunctionValues(left, right, x);
  return gradedResult({
    parts: [choicePart('comparison', 'Greater value at the shared input', work.comparison, relation)],
  });
};

export default bindToolGrader(declaration, 'functionInvestigation2', {
  features,
  domainRange,
  intercepts,
  behavior,
  compare,
});

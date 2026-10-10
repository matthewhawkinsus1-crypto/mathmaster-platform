/*
 * GRAPHING2: ONE VERDICT, WHICHEVER PATH MARKS THE CONSTRUCTION.
 *
 * Graphing2 used to mark a construction inline in its Check handler
 * (evaluateConstruction against the question's target line). It now asks the
 * shared grader (functions/shared/serverGrading/tools/graphing2.mjs), which the
 * server runs as the authority. These tests pin:
 *
 *   - parity: the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the same bytes) agree on isCorrect,
 *     isComplete, score and parts for every fixture;
 *   - fidelity: the verdict, score and feedback category equal what the old
 *     inline Check computed, for every mode and both construction policies;
 *   - scoring: the recorded attempt (status and partial credit) is the one the
 *     old Check recorded, so the reported parts never inflate credit;
 *   - hygiene: work carries points (plus the student's own line readout) and
 *     nothing else; forged verdicts and keys are ignored; malformed and
 *     oversize work is refused, not guessed at;
 *   - wiring: the component's Check uses the shared grader and reports the
 *     same work as live work for deadlines.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import graphing2Grader, { readConstructionFeedback } from '../../functions/shared/serverGrading/tools/graphing2.mjs';
import graphing2Declaration from '../../functions/shared/serverGrading/declarations/graphing2.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { lineFromPoints, targetLineFromQuestion } from '../../src/tools/graphing2/graphingMath.js';
import { evaluateConstruction, resolveConstructionPolicy } from '../../src/tools/graphing2/constructionPolicy.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const COMPONENT_PATH = 'src/tools/graphing2/Graphing2.jsx';
const componentSourceText = readFileSync(new URL(`../../${COMPONENT_PATH}`, import.meta.url), 'utf8');

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

const graphing2 = (fields) => ({ type: 'graphing2', ...fields });

// The work Graphing2.jsx submits: its points and the "Your line" readout (the
// line through the first two points, as the component's own memo computes it).
const workFor = (points) => ({ points, studentLine: points.length >= 2 ? lineFromPoints(points[0], points[1]) : null });

// What Graphing2.jsx's Check computed before the shared grader existed,
// rebuilt from the unchanged exports it called: the target after the tool's
// own default line (y = 1.5x - 2 for an unauthored slope-intercept question)
// and evaluateConstruction with `Number(questionData.tolerance ?? 0.12)`.
const oldInlineCheck = (question, points) => {
  const mode = question.mode || 'slopeIntercept';
  const normalized = mode === 'slopeIntercept' && !question.line ? { ...question, line: { m: 1.5, b: -2 } } : question;
  return evaluateConstruction(points, question, targetLineFromQuestion(normalized), Number(question.tolerance ?? 0.12));
};

// The old component's Check gate: `points.length < requiredPointCount || !studentLine`
// disabled the button.
const oldCheckEnabled = (question, points) => {
  const policy = resolveConstructionPolicy(question);
  const requiredPointCount = policy.strategy === 'formAware' ? policy.minimumPoints : 2;
  const studentLine = points.length >= 2 ? lineFromPoints(points[0], points[1]) : null;
  return !(points.length < requiredPointCount || !studentLine);
};

// The browser path and the server path, over the exact bytes the server reads.
const gradeBothWays = (question, work) => {
  const browser = gradeToolCheck(graphing2Grader, question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  const label = JSON.stringify({ mode: question.mode, work }).slice(0, 200);
  assert.equal(server.graded, browser.graded, `graded differs: ${label}`);
  assert.equal(server.isCorrect, browser.isCorrect, `isCorrect differs: ${label}`);
  assert.equal(server.isComplete, browser.isComplete, `isComplete differs: ${label}`);
  assert.equal(server.score, browser.score, `score differs: ${label}`);
  assert.deepEqual(server.graded ? server.parts : [], browser.parts, `parts differ: ${label}`);
  if (!browser.graded) assert.equal(server.reason, browser.reason, `reason differs: ${label}`);
  return { browser, server };
};

// Parity AND fidelity to the old inline Check, for one construction.
const assertMatchesOldCheck = (question, points) => {
  const { browser } = gradeBothWays(question, workFor(points));
  const label = JSON.stringify({ question, points });
  let old;
  try {
    old = oldInlineCheck(question, points);
  } catch {
    // The old Check crashed (and recorded nothing): there is no verdict.
    assert.equal(browser.graded, false, `invented a verdict where the tool had none: ${label}`);
    assert.equal(browser.reason, 'unanswerable-question', label);
    return browser;
  }
  assert.equal(browser.graded, true, `not graded: ${label}`);
  assert.equal(browser.isComplete, oldCheckEnabled(question, points), `completeness is not the tool's Check gate: ${label}`);
  assert.equal(browser.isCorrect, old.isCorrect, `verdict changed: ${label}`);
  assert.equal(browser.score, old.score, `score changed: ${label}`);
  const feedback = readConstructionFeedback(browser);
  assert.equal(feedback.category, old.category, `feedback category changed: ${label}`);
  if (old.strategy !== 'formAware') assert.deepEqual(feedback.pointChecks, old.pointChecks, `point feedback changed: ${label}`);
  return browser;
};

const partShare = (parts) => {
  const scorable = parts.filter((part) => part.graded !== false);
  const total = scorable.reduce((sum, part) => sum + part.weight, 0);
  return total ? scorable.reduce((sum, part) => sum + part.credit * part.weight, 0) / total : 0;
};

/* ---------------------------------------------------------------------------
 * Fixtures: every mode, both construction policies
 * ------------------------------------------------------------------------- */

const FORM_AWARE = { strategy: 'formAware' };

const FIXTURES = [
  // slopeIntercept, equivalentLine: any two points on y = 2x - 1.
  { name: 'slopeIntercept: two points on the line', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[3, 5], [5, 9]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'slopeIntercept: points in the other order', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[5, 9], [3, 5]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'slopeIntercept: wrong line through no correct point', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, 0], [1, 3]], isCorrect: false, isComplete: true, score: 0 },
  { name: 'slopeIntercept: one point on the line', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, -1], [1, 0]], isCorrect: false, isComplete: true, score: 0.5 },
  { name: 'slopeIntercept: one on-line point plotted twice', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, -1], [0, -1]], isCorrect: false, isComplete: false, score: 0.25 },
  { name: 'slopeIntercept: only one point plotted', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, -1]], isCorrect: false, isComplete: false, score: 0 },
  { name: 'slopeIntercept: nothing plotted', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [], isCorrect: false, isComplete: false, score: 0 },
  // A rational line lives between gridlines (the tool snaps to 0.5 here).
  { name: 'slopeIntercept: half-grid points on y = 0.5x + 0.5', question: graphing2({ mode: 'slopeIntercept', line: { m: 0.5, b: 0.5 } }), points: [[0, 0.5], [3, 2]], isCorrect: true, isComplete: true, score: 1 },
  // Unauthored slope-intercept: the tool shows and grades y = 1.5x - 2.
  { name: 'unauthored question: the default line y = 1.5x - 2', question: graphing2({}), points: [[0, -2], [2, 1]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'unauthored slopeIntercept mode: the default line', question: graphing2({ mode: 'slopeIntercept' }), points: [[2, 1], [4, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'unauthored question: y = x is not the default line', question: graphing2({}), points: [[0, 0], [1, 1]], isCorrect: false, isComplete: true, score: 0 },
  // Tolerance: default 0.12 on points / 0.24 on the intercept; authored widens it.
  { name: 'default tolerance rejects an intercept 0.4 off', question: graphing2({ mode: 'slopeIntercept', line: { m: 1, b: 0 } }), points: [[0, 0.4], [4, 4.4]], isCorrect: false, isComplete: true, score: 0 },
  { name: 'authored tolerance 0.5 accepts an intercept 0.4 off', question: graphing2({ mode: 'slopeIntercept', line: { m: 1, b: 0 }, tolerance: 0.5 }), points: [[0, 0.4], [4, 4.4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'a decimal close to a fraction is within tolerance', question: graphing2({ mode: 'slopeIntercept', line: { m: 2 / 3, b: 1 } }), points: [[0, 1], [3, 3.0000001]], isCorrect: true, isComplete: true, score: 1 },

  // slopeIntercept, formAware: the y-intercept must be plotted.
  { name: 'slopeIntercept formAware: y-intercept plus a slope step', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE }), points: [[0, -1], [2, 3]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'slopeIntercept formAware: correct line without the y-intercept', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE }), points: [[3, 5], [5, 9]], isCorrect: false, isComplete: true, score: 2 / 3 },
  { name: 'slopeIntercept formAware: y-intercept with a wrong slope step', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE }), points: [[0, -1], [1, 0]], isCorrect: false, isComplete: true, score: 1 / 3 },
  { name: 'slopeIntercept formAware min 3: anchor and two more points', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [1, 1], [2, 3]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'slopeIntercept formAware min 3: only two points is incomplete', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [1, 1]], isCorrect: false, isComplete: false, score: 2 / 3 },
  // Preserved as-is (see the grader's notes): every scored check passes, but a
  // repeated point blocks full credit, so the score is 1 and the verdict wrong.
  { name: 'slopeIntercept formAware min 3: a repeated point', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [1, 1], [1, 1]], isCorrect: false, isComplete: true, score: 1 },

  // factoredLinear: y = 2(x - 1).
  { name: 'factoredLinear: any two points on the line', question: graphing2({ mode: 'factoredLinear', factored: { a: 2, c: 1 } }), points: [[0, -2], [3, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'factoredLinear: the zero with the wrong slope', question: graphing2({ mode: 'factoredLinear', factored: { a: 2, c: 1 } }), points: [[1, 0], [2, 1]], isCorrect: false, isComplete: true, score: 0.5 },
  { name: 'factoredLinear formAware: the x-intercept plus a slope step', question: graphing2({ mode: 'factoredLinear', factored: { a: 2, c: 1 }, constructionPolicy: FORM_AWARE }), points: [[1, 0], [2, 2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'factoredLinear formAware: correct line without the x-intercept', question: graphing2({ mode: 'factoredLinear', factored: { a: 2, c: 1 }, constructionPolicy: FORM_AWARE }), points: [[0, -2], [2, 2]], isCorrect: false, isComplete: true, score: 2 / 3 },

  // throughPoints: the line through (-2, 1) and (2, 3).
  { name: 'throughPoints: the two given points', question: graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]] }), points: [[-2, 1], [2, 3]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'throughPoints: the given points in reverse', question: graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]] }), points: [[2, 3], [-2, 1]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'throughPoints: two other points on the same line', question: graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]] }), points: [[0, 2], [4, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'throughPoints: one given point misread', question: graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]] }), points: [[-2, 1], [2, 4]], isCorrect: false, isComplete: true, score: 0.5 },
  { name: 'throughPoints formAware: graded as the given points (legacy)', question: graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]], constructionPolicy: FORM_AWARE }), points: [[0, 2], [4, 4]], isCorrect: true, isComplete: true, score: 1 },

  // pointSlope: through (2, 3) with slope -1, i.e. y = -x + 5.
  { name: 'pointSlope: two points on the line', question: graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1 }), points: [[0, 5], [5, 0]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'pointSlope formAware: the given point plus a slope step', question: graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1, constructionPolicy: FORM_AWARE }), points: [[2, 3], [5, 0]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'pointSlope formAware: correct line that skips the given point', question: graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1, constructionPolicy: FORM_AWARE }), points: [[0, 5], [5, 0]], isCorrect: false, isComplete: true, score: 2 / 3 },
  { name: 'pointSlope formAware: rational slope -3/4 from (14, 5)', question: graphing2({ mode: 'pointSlope', point: [14, 5], slope: -0.75, constructionPolicy: FORM_AWARE }), points: [[14, 5], [18, 2]], isCorrect: true, isComplete: true, score: 1 },

  // An unauthored point defaults to the origin, as the tool's prompt says.
  { name: 'pointSlope with no point: through the origin', question: graphing2({ mode: 'pointSlope', slope: 2 }), points: [[0, 0], [1, 2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'pointSlope with no slope: nothing is correct', question: graphing2({ mode: 'pointSlope', point: [1, 1] }), points: [[1, 1], [2, 2]], isCorrect: false, isComplete: true, score: 0 },

  // standardForm: 2x + y = 4.
  { name: 'standardForm: any two points on the line', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 } }), points: [[1, 2], [3, -2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm: an equivalent equation 4x + 2y = 8', question: graphing2({ mode: 'standardForm', standard: { A: 4, B: 2, C: 8 } }), points: [[1, 2], [3, -2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: both intercepts', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }), points: [[2, 0], [0, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: both intercepts, y first', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }), points: [[0, 4], [2, 0]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: on the line, no intercepts', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }), points: [[1, 2], [3, -2]], isCorrect: false, isComplete: true, score: 1 / 3 },
  { name: 'standardForm formAware: only the x-intercept required', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'xIntercept' } }), points: [[2, 0], [1, 2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: horizontal 2y = 8', question: graphing2({ mode: 'standardForm', standard: { A: 0, B: 2, C: 8 }, constructionPolicy: FORM_AWARE }), points: [[0, 4], [3, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: vertical 2x = 6', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 0, C: 6 }, constructionPolicy: FORM_AWARE }), points: [[3, 0], [3, 5]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: vertical 2x = 6 off the line', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 0, C: 6 }, constructionPolicy: FORM_AWARE }), points: [[3, 0], [4, 5]], isCorrect: false, isComplete: true, score: 1 / 3 },

  // verticalHorizontal.
  { name: 'vertical x = 3', question: graphing2({ mode: 'verticalHorizontal', orientation: 'vertical', value: 3 }), points: [[3, -2], [3, 5]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'vertical x = 3 drawn horizontal', question: graphing2({ mode: 'verticalHorizontal', orientation: 'vertical', value: 3 }), points: [[3, 0], [4, 0]], isCorrect: false, isComplete: true, score: 0.5 },
  { name: 'horizontal y = -2', question: graphing2({ mode: 'verticalHorizontal', orientation: 'horizontal', value: -2 }), points: [[0, -2], [5, -2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'horizontal y = -2 drawn vertical', question: graphing2({ mode: 'verticalHorizontal', orientation: 'horizontal', value: -2 }), points: [[0, -2], [0, 3]], isCorrect: false, isComplete: true, score: 0.5 },
  { name: 'verticalHorizontal with no value: nothing is correct', question: graphing2({ mode: 'verticalHorizontal', orientation: 'vertical' }), points: [[0, 0], [0, 3]], isCorrect: false, isComplete: true, score: 0 },
  { name: 'horizontal formAware: graded as two points on y = 5 (legacy)', question: graphing2({ mode: 'verticalHorizontal', orientation: 'horizontal', value: 5, constructionPolicy: FORM_AWARE }), points: [[0, 5], [3, 5]], isCorrect: true, isComplete: true, score: 1 },

  /*
   * Tolerance and threshold boundaries. The expected values are what the
   * pre-shared-grader Graphing2 (merge base a7a3b4e) computed for the same
   * work; each pair sits on either side of one constant, so a grader that
   * drifts on any of them goes red here even though the integer-lattice
   * fixtures above would not notice.
   */
  // Points: 0.12 from the line.
  { name: 'boundary: a point 0.11 off is on the line', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, -1], [1, 1.11]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'boundary: a point 0.13 off is off the line', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, -1], [1, 1.13]], isCorrect: false, isComplete: true, score: 0.5 },
  // The line's intercept: twice the point tolerance (0.24) — but both points
  // must also be within the point tolerance, so a parallel line 0.2 above the
  // target (each point 0.2 off it) is a different line, not a match (K job:
  // equivalentLine no longer ignores its own point checks).
  { name: 'boundary: an intercept 0.2 off, every point 0.2 off the line, is not the line', question: graphing2({ mode: 'slopeIntercept', line: { m: 1, b: 0 } }), points: [[0, 0.2], [4, 4.2]], isCorrect: false, isComplete: true, score: 0 },
  { name: 'boundary: an intercept 0.1 off, every point 0.1 off the line, still matches it', question: graphing2({ mode: 'slopeIntercept', line: { m: 1, b: 0 } }), points: [[0, 0.1], [4, 4.1]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'boundary: an intercept 0.3 off does not', question: graphing2({ mode: 'slopeIntercept', line: { m: 1, b: 0 } }), points: [[0, 0.3], [4, 4.3]], isCorrect: false, isComplete: true, score: 0 },
  // Form-aware anchor: within the point tolerance of the intercept.
  { name: 'boundary formAware: an anchor 0.1 off counts', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE }), points: [[0, -0.9], [2, 3]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'boundary formAware: an anchor 0.2 off is missed', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE }), points: [[0, -0.8], [2, 3]], isCorrect: false, isComplete: true, score: 1 / 3 },
  // Form-aware line check: every point within 1.5x the tolerance (0.18).
  { name: 'boundary formAware min 3: a point 0.15 off keeps the line, loses slope evidence', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [1, 1], [2, 3.15]], isCorrect: false, isComplete: true, score: 2 / 3 },
  { name: 'boundary formAware min 3: a point 0.2 off loses the line too', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [1, 1], [2, 3.2]], isCorrect: false, isComplete: true, score: 1 / 3 },
  // One spot: points closer than 1e-4. The tool's Check gate (1e-9) still
  // lets this through, so it is a real, recordable attempt.
  { name: 'boundary: points closer than 1e-4 are one spot', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), points: [[0, -1], [0.00005, -1]], isCorrect: false, isComplete: true, score: 0.25 },
  { name: 'boundary formAware min 3: points closer than 1e-4 are a repeat', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [1, 1], [1.00005, 1]], isCorrect: false, isComplete: true, score: 1 },
  { name: 'boundary formAware min 3: a near but distinct off-line point is not merged away', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, -1], [0.25, -0.3], [2, 3]], isCorrect: false, isComplete: true, score: 1 / 3 },
  // Authored tolerance read with `??`: 0 is exact, not "use the default".
  { name: 'authored tolerance 0: exact points are correct', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, tolerance: 0 }), points: [[0, -1], [2, 3]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'authored tolerance 0: a point 0.05 off is wrong', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, tolerance: 0 }), points: [[0, -1], [2, 3.05]], isCorrect: false, isComplete: true, score: 0.5 },
  { name: 'authored tolerance as text is read as a number', question: graphing2({ mode: 'slopeIntercept', line: { m: 1, b: 0 }, tolerance: '0.5' }), points: [[0, 0.4], [4, 4.4]], isCorrect: true, isComplete: true, score: 1 },

  // The tool's `questionData.mode || 'slopeIntercept'`: a blank or null mode
  // is the default view, with the default line.
  { name: 'empty mode: the default line y = 1.5x - 2', question: graphing2({ mode: '' }), points: [[0, -2], [2, 1]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'null mode: the default line y = 1.5x - 2', question: graphing2({ mode: null }), points: [[0, -2], [2, 1]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'an authored but empty line is not replaced by the default', question: graphing2({ mode: 'slopeIntercept', line: {} }), points: [[0, -2], [2, 1]], isCorrect: false, isComplete: true, score: 0 },
  { name: 'slopeIntercept authored with a vertical line x = 3', question: graphing2({ mode: 'slopeIntercept', line: { x: 3 } }), points: [[3, 0], [3, 4]], isCorrect: true, isComplete: true, score: 1 },
  // Authored values as text, read with Number() exactly as the tool reads them.
  { name: 'minimumPoints authored as the text "3"', question: graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: '3' } }), points: [[0, -1], [1, 1]], isCorrect: false, isComplete: false, score: 2 / 3 },
  { name: 'standardForm coefficients authored as text', question: graphing2({ mode: 'standardForm', standard: { A: '2', B: '1', C: '4' } }), points: [[2, 0], [0, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware intercepts, min 3', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'intercepts', minimumPoints: 3 } }), points: [[2, 0], [0, 4], [1, 2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware horizontal, min 3: one intercept and two more on y = 4', question: graphing2({ mode: 'standardForm', standard: { A: 0, B: 2, C: 8 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), points: [[0, 4], [3, 4], [-2, 4]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'standardForm formAware: only the y-intercept required', question: graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'yIntercept' } }), points: [[0, 4], [1, 2]], isCorrect: true, isComplete: true, score: 1 },
  { name: 'factoredLinear formAware: negative rational a, negative c', question: graphing2({ mode: 'factoredLinear', factored: { a: -0.5, c: -2 }, constructionPolicy: FORM_AWARE }), points: [[-2, 0], [2, -2]], isCorrect: true, isComplete: true, score: 1 },
];

/* ---------------------------------------------------------------------------
 * Declaration and dispatch
 * ------------------------------------------------------------------------- */

test('graphing2 is graded by the shared server grader in every mode the tool renders', () => {
  const declaration = GRADING_MANIFEST.graphing2;
  assert.equal(declaration, graphing2Declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.authority, GRADING_AUTHORITY.SHARED_SERVER);
  // The component's own routing: MODE_LABELS names every mode with its own view.
  const labels = region(componentSourceText, 'const MODE_LABELS = {', '};', 'MODE_LABELS');
  const componentModes = [...labels.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]).sort();
  assert.ok(componentModes.length >= 6, `could not read the component's modes: ${componentModes}`);
  assert.deepEqual(Object.keys(declaration.modes).sort(), componentModes);
  Object.entries(declaration.modes).forEach(([mode, entry]) => {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, mode);
  });
  assert.deepEqual(graphing2Grader.problems, []);
  assert.equal(resolveGradingSurfaceId({ toolId: 'graphing2' }), 'graphing2');
  assert.equal(resolveGradingSurfaceId({ type: 'graphing2' }), 'graphing2');
  assert.equal(serverResponseGradingSupport(graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1 })).supported, true);
});

test('the declared mode is the view the component renders, including its fallback', () => {
  // Graphing2.jsx: `const mode = questionData.mode || '<default>'`, and an
  // unknown mode falls through every mode branch to that default view.
  const fallback = componentSourceText.match(/const mode = questionData\.mode \|\| '(\w+)'/)?.[1];
  assert.equal(fallback, 'slopeIntercept');
  assert.equal(graphing2Declaration.defaultMode, fallback);
  const componentView = (question) => {
    const mode = question.mode || fallback;
    return Object.keys(graphing2Declaration.modes).includes(mode) ? mode : fallback;
  };
  const questions = [
    {}, { mode: '' }, { mode: null }, { mode: 'slopeIntercept' }, { mode: 'factoredLinear' }, { mode: 'throughPoints' },
    { mode: 'pointSlope' }, { mode: 'standardForm' }, { mode: 'verticalHorizontal' }, { mode: 'inequality' },
    { mode: ' pointSlope ' }, { mode: 'PointSlope' },
  ];
  questions.forEach((question) => {
    assert.equal(resolveToolMode(graphing2Declaration, question), componentView(question), JSON.stringify(question));
    assert.equal(gradeToolCheck(graphing2Grader, question, workFor([[0, 0], [1, 1]])).graded, true);
  });
});

test('an unknown mode is graded exactly as the tool grades it, not as a slope-intercept question', () => {
  // The tool reads the target with the raw mode: no default line, and a
  // form-aware policy finds no anchor, so it can never be correct.
  const withLine = graphing2({ mode: 'inequality', line: { m: 1, b: 2 } });
  assert.equal(assertMatchesOldCheck(withLine, [[0, 2], [1, 3]]).isCorrect, true);
  const noLine = graphing2({ mode: 'inequality' });
  assert.equal(assertMatchesOldCheck(noLine, [[0, -2], [2, 1]]).isCorrect, false, 'no default line outside slopeIntercept');
  const formAware = graphing2({ mode: 'inequality', line: { m: 1, b: 2 }, constructionPolicy: FORM_AWARE });
  const result = assertMatchesOldCheck(formAware, [[0, 2], [1, 3]]);
  assert.equal(result.isCorrect, false);
  assert.equal(result.parts.find((part) => part.id === 'anchor')?.isCorrect, false, 'the missing anchor explains the verdict');
});

/* ---------------------------------------------------------------------------
 * Browser == server, and == the old inline Check, for every fixture
 * ------------------------------------------------------------------------- */

test('every fixture: browser and server agree, and both equal the old inline Check', () => {
  FIXTURES.forEach((fixture) => {
    const result = assertMatchesOldCheck(fixture.question, fixture.points);
    assert.equal(result.isCorrect, fixture.isCorrect, `${fixture.name}: isCorrect`);
    assert.equal(result.isComplete, fixture.isComplete, `${fixture.name}: isComplete`);
    assert.ok(Math.abs(result.score - fixture.score) < 1e-12, `${fixture.name}: score ${result.score} != ${fixture.score}`);
  });
});

test('completeness is the tool\'s own Check gate: enough points, and the first two make a line', () => {
  const lineQuestion = graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } });
  assert.equal(gradeBothWays(lineQuestion, workFor([])).browser.isComplete, false);
  assert.equal(gradeBothWays(lineQuestion, workFor([[0, -1]])).browser.isComplete, false);
  assert.equal(gradeBothWays(lineQuestion, workFor([[0, -1], [0, -1]])).browser.isComplete, false, 'two clicks on one spot make no line');
  assert.equal(gradeBothWays(lineQuestion, workFor([[0, 0], [1, 1]])).browser.isComplete, true, 'a wrong line is still a finished construction');
  const threePoints = graphing2({ ...lineQuestion, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } });
  assert.equal(gradeBothWays(threePoints, workFor([[0, -1], [1, 1]])).browser.isComplete, false);
  assert.equal(gradeBothWays(threePoints, workFor([[0, -1], [1, 1], [2, 3]])).browser.isComplete, true);
  // The tool asks for minimumPoints even where grading is legacy.
  const throughThree = graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]], constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } });
  assert.equal(gradeBothWays(throughThree, workFor([[-2, 1], [2, 3]])).browser.isComplete, false);
  // An explicit Check on incomplete work is still marked (incomplete is wrong).
  const incomplete = gradeBothWays(lineQuestion, workFor([[0, -1]])).browser;
  assert.equal(incomplete.graded, true);
  assert.equal(incomplete.isCorrect, false);
});

test('the parts explain the verdict and their scored share is the score', () => {
  FIXTURES.forEach((fixture) => {
    const { browser } = gradeBothWays(fixture.question, workFor(fixture.points));
    if (!browser.isCorrect) assert.ok(Math.abs(partShare(browser.parts) - browser.score) < 1e-12, `${fixture.name}: parts ${partShare(browser.parts)} vs score ${browser.score}`);
    assert.ok(browser.parts.length >= 2, fixture.name);
  });
  const legacy = gradeBothWays(graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), workFor([[0, -1], [1, 0]])).browser;
  assert.deepEqual(legacy.parts.map((part) => [part.id, part.isCorrect, part.graded !== false]), [
    ['point-1', true, true],
    ['point-2', false, true],
    ['line', false, false],
  ]);
  const formAware = gradeBothWays(graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: FORM_AWARE }), workFor([[2, 0], [1, 2]])).browser;
  assert.deepEqual(formAware.parts.map((part) => [part.id, part.isCorrect, part.graded !== false]), [
    ['anchor-xIntercept', true, true],
    ['anchor-yIntercept', false, true],
    ['line', true, true],
    ['distinct-points', true, false],
    ['minimum-points', true, false],
  ]);
  // A part reports the student's own point, never the anchor coordinate.
  const missed = gradeBothWays(graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1, constructionPolicy: FORM_AWARE }), workFor([[0, 5], [5, 0]])).browser;
  assert.equal(missed.parts.find((part) => part.id === 'anchor-givenPoint').response, '');
  assert.doesNotMatch(JSON.stringify(missed.parts), /\(2, 3\)/);
});

test('the recorded attempt is the one the old Check recorded: parts never add credit', () => {
  FIXTURES.forEach((fixture) => {
    const { browser } = gradeBothWays(fixture.question, workFor(fixture.points));
    const old = oldInlineCheck(fixture.question, fixture.points);
    const inputs = attemptInputsFromGrading(browser);
    const now = recordQuestionAttempt({ record: {}, isCorrect: inputs.isCorrect, parts: inputs.parts, partialCreditPercent: inputs.partialCreditPercent }).record;
    // QuestionEngine's tool path before the shared grader: the tool's own
    // isCorrect, no parts (graphing2 reported none), and its score as percent.
    const before = recordQuestionAttempt({ record: {}, isCorrect: old.isCorrect, parts: [], partialCreditPercent: Math.round(old.score * 100) }).record;
    assert.equal(now.status, before.status, fixture.name);
    assert.equal(now.partialCredit, before.partialCredit, fixture.name);
  });
});

test('equivalent constructions earn the same verdict: order, other points on the line, equivalent equations', () => {
  const slope = graphing2({ mode: 'slopeIntercept', line: { m: -0.5, b: 3 } });
  const lattice = [[-4, 5], [-2, 4], [0, 3], [2, 2], [4, 1], [6, 0]];
  lattice.forEach((first) => lattice.forEach((second) => {
    if (first === second) return;
    assert.equal(gradeBothWays(slope, workFor([first, second])).browser.isCorrect, true, JSON.stringify([first, second]));
  }));
  // The same line authored three ways.
  const sameLine = [
    graphing2({ mode: 'standardForm', standard: { A: 1, B: 2, C: 6 } }),
    graphing2({ mode: 'standardForm', standard: { A: -2, B: -4, C: -12 } }),
    graphing2({ mode: 'pointSlope', point: [2, 2], slope: -0.5 }),
    graphing2({ mode: 'throughPoints', givenPoints: [[-4, 5], [6, 0]] }),
    slope,
  ];
  sameLine.forEach((question) => assert.equal(gradeBothWays(question, workFor([[0, 3], [6, 0]])).browser.isCorrect, true, question.mode));
});

test('discrimination: correct work against a question with an altered key is wrong', () => {
  const pairs = [
    [graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), graphing2({ mode: 'slopeIntercept', line: { m: 2, b: 1 } }), [[0, -1], [2, 3]]],
    [graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), graphing2({ mode: 'slopeIntercept', line: { m: -2, b: -1 } }), [[0, -1], [2, 3]]],
    [graphing2({}), graphing2({ line: { m: 1.5, b: 2 } }), [[0, -2], [2, 1]]],
    [graphing2({ mode: 'factoredLinear', factored: { a: 2, c: 1 } }), graphing2({ mode: 'factoredLinear', factored: { a: 2, c: -1 } }), [[1, 0], [2, 2]]],
    [graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 3]] }), graphing2({ mode: 'throughPoints', givenPoints: [[-2, 1], [2, 4]] }), [[-2, 1], [2, 3]]],
    [graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1 }), graphing2({ mode: 'pointSlope', point: [2, 3], slope: 1 }), [[2, 3], [5, 0]]],
    [graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 } }), graphing2({ mode: 'standardForm', standard: { A: 2, B: 1, C: 6 } }), [[2, 0], [0, 4]]],
    [graphing2({ mode: 'verticalHorizontal', orientation: 'vertical', value: 3 }), graphing2({ mode: 'verticalHorizontal', orientation: 'horizontal', value: 3 }), [[3, -2], [3, 5]]],
    [graphing2({ mode: 'verticalHorizontal', orientation: 'vertical', value: 3 }), graphing2({ mode: 'verticalHorizontal', orientation: 'vertical', value: -3 }), [[3, -2], [3, 5]]],
    // Same line, but the form-aware key now demands an anchor the work skipped.
    [graphing2({ mode: 'pointSlope', point: [0, 5], slope: -1, constructionPolicy: FORM_AWARE }), graphing2({ mode: 'pointSlope', point: [2, 3], slope: -1, constructionPolicy: FORM_AWARE }), [[0, 5], [5, 0]]],
  ];
  pairs.forEach(([question, altered, points]) => {
    assert.equal(gradeBothWays(question, workFor(points)).browser.isCorrect, true, `baseline ${JSON.stringify(question)}`);
    assert.equal(gradeBothWays(altered, workFor(points)).browser.isCorrect, false, `altered ${JSON.stringify(altered)}`);
  });
});

test('a seeded sweep of questions and constructions: parity and fidelity hold everywhere', () => {
  // mulberry32: exact 32-bit integer arithmetic, so the sweep is the same
  // cases on every machine.
  let state = 20261001;
  const random = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (values) => values[Math.floor(random() * values.length)];
  const coordinate = () => pick([-6, -4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 6]);
  const policies = [undefined, { strategy: 'equivalentLine' }, FORM_AWARE, { strategy: 'formAware', minimumPoints: 3 },
    { strategy: 'formAware', minimumPoints: '3' }, { strategy: 'formAware', requiredAnchor: 'intercepts', minimumPoints: 3 },
    { strategy: 'formAware', requiredAnchor: 'xIntercept' }, { strategy: 'formAware', requiredAnchor: 'yIntercept' }];
  const questionFor = () => {
    const mode = pick(['slopeIntercept', 'factoredLinear', 'throughPoints', 'pointSlope', 'standardForm', 'verticalHorizontal', undefined, '', null]);
    const question = graphing2({ mode, constructionPolicy: pick(policies) });
    if (random() < 0.85) question.line = { m: pick([-2, -1, -0.5, 0, 0.5, 1, 2]), b: pick([-2, -1, 0, 1, 3]) };
    question.factored = { a: pick([-2, -0.5, 1, 2]), c: pick([-2, 0, 1, 3]) };
    question.givenPoints = [[coordinate(), coordinate()], [coordinate(), coordinate()]];
    question.point = [coordinate(), coordinate()];
    question.slope = pick([-2, -1, -0.5, 0.5, 1, 2]);
    question.standard = { A: pick([0, 1, 2, -3]), B: pick([0, 1, 2, 4]), C: pick([0, 4, 6, -8]) };
    question.orientation = pick(['vertical', 'horizontal']);
    question.value = pick([-3, 0, 1.5, 2]);
    if (random() < 0.25) question.tolerance = pick([0, 0.05, 0.3, 1, '0.3']);
    return question;
  };
  /*
   * Points that land on the tool's target line (its intercepts, its given
   * point) most of the time, slightly off it some of the time, and repeat an
   * earlier point now and then. Uniformly random points almost never touch
   * the line, so a sweep built from them would only ever test "wrong".
   */
  const pointFor = (question, previous) => {
    const roll = random();
    if (previous.length && roll < 0.12) return [...pick(previous)];
    const mode = question.mode || 'slopeIntercept';
    const target = targetLineFromQuestion(mode === 'slopeIntercept' && !question.line ? { ...question, line: { m: 1.5, b: -2 } } : question);
    const miss = () => pick([0, 0, 0, 0, 0.1, 0.2, -0.5]);
    if (target?.kind === 'vertical' && roll < 0.8) return [target.x + miss(), coordinate()];
    if (target?.kind === 'slopeIntercept' && roll < 0.8) {
      const xIntercept = target.m !== 0 ? -target.b / target.m : 1;
      const x = pick([0, 0, xIntercept, xIntercept, 1, 2, -2, 3, Number(question.point?.[0]) || 0]);
      return [x, target.m * x + target.b + miss()];
    }
    return [coordinate(), coordinate()];
  };
  const seen = { correct: 0, partial: 0, zero: 0, unanswerable: 0, categories: new Set() };
  for (let index = 0; index < 2500; index += 1) {
    const question = questionFor();
    const count = pick([0, 1, 2, 2, 2, 3, 3, 3]);
    const points = [];
    for (let p = 0; p < count; p += 1) points.push(pointFor(question, points));
    const result = assertMatchesOldCheck(question, points);
    if (!result.graded) {
      seen.unanswerable += 1;
      continue;
    }
    if (result.isCorrect) seen.correct += 1;
    else if (result.score > 0) seen.partial += 1;
    else seen.zero += 1;
    seen.categories.add(readConstructionFeedback(result).category);
  }
  // The sweep has to reach every verdict, or it proves nothing about them
  // (this seed: 279 correct, 1163 partial, 1037 zero, 21 unanswerable).
  assert.ok(seen.correct >= 200, `only ${seen.correct} correct constructions in the sweep`);
  assert.ok(seen.partial >= 600, `only ${seen.partial} partial-credit constructions in the sweep`);
  assert.ok(seen.zero >= 500, `only ${seen.zero} zero-credit constructions in the sweep`);
  assert.ok(seen.unanswerable >= 5, `only ${seen.unanswerable} unanswerable questions in the sweep`);
  assert.deepEqual([...seen.categories].sort(), ['correct', 'correctAnchorWrongSlope', 'correctLineMissingAnchor', 'duplicatePoint', 'incorrectLine']);
});

/* ---------------------------------------------------------------------------
 * Work hygiene, tampering and bounds
 * ------------------------------------------------------------------------- */

test('realistic maximal work is pure student work and fits the response contract', () => {
  const question = graphing2({ mode: 'pointSlope', point: [14, 5], slope: -0.75, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } });
  const work = workFor([[14, 5], [18, 2], [-12, 24.5]]);
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  assert.deepEqual(Object.keys(work).sort(), ['points', 'studentLine']);
  assert.equal(gradeBothWays(question, work).browser.isCorrect, true);
});

test('forged verdicts, keys and line readouts are ignored: only the points are marked', () => {
  const question = graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } });
  const wrong = workFor([[0, 0], [1, 3]]);
  const forged = {
    ...wrong,
    isCorrect: true,
    score: 1,
    expected: { m: 2, b: -1 },
    checks: [true, true],
    feedback: 'Correct',
    // The readout claims the target line; the points do not make it.
    studentLine: { kind: 'slopeIntercept', m: 2, b: -1 },
  };
  assert.deepEqual(boundToolWork(forged).dropped.sort(), ['checks', 'expected', 'feedback', 'isCorrect', 'score']);
  const { browser } = gradeBothWays(question, forged);
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.score, 0);
  // And a garbage readout cannot spoil correct points.
  const right = { points: [[0, -1], [2, 3]], studentLine: 'nonsense' };
  assert.equal(gradeBothWays(question, right).browser.isCorrect, true);
  assert.equal(gradeBothWays(question, { points: [[0, -1], [2, 3]] }).browser.isCorrect, true, 'the readout is optional');
});

test('malformed work is refused on both paths, never guessed at', () => {
  const question = graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } });
  const malformed = [
    { points: 'abc' },
    { points: { 0: [0, -1], 1: [2, 3] } },
    { points: [[0, -1], null] },
    { points: [[0, -1], [2]] },
    { points: [[0, -1], [2, 3, 4]] },
    { points: [[0, -1], ['2', 3]] },
    { points: [[0, -1], [2, null]] },
    { points: [[0, -1], [2, Infinity]] }, // travels as the string "Infinity"
    { points: [[0, -1], [Number.NaN, 3]] }, // travels as null
  ];
  malformed.forEach((work) => {
    const { browser } = gradeBothWays(question, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(browser.reason, 'malformed-response', JSON.stringify(work));
    assert.equal(browser.isCorrect, false);
    assert.equal(browser.isComplete, false, 'malformed work is never auto-submitted');
  });
  // Missing points is an empty construction: graded, incomplete, wrong.
  const empty = gradeBothWays(question, {}).browser;
  assert.deepEqual([empty.graded, empty.isComplete, empty.isCorrect, empty.score], [true, false, false, 0]);
  // Work that is not an object is not a response.
  [null, 'points', [[0, -1], [2, 3]], 7].forEach((work) => {
    const { browser } = gradeBothWays(question, work);
    assert.equal(browser.graded, false, JSON.stringify(work));
    assert.equal(browser.reason, 'empty-response', JSON.stringify(work));
  });
});

test('a question the tool cannot answer gets no verdict, as the tool\'s Check recorded none', () => {
  // toolSchemas.js refuses these; evaluateConstruction throws on them.
  const noXIntercept = graphing2({ mode: 'standardForm', standard: { A: 0, B: 2, C: 8 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'xIntercept' } });
  const noYIntercept = graphing2({ mode: 'standardForm', standard: { A: 2, B: 0, C: 6 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'yIntercept' } });
  [noXIntercept, noYIntercept].forEach((question) => {
    assert.throws(() => oldInlineCheck(question, [[0, 4], [3, 4]]));
    const result = assertMatchesOldCheck(question, [[0, 4], [3, 4]]);
    assert.equal(result.isComplete, false, 'never auto-submitted at a deadline');
  });
});

test('oversize work is refused on both paths', () => {
  const question = graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } });
  const work = { ...workFor([[0, -1], [2, 3]]), notes: Array.from({ length: 30 }, () => 'x'.repeat(1000)) };
  const { browser } = gradeBothWays(question, work);
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(browser.toolResponse.oversize, true);
});

test('feedback categories read back from the parts are evaluateConstruction\'s own', () => {
  const question = graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: FORM_AWARE });
  const cases = [
    [[[0, -1], [2, 3]], 'correct'],
    [[[3, 5], [5, 9]], 'correctLineMissingAnchor'],
    [[[0, -1], [1, 0]], 'correctAnchorWrongSlope'],
    [[[0, -1], [0, -1]], 'duplicatePoint'],
    [[[1, 0], [2, 0]], 'incorrectLine'],
  ];
  cases.forEach(([points, category]) => {
    const { browser } = gradeBothWays(question, workFor(points));
    assert.equal(readConstructionFeedback(browser).category, category, JSON.stringify(points));
  });
  const legacy = gradeBothWays(graphing2({ mode: 'slopeIntercept', line: { m: 2, b: -1 } }), workFor([[0, 0], [2, 3]])).browser;
  assert.deepEqual(readConstructionFeedback(legacy).pointChecks, [false, true]);
});

/* ---------------------------------------------------------------------------
 * The component is wired to the shared grader
 * ------------------------------------------------------------------------- */

test('Graphing2 Check marks through the shared grader and submits the same work it reports live', () => {
  const code = executableSource(componentSourceText);
  // A call with no import is a runtime ReferenceError no other gate catches.
  assert.match(code, /import\s+graphing2Grader\b[^;]*from\s+'\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/graphing2\.mjs'/);
  assert.match(code, /import\s+\{\s*gradeToolCheck\s*\}\s+from\s+'\.\.\/shared\/sharedToolGrading\.js'/);
  assert.match(code, /import\s+useReportToolWork\s+from\s+'\.\.\/shared\/useReportToolWork\.js'/);

  const reported = code.match(/useReportToolWork\((\w+)\)/)?.[1];
  assert.ok(reported, 'the component reports its live work for deadlines');
  const check = region(code, 'const check = () => {', '\n  };', 'the Check handler');
  assert.match(check, new RegExp(`const (\\w+) = gradeToolCheck\\(graphing2Grader, questionData, ${reported}\\)`));
  const resultName = check.match(/const (\w+) = gradeToolCheck\(/)[1];
  // Without a verdict (a question the tool cannot answer) nothing is recorded.
  const guard = check.search(new RegExp(`if \\(!${resultName}\\.graded\\) return`));
  assert.ok(guard > -1 && guard < check.indexOf('submit('), 'an ungraded check must return before submitting');
  const submitted = region(check, 'submit(', ');', 'the submit call');
  assert.match(submitted, new RegExp(`isCorrect: ${resultName}\\.isCorrect`));
  assert.match(submitted, new RegExp(`score: ${resultName}\\.score`));
  assert.match(submitted, new RegExp(`,\\s*${reported},`), 'Check submits the same work object it reports live');
  assert.match(submitted, new RegExp(`parts: ${resultName}\\.parts`));
  // No answer key or verdict-derivation rides in the metadata.
  assert.doesNotMatch(submitted, /target|interceptEvidence|anchors|expected|pointChecks|category/);
  // The inline verdict is gone: nothing in the component marks points itself.
  assert.doesNotMatch(code, /evaluateConstruction\s*\(|constructionEvidence\s*\(|linesEquivalent\s*\(|pointOnLine\s*\(/);
});

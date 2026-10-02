import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import signSolutionGrader from '../../functions/shared/serverGrading/tools/signSolutionAnalyzer.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/signSolutionAnalyzer.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  buildSignIntervals,
  sameIntervalSelection,
  validRadicalCandidates,
} from '../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * SIGN & SOLUTION ANALYZER IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every view — and
 * that verdict must be the one the analyzer's old inline Check reached, with
 * one documented fix (text candidates in radicalCheck).
 */

const COMPONENT = 'src/tools/signSolutionAnalyzer/SignSolutionAnalyzer.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'signSolutionAnalyzer';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(signSolutionGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason, toolResponse: browser.toolResponse };
};

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

// The component's own routing, read from its source and replayed here.
const router = region(code, 'export default function SignSolutionAnalyzer', '\nfunction ', 'router');
const chart = region(code, 'function SignChart(', '\nfunction ', 'SignChart');
assert.match(router, /const mode = questionData\.mode \|\| \(questionData\.denominatorFactors\?\.length \? 'rational' : 'polynomial'\);/);
assert.match(router, /if \(mode === 'radicalCheck'\) return <RadicalCheck /);
assert.match(router, /return <SignChart [^>]*mode=\{mode\}/);
assert.match(chart, /const denominatorFactors = mode === 'rational' \? \(questionData\.denominatorFactors \|\| \[\{root:1,multiplicity:1\}\]\) : \[\];/);
const componentMode = (question) => {
  const mode = question.mode || (question.denominatorFactors?.length ? 'rational' : 'polynomial');
  if (mode === 'radicalCheck') return 'radicalCheck';
  // The chart reads denominators only for exactly 'rational'.
  return mode === 'rational' ? 'rational' : 'polynomial';
};

test('every view the analyzer renders is declared shared-server, contract v1, default polynomial', () => {
  assert.equal(GRADING_MANIFEST.signSolutionAnalyzer, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'polynomial');
  assert.deepEqual(Object.keys(declaration.modes).sort(), ['polynomial', 'radicalCheck', 'rational']);
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(signSolutionGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
  assert.deepEqual([...signSolutionGrader.problems], []);
});

test('declared mode resolution reproduces the screen routing, including inferred, padded and non-string modes', () => {
  const den = [{ root: 1 }];
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'polynomial' }, { mode: 'rational' }, { mode: 'radicalCheck' },
    { denominatorFactors: den }, { denominatorFactors: [] }, { mode: '', denominatorFactors: den },
    { mode: 'polynomial', denominatorFactors: den }, { mode: 'weird', denominatorFactors: den }, { mode: ' radicalCheck ' },
    { mode: 'RadicalCheck' }, { mode: 'Rational', denominatorFactors: den }, { mode: 7 }, { mode: ['rational'] },
    { mode: { toString: () => 'radicalCheck' } }, { mode: 'constructor' }, { denominatorFactors: 'x' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `question ${JSON.stringify(question)}`);
  }
  // An explicit polynomial mode ignores authored denominators, as on screen.
  const ignored = grade(q({ mode: 'polynomial', denominatorFactors: den }), { selected: [0, 2] });
  assert.equal(ignored.mode, 'polynomial');
  assert.equal(ignored.isCorrect, true, 'graded as (x + 2)(x − 3) > 0, the chart the student saw');
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

test('both views grade their Check through the shared grader, report the same work, and send no answer in metadata', () => {
  assert.match(code, /import signSolutionGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/signSolutionAnalyzer\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const views = {
    SignChart: /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: chartMode, relation, parts: result\.parts \}\);/,
    RadicalCheck: /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: 'radicalCheck', parts: result\.parts \}\);/,
  };
  for (const [name, submitCall] of Object.entries(views)) {
    const body = region(code, `function ${name}(`, '\n}', name);
    const check = region(body, 'const check = () => {', '\n  };', `${name} check`);
    assert.match(body, /const work = \{ selected \};/, `${name} builds work at render scope`);
    assert.match(body, /useReportToolWork\(work\);/, `${name} reports live work`);
    assert.match(check, /const result = gradeToolCheck\(signSolutionGrader, questionData, work\);/, `${name} grades through the shared grader`);
    assert.match(check, submitCall, `${name} submits the shared verdict, its work and no answer-derived metadata`);
    assert.doesNotMatch(check, /expected|sameIntervalSelection|same\(|===|included/, `${name} computes no verdict of its own`);
  }
  // The chart reports the mode the declaration grades it as.
  assert.match(chart, /const chartMode = mode === 'rational' \? 'rational' : 'polynomial';/);
  // The "how many intervals" hint reads the chart on screen, not a count the
  // attempt carried.
  assert.doesNotMatch(code, /expectedCount:|metadata\?\.expectedCount/);
});

test('the inline verdict code is gone from the component', () => {
  assert.doesNotMatch(code, /sameIntervalSelection|const same = /);
  assert.doesNotMatch(code, /isCorrect \? 1 : 0/);
});

/* ------------------------------------------------------------------ */
/* the old inline Check, as a parity oracle                            */
/* ------------------------------------------------------------------ */

// Verbatim from SignSolutionAnalyzer.jsx before the shared grader.
const legacyCheck = (question, work) => {
  const mode = question.mode || (question.denominatorFactors?.length ? 'rational' : 'polynomial');
  if (mode === 'radicalCheck') {
    const expected = validRadicalCandidates(question.radicalEquation || { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, question.candidates || [3, -15]);
    const same = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((value, index) => value === [...b].sort((x, y) => x - y)[index]);
    return same(work.selected, expected);
  }
  const numeratorFactors = question.numeratorFactors || question.factors || [{ root: -2, multiplicity: 1 }, { root: 3, multiplicity: 1 }];
  const denominatorFactors = mode === 'rational' ? (question.denominatorFactors || [{ root: 1, multiplicity: 1 }]) : [];
  const analysis = buildSignIntervals({ numeratorFactors, denominatorFactors }, question.relation || '>');
  const expectedIdx = analysis.intervals.map((interval, index) => (interval.included ? index : null)).filter((value) => value !== null);
  return sameIntervalSelection(work.selected, expectedIdx);
};

const assertLegacyParity = (question, work, label) => {
  const result = grade(question, work);
  const legacy = legacyCheck(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, legacy, `${label}: isCorrect matches the old Check`);
  assert.equal(result.score, legacy ? 1 : 0, `${label}: all-or-nothing score matches the old Check`);
  return result;
};

/* ------------------------------------------------------------------ */
/* polynomial / rational sign charts                                   */
/* ------------------------------------------------------------------ */

test('polynomial: exactly the qualifying intervals, in any order; one part, all or nothing', () => {
  // (x + 1)²(x − 2) ≤ 0: the even factor does not flip the sign → (−∞, −1), (−1, 2).
  const question = q({ mode: 'polynomial', factors: [{ root: -1, multiplicity: 2 }, { root: 2, multiplicity: 1 }], relation: '<=' });
  const correct = assertLegacyParity(question, { selected: [1, 0] }, 'reordered');
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.deepEqual(correct.parts.map((part) => part.id), ['intervals']);
  assert.equal(correct.parts[0].response, '(−∞, -1) ∪ (-1, 2)', 'the gradebook shows the intervals the student chose');
  for (const selected of [[0], [0, 1, 2], [2], [1, 2]]) {
    const wrong = assertLegacyParity(question, { selected }, JSON.stringify(selected));
    assert.equal(wrong.isCorrect, false);
    assert.equal(wrong.score, 0);
  }
  // numeratorFactors is read before factors: x(x − 2) > 0 → (−∞, 0) ∪ (2, ∞).
  // Read the other way, (x − 5) > 0 has two intervals and [0, 2] is wrong.
  const both = q({ numeratorFactors: [{ root: 0 }, { root: 2 }], factors: [{ root: 5 }], relation: '>' });
  const numeratorFirst = assertLegacyParity(both, { selected: [0, 2] }, 'numeratorFactors first');
  assert.equal(numeratorFirst.isCorrect, true);
  assert.equal(numeratorFirst.parts[0].response, '(−∞, 0) ∪ (2, ∞)');
  assert.equal(assertLegacyParity(both, { selected: [1] }, 'factors ignored').isCorrect, false);
});

test('polynomial: endpoint inclusion is not student input, so ≥ grades like > (as on screen)', () => {
  const strict = q({ factors: [{ root: -2 }, { root: 3 }], relation: '>' });
  const inclusive = q({ factors: [{ root: -2 }, { root: 3 }], relation: '>=' });
  assert.equal(assertLegacyParity(strict, { selected: [0, 2] }, 'strict').isCorrect, true);
  assert.equal(assertLegacyParity(inclusive, { selected: [2, 0] }, 'inclusive').isCorrect, true);
});

test('an unauthored question grades against the demo chart (x + 2)(x − 3) > 0', () => {
  const result = assertLegacyParity(q({}), { selected: [0, 2] }, 'defaults');
  assert.equal(result.mode, 'polynomial');
  assert.equal(result.isCorrect, true);
});

test('rational: denominator zeros split the line too; authored or default denominator, explicit or inferred mode', () => {
  // (x − 2)/(x + 3) ≥ 0 → (−∞, −3) ∪ (2, ∞).
  const explicit = q({ mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' });
  assert.equal(assertLegacyParity(explicit, { selected: [0, 2] }, 'explicit').isCorrect, true);
  assert.equal(assertLegacyParity(explicit, { selected: [1] }, 'inverted').isCorrect, false);
  const inferred = q({ numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' });
  const inferredResult = assertLegacyParity(inferred, { selected: [2, 0] }, 'inferred');
  assert.equal(inferredResult.mode, 'rational');
  assert.equal(inferredResult.isCorrect, true);
  // mode 'rational' with no denominator uses the demo (x − 1): (x + 2)(x − 3)/(x − 1) > 0 → (−2, 1) ∪ (3, ∞).
  const demoDenominator = assertLegacyParity(q({ mode: 'rational' }), { selected: [1, 3] }, 'default denominator');
  assert.equal(demoDenominator.isCorrect, true);
  assert.equal(demoDenominator.parts[0].response, '(-2, 1) ∪ (3, ∞)', 'the chart splits at the demo denominator zero x = 1');
  // (x − 1.5)²/(x − 1) > 0 → (1, 1.5) ∪ (1.5, ∞): the demo denominator's zero
  // at 1 decides which intervals exist (a zero at 2 would give only (2, ∞)).
  const evenOverDemo = q({ mode: 'rational', numeratorFactors: [{ root: 1.5, multiplicity: 2 }], relation: '>' });
  assert.equal(assertLegacyParity(evenOverDemo, { selected: [2, 1] }, 'even numerator over the demo denominator').isCorrect, true);
  assert.equal(assertLegacyParity(evenOverDemo, { selected: [2] }, 'only the right tail').isCorrect, false);
});

test('an empty selection is graded — right when nothing qualifies — but never complete', () => {
  // (x − 1)² < 0 has no solution.
  const none = q({ factors: [{ root: 1, multiplicity: 2 }], relation: '<' });
  const empty = assertLegacyParity(none, { selected: [] }, 'empty on ∅');
  assert.equal(empty.isCorrect, true);
  assert.equal(empty.score, 1);
  assert.equal(empty.isComplete, false, 'indistinguishable from an untouched chart, so a deadline never auto-submits it');
  assert.equal(assertLegacyParity(none, { selected: [0] }, 'picked on ∅').isCorrect, false);
  const untouched = assertLegacyParity(q({}), { selected: [] }, 'empty on default');
  assert.equal(untouched.isCorrect, false);
  assert.equal(untouched.isComplete, false);
});

/* ------------------------------------------------------------------ */
/* radicalCheck                                                        */
/* ------------------------------------------------------------------ */

const RADICAL = q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 2, b: 3 }, rhs: { m: 1, b: 0 } }, candidates: [3, -1] });

test('radicalCheck: keep exactly the genuine solutions', () => {
  // √(2x + 3) = x: 3 works; −1 gives 1 = −1 (extraneous).
  const correct = assertLegacyParity(RADICAL, { selected: [3] }, 'genuine');
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.deepEqual(correct.parts.map((part) => part.id), ['candidates']);
  assert.equal(correct.parts[0].response, 'x = 3');
  assert.equal(assertLegacyParity(RADICAL, { selected: [3, -1] }, 'kept extraneous').isCorrect, false);
  assert.equal(assertLegacyParity(RADICAL, { selected: [-1] }, 'only extraneous').isCorrect, false);
  // Every candidate extraneous: √x = −2 has no solution, and keeping none is right.
  const noSolution = q({ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 0 }, rhs: { m: 0, b: -2 } }, candidates: [4] });
  const empty = assertLegacyParity(noSolution, { selected: [] }, 'none genuine');
  assert.equal(empty.isCorrect, true);
  assert.equal(empty.isComplete, false);
  // Unauthored: √(x + 6) = 3 with 3 and −15 (outside the domain).
  assert.equal(assertLegacyParity(q({ mode: 'radicalCheck' }), { selected: [3] }, 'defaults').isCorrect, true);
  assert.equal(grade(q({ mode: 'radicalCheck' }), { selected: [-15, 3] }).isCorrect, false);
});

test('radicalCheck: candidates authored as text can now be answered (BEFORE: never correct)', () => {
  // A template's placeholder substitution produces text candidates. The
  // screen toggles the authored value ("3"); the old Check compared it with
  // `===` against Number()-mapped solutions, so the genuine "3" never matched.
  const text = q({ ...RADICAL, candidates: ['3', '-1'] });
  const work = { selected: ['3'] };
  assert.equal(legacyCheck(text, work), false, 'BEFORE: the right answer was marked wrong');
  const after = grade(text, work);
  assert.equal(after.isCorrect, true, 'AFTER: compared by value');
  assert.equal(after.score, 1);
  assert.equal(after.parts[0].response, 'x = 3');
  assert.equal(grade(text, { selected: ['3', '-1'] }).isCorrect, false);
  assert.equal(grade(text, { selected: ['-1'] }).isCorrect, false);
  // Numeric candidates grade exactly as before (the parity cases above), and
  // a value that is not a number never matches.
  assert.equal(grade(RADICAL, { selected: ['three'] }).isCorrect, false);
  assert.equal(grade(RADICAL, { selected: [''] }).isCorrect, false);
  assert.equal(grade(RADICAL, { selected: [[3]] }).isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* the runtime repair: what the browser shows is what the server grades */
/* ------------------------------------------------------------------ */

test('a factorless analyzer opened on Step Algebra is the stepAlgebra surface on both sides, never this grader', () => {
  const stored = q({ mode: 'polynomial', prompt: 'Solve -2x + 3 > 7.', questionId: 'q7' });
  const shown = prepareQuestionForRuntimeRouting(stored);
  const delivered = deliveredQuestionForGrading(stored);
  assert.equal(shown.type, 'stepAlgebra', 'QuestionEngine opens it on Step Algebra');
  assert.deepEqual(delivered, shown, 'the server rebuilds the same delivered question');
  assert.equal(resolveGradingSurfaceId(delivered), 'stepAlgebra');
  // A sign-chart response for it (stale or forged) is not marked against the
  // demo factors the student never saw.
  const forged = gradeToolCheck(signSolutionGrader, stored, { selected: [0, 2] });
  assert.equal(forged.isCorrect, true, 'the demo chart would have accepted it');
  const server = gradeServerResponse({ question: delivered, response: JSON.parse(JSON.stringify(forged.toolResponse)) });
  assert.equal(server.graded, false);
  assert.equal(server.isCorrect, false);
  assert.notEqual(server.surfaceId, 'signSolutionAnalyzer');
});

test('an analyzer the repair leaves alone grades identically from the shown and the delivered question', () => {
  const cases = [
    [q({ factors: [{ root: -1, multiplicity: 2 }, { root: 2 }], relation: '<=', prompt: 'Solve (x + 1)²(x − 2) ≤ 0.' }), { selected: [0, 1] }],
    [q({ mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' }), { selected: [0, 2] }],
    [RADICAL, { selected: [3] }],
    // No factors and no readable inequality: the analyzer opens its demo chart.
    [q({ mode: 'polynomial', prompt: 'Make a sign chart.' }), { selected: [0, 2] }],
  ];
  for (const [stored, work] of cases) {
    const shown = prepareQuestionForRuntimeRouting(stored);
    const delivered = deliveredQuestionForGrading(stored);
    assert.equal(shown.type, TYPE, 'still the analyzer');
    assert.deepEqual(delivered, shown);
    const browser = grade(shown, work);
    assert.equal(browser.isCorrect, true, JSON.stringify(stored));
    const server = gradeServerResponse({ question: delivered, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
    assert.equal(server.surfaceId, TYPE);
    assert.equal(server.isCorrect, browser.isCorrect);
    assert.equal(server.isComplete, browser.isComplete);
    assert.equal(server.score, browser.score);
    assert.deepEqual(server.parts, browser.parts);
  }
});

/* ------------------------------------------------------------------ */
/* tampering, malformed work, bounds                                   */
/* ------------------------------------------------------------------ */

test('injected verdicts and keys are dropped and never change the verdict', () => {
  const tampered = { selected: [1], isCorrect: true, score: 1, checks: [true], expected: [0, 2], answerKey: [0, 2], graded: true };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'expected', 'graded', 'isCorrect', 'score']);
  const result = grade(q({}), tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
});

test('wrong types never match and never crash the grader', () => {
  for (const selected of ['02', { 0: 0, 1: 2 }, 2, null, true, ['0', '2'], [0.0001, 2], [-1, 0, 2]]) {
    const result = grade(q({}), { selected });
    assert.equal(result.graded, true, JSON.stringify(selected));
    assert.equal(result.isCorrect, false, JSON.stringify(selected));
    assert.equal(result.score, 0);
  }
  assert.equal(grade(q({}), { selected: 'abc' }).isComplete, false);
  assert.equal(grade(q({}), {}).isCorrect, false);
  // Duplicates are not the qualifying set.
  assert.equal(grade(q({}), { selected: [0, 2, 2] }).isCorrect, false);
});

test('non-object, oversize and unrenderable questions are not graded, on either path', () => {
  for (const work of [null, 'selected', 3, [0, 2]]) {
    const result = grade(q({}), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.score, 0);
  }
  const oversize = grade(q({}), { selected: [0, 2], pad: Array.from({ length: 30 }, () => 'y'.repeat(999)) });
  assert.equal(oversize.graded, false);
  assert.equal(oversize.serverReason, 'oversize-response');
  // Factors that are not a list, and a relation that is not text, cannot be
  // charted: the analyzer throws rendering them.
  for (const question of [q({ factors: 5 }), q({ relation: 5 }), q({ mode: 'rational', denominatorFactors: 'x - 1' }), q({ mode: 'radicalCheck', candidates: 'three' })]) {
    const result = grade(question, { selected: [0] });
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(result.reason, 'invalid-question');
  }
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const twelveFactors = q({ factors: Array.from({ length: 12 }, (_, index) => ({ root: index - 6, multiplicity: 1 + (index % 2) })), relation: '>' });
  const intervals = buildSignIntervals({ numeratorFactors: twelveFactors.factors, denominatorFactors: [] }, '>').intervals;
  const selected = intervals.map((interval, index) => (interval.included ? index : null)).filter((value) => value !== null).reverse();
  const works = [{ selected: intervals.map((_, index) => index) }, { selected }, { selected: Array.from({ length: 20 }, (_, index) => `${index - 10}.000000`) }];
  for (const work of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 20);
  }
  assert.equal(grade(twelveFactors, { selected }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides                                     */
/* ------------------------------------------------------------------ */

test('correct work fails against a question whose key was altered', () => {
  const polynomial = q({ factors: [{ root: -1, multiplicity: 2 }, { root: 2 }], relation: '<=' });
  const rational = q({ mode: 'rational', numeratorFactors: [{ root: 2 }], denominatorFactors: [{ root: -3 }], relation: '>=' });
  const cases = [
    [polynomial, { ...polynomial, relation: '>=' }, { selected: [0, 1] }],
    [polynomial, { ...polynomial, factors: [{ root: -1, multiplicity: 1 }, { root: 2 }] }, { selected: [0, 1] }],
    [rational, { ...rational, numeratorFactors: [{ root: 2, multiplicity: 2 }] }, { selected: [0, 2] }],
    [RADICAL, { ...RADICAL, radicalEquation: { radicand: { m: 2, b: 3 }, rhs: { m: -1, b: 0 } } }, { selected: [3] }],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `${JSON.stringify(question)} control`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `${JSON.stringify(altered)} against an altered key`);
  }
});

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
  RADICAL_SOLVE_DEFAULT,
  buildSignIntervals,
  parseRadicalValueList,
  radicalSolveKey,
  sameIntervalSelection,
  validRadicalCandidates,
} from '../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
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
assert.match(router, /if \(mode === 'radicalSolve'\) return <RadicalSolve /);
assert.match(router, /return <SignChart [^>]*mode=\{mode\}/);
assert.match(chart, /const denominatorFactors = mode === 'rational' \? \(questionData\.denominatorFactors \|\| \[\{root:1,multiplicity:1\}\]\) : \[\];/);
const componentMode = (question) => {
  const mode = question.mode || (question.denominatorFactors?.length ? 'rational' : 'polynomial');
  if (mode === 'radicalCheck') return 'radicalCheck';
  if (mode === 'radicalSolve') return 'radicalSolve';
  // The chart reads denominators only for exactly 'rational'.
  return mode === 'rational' ? 'rational' : 'polynomial';
};

test('every view the analyzer renders is declared shared-server, contract v1, default polynomial', () => {
  assert.equal(GRADING_MANIFEST.signSolutionAnalyzer, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'polynomial');
  assert.deepEqual(Object.keys(declaration.modes).sort(), ['polynomial', 'radicalCheck', 'radicalSolve', 'rational']);
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
    { mode: 'radicalSolve' }, { mode: 'radicalSolve', denominatorFactors: den }, { mode: ' radicalSolve' }, { mode: 'RadicalSolve' },
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

test('every view grades its Check through the shared grader, reports the same work, and sends no answer in metadata', () => {
  assert.match(code, /import signSolutionGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/signSolutionAnalyzer\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const views = {
    SignChart: [/const work = \{ selected \};/, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: chartMode, relation, parts: result\.parts \}\);/],
    RadicalCheck: [/const work = \{ selected \};/, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: 'radicalCheck', parts: result\.parts \}\);/],
    RadicalSolve: [
      /const work = \{ isolated, raised, candidates, rows, finalAnswer, noRealSolution \};/,
      /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: 'radicalSolve', parts: result\.parts \}\);/,
    ],
  };
  for (const [name, [workShape, submitCall]] of Object.entries(views)) {
    const body = region(code, `function ${name}(`, '\n}', name);
    const check = region(body, 'const check = () => {', '\n  };', `${name} check`);
    assert.match(body, workShape, `${name} builds work at render scope`);
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
/* radicalSolve                                                        */
/* ------------------------------------------------------------------ */

// √(y − 2) − 1 = 5 (the lesson's first example): √(y − 2) = 6, y − 2 = 36, y = 38.
const SOLVE_38 = q({ mode: 'radicalSolve', radicalEquation: { variable: 'y', radicand: { m: 1, b: -2 }, outside: -1, rhs: { m: 0, b: 5 } } });
const SOLVE_38_WORK = {
  isolated: '6', raised: '36', candidates: '38', rows: [{ left: '5', right: '5', decision: 'solution' }], finalAnswer: '38', noRealSolution: false,
};
// √(−3x − 5) = x + 3: x² + 9x + 14 = 0 gives −7 and −2; −7 is extraneous.
const SOLVE_EXTRANEOUS = q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: -3, b: -5 }, rhs: { m: 1, b: 3 } } });
const SOLVE_EXTRANEOUS_WORK = {
  isolated: 'x + 3', raised: 'x^2 + 6x + 9', candidates: '-7, -2',
  rows: [{ left: '4', right: '-4', decision: 'extraneous' }, { left: '1', right: '1', decision: 'solution' }],
  finalAnswer: '-2', noRealSolution: false,
};
const STAGES = ['isolate', 'raise', 'candidates', 'check', 'final'];
const failedStages = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

test('radicalSolve: every lesson example, stage by stage, on both paths', () => {
  const lesson = [
    [SOLVE_38, SOLVE_38_WORK],
    [SOLVE_EXTRANEOUS, SOLVE_EXTRANEOUS_WORK],
    // (3y + 1)^(1/3) + 5 = 0: an odd root keeps its sign, y = −42.
    [q({ mode: 'radicalSolve', radicalEquation: { variable: 'y', index: 3, radicand: { m: 3, b: 1 }, outside: 5, rhs: { m: 0, b: 0 }, notation: 'exponent' } }),
      { isolated: '-5', raised: '-125', candidates: '-42', rows: [{ left: '0', right: '0', decision: 'solution' }], finalAnswer: '-42' }],
    // 7·⁶√(5m + 4) − 4 = 10: m = 12.
    [q({ mode: 'radicalSolve', radicalEquation: { variable: 'm', index: 6, coefficient: 7, radicand: { m: 5, b: 4 }, outside: -4, rhs: { m: 0, b: 10 } } }),
      { isolated: '2', raised: '64', candidates: '12', rows: [{ left: '10', right: '10', decision: 'solution' }], finalAnswer: '12' }],
    // 9∛(3h + 3) − 4 = 77: h = 242.
    [q({ mode: 'radicalSolve', radicalEquation: { variable: 'h', index: 3, coefficient: 9, radicand: { m: 3, b: 3 }, outside: -4, rhs: { m: 0, b: 77 } } }),
      { isolated: '9', raised: '729', candidates: '242', rows: [{ left: '77', right: '77', decision: 'solution' }], finalAnswer: '242' }],
    // √(x + 5) = −3: the one candidate, 4, is extraneous — no real solution.
    [q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 1, b: 5 }, rhs: { m: 0, b: -3 } } }),
      { isolated: '-3', raised: '9', candidates: '4', rows: [{ left: '3', right: '-3', decision: 'extraneous' }], noRealSolution: true }],
  ];
  for (const [question, work] of lesson) {
    const result = grade(question, work);
    assert.equal(result.mode, 'radicalSolve');
    assert.deepEqual(result.parts.map((part) => part.id), STAGES);
    assert.equal(result.isCorrect, true, JSON.stringify(question.radicalEquation));
    assert.equal(result.isComplete, true);
    assert.equal(result.score, 1);
  }
  // The unauthored view solves √(x − 2) − 1 = 5.
  assert.deepEqual(RADICAL_SOLVE_DEFAULT.radicand, { m: 1, b: -2 });
  assert.equal(grade(q({ mode: 'radicalSolve' }), SOLVE_38_WORK).isCorrect, true);
});

test('radicalSolve: a final answer typed from a calculator, without the stages, earns only its own part', () => {
  const answerOnly = grade(SOLVE_38, { finalAnswer: '38' });
  assert.equal(answerOnly.isCorrect, false);
  assert.equal(answerOnly.isComplete, false);
  assert.equal(answerOnly.score, 0.2);
  assert.deepEqual(failedStages(answerOnly), ['isolate', 'raise', 'candidates', 'check']);
  // Skipping the check in particular: the candidates are right, but nothing was substituted.
  const unchecked = grade(SOLVE_EXTRANEOUS, { ...SOLVE_EXTRANEOUS_WORK, rows: [] });
  assert.deepEqual(failedStages(unchecked), ['check']);
  assert.equal(unchecked.isComplete, false);
  // Keeping the extraneous candidate is the classic slip: the check and the final answer are wrong.
  const keptBoth = grade(SOLVE_EXTRANEOUS, {
    ...SOLVE_EXTRANEOUS_WORK, rows: [{ left: '4', right: '-4', decision: 'solution' }, { left: '1', right: '1', decision: 'solution' }], finalAnswer: '-7, -2',
  });
  assert.deepEqual(failedStages(keptBoth), ['check', 'final']);
  assert.equal(keptBoth.score, 0.6);
});

test('radicalSolve: each stage reads what a student writes, in any equivalent spelling', () => {
  const spellings = [
    { raised: '(x+3)^2' }, { raised: '9 + 6x + x^2' }, { raised: '(x + 3)(x + 3)' }, { isolated: '3 + x' },
    { candidates: 'x = -2 or x = -7' }, { candidates: '−2, −7' }, { candidates: '-2; -7' },
    { finalAnswer: 'x = -2' }, { finalAnswer: '−2' },
  ];
  for (const change of spellings) {
    // Rows follow the candidates in the order typed.
    const reordered = /^(x = )?[−-]2/.test(change.candidates || '') ? { rows: [...SOLVE_EXTRANEOUS_WORK.rows].reverse() } : {};
    assert.equal(grade(SOLVE_EXTRANEOUS, { ...SOLVE_EXTRANEOUS_WORK, ...change, ...reordered }).isCorrect, true, JSON.stringify(change));
  }
  // Fractions and decimals within 0.01.
  const half = q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 2, b: 0 }, rhs: { m: 0, b: 3 } } });
  const halfWork = { isolated: '3', raised: '9', candidates: '9/2', rows: [{ left: '3', right: '3', decision: 'solution' }], finalAnswer: '4.5' };
  assert.equal(grade(half, halfWork).isCorrect, true);
  // An expression that is not the key, or the whole equation typed in the box, is wrong.
  assert.deepEqual(failedStages(grade(SOLVE_EXTRANEOUS, { ...SOLVE_EXTRANEOUS_WORK, raised: 'x^2 + 9' })), ['raise']);
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, isolated: 'sqrt(y-2)=6' })), ['isolate']);
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, raised: '6' })), ['raise'], 'the isolated value, not yet raised');
  // A sign slip in isolating: subtracting 1 instead of adding it.
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, isolated: '4' })), ['isolate']);
});

test('radicalSolve: the check is judged against the student\'s own candidates', () => {
  // A wrong candidate, checked correctly: √(34 − 2) − 1 ≈ 4.66, not 5.
  const wrongCandidate = grade(SOLVE_38, {
    ...SOLVE_38_WORK, candidates: '34', rows: [{ left: '4.66', right: '5', decision: 'extraneous' }], finalAnswer: '', noRealSolution: true,
  });
  assert.deepEqual(failedStages(wrongCandidate), ['candidates', 'final']);
  // An even root of a negative is not real: x = −10 in √(x + 5) = −3.
  const notReal = q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 1, b: 5 }, rhs: { m: 0, b: -3 } } });
  const notRealRow = { left: 'not real', right: '-3', decision: 'extraneous' };
  assert.equal(grade(notReal, { isolated: '-3', raised: '9', candidates: '-10', rows: [notRealRow], noRealSolution: true }).parts.find((part) => part.id === 'check').isCorrect, true);
  for (const left of ['undefined', 'DNE', 'Not real', 'no real value', 'imaginary']) {
    assert.equal(grade(notReal, { candidates: '-10', rows: [{ ...notRealRow, left }] }).parts.find((part) => part.id === 'check').isCorrect, true, left);
  }
  assert.equal(grade(notReal, { candidates: '-10', rows: [{ ...notRealRow, left: '0' }] }).parts.find((part) => part.id === 'check').isCorrect, false);
  // "Not real" where the root IS real is wrong.
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, rows: [{ left: 'not real', right: '5', decision: 'solution' }] })), ['check']);
  // Each row needs both sides and a decision; a forged decision is no decision.
  const halfRow = grade(SOLVE_38, { ...SOLVE_38_WORK, rows: [{ left: '5', right: '', decision: 'solution' }] });
  assert.equal(halfRow.isComplete, false);
  assert.deepEqual(failedStages(halfRow), ['check']);
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, rows: [{ left: '5', right: '5', decision: 'true' }] })), ['check']);
});

test('radicalSolve: no real solution, and no candidates at all', () => {
  const none = q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 1, b: 5 }, rhs: { m: 0, b: -3 } } });
  const work = { isolated: '-3', raised: '9', candidates: '4', rows: [{ left: '3', right: '-3', decision: 'extraneous' }] };
  assert.equal(grade(none, { ...work, noRealSolution: true }).isCorrect, true);
  assert.equal(grade(none, { ...work, finalAnswer: 'none' }).isCorrect, true, 'the word in the box says the same');
  assert.deepEqual(failedStages(grade(none, { ...work, finalAnswer: '4' })), ['final'], 'the extraneous candidate is not the solution');
  assert.deepEqual(failedStages(grade(none, { ...work, finalAnswer: '4', noRealSolution: true })), ['final'], 'a value and "no real solution" together is no answer');
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, finalAnswer: '', noRealSolution: true })), ['final']);
  // √(x + 1) = x + 5: x² + 9x + 24 = 0 has no real roots, so there is nothing to check.
  const noCandidates = q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 1, b: 1 }, rhs: { m: 1, b: 5 } } });
  const empty = grade(noCandidates, { isolated: 'x + 5', raised: 'x^2 + 10x + 25', candidates: 'no real solutions', rows: [], noRealSolution: true });
  assert.equal(empty.isCorrect, true);
  assert.equal(empty.isComplete, true);
  // "none" where there are candidates is wrong, and leaves the check unearned.
  assert.deepEqual(failedStages(grade(SOLVE_38, { ...SOLVE_38_WORK, candidates: 'none', rows: [] })), ['candidates', 'check']);
});

test('radicalSolve: blank and malformed work is incomplete or wrong, never a crash', () => {
  const blank = grade(SOLVE_38, {});
  assert.equal(blank.graded, true);
  assert.equal(blank.score, 0);
  assert.equal(blank.isComplete, false);
  for (const work of [
    { isolated: ['6'], raised: { v: 36 }, candidates: 38, rows: 'none', finalAnswer: [38], noRealSolution: 'yes' },
    { candidates: 'abc', rows: [null, 3, ['5']] },
    { candidates: '1, 2, 3, 4, 5' },
  ]) {
    const result = grade(SOLVE_38, work);
    assert.equal(result.graded, true, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
  }
  // A typed number is read the same as the text a box holds.
  assert.equal(grade(SOLVE_38, { ...SOLVE_38_WORK, isolated: 6, raised: 36, candidates: 38, finalAnswer: 38 }).isCorrect, true);
  assert.deepEqual(parseRadicalValueList('1, 2, 3, 4, 5'), { kind: 'unreadable', values: [] });
  assert.deepEqual(parseRadicalValueList('4, 4'), { kind: 'values', values: [4] });
  // The work's own field names are student work, not verdict keys the contract strips.
  assert.deepEqual(boundToolWork(SOLVE_EXTRANEOUS_WORK).dropped, []);
});

test('radicalSolve: Pre-Flight reads the equation the view will show', () => {
  const errors = (radicalEquation) => validateToolQuestion({ toolId: TYPE, mode: 'radicalSolve', masteryEvidenceKeys: ['texas:2A.4F'], radicalEquation }).errors;
  assert.deepEqual(errors(SOLVE_38.radicalEquation), []);
  assert.deepEqual(errors(SOLVE_EXTRANEOUS.radicalEquation), []);
  assert.match(errors(undefined).join(' '), /requires radicalEquation/);
  assert.match(errors({ index: 3, radicand: { m: 1, b: 0 }, rhs: { m: 1, b: 0 } }).join(' '), /only under a square root/);
  assert.match(errors({ index: 9, radicand: { m: 1, b: 0 }, rhs: { m: 0, b: 2 } }).join(' '), /index is a whole number from 2 to 8/);
  assert.match(errors({ radicand: { m: 0, b: 1 }, rhs: { m: 0, b: 2 } }).join(' '), /radicand must contain the variable/);
  assert.match(errors({ notation: 'power', variable: 'XY', radicand: { m: 1, b: 0 }, rhs: { m: 0, b: 2 } }).join(' '), /notation.*variable/);
  // A drawn value that is no exact number (a template's √5) is refused.
  assert.match(errors({ radicand: { m: 1, b: 0 }, rhs: { m: 0, b: Math.sqrt(5) } }).join(' '), /numbers must be exact/);
  assert.deepEqual(errors({ radicand: { m: 1, b: 0.25 }, rhs: { m: 0, b: 1.5 } }), []);
  // Numbers a student cannot type exactly are flagged.
  const warnings = validateToolQuestion({ toolId: TYPE, mode: 'radicalSolve', masteryEvidenceKeys: ['texas:2A.4F'], radicalEquation: { radicand: { m: 7, b: 0 }, rhs: { m: 0, b: 2 } } }).warnings;
  assert.match(warnings.join(' '), /not a whole number or a simple fraction/);
  assert.deepEqual(radicalSolveKey({ radicand: { m: 7, b: 0 }, rhs: { m: 0, b: 2 } }).candidates.map((value) => Number(value.toFixed(4))), [0.5714]);
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
  for (const question of [
    q({ factors: 5 }), q({ relation: 5 }), q({ mode: 'rational', denominatorFactors: 'x - 1' }), q({ mode: 'radicalCheck', candidates: 'three' }),
    // A radical equation the staged view cannot solve by hand.
    q({ mode: 'radicalSolve', radicalEquation: 'sqrt(x)=3' }),
    q({ mode: 'radicalSolve', radicalEquation: { index: 3, radicand: { m: 1, b: 0 }, rhs: { m: 1, b: 0 } } }),
    q({ mode: 'radicalSolve', radicalEquation: { index: 1.5, radicand: { m: 1, b: 0 }, rhs: { m: 0, b: 2 } } }),
    q({ mode: 'radicalSolve', radicalEquation: { coefficient: 0, radicand: { m: 1, b: 0 }, rhs: { m: 0, b: 2 } } }),
    q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 0, b: 4 }, rhs: { m: 0, b: 2 } } }),
    q({ mode: 'radicalSolve', radicalEquation: { radicand: { m: 'a', b: 4 }, rhs: { m: 0, b: 2 } } }),
  ]) {
    const result = grade(question, { selected: [0] });
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(result.reason, 'invalid-question');
  }
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const twelveFactors = q({ factors: Array.from({ length: 12 }, (_, index) => ({ root: index - 6, multiplicity: 1 + (index % 2) })), relation: '>' });
  const intervals = buildSignIntervals({ numeratorFactors: twelveFactors.factors, denominatorFactors: [] }, '>').intervals;
  const selected = intervals.map((interval, index) => (interval.included ? index : null)).filter((value) => value !== null).reverse();
  const long = '-12.0000000000000000000000';
  const works = [
    { selected: intervals.map((_, index) => index) }, { selected }, { selected: Array.from({ length: 20 }, (_, index) => `${index - 10}.000000`) },
    {
      isolated: `${long}x + ${long}`, raised: `${long}x^2 + ${long}x + ${long}`, candidates: [long, long, long, long].join(', '),
      rows: Array.from({ length: 4 }, () => ({ left: 'not a real number', right: long, decision: 'extraneous' })), finalAnswer: [long, long, long, long].join(', '), noRealSolution: false,
    },
  ];
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
    [SOLVE_38, q({ mode: 'radicalSolve', radicalEquation: { ...SOLVE_38.radicalEquation, outside: -2 } }), SOLVE_38_WORK],
    [SOLVE_38, q({ mode: 'radicalSolve', radicalEquation: { ...SOLVE_38.radicalEquation, index: 4 } }), SOLVE_38_WORK],
    [SOLVE_EXTRANEOUS, q({ mode: 'radicalSolve', radicalEquation: { ...SOLVE_EXTRANEOUS.radicalEquation, rhs: { m: 1, b: 4 } } }), SOLVE_EXTRANEOUS_WORK],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `${JSON.stringify(question)} control`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `${JSON.stringify(altered)} against an altered key`);
  }
});

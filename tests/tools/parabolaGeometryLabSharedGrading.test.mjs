import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import parabolaGrader from '../../functions/shared/serverGrading/tools/parabolaGeometryLab.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/parabolaGeometryLab.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { matchesNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  geometryFromFocusDirectrix,
  parabolaFeatures,
  pointDistances,
  sampleParabolaPoint,
  standardEquationParts,
} from '../../functions/shared/toolMath/parabolaGeometry/parabolaGeometryMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * PARABOLA GEOMETRY LAB IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every view — and
 * that verdict must be the one the lab's old inline Check reached.
 */

const COMPONENT = 'src/tools/parabolaGeometry/ParabolaGeometryLab.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'parabolaGeometryLab';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(parabolaGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason };
};

const partIds = (result) => result.parts.map((part) => part.id);
const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

// The component's own routing, read from its source: `questionData.mode ||
// '<default>'`, then `if(mode==='<view>') return <...`, else the default.
const componentRouting = (() => {
  const body = region(code, 'export default function ParabolaGeometryLab', '\nfunction ', 'router');
  const fallback = body.match(/const mode\s*=\s*questionData\.mode \|\| '(\w+)';/)?.[1];
  const routed = [...body.matchAll(/if\s*\(mode\s*===\s*'(\w+)'\)\s*return </g)].map((match) => match[1]);
  assert.ok(fallback, 'router reads questionData.mode with a default');
  assert.equal(routed.length, 3, 'router has its three explicit views');
  return { fallback, routed };
})();
const componentMode = (question) => {
  const mode = question.mode || componentRouting.fallback;
  return componentRouting.routed.includes(mode) ? mode : componentRouting.fallback;
};

test('every view the lab routes to is declared shared-server, contract v1, default Features', () => {
  assert.equal(GRADING_MANIFEST.parabolaGeometryLab, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, componentRouting.fallback);
  assert.deepEqual(Object.keys(declaration.modes).sort(), [componentRouting.fallback, ...componentRouting.routed].sort());
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(parabolaGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
  assert.deepEqual([...parabolaGrader.problems], []);
});

test('declared mode resolution reproduces the screen routing, including padded, mis-cased and non-string modes', () => {
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'features' }, { mode: 'equidistance' }, { mode: 'fromGeometry' },
    { mode: 'equation' }, { mode: 'unknownView' }, { mode: ' equation ' }, { mode: 'Equation' }, { mode: 'fromgeometry' },
    { mode: 5 }, { mode: ['equation'] }, { mode: { toString: () => 'equation' } }, { mode: 'constructor' }, { mode: 'toString' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
  // A padded mode the manifest's generic fallback would trim into `equation`
  // is graded as the Features screen the student actually saw.
  const padded = grade(q({ mode: ' equation ' }), { focusX: '1', focusY: '1', directrix: '-3', latus: '8' });
  assert.equal(padded.mode, 'features');
  assert.equal(padded.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

const VIEWS = { features: 'FeatureMode', equidistance: 'Equidistance', fromGeometry: 'FromGeometry', equation: 'EquationMode' };

test('every view grades its Check through the shared grader and reports the same work it submits', () => {
  assert.match(code, /import parabolaGeometryGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/parabolaGeometryLab\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  for (const [mode, name] of Object.entries(VIEWS)) {
    const body = region(code, `function ${name}(`, '\nfunction ', name);
    const check = region(body, 'const check=()=>{', '\n  };', `${name} check`);
    assert.match(body, /const work=\{[^}]+\};/, `${name} builds work at render scope`);
    assert.match(body, /useReportToolWork\(work\);/, `${name} reports live work`);
    assert.match(check, /const result=gradeToolCheck\(parabolaGeometryGrader,questionData,work\);/, `${name} grades through the shared grader`);
    assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \},work,\{mode:'(\w+)',parts:result\.parts\}\);/, `${name} submits the shared verdict, its work and only mode + parts`);
    assert.equal(check.match(/mode:'(\w+)'/)[1], mode, `${name} reports the mode the declaration grades it as`);
    assert.doesNotMatch(check, /checks|matches\w*|===|expected|features\.|distances|spec\./, `${name} computes no verdict of its own`);
  }
});

test('the inline verdict code is gone from the component', () => {
  assert.doesNotMatch(code, /matchesNumericAnswer|pointDistances|geometryFromFocusDirectrix|standardEquationParts/);
  assert.doesNotMatch(code, /isCorrect:\s*checks|checks\.every|coeffCorrect|openCorrect/);
});

/* ------------------------------------------------------------------ */
/* the old inline Check, as a parity oracle                            */
/* ------------------------------------------------------------------ */

// Verbatim from ParabolaGeometryLab.jsx before the shared grader, for
// UI-shaped (string) work. The shared grader must reach the same verdict and
// score on every fixture below.
const legacyCheck = (question, work) => {
  const mode = componentMode(question);
  if (mode === 'equidistance') {
    const spec = { h: Number(question.h ?? 0), k: Number(question.k ?? 0), p: Number(question.p ?? 2), orientation: question.orientation || 'vertical' };
    const point = question.point || sampleParabolaPoint(spec, Number(question.offset ?? 4));
    const distances = pointDistances(spec, point);
    const checks = [matchesNumericAnswer(work.focusDistance, distances.focusDistance, 0.02), matchesNumericAnswer(work.directrixDistance, distances.directrixDistance, 0.02), (work.onCurve === 'yes') === distances.onParabola];
    return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 3 };
  }
  if (mode === 'fromGeometry') {
    const expected = geometryFromFocusDirectrix({ focus: question.focus || [2, 3], directrix: question.directrix || { kind: 'horizontal', value: -1 } });
    const checks = expected ? [matchesNumericAnswer(work.h, expected.h, 0.01), matchesNumericAnswer(work.k, expected.k, 0.01), matchesNumericAnswer(work.p, expected.p, 0.01)] : [false, false, false];
    return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 3 };
  }
  if (mode === 'equation') {
    const spec = { h: Number(question.h ?? -2), k: Number(question.k ?? 1), p: Number(question.p ?? 1.5), orientation: question.orientation || 'vertical' };
    const coeffCorrect = matchesNumericAnswer(work.coefficient, standardEquationParts(spec).coefficient, 0.01);
    const openCorrect = work.opening === parabolaFeatures(spec).opens;
    return { isCorrect: coeffCorrect && openCorrect, score: [coeffCorrect, openCorrect].filter(Boolean).length / 2 };
  }
  const features = parabolaFeatures({ h: Number(question.h ?? 1), k: Number(question.k ?? -1), p: Number(question.p ?? 2), orientation: question.orientation || 'vertical' });
  const checks = [matchesNumericAnswer(work.focusX, features.focus[0], 0.01), matchesNumericAnswer(work.focusY, features.focus[1], 0.01), matchesNumericAnswer(work.directrix, features.directrix.value, 0.01), matchesNumericAnswer(work.latus, features.latusRectumLength, 0.01)];
  return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length };
};

const assertLegacyParity = (question, work, label) => {
  const result = grade(question, work);
  const legacy = legacyCheck(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, legacy.isCorrect, `${label}: isCorrect matches the old Check`);
  assert.equal(result.score, legacy.score, `${label}: score matches the old Check`);
  return result;
};

/* ------------------------------------------------------------------ */
/* features                                                            */
/* ------------------------------------------------------------------ */

const FEATURES = q({ mode: 'features', h: 2, k: -3, p: -1.5 });
const FEATURES_KEY = { focusX: '2', focusY: '-4.5', directrix: '-1.5', latus: '6' };

test('features: correct, fractions and unicode minus, partial credit, incomplete', () => {
  const correct = grade(FEATURES, FEATURES_KEY);
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.equal(correct.score, 1);
  assert.deepEqual(partIds(correct), ['focus-x', 'focus-y', 'directrix', 'latus-rectum']);

  // The lab reads typed numbers with parseNumericAnswer: fractions, U+2212
  // and padding are accepted; the tolerance is 0.01.
  for (const work of [
    { focusX: '4/2', focusY: '−9/2', directrix: '-3/2', latus: '6.0' },
    { focusX: ' 2 ', focusY: '-4.509', directrix: '−1.5', latus: '12/2' },
  ]) assert.equal(assertLegacyParity(FEATURES, work, JSON.stringify(work)).isCorrect, true, JSON.stringify(work));
  assert.deepEqual(failedIds(grade(FEATURES, { ...FEATURES_KEY, focusY: '-4.52' })), ['focus-y']);

  const partial = assertLegacyParity(FEATURES, { ...FEATURES_KEY, directrix: '1.5', latus: '-6' }, 'partial');
  assert.equal(partial.isComplete, true);
  assert.equal(partial.score, 0.5);
  assert.deepEqual(failedIds(partial), ['directrix', 'latus-rectum']);

  const incomplete = assertLegacyParity(FEATURES, { ...FEATURES_KEY, latus: '' }, 'incomplete');
  assert.equal(incomplete.isComplete, false);
  assert.equal(incomplete.isCorrect, false);
  assert.equal(incomplete.score, 0.75, 'an explicit Check on incomplete work is still graded');
  const blank = grade(FEATURES, { focusX: '', focusY: '', directrix: '', latus: '' });
  assert.equal(blank.score, 0);
  assert.equal(blank.isComplete, false);
});

test('features: a horizontal parabola puts the focus and directrix on the x side', () => {
  const horizontal = q({ h: -1, k: 2, p: 3, orientation: 'horizontal' });
  assert.equal(assertLegacyParity(horizontal, { focusX: '2', focusY: '2', directrix: '-4', latus: '12' }, 'horizontal').isCorrect, true);
  assert.equal(grade(horizontal, { focusX: '-1', focusY: '5', directrix: '-1', latus: '12' }).score, 0.25, 'the vertical answers are wrong here');
});

test('features: an unauthored question grades against the lab defaults (vertex (1, −1), p = 2)', () => {
  const result = grade(q({}), { focusX: '1', focusY: '1', directrix: '-3', latus: '8' });
  assert.equal(result.mode, 'features');
  assert.equal(result.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* equidistance                                                        */
/* ------------------------------------------------------------------ */

test('equidistance: an authored point off the curve, with the 0.02 distance tolerance', () => {
  // Vertex (0, 0), p = 1: focus (0, 1), directrix y = −1. P = (3, 4): 3√2 vs 5.
  const question = q({ mode: 'equidistance', h: 0, k: 0, p: 1, point: [3, 4] });
  const correct = assertLegacyParity(question, { focusDistance: '4.243', directrixDistance: '5', onCurve: 'no' }, 'off-curve');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['focus-distance', 'directrix-distance', 'on-parabola']);
  assert.equal(grade(question, { focusDistance: '4.26', directrixDistance: '5.019', onCurve: 'no' }).isCorrect, true, 'within 0.02');
  assert.deepEqual(failedIds(grade(question, { focusDistance: '4.27', directrixDistance: '5', onCurve: 'no' })), ['focus-distance']);
  const wrongDecision = assertLegacyParity(question, { focusDistance: '4.243', directrixDistance: '5', onCurve: 'yes' }, 'decision');
  assert.deepEqual(failedIds(wrongDecision), ['on-parabola']);
  assert.equal(wrongDecision.score, 2 / 3);
});

test('equidistance: the sampled point is on the curve; the default "yes" earns its third, but blank boxes are incomplete', () => {
  // Unauthored: vertex (0, 0), p = 2, P sampled at offset 4 → (4, 2).
  const defaults = q({ mode: 'equidistance' });
  assert.equal(assertLegacyParity(defaults, { focusDistance: '4', directrixDistance: '4', onCurve: 'yes' }, 'defaults').isCorrect, true);
  const untouched = assertLegacyParity(defaults, { focusDistance: '', directrixDistance: '', onCurve: 'yes' }, 'untouched');
  assert.equal(untouched.score, 1 / 3, 'exactly what the lab awarded a blank Check');
  assert.equal(untouched.isComplete, false, 'so a deadline never auto-submits it');
  // An authored offset moves the sampled point: offset 2 → (2, 0.5), distances 2.5.
  assert.equal(grade(q({ mode: 'equidistance', offset: 2 }), { focusDistance: '5/2', directrixDistance: '2.5', onCurve: 'yes' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* fromGeometry                                                        */
/* ------------------------------------------------------------------ */

test('fromGeometry: vertex and signed p from a focus and directrix, both orientations', () => {
  const vertical = q({ mode: 'fromGeometry', focus: [1, 5], directrix: { kind: 'horizontal', value: 1 } });
  const correct = assertLegacyParity(vertical, { h: '1', k: '3', p: '2' }, 'vertical');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['h', 'k', 'p']);
  const signFlip = assertLegacyParity(vertical, { h: '1', k: '3', p: '-2' }, 'sign');
  assert.deepEqual(failedIds(signFlip), ['p']);
  assert.equal(signFlip.score, 2 / 3);

  const horizontal = q({ mode: 'fromGeometry', focus: [-4, 2], directrix: { kind: 'vertical', value: 1 } });
  assert.equal(assertLegacyParity(horizontal, { h: '-3/2', k: '2', p: '−5/2' }, 'horizontal').isCorrect, true);

  // Unauthored: focus (2, 3), directrix y = −1 → vertex (2, 1), p = 2.
  assert.equal(grade(q({ mode: 'fromGeometry' }), { h: '2', k: '1', p: '2' }).isCorrect, true);
});

test('fromGeometry: a focus on its own directrix has no parabola and every box is wrong, as on screen', () => {
  const degenerate = q({ mode: 'fromGeometry', focus: [2, 3], directrix: { kind: 'horizontal', value: 3 } });
  assert.equal(geometryFromFocusDirectrix(degenerate), null);
  const result = assertLegacyParity(degenerate, { h: '2', k: '3', p: '0' }, 'degenerate');
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  assert.equal(result.isComplete, true);
});

/* ------------------------------------------------------------------ */
/* equation                                                            */
/* ------------------------------------------------------------------ */

test('equation: 4p and the opening direction, half credit each', () => {
  const left = q({ mode: 'equation', h: 1, k: 0, p: -0.75, orientation: 'horizontal' });
  const correct = assertLegacyParity(left, { coefficient: '-3', opening: 'left' }, 'left');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['coefficient', 'opening']);
  assert.equal(grade(left, { coefficient: '−12/4', opening: 'left' }).isCorrect, true);
  const half = assertLegacyParity(left, { coefficient: '-3', opening: 'down' }, 'half');
  assert.deepEqual(failedIds(half), ['opening']);
  assert.equal(half.score, 0.5);

  // Unauthored: vertex (−2, 1), p = 1.5 → 4p = 6, opens up. The select's
  // default 'up' is right here, exactly as on screen.
  const defaults = q({ mode: 'equation' });
  assert.equal(grade(defaults, { coefficient: '6', opening: 'up' }).isCorrect, true);
  const untouched = assertLegacyParity(defaults, { coefficient: '', opening: 'up' }, 'untouched');
  assert.equal(untouched.score, 0.5);
  assert.equal(untouched.isComplete, false);
});

/* ------------------------------------------------------------------ */
/* tampering, malformed work, bounds                                   */
/* ------------------------------------------------------------------ */

test('injected verdicts and keys are dropped and never change the verdict', () => {
  const tampered = { focusX: '0', focusY: '0', directrix: '0', latus: '0', isCorrect: true, score: 1, correct: true, expected: { focusX: 2 }, answerKey: FEATURES_KEY, checks: [true, true, true, true] };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'isCorrect', 'score']);
  const result = grade(FEATURES, tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
});

test('wrong types read as blank (or an invalid choice) and never crash the grader', () => {
  const features = grade(FEATURES, { focusX: ['2'], focusY: { value: -4.5 }, directrix: true, latus: null });
  assert.equal(features.graded, true);
  assert.equal(features.isCorrect, false);
  assert.equal(features.isComplete, false);
  assert.equal(features.score, 0);
  // A plain number is what a box would have held as text, and reads the same.
  assert.equal(grade(FEATURES, { focusX: 2, focusY: -4.5, directrix: -1.5, latus: 6 }).isCorrect, true);

  // A select only ever holds one of its options. Anything else is no answer:
  // before, a forged 'maybe' read as "no" and scored the decision.
  const offCurve = q({ mode: 'equidistance', h: 0, k: 0, p: 1, point: [3, 4] });
  const forged = grade(offCurve, { focusDistance: '4.243', directrixDistance: '5', onCurve: 'maybe' });
  assert.deepEqual(failedIds(forged), ['on-parabola']);
  assert.equal(forged.isComplete, false);
  const opening = grade(q({ mode: 'equation' }), { coefficient: '6', opening: ['up'] });
  assert.deepEqual(failedIds(opening), ['opening']);
});

test('non-object, oversize and unrenderable questions are not graded, on either path', () => {
  for (const work of [null, 'focus', 4, ['2', '-4.5', '-1.5', '6']]) {
    const result = grade(FEATURES, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  const oversize = grade(FEATURES, { ...FEATURES_KEY, focusX: '2', notes: Array.from({ length: 40 }, () => '9'.repeat(900)) });
  assert.equal(oversize.graded, false);
  assert.equal(oversize.serverReason, 'oversize-response');
  // p = 0 is not a parabola; the lab cannot render it, and the grader names
  // the question, not the student's work, as the reason.
  for (const question of [q({ p: 0 }), q({ mode: 'equation', p: 'abc' }), q({ mode: 'equidistance', point: { x: 1, y: 2 } })]) {
    const result = grade(question, FEATURES_KEY);
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(result.reason, 'invalid-question');
  }
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const long = '-4.50000000000000000000000000';
  const works = [
    { focusX: long, focusY: long, directrix: long, latus: long },
    { focusDistance: long, directrixDistance: long, onCurve: 'no' },
    { h: long, k: long, p: long },
    { coefficient: long, opening: 'right' },
  ];
  for (const work of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 50);
  }
  assert.equal(grade(FEATURES, { ...FEATURES_KEY, focusY: '-4.50000000000000000000000000' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides                                     */
/* ------------------------------------------------------------------ */

test('correct work fails against a question whose key was altered', () => {
  const cases = [
    [FEATURES, { ...FEATURES, p: 1.5 }, FEATURES_KEY],
    [FEATURES, { ...FEATURES, orientation: 'horizontal' }, FEATURES_KEY],
    [q({ mode: 'equidistance', h: 0, k: 0, p: 1, point: [3, 4] }), q({ mode: 'equidistance', h: 0, k: 0, p: 1, point: [3, 5] }), { focusDistance: '4.243', directrixDistance: '5', onCurve: 'no' }],
    [q({ mode: 'equidistance' }), q({ mode: 'equidistance', offset: 3 }), { focusDistance: '4', directrixDistance: '4', onCurve: 'yes' }],
    [q({ mode: 'fromGeometry', focus: [1, 5], directrix: { kind: 'horizontal', value: 1 } }), q({ mode: 'fromGeometry', focus: [1, 5], directrix: { kind: 'vertical', value: 1 } }), { h: '1', k: '3', p: '2' }],
    [q({ mode: 'equation' }), q({ mode: 'equation', p: -1.5 }), { coefficient: '6', opening: 'up' }],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `${question.mode || 'features'} control`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `${question.mode || 'features'} against an altered key`);
  }
});

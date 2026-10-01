import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import inverseCompositionGrader from '../../functions/shared/serverGrading/tools/inverseCompositionLab.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/inverseCompositionLab.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  composeValue,
  evaluateSpecWithDomain,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabRequiredParts,
  inverseValue,
} from '../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';
import { matchesNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  applyInverseDerivationOperation,
  createLinearInverseDerivation,
  formatInverseDerivationRelation,
  isLinearInverseSolved,
} from '../../functions/shared/toolMath/inverseComposition/inverseDerivationMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * THE INVERSE & COMPOSITION LAB IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every view — and
 * that verdict must be the one the screen's own Check reached before the
 * grader was shared.
 */

const LAB = 'src/tools/inverseComposition/InverseCompositionLab.jsx';
const DERIVATION = 'src/tools/inverseComposition/InverseDerivationLab.jsx';
const ROUTER = 'src/tools/inverseComposition/InverseCompositionLabRouter.jsx';
const labCode = executableSource(fs.readFileSync(LAB, 'utf8'));
const derivationCode = executableSource(fs.readFileSync(DERIVATION, 'utf8'));
const routerCode = executableSource(fs.readFileSync(ROUTER, 'utf8'));

const TYPE = 'inverseCompositionLab';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(inverseCompositionGrader, question, work);
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
const incompleteIds = (result) => result.parts.filter((part) => !part.isComplete).map((part) => part.id);

// The lab's work, exactly the state its inputs hold (blank boxes stay blank).
const labWork = (fields = {}) => ({ x: 2, fogAnswer: '', gofAnswer: '', inverseAnswer: '', restrictionChoice: 'none', ...fields });

// A derivation's work, built by driving the lab's own state machine.
const derive = (f, operations = []) => {
  let state = createLinearInverseDerivation(f);
  for (const [operation, value] of operations) state = applyInverseDerivationOperation(state, operation, value);
  return state;
};
const derivationWork = (state) => ({
  equation: { left: state.left, right: state.right },
  relation: formatInverseDerivationRelation(state),
  steps: state.history?.length || 0,
});

// f(x) = -3x + 9, used where the screens' own work expressions are checked.
const DERIVE_F_FOR_WORK = Object.freeze({ type: 'linear', a: -3, h: 0, k: 9 });

// Unauthored f/g/x: the lab shows f(x) = 2x + 3, g(x) = -x + 4 at x = 2, so
// (f∘g)(2) = f(2) = 7, (g∘f)(2) = g(7) = -3, and f⁻¹(f(2)) = 2.
const DEFAULT_RIGHT = { fogAnswer: '7', gofAnswer: '-3', inverseAnswer: '2' };

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

// The screen's routing, read from its source: the router sends exactly
// `mode === 'deriveInverse'` to the derivation lab, and the lab reads
// `questionData.mode || 'full'`; the parts that reading asks for are the
// shared inverseLabRequiredParts.
const ROUTED = (() => {
  const router = region(routerCode, 'export default function InverseCompositionLabRouter', '\n}', 'router');
  assert.match(router, /if \(props\?\.questionData\?\.mode === 'deriveInverse'\) \{\s*return <InverseDerivationLab \{\.\.\.props\} \/>;/);
  assert.match(router, /return <InverseCompositionLab \{\.\.\.props\} \/>;/);
  assert.match(labCode, /const mode = questionData\.mode \|\| 'full';/);
  return { derivation: 'deriveInverse', labViews: ['composition', 'inverse', 'restriction'], fallback: 'full' };
})();
const componentMode = (question) => {
  if (question?.mode === ROUTED.derivation) return ROUTED.derivation;
  const labMode = question.mode || ROUTED.fallback;
  return ROUTED.labViews.includes(labMode) ? labMode : ROUTED.fallback;
};

test('every view the lab routes to is declared shared-server, contract v1, default full', () => {
  assert.equal(GRADING_MANIFEST.inverseCompositionLab, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, ROUTED.fallback);
  assert.deepEqual(
    Object.keys(declaration.modes).sort(),
    [ROUTED.fallback, ROUTED.derivation, ...ROUTED.labViews].sort(),
  );
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(inverseCompositionGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
  assert.deepEqual([...inverseCompositionGrader.problems], []);
});

test('declared mode resolution reproduces the screen routing, including padded, mis-cased and non-string modes', () => {
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'full' }, { mode: 'composition' }, { mode: 'inverse' },
    { mode: 'restriction' }, { mode: 'deriveInverse' }, { mode: ' deriveInverse ' }, { mode: 'DeriveInverse' },
    { mode: ' composition ' }, { mode: 'Composition' }, { mode: 'banana' }, { mode: 5 }, { mode: ['composition'] },
    { mode: { toString: () => 'deriveInverse' } }, { mode: 'constructor' }, { mode: 'toString' }, { mode: '__proto__' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
  // A padded ' deriveInverse ' renders the LAB (the router compares exactly),
  // and is marked as the full lab — not as a derivation the student never saw.
  const padded = grade(q({ mode: ' deriveInverse ' }), labWork(DEFAULT_RIGHT));
  assert.equal(padded.mode, 'full');
  assert.deepEqual(partIds(padded), ['fog', 'gof', 'inverse']);
});

test('the parts graded for any lab mode are exactly the parts the lab asks for', () => {
  const quadratic = { type: 'quadratic', a: 1, h: 0, k: 0, inverseBranch: 'right' };
  for (const mode of [undefined, '', 'full', 'composition', 'inverse', 'restriction', 'banana', ' composition ', 7]) {
    for (const f of [undefined, quadratic]) {
      const question = q({ mode, ...(f ? { f } : {}) });
      const result = grade(question, labWork());
      assert.deepEqual(partIds(result), inverseLabRequiredParts(question.mode || 'full', inverseLabFunctions(question).f), `mode ${JSON.stringify(mode)}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* the components are wired to the shared grader and nothing else      */
/* ------------------------------------------------------------------ */

const IMPORT_GRADER = /import inverseCompositionGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/inverseCompositionLab\.mjs';/;

test('both screens grade their Check through the shared grader and report the same work they submit', () => {
  for (const [name, code, mode] of [['InverseCompositionLab', labCode, null], ['InverseDerivationLab', derivationCode, 'deriveInverse']]) {
    assert.match(code, IMPORT_GRADER, `${name} imports its shared grader`);
    assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/, `${name} imports gradeToolCheck`);
    assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/, `${name} imports useReportToolWork`);
    const body = region(code, `export default function ${name}(`, '\n  return (', name);
    assert.match(body, /const work = useMemo\(/, `${name} builds its work at render scope`);
    assert.match(body, /useReportToolWork\(work\);/, `${name} reports live work`);
    const check = region(body, 'const check = () => {', '\n  };', `${name} check`);
    assert.match(check, /const result = gradeToolCheck\(inverseCompositionGrader, questionData, work\);/, `${name} grades through the shared grader`);
    assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{[^}]*parts: result\.parts \}\);/, `${name} submits the shared verdict with its work`);
    if (mode) assert.match(check, new RegExp(`mode: '${mode}'`));
    // No verdict of its own and no answer key in the metadata.
    assert.doesNotMatch(check, /expected|matchesNumericAnswer|isLinearInverseSolved|===|0\.4|0\.6|swapped|solved/, `${name} computes no verdict of its own`);
  }
});

test('the inline verdict code and answer-key metadata are gone from the screens', () => {
  assert.doesNotMatch(labCode, /matchesNumericAnswer/, 'the lab no longer compares answers itself');
  assert.doesNotMatch(labCode, /expectedRestriction|requiredParts\s*=|DEFAULT_F|DEFAULT_G/, 'no second copy of the key or the defaults');
  assert.doesNotMatch(labCode, /expected:\s*\{/, 'no answer key rides in the submit metadata');
  assert.doesNotMatch(derivationCode, /expected:\s*\{|linearInverse/, 'no answer key rides in the submit metadata');
  assert.doesNotMatch(derivationCode, /\(swapped \? 0\.4/, 'the 0.4/0.6 weighting lives in the shared grader only');
  // The feedback reads the shared parts (an array), not an object of its own.
  const feedback = region(labCode, 'const feedbackBlock = feedback ?', '})() : null;', 'feedback');
  assert.match(feedback, /Array\.isArray\(feedback\.metadata\?\.parts\)/);
  assert.match(feedback, /parts\.filter\(\(part\) => !part\.isCorrect\)\.map\(\(part\) => part\.id\)/);
});

test('a given input x is the question\'s own on the screen, exactly as the grader reads it', () => {
  assert.match(labCode, /const inputLocked = inverseLabInputLocked\(questionData\);/);
  assert.match(labCode, /const x = inputLocked \? inverseLabInitialX\(questionData\) : draftX;/);
  // and the grader never takes a locked x from the response
  const result = grade(q({ mode: 'composition', x: 2 }), labWork({ x: 0, fogAnswer: '11', gofAnswer: '1' }));
  assert.equal(result.isCorrect, false, 'answers for x = 0 do not pass when the question gives x = 2');
});

/*
 * The work each screen submits, evaluated from the screen's own source.
 *
 * The `work` a component builds is what the grader marks, so it is asserted by
 * what it PRODUCES from the component's state — a derivation's equation, the
 * lab's boxes — not by how it is spelled.
 */
const componentWork = (code, name, stateNames) => {
  const body = region(code, `export default function ${name}(`, '\n  return (', name);
  const start = body.indexOf('const work = useMemo(');
  assert.notEqual(start, -1, `${name} builds its work with useMemo`);
  const arrow = body.indexOf('=>', start);
  const open = body.indexOf('(', arrow);
  let depth = 0;
  let end = -1;
  for (let index = open; index < body.length; index += 1) {
    if (body[index] === '(') depth += 1;
    if (body[index] === ')') depth -= 1;
    if (depth === 0) { end = index; break; }
  }
  assert.notEqual(end, -1, `${name}'s work expression closes`);
  // eslint-disable-next-line no-new-func
  return new Function(...stateNames, `return ${body.slice(open, end + 1)};`);
};

test('the work each screen submits carries exactly the state the grader marks', () => {
  const derivationWorkOf = componentWork(derivationCode, 'InverseDerivationLab', ['derivation', 'currentRelation']);
  const fromScreen = (state) => derivationWorkOf(state, formatInverseDerivationRelation(state));
  const deriveQ = q({ mode: 'deriveInverse', f: DERIVE_F_FOR_WORK });
  const solvedState = derive(DERIVE_F_FOR_WORK, [['swapVariables'], ['subtract', 9], ['divide', -3]]);
  const solvedWork = fromScreen(solvedState);
  assert.deepEqual(boundToolWork(solvedWork).dropped, []);
  assert.equal(grade(deriveQ, solvedWork).isCorrect, true);
  assert.equal(grade(deriveQ, fromScreen(derive(DERIVE_F_FOR_WORK, [['swapVariables']]))).score, 0.4);
  assert.equal(grade(deriveQ, fromScreen(derive(DERIVE_F_FOR_WORK))).score, 0);

  const labWorkOf = componentWork(labCode, 'InverseCompositionLab', ['x', 'fogAnswer', 'gofAnswer', 'inverseAnswer', 'restrictionChoice']);
  // x = 3 chosen by the student: g(3) = 1, f(1) = 5; f(3) = 9, g(9) = -5; f⁻¹(f(3)) = 3.
  const chosen = labWorkOf('3', '5', '-5', '3', 'none');
  assert.deepEqual(boundToolWork(chosen).dropped, []);
  assert.equal(grade(q({ allowInputChange: true }), chosen).isCorrect, true);
  assert.deepEqual(failedIds(grade(q({ allowInputChange: true }), labWorkOf('3', '5', '-5', '', 'none'))), ['inverse']);
  assert.deepEqual(failedIds(grade(q({ allowInputChange: true }), labWorkOf('3', '-5', '5', '3', 'none'))), ['fog', 'gof']);
  const quadratic = q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 1, k: -2, inverseBranch: 'left' }, x: -1 });
  assert.equal(grade(quadratic, labWorkOf(-1, '', '', '-1', 'left')).isCorrect, true);
  assert.deepEqual(failedIds(grade(quadratic, labWorkOf(-1, '', '', '-1', 'right'))), ['restriction']);
});

/* ------------------------------------------------------------------ */
/* composition                                                         */
/* ------------------------------------------------------------------ */

test('composition: right, wrong, partial and equivalent forms', () => {
  const question = q({ mode: 'composition' });
  const right = grade(question, labWork({ fogAnswer: '7', gofAnswer: '-3' }));
  assert.deepEqual({ isCorrect: right.isCorrect, isComplete: right.isComplete, score: right.score }, { isCorrect: true, isComplete: true, score: 1 });
  assert.deepEqual(partIds(right), ['fog', 'gof'], 'only the two compositions are marked — never the hidden inverse or restriction');

  const reversed = grade(question, labWork({ fogAnswer: '-3', gofAnswer: '7' }));
  assert.equal(reversed.isCorrect, false);
  assert.equal(reversed.score, 0);
  assert.deepEqual(failedIds(reversed), ['fog', 'gof']);

  const half = grade(question, labWork({ fogAnswer: '7', gofAnswer: '' }));
  assert.equal(half.isCorrect, false);
  assert.equal(half.isComplete, false);
  assert.equal(half.score, 0.5);
  assert.deepEqual(incompleteIds(half), ['gof']);

  // A blank is never 0: the old response coerced '' to 0, which would credit
  // a blank box whenever the answer was 0.
  const zeroQuestion = q({ mode: 'composition', f: { type: 'linear', a: 1, k: -4 }, g: { type: 'linear', a: 1, k: 0 }, x: 4 });
  assert.equal(grade(zeroQuestion, labWork({ x: 4, fogAnswer: '', gofAnswer: '' })).score, 0);
  assert.equal(grade(zeroQuestion, labWork({ x: 4, fogAnswer: '0', gofAnswer: '0' })).isCorrect, true);

  for (const [fogAnswer, gofAnswer] of [['7.00', '-3.0'], [' 7 ', ' -3 '], ['14/2', '-6/2'], ['7.015', '−3'], ['6.99', '-2.985']]) {
    assert.equal(grade(question, labWork({ fogAnswer, gofAnswer })).isCorrect, true, `${fogAnswer}, ${gofAnswer}`);
  }
  for (const fogAnswer of ['7.03', '6.97', 'seven', '7x']) {
    assert.equal(grade(question, labWork({ fogAnswer, gofAnswer: '-3' })).isCorrect, false, fogAnswer);
  }
});

test('composition: a student-chosen x is graded at that x, and a cleared x box is x = 0 as on screen', () => {
  const question = q({ mode: 'composition', allowInputChange: true, x: 2 });
  // x = 3: g(3) = 1, f(1) = 5; f(3) = 9, g(9) = -5.
  assert.equal(grade(question, labWork({ x: '3', fogAnswer: '5', gofAnswer: '-5' })).isCorrect, true);
  assert.equal(grade(question, labWork({ x: '3', fogAnswer: '7', gofAnswer: '-3' })).isCorrect, false);
  // An unauthored x is also the student's to choose.
  assert.equal(grade(q({ mode: 'composition' }), labWork({ x: '3', fogAnswer: '5', gofAnswer: '-5' })).isCorrect, true);
  // Number('') is 0 on screen: g(0) = 4, f(4) = 11; f(0) = 3, g(3) = 1.
  assert.equal(grade(question, labWork({ x: '', fogAnswer: '11', gofAnswer: '1' })).isCorrect, true);
});

test('composition: a value outside a function\'s domain is never a right answer', () => {
  const question = q({ mode: 'composition', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, g: { type: 'linear', a: 1, h: 0, k: -10 }, x: 2 });
  // g(2) = -8, √(-8) is undefined; f(2) = √2, g(√2) = √2 - 10.
  const result = grade(question, labWork({ fogAnswer: '0', gofAnswer: String(Math.SQRT2 - 10) }));
  assert.deepEqual(failedIds(result), ['fog']);
  assert.equal(result.score, 0.5);
});

/* ------------------------------------------------------------------ */
/* inverse                                                             */
/* ------------------------------------------------------------------ */

test('inverse: f⁻¹(f(x)) gives back the starting x, for each invertible family', () => {
  const cases = [
    [q({ mode: 'inverse' }), '2', '7'],
    [q({ mode: 'inverse', f: { type: 'exponential', a: 1, base: 2, h: 0, k: 0 }, x: 3 }), '3', '8'],
    [q({ mode: 'inverse', f: { type: 'logarithmic', a: 1, base: 10, h: 0, k: 0 }, x: 100 }), '100', '2'],
    [q({ mode: 'inverse', f: { type: 'quadratic', a: 1, h: 0, k: 0, inverseBranch: 'right' }, x: 3 }), '3', '9'],
    [q({ mode: 'inverse', f: { type: 'squareRoot', a: 2, h: 1, k: 0 }, x: 5 }), '5', '4'],
  ];
  for (const [question, right, wrong] of cases) {
    const ok = grade(question, labWork({ x: question.x ?? 2, inverseAnswer: right }));
    assert.equal(ok.isCorrect, true, JSON.stringify(question.f));
    assert.deepEqual(partIds(ok), ['inverse']);
    assert.equal(grade(question, labWork({ x: question.x ?? 2, inverseAnswer: wrong })).isCorrect, false, `${JSON.stringify(question.f)} rejects f(x)`);
  }
  const blank = grade(q({ mode: 'inverse' }), labWork());
  assert.deepEqual({ isCorrect: blank.isCorrect, isComplete: blank.isComplete, score: blank.score }, { isCorrect: false, isComplete: false, score: 0 });
});

test('inverse: a function with no inverse can never be right, and its missing box does not hold work back', () => {
  const question = q({ mode: 'inverse', f: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 2 });
  const result = grade(question, labWork({ inverseAnswer: '2' }));
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  // The screen shows "no inverse function" instead of a box: nothing to fill.
  assert.equal(result.isComplete, true);
  assert.equal(grade(question, labWork()).isComplete, true);
});

test('inverse: an x outside f\'s domain has no f(x) to undo — the box is replaced, never correct, and complete', () => {
  // f(x) = √x is invertible, but x = -4 is outside its domain: f(-4) is
  // undefined, so the screen shows the notice instead of the f⁻¹ box.
  const question = q({ mode: 'inverse', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, x: -4 });
  const blank = grade(question, labWork({ x: -4 }));
  assert.deepEqual({ isCorrect: blank.isCorrect, isComplete: blank.isComplete, score: blank.score }, { isCorrect: false, isComplete: true, score: 0 });
  assert.equal(grade(question, labWork({ x: -4, inverseAnswer: '-4' })).isCorrect, false);
  // Inside the domain the box is back, and a blank holds the work back.
  const inside = q({ mode: 'inverse', f: { type: 'squareRoot', a: 1, h: 0, k: 0 }, x: 4 });
  assert.equal(grade(inside, labWork({ x: 4 })).isComplete, false);
  assert.equal(grade(inside, labWork({ x: 4, inverseAnswer: '4' })).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* restriction                                                         */
/* ------------------------------------------------------------------ */

test('restriction: the branch choice and the inverse are each half the credit', () => {
  // f(x) = (x - 1)² - 2 kept left of its vertex; f(-1) = 2, f⁻¹(2) = -1.
  const left = q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 1, k: -2, inverseBranch: 'left' }, x: -1 });
  const both = grade(left, labWork({ x: -1, restrictionChoice: 'left', inverseAnswer: '-1' }));
  assert.deepEqual({ isCorrect: both.isCorrect, score: both.score }, { isCorrect: true, score: 1 });
  assert.deepEqual(partIds(both), ['restriction', 'inverse']);
  const wrongSide = grade(left, labWork({ x: -1, restrictionChoice: 'right', inverseAnswer: '-1' }));
  assert.equal(wrongSide.score, 0.5);
  assert.deepEqual(failedIds(wrongSide), ['restriction']);

  // A one-sided domain names the branch too.
  const right = q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 2, k: 0, domain: { min: 2 } }, x: 4 });
  assert.equal(grade(right, labWork({ x: 4, restrictionChoice: 'right', inverseAnswer: '4' })).isCorrect, true);
  assert.equal(grade(right, labWork({ x: 4, restrictionChoice: 'required', inverseAnswer: '4' })).score, 0.5);

  // No branch declared: 'required' is right, but no inverse exists to undo f.
  const unbranched = q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 0, k: 0 }, x: 2 });
  const best = grade(unbranched, labWork({ restrictionChoice: 'required', inverseAnswer: '2' }));
  assert.deepEqual({ isCorrect: best.isCorrect, score: best.score }, { isCorrect: false, score: 0.5 });

  // A non-quadratic needs no restriction: the hidden select's 'none' stands.
  const linear = grade(q({ mode: 'restriction' }), labWork({ inverseAnswer: '2' }));
  assert.equal(linear.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* full (and every unknown mode)                                       */
/* ------------------------------------------------------------------ */

test('full: every relationship, with the restriction only for a quadratic', () => {
  const defaults = grade(q(), labWork(DEFAULT_RIGHT));
  assert.deepEqual({ isCorrect: defaults.isCorrect, isComplete: defaults.isComplete, score: defaults.score, mode: defaults.mode }, { isCorrect: true, isComplete: true, score: 1, mode: 'full' });
  assert.deepEqual(partIds(defaults), ['fog', 'gof', 'inverse']);

  const twoOfThree = grade(q(), labWork({ ...DEFAULT_RIGHT, inverseAnswer: '7' }));
  assert.equal(twoOfThree.score, 2 / 3);
  assert.deepEqual(failedIds(twoOfThree), ['inverse']);

  // f(x) = (x - 1)² - 2, left branch, x = -1 with the default g:
  // g(-1) = 5, f(5) = 14; f(-1) = 2, g(2) = 2; f⁻¹(2) = -1.
  const quadratic = q({ f: { type: 'quadratic', a: 1, h: 1, k: -2, inverseBranch: 'left' }, x: -1 });
  const all = grade(quadratic, labWork({ x: -1, fogAnswer: '14', gofAnswer: '2', inverseAnswer: '-1', restrictionChoice: 'left' }));
  assert.equal(all.isCorrect, true);
  assert.deepEqual(partIds(all), ['fog', 'gof', 'inverse', 'restriction']);
  assert.equal(grade(quadratic, labWork({ x: -1, fogAnswer: '14', gofAnswer: '2', inverseAnswer: '-1', restrictionChoice: 'none' })).score, 0.75);
});

test('an unknown mode is marked as the full lab, and the composition boxes it hides do not hold work back', () => {
  const question = q({ mode: 'banana' });
  const result = grade(question, labWork({ inverseAnswer: '2' }));
  assert.equal(result.mode, 'full');
  assert.deepEqual(partIds(result), ['fog', 'gof', 'inverse'], 'the screen marks the full set');
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 1 / 3);
  assert.equal(result.isComplete, true, 'the hidden composition boxes are not inputs the student could fill');
});

/* ------------------------------------------------------------------ */
/* derivation                                                          */
/* ------------------------------------------------------------------ */

const DERIVE_F = { type: 'linear', a: -3, h: 0, k: 9 };
const deriveQuestion = (fields = {}) => q({ mode: 'deriveInverse', f: DERIVE_F, ...fields });

test('deriveInverse: swap then isolate y is complete and correct, by any balanced route', () => {
  const routes = [
    [['swapVariables'], ['subtract', 9], ['divide', -3]],
    [['swapVariables'], ['divide', -3], ['add', 3]],
    [['swapVariables'], ['multiply', -1 / 3], ['add', 3]],
    [['swapVariables'], ['add', 1], ['subtract', 10], ['multiply', 2], ['divide', -6]],
    [['swapVariables'], ['add', 5], ['undo'], ['subtract', 9], ['divide', -3]],
  ];
  for (const route of routes) {
    const state = derive(DERIVE_F, route);
    assert.equal(isLinearInverseSolved(state), true, 'the lab itself says solved');
    const result = grade(deriveQuestion(), derivationWork(state));
    assert.deepEqual(
      { isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score, mode: result.mode },
      { isCorrect: true, isComplete: true, score: 1, mode: 'deriveInverse' },
      JSON.stringify(route),
    );
    assert.deepEqual(partIds(result), ['swapped', 'isolated']);
  }
});

test('deriveInverse: 0.4 for the swap, 0.6 for isolating y, nothing before the swap', () => {
  const untouched = grade(deriveQuestion(), derivationWork(derive(DERIVE_F)));
  assert.deepEqual({ isCorrect: untouched.isCorrect, isComplete: untouched.isComplete, score: untouched.score }, { isCorrect: false, isComplete: false, score: 0 });

  const swappedOnly = grade(deriveQuestion(), derivationWork(derive(DERIVE_F, [['swapVariables']])));
  assert.deepEqual({ isCorrect: swappedOnly.isCorrect, isComplete: swappedOnly.isComplete, score: swappedOnly.score }, { isCorrect: false, isComplete: false, score: 0.4 });
  assert.deepEqual(failedIds(swappedOnly), ['isolated']);
  // The recorded parts carry the same 2:3 weighting as the score.
  assert.deepEqual(swappedOnly.parts.map((part) => part.weight), [2, 3]);

  const working = grade(deriveQuestion(), derivationWork(derive(DERIVE_F, [['swapVariables'], ['subtract', 9]])));
  assert.equal(working.score, 0.4);

  const undoneToStart = grade(deriveQuestion(), derivationWork(derive(DERIVE_F, [['swapVariables'], ['undo']])));
  assert.equal(undoneToStart.score, 0);
});

test('deriveInverse: unauthored f is the lab\'s default 2x + 3', () => {
  const state = derive({ type: 'linear', a: 2, h: 0, k: 3 }, [['swapVariables'], ['subtract', 3], ['divide', 2]]);
  assert.equal(grade(q({ mode: 'deriveInverse' }), derivationWork(state)).isCorrect, true);
});

test('deriveInverse: a "solved" equation that is not this f\'s inverse earns only the swap', () => {
  // f⁻¹(x) = -x/3 + 3. A forged equation claiming x/3 + 3 = y has y isolated
  // and the post-swap shape, but it is not the inverse.
  const forged = { equation: { left: { x: 1 / 3, y: 0, c: 3 }, right: { x: 0, y: 1, c: 0 } } };
  const result = grade(deriveQuestion(), forged);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0.4);
  // y IS isolated, so the derivation is finished — finished and wrong.
  assert.equal(result.isComplete, true);
  assert.deepEqual(result.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['swapped', true, true], ['isolated', true, false]]);
  // The bare "x = y" a forger would try for every f is not the inverse of -3x + 9.
  assert.equal(grade(deriveQuestion(), { equation: { left: { x: 1, y: 0, c: 0 }, right: { x: 0, y: 1, c: 0 } } }).isCorrect, false);
  // An equation in the pre-swap shape (y alone on the LEFT) is not a swap.
  const preSwap = { equation: { left: { x: 0, y: 1, c: 0 }, right: { x: -1 / 3, y: 0, c: 3 } } };
  assert.equal(grade(deriveQuestion(), preSwap).score, 0);
});

test('deriveInverse: the swap is read from both sides of the equation, as only the lab can write it', () => {
  // After the swap the lab's equation has no y on the left AND no x on the
  // right, and no balanced move ever puts either back. An equation with only
  // one of the two is not one the lab wrote, and is not a swap.
  const swapped = derivationWork(derive(DERIVE_F, [['swapVariables']]));
  assert.deepEqual([swapped.equation.left.y, swapped.equation.right.x], [0, 0]);
  assert.equal(grade(deriveQuestion(), swapped).score, 0.4);
  const xStillRight = { equation: { left: { x: 1, y: 0, c: 0 }, right: { x: 2, y: -3, c: 9 } } };
  const yStillLeft = { equation: { left: { x: 1, y: 2, c: 0 }, right: { x: 0, y: -3, c: 9 } } };
  for (const work of [xStillRight, yStillLeft]) {
    const result = grade(deriveQuestion(), work);
    assert.deepEqual({ isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score }, { isCorrect: false, isComplete: false, score: 0 }, JSON.stringify(work));
  }
});

test('deriveInverse: an isolated equation a hair off the inverse is not the inverse; floating-point dust is', () => {
  // f(x) = -3x + 9, f⁻¹(x) = -x/3 + 3.
  const isolated = (slope, intercept) => ({ equation: { left: { x: slope, y: 0, c: intercept }, right: { x: 0, y: 1, c: 0 } } });
  assert.equal(grade(deriveQuestion(), isolated(-1 / 3, 3)).isCorrect, true);
  assert.equal(grade(deriveQuestion(), isolated(-1 / 3 + 1e-12, 3 - 1e-12)).isCorrect, true, 'arithmetic dust');
  for (const [slope, intercept, why] of [[-0.333, 3, 'a rounded slope'], [-1 / 3 + 1e-4, 3, 'a slope 1e-4 off'], [-1 / 3, 3.001, 'an intercept 0.001 off'], [-1 / 3, 3 + 1e-4, 'an intercept 1e-4 off']]) {
    const result = grade(deriveQuestion(), isolated(slope, intercept));
    assert.deepEqual({ isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score }, { isCorrect: false, isComplete: true, score: 0.4 }, why);
  }
});

test('deriveInverse: a derivation equation collapsed by rounding is no longer accepted as the inverse (fixed)', () => {
  // BEHAVIOUR CHANGE. Dividing by 2e10 rounds every coefficient but one to 0,
  // and multiplying back leaves "0 = y". The lab's own state machine calls
  // that solved (f⁻¹(x) = 0 for f(x) = 100x + 3), and the old Check marked it
  // correct. It is not f's inverse, so it now earns only the swap.
  const f = { type: 'linear', a: 100, h: 0, k: 3 };
  const state = derive(f, [['swapVariables'], ['divide', 2e10], ['multiply', 2e8]]);
  assert.equal(formatInverseDerivationRelation(state), '0 = y');
  assert.equal(isLinearInverseSolved(state), true, 'the state machine itself still calls it solved');
  const result = grade(q({ mode: 'deriveInverse', f }), derivationWork(state));
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0.4);
});

test('deriveInverse: rounding dust scaled up by 1/a is still the inverse; an equation rounding broke is not (fixed)', () => {
  // f(x) = 0.000001(x - 1): its inverse is y = 1000000x + 1. Adding 5e-10 to
  // both sides writes 0 on the left (|5e-10| is dust to the lab's clean) and
  // keeps it on the right; dividing by 1e-6 then scales that dust to 5e-4.
  // The lab calls the result solved, and it is f's inverse to within a
  // millionth of its own size — so it stays correct.
  const tiny = { type: 'linear', a: 1e-6, h: 1, k: 0 };
  const dusty = derive(tiny, [['swapVariables'], ['add', 5e-10], ['add', 9.995e-7], ['divide', 1e-6]]);
  assert.equal(isLinearInverseSolved(dusty), true);
  assert.equal(formatInverseDerivationRelation(dusty), '1000000x + 0.9995 = y');
  assert.equal(grade(q({ mode: 'deriveInverse', f: tiny }), derivationWork(dusty)).isCorrect, true);

  // BEHAVIOUR CHANGE. f(x) = 0.5x + 0.1, inverse y = 2x - 0.2. Dividing by 1e7
  // and adding 1e-10 to both sides rounds the addition away on one side only,
  // so the equation stops being x = f(y); the lab's state machine still calls
  // "2x - 0.202 = y" solved and the old Check marked it correct. It is not
  // f's inverse, so it now earns only the swap (and is a finished derivation).
  const f = { type: 'linear', a: 0.5, h: 0, k: 0.1 };
  const broken = derive(f, [['swapVariables'], ['divide', 1e7], ['add', 1e-10], ['divide', 1 / 7], ['subtract', 7.07e-8], ['divide', 3.5e-7]]);
  assert.equal(isLinearInverseSolved(broken), true);
  assert.equal(formatInverseDerivationRelation(broken), '2x - 0.202 = y');
  const result = grade(q({ mode: 'deriveInverse', f }), derivationWork(broken));
  assert.deepEqual({ isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score }, { isCorrect: false, isComplete: true, score: 0.4 });
});

test('deriveInverse: huge coefficients survive the trip to the server', () => {
  const state = derive(DERIVE_F, [['swapVariables'], ['multiply', 1e300], ['multiply', 1e300]]);
  assert.equal(state.left.x, Infinity);
  const result = grade(deriveQuestion(), derivationWork(state));
  assert.equal(result.score, 0.4);
});

test('deriveInverse: a question whose f cannot be derived is refused, not marked wrong', () => {
  const unsupported = [
    { type: 'quadratic', a: 1, h: 0, k: 0 },
    { type: 'linear', a: 0, h: 0, k: 3 },
    { type: 'linear', a: 'abc' },
    { type: 'linear', a: 2, h: Infinity },
    { a: 2, k: 3 },
  ];
  for (const f of unsupported) {
    assert.throws(() => createLinearInverseDerivation(f), undefined, 'the lab cannot open on it');
    const result = grade(deriveQuestion({ f }), derivationWork(derive(DERIVE_F, [['swapVariables']])));
    assert.equal(result.graded, false, JSON.stringify(f));
    assert.match(result.reason, /^unsupported-question/);
  }
  // …and the declaration agrees with the lab on every supported shape.
  for (const f of [undefined, DERIVE_F, { type: 'linear' }, { type: 'linear', a: '2', h: '1', k: '-4' }, { type: 'linear', a: 1e-8 }]) {
    assert.doesNotThrow(() => createLinearInverseDerivation(f || { type: 'linear', a: 2, h: 0, k: 3 }));
    assert.equal(inverseCompositionGrader.support(deriveQuestion({ f })).supported, true, JSON.stringify(f));
  }
});

/* ------------------------------------------------------------------ */
/* the shared verdict IS the screen's pre-refactor verdict             */
/* ------------------------------------------------------------------ */

/*
 * A frozen copy of InverseCompositionLab.jsx's Check before the grader was
 * shared — the oracle the shared grader must agree with. It is NOT a second
 * definition of correctness the product uses; it exists so a change to the
 * shared grader's semantics shows up here as a decision, not as drift.
 */
const legacyLabCheck = (questionData, { x, fogAnswer, gofAnswer, inverseAnswer, restrictionChoice }) => {
  const f = questionData.f || { type: 'linear', a: 2, h: 0, k: 3 };
  const g = questionData.g || { type: 'linear', a: -1, h: 0, k: 4 };
  const mode = questionData.mode || 'full';
  const canInvert = hasFunctionalInverse(f);
  const fx = evaluateSpecWithDomain(f, Number(x));
  const fog = composeValue(f, g, Number(x));
  const gof = composeValue(g, f, Number(x));
  const inverseAtFx = canInvert ? inverseValue(f, fx) : Number.NaN;
  const expectedRestriction = (() => {
    if (f.type !== 'quadratic') return 'none';
    const h = Number(f.h ?? 0);
    if (f.inverseBranch === 'left' || Number(f.domain?.max) === h) return 'left';
    if (f.inverseBranch === 'right' || Number(f.domain?.min) === h) return 'right';
    return 'required';
  })();
  const requiredParts = mode === 'composition' ? ['fog', 'gof']
    : mode === 'inverse' ? ['inverse']
      : mode === 'restriction' ? ['restriction', 'inverse']
        : ['fog', 'gof', 'inverse', ...(f.type === 'quadratic' ? ['restriction'] : [])];
  const results = {
    fog: Number.isFinite(fog) && matchesNumericAnswer(fogAnswer, fog, 0.02),
    gof: Number.isFinite(gof) && matchesNumericAnswer(gofAnswer, gof, 0.02),
    inverse: canInvert && Number.isFinite(inverseAtFx) && matchesNumericAnswer(inverseAnswer, Number(x), 0.02),
    restriction: restrictionChoice === expectedRestriction,
  };
  const scored = requiredParts.map((part) => results[part]);
  const score = scored.filter(Boolean).length / scored.length;
  return { isCorrect: score === 1, score, missed: requiredParts.filter((part) => !results[part]), fog, gof };
};

// A deterministic generator, so the grid is the same on every run.
const seeded = (seed) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

test('across a grid of questions and answers, the shared grader reaches the screen\'s own verdict', () => {
  const random = seeded(20261001);
  const pick = (values) => values[Math.floor(random() * values.length)];
  const spec = () => {
    const f = { type: pick(['linear', 'linear', 'quadratic', 'exponential', 'logarithmic', 'squareRoot', 'absolute', undefined]), a: pick([1, 2, -1, 0.5, -3, 0]), h: pick([0, 1, -2, '2', undefined]), k: pick([0, 3, -4, undefined]) };
    if (random() < 0.3) f.base = pick([2, 3, 0.5, 10]);
    if (f.type === 'quadratic') {
      const r = random();
      if (r < 0.25) f.inverseBranch = 'left';
      else if (r < 0.5) f.inverseBranch = 'right';
      else if (r < 0.65) f.domain = { min: f.h ?? 0 };
      else if (r < 0.8) f.domain = { max: f.h ?? 0 };
    }
    return f;
  };
  let correct = 0;
  for (let i = 0; i < 3000; i += 1) {
    const question = q({ mode: pick([undefined, 'full', 'composition', 'inverse', 'restriction', 'banana', '', ' composition ']) });
    if (random() < 0.85) question.f = spec();
    if (random() < 0.8) question.g = spec();
    if (random() < 0.6) question.x = pick([2, 0, -1, 3, 1.5, '4', null]);
    if (random() < 0.3) question.allowInputChange = true;
    const locked = question.x !== undefined && question.allowInputChange !== true;
    const x = locked ? (question.x ?? 2) : pick([question.x ?? 2, '3', '', '-2', '0.5', 5]);
    const truth = legacyLabCheck(question, { x, fogAnswer: '', gofAnswer: '', inverseAnswer: '', restrictionChoice: 'none' });
    const answer = (value) => (random() < 0.5 && Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : pick(['', '0', '1', '7', '-3', '7/2', ' 2 ', 'abc']));
    const work = {
      x,
      fogAnswer: answer(truth.fog),
      gofAnswer: answer(truth.gof),
      inverseAnswer: random() < 0.5 ? String(Number(x)) : answer(Number.NaN),
      restrictionChoice: pick(['none', 'left', 'right', 'required']),
    };
    const legacy = legacyLabCheck(question, work);
    const shared = grade(question, work);
    assert.equal(shared.isCorrect, legacy.isCorrect, JSON.stringify({ question, work }));
    assert.equal(shared.score, legacy.isCorrect ? 1 : legacy.score, JSON.stringify({ question, work }));
    assert.deepEqual(failedIds(shared), legacy.missed, JSON.stringify({ question, work }));
    if (shared.isCorrect) correct += 1;
  }
  assert.ok(correct > 100, `the grid exercises correct work too (${correct})`);
});

test('across random balanced derivations, the shared grader reaches the lab\'s own verdict', () => {
  const random = seeded(4242);
  const pick = (values) => values[Math.floor(random() * values.length)];
  let solvedCount = 0;
  for (let i = 0; i < 1500; i += 1) {
    const f = { type: 'linear', a: pick([2, -3, 0.5, 1, -1, 7]), h: pick([0, 1, -2, undefined]), k: pick([0, 3, 9, -4, undefined]) };
    let state = createLinearInverseDerivation(f);
    for (let step = Math.floor(random() * 8); step > 0; step -= 1) {
      const operation = pick(['swapVariables', 'add', 'subtract', 'multiply', 'divide', 'undo', 'solve']);
      try {
        if (operation === 'solve' && state.phase !== 'original' && !isLinearInverseSolved(state)) {
          state = applyInverseDerivationOperation(state, 'subtract', state.right.c);
          state = applyInverseDerivationOperation(state, 'divide', state.right.y);
        } else if (operation !== 'solve') {
          state = applyInverseDerivationOperation(state, operation, pick([1, 2, -3, 0.5, 3, 7, 1 / 3, 0.1]));
        }
      } catch { /* the lab refuses the move and keeps its state */ }
    }
    const swapped = state.phase !== 'original';
    const solved = isLinearInverseSolved(state);
    const result = grade(q({ mode: 'deriveInverse', f }), derivationWork(state));
    assert.equal(result.isCorrect, solved, formatInverseDerivationRelation(state));
    assert.equal(result.score, solved ? 1 : (swapped ? 0.4 : 0), formatInverseDerivationRelation(state));
    if (solved) solvedCount += 1;
  }
  assert.ok(solvedCount > 50, `the routes reach solved derivations too (${solvedCount})`);
});

/* ------------------------------------------------------------------ */
/* tampered and malformed work                                         */
/* ------------------------------------------------------------------ */

test('injected verdicts and answer keys are dropped and change nothing', () => {
  const wrong = labWork({ fogAnswer: '1', gofAnswer: '1' });
  const injected = { ...wrong, isCorrect: true, score: 1, correct: true, expected: { fog: 1, gof: 1 }, checks: [true, true], answerKey: { fog: '1' } };
  const clean = grade(q({ mode: 'composition' }), wrong);
  const tampered = grade(q({ mode: 'composition' }), injected);
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'isCorrect', 'score']);
  assert.equal(tampered.isCorrect, false);
  assert.deepEqual({ ...tampered, toolResponse: null }, { ...clean, toolResponse: null });

  const derivationTampered = { ...derivationWork(derive(DERIVE_F, [['swapVariables']])), isCorrect: true, score: 1, solution: { slope: -1 / 3 } };
  assert.equal(grade(deriveQuestion(), derivationTampered).score, 0.4);
});

test('wrong types are blank, unknown choices are no choice, and non-object work is not graded', () => {
  const typed = grade(q({ mode: 'composition' }), labWork({ fogAnswer: ['7'], gofAnswer: { value: '-3' } }));
  assert.deepEqual({ isCorrect: typed.isCorrect, isComplete: typed.isComplete, score: typed.score }, { isCorrect: false, isComplete: false, score: 0 });
  // A number is what a box would hold as text.
  assert.equal(grade(q({ mode: 'composition' }), labWork({ fogAnswer: 7, gofAnswer: -3 })).isCorrect, true);

  const choice = grade(q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 0, k: 0, inverseBranch: 'left' }, x: -2 }), labWork({ x: -2, inverseAnswer: '-2', restrictionChoice: 'LEFT' }));
  assert.deepEqual(failedIds(choice), ['restriction']);
  assert.deepEqual(incompleteIds(choice), ['restriction']);

  const missing = grade(q({ mode: 'composition', allowInputChange: true }), { fogAnswer: '7', gofAnswer: '-3' });
  assert.equal(missing.isCorrect, false, 'an unlocked lab with no x in the work has no input to grade at');
  // An x that is not what a box holds is no input either (Number([]) would be 0).
  for (const x of [[], [2], { value: 2 }, true, null]) {
    const result = grade(q({ mode: 'composition', allowInputChange: true }), labWork({ x, fogAnswer: '7', gofAnswer: '-3' }));
    assert.equal(result.isCorrect, false, JSON.stringify(x));
    assert.equal(result.score, 0, JSON.stringify(x));
  }
  // …while a locked lab never reads the response's x at all.
  assert.equal(grade(q({ mode: 'composition', x: 2 }), labWork({ x: [], fogAnswer: '7', gofAnswer: '-3' })).isCorrect, true);

  for (const work of [null, [], 'fog=7', 42, true]) {
    const result = grade(q({ mode: 'composition' }), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
  }
  for (const equation of [null, 'x=y', [], { left: { x: 1, y: 0, c: 0 } }, { left: null, right: null }, { left: { x: 'a', y: 'b', c: 'c' }, right: { x: 0, y: 1, c: 0 } }]) {
    const result = grade(deriveQuestion(), { equation });
    assert.equal(result.graded, true);
    assert.equal(result.score, 0, JSON.stringify(equation));
  }
});

test('oversize work is not graded, on either side', () => {
  const work = { ...labWork(DEFAULT_RIGHT), padding: Array.from({ length: 40 }, () => 'x'.repeat(900)) };
  const result = grade(q(), work);
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'oversize-response');
  assert.equal(result.isCorrect, false);
});

test('a response for another tool, or from a newer contract, is refused by the server', () => {
  const browser = gradeToolCheck(inverseCompositionGrader, q(), labWork(DEFAULT_RIGHT));
  assert.equal(browser.isCorrect, true);
  const otherTool = gradeServerResponse({ question: q(), response: { ...browser.toolResponse, toolId: 'complexPlaneLab' } });
  assert.equal(otherTool.reason, 'response-tool-mismatch');
  const newer = gradeServerResponse({ question: q(), response: { ...browser.toolResponse, contractVersion: 2 } });
  assert.equal(newer.reason, 'response-contract-newer-than-server');
});

/* ------------------------------------------------------------------ */
/* discrimination and bounds                                           */
/* ------------------------------------------------------------------ */

test('right work against an altered key is wrong', () => {
  const work = labWork(DEFAULT_RIGHT);
  assert.equal(grade(q(), work).isCorrect, true);
  assert.equal(grade(q({ g: { type: 'linear', a: -1, h: 0, k: 5 } }), work).isCorrect, false, 'a different g');
  assert.equal(grade(q({ f: { type: 'linear', a: 2, h: 0, k: 4 } }), work).isCorrect, false, 'a different f');
  assert.equal(grade(q({ x: 3 }), work).isCorrect, false, 'a different given x');
  const restricted = q({ mode: 'restriction', f: { type: 'quadratic', a: 1, h: 1, k: -2, inverseBranch: 'left' }, x: -1 });
  const restrictionWork = labWork({ x: -1, restrictionChoice: 'left', inverseAnswer: '-1' });
  assert.equal(grade(restricted, restrictionWork).isCorrect, true);
  assert.equal(grade({ ...restricted, f: { ...restricted.f, inverseBranch: 'right' } }, restrictionWork).isCorrect, false, 'the other branch');

  // A derivation for one f is not a derivation for another — including a
  // draft left over from before a teacher edited f.
  const solved = derivationWork(derive(DERIVE_F, [['swapVariables'], ['subtract', 9], ['divide', -3]]));
  assert.equal(grade(deriveQuestion(), solved).isCorrect, true);
  const otherF = grade(deriveQuestion({ f: { type: 'linear', a: -3, h: 0, k: 8 } }), solved);
  assert.equal(otherF.isCorrect, false);
  assert.equal(otherF.score, 0.4);
});

test('realistic maximal work is small, carries nothing that gets dropped, and fits the contract', () => {
  const lab = labWork({ x: '-12345.678', fogAnswer: '-123456789.123', gofAnswer: '987654321/7', inverseAnswer: '-12345.678', restrictionChoice: 'required' });
  const longDerivation = derive(DERIVE_F, [['swapVariables'], ...Array.from({ length: 299 }, (_, i) => [i % 2 ? 'add' : 'multiply', 1 / 7 + i])]);
  const derivation = derivationWork(longDerivation);
  for (const work of [lab, derivation]) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 4);
  }
  // Long derivations are graded on their current equation, never their length.
  assert.equal(grade(deriveQuestion(), derivation).score, 0.4);
});

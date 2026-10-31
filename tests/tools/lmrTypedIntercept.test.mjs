/*
 * THE TYPED INTERCEPT, WITH THE SOLVE AS THE WAY AFTER A MISS (TL27).
 *
 * The DOL3 walkthrough counted about ten actions per intercept on the
 * Multiple Representations board (F-HEAVY-STEPS): choose the method, say
 * which variable is 0, then divide, cancel, simplify, type the pair, Check.
 * Once the student has said which variable is 0, practice now takes the
 * intercept typed straight in. A wrong one closes that way: the substituted
 * equation is solved step by step. Where outcomes are withheld nothing
 * changes — the solve is the only way, on the board and on the server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  appendLmrProcessEntry,
  emptyProcessLog,
  evaluateLmrEntry,
  lmrProcessBinding,
  lmrProcessEnvironment,
  resolveLmrProcess,
} from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { decideProcessCheck, processEntryFor } from '../../src/tools/representationBridge/process/processDraft.js';
import { region } from '../platform/helpers/sourceContract.mjs';

const board = (extra = {}) => ({
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  interactionMode: 'process',
  source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  feedbackTiming: 'guided',
  requiredCards: ['xIntercept', 'yIntercept'],
  ...extra,
});
const STANDARD = board();
const SUBMIT_ONLY = board({ feedbackTiming: 'submitOnly' });

const mark = (question, target, ev) => evaluateLmrEntry(
  { id: 't', strategy: 'substituteZero', from: 'given', target, at: 1, tries: 1, ev },
  { facts: {} },
  lmrProcessEnvironment(question),
);
const codesOf = (evaluated) => [...new Set([
  ...Object.values(evaluated.fields || {}).map((field) => field?.code).filter(Boolean),
  ...(evaluated.problems || []),
])];
const logOf = (question, entries) => entries.reduce((log, entry, index) => appendLmrProcessEntry(
  question,
  log,
  { id: `e${index + 1}`, at: index + 1, tries: 1, ...entry },
  resolveLmrProcess(question, { processLog: log }),
), emptyProcessLog(lmrProcessBinding(question)));

test('once the variable that is 0 is chosen, a typed intercept is marked on its own', () => {
  const right = mark(STANDARD, 'xIntercept', { zero: 'y', point: '(6, 0)', direct: true });
  assert.equal(right.usable, true);
  assert.deepEqual(right.claims.map((claim) => [claim.fact, claim.correct, claim.direct]), [['xIntercept', true, true]]);
  assert.deepEqual(codesOf(mark(STANDARD, 'yIntercept', { zero: 'x', point: '(0, -3)', direct: true })), []);
  // A miss is a claim that is not right, said as such.
  const wrong = mark(STANDARD, 'xIntercept', { zero: 'y', point: '(5, 0)', direct: true });
  assert.deepEqual([wrong.usable, wrong.claims[0]?.correct], [true, false]);
  assert.deepEqual(codesOf(wrong), ['typed-intercept-wrong']);
  assert.deepEqual(codesOf(mark(STANDARD, 'xIntercept', { zero: 'y', point: '(6, 1)', direct: true })), ['point-not-on-x-axis']);
  // Not a miss: the variable that is 0 is the idea, and an empty box is not work.
  const wrongZero = mark(STANDARD, 'xIntercept', { zero: 'x', point: '(6, 0)', direct: true });
  assert.deepEqual([wrongZero.usable, codesOf(wrongZero)], [false, ['zero-wrong-x']]);
  assert.deepEqual(codesOf(mark(STANDARD, 'xIntercept', { zero: 'y', point: '', direct: true })), ['point-blank']);
  assert.deepEqual(codesOf(mark(STANDARD, 'xIntercept', { point: '(6, 0)', direct: true })), ['zero-choice-missing']);
});

test('without the typed way, and wherever outcomes are withheld, the solve is still the work', () => {
  // No `direct`: an intercept with no solve is unfinished, as before.
  assert.deepEqual(codesOf(mark(STANDARD, 'xIntercept', { zero: 'y', point: '(6, 0)' })), ['sub-unsolved']);
  // A board that withholds outcomes never offers it, and its marking refuses it.
  const withheld = mark(SUBMIT_ONLY, 'xIntercept', { zero: 'y', point: '(6, 0)', direct: true });
  assert.deepEqual([withheld.usable, codesOf(withheld)], [false, ['sub-unsolved']]);
  // The solve itself is marked exactly as before.
  const solved = mark(STANDARD, 'xIntercept', { zero: 'y', eq: { left: 'x', right: '6' }, steps: [{ left: 'x', right: '6' }], point: '(6, 0)' });
  assert.deepEqual(solved.claims.map((claim) => [claim.fact, claim.correct, claim.direct]), [['xIntercept', true, undefined]]);
});

test('the server grades a typed intercept, and the teacher reads that no solve was shown', () => {
  const log = logOf(STANDARD, [
    { strategy: 'substituteZero', from: 'given', target: 'xIntercept', ev: { zero: 'y', point: '(6, 0)', direct: true } },
    { strategy: 'substituteZero', from: 'given', target: 'yIntercept', ev: { zero: 'x', eq: { left: 'y', right: '-3' }, steps: [{ left: 'y', right: '-3' }], point: '(0, -3)' } },
  ]);
  const graded = gradeToolWork({ toolId: 'representationBridge', question: STANDARD, work: { processLog: log } });
  const part = (id) => graded.parts.find((entry) => entry.id === id);
  assert.equal(part('xIntercept').isCorrect, true);
  assert.match(part('xIntercept').response, /^\(6, 0\) — GIVEN equation → set y = 0 and typed the intercept \(no solve shown\)$/);
  assert.match(part('yIntercept').response, /substituted 0 and solved/, 'a solved intercept keeps its method');
  // On a board that withholds outcomes the same log does not establish it.
  const withheld = gradeToolWork({ toolId: 'representationBridge', question: SUBMIT_ONLY, work: { processLog: logOf(SUBMIT_ONLY, log.entries) } });
  assert.equal(withheld.parts.find((entry) => entry.id === 'xIntercept').isCorrect, false);
});

test('Check on the board: a right typed intercept is recorded; a wrong one is a miss', () => {
  const process = resolveLmrProcess(STANDARD, {});
  const option = process.env.offered.find((entry) => entry.strategy === 'substituteZero' && entry.source === 'given');
  const checkOf = (point) => decideProcessCheck({ process, option, target: 'xIntercept', ev: { zero: 'y', point, direct: true }, live: {}, reveal: true });
  const right = checkOf('(6, 0)');
  assert.equal(right.done, true);
  assert.deepEqual(right.record.ev, { zero: 'y', point: '(6, 0)', direct: true }, 'the entry keeps that no solve was done');
  const wrong = checkOf('(4, 0)');
  assert.deepEqual([wrong.record, wrong.evaluated.usable, wrong.message], [null, true, 'That is not where the line crosses the axis.']);
  assert.deepEqual(processEntryFor({ option, target: 'xIntercept', ev: { zero: 'y', point: '(6, 0)', solveOnly: true } }).ev, { zero: 'y', point: '(6, 0)' }, 'the board\'s own bookkeeping is not evidence');
});

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the board offers it on practice only, before the solve and until a miss', () => {
  const workspace = read('src/tools/representationBridge/process/ProcessWorkspace.jsx');
  const check = region(workspace, 'const check = () => {', '\n  };', 'Check');
  assert.match(check, /const direct = option\.strategy === 'substituteZero' && canCheck && !ev\.solveOnly && !live\?\.solved;/);
  assert.match(check, /const checkedEv = direct \? \{ \.\.\.ev, direct: true \} : ev;\s*const checkedLive = direct \? \{\} : liveEvidence;/);
  assert.match(check, /decideProcessCheck\(\{ question, process, option, target, ev: checkedEv, live: checkedLive, reveal: canCheck, tries \}\)/);
  // A miss: an intercept that was read and was not right. Never an empty box.
  assert.match(check, /const missed = direct && decision\.evaluated\?\.usable === true && !decision\.record;/);
  assert.match(check, /if \(missed\) setEv\(\(previous\) => \(\{ \.\.\.previous, solveOnly: true \}\)\);/);
  const method = read('src/tools/representationBridge/process/ProcessAlgebraMethods.jsx');
  const zero = region(method, 'export function SubstituteZeroMethod(', '\n}\n', 'Substitute 0');
  assert.match(zero, /const typedWay = canCheck && !ev\?\.solveOnly && !current\?\.solved;/);
  // One box for the intercept: above the solve while the typed way is open,
  // under it once the equation is solved, and none in between.
  assert.equal((zero.match(/field="point"/g) || []).length, 1, 'one point field');
  assert.match(zero, /\{typedWay \? pointField\(/);
  assert.match(zero, /\{current\?\.solved \? pointField\(/);
});

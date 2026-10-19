import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBalancedOperation, expressionToLatex, parseEquationInput } from '../../src/algebraAstEngine.js';
import {
  DEFAULT_SUPPORT_LEVEL, SUPPORT_LEVELS,
  evaluateMove, getSupportPolicy, resolveEquationAfterMove, resolveSupportLevel,
} from '../../src/algebraSupportLevels.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';

const equation = () => parseEquationInput({ equation: '3x + 6 = 21' });
const move = (operation, operand, state = equation()) => applyBalancedOperation({ equationState: state, operation, operand });

// --- F2: one scale, and old content still loads ----------------------------

test('the scale is 1 to 5 and every level answers every policy question', () => {
  assert.equal(SUPPORT_LEVELS.length, 5);
  SUPPORT_LEVELS.forEach((entry, index) => {
    assert.equal(entry.level, index + 1);
    assert.equal(typeof entry.autoSimplifyOppositeSide, 'boolean');
    assert.equal(typeof entry.showCancellationHints, 'boolean');
    assert.equal(typeof entry.recordsSlips, 'boolean');
    // Decision D1: no level has a setting that charges a try for a move.
    assert.equal('inefficientMoveCostsAttempt' in entry, false, `level ${entry.level} must not carry an attempt charge`);
    assert.ok(entry.description.length > 10);
  });
});

test('the support decisions are genuinely separate, not one dial', () => {
  // Level 2 shows cues but does not simplify for the student; level 5 hides
  // cues and coaches least. Under the old two-mode model neither was sayable.
  // (Since decision D1 no level charges for a move, so that is no longer one
  // of the decisions; recording slips for the teacher is.)
  const supported = getSupportPolicy(2);
  assert.equal(supported.showCancellationHints, true);
  assert.equal(supported.autoSimplifyOppositeSide, false);
  assert.equal(supported.recordsSlips, false);

  const open = getSupportPolicy(5);
  assert.equal(open.showCancellationHints, false);
  assert.equal(open.coaching, 'minimal');
  assert.equal(getSupportPolicy(3).recordsSlips, true);
  assert.equal(getSupportPolicy(4).recordsSlips, true);
});

test('only level 1 simplifies the opposite side for the student', () => {
  assert.equal(getSupportPolicy(1).autoSimplifyOppositeSide, true);
  [2, 3, 4, 5].forEach((level) => {
    assert.equal(getSupportPolicy(level).autoSimplifyOppositeSide, false, `level ${level} must not simplify silently`);
  });
});

test('old rigorous/exploratory content keeps working', () => {
  assert.equal(resolveSupportLevel({ mode: 'rigorous' }), 3);
  assert.equal(resolveSupportLevel({ mode: 'exploratory' }), 5);
  assert.equal(resolveSupportLevel({ workspaceDifficulty: 4 }), 4);
  assert.equal(resolveSupportLevel({ supportLevel: 2 }), 2);
  // Unreadable input falls back rather than throwing inside a render.
  assert.equal(resolveSupportLevel({}), DEFAULT_SUPPORT_LEVEL);
  assert.equal(resolveSupportLevel({ workspaceDifficulty: 99 }), DEFAULT_SUPPORT_LEVEL);
  assert.equal(resolveSupportLevel(null), DEFAULT_SUPPORT_LEVEL);
});

// --- F3: inefficient but equivalent work is allowed -------------------------

test('F3 — adding an unhelpful value to both sides is valid algebra, not an error', () => {
  const verdict = evaluateMove(move('add', '7'), 3);
  assert.equal(verdict.valid, true);
  assert.equal(verdict.blocked, false, 'a longer route must never be refused');
  assert.equal(verdict.efficient, false);
  assert.match(verdict.message, /valid algebra, just a longer way round/);
});

test('F3 — validity, efficiency and progress are three separate answers', () => {
  const helpful = evaluateMove(move('subtract', '6'), 3);
  assert.deepEqual(
    { valid: helpful.valid, efficient: helpful.efficient, progress: helpful.progress },
    { valid: true, efficient: true, progress: true },
  );

  const longWay = evaluateMove(move('add', '7'), 3);
  assert.equal(longWay.valid, true, 'still valid');
  assert.equal(longWay.efficient, false, 'but not the move a teacher would pick');
});

test('D1 — an invalid move is still blocked and never charged by the move check', () => {
  // As before D1: the workspace refuses it (shake, message) before any step
  // is reported, so it never reached the attempt count either.
  SUPPORT_LEVELS.forEach((entry) => {
    const verdict = evaluateMove({ preservesSolution: false, productive: false }, entry.level);
    assert.equal(verdict.blocked, true);
    assert.equal(verdict.tone, 'error');
    assert.equal(verdict.countsAttempt, false);
  });
});

test('the level descriptions no longer promise that only Open is free', () => {
  SUPPORT_LEVELS.forEach((entry) => {
    assert.doesNotMatch(entry.description, /cost|attempt|tr(y|ies)/i, `level ${entry.level} describes attempts`);
  });
});

test('F3 — only an equivalence-breaking move is blocked', () => {
  // Multiplying by zero collapses the solution set, so it is refused. The
  // engine throws on a literal zero operand, which is the same protection at a
  // different layer; a move that somehow arrives with preservesSolution false
  // must be blocked here too.
  assert.throws(() => move('multiply', '0'), /zero/i);
  const invented = { preservesSolution: false, productive: false };
  const verdict = evaluateMove(invented, 5);
  assert.equal(verdict.blocked, true);
  assert.match(verdict.message, /change the solution set/);
});

// Decision D1 (docs/qa/student-experience-pass-3.md, RUN-2): a valid move
// never spends the question's tries, at any level. Levels 3 and 4 charged one
// for a longer route until then; on a one-try DOL that ended the question.
test('D1 — a valid longer route never costs an attempt, at any level, and is still coached', () => {
  const longWay = move('add', '7');
  SUPPORT_LEVELS.forEach((entry) => {
    const verdict = evaluateMove(longWay, entry.level);
    assert.equal(verdict.countsAttempt, false, `level ${entry.level} must not charge a valid move`);
    // The coaching and the efficiency evidence stay.
    assert.equal(verdict.efficient, false);
    assert.equal(verdict.tone, 'growth');
    assert.match(verdict.message, /longer way round|shorter route/);
  });
  // The helpful move never costs an attempt at any level.
  SUPPORT_LEVELS.forEach((entry) => {
    assert.equal(evaluateMove(move('subtract', '6'), entry.level).countsAttempt, false);
  });
});

// --- F4: no silent simplification above level 1 -----------------------------

test('F4 — Guided simplifies the far side, every other level does not', () => {
  const subtractSix = move('subtract', '6');
  assert.equal(expressionToLatex(resolveEquationAfterMove(subtractSix, 1).right), '15');

  [2, 3, 4, 5].forEach((level) => {
    const shown = expressionToLatex(resolveEquationAfterMove(subtractSix, level).right);
    assert.notEqual(shown, '15', `level ${level} must leave 21 - 6 for the student`);
    assert.match(shown, /21/);
    assert.match(shown, /6/);
  });
});

test('F4 — the side the student cancelled IS simplified; that was their work', () => {
  const subtractSix = move('subtract', '6');
  const after = resolveEquationAfterMove(subtractSix, 3, ['left']);
  assert.match(expressionToLatex(after.left), /3/, 'the cancelled side collapses to 3x');
  assert.ok(!expressionToLatex(after.left).includes('6'), 'the +6 and -6 are gone');
  // The other side still waits for them.
  assert.match(expressionToLatex(after.right), /21/);
});

test('F4 — a null move does not throw', () => {
  assert.equal(resolveEquationAfterMove(null, 3), null);
});

// --- The contract describes the new field, and not the old one --------------

test('the contract advertises workspaceDifficulty and explains the scale', () => {
  const entry = QUESTION_TYPE_CATALOG.stepAlgebra;
  assert.ok(entry.optional.includes('workspaceDifficulty'));
  assert.equal(entry.example.workspaceDifficulty, 3);
  assert.ok(entry.notes.some((note) => /1 Guided/.test(note)));
  assert.ok(entry.notes.some((note) => /do not author it/.test(note)),
    'the old mode field should be documented as legacy, not recommended');
});

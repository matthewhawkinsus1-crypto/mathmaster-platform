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
    assert.equal(typeof entry.inefficientMoveCostsAttempt, 'boolean');
    assert.ok(entry.description.length > 10);
  });
});

test('the support decisions are genuinely separate, not one dial', () => {
  // Level 2 shows cues but does not simplify for the student; level 5 hides
  // cues and charges nothing. Under the old two-mode model neither was sayable.
  const supported = getSupportPolicy(2);
  assert.equal(supported.showCancellationHints, true);
  assert.equal(supported.autoSimplifyOppositeSide, false);
  assert.equal(supported.inefficientMoveCostsAttempt, false);

  const open = getSupportPolicy(5);
  assert.equal(open.showCancellationHints, false);
  assert.equal(open.inefficientMoveCostsAttempt, false);
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

test('F3 — a longer route costs an attempt only where the level says so', () => {
  const longWay = move('add', '7');
  [1, 2, 5].forEach((level) => {
    assert.equal(evaluateMove(longWay, level).countsAttempt, false, `level ${level} should not charge`);
  });
  [3, 4].forEach((level) => {
    assert.equal(evaluateMove(longWay, level).countsAttempt, true, `level ${level} should charge`);
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

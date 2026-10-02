// A BALANCE MOVE IN PROGRESS IS SAVED AS WHAT THE STUDENT DID.
//
// While a move waited for its cancellation, the balance workspace saved the
// engine's whole move in the draft — including `analysisBefore.solution` and
// `analysisAfter.solution`, the solved value — so the solution sat in a record
// the student can read, and the server backup refused the record (a console
// error on every write; the work in progress never left the device). And the
// restore remade the move from the operation and operand alone, so a move the
// student had placed beside a term came back placed somewhere else.
//
// The draft now keeps the operation, the operand and the placement; the move
// is remade by the same function that made it. The browser side is certified
// by the "step-algebra-mid-move" scene in tests/browser/draftPersistenceScenes.mjs
// (navigate, reload, reopen, and acceptance by the server backup's guard).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEquationInput } from '../../src/algebraAstEngine.js';
import {
  ALGEBRA_DRAFT_VERSION,
  makePendingMove,
  pendingMoveDraft,
  rehydrateAlgebraDraft,
} from '../../src/algebraDraftState.js';
import { explainWorkspaceDraftRejection } from '../../functions/shared/workspaceDraftSchema.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const equation = parseEquationInput({ equation: '2*x + 5 = 19', solveFor: 'x' });
// "−5" dropped just before the "+5" on the left, and on the right side as a whole:
// the two shapes a placement takes (algebraDraftState.js).
const placementBySide = { left: { kind: 'before', termIndex: 1 }, right: 'side' };
const move = makePendingMove({ equation, operation: 'subtract', operand: '5', placementBySide });

// The record StepByStepAlgebraCore writes while this move waits for its
// cancellation (its draft-write effect), with the pending move as stored.
const draftRecord = (pendingMove) => ({
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation,
  supportLevel: 3,
  operand: '',
  distributionState: null,
  structureTool: null,
  workSteps: [],
  armedTile: null,
  pendingMove,
  crossedSides: [],
  cancelledPairIds: {},
  selectedCancellationIndices: {},
  simplificationAnswers: {},
  promptAnswers: {},
  likeTermsOpen: false,
  likeTermsSide: '',
  selectedLikeTermIndices: [],
  likeTermsAnswer: '',
});

test('the fixture is a move that is still pending, and its engine form carries the solution', () => {
  assert.deepEqual(move.requiredCancellationSides, ['left'], 'the +5 / −5 pair still has to be cancelled');
  assert.equal(move.analysisBefore.solution, 7, 'the engine analysis knows x = 7');
  // Why the engine's move cannot be the draft: the server backup refuses it.
  const refused = explainWorkspaceDraftRejection(draftRecord(move));
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'forbidden-key');
  assert.match(refused.path, /^pendingMove\.analysis(Before|After)\.solution$/);
});

test('a move in progress is saved as the operation, the operand and the placement', () => {
  assert.deepEqual(pendingMoveDraft(move), {
    operation: 'subtract',
    operandExpression: '5',
    placementBySide: { left: { kind: 'before', termIndex: 1 }, right: 'side' },
  });
  const stored = JSON.stringify(draftRecord(pendingMoveDraft(move)));
  assert.doesNotMatch(stored, /solution|analysisBefore|analysisAfter|simplified/, 'nothing the engine derived is saved');
  assert.equal(pendingMoveDraft(null), null);
  assert.equal(pendingMoveDraft({ operation: 'subtract', operandExpression: '  ' }), null, 'no operand, no move');
});

test('the server backup accepts the draft while the move waits', () => {
  const verdict = explainWorkspaceDraftRejection(draftRecord(pendingMoveDraft(move)));
  assert.deepEqual({ ok: verdict.ok, reason: verdict.reason, path: verdict.path }, { ok: true, reason: null, path: null });
});

test('a reload brings back the same move, placed where the student placed it', () => {
  const restored = rehydrateAlgebraDraft({ draft: draftRecord(pendingMoveDraft(move)), initialEquation: equation });
  assert.deepEqual(restored.pendingMove, move, 'the move that comes back is the move that was made');
  assert.deepEqual(pendingMoveDraft(restored.pendingMove), pendingMoveDraft(move), 'and saving it again stores the same thing');
  // The placement is what makes it this move: without it the −5 lands after +5.
  const appended = makePendingMove({ equation, operation: 'subtract', operand: '5' });
  assert.notDeepEqual(appended.unsimplified.left, move.unsimplified.left, 'the fixture is sensitive to the placement');
});

test('a draft saved before this change, holding the whole engine move, still resumes', () => {
  const legacy = makePendingMove({ equation, operation: 'subtract', operand: '5' });
  const { placementBySide: _dropped, ...engineMove } = legacy;
  const restored = rehydrateAlgebraDraft({ draft: draftRecord(engineMove), initialEquation: equation });
  assert.deepEqual(restored.pendingMove.unsimplified, legacy.unsimplified);
  assert.deepEqual(restored.pendingMove.requiredCancellationSides, ['left']);
  // ...and the next save is the clean form.
  assert.equal(explainWorkspaceDraftRejection(draftRecord(pendingMoveDraft(restored.pendingMove))).ok, true);
});

test('an unusable placement in a stored draft is dropped, not trusted', () => {
  const tampered = { operation: 'subtract', operandExpression: '5', placementBySide: { left: { kind: 'before', termIndex: -3 }, right: ['side'], middle: 'side' } };
  const restored = rehydrateAlgebraDraft({ draft: draftRecord(tampered), initialEquation: equation });
  assert.deepEqual(restored.pendingMove.placementBySide, {});
  assert.deepEqual(restored.pendingMove.unsimplified, makePendingMove({ equation, operation: 'subtract', operand: '5' }).unsimplified);
});

test('the balance workspace makes its moves and saves its draft through these two functions', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  const draftWrite = region(core, 'writeQuestionDraft(localDraftKey, {', '});', 'the draft write');
  assert.match(draftWrite, /pendingMove:\s*pendingMoveDraft\(pendingMove\)/, 'the draft keeps only what the student did');
  const attempt = region(core, 'const attemptMove = async', 'setPendingMove(move);', 'attemptMove');
  assert.match(attempt, /move = makePendingMove\(/, 'a move is made the way a restore remakes it');
  assert.doesNotMatch(attempt, /applyBalancedOperation\(/, 'not by a second route a restore cannot reproduce');
});

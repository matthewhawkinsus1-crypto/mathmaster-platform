/*
 * ISSUE #361: A 3×3 ELIMINATION PAIR THAT NEEDS SCALING MUST BE SOLVABLE.
 *
 * On the live Day 1 assignment, choosing any pair whose target coefficients
 * were not already equal or opposite showed both equations as "Used as
 * written (×1)" with no scale-factor field, and adding them said "check your
 * scale factors". Practice 3 ("this system requires thoughtful scaling") and
 * the DOL had no complete elimination route at all.
 *
 * The engine tests exercised each transition on its own result, which never
 * went wrong. The SCREEN does something else: every render reads the stored
 * round back through repairEliminationState, and every click applies the
 * transition to that repaired state. The repair replayed "apply the
 * multiplier" for every equation without a stored factor, so a blank or
 * freshly opened editor was confirmed as ×1 on the very next render.
 *
 * These tests drive the engine the way the screen does — stored → repair →
 * transition → stored — so that loop is what is under test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReductionSystem } from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import {
  applyEliminationMultiplier,
  checkEliminationCombination,
  checkEliminationMultiplierProducts,
  chooseEliminationPair,
  chooseEliminationVariable,
  eliminationPhase,
  eliminationReducedSystem,
  eliminationRoundEliminates,
  eliminationRoundStage,
  eliminationScaleEditorOpen,
  emptyEliminationState,
  keepEliminationEquationAsWritten,
  openEliminationScaleEditor,
  repairEliminationState,
  setEliminationCombinationTerm,
  setEliminationMultiplierDraft,
  setEliminationMultiplierProductTerm,
  setEliminationOperation,
  toggleEliminationCancellation,
} from '../../src/tools/systemsWorkspace/eliminationReduction.js';

const XYZ = ['x', 'y', 'z'];
// Practice 3 of the live Day 1 assignment: every pair needs a scale factor for every variable.
const PRACTICE_3 = ['2x + 3y - z = 9', '3x - 2y + 2z = -3', 'x + 4y + 3z = 6'];
// The live DOL: exactly one pair per variable is already opposite, so a second round always needs scaling.
const DOL_1 = ['x + y + z = 3', '2x - y + 3z = 16', '-x + 2y + z = -1'];

/** The screen's loop: every render repairs what is stored; every click transforms the repaired state. */
const screen = (equations) => {
  const system = buildReductionSystem({ variables: XYZ, equations });
  let stored = emptyEliminationState();
  const view = () => repairEliminationState(stored, system);
  const act = (transition) => {
    const next = transition(view(), system);
    stored = next.state;
    return next;
  };
  return { system, view, act };
};

let currentView = null;
const scale = (act, roundKey, id, factor, products) => {
  act((state) => openEliminationScaleEditor(state, roundKey, id));
  // The field the student types into exists only while the editor is open.
  assert.equal(eliminationScaleEditorOpen(currentView().rounds[roundKey], id), true, `${id}'s scale editor must be open to type a factor`);
  act((state) => setEliminationMultiplierDraft(state, roundKey, id, factor));
  act((state, system) => applyEliminationMultiplier(state, system, roundKey, id));
  Object.entries(products).forEach(([key, value]) => act((state) => setEliminationMultiplierProductTerm(state, roundKey, id, key, value)));
  return act((state, system) => checkEliminationMultiplierProducts(state, system, roundKey, id));
};

const combine = (act, roundKey, operation, [idA, idB], terms) => {
  act((state) => setEliminationOperation(state, roundKey, operation));
  act((state, system) => toggleEliminationCancellation(state, system, roundKey, idA));
  act((state, system) => toggleEliminationCancellation(state, system, roundKey, idB));
  Object.entries(terms).forEach(([key, value]) => act((state) => setEliminationCombinationTerm(state, roundKey, key, value)));
  return act((state, system) => checkEliminationCombination(state, system, roundKey));
};

test('a freshly chosen pair is used as written (×1) — the same default as the 2×2 — and its scale editor opens and STAYS open', () => {
  const { system, view, act } = screen(PRACTICE_3);
  act((state) => chooseEliminationVariable(state, system, 'z'));
  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  assert.deepEqual(view().rounds.round1.multiplierValues, { E1: 1, E2: 1 });
  assert.equal(eliminationRoundStage(view(), system, 'round1'), 'operation');

  act((state) => openEliminationScaleEditor(state, 'round1', 'E1'));
  // The regression: on the next render the editor was already confirmed as ×1 again.
  assert.equal(eliminationScaleEditorOpen(view().rounds.round1, 'E1'), true, 'the scale editor must survive the next render');
  assert.equal(view().rounds.round1.multiplierValues.E1, undefined);
  assert.equal(eliminationRoundStage(view(), system, 'round1'), 'multiplier');

  // Typing a factor does not apply it; only the student's Apply does.
  act((state) => setEliminationMultiplierDraft(state, 'round1', 'E1', '2'));
  assert.equal(eliminationScaleEditorOpen(view().rounds.round1, 'E1'), true);
  assert.equal(view().rounds.round1.multiplierWork.E1, undefined, 'typing must not open the distribution before Apply');
  act((state, system2) => applyEliminationMultiplier(state, system2, 'round1', 'E1'));
  assert.ok(view().rounds.round1.multiplierWork.E1?.active, 'Apply opens the term-by-term distribution, and it survives the next render');
});

test('"Keep as written" closes the editor back to ×1, and an operation that does not eliminate is recoverable by scaling', () => {
  const { system, view, act } = screen(PRACTICE_3);
  currentView = view;
  act((state) => chooseEliminationVariable(state, system, 'z'));
  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  act((state) => setEliminationOperation(state, 'round1', 'add'));
  assert.equal(eliminationRoundEliminates(view(), system, 'round1'), false, '-z + 2z does not cancel');

  act((state) => openEliminationScaleEditor(state, 'round1', 'E1'));
  assert.equal(view().rounds.round1.operation, null, 'opening a scale editor clears the operation built on the old equation');
  act((state) => keepEliminationEquationAsWritten(state, 'round1', 'E1'));
  assert.equal(eliminationScaleEditorOpen(view().rounds.round1, 'E1'), false);
  assert.equal(view().rounds.round1.multiplierValues.E1, 1);

  const scaled = scale(act, 'round1', 'E1', '2', { x: '4x', y: '6y', z: '-2z', constant: '18' });
  assert.equal(scaled.feedback, null, JSON.stringify(scaled.feedback));
  assert.equal(view().rounds.round1.multiplierValues.E1, 2, 'the checked factor survives the next render');
  act((state) => setEliminationOperation(state, 'round1', 'add'));
  assert.equal(eliminationRoundEliminates(view(), system, 'round1'), true, '2·E1 + E2 eliminates z');
});

test('Practice 3 — the system that requires scaling — reduces to a 2×2 through the screen loop', () => {
  const { system, view, act } = screen(PRACTICE_3);
  currentView = view;
  act((state) => chooseEliminationVariable(state, system, 'z'));

  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  scale(act, 'round1', 'E1', '2', { x: '4x', y: '6y', z: '-2z', constant: '18' });
  const r1 = combine(act, 'round1', 'add', ['E1', 'E2'], { x: '7x', y: '4y', constant: '15' });
  assert.equal(r1.feedback, null, JSON.stringify(r1.feedback));

  act((state) => chooseEliminationPair(state, system, 'round2', 'E2E3'));
  scale(act, 'round2', 'E2', '3', { x: '9x', y: '-6y', z: '6z', constant: '-9' });
  scale(act, 'round2', 'E3', '2', { x: '2x', y: '8y', z: '6z', constant: '12' });
  const r2 = combine(act, 'round2', 'subtract', ['E2', 'E3'], { x: '7x', y: '-14y', constant: '-21' });
  assert.equal(r2.feedback, null, JSON.stringify(r2.feedback));

  assert.equal(eliminationPhase(view(), system, {}), 'subsystem');
  assert.deepEqual(eliminationReducedSystem(view(), system).equations.map((equation) => equation.text), ['7x + 4y = 15', '7x - 14y = -21']);
});

test('the DOL reduces through a route whose second round needs a scale factor', () => {
  const { system, view, act } = screen(DOL_1);
  currentView = view;
  act((state) => chooseEliminationVariable(state, system, 'y'));
  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  combine(act, 'round1', 'add', ['E1', 'E2'], { x: '3x', z: '4z', constant: '19' });
  act((state) => chooseEliminationPair(state, system, 'round2', 'E1E3'));
  scale(act, 'round2', 'E1', '2', { x: '2x', y: '2y', z: '2z', constant: '6' });
  const r2 = combine(act, 'round2', 'subtract', ['E1', 'E3'], { x: '3x', z: 'z', constant: '7' });
  assert.equal(r2.feedback, null, JSON.stringify(r2.feedback));
  assert.deepEqual(eliminationReducedSystem(view(), system).equations.map((equation) => equation.text), ['3x + 4z = 19', '3x + z = 7']);
});

test('a reload in the middle of scaling reopens exactly that state', () => {
  const { system, view, act } = screen(PRACTICE_3);
  act((state) => chooseEliminationVariable(state, system, 'z'));
  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  act((state) => openEliminationScaleEditor(state, 'round1', 'E1'));
  act((state) => setEliminationMultiplierDraft(state, 'round1', 'E1', '2'));
  act((state, system2) => applyEliminationMultiplier(state, system2, 'round1', 'E1'));
  act((state) => setEliminationMultiplierProductTerm(state, 'round1', 'E1', 'x', '4x'));
  // What survives a reload is the stored JSON.
  const reloaded = repairEliminationState(JSON.parse(JSON.stringify(view())), system);
  assert.equal(reloaded.rounds.round1.multiplierDrafts.E1, '2');
  assert.equal(reloaded.rounds.round1.multiplierWork.E1.x, '4x');
  assert.equal(reloaded.rounds.round1.multiplierValues.E1, undefined);
  assert.equal(reloaded.rounds.round1.multiplierValues.E2, 1, 'the untouched equation is still used as written');
});

test('typing every scaled term correctly does not accept them — only the student\'s Check does', () => {
  const { system, view, act } = screen(PRACTICE_3);
  act((state) => chooseEliminationVariable(state, system, 'z'));
  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  act((state) => openEliminationScaleEditor(state, 'round1', 'E1'));
  act((state) => setEliminationMultiplierDraft(state, 'round1', 'E1', '2'));
  act((state, system2) => applyEliminationMultiplier(state, system2, 'round1', 'E1'));
  Object.entries({ x: '4x', y: '6y', z: '-2z', constant: '18' })
    .forEach(([key, value]) => act((state) => setEliminationMultiplierProductTerm(state, 'round1', 'E1', key, value)));
  // The next render must not decide for the student that the distribution is right.
  assert.ok(view().rounds.round1.multiplierWork.E1, 'the distribution stays open until the student checks it');
  assert.equal(view().rounds.round1.multiplierValues.E1, undefined, 'correct terms are not accepted by a render');
  const checked = act((state, system2) => checkEliminationMultiplierProducts(state, system2, 'round1', 'E1'));
  assert.equal(checked.feedback, null);
  assert.equal(view().rounds.round1.multiplierValues.E1, 2);
});

test('a rejected distribution still says so after the next render', () => {
  const { system, view, act } = screen(PRACTICE_3);
  act((state) => chooseEliminationVariable(state, system, 'z'));
  act((state) => chooseEliminationPair(state, system, 'round1', 'E1E2'));
  act((state) => openEliminationScaleEditor(state, 'round1', 'E1'));
  act((state) => setEliminationMultiplierDraft(state, 'round1', 'E1', '2'));
  act((state, system2) => applyEliminationMultiplier(state, system2, 'round1', 'E1'));
  act((state) => setEliminationMultiplierProductTerm(state, 'round1', 'E1', 'x', '4x'));
  const rejected = act((state, system2) => checkEliminationMultiplierProducts(state, system2, 'round1', 'E1'));
  assert.equal(rejected.feedback.reason, 'incorrect-products');
  assert.equal(view().rounds.round1.multiplierWork.E1.checked, true);
  assert.equal(view().rounds.round1.multiplierWork.E1.valid, false);
});

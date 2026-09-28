// #392: independent finishing checks on the Day 2 non-unique 3×3 workflow (#390).
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { MAX_WORKSPACE_DRAFT_VALUE_BYTES, sanitizeWorkspaceDraftValue } from '../../functions/shared/workspaceDraftSchema.mjs';
import {
  PERSISTED_UNDO_MAX_CHARS, boundUndoEntries, persistedUndoKey, readPersistedUndo, writePersistedUndo,
} from '../../src/platform/workView/persistedMathUndo.js';
import { removeQuestionDraftFamily, subscribeToQuestionDrafts } from '../../src/questionDraftStorage.js';
import { checkSubstitutedStatement, substitutedStatementSides } from '../../src/tools/systemsWorkspace/degenerateSubstitution.js';
import { planeRelationshipFeedback, planeRelationshipTypes } from '../../src/tools/systemsWorkspace/spatialFeedback.js';
import { classificationFeedback, planeWorkEarned, statementKindCorrect } from '../../src/tools/systemsWorkspace/algebraicOutcomeModel.js';
import { linearEquationForm } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import * as engine from '../../src/tools/systemsWorkspace/eliminationReduction.js';
import { buildReductionSystem } from '../../src/tools/systemsWorkspace/substitutionReduction.js';

const DEPENDENT = ['2x + y - 3z = 5', 'x + 2y - 4z = 7', '6x + 3y - 9z = 15'];
const INCONSISTENT = ['3x - y - 2z = 4', '6x - 2y - 4z = 11', '9x - 3y - 6z = 12'];
const UNIQUE = ['5x + 3y + 2z = 2', '2x + y - z = 5', 'x + 4y + 2z = 16'];
const XYZ = ['x', 'y', 'z'];

/* ------------------------------------------------ Undo that survives refresh */

const withStorage = (run) => {
  const previous = globalThis.window;
  const data = new Map();
  globalThis.window = {
    localStorage: {
      get length() { return data.size; },
      key: (index) => [...data.keys()][index] ?? null,
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => { data.set(key, String(value)); },
      removeItem: (key) => { data.delete(key); },
    },
  };
  try {
    return run(data);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

// A realistic 3×3 elimination snapshot (~1 KB), the thing Undo stores 60 of.
const snapshot = (index) => ({
  elimination: {
    version: 2, variable: 'x',
    rounds: {
      round1: { pair: ['E1', 'E3'], multiplierDrafts: { E1: '3' }, multiplierValues: { E1: 3, E3: 1 }, multiplierWork: {}, operation: 'subtract', operationAttempts: 1, cancelledEquations: { E1: true, E3: true }, combinationWork: { y: '0', z: '0', constant: String(index), checked: true, valid: true }, combinedText: '0 = 0' },
      round2: { pair: ['E1', 'E2'], multiplierDrafts: { E1: '1/2' }, multiplierValues: {}, multiplierWork: { E1: { x: '1', y: '1/2', z: '-3/2', constant: '5/2', checked: false, valid: false, active: true } }, operation: null, operationAttempts: 0, cancelledEquations: {}, combinationWork: null, combinedText: null },
    },
    back: { destinationId: null, placed: {}, solved: null },
    verification: {},
  },
  subsystemClassification: null,
  planeWork: null,
});

test('persisted Undo is size-capped, newest kept, and never offered to the server backup', () => {
  withStorage((data) => {
    const notified = [];
    const unsubscribe = subscribeToQuestionDrafts((event) => notified.push(event.key));
    const toolKey = 'mathmaster:draft:v2::student:assignment:3:0:student:work:tool';
    const key = persistedUndoKey(toolKey, 'algebraic-elimination-history');
    const entries = Array.from({ length: 60 }, (_, index) => snapshot(index));
    const current = snapshot(99);
    assert.equal(writePersistedUndo(key, { resetKey: 'q', state: current, stack: { entries } }), true);
    unsubscribe();

    // The whole 60-entry stack would be ~60 KB: far over the per-value server cap.
    assert.ok(JSON.stringify(entries).length > MAX_WORKSPACE_DRAFT_VALUE_BYTES);
    assert.deepEqual(notified, [], 'Undo history must not travel through writeQuestionDraft to the workspace sync');
    const stored = JSON.parse(data.get(key));
    assert.ok(JSON.stringify(stored.value.entries).length <= PERSISTED_UNDO_MAX_CHARS);
    assert.ok(stored.value.entries.length >= 8, 'enough recent steps survive a refresh to be useful');
    assert.deepEqual(stored.value.entries.at(-1), entries.at(-1), 'the newest step is the one kept');

    // Restored only onto the exact state and question it was recorded for.
    assert.equal(readPersistedUndo(key, { resetKey: 'q', state: current }).entries.length, stored.value.entries.length);
    assert.equal(readPersistedUndo(key, { resetKey: 'q', state: snapshot(98) }).entries.length, 0);
    assert.equal(readPersistedUndo(key, { resetKey: 'other', state: current }).entries.length, 0);

    // It lives in the question's draft family, so a question reset retires it.
    removeQuestionDraftFamily('mathmaster:draft:v2::student:assignment:3:0:student');
    assert.equal(data.has(key), false);
  });
});

test('the work record stays syncable once Undo is kept out of it', () => {
  const work = { elimination: snapshot(1).elimination, subsystemClassification: null, planeRelationships: null };
  assert.equal(sanitizeWorkspaceDraftValue(work).ok, true);
  const withHistory = { ...work, 'undo:algebraic-elimination-history': { stack: { entries: Array.from({ length: 60 }, (_, index) => snapshot(index)) } } };
  assert.equal(sanitizeWorkspaceDraftValue(withHistory).reason, 'too-large', 'the #390 layout this guards against');
});

test('boundUndoEntries keeps a contiguous newest suffix', () => {
  const entries = ['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(10)];
  assert.deepEqual(boundUndoEntries(entries, 25), entries.slice(1));
  assert.deepEqual(boundUndoEntries(entries, 5), []);
});

test('useMathUndoHistory persists through the local-only store, not the tool work record', () => {
  const hook = executableSource(componentSource('src/platform/workView/useMathUndoHistory.js'));
  assert.doesNotMatch(hook, /usePersistentToolState\(/, 'a history in usePersistentToolState rides the synced work record');
  const save = region(hook, 'const save = useCallback(', '}, [', 'save');
  assert.match(save, /writePersistedUndo\(persistKey/);
  assert.match(hook, /useState\(\(\) => readPersistedUndo\(persistKey/);
});

/* -------------------------------- reduced 2×2 substitution that cancels out */

test('a substitution that cancels the variable is simplified by the student, side by side', () => {
  const sides = substitutedStatementSides('9y - 15((3y - 9)/5) = 27', ['y', 'z']);
  assert.equal(sides.right.given, true, 'a side that is already a number is shown as given');
  assert.equal(sides.left.given, false);
  assert.equal(checkSubstitutedStatement(sides, {}).valid, false, 'nothing is accepted before the student enters it');
  const wrong = checkSubstitutedStatement(sides, { left: '25' });
  assert.equal(wrong.valid, false);
  assert.equal(wrong.statement, null, 'a wrong side produces no statement');
  const right = checkSubstitutedStatement(sides, { left: '27' });
  assert.deepEqual([right.valid, right.statement, right.type], [true, '27 = 27', 'infinite']);
  const contradiction = checkSubstitutedStatement(substitutedStatementSides('9y - 15((3y - 9)/5) = 30', ['y', 'z']), { left: '27' });
  assert.deepEqual([contradiction.statement, contradiction.type], ['27 = 30', 'none']);
  assert.equal(substitutedStatementSides('-3y + 5z = -9', ['y', 'z']), null, 'a normal equation stays with Step Algebra');
  const collected = substitutedStatementSides('2y + 3 = 2y + 5', ['y', 'z']);
  assert.equal(collected.collected, true);
  assert.equal(checkSubstitutedStatement(collected, { right: '2' }).statement, '0 = 2');
});

test('the reduced 2×2 reports a substitution outcome only from the checked student statement', () => {
  const mode = componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  const outcome = region(mode, 'const subsystemOutcome =', 'const subsystemSolutionKey', 'subsystem outcome');
  assert.match(outcome, /statementSides\s*\?\s*\(statementResult\?\.valid \? \{ type: statementResult\.type, statement: statementResult\.statement \} : null\)/);
  const reader = region(mode, 'export const subsystemReportFromDraft', 'const first = record?.firstSolved', 'draft reader');
  assert.match(reader, /work\.source === substituted/);
  assert.match(reader, /checkSubstitutedStatement\(substitutedStatementSides\(substituted, variables\), work\)/);
  const parent = componentSource('src/tools/systemsWorkspace/EliminationReductionMode.jsx');
  assert.match(parent, /subsystemReportFromDraft\(readToolDraftRecord\(scopeContext\.draftKey, subsystemScope\), reduced\?\.variables\)/);
});

/* ---------------------------------------------- earned classification rules */

const journey = (equations) => {
  const system = buildReductionSystem({ variables: XYZ, equations });
  let state = engine.chooseEliminationVariable(engine.emptyEliminationState(), system, 'x').state;
  const act = (fn, ...args) => { state = engine.repairEliminationState(fn(state, ...args).state, system); };
  const round = (key, pairId, scaled, factor, products, operation, terms) => {
    act(engine.chooseEliminationPair, system, key, pairId);
    if (scaled) {
      act(engine.setEliminationMultiplierDraft, key, scaled, factor);
      act(engine.applyEliminationMultiplier, system, key, scaled);
      for (const [name, value] of Object.entries(products)) act(engine.setEliminationMultiplierProductTerm, key, scaled, name, value);
      act(engine.checkEliminationMultiplierProducts, system, key, scaled);
    }
    act(engine.setEliminationOperation, key, operation);
    for (const id of state.rounds[key].pair) act(engine.toggleEliminationCancellation, system, key, id);
    for (const [name, value] of Object.entries(terms)) act(engine.setEliminationCombinationTerm, key, name, value);
    act(engine.checkEliminationCombination, system, key);
  };
  return { system, round, get state() { return state; } };
};

test('dependent system with no proportional pair reaches its identity only in the reduced 2×2', () => {
  const j = journey(DEPENDENT);
  j.round('round1', 'E1E2', 'E2', '2', { x: '2', y: '4', z: '-8', constant: '14' }, 'subtract', { y: '-3', z: '5', constant: '-9' });
  j.round('round2', 'E2E3', 'E2', '6', { x: '6', y: '12', z: '-24', constant: '42' }, 'subtract', { y: '9', z: '-15', constant: '27' });
  assert.equal(engine.eliminationOutcome(j.state, j.system), null, 'two non-zero rows are not a terminal statement');
  const reduced = engine.eliminationReducedSystem(j.state, j.system);
  assert.deepEqual(reduced.equations.map((equation) => equation.text), ['-3y + 5z = -9', '9y - 15z = 27']);
});

test('in the inconsistent system the coincident pair\'s identity never decides the system', () => {
  const j = journey(INCONSISTENT);
  j.round('round1', 'E1E3', 'E1', '3', { x: '9', y: '-3', z: '-6', constant: '12' }, 'subtract', { y: '0', z: '0', constant: '0' });
  assert.equal(engine.eliminationOutcome(j.state, j.system), null);
  j.round('round2', 'E2E3', 'E2', '3/2', { x: '9', y: '-3', z: '-6', constant: '33/2' }, 'subtract', { y: '0', z: '0', constant: '9/2' });
  const outcome = engine.eliminationOutcome(j.state, j.system);
  assert.equal(outcome?.type, 'none');
  assert.match(outcome.statement, /^0 = 9\/2$|^0 = 4\.5$/);
});

test('classification needs the right reading of the statement, with misconception-specific nudges', () => {
  const identity = { type: 'infinite', statement: '0 = 0' };
  const contradiction = { type: 'none', statement: '0 = -3' };
  assert.equal(statementKindCorrect(identity, 'identity'), true);
  assert.equal(statementKindCorrect(identity, 'origin'), false);
  assert.equal(statementKindCorrect(contradiction, 'identity'), false);
  assert.equal(classificationFeedback(identity, 'identity', 'infinite'), null);
  assert.equal(classificationFeedback(contradiction, 'contradiction', 'none'), null);
  const nudges = [
    classificationFeedback(identity, 'origin', 'unique'),
    classificationFeedback(identity, 'contradiction', 'none'),
    classificationFeedback(identity, 'identity', 'unique'),
    classificationFeedback(identity, 'identity', 'none'),
    classificationFeedback(contradiction, 'contradiction', 'infinite'),
  ];
  assert.match(nudges[0], /does not fix any coordinate/);
  assert.equal(new Set(nudges).size, nudges.length, 'each confusion gets its own nudge');
  for (const nudge of nudges) assert.doesNotMatch(nudge, /infinitely many|no solution|dependent|inconsistent/i, `nudge names the answer: ${nudge}`);
  const ui = componentSource('src/tools/systemsWorkspace/AlgebraicOutcome.jsx');
  const submitHandler = region(ui, 'const submitClassification =', 'const hint =', 'classification submit');
  assert.match(submitHandler, /if \(statementKindCorrect\(outcome, kind\)\) onClassify\(choice\)/);
});

/* ---------------------------------------------------- plane relationships */

const truthOf = (equations) => planeRelationshipTypes(equations.map((equation) => linearEquationForm(equation, XYZ)), XYZ);

test('plane relationships for the three Day 2 systems', () => {
  assert.deepEqual(truthOf(DEPENDENT), { '1-2': 'line', '1-3': 'coincident', '2-3': 'line' });
  assert.deepEqual(truthOf(INCONSISTENT), { '1-2': 'parallel', '1-3': 'coincident', '2-3': 'parallel' });
  assert.deepEqual(truthOf(UNIQUE), { '1-2': 'line', '1-3': 'line', '2-3': 'line' });
});

test('stated plane relationships are re-judged, and wrong ones get a pair-specific nudge', () => {
  const question = { equations: INCONSISTENT, variables: XYZ };
  const right = { answers: { '1-2': 'parallel', '1-3': 'coincident', '2-3': 'parallel' }, checked: true };
  assert.equal(planeWorkEarned(right, question), true);
  assert.equal(planeWorkEarned({ ...right, checked: false }, question), false, 'typing is not checking');
  assert.equal(planeWorkEarned({ ...right, answers: { ...right.answers, '1-2': 'coincident' } }, question), false, 'a forged checked flag is not trusted');
  const truth = truthOf(INCONSISTENT);
  const confused = planeRelationshipFeedback({ '1-2': 'coincident', '1-3': 'coincident', '2-3': 'parallel' }, truth);
  assert.match(confused, /Planes 1 and 2/);
  assert.match(confused, /constant ratio/);
  assert.doesNotMatch(confused, /parallel and distinct|are coincident/);
  assert.match(planeRelationshipFeedback({ '1-2': 'line' }, truth), /same ratio/);
  assert.match(planeRelationshipFeedback({ '1-2': 'line', '1-3': 'parallel' }, truthOf(DEPENDENT)), /Planes 1 and 3/);
});

test('an identity or contradiction is complete only after the plane relationships are stated', () => {
  const parent = componentSource('src/tools/systemsWorkspace/EliminationReductionMode.jsx');
  assert.match(parent, /const readyToSubmit = phase === 'complete' \|\| \(phase === 'classified' && planesEarned\);/);
  assert.match(parent, /const planesEarned = Boolean\(outcome && classified && planeWorkEarned\(planeWork, planeQuestion\)\);/);
  const check = region(parent, 'const check = () => {', 'mode: \'algebraic\'', 'check');
  assert.match(check, /const interpreted = classified && planesEarned;/);
  const spatial = executableSource(componentSource('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx'));
  assert.doesNotMatch(spatial, /parallelPlaneRelationships/, 'the model must not caption the relationships the student states');
});

test('earlier algebra changing revokes the interpretation in the same update, and Undo restores it whole', () => {
  const parent = componentSource('src/tools/systemsWorkspace/EliminationReductionMode.jsx');
  const apply = region(parent, 'const apply = useCallback(', 'const reduced =', 'apply');
  assert.match(apply, /if \(!transition\.state\.classification\) \{\s*setSubsystemClassification\(null\);\s*setPlaneWork\(null\);/);
  assert.match(parent, /const historyState = useMemo\(\(\) => \(\{ elimination: storedElimination, subsystemClassification, planeWork \}\)/);
  const child = region(parent, 'const handleSubsystemSolution =', 'const subsystemState =', 'child report');
  assert.match(child, /if \(!report\?\.outcome\) \{\s*setSubsystemClassification\(null\);\s*setPlaneWork\(null\);/);
});

test('route change clears the parent classification (engine)', () => {
  const j = journey(DEPENDENT);
  j.round('round1', 'E1E3', 'E1', '3', { x: '6', y: '3', z: '-9', constant: '15' }, 'subtract', { y: '0', z: '0', constant: '0' });
  j.round('round2', 'E1E2', 'E1', '1/2', { x: '1', y: '1/2', z: '-3/2', constant: '5/2' }, 'subtract', { y: '-3/2', z: '5/2', constant: '-9/2' });
  const classified = engine.classifyEliminationOutcome(j.state, j.system, 'infinite').state;
  assert.equal(engine.eliminationPhase(classified, j.system), 'classified');
  const rerouted = engine.resetEliminationRound(classified, 'round2').state;
  assert.equal(rerouted.classification, null);
  assert.equal(engine.eliminationOutcome(rerouted, j.system), null);
});

/* ------------------------------------------- the FINAL file teachers import */

import fs from 'node:fs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const FINAL = 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json';
const finalText = fs.readFileSync(new URL(`../../${FINAL}`, import.meta.url), 'utf8');

test('the FINAL Day 2 file passes the real teacher import chain with zero blocking errors', () => {
  // Raw-JSON preflight skipped the compile step that ignores `type` and
  // routes by studentActions — which is how #390's CW1/PR2 compiled into a
  // broken representationMatch card sort.
  const parsed = parseAssignmentBlueprintText(finalText);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  assert.deepEqual(model.errors, []);
  assert.deepEqual(model.toolContract.errors, []);
  const compiled = model.assignmentV5.sections.flatMap((section) => section.questions);
  for (const id of ['3x3-d2-cw-1', '3x3-d2-pr-2']) {
    const question = compiled.find((entry) => entry.questionId === id);
    assert.deepEqual([question.type, question.mode, question.method], ['systemsWorkspace', 'algebraic', 'elimination'], id);
    assert.equal(question.equations.length, 3, `${id} keeps its three-variable construct`);
    assert.doesNotMatch(question.prompt, /0 = 0|0 = -3|identity|contradiction|dependent|inconsistent|infinitely|no solution|coincident|parallel|statement with no variables/i, `${id} prompt reveals the outcome`);
    assert.equal(question.answerFields, undefined, `${id} classifies through its own algebra, not a duplicate choice item`);
  }
  assert.deepEqual(model.assignmentV5.sections.map((section) => section.recommendedMinutes), [8, 20, 48, 10]);
  assert.match(compiled.find((entry) => entry.questionId === '3x3-d2-cw-1').prompt, /^With your teacher/);
});

test('the V5 working copy is byte-identical to the FINAL import file', () => {
  assert.equal(fs.readFileSync(new URL('../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json', import.meta.url), 'utf8'), finalText);
});

test('PR4 keys the identity/contradiction asymmetry correctly', () => {
  const pr4 = JSON.parse(finalText).sections.flatMap((section) => section.questions).find((entry) => entry.questionId === '3x3-d2-pr-4');
  const [identity, contradiction] = pr4.answerFields;
  assert.match(identity.answer, /only if the remaining equation produces no contradiction/, 'one pair\'s 0 = 0 does not settle the system');
  assert.ok(identity.options.some((option) => /infinitely many solutions, whatever the remaining equation says/.test(option)), 'the overgeneralisation is a distractor');
  assert.match(contradiction.answer, /no solution, whatever the remaining equation says/, 'one pair\'s contradiction does settle it');
});

test('three-plane spatial questions still accept dependent and inconsistent systems', () => {
  const spatial = (equations) => ({ type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'spatial', studentActions: ['connectRepresentations'], equations, variables: XYZ, spatialModel: { kind: 'threePlanes' }, prompt: 'Explore.' });
  for (const equations of [DEPENDENT, INCONSISTENT, UNIQUE]) {
    const result = validateToolQuestion(spatial(equations));
    assert.equal(result.isValid, true, result.errors.join(' | '));
  }
  assert.equal(validateToolQuestion(spatial(['x + y + z = 1', 'x - y = 2'])).isValid, false, 'shape rules still apply');
  assert.equal(validateToolQuestion(spatial(['x*y + z = 1', 'x - y = 2', 'z = 3'])).isValid, false, 'linearity still applies');
});

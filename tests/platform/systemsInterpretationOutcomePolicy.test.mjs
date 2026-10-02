/*
 * ON A DOL, QUIZ OR TEST, INTERPRETING A SYSTEM'S RESULT IS NEVER CHECKED
 * BEFORE SUBMIT.
 *
 * The systems workspace asks a student who eliminated a 3×3 down to an
 * identity or a contradiction to say what kind of statement it is, what it
 * means for the system, and how each pair of planes meets. In practice
 * "Check my classification" and "Check the plane relationships" are verdicts:
 * only a right reading is recorded, only right planes close the step, and only
 * then can the question be submitted. On an exit ticket that is a free,
 * repeatable answer key with three options per select. A 2×2 that reduces to
 * a statement with no variable said "Correct interpretation." the moment its
 * three selects were answered. And a 3D model opened from the result captioned
 * the TRUE outcome ("Your contradiction means no point lies on all three
 * planes") — after a recorded-but-unjudged classification that caption grades
 * it.
 *
 * The policy now lives in pure functions (resolveInterpretationGate and
 * resolveSpecialCaseReport in algebraicOutcomeModel.js; threePlaneRevealAvailable
 * and earnedResultCaption in spatialFeedback.js), tested here as behaviour. The
 * grade is the workspace's shared grader's — the function the server runs
 * (functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs) — tested
 * here on the work the screen sends for the same recorded answers. The
 * components are held to them by the source contracts at the bottom, and the
 * real screens by tests/browser/assessmentLeakGates.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import * as engine from '../../src/tools/systemsWorkspace/eliminationReduction.js';
import { buildReductionSystem } from '../../src/tools/systemsWorkspace/substitutionReduction.js';
import {
  SYSTEM_MEANINGS,
  STATEMENT_KINDS,
  planeTruthFor,
  resolveInterpretationGate,
  resolveSpecialCaseReport,
} from '../../src/tools/systemsWorkspace/algebraicOutcomeModel.js';
import { earnedResultCaption, threePlaneRevealAvailable } from '../../src/tools/systemsWorkspace/spatialFeedback.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// The Day 2 PR2 system: E1 and E2 eliminate to 0 = −3.
const inconsistent = ['3x - y - 2z = 4', '6x - 2y - 4z = 11', '9x - 3y - 6z = 12'];
const question = { equations: inconsistent, variables: ['x', 'y', 'z'] };
const outcome = { type: 'none', statement: '0 = -3' };
const truth = planeTruthFor(question);

const rightClassification = { choice: 'none', kind: 'contradiction' };
const wrongClassification = { choice: 'infinite', kind: 'identity' };
const rightPlanes = { answers: { ...truth }, checked: true };
const wrongPlanes = { answers: { '1-2': 'line', '1-3': 'line', '2-3': 'line' }, checked: true };

const gateFor = ({ showImmediateFeedback, classification = null, planeWork = null } = {}) => resolveInterpretationGate({
  showImmediateFeedback,
  outcome,
  classification,
  planeWork,
  questionData: question,
});

// What a submission of one recorded interpretation is graded: the shared
// grader on the work EliminationReductionMode sends (the recorded choice and
// reading, the stated planes), read back as its two judgments.
const gradeRecorded = (classification, planeWork) => {
  const result = systemsWorkspaceGrader.grade({ type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: inconsistent }, {
    dimension: 3,
    method: 'elimination',
    values: {},
    verification: {},
    outcome: {
      statement: outcome.statement,
      classificationChoice: classification?.choice || '',
      classificationKind: classification?.kind || '',
      planes: planeWork?.answers || {},
    },
  });
  const parts = Object.fromEntries(result.parts.map((part) => [part.id, part]));
  return {
    ...result,
    classification: parts.classification?.isCorrect,
    planes: ['planes-1-2', 'planes-1-3', 'planes-2-3'].every((id) => parts[id]?.isCorrect === true),
  };
};

// Everything on screen that could depend on correctness, for one recorded
// interpretation. The summaries echo the student's own choices by design, so
// they are compared through their shape, not their words.
const observable = (gate, { kind, choice }) => ({
  classified: gate.classified,
  planesDone: gate.planesDone,
  readyToSubmit: gate.readyToSubmit,
  recordsPress: gate.recordsClassification(kind, choice),
  hint: gate.classificationHint(kind, choice),
  planeHint: gate.planeHint,
  summaryEndsGraded: (gate.classificationSummary || '').endsWith('It is graded when you submit.'),
  planeSummaryEndsGraded: (gate.planeSummary || '').endsWith('They are graded when you submit.'),
});

// ---------------------------------------------------------------- fixtures sanity
test('the fixtures are what they claim: one interpretation right everywhere, one wrong everywhere', () => {
  assert.deepEqual(truth, { '1-2': 'parallel', '1-3': 'coincident', '2-3': 'parallel' });
  assert.equal(gateFor({ showImmediateFeedback: true, classification: rightClassification, planeWork: rightPlanes }).readyToSubmit, true);
  assert.equal(gradeRecorded(rightClassification, rightPlanes).isCorrect, true);
  const wrong = gradeRecorded(wrongClassification, wrongPlanes);
  assert.deepEqual([wrong.classification, wrong.planes], [false, false]);
});

// ---------------------------------------------------------------- withheld outcomes
test('where outcomes are withheld, nothing a check shows depends on whether the interpretation is right', () => {
  const right = gateFor({ showImmediateFeedback: false, classification: rightClassification, planeWork: rightPlanes });
  const wrong = gateFor({ showImmediateFeedback: false, classification: wrongClassification, planeWork: wrongPlanes });
  assert.deepEqual(observable(wrong, wrongClassification), observable(right, rightClassification));
  // And the press itself records any complete pair, right or wrong.
  for (const kind of STATEMENT_KINDS.map((option) => option.value)) {
    for (const choice of SYSTEM_MEANINGS.map((option) => option.value)) {
      const gate = gateFor({ showImmediateFeedback: false });
      assert.equal(gate.recordsClassification(kind, choice), true, `${kind}/${choice} is recorded as chosen`);
      assert.equal(gate.classificationHint(kind, choice), null, `${kind}/${choice} gets no nudge`);
    }
  }
  assert.equal(gateFor({ showImmediateFeedback: false }).recordsClassification('identity', ''), false, 'an unfinished pair is not recorded');
});

test('where outcomes are withheld, a recorded classification opens the planes and Submit waits only for both answers', () => {
  const nothing = gateFor({ showImmediateFeedback: false });
  assert.equal(nothing.classified, false);
  assert.equal(nothing.readyToSubmit, false);
  const classifiedWrong = gateFor({ showImmediateFeedback: false, classification: wrongClassification });
  assert.equal(classifiedWrong.classified, true, 'a wrong classification still opens the next step');
  assert.equal(classifiedWrong.readyToSubmit, false, 'the planes are still to be stated');
  const unchecked = gateFor({ showImmediateFeedback: false, classification: wrongClassification, planeWork: { ...wrongPlanes, checked: false } });
  assert.equal(unchecked.planesDone, false, 'choosing is not recording');
  const partial = gateFor({ showImmediateFeedback: false, classification: wrongClassification, planeWork: { answers: { '1-2': 'line' }, checked: true } });
  assert.equal(partial.planesDone, false, 'every pair must be answered');
  const done = gateFor({ showImmediateFeedback: false, classification: wrongClassification, planeWork: wrongPlanes });
  assert.equal(done.planesDone, true);
  assert.equal(done.readyToSubmit, true, 'finished-but-wrong work can be submitted');
});

test('where outcomes are withheld, the summaries are the student\'s own answers and never the earned verdict', () => {
  const gate = gateFor({ showImmediateFeedback: false, classification: wrongClassification, planeWork: wrongPlanes });
  assert.equal(gate.classificationSummary, 'Your classification: Identity (always true); Infinitely many — dependent. It is graded when you submit.');
  assert.match(gate.planeSummary, /^Your plane relationships: Planes 1 and 2 meet in a line\. Planes 1 and 3 meet in a line\. Planes 2 and 3 meet in a line\. They are graded when you submit\.$/);
  const right = gateFor({ showImmediateFeedback: false, classification: rightClassification });
  assert.doesNotMatch(right.classificationSummary, /a contradiction; inconsistent; no solution/, 'the practice wording would read as a verdict');
});

test('where outcomes are withheld, the submission is graded from the recorded answers', () => {
  // Whatever the gate recorded is what the shared grader marks: the same
  // function on the device and on the server.
  const right = gradeRecorded(rightClassification, rightPlanes);
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.equal(right.score, 1);
  assert.deepEqual([right.classification, right.planes], [true, true]);
  const wrong = gradeRecorded(wrongClassification, wrongPlanes);
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0);
  const half = gradeRecorded(rightClassification, wrongPlanes);
  assert.equal(half.isCorrect, false);
  assert.equal(half.score, 0.5);
  assert.deepEqual([half.classification, half.planes], [true, false]);
  // The right meaning read from the wrong kind of statement is not right.
  const misread = gradeRecorded({ choice: 'none', kind: 'origin' }, rightPlanes);
  assert.deepEqual([misread.classification, misread.planes], [false, true]);
  assert.equal(misread.score, 0.5);
  // A forged "checked" flag on wrong planes earns nothing.
  assert.equal(gradeRecorded(rightClassification, { answers: { ...wrongPlanes.answers, checked: true }, checked: true }).planes, false);
});

// ---------------------------------------------------------------- shown outcomes: unchanged practice
test('where outcomes are shown, the checks are the verdicts practice always had', () => {
  const gate = gateFor({ showImmediateFeedback: true });
  assert.equal(gate.recordsClassification('contradiction', 'none'), true);
  assert.equal(gate.recordsClassification('contradiction', 'infinite'), true, 'the right reading records, so the meaning can be nudged');
  assert.equal(gate.recordsClassification('identity', 'none'), false, 'a wrong reading of the statement is never recorded');
  assert.match(gate.classificationHint('identity', 'none'), /Evaluate both sides/);
  assert.match(gate.classificationHint('contradiction', 'infinite'), /Can any ordered triple/);
  assert.equal(gate.classificationHint('contradiction', 'none'), null);

  const wrongMeaning = gateFor({ showImmediateFeedback: true, classification: { choice: 'infinite', kind: 'contradiction' } });
  assert.equal(wrongMeaning.classified, false, 'a recorded wrong meaning keeps the form open');
  const classified = gateFor({ showImmediateFeedback: true, classification: rightClassification });
  assert.equal(classified.classified, true);
  assert.equal(classified.classificationSummary, 'Your classification: a contradiction; inconsistent; no solution.');
  const wrongPlanesShown = gateFor({ showImmediateFeedback: true, classification: rightClassification, planeWork: wrongPlanes });
  assert.equal(wrongPlanesShown.planesDone, false);
  assert.equal(wrongPlanesShown.readyToSubmit, false, 'wrong planes hold Submit');
  assert.match(wrongPlanesShown.planeHint, /Planes 1 and 2/);
  const done = gateFor({ showImmediateFeedback: true, classification: rightClassification, planeWork: rightPlanes });
  assert.equal(done.readyToSubmit, true);
  assert.equal(done.planeHint, null);
  assert.match(done.planeSummary, /^Your plane relationships: Planes 1 and 2 are parallel and distinct\./);
  assert.doesNotMatch(done.planeSummary, /graded when you submit/);
});

test('where outcomes are shown, a record from before kinds were stored still counts (its reading was checked)', () => {
  const legacy = gateFor({ showImmediateFeedback: true, classification: { choice: 'none' } });
  assert.equal(legacy.classified, true);
  assert.equal(gradeRecorded({ choice: 'none' }, rightPlanes).classification, true, 'and it is graded on its choice');
});

test('the default is outcomes shown: a host that never set the flag keeps the practice behaviour', () => {
  const gate = resolveInterpretationGate({ outcome, classification: wrongClassification, questionData: question });
  assert.equal(gate.verdictsShown, true);
  assert.equal(gate.classified, false);
});

// ---------------------------------------------------------------- the engine keeps the reading
const journey = () => {
  const system = buildReductionSystem({ variables: ['x', 'y', 'z'], equations: inconsistent });
  let state = engine.emptyEliminationState();
  const act = (fn, ...args) => { state = engine.repairEliminationState(fn(state, ...args).state, system); return state; };
  act(engine.chooseEliminationVariable, system, 'x');
  act(engine.chooseEliminationPair, system, 'round1', 'E1E2');
  act(engine.setEliminationMultiplierDraft, 'round1', 'E1', '2');
  act(engine.applyEliminationMultiplier, system, 'round1', 'E1');
  for (const [term, value] of Object.entries({ x: '6', y: '-2', z: '-4', constant: '8' })) act(engine.setEliminationMultiplierProductTerm, 'round1', 'E1', term, value);
  act(engine.checkEliminationMultiplierProducts, system, 'round1', 'E1');
  act(engine.setEliminationOperation, 'round1', 'subtract');
  for (const id of state.rounds.round1.pair) act(engine.toggleEliminationCancellation, system, 'round1', id);
  for (const [term, value] of Object.entries({ y: '0', z: '0', constant: '-3' })) act(engine.setEliminationCombinationTerm, 'round1', term, value);
  act(engine.checkEliminationCombination, system, 'round1');
  return { system, act, get state() { return state; } };
};

test('the elimination engine records the student\'s reading with the meaning and keeps it through a restore', () => {
  const j = journey();
  assert.deepEqual(engine.eliminationOutcome(j.state, j.system), outcome);
  j.act(engine.classifyEliminationOutcome, j.system, 'infinite', 'identity');
  assert.deepEqual(j.state.classification, { choice: 'infinite', statement: '0 = -3', kind: 'identity' }, 'repairEliminationState kept the kind');
  assert.equal(engine.eliminationClassificationCorrect(j.state, j.system), false);
  j.act(engine.classifyEliminationOutcome, j.system, 'none', 'origin');
  assert.equal(engine.eliminationClassificationCorrect(j.state, j.system), false, 'the right meaning with the wrong reading is not right');
  j.act(engine.classifyEliminationOutcome, j.system, 'none', 'contradiction');
  assert.equal(engine.eliminationClassificationCorrect(j.state, j.system), true);
  // Without a kind the record looks exactly as before kinds were stored.
  j.act(engine.classifyEliminationOutcome, j.system, 'none');
  assert.deepEqual(j.state.classification, { choice: 'none', statement: '0 = -3' });
  assert.equal(engine.eliminationClassificationCorrect(j.state, j.system), true);
  // An unknown kind is not stored.
  j.act(engine.classifyEliminationOutcome, j.system, 'none', 'banana');
  assert.equal(j.state.classification.kind, undefined);
});

// ---------------------------------------------------------------- the 2×2 statement
test('a 2×2 statement with no variable: a verdict where outcomes are shown, only "recorded" where they are withheld', () => {
  const shownRight = resolveSpecialCaseReport({ showImmediateFeedback: true, answered: true, correct: true });
  const shownWrong = resolveSpecialCaseReport({ showImmediateFeedback: true, answered: true, correct: false });
  assert.deepEqual(shownRight.line, { kind: 'verdict', correct: true });
  assert.deepEqual(shownWrong.line, { kind: 'verdict', correct: false });
  assert.equal(shownRight.stageComplete, true);
  assert.equal(shownWrong.stageComplete, false);
  assert.equal(shownRight.showsCorrect, true);

  const withheldRight = resolveSpecialCaseReport({ showImmediateFeedback: false, answered: true, correct: true });
  const withheldWrong = resolveSpecialCaseReport({ showImmediateFeedback: false, answered: true, correct: false });
  assert.deepEqual(withheldWrong, withheldRight, 'right and wrong answers look the same');
  assert.deepEqual(withheldRight.line, { kind: 'recorded' });
  assert.equal(withheldRight.stageComplete, true, 'the trail ticks a finished interpretation');
  assert.equal(withheldRight.showsCorrect, false, 'nothing turns green');
  assert.equal(resolveSpecialCaseReport({ showImmediateFeedback: false, answered: false }).line, null);
  assert.equal(resolveSpecialCaseReport({ answered: true, correct: true }).line.kind, 'verdict', 'default: outcomes shown');
});

// ---------------------------------------------------------------- the 3D model
test('the 3D model offers a student-pressed reveal only where outcomes are shown and help is allowed', () => {
  const allow = { allowSolutionReveal: true };
  assert.equal(threePlaneRevealAvailable({ spatialModel: allow }), true, 'default: practice');
  assert.equal(threePlaneRevealAvailable({ spatialModel: allow, showImmediateFeedback: false }), false);
  assert.equal(threePlaneRevealAvailable({ spatialModel: allow, hintsAllowed: false }), false);
  assert.equal(threePlaneRevealAvailable({ spatialModel: {} }), false, 'never without the author allowing it');
  assert.equal(threePlaneRevealAvailable({ spatialModel: { revealSolution: true }, showImmediateFeedback: false }), true, 'an authored, already-revealed model is the question\'s content');
  assert.equal(threePlaneRevealAvailable({ spatialModel: allow, earnedResult: { type: 'none' } }), false, 'a model opened from the result has no reveal');
});

test('a model opened from a non-unique result names no outcome where outcomes are withheld', () => {
  for (const type of ['none', 'infinite']) {
    const withheld = earnedResultCaption({ type, showImmediateFeedback: false });
    assert.equal(withheld, 'Rotate the model and hide or show each plane to see how the three planes meet.');
    assert.doesNotMatch(withheld, /contradiction|identity|no point|more than one point/);
  }
  assert.match(earnedResultCaption({ type: 'none' }), /^Your contradiction means no point lies on all three planes/);
  assert.match(earnedResultCaption({ type: 'infinite' }), /^Your identity means the planes share more than one point/);
  assert.equal(earnedResultCaption({ type: 'unique', solutionText: '(1, 2, 3)', showImmediateFeedback: false }), 'Point marked on the model: (1, 2, 3).');
});

// ---------------------------------------------------------------- the components are held to the policy
const outcomeUi = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicOutcome.jsx'));
const parent = executableSource(componentSource('src/tools/systemsWorkspace/EliminationReductionMode.jsx'));
const twoByTwo = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
const spatial = executableSource(componentSource('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx'));

test('the interpretation screen asks the gate what a press records and what to say — it judges nothing itself', () => {
  const submitHandler = region(outcomeUi, 'const submitClassification =', 'const hint =', 'classification submit');
  assert.match(submitHandler, /if \(gate\.recordsClassification\(kind, choice\)\) onClassify\(choice, kind\);/);
  assert.match(outcomeUi, /const hint = attempted \? gate\.classificationHint\(kind, choice\) : null;/);
  assert.match(outcomeUi, /: <p role="status">\{gate\.classificationSummary\}<\/p>\}/);
  assert.match(outcomeUi, /\{planesDone \? <p role="status">\{gate\.planeSummary\}<\/p>/);
  assert.match(outcomeUi, /const planesDone = askPlanes && gate\.planesDone;/);
  assert.match(outcomeUi, /const planeHint = askPlanes \? gate\.planeHint : null;/);
  assert.match(outcomeUi, /const gate = interpretation \|\| resolveInterpretationGate\(/);
  assert.doesNotMatch(outcomeUi, /statementKindCorrect|planeWorkEarned|classificationFeedback|planeRelationshipFeedback/, 'no verdict is computed in the component');
});

test('the elimination screen derives classification and readiness from one gate fed by the runtime policy, and submits the record it reads', () => {
  assert.match(parent, /import \{ useToolRuntimeContext \} from '\.\.\/shared\/ToolRuntimeContext';/);
  assert.match(parent, /\n\s*const \{ showImmediateFeedback \} = useToolRuntimeContext\(\);/);
  const gate = region(parent, 'const interpretation = useMemo(() => resolveInterpretationGate({', '}), [', 'interpretation gate');
  assert.match(gate, /\n\s*showImmediateFeedback,/);
  assert.match(gate, /\n\s*classification: classificationRecord,/);
  assert.match(gate, /\n\s*planeWork,/);
  assert.match(parent, /\n\s*const classified = interpretation\.classified;/);
  assert.match(parent, /\n\s*const planesEarned = Boolean\(outcome && interpretation\.planesDone\);/);
  assert.match(parent, /\n\s*const readyToSubmit = phase === 'complete' \|\| \(phase === 'classified' && planesEarned\);/);
  // The grade is the shared grader's, on the work — never on the fact that a
  // classification was recorded, which on a DOL is all "classified" means.
  const check = region(parent, 'const check = () => {', 'mode: \'algebraic\'', 'check handler');
  assert.match(check, /const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);/);
  assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work,/);
  assert.doesNotMatch(check, /interpretation\.|classified/, 'no verdict of the gate reaches the grade');
  // ...and the work carries the record the gate reads: the choice and the
  // reading the student recorded, not the true type.
  const work = region(parent, 'const recordedClassification =', 'useReportToolWork(work);', 'interpretation work');
  assert.match(work, /^const recordedClassification = classificationRecord\?\.choice \|\| '';/);
  assert.match(work, /\n\s*classificationChoice: recordedClassification,/);
  assert.match(work, /\n\s*classificationKind: classificationRecord\?\.kind \|\| '',/);
  assert.doesNotMatch(work, /outcome\.type/, 'the response is what the student chose, not the true type');
  assert.match(parent, /onClassify=\{\(choice, kind\) => directOutcome\s*\? apply\(classifyEliminationOutcome\(elimination, system, choice, kind\)\)\s*: setSubsystemClassification\(\{ identity: outcomeIdentity, choice, kind \}\)\}/);
  assert.match(parent, /interpretation=\{interpretation\}/);
});

test('the 2×2 statement shows its verdict only through the report', () => {
  assert.match(twoByTwo, /\n\s*const \{ showImmediateFeedback \} = useToolRuntimeContext\(\);/);
  const report = region(twoByTwo, 'const specialCaseReport = resolveSpecialCaseReport({', '});', 'special-case report');
  assert.match(report, /\n\s*showImmediateFeedback,/);
  assert.match(report, /answered: Boolean\(specialCaseAnswered\)/);
  assert.match(report, /correct: Boolean\(specialCaseCorrect\)/);
  const line = region(twoByTwo, "{specialCaseReport.line?.kind === 'verdict' ? (", ') : null}', 'interpretation line');
  assert.match(line, /'Correct interpretation\.'/);
  assert.match(line, /: specialCaseReport\.line\?\.kind === 'recorded' \? \(/);
  assert.equal((twoByTwo.match(/'Correct interpretation\.'/g) || []).length, 1, 'the verdict has no second, ungated copy');
  const trail = region(twoByTwo, "id: 'interpret',", 'summary:', 'interpret trail stage');
  assert.match(trail, /complete: specialCaseReport\.stageComplete,/);
  assert.match(twoByTwo, /summary: specialCaseReport\.showsCorrect\s*\?/);
  assert.match(twoByTwo, /background: specialCaseReport\.showsCorrect \? '#f0fbf4' : '#f3f4f6'/);
  // The grade itself is unchanged: right only when all three answers are. It
  // is the shared grader's, which the screen's Check submits through.
  assert.match(region(twoByTwo, 'const check = () => {', '\n  };', '2×2 check'), /const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);/);
  // The leak-gate 2×2: x + y = 3 and x + y = 5 eliminate to 0 = −2.
  const special = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: ['x + y = 3', 'x + y = 5'], variables: ['x', 'y'] };
  const interpretation = (statementTruth, solutionCount, classification) => systemsWorkspaceGrader.grade(special, {
    dimension: 2, method: 'elimination', values: {}, verification: {}, reducedStatement: '0 = -2',
    specialCase: { statementTruth, solutionCount, classification },
  });
  assert.equal(interpretation('false', 'none', 'inconsistent').isCorrect, true);
  for (const answers of [['true', 'none', 'inconsistent'], ['false', 'infinite', 'inconsistent'], ['false', 'none', 'consistent-dependent']]) {
    const result = interpretation(...answers);
    assert.equal(result.isCorrect, false, answers.join(' / '));
    assert.equal(result.score, 0, `${answers.join(' / ')}: all three or nothing`);
  }
});

test('the 3D model reads the runtime policy for its reveal and its earned caption', () => {
  assert.match(spatial, /\n\s*const \{ showImmediateFeedback, hintsAllowed \} = useToolRuntimeContext\(\);/);
  assert.match(spatial, /\n\s*const canReveal = threePlaneRevealAvailable\(\{ earnedResult, spatialModel, showImmediateFeedback, hintsAllowed \}\);/);
  const caption = region(spatial, '{earnedResult', "'This system could not be classified.'", 'result caption');
  assert.match(caption, /\? earnedResultCaption\(\{ type: shownType, solutionText: [^}]*, showImmediateFeedback \}\)/);
  assert.doesNotMatch(caption, /Your contradiction means|Your identity means/, 'the earned wording lives only in earnedResultCaption');
});

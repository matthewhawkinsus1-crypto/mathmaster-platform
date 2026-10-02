/*
 * THE SURFACES QUESTIONENGINE MOUNTS OUTSIDE THE REGISTRY FOLLOW THE SAME
 * OUTCOME POLICY AS THE REGISTRY TOOLS.
 *
 * Four leaks the audit found outside the systems workspace and the intercept
 * workflow:
 *
 *  1. The relation solver (every inequality solved with step algebra) ends by
 *     asking the student to graph the solution and, above Algebra I, write it
 *     in interval notation, in an embedded IntervalNumberLine. QuestionEngine
 *     mounts the solver directly, with no ToolRuntimeProvider, so the number
 *     line ran on the context's defaults: "Correct" / "Not yet" and a hint
 *     panel on a DOL. Worse, the question was complete only once that check
 *     passed — Submit simply did not appear until the graph was right.
 *  2. After a submitted DOL the solver's "Verified solutions" box appeared only
 *     when the candidate checks were right — a verdict while outcomes are
 *     still withheld.
 *  3. The Constraint-Based Function Builder ticks each constraint green live,
 *     as the student moves a parameter, and every constraint is a graded part:
 *     nudge until every box is green, then submit.
 *  4. The modeling lab is graded on the server when it is submitted and its
 *     player printed "Server-graded modeling result · 73%" with the rubric
 *     feedback on every activity — on a DOL, quiz or test, where every other
 *     question says only "Feedback opens later".
 *
 * And one hint leak: a composed question's algebra step mounts StepByStepAlgebra
 * with no hint props, so it offered "Need a strategic hint?" on a DOL
 * (toolHintPolicy.test.mjs holds the solver to the runtime context).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { solutionRepresentationStageStatus } from '../../src/platform/curriculum/inequalityRepresentationPolicy.js';
import { parseRelationSource } from '../../src/algebraRelationFoundation.js';
import { relationWorkspaceWork, stepAlgebraWorkGrader } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { constraintChecklistView, scoreConstraintModel } from '../../src/tools/constraintFunctionBuilder/constraintFunctionMath.js';
import { modelingLabResultView } from '../../src/components/labs/modelingLabResultView.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// ---------------------------------------------------------------- the number-line stage
test('where outcomes are withheld the graph-your-solution stage is done once checked, right or wrong', () => {
  const status = (representationCorrect) => solutionRepresentationStageStatus({ showImmediateFeedback: false, representationCorrect });
  const right = status(true);
  const wrong = status(false);
  assert.deepEqual({ ...wrong, correct: undefined }, { ...right, correct: undefined }, 'everything but the grade is the same');
  assert.equal(right.done, true);
  assert.equal(wrong.done, true, 'a wrong graph no longer holds Submit back');
  assert.equal(wrong.recordedNotice, true);
  assert.equal(right.correct, true);
  assert.equal(wrong.correct, false, 'it is still graded wrong');
  assert.deepEqual(status(null), { withheld: true, done: false, correct: false, recordedNotice: false }, 'unchecked is unfinished');
});

test('where outcomes are shown the stage is done only once its check passed — the practice behaviour', () => {
  const status = (representationCorrect) => solutionRepresentationStageStatus({ showImmediateFeedback: true, representationCorrect });
  assert.equal(status(true).done, true);
  assert.equal(status(false).done, false);
  assert.equal(status(null).done, false);
  assert.equal(status(false).recordedNotice, false);
  assert.equal(solutionRepresentationStageStatus({ representationCorrect: false }).done, false, 'default: outcomes shown');
});

// The relation solver's verdict is the shared grader's (the function the
// server runs on the same work): 2x + 3 <= 7 solved to x <= 2, then graphed
// and written in interval notation in the embedded number line.
const REPRESENT = { type: 'stepAlgebra', prompt: 'Solve and graph.', equation: '2x + 3 <= 7' };
const graphed = (representation) => stepAlgebraWorkGrader.grade(
  REPRESENT,
  relationWorkspaceWork({ relationState: parseRelationSource('x <= 2', 'x'), representation }),
);
const ray = { intervals: [{ min: -Infinity, max: 2, minClosed: false, maxClosed: true }], notation: '(-\\infty, 2]', inequality: '' };
const openEnd = { intervals: [{ min: -Infinity, max: 2, minClosed: false, maxClosed: false }], notation: '(-\\infty, 2)', inequality: '' };
const representationPart = (result) => result.parts.find((part) => part.id === 'solution-representations');

test('the shared grader finishes the stage once the number line is checked, and grades the graph right or wrong', () => {
  const right = graphed(ray);
  const wrong = graphed(openEnd);
  assert.deepEqual([right.isComplete, right.isCorrect, representationPart(right).isCorrect], [true, true, true]);
  assert.equal(wrong.isComplete, true, 'a wrong graph no longer holds the question open: Submit is not the verdict');
  assert.equal(wrong.isCorrect, false, 'it is still graded wrong');
  assert.deepEqual([representationPart(wrong).isComplete, representationPart(wrong).isCorrect], [true, false]);
  assert.equal(graphed(null).isComplete, false, 'unchecked is unfinished');
  assert.equal(graphed({ intervals: [], notation: '', inequality: '' }).isComplete, false, 'a Check of an empty number line is not an answer');
  assert.equal(graphed({ ...ray, notation: '' }).isComplete, false, 'nor is one with an asked stage left blank');
});

const relation = executableSource(componentSource('src/MultiRelationAlgebraCore.jsx'));
const engine = executableSource(componentSource('src/QuestionEngine.jsx'));

test('the relation solver decides completion and correctness of the stage through the status, fed by the runtime policy', () => {
  assert.match(relation, /import \{ useToolRuntimeContext \} from '\.\/tools\/shared\/ToolRuntimeContext';/);
  assert.match(relation, /\n\s*const \{ showImmediateFeedback, onHintUsed: reportHintUse \} = useToolRuntimeContext\(\);/);
  // The stage status reads the shared grader's own representation part.
  const status = region(relation, 'const representationPart = ', 'useEffect(', 'stage status');
  assert.match(status, /sharedResult\.parts\.find\(\(part\) => part\.id === 'solution-representations'\)/);
  assert.match(status, /const representationStage = solutionRepresentationStageStatus\(\{\s*showImmediateFeedback,\s*representationCorrect: representationPart\?\.isComplete \? representationPart\.isCorrect : null,\s*\}\);/);
  assert.doesNotMatch(relation, /setRepresentationCorrect|representationCorrect ===/, 'no second, local verdict on the graph');
  // The report is the shared grader's verdict; where outcomes are shown it
  // also waits for a right graph, by withholding completion — never granting it.
  const report = region(relation, 'const relationText = relationStateToText(relationState);', 'onRelationDisplayChange?.(relationStateToLatex', 'state report');
  assert.match(report, /const finished = shared\.isComplete && \(!requireRepresentations \|\| representationStage\.done\);/);
  assert.match(report, /\.\.\.\(finished \? \{\} : \{ isComplete: false \}\),/);
  assert.match(report, /responseKey: finished \?/);
  assert.doesNotMatch(report, /isComplete:(?!\s*false\b)/);
});

test('the relation solver records number-line hints and words the withheld stage neutrally', () => {
  const stage = region(relation, '<IntervalNumberLine', '</section>', 'number line stage');
  // The checked WORK is kept for the shared grader, and dropped when the
  // student changes it after its Check (ATTEMPT_WITHDRAWN).
  assert.match(stage, /if \(action === 'ATTEMPT_SUBMITTED'\) \{\s*setRepresentationWork\(payload\?\.response \?\? null\);/);
  assert.match(stage, /if \(action === 'ATTEMPT_WITHDRAWN'\) setRepresentationWork\(null\);/);
  assert.match(stage, /if \(action === 'HINT_USED'\) reportHintUse\?\.\(\);/);
  assert.match(stage, /\{representationStage\.recordedNotice \? \(/);
  const notice = region(stage, '{representationStage.recordedNotice ? (', ') : null}', 'recorded notice');
  assert.doesNotMatch(notice, /orrect|#137333|#e6f4ea/, 'the notice carries no verdict word or colour');
  const verified = region(relation, '{!representationsWithheld && disabled && candidateVerificationComplete && candidateVerificationCorrect && (', ')}', 'verified box');
  assert.match(verified, /Verified solution/);
  assert.equal((relation.match(/Verified solution\{/g) || []).length, 1, 'no second, ungated copy');
});

test('QuestionEngine mounts every algebra solver inside the activity\'s runtime, following showOutcomeFeedback', () => {
  const helper = region(engine, 'const withSolverRuntime = (node) => (', '\n  );', 'solver runtime');
  assert.match(helper, /<ToolRuntimeProvider\b[^>]*\sshowImmediateFeedback=\{showOutcomeFeedback\}/);
  assert.doesNotMatch(helper, /serverGrading/, 'the stage\'s key is the student\'s own solved relation: server grading must not silence it in practice');
  assert.match(helper, /\shintsAllowed=\{toolHintsAllowed\}/);
  assert.match(helper, /\sonHintUsed=\{recordHintUse\}/);
  assert.match(helper, /\squestionTerminal=\{locked\}/);
  assert.match(helper, />\s*\{node\}\s*<\/ToolRuntimeProvider>/);
  const render = region(engine, 'const renderModule = () => {', null, 'renderModule');
  const wrapped = [...render.matchAll(/return withSolverRuntime\(\s*<(\w+)/g)].map((match) => match[1]);
  assert.deepEqual(wrapped, ['MultiRelationAlgebra', 'StepByStepAlgebra', 'StepByStepAlgebra', 'StepByStepAlgebra'],
    'the relation route, the default and legacy `algebra` solvers, and the literal workspace (each can reach the relation solver)');
  assert.doesNotMatch(render, /return \(\s*<(MultiRelationAlgebra|StepByStepAlgebra)\b/, 'no solver mount outside the runtime');
});

test('the relation solver\'s withheld-outcome branch appears only under the runtime\'s policy', () => {
  assert.match(relation, /\n\s*const representationsWithheld = showImmediateFeedback === false;/);
});

// ---------------------------------------------------------------- the constraint checklist
// A family constraint the model below meets, and a vertex constraint it misses.
const constraints = [
  { id: 'family', kind: 'family', value: 'linear' },
  { id: 'yIntercept', kind: 'yIntercept', value: 3 },
];
const right = scoreConstraintModel({ family: 'linear', a: 2, k: 3 }, constraints).parts;
const wrong = scoreConstraintModel({ family: 'linear', a: 2, k: -1 }, constraints).parts;

test('the fixture is what it claims: one model meets both constraints, one misses one', () => {
  assert.deepEqual(right.map((part) => part.isCorrect), [true, true]);
  assert.deepEqual(wrong.map((part) => part.isCorrect), [true, false]);
});

test('where outcomes are withheld the constraint checklist looks the same for every model', () => {
  const view = (parts) => constraintChecklistView({ parts, showImmediateFeedback: false });
  assert.deepEqual(view(wrong), view(right));
  view(right).forEach((item) => {
    assert.equal(item.satisfied, null);
    assert.equal(item.mark, '•');
  });
});

test('where outcomes are shown the checklist ticks live — the practice behaviour', () => {
  const view = constraintChecklistView({ parts: wrong });
  assert.deepEqual(view.map((item) => [item.mark, item.satisfied]), [['✓', true], ['○', false]]);
});

test('the builder renders the checklist from the view, fed by the runtime policy', () => {
  const builder = executableSource(componentSource('src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx'));
  assert.match(builder, /\n\s*const \{ showImmediateFeedback \} = useToolRuntimeContext\(\);/);
  assert.match(builder, /\n\s*const checklist = constraintChecklistView\(\{ parts: liveScore\.parts, showImmediateFeedback \}\);/);
  const list = region(builder, 'Constraint checklist</strong>', 'Submit this model', 'checklist');
  assert.match(list, /\{checklist\.map\(\(item\) => <div key=\{item\.id\}/);
  assert.match(list, /background: item\.satisfied \? '#e6f4ea'/);
  assert.doesNotMatch(list, /liveScore|part\.isCorrect/, 'nothing in the list reads the live score directly');
});

// ---------------------------------------------------------------- the modeling lab's result
const mastered = { isMastered: true, compositeScore: 0.92, feedback: 'Your model fits every trial.', provisional: false };
const notYet = { isMastered: false, compositeScore: 0.41, feedback: 'Your model misses the constraint on h.', provisional: false };

test('where outcomes are withheld the submitted lab says it was submitted, the same for every result', () => {
  const view = (evaluation) => modelingLabResultView({ evaluation, revealEvaluation: false });
  assert.deepEqual(view(notYet), view(mastered));
  assert.deepEqual(view(mastered), { tone: 'withheld', title: 'Modeling lab submitted', detail: 'Your result opens later.' });
  assert.equal(modelingLabResultView({ evaluation: null, revealEvaluation: false }), null, 'nothing before it is submitted');
});

test('where outcomes are shown the lab shows its result exactly as before', () => {
  assert.deepEqual(modelingLabResultView({ evaluation: notYet }), { tone: 'growth', title: 'Server-graded modeling result · 41%', detail: 'Your model misses the constraint on h.' });
  assert.equal(modelingLabResultView({ evaluation: { ...mastered, provisional: true }, revealEvaluation: true }).title, 'Sandbox evaluation · 92%');
  assert.equal(modelingLabResultView({ evaluation: mastered }).tone, 'mastered');
});

test('QuestionEngine hands the lab the activity\'s policy and the lab renders only through the view', () => {
  assert.match(engine, /<InteractiveModelingLabPlayer\b[^>]*\srevealEvaluation=\{showOutcomeFeedback\}/);
  const player = executableSource(componentSource('src/components/labs/InteractiveModelingLabPlayer.jsx'));
  assert.match(player, /\n\s*revealEvaluation = true,\n/);
  assert.match(player, /\n\s*const result = modelingLabResultView\(\{ evaluation, revealEvaluation \}\);/);
  const shown = region(player, '{result ? <div role="status"', ': <button', 'result box');
  assert.match(shown, /\{result\.title\}/);
  assert.doesNotMatch(player, /evaluation\.(compositeScore|feedback|isMastered)/, 'nothing reads the evaluation around the view');
});

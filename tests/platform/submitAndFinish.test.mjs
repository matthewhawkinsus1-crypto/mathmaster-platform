/*
 * STUDENT PASS 3, BATCH 5 — "THE BUTTON THAT SPENDS A TRY, AND HOW A QUESTION
 * ENDS" (docs/handoffs/STUDENT_PASS3_SUBMIT_AND_FINISH.md).
 *
 *   RUN-4   one verb that spends a try, "Submit", carrying its cost; a distinct
 *           last try; a one-try item says so before it is spent; a secure
 *           test's free "Save answer" counts no tries (D9)
 *   RUN-11  the save line says "Draft saved" for a draft and "Answer recorded"
 *           only for an answer the server has
 *   RUN-12  finishing lands on the results page; a section that ends on a miss
 *           gets its complete card; a skipped question is a way back, not a
 *           dead end
 *   RUN-13  "Start this question fresh" works on a closed question
 *   RUN-16  no program words inside the question
 *   polish  one live region per result; Enter and focus after a closed
 *           question; the keypad closes with the question
 *
 * The rules are pure modules; the engine is rendered for real through Vite
 * (helpers/actionBarRender.mjs).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { CHOICE_QUESTION, LITERAL_QUESTION, closeEngine, decode, loadEngine, renderEngine, submitButton } from './helpers/actionBarRender.mjs';
import { missOutcomeText, submitActionLabel, submitLabelForCost, submitTryCost, triesLeftText } from '../../src/platform/student/submitCost.js';
import { ACTIVITY_POLICIES } from '../../src/platform/policies/activityPolicies.js';
import { resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { closedAttemptText } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { describeRuntimeSaveLine, initialSaveSubject, nextSaveSubject } from '../../src/platform/student/saveStatusModel.js';
import { resolveAssignmentHandoff, resolveSkippedQuestion } from '../../src/platform/student/assignmentHandoff.js';
import { closedQuestionEnterAction } from '../../src/platform/interaction/closedQuestionEnter.js';
import { questionModuleFailureKey } from '../../src/platform/runtime/questionModuleFailureKey.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const code = (path) => executableSource(read(path));

after(closeEngine);

/* ------------------------------------------------------------ RUN-4 rules */

const labelsThrough = (maximum) => Array.from({ length: maximum }, (_, used) => submitLabelForCost(submitTryCost({ maximumAttempts: maximum, attemptCount: used })));

test('every activity policy: Submit carries its cost, the last try is its own state, one try says so', () => {
  for (const [role, policy] of Object.entries(ACTIVITY_POLICIES)) {
    for (const question of [LITERAL_QUESTION, CHOICE_QUESTION]) {
      const maximum = resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy });
      const labels = labelsThrough(maximum);
      const where = `${role} ${question.type} (${maximum} ${maximum === 1 ? 'try' : 'tries'})`;
      assert.ok(labels.every((label) => /^Submit — /.test(label)), `${where}: every press that spends a try says Submit and its cost — ${labels}`);
      assert.ok(labels.every((label) => !/attempt|check/i.test(label)), `${where}: "tries", and never "Check" (D9)`);
      if (maximum === 1) {
        assert.deepEqual(labels, ['Submit — your only try'], `${where}: a one-try item says so before it is spent`);
      } else {
        assert.equal(labels[0], `Submit — uses 1 of ${maximum} tries`, where);
        assert.equal(labels.at(-1), 'Submit — last try', `${where}: the last try is named`);
        assert.equal(labels.filter((label) => label === 'Submit — last try').length, 1, `${where}: and only the last`);
        labels.slice(1, -1).forEach((label, index) => assert.equal(label, `Submit — uses 1 of ${maximum - index - 1} tries left`, where));
      }
    }
  }
  // The policies this covers, so a new one cannot slip past the loop above.
  assert.deepEqual(Object.keys(ACTIVITY_POLICIES).sort(), ['classwork', 'corrections', 'dol', 'practice', 'quiz', 'review', 'test', 'warmup']);
});

test('a teacher\'s extra DOL tries are counted; tries that never run out cost nothing to say; a closed question shows no cost', () => {
  const dol = ACTIVITY_POLICIES.dol;
  const maximum = resolveQuestionMaximumAttempts({ question: LITERAL_QUESTION, maximumAttempts: dol.attempts, activityPolicy: dol, teacherGrantedExtraAttempts: 1 });
  assert.deepEqual(labelsThrough(maximum), ['Submit — uses 1 of 2 tries', 'Submit — last try']);
  assert.equal(submitLabelForCost(submitTryCost({ maximumAttempts: 3, attemptCount: 9, attemptsDoNotExpire: true })), 'Submit', 'Live Challenge');
  assert.equal(submitTryCost({ maximumAttempts: 3, remainingAttempts: 0 }).kind, 'none');
  // The phone's short words are part of the accessible name (label in name,
  // WCAG 2.5.3): a student using speech input says what they see.
  for (const [maximum, used] of [[3, 0], [3, 1], [3, 2], [1, 0], [5, 2]]) {
    const cost = submitTryCost({ maximumAttempts: maximum, attemptCount: used });
    assert.ok(submitLabelForCost(cost).includes(cost.short), `${cost.short} in ${submitLabelForCost(cost)}`);
  }
  assert.equal(submitLabelForCost(submitTryCost({ maximumAttempts: 3, remainingAttempts: 0 })), 'Submit');
  // The phone's short words.
  assert.deepEqual(['counted', 'last', 'only'].map((kind) => ({ counted: submitTryCost({ maximumAttempts: 3 }), last: submitTryCost({ maximumAttempts: 3, attemptCount: 2 }), only: submitTryCost({ maximumAttempts: 1 }) })[kind].short), ['1 of 3', 'last try', 'only try']);
});

test('secure tool items: the host names the action, and a navigation-mode save counts no tries', () => {
  const cost = submitTryCost({ maximumAttempts: 1 });
  assert.equal(submitActionLabel({ hostLabel: 'Save answer', cost }), 'Save answer');
  assert.equal(submitActionLabel({ hostLabel: 'Record answer', cost }), 'Record answer');
  assert.equal(submitActionLabel({ hostLabel: 'Record answer', submitting: true, cost }), 'Recording…');
  assert.equal(submitActionLabel({ submitting: true, cost }), 'Submitting…', 'never "Checking…" for the press that spends a try');
  assert.equal(submitActionLabel({ cost }), 'Submit — your only try');
  const runtime = code('src/components/question/RichQuestionRuntime.jsx');
  const mount = region(runtime, '<QuestionEngine', '/>', 'the rich tool item mount');
  assert.match(mount, /submitLabel=\{policy\.secure \? \(navigationMode \? 'Save answer' : 'Record answer'\) : null\}/);
  assert.match(mount, /showTriesCount=\{!navigationMode\}/, 'no "1 of 1 try left" over a free Save answer');
});

test('the words around a try: "tries", never "attempts" or "this version"', () => {
  assert.equal(missOutcomeText(2), 'Not quite. You have 2 tries left.');
  assert.equal(missOutcomeText(1), 'Not quite. You have 1 try left — your last one.');
  assert.equal(triesLeftText({ maximumAttempts: 3, remainingAttempts: 3 }), '3 of 3 tries left');
  assert.equal(triesLeftText({ maximumAttempts: 3, remainingAttempts: 1 }), 'Last try · 1 of 3 left');
  assert.equal(triesLeftText({ maximumAttempts: 1, remainingAttempts: 1 }), 'One try on this question');
  assert.equal(closedAttemptText({ maximumAttempts: 3, reviewAvailable: true }), 'That was your last try (3 in all). Your answer is locked. The worked solution is below.');
  assert.equal(closedAttemptText({ maximumAttempts: 1 }), 'That was your only try. Your answer is locked.');
  const engine = code('src/QuestionEngine.jsx');
  assert.doesNotMatch(engine, /on this version/, 'RUN-16');
  assert.match(region(engine, 'const attemptOutcomeText = feedback', ': \'\';', 'the outcome text'), /: missOutcomeText\(remainingAttempts\)\)\)/);
});

/* ------------------------------------------------- RUN-4 in a registry tool */

test('a registry tool\'s final action says Submit and its cost where it spends a try, and its own words where it does not', async () => {
  const { server } = await loadEngine();
  const { ToolRuntimeProvider, SubmitText, useSubmitLabel, relabelToolPrimaryActions } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Probe = () => React.createElement('span', null, useSubmitLabel('Check construction'), '|', React.createElement(SubmitText, null, 'Check my sort'));
  const render = (props) => renderToStaticMarkup(React.createElement(ToolRuntimeProvider, props, React.createElement(Probe)));
  assert.equal(decode(render({ submitCost: 'uses 1 of 3 tries' })), '<span>Submit — uses 1 of 3 tries|Submit — uses 1 of 3 tries</span>');
  assert.equal(decode(render({ submitCost: 'last try' })), '<span>Submit — last try|Submit — last try</span>');
  assert.equal(decode(render({})), '<span>Check construction|Check my sort</span>', 'a composed stage or the tools lab: a free check');
  assert.equal(decode(render({ submitLabel: 'Record answer', submitCost: 'your only try' })), '<span>Record answer|Record answer</span>', 'the host wins');

  // The Work View rail says what the button says.
  const actions = { primaryActions: [{ id: 'a', label: 'Check graph', onAction() {} }, { id: 'b', label: 'Check x-intercept', onAction() {}, spendsTry: false }] };
  assert.deepEqual(relabelToolPrimaryActions(actions, { submitCost: 'uses 1 of 3 tries' }).primaryActions.map((action) => action.label), ['Submit — uses 1 of 3 tries', 'Check x-intercept']);
  assert.equal(relabelToolPrimaryActions(actions, {}), actions, 'nothing to say: untouched');
  assert.match(code('src/components/common/EnlargeableFigure.jsx'), /const toolCapabilities = useMemo\(\s*\(\) => relabelToolPrimaryActions\(capabilities, \{ submitLabel: hostSubmitLabel, submitCost \}\)[\s\S]{0,120}useWorkViewCapabilities\(toolCapabilities, publishedCapabilities\)/);

  // Only the standalone registry tool records an attempt per press, so only it
  // is told the cost; a composed question's stages and the solver's stage are not.
  const engine = code('src/QuestionEngine.jsx');
  const standalone = region(engine, 'if (missingToolDefinition) {', '</ToolRuntimeProvider>', 'the registry tool provider');
  assert.match(standalone, /submitCost=\{!locked && tryCost\.phrase \? tryCost\.phrase : null\}/);
  assert.doesNotMatch(region(engine, 'if (isComposed) {', '</ToolRuntimeProvider>', 'the composed provider'), /submitCost/);
  assert.doesNotMatch(region(engine, 'const withSolverRuntime', '</ToolRuntimeProvider>', 'the solver provider'), /submitCost/);
});

test('every tool button that spends a try goes through the Submit label (D9)', () => {
  // The buttons that call useToolSubmission's submit (inventoried for this
  // batch). A literal "Check …" on any of them reads as free and is not.
  const files = {
    'openSortBoard/OpenSortBoard.jsx': 1, 'constraintFunctionBuilder/ConstraintFunctionBuilder.jsx': 1, 'sequenceExplorer/SequenceExplorer.jsx': 6,
    'transformations/TransformationsLab.jsx': 6, 'functionOperations/FunctionOperationsLab.jsx': 1, 'exponentialLog/ExponentialLogBridge.jsx': 5,
    'linearTableWorkbench/LinearTableWorkbench.jsx': 1, 'functionInvestigation2/FunctionInvestigation2.jsx': 5, 'representationMatch/RepresentationMatch.jsx': 6,
    'representationBridge/RepresentationBridge.jsx': 1, 'representationBridge/LinearMultipleRepresentationsBoard.jsx': 1, 'signSolutionAnalyzer/SignSolutionAnalyzer.jsx': 2,
    'expressionMeaning/ExpressionMeaning.jsx': 1, 'parabolaGeometry/ParabolaGeometryLab.jsx': 4, 'complexPlane/ComplexPlaneLab.jsx': 6,
    'inverseComposition/InverseDerivationLab.jsx': 1, 'inverseComposition/InverseCompositionLab.jsx': 2, 'polynomialWorkshop/PolynomialWorkshop.jsx': 6,
    'systemsWorkspace/SubstitutionReductionMode.jsx': 1, 'systemsWorkspace/AlgebraicSystemMode.jsx': 1, 'systemsWorkspace/EliminationReductionMode.jsx': 1,
    'systemsWorkspace/ThreePlaneWorkspace.jsx': 1, 'stepAlgebra2/RewriteLinearForm.jsx': 1, 'stepAlgebra2/StepAlgebra2.jsx': 1, 'matrixLab/matrixLabUi.jsx': 1,
  };
  for (const [file, expected] of Object.entries(files)) {
    const source = code(`src/tools/${file}`);
    const wrapped = (source.match(/<SubmitText>/g) || []).length;
    assert.equal(wrapped, expected, `${file}: ${wrapped} of ${expected} final buttons say Submit and their cost`);
    assert.match(source, /import \{[^}]*\bSubmitText\b[^}]*\} from '\.\.\/shared\/ToolRuntimeContext';/, `${file}: imports what it renders`);
  }
  // Free checks keep "Check": the bridge's stage checks, the intercept stage.
  assert.match(code('src/tools/representationBridge/RepresentationBridge.jsx'), /checkStage\(/);
  assert.match(code('src/tools/stepAlgebra2/LinearIntercepts.jsx'), /label: `Check \$\{stageLabel\(kind\)\}`, onAction: checkCurrentIntercept, spendsTry: false/);
});

/* ------------------------------------------------- RUN-4 in the action bar */

test('the action bar: Submit over its cost, the last try amber, one try said before it is spent', async () => {
  const first = submitButton((await renderEngine({ role: 'classwork' })).html);
  assert.equal(first.name, 'Submit — uses 1 of 3 tries');
  assert.equal(first.cost, 'counted');
  assert.doesNotMatch(first.className, /is-last-try/);
  assert.match(first.inner, /<span class="mathmaster-submit-verb">Submit<\/span><span class="mathmaster-submit-cost" aria-hidden="true"><span class="mathmaster-action-label-long">uses 1 of 3 tries<\/span><span class="mathmaster-action-label-short">1 of 3<\/span><\/span>/);

  const lastRender = await renderEngine({ role: 'practice', record: { status: 'attempted', attemptCount: 2, totalAttempts: 2 } });
  const last = submitButton(lastRender.html);
  assert.equal(last.name, 'Submit — last try');
  assert.match(last.className, /\bis-last-try\b/);
  assert.match(decode(lastRender.html), /class="mathmaster-question-attempt-strip" data-last-try="true"[^>]*><strong>Last try · 1 of 3 left<\/strong>/);

  for (const role of ['dol', 'quiz', 'test']) {
    const only = submitButton((await renderEngine({ role })).html);
    assert.equal(only.name, 'Submit — your only try', role);
  }
  const choice = await renderEngine({ role: 'warmup', question: CHOICE_QUESTION });
  assert.equal(submitButton(choice.html).name, 'Submit — your only try', 'a choice item in a 3-try section');
  assert.equal((choice.html.match(/data-one-try-notice=""/g) || []).length, 1, 'Batch 4\'s notice once, not a second one');

  // A secure test's free save: the host's words and no count of tries.
  const secure = await renderEngine({ role: 'test', props: { submitLabel: 'Save answer', showTriesCount: false } });
  assert.equal(submitButton(secure.html).name, 'Save answer');
  assert.doesNotMatch(secure.html, /tries? left|One try on this question/);
  assert.doesNotMatch(secure.html, /mathmaster-question-attempt-strip/);
  const closedSecure = await renderEngine({ role: 'test', props: { submitLabel: 'Save answer', showTriesCount: false, assignmentLocked: true, assignmentLockedMessage: 'The test is paused.' } });
  assert.match(closedSecure.html, /mathmaster-question-attempt-strip[^>]*><strong>The test is paused\.<\/strong>/, 'a lock is still said');
});

/* ------------------------------------------------------------- RUN-11 */

const run = (events, start = initialSaveSubject()) => events.reduce((state, event) => nextSaveSubject(state, typeof event === 'string' ? { type: 'status', status: event } : event), start);
const line = (subject, status, extra = {}) => describeRuntimeSaveLine({ persistenceStatus: status, subject, ...extra });

test('the save line: moving between questions saves a draft, and only a sent answer is ever recorded', () => {
  const navigated = run(['capturing', 'queued', 'durable']);
  // Before it is queued a save cannot tell what it is; an answer is marked once queued.
  assert.equal(line(run(['capturing']), 'capturing'), 'Saving…');
  assert.equal(line(run(['capturing', 'queued']), 'queued'), 'Draft saved on this device. You may keep working.');
  assert.equal(line(navigated, 'durable'), 'Draft saved.', 'not "Recorded by MathMaster" beside an unsubmitted draft');

  const sent = run([{ type: 'answer-sent' }, 'capturing'], navigated);
  assert.equal(line(sent, 'capturing'), 'Saving your answer…');
  assert.equal(line(run(['queued'], sent), 'syncing'), 'Answer saved on this device · sending it to MathMaster. You may keep working.');
  assert.equal(line(run(['offline'], sent), 'offline', { pendingGradeCount: 2 }), 'Waiting for connection · 2 answers saved on this device, not recorded yet.');
  const recorded = run(['queued', 'durable'], sent);
  assert.equal(line(recorded, 'durable'), 'Answer recorded by MathMaster.');
  // The next navigation is a draft again.
  assert.equal(line(run(['capturing', 'queued', 'durable'], recorded), 'durable'), 'Draft saved.');

  // An answer that could not be stored, or was refused, is never called recorded.
  assert.equal(line(run([{ type: 'answer-sent' }, 'capturing', 'volatile', 'capturing', 'queued', 'durable']), 'durable'), 'Draft saved.');
  assert.equal(line(run([{ type: 'answer-sent' }, 'queued', 'rejected', 'queued', 'durable']), 'durable'), 'Draft saved.');
  // Sent while the line still reads the last drain's "durable": the answer is
  // not recorded by that old status, only by the next drain.
  const sentOnDurable = run([{ type: 'answer-sent' }, 'durable'], navigated);
  assert.equal(line(sentOnDurable, 'durable'), 'Draft saved.');
  assert.equal(sentOnDurable.pendingAnswer, true);
  assert.equal(line(run(['capturing', 'queued', 'durable'], sentOnDurable), 'durable'), 'Answer recorded by MathMaster.');
  // An answer sent while the line already read "volatile" is still an answer.
  assert.equal(line(run(['volatile', { type: 'answer-sent' }, 'capturing']), 'capturing'), 'Saving your answer…');

  assert.equal(line(initialSaveSubject(), 'needs-review', { pendingGradeCount: 1 }), 'Needs review · 1 saved item has not been recorded yet. You may keep working.');
  assert.equal(line(initialSaveSubject(), 'needs-review', { outboxDepth: 3 }), 'Needs review · 3 saved items have not been recorded yet. You may keep working.');
  // Batch 3 words these; this model does not.
  // Answers a drain reports still owed are answers — after a reload, offline —
  // and are called recorded once delivered (review of Batch 5).
  const reloaded = run([{ type: 'status', status: 'queued', pendingGradeCount: 2 }]);
  assert.equal(line(reloaded, 'queued', { pendingGradeCount: 2 }), 'Answer saved on this device · sending it to MathMaster. You may keep working.');
  assert.equal(line(initialSaveSubject(), 'syncing', { pendingGradeCount: 1 }), 'Answer saved on this device · sending it to MathMaster. You may keep working.');
  assert.equal(line(run(['durable'], reloaded), 'durable'), 'Answer recorded by MathMaster.');
  // A no-credit practice submit queues nothing: the next move is a draft.
  assert.equal(line(run(['capturing', 'queued', 'durable']), 'durable'), 'Draft saved.');
  assert.equal(line(initialSaveSubject(), 'volatile'), null);
  assert.equal(line(initialSaveSubject(), 'rejected'), null);
});

test('App wires the save line: the model it imports, an answer marked as sent on submit, the line from the model', () => {
  const app = code('src/App.jsx');
  assert.match(app, /import \{ describeRuntimeSaveLine, describeSaveStatus, initialSaveSubject, nextSaveSubject(?:, [A-Za-z]+)* \} from '\.\/platform\/student\/saveStatusModel\.js';/);
  assert.match(app, /const studentSaveSubject = nextSaveSubject\(studentSaveSubjectState, \{ type: 'status', status: studentPersistenceStatus, pendingGradeCount: studentPendingGradeCount \}\);/);
  assert.match(app, /const studentSaveLine = describeRuntimeSaveLine\(\{ persistenceStatus: studentPersistenceStatus, subject: studentSaveSubject,/);
  const mount = region(app, '<QuestionEngine\n              key={`${activeAssignmentId}', '/>', 'the assignment question mount');
  // An answer is marked as sent only once it is in the device queue — the
  // submit and step paths, right after their enqueue — never by pressing
  // Submit (a no-credit practice submit queues nothing).
  assert.match(mount, /onGrade=\{handleGradeSubmit\}/);
  assert.match(mount, /onStepGrade=\{handleStepGrade\}/);
  const queuedAnswer = region(app, "kind: 'ordinarySubmission'", '} catch (error) {', 'the answer enqueue');
  assert.match(queuedAnswer, /\}\)\);\s*(\/\/[^\n]*\n\s*)*markAnswerSent\(\);\s*setStudentOutboxDepth\(\(depth\) => depth \+ 1\);\s*setStudentPersistenceStatus\('queued'\);\s*$/);
  const queuedStep = region(app, "kind: 'stepSubmission'", '} catch (error) {', 'the step enqueue');
  assert.match(queuedStep, /markAnswerSent\(\);\s*setStudentOutboxDepth\(\(depth\) => depth \+ 1\);\s*setStudentPersistenceStatus\('queued'\);\s*$/);
  assert.match(app, /if \(actions\.some\(isGradeBearingAction\)\) markAnswerSent\(\);\s*setStudentPersistenceStatus\('queued'\);/, 'after a reload, a queued answer is an answer');
  assert.match(app, /import \{[^}]*\bisGradeBearingAction\b[^}]*\} from '\.\/platform\/performance\/durableActionOutbox\.js';/);
  assert.match(app, /useEffect\(\(\) => \{\s*setStudentSaveSubject\(initialSaveSubject\(\)\);\s*\}, \[activeAssignmentId, user\?\.id\]\);/, 'per assignment and student');
  // Shown whenever there is a status (and not as a draft line beside Batch 3's
  // unsaved-work notice: draftSaveFailureNotice.test.mjs).
  assert.match(region(app, 'const studentSaveLineShown = ', ';\n', 'when the line shows'), /^const studentSaveLineShown = studentPersistenceStatus !== 'idle'/);
  const saveLine = region(app, '{!preview && studentSaveLineShown && (', '</p>', 'the save line');
  assert.match(saveLine, /\{studentSaveLine\s*\? studentSaveLine\s*: studentPersistenceStatus === 'rejected'/);
  assert.doesNotMatch(saveLine, /Recorded by MathMaster|Syncing ·/);
  // A routine save is not a second announcement of the result: the shown line
  // is not a live region; one always-mounted region says only what needs the
  // student, and only its words change.
  assert.doesNotMatch(saveLine, /role=|aria-live/);
  const region2 = region(app, '{!preview && (\n              <span role="status" aria-live="polite" data-save-line-announcement=""', '</span>', 'the save announcement');
  assert.match(region2, /\{studentSaveLineAnnouncement\}/);
  const said = region(app, 'const studentSaveLineAnnouncement = ', ";\n", 'what is said');
  assert.match(said, /\['offline', 'needs-review'\]\.includes\(studentPersistenceStatus\) \? studentSaveLine \|\| '' : ''/);
  assert.doesNotMatch(said, /volatile/, 'not stored: the question\'s alert says it already');
});

/* ------------------------------------------------------------- RUN-12 */

test('finishing lands on the results page, Up next riding along for it', () => {
  const upNext = { assignment: { id: 'next', title: 'Lesson 2.4' } };
  assert.deepEqual(resolveAssignmentHandoff({ upNext }), { kind: 'results', label: 'your results', upNext });
  assert.deepEqual(resolveAssignmentHandoff({}), { kind: 'results', label: 'your results', upNext: null });
  assert.deepEqual(resolveAssignmentHandoff({ nextIncompleteSection: { role: 'practice' }, nextIncompleteSectionLabel: 'Practice', upNext }), { kind: 'section', label: 'Practice' });
  assert.equal(resolveAssignmentHandoff({ student: false }), null);
  const app = code('src/App.jsx');
  const handoff = region(app, 'const continueAfterSection = !assignmentHandoff', ';\n', 'the hand-off');
  assert.doesNotMatch(handoff, /startAssignment|upNext/, 'the button never opens the next lesson');
  assert.match(handoff, /: \(\) => openStudentAssignmentResult\(activeAssignmentId, \{ origin: 'assignments' \}\)/);
});

test('a skipped question is the way back, named in the student\'s words', () => {
  const entries = [
    { index: 0, role: 'practice', sectionPosition: 0 },
    { index: 1, role: 'practice', sectionPosition: 1 },
    { index: 2, role: 'dol', sectionPosition: 0 },
  ];
  const base = { entries, currentIndex: 1, currentRole: 'practice', isComplete: (index) => index === 1, sectionLabelOf: (role) => (role === 'dol' ? 'Exit ticket (DOL)' : 'Practice') };
  assert.deepEqual(resolveSkippedQuestion(base), { index: 0, label: 'Go back to Practice Q1 (not answered)' });
  assert.equal(resolveSkippedQuestion({ ...base, attemptCountOf: () => 1 }).label, 'Go back to Practice Q1 (not finished)');
  assert.deepEqual(resolveSkippedQuestion({ ...base, isComplete: (index) => index !== 2, isWorkable: () => true }), { index: 2, label: 'Go back to Exit ticket (DOL) Q1 (not answered)' });
  assert.equal(resolveSkippedQuestion({ ...base, isWorkable: (entry) => entry.role !== 'practice' || entry.index === 1, isComplete: (index) => index !== 2 }).index, 2);
  // This section's own skipped question comes before an earlier section's.
  const twoSections = [
    { index: 0, role: 'practice', sectionPosition: 0 },
    { index: 1, role: 'dol', sectionPosition: 0 },
    { index: 2, role: 'dol', sectionPosition: 1 },
  ];
  assert.deepEqual(resolveSkippedQuestion({ ...base, entries: twoSections, currentIndex: 2, currentRole: 'dol', isComplete: (index) => index === 2 }), { index: 1, label: 'Go back to Exit ticket (DOL) Q1 (not answered)' });
  assert.equal(resolveSkippedQuestion({ ...base, isComplete: () => true }), null, 'nothing left: no way back');
  assert.equal(resolveSkippedQuestion({ ...base, isWorkable: (entry) => entry.index === 1 }), null, 'a locked DOL is not offered');

  const app = code('src/App.jsx');
  assert.match(app, /import \{ resolveAssignmentHandoff, resolveSkippedQuestion \} from '\.\/platform\/student\/assignmentHandoff\.js';/);
  const skipped = region(app, 'const skippedQuestion = ', '      : null;', 'the skipped question');
  assert.match(skipped, /^const skippedQuestion = !nextQuestionEntry && !currentNavigationSection\?\.complete\s*\? resolveSkippedQuestion\(\{/);
  assert.match(skipped, /isWorkable: entryIsWorkableNow,/);
  const mount = region(app, '<QuestionEngine\n              key={`${activeAssignmentId}', '/>', 'the assignment question mount');
  assert.match(mount, /onGoBackToQuestion=\{skippedQuestion \? \(\) => changeQuestion\(skippedQuestion\.index\) : null\}/);
  assert.match(mount, /goBackLabel=\{skippedQuestion\?\.label \|\| ''\}/);
});

const closedProps = { sectionLabel: 'Practice', sectionQuestionCount: 2 };

test('a section that ends on a miss gets its complete card, after the worked solution, and the bar goes to the results', async () => {
  const { html } = await renderEngine({
    role: 'practice',
    record: { status: 'expired', attemptCount: 3, totalAttempts: 3 },
    props: { ...closedProps, sectionComplete: true, onContinueSection: () => {}, continueSectionLabel: 'your results' },
  });
  const card = html.indexOf('mathmaster-section-completion-card');
  assert.ok(card > 0, 'the complete card shows at any accuracy');
  assert.ok(html.indexOf('data-closed-question-card') < card, 'after the closed card');
  assert.match(decode(html), /PRACTICE(<!-- -->)? COMPLETE/);
  assert.match(decode(html), /class="mathmaster-bar-continue" data-way-on="continue" aria-label="Continue to your results →"/);
  const cardTag = html.slice(html.lastIndexOf('<section', card), html.indexOf('>', card));
  assert.doesNotMatch(cardTag, /role="status"/, 'not a second live region');
});

test('nothing ahead and a question skipped: the bar and a card offer the way back, with the Enter shortcut', async () => {
  const label = 'Go back to Practice Q1 (not answered)';
  const { html } = await renderEngine({
    role: 'practice',
    record: { status: 'correct', attemptCount: 1, totalAttempts: 1 },
    props: { ...closedProps, onGoBackToQuestion: () => {}, goBackLabel: label },
  });
  const text = decode(html);
  assert.match(text, /class="mathmaster-bar-continue" data-way-on="back" aria-label="Go back to Practice Q1 \(not answered\)"/);
  assert.match(text, /<span class="mathmaster-action-label-short">Go back<\/span>/, 'the phone\'s short words: the start of its name (label in name)');
  assert.match(text, /class="mathmaster-go-back-question"[\s\S]*?Go back to Practice Q1 \(not answered\)[\s\S]*?Shortcut: press Enter again to continue\./);
  // With a Next, no way back is offered.
  const withNext = await renderEngine({ role: 'practice', record: { status: 'correct', attemptCount: 1 }, props: { ...closedProps, onNextQuestion: () => {}, onGoBackToQuestion: () => {}, goBackLabel: label } });
  assert.doesNotMatch(withNext.html, /mathmaster-go-back-question|data-way-on="back"/);
});

/* ---------------------------------------------- live regions, Enter, focus */

test('one live region per result: the strip, the watermark and the closed chip are not regions', async () => {
  const closed = await renderEngine({ role: 'classwork', record: { status: 'expired', attemptCount: 3, totalAttempts: 3 }, props: { ...closedProps, onNextQuestion: () => {} } });
  assert.equal((closed.html.match(/role="status"/g) || []).length, 1, 'a final miss: the closed card says it once');
  assert.match(closed.html, /data-closed-question-card=""[^>]*>[\s\S]{0,80}<div role="status"/);
  assert.match(closed.html, /class="mathmaster-closed-verdict"/, 'the chip is still shown');
  const correct = await renderEngine({ role: 'classwork', record: { status: 'correct', attemptCount: 1 }, props: { onNextQuestion: () => {} } });
  assert.doesNotMatch(correct.html, /role="status"[^>]*>[^<]*(Question complete|Correct)|aria-label="Correct answer"/);
  assert.match(correct.html, /aria-hidden="true" data-correct-watermark=""/);
  const engine = code('src/QuestionEngine.jsx');
  // The milestone is said inside the result's own region.
  assert.match(engine, /const sectionMilestoneWords = locked && sectionComplete && \(isCorrect \|\| isExpired\) \? `\$\{sectionLabel \|\| 'Section'\} complete\.` : '';/);
  assert.equal((engine.match(/\{sectionMilestoneWords \? <span style=\{VISUALLY_HIDDEN\}> \{sectionMilestoneWords\}<\/span> : null\}/g) || []).length, 3, 'outcome, closed card, held feedback');
});

test('Enter and focus after a closed question: the shortcut is live wherever its hint is, and focus goes on', () => {
  const engine = code('src/QuestionEngine.jsx');
  const shortcut = region(engine, 'const nextAction = closedQuestionWayOn?.onClick || null;', '}, [locked, closedQuestionWayOn', 'the Enter shortcut');
  assert.match(shortcut, /const canAdvance = Boolean\(locked && nextAction && !scratchpadOpen && !unchangedConfirmOpen\);/, 'every locked question with a way on, not only a correct one');
  assert.match(shortcut, /if \(closedQuestionEnterAction\(event\.target\) !== 'advance'\) return;/, 'another control keeps its Enter');
  const focus = region(engine, 'const was = wasLockedRef.current;', '}, [locked, assignmentLocked', 'focus on lock');
  assert.match(focus, /if \(was !== false \|\| !locked \|\| assignmentLocked \|\| typeof window === 'undefined'\) return undefined;/, 'only on the change to closed');
  assert.match(focus, /isExpired && showOutcomeFeedback && closedCardRef\.current\s*\? closedCardRef\.current\s*: continueButtonRef\.current;/);
  // Not taken from the student: a press or key since, or focus they moved elsewhere, wins.
  assert.match(focus, /if \(focusAuthority\.generation !== ticket\.generation \|\| focusAuthority\.interactions !== ticket\.interactions\) return;/);
  assert.match(focus, /const ours = !active \|\| active === document\.body \|\| active === continueButtonRef\.current \|\| active === submitButtonRef\.current;\s*if \(!ours\) return;/);
  assert.match(engine, /<section ref=\{closedCardRef\} tabIndex=\{-1\} className="mathmaster-closed-question-card"/);
  assert.match(engine, /<button\s+ref=\{continueButtonRef\}\s+type="button"\s+className="mathmaster-bar-continue"/);
  // The way on is one rule for the bar, the shortcut and the cards.
  assert.match(engine, /const barContinueAction = closedQuestionWayOn;/);
});

/* --------------------------------------------- RUN-13, RUN-16, the keypad */

test('"Start this question fresh" works on a closed question, asks first, and shows no raw error', async () => {
  const { server } = await loadEngine();
  const Boundary = (await server.ssrLoadModule('/src/QuestionModuleBoundary.jsx')).default;
  const reported = [];
  const boundary = new Boundary({ questionType: 'literal', context: {}, onRecover() {}, onFailureChange: (failed) => reported.push(failed), resetKey: 'a' });
  boundary.state = Boundary.getDerivedStateFromError(new Error('Cannot read properties of undefined (reading x)'));
  const quiet = console.error;
  console.error = () => {};
  try { boundary.componentDidCatch(boundary.state.error, {}); } finally { console.error = quiet; }
  assert.deepEqual(reported, [true], 'the engine is told, so the panel is not inside a disabled area');
  const markup = decode(renderToStaticMarkup(boundary.render()));
  assert.match(markup, /Start this question fresh/);
  assert.match(markup, /Copy details for your teacher/);
  assert.doesNotMatch(markup, /Details for your teacher:|Cannot read properties|literal/, 'no raw error, no type name (RUN-16)');
  boundary.props = { ...boundary.props, resetKey: 'b' };
  boundary.setState = () => {};
  boundary.componentDidUpdate({ ...boundary.props, resetKey: 'a' });
  assert.deepEqual(reported, [true, false]);

  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /const workAreaClosed = !moduleFailed && Boolean\(locked \|\| scaffoldRequired \|\| contextScaffoldRequired \|\| submitting \|\| pausedByAnotherTab\);/);
  assert.match(engine, /<fieldset disabled=\{workAreaClosed\}/);
  assert.match(engine, /inert=\{workAreaClosed \? true : undefined\}/);
  // The failure is the failed module's (its key and its question), not the mount's.
  assert.match(engine, /const moduleFailureKey = questionModuleFailureKey\(\{ boundaryKey: moduleBoundaryKey, questionId: question\?\.questionId \?\? question\?\.id, draftKey \}\);/);
  assert.match(engine, /const moduleFailed = failedModule !== null && failedModule\.key === moduleFailureKey && failedModule\.question === processedQuestion;/);
  assert.match(engine, /onFailureChange=\{\(failed\) => setFailedModule\(failed \? \{ key: moduleFailureKey, question: processedQuestion \} : null\)\}/);
  assert.match(engine, /resetKey=\{moduleFailureKey\}/);
  // The paths the product takes (a remount under a new key; the next item
  // under an unkeyed engine) are driven in tests/browser/moduleRecoveryLock.mjs.
  const recover = region(engine, 'const handleRecoverQuestionModule = async () => {', '\n  };', 'recovery');
  assert.ok(recover.indexOf('await confirmAction(') < recover.indexOf('quarantineQuestionDraftFamily('), 'asked before anything is set aside');
  assert.match(recover, /if \(!proceed\) return;/);
  assert.ok(recover.indexOf('setFailedModule(null)') !== -1 && recover.indexOf('setFailedModule(null)') < recover.indexOf('setQuestionResetVersion('), 'recovery clears the failure before the module remounts');
  assert.doesNotMatch(recover, /attemptCount|onGrade|setRecord/, 'the tries are untouched');
});

test('each module has its own failure key, also where My Math Path gives items nothing else to tell them apart', () => {
  // PathSessionPlayer.jsx: no generationKey, a record without variantIndex, a
  // question with no id, and the reset version back to 0 for each item. Only
  // the draft key (`path-${questionInstanceId}`) differs.
  const pathBoundary = 'undefined|undefined|reset-0';
  const item1 = questionModuleFailureKey({ boundaryKey: pathBoundary, questionId: undefined, draftKey: 'path-qi-1' });
  const item2 = questionModuleFailureKey({ boundaryKey: pathBoundary, questionId: undefined, draftKey: 'path-qi-2' });
  assert.notEqual(item1, item2, "item 2 must not inherit item 1's failure");
  // App: the question id and the boundary key tell modules apart too.
  const app = (overrides) => questionModuleFailureKey({ boundaryKey: 'gen-1|0|reset-0', questionId: 'q1', draftKey: 'a1:q1', ...overrides });
  assert.notEqual(app({}), app({ questionId: 'q2' }));
  assert.notEqual(app({}), app({ boundaryKey: 'gen-1|0|reset-1' }), 'a fresh start is a new module');
  assert.equal(app({}), app({}), 'the same module keeps its key across renders');
  assert.equal(new Set([item1, item2, app({}), app({ questionId: 'q2' }), app({ boundaryKey: 'gen-1|0|reset-1' })]).size, 5);
});

test('program words are gone from the question (RUN-16)', async () => {
  const engine = code('src/QuestionEngine.jsx');
  assert.doesNotMatch(engine, /Productive struggle scaffold|Details for your teacher/);
  assert.match(engine, /<section ref=\{scaffoldRef\} role="region" aria-label="Let's back up" data-scaffold=""/);
  assert.match(code('src/MultiAnswerGrader.jsx'), /\{question\.heading \|\| \(safeFields\.length > 1 \? 'Complete Each Part' : 'Your answer'\)\}/);
});

test('the math keypad closes with the question, and stays for the practice beside it', async () => {
  const { server } = await loadEngine();
  const MathInput = (await server.ssrLoadModule('/src/MathInput.jsx')).default;
  const { QuestionLifecycleProvider } = await server.ssrLoadModule('/src/platform/question/QuestionLifecycleContext.jsx');
  const render = (terminal) => renderToStaticMarkup(React.createElement(QuestionLifecycleProvider, { terminal },
    React.createElement(MathInput, { value: '', onChange() {}, showToolsInitially: true, ariaLabel: 'Answer' })));
  assert.match(render(false), /aria-label="Math tools"/, 'an open question keeps its keypad');
  assert.doesNotMatch(render(true), /aria-label="Math tools"/, 'a closed one does not');
  const engine = code('src/QuestionEngine.jsx');
  assert.match(region(engine, 'const practiceLikeThis = practiceOffered ? (', ') : null;', 'the practice'), /<QuestionLifecycleProvider terminal=\{false\}>\s*<PracticeLikeThis/);
});

/* A minimal element for closedQuestionEnterAction: closest() over the simple
 * selectors it uses — tag, .class, [attr], [attr="v"], tag[attr], and
 * [attr]:not([attr="v"]) — walking up the parents, as the DOM does. */
const matchesSimple = (element, selector) => {
  const not = selector.match(/^(.*):not\((.*)\)$/);
  if (not) return matchesSimple(element, not[1]) && !matchesSimple(element, not[2]);
  const parts = selector.match(/^([a-z-]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/);
  if (!parts) return false;
  const [, tag, classes, attrs] = parts;
  if (tag && element.tag !== tag) return false;
  for (const name of classes.split('.').filter(Boolean)) if (!(element.className || '').split(' ').includes(name)) return false;
  for (const [, name, value] of attrs.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    if (!(name in (element.attrs || {}))) return false;
    if (value !== undefined && String(element.attrs[name]) !== value) return false;
  }
  return true;
};
const el = (tag, { className = '', attrs = {}, parent = null } = {}) => {
  const node = { tag, className, attrs, parent };
  node.closest = (selector) => {
    const alternatives = selector.split(',').map((part) => part.trim());
    for (let current = node; current; current = current.parent) if (alternatives.some((alt) => matchesSimple(current, alt))) return current;
    return null;
  };
  return node;
};

test('Enter on a closed question goes on only from the page or plain content; every control keeps its own Enter', () => {
  const card = el('section', { className: 'mathmaster-closed-question-card', attrs: { tabindex: '-1' } });
  const solution = el('p', { parent: el('div', { parent: card }) });
  assert.equal(closedQuestionEnterAction(el('body')), 'advance', 'the page');
  assert.equal(closedQuestionEnterAction(card), 'advance', 'the closed card focus lands on');
  assert.equal(closedQuestionEnterAction(solution), 'advance', 'the worked solution\'s text');
  const kept = {
    'a focused button (Request New Question)': el('button', { parent: card }),
    'a <summary> ("See why it works", "The hint you read")': el('summary', { parent: el('details', { parent: card }) }),
    'text inside a <summary>': el('span', { parent: el('summary') }),
    'a practice box': el('input', { parent: card }),
    'a math field': el('math-field'),
    'a select': el('select'),
    'a link': el('a', { attrs: { href: '#x' } }),
    'a tab': el('div', { attrs: { role: 'tab' } }),
    'a radio': el('span', { attrs: { role: 'radio' } }),
    'an option': el('li', { attrs: { role: 'option' } }),
    'a checkbox widget': el('div', { attrs: { role: 'checkbox' } }),
    'a slider': el('div', { attrs: { role: 'slider' } }),
    'an element put in the Tab order': el('div', { attrs: { tabindex: '0' } }),
    'a field that owns Enter': el('div', { attrs: { 'data-mm-enter-owner': 'field' } }),
    'contenteditable': el('div', { attrs: { contenteditable: 'true' } }),
  };
  for (const [name, target] of Object.entries(kept)) assert.equal(closedQuestionEnterAction(target), 'control', name);
  for (const className of ['mathmaster-bar-continue', 'mathmaster-success-next-question', 'mathmaster-section-completion-continue', 'mathmaster-go-back-question']) {
    assert.equal(closedQuestionEnterAction(el('button', { className })), 'own', `${className}: its own click goes on, once`);
    assert.equal(closedQuestionEnterAction(el('span', { parent: el('button', { className }) })), 'own');
  }
  // An <a> with no href is not a link; a tabindex of -1 is focus-only.
  assert.equal(closedQuestionEnterAction(el('a')), 'advance');
  assert.equal(closedQuestionEnterAction(el('div', { attrs: { tabindex: '-1' } })), 'advance');
});

test('a closed question names no cost on its tool\'s inert button', () => {
  const engine = code('src/QuestionEngine.jsx');
  const standalone = region(engine, 'if (missingToolDefinition) {', '</ToolRuntimeProvider>', 'the registry tool provider');
  assert.match(standalone, /submitCost=\{!locked && tryCost\.phrase \? tryCost\.phrase : null\}/);
});

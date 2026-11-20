// PRE-FLIGHT NOTES A PROMPT THAT SENDS STUDENTS TO A GRAPHING CALCULATOR THE
// QUESTION DOES NOT GIVE THEM (#554 item 6; #383's authoring observation on
// Algebra I DOL #2: "enter f(x) into the built-in graphing calculator", and a
// keypad with nowhere to enter a function).
//
// What is judged is the calculator a student actually gets on that question,
// resolved as App gives it to the student assignment's QuestionEngine — the
// question's own setting, the section's role, the lesson's setting, "inherit"
// and "teacherChoice" — never the setting's name. A lesson set to "Graphing"
// still leaves an exit-ticket question with no setting of its own on the basic
// keypad (calculatorPolicy.js: on a DOL, quiz or test the lesson can only make
// it stricter). The note is ADVICE in its own panel and names the change that
// works, tried through the same resolver. The library sweep is in
// promptPreflightLibrarySweep.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assignmentStudentCalculator,
  auditAssignmentGraphingCalculatorPrompts,
  graphingCalculatorFix,
  graphingCalculatorInstruction,
  graphingCalculatorPromptWarning,
} from '../../src/platform/preflight/graphingCalculatorPromptPreflight.js';
import { CALCULATOR_MODES, resolveCalculatorPolicy } from '../../src/platform/policies/calculatorPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { AUTHORING_STATES } from '../../src/platform/preflight/authoringStates.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { appFactorySource } from './helpers/appScreens.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const GRAPH_PROMPT = 'Enter f(x) = x² − 4x + 3 into the built-in graphing calculator and find its zeros.';
const item = (extra = {}) => ({ type: 'multiAnswer', prompt: GRAPH_PROMPT, answerFields: [{ id: 'z', label: 'Zeros', answer: '1, 3' }], ...extra });
const lesson = (calculator) => ({ toolPolicy: { calculator } });
const warningsFor = (question, calculator, role) => auditAssignmentGraphingCalculatorPrompts(lesson(calculator), [{ ...question, activityRole: role }]).warnings;

test('a prompt that tells students to use a graphing calculator is recognised, and only that', () => {
  for (const text of [
    GRAPH_PROMPT,
    'Use the graphing calculator to find the vertex.',
    'With a graphing calculator, find the zeros.',
    'Graph both equations on your graphing calculator.',
    'A graphing calculator is allowed on this question.',
    'Students may use a graphing calculator.',
    'Solve by hand, then check with a graphing calculator.',
    'Solve it with no calculator first, then check with a graphing calculator.',
    'Use a graphing utility to estimate the solution.',
    'Then put f(x) into the graphing calculator.',
  ]) assert.ok(graphingCalculatorInstruction(text), text);
  for (const text of [
    // Told not to, or only if they have one.
    'Solve without a graphing calculator.',
    'Do not use a graphing calculator.',
    "Don't use the graphing calculator for this one.",
    'No graphing calculator is allowed.',
    'A graphing calculator is not allowed on this question.',
    'Use the table, not a graphing calculator.',
    'If you have a graphing calculator, check your answer.',
    'If available, use a graphing calculator to check.',
    '(Optional) Check with a graphing calculator.',
    // Someone else's, or a description.
    'Ben graphed y = x² on his graphing calculator and saw a U shape. Is he right?',
    'Maria used a graphing calculator and found x = 2.',
    "Maria's graphing calculator shows two zeros. Explain why.",
    // ... also when the same sentence asks the student something about it.
    "Explain why Ben's graphing calculator shows two zeros.",
    'Maria says you should use a graphing calculator here. Is she right?',
    'Explain what Maria saw when she graphed f(x) on her graphing calculator.',
    'Decide whether Jamal entered the function into his graphing calculator correctly.',
    'On a graphing calculator, the graph of y = x² looks like a U.',
    // Not a graphing calculator: the question's own graphing tool, technology, a calculator.
    'Use the graphing tool to draw the line.',
    'Solve it with technology and report the answer.',
    'Use the calculator to evaluate the power.',
  ]) assert.equal(graphingCalculatorInstruction(text), null, text);
});

test('the calculator judged is the one a student gets, as App resolves it for the student QuestionEngine', () => {
  const cases = [
    // [question, lesson setting, role, the mode a student gets, drawn as a graphing calculator?]
    [{}, 'inherit', 'classwork', 'basic', false],
    [{}, 'graphing', 'classwork', 'graphing', true],
    [{}, 'graphing', 'warmup', 'graphing', true],
    [{ calculatorPolicy: 'scientific' }, 'graphing', 'practice', 'scientific', false],
    [{ calculatorPolicy: 'graphing' }, 'inherit', 'practice', 'graphing', true],
    // An exit ticket, quiz or test: the lesson can narrow a question's calculator, never widen it.
    [{}, 'graphing', 'dol', 'basic', false],
    [{}, 'graphing', 'quiz', 'basic', false],
    [{}, 'graphing', 'test', 'basic', false],
    [{ calculatorPolicy: 'graphing' }, 'inherit', 'dol', 'graphing', true],
    [{ calculatorPolicy: 'graphing' }, 'scientific', 'dol', 'scientific', false],
    [{ calculatorPolicy: 'graphing' }, 'none', 'quiz', 'none', false],
    // "teacherChoice": an assignment never sends a teacher's choice.
    [{ calculatorPolicy: 'teacherChoice' }, 'inherit', 'classwork', 'none', false],
    [{ calculatorPolicy: 'teacherChoice' }, 'graphing', 'classwork', 'graphing', true],
    [{}, 'teacherChoice', 'classwork', 'basic', false],
    // A skill assessed without a calculator keeps none.
    [{ calculatorPolicy: 'none' }, 'graphing', 'classwork', 'none', false],
    [{ calculatorMode: 'none' }, 'graphing', 'classwork', 'none', false],
  ];
  for (const [own, calculator, role, mode, graphing] of cases) {
    const got = assignmentStudentCalculator(own, { lessonCalculator: calculator, role });
    assert.deepEqual([got.mode, got.graphing], [mode, graphing], JSON.stringify({ own, calculator, role }));
    // The same answer resolveCalculatorPolicy gives App's QuestionEngine (no assessment
    // context, no teacher's choice), so this cannot drift from what students get.
    const policy = resolveCalculatorPolicy({ questionSpec: own, activityPolicy: getEffectiveActivityPolicy(role), assignmentCalculatorMode: calculator });
    assert.equal(got.graphing, policy.available && policy.mode === CALCULATOR_MODES.GRAPHING);
  }
});

test('the note follows the calculator a student gets, not the setting\'s name', () => {
  // "Graphing" for the lesson, and still the basic keypad on an exit ticket.
  assert.deepEqual(warningsFor(item(), 'graphing', 'dol'), [
    'Question 1 tells students to use a graphing calculator, but they get the basic calculator on this question, which cannot graph. Give this question its own graphing calculator ("calculatorPolicy": "graphing"), or change the prompt\'s wording.',
  ]);
  // "Each question's own" for the lesson, and a graphing calculator from the question.
  assert.deepEqual(warningsFor(item({ calculatorPolicy: 'graphing' }), 'inherit', 'dol'), []);
  assert.deepEqual(warningsFor(item(), 'graphing', 'classwork'), []);
  assert.deepEqual(warningsFor(item(), 'inherit', 'classwork'), [
    'Question 1 tells students to use a graphing calculator, but they get the basic calculator on this question, which cannot graph. Set "Calculator for this lesson" to Graphing, or change the prompt\'s wording.',
  ]);
  assert.deepEqual(warningsFor(item({ calculatorPolicy: 'scientific' }), 'graphing', 'practice'), [
    'Question 1 tells students to use a graphing calculator, but they get the scientific calculator on this question, which cannot graph. Give this question its own graphing calculator ("calculatorPolicy": "graphing"), or change the prompt\'s wording.',
  ]);
  assert.deepEqual(warningsFor(item({ calculatorPolicy: 'teacherChoice' }), 'inherit', 'practice'), [
    'Question 1 tells students to use a graphing calculator, but they get no calculator on this question. Set "Calculator for this lesson" to Graphing, or change the prompt\'s wording.',
  ]);
  assert.deepEqual(warningsFor(item({ calculatorMode: 'none' }), 'graphing', 'practice'), [
    'Question 1 tells students to use a graphing calculator, but they get no calculator on this question. Change the prompt\'s wording.',
  ]);
  // No prompt naming one, no note, whatever the calculator.
  assert.deepEqual(warningsFor(item({ prompt: 'Find the zeros of f(x) = x² − 4x + 3.' }), 'none', 'dol'), []);
});

test('the change the note names is one that gives the question a graphing calculator', () => {
  const ROLES = ['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test', 'review'];
  const OWN = [undefined, 'inherit', 'none', 'basic', 'squareRoot', 'scientific', 'graphing', 'teacherChoice'];
  const LESSON = [null, 'inherit', 'none', 'basic', 'squareRoot', 'scientific', 'graphing', 'teacherChoice', 'questionSpecific'];
  let warned = 0;
  for (const role of ROLES) {
    for (const own of OWN) {
      for (const calculator of LESSON) {
        const question = item(own === undefined ? {} : { calculatorPolicy: own });
        const student = assignmentStudentCalculator(question, { lessonCalculator: calculator, role });
        const [warning] = warningsFor(question, calculator, role);
        // A note exactly when the student cannot graph.
        assert.equal(Boolean(warning), !student.graphing, JSON.stringify({ role, own, calculator }));
        if (!warning) continue;
        warned += 1;
        const fix = graphingCalculatorFix(question, { lessonCalculator: calculator, role });
        const fixed = {
          lesson: () => assignmentStudentCalculator(question, { lessonCalculator: 'graphing', role }),
          own: () => assignmentStudentCalculator({ ...question, calculatorPolicy: 'graphing' }, { lessonCalculator: calculator, role }),
          both: () => assignmentStudentCalculator({ ...question, calculatorPolicy: 'graphing' }, { lessonCalculator: 'graphing', role }),
        }[fix];
        assert.ok(fixed, `a fix is named for ${JSON.stringify({ role, own, calculator })}`);
        assert.equal(fixed().graphing, true, JSON.stringify({ role, own, calculator, fix }));
        // It names what the student gets.
        assert.equal(warning, graphingCalculatorPromptWarning(1, { calculator: student, fix }));
        assert.match(warning, student.available ? new RegExp(`they get the ${{ basic: 'basic calculator', squareRoot: 'basic calculator with square root', scientific: 'scientific calculator' }[student.mode]} on this question, which cannot graph`) : /they get no calculator on this question\./);
      }
    }
  }
  assert.ok(warned > 100, `${warned} combinations without a graphing calculator`);
});

test('every place a student reads the instruction counts, and every version', () => {
  const quiet = (extra) => item({ prompt: 'Find the zeros of f(x) = x² − 4x + 3.', ...extra });
  assert.equal(warningsFor(quiet({ answerFields: [{ id: 'z', label: 'Use the graphing calculator: what are the zeros?' }] }), 'inherit', 'classwork').length, 1);
  assert.equal(warningsFor(quiet({ directionSteps: ['Enter f(x) into the graphing calculator.', 'Read where the graph crosses the x-axis.'] }), 'inherit', 'classwork').length, 1);
  assert.equal(warningsFor(quiet({ workflow: [{ id: 's', kind: 'pointInput', prompt: 'Trace the graph on the graphing calculator to find the vertex.' }] }), 'inherit', 'classwork').length, 1);
  assert.equal(warningsFor(quiet({ variants: [{ prompt: 'Find the zeros of g.' }, { prompt: 'Use the graphing calculator to find the zeros of h.' }] }), 'inherit', 'classwork').length, 1);
  // Hints come during the question and are not judged.
  assert.equal(warningsFor(quiet({ hints: ['Check with a graphing calculator.'] }), 'inherit', 'classwork').length, 0);
  // An excluded question is not delivered, so not judged; a Test Cycle's secure test brings its own tools.
  assert.equal(auditAssignmentGraphingCalculatorPrompts(lesson('inherit'), [{ ...item(), activityRole: 'classwork', teacherExcluded: true }]).warnings.length, 0);
  const cycle = { toolPolicy: { calculator: 'inherit' }, assessmentPolicy: { mode: 'testCycle' } };
  assert.equal(auditAssignmentGraphingCalculatorPrompts(cycle, [{ ...item(), activityRole: 'test' }]).warnings.length, 0);
  assert.equal(auditAssignmentGraphingCalculatorPrompts(cycle, [{ ...item(), activityRole: 'review' }]).warnings.length, 1);
});

const assignmentWith = (sections, toolPolicy = { calculator: 'inherit' }) => ({
  schemaVersion: 5,
  assignment: { title: 'Zeros of a quadratic', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  // The same questions for every student, so the control raises no readiness warning of its own.
  variantPolicy: { mode: 'shared' },
  toolPolicy,
  sections: sections.map(([role, questions]) => ({
    id: role,
    role,
    title: role,
    questions: questions.map((question, index) => ({ questionId: `${role}-${index + 1}`, dok: 2, alignments: [{ framework: 'teks', code: 'A.7A', role: 'primary', evidenceLevel: 'assessed' }], ...question })),
  })),
});
const zeros = (prompt, extra = {}) => ({ type: 'multiAnswer', prompt, answerFields: [{ id: 'small', label: 'Smaller zero', answer: '1', inputProfile: 'number' }, { id: 'large', label: 'Larger zero', answer: '3', inputProfile: 'number' }], ...extra });

test('Pre-Flight carries the note as advice, judged with the Calculator setting the teacher picks in Review', () => {
  const sections = [['classwork', [zeros(GRAPH_PROMPT)]], ['dol', [zeros(GRAPH_PROMPT)]]];
  const source = assignmentWith(sections);
  const flagged = buildAssignmentV5PreflightModel(source);
  const plain = buildAssignmentV5PreflightModel(assignmentWith([['classwork', [zeros('Find the zeros of f(x) = x² − 4x + 3.')]], ['dol', [zeros('Find the zeros of f(x) = x² − 4x + 3.')]]]));
  assert.equal(flagged.graphingCalculatorPrompts.warnings.length, 2);
  // Readiness is the plain lesson's: no warning, no error, ready.
  assert.deepEqual(flagged.errors, []);
  assert.deepEqual(flagged.warnings, plain.warnings);
  assert.equal(plain.authoringState, AUTHORING_STATES.READY);
  assert.equal(flagged.authoringState, AUTHORING_STATES.READY);
  assert.ok(!flagged.diagnostics.some((entry) => /graphing calculator/.test(entry.message)));
  assert.equal(flagged.advisory.groups.find(({ id }) => id === 'graphingCalculatorPrompts')?.count, 2);
  // The teacher sets "Calculator for this lesson" to Graphing in Review (Delivery step):
  // Classwork now graphs; the exit ticket still does not, and its note says what will.
  const reviewed = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(source, { toolPolicy: { calculator: 'graphing' } }));
  assert.deepEqual(reviewed.graphingCalculatorPrompts.warnings, [
    'Question 2 tells students to use a graphing calculator, but they get the basic calculator on this question, which cannot graph. Give this question its own graphing calculator ("calculatorPolicy": "graphing"), or change the prompt\'s wording.',
  ]);
  // And with the exit-ticket question's own graphing calculator, nothing is left to note.
  const own = assignmentWith([['classwork', [zeros(GRAPH_PROMPT)]], ['dol', [zeros(GRAPH_PROMPT, { calculatorPolicy: 'graphing' })]]], { calculator: 'graphing' });
  assert.deepEqual(buildAssignmentV5PreflightModel(own).graphingCalculatorPrompts.warnings, []);
});

test('the mirror holds: App sends the student QuestionEngine only the lesson\'s setting, and QuestionEngine draws graphing only where it resolves', () => {
  // Since the App split (slice 7) the student's QuestionEngine is drawn by createAssignmentWorkspaceView
  // (src/app/student/assignmentWorkspaceView.jsx), a plain function App calls where the element was.
  const app = executableSource(appFactorySource('createAssignmentWorkspaceView'));
  const engine = region(app, 'familyEngineLoading || familyPinPending ?', 'askTeacherContext={askTeacherContext}', 'the student assignment QuestionEngine');
  assert.match(engine, /assignmentCalculatorMode=\{assignment\?\.toolPolicy\?\.calculator \|\| null\}/);
  assert.doesNotMatch(engine, /assessmentContext=|teacherCalculatorChoice=|graphingCalculatorAllowed=/, 'a new calculator input here must be read by assignmentStudentCalculator too');
  const questionEngine = executableSource(read('src/QuestionEngine.jsx'));
  const offered = region(questionEngine, 'const graphingCalculatorOffered =', ';', 'the graphing calculator gate');
  for (const condition of [/calculatorPolicy\?\.available/, /CALCULATOR_MODES\.GRAPHING/, /!assessmentContext/, /graphingCalculatorAllowed !== false/]) {
    assert.match(offered, condition);
  }
});

test('the Pre-Flight screen shows the note in its own panel, saying it does not stop publishing', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.graphingCalculatorPrompts?.warnings?.length > 0 && (', '\n      )}', 'the graphing calculator panel');
  assert.match(panel, /data-graphing-calculator-prompt-panel="true"/);
  assert.match(panel, />Graphing calculator in the prompt</);
  assert.match(panel, /preflightModel\.graphingCalculatorPrompts\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
  assert.match(panel, /This does not stop you publishing\./);
  const model = executableSource(componentSource('src/platform/preflight/assignmentV5PreflightModel.js'));
  const groups = region(model, 'const diagnosticGroups = [', '  ];', 'diagnostic groups');
  assert.doesNotMatch(groups, /graphingCalculatorPrompts/);
  // Judged on the reviewed assignment, with the Calculator setting Review edits.
  assert.match(model, /auditAssignmentGraphingCalculatorPrompts\(runtimeSource, questions, deliveredOnly\)/);
});

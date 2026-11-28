/*
 * SP-5: PRE-FLIGHT'S TWO AUTHORING WARNINGS, FOR NEW ASSIGNMENTS ONLY
 * (SHOWING_THE_PROCESS.md section 6; AUTHORING_LEARNING_SUPPORTS.md rules 5
 * and 6; src/platform/preflight/newAssignmentRulesPreflight.js).
 *
 *   Tool first     a new answer-box question asks for what a tool produces:
 *                  an equation to solve (Step Algebra), a line, inequality or
 *                  system to graph (the plane), a polynomial to divide
 *                  (synthetic or long division).
 *   Show the step  a new answer-box question with three or more parts has
 *                  neither a checkpoint nor a followThrough on any part.
 *
 * Each fixture goes through the Pre-Flight model the review screen builds, as
 * a new assignment and as an existing one. An existing assignment gets
 * nothing, not even information. The library sweep is
 * tests/platform/newAssignmentRulesLibrary.test.mjs.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  newAssignmentRulesApply,
  TOOL_FIRST_FAMILIES,
  TOOL_FIRST_KINDS,
  auditNewAssignmentRules,
  showTheStepFinding,
  toolFirstFinding,
} from '../../src/platform/preflight/newAssignmentRulesPreflight.js';
import { allRegisteredQuestionFamilies } from '../../functions/shared/questionFamilyRegistry.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { chainTo, firstLoadGraph, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';
import { openedByIntake, openedByLibraryReuse, reviewOpener, rulesReviewShows, storedLibraryRecord } from './helpers/preflightOpenPaths.mjs';
import { teacherWorkspaceSource } from './helpers/appScreens.mjs';

const lesson = (questions, role = 'classwork') => ({
  schemaVersion: 5,
  assignment: { title: 'SP-5 fixtures', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'practice' },
  sections: [{
    id: role,
    role,
    title: 'Classwork',
    questions: questions.map((question, index) => ({
      questionId: `q-${index + 1}`,
      dok: 2,
      ...question,
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    })),
  }],
});

const box = (prompt, answerFields, extra = {}) => ({ type: 'multiAnswer', studentActions: ['multipleResponses'], prompt, answerFields, ...extra });

// Pre-Flight's model as the review screen builds it: a new assignment, or an existing one.
const asNew = (questions) => buildAssignmentV5PreflightModel(lesson(questions), { isNewAssignment: true }).newAssignmentRules;
const asExisting = (questions) => buildAssignmentV5PreflightModel(lesson(questions)).newAssignmentRules;
const kinds = (rules) => rules.toolFirst.findings.map(({ questionNumber, kind }) => [questionNumber, kind]);

/* ------------------------------------------------------------- tool first */

const SOLVE = box('Solve 3x + 5 = 20.', [{ id: 'x', label: 'x =', answer: '5' }]);
const GRAPH_LINE = box('Graph y = 2x + 1. Then give the y-intercept.', [{ id: 'b', label: 'y-intercept', answer: '1' }]);
const GRAPH_SYSTEM = box('Graph the system y = 2x + 1 and y = −x + 4, then give the solution.', [{ id: 'x', label: 'x', answer: '1' }, { id: 'y', label: 'y', answer: '3' }]);
const GRAPH_INEQUALITY = box('Graph the inequality y ≤ −2x + 3 and name a point in the shaded region.', [{ id: 'point', label: 'A point in the region', answer: '(0, 0)' }]);
const DIVIDE = box('Divide $x^3 - 4x^2 + 6$ by $x - 3$.', [{ id: 'q', label: 'Quotient', answer: 'x^2 - x - 3' }, { id: 'r', label: 'Remainder', answer: '-3' }]);

test('tool first: an equation to solve in a box is sent to Step Algebra', () => {
  const rules = asNew([SOLVE]);
  assert.deepEqual(kinds(rules), [[1, TOOL_FIRST_KINDS.SOLVE_EQUATION]]);
  assert.deepEqual(rules.toolFirst.warnings, [
    'Question 1 gives students an equation to solve (3x + 5 = 20) but has them answer only in boxes. In a new assignment, use Step Algebra ("studentActions": ["solveStepByStep"]), so students solve it one move at a time and you see their moves. Keep answer boxes for reading and explaining the result.',
  ]);
  // LaTeX, a named variable and the minus sign a prompt types are read too.
  assert.equal(toolFirstFinding(box('Solve $\\frac{1}{2}x - 4 = 6$ and check your answer.', [{ label: 'x', answer: 'x = 20' }]))?.kind, TOOL_FIRST_KINDS.SOLVE_EQUATION);
  assert.equal(toolFirstFinding(box('Solve for y: 2(y − 3) = 4y + 10.', [{ label: 'y =', answer: '-8' }]))?.kind, TOOL_FIRST_KINDS.SOLVE_EQUATION);
});

test('tool first: a line, an inequality or a system to graph in a box is sent to the plane', () => {
  const rules = asNew([GRAPH_LINE, GRAPH_SYSTEM, GRAPH_INEQUALITY]);
  assert.deepEqual(kinds(rules), [[1, 'graph'], [2, 'graph'], [3, 'graph']]);
  assert.match(rules.toolFirst.warnings[1], /^Question 2 gives students something to graph \(y = 2x \+ 1 and y = -x \+ 4\) but has them answer only in boxes\. In a new assignment, use the graphing plane, so students draw it: "constructLine" for a line, "graphSystem" for a system of equations, "solveInequalitySystem" for inequalities\./);
});

test('tool first: a polynomial to divide in a box is sent to synthetic or long division', () => {
  const rules = asNew([DIVIDE]);
  assert.deepEqual(kinds(rules), [[1, TOOL_FIRST_KINDS.DIVIDE]]);
  assert.match(rules.toolFirst.warnings[0], /^Question 1 gives students a polynomial to divide \(x\^3 - 4x\^2 \+ 6 by x - 3\) but has them answer only in boxes\. In a new assignment, use synthetic or long division \("syntheticDivision" or "longDivision"\)/);
  // "Use synthetic division to find the quotient" asks for the quotient itself.
  assert.equal(toolFirstFinding(box('Use synthetic division to find the quotient when x³ + 2x − 1 is divided by x + 2.', [{ label: 'Bottom row', answer: '1, -2, 6 | -13' }]))?.kind, TOOL_FIRST_KINDS.DIVIDE);
});

test('tool first: a Question Family whose own tool produces the answer, asked in a box', () => {
  const asked = (familyId) => toolFirstFinding(box('Work this one.', [], { questionFamily: { id: familyId } }))?.kind;
  assert.equal(asked('linear.twoStepEquation'), TOOL_FIRST_KINDS.SOLVE_EQUATION);
  assert.equal(asked('linear.multiStepEquation'), TOOL_FIRST_KINDS.SOLVE_EQUATION);
  assert.equal(asked('linear.graphFromSlopeIntercept'), TOOL_FIRST_KINDS.GRAPH);
  assert.equal(asked('systems.graphical2x2'), TOOL_FIRST_KINDS.GRAPH);
  assert.equal(asked('polynomials.syntheticDivision'), TOOL_FIRST_KINDS.DIVIDE);
  assert.equal(asked('polynomials.longDivisionLinear'), TOOL_FIRST_KINDS.DIVIDE);
  for (const [familyId, kind] of Object.entries(TOOL_FIRST_FAMILIES)) {
    assert.deepEqual(toolFirstFinding(box('Work this one.', [], { questionFamily: { id: familyId } })), { kind, source: 'family', familyId }, familyId);
  }
  // The list is the registry's own: each family's default tool is that tool.
  const TOOL_OF_KIND = { solveEquation: ['stepAlgebra'], graph: ['graphing2', 'systemsWorkspace'], divide: ['polynomialWorkshop'] };
  const registry = new Map(allRegisteredQuestionFamilies().map((family) => [family.id, family]));
  for (const [familyId, kind] of Object.entries(TOOL_FIRST_FAMILIES)) {
    assert.ok(registry.has(familyId), `${familyId} is a registered family`);
    assert.ok(TOOL_OF_KIND[kind].includes(registry.get(familyId).defaultTool), `${familyId} works in ${registry.get(familyId).defaultTool}`);
  }
  // A family that is itself an answer box (reading intercepts) is not one.
  assert.equal(toolFirstFinding(box('Find the intercepts.', [], { questionFamily: { id: 'functions.identifyIntercepts' } })), null);
});

test('tool first is silent when the question uses the tool', () => {
  const inTheTool = [
    { type: 'stepAlgebra', studentActions: ['solveStepByStep'], prompt: 'Solve 3x + 5 = 20.', equation: '3x + 5 = 20' },
    { type: 'graphing2', mode: 'slopeIntercept', studentActions: ['constructLine'], prompt: 'Graph y = 2x + 1.', lineIntent: { slope: 2, intercept: 1 } },
    { type: 'systemsWorkspace', mode: 'linear', studentActions: ['graphSystem'], prompt: 'Graph the system y = 2x + 1 and y = −x + 4.', equations: ['y = 2x + 1', 'y = -x + 4'] },
    { type: 'polynomialWorkshop', mode: 'synthetic', studentActions: ['syntheticDivision'], prompt: 'Divide x^3 - 4x^2 + 6 by x - 3.' },
    { type: 'stepAlgebra', studentActions: ['solveStepByStep'], prompt: 'Work this one.', questionFamily: { id: 'linear.twoStepEquation' } },
  ];
  for (const question of inTheTool) assert.equal(toolFirstFinding(question), null, question.type);
  // A checkpoint of the tool's own kind is the step done in the tool.
  assert.equal(toolFirstFinding(box('Solve 3x + 5 = 20.', [{ id: 'x', label: 'x =', answer: '5', checkpoint: { kind: 'stepMoves' } }])), null);
  assert.equal(toolFirstFinding(box('Graph y = 2x + 1. Then give the slope.', [{ id: 'm', label: 'Slope', answer: '2', checkpoint: { kind: 'pickPoints', count: 2 } }])), null);
  // A composed question whose stages include a tool is not a plain answer box.
  assert.equal(toolFirstFinding({ ...SOLVE, workflow: [{ kind: 'stepAlgebra' }, { kind: 'multiAnswer' }] }), null);
});

test('tool first reads the question\'s own fields, not a word: ordinary answer boxes raise nothing', () => {
  const ordinary = [
    // A box that interprets the solution, not one that holds it.
    box('Solve 3x + 5 = 20. What does x mean in the story?', [{ label: 'Meaning', answer: 'the number of tickets' }]),
    // The word in the middle of a sentence.
    box('Mia solved 3x + 5 = 20 and got 5. Is she right?', [{ label: 'Right?', answer: 'Yes' }]),
    box('Ana and Ben each tried to solve 3x + 5 = 20. Ana got 5 and Ben got 7. Who is right?', [{ label: 'Who is right?', answer: 'Ana' }, { label: 'The solution', answer: '5' }]),
    box('The graph of y = 2x + 1 is shown. What is its slope?', [{ label: 'Slope', answer: '2' }]),
    // A key that is not the equation's solution.
    box('Solve 3x + 5 = 20.', [{ label: 'First step', answer: '3x = 15' }]),
    // Equations the spec does not send to Step Algebra: a root, a square.
    box('Solve $\\sqrt{x + 7} = 4$.', [{ label: 'x =', answer: '9' }]),
    box('Solve x^2 = 49.', [{ label: 'Positive solution', answer: '7' }]),
    // A system to solve, not to graph; a template not yet filled.
    box('Solve the system y = 2x and x + y = 9.', [{ label: 'x', answer: '3' }, { label: 'y', answer: '6' }]),
    box('Solve {{a}}x + {{b}} = {{c}}.', [{ label: 'x =', answer: '{{x}}' }]),
    // "Graph each line" names no line; a graph of something that is not linear.
    box('Graph each line.', [{ label: 'Slope', answer: '2' }]),
    box('Graph y = x^2 - 4. Name its vertex.', [{ label: 'Vertex', answer: '(0, -4)' }]),
    // Division the tools are not for: a monomial divisor, a remainder found without dividing, numbers.
    box('Divide 6x^4 by 2x^2.', [{ label: 'Quotient', answer: '3x^2' }]),
    box('Without dividing, find the remainder when x³ − 4x² + 6 is divided by x − 3.', [{ label: 'Remainder', answer: '-3' }]),
    box('Divide 84 by 7.', [{ label: 'Quotient', answer: '12' }]),
  ];
  const rules = asNew(ordinary);
  assert.deepEqual(rules.toolFirst.findings, []);
});

/* ---------------------------------------------------------- show the step */

const threeParts = (extra = {}) => box('A rectangle is 3 cm longer than it is wide, and its perimeter is 26 cm.', [
  { id: 'width', label: 'Width (cm)', answer: '5' },
  { id: 'length', label: 'Length (cm)', answer: '8' },
  { id: 'area', label: 'Area (square cm)', answer: '40', ...extra },
]);

test('show the step: three or more parts with no checkpoint and no followThrough', () => {
  const rules = asNew([threeParts()]);
  assert.deepEqual(rules.showTheStep.findings, [{ questionNumber: 1, questionId: 'q-1', parts: 3 }]);
  assert.deepEqual(rules.showTheStep.warnings, [
    'Question 1 has 3 answer boxes and none of them checks a step. In a new assignment, give one part a checkpoint (a step done in a tool, such as picking two points on the line) or a followThrough (a later part that uses the student\'s own earlier answer, so one early slip is not marked wrong twice).',
  ]);
});

test('show the step is silent with a checkpoint, with a followThrough, or with two parts', () => {
  const withCheckpoint = threeParts({ checkpoint: { kind: 'tableRow', count: 1 } });
  const withFollowThrough = threeParts({ label: 'Area of {width} by {length} (square cm)', followThrough: { from: ['width', 'length'], answer: '{width}*{length}' } });
  const twoParts = box('A rectangle is 3 cm longer than it is wide, and its perimeter is 26 cm.', [
    { id: 'width', label: 'Width (cm)', answer: '5' },
    { id: 'length', label: 'Length (cm)', answer: '8' },
  ]);
  for (const question of [withCheckpoint, withFollowThrough, twoParts]) assert.equal(showTheStepFinding(question), null);
  // Through the model too: the supported fields survive compiling and normalising.
  assert.deepEqual(asNew([withCheckpoint, withFollowThrough, twoParts]).showTheStep.findings, []);
  // A tool with parts of its own is not an answer box.
  assert.equal(showTheStepFinding({ type: 'relationshipModel', studentActions: ['identifyQuantities', 'writeEquation', 'completeTable'], answerFields: [{}, {}, {}] }), null);
});

/* ---------------------------------------------------- existing assignments */

const EVERY_FIXTURE = [SOLVE, GRAPH_LINE, GRAPH_SYSTEM, GRAPH_INEQUALITY, DIVIDE, threeParts()];

test('an existing assignment raises nothing new, not even as information', () => {
  const asNewRules = asNew(EVERY_FIXTURE);
  assert.equal(asNewRules.toolFirst.findings.length, 5, 'each fixture fires as new');
  assert.equal(asNewRules.showTheStep.findings.length, 1);
  const none = { isNew: false, toolFirst: { warnings: [], findings: [] }, showTheStep: { warnings: [], findings: [] } };
  assert.deepEqual(asExisting(EVERY_FIXTURE), none, 'the model\'s default is an existing assignment');
  assert.deepEqual(buildAssignmentV5PreflightModel(lesson(EVERY_FIXTURE), { isNewAssignment: false }).newAssignmentRules, none);
  assert.deepEqual(auditNewAssignmentRules(buildAssignmentV5PreflightModel(lesson(EVERY_FIXTURE)).questions), none);
  // Only `true` means new.
  assert.deepEqual(auditNewAssignmentRules(buildAssignmentV5PreflightModel(lesson(EVERY_FIXTURE)).questions, { isNew: 'yes' }), none);
});

test('the warnings are advice: never a diagnostic, never readiness, never the suggestions count', () => {
  const existing = buildAssignmentV5PreflightModel(lesson(EVERY_FIXTURE));
  const fresh = buildAssignmentV5PreflightModel(lesson(EVERY_FIXTURE), { isNewAssignment: true });
  assert.ok(fresh.newAssignmentRules.toolFirst.warnings.length > 0);
  for (const key of ['errors', 'warnings', 'diagnostics', 'advisory', 'authoringState', 'isValid']) {
    assert.deepEqual(fresh[key], existing[key], key);
  }
  // A question the teacher excluded is never delivered, so it is not judged (and keeps its number).
  const excluded = buildAssignmentV5PreflightModel(lesson([{ ...SOLVE, teacherExcluded: true }, DIVIDE]), { isNewAssignment: true }).newAssignmentRules;
  assert.deepEqual(kinds(excluded), [[2, TOOL_FIRST_KINDS.DIVIDE]]);
});

/* ------------------------------------------------------------ the screen */

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const PANEL = '/src/components/teacher/NewAssignmentRulesPanel.jsx';
const panelMarkup = async (props) => renderToStaticMarkup(React.createElement((await vite.ssrLoadModule(PANEL)).default, props));

test('the panel on a new assignment: a warning, one line of counts per rule, each list folded', async () => {
  const html = await panelMarkup({ rules: asNew(EVERY_FIXTURE), headingLevel: 5 });
  assert.match(html, /^<section data-new-assignment-rules-panel="true" aria-labelledby="[^"]+"/);
  assert.match(html, /<h5 id="[^"]+"[^>]*><span>Warning: <\/span>6 notes on answer boxes in a new assignment<\/h5>/);
  assert.match(html, /This never stops you creating the assignment\./);
  // Compact: a closed disclosure per rule, its summary the rule's count.
  assert.match(html, /<details data-new-assignment-rule="toolFirst"[^>]*><summary[^>]*>Use the tool: 5 questions<\/summary>/);
  assert.match(html, /<details data-new-assignment-rule="showTheStep"[^>]*><summary[^>]*>Show a step: 1 question<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open/, 'every list starts folded');
  // Each summary is a pointer target of at least 24 CSS px (WCAG 2.5.8).
  const summaries = html.match(/<summary style="[^"]*"/g) || [];
  assert.equal(summaries.length, 2);
  for (const summary of summaries) {
    assert.match(summary, /min-height:24px/, summary);
    assert.match(summary, /box-sizing:border-box/, summary);
  }
  // The list is unchanged inside.
  assert.match(html, /<summary[^>]*>Use the tool: 5 questions<\/summary><ul [^>]*><li>Question 1 gives students an equation to solve \(3x \+ 5 = 20\)/);
  assert.match(html, /<li>Question 5 gives students a polynomial to divide/);
  assert.match(html, /<summary[^>]*>Show a step: 1 question<\/summary><ul [^>]*><li>Question 6 has 3 answer boxes and none of them checks a step\./);
});

test('the panel draws nothing for an existing assignment, or a new one with nothing to say', async () => {
  assert.equal(await panelMarkup({ rules: asExisting(EVERY_FIXTURE) }), '');
  assert.equal(await panelMarkup({ rules: asNew([threeParts({ checkpoint: { kind: 'tableRow', count: 1 } })]) }), '');
  assert.equal(await panelMarkup({ rules: null }), '');
  // Even handed findings, an existing assignment's panel draws nothing.
  assert.equal(await panelMarkup({ rules: { ...asNew(EVERY_FIXTURE), isNew: false } }), '');
});

test('the panel draws in theme tokens only, and sizes its text from the page', () => {
  const panel = executableSource(readFileSync(path.join(repo, 'src/components/teacher/NewAssignmentRulesPanel.jsx'), 'utf8'));
  assert.doesNotMatch(panel, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/i);
  for (const size of panel.match(/fontSize: '[^']+'/g) || []) assert.match(size, /calc\([\d.]+ \* var\(--mm-px\)\)/, size);
  assert.doesNotMatch(panel, /\bwidth: \d|minWidth: \d|whiteSpace: 'nowrap'/);
});

test('Pre-Flight\'s review asks for the rules only for an assignment authored now, and draws them in the Check step', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  assert.match(modal, /^import NewAssignmentRulesPanel from '\.\/NewAssignmentRulesPanel\.jsx';$/m);
  assert.match(modal, /^import \{ newAssignmentRulesApply \} from '\.\.\/\.\.\/platform\/preflight\/newAssignmentRulesPreflight\.js';$/m);
  // A review that does not say it is authored now is not one.
  assert.match(modal, /^ {2}authoredNow = false,$/m);
  assert.match(modal, /const newAssignmentRules = newAssignmentRulesApply\(\{ reviewMode, authoredNow \}\);/);
  const memo = region(modal, 'const preflightModel = useMemo(', ');', 'the review\'s model');
  assert.match(memo, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5, \{ classSize: preflightClassSize, isNewAssignment: newAssignmentRules \}\)/);
  assert.match(memo, /\[reviewedAssignmentV5, preflightClassSize, newAssignmentRules\]/);
  assert.ok(modal.indexOf('const newAssignmentRules = ') < modal.indexOf('const preflightModel = useMemo('), 'decided before the model reads it');
  // WE-B's coverage panel keeps its own rule, untouched: any review that is not a setup edit.
  assert.equal((modal.match(/const isUpdateMode = /g) || []).length, 1);
  assert.match(modal, /const isUpdateMode = reviewMode === 'update';/);
  // Drawn right after the coverage panel (comments are stripped to { }).
  const check = region(modal, 'const renderCheck = () => (', '\n  );\n', 'the Check step');
  assert.match(check, /<ClassworkExampleCoveragePanel coverage=\{classworkExamples\} isNew=\{!isUpdateMode\} headingLevel=\{isNarrow \? 4 : 5\} \/>[\s{}]*<NewAssignmentRulesPanel rules=\{preflightModel\.newAssignmentRules\} headingLevel=\{isNarrow \? 4 : 5\} \/>/);
  // Readiness never reads them.
  for (const file of ['src/platform/preflight/preflightDiagnostics.js', 'src/platform/preflight/assignmentAuthoringState.js', 'src/components/teacher/preflightSteps.js']) {
    assert.doesNotMatch(executableSource(readFileSync(path.join(repo, file), 'utf8')), /newAssignmentRules|NewAssignmentRules/, file);
  }
});

/* ------------------------------------------- authored now, or Library reuse */

test('only an assignment imported or authored now is new for these rules', () => {
  assert.equal(newAssignmentRulesApply({ reviewMode: 'create', authoredNow: true }), true, 'the intake');
  assert.equal(newAssignmentRulesApply({ reviewMode: 'create', authoredNow: false }), false, 'a stored Library assignment given to a class');
  assert.equal(newAssignmentRulesApply({ reviewMode: 'create' }), false, 'a review that does not say');
  assert.equal(newAssignmentRulesApply({ reviewMode: 'update', authoredNow: true }), false, 'a setup edit');
  assert.equal(newAssignmentRulesApply({ reviewMode: 'create', authoredNow: 'yes' }), false, 'only true');
  assert.equal(newAssignmentRulesApply(), false);
});

test('the intake says it is authored now; the Library and setup-edit paths do not', () => {
  const workspace = executableSource(teacherWorkspaceSource());
  // The intake (pasted, uploaded and dropped JSON, and a repaired Incomplete draft), both ways it opens Review.
  const intake = region(workspace, 'const handleAssignmentJsonReady = async', '\n  };\n', 'the intake');
  const intakeOpens = intake.match(/openAssignmentPreflight\([\s\S]*?\);/g) || [];
  assert.equal(intakeOpens.length, 2, 'the salvage preview and the clean open');
  for (const call of intakeOpens) assert.match(call, /\{ incompleteDraftId, authoredNow: true \}\s*,?\s*\)/, call);
  // Library reuse (a class given a Library assignment, or another class added) never does.
  const reuse = region(workspace, 'const openStoredAssignmentForPreflight = async', '\n  };\n', 'Library reuse');
  assert.match(reuse, /openAssignmentPreflight\(/);
  assert.doesNotMatch(reuse, /authoredNow/);
  // No other opener names it: only the intake's two calls.
  assert.equal((workspace.match(/authoredNow: true/g) || []).length, 2);
  // Review is mounted with what the opener stored, and only `true` counts.
  assert.match(workspace, /reviewMode=\{assignmentPreflight\.mode \|\| 'create'\}\s*authoredNow=\{assignmentPreflight\.authoredNow === true\}/);
  const controls = executableSource(readFileSync(path.join(repo, 'src/app/teacher/controls/assignmentPreflightControls.js'), 'utf8'));
  assert.match(controls, /authoredNow: reviewOptions\.authoredNow === true,/);
});

const LESSON_FILE = 'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json';

test('the intake shows show-the-step on a lesson; re-assigning the same lesson from the Library shows nothing', async () => {
  const open = await reviewOpener(vite);
  const text = readFileSync(path.join(repo, LESSON_FILE), 'utf8');

  const imported = openedByIntake(open, text, 'T1_L1_Solving_Linear_Equations.json');
  assert.equal(imported.mode, 'create');
  assert.equal(imported.authoredNow, true);
  const shown = rulesReviewShows(imported);
  assert.equal(shown.isNew, true);
  assert.ok(shown.showTheStep.findings.length > 0, 'the lesson has answer boxes of three or more parts with no checked step');

  const reused = openedByLibraryReuse(open, storedLibraryRecord(JSON.parse(text)));
  assert.equal(reused.mode, 'create', 'Library reuse opens Review in create mode, like the intake');
  assert.equal(reused.authoredNow, false);
  assert.deepEqual(rulesReviewShows(reused), { isNew: false, toolFirst: { warnings: [], findings: [] }, showTheStep: { warnings: [], findings: [] } });
  // The same questions either way: only where Review was opened from differs.
  assert.equal(reused.questions.length, imported.questions.length);
});

test('nothing a student loads, and nothing in a teacher\'s first load, carries the rules or the panel', () => {
  const student = firstLoadGraph();
  const teacher = teacherFirstLoadGraph();
  for (const file of ['src/platform/preflight/newAssignmentRulesPreflight.js', 'src/components/teacher/NewAssignmentRulesPanel.jsx']) {
    const key = path.join(repo, file);
    assert.ok(!student.has(key), `${file} in the student's first load: ${student.has(key) ? chainTo(student, key) : ''}`);
    assert.ok(!teacher.has(key), `${file} in the teacher's first load: ${teacher.has(key) ? chainTo(teacher, key) : ''}`);
  }
});

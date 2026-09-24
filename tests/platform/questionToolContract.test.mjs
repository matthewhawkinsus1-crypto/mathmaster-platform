import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  TOOL_CONTRACT_RULES,
  applySafeToolContractRepairs,
  auditAssignmentToolContracts,
  auditQuestionToolContract,
} from '../../src/platform/contract/questionToolContract.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { questionIndexFromPreflightMessage } from '../../src/platform/preflight/preflightQuestionRepair.js';
import { region } from './helpers/sourceContract.mjs';

// THE QUESTION ↔ TOOL CONTRACT — VALIDATION MATRIX (Job 4).
//
// A teacher should rarely learn from a student that a question opened the
// wrong tool. The contract resolves the route QuestionEngine takes and checks
// the tool there can do what the question asks; it names every finding for the
// teacher and the developer, and repairs only what keeps the mathematics.

const v5 = (questions, courseId = 'algebra1') => ({
  schemaVersion: 5,
  assignment: { title: 'Contract matrix', courseId },
  sections: [{ role: 'classwork', title: 'Classwork', questions: questions.map((question) => ({ standard: 'A.5A', ...question })) }],
});
const compiled = (questions, courseId) => compileAuthoringIntentV5(v5(questions, courseId)).package;
const stored = (questions) => ({ schemaVersion: 5, sections: [{ role: 'classwork', questions }] });

test('representative V5 algebra questions compile to tools that satisfy their contract', () => {
  const pkg = compiled([
    { prompt: 'Solve 4x + 7 = 23.', studentActions: ['solveStepByStep'], equation: '4x + 7 = 23' },
    { prompt: 'Solve 3(2x − 4) = 18.', studentActions: ['solveEquation'], equation: '3(2x - 4) = 18' },
    { prompt: 'Solve −2x + 3 > 7.', studentActions: ['solveInequality'], inequality: '-2x + 3 > 7' },
    { prompt: 'Solve |2x − 3| = 7.', studentActions: ['solveEquation'], equation: '|2x - 3| = 7' },
    { prompt: 'Solve |x − 2| < 5.', studentActions: ['solveInequality'], inequality: '|x - 2| < 5' },
    { prompt: 'Find both intercepts of 3x + 4y = 24.', studentActions: ['interactiveAlgebra'], mode: 'linearIntercepts', equation: '3x + 4y = 24' },
    { prompt: 'Rewrite 5x + 2y = 6 in slope-intercept form.', studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', equation: '5x + 2y = 6' },
    { prompt: 'Write y = 15x − 45 in factored form.', studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 15x - 45' },
    { prompt: 'Solve A = lw for w.', studentActions: ['solveLiteral'], equation: 'A = l w', solveFor: 'w' },
    { prompt: 'Solve the system by substitution.', studentActions: ['solveSystem'], mode: 'algebraic', equations: ['y = 2x - 1', '3x + 2y = 12'] },
    { prompt: 'Solve (x + 2)(x − 3) ≥ 0.', studentActions: ['solveInequality'], signChart: { mode: 'polynomial', factors: [-2, 3], relation: '>=' } },
  ]);
  const { findings } = auditAssignmentToolContracts(pkg);
  assert.deepEqual(findings.map((entry) => `${entry.questionNumber}:${entry.rule}`), []);
});

test('a factor-less sign chart is caught, with the prompt inequality as a safe repair', () => {
  const [finding] = auditQuestionToolContract({ questionId: 'q1', type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Solve −2x + 3 > 7.' }, 0);
  assert.equal(finding.rule, TOOL_CONTRACT_RULES.SIGN_ANALYZER_WITHOUT_FACTORS);
  assert.equal(finding.severity, 'warning', 'students already see the right tool at runtime; saving the repair is housekeeping');
  assert.equal(finding.recommendedRepair.safe, true);
  assert.equal(finding.recommendedRepair.question.type, 'stepAlgebra');
  assert.equal(finding.recommendedRepair.question.equation, '-2x + 3 > 7', 'the prompt\'s own inequality (typographic minus normalised)');
  assert.match(finding.message, /^Question 1: /);
  assert.equal(finding.questionId, 'q1');
  assert.ok(finding.expected && finding.actual, 'developer diagnostics name the expected and actual configuration');
});

test('a sign chart with neither factors nor a readable inequality blocks, with a stated fix', () => {
  const [finding] = auditQuestionToolContract({ type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Make a sign chart.' }, 3);
  assert.equal(finding.severity, 'blocking');
  assert.match(finding.teacherMessage, /Add the factors, or the inequality/);
  assert.equal(finding.recommendedRepair, null, 'no repair invents mathematics');
});

test('legacy numeric solver: text equation is a safe repair; an {a, b, c} model is an opt-in upgrade', () => {
  const [text] = auditQuestionToolContract({ type: 'stepAlgebra2', equation: '3x + 6 = 21' }, 0);
  assert.equal(text.rule, TOOL_CONTRACT_RULES.LEGACY_TEXT_EQUATION);
  assert.equal(text.recommendedRepair.safe, true);

  const [model] = auditQuestionToolContract({ type: 'stepAlgebra2', equation: { a: 9, b: 0, c: 20 } }, 0);
  assert.equal(model.rule, TOOL_CONTRACT_RULES.LEGACY_NUMERIC_SOLVER);
  assert.equal(model.recommendedRepair.safe, false, 'unfinished student work on the old solver would restart, so the teacher decides');
  assert.equal(model.recommendedRepair.question.equation, '9x + 0 = 20');
});

test('an intent the reached engine cannot perform blocks', () => {
  const [slope] = auditQuestionToolContract({ type: 'stepAlgebra2', equation: { a: 2, b: 3, c: 7 }, targetForm: 'slopeIntercept' }, 0)
    .filter((entry) => entry.rule === TOOL_CONTRACT_RULES.CAPABILITY_MISSING);
  assert.equal(slope.severity, 'blocking');
  assert.equal(slope.expected, 'slopeInterceptConversion');
  const factoredInequality = auditQuestionToolContract({ type: 'stepAlgebra', equation: 'y > 15x - 45', targetForm: 'factoredLinear' }, 0);
  assert.ok(factoredInequality.some((entry) => entry.rule === TOOL_CONTRACT_RULES.CAPABILITY_MISSING && entry.expected === 'factoring'));
  assert.deepEqual(auditQuestionToolContract({ type: 'literal', equation: 'y = 15x - 45', targetForm: 'factoredLinear' }, 0), [], 'a typed answer is a deliberate choice, not a broken workspace');
});

test('a prompt about a displayed graph with no graph attached is caught; graphing tools are not', () => {
  const [missing] = auditQuestionToolContract({ type: 'stepAlgebra', equation: '4x + 7 = 23', prompt: 'Use the graph below to check your answer.' }, 0);
  assert.equal(missing.rule, TOOL_CONTRACT_RULES.DISPLAYED_GRAPH_MISSING);
  assert.deepEqual(auditQuestionToolContract({ type: 'multipleChoice', prompt: 'The graph shows a line. Which slope?', graph: { lines: [{ m: 2, b: 1 }] } }, 0), []);
  assert.deepEqual(auditQuestionToolContract({ type: 'transformationsLab', prompt: 'Below is the graph of y = |x|. Translate it.' }, 0), []);
  assert.deepEqual(auditQuestionToolContract({ type: 'relationshipModel', prompt: 'Build a model through the graph.' }, 0), []);
});

test('safe repairs apply without touching anything else and leave the record clean', () => {
  const before = stored([
    { questionId: 'a', type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Solve 4 - x <= 9.' },
    { questionId: 'b', type: 'stepAlgebra', equation: '4x + 7 = 23' },
    { questionId: 'c', type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 } },
    { questionId: 'd', type: 'stepAlgebra2', equation: { a: 2, b: 3, c: 7 } },
  ]);
  const { assignmentV5, applied } = applySafeToolContractRepairs(before);
  assert.deepEqual(applied.map((entry) => entry.questionId), ['a', 'c']);
  const [a, b, c, d] = assignmentV5.sections[0].questions;
  assert.equal(a.type, 'stepAlgebra');
  assert.equal(a.questionId, 'a');
  assert.equal(b, before.sections[0].questions[1], 'an untouched question keeps its identity');
  assert.equal(c.type, 'stepAlgebra');
  assert.deepEqual(c.standard, { A: 3, B: 4, C: 24 });
  assert.equal(d, before.sections[0].questions[3], 'an opt-in upgrade is never applied automatically');
  assert.deepEqual(auditAssignmentToolContracts(assignmentV5).safeRepairs, []);
});

test('preflight reports contract findings as question-scoped diagnostics', () => {
  const model = buildAssignmentV5PreflightModel(v5([
    { prompt: 'Solve 4x + 7 = 23.', studentActions: ['solveStepByStep'], equation: '4x + 7 = 23' },
  ]));
  assert.ok(model.toolContract, 'the model carries the contract audit for the UI');
  const withLegacy = { ...model.assignmentV5, sections: [{ ...model.assignmentV5.sections[0], questions: [...model.assignmentV5.sections[0].questions, { type: 'stepAlgebra2', equation: '3x + 6 = 21', prompt: 'Solve.', standard: 'A.5A' }] }] };
  const again = buildAssignmentV5PreflightModel(withLegacy);
  const warning = again.warnings.find((message) => /older numeric solver/.test(message));
  assert.ok(warning, 'the finding reaches the preflight warnings');
  assert.equal(questionIndexFromPreflightMessage(warning, 2), 1, 'and is mapped to its question');
  assert.ok(again.diagnostics.some((entry) => entry.source === 'toolContract'));
});

test('the Assignment Review screen shows the check and applies safe repairs', () => {
  const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
  assert.match(modal, /import \{ applySafeToolContractRepairs \} from '\.\.\/\.\.\/platform\/contract\/questionToolContract\.js'/);
  const panel = region(modal, 'data-tool-contract-panel="true"', '{questionRepairIssues.length > 0 && (', 'the tool contract panel');
  assert.match(panel, /preflightModel\.toolContract\.findings\.map/);
  assert.match(panel, /setWorkingAssignmentV5\(\(current\) => applySafeToolContractRepairs\(current\)\.assignmentV5\)/);
  assert.match(panel, /allowQuestionRepair &&/, 'locked content is never repaired');
  assert.match(panel, /Developer details/);
  const preflight = fs.readFileSync('src/platform/preflight/assignmentV5PreflightModel.js', 'utf8');
  assert.match(preflight, /\{ source: 'toolContract', severity: 'blocking', messages: toolContract\.errors \}/);
  assert.match(preflight, /\{ source: 'toolContract', severity: 'warning', messages: toolContract\.warnings \}/);
});

test('every authored assignment in the repository passes the contract (no false positives)', () => {
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full.endsWith('.json')) files.push(full);
  });
  walk('teacher-import-jsons');
  fs.readdirSync('.').filter((name) => /^SAMPLE.*\.json$/.test(name)).forEach((name) => files.push(name));
  let questions = 0;
  const findings = [];
  files.forEach((file) => {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Number(json.schemaVersion) !== 5) return;
    let pkg;
    try { pkg = compileAuthoringIntentV5(json).package; } catch { return; }
    questions += pkg.sections.reduce((total, section) => total + (section.questions || []).length, 0);
    findings.push(...auditAssignmentToolContracts(pkg).findings.map((entry) => `${file}: ${entry.message}`));
  });
  assert.ok(questions > 100, `a meaningful corpus was checked (${questions} questions)`);
  assert.deepEqual(findings, []);
});

/*
 * "LET'S BACK UP" FOR MATRIX LAB AND THE THREE-VARIABLE SYSTEMS WORKSPACE,
 * built from each item's own structure (the owner, 2026-10-20; student pass 3,
 * W7-5 decision 1). HELP-19 stopped showing the generic Yes/No step and no
 * question family reads these tools, so their inclusion students had no step.
 *
 * Over the real lessons (teacher-import-jsons and docs/assignments, each item
 * once): every Matrix Lab item and every 3D or three-variable Systems
 * Workspace item in a Warm-Up, Classwork or Practice now has a step written
 * for it; no step offers the item's own answer; and the right choice is not
 * always first.
 *
 * Plain multi-answer items have no structure to read, so each carries an
 * authored `scaffold` in its lesson. The V5 compiler used to drop it (no
 * authored step ever reached a student); it now keeps it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { toolBackUpStep } from '../../src/platform/supports/feedback/toolBackUpSteps.js';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let items = null;
const realItems = () => {
  if (items) return items;
  items = [];
  const files = [];
  const imports = join(ROOT, 'teacher-import-jsons');
  readdirSync(imports).forEach((folder) => readdirSync(join(imports, folder)).filter((name) => name.endsWith('.json')).forEach((name) => files.push(join(imports, folder, name))));
  readdirSync(join(ROOT, 'docs/assignments')).filter((name) => name.endsWith('.json')).forEach((name) => files.push(join(ROOT, 'docs/assignments', name)));
  const seen = new Set();
  files.forEach((file) => {
    let compiled;
    try { compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(file, 'utf8'))); } catch { return; }
    compiled.package.sections.forEach((section) => section.questions.forEach((stored) => {
      if (!['warmup', 'classwork', 'practice'].includes(section.role)) return;
      // Two copies of one lesson (a _FINAL beside its draft) count once.
      const identity = createHash('sha1').update(JSON.stringify(stored)).digest('hex');
      if (seen.has(identity)) return;
      seen.add(identity);
      items.push({ stored, question: normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null)) });
    }));
  });
  return items;
};

const isToolItem = ({ question }) => question.type === 'matrixLab'
  || (question.type === 'systemsWorkspace' && (question.mode === 'spatial' || (question.variables || []).length === 3));

/** Every answer the item itself holds: field answers, choice answers, keys. */
const answersOf = (question) => {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    ['answer', 'expected', 'correct', 'correctAnswer'].forEach((key) => {
      if (typeof node[key] === 'string' || typeof node[key] === 'number') found.push(String(node[key]));
    });
    // The back-up step's own right choice is not an answer to the item.
    Object.entries(node).forEach(([key, value]) => { if (key !== 'scaffold') visit(value); });
  };
  visit(question);
  return found.map((value) => value.trim().toLowerCase().replace(/[.\s]+$/, ''));
};

test('every real Matrix Lab and three-variable Systems Workspace item has a step written for it', () => {
  const tools = realItems().filter(isToolItem);
  assert.ok(tools.length >= 35, `the real tool items are found (${tools.length})`);
  const missing = tools.filter(({ question }) => !backUpStepWritten(backUpStepFor(question)));
  assert.deepEqual(missing.map(({ stored }) => stored.questionId), [], 'no tool item is left without a step');
  const bySource = tools.reduce((counts, { question }) => ({ ...counts, [backUpStepFor(question).source]: (counts[backUpStepFor(question).source] || 0) + 1 }), {});
  assert.ok(bySource.tool >= 33, `built from the tool's structure: ${JSON.stringify(bySource)}`);
});

test('a step never offers the item\'s own answer, and its right choice is not always first', () => {
  const steps = realItems().filter(isToolItem).map(({ stored, question }) => ({ stored, question, step: backUpStepFor(question) }))
    .filter(({ step }) => step.source === 'tool');
  steps.forEach(({ stored, question, step }) => {
    assert.match(step.prompt, /^Let’s back up\. /, stored.questionId);
    assert.equal(step.options.length, 2, stored.questionId);
    assert.ok(step.options.includes(step.correct), stored.questionId);
    assert.notEqual(step.options[0], step.options[1], stored.questionId);
    const answers = answersOf(question);
    step.options.forEach((option) => {
      assert.ok(!answers.includes(option.trim().toLowerCase().replace(/[.\s]+$/, '')), `${stored.questionId}: "${option}" is one of the item's own answers`);
    });
    // The same problem always shows the same order.
    assert.deepEqual(backUpStepFor(question).options, step.options, stored.questionId);
  });
  const firstIsRight = steps.filter(({ step }) => step.options[0] === step.correct).length;
  assert.ok(firstIsRight > 0 && firstIsRight < steps.length, `the right choice is first on ${firstIsRight} of ${steps.length}`);
});

test('Matrix Lab: the step follows what the item asks', () => {
  const right = (question) => { const step = toolBackUpStep(question); return [step.prompt, step.correct]; };
  const matrices = { Nov: { rows: [[1, 2]] }, Dec: { rows: [[3, 4]] } };
  assert.deepEqual(right({ type: 'matrixLab', mode: 'operate', operation: 'add', matrices, left: 'Nov', right: 'Dec' }),
    ['Let’s back up. To add two matrices, which numbers do you combine?', 'The numbers in the same position']);
  const AB = { A: { rows: [[1, 0], [0, 1]] }, B: { rows: [[2, 1], [1, 1]] } };
  assert.deepEqual(right({ type: 'matrixLab', mode: 'operate', matrices: AB, left: 'A', right: 'B' }),
    ['Let’s back up. To decide whether a product of two matrices can be found, which two numbers do you compare?', 'The columns of the first and the rows of the second']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'operate', matrices: AB, left: 'A', right: 'B', askDefined: false }),
    ['Let’s back up. The first entry of a product comes from which two?', 'The first row of the first matrix and the first column of the second']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'operate', matrices: AB, left: 'A', right: 'B', judgeInverse: true }),
    ['Let’s back up. Two matrices are inverses when their product is…', 'the identity matrix']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'locate', matrices: { B: { rows: [[1, 2], [3, 4]] } }, matrix: 'B', targets: [{ row: 2, col: 1 }] }),
    ['Let’s back up. When you name an element of a matrix, which comes first?', 'Its row']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'locate', matrices: { B: { rows: [[1, 2], [3, 4]] } }, matrix: 'B', askDimensions: true }),
    ['Let’s back up. A matrix’s dimensions are written as…', 'rows × columns']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'equation', equations: ['x + y = 3', 'x - y = 1'] }),
    ['Let’s back up. In A · X = B, what goes in A?', 'The coefficients of the variables']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'equation', equations: ['x + y = 3', 'x = 2y - 1'] }),
    ['Let’s back up. Before an equation’s numbers go in the matrices, how must it be written?', 'Every variable on the left, the constant on the right']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'solve', equations: ['x + y = 3', 'x - y = 1'] }),
    ['Let’s back up. To solve A · X = B, which product gives X?', 'A⁻¹ · B']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'solve', equations: ['x + y = 3', '2x + 2y = 6'], justifySingular: true }),
    ['Let’s back up. Solving with an inverse works only when the coefficient matrix…', 'has an inverse']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'solve', showEquations: false, variableMeanings: { c: 'child tickets', a: 'adult tickets' } }),
    ['Let’s back up. The situation has two unknowns. How many equations do you write?', 'Two']);
  assert.deepEqual(right({ type: 'matrixLab', mode: 'completeSystem', equations: ['x + y + z = 1', 'x - y = 2'] }),
    ['Let’s back up. Start the new equation from…', 'a multiple of a given equation']);
  // Nothing to read: no step (the platform's, not shown).
  assert.equal(toolBackUpStep({ type: 'matrixLab' }), null);
  assert.equal(toolBackUpStep({ type: 'matrixLab', mode: 'operate', matrices: { A: { rows: [[1]] } } }), null);
  assert.equal(backUpStepWritten(backUpStepFor({ type: 'matrixLab' })), false);
});

test('every step a tool can write is in Spanish, its mathematics untouched (Translate)', async () => {
  const pack = await loadLanguagePack('es');
  const AB = { A: { rows: [[1, 0], [0, 1]] }, B: { rows: [[2, 1], [1, 1]] } };
  const cases = [
    { type: 'matrixLab', mode: 'operate', operation: 'add', matrices: AB, left: 'A', right: 'B' },
    { type: 'matrixLab', mode: 'operate', matrices: AB, left: 'A', right: 'B' },
    { type: 'matrixLab', mode: 'operate', matrices: AB, left: 'A', right: 'B', askDefined: false },
    { type: 'matrixLab', mode: 'operate', matrices: AB, left: 'A', right: 'B', judgeInverse: true },
    { type: 'matrixLab', mode: 'locate', matrices: AB, matrix: 'A', targets: [{ row: 1, col: 2 }] },
    { type: 'matrixLab', mode: 'locate', matrices: AB, matrix: 'A', askDimensions: true },
    { type: 'matrixLab', mode: 'equation', equations: ['x + y = 3', 'x - y = 1'] },
    { type: 'matrixLab', mode: 'equation', equations: ['x + y = 3', 'x = 2y - 1'] },
    { type: 'matrixLab', mode: 'solve', equations: ['x + y = 3', 'x - y = 1'] },
    { type: 'matrixLab', mode: 'solve', justifySingular: true, equations: ['x + y = 3', '2x + 2y = 6'] },
    ...[2, 3, 4].map((count) => ({ type: 'matrixLab', mode: 'solve', showEquations: false, variableMeanings: Object.fromEntries(['a', 'b', 'c', 'd'].slice(0, count).map((key) => [key, `${key} items`])) })),
    { type: 'matrixLab', mode: 'completeSystem', equations: ['x + y + z = 1'] },
    { type: 'systemsWorkspace', mode: 'spatial', variables: ['x', 'y', 'z'], equations: ['x + y + z = 3', 'x - y = 1', 'z = 2'] },
    { type: 'systemsWorkspace', mode: 'algebraic', variables: ['s', 'm', 'l'], equations: ['s + m = 8', 'm + l = 4', 's + l = 7'] },
    { type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', variables: ['x', 'y', 'z'], equations: ['x = 2y', 'y + z = 3', 'x + z = 4'] },
  ];
  cases.forEach((question, index) => {
    const step = toolBackUpStep({ ...question, questionId: `case-${index}` });
    assert.ok(step, JSON.stringify(question));
    const text = [step.prompt, ...step.options.map((option) => `${option}.`)].join('\n');
    const result = translateWithPack(text, pack);
    assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${text}\n→ untranslated: ${result.sentences.filter((sentence) => !sentence.translated && !sentence.mathOnly).map((sentence) => sentence.source).join(' | ')}`);
  });
});
test('Systems Workspace: three planes and three-variable elimination get a step; two equations stay the family\'s', () => {
  const planes = toolBackUpStep({ type: 'systemsWorkspace', mode: 'spatial', variables: ['x', 'y', 'z'], equations: ['x + y + z = 3', 'x - y = 1', 'z = 2'] });
  assert.equal(planes.prompt, 'Let’s back up. Each equation in x, y and z is what shape in space?');
  assert.equal(planes.correct, 'A plane');
  const elimination = toolBackUpStep({ type: 'systemsWorkspace', mode: 'algebraic', variables: ['s', 'm', 'l'], equations: ['s + m - l = 8', '-3s + m + l = 4', 's + m + l = 72'], method: 'elimination' });
  assert.equal(elimination.prompt, 'Let’s back up. With three equations in s, m and l, what is the first goal?');
  assert.equal(elimination.correct, 'Eliminate the same variable from two pairs of equations');
  const substitution = toolBackUpStep({ type: 'systemsWorkspace', mode: 'algebraic', variables: ['x', 'y', 'z'], equations: ['x = 2y', 'y + z = 3', 'x + z = 4'], method: 'substitution' });
  assert.equal(substitution.correct, 'One equation solved for one variable');
  // Two equations in two variables belong to the systems family.
  assert.equal(toolBackUpStep({ type: 'systemsWorkspace', mode: 'algebraic', variables: ['x', 'y'], equations: ['x + y = 3', 'x - y = 1'] }), null);
  assert.equal(backUpStepFor({ type: 'systemsWorkspace', mode: 'algebraic', variables: ['x', 'y'], equations: ['x + y = 3', 'x - y = 1'] }).source, 'family');
});

test('a step built from the tool is shown, and counts as problem-specific help like a family\'s', () => {
  const step = backUpStepFor({ type: 'matrixLab', mode: 'solve', equations: ['x + y = 3', 'x - y = 1'] });
  assert.equal(step.source, 'tool');
  assert.equal(backUpStepWritten(step), true);
  // QuestionEngine and supportUseMemory treat every source but the platform's as written for the problem.
  const engine = readFileSync(join(ROOT, 'src/QuestionEngine.jsx'), 'utf8');
  assert.match(engine, /const backUpSpecific = specificStepUsed \|\| \(scaffoldComplete && scaffold\.source !== 'platform'\);/);
  const memory = readFileSync(join(ROOT, 'src/platform/supports/supportUseMemory.js'), 'utf8');
  assert.match(memory, /const problemSpecificStep = Boolean\(scaffoldUsed\) \|\| \(Boolean\(backUpStepDone\) && backUpStepSource !== 'platform'\);/);
});

test('the V5 compiler keeps an authored scaffold, and it is the step the student gets', () => {
  const scaffold = { prompt: 'Let’s back up. Probe: which comes first?', options: ['This one', 'That one'], correct: 'That one' };
  const lesson = JSON.parse(readFileSync(join(ROOT, 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json'), 'utf8'));
  const authored = lesson.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === 'l3-cw-11');
  authored.scaffold = scaffold;
  const stored = compileAuthoringIntentV5(lesson).package.sections.flatMap((section) => section.questions).find((entry) => entry.questionId === 'l3-cw-11');
  assert.deepEqual(stored?.scaffold, scaffold);
  const question = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null));
  assert.deepEqual(backUpStepFor(question), { ...scaffold, source: 'authored' });
});

test('every real plain multi-answer item carries an authored step that never offers its own answer', () => {
  const plain = realItems().filter(({ question }) => question.type === 'multiAnswer' && backUpStepFor(question).source !== 'family');
  assert.ok(plain.length >= 40, `the plain multi-answer items are found (${plain.length})`);
  const steps = plain.map(({ stored, question }) => ({ stored, question, step: backUpStepFor(question) }));
  assert.deepEqual(steps.filter(({ step }) => step.source !== 'authored').map(({ stored }) => stored.questionId), [], 'each has an authored step');
  steps.forEach(({ stored, question, step }) => {
    assert.match(step.prompt, /^Let’s back up\. \S/, stored.questionId);
    assert.equal(step.options.length, 2, stored.questionId);
    assert.ok(step.options.includes(step.correct), stored.questionId);
    const answers = answersOf(question);
    step.options.forEach((option) => {
      assert.ok(!answers.includes(option.trim().toLowerCase().replace(/[.\s]+$/, '')), `${stored.questionId}: "${option}" is one of the item's own answers`);
    });
  });
  const firstIsRight = steps.filter(({ step }) => step.options[0] === step.correct).length;
  assert.ok(firstIsRight > 0 && firstIsRight < steps.length, `the right choice is first on ${firstIsRight} of ${steps.length}`);
});

test('every real Matrix Lab, Systems Workspace and multi-answer item in a Warm-Up, Classwork or Practice has a step written for it', () => {
  const inScope = realItems().filter(({ question }) => ['matrixLab', 'systemsWorkspace', 'multiAnswer'].includes(question.type));
  const without = inScope.filter(({ question }) => !backUpStepWritten(backUpStepFor(question))).map(({ stored }) => stored.questionId);
  assert.deepEqual(without, []);
  assert.ok(inScope.length >= 100, `${inScope.length} items`);
});

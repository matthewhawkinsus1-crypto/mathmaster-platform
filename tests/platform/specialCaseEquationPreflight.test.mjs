/*
 * A TEACHER-TYPED EQUATION WHOSE VARIABLE CANCELS (the owner's #554 item 5; #396 item 2).
 *
 * 2x + 3 = 2x + 5 on the balance workspace: the student's own steps reach
 * 3 = 5 and the question can never be finished. The relation workspace
 * finishes it, and decides between "No solution" and "All real numbers" only
 * once the student's steps reach a statement with no variable.
 *
 * Importing a lesson already opens such an equation there (since 68c1d93e).
 * What still reached students was an item that never passed through an
 * import: a Question Editor replacement, a repair pack, an assignment stored
 * before then. Those items are not rerouted where they are delivered: the
 * route is the grader's too (resolveStepAlgebraMode), so it would change the
 * workspace their students' saved work was made in and the grader the server
 * marks it with. Pre-Flight warns the teacher instead, wherever the item is
 * checked, by the one rule the import applies (specialCaseEquations.js), and
 * never blocks a save or a reuse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { specialCaseOnBalanceWorkspace } from '../../src/platform/contract/specialCaseEquations.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import {
  applyBalancedOperationToRelation,
  cloneRelationState,
  obviousSpecialClaim,
  parseRelationSource,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';

const CANCELS = /has an equation whose variable cancels/;
const warningsFor = (question) => validateQuestionSemantics(question, { label: 'Question 3' }).warnings.filter((warning) => CANCELS.test(warning));

test('Pre-Flight names a cancelling equation that would open on the balance, and the line that fixes it', () => {
  const [none] = warningsFor({ type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 = 2x + 5' });
  assert.match(none, /^Question 3 \(stepAlgebra\) has an equation whose variable cancels, "2x \+ 3 = 2x \+ 5": no number is a solution\./);
  assert.match(none, /Add "relationWorkspace": true, so it opens in the relation workspace, where the student concludes "No solution" once their steps reach that statement/);
  assert.match(none, /Give the one-solution equations beside it "relationWorkspace": true as well/);
  const [all] = warningsFor({ type: 'stepAlgebra', prompt: 'Solve.', equationLatex: '3(x - 1) = 3x - 3' });
  assert.match(all, /every number is a solution\./);
  assert.match(all, /concludes "All real numbers"/);
  assert.equal(warningsFor({ type: 'algebra', prompt: 'Solve.', equation: '4(x + 1) = 4x + 9' }).length, 1, 'the retired algebra type opens the same board');
});

test('only an item that would open on the balance with nothing to finish is named', () => {
  for (const question of [
    { type: 'stepAlgebra', prompt: 'Solve.', equation: '3x + 6 = 21' }, // one solution
    { type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 = 2x + 5', relationWorkspace: true }, // already there
    { type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 = 2x + 5', relationWorkspace: false }, // the author chose the balance
    { type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 < 2x + 5' }, // an inequality opens the relation workspace
    { type: 'stepAlgebra', prompt: 'Rewrite.', equation: '2x + 3y = 2x + 5', targetForm: 'slopeIntercept' }, // not solving for x
    { type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', equation: '3x + 4y = 24' },
    { type: 'stepAlgebra', prompt: 'Solve {{equation}}.', questionFamily: { id: 'linear.multiStepEquation', version: 2, constraints: { solutionCase: 'none' } } },
    { type: 'multiAnswer', prompt: 'Solve 2x + 3 = 2x + 5.', answerFields: [{ id: 'a', label: 'Solution', answer: 'no solution' }] },
  ]) {
    assert.deepEqual(warningsFor(question), [], JSON.stringify(question));
  }
});

test('a warning, never a refusal: an old assignment holding the item is still checked clean, and reusable', () => {
  const stored = {
    id: 'stored-before-oct-22',
    title: 'Special cases (stored before imports routed them)',
    schemaVersion: 5,
    sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [
      { questionId: 'sc-1', type: 'stepAlgebra', prompt: 'Solve 2x + 3 = 2x + 5.', equationLatex: '2x + 3 = 2x + 5', standard: 'A.5A' },
      { questionId: 'sc-2', type: 'stepAlgebra', prompt: 'Solve 3x + 6 = 21.', equationLatex: '3x + 6 = 21', standard: 'A.5A' },
    ] }],
  };
  const model = buildAssignmentV5PreflightModel(storedAssignmentToV5(stored, {}));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.warnings.filter((warning) => CANCELS.test(warning)).length, 1, 'named once, as a warning');
  // Nothing stored or graded changes: the item still opens, and is graded, where it always was.
  assert.equal(resolveStepAlgebraMode(stored.sections[0].questions[0]), 'equation');
  assert.equal(stored.sections[0].questions[0].relationWorkspace, undefined);
});

test('a teacher\'s import routes the same equation itself, so Pre-Flight has nothing to say there', () => {
  const base = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json', import.meta.url), 'utf8'));
  const practice = base.sections.find((section) => section.role === 'practice');
  practice.questions = [{
    questionId: 'typed-special', standard: 'A.5A', alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }], dok: 2, difficultyBand: 2,
    studentActions: ['solveStepByStep'], prompt: 'Solve 2x + 3 = 2x + 5.', equation: '2x + 3 = 2x + 5',
  }];
  base.sections = [practice];
  const { parsed, model, questions, semantic } = compileTeacherImport(JSON.stringify(base));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const [question] = questions;
  assert.equal(question.relationWorkspace, true, 'the import opens it in the relation workspace');
  assert.ok(parsed.repairs.some((repair) => /where a student can conclude "No solution"/.test(repair)), 'and lists the repair');
  assert.equal([...model.warnings, ...semantic.warnings].filter((warning) => CANCELS.test(warning)).length, 0);
  assert.equal(specialCaseOnBalanceWorkspace(question), null);
});

// Every Step Algebra item the repository holds, as written (before any import):
// lessons, samples, drafts, seeds and the demo. None is one, so no lesson's
// Pre-Flight changes, and no stored copy of one is named.
test('no item in the repository\'s lessons, seeds or demo is one, so no Pre-Flight changes for one', () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    if (['node_modules', '.git', 'dist', 'tests'].includes(name)) return;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.json')) files.push(full);
  });
  walk(repo);
  const items = [];
  const visit = (node, file) => {
    if (Array.isArray(node)) { node.forEach((value) => visit(value, file)); return; }
    if (!node || typeof node !== 'object') return;
    if (['stepAlgebra', 'algebra'].includes(node.type)) items.push({ file: path.relative(repo, file), question: node });
    Object.values(node).forEach((value) => visit(value, file));
  };
  files.forEach((file) => { try { visit(JSON.parse(readFileSync(file, 'utf8')), file); } catch { /* not JSON */ } });
  assert.ok(items.length >= 40, `${items.length} Step Algebra items`);
  const named = items.filter(({ question }) => specialCaseOnBalanceWorkspace(question)).map(({ file, question }) => `${file}: ${question.equation || question.equationLatex}`);
  assert.deepEqual(named, []);
});

test('the relation workspace tells "No solution" from "All real numbers" only after the student simplifies', () => {
  for (const [source, simplified, claim] of [['2x + 3 = 2x + 5', ['3', '5'], 'noSolution'], ['2x + 3 = 2x + 3', ['3', '3'], 'allReals']]) {
    const start = parseRelationSource(source, 'x');
    assert.equal(obviousSpecialClaim(start), null, `${source}: nothing to conclude at the start`);
    const moved = applyBalancedOperationToRelation(start, 'subtract', '2x', { branchIndex: 0 }).state;
    assert.equal(obviousSpecialClaim(moved), null, `${source}: nor after the move, before the student simplifies`);
    const reached = cloneRelationState(moved);
    reached.branches[0].expressions = simplified;
    assert.equal(obviousSpecialClaim(reached), claim, `${source}: once the student's statement has no variable`);
  }
});

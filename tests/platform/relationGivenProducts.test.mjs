import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  explicitRelationGivenProducts,
  relationGivenProductProblem,
} from '../../src/platform/contract/relationGivenProducts.js';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { relationSourceFromQuestion, resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { relationWorkspaceWork } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  parseRelationSource,
  verifyRelationCandidate,
  zeroProductFactors,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';

/*
 * AN AUTHORED  x(x - 5) = 0  IS A PRODUCT, NOT A FUNCTION NAMED x.
 *
 * The relation workspace's parser reads a variable straight before a bracket
 * as a call of a function of that name, which no relation defines, so an
 * equation written that way could never be evaluated: every check failed and
 * a correct answer was marked wrong, while Pre-Flight passed the item. The
 * Factor and Zero-product tools invite exactly such givens.
 *
 * Importing writes the multiplication (and says so); Pre-Flight warns about the
 * shape where it arrives without that compile, and never blocks an existing
 * assignment. Only the item's own variable is read as a factor: function
 * notation keeps working.
 */

const lessonWith = (questions, extra = {}) => JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Factored givens', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions }],
  ...extra,
});
const solveStepByStep = (questionId, equation, extra = {}) => ({
  questionId,
  studentActions: ['solveStepByStep'],
  prompt: `Solve $${equation}$.`,
  equation,
  solveFor: 'x',
  relationWorkspace: true,
  ...extra,
});
const PRODUCT_WARNING = /writes x straight before a bracket in its equation/;
const grade = (question, relationState) => gradeServerResponse({
  question: deliveredQuestionForGrading(question),
  response: buildToolResponse({ question, toolId: 'stepAlgebra', work: relationWorkspaceWork({ relationState }) }),
});

test('importing writes the multiplication into an authored factored given, says so, and the item can then be solved and graded', () => {
  const compiled = compileTeacherImport(lessonWith([solveStepByStep('q-factored', 'x(x - 5) = 0', { algebraTools: ['factor', 'zeroProduct'] })]));
  assert.equal(compiled.model.isValid, true, compiled.model.errors.join('\n'));
  assert.deepEqual(compiled.semantic.errors, []);
  assert.ok(!compiled.semantic.warnings.some((warning) => PRODUCT_WARNING.test(warning)), 'the import itself leaves nothing for Pre-Flight to warn about');
  const [question] = compiled.questions;
  assert.equal(question.equationLatex, 'x*(x - 5) = 0');
  assert.equal(resolveStepAlgebraMode(question), 'relation');
  assert.ok(
    compiled.parsed.repairs.some((repair) => repair.includes('x(x - 5) = 0 → x*(x - 5) = 0') && repair.includes('a function named x')),
    'the teacher is told what was rewritten and why',
  );

  // What it was for: the workspace can now evaluate the equation, the tools find their product, and the server grades the honest answer right.
  const state = parseRelationSource(relationSourceFromQuestion(question), 'x');
  assert.equal(verifyRelationCandidate(state, 5), true);
  assert.equal(verifyRelationCandidate(state, 4), false);
  assert.deepEqual(zeroProductFactors(state, 0), ['x', 'x - 5']);
  const solved = { ...state, branches: [{ expressions: ['x', '0'], relations: ['='] }, { expressions: ['x', '5'], relations: ['='] }], connective: 'OR' };
  const verdict = grade(question, solved);
  assert.equal(verdict.graded, true, verdict.reason);
  assert.equal(verdict.isCorrect, true);
  const wrong = grade(question, { ...solved, branches: [solved.branches[0], { expressions: ['x', '4'], relations: ['='] }] });
  assert.equal(wrong.isCorrect, false);
});

test('a stored item that comes back in a portable export is repaired on import, never refused', () => {
  const exported = lessonWith([{
    questionId: 'q-stored',
    type: 'stepAlgebra',
    prompt: 'Solve $x(x-5)=0$.',
    equationLatex: 'x(x - 5) = 0',
    solveFor: 'x',
    relationWorkspace: true,
  }], { portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } });
  const parsed = parseAssignmentBlueprintText(exported);
  assert.equal(parsed.questions[0].equationLatex, 'x*(x - 5) = 0');
  assert.equal(parsed.assignmentV5.sections[0].questions[0].equationLatex, 'x*(x - 5) = 0', 'the repair reaches the assignment that is saved');
  assert.deepEqual(validateQuestionSemantics(parsed.questions[0]).errors, []);
});

test('every way an author writes the variable before a bracket, and every field the workspace reads it from', () => {
  const written = (question) => explicitRelationGivenProducts({ type: 'stepAlgebra', prompt: 'Solve.', solveFor: 'x', relationWorkspace: true, ...question }).question;
  assert.equal(written({ equationLatex: '2x(x - 3) = 0' }).equationLatex, '2x*(x - 3) = 0', 'a coefficient before it');
  assert.equal(written({ equationLatex: 'x\\left(x-5\\right)=0' }).equationLatex, 'x*\\left(x-5\\right)=0', 'MathLive brackets stay paired');
  assert.equal(written({ equationLatex: 'x (x + 1) = 6' }).equationLatex, 'x* (x + 1) = 6');
  assert.equal(written({ equationLatex: 'x^2 = x(x - 5) + 10' }).equationLatex, 'x^2 = x*(x - 5) + 10');
  assert.equal(written({ solveFor: 'h', equationLatex: 'h(h + 2) = 15' }).equationLatex, 'h*(h + 2) = 15', 'the item\'s own letter');
  assert.equal(written({ relationWorkspace: undefined, inequalityText: 'x(x - 4) > 0' }).inequalityText, 'x*(x - 4) > 0', 'an inequality opens the workspace by itself');
  const split = written({ leftExpression: 'x(x + 2)', rightExpression: '0', expressions: ['x(x + 2)', '0'], relations: ['='], metadata: { equation: 'x(x + 2) = 0' } });
  assert.deepEqual([split.leftExpression, split.rightExpression, split.expressions, split.metadata.equation], ['x*(x + 2)', '0', ['x*(x + 2)', '0'], 'x*(x + 2) = 0']);
  // Every rewritten form is the product the parser now reads.
  for (const source of ['2x*(x - 3) = 0', 'x*\\left(x-5\\right)=0', 'x* (x + 1) = 6']) {
    assert.doesNotThrow(() => parseRelationSource(source, 'x'), source);
    assert.match(parseRelationSource(source, 'x').branches[0].expressions[0], /x \* \(/, source);
  }
  // The prompt is what the student reads, and is never rewritten.
  assert.equal(written({ prompt: 'Solve $x(x-5)=0$.', equationLatex: 'x(x - 5) = 0' }).prompt, 'Solve $x(x-5)=0$.');
});

test('only the item\'s own variable is a factor: function notation, other items and the balance workspace are left exactly as written', () => {
  const unchanged = (question) => {
    const item = { type: 'stepAlgebra', prompt: 'Solve.', solveFor: 'x', relationWorkspace: true, ...question };
    const result = explicitRelationGivenProducts(item);
    assert.equal(result.question, item, JSON.stringify(question));
    assert.deepEqual(result.changes, []);
    assert.equal(relationGivenProductProblem(item), null, JSON.stringify(question));
  };
  unchanged({ equationLatex: 'x*(x - 5) = 0' });
  unchanged({ equationLatex: '(x)(x - 5) = 0' });
  unchanged({ equationLatex: '(2x - 1)(x - 3) = 0' });
  unchanged({ equationLatex: 'sqrt(x + 4) + 2 = x' });
  unchanged({ equationLatex: '|x - 2| = 3' });
  // Another letter before a bracket is a function's name, or the author's to fix: never read as a product.
  unchanged({ equationLatex: 'f(x) = 2x + 3' });
  unchanged({ equationLatex: 'a(x - 3) > 12' });
  // The variable itself, where the item writes it as a function of another letter.
  unchanged({ solveFor: 'x', equationLatex: 'x(t) = 3t + 1' });
  unchanged({ prompt: 'The position is x(t) = 3t + 1. Solve x(x - 3) = 4t.', equationLatex: 'x(x - 3) = 4t' });
  // Not the relation workspace: the balance workspace and other question types read their own fields.
  unchanged({ relationWorkspace: undefined, equationLatex: 'x(x - 5) = 0' });
  unchanged({ relationWorkspace: false, equationLatex: 'x(x - 5) = 0' });
  unchanged({ type: 'literal', equationLatex: 'A = x(x + 2)' });
  unchanged({ type: 'multiAnswer', answerFields: [{ id: 'f', answer: '4x(x-4)(x-6)' }] });
  unchanged({ solveFor: 'rate', equationLatex: 'rate(rate - 2) = 0' });

  // Live lessons whose function notation and factored answer keys have this shape come out of an import as written.
  for (const [file, kept] of [
    ['teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json', ['f(x)=4x', 'f(x)=6x']],
    ['teacher-import-jsons/algebra1-module3/T1_L3_Modeling_and_Solving_Linear_Inequalities.json', ['f(b)=3.75b+25', 'h(m)=4800-20m']],
    ['teacher-import-jsons/algebra2-polynomials-radicals-honors/1_Factoring_Polynomials_Honors.json', ['4x(x-4)(x-6)', 'n(n-1)(n+1)', '2y(x+3)', 'z(x+3)']],
  ]) {
    const compiled = compileTeacherImport(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    const text = JSON.stringify(compiled.questions);
    kept.forEach((written) => assert.ok(text.includes(JSON.stringify(written)), `${file}: ${written}`));
    assert.ok(!compiled.parsed.repairs.some((repair) => repair.includes('wrote the multiplication')), file);
  }
});

test('Pre-Flight warns about the shape where it arrives without the compile — a replacement, a repair pack, a family\'s generated version — with the line to write', () => {
  const replacement = { type: 'stepAlgebra', prompt: 'Solve $x(x-5)=0$.', equationLatex: 'x(x - 5) = 0', solveFor: 'x', relationWorkspace: true };
  const judged = validateQuestionSemantics(replacement, { label: 'Question 4' });
  assert.deepEqual(judged.errors, [], 'a warning, never a refusal');
  const warned = judged.warnings.filter((warning) => PRODUCT_WARNING.test(warning));
  assert.equal(warned.length, 1, judged.warnings.join('\n'));
  assert.match(warned[0], /^Question 4 \(stepAlgebra\) writes x straight before a bracket in its equation, "x\(x - 5\) = 0"\./);
  assert.match(warned[0], /a function named x, so no student work on it could be checked/);
  assert.match(warned[0], /Write the multiplication: "x\*\(x - 5\) = 0"\.$/);
  // The line it asks for is not warned about, and is exactly what an import writes.
  assert.ok(!validateQuestionSemantics(explicitRelationGivenProducts(replacement).question).warnings.some((warning) => PRODUCT_WARNING.test(warning)));

  // A family slot is judged on the versions it generates.
  const slot = {
    type: 'stepAlgebra',
    prompt: 'Solve by factoring.',
    equationLatex: 'x(x {{b|signed}}) = 0',
    solveFor: 'x',
    relationWorkspace: true,
    generator: { parameters: { b: { type: 'int', min: 1, max: 9 } } },
    questionFamily: { scope: 'assignment' },
  };
  const slotJudged = validateQuestionSemantics(slot, { label: 'Question 5' });
  assert.deepEqual(slotJudged.errors, []);
  assert.match(slotJudged.warnings.join('\n'), /Question 5 \(stepAlgebra\) writes x straight before a bracket in its equation, "x\(x \+ \d\) = 0"/);
  // Imported, the slot's template carries the multiplication, so every version does.
  const imported = compileTeacherImport(lessonWith([{ questionId: 'q-slot', studentActions: ['solveStepByStep'], prompt: 'Solve by factoring.', equation: 'x(x {{b|signed}}) = 0', solveFor: 'x', relationWorkspace: true, generator: slot.generator, questionFamily: slot.questionFamily }]));
  assert.equal(imported.model.isValid, true, imported.model.errors.join('\n'));
  assert.deepEqual(imported.semantic.errors, []);
  assert.ok(!imported.semantic.warnings.some((warning) => PRODUCT_WARNING.test(warning)), 'nothing left to warn about once imported');
  assert.equal(imported.questions[0].equationLatex, 'x*(x {{b|signed}}) = 0', 'a placeholder is never touched');
});

test('an assignment stored before imports wrote the multiplication still passes Pre-Flight: its save and its reuse are never blocked', () => {
  // As the Question Editor and a library reuse rebuild it from the stored record.
  const stored = {
    schemaVersion: 5,
    title: 'Solving by factoring',
    courseId: 'algebra1',
    questions: [
      { questionId: 'old-1', type: 'stepAlgebra', prompt: 'Solve $x(x-5)=0$.', equationLatex: 'x(x - 5) = 0', solveFor: 'x', relationWorkspace: true, activityRole: 'classwork', sectionId: 'classwork' },
      { questionId: 'old-2', type: 'stepAlgebra', prompt: 'Solve $3x + 1 = 7$.', equationLatex: '3x + 1 = 7', solveFor: 'x', activityRole: 'classwork', sectionId: 'classwork' },
    ],
  };
  const model = buildAssignmentV5PreflightModel(storedAssignmentToV5(stored, { questions: stored.questions }));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.ok(!model.errors.some((error) => PRODUCT_WARNING.test(error)));
  assert.ok(model.warnings.some((warning) => warning.startsWith('Question 1 (stepAlgebra) writes x straight before a bracket')), 'the teacher is told what to write');
});

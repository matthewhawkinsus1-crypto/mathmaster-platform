/*
 * N76: THE DEMO'S SYSTEM ITEMS SHOW TWO EQUATIONS, NOT A LOGIC SIGN.
 *
 * 17 demo `literal` items hold a system in `formula` as "y=x+2 and y=3x-4".
 * LiteralGrader draws `formula` as ASCII math, where MathLive reads the word
 * "and" as the logic sign ∧, so the student saw "y = x + 2 ∧ y = 3x − 4". Each
 * now carries `formulaLatex`, which LiteralGrader draws in its place: the two
 * equations as a system, one under the other, inside a brace.
 *
 * `formula` itself is unchanged. It is what everything else reads: the routes
 * that decide whether a literal question opens Step Algebra's balance
 * workspace (they read `formula` before `formulaLatex`), the support families
 * that decline these items, the spoken name of the formula and the text the
 * attempt records. So both are tested: what is drawn, and that every reader of
 * the formula reads what it read before.
 *
 * A browser that already holds a demo seed keeps the old copies until "Reset
 * Demo Classroom".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateQuestion } from '../../src/problemGenerator.js';
import { createDemoSeed } from '../../src/demo/demoExperienceData.js';
import { ALGEBRA_WORKSPACE_ROUTES, resolveAlgebraWorkspaceRoute } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { LITERAL_EQUATION_FIELDS, relationSourceFromQuestion } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const BANK = JSON.parse(read('src/demo/demoAssignmentBank.json'));
const ITEMS = BANK.flatMap((assignment) => assignment.questions);
const SYSTEMS = ITEMS.filter((question) => /\sand\s/.test(String(question.formula || '')));

/** The rows of a `cases` block, or null. */
const casesRows = (latex) => {
  const match = /^\\begin\{cases\}\s*([\s\S]*?)\s*\\end\{cases\}$/.exec(String(latex || '').trim());
  return match ? match[1].split(/\s*\\\\\s*/).map((row) => row.trim()) : null;
};

test('every demo system is drawn as its two equations, the same two its formula holds, with no "and" to become ∧', () => {
  assert.equal(SYSTEMS.length, 17);
  for (const question of SYSTEMS) {
    const equations = question.formula.split(/\s+and\s+/);
    assert.equal(equations.length, 2, question.questionId);
    assert.deepEqual(casesRows(question.formulaLatex), equations, `${question.questionId}: one equation a row, as the formula has them`);
    assert.doesNotMatch(question.formulaLatex, /\band\b|\\land|\\wedge|∧/, question.questionId);
  }
  // Nothing else in the bank gained a drawing of its own.
  assert.deepEqual(ITEMS.filter((question) => question.formulaLatex).map((question) => question.questionId), SYSTEMS.map((question) => question.questionId));
});

test('LiteralGrader draws formulaLatex, as LaTeX, in place of the formula, and names it in words from the formula', () => {
  const grader = executableSource(read('src/LiteralGrader.jsx'));
  assert.match(grader, /const displayedFormula = formulaLatex \|\| formula;/);
  assert.match(grader, /<MathDisplay value=\{displayedFormula\} format=\{formulaLatex \? 'latex' : 'ascii-math'\} ariaLabel=\{`Formula \$\{formula \|\| formulaLatex \|\| ''\}`\} \/>/);
  // What the demo hands QuestionEngine keeps it: the generated question and the demo seed.
  for (const question of SYSTEMS) {
    assert.equal(generateQuestion(question, `n76|${question.questionId}`).formulaLatex, question.formulaLatex, question.questionId);
  }
  const seeded = createDemoSeed(Date.UTC(2026, 10, 5)).assignments.flatMap((assignment) => assignment.questions);
  assert.equal(seeded.filter((question) => question.formulaLatex).length, 17, 'a fresh demo seed carries the drawing');
});

test('every reader of the formula reads what it read before: the workspace routes, the support families and the grade', () => {
  // The literal fields are read formula first, so the text a route reads is the formula as it was.
  assert.ok(LITERAL_EQUATION_FIELDS.indexOf('formula') < LITERAL_EQUATION_FIELDS.indexOf('formulaLatex'));
  for (const question of SYSTEMS) {
    const generated = generateQuestion(question, `n76|${question.questionId}`);
    const without = { ...generated };
    delete without.formulaLatex;
    // Still a typed answer, not Step Algebra's balance workspace.
    assert.equal(resolveAlgebraWorkspaceRoute(generated).route, ALGEBRA_WORKSPACE_ROUTES.LITERAL_ANSWER, question.questionId);
    assert.equal(relationSourceFromQuestion(generated), question.formula, `${question.questionId}: the relation a route reads`);
    // No support family claims it with the drawing, as none did without it.
    assert.equal(familyFor(generated), familyFor(without), question.questionId);
    assert.equal(familyFor(generated), null, `${question.questionId}: no family's hints for a two-equation formula`);
    // Graded exactly as before: every accepted answer right, another value wrong.
    for (const value of question.acceptedAnswers) {
      assert.equal(gradeServerResponse({ question: generated, response: { kind: 'scalar', type: 'literal', value, fields: [] } }).isCorrect, true, `${question.questionId}: ${value}`);
    }
    assert.equal(gradeServerResponse({ question: generated, response: { kind: 'scalar', type: 'literal', value: '999', fields: [] } }).isCorrect, false);
  }
});

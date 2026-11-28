/*
 * WE-I: THE SYNTHETIC AND LONG DIVISION REPLAY
 * (docs/platform/WORKED_EXAMPLES.md sections 4 and 9;
 * src/platform/supports/workedExample/divisionReplay.js).
 *
 * What is proved here, over every division question in teacher-import-jsons:
 *   1. every number a slide shows is the division view's own key
 *      (polynomialMath.mjs), and the work the example stands for is marked
 *      right by the workshop's own grader; work it does not mark right is
 *      refused, and so is a question the view cannot draw;
 *   2. the sibling is the same kind of division with other numbers: the
 *      letter, the degree, the missing powers, a leading coefficient of 1 or
 *      not, the sign of r, what a theorems item asks; never the item's
 *      dividend, never the item's remainder or quotient;
 *   3. the example handed to a Classwork question is a replay that passes
 *      similarExampleIsSafe over the item, is no item on the assignment, says
 *      why each move is made, and fades before the quotient is read;
 *   4. no example is offered on a DOL, quiz or test;
 *   5. the player draws the table as a table, with named rows;
 *   6. the coverage report counts every Classwork division question as built in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { region } from './helpers/sourceContract.mjs';
import { asQuestionEngineReceivesIt, lessonFiles, measureClassworkExampleCoverage } from '../../scripts/lib/classworkExampleCoverageReport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  longDivisionKey,
  ratioLatex,
  syntheticDivision as syntheticTable,
  syntheticDivisionKey,
  syntheticRemainderDivisor,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import polynomialWorkshopGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import {
  DIVISION_REPLAY_TOOL,
  divisionItemAnswers,
  divisionReplayToolOf,
  divisionSiblingFor,
  replayDivisionExample,
} from '../../src/platform/supports/workedExample/divisionReplay.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import {
  assignmentProblemKeys,
  exampleSectionRule,
  fadedExample,
  workedExampleFor,
} from '../../src/platform/supports/workedExample/examplePlayer.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

// Every division question in the lessons, as QuestionEngine receives it, with its assignment and section role.
const DIVISION = (() => {
  const found = [];
  for (const file of lessonFiles(ROOT)) {
    const compiled = compileAuthoringIntentV5(JSON.parse(read(file)));
    const sections = compiled?.package?.sections || [];
    const all = sections.flatMap((section) => (section.questions || []).map((raw) => {
      try { return { role: section.role || section.activityRole, question: asQuestionEngineReceivesIt(raw) }; } catch { return null; }
    })).filter(Boolean);
    const assignment = all.map((entry) => entry.question);
    all.forEach((entry) => {
      if (divisionReplayToolOf(entry.question)) found.push({ file, ...entry, assignment });
    });
  }
  return found;
})();

const latexNumbers = (values) => values.map((value) => (typeof value === 'number' ? ratioLatex({ n: value, d: 1 }) : ratioLatex(value)));
const mathKey = (value) => String(value).toLowerCase().replace(/[\s$]+/g, '').replace(/\^\{([^{}]*)\}/g, '^$1').replace(/−/g, '-');

test('the lessons hold every kind of division the replay plays', () => {
  const tools = new Set(DIVISION.map((entry) => divisionReplayToolOf(entry.question)));
  assert.deepEqual([...tools].sort(), Object.values(DIVISION_REPLAY_TOOL).sort());
  assert.ok(DIVISION.filter((entry) => entry.role === 'classwork').length >= 14, 'the 14 Classwork division questions and more');
});

// --------------------------------------------- 1. the view's own numbers

test('every number on a slide is the division view\'s own key, and the grader marks the work right', () => {
  let played = 0;
  for (const { question } of DIVISION) {
    const sibling = divisionSiblingFor(question);
    if (!sibling) continue;
    const replay = replayDivisionExample(sibling);
    assert.equal(replay.ok, true, `${question.questionId}: ${replay.error}`);
    played += 1;
    // The work it stands for is graded right by the workshop's own grader.
    assert.equal(polynomialWorkshopGrader.grade(sibling, replay.record).isCorrect, true, question.questionId);
    // The table on its last slide is the key's, cell for cell.
    const table = [...replay.steps].reverse().find((step) => step.board.synthetic)?.board.synthetic;
    if (replay.tool === DIVISION_REPLAY_TOOL.SYNTHETIC) {
      const key = syntheticDivisionKey(sibling);
      assert.deepEqual(table.top, latexNumbers(key.coefficients));
      assert.deepEqual(table.middle, latexNumbers(key.products));
      assert.deepEqual(table.bottom, latexNumbers(key.bottom));
      assert.equal(table.r, ratioLatex(key.r));
    } else if (replay.tool === DIVISION_REPLAY_TOOL.THEOREMS) {
      const key = syntheticTable(sibling.dividend, syntheticRemainderDivisor(sibling).root);
      assert.deepEqual(table.top, latexNumbers(key.top));
      assert.deepEqual(table.middle, latexNumbers(key.middle));
      assert.deepEqual(table.bottom, latexNumbers(key.bottom));
    } else {
      // Long division: one round of three moves for each term of the quotient.
      const key = longDivisionKey(sibling);
      assert.equal(replay.steps.filter((step) => ['divide', 'multiplyBack', 'subtract'].includes(step.board.operation)).length, key.rounds.length * 3);
      assert.equal(table, undefined);
    }
    // Every move says why it is made.
    assert.ok(replay.steps.every((step) => step.show && step.why && step.board.label), question.questionId);
  }
  assert.ok(played >= 30, `played ${played}`);
});

test('work the grader does not mark right, and a division the view cannot draw, are refused', () => {
  // A divisor the synthetic view cannot take (not linear), and one of degree 0.
  assert.equal(replayDivisionExample({ type: 'polynomialWorkshop', mode: 'syntheticDivision', dividend: 'x^3+2x+1', divisor: 'x^2+1' }).ok, false);
  assert.equal(replayDivisionExample({ type: 'polynomialWorkshop', mode: 'longDivision', dividend: 'x^2+1', divisor: '3' }).ok, false);
  // A factor slide for a remainder that is not 0 is never played.
  assert.equal(replayDivisionExample({ type: 'polynomialWorkshop', mode: 'synthetic', dividend: [1, 0, 1], candidateRoot: 1, ask: ['factor'] }).ok, false);
  // Not a division view at all.
  assert.equal(replayDivisionExample({ type: 'polynomialWorkshop', mode: 'factorQuadratic' }).ok, false);
  // The grader is the authority: the replay refuses when it would not mark the work right.
  const source = read('src/platform/supports/workedExample/divisionReplay.js');
  assert.match(source, /if \(!work \|\| !graded\(question, work\)\) return refused\(/);
  assert.match(source, /if \(!graded\(question, work\)\) return refused\(/);
});

// ------------------------------------------------- 2. the sibling's kind

test('the sibling is the same kind of division with other numbers, and never shows the item\'s answer', () => {
  for (const { question } of DIVISION) {
    const sibling = divisionSiblingFor(question);
    if (!sibling) continue;
    const tool = divisionReplayToolOf(question);
    assert.equal(divisionReplayToolOf(sibling), tool);
    if (tool === DIVISION_REPLAY_TOOL.THEOREMS) {
      const item = question.dividend.map(Number);
      assert.equal(sibling.dividend.length, item.length, question.questionId);
      assert.notDeepEqual(sibling.dividend, item, question.questionId);
      assert.deepEqual(sibling.dividend.map((value) => value === 0), item.map((value) => value === 0), `${question.questionId}: the 0 placeholders`);
      assert.equal(sibling.dividend[0] === 1, item[0] === 1, question.questionId);
      assert.equal(Math.sign(sibling.candidateRoot), Math.sign(syntheticRemainderDivisor(question).root), question.questionId);
      const remainder = syntheticTable(sibling.dividend, sibling.candidateRoot).remainder;
      // A factor item's sibling has a factor; any other has a remainder.
      if ((question.ask || ['value', 'quotient', 'factor']).includes('factor')) assert.equal(remainder, 0, question.questionId);
      else assert.notEqual(remainder, 0, question.questionId);
    } else {
      const key = tool === DIVISION_REPLAY_TOOL.SYNTHETIC ? syntheticDivisionKey(question) : longDivisionKey(question);
      const siblingKey = tool === DIVISION_REPLAY_TOOL.SYNTHETIC ? syntheticDivisionKey(sibling) : longDivisionKey(sibling);
      assert.equal(siblingKey.letter, key.letter, question.questionId);
      assert.equal(siblingKey.dividend.degree, key.dividend.degree, question.questionId);
      assert.notEqual(sibling.dividend, question.dividend, question.questionId);
      assert.deepEqual(siblingKey.dividend.coefficients.map((value) => value.n === 0), key.dividend.coefficients.map((value) => value.n === 0), `${question.questionId}: the 0 placeholders`);
      if (tool === DIVISION_REPLAY_TOOL.SYNTHETIC) {
        assert.equal(siblingKey.scaled, key.scaled, `${question.questionId}: divided through first exactly where the item is`);
        assert.notEqual(siblingKey.remainder.n, 0, 'a remainder that is not 0');
      } else {
        assert.equal(Math.abs(siblingKey.divisor.coefficients[0].n), Math.abs(key.divisor.coefficients[0].n));
        assert.ok(siblingKey.remainder.some((entry) => entry.coefficient.n !== 0), 'a remainder that is not 0');
      }
    }
    // The item's quotient and remainder (and P(r)) appear nowhere in the example.
    const replay = replayDivisionExample(sibling);
    assert.equal(similarExampleIsSafe(question, { prompt: replay.prompt, steps: replay.steps.map((step) => `${step.show} ${step.why}`), answer: replay.answer }), true, question.questionId);
    assert.deepEqual(divisionSiblingFor(question), sibling, 'the same seed gives the same sibling');
  }
});

test('the example guard knows a division item\'s own answers; the hint guard is unchanged', () => {
  const sample = DIVISION.find((entry) => entry.question.questionId === 'dp-cw-5').question;
  assert.equal(familyFor(sample)?.family, 'polynomialDivision');
  // For the example guard only (similarExampleIsSafe reads exampleAnswers), so
  // the hints a lesson shows today are what it showed before.
  assert.deepEqual(familyFor(sample).expectedValues(sample), []);
  assert.deepEqual(familyFor(sample).exampleAnswers(sample), divisionItemAnswers(sample));
  assert.equal(similarExampleIsSafe(sample, { prompt: 'Divide.', steps: ['The quotient is x^2-3x+5.'], answer: 'done' }), false, 'a step stating the item\'s quotient is refused');
  // (x³ − 4x + 2) ÷ (x + 3) = x² − 3x + 5 remainder −13.
  assert.ok(divisionItemAnswers(sample).includes('x^2-3x+5'));
  assert.ok(divisionItemAnswers(sample).includes('-13'));
  // A remainder of 0 is the item's case, not a number it states.
  const even = DIVISION.find((entry) => entry.question.questionId === 'dp-cw-3').question;
  assert.ok(!divisionItemAnswers(even).includes('0'));
});

// -------------------------------------------- 3. what a question is handed

test('a Classwork division question is handed a safe replay that is no item on its assignment and fades before the quotient', () => {
  // (A lesson's own example covers the one Classwork long division by 2x − 1, which no sibling is built for.)
  const classwork = DIVISION.filter((entry) => entry.role === 'classwork' && divisionSiblingFor(entry.question));
  assert.ok(classwork.length >= 14);
  for (const { question, assignment } of classwork) {
    const problems = assignmentProblemKeys(assignment);
    const example = workedExampleFor(question, { sectionRole: 'classwork', assignmentProblems: problems });
    assert.ok(example, question.questionId);
    assert.equal(example.format, 'replay', question.questionId);
    assert.equal(example.tool, divisionReplayToolOf(question));
    assert.equal(similarExampleIsSafe(question, { prompt: example.prompt, steps: example.steps.map((step) => `${step.show} ${step.why}`), answer: example.answer }), true, question.questionId);
    // No item of the assignment: not its prompt, and its dividend in no question there.
    assert.ok(!problems.has(mathKey(example.prompt)), question.questionId);
    const dividend = mathKey(/\(([^()]*)\) \\div|P\(x\) = ([^$]*)\$/.exec(example.prompt)?.slice(1).find(Boolean) || '');
    assert.ok(dividend.length >= 5, example.prompt);
    assert.ok(assignment.every((other) => !mathKey(other.prompt || '').includes(dividend)), `${question.questionId}: ${dividend} is on the assignment`);
    // Faded: the first move only, never the quotient or the remainder.
    assert.equal(example.handOverAfter, 1);
    const faded = fadedExample(example);
    assert.equal(faded.steps.length, 1);
    assert.equal(faded.answer, '');
    assert.ok(faded.steps.every((step) => !['read', 'answer', 'remainderTheorem', 'depressed', 'factorTheorem'].includes(step.board.operation)));
    assert.ok(example.fadeLimit < example.steps.length);
    assert.ok(example.steps.slice(0, example.fadeLimit).every((step) => step.board.kind === 'move'), 'the slides before the hand-over read nothing off');
  }
});

// ------------------------------------------------------------ 4. never on a DOL

test('a DOL, quiz or test offers no example at all', () => {
  for (const role of ['dol', 'quiz', 'test']) {
    const rule = exampleSectionRule({ sectionRole: role, activityRole: 'classwork' });
    assert.equal(rule.offered, false, role);
    assert.equal(rule.opensByItself, false, role);
  }
  assert.ok(DIVISION.some((entry) => entry.role === 'dol'), 'the lessons have division on a DOL, which the rule withholds');
});

// ------------------------------------------------------ 5. what the player draws

test('the player draws the synthetic table as a table, with named rows and a boxed remainder', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const MathText = (await server.ssrLoadModule('/src/components/common/MathText.jsx')).default;
    const { SupportedTextActions } = await server.ssrLoadModule('/src/platform/supports/SupportedText.jsx');
    const Player = (await server.ssrLoadModule('/src/platform/supports/workedExample/WorkedExamplePlayer.jsx')).default;
    const replay = replayDivisionExample({ type: 'polynomialWorkshop', mode: 'syntheticDivision', dividend: 'x^3+3x^2-5x-2', divisor: 'x-2' });
    assert.equal(replay.ok, true);
    const column = replay.steps.find((step) => step.board.operation === 'column');
    const html = renderToStaticMarkup(React.createElement(Player, { MathText, SupportedTextActions, example: { source: 'family', format: 'replay', prompt: replay.prompt, steps: [column], answer: '' } }));
    // Slide 1 is the problem; step to the move's slide through the markup's own data.
    assert.match(html, /data-example-slide-count="2"/);
    const source = read('src/platform/supports/workedExample/WorkedExamplePlayer.jsx');
    assert.match(source, /\{board\.synthetic \? <SyntheticTable MathText=\{MathText\} table=\{board\.synthetic\} \/> : null\}/);
    assert.match(source, /<table data-example-synthetic=""/);
    assert.match(source, /<th scope="row"/);
    assert.match(source, /Bottom row \(the last is the remainder\)/);
    // Its cells are the replay's own, a blank one said in words.
    const table = region(source, 'function SyntheticTable', 'function ReplayBoard');
    assert.match(table, /data-example-synthetic-cell=\{value === null \? 'none' : value \? 'filled' : 'blank'\}/);
    assert.match(table, /not yet/);
    assert.deepEqual(Object.keys(column.board.synthetic).sort(), ['bottom', 'columns', 'middle', 'r', 'remainder', 'top']);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------- 6. the coverage

test('the coverage report counts every Classwork division question as built in', () => {
  const measured = measureClassworkExampleCoverage({ root: ROOT });
  const division = measured.lessons.flatMap((lesson) => lesson.questions).filter((entry) => ['syntheticDivision', 'longDivision'].includes(entry.kind) && /^A2\./.test(entry.standard || ''));
  assert.ok(division.length >= 14);
  const uncovered = division.filter((entry) => entry.status === 'uncovered');
  assert.deepEqual(uncovered.map((entry) => entry.questionId), []);
});

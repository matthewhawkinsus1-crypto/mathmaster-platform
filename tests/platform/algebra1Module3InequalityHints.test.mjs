/*
 * ALGEBRA I M3 T2 LESSONS 4 AND 5: HINTS THAT ASK BEFORE THEY TELL
 * (PR #537 walkthrough, F-HINT-GIVES-STEP, the rule the radicals lessons
 * follow: algebra2HonorsRadicalsHints.test.mjs).
 *
 * Hint 1 told the step: L4 CW 6's "The boundary of y > 4x − 6 is the line
 * with slope 4 and y-intercept −6", L5 CW 5's "x + y > 1 becomes
 * y > −x + 1". Two hints handed over a whole boundary: L4 CW 2's hint 2,
 * "(10, 0) and (4, 4)", and L5 PR 8's last hint, "(16, 0) and (0, 24)". Now,
 * on every Warm-Up, Classwork and Practice question of the four files:
 *   - hint 1 is a question that points at the move;
 *   - no hint but the last states an answer, in any generated version: a
 *     typed box's (an inequality box by its own grader), or a build step's —
 *     a point of a boundary line, and, where the student writes the model or
 *     rewrites it with y alone, that inequality, its boundary or its left side
 *     (inequalityAnswersStated.mjs);
 *   - no hint, the last included, gives two points of one boundary line that
 *     the problem does not show: the last hint shows how to find them;
 *   - each item keeps its hint count, and the leak guard shows every hint in
 *     every version;
 *   - a "Let's back up" step, the simpler question offered after a miss,
 *     offers no answer a box takes either.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALGEBRA1_M3_INEQUALITY_LESSONS } from '../../scripts/content/build-algebra1-m3-inequalities.mjs';
import { compiled, readRepoFile, versionsOf } from './helpers/lessonFileChecks.mjs';
import { answersStated, boundaryHandedOver } from './helpers/inequalityAnswersStated.mjs';
import { authoredHintTexts, questionHintAudit } from '../../src/platform/supports/hints/questionHints.js';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';

const HINTED = new Set(['warmup', 'classwork', 'practice']);
const lessons = ALGEBRA1_M3_INEQUALITY_LESSONS.map((entry) => ({ entry, questions: compiled(readRepoFile(entry.file)).questions }));
const hintedQuestions = () => lessons.flatMap(({ questions }) => questions.filter((question) => HINTED.has(question.sectionId)));

/* ------------------------------------------------------------- the rules */

test('every Warm-Up, Classwork and Practice question asks before it tells: hint 1 is a question', () => {
  const questions = hintedQuestions();
  // L4 32 and 36 (Honors), L5 30 and 35 (Honors), the audited items included.
  assert.equal(questions.length, 32 + 36 + 30 + 35);
  const telling = questions.filter((question) => !/\?/.test(authoredHintTexts(question)[0] || ''))
    .map((question) => `${question.questionId}: ${authoredHintTexts(question)[0]}`);
  assert.deepEqual(telling, []);
});

test('no hint but the last states an answer, in any generated version', () => {
  const problems = new Set();
  let versions = 0;
  hintedQuestions().forEach((question) => versionsOf(question).forEach((version) => {
    versions += 1;
    const hints = authoredHintTexts(version);
    hints.slice(0, -1).forEach((hint, index) => {
      const stated = answersStated(hint, version);
      if (stated.length) problems.add(`${version.questionId} hint ${index + 1} ("${hint}") states ${stated.join('; ')}`);
    });
  }));
  assert.deepEqual([...problems], []);
  assert.ok(versions >= 1000, `${versions} versions read`);
});

test('no hint, the last included, hands over a boundary: two of its points the problem does not show', () => {
  const problems = new Set();
  hintedQuestions().forEach((question) => versionsOf(question).forEach((version) => {
    authoredHintTexts(version).forEach((hint, index) => {
      const handed = boundaryHandedOver(hint, version);
      if (handed.length) problems.add(`${version.questionId} hint ${index + 1} ("${hint}") gives ${handed.join('; ')}`);
    });
  }));
  assert.deepEqual([...problems], []);
});

/*
 * A boundary's line style is a build step, and a model's symbols are the
 * student's to choose. L5 CW 3's hint 2, "Both symbols include equality.",
 * gave both before the last hint (2026-11-06 walkthrough). Before the last
 * hint, a sentence of a build item that names a line style, or what a symbol
 * includes or leaves out, asks it.
 */
test('no hint but the last tells a build item\'s line style or what its symbols include: it asks', () => {
  const STYLE = /\b(solid|dashed|includes?|including|leaves? (?:its line|the line|the boundary|it) out)\b/i;
  const problems = new Set();
  let sentences = 0;
  hintedQuestions().filter((question) => question.type === 'systemsWorkspace').forEach((question) => {
    const [version] = versionsOf(question, 1);
    authoredHintTexts(version).slice(0, -1).forEach((hint, index) => {
      hint.split(/(?<=[.?!])\s+/).filter((sentence) => STYLE.test(sentence)).forEach((sentence) => {
        sentences += 1;
        if (!sentence.trim().endsWith('?')) problems.add(`${version.questionId} hint ${index + 1}: "${sentence}"`);
      });
    });
  });
  assert.deepEqual([...problems], []);
  assert.ok(sentences >= 20, `${sentences} sentences read`);
});

/*
 * Each item's hint count, in the order the file lists them (Warm-Up,
 * Classwork, Practice): the rewrite changed words, never a count
 * (hintsThatFit.test.mjs holds the 370 in all).
 */
const HINT_COUNTS = Object.freeze({
  'T2_L4_Graphing_Inequalities_in_Two_Variables.json': '2 3 2 | 3 3 3 3 3 3 2 3 3 3 3 3 3 3 3 3 3 | 3 3 2 2 2 2 3 2 3 3 2 3',
  'T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json': '2 3 2 | 3 3 3 3 3 3 2 3 3 3 3 3 3 3 3 3 3 | 3 2 2 2 3 2 3 3 2 3 3 3 3 2 1 1',
  'T2_L5_Systems_of_Linear_Inequalities.json': '3 2 3 | 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 | 3 3 3 3 2 3 3 3 3 3',
  'T2_L5_Systems_of_Linear_Inequalities_Honors.json': '3 2 3 | 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 | 3 3 3 3 3 3 3 3 3 3 3 3 3 1 1',
});

test('each item keeps its hint count', () => {
  lessons.forEach(({ entry, questions }) => {
    const counts = ['warmup', 'classwork', 'practice']
      .map((section) => questions.filter((question) => question.sectionId === section).map((question) => authoredHintTexts(question).length).join(' '))
      .join(' | ');
    assert.equal(counts, HINT_COUNTS[entry.file.split('/').pop()], entry.file);
  });
});

test('the leak guard shows every hint in every version: none names a student\'s own answer', () => {
  const hidden = new Set();
  hintedQuestions().forEach((question) => versionsOf(question).forEach((version) => {
    questionHintAudit(version).filter((hint) => hint.source === 'authored' && !hint.shown)
      .forEach((hint) => hidden.add(`${version.questionId}: "${hint.text}" (${hint.reason})`));
  }));
  assert.deepEqual([...hidden], []);
});

/*
 * backUpFindings (lessonFileChecks.mjs) compares a back-up option with the
 * keys as text, so two passed it: L4 Honors PR 14 offered "4 > 2k", which the
 * k box takes for k < 2, and PR 15 offered "−1", the slope box's own key
 * (with a minus sign that is not the key's hyphen). Read by each box's own
 * grader, no option is an answer.
 */
test('no "Let\'s back up" option is an answer a box takes, read by the box\'s own grader', () => {
  const problems = new Set();
  hintedQuestions().filter((question) => question.type === 'multiAnswer' && question.scaffold).forEach((question) => versionsOf(question).forEach((version) => {
    (version.scaffold.options || []).forEach((option) => (version.answerFields || []).filter((field) => field.type !== 'choice').forEach((field) => {
      let takes = false;
      try { takes = matchesFieldAnswer(String(option), field); } catch { takes = false; }
      if (takes) problems.add(`${version.questionId}: the back-up option "${option}" is an answer the ${field.id} box takes (${field.answer})`);
    }));
  }));
  assert.deepEqual([...problems], []);
});

/* ---------------------------------------------------- what counts as stating */

test('what counts as stating an answer: a typed box read by its own grader', () => {
  const version = (prompt, fields) => ({ type: 'multiAnswer', prompt, answerFields: fields.map(([id, label, answer, inputProfile]) => ({ id, label, answer, inputProfile })) });
  // L4 Honors PR 14: the box takes "3 > 2k − 1", k < 2 unsolved.
  const parameter = version('For which values of k is the point (2, 3) a solution of y > kx − 1?', [['k', 'Values of k', 'k < 2', 'inequality']]);
  assert.deepEqual(answersStated('Solve 3 > 2k − 1 for k.', parameter), ['k (k < 2)']);
  assert.deepEqual(answersStated('What do you get when you put x = 2 and y = 3 into y > kx − 1?', parameter), [], 'the prompt\'s own inequality, quoted');
  // L4 CW 13: a graph's boundary written as an equation; L4 CW 7 names its boundary in the prompt.
  const graphs = version('Write a linear inequality for graphs a, b and c.', [['a', 'Graph a', 'y < 4x + 2', 'inequality']]);
  assert.deepEqual(answersStated('Graph a is the line y = 4x + 2, dashed.', graphs), ['a (y < 4x + 2): its boundary']);
  assert.deepEqual(answersStated('Is the line dashed or solid? Which side is shaded?', graphs), []);
  const shared = version('Graphs a, b and c share one boundary line, y = (1/2)x − 3.', [['a', 'Graph a', 'y > 1/2x - 3', 'inequality']]);
  assert.deepEqual(answersStated('All three use y = (1/2)x − 3: read the symbol.', shared), []);
  assert.deepEqual(answersStated('Graph a is y > (1/2)x − 3.', shared), ['a (y > 1/2x - 3)']);
  // L4 CW 5: a model's left side, in a standard-form key.
  const points = version('Write each statement as an inequality.', [['atLeast', 'She scores at least 20 points.', '2x + 3y >= 20', 'inequality']]);
  assert.deepEqual(answersStated('Points come from 2x + 3y.', points), ['atLeast (2x + 3y >= 20): its left side']);
  // A number box is read as the leak guard reads it (L4 CW 4: 20 is a box's
  // answer). Only an expression with a variable quotes a number, so the 20 of
  // "2x + 3y ≥ 20", beside the symbol, is stated even though the prompt has it.
  const totals = version('Compare the solutions of 2x + 3y = 20 with those of 2x + 3y ≥ 20.', [['onLine', 'Kai’s points for (1, 6)', '20', 'number']]);
  assert.deepEqual(answersStated('Compare the total with 20.', totals), ['onLine (20)']);
  assert.deepEqual(answersStated('Is 2x + 3y ≥ 20 true there?', totals), ['onLine (20)']);
  assert.deepEqual(answersStated('Substitute (1, 6) into 2x + 3y: is it Kai’s goal?', totals), [], 'a point and an expression quoted from the problem');
});

test('what counts as stating an answer: a build\'s steps, and a boundary handed over', () => {
  // L4 CW 2, Kai's goal: the student writes the model, then builds it.
  const kai = {
    type: 'systemsWorkspace',
    prompt: 'Kai scores AT LEAST 20 points per game. Write the inequality in the tool, then graph it. Then test the point (6, 4).',
    modeling: { expectedConstraints: [{ A: 2, B: 3, C: -20, relation: '>=' }] },
    testPoint: { x: 6, y: 4 },
  };
  const old = 'Points that make exactly 20 points are on the boundary line, such as (10, 0) and (4, 4).';
  assert.deepEqual(answersStated(old, kai), ['a point of boundary 1 (10, 0)', 'a point of boundary 1 (4, 4)']);
  assert.deepEqual(boundaryHandedOver(old, kai), ['boundary 1: (10, 0) and (4, 4)']);
  assert.deepEqual(answersStated('Exactly 20 points means 2x + 3y = 20.', kai), ['the model\'s constraint 1: its boundary (2x+3y=20)']);
  assert.deepEqual(answersStated('Is 2x + 3y ≥ 20 the goal?', kai), ['the model\'s constraint 1 (2x+3y>=20)']);
  assert.deepEqual(answersStated('Points come from 2x + 3y.', kai), ['the model\'s constraint 1: its left side']);
  assert.deepEqual(answersStated('Does (6, 4) meet the goal? Is the boundary solid?', kai), [], 'the marked point is on screen, and off the line');
  assert.deepEqual(boundaryHandedOver('Plot (10, 0), then find a second point.', kai), [], 'one point is part of a step, not all of it');

  // L5 CW 5: the student rewrites each inequality with y alone.
  const rewrite = {
    type: 'systemsWorkspace',
    prompt: 'Graph the system $x + y > 1$ and $-x + y \\le 3$. Rewrite each inequality with y alone in the tool. Then test the point (−8, 2).',
    sourceConstraints: ['x + y > 1', '-x + y <= 3'],
    expectedConstraints: [{ A: 1, B: 1, C: -1, relation: '>' }, { A: -1, B: 1, C: -3, relation: '<=' }],
    studentBuild: { rewrite: true },
    testPoint: { x: -8, y: 2 },
  };
  assert.deepEqual(answersStated('x + y > 1 becomes y > −x + 1; −x + y ≤ 3 becomes y ≤ x + 3.', rewrite), ['constraint 1 rewritten (y>-x+1)', 'constraint 2 rewritten (y<=x+3)']);
  assert.deepEqual(answersStated('What do you subtract from both sides of x + y > 1 to get y alone?', rewrite), []);
  assert.deepEqual(answersStated('The corner (−1, 2) is on the dashed line.', rewrite), ['a point of boundary 1 (-1, 2)', 'a point of boundary 2 (-1, 2)']);

  // A plain build: its boundary is the prompt's own line, and only its points are answers.
  const plain = {
    type: 'systemsWorkspace',
    prompt: 'Consider $y > 4x - 6$. Build the boundary line, and shade. Then test the point (0, 0).',
    sourceConstraints: ['y > 4x - 6'],
    expectedConstraints: [{ m: 4, b: -6, relation: '>' }],
    testPoint: { x: 0, y: 0 },
  };
  assert.deepEqual(answersStated('What are the slope and y-intercept of y = 4x − 6?', plain), []);
  assert.deepEqual(answersStated('Plot (0, −6), then go up 4 and right 1.', plain), ['a point of boundary 1 (0, -6)']);
  // L5 PR 8's last hint: the earnings line (16, 0) and (0, 24), Kim's second constraint.
  const kim = { type: 'systemsWorkspace', prompt: 'Kim can work at most 20 hours and wants to earn at least $240.', modeling: { expectedConstraints: [{ A: 1, B: 1, C: -20, relation: '<=' }, { A: 15, B: 10, C: -240, relation: '>=' }] } };
  assert.deepEqual(boundaryHandedOver('The earnings boundary passes through (16, 0) and (0, 24).', kim), ['boundary 2: (16, 0) and (0, 24)']);
  assert.deepEqual(boundaryHandedOver('For each boundary, set x = 0 and solve for y, then set y = 0 and solve for x.', kim), []);
});

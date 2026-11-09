/*
 * "1√k" IS WRITTEN "√k" IN AN ANSWER SUMMARY (math-box-focus batch, item 3).
 *
 * Radicals L2 exit ticket 2's summary is authored "{{t}}√{{k}}", and t is
 * whatever the three terms add up to: one draw in a dozen made it 1 or -1,
 * and the closed review read "1√2" or "-1√2". The platform's summary
 * formatter (buildPrivateSupport in functions/shared/pathSolutionSupport.mjs,
 * which every closed review, Path session, Correction and Live Challenge
 * round reads its summary through) now drops a coefficient of 1 before a root.
 *
 * The sweep below runs every lesson in teacher-import-jsons and every Path
 * bank in functions/seeds through it: what changes is four items' summaries,
 * by that 1 alone, and no other summary and no other part of a review changes
 * at all (a common error that says "√3 is 1√3" on purpose keeps it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPrivateSupport, withoutUnitRootCoefficient } from '../../functions/shared/pathSolutionSupport.mjs';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';

const repo = new URL('../../', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, repo), 'utf8');

test('a 1 that stands alone before a root goes; every other 1 stays', () => {
  const dropped = [
    ['1√2', '√2'], ['-1√2', '-√2'], ['−1√3', '−√3'], ['7 + 1√5', '7 + √5'], ['u - 1√6', 'u - √6'],
    ['(ab − 1√m)/d', '(ab − √m)/d'], ['1√m/m', '√m/m'], ['3x; 1√7', '3x; √7'], ['1∛4', '∛4'],
    ['$1\\sqrt{2}$', '$\\sqrt{2}$'], ['$y=1\\sqrt{x-(1)}+(2)$; prediction 1.', '$y=\\sqrt{x-(1)}+(2)$; prediction 1.'],
    ['\\frac{1\\sqrt{2}}{2}', '\\frac{\\sqrt{2}}{2}'], ['1\\sqrt[3]{5}', '\\sqrt[3]{5}'], ['1√2 + 1√3', '√2 + √3'],
  ];
  for (const [before, after] of dropped) assert.equal(withoutUnitRootCoefficient(before), after, before);
  const kept = [
    '11√2', '21√3', '-11√2', '0.1√2', '1.1√2', '2/1√3', 'x1√2', 'a^1√2', 'b_1√2', '1 √2', '1/√2', '√1', '1',
    '12', 'x + 1', '$\\sqrt{1}$', '1\\sqrtx', 'prediction 1.', '√3 is √3',
  ];
  for (const text of kept) assert.equal(withoutUnitRootCoefficient(text), text, text);
  assert.equal(withoutUnitRootCoefficient(null), '');
});

test('the summary formatter writes the summary that way, and nothing else in the review', () => {
  const support = buildPrivateSupport({
    solutionReview: {
      headline: 'Combine 1√7 and nothing else',
      reasoning: ['12 − 15 + 4 = 1, so the sum is 1√7.'],
      answerSummary: '1√7',
      commonError: 'Forgetting the last term: √3 is 1√3 and counts in the sum.',
      connection: 'A coefficient of 1√x is unwritten.',
    },
  });
  assert.equal(support.solutionReview.answerSummary, '√7');
  assert.equal(support.solutionReview.headline, 'Combine 1√7 and nothing else');
  assert.deepEqual(support.solutionReview.reasoning, ['12 − 15 + 4 = 1, so the sum is 1√7.']);
  assert.equal(support.solutionReview.commonError, 'Forgetting the last term: √3 is 1√3 and counts in the sum.');
  assert.equal(support.solutionReview.connection, 'A coefficient of 1√x is unwritten.');
});

const lessonQuestion = (file, id) => {
  const question = compileTeacherImport(read(`teacher-import-jsons/${file}`)).questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${id} compiles`);
  return question;
};
// The first of a fixed list of seeds whose draw gives this summary shape.
const drawWhere = (template, accept) => {
  for (let seed = 0; seed < 400; seed += 1) {
    const { question } = generatePathInstanceWithRetries(template, `unit-root-${seed}`);
    if (question && accept(question)) return question;
  }
  return assert.fail('no draw of the fixed seeds has that shape');
};

test('Radicals L2 exit ticket 2: the closed review reads "√k" and "-√k", and its key is untouched', () => {
  const template = lessonQuestion('algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json', 'a2r2-dol-2');
  for (const [sign, shown] of [['', '√'], ['-', '-√']]) {
    const question = drawWhere(template, (drawn) => new RegExp(`^${sign}1√\\d$`).test(drawn.solutionReview.answerSummary));
    const radicand = question.solutionReview.answerSummary.slice(-1);
    const review = buildClosedQuestionReview({ question, wasCorrect: false });
    assert.equal(review.authored.answerSummary, `${shown}${radicand}`, `the summary of ${question.solutionReview.answerSummary}`);
    assert.doesNotMatch(review.speechText, /(?<![\d.])1√/, 'Read aloud reads it the same way');
    // The stored question keeps its words, and the key (authored {{t|coef}}) is as it was.
    assert.equal(question.solutionReview.answerSummary, `${sign}1√${radicand}`);
    assert.equal(question.answerFields.find((field) => field.id === 'sum').answer, `${shown}${radicand}`);
  }
});

/*
 * THE SWEEP. Every summary of every lesson and Path bank question: the
 * authored words (the template, before any draw) and the drawn summaries.
 * A summary can only change where a drawn value stands right before a root,
 * so those questions are drawn many times; every other is drawn a few times.
 * A lesson's questions are read as authored: the import copies a question's
 * review and generator as they are (authoringIntentV5Core.js), and compiling
 * all 42 lessons takes the best part of a minute.
 */
const lessonFiles = (dir = new URL('teacher-import-jsons/', repo).pathname) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? lessonFiles(path.join(dir, entry.name)) : entry.name.endsWith('.json') ? [path.join(dir, entry.name)] : []));
const everyQuestion = () => {
  const rows = [];
  for (const file of lessonFiles()) {
    const where = path.relative(new URL('teacher-import-jsons/', repo).pathname, file);
    JSON.parse(fs.readFileSync(file, 'utf8')).sections.flatMap((section) => section.questions || [])
      .forEach((question) => rows.push({ where, id: question.questionId, question }));
  }
  const banks = new URL('functions/seeds/pathQuestionBank/', repo).pathname;
  for (const bank of fs.readdirSync(banks).filter((name) => name.endsWith('_seed.json')).sort()) {
    JSON.parse(fs.readFileSync(path.join(banks, bank), 'utf8')).documents.forEach((question) => rows.push({ where: bank, id: question.id, question }));
  }
  return rows;
};
const summariesOf = (question) => [
  question?.solutionReview?.answerSummary,
  ...Object.values(question?.translations || {}).map((translation) => translation?.solutionReview?.answerSummary),
  ...(Array.isArray(question?.variants) ? question.variants.flatMap((variant) => (variant && variant !== question ? summariesOf(variant) : [])) : []),
].filter((summary) => typeof summary === 'string');
const ROOT = '(?:√|∛|∜|\\\\sqrt)';
const VALUE_BEFORE_ROOT = new RegExp(`\\}\\}\\s*${ROOT}`);
const clamp = (value, max) => String(value ?? '').trim().slice(0, max);

test('every lesson and Path bank summary: four items change, by the 1 before the root alone, and nothing else does', () => {
  const rows = everyQuestion();
  assert.ok(rows.length > 4000, `the sweep reads every lesson and bank (${rows.length} questions)`);
  const changed = new Map();
  let drawnSummaries = 0;
  for (const { where, id, question } of rows) {
    // The authored words never change: no summary is written with a 1 before a root.
    for (const template of summariesOf(question)) assert.equal(withoutUnitRootCoefficient(template), template, `${where} ${id}: its authored summary`);
    const candidate = summariesOf(question).some((summary) => VALUE_BEFORE_ROOT.test(summary));
    const draws = !hasPathGenerator(question) ? [question]
      : Array.from({ length: candidate ? 200 : 3 }, (_, seed) => generatePathInstanceWithRetries(question, `unit-root-sweep-${seed}`).question).filter(Boolean);
    for (const drawn of draws) {
      const review = buildPrivateSupport(drawn).solutionReview;
      const authored = drawn.solutionReview && typeof drawn.solutionReview === 'object' ? drawn.solutionReview : null;
      if (!authored) continue;
      // Nothing but the summary is touched.
      assert.equal(review.headline, clamp(authored.headline, 160), `${where} ${id}: headline`);
      assert.deepEqual(review.reasoning, (Array.isArray(authored.reasoning) ? authored.reasoning : []).map((line) => clamp(line, 400)).filter(Boolean).slice(0, 8), `${where} ${id}: reasoning`);
      assert.equal(review.commonError, clamp(authored.commonError, 400) || null, `${where} ${id}: common error`);
      assert.equal(review.connection, clamp(authored.connection, 400) || null, `${where} ${id}: connection`);
      const before = clamp(authored.answerSummary, 240);
      if (!before) continue;
      drawnSummaries += 1;
      const after = review.answerSummary;
      if (after === before) continue;
      // The change is the standalone 1 before a root, and no other character.
      assert.equal(after, before.replace(/(^|[\s=+\-−$])1(?=√|∛|\\sqrt)/gu, '$1'), `${where} ${id}: ${before}`);
      assert.doesNotMatch(after, /(^|[\s=+\-−$])1(?=√|∛|\\sqrt)/u, `${where} ${id}: ${after}`);
      if (!changed.has(`${where} ${id}`)) changed.set(`${where} ${id}`, []);
      changed.get(`${where} ${id}`).push(`${before} → ${after}`);
    }
  }
  assert.ok(drawnSummaries > 10000, `${drawnSummaries} drawn summaries were read`);
  assert.deepEqual([...changed.keys()].sort(), [
    // Radicals L2 Practice 3 and exit ticket 2: "{{t}}√{{k}}" with t = ±1.
    'algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json a2r2-dol-2',
    'algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json a2r2-p-3',
    // Path: like radicals whose coefficients differ by one, and a regression whose a is 1.
    'algebra1_pathQuestionBank_seed.json mm_A_11A_v2_difference-like-radicals',
    'algebra2_pathQuestionBank_seed.json mm_A2_4E_v2_square-root-regression-extrapolation',
  ].sort(), `what changes:\n${[...changed].map(([key, pairs]) => `${key}: ${[...new Set(pairs)].slice(0, 3).join(' | ')}`).join('\n')}`);
});

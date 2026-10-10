/*
 * THE RECAP IS NO LASTING ANSWER KEY (student push D; coordinator review of
 * #459, minor 3).
 *
 * A recap entry shows the correct answer and the worked solution, and it
 * stays. A bank template that draws only a handful of distinct questions
 * brings the same question back — a retention re-check included — so its
 * stored answer would be the key. Those templates' entries keep the question
 * and the student's own answer and leave the correct answer and the solution
 * out, on the server, in the read, in the Simulator and on screen.
 *
 * The list is regenerated here from the seed bank with the same draws and the
 * same content key, so a generator that is widened (or narrowed) changes this
 * test instead of drifting.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import {
  RECAP_INSTANCE_DRAWS,
  RECAP_MIN_DISTINCT_INSTANCES,
  RECAP_WITHHELD_TEMPLATE_IDS,
} from '../../functions/shared/pathRecapWithheld.mjs';
import {
  buildPathRecapEntry,
  buildPathSessionRecap,
  parsePathRecapEntry,
  serializePathRecapEntry,
} from '../../functions/shared/pathSessionRecap.mjs';
import { generatePathInstance, hasPathGenerator, hasPathVariants } from '../../functions/shared/pathQuestionGeneration.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const recapLib = require('../../functions/lib/pathSessionRecap.js');
const mathPath = require('../../functions/lib/mathPath.js');

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const BANK = new URL('../../seed/pathQuestionBank/', import.meta.url);

// What a student sees of a question: the words, the graph or table, the
// options and the field labels. Two draws that differ only in hidden ids are
// the same question.
const contentKey = (question) => JSON.stringify({
  p: question.prompt,
  s: question.stimulus,
  sc: question.scenario,
  c: (Array.isArray(question.choices) ? question.choices : [])
    .map((choice) => (choice && typeof choice === 'object') ? (choice.text ?? choice.label ?? choice.latex ?? choice.value ?? '') : choice),
  f: (Array.isArray(question.responseFields) ? question.responseFields : [])
    .map((field) => (field && typeof field === 'object') ? (field.label ?? field.prompt ?? '') : field),
});

const distinctQuestions = (template) => {
  if (!hasPathGenerator(template) && !hasPathVariants(template)) return 1;
  const seen = new Set();
  for (let draw = 0; draw < RECAP_INSTANCE_DRAWS; draw += 1) {
    const generated = generatePathInstance(template, `recap-probe-${draw}`);
    if (generated?.question) seen.add(contentKey(generated.question));
  }
  return seen.size;
};

test('the withheld list is exactly the seed bank templates that draw fewer than 8 distinct questions in 30', () => {
  const repeating = [];
  let templates = 0;
  for (const file of readdirSync(BANK).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort()) {
    for (const template of JSON.parse(readFileSync(new URL(file, BANK), 'utf8')).documents) {
      templates += 1;
      if (distinctQuestions(template) < RECAP_MIN_DISTINCT_INSTANCES) repeating.push(template.id);
    }
  }
  assert.ok(templates > 3000, `the whole seed bank was read (${templates} templates)`);
  assert.deepEqual([...RECAP_WITHHELD_TEMPLATE_IDS], repeating.sort());
});

// Withheld for good: its verdict is "not a function" on every draw (student push J).
const REPEATING = 'mm_A_12A_v2_mapping-nonfunction';

const missed = (templateId, overrides = {}) => buildPathRecapEntry({
  sessionId: 'session-1',
  questionInstanceId: 'qi-1',
  questionNumber: 1,
  skillCode: 'A.9B',
  closedAt: 1000,
  publicQuestion: {
    prompt: 'A town grows by a factor of $1.04$ each year. By what percent does it grow?',
    responseFields: [{ id: 'answer', label: 'Percent', inputProfile: 'number' }],
  },
  privateGrading: { fields: [{ id: 'answer', expected: '4' }] },
  responsePayload: { responses: { answer: '1.04' } },
  grading: { isCorrect: false, score: 0, attemptNumber: 1, attemptsAllowed: 1 },
  solutionReview: { headline: 'The rate is the factor minus one.', reasoning: ['1.04 - 1 = 0.04, which is 4%.'], answerSummary: 'It grows by 4% a year.' },
  templateId,
  ...overrides,
});

test('a template that repeats its questions leaves the answer and the steps out of the recap entry', () => {
  const entry = missed(REPEATING);
  assert.equal(entry.answerWithheld, true);
  assert.deepEqual(entry.correctAnswer, []);
  assert.equal(entry.solutionReview, null);
  // The question and the student's own answer stay.
  assert.match(entry.question.prompt, /By what percent/);
  assert.deepEqual(entry.response.entries.map((answer) => answer.value), ['1.04']);
  assert.doesNotMatch(serializePathRecapEntry(entry), /minus one|4% a year|"expected"/);

  // Every other template, and an item with no template, keeps its review.
  for (const templateId of ['mm_A_9B_v2_growth-factor-table', null]) {
    const kept = missed(templateId);
    assert.equal(kept.answerWithheld, false, String(templateId));
    assert.deepEqual(kept.correctAnswer.map((answer) => answer.value), ['4'], String(templateId));
    assert.equal(kept.solutionReview.answerSummary, 'It grows by 4% a year.', String(templateId));
  }
});

test('the recap read carries the flag and never a withheld entry\'s key, whatever was stored', () => {
  // An entry stored as withheld that still carries a key (a hand edit, or a
  // future writer's slip) is blanked again when it is read.
  const stored = { ...missed(REPEATING), correctAnswer: [{ label: 'Percent', value: '4', format: 'math' }], solutionReview: { headline: 'The rate is the factor minus one.' } };
  const other = missed(null, { questionInstanceId: 'qi-2', questionNumber: 2 });
  const recap = buildPathSessionRecap({
    session: { sessionId: 'session-1', studentId: 'student-1', status: 'completed', summary: { completedQuestions: 2 } },
    entries: [stored, other],
  });
  assert.equal(recap.items.length, 2);
  assert.equal(recap.items[0].answerWithheld, true);
  assert.deepEqual(recap.items[0].correctAnswer, []);
  assert.equal(recap.items[0].solutionReview, null);
  assert.deepEqual(recap.items[0].response.entries.map((answer) => answer.value), ['1.04']);
  assert.equal(recap.items[1].answerWithheld, false);
  assert.deepEqual(recap.items[1].correctAnswer.map((answer) => answer.value), ['4']);
});

test('the server withholds by the stored item\'s bank template', async () => {
  const authored = {
    id: REPEATING,
    prompt: 'A town grows by a factor of $1.04$ each year. By what percent does it grow?',
    responseFields: [{ id: 'answer', label: 'Percent', inputProfile: 'number', expected: '4' }],
    solutionReview: { headline: 'The rate is the factor minus one.', reasoning: ['1.04 - 1 = 0.04.'], answerSummary: 'It grows by 4% a year.' },
  };
  const plan = await mathPath.buildIssuePlan(authored);
  const support = await mathPath.buildPrivateSupport(authored);
  const rules = await recapLib.pathSessionRecapRules();
  const recorded = (bankQuestionId) => parsePathRecapEntry(recapLib.closedQuestionRecapJson(rules, {
    sessionId: 'session-1',
    currentQuestion: {
      ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId: 'qi-1', attemptsAllowed: 1, toolPayload: plan.toolPayload }),
      bankQuestionId,
      privateGrading: plan.privateGrading,
      privateSupport: support,
      attemptsAllowed: 1,
      attemptsUsed: 0,
    },
    responsePayload: { responses: { answer: '1.04' } },
    grading: { isCorrect: false, score: 0, attemptNumber: 1, attemptsRemaining: 0, questionFinalized: true },
    solutionReview: support.solutionReview,
    questionNumber: 1,
    skillCode: 'A.9B',
    closedAt: 5000,
  }));

  const withheld = recorded(REPEATING);
  assert.equal(withheld.answerWithheld, true);
  assert.deepEqual(withheld.correctAnswer, []);
  assert.equal(withheld.solutionReview, null);
  assert.deepEqual(withheld.response.entries.map((answer) => answer.value), ['1.04']);

  const kept = recorded('mm_A_9B_v2_growth-factor-table');
  assert.equal(kept.answerWithheld, false);
  assert.deepEqual(kept.correctAnswer.map((answer) => answer.value), ['4']);
  assert.equal(kept.solutionReview.answerSummary, 'It grows by 4% a year.');
});

test('the Simulator records its recap with the same template rule', () => {
  const runtime = executableSource(read('src/platform/simulation/teacherPathRuntime.js'));
  const instance = region(runtime, 'const instance = {', '};', 'issued instance');
  assert.match(instance, /templateId: chosen\.question\?\.id \|\| null,/);
  const recorded = region(runtime, 'session.closedItems.push(buildPathRecapEntry({', '}));', 'simulator recap entry');
  assert.match(recorded, /templateId: instance\.templateId \|\| null,/);
});

test('on screen, a withheld question shows no key and no steps, and says why', () => {
  const recap = executableSource(read('src/components/student/MyMathPathSessionRecap.jsx'));
  const item = region(recap, 'function RecapItem(', '\n}\n', 'recap item');
  assert.match(item, /const withheld = item\.answerWithheld === true;/);
  assert.match(item, /const review = withheld \? null : \(item\.solutionReview \|\| null\);/);
  assert.match(item, /const correct = withheld \|\| review\?\.answerSummary \? \[\] : \(item\.correctAnswer \|\| \[\]\);/);
  const note = region(item, '{withheld', '</p>', 'withheld note');
  assert.match(note, /This question comes back in practice, so its answer and steps stay out of your review\./);
});

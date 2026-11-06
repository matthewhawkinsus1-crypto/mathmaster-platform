/*
 * A NUMBER BOX'S EXAMPLE IS NEVER ITS ANSWER (the 2026-11-06 re-walk of the
 * changed lessons, docs/qa/2026-11-06-rewalk-changed-lessons/findings.md).
 *
 * Every number box said "For example -4.", an example chosen without reading
 * the key, and some versions are keyed -4: Algebra I M3 T2 L4 Warm-Up 3 and
 * PR 5, L4 Honors Warm-Up 3 and PR 17, and the Algebra II Honors radicals'
 * L1 Warm-Up 1 and PR 7 and L2 Warm-Up 3. The box showed its own answer, and
 * a student cannot know that was chance. Now (answerFormatHints.js
 * numberExampleFor):
 *
 *   - the example comes from a set, and a member the box's own grader would
 *     mark right is passed over: graded here over every version of those
 *     items, and over every version a class receives of every lesson;
 *   - where a box starts in the set is read from what its student reads, and
 *     the key moves the example only off the answer, so the example says
 *     nothing more about the answer than that it is not the example;
 *   - the screen asks its own grader (rendered here, for each version where
 *     the first member it reaches is the answer).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  NUMBER_EXAMPLES,
  answerFormatOf,
  describeBoxPlaceholder,
  exampleFor,
  numberExampleFor,
} from '../../src/platform/interaction/answerFormatHints.js';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';
import { answerCandidatesForField } from '../../functions/shared/answerUtils.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { resolveQuestionFamilyDefinition } from '../../functions/shared/questionFamilyInstance.mjs';
import { compiled, versionsOf } from './helpers/lessonFileChecks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lessonQuestions = new Map();
const questionsIn = (file) => {
  if (!lessonQuestions.has(file)) lessonQuestions.set(file, compiled(readFileSync(path.join(ROOT, file), 'utf8')).questions);
  return lessonQuestions.get(file);
};
const typedField = (field) => Boolean(field?.id) && !(field.options || field.choices || field.type === 'choice' || field.inputProfile === 'choice');
const numberBoxes = (version) => (version.answerFields || []).filter((field) => typedField(field) && answerFormatOf(field) === 'number');
/**
 * The box's own grader, as MultiAnswerGrader asks it: would it mark this text
 * right? One per box, remembering its verdicts: a verdict the example's choice
 * never asked for is graded here for the first time.
 */
const graders = new WeakMap();
const graderOf = (version, field) => {
  if (!graders.has(field)) {
    const verdicts = new Map();
    graders.set(field, (typed) => {
      if (!verdicts.has(typed)) {
        verdicts.set(typed, gradeMultiAnswerResponse(version, { [field.id]: typed }).parts.find((part) => part.id === field.id)?.isCorrect === true);
      }
      return verdicts.get(typed);
    });
  }
  return graders.get(field);
};
/** What the box shows a student. */
const shownExample = (version, field) => describeBoxPlaceholder(field, { prompt: version.prompt, isAnswer: graderOf(version, field) }).example;

test('a number box\'s example: the set\'s member where what it reads points, passing over any its grader would mark right', () => {
  assert.ok(NUMBER_EXAMPLES.length >= 6 && new Set(NUMBER_EXAMPLES).size === NUMBER_EXAMPLES.length);
  // Each is a single number a box can show whole (answerPlaceholderFits.test.mjs: ten characters at most).
  NUMBER_EXAMPLES.forEach((example) => assert.match(example, /^-\d$/));
  // With nothing to read, the format's own example.
  assert.equal(numberExampleFor({}), exampleFor('number'));
  assert.equal(describeBoxPlaceholder({ answerFormat: 'number' }).example, '-4');
  const field = { id: 'r1', label: 'At x = 2: 3x - 4 =', inputProfile: 'number' };
  const prompt = 'Test points. For y ≥ 3x - 4, find the value of the right side.';
  const first = numberExampleFor(field, { prompt });
  assert.ok(NUMBER_EXAMPLES.includes(first));
  // The key moves it only off the answer, to the next member.
  const next = NUMBER_EXAMPLES[(NUMBER_EXAMPLES.indexOf(first) + 1) % NUMBER_EXAMPLES.length];
  assert.equal(numberExampleFor(field, { prompt, isAnswer: (typed) => typed === first }), next);
  assert.equal(numberExampleFor(field, { prompt, isAnswer: (typed) => typed === next }), first);
  assert.equal(numberExampleFor(field, { prompt, isAnswer: () => false }), first);
  // A box that takes every member shows none, and says so with the generic words.
  assert.equal(numberExampleFor(field, { prompt, isAnswer: () => true }), '');
  assert.deepEqual(describeBoxPlaceholder({ ...field, answerFormat: 'number' }, { prompt, isAnswer: () => true }), { placeholder: 'Type your answer', example: '' });
  // A grader that cannot read a member does not hide it.
  assert.equal(numberExampleFor(field, { prompt, isAnswer: () => { throw new Error('unreadable'); } }), first);
  // An author's own placeholder still wins, word for word.
  assert.deepEqual(describeBoxPlaceholder({ ...field, placeholder: 'seconds' }, { prompt, isAnswer: () => true }), { placeholder: 'seconds', example: '' });
  // Other formats keep their one example.
  assert.equal(describeBoxPlaceholder({ answerFormat: 'orderedPair' }, { prompt, isAnswer: () => true }).example, '(2, -5)');
});

// The items the re-walk found, by file and question id.
const FOUND = Object.freeze([
  ['teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables.json', ['m3t2l4-wu-3', 'm3t2l4-p-5']],
  ['teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json', ['m3t2l4h-wu-3', 'm3t2l4h-p-17']],
  ['teacher-import-jsons/algebra2-honors-radicals/L1_nth_Roots.json', ['a2r1-wu-1', 'a2r1-p-7']],
  ['teacher-import-jsons/algebra2-honors-radicals/L2_Operations_with_Radical_Expressions.json', ['a2r2-wu-3']],
]);
const MEMBERS = new Set(NUMBER_EXAMPLES.map(Number));

/*
 * EVERY VERSION of those items: 12,096 to 27,125 of the L4 ones. Each version's
 * keys come from its family instance; the whole question is built and graded
 * wherever a number box's key is one of the examples, which is the only place
 * an example can be right, because each of these boxes takes exactly its key
 * (no tolerance, no other accepted answer: checked below). Worked out once,
 * for this test and the screen's.
 */
let everyVersion = null;
const everyVersionOfTheFoundItems = () => {
  if (everyVersion) return everyVersion;
  everyVersion = FOUND.flatMap(([file, ids]) => ids.map((questionId) => {
    const question = questionsIn(file).find((candidate) => candidate.questionId === questionId);
    assert.ok(question?.questionFamily, `${file} ${questionId}: a generated item`);
    const definition = resolveQuestionFamilyDefinition(question, { slotKey: questionId });
    assert.ok(!definition.error, `${questionId}: ${JSON.stringify(definition.error)}`);
    const { family, constraintValues, tool } = definition;
    const sequence = cachedFamilyInstanceSequence(family, constraintValues, `number-box-example|${questionId}`);
    const build = (instance) => buildFamilyQuestion({ family, instance, constraintValues, authored: question, tool });
    const [first] = versionsOf(question, 1);
    const ids = numberBoxes(first).map((field) => field.id);
    assert.ok(ids.length > 0, `${questionId}: its number boxes`);
    numberBoxes(first).forEach((field) => {
      assert.ok(!(Number(field.numericTolerance) > 0), `${questionId} ${field.id}: a tolerance`);
      assert.deepEqual(answerCandidatesForField(field).length, 1, `${questionId} ${field.id}: another accepted answer`);
    });
    const rows = [];
    let versions = 0;
    for (let index = 0; ; index += 1) {
      const instance = sequence.instanceAt(index);
      if (!instance) break;
      versions += 1;
      // A key no example equals cannot make an example right: only the others are graded.
      const keyed = instance.answer?.kind === 'fields'
        ? ids.filter((id) => { const key = Number(instance.answer.value?.[id]); return !Number.isFinite(key) || MEMBERS.has(key); })
        : ids;
      if (!keyed.length) continue;
      const version = build(instance);
      numberBoxes(version).filter((field) => keyed.includes(field.id)).forEach((field) => {
        const unread = numberExampleFor(field, { prompt: version.prompt });
        rows.push({ version, field, shown: shownExample(version, field), unread });
      });
    }
    return { questionId, versions, rows };
  }));
  return everyVersion;
};

test('the items the re-walk found: in every version, no number box shows an example it would mark right', () => {
  for (const { questionId, versions, rows } of everyVersionOfTheFoundItems()) {
    assert.ok(versions >= 60, `${questionId}: ${versions} versions`);
    let wasTheAnswer = 0;
    for (const { version, field, shown, unread } of rows) {
      const right = graderOf(version, field);
      if (!wasTheAnswer && right('-4')) wasTheAnswer += 1;
      assert.ok(NUMBER_EXAMPLES.includes(shown), `${questionId} ${field.id}: "${shown}"`);
      assert.equal(right(shown), false, `${questionId} ${field.id}: the box shows "${shown}", and its answer is ${field.answer}`);
      // The key moves the example only off the answer.
      if (shown !== unread) assert.equal(right(unread), true, `${questionId} ${field.id}: the key moved "${unread}", which is not the answer`);
    }
    // The fixed "-4" was the answer here, so this can fail.
    assert.ok(wasTheAnswer > 0, `${questionId}: "-4" was the answer in no version`);
  }
});

/*
 * EVERY LESSON: every number box in every version a class of 32 receives,
 * graded as MultiAnswerGrader grades a student who typed the example it shows.
 * The examples are spread over the set, so none is "the usual one" whose
 * absence would point at an answer.
 */
const LESSONS = path.join(ROOT, 'teacher-import-jsons');
const filesUnder = (directory) => readdirSync(directory).flatMap((name) => {
  const file = path.join(directory, name);
  if (statSync(file).isDirectory()) return filesUnder(file);
  return name.endsWith('.json') ? [path.relative(ROOT, file)] : [];
});

test('no number box in any version of any lesson shows an example it would mark right, and the examples are spread over the set', () => {
  const lessons = filesUnder(LESSONS);
  assert.ok(lessons.length >= 40, `${lessons.length} lesson files`);
  const shownCount = new Map();
  let boxes = 0;
  let passedOver = 0;
  const problems = [];
  for (const file of lessons) {
    for (const question of questionsIn(file).filter((candidate) => candidate.type === 'multiAnswer')) {
      for (const version of versionsOf(question)) {
        for (const field of numberBoxes(version)) {
          boxes += 1;
          const shown = shownExample(version, field);
          if (shown && graderOf(version, field)(shown)) problems.push(`${file} ${version.questionId} ${field.id}: "${shown}"`);
          if (shown !== numberExampleFor(field, { prompt: version.prompt })) passedOver += 1;
          shownCount.set(shown, (shownCount.get(shown) || 0) + 1);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(boxes > 2000, `${boxes} number boxes`);
  assert.ok(passedOver > 0, 'some box passes a member over, so this can fail');
  // Every member is shown, and none to more than a third of the boxes.
  assert.deepEqual([...NUMBER_EXAMPLES].filter((example) => !shownCount.has(example)), []);
  const most = Math.max(...shownCount.values());
  assert.ok(most <= boxes / 3, `one example is shown in ${most} of ${boxes} boxes`);
});

/*
 * THE SCREEN ASKS ITS OWN GRADER. MultiAnswerGrader, rendered as a student
 * receives it, for boxes of the items above whose first member reached is
 * their answer (up to six an item): the example it states is one the box
 * refuses. Each is drawn alone, so the one example stated is its own.
 */
test('MultiAnswerGrader states an example its box refuses, where the first one it reaches is the answer', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
    let rendered = 0;
    for (const { questionId, rows } of everyVersionOfTheFoundItems()) {
      for (const { version, field } of rows.filter(({ shown, unread }) => shown !== unread).slice(0, 6)) {
        rendered += 1;
        const alone = { ...version, answerFields: [field] };
        const markup = renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question: alone, onStateChange() {}, onUndoStateChange() {}, feedback: null, draftKey: null }));
        const stated = [...markup.matchAll(/For example <strong[^>]*>([^<]*)<\/strong>\./g)].map(([, example]) => example);
        assert.equal(stated.length, 1, `${questionId} ${field.id}: one example`);
        assert.ok(NUMBER_EXAMPLES.includes(stated[0]), `${questionId} ${field.id}: "${stated[0]}"`);
        assert.equal(graderOf(alone, field)(stated[0]), false, `${questionId} ${field.id}: the screen states "${stated[0]}", and its answer is ${field.answer}`);
      }
    }
    assert.ok(rendered >= 10, `${rendered} boxes need their example moved off their answer`);
  } finally {
    await server.close();
  }
});

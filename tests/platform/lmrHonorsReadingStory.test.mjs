/*
 * THE HONORS STORY SHAPE OF linear.multipleRepresentations.
 *
 * `scenarioStart: 'fromReading'` is the opt-in shape the deterministic Honors
 * recipe draws from (src/platform/rigor/honorsExtensionRecipes.js). The story
 * states a FRACTIONAL rate ("3 liters every 2 minutes") and ONE LATER READING
 * ("6 minutes after it starts, the tank holds 27 liters") instead of the
 * starting amount, so the y-intercept is something the student must find, not
 * read. Everything else is the ordinary Multiple Representations board and its
 * ordinary grader.
 *
 * Three things are held here:
 *   1. every generated version is a valid board that grades 100% on both the
 *      browser and server paths, and 0 with one wrong card;
 *   2. every context dropdown keeps exactly one correct choice, and the story
 *      never states its own answers (start, time to empty);
 *   3. the shape is OPT-IN: a slot that does not ask for it draws exactly the
 *      versions it drew before this shape existed. The fingerprints below were
 *      captured from the family before the change — existing students' pinned
 *      versions must not move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveQuestionFamilyDefinition, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import {
  deriveLinearMultipleRepresentations,
  validateContextField,
  validateDomainField,
  validateLinearMultipleRepresentationsQuestion,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { correctLinearBoardResponse, oneWrongLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';

const BOARD = getPlatformQuestionFamily('linear.multipleRepresentations', 1);

const HONORS_CONSTRAINTS = Object.freeze({
  given: 'scenario',
  scenarioStart: 'fromReading',
  slope: 'fraction',
  rateRange: [2, 7],
  denominatorRange: [2, 4],
  startRange: [12, 48],
  durationRange: [6, 30],
});

const TANK_STORY = Object.freeze({
  kind: 'scenario',
  prompt: 'A water tank drains at a constant rate of {{rate}} liters every {{per}} minutes. {{readTime}} minutes after it starts draining, the tank holds {{readAmount}} liters. It keeps draining at the same rate until it is empty.',
});
const TANK_CONTEXT = Object.freeze({
  slopeMeaning: {
    value: 'The tank loses {{unitRate}} liters of water each minute.',
    choices: [
      'The tank loses {{unitRate}} liters of water each minute.',
      'The tank loses {{rate}} liters of water each minute.',
      'The tank loses {{inverseRate}} liters of water each minute.',
      'The tank gains {{unitRate}} liters of water each minute.',
    ],
  },
  yInterceptMeaning: {
    value: 'The tank held {{start}} liters when it started draining.',
    choices: [
      'The tank held {{start}} liters when it started draining.',
      'The tank held {{readAmount}} liters when it started draining.',
      'The tank is empty after {{start}} minutes.',
    ],
  },
  xInterceptMeaning: {
    value: 'The tank is empty {{end}} minutes after it started draining.',
    choices: [
      'The tank is empty {{end}} minutes after it started draining.',
      'The tank is empty {{remaining}} minutes after it started draining.',
      'The tank held {{end}} liters when it started draining.',
    ],
  },
  domain: {
    min: 0,
    max: '{{end}}',
    value: '0 ≤ x ≤ {{end}}',
    choices: ['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', '{{readTime}} ≤ x ≤ {{end}}', 'x ≥ 0'],
  },
});

const versionsOf = (overrides, authored = {}, count = 200) => {
  const { values, issues } = resolveFamilyConstraints(BOARD, overrides);
  assert.deepEqual(issues, [], `the family accepts ${JSON.stringify(overrides)}`);
  const sequence = createFamilyInstanceSequence(BOARD, values, `honors-reading|${JSON.stringify(overrides)}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    versions.push({
      instance,
      values,
      question: buildFamilyQuestion({
        family: BOARD,
        instance,
        constraintValues: values,
        authored: { questionId: 'honors-reading', type: 'representationBridge', source: TANK_STORY, context: TANK_CONTEXT, ...authored },
      }),
    });
  }
  return versions;
};

const markBothWays = (question, work) => {
  const browser = gradeToolWork({ toolId: 'representationBridge', question, work });
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, 'the server agrees with the browser');
  assert.equal(server.score, browser.score, 'the server scores what the browser scored');
  return browser;
};

test('existing slots draw exactly the versions they drew before the Honors shape existed', () => {
  // Captured from linear.multipleRepresentations v1 BEFORE scenarioStart was
  // added. A changed fingerprint here means a student's pinned version moved.
  const BEFORE = {
    storyStated: [
      [{ given: 'scenario', rateRange: [2, 6], durationRange: [3, 15], startRange: [6, 36] }, [
        'scenario|-4|1|28', 'scenario|-2|1|16', 'scenario|-3|1|30', 'scenario|-3|1|18', 'scenario|-2|1|6', 'scenario|-3|1|36',
      ]],
    ],
    standardFraction: [
      [{ given: 'standardForm', slope: 'fraction', slopeRange: [1, 3], denominatorRange: [2, 4], interceptRange: [-6, 6], standardScale: 2 }, [
        'standardForm|-1|4|2', 'standardForm|-2|3|-2', 'standardForm|-1|4|1', 'standardForm|-3|2|6', 'standardForm|-1|4|-1', 'standardForm|1|2|-2',
      ]],
    ],
    table: [
      [{ given: 'table', slope: 'integer', tablePattern: 'spread' }, [
        'table|1|1|7', 'table|1|1|4', 'table|1|1|-2', 'table|1|1|8', 'table|-1|1|-8', 'table|1|1|6',
      ]],
    ],
  };
  for (const [name, [[overrides, expected]]] of Object.entries(BEFORE)) {
    const { values } = resolveFamilyConstraints(BOARD, overrides);
    assert.equal(values.scenarioStart, 'stated', `${name}: a slot that does not opt in keeps the stated-start story`);
    const sequence = createFamilyInstanceSequence(BOARD, values, 'asg-lmr-family|lmr-pr-2');
    const drawn = Array.from({ length: expected.length }, (_, index) => sequence.instanceAt(index).fingerprint);
    assert.deepEqual(drawn, expected.map((tail) => `linear.multipleRepresentations:${tail}`), `${name}: the same versions in the same order`);
  }
});

test('every Honors reading-story version is a valid board, graded 100% on both paths and refused with one wrong card', () => {
  const versions = versionsOf(HONORS_CONSTRAINTS);
  const capacity = measureFamilyCapacity(BOARD, resolveFamilyConstraints(BOARD, HONORS_CONSTRAINTS).values).capacity;
  assert.ok(capacity >= 32, `a class's worth of distinct Honors versions (${capacity})`);
  assert.equal(versions.length, capacity, 'every version was examined');
  for (const { instance, question } of versions) {
    const label = instance.fingerprint;
    const { n, d, b, zero, rate, per, readTime, readAmount } = instance.values;
    assert.equal(question.type, 'representationBridge');
    assert.equal(question.mode, 'linearMultipleRepresentations');
    assert.equal(question.source.kind, 'scenario');
    assert.ok(d >= 2 && n < 0, `${label}: a negative, genuinely fractional rate (${n}/${d})`);
    assert.equal(rate % per === 0, false, `${label}: the stated rate is not a whole amount per minute`);
    const facts = deriveLinearMultipleRepresentations(question);
    assert.equal(facts.isValid, true, label);
    assert.deepEqual([facts.slopeFraction.n, facts.slopeFraction.d], [n, d], `${label}: the board's slope is the story's rate`);
    assert.equal(facts.yInterceptNumber, b, `${label}: the board's y-intercept is the starting amount`);
    assert.equal(facts.zeroNumber, zero, `${label}: and its x-intercept is when it runs out`);
    assert.equal(readAmount, b + (n / d) * readTime, `${label}: the reading lies on the line`);
    assert.ok(readTime > 0 && readTime < zero, `${label}: the reading is taken while the tank is draining`);
    assert.deepEqual(validateLinearMultipleRepresentationsQuestion(question), [], label);
    assert.deepEqual(validateToolQuestion({ ...question, toolId: question.type }).errors, [], label);
    assert.deepEqual(validateQuestionSemantics(question).errors, [], label);
    const right = markBothWays(question, correctLinearBoardResponse(question));
    assert.equal(right.isCorrect, true, `${label}: a complete correct board is credited`);
    assert.equal(right.score, 1, label);
    assert.ok(right.parts.some((part) => part.id === 'contextDomain'), `${label}: the domain is a graded part`);
    assert.equal(markBothWays(question, oneWrongLinearBoardResponse(question)).isCorrect, false, `${label}: one wrong card is not`);
  }
});

test('the story never states its own answers, and every meaning keeps exactly one correct choice', () => {
  const credited = (key, entry) => entry.choices.filter((choice) => (key === 'domain'
    ? validateDomainField(choice, entry).isCorrect
    : validateContextField(choice, entry).valid));
  for (const { instance, question } of versionsOf(HONORS_CONSTRAINTS)) {
    const { b, zero, rate, per, readTime, readAmount } = instance.values;
    assert.equal(JSON.stringify(question).includes('{{'), false, 'no token reaches a student');
    assert.equal(
      question.source.prompt,
      `A water tank drains at a constant rate of ${rate} liters every ${per} minutes. ${readTime} minutes after it starts draining, the tank holds ${readAmount} liters. It keeps draining at the same rate until it is empty.`,
    );
    const shown = `${question.prompt} ${question.source.prompt}`;
    assert.doesNotMatch(shown, new RegExp(`\\b${b}\\b`), `${instance.fingerprint}: the starting amount (${b}) is for the student to find`);
    assert.doesNotMatch(shown, new RegExp(`\\b${zero}\\b`), `${instance.fingerprint}: so is the time it runs out (${zero})`);
    assert.equal(question.context.domain.max, zero);
    for (const [key, entry] of Object.entries(question.context)) {
      assert.equal(credited(key, entry).length, 1, `${instance.fingerprint} ${key}: exactly one choice is marked correct`);
      assert.equal(new Set(entry.choices).size, entry.choices.length, `${instance.fingerprint} ${key}: no two choices read the same`);
    }
  }
});

test('a reduce-complexity support keeps the story and its reading, with a whole-number unit rate', () => {
  const slot = {
    questionId: 'honors-support',
    type: 'representationBridge',
    mode: 'linearMultipleRepresentations',
    prompt: 'Read the situation and build every representation.',
    source: TANK_STORY,
    context: TANK_CONTEXT,
    questionFamily: { id: 'linear.multipleRepresentations', version: 1, constraints: HONORS_CONSTRAINTS },
  };
  const supported = resolveQuestionFamilyDefinition(slot, { slotKey: 'support', support: 'reduce-complexity' });
  assert.equal(supported.constraintValues.slope, 'integer');
  assert.ok(measureFamilyCapacity(supported.family, supported.constraintValues).capacity >= 12, 'enough versions for a Recovery');
  for (let seat = 0; seat < 12; seat += 1) {
    const { question, instance, error } = resolveFamilyQuestionInstance({
      question: slot,
      assignmentId: 'asg-support',
      allocation: { seat, variant: 0, stride: 12, index: seat, basis: 'seated' },
      support: 'reduce-complexity',
    });
    assert.equal(error, null);
    assert.equal(deriveLinearMultipleRepresentations(question).slopeFraction.d, 1, 'a whole-number rate of change');
    assert.ok(instance.values.per >= 2 && instance.values.readTime > 0, 'still stated per several minutes, with a later reading');
    assert.deepEqual(validateLinearMultipleRepresentationsQuestion(question), []);
  }
});

/*
 * THE REPRESENTATION FAMILIES — ONE LINE, EVERY REPRESENTATION.
 *
 * linear.multipleRepresentations builds the Multiple Representations board
 * and linear.representationSort the two-line card sort. Each family draws only
 * the line (or a story's rate and duration) and derives every representation
 * from it, so these tests check the derived question against the board's OWN
 * reading of it (deriveLinearMultipleRepresentations, canonicalLineForSet),
 * then mark a complete correct answer on the browser path and on the server
 * path for every sampled version.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { gcd, resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyQuestionInstance, resolveQuestionFamilyDefinition } from '../../functions/shared/questionFamilyInstance.mjs';
import { GIVEN_KINDS, standardCoefficients } from '../../functions/shared/questionFamiliesRepresentations.mjs';
import {
  deriveLinearMultipleRepresentations,
  validateContextField,
  validateDomainField,
  validateLinearMultipleRepresentationsQuestion,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import {
  buildLinearConnectionCards,
  canonicalLineForSet,
  inconsistentLinearCardKinds,
  linearConnectionsCardKinds,
  representationSetsFor,
} from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { auditAssignmentQuestionGeneration } from '../../src/platform/preflight/questionGenerationPreflight.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { correctLinearBoardResponse, oneWrongLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';

const BOARD = getPlatformQuestionFamily('linear.multipleRepresentations');
const SORT = getPlatformQuestionFamily('linear.representationSort');
const SAMPLE = 40;

const versionsOf = (family, overrides = {}, authored = {}, count = SAMPLE) => {
  const { values, issues } = resolveFamilyConstraints(family, overrides);
  assert.deepEqual(issues, [], `${family.id} accepts ${JSON.stringify(overrides)}`);
  const sequence = createFamilyInstanceSequence(family, values, `representations|${JSON.stringify(overrides)}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    const question = buildFamilyQuestion({
      family,
      instance,
      constraintValues: values,
      authored: { questionId: 'rep-family', type: family.defaultTool, ...authored },
    });
    versions.push({ instance, question, values });
  }
  return versions;
};

/** Mark work through the browser path, then the bytes it sends through the server path. */
const markBothWays = (toolId, question, work) => {
  const browser = gradeToolWork({ toolId, question, work });
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, 'the server agrees with the browser');
  assert.equal(server.score, browser.score, 'the server scores what the browser scored');
  return browser;
};

const CANDLE_CONTEXT = Object.freeze({
  slopeMeaning: {
    value: 'The candle gets {{rate}} centimeters shorter every hour.',
    choices: [
      'The candle gets {{rate}} centimeters shorter every hour.',
      'The candle gets {{rate}} centimeters taller every hour.',
      'The candle burns for {{rate}} hours.',
      'The candle started at {{rate}} centimeters tall.',
    ],
  },
  yInterceptMeaning: {
    value: 'The candle is {{start}} centimeters tall when it is lit.',
    choices: [
      'The candle is {{start}} centimeters tall when it is lit.',
      'The candle burns out after {{start}} hours.',
      'The candle loses {{start}} centimeters every hour.',
    ],
  },
  xInterceptMeaning: {
    value: 'The candle is completely burned down after {{end}} hours.',
    choices: [
      'The candle is completely burned down after {{end}} hours.',
      'The candle is {{end}} centimeters tall when it is lit.',
      'The candle burns {{end}} centimeters every hour.',
    ],
  },
  domain: {
    min: 0,
    max: '{{end}}',
    value: '0 ≤ x ≤ {{end}}',
    choices: ['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', 'x ≥ 0', '−{{rate}} ≤ x ≤ {{start}}'],
  },
});
const CANDLE_STORY = { kind: 'scenario', prompt: 'A candle is {{start}} centimeters tall when it is lit. It burns down {{rate}} centimeters every hour until it is completely gone.' };

test('every GIVEN kind: the board reads the family\'s own line, and every version is 100% gradable on both paths', () => {
  const configs = GIVEN_KINDS.flatMap((given) => (given === 'scenario'
    ? [[{ given }, { source: CANDLE_STORY, context: CANDLE_CONTEXT }]]
    : [[{ given }, {}], [{ given, slope: 'fraction' }, {}]]));
  for (const [overrides, authored] of configs) {
    const versions = versionsOf(BOARD, overrides, authored);
    assert.ok(versions.length >= 20, `${JSON.stringify(overrides)} has a class's worth of versions (${versions.length})`);
    for (const { instance, question } of versions) {
      const label = `${JSON.stringify(overrides)} ${instance.fingerprint}`;
      const { n, d, b } = instance.values;
      assert.equal(question.mode, 'linearMultipleRepresentations');
      assert.equal(question.source.kind, overrides.given, `${label}: the GIVEN is the kind the slot asked for`);
      const facts = deriveLinearMultipleRepresentations(question);
      assert.equal(facts.isValid, true, label);
      assert.deepEqual([facts.slopeFraction.n, facts.slopeFraction.d], [n, d], `${label}: the board's slope is the family's`);
      assert.equal(facts.yInterceptNumber, b, `${label}: the board's y-intercept is the family's`);
      assert.deepEqual(validateToolQuestion({ ...question, toolId: question.type }).errors, [], label);
      assert.deepEqual(validateQuestionSemantics(question).errors, [], label);
      const right = markBothWays('representationBridge', question, correctLinearBoardResponse(question));
      assert.equal(right.isCorrect, true, `${label}: a complete correct board is credited`);
      assert.equal(right.score, 1, label);
      assert.equal(markBothWays('representationBridge', question, oneWrongLinearBoardResponse(question)).isCorrect, false, `${label}: a wrong card is not`);
    }
  }
});

test('the GIVEN is written the way a teacher writes it, and is never itself an intercept', () => {
  for (const { question, instance } of versionsOf(BOARD, { given: 'standardForm', slope: 'fraction', slopeRange: [1, 3], denominatorRange: [2, 4], interceptRange: [-6, 6], standardScale: 2 })) {
    const match = /^(-?\d*)x ([+-]) (\d*)y = (-?\d+)$/.exec(question.source.equation);
    assert.ok(match, `standard form text: ${question.source.equation}`);
    const coefficient = (text) => (text === '' ? 1 : text === '-' ? -1 : Number(text));
    const [A, B, C] = [coefficient(match[1]), (match[2] === '-' ? -1 : 1) * coefficient(match[3]), Number(match[4])];
    const reduced = standardCoefficients(instance.values.n, instance.values.d, instance.values.b);
    assert.deepEqual([A, B, C], [2 * reduced.A, 2 * reduced.B, 2 * reduced.C], 'the GIVEN is the reduced form times the slot\'s scale');
    assert.ok(A > 0, 'a positive x-coefficient');
    assert.equal(gcd(gcd(A, B), C), 2, 'not in lowest terms, so the student must simplify');
    assert.ok(instance.values.d > 1 && gcd(Math.abs(instance.values.n), instance.values.d) === 1, 'a reduced fractional slope');
  }
  for (const { question, instance } of versionsOf(BOARD, { given: 'pointSlope' })) {
    const [x, y] = deriveLinearMultipleRepresentations(question).sourcePoint;
    assert.ok(x !== instance.values.zero && y !== 0, `the given point (${x}, ${y}) is not the x-intercept`);
    assert.ok(x !== 0, 'nor the y-intercept');
  }
  for (const { question, instance } of versionsOf(BOARD, { given: 'twoPoints' })) {
    for (const { x, y } of question.source.points) {
      assert.ok(x !== 0 && x !== instance.values.zero && y !== 0, `(${x}, ${y}) is not an intercept`);
    }
  }
  for (const { question, instance } of versionsOf(BOARD, { given: 'table', tablePattern: 'spread' })) {
    assert.equal(question.source.rows.length, 4);
    for (const { x, y } of question.source.rows) {
      assert.ok(x !== 0 && x !== instance.values.zero && y !== 0, `the row (${x}, ${y}) is not an intercept`);
    }
  }
  for (const { question } of versionsOf(BOARD, { given: 'slopeIntercept' })) {
    assert.match(question.source.equation, /^y = -?\d*x [+-] \d+$/, 'an integer slope is written as an equation');
  }
  for (const { question } of versionsOf(BOARD, { given: 'slopeIntercept', slope: 'fraction' })) {
    assert.ok(Number.isFinite(question.source.m) && !Number.isInteger(question.source.m), 'a fractional slope is given exactly, as structured m and b');
    assert.match(question.prompt, /y = −?\d+\/\d+x [+−] \d+/, 'and shown as a fraction');
  }
});

test('every version stays inside its constraints: whole-number x-intercepts, readable coordinates, the story\'s starting range', () => {
  const coordinateBound = (overrides) => {
    for (const { instance, question } of versionsOf(BOARD, overrides)) {
      const { values } = resolveFamilyConstraints(BOARD, overrides);
      const facts = deriveLinearMultipleRepresentations(question);
      assert.ok(Number.isInteger(facts.zeroNumber), 'a whole-number x-intercept');
      const points = [[facts.zeroNumber, 0], [0, facts.yInterceptNumber], ...(facts.sourcePoints || []), ...(facts.sourcePoint ? [facts.sourcePoint] : [])];
      for (const coordinate of points.flat()) {
        assert.ok(coordinate >= values.coordinateRange[0] && coordinate <= values.coordinateRange[1], `${instance.fingerprint}: ${coordinate} is on the readable grid`);
      }
      const { graphBounds } = question;
      for (const [x, y] of points) {
        assert.ok(x > graphBounds.xMin && x < graphBounds.xMax && y > graphBounds.yMin && y < graphBounds.yMax, `${instance.fingerprint}: (${x}, ${y}) is on the graph`);
      }
    }
  };
  coordinateBound({ given: 'slopeIntercept' });
  coordinateBound({ given: 'pointSlope' });
  coordinateBound({ given: 'twoPoints' });
  coordinateBound({ given: 'standardForm', slope: 'fraction' });

  const story = versionsOf(BOARD, { given: 'scenario', startRange: [6, 36] }, { source: CANDLE_STORY, context: CANDLE_CONTEXT }, 200);
  assert.equal(story.length, measureFamilyCapacity(BOARD, resolveFamilyConstraints(BOARD, { given: 'scenario', startRange: [6, 36] }).values).capacity, 'every story version was examined');
  for (const { instance, question } of story) {
    const { start, rate, duration } = instance.values;
    assert.ok(start >= 6 && start <= 36, `a starting amount of ${start} keeps the graph as readable as every other version's`);
    assert.equal(new Set([start, rate, duration]).size, 3, 'the story\'s three numbers are three different numbers');
    assert.equal(question.graphBounds.yMax <= 38 && question.graphBounds.xMin === -2 && question.graphBounds.yMin === -4, true);
  }
});

test('a story fills its numbers everywhere, never states its own answer, and keeps exactly one correct choice per meaning', () => {
  const credited = (key, entry) => entry.choices.filter((choice) => (key === 'domain'
    ? validateDomainField(choice, entry).isCorrect
    : validateContextField(choice, entry).valid));
  const versions = versionsOf(BOARD, { given: 'scenario' }, { source: CANDLE_STORY, context: CANDLE_CONTEXT }, 200);
  assert.ok(versions.length >= 32, `${versions.length} story versions`);
  for (const { instance, question } of versions) {
    const { start, rate, duration } = instance.values;
    assert.equal(JSON.stringify(question).includes('{{'), false, 'no token reaches a student');
    assert.equal(question.source.prompt, `A candle is ${start} centimeters tall when it is lit. It burns down ${rate} centimeters every hour until it is completely gone.`);
    assert.deepEqual([question.source.m, question.source.b], [-rate, start], 'the story\'s line');
    assert.doesNotMatch(`${question.prompt} ${question.source.prompt}`, new RegExp(`\\b${duration}\\b`), 'the time it runs out is for the student to find');
    assert.equal(question.context.domain.max, duration, 'a whole-token field takes the number itself');
    assert.equal(typeof question.context.domain.max, 'number');
    for (const [key, entry] of Object.entries(question.context)) {
      assert.equal(credited(key, entry).length, 1, `${instance.fingerprint} ${key}: exactly one choice is marked correct`);
      assert.ok(entry.choices.includes(entry.value), `${key}: the correct answer is offered`);
    }
    assert.deepEqual(validateLinearMultipleRepresentationsQuestion(question), []);
  }
});

test('a story\'s meanings written on its source are filled from the line too, and graded', () => {
  for (const { instance, question } of versionsOf(BOARD, { given: 'scenario' }, { source: { ...CANDLE_STORY, context: CANDLE_CONTEXT } }, 12)) {
    assert.equal(question.context, undefined);
    assert.equal(question.source.context.domain.max, instance.values.duration);
    assert.equal(question.source.context.slopeMeaning.value, `The candle gets ${instance.values.rate} centimeters shorter every hour.`);
    assert.deepEqual(validateLinearMultipleRepresentationsQuestion(question), []);
    const right = markBothWays('representationBridge', question, correctLinearBoardResponse(question));
    assert.equal(right.isCorrect, true);
    assert.ok(right.parts.some((part) => part.id === 'contextSlopeMeaning'), 'the meanings are graded parts');
  }
});

test('the board validator refuses a meaning with no correct choice, with two, or with two that read the same', () => {
  const [{ question }] = versionsOf(BOARD, { given: 'scenario' }, { source: CANDLE_STORY, context: CANDLE_CONTEXT }, 1);
  assert.deepEqual(validateLinearMultipleRepresentationsQuestion(question), []);
  const broken = (mutate) => {
    const copy = structuredClone(question);
    mutate(copy.context);
    return validateLinearMultipleRepresentationsQuestion(copy).join('\n');
  };
  assert.match(broken((context) => { context.slopeMeaning.value = 'The candle never changes.'; }), /context\.slopeMeaning offers no choice that is its correct answer/);
  assert.match(broken((context) => { context.yInterceptMeaning.choices.push(context.yInterceptMeaning.value.toUpperCase()); }), /context\.yInterceptMeaning offers two choices that read the same/);
  assert.match(
    broken((context) => { context.domain.choices[1] = `0 \\le x \\le ${context.domain.max}`; }),
    /context\.domain has more than one choice that would be marked correct/,
    'a distractor the domain grader would also accept',
  );
  // A meaning typed by the student (no choices) is not a dropdown and is not checked here.
  assert.deepEqual(validateLinearMultipleRepresentationsQuestion({ ...question, context: { slopeMeaning: { value: 'anything' } } }), []);
});

test('the card sort deals one rising and one falling line whose cards never coincide, and every version sorts to 100% on both paths', () => {
  const kinds = ['slopeIntercept', 'standard', 'pointSlope', 'graph', 'xIntercept'];
  const authoredFor = { cardKinds: kinds, mode: 'linearConnections', task: 'group', sets: [{ id: 'line-a' }, { id: 'line-b' }] };
  const decks = new Set();
  for (const { instance, question } of versionsOf(SORT, { slopeRange: [1, 3], interceptRange: [-6, 6] }, authoredFor)) {
    const sets = representationSetsFor(question);
    assert.deepEqual(sets.map((set) => set.id), ['line-a', 'line-b'], 'the authored set ids are kept');
    assert.ok(sets[0].slope > 0 && sets[1].slope < 0, 'the first set is the rising line, the second the falling one');
    for (const set of sets) {
      assert.deepEqual(inconsistentLinearCardKinds(set, canonicalLineForSet(set)), [], `${instance.fingerprint}: every card of ${set.id} describes its line`);
    }
    const cards = buildLinearConnectionCards(sets, linearConnectionsCardKinds(question));
    decks.add(cards.length);
    for (const kind of kinds) {
      const [first, second] = sets.map((set) => JSON.stringify(cards.find((card) => card.setId === set.id && card.kind === kind)?.value));
      assert.notEqual(first, second, `${instance.fingerprint}: the two ${kind} cards differ`);
    }
    const slot = Object.fromEntries(sets.map((set, index) => [set.id, index]));
    const assignments = cards.map((card) => ({ cardId: card.id, slot: slot[card.setId] }));
    const right = markBothWays('representationMatch', question, { assignments });
    assert.equal(right.isCorrect, true, `${instance.fingerprint}: a correct sort is credited`);
    assert.equal(right.score, 1);
    const moved = assignments.map((entry, index) => (index === 0 ? { ...entry, slot: 1 - entry.slot } : entry));
    assert.equal(markBothWays('representationMatch', question, { assignments: moved }).isCorrect, false, 'one misplaced card is not');
    assert.equal(markBothWays('representationMatch', question, { assignments: [] }).score, 0, 'an untouched board earns nothing');
    assert.match(question.prompt, /^Two different lines are hiding in these cards\./);
  }
  assert.deepEqual([...decks], [10], 'every version deals the same ten cards: the same work for the same credit');
});

test('the card sort fills an authored story per set, and deals x-intercept cards only when they are whole numbers', () => {
  const authored = {
    cardKinds: ['context', 'slopeIntercept', 'graph', 'slope', 'yIntercept'],
    sets: [
      { id: 'savings', context: 'Maya has ${{start}} saved and adds ${{rate}} every week.' },
      { id: 'tub', context: 'A tub holds {{start}} gallons of water and drains {{rate}} gallons every minute.' },
    ],
    prompt: 'One situation grows and one shrinks. Sort each card into the situation it describes.',
  };
  for (const { question } of versionsOf(SORT, { slopeRange: [2, 6], interceptRange: [10, 40] }, authored)) {
    const [savings, tub] = representationSetsFor(question);
    assert.equal(savings.context, `Maya has $${savings.yIntercept[1]} saved and adds $${savings.slope} every week.`);
    assert.equal(tub.context, `A tub holds ${tub.yIntercept[1]} gallons of water and drains ${-tub.slope} gallons every minute.`);
    assert.deepEqual(question.graphBounds.xMin, 0, 'a story sort is graphed in the first quadrant');
    assert.equal(question.prompt, authored.prompt, 'an authored prompt without tokens is used as written');
    assert.equal(buildLinearConnectionCards(representationSetsFor(question), linearConnectionsCardKinds(question)).length, 10);
  }
  for (const authoredKinds of [{}, { cardKinds: ['slopeIntercept', 'graph', 'xIntercept', 'factoredLinear', 'yIntercept'] }]) {
    const decks = new Set();
    for (const { question } of versionsOf(SORT, { integerXIntercepts: false }, authoredKinds)) {
      const cards = buildLinearConnectionCards(representationSetsFor(question), linearConnectionsCardKinds(question));
      const kinds = new Set(cards.map((card) => card.kind));
      assert.equal(kinds.has('xIntercept') || kinds.has('factoredLinear'), false, 'no x-intercept card in any version, even where it happens to be whole');
      decks.add(cards.length);
    }
    assert.equal(decks.size, 1, 'so every version deals the same number of cards');
  }
});

test('Pre-Flight refuses a slot whose versions would show an unfilled {{token}}, and names it', () => {
  const slot = (prompt) => ({
    questionId: 'cw-token',
    activityRole: 'classwork',
    type: 'representationBridge',
    mode: 'linearMultipleRepresentations',
    prompt,
    questionFamily: { id: 'linear.multipleRepresentations', version: 1, constraints: { given: 'slopeIntercept' } },
  });
  const good = auditAssignmentQuestionGeneration({ id: 'asg-token' }, [slot('You are given {{given}}. Build every other representation.')]);
  assert.deepEqual(good.errors, []);
  const typo = auditAssignmentQuestionGeneration({ id: 'asg-token' }, [slot('You are given {{givn}}. Build every other representation.')]);
  assert.equal(typo.errors.length, 1, typo.errors.join('\n'));
  assert.match(typo.errors[0], /32 of 32 generated versions would be refused/, 'a slot that writes tokens is checked against a class\'s worth of versions');
  assert.match(typo.errors[0], /would show \{\{givn\}\} to the student as written, because the family fills no value by that name/);
  assert.match(typo.errors[0], /Correct the name, or use one of the values the family fills\.$/);
});

test('a reduce-complexity support keeps every MR board family slot generating valid, integer-slope versions', () => {
  const question = {
    questionId: 'support-cw1',
    type: 'representationBridge',
    mode: 'linearMultipleRepresentations',
    prompt: 'You are given the standard form equation {{given}}. Build every other representation of this same line, in any order you like.',
    questionFamily: { id: 'linear.multipleRepresentations', version: 1, constraints: { given: 'standardForm', slope: 'fraction', slopeRange: [1, 3], denominatorRange: [2, 4], interceptRange: [-6, 6], standardScale: 2 } },
  };
  const supported = resolveQuestionFamilyDefinition(question, { slotKey: 'support', support: 'reduce-complexity' });
  assert.equal(supported.support, 'reduce-complexity');
  assert.equal(supported.constraintValues.slope, 'integer');
  assert.equal(supported.constraintValues.standardScale, 1);
  assert.ok(measureFamilyCapacity(supported.family, supported.constraintValues).capacity >= 12, 'enough versions for a Recovery');
  for (let seat = 0; seat < 12; seat += 1) {
    const { question: built, error } = resolveFamilyQuestionInstance({ question, assignmentId: 'asg-support', allocation: { seat, variant: 0, stride: 12, index: seat, basis: 'seated' }, support: 'reduce-complexity' });
    assert.equal(error, null);
    assert.equal(deriveLinearMultipleRepresentations(built).slopeFraction.d, 1, 'an integer slope');
    assert.deepEqual(validateLinearMultipleRepresentationsQuestion(built), []);
  }
});

/*
 * RECOVERY V2 — THE BASELINE MULTIPLE REPRESENTATIONS LESSON (RC01).
 *
 * docs/assignments/algebra1-linear-multiple-representations-final-v5.json is a
 * static lesson: its two Warm-Up card sorts and its DOL board had no Recovery,
 * because version 1 of linear.representationSort and
 * linear.multipleRepresentations write only what their slot tells them, and a
 * Recovery slot tells them nothing (recoveryContent.mjs). Version 2 of each
 * (functions/shared/questionFamiliesRepresentations.mjs) writes the lesson's
 * own tasks in full and recognizes them:
 *
 *   lmr-wu-1   two lines named in the prompt, five card kinds each   deck equationForms
 *   lmr-wu-2   savings and a draining tub, five card kinds each       deck situations
 *   lmr-dol-1  the draining tank: six cards and three meanings        board drainingTank
 *
 * These tests hold the families to what a student is owed — every version is
 * a valid question the server marks right with its own key and wrong with one
 * card wrong; versions are distinct and plentiful; the line is re-derived here
 * from what the student READS (the cards, the story) with the tools' own
 * readers, never from the family's key — and hold the lesson to what the
 * teacher was promised: Prepare Recovery makes both sections ready, never
 * touches a question, and a student who missed them gets fresh versions of the
 * same task that are never a problem from the lesson.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { allRegisteredQuestionFamilies, defaultFamilyVersion, getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import {
  buildFamilyQuestion,
  buildParameterSpace,
  createFamilyInstanceSequence,
  evaluateFamilyCandidate,
  measureFamilyCapacity,
} from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { RECOVERY_MINIMUM_FRESH_VERSIONS, familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions, recoveryCandidateFamilies, recoveryPreparationAvailable } from '../../functions/shared/recoveryContentPlan.mjs';
import { applyRecoveryUpgrade, buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoveryExclusionFingerprints, recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  buildLinearConnectionCards,
  canonicalLineForSet,
  inconsistentLinearCardKinds,
  linearConnectionsCardKinds,
  representationSetsFor,
} from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import {
  deriveLinearMultipleRepresentations,
  gradedContextFields,
  resolveRequiredCards,
  validateContextField,
  validateDomainField,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { RECOVERY_ACTION, RECOVERY_STATE, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { correctLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';

const SORT = getPlatformQuestionFamily('linear.representationSort', 2);
const BOARD = getPlatformQuestionFamily('linear.multipleRepresentations', 2);
const LESSON_FILE = 'docs/assignments/algebra1-linear-multiple-representations-final-v5.json';
const LESSON = compileTeacherImport(readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8'));
const questionIn = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

// The lesson's three static Warm-Up and DOL questions, the task each one is,
// and the ranges (the family-backed copy of the lesson's) its Recovery draws from.
const TASKS = Object.freeze({
  equationForms: { family: SORT, constraints: { deck: 'equationForms', slopeRange: [1, 3], interceptRange: [-6, 6] } },
  situations: { family: SORT, constraints: { deck: 'situations', slopeRange: [2, 6], interceptRange: [10, 40] } },
  drainingTank: {
    family: BOARD,
    constraints: { given: 'scenario', board: 'drainingTank', rateRange: [2, 6], durationRange: [3, 15], startRange: [6, 36] },
  },
});
const LIVE = Object.freeze([
  { questionId: 'lmr-wu-1', task: 'equationForms', params: { rise: 2, fall: 1, b1: -4, b2: 3 } },
  { questionId: 'lmr-wu-2', task: 'situations', params: { rise: 5, fall: 4, b1: 20, b2: 40 } },
  { questionId: 'lmr-dol-1', task: 'drainingTank', params: { rate: 3, duration: 8 } },
]);

// Worked by hand from the parameter domains and rules:
//   equationForms   slopes 1..3 (rising and falling sizes differ), intercepts
//                   −6..6 but not 0, each a multiple of its slope (a whole-number
//                   x-intercept), the two intercepts different: 236
//   situations      slopes 2..6 (sizes differ), starting amounts 10..40, each a
//                   multiple of its slope, the two amounts different: 1,546
//   drainingTank    rate 2..6 and minutes 3..15 with 6 ≤ rate × minutes ≤ 36,
//                   rate ≠ minutes: 13 + 9 + 6 + 4 + 3 = 35
const VERSIONS = Object.freeze({ equationForms: 236, situations: 1546, drainingTank: 35 });

const valuesFor = (task) => {
  const { values, issues } = resolveFamilyConstraints(TASKS[task].family, TASKS[task].constraints);
  assert.deepEqual(issues, [], `${task}: the family accepts its constraints`);
  return values;
};
/** Every valid version, by walking the whole parameter space. */
const everyInstance = (task) => {
  const { family } = TASKS[task];
  const values = valuesFor(task);
  const space = buildParameterSpace(family, values);
  const instances = [];
  const walk = (position, params) => {
    if (position === space.names.length) {
      const candidate = evaluateFamilyCandidate(family, values, params);
      if (candidate.valid) instances.push(candidate.instance);
      return;
    }
    space.values[position].forEach((value) => walk(position + 1, { ...params, [space.names[position]]: value }));
  };
  walk(0, {});
  return instances;
};
/** A version as Recovery builds it: from a slot that carries the original's identity and none of its wording. */
const recoverySlot = (task, original = questionIn(LIVE.find((live) => live.task === task).questionId)) => recoverySourceQuestion(original, {
  questionFamily: { id: TASKS[task].family.id, version: 2, constraints: TASKS[task].constraints },
});
const build = (task, instance) => buildFamilyQuestion({
  family: TASKS[task].family,
  instance,
  constraintValues: valuesFor(task),
  authored: recoverySlot(task),
});
const deckOf = (question) => buildLinearConnectionCards(representationSetsFor(question), linearConnectionsCardKinds(question))
  .map((card) => [card.id, JSON.stringify(card.value)]);

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('version 2 of both families is registered, recognizes static questions, may serve Recovery, and its task is a strict concept; version 1 is untouched', () => {
  for (const [family, knob] of [[SORT, 'deck'], [BOARD, 'board']]) {
    assert.equal(family.version, 2);
    assert.equal(typeof family.recognize, 'function', `${family.id} v2 recognizes`);
    assert.equal(family.recovery.eligible, true);
    assert.equal(family.constraintPolicy, 'strict', 'a slot that asks for a task gets that task or nothing');
    assert.deepEqual([...family.conceptConstraints], [knob]);
    assert.equal(resolveFamilyConstraints(family, { [knob]: 'candle' }).fatal, true);
    const v1 = getPlatformQuestionFamily(family.id, 1);
    assert.equal(v1.recognize, null, `${family.id} v1 still recognizes nothing`);
    assert.equal(defaultFamilyVersion(family.id), 1, 'an unpinned reference still means version 1');
    assert.equal(getPlatformQuestionFamily(family.id).version, 1);
    // The same skill and rigor: the Honors and capability reports read them.
    assert.deepEqual([v1.title, v1.skill, v1.difficulty], [family.title, family.skill, family.difficulty]);
  }
});

test('the family module stays light: the registry loads in the browser, so it imports only the family contract', () => {
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesRepresentations.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['./questionFamilyContract.mjs'], 'no tool math, no grader, no browser module');
});

test('under the slot\'s own task ("authored"), version 2 writes exactly what version 1 writes', () => {
  for (const [v2, authored] of [
    [SORT, { questionId: 'v1-v2', prompt: 'Sort the cards: {{line1}} and {{line2}}.', cardKinds: ['slopeIntercept', 'graph', 'table'] }],
    [BOARD, { questionId: 'v1-v2', prompt: 'Build every representation of {{given}}.' }],
  ]) {
    const v1 = getPlatformQuestionFamily(v2.id, 1);
    const overrides = v2 === BOARD ? { given: 'pointSlope' } : {};
    const values1 = resolveFamilyConstraints(v1, overrides).values;
    const values2 = resolveFamilyConstraints(v2, overrides).values;
    assert.equal(values2[v2 === BOARD ? 'board' : 'deck'], 'authored', 'the default task is the slot\'s own');
    const sequence = createFamilyInstanceSequence(v1, values1, 'v1-v2');
    for (let index = 0; index < 24; index += 1) {
      const one = sequence.instanceAt(index);
      // The same numbers under version 2: the same instance, key and question.
      const two = evaluateFamilyCandidate(v2, values2, one.params);
      assert.equal(two.valid, true, `${v2.id} ${one.fingerprint}: still a valid version`);
      assert.equal(two.instance.fingerprint, one.fingerprint);
      assert.deepEqual(two.instance.answer, one.answer, 'the same key');
      // Everything but the version stamp the engine adds.
      const strip = ({ familyVersion: _version, familyInstance: _instance, ...rest }) => rest;
      assert.deepEqual(
        strip(buildFamilyQuestion({ family: v2, instance: two.instance, constraintValues: values2, authored })),
        strip(buildFamilyQuestion({ family: v1, instance: one, constraintValues: values1, authored })),
        `${v2.id} ${one.fingerprint}: the same question`,
      );
    }
  }
});

// The one exception is a version that declares it replaces an earlier one for
// Recovery (`recovery.replaces`): matrices.arrayRecordTotals v2, the matrices
// Warm-Up's rewritten choices (matricesArrayRecordTotalsVersions.test.mjs).
test('the Recovery planner\'s candidates: each family at the first version that recognizes — version 1 for every family that always did, version 2 for these two', () => {
  const candidates = recoveryCandidateFamilies();
  const keys = candidates.map((family) => `${family.id}@${family.version}`);
  assert.ok(keys.includes('linear.representationSort@2') && keys.includes('linear.multipleRepresentations@2'));
  assert.equal(new Set(candidates.map((family) => family.id)).size, candidates.length, 'one version per family');
  const recognizing = allRegisteredQuestionFamilies().filter((family) => typeof family.recognize === 'function' && family.recovery.eligible);
  const replacing = candidates.filter((family) => family.recovery.replaces.length);
  assert.deepEqual(replacing.map((family) => `${family.id}@${family.version}`), ['matrices.arrayRecordTotals@2'], 'only a version that says it replaces one is chosen over it');
  for (const family of candidates.filter((candidate) => !replacing.includes(candidate))) {
    const versions = recognizing.filter((other) => other.id === family.id).map((other) => other.version);
    assert.equal(family.version, Math.min(...versions), `${family.id}: the first version that recognizes`);
    if (family.id !== SORT.id && family.id !== BOARD.id) assert.equal(family.version, 1, `${family.id} is still a candidate at version 1`);
  }
  assert.ok(keys.includes('matrices.solveSystem3x3@1') && !keys.includes('matrices.solveSystem3x3@2'), 'a newer version is never chosen over one that recognizes');
});

for (const [task, count] of Object.entries(VERSIONS)) {
  test(`${task}: all ${count} versions build in the original's tool, are valid and distinct, and the server marks each one's key right and one card wrong wrong`, () => {
    const instances = everyInstance(task);
    assert.equal(instances.length, count, `${task} has ${instances.length} versions`);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, count, 'no two versions are the same line or pair of lines');
    // What certification reads: exact for a list it can walk, an estimate
    // for the stories' larger one.
    const capacity = measureFamilyCapacity(TASKS[task].family, valuesFor(task), { budget: 2048 });
    assert.ok(capacity.capacity - 2 >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${task}: certification reads ${capacity.capacity}`);
    if (task !== 'situations') assert.deepEqual([capacity.capacity, capacity.exact], [count, true], 'and it is the same number');
    instances.forEach((instance) => {
      const question = build(task, instance);
      const label = `${task} ${instance.fingerprint}`;
      assert.equal(question.type, task === 'drainingTank' ? 'representationBridge' : 'representationMatch');
      assert.equal(question.mode, task === 'drainingTank' ? 'linearMultipleRepresentations' : 'linearConnections');
      assert.equal(JSON.stringify(question).includes('{{'), false, `${label}: no token reaches a student`);
      assert.deepEqual(validateToolQuestion({ ...question, toolId: question.type }).errors, [], label);
      assert.deepEqual(validateQuestionSemantics(question, { label }).errors, [], label);
      const responses = recoveryKeyResponses(question, instance);
      assert.ok(responses, `${label}: certification answers it from the key`);
      assert.equal(gradeServerResponse({ question, response: responses.right })?.isCorrect, true, `${label}: its own key is correct`);
      assert.notEqual(gradeServerResponse({ question, response: responses.wrong })?.isCorrect, true, `${label}: one card wrong is not`);
      const check = serverRecoveryKeyCheck(question, instance);
      assert.deepEqual([check.checked, check.isCorrect, check.wrongRejected], [true, true, true], `${label}: certification's key check passes`);
    });
  });
}

/* ---------------------------------------------------------------------------
 * The mathematics, re-derived from what the student reads with the tools' own
 * readers — never from the family's key.
 * ------------------------------------------------------------------------- */

/** The slope and y-intercept of the line a set's cards describe, read by the sort's own reader. */
const lineOf = (set) => {
  const { m, b } = canonicalLineForSet(set);
  return { m: m.n / m.d, b: b.n / b.d };
};

for (const task of ['equationForms', 'situations']) {
  test(`${task}: every card of a set describes that set's line, one rising and one falling, each story tells its own line, and the prompt states no more than the original's`, () => {
    everyInstance(task).forEach((instance) => {
      const question = build(task, instance);
      const sets = representationSetsFor(question);
      assert.deepEqual(linearConnectionsCardKinds(question), task === 'equationForms'
        ? ['slopeIntercept', 'standard', 'pointSlope', 'graph', 'xIntercept']
        : ['context', 'slopeIntercept', 'graph', 'slope', 'yIntercept'], 'the original\'s five card kinds');
      assert.equal(buildLinearConnectionCards(sets, linearConnectionsCardKinds(question)).length, 10, 'five cards per line, as the original deals');
      sets.forEach((set) => assert.deepEqual(inconsistentLinearCardKinds(set), [], `${instance.fingerprint} ${set.id}: every card is the same line`));
      const [rising, falling] = sets.map(lineOf);
      assert.ok(rising.m > 0 && falling.m < 0, `${instance.fingerprint}: one rising, one falling`);
      if (task === 'equationForms') {
        // The prompt names exactly the two lines the cards describe, and
        // every card's numbers stay on the lesson's −6..6 grid.
        const named = [...question.prompt.replaceAll('−', '-').matchAll(/y = (-?\d*)x ([+-]) (\d+)/g)]
          .map(([, slope, sign, intercept]) => ({ m: slope === '' ? 1 : slope === '-' ? -1 : Number(slope), b: Number(`${sign}${intercept}`) }));
        assert.deepEqual(named, [rising, falling], `${question.prompt}`);
        sets.forEach((set) => assert.ok(Number.isInteger(set.xIntercept[0]), 'a whole-number x-intercept'));
      } else {
        // Each story's numbers are its line's: a start and a rate.
        const told = sets.map((set) => set.context.match(/\d+/g).map(Number));
        assert.deepEqual(told, [[rising.b, rising.m], [falling.b, -falling.m]], `${sets.map((set) => set.context).join(' / ')}`);
        assert.match(sets[0].context, /^Maya has \$\d+ saved and adds \$\d+ every week\.$/);
        assert.match(sets[1].context, /^A tub holds \d+ gallons of water and drains \d+ gallons every minute\.$/);
        assert.doesNotMatch(question.prompt, /\d/, 'the prompt gives no number');
        assert.deepEqual([question.graphBounds.xMin, question.graphBounds.yMin], [0, 0], 'a story is graphed in its own quadrant');
      }
      // The student who sorts each card to the line it describes is right.
      const slots = sets.map((set) => set.id);
      const assignments = buildLinearConnectionCards(sets, linearConnectionsCardKinds(question))
        .map((card) => ({ cardId: card.id, slot: slots.indexOf(card.setId) }));
      const browser = gradeToolWork({ toolId: 'representationMatch', question, work: { assignments } });
      assert.equal(browser.isCorrect, true);
      assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true);
    });
  });
}

test('drainingTank: the board reads the story\'s own line, each meaning has exactly one right choice, and a board built from what the student reads scores 100% on the server', () => {
  everyInstance('drainingTank').forEach((instance) => {
    const question = build('drainingTank', instance);
    const [start, rate] = question.source.prompt.match(/\d+/g).map(Number);
    assert.match(question.source.prompt, /^A tank holds \d+ liters of water\. It drains at a steady rate of \d+ liters every minute until it is empty\.$/);
    const facts = deriveLinearMultipleRepresentations(question);
    assert.equal(facts.isValid, true);
    assert.deepEqual([facts.slopeNumber, facts.yInterceptNumber, facts.zeroNumber], [-rate, start, start / rate], 'the board reads the story\'s line');
    assert.deepEqual(resolveRequiredCards(question), ['standardForm', 'slopeIntercept', 'slope', 'xIntercept', 'yIntercept', 'graphSlopeIntercept'], 'the original\'s six cards');
    assert.deepEqual(gradedContextFields(question).map(({ key }) => key), ['slopeMeaning', 'yInterceptMeaning', 'domain'], 'and its three meanings');
    assert.equal(question.feedbackTiming, 'submitOnly', 'submitted once, as the DOL is');
    // Exactly one right choice per meaning, and four different choices.
    ['slopeMeaning', 'yInterceptMeaning'].forEach((key) => {
      const { choices } = question.context[key];
      assert.equal(new Set(choices).size, 4, `${key}: four different choices`);
      assert.equal(choices.filter((choice) => validateContextField(choice, question.context[key]).valid).length, 1, `${key}: one right choice`);
    });
    const domain = question.context.domain;
    assert.equal(new Set(domain.choices).size, 4);
    assert.deepEqual(domain.choices.filter((choice) => validateDomainField(choice, domain).isCorrect), [`0 ≤ x ≤ ${start / rate}`], 'the domain runs from full to empty');
    assert.match(question.context.slopeMeaning.value, new RegExp(`loses ${rate} liters`));
    assert.match(question.context.yInterceptMeaning.value, new RegExp(`holds ${start} liters`));
    // The board the test responder builds from the question itself.
    const browser = gradeToolWork({ toolId: 'representationBridge', question, work: correctLinearBoardResponse(question) });
    assert.equal(browser.isCorrect, true);
    assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true);
    // Nothing the student must find is in what they read.
    const visible = `${question.prompt} ${question.source.prompt}`;
    assert.doesNotMatch(visible, new RegExp(`\\b${start / rate}\\b`), 'the time it runs out is the student\'s to find');
    assert.doesNotMatch(visible, /\bslope\b|\bintercept\b|y\s*=/i, 'no feature is named with its value');
  });
});

test('a written task refuses numbers it cannot tell: no story starts at or below zero or moves by 1, the equation deck keeps whole x-intercepts, the tank board is a story', () => {
  // The stories at the family's default ranges (slopes 1..3, intercepts −6..6).
  const { values } = resolveFamilyConstraints(SORT, { deck: 'situations' });
  const instances = createFamilyInstanceSequence(SORT, values, 'small-stories').exhaust(5000).instances;
  assert.ok(instances.length > 0);
  instances.forEach(({ values: drawn }) => {
    assert.ok(drawn.b1 > 0 && drawn.b2 > 0, `${drawn.b1}, ${drawn.b2}: every story starts with something`);
    assert.ok(drawn.rise >= 2 && drawn.fall >= 2, 'and changes by at least 2 a step');
  });
  const none = (family, constraints) => {
    const resolved = resolveFamilyConstraints(family, constraints);
    assert.deepEqual(resolved.issues, []);
    return createFamilyInstanceSequence(family, resolved.values, 'refused').exhaust(5000).instances.length;
  };
  assert.equal(none(SORT, { deck: 'equationForms', integerXIntercepts: false }), 0, 'the x-intercept cards need whole numbers');
  assert.equal(none(BOARD, { board: 'drainingTank', given: 'slopeIntercept' }), 0, 'the tank board tells a story');
  assert.equal(none(BOARD, { board: 'drainingTank', given: 'scenario', scenarioStart: 'fromReading' }), 0, 'a stated-start story');
  assert.equal(none(BOARD, { board: 'drainingTank', given: 'scenario' }), VERSIONS.drainingTank, 'and with a stated story, every tank version');
});

test('a version never carries a hint, a step or a worked solution', () => {
  Object.keys(VERSIONS).forEach((task) => {
    everyInstance(task).slice(0, 60).forEach((instance) => {
      const question = build(task, instance);
      ['hints', 'scaffold', 'steps', 'solution', 'workedSolution', 'solutionReview', 'guidedNotes', 'answer', 'answerKey'].forEach((name) => {
        assert.equal(question[name], undefined, `${task}: no ${name}`);
      });
    });
  });
});

/* ---------------------------------------------------------------------------
 * The families recognize the live questions they stand in for — and nothing else.
 * ------------------------------------------------------------------------- */

for (const live of LIVE) {
  test(`${live.questionId}: recognized as ${live.task} at the same rigor, with the live numbers, written exactly as the lesson writes it, leaving ${RECOVERY_MINIMUM_FRESH_VERSIONS}+ fresh versions`, () => {
    const { family, constraints } = TASKS[live.task];
    const question = questionIn(live.questionId);
    const recognized = family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints });
    const values = valuesFor(live.task);
    const rigor = familyDifficultyFor(family, values);
    assert.deepEqual([rigor.dok, rigor.band], [Number(question.dok), Number(question.difficultyBand)]);
    const primary = question.alignments.find((entry) => entry.role === 'primary').code;
    assert.ok(family.skill.alignments.includes(primary), `the family assesses ${primary}`);
    // The live problem is one of the family's own versions: which is how
    // Recovery knows never to hand it back as "fresh".
    const evaluated = evaluateFamilyCandidate(family, values, recognized.params);
    assert.equal(evaluated.valid, true, `${evaluated.issues}`);
    const rebuilt = build(live.task, evaluated.instance);
    assert.equal(rebuilt.prompt, question.prompt, 'the same prompt');
    if (family === SORT) {
      assert.deepEqual(deckOf(rebuilt), deckOf(question), 'the same deck of cards');
    } else {
      assert.deepEqual(rebuilt.source, question.source, 'the same story');
      assert.deepEqual(rebuilt.context, question.context, 'the same meanings and choices');
      assert.deepEqual(resolveRequiredCards(rebuilt), resolveRequiredCards(question), 'the same cards to build');
      assert.equal(rebuilt.feedbackTiming, question.feedbackTiming);
    }
    assert.ok(measureFamilyCapacity(family, values).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a card sort that is not exactly one of the lesson\'s decks', () => {
  const equations = questionIn('lmr-wu-1');
  const stories = questionIn('lmr-wu-2');
  assert.ok(SORT.recognize(equations) && SORT.recognize(stories), 'both decks as written are recognized');
  const refused = {
    'another deck of card kinds': mutate(equations, (q) => { q.cardKinds = ['slopeIntercept', 'standard', 'graph', 'xIntercept']; }),
    'every card kind': mutate(equations, (q) => { delete q.cardKinds; }),
    'the falling line first': mutate(equations, (q) => { q.sets.reverse(); q.prompt = 'Two different lines are hiding in these cards: y = −x + 3 and y = 2x − 4. Sort every card into the line it describes.'; }),
    'a third line': mutate(equations, (q) => { q.sets.push({ ...structuredClone(q.sets[0]), id: 'line-c' }); }),
    'a card of another line': mutate(equations, (q) => { q.sets[0].standard = '2x - y = 5'; }),
    'another point in point-slope form': mutate(equations, (q) => { q.sets[0].pointSlope = 'y - 6 = 2(x - 5)'; }),
    'a missing card': mutate(equations, (q) => { delete q.sets[1].xIntercept; }),
    'a slope outside the lesson\'s': mutate(equations, (q) => {
      q.sets[0] = { id: 'line-a', slopeIntercept: 'y = 4x - 4', standard: '4x - y = 4', pointSlope: 'y - 8 = 4(x - 3)', graphSpec: { type: 'linear', a: 4, h: 0, k: -4 }, xIntercept: [1, 0] };
      q.prompt = 'Two different lines are hiding in these cards: y = 4x − 4 and y = −x + 3. Sort every card into the line it describes.';
    }),
    'a prompt that does not name the lines': mutate(equations, (q) => { q.prompt = 'Two different lines are hiding in these cards. Sort every card into the line it describes.'; }),
    'a prompt with more mathematics': mutate(equations, (q) => { q.prompt = `${q.prompt} Both lines pass through (1, −2).`; }),
    'a find-the-mismatch task': mutate(equations, (q) => { q.task = 'findMismatch'; }),
    'another mode': mutate(equations, (q) => { q.mode = 'graphMatch'; }),
    'a story of other numbers': mutate(stories, (q) => { q.sets[0].context = 'Maya has $25 saved and adds $5 every week.'; }),
    'another story': mutate(stories, (q) => { q.sets[1].context = 'A pool holds 40 gallons of water and drains 4 gallons every minute.'; }),
    'a story deck whose prompt gives a number': mutate(stories, (q) => { q.prompt = 'One situation grows by 5 and one shrinks. Sort each card into the situation it describes.'; }),
    'a starting amount outside the lesson\'s': mutate(stories, (q) => {
      q.sets[1] = { ...q.sets[1], context: 'A tub holds 48 gallons of water and drains 4 gallons every minute.', slopeIntercept: 'y = -4x + 48', graphSpec: { type: 'linear', a: -4, h: 0, k: 48 }, yIntercept: [0, 48] };
    }),
  };
  Object.entries(refused).forEach(([why, question]) => assert.equal(SORT.recognize(question), null, why));
});

test('recognize refuses a board that is not exactly the draining-tank checkpoint', () => {
  const board = questionIn('lmr-dol-1');
  assert.ok(BOARD.recognize(board), 'the DOL as written is recognized');
  const refused = {
    'Process Mode': mutate(board, (q) => { q.interactionMode = 'process'; }),
    'other cards to build': mutate(board, (q) => { q.requiredCards = ['slopeIntercept', 'slope', 'xIntercept', 'yIntercept']; }),
    'every card': mutate(board, (q) => { delete q.requiredCards; }),
    'a meaning more': mutate(board, (q) => { q.context.xInterceptMeaning = { value: 'The tank is empty after 8 minutes.', choices: ['The tank is empty after 8 minutes.', 'The tank holds 8 liters.'] }; }),
    'a changed choice': mutate(board, (q) => { q.context.slopeMeaning.choices[3] = 'The tank leaks.'; }),
    'another story': mutate(board, (q) => { q.source.prompt = 'A pool holds 24 liters of water. It drains at a steady rate of 3 liters every minute until it is empty.'; }),
    'a story of other numbers': mutate(board, (q) => { q.source.b = 27; }),
    'numbers outside the lesson\'s': mutate(board, (q) => {
      q.source = { ...q.source, prompt: 'A tank holds 40 liters of water. It drains at a steady rate of 8 liters every minute until it is empty.', m: -8, b: 40 };
    }),
    'feedback while it is open': mutate(board, (q) => { q.feedbackTiming = 'guided'; }),
    'a prompt that gives a number': mutate(board, (q) => { q.prompt = 'The tank is empty after 8 minutes. Complete every part on the board, then submit once.'; }),
    'its own graded domain': mutate(board, (q) => { q.domain = { min: 0, max: 8 }; }),
    'meanings on the source': mutate(board, (q) => { q.source.context = q.context; }),
    'another GIVEN': mutate(board, (q) => { q.source = { kind: 'slopeIntercept', equation: 'y = -3x + 24' }; }),
  };
  Object.entries(refused).forEach(([why, question]) => assert.equal(BOARD.recognize(question), null, why));
});

test('recognize refuses the lesson\'s Classwork and Practice boards, and every question of the family-backed copy', () => {
  LESSON.questions.filter((question) => !['warmup', 'dol'].includes(question.activityRole)).forEach((question) => {
    assert.equal(BOARD.recognize(question), null, `${question.questionId} (${question.source?.kind})`);
    assert.equal(SORT.recognize(question), null, question.questionId);
  });
  const updated = compileTeacherImport(readFileSync(new URL('../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json', import.meta.url), 'utf8'));
  updated.questions.forEach((question) => {
    assert.equal(BOARD.recognize(question), null, `${question.questionId}: a family slot recovers itself`);
    assert.equal(SORT.recognize(question), null, question.questionId);
  });
});

test('the lesson\'s own Warm-Up and DOL problems are kept out of every Recovery', () => {
  const questions = flattenAssignmentQuestions(LESSON.model.assignmentV5);
  assert.deepEqual(recoveryExclusionFingerprints({ questions, families: [SORT] }).sort(), [
    'linear.representationSort:2|-4|-1|3',
    'linear.representationSort:5|20|-4|40',
  ]);
  assert.deepEqual(recoveryExclusionFingerprints({ questions, families: [BOARD] }), ['linear.multipleRepresentations:scenario|-3|1|24']);
});

/* ---------------------------------------------------------------------------
 * What the teacher sees: Prepare Recovery on a live copy.
 * ------------------------------------------------------------------------- */

const liveCopy = (id) => ({
  ...structuredClone(LESSON.model.assignmentV5),
  id,
  title: LESSON.model.assignmentV5.assignment.title,
  courseId: 'algebra1',
  assignedClassIds: ['class-a1'],
  assignmentRevision: 2,
});
const AT = '2026-11-05T15:00:00.000Z';

test('Prepare Recovery: both Warm-Up sorts and the DOL board are added from version 2; both sections become ready; no question changes', () => {
  const assignment = liveCopy('live-lmr-baseline');
  assert.equal(recoveryPreparationAvailable(assignment), true, 'the card says Recovery can be added');
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: AT });
  assert.deepEqual(report.changes.map((change) => `${change.label}:${change.questionId}:${change.action}:${change.family.id}@${change.family.version}`), [
    'Warm-Up Q1:lmr-wu-1:add:linear.representationSort@2',
    'Warm-Up Q2:lmr-wu-2:add:linear.representationSort@2',
    'DOL Q1:lmr-dol-1:add:linear.multipleRepresentations@2',
  ]);
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions} fresh versions`));
  assert.deepEqual(report.readiness, {
    warmup: { before: 'unavailable', after: 'ready', message: null },
    dol: { before: 'unavailable', after: 'ready', message: null },
  });
  assert.deepEqual(report.notReady, []);
  assert.deepEqual(report.recoveryContent, { versionBefore: 0, versionAfter: 1, bindingsBefore: 0, bindingsAfter: 3 });
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});

/* ---------------------------------------------------------------------------
 * A student who missed the Warm-Up and the DOL, after the teacher prepared them.
 * ------------------------------------------------------------------------- */

const CLASS = 'class-a1';
const DAY = '2026-11-02';
const T0 = Date.parse('2026-11-02T16:00:00Z');
const T1 = Date.parse('2026-11-04T15:00:00Z');
const BEFORE = {
  ...liveCopy('live-lmr-journey'),
  courseProfile: { course: 'algebra1', courseLevel: 'onLevel' },
  dueAt: '2026-11-03T23:59:00.000Z',
  lateDueAt: '2026-11-20T23:59:00.000Z',
  warmup: { instructionDate: DAY },
  dol: { instructionDate: DAY },
};
const PREPARED = (() => {
  const preview = buildRecoveryUpgradePreview({ assignment: BEFORE, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: new Date(T0).toISOString() });
  const applied = applyRecoveryUpgrade({ assignment: BEFORE, plan: preview.plan, planHash: preview.planHash, at: new Date(T0).toISOString(), actorUid: 'teacher-uid' });
  return { ...BEFORE, recoveryContent: applied.recoveryContent };
})();
const QUESTIONS = getStoredAssignmentQuestions(PREPARED);
const indexesOf = (section) => QUESTIONS.map((question, index) => (question.activityRole === section ? index : null)).filter((index) => index !== null);
const record = (status) => ({ status, attemptCount: 1, totalAttempts: 1, gradedBy: 'server', lastAttemptAt: new Date(T0 - 3_600_000).toISOString(), supportUsage: {} });
const MISSED = Object.fromEntries([...indexesOf('warmup'), ...indexesOf('dol')].map((index) => [index, record('expired')]));

const contextFor = (section, { assignment = PREPARED, records = {} } = {}) => {
  const questions = getStoredAssignmentQuestions(assignment);
  const original = splitGradesBySection({ tracker: MISSED, assignment })[section];
  return buildSectionRecoveryContext({
    assignment,
    section,
    sectionEntries: questions.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === section),
    questions,
    tracker: MISSED,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record: records[section] || null,
    studentId: 'student-missed-both',
    classId: CLASS,
    classPeriod: 'Period 4',
    schedule: null,
    supportEvents: [],
    overrides: null,
    sectionModeFor: () => 'shared',
    nowValue: T1,
  });
};
/** A pinned Recovery question, rebuilt as the server rebuilds it to grade it. */
const reproduce = (context, item) => {
  const reproduced = reproduceFamilyQuestionFromPin({
    question: runtimeRepairedQuestion(context.questionsByIndex[item.storageIndex]),
    assignmentId: context.assignmentId,
    storageIndex: item.storageIndex,
    pin: item.pin,
  });
  assert.ok(!reproduced.error, reproduced.error);
  return { ...reproduced, question: deliveredQuestionForGrading(reproduced.question) };
};
const LESSON_FINGERPRINTS = [
  'linear.representationSort:2|-4|-1|3',
  'linear.representationSort:5|20|-4|40',
  'linear.multipleRepresentations:scenario|-3|1|24',
];

for (const section of ['warmup', 'dol']) {
  test(`the missed ${section === 'dol' ? 'DOL' : 'Warm-Up'}: Practice and the Recovery are fresh versions of the same task, never one from the lesson, graded by the server`, () => {
    assert.deepEqual(getStoredAssignmentQuestions(BEFORE), QUESTIONS, 'the originals are the questions students answered, byte for byte');
    const unprepared = contextFor(section, { assignment: BEFORE }).eligibility;
    assert.deepEqual([unprepared.state, unprepared.reason], [RECOVERY_STATE.UNAVAILABLE, 'generation-unavailable']);
    assert.equal(contextFor(section).eligibility.state, RECOVERY_STATE.LOCKED, 'prepared: locked until Practice shows mastery');
    const seen = contextFor(section).seenFingerprints;
    LESSON_FINGERPRINTS.filter((fingerprint) => (section === 'dol') === fingerprint.startsWith('linear.multipleRepresentations'))
      .forEach((fingerprint) => assert.ok(seen.includes(fingerprint), `${fingerprint} is never dealt as fresh`));

    let records = {};
    let context = contextFor(section);
    const dealt = [];
    for (let step = 0; step < 12 && context.eligibility.state === RECOVERY_STATE.LOCKED; step += 1) {
      const item = nextRecoveryPracticeItem(context);
      assert.ok(item, 'a Practice question is dealt');
      const { question, instance } = reproduce(context, item);
      assert.equal(item.pin.familyVersion, 2);
      assert.equal(question.type, QUESTIONS[item.storageIndex].type, 'in the original\'s tool');
      const outcome = runSectionRecoveryAction({
        context,
        action: RECOVERY_ACTION.PRACTICE,
        payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: recoveryKeyResponses(question, instance).right },
        at: T1 + step * 60_000,
      });
      assert.equal(outcome.response.isCorrect, true, 'the server marks the right answer right');
      dealt.push(item.pin.fingerprint);
      records = { [section]: outcome.record };
      context = contextFor(section, { records });
    }
    assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED, 'Practice on its own unlocks it');
    assert.equal(new Set(dealt).size, dealt.length, 'no Practice question repeats');
    dealt.forEach((fingerprint) => assert.ok(!LESSON_FINGERPRINTS.includes(fingerprint), `${fingerprint} is not a problem from the lesson`));

    const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: T1 + 3_600_000 });
    const { plan } = started.record;
    // The DOL's one board once; the Warm-Up's three questions cycle through
    // its two sorts, so each original's task is recovered.
    assert.deepEqual(plan.items.map((item) => item.storageIndex), section === 'dol' ? indexesOf('dol') : [...indexesOf('warmup'), indexesOf('warmup')[0]]);
    assert.equal(new Set(plan.items.map((item) => item.pin.fingerprint)).size, plan.items.length, 'every Recovery question is a different one');
    const running = contextFor(section, { records: { [section]: started.record } });
    const responses = {};
    plan.items.forEach((item) => {
      assert.ok(!LESSON_FINGERPRINTS.includes(item.pin.fingerprint), `${item.itemId} is not a problem from the lesson`);
      assert.ok(!dealt.includes(item.pin.fingerprint), `${item.itemId} was not already practised`);
      const { question, instance } = reproduce(running, item);
      const original = QUESTIONS[item.storageIndex];
      // The same task as the original: the same cards, or the same board.
      if (question.type === 'representationMatch') assert.deepEqual(linearConnectionsCardKinds(question), linearConnectionsCardKinds(original));
      else assert.deepEqual([resolveRequiredCards(question), gradedContextFields(question)], [resolveRequiredCards(original), gradedContextFields(original)]);
      const keys = recoveryKeyResponses(question, instance);
      assert.notEqual(gradeServerResponse({ question, response: keys.wrong })?.isCorrect, true, 'one card wrong is wrong');
      responses[item.itemId] = keys.right;
    });
    const submitted = runSectionRecoveryAction({ context: running, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: T1 + 7_200_000 });
    assert.equal(submitted.record.status, 'completed');
    assert.equal(submitted.record.rawScore, 100);
  });
}

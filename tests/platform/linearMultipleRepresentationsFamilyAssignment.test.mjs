/*
 * THE FAMILY-BACKED ALGEBRA I MULTIPLE-REPRESENTATIONS ASSIGNMENT.
 *
 * docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json
 * is the baseline lesson (algebra1-linear-multiple-representations-final-v5.json,
 * kept unchanged) with every question backed by a platform Question Family:
 * the Warm-Up sorts by linear.representationSort, every board by
 * linear.multipleRepresentations. It is certified here through the chain a
 * teacher's import and publish run, and then as students meet it: delivery,
 * reload, server grading, Practice's fresh versions, Recovery and Live
 * Challenge.
 *
 * The lesson design is held to the baseline itself: each baseline question is
 * ONE DRAW of its upgraded slot — the same prompt, GIVEN, cards, story and
 * answer choices come out of the family for the baseline's own numbers. The
 * one deliberate content change is the candle's unit (inches to centimeters),
 * so every version's height is a believable candle.
 *
 * Five boards run in PROCESS MODE (interactionMode "process"): the student
 * establishes the slope, intercepts and points with a process before the
 * cards that need them open. The candle board stays a Worksheet board, so the
 * lesson shows both. Process Mode's one effect on values — a fact the GIVEN
 * hides counts as derived work — is asserted below, slot by slot and section
 * by section.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { REFERENCE_CLASS_SIZE } from '../../src/platform/preflight/questionGenerationPreflight.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { buildFamilyQuestion, evaluateFamilyCandidate } from '../../functions/shared/questionFamilyEngine.mjs';
import {
  isFamilyBackedQuestion,
  reproduceFamilyQuestionFromPin,
  resolveFamilyQuestionInstance,
  resolveQuestionFamilyDefinition,
} from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { estimateQuestionValue } from '../../functions/shared/questionValue.mjs';
import { assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { buildRecoveryAssessmentPlan } from '../../functions/shared/sectionRecoveryPlan.mjs';
import { ORIGINAL_OPPORTUNITY, RECOVERY_STATE, evaluateSectionRecoveryEligibility } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import { resolveWarmupDelivery } from '../../functions/shared/warmupDelivery.mjs';
import {
  deriveLinearMultipleRepresentations,
  givenCardForQuestion,
  resolveRequiredCards,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { buildLinearConnectionCards, linearConnectionsCardKinds, representationSetsFor } from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import { correctLinearBoardResponse, oneWrongLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const UPDATED_FILE = 'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json';
const BASELINE_FILE = 'docs/assignments/algebra1-linear-multiple-representations-final-v5.json';

/** The teacher import + publish chain (App.jsx handleCreateAssignment). */
const publish = (text, preflightOptions = {}) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), preflightOptions);
  const questions = model.isValid ? validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {}) : [];
  return { parsed, model, questions, sections: model.isValid ? rebuildV5SectionsFromQuestions(model.assignmentV5, questions) : [] };
};

const updated = publish(read(UPDATED_FILE));
const baseline = publish(read(BASELINE_FILE));
const updatedRaw = JSON.parse(read(UPDATED_FILE));
const baselineRaw = JSON.parse(read(BASELINE_FILE));
const IDS = updated.questions.map((question) => question.questionId);
const slotOf = (id) => updated.questions.find((question) => question.questionId === id);
const storageIndexOf = (id) => IDS.indexOf(id);
const baselineQuestion = (id) => baseline.questions.find((question) => question.questionId === id);
const BOARD_IDS = IDS.filter((id) => slotOf(id).type === 'representationBridge');
const SORT_IDS = IDS.filter((id) => slotOf(id).type === 'representationMatch');

/* A class of 30, seated the way the teacher app seats a class. */
const ASSIGNMENT_ID = 'asg-lmr-family';
const CLASS_ID = 'period-2';
const STUDENTS = Array.from({ length: 30 }, (_, index) => `student-${String(index + 1).padStart(2, '0')}`);
const assignment = { id: ASSIGNMENT_ID, schemaVersion: 5, assignedClassIds: [CLASS_ID], sections: updated.sections };
assignment.generationSeats = { byClassId: { [CLASS_ID]: planSeatAdditions({ assignment, classId: CLASS_ID, studentIds: STUDENTS }) } };

/** What the student app shows this student for this slot (problemGenerator.generateQuestion). */
const deliver = (id, studentId, variant = 0) => {
  const storageIndex = storageIndexOf(id);
  const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: CLASS_ID });
  const allocation = resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant });
  return generateQuestion(slotOf(id), `${ASSIGNMENT_ID}|${studentId}|${storageIndex}|variant:${variant}`, null, null, {
    assignmentId: ASSIGNMENT_ID,
    storageIndex,
    variant,
    allocation,
  });
};

/** Every distinct version a slot can produce, in order. */
const allVersions = (id) => {
  const versions = [];
  for (let index = 0; index < 400; index += 1) {
    const result = resolveFamilyQuestionInstance({ question: slotOf(id), assignmentId: ASSIGNMENT_ID, storageIndex: storageIndexOf(id), allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' } });
    if (result.error || result.delivery.wrapped) break;
    versions.push(result);
  }
  return versions;
};

/** A complete correct answer and the same answer with one part wrong, for either tool. */
const workFor = (question) => {
  if (question.type === 'representationBridge') {
    return { right: correctLinearBoardResponse(question), wrong: oneWrongLinearBoardResponse(question) };
  }
  const sets = representationSetsFor(question);
  const slot = Object.fromEntries(sets.map((set, index) => [set.id, index]));
  const assignments = buildLinearConnectionCards(sets, linearConnectionsCardKinds(question)).map((card) => ({ cardId: card.id, slot: slot[card.setId] }));
  return { right: { assignments }, wrong: { assignments: assignments.map((entry, index) => (index === 0 ? { ...entry, slot: 1 - entry.slot } : entry)) } };
};

const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

test('19/21. the family-backed file passes the real import chain and the full Pre-Flight with no errors and no warnings', () => {
  assert.deepEqual(updated.model.errors, []);
  assert.deepEqual(updated.model.warnings, []);
  assert.equal(updated.model.isValid, true);
  assert.ok(!JSON.stringify(updated.model).match(/not_a_template|template_invalid/), 'no invalid-template diagnostic anywhere');
  const slots = updated.model.questionGeneration.slots;
  assert.equal(slots.length, 8);
  for (const slot of slots) {
    assert.equal(slot.familyBacked, true, `${slot.label} is family-backed`);
    assert.equal(slot.scope, 'platform');
    assert.equal(slot.ready, true, `${slot.label} is ready`);
    assert.ok(slot.capacity >= REFERENCE_CLASS_SIZE, `${slot.label}: ${slot.capacity} distinct versions, enough for a class of ${REFERENCE_CLASS_SIZE}`);
  }
  assert.equal(updated.model.questionGeneration.notes.some((note) => /graded on the student's device/.test(note)), false, 'the server marks every question');
  for (const question of updated.questions) {
    assert.equal(isFamilyBackedQuestion(question), true, question.questionId);
    assert.equal(question.questionFamily.version, 1, `${question.questionId} pins its family version`);
  }
  // The baseline is kept, unchanged, and still passes.
  assert.deepEqual(baseline.model.errors, []);
  assert.equal(baseline.questions.some(isFamilyBackedQuestion), false);
});

test('the lesson design is the baseline\'s: sections, settings, standards, tools, cards, feedback and prompts', () => {
  const sectionShape = (section) => without(section, 'questions');
  assert.deepEqual(updatedRaw.assignment, baselineRaw.assignment);
  assert.deepEqual(updatedRaw.sections.map(sectionShape), baselineRaw.sections.map(sectionShape));
  const kept = ['questionId', 'standard', 'alignments', 'type', 'mode', 'studentActions', 'difficultyBand', 'dok', 'feedbackTiming', 'requiredCards'];
  const pick = (question) => Object.fromEntries(kept.map((key) => [key, question[key]]));
  assert.deepEqual(
    updatedRaw.sections.flatMap((section) => section.questions.map(pick)),
    baselineRaw.sections.flatMap((section) => section.questions.map(pick)),
  );
  for (const id of SORT_IDS) {
    assert.deepEqual(slotOf(id).cardKinds, baselineQuestion(id).cardKinds, `${id} deals the baseline's card kinds`);
    assert.deepEqual(slotOf(id).sets.map((set) => set.id), baselineQuestion(id).sets.map((set) => set.id));
  }
  // The board itself is unchanged: the same free-order board, no stage gating.
  for (const id of BOARD_IDS) {
    const version = deliver(id, STUDENTS[0]);
    assert.equal(version.mode, 'linearMultipleRepresentations');
    assert.equal(version.stageGating, undefined, `${id} keeps free order`);
    // The GIVEN is shown read-only, never asked for.
    const given = givenCardForQuestion(version);
    if (given) assert.equal(resolveRequiredCards(version).includes(given), false, `${id}: the GIVEN card is not a card to build`);
    assert.deepEqual(resolveRequiredCards(version), resolveRequiredCards(baselineQuestion(id)), `${id} asks for the baseline's cards`);
  }
});

// Each baseline question's numbers, as parameters of its upgraded slot.
const BASELINE_DRAW = {
  'lmr-wu-1': { rise: 2, fall: 1, b1: -4, b2: 3 },
  'lmr-wu-2': { rise: 5, fall: 4, b1: 20, b2: 40 },
  'lmr-cw-1': { p: 1, q: 2, sign: 1, b: -3, anchor: 0 },
  'lmr-cw-2': { p: 2, q: 1, sign: -1, b: 4, anchor: 0 },
  'lmr-cw-3': { p: 1, q: 1, sign: -1, b: 5, anchor: 3 },
  'lmr-pr-1': { p: 3, q: 1, sign: 1, b: -6, anchor: 0 },
  'lmr-pr-2': { rate: 2, duration: 9 },
  'lmr-dol-1': { rate: 3, duration: 8 },
};

test('each baseline question is one draw of its upgraded slot: same prompt, GIVEN, cards, story and choices', () => {
  for (const [id, params] of Object.entries(BASELINE_DRAW)) {
    const slot = slotOf(id);
    const { family, constraintValues } = resolveQuestionFamilyDefinition(slot, { slotKey: `${ASSIGNMENT_ID}|${id}` });
    const candidate = evaluateFamilyCandidate(family, constraintValues, params);
    assert.equal(candidate.valid, true, `${id}: the baseline's numbers are a valid version (${candidate.issues})`);
    const drawn = buildFamilyQuestion({ family, instance: candidate.instance, constraintValues, authored: slot });
    // The one deliberate change: the candle is measured in centimeters.
    const original = JSON.parse(JSON.stringify(baselineQuestion(id)).replaceAll('inches', 'centimeters'));
    assert.equal(drawn.prompt, original.prompt, `${id} prompt`);
    if (drawn.type === 'representationBridge') {
      assert.deepEqual(drawn.source, original.source, `${id} GIVEN`);
      assert.deepEqual(drawn.context, original.context, `${id} story choices`);
      // The window is the family's; it holds everything the baseline's did.
      const facts = deriveLinearMultipleRepresentations(original);
      for (const [x, y] of [facts.xInterceptPoint, facts.yInterceptPoint, ...(facts.sourcePoint ? [facts.sourcePoint] : [])]) {
        assert.ok(x >= drawn.graphBounds.xMin && x <= drawn.graphBounds.xMax && y >= drawn.graphBounds.yMin && y <= drawn.graphBounds.yMax, `${id}: (${x}, ${y}) is on the graph`);
      }
    } else {
      const deck = (question) => buildLinearConnectionCards(representationSetsFor(question), linearConnectionsCardKinds(question))
        .map((card) => [card.id, JSON.stringify(card.value)]);
      assert.deepEqual(deck(drawn), deck(original), `${id}: the same deck of cards`);
    }
  }
});

test('8. every student gets their own version; 7. the same one on every reload and device, and the server rebuilds exactly it', () => {
  for (const id of IDS) {
    const versions = STUDENTS.map((student) => deliver(id, student));
    const fingerprints = versions.map((version) => version.familyDelivery.fingerprint);
    assert.equal(new Set(fingerprints).size, STUDENTS.length, `${id}: ${STUDENTS.length} students, ${STUDENTS.length} different versions`);
    versions.forEach((version) => assert.equal(version.familyDelivery.basis, 'seated'));

    const student = STUDENTS[7];
    const first = deliver(id, student);
    assert.deepEqual(deliver(id, student), first, `${id}: a reload shows the same version`);
    // Another device, holding only the pin the server recorded with the
    // student's first answer, replays it through the app's own pin path.
    const storageIndex = storageIndexOf(id);
    const fromPin = generateQuestion(slotOf(id), `${ASSIGNMENT_ID}|other-device|${storageIndex}|variant:0`, null, null, {
      assignmentId: ASSIGNMENT_ID,
      storageIndex,
      variant: 0,
      pin: first.familyDelivery,
      requirePin: true,
    });
    assert.deepEqual(fromPin, first, `${id}: another device replays the pin to the same version`);

    const forGrading = resolveServerGradingQuestion({ assignment, question: slotOf(id), questionIndex: storageIndexOf(id), variantIndex: 0, claimedDelivery: first.familyDelivery, studentId: student, classId: CLASS_ID });
    assert.equal(forGrading.familyBacked, true);
    assert.ok(forGrading.question, `${id}: ${forGrading.reason}`);
    assert.equal(forGrading.question.familyInstance.fingerprint, first.familyDelivery.fingerprint, `${id}: the server marks the version the student saw`);
    const { right, wrong } = workFor(first);
    const browser = gradeToolWork({ toolId: first.type, question: first, work: right });
    assert.equal(browser.isCorrect, true, `${id}: the browser credits a correct answer`);
    assert.equal(gradeServerResponse({ question: forGrading.question, response: browser.toolResponse }).isCorrect, true, `${id}: and so does the server`);
    const wrongBrowser = gradeToolWork({ toolId: first.type, question: first, work: wrong });
    assert.equal(gradeServerResponse({ question: forGrading.question, response: wrongBrowser.toolResponse }).isCorrect, false, `${id}: a wrong answer is not credited`);
    // A classmate's pin does not unlock this student's grade.
    const classmate = deliver(id, STUDENTS[8]);
    const stolen = resolveServerGradingQuestion({ assignment, question: slotOf(id), questionIndex: storageIndexOf(id), variantIndex: 0, claimedDelivery: classmate.familyDelivery, studentId: student, classId: CLASS_ID });
    assert.notEqual(stolen.question?.familyInstance?.fingerprint, classmate.familyDelivery.fingerprint, `${id}: a classmate's pin is refused`);
  }
});

test('every version of every slot is valid, 100% gradable on the browser and server paths, and refuses a wrong answer', () => {
  for (const id of IDS) {
    const versions = allVersions(id);
    assert.ok(versions.length >= REFERENCE_CLASS_SIZE, `${id}: ${versions.length} versions`);
    for (const { question, delivery } of versions) {
      const label = `${id} ${delivery.fingerprint}`;
      assert.equal(JSON.stringify(question).includes('{{'), false, `${label}: no token reaches a student`);
      assert.deepEqual(validateToolQuestion({ ...question, toolId: question.type }).errors, [], label);
      assert.deepEqual(validateQuestionSemantics(question).errors, [], label);
      const { right, wrong } = workFor(question);
      const browser = gradeToolWork({ toolId: question.type, question, work: right });
      assert.equal(browser.isCorrect, true, label);
      assert.equal(browser.score, 1, label);
      assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true, label);
      assert.equal(gradeToolWork({ toolId: question.type, question, work: wrong }).isCorrect, false, label);
    }
  }
});

// PROCESS MODE is the one deliberate change to the lesson's values. On five
// boards (interactionMode "process") a key fact the GIVEN hides is derived
// with shown work, and counts as that work (questionValue.mjs: "a fact the
// GIVEN hides is shown work"); a fact the GIVEN shows is still read, worth
// what it was. The candle board stays a Worksheet board and keeps its value.
const PROCESS_SLOTS = ['lmr-cw-1', 'lmr-cw-2', 'lmr-cw-3', 'lmr-pr-1', 'lmr-dol-1'];
const expectedValueOf = (id) => (slotOf(id).interactionMode === 'process'
  ? estimateQuestionValue({ ...baselineQuestion(id), interactionMode: 'process' }).value
  : baselineQuestion(id).questionWeight);

test('9/11/13. every version of a slot counts the slot\'s automatic value: the baseline\'s value for the same work', () => {
  assert.deepEqual(IDS.filter((id) => slotOf(id).interactionMode === 'process'), PROCESS_SLOTS);
  assert.equal(slotOf('lmr-pr-2').interactionMode, 'worksheet', 'the candle board is a Worksheet board, said explicitly');
  for (const id of IDS) {
    const slot = slotOf(id);
    assert.equal(slot.questionWeightBasis?.source, 'auto', `${id}: the value was set automatically at import`);
    assert.equal(slot.questionWeight, expectedValueOf(id), `${id}: the baseline question's value for the same work`);
    // Process Mode never inflates a board: a derived fact adds what shown
    // work adds, a read fact adds nothing, and nothing is counted twice.
    const increase = slot.questionWeight - baselineQuestion(id).questionWeight;
    assert.ok(increase >= 0 && increase <= 0.5, `${id}: ${increase} more than the Worksheet board`);
    if (id === 'lmr-cw-2') assert.equal(increase, 0, 'y = mx + b SHOWS its slope and y-intercept: reading them is worth what typing them was');
    const values = new Set();
    for (const { question } of allVersions(id)) {
      assert.equal(question.questionWeight, slot.questionWeight, `${id}: a version carries its slot's value`);
      assert.deepEqual(question.questionWeightBasis, slot.questionWeightBasis);
      values.add(estimateQuestionValue(question).value);
    }
    assert.deepEqual([...values], [slot.questionWeight], `${id}: every version asks the same work, worth the slot's value`);
  }
  assert.deepEqual(updated.model.questionValues.errors, []);
  assert.deepEqual(updated.model.questionValues.warnings, []);
  // Each section's total moves by exactly its boards' Process Mode values.
  const increaseIn = (role) => IDS.filter((id) => slotOf(id).activityRole === role)
    .reduce((sum, id) => sum + slotOf(id).questionWeight - baselineQuestion(id).questionWeight, 0);
  updated.model.questionValues.sections.forEach((section, index) => {
    const before = baseline.model.questionValues.sections[index];
    assert.equal(section.role, before.role);
    assert.equal(section.questions, before.questions);
    assert.equal(section.total, before.total + increaseIn(section.role), `${section.role} total`);
  });
});

test('Practice gives fresh versions: "New Question" is never one the student has had, nor a classmate\'s while unused versions remain', () => {
  for (const id of IDS.filter((questionId) => slotOf(questionId).activityRole === 'practice')) {
    const firstVersions = new Set(STUDENTS.map((student) => deliver(id, student).familyDelivery.fingerprint));
    let unwrapped = 0;
    for (const student of STUDENTS) {
      const own = [deliver(id, student).familyDelivery.fingerprint];
      for (let variant = 1; variant <= 4; variant += 1) {
        const fresh = deliver(id, student, variant);
        assert.equal(fresh.familyDelivery.variant, variant);
        assert.equal(own.includes(fresh.familyDelivery.fingerprint), false, `${id}: ${student}'s question ${variant + 1} is one they have not had`);
        if (!fresh.familyDelivery.wrapped) {
          unwrapped += 1;
          assert.equal(firstVersions.has(fresh.familyDelivery.fingerprint), false, `${id}: while the family has unused versions, a new question is nobody's first question`);
        }
        assert.equal(fresh.questionWeight, slotOf(id).questionWeight, 'and is worth the same');
        own.push(fresh.familyDelivery.fingerprint);
      }
    }
    assert.ok(unwrapped > 0, `${id}: some new questions come from versions nobody has had`);
  }
});

const sectionEntries = (role) => updated.questions
  .map((question, storageIndex) => ({ question, storageIndex }))
  .filter((entry) => entry.question.activityRole === role);

test('22. DOL Recovery is ready, and a student\'s Recovery is a fresh, equivalent, server-graded version of the same board', () => {
  assert.equal(updated.model.questionGeneration.recovery.dol.status, 'ready');
  const readiness = assessSectionRecoveryReadiness({ assignmentId: ASSIGNMENT_ID, section: 'dol', entries: sectionEntries('dol') });
  assert.equal(readiness.ready, true);
  const [dolId] = IDS.filter((id) => slotOf(id).activityRole === 'dol');
  for (const student of STUDENTS.slice(0, 6)) {
    const original = deliver(dolId, student);
    const seatInfo = resolveLearnerSeat({ assignment, studentId: student, classId: CLASS_ID });
    const plan = buildRecoveryAssessmentPlan({
      assignmentId: ASSIGNMENT_ID,
      section: 'dol',
      readySlots: readiness.readySlots,
      questionsByIndex: Object.fromEntries(sectionEntries('dol').map((entry) => [entry.storageIndex, entry.question])),
      seatInfo,
      seenFingerprints: [original.familyDelivery.fingerprint],
    });
    assert.equal(plan.error, null);
    assert.equal(plan.items.length, 1, 'one fresh version of the one DOL question');
    const [item] = plan.items;
    const rebuilt = reproduceFamilyQuestionFromPin({ question: slotOf(dolId), assignmentId: ASSIGNMENT_ID, storageIndex: item.storageIndex, pin: item.pin });
    assert.equal(rebuilt.error, null, 'the server can rebuild the Recovery question from its pin');
    const recovery = rebuilt.question;
    assert.notEqual(item.pin.fingerprint, original.familyDelivery.fingerprint, `${student}: not the DOL they already took`);
    assert.equal(item.familyId, 'linear.multipleRepresentations');
    // Equivalent: the same board, the same cards, the same meanings, the same value.
    assert.deepEqual(resolveRequiredCards(recovery), resolveRequiredCards(original));
    assert.deepEqual(Object.keys(recovery.context), Object.keys(original.context));
    assert.equal(recovery.source.kind, 'scenario');
    assert.equal(recovery.questionWeight, original.questionWeight);
    assert.equal(estimateQuestionValue(recovery).value, estimateQuestionValue(original).value);
    const browser = gradeToolWork({ toolId: 'representationBridge', question: recovery, work: correctLinearBoardResponse(recovery) });
    assert.equal(gradeServerResponse({ question: recovery, response: browser.toolResponse }).isCorrect, true, 'graded by the server');
    assert.equal(gradeToolWork({ toolId: 'representationBridge', question: recovery, work: oneWrongLinearBoardResponse(recovery) }).isCorrect, false);
  }
});

test('Process Mode: a version\'s facts come only from its own process — typed facts earn nothing, another version\'s process establishes nothing, Recovery starts clean', () => {
  const partOf = (result, id) => result.parts.find((part) => part.id === id);
  for (const id of PROCESS_SLOTS) {
    const mine = deliver(id, STUDENTS[3]);
    const theirs = deliver(id, STUDENTS[4]);
    assert.equal(mine.interactionMode, 'process', `${id}: the version keeps its slot's mode`);
    assert.notEqual(mine.familyDelivery.fingerprint, theirs.familyDelivery.fingerprint);
    const right = correctLinearBoardResponse(mine);
    // Every key fact typed into its box, and no process: no fact is credited,
    // and no card a fact would open holds anything.
    const { processLog: _ignored, ...typedOnly } = right;
    const typed = gradeToolWork({ toolId: 'representationBridge', question: mine, work: typedOnly });
    assert.equal(typed.isCorrect, false, `${id}: typing a fact is not establishing it`);
    for (const fact of ['slope', 'xIntercept', 'yIntercept']) {
      if (partOf(typed, fact)) assert.equal(partOf(typed, fact).isCorrect, false, `${id}: ${fact} was typed, not established`);
    }
    // A classmate's correct process, on this student's version: it was
    // written for another line, so it establishes nothing here.
    const borrowed = gradeToolWork({ toolId: 'representationBridge', question: mine, work: { ...right, processLog: correctLinearBoardResponse(theirs).processLog } });
    assert.equal(borrowed.isCorrect, false, `${id}: another version's process is not this version's`);
    const server = gradeServerResponse({ question: mine, response: borrowed.toolResponse });
    assert.equal(server.isCorrect, false);
    assert.equal(server.detail?.stale, true, `${id}: the server sees the process belongs to another version`);
    assert.deepEqual(server.detail?.facts, []);
    // Its own process, on the server: every fact verified, with its method.
    const own = gradeServerResponse({ question: mine, response: gradeToolWork({ toolId: 'representationBridge', question: mine, work: right }).toolResponse });
    assert.equal(own.isCorrect, true, id);
    assert.ok(own.detail.facts.length >= 2 && own.detail.facts.every((fact) => fact.verified && fact.method), `${id}: ${JSON.stringify(own.detail.facts)}`);
  }
  // A DOL Recovery is a fresh version: the original's process is no help on it.
  const readiness = assessSectionRecoveryReadiness({ assignmentId: ASSIGNMENT_ID, section: 'dol', entries: sectionEntries('dol') });
  const [dolId] = IDS.filter((id) => slotOf(id).activityRole === 'dol');
  const student = STUDENTS[11];
  const original = deliver(dolId, student);
  const plan = buildRecoveryAssessmentPlan({
    assignmentId: ASSIGNMENT_ID,
    section: 'dol',
    readySlots: readiness.readySlots,
    questionsByIndex: Object.fromEntries(sectionEntries('dol').map((entry) => [entry.storageIndex, entry.question])),
    seatInfo: resolveLearnerSeat({ assignment, studentId: student, classId: CLASS_ID }),
    seenFingerprints: [original.familyDelivery.fingerprint],
  });
  const recovery = reproduceFamilyQuestionFromPin({ question: slotOf(dolId), assignmentId: ASSIGNMENT_ID, storageIndex: plan.items[0].storageIndex, pin: plan.items[0].pin }).question;
  assert.equal(recovery.interactionMode, 'process', 'Recovery keeps Process Mode');
  const carried = gradeToolWork({ toolId: 'representationBridge', question: recovery, work: { ...correctLinearBoardResponse(recovery), processLog: correctLinearBoardResponse(original).processLog } });
  assert.equal(carried.isCorrect, false, 'the original DOL\'s process establishes nothing on the Recovery version');
  assert.equal(gradeServerResponse({ question: recovery, response: carried.toolResponse }).detail?.stale, true);
});

test('Warm-Up Recovery works for the family-backed Warm-Up: fresh sorts the student has not seen, server-graded', () => {
  assert.equal(updated.model.questionGeneration.recovery.warmup.status, 'ready');
  const readiness = assessSectionRecoveryReadiness({ assignmentId: ASSIGNMENT_ID, section: 'warmup', entries: sectionEntries('warmup') });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.readySlots.length, 2);
  const student = STUDENTS[3];
  const seen = SORT_IDS.map((id) => deliver(id, student).familyDelivery.fingerprint);
  const plan = buildRecoveryAssessmentPlan({
    assignmentId: ASSIGNMENT_ID,
    section: 'warmup',
    readySlots: readiness.readySlots,
    questionsByIndex: Object.fromEntries(sectionEntries('warmup').map((entry) => [entry.storageIndex, entry.question])),
    questionCount: 3,
    seatInfo: resolveLearnerSeat({ assignment, studentId: student, classId: CLASS_ID }),
    seenFingerprints: seen,
  });
  assert.equal(plan.error, null);
  assert.equal(plan.items.length, 3);
  const fingerprints = plan.items.map((item) => item.pin.fingerprint);
  assert.equal(new Set(fingerprints).size, 3, 'three different questions');
  fingerprints.forEach((fingerprint) => assert.equal(seen.includes(fingerprint), false, 'none the student has seen'));
  for (const item of plan.items) {
    const { question } = reproduceFamilyQuestionFromPin({ question: updated.questions[item.storageIndex], assignmentId: ASSIGNMENT_ID, storageIndex: item.storageIndex, pin: item.pin });
    const { right } = workFor(question);
    const browser = gradeToolWork({ toolId: 'representationMatch', question, work: right });
    assert.equal(gradeServerResponse({ question, response: browser.toolResponse }).isCorrect, true);
  }
});

test('a Live Challenge Warm-Up never generates a Warm-Up Recovery; the DOL Recovery is unaffected', () => {
  const live = publish(read(UPDATED_FILE));
  const liveAssignment = { ...live.model.assignmentV5, warmup: { liveChallenge: { enabled: true, deliveryMode: 'liveChallenge' } } };
  const model = buildAssignmentV5PreflightModel(liveAssignment, {});
  assert.deepEqual(model.errors, []);
  assert.equal(model.questionGeneration.recovery.warmup.status, 'liveChallenge');
  assert.ok(model.questionGeneration.notes.some((note) => /delivered by Live Challenge[\s\S]*will not generate a Warm-Up Recovery/.test(note)));
  assert.equal(model.questionGeneration.recovery.dol.status, 'ready', 'the DOL still has its Recovery');

  // At runtime: a student who played the Live Challenge is never offered a
  // Warm-Up Recovery, even with an empty Warm-Up score and a closed window.
  const readiness = assessSectionRecoveryReadiness({ assignmentId: ASSIGNMENT_ID, section: 'warmup', entries: sectionEntries('warmup') });
  const inputs = {
    section: 'warmup',
    original: { score: 0, attempted: 0, total: 2 },
    opportunity: { status: ORIGINAL_OPPORTUNITY.CLOSED },
    readiness,
  };
  const viaChallenge = evaluateSectionRecoveryEligibility({ ...inputs, warmupDelivery: resolveWarmupDelivery({ assignment: liveAssignment }) });
  assert.equal(viaChallenge.state, RECOVERY_STATE.HIDDEN);
  assert.equal(viaChallenge.reason, 'warmup-delivered-by-live-challenge');
  const viaQuestions = evaluateSectionRecoveryEligibility({ ...inputs, warmupDelivery: resolveWarmupDelivery({ assignment: live.model.assignmentV5 }) });
  assert.notEqual(viaQuestions.reason, 'warmup-delivered-by-live-challenge', 'the same Warm-Up delivered as questions does reach Recovery');
});

test('no version hands over an answer: prompts and stories show only the GIVEN, and no key travels with the question', () => {
  const KEY_FIELDS = ['answer', 'answers', 'answerKey', 'correctAnswer', 'generatedAnswer', 'solution', 'solutions', 'steps', 'hint', 'hints', 'workedSolution', 'explanation'];
  for (const id of IDS) {
    for (const { question, instance } of allVersions(id)) {
      for (const field of KEY_FIELDS) assert.equal(question[field], undefined, `${id}: no ${field}`);
      if (question.type !== 'representationBridge') continue;
      const facts = deriveLinearMultipleRepresentations(question);
      const visible = `${question.prompt} ${question.source.prompt || ''}`.replaceAll('−', '-');
      const zero = facts.zeroNumber;
      assert.doesNotMatch(visible, new RegExp(`\\(\\s*${zero}\\s*,\\s*0\\s*\\)`), `${id}: the x-intercept is the student's to find`);
      assert.doesNotMatch(visible, /\bslope (is|of)\b|\bx-intercept\b|\by-intercept\b/i, `${id}: no feature is named with its value`);
      if (question.source.kind === 'scenario') {
        assert.doesNotMatch(visible, new RegExp(`\\b${instance.values.duration}\\b`), `${id}: the time it runs out is the student's to find`);
      } else if (question.source.kind !== 'slopeIntercept') {
        assert.doesNotMatch(visible, /y\s*=\s*-?[\d/]*x/, `${id}: the slope-intercept form is the student's to write`);
      }
    }
  }
});

test('12. recompiling or re-importing the stored assignment changes nothing: same families, same values, nothing added', () => {
  const again = publish(JSON.stringify(updated.model.assignmentV5));
  assert.deepEqual(again.model.errors, []);
  const pick = ({ questionId, questionFamily, questionWeight, questionWeightBasis, prompt, source, context, sets, cardKinds, requiredCards }) => (
    { questionId, questionFamily, questionWeight, questionWeightBasis, prompt, source, context, sets, cardKinds, requiredCards }
  );
  assert.deepEqual(again.questions.map(pick), updated.questions.map(pick));
  const thrice = publish(JSON.stringify(again.model.assignmentV5));
  assert.deepEqual(thrice.questions.map(pick), updated.questions.map(pick), 'and a third pass is the same fixed point');
  // A version delivered from the first import replays against the re-import.
  const delivered = deliver('lmr-dol-1', STUDENTS[2]);
  const replay = reproduceFamilyQuestionFromPin({ question: again.questions[storageIndexOf('lmr-dol-1')], assignmentId: ASSIGNMENT_ID, storageIndex: storageIndexOf('lmr-dol-1'), pin: delivered.familyDelivery });
  assert.equal(replay.error, null);
  assert.equal(replay.delivery.fingerprint, delivered.familyDelivery.fingerprint);
});

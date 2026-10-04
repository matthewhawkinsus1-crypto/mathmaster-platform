/*
 * WHICH RECIPE AN ASSIGNMENT GETS — AND WHEN IT GETS NONE.
 *
 * PR #423's rules, held for every recipe now that the registry has more than
 * one:
 *
 *   - the assignment's CONCEPT chooses the content (its core family);
 *   - the assignment's COURSE chooses the course, checked against the TEKS of
 *     its anchor questions; the destination Honors class never changes the
 *     mathematics;
 *   - no recipe, an unsupported course, or a course/TEKS conflict → a
 *     structured "unavailable" and NO question: the assignment is unchanged;
 *   - two recipes can never compete for one anchor and course without an
 *     explicit selection rule, so a growing registry cannot make selection
 *     depend on the order recipes were listed.
 *
 * And the paths beside it stay as they were: the AI Honors repair never
 * consults the recipes, a MathMaster depth extension never earns CCMR credit,
 * and swapping any recipe's extension keeps student history attached.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HONORS_RECIPE_REGISTRY,
  HONORS_RECIPE_STATUS,
  HONORS_RECIPE_UNAVAILABLE,
  assertDeterministicHonorsRegistry,
  buildDeterministicHonorsExtension,
  defineHonorsRecipe,
  describeHonorsExtension,
  describeHonorsRecipeForTeacher,
  findCompetingHonorsRecipes,
  resolveHonorsAnchor,
  selectHonorsExtensionRecipe,
  withHonorsExtension,
} from '../../src/platform/rigor/honorsExtensionRecipes.js';
import {
  HONORS_SWAP_MODE,
  honorsExtensionActionFor,
  planHonorsExtensionSwap,
  withAppendedQuestionSections,
} from '../../src/platform/rigor/honorsExtensionSwap.js';
import { buildHonorsCoverageReport, HONORS_COVERAGE_STATUS } from '../../src/platform/rigor/honorsRecipeCoverage.js';
import { honorsUnavailableReason } from '../../src/platform/rigor/honorsRecipeBacklog.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { separateHonorsDepthAiRepair } from '../../src/platform/contract/honorsDepthAiRepair.js';
import { describeQuestionSupersession, findSupersessionConflicts, planQuestionInclusion } from '../../src/platform/assignments/questionSupersession.js';
import { projectCurrentAssignmentContent } from '../../src/platform/assignments/currentContentProjection.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { executableSource } from './helpers/sourceContract.mjs';
import { preflightEditorCandidate } from './helpers/honorsExtensionFixtures.mjs';
import { anchorLessonFor, anchorLessonV5For, lessonTeksFor } from './helpers/honorsRecipeLessons.mjs';

const SERVED = HONORS_RECIPE_REGISTRY.flatMap((recipe) => recipe.anchor.familyIds.flatMap((familyId) => (
  recipe.supportedCourses.map((courseId) => ({ recipe, familyId, courseId, label: `${recipe.id} ← ${familyId} (${courseId})` }))
)));
const OTHER_COURSE = Object.freeze({ algebra1: 'algebra2', algebra2: 'algebra1' });
const snapshot = (value) => JSON.parse(JSON.stringify(value));

const relabel = (questions, code) => questions.map((question) => (
  question.questionFamily || question.type === 'representationBridge'
    ? { ...question, standard: code, alignments: [{ framework: 'teks', code, role: 'primary' }] }
    : question
));

/* ------------------------------ course leaks ------------------------------ */

test('13–14. a recipe never reaches a lesson of the other course, a course/TEKS conflict, or an unknown course — and none of them is mutated', () => {
  for (const served of SERVED) {
    const other = OTHER_COURSE[served.courseId];
    // A lesson on the same concept, honestly taught in the other course.
    const otherLesson = anchorLessonFor(served.familyId, other);
    const before = snapshot(otherLesson);
    const refused = buildDeterministicHonorsExtension({ questions: otherLesson, assignmentCourseId: other, destinationCourseId: served.courseId });
    assert.equal(refused.status, HONORS_RECIPE_STATUS.UNAVAILABLE, served.label);
    assert.equal(refused.code, HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED, served.label);
    assert.equal(refused.question, null, `${served.label}: no question`);
    assert.deepEqual(otherLesson, before, `${served.label}: nothing mutated`);

    // The course label and the anchor's TEKS disagree, in either direction.
    const lesson = anchorLessonFor(served.familyId, served.courseId);
    const mislabelled = buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: other });
    assert.equal(mislabelled.code, HONORS_RECIPE_UNAVAILABLE.COURSE_CONFLICT, served.label);
    assert.equal(mislabelled.question, null);
    const wrongTeks = buildDeterministicHonorsExtension({ questions: relabel(lesson, lessonTeksFor(served.familyId, other)), assignmentCourseId: served.courseId });
    assert.equal(wrongTeks.code, HONORS_RECIPE_UNAVAILABLE.COURSE_CONFLICT, served.label);

    // An unknown course is never guessed into one.
    assert.equal(buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: 'geometry' }).code, HONORS_RECIPE_UNAVAILABLE.COURSE_UNKNOWN);
    // With no course set, the TEKS decide — and they agree with the recipe.
    assert.equal(buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: null }).status, HONORS_RECIPE_STATUS.READY, served.label);
  }
});

test('the destination Honors class never changes the mathematics: only a note says the profile disagrees', () => {
  for (const served of SERVED) {
    const lesson = anchorLessonFor(served.familyId, served.courseId);
    const plain = buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: served.courseId });
    const elsewhere = buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: served.courseId, destinationCourseId: OTHER_COURSE[served.courseId] });
    assert.deepEqual(elsewhere.question, plain.question, `${served.label}: the same question`);
    assert.equal(elsewhere.courseId, served.courseId);
    assert.equal(elsewhere.notes.length, 1, `${served.label}: the teacher is told`);
    assert.doesNotMatch(JSON.stringify(elsewhere.question), served.courseId === 'algebra1' ? /Algebra II|algebra2|\bA2\./ : /\bA\.\d/);
  }
});

test('13–14. an Algebra II recipe could never reach an Algebra I lesson either — and would reach an Algebra II one', () => {
  for (const served of SERVED.filter((entry) => entry.courseId === 'algebra1')) {
    const algebra2 = defineHonorsRecipe({
      ...served.recipe,
      id: `${served.recipe.id}.algebra2Test`,
      supportedCourses: ['algebra2'],
      question: { ...served.recipe.question, standard: 'A2.2A', alignments: [{ framework: 'teks', code: 'A2.2A', role: 'primary' }] },
    });
    const algebra1Lesson = anchorLessonFor(served.familyId, 'algebra1');
    const refused = buildDeterministicHonorsExtension({ questions: algebra1Lesson, assignmentCourseId: 'algebra1', destinationCourseId: 'algebra2', registry: [algebra2] });
    assert.equal(refused.code, HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED, served.label);
    assert.equal(refused.question, null);
    const algebra2Lesson = anchorLessonFor(served.familyId, 'algebra2');
    const ready = buildDeterministicHonorsExtension({ questions: algebra2Lesson, assignmentCourseId: 'algebra2', registry: [algebra2] });
    assert.equal(ready.status, HONORS_RECIPE_STATUS.READY, served.label);
    assert.equal(ready.question.honorsEnrichment.courseId, 'algebra2');
    assert.ok(ready.question.alignments.every((entry) => entry.code.startsWith('A2.')), `${served.label}: Algebra II TEKS only`);
  }
});

/* --------------------------- unsupported → nothing --------------------------- */

test('15. every concept and course without a READY recipe gets a structured "unavailable", no question, a plain reason, and no mutation', () => {
  const report = buildHonorsCoverageReport();
  let checked = 0;
  for (const [courseId, course] of Object.entries(report.courses)) {
    for (const row of course.families.filter((entry) => entry.status !== HONORS_COVERAGE_STATUS.READY)) {
      const lesson = anchorLessonFor(row.familyId, courseId);
      const lessonV5 = anchorLessonV5For(row.familyId, courseId);
      const before = snapshot(lesson);
      const result = buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: courseId, destinationCourseId: courseId });
      const label = `${row.familyId} (${courseId})`;
      assert.equal(result.status, HONORS_RECIPE_STATUS.UNAVAILABLE, label);
      assert.equal(result.question, null, `${label}: no free-response or any other substitute`);
      assert.match(result.teacherMessage, /left unchanged/, label);
      assert.deepEqual(lesson, before, `${label}: the questions passed in are not mutated`);
      // The caller's candidate is the assignment itself when there is no question.
      assert.equal(withHonorsExtension(lessonV5, result.question), lessonV5, `${label}: nothing added`);
      const reason = honorsUnavailableReason(row.familyId, courseId);
      if (result.code === HONORS_RECIPE_UNAVAILABLE.NO_VETTED_RECIPE || result.code === HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED) {
        assert.ok(reason, `${label}: the audit has a plain reason`);
        assert.ok(result.teacherMessage.includes(reason), `${label}: and the teacher reads it`);
      }
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `every unsupported family and course was exercised (${checked})`);
});

/* ------------------------- deterministic selection ------------------------- */

test('selection stays deterministic as the registry grows: no unresolved competition, and order never decides', () => {
  assert.deepEqual(findCompetingHonorsRecipes(HONORS_RECIPE_REGISTRY), [], 'every (anchor, course) has exactly one recipe');
  const orders = [
    [...HONORS_RECIPE_REGISTRY],
    [...HONORS_RECIPE_REGISTRY].reverse(),
    [...HONORS_RECIPE_REGISTRY.slice(2), ...HONORS_RECIPE_REGISTRY.slice(0, 2)],
  ];
  for (const served of SERVED) {
    const lesson = anchorLessonFor(served.familyId, served.courseId);
    const chosen = orders.map((registry) => selectHonorsExtensionRecipe({ questions: lesson, assignmentCourseId: served.courseId, registry }).recipe?.id);
    assert.deepEqual(chosen, orders.map(() => served.recipe.id), `${served.label}: the same recipe in any registry order`);
  }

  // A second recipe on the same anchor and course, with no selection rule.
  const [first] = SERVED;
  const competitor = defineHonorsRecipe({ ...first.recipe, id: `${first.recipe.id}.competitor` });
  assert.throws(() => assertDeterministicHonorsRegistry([...HONORS_RECIPE_REGISTRY, competitor]), /compete for the same anchor and course without a selection rule/);
  const lesson = anchorLessonFor(first.familyId, first.courseId);
  const before = snapshot(lesson);
  const ambiguous = buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: first.courseId, registry: [...HONORS_RECIPE_REGISTRY, competitor] });
  assert.equal(ambiguous.status, HONORS_RECIPE_STATUS.UNAVAILABLE);
  assert.equal(ambiguous.code, HONORS_RECIPE_UNAVAILABLE.AMBIGUOUS);
  assert.equal(ambiguous.question, null);
  assert.deepEqual(lesson, before);
  assert.throws(() => assertDeterministicHonorsRegistry([first.recipe, first.recipe]), /ids must be unique/);

  // With an explicit rule, the higher priority wins whatever the order.
  const preferred = defineHonorsRecipe({ ...first.recipe, id: `${first.recipe.id}.preferred`, selection: { priority: 2 } });
  const baseline = defineHonorsRecipe({ ...first.recipe, id: `${first.recipe.id}.baseline`, selection: { priority: 1 } });
  assert.doesNotThrow(() => assertDeterministicHonorsRegistry([preferred, baseline]));
  for (const registry of [[preferred, baseline], [baseline, preferred]]) {
    assert.equal(selectHonorsExtensionRecipe({ questions: lesson, assignmentCourseId: first.courseId, registry }).recipe.id, preferred.id);
  }
  // Equal priorities are no rule at all.
  const tie = defineHonorsRecipe({ ...first.recipe, id: `${first.recipe.id}.tie`, selection: { priority: 2 } });
  assert.throws(() => assertDeterministicHonorsRegistry([preferred, tie]), /without a selection rule/);
});

test('Pre-Flight tells the teacher which tool the extension uses — the lesson\'s own only when it really is', () => {
  for (const served of SERVED) {
    const selection = selectHonorsExtensionRecipe({ questions: anchorLessonFor(served.familyId, served.courseId), assignmentCourseId: served.courseId });
    const sentence = describeHonorsRecipeForTeacher(selection);
    assert.match(sentence, /the Multiple Representations board/, served.label);
    assert.match(sentence, new RegExp(`at DOK ${served.recipe.rigor.dok} where the lesson works at DOK ${served.recipe.rigor.baseline.dok}`), served.label);
    assert.match(sentence, /a different version for every student/);
    assert.match(sentence, /does not change the existing questions/);
    const ownTool = served.familyId === served.recipe.target.familyId;
    assert.equal(/the lesson's own tool/.test(sentence), ownTool, `${served.label}: "the lesson's own tool" only for a lesson on that tool`);
  }
  const modal = executableSource(readFileSync(new URL('../../src/components/teacher/LessonPreflightModal.jsx', import.meta.url), 'utf8'));
  assert.match(modal, /import\s*\{[^}]*describeHonorsRecipeForTeacher[^}]*\}\s*from\s*'..\/..\/platform\/rigor\/honorsExtensionRecipes\.js'/);
  assert.match(modal, /localHonorsRecipe\.status === 'ready'\s*\?\s*describeHonorsRecipeForTeacher\(localHonorsRecipe\)\s*:\s*localHonorsRecipe\.teacherMessage/);
});

test('a hand-authored card sort anchors the same concept as the family-drawn one', () => {
  const sort = anchorLessonFor('linear.representationSort', 'algebra1').map((question) => (
    question.questionFamily?.id === 'linear.representationSort'
      ? { ...question, questionFamily: undefined, type: 'representationMatch', mode: 'linearConnections', task: 'group' }
      : question
  ));
  assert.equal(resolveHonorsAnchor(sort).familyId, 'linear.representationSort');
  assert.equal(selectHonorsExtensionRecipe({ questions: sort, assignmentCourseId: 'algebra1' }).recipe.id, 'honors.linear.representationSort.buildFromReading');
});

/* ------------------------------ paths beside it ------------------------------ */

test('17. the AI Honors path is unchanged: it never consults the recipes, and its extensions are never treated as recipe extensions', () => {
  const aiSource = executableSource(readFileSync(new URL('../../src/platform/contract/honorsDepthAiRepair.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(aiSource, /honorsExtension(?:Recipes|Swap)|honorsRecipe(?:Backlog|Coverage)|questionSupersession/, 'the AI repair imports no recipe module');
  for (const served of SERVED) {
    const lessonV5 = anchorLessonV5For(served.familyId, served.courseId);
    const aiQuestion = { questionId: 'ai-ext', type: 'multiAnswer', activityRole: 'classwork', prompt: 'AI-written extension.', honorsEnrichment: { generatedBy: 'MathMaster AI' } };
    const candidate = withHonorsExtension(lessonV5, aiQuestion);
    const separated = separateHonorsDepthAiRepair(lessonV5, candidate);
    assert.equal(separated.honorsEnrichmentQuestion.questionId, 'ai-ext', `${served.label}: the AI's extension is returned as written`);
    assert.equal(separated.honorsEnrichmentQuestion.prompt, aiQuestion.prompt);
    const described = describeHonorsExtension(aiQuestion);
    assert.equal(described.isHonorsExtension, true);
    assert.equal(described.isDeterministic, false, 'an AI extension is not a recipe extension');
    assert.equal(honorsExtensionActionFor({ question: aiQuestion, questions: [aiQuestion], assignmentCourseId: served.courseId }).kind, null, 'and is offered no recipe swap');
    // An AI extension never decides what the lesson is about.
    const withAi = [...anchorLessonFor(served.familyId, served.courseId), aiQuestion];
    assert.equal(resolveHonorsAnchor(withAi).familyId, served.familyId);
  }
});

test('18. CCMR rules are unchanged: every recipe adds Honors depth and never CCMR credit', () => {
  for (const served of SERVED) {
    const lesson = anchorLessonFor(served.familyId, served.courseId);
    const { question } = buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: served.courseId });
    const report = inspectHonorsRigor([...lesson, question]);
    for (const key of ['coreTeks', 'higherOrderReasoning', 'multipleRepresentations', 'justification', 'modelingApplication']) {
      assert.equal(report.checks[key], true, `${served.label}: the extension supplies ${key}`);
    }
    assert.equal(report.checks.ccmrEnrichment, false, `${served.label}: a depth extension is not exam-style practice`);
    assert.equal(report.isHonorsReady, false, `${served.label}: so the full contract still needs audited CCMR Practice`);
    assert.equal(inspectHonorsRigor([...lesson, question], { ccmrTargetRequired: false }).isHonorsReady, true, served.label);
    const code = lessonTeksFor(served.familyId, served.courseId);
    const directSat = {
      type: 'response',
      activityRole: 'practice',
      dok: 2,
      prompt: 'If $f(x)=3x+4$, what is $f(12)$?',
      alignments: [
        { framework: 'teks', code, role: 'primary' },
        { framework: 'digitalSAT', domainId: 'algebra', role: 'secondary', evidenceMode: 'direct' },
      ],
      assessmentContext: { framework: 'digitalSAT', examStyle: true },
      ccmrSource: { source: 'auditedBank', releaseTarget: 'ccmr-fidelity-v2.1-authentic-language' },
    };
    const withCcmr = inspectHonorsRigor([...lesson, question, directSat]);
    assert.equal(withCcmr.checks.ccmrEnrichment, true, served.label);
    assert.equal(withCcmr.isHonorsReady, true, served.label);
  }
});

/* ------------------------------- swap history ------------------------------- */

let minted = 0;
const mintQuestionId = () => { minted += 1; return `selection-minted-${minted}`; };

/** A stored assignment: the anchor lesson with the extension at the end of Classwork. */
const storedWith = (served, question) => {
  const candidate = withHonorsExtension(anchorLessonV5For(served.familyId, served.courseId), question);
  return { id: `asg-${served.recipe.id}`, schemaVersion: 5, title: candidate.assignment.title, courseId: served.courseId, variantPolicy: candidate.variantPolicy, sections: candidate.sections };
};

test('19. swapping any recipe\'s extension — in place, or with student history — is history-safe and passes Pre-Flight', () => {
  for (const served of SERVED) {
    const { question } = buildDeterministicHonorsExtension({ questions: anchorLessonFor(served.familyId, served.courseId), assignmentCourseId: served.courseId });
    const extension = { ...question, questionId: `${served.recipe.id}-ext`, questionWeight: 2 };
    const stored = storedWith(served, extension);
    const questions = getStoredAssignmentQuestions(stored);
    const index = questions.findIndex((entry) => entry.questionId === extension.questionId);
    assert.equal(honorsExtensionActionFor({ question: questions[index], questions, assignmentCourseId: served.courseId }).kind, 'swap', served.label);

    // No history: replaced in place by another story of the same recipe.
    const inPlace = planHonorsExtensionSwap({ questions, questionId: extension.questionId, assignmentCourseId: served.courseId, protectHistory: false, mintQuestionId });
    assert.equal(inPlace.status, 'ready', `${served.label}: ${inPlace.teacherMessage}`);
    assert.equal(inPlace.mode, HONORS_SWAP_MODE.REPLACE);
    assert.equal(inPlace.replacement.honorsEnrichment.recipeId, served.recipe.id);
    assert.notEqual(inPlace.replacement.honorsEnrichment.storyId, extension.honorsEnrichment.storyId, `${served.label}: a different vetted story`);
    assert.deepEqual(preflightEditorCandidate(stored, inPlace.questions).errors, [], served.label);

    // History: the original stays, excluded, at its index; the replacement is appended.
    const live = planHonorsExtensionSwap({ questions, questionId: extension.questionId, assignmentCourseId: served.courseId, protectHistory: true, mintQuestionId });
    assert.equal(live.mode, HONORS_SWAP_MODE.RETIRE_AND_APPEND, served.label);
    assert.equal(live.questions[index].questionId, extension.questionId);
    assert.equal(live.questions[index].teacherExcluded, true);
    assert.equal(live.replacement.supersedesQuestionId, extension.questionId);
    assert.equal(live.replacement.questionWeight, 2, `${served.label}: a swap never re-weights`);
    const source = withAppendedQuestionSections(stored, live.appendedSections);
    const model = preflightEditorCandidate(source, live.questions);
    assert.deepEqual(model.errors, [], served.label);
    const persisted = { ...stored, ...canonicalV5PersistencePatch(model.assignmentV5) };
    flattenV5Sections(persisted).slice(0, questions.length).forEach((entry, storageIndex) => {
      assert.equal(entry.questionId, questions[storageIndex].questionId, `${served.label}: storage index ${storageIndex} kept`);
    });
    const projection = projectCurrentAssignmentContent(persisted);
    assert.deepEqual(projection.diagnostics, [], served.label);
    assert.equal(projection.byQuestionId.get(live.replacement.questionId).historicalStorageIndex, index, `${served.label}: delivered where the original was`);
    // And the editor's guard knows the lineage: the original cannot come back on top of it.
    const editorQuestions = getStoredAssignmentQuestions(persisted);
    assert.deepEqual(findSupersessionConflicts(editorQuestions), []);
    assert.equal(planQuestionInclusion({ questions: editorQuestions, index }).status, 'refused', served.label);
    assert.equal(describeQuestionSupersession(editorQuestions, index).activeVersion.questionId, live.replacement.questionId);

    // A stored extension from an earlier version of the recipe is legacy, and
    // "Replace with Current Honors Extension" brings it to the current version.
    const outdated = { ...extension, honorsEnrichment: { ...extension.honorsEnrichment, recipeVersion: served.recipe.version - 1 } };
    const outdatedStored = storedWith(served, outdated);
    const outdatedQuestions = getStoredAssignmentQuestions(outdatedStored);
    assert.equal(describeHonorsExtension(outdated).isLegacy, true, served.label);
    assert.equal(honorsExtensionActionFor({ question: outdated, questions: outdatedQuestions, assignmentCourseId: served.courseId }).kind, 'replaceLegacy', served.label);
    const upgrade = planHonorsExtensionSwap({ questions: outdatedQuestions, questionId: outdated.questionId, assignmentCourseId: served.courseId, protectHistory: true, mintQuestionId });
    assert.equal(upgrade.status, 'ready', served.label);
    assert.equal(describeHonorsExtension(upgrade.replacement).isCurrent, true, served.label);
    assert.deepEqual(preflightEditorCandidate(withAppendedQuestionSections(outdatedStored, upgrade.appendedSections), upgrade.questions).errors, [], served.label);
  }
});

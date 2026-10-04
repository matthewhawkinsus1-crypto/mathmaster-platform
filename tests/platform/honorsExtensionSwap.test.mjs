/*
 * REPAIRING AN HONORS EXTENSION WITHOUT LOSING STUDENT HISTORY, AND WITHOUT
 * THE EDITOR DEADLOCK.
 *
 * Production: the Assignment Question Editor detected that the legacy no-AI
 * graphStory referred to a graph it did not have — correctly — and then
 * refused to save even after the teacher excluded it, because Pre-Flight
 * judged every stored question, delivered or not. The teacher could neither
 * keep the broken question nor remove it.
 *
 * Pre-Flight now judges what students will be GIVEN. A question the teacher
 * excluded or threw out is kept for history and never delivered or graded, so
 * its defect cannot block the save that retires it; a question that stays
 * active is judged exactly as before. And "Swap Honors Extension" replaces an
 * unused extension in place, but on a live assignment retires the historical
 * one at its index (responses stay attached) and appends a new question with
 * a new id that supersedes it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HONORS_SWAP_MODE,
  honorsExtensionActionFor,
  planHonorsExtensionSwap,
  withAppendedQuestionSections,
} from '../../src/platform/rigor/honorsExtensionSwap.js';
import { HONORS_RECIPE_STATUS, buildDeterministicHonorsExtension, describeHonorsExtension } from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { projectCurrentAssignmentContent } from '../../src/platform/assignments/currentContentProjection.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import {
  PRODUCTION_LEGACY_HONORS_QUESTION,
  editorQuestionsOf,
  preflightEditorCandidate,
  productionHonorsAssignment,
  publishLmrLesson,
  storedHonorsAssignment,
} from './helpers/honorsExtensionFixtures.mjs';

const GRAPH_DEFECT = /refers to a graph in its prompt, but the question contains none/;
const LEGACY_ID = PRODUCTION_LEGACY_HONORS_QUESTION.questionId;
let minted = 0;
const mintQuestionId = () => { minted += 1; return `minted-${minted}`; };

const currentExtension = () => {
  const result = buildDeterministicHonorsExtension({ questions: publishLmrLesson().questions, assignmentCourseId: 'algebra1' });
  assert.equal(result.status, HONORS_RECIPE_STATUS.READY);
  return { ...result.question, questionId: 'honors-v2-1', questionWeight: 2 };
};

const indexOf = (questions, questionId) => questions.findIndex((question) => question.questionId === questionId);
const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

/** The editor's save, end to end: the candidate, its Pre-Flight, and the record that would be written. */
const saveThroughEditor = (stored, questions, appendedSections = []) => {
  const source = withAppendedQuestionSections(stored, appendedSections);
  const model = preflightEditorCandidate(source, questions);
  return {
    model,
    persisted: model.isValid ? { ...stored, ...canonicalV5PersistencePatch(model.assignmentV5) } : null,
  };
};

/* ----------------------------- Part 5: deadlock ----------------------------- */

test('9. the invalid legacy question, left active, still blocks Pre-Flight', () => {
  const stored = productionHonorsAssignment();
  const questions = editorQuestionsOf(stored);
  const { model } = saveThroughEditor(stored, questions);
  assert.equal(model.isValid, false);
  const number = indexOf(questions, LEGACY_ID) + 1;
  assert.match(model.errors.join('\n'), new RegExp(`Question ${number} refers to a graph in its prompt`));
});

test('7. excluding the invalid legacy question lets the repaired candidate save', () => {
  const stored = productionHonorsAssignment();
  const questions = editorQuestionsOf(stored).map((question) => (
    question.questionId === LEGACY_ID ? { ...question, teacherExcluded: true } : question
  ));
  const { model, persisted } = saveThroughEditor(stored, questions);
  assert.deepEqual(model.errors, []);
  assert.equal(model.isValid, true);
  // Retired, not deleted: the record still holds it, excluded, where it was.
  const saved = getStoredAssignmentQuestions(persisted);
  assert.equal(saved[indexOf(questions, LEGACY_ID)].questionId, LEGACY_ID);
  assert.equal(saved[indexOf(questions, LEGACY_ID)].teacherExcluded, true);
  assert.ok(model.retiredQuestions.some((entry) => entry.questionId === LEGACY_ID), 'Pre-Flight reports what it set aside');
});

test('8. throwing the invalid legacy question out safely (live) lets the candidate save, at its original index and id', () => {
  const stored = productionHonorsAssignment();
  const before = editorQuestionsOf(stored);
  const index = indexOf(before, LEGACY_ID);
  // AssignmentQuestionEditorBase.removeQuestion with live protection.
  const questions = before.map((question, itemIndex) => (itemIndex === index ? { ...question, teacherExcluded: true } : question));
  const { model, persisted } = saveThroughEditor(stored, questions);
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const saved = getStoredAssignmentQuestions(persisted);
  assert.equal(saved.length, before.length, 'nothing removed');
  saved.forEach((question, savedIndex) => assert.equal(question.questionId, before[savedIndex].questionId, `index ${savedIndex} still holds the same question`));
});

test('retiring one question is not an exemption for any other: an active defect still blocks, by its own number', () => {
  const stored = productionHonorsAssignment();
  const questions = editorQuestionsOf(stored);
  const legacyIndex = indexOf(questions, LEGACY_ID);
  const brokenIndex = questions.findIndex((question, index) => index > legacyIndex && question.type === 'representationBridge');
  assert.ok(brokenIndex > legacyIndex, 'a board after the legacy question');
  const candidate = questions.map((question, index) => {
    if (index === legacyIndex) return { ...question, teacherExcluded: true };
    if (index === brokenIndex) return { ...question, prompt: 'Use the graph shown to answer.', type: 'multiAnswer', questionFamily: undefined, answerFields: [{ id: 'a', label: 'Answer', answer: '3' }] };
    return question;
  });
  const { model } = saveThroughEditor(stored, candidate);
  assert.equal(model.isValid, false);
  const errors = model.errors.join('\n');
  assert.match(errors, new RegExp(`Question ${brokenIndex + 1} refers to a graph`), 'the active defect is reported at its real position');
  assert.doesNotMatch(errors, new RegExp(`Question ${legacyIndex + 1}\\b`), 'nothing is reported for the retired question');
});

test('re-including the retired question puts it back under every check', () => {
  const stored = productionHonorsAssignment();
  const excluded = editorQuestionsOf(stored).map((question) => (question.questionId === LEGACY_ID ? { ...question, teacherExcluded: true } : question));
  assert.equal(saveThroughEditor(stored, excluded).model.isValid, true);
  const reincluded = excluded.map((question) => (question.questionId === LEGACY_ID ? { ...question, teacherExcluded: false } : question));
  const { model } = saveThroughEditor(stored, reincluded);
  assert.equal(model.isValid, false);
  assert.match(model.errors.join('\n'), GRAPH_DEFECT);
});

test('a retired question must still be storable: Firestore safety is judged on everything saved', () => {
  const stored = productionHonorsAssignment();
  const questions = editorQuestionsOf(stored).map((question) => (
    question.questionId === LEGACY_ID ? { ...question, teacherExcluded: true, scratch: [[1, 2], [3, 4]] } : question
  ));
  const { model } = saveThroughEditor(stored, questions);
  assert.equal(model.isValid, false, 'an unsaveable record is still refused');
  assert.match(model.errors.join('\n'), /Firestore cannot save an array directly inside another array/);
});

/* ------------------------------ Part 4: swap ------------------------------ */

test('10. swapping an unused extension replaces it in place', () => {
  const extension = currentExtension();
  const stored = storedHonorsAssignment(extension);
  const questions = editorQuestionsOf(stored);
  const index = indexOf(questions, extension.questionId);
  const plan = planHonorsExtensionSwap({ questions, questionId: extension.questionId, assignmentCourseId: 'algebra1', protectHistory: false, mintQuestionId });
  assert.equal(plan.status, 'ready', plan.teacherMessage);
  assert.equal(plan.mode, HONORS_SWAP_MODE.REPLACE);
  assert.equal(plan.questions.length, questions.length, 'one question out, one in');
  assert.deepEqual(plan.appendedSections, []);
  const replacement = plan.questions[index];
  assert.equal(replacement.questionId, plan.replacement.questionId);
  assert.notEqual(replacement.questionId, extension.questionId);
  assert.equal(indexOf(plan.questions, extension.questionId), -1, 'the unused extension is gone');
  assert.equal(replacement.sectionId, questions[index].sectionId, 'in the same section');
  assert.notEqual(replacement.honorsEnrichment.storyId, extension.honorsEnrichment.storyId, 'a different extension, not the same one again');
  assert.equal(replacement.honorsEnrichment.replacesQuestionId, extension.questionId);
  assert.equal(replacement.supersedesQuestionId, undefined, 'nothing historical to supersede');
  plan.questions.forEach((question, position) => {
    if (position !== index) assert.deepEqual(question, questions[position], `question ${position + 1} untouched`);
  });
  const { model } = saveThroughEditor(stored, plan.questions, plan.appendedSections);
  assert.deepEqual(model.errors, [], 'Swap validates the resulting candidate');
});

test('11. swapping an extension with student history preserves the historical question and creates a new id', () => {
  const extension = currentExtension();
  const stored = storedHonorsAssignment(extension);
  const questions = editorQuestionsOf(stored);
  const index = indexOf(questions, extension.questionId);
  const plan = planHonorsExtensionSwap({ questions, questionId: extension.questionId, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(plan.status, 'ready', plan.teacherMessage);
  assert.equal(plan.mode, HONORS_SWAP_MODE.RETIRE_AND_APPEND);

  // The historical question is the same record, only retired from delivery.
  const retired = plan.questions[index];
  assert.equal(retired.questionId, extension.questionId);
  assert.equal(retired.teacherExcluded, true);
  assert.deepEqual(without(retired, 'teacherExcluded'), without(questions[index], 'teacherExcluded'), 'never rewritten in place');

  const replacement = plan.replacement;
  assert.notEqual(replacement.questionId, extension.questionId, 'a new question id');
  assert.equal(replacement.supersedesQuestionId, extension.questionId);
  assert.equal(replacement.honorsEnrichment.replacesQuestionId, extension.questionId);
  assert.equal(replacement.teacherExcluded, false);
  assert.equal(replacement.questionWeight, extension.questionWeight, 'a swap never re-weights the assignment');
  assert.equal(plan.appendedSections.length, 1);
  assert.equal(plan.appendedSections[0].role, 'classwork');

  const { model, persisted } = saveThroughEditor(stored, plan.questions, plan.appendedSections);
  assert.deepEqual(model.errors, []);
  // Every historical storage index still holds its own question, so a grade
  // tracker keyed by index still reads the answers students gave.
  const savedStorage = flattenV5Sections(persisted);
  questions.forEach((question, storageIndex) => {
    assert.equal(savedStorage[storageIndex].questionId, question.questionId, `storage index ${storageIndex} kept`);
  });
  assert.equal(savedStorage.length, questions.length + 1, 'the replacement is appended, never inserted');
  assert.equal(savedStorage.at(-1).questionId, replacement.questionId);
  // Students are given the replacement where the retired question was.
  const projection = projectCurrentAssignmentContent(persisted);
  assert.deepEqual(projection.diagnostics, []);
  const entry = projection.byQuestionId.get(replacement.questionId);
  assert.equal(entry.source, 'replacement');
  assert.equal(entry.historicalStorageIndex, index);
  assert.equal(entry.logicalRole, 'classwork');
  assert.equal(projection.byQuestionId.has(extension.questionId), false, 'the retired extension is no longer delivered');
});

test('swapping a replacement again keeps one chain back to the original historical question', () => {
  const extension = currentExtension();
  const stored = storedHonorsAssignment(extension);
  const first = planHonorsExtensionSwap({ questions: editorQuestionsOf(stored), questionId: extension.questionId, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  const firstSave = saveThroughEditor(stored, first.questions, first.appendedSections);
  const second = planHonorsExtensionSwap({ questions: editorQuestionsOf(firstSave.persisted), questionId: first.replacement.questionId, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(second.status, 'ready', second.teacherMessage);
  assert.equal(second.replacement.supersedesQuestionId, extension.questionId, 'still supersedes the original historical question');
  assert.equal(second.replacement.honorsEnrichment.replacesQuestionId, first.replacement.questionId);
  const { model, persisted } = saveThroughEditor(firstSave.persisted, second.questions, second.appendedSections);
  assert.deepEqual(model.errors, []);
  const projection = projectCurrentAssignmentContent(persisted);
  assert.deepEqual(projection.diagnostics, []);
  assert.equal(projection.byQuestionId.get(second.replacement.questionId).historicalStorageIndex, indexOf(editorQuestionsOf(stored), extension.questionId));
});

test('12. a legacy v1 extension is offered "Replace with Current Honors Extension", and the repair saves on a live assignment', () => {
  const stored = productionHonorsAssignment();
  const questions = editorQuestionsOf(stored);
  const legacy = questions[indexOf(questions, LEGACY_ID)];
  const action = honorsExtensionActionFor({ question: legacy, questions, assignmentCourseId: 'algebra1' });
  assert.equal(action.kind, 'replaceLegacy');
  assert.equal(action.label, 'Replace with Current Honors Extension');
  assert.equal(action.available, true);

  const plan = planHonorsExtensionSwap({ questions, questionId: LEGACY_ID, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(plan.status, 'ready', plan.teacherMessage);
  assert.equal(plan.mode, HONORS_SWAP_MODE.RETIRE_AND_APPEND);
  assert.equal(describeHonorsExtension(plan.replacement).isCurrent, true);
  assert.equal(plan.replacement.honorsEnrichment.courseId, 'algebra1', 'the repair follows the assignment course, not the stale "Algebra II" label');
  const { model } = saveThroughEditor(stored, plan.questions, plan.appendedSections);
  assert.deepEqual(model.errors, [], 'the broken legacy question it retires cannot block the repair');

  // A current extension is offered the ordinary swap.
  const extension = currentExtension();
  assert.equal(honorsExtensionActionFor({ question: extension, questions, assignmentCourseId: 'algebra1' }).label, 'Swap Honors Extension');
  // A normal lesson question is offered nothing.
  assert.equal(honorsExtensionActionFor({ question: questions[0], questions, assignmentCourseId: 'algebra1' }).kind, null);
});

test('a legacy extension on a concept with no vetted recipe is explained, and the plan changes nothing', () => {
  const lesson = [
    { questionId: 'ts-1', sectionId: 'cw', type: 'stepAlgebra', activityRole: 'classwork', standard: 'A.5A', alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }], prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation', version: 1 } },
    { ...PRODUCTION_LEGACY_HONORS_QUESTION, sectionId: 'cw' },
  ];
  const snapshot = JSON.parse(JSON.stringify(lesson));
  const action = honorsExtensionActionFor({ question: lesson[1], questions: lesson, assignmentCourseId: 'algebra1' });
  assert.equal(action.kind, 'unavailable');
  assert.equal(action.available, false);
  assert.match(action.explanation, /not yet available/);
  assert.match(action.explanation, /Exclude|Throw Out Safely/);
  const plan = planHonorsExtensionSwap({ questions: lesson, questionId: LEGACY_ID, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(plan.status, 'unavailable');
  assert.equal(plan.questions, undefined, 'no candidate at all');
  assert.deepEqual(lesson, snapshot, 'nothing mutated');
});

test('only a deterministic MathMaster extension can be swapped', () => {
  const stored = productionHonorsAssignment();
  const questions = editorQuestionsOf(stored);
  const plan = planHonorsExtensionSwap({ questions, questionId: questions[0].questionId, assignmentCourseId: 'algebra1', protectHistory: false, mintQuestionId });
  assert.equal(plan.status, 'unavailable');
  assert.equal(plan.code, 'not-deterministic-honors-extension');
  const missing = planHonorsExtensionSwap({ questions, questionId: 'no-such-question', assignmentCourseId: 'algebra1', protectHistory: false, mintQuestionId });
  assert.equal(missing.status, 'unavailable');
});

test('appended sections are added once, empty, after every existing section', () => {
  const stored = productionHonorsAssignment();
  const shell = { id: 'honors-swap-x', role: 'classwork', title: 'Classwork · Honors Extension Replacement' };
  const merged = withAppendedQuestionSections(stored, [shell, shell]);
  assert.equal(merged.sections.length, stored.sections.length + 1);
  assert.deepEqual(merged.sections.at(-1), { ...shell, questions: [] });
  assert.equal(withAppendedQuestionSections(merged, [shell]).sections.length, merged.sections.length, 'an id already present is not added twice');
  assert.equal(withAppendedQuestionSections(stored, []), stored, 'nothing to add, nothing changed');
});

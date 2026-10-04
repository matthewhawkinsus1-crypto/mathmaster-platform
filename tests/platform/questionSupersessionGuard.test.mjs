/*
 * ONE DELIVERED VERSION PER QUESTION: THE EDITOR'S SUPERSESSION GUARD.
 *
 * A live assignment never rewrites a question students answered. MathMaster
 * retires it in place (teacherExcluded, responses still attached) and appends
 * a replacement with a NEW id whose `supersedesQuestionId` names it; the
 * current-content projection then delivers the replacement where the retired
 * question was. Honors swaps, server teacher repairs and Content upgrades all
 * write that shape.
 *
 * The defect (PR #423 follow-up): the Assignment Question Editor's Include
 * button flipped `teacherExcluded` back on a retired question even while its
 * replacement was still active. Nothing stopped it. The projection only
 * recorded a diagnostic and delivered BOTH versions — and for a chained
 * retirement (A → B → C, where C replaced B) it recorded nothing at all.
 *
 * The guard: the questions joined by supersession links are versions of ONE
 * question, and at most one of them may be active. Include is refused, with
 * a plain explanation and nothing changed, while another version is active;
 * once the replacement is retired or removed, the earlier version may come
 * back under every ordinary check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPERSESSION_REFUSAL,
  describeQuestionSupersession,
  detachSupersessionLinksTo,
  findSupersessionConflicts,
  keepSupersessionLink,
  planQuestionInclusion,
  resolveQuestionLineages,
  supersessionCardSummary,
  withoutSupersessionLink,
} from '../../src/platform/assignments/questionSupersession.js';
import { projectCurrentAssignmentContent } from '../../src/platform/assignments/currentContentProjection.js';
import { planHonorsExtensionSwap, withAppendedQuestionSections } from '../../src/platform/rigor/honorsExtensionSwap.js';
import { HONORS_RECIPE_STATUS, buildDeterministicHonorsExtension } from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { canonicalV5PersistencePatch } from '../../src/platform/contract/storedAssignmentV5.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import {
  PRODUCTION_LEGACY_HONORS_QUESTION,
  editorQuestionsOf,
  preflightEditorCandidate,
  productionHonorsAssignment,
  publishLmrLesson,
  storedHonorsAssignment,
} from './helpers/honorsExtensionFixtures.mjs';

const snapshot = (value) => JSON.parse(JSON.stringify(value));
const indexOf = (questions, questionId) => questions.findIndex((question) => question.questionId === questionId);
const ACTIVE_REPLACEMENT_MESSAGE = /This question has an active replacement[^.]*\. Remove or retire the replacement before restoring this version\./;

let minted = 0;
const mintQuestionId = () => { minted += 1; return `guard-minted-${minted}`; };

const currentExtension = () => {
  const result = buildDeterministicHonorsExtension({ questions: publishLmrLesson().questions, assignmentCourseId: 'algebra1' });
  assert.equal(result.status, HONORS_RECIPE_STATUS.READY);
  return { ...result.question, questionId: 'honors-original', questionWeight: 2 };
};

/** The editor's save, end to end: candidate, Pre-Flight, and the record that would be written. */
const saveThroughEditor = (stored, questions, appendedSections = []) => {
  const source = withAppendedQuestionSections(stored, appendedSections);
  const model = preflightEditorCandidate(source, questions);
  return { model, persisted: model.isValid ? { ...stored, ...canonicalV5PersistencePatch(model.assignmentV5) } : null };
};

/**
 * A live Honors assignment after one history-safe swap: the original extension
 * A retired at its storage index, its replacement B appended and active.
 */
const liveSwap = () => {
  const extension = currentExtension();
  const stored = storedHonorsAssignment(extension);
  const plan = planHonorsExtensionSwap({ questions: editorQuestionsOf(stored), questionId: extension.questionId, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(plan.status, 'ready', plan.teacherMessage);
  const saved = saveThroughEditor(stored, plan.questions, plan.appendedSections);
  assert.deepEqual(saved.model.errors, []);
  return { stored: saved.persisted, original: extension.questionId, replacement: plan.replacement.questionId };
};

/* ------------------------------------------------------------------------ */

test('1. a retired question cannot be re-included while its active replacement supersedes it — and nothing changes', () => {
  const { stored, original, replacement } = liveSwap();
  const questions = editorQuestionsOf(stored);
  const before = snapshot(questions);
  const index = indexOf(questions, original);
  assert.equal(questions[index].teacherExcluded, true, 'fixture: the original is retired');
  assert.equal(questions[indexOf(questions, replacement)].supersedesQuestionId, original, 'fixture: the replacement points back to it');

  const plan = planQuestionInclusion({ questions, index });
  assert.equal(plan.status, 'refused');
  assert.equal(plan.code, SUPERSESSION_REFUSAL.ACTIVE_REPLACEMENT);
  assert.match(plan.teacherMessage, ACTIVE_REPLACEMENT_MESSAGE);
  assert.match(plan.teacherMessage, new RegExp(`Question ${indexOf(questions, replacement) + 1}\\b`), 'names the replacement the teacher would have to retire');
  assert.deepEqual(plan.blocking.map((entry) => entry.questionId), [replacement]);
  assert.equal(plan.questions, undefined, 'a refusal carries no candidate to apply');
  assert.deepEqual(questions, before, 'the question list passed in is untouched');

  // The card says so before the teacher ever presses Include.
  const described = describeQuestionSupersession(questions, index);
  assert.equal(described.isReplaced, true);
  assert.equal(described.activeVersion.questionId, replacement);
  assert.equal(described.activeVersion.index, indexOf(questions, replacement));
  assert.equal(described.includeBlocked, true);
  assert.match(described.includeBlockedReason, ACTIVE_REPLACEMENT_MESSAGE);

  // The replacement's card names what it replaced.
  const replacementCard = describeQuestionSupersession(questions, indexOf(questions, replacement));
  assert.equal(replacementCard.supersedes.questionId, original);
  assert.equal(replacementCard.supersedes.index, index);
  assert.equal(replacementCard.isReplaced, false);
});

test('the defect it closes: re-including the retired version would deliver BOTH versions to students', () => {
  const { stored, original, replacement } = liveSwap();
  const reincluded = editorQuestionsOf(stored).map((question) => (question.questionId === original ? { ...question, teacherExcluded: false } : question));
  // The projection alone only diagnoses it…
  const { persisted } = saveThroughEditor(stored, reincluded);
  assert.ok(persisted, 'Pre-Flight alone never looked at supersession, so this used to save');
  const projection = projectCurrentAssignmentContent(persisted);
  assert.ok(projection.byQuestionId.has(original) && projection.byQuestionId.has(replacement), 'both versions delivered');
  assert.ok(projection.diagnostics.some((entry) => entry.code === 'superseded-question-not-excluded'));
  // …the guard names it as a conflict a save must not write.
  const conflicts = findSupersessionConflicts(reincluded);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].activeQuestionIds.sort(), [original, replacement].sort());
  assert.match(conflicts[0].message, /both active versions of the same question/);
});

/* --------------------------- chained replacements --------------------------- */

const q = (questionId, extra = {}) => ({ questionId, type: 'multiAnswer', activityRole: 'classwork', prompt: `Question ${questionId}`, ...extra });

// A → B → C as the SERVER writes it (teacherQuestionRepair links each
// replacement to the question it replaced) and as an Honors swap writes it
// (every replacement links to the ORIGINAL historical question, so it is
// delivered where that question was, and names the one it swapped out in
// honorsEnrichment.replacesQuestionId).
const LINKED_CHAIN = () => [
  q('c1'),
  q('A', { teacherExcluded: true }),
  q('c2'),
  q('B', { supersedesQuestionId: 'A', teacherExcluded: true }),
  q('C', { supersedesQuestionId: 'B' }),
];
const FLAT_CHAIN = () => [
  q('c1'),
  q('A', { teacherExcluded: true }),
  q('c2'),
  q('B', { supersedesQuestionId: 'A', teacherExcluded: true }),
  q('C', { supersedesQuestionId: 'A', honorsEnrichment: { replacesQuestionId: 'B' } }),
];

test('2. chained replacements A → B → C resolve to the one active version, both as the server and as a swap writes them', () => {
  for (const [label, build] of [['linked', LINKED_CHAIN], ['flat', FLAT_CHAIN]]) {
    const questions = build();
    for (const retired of ['A', 'B']) {
      const index = indexOf(questions, retired);
      const described = describeQuestionSupersession(questions, index);
      assert.equal(described.activeVersion?.questionId, 'C', `${label}: ${retired} resolves to C`);
      assert.equal(described.isReplaced, true, `${label}: ${retired} has been replaced`);
      const plan = planQuestionInclusion({ questions, index });
      assert.equal(plan.status, 'refused', `${label}: ${retired} cannot come back while C is active`);
      assert.equal(plan.code, SUPERSESSION_REFUSAL.ACTIVE_REPLACEMENT, `${label}: ${retired}`);
      assert.deepEqual(plan.blocking.map((entry) => entry.questionId), ['C']);
      assert.match(plan.teacherMessage, /Question 5\b/);
    }
    const lineages = resolveQuestionLineages(questions);
    assert.deepEqual(lineages.lineageOf(indexOf(questions, 'A')).questionIds, ['A', 'B', 'C'], `${label}: one lineage`);
    assert.deepEqual(lineages.lineageOf(indexOf(questions, 'c1')).questionIds, ['c1'], `${label}: an ordinary question is its own lineage`);
  }
  // The linked chain is the case the projection misses: A back with C active
  // is delivered twice and diagnosed nowhere.
  const doubled = LINKED_CHAIN().map((question) => (question.questionId === 'A' ? { ...question, teacherExcluded: false } : question));
  const projection = projectCurrentAssignmentContent({ sections: [{ id: 'cw', role: 'classwork', questions: doubled }] });
  assert.ok(projection.byQuestionId.has('A') && projection.byQuestionId.has('C'));
  assert.deepEqual(projection.diagnostics, [], 'the projection does not see it');
  assert.equal(findSupersessionConflicts(doubled).length, 1, 'the guard does');
});

test('2b. chain resolution is deterministic: storage order, duplicated links and cycles do not change the answer or hang', () => {
  const orders = [
    ['c1', 'A', 'c2', 'B', 'C'],
    ['C', 'B', 'A', 'c1', 'c2'],
    ['B', 'c2', 'C', 'A', 'c1'],
  ];
  for (const order of orders) {
    const byId = new Map(LINKED_CHAIN().map((question) => [question.questionId, question]));
    const questions = order.map((id) => byId.get(id));
    const first = describeQuestionSupersession(questions, indexOf(questions, 'A'));
    const second = describeQuestionSupersession(snapshot(questions), indexOf(questions, 'A'));
    assert.deepEqual(first, second, 'same input, same answer');
    assert.equal(first.activeVersion.questionId, 'C', order.join(','));
    assert.equal(planQuestionInclusion({ questions, index: indexOf(questions, 'B') }).code, SUPERSESSION_REFUSAL.ACTIVE_REPLACEMENT, order.join(','));
  }
  // A cycle (never written by MathMaster, but a hand-edited record could hold one) terminates.
  const cycle = [q('X', { supersedesQuestionId: 'Y', teacherExcluded: true }), q('Y', { supersedesQuestionId: 'X' })];
  const described = describeQuestionSupersession(cycle, 0);
  assert.equal(described.activeVersion.questionId, 'Y');
  assert.equal(planQuestionInclusion({ questions: cycle, index: 0 }).status, 'refused');
  // A link to a question that is not in the list resolves to nothing, without error.
  const dangling = [q('R', { supersedesQuestionId: 'gone', teacherExcluded: true })];
  assert.equal(describeQuestionSupersession(dangling, 0).supersedesMissing, true);
  assert.equal(planQuestionInclusion({ questions: dangling, index: 0 }).status, 'ready');
});

test('2c. the real double swap: the first replacement is refused while the second is active, and the card says what replaced it', () => {
  const { stored, original, replacement: first } = liveSwap();
  const second = planHonorsExtensionSwap({ questions: editorQuestionsOf(stored), questionId: first, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(second.status, 'ready', second.teacherMessage);
  const saved = saveThroughEditor(stored, second.questions, second.appendedSections);
  assert.deepEqual(saved.model.errors, []);
  const questions = editorQuestionsOf(saved.persisted);
  const latest = second.replacement.questionId;
  for (const retired of [original, first]) {
    const plan = planQuestionInclusion({ questions, index: indexOf(questions, retired) });
    assert.equal(plan.status, 'refused', retired);
    assert.equal(plan.code, SUPERSESSION_REFUSAL.ACTIVE_REPLACEMENT, retired);
    assert.deepEqual(plan.blocking.map((entry) => entry.questionId), [latest]);
    assert.match(plan.teacherMessage, ACTIVE_REPLACEMENT_MESSAGE);
    assert.equal(describeQuestionSupersession(questions, indexOf(questions, retired)).activeVersion.questionId, latest);
  }
  assert.deepEqual(findSupersessionConflicts(questions), []);
});

test('the guard works in every direction: a replacement cannot return on top of an active earlier version or another active version', () => {
  const questions = [q('A'), q('B', { supersedesQuestionId: 'A', teacherExcluded: true })];
  const plan = planQuestionInclusion({ questions, index: 1 });
  assert.equal(plan.status, 'refused');
  assert.equal(plan.code, SUPERSESSION_REFUSAL.ACTIVE_EARLIER_VERSION);
  assert.match(plan.teacherMessage, /Question 1\b/);
  assert.match(plan.teacherMessage, /Nothing was changed/);
  // Two replacements of one original with nothing saying which came later:
  // each is "another version", and still only one may be active.
  const siblings = [q('A', { teacherExcluded: true }), q('B', { supersedesQuestionId: 'A', teacherExcluded: true }), q('C', { supersedesQuestionId: 'A' })];
  const sibling = planQuestionInclusion({ questions: siblings, index: 1 });
  assert.equal(sibling.status, 'refused');
  assert.equal(sibling.code, SUPERSESSION_REFUSAL.ACTIVE_OTHER_VERSION);
  assert.match(sibling.teacherMessage, /Another version of this question \(Question 3\) is active/);
});

/* -------------------------- restoring an earlier version -------------------------- */

test('3. once the active replacement is safely retired or removed, the original may be included again — under every ordinary check', () => {
  const { stored, original, replacement } = liveSwap();
  const questions = editorQuestionsOf(stored);
  const replacementIndex = indexOf(questions, replacement);

  // Retired (Exclude / Throw Out Safely on the replacement): nothing active remains.
  const retired = questions.map((question, index) => (index === replacementIndex ? { ...question, teacherExcluded: true } : question));
  const restore = planQuestionInclusion({ questions: retired, index: indexOf(retired, original) });
  assert.equal(restore.status, 'ready', restore.teacherMessage);
  assert.equal(restore.questions[indexOf(retired, original)].teacherExcluded, false);
  restore.questions.forEach((question, index) => {
    if (index !== indexOf(retired, original)) assert.deepEqual(question, retired[index], `question ${index + 1} untouched`);
  });
  const { model } = saveThroughEditor(stored, restore.questions);
  assert.deepEqual(model.errors, [], 'a valid original passes the normal Pre-Flight');
  assert.deepEqual(findSupersessionConflicts(restore.questions), []);

  // Removed (no student history: the replacement is deleted outright).
  const removed = detachSupersessionLinksTo(retired.filter((_, index) => index !== replacementIndex), replacement);
  const afterRemoval = planQuestionInclusion({ questions: removed, index: indexOf(removed, original) });
  assert.equal(afterRemoval.status, 'ready', afterRemoval.teacherMessage);

  // Restored, then the replacement cannot come back on top of it.
  const again = planQuestionInclusion({ questions: restore.questions, index: replacementIndex });
  assert.equal(again.status, 'refused');
  assert.equal(again.code, SUPERSESSION_REFUSAL.ACTIVE_EARLIER_VERSION);
});

test('3b. restoring is not a validation bypass: an invalid earlier version is still refused by Pre-Flight', () => {
  // The production legacy graphStory, replaced by "Replace with Current Honors Extension".
  const stored = productionHonorsAssignment();
  const legacyId = PRODUCTION_LEGACY_HONORS_QUESTION.questionId;
  const plan = planHonorsExtensionSwap({ questions: editorQuestionsOf(stored), questionId: legacyId, assignmentCourseId: 'algebra1', protectHistory: true, mintQuestionId });
  assert.equal(plan.status, 'ready', plan.teacherMessage);
  const saved = saveThroughEditor(stored, plan.questions, plan.appendedSections);
  assert.deepEqual(saved.model.errors, []);
  const questions = editorQuestionsOf(saved.persisted);
  assert.equal(planQuestionInclusion({ questions, index: indexOf(questions, legacyId) }).status, 'refused', 'blocked while the current extension is active');
  const withoutReplacement = questions.map((question) => (question.questionId === plan.replacement.questionId ? { ...question, teacherExcluded: true } : question));
  const restore = planQuestionInclusion({ questions: withoutReplacement, index: indexOf(withoutReplacement, legacyId) });
  assert.equal(restore.status, 'ready', 'the guard allows it…');
  const { model } = saveThroughEditor(saved.persisted, restore.questions);
  assert.equal(model.isValid, false, '…and the ordinary checks still refuse the broken question');
  assert.match(model.errors.join('\n'), /refers to a graph in its prompt, but the question contains none/);
});

test('4. history stays attached to historical ids: no id, storage index or link is rewritten by a refusal or a restore', () => {
  const { stored, original, replacement } = liveSwap();
  const questions = editorQuestionsOf(stored);
  const ids = questions.map((question) => question.questionId);

  // A refusal changes nothing at all.
  assert.equal(planQuestionInclusion({ questions, index: indexOf(questions, original) }).status, 'refused');
  assert.deepEqual(questions.map((question) => question.questionId), ids);

  // A restore changes exactly one flag on exactly one question.
  const retired = questions.map((question) => (question.questionId === replacement ? { ...question, teacherExcluded: true } : question));
  const restored = planQuestionInclusion({ questions: retired, index: indexOf(retired, original) }).questions;
  const { persisted } = saveThroughEditor(stored, restored);
  const storage = flattenV5Sections(persisted);
  ids.forEach((questionId, storageIndex) => assert.equal(storage[storageIndex].questionId, questionId, `storage index ${storageIndex} still holds ${questionId}`));
  const savedReplacement = storage[indexOf(storage, replacement)];
  assert.equal(savedReplacement.supersedesQuestionId, original, 'the retired replacement keeps its link, so the guard still knows the lineage');
  assert.equal(savedReplacement.teacherExcluded, true);
  // Students are given the original again, at its own storage index; the
  // retired replacement is not delivered.
  const projection = projectCurrentAssignmentContent(persisted);
  assert.deepEqual(projection.diagnostics, []);
  assert.equal(projection.byQuestionId.get(original).storageIndex, indexOf(storage, original));
  assert.equal(projection.byQuestionId.get(original).source, 'stored');
  assert.equal(projection.byQuestionId.has(replacement), false);
});

test('every card says plainly what happened: replaced by which question, what a replacement replaces, and when two are active', () => {
  const { stored, original, replacement } = liveSwap();
  const questions = editorQuestionsOf(stored);
  const lineages = resolveQuestionLineages(questions);
  const card = (list, questionId, shared = null) => supersessionCardSummary(describeQuestionSupersession(list, indexOf(list, questionId), shared));
  const originalNumber = indexOf(questions, original) + 1;
  const replacementNumber = indexOf(questions, replacement) + 1;

  const retired = card(questions, original, lineages);
  assert.equal(retired.badge, 'REPLACED');
  assert.match(retired.text, new RegExp(`^Replaced by Question ${replacementNumber}\\.`));
  assert.match(retired.text, /responses students gave this version stay attached to it/);
  assert.equal(retired.showQuestion.questionId, replacement, 'the card can take the teacher to the replacement');

  const active = card(questions, replacement, lineages);
  assert.equal(active.badge, 'REPLACEMENT');
  assert.match(active.text, new RegExp(`^Replaces Question ${originalNumber}\\.`));
  assert.equal(active.showQuestion.questionId, original);

  const doubled = questions.map((question) => (question.questionId === original ? { ...question, teacherExcluded: false } : question));
  const conflict = card(doubled, original);
  assert.equal(conflict.tone, 'error');
  assert.equal(conflict.badge, '2 VERSIONS ACTIVE');
  assert.match(conflict.text, new RegExp(`^Question ${replacementNumber} is also an active version of this question, so students would be given both`));

  const noneActive = questions.map((question) => (question.questionId === replacement ? { ...question, teacherExcluded: true } : question));
  assert.equal(card(noneActive, original).badge, 'NO ACTIVE VERSION');
  const restored = noneActive.map((question) => (question.questionId === original ? { ...question, teacherExcluded: false } : question));
  const retiredReplacement = card(restored, replacement);
  assert.equal(retiredReplacement.badge, 'RETIRED REPLACEMENT');
  assert.match(retiredReplacement.text, new RegExp(`replaced Question ${originalNumber}, which is active again`));

  assert.equal(card(questions, questions[0].questionId), null, 'an ordinary question has no notice');
});

/* ------------------------------ save and other paths ------------------------------ */

test('the save guard reports every way two versions can be active, and nothing for valid lineages', () => {
  assert.deepEqual(findSupersessionConflicts(LINKED_CHAIN()), []);
  assert.deepEqual(findSupersessionConflicts(FLAT_CHAIN()), []);
  assert.deepEqual(findSupersessionConflicts([q('a'), q('b')]), []);
  // Two active replacements of one original.
  const twoClaims = FLAT_CHAIN().map((question) => (question.questionId === 'B' ? { ...question, teacherExcluded: false } : question));
  const [conflict] = findSupersessionConflicts(twoClaims);
  assert.deepEqual(conflict.activeQuestionIds, ['B', 'C']);
  assert.deepEqual(conflict.activeIndexes, [3, 4]);
  assert.match(conflict.message, /Questions 4 and 5\b/);
});

test('Duplicate makes a new question, never a second replacement of the same original', () => {
  const replacementQuestion = q('B', { supersedesQuestionId: 'A', introducedInContentVersion: 2 });
  const copy = withoutSupersessionLink(replacementQuestion);
  assert.equal(copy.supersedesQuestionId, undefined);
  assert.equal(copy.introducedInContentVersion, undefined);
  assert.equal(replacementQuestion.supersedesQuestionId, 'A', 'the source question is not mutated');
  const questions = [q('A', { teacherExcluded: true }), replacementQuestion, { ...copy, questionId: 'B-copy', teacherExcluded: false }];
  assert.deepEqual(findSupersessionConflicts(questions), [], 'the copy is its own question');
});

test('a repaired replacement keeps its own link and cannot invent one', () => {
  const existing = q('B', { supersedesQuestionId: 'A' });
  assert.equal(keepSupersessionLink(existing, { ...existing, prompt: 'Repaired' }).supersedesQuestionId, 'A');
  assert.equal(keepSupersessionLink(existing, { prompt: 'Repaired, link dropped by the AI' }).supersedesQuestionId, 'A');
  assert.equal(keepSupersessionLink(q('plain'), { prompt: 'x', supersedesQuestionId: 'someone-else' }).supersedesQuestionId, undefined);
});

test('removing a superseded question with no history leaves no dangling link behind', () => {
  const questions = [q('B', { supersedesQuestionId: 'A' }), q('other', { supersedesQuestionId: 'keep' }), q('keep', { teacherExcluded: true })];
  const detached = detachSupersessionLinksTo(questions, 'A');
  assert.equal(detached[0].supersedesQuestionId, undefined);
  assert.equal(detached[1].supersedesQuestionId, 'keep', 'only links to the removed question are detached');
  assert.equal(questions[0].supersedesQuestionId, 'A', 'the list passed in is not mutated');
  // A link is never detached while another question still carries that id.
  assert.equal(detachSupersessionLinksTo([...questions, q('A', { teacherExcluded: true })], 'A')[0].supersedesQuestionId, 'A');
});

test('an ordinary question is unaffected: Include and Exclude behave exactly as before', () => {
  const questions = [q('a', { teacherExcluded: true }), q('b')];
  const plan = planQuestionInclusion({ questions, index: 0 });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.questions, [{ ...questions[0], teacherExcluded: false }, questions[1]]);
  assert.equal(planQuestionInclusion({ questions, index: 1 }).status, 'unchanged', 'an active question has nothing to include');
  const described = describeQuestionSupersession(questions, 0);
  assert.equal(described.isVersioned, false);
  assert.equal(described.includeBlocked, false);
  assert.equal(planQuestionInclusion({ questions, index: 9 }).status, 'refused', 'an index that does not exist changes nothing');
});

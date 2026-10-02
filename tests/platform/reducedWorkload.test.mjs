// REDUCED NUMBER OF ITEMS, SAME TEKS AND RIGOR — APPLIED BY THE PLATFORM.
//
// The accommodation `reduced-item-count-same-rigor` gains an explicit
// percentage (`params.itemReduction`). These tests pin what that must and must
// not do (functions/shared/reducedWorkload.mjs):
//
//   * a profile saved before the percentage existed never starts losing items;
//   * one central rounding / minimum rule for every assignment size;
//   * every TEKS/skill a section assesses keeps at least one item, core items
//     and linked groups are never split, the hardest lone item goes last;
//   * deterministic on every device and stable while the student works;
//   * answered work is never dropped; a Practice Pass composes by set
//     difference in either order;
//   * the grade denominator is the student's own required items.
//
// Synthetic content only.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ITEM_REDUCTION_MODE,
  WORKLOAD_STATUS,
  WORKLOAD_VARIANCE,
  describeWorkloadSummary,
  itemReductionInputError,
  normalizeItemReduction,
  planReducedWorkload,
  projectStudentWorkload,
  resolveItemReductionPolicy,
  resolveStudentWorkload,
  targetRemovalCount,
  workloadItemsFromAssignment,
} from '../../functions/shared/reducedWorkload.mjs';
import {
  buildSupportProjection,
  normalizeSupportRevisionInput,
  supportProfileWarnings,
} from '../../functions/shared/supportProfileModel.mjs';
import { supportAutomationFor } from '../../functions/shared/supportCatalog.mjs';
import { splitGrade, splitGradesBySection, gradeWeightTotals } from '../../src/platform/teacher/gradeEvidence.js';
import {
  practicePassWaivedIndices,
  studentAssignmentIndicesWithPracticePass,
  studentRequiredQuestions,
} from '../../src/assignmentLifecycle.js';
import { normalizeStudentProfile } from '../../src/studentSupport.js';

const ID = 'reduced-item-count-same-rigor';

// --- Fixtures ------------------------------------------------------------------------

let questionCounter = 0;
const q = (extra = {}) => {
  questionCounter += 1;
  return { questionId: `q${questionCounter}`, type: 'numeric', prompt: 'Solve for x.', dok: 2, ...extra };
};
const assignmentOf = (sections, extra = {}) => ({
  id: 'A1',
  schemaVersion: 5,
  title: 'Synthetic lesson',
  dueAt: '2026-10-08',
  sections: sections.map(([role, questions], index) => ({ id: `s${index}`, role, title: role, questions })),
  ...extra,
});
const sameTeks = (n, code = 'A.5A') => Array.from({ length: n }, () => q({ standard: code }));
const rotatingTeks = (n, codes) => Array.from({ length: n }, (_, i) => q({ standard: codes[i % codes.length] }));

const revision = ({ id = 'r1', number = 1, start = '2026-08-17', percent = 25, appliesTo = [], status = 'active', bare = false, extra = [] } = {}) => ({
  id, revisionId: id, revision: number, status, effectiveStart: start, effectiveEnd: null, inclusionStatus: false,
  accommodations: [
    ...(bare ? [{ id: ID, params: {}, appliesTo }] : []),
    ...(percent && !bare ? [{ id: ID, params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo }] : []),
    ...extra,
  ],
  modifications: [],
});
const profileFor = (revisions, todayKey = '2026-10-01') => buildSupportProjection({ revisions, todayKey, updatedAt: '2026-10-01T12:00:00.000Z' });
const reduced25 = profileFor([revision()]);

const planFor = (assignment, percent = 25, appliesTo = []) => planReducedWorkload({
  items: workloadItemsFromAssignment(assignment), percent, appliesTo, seedKey: assignment.id,
});
const kept = (assignment, plan) => workloadItemsFromAssignment(assignment).map((item) => item.storageIndex).filter((index) => !plan.removed.includes(index));
const roleOfIndex = (assignment, index) => workloadItemsFromAssignment(assignment).find((item) => item.storageIndex === index)?.role;
const teksOfIndex = (assignment, index) => workloadItemsFromAssignment(assignment).find((item) => item.storageIndex === index)?.question?.standard;

// --- The profile parameter and legacy protection --------------------------------------------

test('the percentage is validated in one place, and anything else means "recorded only"', () => {
  assert.deepEqual(normalizeItemReduction({ mode: 'percent', value: 25 }), { mode: 'percent', value: 25 });
  assert.deepEqual(normalizeItemReduction({ mode: 'percent', value: '30' }), { mode: 'percent', value: 30 });
  for (const raw of [null, {}, { mode: 'percent' }, { mode: 'percent', value: 80 }, { mode: 'percent', value: 5 }, { mode: 'percent', value: 25.5 }, { mode: 'nope', value: 25 }, 25]) {
    assert.equal(normalizeItemReduction(raw).mode, ITEM_REDUCTION_MODE.NONE, JSON.stringify(raw));
  }
  assert.equal(itemReductionInputError({ mode: 'percent', value: 25 }), null);
  assert.match(itemReductionInputError({ mode: 'percent', value: 80 }), /10 to 50/);
  assert.equal(itemReductionInputError({ mode: 'none' }), null);
});

test('a revision saves the percentage; an out-of-range one is an error, never silently changed', () => {
  const ok = normalizeSupportRevisionInput({
    effectiveStart: '2026-10-01', sourceLabel: 'IEP',
    accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: 25 } } }],
  });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.revision.accommodations[0].params.itemReduction, { mode: 'percent', value: 25 });

  const bad = normalizeSupportRevisionInput({
    effectiveStart: '2026-10-01', sourceLabel: 'IEP',
    accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: 80 } } }],
  });
  assert.equal(bad.errors.length, 1);

  const bare = normalizeSupportRevisionInput({ effectiveStart: '2026-10-01', sourceLabel: 'IEP', accommodations: [ID] });
  assert.deepEqual(bare.errors, []);
  assert.deepEqual(bare.revision.accommodations[0].params.itemReduction, { mode: 'none', value: 0 });
});

test('LEGACY: a bare reduced-item support never starts removing questions', () => {
  const assignment = assignmentOf([['practice', sameTeks(20)]]);
  const flat = { accommodations: [ID], modifications: [] };
  const flatResult = resolveStudentWorkload({ assignment, profile: flat });
  assert.equal(flatResult.status, WORKLOAD_STATUS.MANUAL);
  assert.equal(flatResult.indices.length, 20);

  // Saved by the support-profile editor before this build: versioned, no params.
  const versionedBare = profileFor([revision({ bare: true })]);
  assert.equal(resolveStudentWorkload({ assignment, profile: versionedBare }).status, WORKLOAD_STATUS.MANUAL);
  assert.equal(resolveStudentWorkload({ assignment, profile: versionedBare }).indices.length, 20);

  // A projection written before `itemReductionHistory` existed.
  const { itemReductionHistory, ...olderPlan } = versionedBare.supportPlan;
  assert.ok(itemReductionHistory);
  assert.equal(resolveStudentWorkload({ assignment, profile: { ...versionedBare, supportPlan: olderPlan } }).indices.length, 20);

  // ...and the normalized view the runtime holds behaves the same.
  assert.equal(resolveStudentWorkload({ assignment, profile: normalizeStudentProfile(versionedBare) }).indices.length, 20);

  // The catalog calls it manual, so no platform gap and no "provided" claim.
  assert.equal(supportAutomationFor(ID, {}), 'manual');
  assert.equal(supportAutomationFor(ID, { itemReduction: { mode: 'percent', value: 25 } }), 'automatic');
  assert.ok(supportProfileWarnings(versionedBare, { nowValue: Date.parse('2026-10-01T15:00:00Z') }).some((warning) => warning.code === 'item-reduction-manual'));
});

test('no support, no change: a student without the support keeps every question and every split shape', () => {
  const assignment = assignmentOf([['classwork', sameTeks(6)], ['practice', sameTeks(8, 'A.5B')]]);
  const tracker = { 0: { status: 'correct' }, 1: { status: 'attempted', partialCredit: 50 } };
  assert.deepEqual(splitGrade({ tracker, assignment, supportProfile: {} }), splitGrade({ tracker, assignment }));
  assert.deepEqual(splitGradesBySection({ tracker, assignment, supportProfile: normalizeStudentProfile({}) }), splitGradesBySection({ tracker, assignment }));
  const required = studentRequiredQuestions({ assignment, profile: normalizeStudentProfile({}) });
  assert.deepEqual(required.indices, studentAssignmentIndicesWithPracticePass({ assignment }));
  assert.equal(required.workload, null);
});

// --- The effective revision for an assignment ------------------------------------------------

test('the revision in effect on the class due date governs, so a later revision never rewrites past grades', () => {
  const history = profileFor([
    revision({ id: 'r1', number: 1, start: '2026-08-17', percent: 25 }),
    // The plan is revised in October and no longer reduces items.
    revision({ id: 'r2', number: 2, start: '2026-10-05', percent: 0, extra: [{ id: 'text-to-speech', params: {}, appliesTo: [] }] }),
  ], '2026-10-06');
  // The projection's windows no longer contain r1 …
  assert.ok(!history.supportPlan.windows.some((window) => window.revisionId === 'r1'));
  // … but the compact history keeps it for grading.
  assert.deepEqual(history.supportPlan.itemReductionHistory.map((row) => [row.revisionId, row.percent]), [['r1', 25], ['r2', 0]]);

  const september = assignmentOf([['practice', sameTeks(20)]], { id: 'SEPT', dueAt: '2026-09-20' });
  const october = assignmentOf([['practice', sameTeks(20)]], { id: 'OCT', dueAt: '2026-10-09' });
  assert.equal(resolveItemReductionPolicy({ profile: history, assignment: september }).percent, 25);
  assert.equal(resolveStudentWorkload({ assignment: september, profile: history }).indices.length, 15);
  assert.equal(resolveItemReductionPolicy({ profile: history, assignment: october }).status, 'none');
  assert.equal(resolveStudentWorkload({ assignment: october, profile: history }).indices.length, 20);

  // An inactive revision switches the reduction off from its start.
  const ended = profileFor([revision(), revision({ id: 'r2', number: 2, start: '2026-10-05', status: 'inactive' })], '2026-10-06');
  assert.equal(resolveStudentWorkload({ assignment: october, profile: ended }).indices.length, 20);
  assert.equal(resolveStudentWorkload({ assignment: september, profile: ended }).indices.length, 15);
});

// --- Rounding and minimum workload (one rule) ---------------------------------------------------

test('rounding: nearest whole item, ties keep the work, never zero items', () => {
  const expected = [[20, 5], [10, 2], [5, 1], [4, 1], [3, 1], [2, 0], [1, 0]];
  for (const [n, removed] of expected) {
    assert.equal(targetRemovalCount(n, 25), removed, `${n} items`);
    const assignment = assignmentOf([['practice', sameTeks(n)]]);
    const plan = planFor(assignment);
    assert.equal(plan.removedCount, removed, `${n} items, same TEKS`);
    assert.ok(n - plan.removedCount >= 1, 'at least one item remains');
  }
  assert.deepEqual(planFor(assignmentOf([['practice', sameTeks(20)]])).variance, []);
  assert.deepEqual(planFor(assignmentOf([['practice', sameTeks(4)]])).variance, []);
  assert.deepEqual(planFor(assignmentOf([['practice', sameTeks(10)]])).variance, [WORKLOAD_VARIANCE.ROUNDING]);
  assert.deepEqual(planFor(assignmentOf([['practice', sameTeks(3)]])).variance, [WORKLOAD_VARIANCE.ROUNDING]);
  assert.deepEqual(planFor(assignmentOf([['practice', sameTeks(2)]])).variance, [WORKLOAD_VARIANCE.TOO_FEW_ITEMS]);
  assert.deepEqual(planFor(assignmentOf([['dol', sameTeks(1)]])).variance, [WORKLOAD_VARIANCE.TOO_FEW_ITEMS]);
  // Other percentages use the same rule.
  assert.equal(targetRemovalCount(20, 30), 6);
  assert.equal(targetRemovalCount(7, 50), 3);
});

test('a one-question DOL stays one question, and the summary says no reduction was possible', () => {
  const assignment = assignmentOf([['dol', sameTeks(1)]]);
  const result = resolveStudentWorkload({ assignment, profile: reduced25 });
  assert.equal(result.status, WORKLOAD_STATUS.NOT_APPLICABLE);
  assert.deepEqual(result.indices, [0]);
  assert.equal(result.summary.assignedCount, 1);
  assert.equal(result.summary.actualPercentTenths, 0);
  assert.match(describeWorkloadSummary(result.summary), /no reduction possible/);
});

test('the summary reports what was delivered, never the target when they differ', () => {
  const assignment = assignmentOf([['practice', sameTeks(3)]]);
  const result = resolveStudentWorkload({ assignment, profile: reduced25 });
  assert.equal(result.summary.targetPercent, 25);
  assert.equal(result.summary.originalCount, 3);
  assert.equal(result.summary.assignedCount, 2);
  assert.equal(result.summary.actualPercentTenths, 333);
  assert.match(describeWorkloadSummary(result.summary), /33\.3% fewer \(target 25%\)/);
  assert.ok(result.summary.variance.includes(WORKLOAD_VARIANCE.ROUNDING));
});

// --- Same TEKS, same rigor ---------------------------------------------------------------------

test('coverage: four objectives keep representation; no objective disappears', () => {
  const codes = ['A.5A', 'A.2B', 'A.3C', 'A.7A'];
  const assignment = assignmentOf([['practice', rotatingTeks(20, codes)]]);
  const plan = planFor(assignment);
  assert.equal(plan.removedCount, 5);
  const keptCodes = kept(assignment, plan).map((index) => teksOfIndex(assignment, index));
  codes.forEach((code) => assert.ok(keptCodes.filter((c) => c === code).length >= 3, `${code} keeps at least 3 of 5`));
});

test('coverage: a TEKS with one item is never removed; distinct TEKS cannot be thinned', () => {
  const assignment = assignmentOf([['practice', [...sameTeks(7, 'A.5A'), q({ standard: 'A.9C' })]]]);
  const plan = planFor(assignment);
  assert.equal(plan.removedCount, 2);
  assert.ok(!plan.removed.includes(7), 'the lone A.9C item stays');

  const distinct = assignmentOf([['dol', rotatingTeks(4, ['A.5A', 'A.2B', 'A.3C', 'A.7A'])]]);
  const distinctPlan = planFor(distinct);
  assert.equal(distinctPlan.removedCount, 0);
  assert.deepEqual(distinctPlan.variance, [WORKLOAD_VARIANCE.COVERAGE]);
});

test('without TEKS metadata, removals are spread through the section, never the last items', () => {
  const assignment = assignmentOf([['practice', Array.from({ length: 12 }, () => q({ standard: undefined }))]]);
  const plan = planFor(assignment);
  assert.equal(plan.removedCount, 3);
  assert.notDeepEqual(plan.removed, [9, 10, 11]);
  const spread = Math.max(...plan.removed) - Math.min(...plan.removed);
  assert.ok(spread >= 4, `removals are spread out (${plan.removed})`);
});

test('without TEKS metadata, different tools stay different groups', () => {
  const items = [
    ...Array.from({ length: 5 }, () => q({ type: 'stepAlgebra' })),
    q({ type: 'graphing' }),
    ...Array.from({ length: 2 }, () => q({ type: 'multipleChoice' })),
  ];
  const assignment = assignmentOf([['practice', items]]);
  const plan = planFor(assignment);
  assert.equal(plan.removedCount, 2);
  assert.ok(!plan.removed.includes(5), 'the only graphing item stays');
});

test('rigor: the most-represented level gives up items first; a lone harder item is kept', () => {
  const assignment = assignmentOf([['practice', [
    ...Array.from({ length: 6 }, () => q({ standard: 'A.5A', dok: 1 })),
    q({ standard: 'A.5A', dok: 3 }),
    q({ standard: 'A.5A', dok: 2 }),
  ]]]);
  const plan = planFor(assignment, 25);
  assert.equal(plan.removedCount, 2);
  plan.removed.forEach((index) => assert.equal(workloadItemsFromAssignment(assignment)[index].question.dok, 1));
});

test('removals go to the most redundant sections first; small sections keep their items', () => {
  const assignment = assignmentOf([
    ['warmup', sameTeks(2, 'A.2A')],
    ['classwork', rotatingTeks(8, ['A.5A', 'A.5B'])],
    ['practice', rotatingTeks(8, ['A.5A', 'A.5B'])],
    ['dol', [q({ standard: 'A.5A' }), q({ standard: 'A.5B' })]],
  ]);
  const plan = planFor(assignment);
  assert.equal(plan.removedCount, 5);
  const roles = plan.removed.map((index) => roleOfIndex(assignment, index));
  assert.ok(!roles.includes('warmup') && !roles.includes('dol'));
  assert.ok(roles.filter((role) => role === 'practice').length >= roles.filter((role) => role === 'classwork').length);
});

// --- Multipart and dependent items ---------------------------------------------------------------

test('a linked group (itemGroup) is kept or omitted whole — never Part C without Part B', () => {
  const group = (name) => [q({ standard: 'A.5A', itemGroup: name }), q({ standard: 'A.5A', itemGroup: name })];
  const assignment = assignmentOf([['practice', [...group('ctx-1'), ...group('ctx-2'), ...group('ctx-3'), ...group('ctx-4')]]]);
  const plan = planFor(assignment);
  assert.equal(plan.targetRemoval, 2);
  assert.equal(plan.removedCount, 2);
  const groups = new Map();
  workloadItemsFromAssignment(assignment).forEach((item) => {
    const name = item.question.itemGroup;
    groups.set(name, [...(groups.get(name) || []), plan.removed.includes(item.storageIndex)]);
  });
  groups.forEach((flags, name) => assert.ok(flags.every(Boolean) || flags.every((flag) => !flag), `${name} is whole`));
});

test('a group larger than what is left to remove stays, and the variance says why', () => {
  const assignment = assignmentOf([['practice', [
    q({ standard: 'A.5A', itemGroup: 'g' }), q({ standard: 'A.5A', itemGroup: 'g' }), q({ standard: 'A.5A', itemGroup: 'g' }),
    q({ standard: 'A.5A' }),
  ]]]);
  const plan = planFor(assignment);
  assert.equal(plan.targetRemoval, 1);
  assert.deepEqual(plan.removed, [3]);

  const allGrouped = assignmentOf([['practice', Array.from({ length: 4 }, () => q({ standard: 'A.5A', itemGroup: 'one' }))]]);
  const groupedPlan = planFor(allGrouped);
  assert.equal(groupedPlan.removedCount, 0);
  assert.ok(groupedPlan.variance.includes(WORKLOAD_VARIANCE.COVERAGE));

  const twoGroups = assignmentOf([['practice', [
    ...Array.from({ length: 3 }, () => q({ standard: 'A.5A', itemGroup: 'big' })),
    ...Array.from({ length: 3 }, () => q({ standard: 'A.5A', itemGroup: 'big2' })),
  ]]]);
  const twoPlan = planFor(twoGroups);
  assert.equal(twoPlan.targetRemoval, 1, '6 × 25% = 1.5, a tie, keeps the work');
  assert.equal(twoPlan.removedCount, 0);
  assert.ok(twoPlan.variance.includes(WORKLOAD_VARIANCE.INDIVISIBLE_GROUP));
});

test('one multipart question (several answer parts in one record) is one item and is never split', () => {
  const assignment = assignmentOf([['classwork', [q({
    type: 'multiAnswer',
    answerFields: [{ id: 'a', answer: '1' }, { id: 'b', answer: '2' }, { id: 'c', answer: '3' }],
  })]]]);
  const result = resolveStudentWorkload({ assignment, profile: reduced25 });
  assert.deepEqual(result.indices, [0]);
  assert.equal(result.summary.variance[0], WORKLOAD_VARIANCE.TOO_FEW_ITEMS);
});

test('core items are never omitted', () => {
  const assignment = assignmentOf([['practice', [q({ standard: 'A.5A', coreItem: true }), ...sameTeks(7)]]]);
  const plan = planFor(assignment, 50);
  assert.ok(!plan.removed.includes(0));
  assert.equal(plan.removedCount, 4);
});

// --- Determinism and stability ---------------------------------------------------------------

test('deterministic on every device: same content and policy give the same items', () => {
  const build = () => {
    questionCounter = 100;
    return assignmentOf([['classwork', rotatingTeks(9, ['A.5A', 'A.5B', 'A.3C'])], ['practice', rotatingTeks(11, ['A.5A', 'A.5B'])]]);
  };
  const first = resolveStudentWorkload({ assignment: build(), profile: reduced25 });
  // A fresh load, a JSON round trip (another device), the normalized runtime view.
  const second = resolveStudentWorkload({ assignment: JSON.parse(JSON.stringify(build())), profile: JSON.parse(JSON.stringify(reduced25)) });
  const third = resolveStudentWorkload({ assignment: build(), profile: normalizeStudentProfile(reduced25) });
  assert.deepEqual(second.indices, first.indices);
  assert.deepEqual(third.indices, first.indices);
  assert.equal(second.summary.contentFingerprint, first.summary.contentFingerprint);
  assert.equal(first.indices.length, 15);
});

test('stable while the student works: answering required items never changes the set', () => {
  const assignment = assignmentOf([['classwork', rotatingTeks(8, ['A.5A', 'A.5B'])], ['practice', rotatingTeks(12, ['A.5A', 'A.5B', 'A.3C'])]]);
  const start = resolveStudentWorkload({ assignment, profile: reduced25 }).indices;
  const tracker = {};
  for (const index of start) {
    tracker[index] = { status: index % 3 ? 'correct' : 'attempted', partialCredit: 50 };
    assert.deepEqual(resolveStudentWorkload({ assignment, profile: reduced25, tracker }).indices, start, `after answering ${index}`);
  }
});

test('answered work is never dropped; the same group gives up its next unanswered item instead', () => {
  const assignment = assignmentOf([['practice', rotatingTeks(20, ['A.5A', 'A.5B'])]]);
  const plan = planFor(assignment);
  // The support was switched on after the student had answered two items it would omit.
  const tracker = Object.fromEntries(plan.removed.slice(0, 2).map((index) => [index, { status: 'correct' }]));
  const result = resolveStudentWorkload({ assignment, profile: reduced25, tracker });
  plan.removed.slice(0, 2).forEach((index) => assert.ok(result.indices.includes(index), `answered ${index} kept`));
  assert.equal(result.indices.length, 15, 'the student still gets the reduction');
  assert.deepEqual(result.keptAnswered, plan.removed.slice(0, 2));
  // And stays stable from there.
  const more = { ...tracker, [result.indices[0]]: { status: 'correct' } };
  assert.deepEqual(resolveStudentWorkload({ assignment, profile: reduced25, tracker: more }).indices, result.indices);
});

test('a higher percentage removes a superset (a change to the plan only removes more)', () => {
  const assignment = assignmentOf([['practice', rotatingTeks(24, ['A.5A', 'A.5B', 'A.3C'])]]);
  const at25 = new Set(planFor(assignment, 25).removed);
  const at40 = new Set(planFor(assignment, 40).removed);
  at25.forEach((index) => assert.ok(at40.has(index)));
});

test('a revised assignment gets a new fingerprint, and answered work survives the revision', () => {
  const original = assignmentOf([['practice', rotatingTeks(12, ['A.5A', 'A.5B'])]]);
  const before = resolveStudentWorkload({ assignment: original, profile: reduced25 });
  const tracker = Object.fromEntries(before.indices.slice(0, 6).map((index) => [index, { status: 'correct' }]));
  const revised = { ...original, sections: [{ ...original.sections[0], questions: [...original.sections[0].questions, q({ standard: 'A.5B' }), q({ standard: 'A.5A' })] }] };
  const after = resolveStudentWorkload({ assignment: revised, profile: reduced25, tracker });
  assert.notEqual(after.summary.contentFingerprint, before.summary.contentFingerprint);
  before.indices.slice(0, 6).forEach((index) => assert.ok(after.indices.includes(index)));
});

// --- Composition with a Practice Pass ---------------------------------------------------------------

test('Practice Pass + reduction compose by set difference, in either order', () => {
  const assignment = assignmentOf([
    ['warmup', sameTeks(2, 'A.2A')],
    ['classwork', rotatingTeks(8, ['A.5A', 'A.5B'])],
    ['practice', rotatingTeks(8, ['A.5A', 'A.5B'])],
    ['dol', [q({ standard: 'A.5A' }), q({ standard: 'A.5B' })]],
  ]);
  const waived = new Set(practicePassWaivedIndices(assignment));
  const withoutPass = studentRequiredQuestions({ assignment, profile: reduced25 });
  const withPass = studentRequiredQuestions({ assignment, profile: reduced25, hasPracticePass: true });
  assert.deepEqual(withPass.indices, withoutPass.indices.filter((index) => !waived.has(index)));
  // Redeeming the pass never reshuffles the other sections.
  withPass.indices.forEach((index) => assert.ok(withoutPass.indices.includes(index)));
  assert.equal(withPass.workload.originalCount, 12);
  assert.ok(withPass.workload.variance.includes(WORKLOAD_VARIANCE.PRACTICE_PASS));
  // The grade agrees with navigation.
  assert.equal(splitGrade({ assignment, practicePassRedeemed: true, supportProfile: reduced25 }).total, withPass.indices.length);
});

// --- Question families ------------------------------------------------------------------------------

test('family-backed slots: the plan reads the slot, not the generated numbers, so it is stable', () => {
  const family = (familyId) => q({ questionFamily: { id: familyId }, standard: undefined });
  const assignment = assignmentOf([['practice', [...Array.from({ length: 6 }, () => family('linear.twoStepEquation')), ...Array.from({ length: 2 }, () => family('linear.slopeFromPoints'))]]]);
  const plan = planFor(assignment);
  assert.equal(plan.removedCount, 2);
  plan.removed.forEach((index) => assert.equal(workloadItemsFromAssignment(assignment)[index].question.questionFamily.id, 'linear.twoStepEquation'));
  assert.deepEqual(planFor(JSON.parse(JSON.stringify(assignment))).removed, plan.removed);
});

// --- Scope ---------------------------------------------------------------------------------------

test('appliesTo limits the reduction to the chosen activities', () => {
  const assignment = assignmentOf([['classwork', sameTeks(8, 'A.5A')], ['practice', sameTeks(8, 'A.5B')]]);
  const plan = planFor(assignment, 25, ['practice']);
  assert.equal(plan.removedCount, 2);
  plan.removed.forEach((index) => assert.equal(roleOfIndex(assignment, index), 'practice'));
  assert.ok(plan.variance.includes(WORKLOAD_VARIANCE.LIMITED_TO_ACTIVITIES));
});

test('a secure Test Cycle is never reshaped, and the record says so', () => {
  const assignment = assignmentOf([['test', sameTeks(12)]], { assessmentPolicy: { mode: 'testCycle' } });
  const result = resolveStudentWorkload({ assignment, profile: reduced25 });
  assert.equal(result.status, WORKLOAD_STATUS.NOT_APPLICABLE);
  assert.equal(result.indices.length, 12);
  assert.deepEqual(result.summary.variance, [WORKLOAD_VARIANCE.SECURE_ASSESSMENT]);
});

// --- Grades -------------------------------------------------------------------------------------------

test('the score denominator is the student\'s own required items; omitted items are never zeros', () => {
  const assignment = assignmentOf([['practice', sameTeks(20)]]);
  const required = studentRequiredQuestions({ assignment, profile: reduced25 });
  assert.equal(required.indices.length, 15);
  const tracker = Object.fromEntries(required.indices.map((index) => [index, { status: 'correct', partialCredit: 100, bestPartialCredit: 100 }]));
  const split = splitGrade({ tracker, assignment, supportProfile: reduced25 });
  assert.equal(split.total, 15);
  assert.equal(split.attempted, 15);
  assert.equal(split.unanswered, 0);
  assert.equal(split.score, 100);
  assert.equal(split.shape, 'complete');
  assert.equal(split.reducedFrom, 20);
  // Without the profile the same tracker reads as incomplete — the bug this prevents.
  const unaware = splitGrade({ tracker, assignment });
  assert.equal(unaware.total, 20);
  assert.equal(unaware.score, 75);

  const sections = splitGradesBySection({ tracker, assignment, supportProfile: reduced25 });
  assert.equal(sections.practice.total, 15);
  assert.equal(sections.practice.reducedFrom, 20);
  const weights = gradeWeightTotals({ tracker, assignment, supportProfile: reduced25 });
  assert.equal(weights.score, 100);
});

test('a plan never touches the shared assignment', () => {
  const assignment = assignmentOf([['practice', sameTeks(8)]]);
  const before = JSON.stringify(assignment);
  resolveStudentWorkload({ assignment, profile: reduced25 });
  splitGrade({ assignment, supportProfile: reduced25 });
  assert.equal(JSON.stringify(assignment), before);
  assert.ok(!JSON.stringify(assignment).includes('teacherExcluded'));
});

test('projectStudentWorkload without a plan is the base set, in the base order', () => {
  assert.deepEqual(projectStudentWorkload({ plan: null, baseIndices: [3, 1, 2] }).indices, [3, 1, 2]);
});

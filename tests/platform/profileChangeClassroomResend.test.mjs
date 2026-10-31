/*
 * TT23 — A SUPPORT-PROFILE CHANGE RE-SENDS THE CLASSROOM GRADES IT MOVED.
 *
 * Saving a support profile writes `grades/{id}.profile` and nothing else. A
 * reduced-item-count accommodation added to, or taken off, work that is still
 * open changes which items the student owes, so it changes the grade
 * MathMaster shows at once; Classroom kept the old one until the next answer
 * or the due-date checkpoint, because neither Classroom trigger looked at the
 * profile.
 *
 * What this holds:
 *   - the helper that finds the assignments a profile change moved: the
 *     ordinary edit (a note, another support) is left alone without reading a
 *     single assignment; settled work is not looked at; and an assignment
 *     whose omitted items come out the same is not woken, because its grade is
 *     the same;
 *   - the key that makes that possible never says "same" for two profiles that
 *     resolve to different reductions (that would hide a grade change);
 *   - a push that only a profile change asked for goes out only to correct a
 *     grade Classroom already holds, and only when the grade differs;
 *   - both Classroom triggers (whole assignment, section columns) are wired to
 *     it, and before they decide they have nothing to do.
 * Parts inside one question are not reduced (design 11.9): that limit stays.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import {
  itemReductionPolicySummary, profileItemReductionKey, resolveItemReductionPolicy, studentOmittedIndices,
} from '../../functions/shared/reducedWorkload.mjs';

const require = createRequire(import.meta.url);
const { assignmentsWithChangedWorkload, profileChangeNeedsPush } = require('../../functions/lib/studentWorkloadIndices.js');

const REDUCED = 'reduced-item-count-same-rigor';
const NOW = Date.parse('2026-10-12T15:00:00Z');

// A revision the teacher saved: `savedOn` is the day it was recorded, which is
// what lets it govern work due from that day on and never earlier work.
const revision = ({
  n = 1, percent = null, appliesTo = [], status = 'active', others = [], effectiveStart = '2026-08-17', savedOn = '2026-08-17',
} = {}) => ({
  id: `r${n}`,
  revisionId: `r${n}`,
  revision: n,
  status,
  effectiveStart,
  createdAtMs: Date.parse(`${savedOn}T12:00:00Z`),
  accommodations: [
    ...(percent === null ? [] : [{ id: REDUCED, params: { itemReduction: { mode: 'percent', value: percent } }, appliesTo }]),
    ...others.map((id) => ({ id, params: {}, appliesTo: [] })),
  ],
  modifications: [],
});
const profileOf = (revisions) => buildSupportProjection({ revisions, todayKey: '2026-10-12' });

// Before: no reduction. After: 25% from the 12th of October.
const NONE = profileOf([revision({ n: 1 })]);
const REDUCED_25 = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, effectiveStart: '2026-10-12', savedOn: '2026-10-12' })]);

let questionNumber = 0;
const question = (standard) => { questionNumber += 1; return { questionId: `q${questionNumber}`, type: 'numeric', prompt: 'Solve.', standard, dok: 2 }; };
const lesson = (id, dueAt, practiceCount = 20) => ({
  id,
  schemaVersion: 5,
  dueAt,
  sections: [
    { id: 'c', role: 'classwork', questions: Array.from({ length: 6 }, (_, i) => question(i % 2 ? 'A.5A' : 'A.5B')) },
    { id: 'p', role: 'practice', questions: Array.from({ length: practiceCount }, (_, i) => question(i % 2 ? 'A.5A' : 'A.5B')) },
  ],
});
const stored = (assignment) => { const { id: _id, ...data } = assignment; return data; };

/** The reads the helper makes, counted, over a small in-memory school. */
const school = (assignments) => {
  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const reads = { anchors: [], assignments: [] };
  return {
    reads,
    readAnchors: async (ids) => {
      reads.anchors.push([...ids]);
      return new Map(ids.filter((id) => byId.has(id)).map((id) => {
        const { dueAt, dueDate, releaseAt, releaseDate } = byId.get(id);
        return [id, { dueAt, dueDate, releaseAt, releaseDate }];
      }));
    },
    readAssignment: async (id) => {
      reads.assignments.push(id);
      return byId.has(id) ? stored(byId.get(id)) : null;
    },
  };
};
const moved = async ({ before, after, assignments, trackers = {}, onError = null }) => {
  const world = school(assignments);
  const gradesByAssignment = Object.fromEntries(assignments.map((assignment) => [assignment.id, trackers[assignment.id] || {}]));
  const ids = await assignmentsWithChangedWorkload({
    beforeData: { profile: before, gradesByAssignment },
    afterData: { profile: after, gradesByAssignment },
    readAnchors: world.readAnchors,
    readAssignment: world.readAssignment,
    nowValue: NOW,
    onError,
  });
  return { ids, reads: world.reads };
};

test('a reduction added on open work moves that assignment, and settled work is never read', async () => {
  const open = lesson('open-work', '2026-10-20');
  const settled = lesson('settled-work', '2026-10-01');
  const { ids, reads } = await moved({ before: NONE, after: REDUCED_25, assignments: [open, settled] });
  assert.deepEqual(ids, ['open-work']);
  // The revision governs work due from the day it was saved: the earlier
  // assignment resolves to the same reduction before and after, from its date
  // alone, so its questions were not read.
  assert.deepEqual(reads.assignments, ['open-work']);
  assert.equal(reads.anchors.length, 1);
});

test('the omitted items really differ for the assignment it names, and not for the one it leaves', () => {
  // Independent of the helper: what the student owes on each, before and after.
  const open = lesson('open-work', '2026-10-20');
  const settled = lesson('settled-work', '2026-10-01');
  assert.equal(studentOmittedIndices({ assignment: open, profile: NONE, nowValue: NOW }).size, 0);
  assert.equal(studentOmittedIndices({ assignment: open, profile: REDUCED_25, nowValue: NOW }).size, 6, '25% of 26 items, rounded to the nearest whole item');
  assert.equal(studentOmittedIndices({ assignment: settled, profile: REDUCED_25, nowValue: NOW }).size, 0);
});

test('a reduction taken off, raised, or narrowed to other activities moves the grade too', async () => {
  const open = lesson('open-work', '2026-10-20');
  const off = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, effectiveStart: '2026-10-05', savedOn: '2026-10-05' }), revision({ n: 3, effectiveStart: '2026-10-12', savedOn: '2026-10-12' })]);
  const was25 = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, effectiveStart: '2026-10-05', savedOn: '2026-10-05' })]);
  assert.deepEqual((await moved({ before: was25, after: off, assignments: [open] })).ids, ['open-work'], 'taken off');
  const to50 = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, effectiveStart: '2026-10-05', savedOn: '2026-10-05' }), revision({ n: 3, percent: 50, effectiveStart: '2026-10-12', savedOn: '2026-10-12' })]);
  assert.deepEqual((await moved({ before: was25, after: to50, assignments: [open] })).ids, ['open-work'], 'raised');
  const practiceOnly = profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, appliesTo: ['practice'], effectiveStart: '2026-10-12', savedOn: '2026-10-12' })]);
  assert.deepEqual((await moved({ before: REDUCED_25, after: practiceOnly, assignments: [open] })).ids, ['open-work'], 'narrowed to Practice');
});

test('an assignment whose omitted items come out the same is not woken: its grade is the same', async () => {
  // Two items at 25% round to no reduction at all (design 11.5): the change
  // is real on paper and moves nothing a student owes.
  const tiny = lesson('tiny-work', '2026-10-20', 0);
  tiny.sections[0].questions.length = 2;
  const { ids, reads } = await moved({ before: NONE, after: REDUCED_25, assignments: [tiny] });
  assert.deepEqual(ids, []);
  assert.deepEqual(reads.assignments, ['tiny-work'], 'it had to be read to find that out');
  // Work the student has already answered stays required, so nothing moves.
  const open = lesson('open-work', '2026-10-20');
  const answeredAll = Object.fromEntries([...Array(26).keys()].map((index) => [index, { status: 'correct' }]));
  assert.deepEqual((await moved({ before: NONE, after: REDUCED_25, assignments: [open], trackers: { 'open-work': answeredAll } })).ids, []);
});

test('an ordinary profile edit is left alone without reading anything', async () => {
  const open = lesson('open-work', '2026-10-20');
  // The same reduction, with a read-aloud support added in a later revision.
  const withReadAloud = profileOf([
    revision({ n: 1 }),
    revision({ n: 2, percent: 25, effectiveStart: '2026-10-12', savedOn: '2026-10-12' }),
    revision({ n: 3, percent: 25, others: ['text-to-speech'], effectiveStart: '2026-10-12', savedOn: '2026-10-13' }),
  ]);
  const edit = await moved({ before: REDUCED_25, after: withReadAloud, assignments: [open] });
  assert.deepEqual(edit.ids, []);
  assert.deepEqual(edit.reads, { anchors: [], assignments: [] }, 'no reads at all');
  // And an identical profile, which is what every answer write looks like.
  const same = await moved({ before: REDUCED_25, after: REDUCED_25, assignments: [open] });
  assert.deepEqual(same.ids, []);
  assert.deepEqual(same.reads, { anchors: [], assignments: [] });
  // No profile on either side.
  const bare = await assignmentsWithChangedWorkload({ beforeData: {}, afterData: {}, readAnchors: async () => { throw new Error('read'); }, readAssignment: async () => { throw new Error('read'); } });
  assert.deepEqual(bare, []);
});

test('a student who had no profile gets a reduction; a recorded-only box moves nothing', async () => {
  const open = lesson('open-work', '2026-10-20');
  const fromNothing = await assignmentsWithChangedWorkload({
    beforeData: {},
    afterData: { profile: REDUCED_25, gradesByAssignment: { 'open-work': {} } },
    readAnchors: school([open]).readAnchors,
    readAssignment: school([open]).readAssignment,
    nowValue: NOW,
  });
  assert.deepEqual(fromNothing, ['open-work']);
  // The legacy bare box is recorded only: MathMaster chooses no items.
  const legacy = await moved({ before: { accommodations: [] }, after: { accommodations: [REDUCED] }, assignments: [open] });
  assert.deepEqual(legacy.ids, []);
});

test('it never throws: a failed read is "nothing moved", and is reported', async () => {
  const open = lesson('open-work', '2026-10-20');
  let reported = null;
  const failing = await assignmentsWithChangedWorkload({
    beforeData: { profile: NONE, gradesByAssignment: { 'open-work': {} } },
    afterData: { profile: REDUCED_25, gradesByAssignment: { 'open-work': {} } },
    readAnchors: async () => { throw new Error('quota'); },
    readAssignment: school([open]).readAssignment,
    nowValue: NOW,
    onError: (error) => { reported = error; },
  });
  assert.deepEqual(failing, []);
  assert.match(String(reported?.message), /quota/);
  // An assignment that is gone is skipped, not an error.
  const gone = await moved({ before: NONE, after: REDUCED_25, assignments: [] });
  assert.deepEqual(gone.ids, []);
});

test('the key never says "same" for profiles that resolve to different reductions', () => {
  const profiles = [
    {},
    { accommodations: [REDUCED] },
    NONE,
    REDUCED_25,
    profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, appliesTo: ['practice'], effectiveStart: '2026-10-12', savedOn: '2026-10-12' })]),
    profileOf([revision({ n: 1 }), revision({ n: 2, percent: 50, effectiveStart: '2026-10-12', savedOn: '2026-10-12' })]),
    profileOf([revision({ n: 1 }), revision({ n: 2, percent: 25, effectiveStart: '2026-10-12', savedOn: '2026-10-12' }), revision({ n: 3, status: 'inactive', effectiveStart: '2026-11-02', savedOn: '2026-10-14' })]),
    profileOf([revision({ n: 1, percent: 25 })]),
    profileOf([revision({ n: 1, percent: 25, others: ['text-to-speech'] })]),
  ];
  const anchors = [];
  for (let day = Date.parse('2026-08-01T12:00:00Z'); day <= Date.parse('2026-12-31T12:00:00Z'); day += 2 * 86400000) {
    anchors.push({ dueAt: new Date(day).toISOString() });
  }
  anchors.push({});
  let comparedPairs = 0;
  let differing = 0;
  profiles.forEach((left, i) => profiles.forEach((right, j) => {
    comparedPairs += 1;
    const policyDiffers = anchors.some((assignment) => (
      itemReductionPolicySummary(resolveItemReductionPolicy({ profile: left, assignment, nowValue: NOW }))
      !== itemReductionPolicySummary(resolveItemReductionPolicy({ profile: right, assignment, nowValue: NOW }))
    ));
    if (policyDiffers) {
      differing += 1;
      assert.notEqual(profileItemReductionKey(left), profileItemReductionKey(right), `profiles ${i} and ${j} resolve differently on some date but share a key`);
    }
  }));
  assert.ok(differing > 30, `the pairs include real differences (${differing} of ${comparedPairs})`);
  // The cases that must be cheap.
  assert.equal(profileItemReductionKey(NONE), profileItemReductionKey(profileOf([revision({ n: 1, others: ['text-to-speech'] })])), 'another support alone is not a change');
  assert.equal(profileItemReductionKey(null), 'none');
  assert.equal(profileItemReductionKey('nonsense'), 'none');
});

test('a push only a profile change asked for corrects a grade Classroom holds, and only when it differs', () => {
  assert.equal(profileChangeNeedsPush({ status: 'synced', grade: 70 }, 82), true, 'Classroom holds 70, MathMaster now says 82');
  assert.equal(profileChangeNeedsPush({ status: 'synced', grade: 82 }, 82), false, 'same grade: nothing to send');
  assert.equal(profileChangeNeedsPush({ status: 'synced', grade: '82' }, 82), false, 'a stored number as text is still the same grade');
  assert.equal(profileChangeNeedsPush({}, 82), false, 'never sent: a profile change does not start a column');
  assert.equal(profileChangeNeedsPush(null, 82), false);
  assert.equal(profileChangeNeedsPush({ status: 'failed', grade: 70 }, 82), false, 'a failed push is the teacher\'s to retry');
  assert.equal(profileChangeNeedsPush({ status: 'auth-error', grade: 70 }, 82), false);
  assert.equal(profileChangeNeedsPush({ status: 'recovery-held', grade: null }, 82), false);
  assert.equal(profileChangeNeedsPush({ status: 'synced' }, 82), true, 'a synced row with no grade recorded cannot be called the same');
});

// --- Both triggers are wired -----------------------------------------------------------------

const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const sectionEntry = readFileSync(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8');

test('the whole-assignment trigger asks first, then lets only a changed grade through', () => {
  const sync = executableSource(region(index, 'exports.syncGradeToClassroom', 'exports.queueReleasedAssessmentGrades', 'whole-assignment passback'));
  const asks = sync.indexOf('await studentWorkloadIndices.profileMovedAssignmentIds({');
  const nothingToDo = sync.indexOf('if (changedAssignmentIds.length === 0) return;');
  assert.ok(asks > 0, 'it asks which assignments the profile change moved');
  assert.ok(asks < nothingToDo, 'before it decides there is nothing to do');
  const call = region(sync, 'await studentWorkloadIndices.profileMovedAssignmentIds({', '});', 'the call');
  assert.match(call, /\bbeforeData,/);
  assert.match(call, /\bafterData,/);
  assert.match(sync, /const profileOnlyIds = new Set\(profileMovedIds\.filter\(\(id\) => !changedAssignmentIds\.includes\(id\)\)\);/);
  const joins = sync.indexOf('changedAssignmentIds.push(...profileOnlyIds);');
  assert.ok(joins > asks && joins < nothingToDo, 'the moved assignments join the list the trigger works through before it can return');
  // The gate sits between reading what Classroom was last told and the ordinary duplicate check.
  const read = sync.indexOf('const priorAudit = priorAuditSnap.exists');
  const gate = sync.indexOf('if (profileOnlyIds.has(assignmentId) && !studentWorkloadIndices.profileChangeNeedsPush(priorAudit, grade)) continue;');
  const duplicate = sync.indexOf('!forceRetry', read);
  assert.ok(read > 0 && gate > read && gate < duplicate, 'prior audit, then the profile gate, then the duplicate check');
});

test('the section-column trigger does the same', () => {
  const code = executableSource(sectionEntry);
  assert.match(code, /const studentWorkloadIndices = require\("\.\/lib\/studentWorkloadIndices"\);/);
  const sync = executableSource(region(sectionEntry, 'const syncSectionGradeToClassroom = onDocumentWritten(', '\nconst ', 'section passback'));
  const asks = sync.indexOf('await studentWorkloadIndices.profileMovedAssignmentIds({');
  const nothingToDo = sync.indexOf('if (!assignmentIds.length) return;');
  assert.ok(asks > 0 && asks < nothingToDo, 'it asks before it decides there is nothing to do');
  assert.match(sync, /const profileOnlyIds = new Set\(profileMovedIds\.filter\(\(id\) => !assignmentIds\.includes\(id\)\)\);/);
  const joins = sync.indexOf('assignmentIds.push(...profileOnlyIds);');
  assert.ok(joins > asks && joins < nothingToDo, 'the moved assignments join the list the trigger works through before it can return');
  const read = sync.indexOf('const prior = priorSnapshot.exists');
  const gate = sync.indexOf('if (profileOnlyIds.has(assignmentId) && !studentWorkloadIndices.profileChangeNeedsPush(prior, gradeResult.grade)) continue;');
  const current = sync.indexOf('sectionGradeSyncIsCurrent(', read);
  assert.ok(read > 0 && gate > read && gate < current, 'prior audit, then the profile gate, then the evidence check');
});

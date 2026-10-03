// REDUCED ITEM COUNT — WHICH REVISION GOVERNS PAST WORK.
//
// The projection keeps `supportPlan.itemReductionHistory` so an assignment is
// always graded on the item count that governed it. Two ways a later save
// could rewrite grade history are pinned here (PR #418 review):
//  - a revision saved today but dated earlier must not reshape work that was
//    already due (MathMaster applies the revision it had at the due date —
//    what the evidence report's `backdated-profile` gap already says);
//  - many revisions must not push the oldest workload policy out of the
//    bounded history.
// Synthetic revisions only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  itemReductionHistoryRow,
  resolveItemReductionPolicy,
} from '../../functions/shared/reducedWorkload.mjs';
import {
  PROFILE_LIMITS,
  buildSupportProjection,
  itemReductionTimeline,
  revisionEffectiveOn,
} from '../../functions/shared/supportProfileModel.mjs';
import { studentRequiredQuestions } from '../../src/assignmentLifecycle.js';
import { normalizeStudentProfile } from '../../src/studentSupport.js';
import { buildAssignmentEvidenceRow } from '../../src/platform/supportEvidence/evidenceAggregation.js';

const require = createRequire(import.meta.url);
const { studentOmittedFor } = require('../../functions/lib/studentWorkloadIndices.js');

const ID = 'reduced-item-count-same-rigor';
const percent = (value) => ({ itemReduction: { mode: 'percent', value } });
// Saved at noon in the school's time zone on `savedOn`.
const savedAt = (dateKey) => Date.parse(`${dateKey}T17:00:00Z`);
const rev = (id, number, start, savedOn, { params = null, status = 'active', appliesTo = [], extra = [] } = {}) => ({
  id, revisionId: id, revision: number, status, effectiveStart: start, createdAtMs: savedAt(savedOn),
  inclusionStatus: false, modifications: [],
  accommodations: [...(params ? [{ id: ID, params, appliesTo }] : []), ...extra],
});
const tts = [{ id: 'text-to-speech', params: {}, appliesTo: [] }];
const lesson = (id, dueAt) => ({
  id, title: id, schemaVersion: 5, assignedClassIds: ['class-a'], dueAt,
  sections: [{ id: 'p', role: 'practice', questions: Array.from({ length: 20 }, (_, i) => ({
    questionId: `${id}-${i}`, type: 'numeric', prompt: 'Solve.', standard: i % 2 ? 'A.5A' : 'A.5B',
  })) }],
});
const required = (profile, assignment, nowValue) => studentRequiredQuestions({
  assignment, profile: normalizeStudentProfile(profile, { nowValue }), nowValue,
}).indices.length;

test('a revision saved after the due date, dated earlier, does not reshape work that was already due', async () => {
  // Saved Oct 3, documented as effective Sept 15.
  const revisions = [
    rev('r1', 1, '2026-08-17', '2026-08-17', { extra: tts }),
    rev('r2', 2, '2026-09-15', '2026-10-03', { params: percent(25), extra: tts }),
  ];
  const now = savedAt('2026-10-04');
  const profile = buildSupportProjection({ revisions, todayKey: '2026-10-04' });
  const dueBefore = lesson('DUE-OCT1', '2026-10-01');
  const dueOnSave = lesson('DUE-OCT3', '2026-10-03');
  const dueAfter = lesson('DUE-OCT9', '2026-10-09');
  assert.equal(resolveItemReductionPolicy({ profile, assignment: dueBefore, nowValue: now }).status, 'none');
  assert.equal(required(profile, dueBefore, now), 20, 'already due: the item count (and grade) stays');
  assert.equal(required(profile, dueOnSave, now), 15, 'due the day it was saved: reduced');
  assert.equal(required(profile, dueAfter, now), 15);
  // Cloud Functions read the same history.
  assert.equal((await studentOmittedFor({ assignment: dueBefore, gradeData: { profile }, nowValue: now })).size, 0);
  assert.equal((await studentOmittedFor({ assignment: dueAfter, gradeData: { profile }, nowValue: now })).size, 5);
});

test('a backdated inactive revision does not undo a reduction already applied to past work', () => {
  const revisions = [
    rev('r1', 1, '2026-08-17', '2026-08-17', { params: percent(25) }),
    rev('r2', 2, '2026-09-01', '2026-10-03', { status: 'inactive' }),
  ];
  const now = savedAt('2026-10-04');
  const profile = buildSupportProjection({ revisions, todayKey: '2026-10-04' });
  assert.equal(required(profile, lesson('SEPT', '2026-09-20'), now), 15, 'reduced when it was due; stays reduced');
  assert.equal(required(profile, lesson('OCT', '2026-10-09'), now), 20);
});

// --- The stored history agrees with the revision timeline, every day -------------------------

const DAYS = Array.from({ length: 140 }, (_, i) => new Date(Date.UTC(2026, 7, 10 + i)).toISOString().slice(0, 10));
const lcg = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const policyOf = (row) => {
  if (!row || row.status === 'inactive' || !row.configured) return 'none';
  return row.percent ? `automatic ${row.percent} ${row.appliesTo.join(',')}` : 'manual';
};
const resolved = (profile, dateKey) => {
  const policy = resolveItemReductionPolicy({ profile, assignment: { dueAt: dateKey }, nowValue: savedAt('2026-12-31') });
  return policy.status === 'automatic' ? `automatic ${policy.percent} ${policy.appliesTo.join(',')}` : policy.status;
};

test('on every due date, the history gives the revision documented then among those MathMaster had saved by then', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const random = lcg(seed);
    const pick = (values) => values[Math.floor(random() * values.length)];
    const revisions = Array.from({ length: 1 + Math.floor(random() * 12) }, (_, i) => {
      const start = pick(DAYS.slice(5, 120));
      const saved = pick(DAYS.slice(5, 120)); // before, on or after its start
      const choice = pick(['none', 'bare', 20, 25, 40, 25]);
      return rev(`s${seed}r${i}`, i + 1, start, saved, {
        status: random() < 0.15 ? 'inactive' : 'active',
        params: choice === 'none' ? null : choice === 'bare' ? {} : percent(choice),
        appliesTo: random() < 0.3 ? ['practice'] : [],
        extra: random() < 0.5 ? tts : [],
      });
    });
    const profile = buildSupportProjection({ revisions, todayKey: '2026-10-01' });
    DAYS.forEach((day) => {
      const inPlatform = revisionEffectiveOn(revisions, day, { recordedBy: Date.parse(`${day}T23:00:00Z`) });
      assert.equal(resolved(profile, day), policyOf(inPlatform && itemReductionHistoryRow(inPlatform)), `seed ${seed}, due ${day}`);
    });
  }
});

// --- The bound ---------------------------------------------------------------------------------

test('revisions that change other supports add no history rows, so the oldest policy is never pushed out', () => {
  // 45 saves, one a day; the 25% reduction is set once, on the first.
  const revisions = Array.from({ length: 45 }, (_, i) => rev(`r${i + 1}`, i + 1, DAYS[10 + i], DAYS[10 + i], {
    params: percent(25), extra: i % 2 ? tts : [],
  }));
  const profile = buildSupportProjection({ revisions, todayKey: DAYS[60] });
  assert.equal(profile.supportPlan.itemReductionHistory.length, 1);
  assert.equal(resolved(profile, DAYS[11]), 'automatic 25 ', 'work due in the first week keeps its reduction');
  assert.equal(profile.supportPlan.itemReductionHistory[0].revisionId, 'r1', 'recorded under the revision that set it');
});

test('past the bound, the oldest policy changes fold into an undated baseline instead of disappearing', () => {
  // 45 saves that each change the percentage.
  const revisions = Array.from({ length: 45 }, (_, i) => rev(`r${i + 1}`, i + 1, DAYS[10 + i], DAYS[10 + i], {
    params: percent(i % 2 ? 30 : 20),
  }));
  const rows = itemReductionTimeline(revisions);
  assert.equal(rows.length, PROFILE_LIMITS.itemReductionHistory);
  assert.equal(rows[0].effectiveStart, null);
  const profile = buildSupportProjection({ revisions, todayKey: DAYS[60] });
  // Inside the kept rows — and on the latest folded day — the history is exact.
  const firstExact = 10 + (45 - PROFILE_LIMITS.itemReductionHistory);
  for (let day = firstExact; day < 60; day += 1) {
    assert.equal(resolved(profile, DAYS[day]), policyOf(itemReductionHistoryRow(revisionEffectiveOn(revisions, DAYS[day]))), DAYS[day]);
  }
  // Older work keeps an automatic reduction rather than reverting to every item.
  assert.match(resolved(profile, DAYS[10]), /^automatic /);
});

// --- What the evidence report says about it ----------------------------------------------------

test('the report explains a backdated reduction on already-due work, instead of a missing record', () => {
  const revisions = [
    rev('r1', 1, '2026-08-17', '2026-08-17', { extra: tts }),
    { ...rev('r2', 2, '2026-09-15', '2026-10-03', { params: percent(25) }), sourceLabel: 'IEP (synthetic)' },
  ];
  const now = savedAt('2026-10-05');
  const assignment = lesson('LATE', '2026-10-01');
  // Worked late, after the revision was saved.
  const tracker = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-04T15:00:00Z' }]));
  const row = buildAssignmentEvidenceRow({
    assignment,
    student: { id: 'S', classId: 'class-a', profile: buildSupportProjection({ revisions, todayKey: '2026-10-05' }), gradesByAssignment: { LATE: tracker } },
    revisions, evidence: [], nowValue: now,
  });
  const codes = row.gaps.map((gap) => gap.code);
  assert.ok(codes.includes('automatic-saved-after-due'), codes.join());
  assert.ok(codes.includes('backdated-profile'));
  assert.ok(!codes.includes('automatic-not-recorded'));
  assert.match(row.gaps.find((gap) => gap.code === 'automatic-saved-after-due').message, /kept the item count in effect then/);
});

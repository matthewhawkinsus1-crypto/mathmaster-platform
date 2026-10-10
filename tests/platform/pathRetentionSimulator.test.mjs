/*
 * RETENTION THAT WORKS (student push D, item 5) — the Teacher Path Simulator.
 *
 * A teacher previewing a student's week must see the retention check that
 * student would get: a Retention slot run as the two-question check (never as
 * practice, never routed into a repair excursion), filling its slot by the one
 * completion rule, and moving the simulated student's retention schedule by
 * the server's own verdict (functions/shared/pathRetentionCheck.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PURPOSE } from '../../src/platform/path/recommendationV2.js';
import { RETENTION_PROBE, retentionCheckOutcome } from '../../functions/shared/pathRetentionCheck.mjs';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { matchWeeklyGoalCompletions } from '../../functions/shared/weeklyPathGrade.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T15:00:00Z');
const WEEK = '2026-10-05';
const ORIGIN = 'A.5C';

const slot = (n, teks, purpose) => ({
  slot: n,
  weeklySlotKey: `${n}|teks:${teks}|${teks}|${purpose}|course|2|3`,
  skillId: `teks:${teks}`,
  teksCode: teks,
  purpose,
  context: 'course',
  dok: 2,
  difficultyBand: 3,
});

const question = (prompt) => ({ type: 'algebra', prompt, equationLatex: '2x + 5 = 13', teks: ORIGIN });
const ASSIGNMENTS = [{
  id: 'unit',
  title: 'Unit',
  questions: [question('Solve.'), question('Solve for x.'), question('Solve and check.'), { type: 'algebra', prompt: 'One step.', equationLatex: 'x + 1 = 2', teks: 'A.5A' }],
}];

const runtimeFor = (retentionSchedulesByTEKS = {}) => {
  const changes = [];
  const runtime = createTeacherPathRuntime({ assignments: ASSIGNMENTS, courseId: 'algebra1', retentionSchedulesByTEKS, onChange: (payload) => changes.push(payload) });
  return { runtime, changes };
};

const answer = async (runtime, sessionId, isCorrect) => {
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId });
  const result = await runtime.submitStudentResponse({
    sessionId, questionInstanceId: questionInstance.questionInstanceId, isCorrect, supportUsage: { isMathematicallyIndependent: true },
  });
  return { questionInstance, result };
};

test('the simulator runs a weekly Retention slot as the two-question check, never routed, and it fills the slot', async () => {
  const due = { [ORIGIN]: { teksCode: ORIGIN, status: 'due', nextCheckDueAt: NOW - DAY, successfulCheckCount: 0 } };
  const { runtime, changes } = runtimeFor(due);
  const retentionSlot = slot(2, ORIGIN, PURPOSE.RETENTION);
  // Asked for as practice — an old launch — and run as the check anyway.
  const { session } = await runtime.startOrResumePathSession({
    targetAlignmentKey: ORIGIN, sessionKind: 'practice', weekKey: WEEK, weeklySlotKey: retentionSlot.weeklySlotKey, weeklySlot: 2, weeklyPurpose: PURPOSE.RETENTION,
  });
  assert.equal(session.sessionKind, RETENTION_PROBE);
  assert.equal(session.requiredQuestions, 2);

  const first = await answer(runtime, session.sessionId, false);
  assert.equal(first.questionInstance.attemptsAllowed, 1, 'a check measures what the student can do now: one attempt');
  assert.equal(first.result.grading.questionFinalized, true);
  assert.equal(first.result.decision, null, 'a miss on a check is a verdict, not a repair excursion');
  assert.equal(first.result.session.status, 'active');
  assert.equal(first.result.session.currentSkillCode, ORIGIN);
  assert.equal(first.result.session.excursion, null);

  const second = await answer(runtime, session.sessionId, true);
  assert.equal(second.result.session.status, 'completed');
  assert.equal(second.result.session.retentionOutcome, 'failed');
  const published = changes.filter((change) => change.retentionSchedulesByTEKS).at(-1);
  assert.ok(published, 'the moved schedule is published back to the simulated student');
  assert.equal(published.retentionSchedulesByTEKS[ORIGIN].status, 'concern');
  assert.equal(published.retentionSchedulesByTEKS[ORIGIN].nextCheckDueAt, NOW - DAY, 'a miss keeps the check due');

  const goal = { weekKey: WEEK, goalSessions: 2, assignmentState: 'assigned', sessions: [slot(1, 'A.5A', PURPOSE.CURRENT_LEARNING), retentionSlot] };
  const { completions } = collectWeeklyPathSessions({ sessions: runtime.listPathSessions(), weekKey: WEEK });
  assert.deepEqual(matchWeeklyGoalCompletions({ goal, completions }).matched.map((entry) => entry.matchedSlot), [2]);
});

test('a passed simulated check moves the schedule exactly as the server would', async () => {
  const { runtime, changes } = runtimeFor({});
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, sessionKind: RETENTION_PROBE, requiredQuestions: 5 });
  assert.equal(session.requiredQuestions, 2, 'a check is two questions whatever was asked for');
  await answer(runtime, session.sessionId, true);
  const done = await answer(runtime, session.sessionId, true);
  assert.equal(done.result.session.retentionOutcome, 'passed');
  const completedAt = runtime.listPathSessions().find((entry) => entry.id === session.sessionId).data.completedAt;
  const expected = retentionCheckOutcome({ teksCode: ORIGIN, summary: done.result.session.summary, currentSchedule: {}, now: completedAt });
  const published = changes.filter((change) => change.retentionSchedulesByTEKS).at(-1);
  assert.deepEqual(published.retentionSchedulesByTEKS[ORIGIN], expected.schedule);
  assert.equal(runtime.getRetentionSchedules(), published.retentionSchedulesByTEKS);
  assert.equal(changes.filter((change) => change.retentionSchedulesByTEKS).length, 1,
    'only a finished check publishes schedules, so a routine publish cannot overwrite a forced one');
});

test('the simulator refuses a check smuggled onto another slot and resumes a slot\'s own open session', async () => {
  const { runtime } = runtimeFor({});
  await assert.rejects(
    () => runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, sessionKind: RETENTION_PROBE, weekKey: WEEK, weeklySlotKey: 'k1', weeklySlot: 1, weeklyPurpose: PURPOSE.CURRENT_LEARNING }),
    /Retention check slot/,
  );
  const opened = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, weekKey: WEEK, weeklySlotKey: 'k3', weeklySlot: 3, weeklyPurpose: PURPOSE.CURRENT_LEARNING });
  const again = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, weekKey: WEEK, weeklySlotKey: 'k3', weeklySlot: 3, weeklyPurpose: PURPOSE.RETENTION });
  assert.equal(again.session.sessionId, opened.session.sessionId, 'the slot\'s open session is resumed whatever kind it was opened as');
  assert.equal(again.resumed, true);

  const practice = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN });
  const check = await runtime.startOrResumePathSession({ targetAlignmentKey: ORIGIN, sessionKind: RETENTION_PROBE });
  assert.notEqual(check.session.sessionId, practice.session.sessionId, 'open practice is not resumed as a check');
  assert.equal(check.session.sessionKind, RETENTION_PROBE);
});

test('the simulator hands schedules in and takes moved ones back to the simulated student', () => {
  const experience = executableSource(read('src/components/teacher/SimulatedStudentExperience.jsx'));
  const created = region(experience, 'const runtime = useMemo(() => (pathBankQuestions ? createTeacherPathRuntime({', '}) : null)', 'runtime creation');
  assert.match(created, /retentionSchedulesByTEKS: retentionSchedulesRef\.current,/);
  assert.match(created, /\.\.\.\(nextSchedules \? \{ retentionSchedulesByTEKS: nextSchedules \} : \{\}\)/);
  assert.match(experience, /useEffect\(\(\) => \{ runtime\?\.syncRetentionSchedules\?\.\(retentionSchedulesByTEKS\); \}, \[runtime, retentionSchedulesByTEKS\]\);/);

  const simulator = executableSource(read('src/components/teacher/PathSimulator.jsx'));
  const handler = region(simulator, 'onSimulatedEvidence={({', 'onStartAssignment=', 'the evidence handler');
  assert.match(handler, /retentionSchedulesByTEKS: nextSchedules \}\) => \{/);
  assert.match(handler, /\.\.\.\(nextSchedules \? \{ retentionSchedulesByTEKS: nextSchedules \} : \{\}\),/);
});

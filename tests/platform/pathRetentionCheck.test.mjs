/*
 * RETENTION THAT WORKS (student push D, item 5) — the rule and the server.
 * (The screens: pathRetentionLaunch.test.mjs. The simulator:
 * pathRetentionSimulator.test.mjs.)
 *
 * Only a `retentionProbe` session moves a student's retention schedule, and
 * the weekly Retention slot used to launch ordinary practice. The practice
 * filled the slot, the schedule never moved, and the same check was due again
 * the next week: a Retention slot could never clear itself.
 *
 * These tests pin the one rule (functions/shared/pathRetentionCheck.mjs), that
 * the secure server applies it at both ends of a session, and that a finished
 * check fills its weekly slot by the one completion rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  RETENTION_CHECK_LAUNCH,
  RETENTION_PROBE,
  RETENTION_PROBE_QUESTIONS,
  RETENTION_PURPOSE,
  canResumeOpenSession,
  nextRetentionCheckDueAt,
  resolveWeeklySlotSessionKind,
  retentionCheckOutcome,
} from '../../functions/shared/pathRetentionCheck.mjs';
import { PURPOSE } from '../../src/platform/path/recommendationV2.js';
import { calculateNextRetentionDueDate } from '../../src/platform/retention/retentionScheduler.js';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions } from '../../functions/shared/weeklyPathGrade.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T15:00:00Z');

// --- The slot decides the session kind ---------------------------------------

test('a Retention slot launches a retention check, whatever the browser asked for', () => {
  assert.equal(RETENTION_PURPOSE, PURPOSE.RETENTION, 'the rule must name the planner\'s own retention purpose');
  for (const requestedSessionKind of ['practice', RETENTION_PROBE, undefined]) {
    const launch = resolveWeeklySlotSessionKind({ slotPurpose: PURPOSE.RETENTION, requestedSessionKind });
    assert.equal(launch.ok, true);
    assert.equal(launch.sessionKind, RETENTION_PROBE,
      `a Retention slot asked for as ${requestedSessionKind} must still be a retention check`);
    assert.equal(launch.requiredQuestions, RETENTION_PROBE_QUESTIONS);
  }
  assert.deepEqual(RETENTION_CHECK_LAUNCH, { sessionKind: RETENTION_PROBE, requiredQuestions: 2 });
});

test('a retention check smuggled onto any other slot is refused; practice there is unchanged', () => {
  const others = Object.values(PURPOSE).filter((purpose) => purpose !== PURPOSE.RETENTION);
  assert.ok(others.length >= 5);
  for (const slotPurpose of [...others, null, '']) {
    const smuggled = resolveWeeklySlotSessionKind({ slotPurpose, requestedSessionKind: RETENTION_PROBE });
    assert.equal(smuggled.ok, false, `a two-question check must not fill a ${slotPurpose || 'purpose-less'} slot`);
    assert.equal(smuggled.reason, 'retention-check-needs-retention-slot');
    assert.match(smuggled.message, /Retention check slot/);

    const practice = resolveWeeklySlotSessionKind({ slotPurpose, requestedSessionKind: 'practice' });
    assert.deepEqual([practice.ok, practice.sessionKind], [true, 'practice']);
  }
});

test('a weekly slot resumes its own open session whatever it was opened as; open practice does not', () => {
  // Practice opened on a Retention slot before it became a check: the slot key
  // is in the lock, so this is that slot's session and it is resumed.
  assert.equal(canResumeOpenSession({ existingSessionKind: 'practice', sessionKind: RETENTION_PROBE, weeklySlotKey: '2|teks:A.2D|A.2D|retention|course|2|3' }), true);
  // An open-practice lock is shared by every session on the TEKS, so a
  // different kind there is a different activity to finish first.
  assert.equal(canResumeOpenSession({ existingSessionKind: 'practice', sessionKind: RETENTION_PROBE, weeklySlotKey: null }), false);
  assert.equal(canResumeOpenSession({ existingSessionKind: RETENTION_PROBE, sessionKind: 'practice', weeklySlotKey: '' }), false);
  assert.equal(canResumeOpenSession({ existingSessionKind: RETENTION_PROBE, sessionKind: RETENTION_PROBE }), true);
  assert.equal(canResumeOpenSession({ existingSessionKind: undefined, sessionKind: 'practice' }), true,
    'a session stored before sessionKind existed is practice');
});

// --- What a finished check concludes -----------------------------------------

test('a passed check moves the next one out; a missed check marks a concern and stays due', () => {
  const due = { teksCode: 'A.2D', status: 'scheduled', lastVerifiedAt: NOW - 40 * DAY, nextCheckDueAt: NOW - 10 * DAY, successfulCheckCount: 0, note: 'kept' };

  const first = retentionCheckOutcome({ teksCode: 'A.2D', summary: { completedQuestions: 2, independentSuccesses: 2 }, currentSchedule: due, now: NOW });
  assert.equal(first.passed, true);
  assert.equal(first.outcome, 'passed');
  assert.deepEqual(first.schedule, {
    ...due, teksCode: 'A.2D', status: 'scheduled', lastVerifiedAt: NOW, successfulCheckCount: 1, nextCheckDueAt: NOW + 30 * DAY, daysOverdue: 0,
  });
  const second = retentionCheckOutcome({ teksCode: 'A.2D', summary: { completedQuestions: 2, independentSuccesses: 2 }, currentSchedule: first.schedule, now: NOW + 31 * DAY });
  assert.equal(second.schedule.successfulCheckCount, 2);
  assert.equal(second.schedule.nextCheckDueAt, NOW + 31 * DAY + 60 * DAY);

  // Right, but with a hint on one: not a pass. The due date does not move.
  const hinted = retentionCheckOutcome({ teksCode: 'A.2D', summary: { completedQuestions: 2, correctQuestions: 2, independentSuccesses: 1 }, currentSchedule: due, now: NOW });
  assert.equal(hinted.passed, false);
  assert.equal(hinted.outcome, 'failed');
  assert.deepEqual(hinted.schedule, { ...due, teksCode: 'A.2D', status: 'concern', lastFailedCheckAt: NOW });

  const empty = retentionCheckOutcome({ teksCode: 'A.2D', summary: {}, currentSchedule: undefined, now: NOW });
  assert.deepEqual(empty.schedule, { teksCode: 'A.2D', status: 'concern', lastFailedCheckAt: NOW });
});

test('the shared horizon, the server helper and the client scheduler agree: 14, 30, then 60 days', () => {
  [[0, 14], [1, 30], [2, 60], [5, 60]].forEach(([count, days]) => {
    assert.equal(nextRetentionCheckDueAt(NOW, count), NOW + days * DAY);
    assert.equal(mathPath.nextRetentionDue(NOW, count), nextRetentionCheckDueAt(NOW, count));
    assert.equal(calculateNextRetentionDueDate(NOW, count, NOW), nextRetentionCheckDueAt(NOW, count));
  });
});

// --- The secure server applies the rule at both ends --------------------------

const server = executableSource(read('functions/index.js'));
const start = region(server, 'exports.startMyMathPathSession', 'exports.issueNextQuestion', 'startMyMathPathSession');
const submit = region(server, 'exports.submitPathResponse', 'exports.submitModelingLab', 'submitPathResponse');

test('startMyMathPathSession settles the kind from the frozen slot purpose before anything is written', () => {
  assert.match(start, /let sessionKind = request\.data\?\.sessionKind === "retentionProbe" \? "retentionProbe" : "practice";/);
  assert.match(start, /const retentionCheck = await import\("\.\/shared\/pathRetentionCheck\.mjs"\);/);

  const decision = region(start, 'if (weeklySlot) {', 'const coursePracticeIntent', 'the weekly kind decision');
  assert.match(decision, /retentionCheck\.resolveWeeklySlotSessionKind\(\{ slotPurpose: weeklySlot\.purpose, requestedSessionKind: sessionKind \}\)/,
    'the slot\'s FROZEN purpose decides, never a purpose the browser sent');
  assert.match(decision, /if \(!weeklyKind\.ok\) throw new HttpsError\("failed-precondition", weeklyKind\.message/,
    'a retention check asked for on another slot is refused');
  assert.match(decision, /sessionKind = weeklyKind\.sessionKind;\s*\n\s*requiredQuestions = pathSessionRequiredQuestions\(sessionKind, /,
    'a Retention slot asked for as practice becomes the two-question check');

  // Order: the slot must be resolved first, and the kind settled before the
  // pass-level decision, the lock and the session document read it.
  const slotFound = start.indexOf('weeklySlot = (Array.isArray(weeklyGoal.sessions)');
  const decided = start.indexOf('retentionCheck.resolveWeeklySlotSessionKind(');
  assert.ok(slotFound > 0 && decided > slotFound, 'the kind is decided from the slot the server resolved');
  for (const reader of ['const coursePracticeIntent = requestedCoursePracticeIntent', 'const lockId = mathPath.opaqueId("pathlock"', 'const next = {']) {
    const at = start.indexOf(reader);
    assert.ok(at > decided, `${reader} must read the settled kind`);
  }
  assert.match(start, /const next = \{[\s\S]*?\n\s+sessionKind,\n/, 'the session document records the settled kind');
});

test('a weekly slot\'s open session is resumed whatever kind it was opened as', () => {
  const resume = region(start, 'const lock = await transaction.get(lockRef);', 'const releaseAction', 'the lock resume');
  assert.match(
    resume,
    /if \(!retentionCheck\.canResumeOpenSession\(\{ existingSessionKind: existing\.data\(\)\?\.sessionKind, sessionKind, weeklySlotKey: requestedWeeklySlotKey \}\)\) \{\s*\n\s*throw new HttpsError\("failed-precondition", "Finish the active session for this TEKS before starting a different check\."\);/,
  );
  assert.doesNotMatch(resume, /existing\.data\(\)\?\.sessionKind !== sessionKind/,
    'a bare kind comparison strands practice opened on a Retention slot before it became a check');
  // The resume rule leans on the slot key being in the lock, at both ends.
  assert.match(start, /const lockId = mathPath\.opaqueId\("pathlock", studentId, targetAlignmentKey, assessmentFramework \|\| "course", requestedWeeklySlotKey \|\| "open-practice"\);/);
  assert.match(submit, /mathPath\.opaqueId\("pathlock", studentId, session\.target\.alignmentKey, session\.assessmentFramework \|\| "course", session\.weeklySlotKey \|\| "open-practice"\)/);
});

test('every finished retention check, weekly or not, completes and writes the shared verdict', () => {
  assert.match(submit, /if \(session\.sessionKind === "retentionProbe"\) \{\s*\n\s*if \(nextSummary\.completedQuestions >= Number\(session\.requiredQuestions \|\| 2\)\) nextStatus = "completed";/,
    'a check counts its questions and completes, so it fills its weekly slot');
  assert.match(submit, /if \(nextStatus === "completed" && session\.sessionKind === "retentionProbe"\) retentionSnapshot = await transaction\.get\(retentionRef\);/,
    'the schedule is read for every finished check — a weekly slot key must not exclude it');

  const write = region(submit, 'if (retentionSnapshot) {', 'if (questionFinalized && currentQuestion.assessmentContext', 'the retention write');
  assert.match(write, /const \{ retentionCheckOutcome \} = await import\("\.\/shared\/pathRetentionCheck\.mjs"\);/);
  assert.match(write, /retentionCheckOutcome\(\{\s*teksCode: displayCode,\s*summary: nextSummary,\s*currentSchedule: schedules\[displayCode\] \|\| \{\},\s*now,\s*\}\)/);
  assert.match(write, /transaction\.set\(retentionRef, \{ schedules: \{ \.\.\.schedules, \[displayCode\]: verdict\.schedule \}, updatedAt: now \}, \{ merge: true \}\);/);
  assert.match(write, /nextSession\.retentionOutcome = verdict\.outcome;/);
  assert.doesNotMatch(write, /independentSuccesses >= 2/, 'the pass rule has one home, the shared module');
});

test('a retention check is never a numbered course pass', () => {
  const passes = region(server, 'async function loadCoursePathPassProgress', '\n}\n', 'course pass progress');
  assert.match(passes, /if \(session\.sessionKind === "retentionProbe"\) return;/);
  assert.match(passes, /if \(session\.weeklySlotKey\) return;/);
  assert.match(start, /coursePassLevel: assessmentFramework \|\| sessionKind === "retentionProbe" \? null : coursePassLevel,/);
});

// --- A finished check fills its slot by the one completion rule ---------------

const WEEK = '2026-10-05';
const MON = Date.parse(`${WEEK}T15:00:00Z`);
const slotKey = (n, teks, purpose) => `${n}|teks:${teks}|${teks}|${purpose}|course|2|3`;
const goal = {
  weekKey: WEEK,
  goalSessions: 2,
  assignmentState: 'assigned',
  dueAt: MON + 6 * DAY,
  sessions: [
    { slot: 1, weeklySlotKey: slotKey(1, 'A.5A', PURPOSE.CURRENT_LEARNING), teksCode: 'A.5A', purpose: PURPOSE.CURRENT_LEARNING, context: 'course' },
    { slot: 2, weeklySlotKey: slotKey(2, 'A.2D', PURPOSE.RETENTION), teksCode: 'A.2D', purpose: PURPOSE.RETENTION, context: 'course' },
  ],
};
const probe = (overrides = {}) => ({
  studentId: 's1',
  sessionKind: RETENTION_PROBE,
  status: 'active',
  weekKey: WEEK,
  weeklySlotKey: goal.sessions[1].weeklySlotKey,
  weeklySlot: 2,
  weeklyPurpose: PURPOSE.RETENTION,
  requiredQuestions: RETENTION_PROBE_QUESTIONS,
  target: { alignmentKey: 'texas:A.2D' },
  summary: { completedQuestions: 1, correctQuestions: 1, independentSuccesses: 1 },
  createdAt: MON,
  updatedAt: MON + 1000,
  ...overrides,
});

test('a finished retention check fills its Retention slot; a half-done one offers Resume', () => {
  const half = collectWeeklyPathSessions({ sessions: [{ id: 'p1', data: probe() }], weekKey: WEEK });
  assert.deepEqual(half.completions, []);
  assert.equal(half.inProgress.length, 1);
  assert.equal(half.inProgress[0].requiredQuestions, 2, 'Resume reads "1 of 2 answered", not "1 of 5"');
  assert.equal(half.inProgress[0].answeredQuestions, 1);

  const done = probe({ status: 'completed', completedAt: MON + 5000, summary: { completedQuestions: 2, correctQuestions: 2, independentSuccesses: 2 }, retentionOutcome: 'passed' });
  const { completions } = collectWeeklyPathSessions({ sessions: [{ id: 'p1', data: done }], weekKey: WEEK, displayTeks: (key) => key.split(':').pop() });
  assert.equal(completions.length, 1);
  assert.equal(completions[0].sessionKind, RETENTION_PROBE);
  assert.equal(completions[0].accuracy, 1);

  const matched = matchWeeklyGoalCompletions({ goal, completions }).matched;
  assert.deepEqual(matched.map((entry) => entry.matchedSlot), [2], 'the check fills the Retention slot, and only that one');
  const progress = evaluateWeeklyGoalProgress({ goal, completions, now: MON + 6000 });
  assert.equal(progress.completed, 1);
  assert.equal(progress.remaining, 1);

  // A missed check is still a finished session: the week counts the effort,
  // the schedule records the concern.
  const missed = probe({ status: 'completed', completedAt: MON + 5000, summary: { completedQuestions: 2, correctQuestions: 0, independentSuccesses: 0 }, retentionOutcome: 'failed' });
  const missedFacts = collectWeeklyPathSessions({ sessions: [{ id: 'p2', data: missed }], weekKey: WEEK });
  assert.deepEqual(matchWeeklyGoalCompletions({ goal, completions: missedFacts.completions }).matched.map((entry) => entry.matchedSlot), [2]);
});

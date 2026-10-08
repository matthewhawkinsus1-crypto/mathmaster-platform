/*
 * THE SESSION END SCREEN (student push D, item 4).
 *
 *   1. What comes next: "Start session N of M" while the week has slots left,
 *      "Weekly target reached!" when this session completed it — both read
 *      from the week WITH this session counted by the server's rule — and
 *      otherwise "Back to My Math Path".
 *   2. The recap of missed questions (rules: pathSessionRecap.test.mjs), asked
 *      for only once the session is completed, and the same in the simulator.
 *   3. "Skills that moved": the unified mastery frozen at session start against
 *      the live server profile once the background trigger lands.
 *
 * The screen's wiring to these rules, and the removal of copy claiming free
 * practice is locked or unlocked, are in pathSessionEndWiring.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SESSION_END_STEP,
  chooseSessionEndNextStep,
  describeWeeklySessionEnd,
  sessionLaunchKey,
} from '../../src/platform/path/pathSessionEnd.js';
import {
  SKILLS_MOVED_STATE,
  describeSessionSkillsMoved,
  describeSkillMoves,
  formatSkillMove,
  sessionEvidenceLanded,
  sessionSkillCodes,
  snapshotMasteryAtSessionStart,
} from '../../src/platform/mastery/sessionSkillMovement.js';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// --- 1. What comes next ------------------------------------------------------

const WEEK = '2026-10-05';
const MON = Date.parse(`${WEEK}T15:00:00Z`);
const slot = (n, teks, label) => ({
  slot: n, weeklySlotKey: `${n}|teks:${teks}|${teks}|current|course|2|3`, teksCode: teks, context: 'course', studentLabel: label,
});
const goal = {
  weekKey: WEEK, goalSessions: 3, assignmentState: 'assigned', dueAt: MON + 6 * 86400000,
  sessions: [slot(1, 'A.5A', 'Solving linear equations'), slot(2, 'A.2C', 'Writing linear equations'), slot(3, 'A.3B', 'Rate of change')],
};
const pathSession = (n, overrides = {}) => ({
  sessionId: `p${n}`, studentId: 's1', status: 'completed', weekKey: WEEK,
  weeklySlotKey: goal.sessions[n - 1].weeklySlotKey, weeklySlot: n,
  target: { alignmentKey: `texas:${goal.sessions[n - 1].teksCode}` },
  summary: { completedQuestions: 5, correctQuestions: 4 }, completedAt: MON + n * 1000,
  ...overrides,
});
// A completion as the weekly callable returns it.
const completion = (n) => ({
  status: 'completed', sessionId: `p${n}`, completedAt: MON + n * 1000, teksCode: goal.sessions[n - 1].teksCode,
  weekKey: WEEK, weeklySlotKey: goal.sessions[n - 1].weeklySlotKey, weeklySlot: n,
});

test('a finished weekly session leads to the next undone slot, counted with this session included', () => {
  // The completions were loaded before this session finished: slot 1 is not in
  // them yet, and must not be offered again.
  const end = describeWeeklySessionEnd({ goal, completions: [], finishedSession: pathSession(1), now: MON + 2000 });
  assert.equal(end.status, 'ready');
  assert.equal(end.counted, true);
  assert.equal(end.goalComplete, false);
  assert.equal(end.nextSession.slot, 2);
  assert.deepEqual([end.required, end.completed, end.remaining], [3, 1, 2]);

  const step = chooseSessionEndNextStep({ session: pathSession(1), weeklyEnd: end, canStartNext: true });
  assert.equal(step.kind, SESSION_END_STEP.START_NEXT_WEEKLY);
  assert.equal(step.nextSession.slot, 2);
  assert.equal(step.required, 3);
  assert.equal(step.remaining, 2);
});

test('slots already done are skipped, and a slot the student already opened is resumed', () => {
  const end = describeWeeklySessionEnd({
    goal,
    completions: [completion(2)],
    inProgress: [{ status: 'active', weeklySlotKey: goal.sessions[2].weeklySlotKey, answeredQuestions: 2, requiredQuestions: 5 }],
    finishedSession: pathSession(1),
  });
  assert.equal(end.nextSession.slot, 3);
  assert.equal(end.nextInProgress.answeredQuestions, 2);
  // A slot swapped to another skill keeps its frozen key, so the swap is what
  // is offered next.
  const swapped = { ...goal, sessions: goal.sessions.map((entry) => (entry.slot === 3 ? { ...entry, studentLabel: 'Graphing lines', chosenSkillId: 'teks:A.3C' } : entry)) };
  assert.equal(describeWeeklySessionEnd({ goal: swapped, completions: [completion(2)], finishedSession: pathSession(1) }).nextSession.studentLabel, 'Graphing lines');
});

test('the session that finishes the week says so — and a paused one never does', () => {
  const last = describeWeeklySessionEnd({ goal, completions: [completion(1), completion(2)], finishedSession: pathSession(3) });
  assert.equal(last.goalComplete, true);
  assert.equal(last.nextSession, null);
  const step = chooseSessionEndNextStep({ session: pathSession(3), weeklyEnd: last, canStartNext: true });
  assert.deepEqual(step, { kind: SESSION_END_STEP.WEEKLY_GOAL_COMPLETE, required: 3 });

  // Status is the server's word for "counts". A session paused for teacher
  // support is not a completion, however many questions it answered.
  const paused = pathSession(3, { status: 'teacherSupportNeeded' });
  const pausedEnd = describeWeeklySessionEnd({ goal, completions: [completion(1), completion(2)], finishedSession: paused });
  assert.equal(pausedEnd.counted, false);
  assert.equal(pausedEnd.goalComplete, false);
  assert.equal(chooseSessionEndNextStep({ session: paused, weeklyEnd: pausedEnd, completesWeeklyGoal: true, canStartNext: true }).kind,
    SESSION_END_STEP.BACK_TO_PATH);
  // Nor while the week is still loading, whatever the launch-time flag said.
  assert.equal(chooseSessionEndNextStep({ session: paused, weeklyEnd: { status: 'loading' }, completesWeeklyGoal: true }).kind,
    SESSION_END_STEP.BACK_TO_PATH);
  // A week that was already complete is not "completed by" a session that
  // did not itself count.
  const alreadyDone = describeWeeklySessionEnd({ goal, completions: [completion(1), completion(2), completion(3)], finishedSession: { ...paused, sessionId: 'p3-again' } });
  assert.equal(alreadyDone.goalComplete, false);
});

test('before the week has loaded, only the launch-time flag can declare the goal met; nothing is offered from a guess', () => {
  const loading = describeWeeklySessionEnd({ goal, completions: null, finishedSession: pathSession(1) });
  assert.deepEqual(loading, { status: 'loading' });
  assert.equal(chooseSessionEndNextStep({ session: pathSession(1), weeklyEnd: loading, canStartNext: true }).kind, SESSION_END_STEP.BACK_TO_PATH);
  assert.equal(chooseSessionEndNextStep({ session: pathSession(3), weeklyEnd: loading, completesWeeklyGoal: true }).kind,
    SESSION_END_STEP.WEEKLY_GOAL_COMPLETE);
});

test('open practice, another week, or a view that cannot launch all lead back to My Math Path', () => {
  const open = { ...pathSession(1), weeklySlotKey: null, weekKey: null };
  assert.equal(describeWeeklySessionEnd({ goal, completions: [], finishedSession: open }), null);
  assert.equal(chooseSessionEndNextStep({ session: open, weeklyEnd: null, canStartNext: true }).kind, SESSION_END_STEP.BACK_TO_PATH);
  // A session from another week claims nothing for this one — not even the
  // launch-time "it was the last slot" flag.
  const otherWeek = describeWeeklySessionEnd({ goal, completions: [], finishedSession: pathSession(1, { weekKey: '2026-09-28' }) });
  assert.deepEqual(otherWeek, { status: 'otherWeek' });
  assert.equal(chooseSessionEndNextStep({ session: pathSession(3), weeklyEnd: otherWeek, completesWeeklyGoal: true, canStartNext: true }).kind,
    SESSION_END_STEP.BACK_TO_PATH);
  // A teacher's read-only view gets no Start button.
  const end = describeWeeklySessionEnd({ goal, completions: [], finishedSession: pathSession(1) });
  assert.equal(chooseSessionEndNextStep({ session: pathSession(1), weeklyEnd: end, canStartNext: false }).kind, SESSION_END_STEP.BACK_TO_PATH);
});

test('the end screen counts the finished session only inside the week\'s window, as the server does', () => {
  // Completed after the week's window closed: the teacher's table and
  // Classroom never count it, so the end screen does not either.
  const late = pathSession(1, { completedAt: Date.parse(`${WEEK}T00:00:00Z`) + 8 * 86400000 + 3600000 });
  const end = describeWeeklySessionEnd({ goal, completions: [], finishedSession: late });
  assert.equal(end.status, 'ready');
  assert.equal(end.counted, false);
  assert.equal(end.completed, 0);
  // Inside the window it counts.
  assert.equal(describeWeeklySessionEnd({ goal, completions: [], finishedSession: pathSession(1) }).counted, true);
});

test('each launch is a different container; a resume is the same one', () => {
  const config = { targetAlignmentKey: 'texas:A.5A', sessionKind: 'practice', weeklySlotKey: goal.sessions[0].weeklySlotKey };
  assert.equal(sessionLaunchKey(config), sessionLaunchKey({ ...config }));
  assert.notEqual(sessionLaunchKey(config), sessionLaunchKey({ ...config, targetAlignmentKey: 'texas:A.2C', weeklySlotKey: goal.sessions[1].weeklySlotKey }));
  assert.notEqual(sessionLaunchKey(config), sessionLaunchKey({ ...config, weeklySlotKey: null }));
  assert.notEqual(sessionLaunchKey(config), sessionLaunchKey({ ...config, assessmentFramework: 'digitalSAT' }));
});

// --- 3. Skills that moved ----------------------------------------------------

const serverProfile = ({ estimate, events, independent = 1, dok = [2], updatedAt }) => ({
  mastery: { estimate, status: 'stale-label' },
  accumulator: { eligibleEvents: events, effectiveWeight: events, independentSuccesses: independent },
  dimensions: { dokRepresented: dok },
  updatedAt,
});

const START = 1_000;
const DONE = 50_000;
const liveSession = (overrides = {}) => ({
  sessionId: 'p1', status: 'completed', completedAt: DONE, target: { alignmentKey: 'texas:A.5A' },
  evidenceBySkill: { 'teks:A.5A': { finalized: 4 }, 'teks:8.8C': { finalized: 1 } },
  route: [{ skillCode: 'A.5A' }, { skillCode: '8.8C' }, { skillCode: 'A.5A' }],
  ...overrides,
});
const start = snapshotMasteryAtSessionStart({
  masteryProfilesByTEKS: {},
  serverProfiles: {
    'A.5A': serverProfile({ estimate: 62, events: 4, updatedAt: START }),
    '8.8C': serverProfile({ estimate: 80, events: 3, updatedAt: START }),
  },
});

test('the starting point is the unified profile, with the status re-derived by the one rule', () => {
  assert.equal(start.profiles['A.5A'].mastery.estimate, 62);
  assert.equal(start.profiles['A.5A'].mastery.status, MASTERY_STATUS.DEVELOPING, 'a stored label never survives the rule');
  assert.equal(start.profiles['8.8C'].mastery.status, MASTERY_STATUS.SECURE);
  assert.deepEqual(sessionSkillCodes(liveSession()), ['A.5A', '8.8C']);
});

test('"Updating your skills…" until the trigger has applied this session, then the change', () => {
  const before = {
    'A.5A': serverProfile({ estimate: 66, events: 6, updatedAt: DONE - 9000 }), // landed mid-session
    '8.8C': serverProfile({ estimate: 80, events: 3, updatedAt: START }),
  };
  assert.equal(describeSessionSkillsMoved({ session: liveSession(), start, liveServerProfiles: before }).state, SKILLS_MOVED_STATE.PENDING);
  assert.equal(describeSessionSkillsMoved({ session: liveSession(), start, liveServerProfiles: null }).state, SKILLS_MOVED_STATE.PENDING);
  assert.equal(describeSessionSkillsMoved({ session: liveSession(), start, liveServerProfiles: before, patienceExpired: true }).state,
    SKILLS_MOVED_STATE.DELAYED);

  // The last answer landed, but the excursion skill has not moved past its
  // start: still updating.
  const halfway = { ...before, 'A.5A': serverProfile({ estimate: 71, events: 8, updatedAt: DONE + 400 }) };
  assert.equal(sessionEvidenceLanded({ session: liveSession(), start, liveServerProfiles: halfway }), false);
  // Every skill moved during the session, but the LAST answer has not landed.
  const lastPending = { ...before, '8.8C': serverProfile({ estimate: 75, events: 4, updatedAt: DONE - 20000 }) };
  assert.equal(sessionEvidenceLanded({ session: liveSession(), start, liveServerProfiles: lastPending }), false);

  const landed = {
    'A.5A': serverProfile({ estimate: 71, events: 8, updatedAt: DONE + 400 }),
    '8.8C': serverProfile({ estimate: 75, events: 4, updatedAt: DONE - 20000 }),
  };
  const ready = describeSessionSkillsMoved({ session: liveSession(), start, liveServerProfiles: landed });
  assert.equal(ready.state, SKILLS_MOVED_STATE.READY);
  assert.deepEqual(ready.moves.map(formatSkillMove), [
    'Solving linear equations 62% → 71% · Developing → Secure',
    `${ready.moves[1].label} 80% → 75%`,
  ]);
});

test('a resumed session waits only for the answers given since it reopened', () => {
  // Before the break the student answered the excursion skill 8.8C once; its
  // profile moved then, and the screen's start snapshot already includes it.
  // After resuming, every answer was on A.5A.
  const resumedStart = snapshotMasteryAtSessionStart({
    masteryProfilesByTEKS: {},
    serverProfiles: {
      'A.5A': serverProfile({ estimate: 62, events: 4, updatedAt: START }),
      '8.8C': serverProfile({ estimate: 75, events: 4, updatedAt: START }),
    },
  });
  const atLoad = { 'teks:A.5A': { finalized: 2 }, 'teks:8.8C': { finalized: 1 } };
  const landed = {
    'A.5A': serverProfile({ estimate: 71, events: 8, updatedAt: DONE + 400 }),
    '8.8C': serverProfile({ estimate: 75, events: 4, updatedAt: START }),
  };
  const ready = describeSessionSkillsMoved({ session: liveSession(), start: resumedStart, liveServerProfiles: landed, evidenceAtLoad: atLoad });
  assert.equal(ready.state, SKILLS_MOVED_STATE.READY, 'not "Updating your skills…" for good');
  assert.deepEqual(ready.moves.map((move) => move.code), ['A.5A']);
  // Without the record of what it held at load, the old wait never ends.
  assert.equal(describeSessionSkillsMoved({ session: liveSession(), start: resumedStart, liveServerProfiles: landed }).state, SKILLS_MOVED_STATE.PENDING);
  // A skill answered on this screen must still have moved.
  const atLoadBefore8 = { 'teks:A.5A': { finalized: 2 } };
  assert.equal(sessionEvidenceLanded({ session: liveSession(), start: resumedStart, liveServerProfiles: landed, evidenceAtLoad: atLoadBefore8 }), false);
});

test('the container records what the session held when it first loaded, and passes it on', () => {
  const container = readFileSync(new URL('../../src/components/student/MyMathPathProductionContainer.jsx', import.meta.url), 'utf8');
  assert.match(container, /if \(session && evidenceAtLoad === null\) setEvidenceAtLoad\(session\.evidenceBySkill \|\| \{\}\);/);
  assert.match(container, /describeSessionSkillsMoved\(\{[\s\S]*?evidenceAtLoad,\s*\}\), \[[^\]]*evidenceAtLoad\]\);/);
});

test('only skills that changed are listed, and Mastered is the rule\'s verdict, not the estimate\'s', () => {
  const before = { 'A.5A': { mastery: { estimate: 84, status: MASTERY_STATUS.SECURE } }, 'A.2C': { mastery: { estimate: 70, status: MASTERY_STATUS.SECURE } } };
  const after = {
    'A.5A': { mastery: { estimate: 88, status: MASTERY_STATUS.SECURE } },
    'A.2C': { mastery: { estimate: 70, status: MASTERY_STATUS.SECURE } },
  };
  const moves = describeSkillMoves({ before, after, codes: ['A.5A', 'A.2C'] });
  assert.deepEqual(moves.map((move) => move.code), ['A.5A']);
  assert.equal(formatSkillMove(moves[0]), 'Solving linear equations 84% → 88%');

  // 88 without a DOK-3 item and two independent successes is Secure, not Mastered.
  const landed = { 'A.5A': serverProfile({ estimate: 90, events: 8, independent: 1, dok: [2], updatedAt: DONE + 1 }), '8.8C': serverProfile({ estimate: 80, events: 4, updatedAt: DONE + 1 }) };
  const ready = describeSessionSkillsMoved({ session: liveSession(), start, liveServerProfiles: landed });
  assert.equal(ready.moves.find((move) => move.code === 'A.5A').statusAfter, MASTERY_STATUS.SECURE);
  assert.equal(formatSkillMove({ label: 'Rate of change', estimateBefore: null, estimateAfter: 55, statusBefore: MASTERY_STATUS.NOT_ENOUGH_EVIDENCE, statusAfter: MASTERY_STATUS.DEVELOPING }),
    'Rate of change new → 55% · Not Enough Evidence → Developing');
});

test('the simulator diffs its own masteryData, with no trigger to wait for; an unfinished session has no section', () => {
  const simulatedStart = snapshotMasteryAtSessionStart({ masteryProfilesByTEKS: { 'A.5A': { mastery: { estimate: 40, status: MASTERY_STATUS.NEEDS_ATTENTION } } } });
  const now = { 'A.5A': { mastery: { estimate: 58, status: MASTERY_STATUS.DEVELOPING } } };
  const simulated = describeSessionSkillsMoved({
    session: { status: 'completed', target: { alignmentKey: 'texas:A.5A' }, route: [{ skillId: 'teks:A.5A' }] },
    start: simulatedStart, currentProfiles: now, simulated: true,
  });
  assert.equal(simulated.state, SKILLS_MOVED_STATE.READY);
  assert.equal(formatSkillMove(simulated.moves[0]), 'Solving linear equations 40% → 58% · Needs Attention → Developing');
  assert.equal(describeSessionSkillsMoved({ session: liveSession({ status: 'active' }), start }).state, SKILLS_MOVED_STATE.NONE);
  assert.equal(describeSessionSkillsMoved({ session: liveSession({ status: 'teacherSupportNeeded' }), start }).state, SKILLS_MOVED_STATE.NONE);
});

// --- 2. The recap in the Teacher Path Simulator --------------------------------

const bankQuestion = (id) => ({
  id, active: true, alignmentKeys: ['texas:A.5A'], courseId: 'algebra1', familyId: `mathmaster:A.5A:recap:${id}`, familyVersion: 1,
  questionType: 'response', activityRole: 'practice', calculatorPolicy: 'inherit', assessedConstruct: 'A.5A', representation: 'symbolic',
  difficultyBand: 3, dok: 2, taskType: 'procedural', prompt: `Solve 2x + 3 = 11 (${id}).`,
  responseFields: [{ id: 'answer', label: 'x =', inputProfile: 'number', expected: '4' }],
  solutionReview: { headline: 'Undo the operations.', reasoning: ['Subtract 3.', 'Divide by 2.'], answerSummary: 'x = 4' },
});

test('the simulator runtime releases the same recap, by the same rule, only once its session is completed', async () => {
  const runtime = createTeacherPathRuntime({ pathBankQuestions: [bankQuestion('a'), bankQuestion('b'), bankQuestion('c')], courseId: 'algebra1', requiredQuestions: 2 });
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: 'texas:A.5A', requiredQuestions: 2 });
  let issued = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  let result = null;
  for (let attempt = 0; attempt < 3 && !result?.grading?.questionFinalized; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    result = await runtime.submitStudentResponse({ sessionId: session.sessionId, questionInstanceId: issued.questionInstance.questionInstanceId, submissionId: `s${attempt}`, responsePayload: { responses: { answer: '5' } } });
  }
  assert.equal(result.session.status, 'active');
  const locked = await runtime.fetchPathSessionRecap({ sessionId: session.sessionId });
  assert.equal(locked.available, false, 'a session still in progress has no recap');
  assert.deepEqual(locked.items, []);

  issued = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  result = await runtime.submitStudentResponse({ sessionId: session.sessionId, questionInstanceId: issued.questionInstance.questionInstanceId, submissionId: 'right', responsePayload: { responses: { answer: '4' } } });
  assert.equal(result.session.status, 'completed');
  const recap = await runtime.fetchPathSessionRecap({ sessionId: session.sessionId });
  assert.equal(recap.available, true);
  assert.equal(recap.items.length, 1, 'only the missed question');
  const [missed] = recap.items;
  assert.equal(missed.questionNumber, 1);
  assert.deepEqual(missed.response.entries, [{ label: 'x =', value: '5', format: 'math' }]);
  assert.deepEqual(missed.correctAnswer, [{ label: 'x =', value: '4', format: 'rich' }]);
  assert.equal(missed.solutionReview.answerSummary, 'x = 4');
});

// --- The live service ---------------------------------------------------------

test('the live service asks the recap callable; the sandbox applies the same completed-only gate', () => {
  const service = executableSource(read('src/services/pathSessionService.js'));
  const fetcher = region(service, 'export const fetchPathSessionRecap = async', '\n};\n', 'recap fetcher');
  assert.match(fetcher, /invokePathCallable\('getMyPathSessionRecap', \{ sessionId \}\)/);
  assert.match(fetcher, /buildPathSessionRecap\(\{ session: mockSessions\.get\(sessionId\) \|\| null, entries: \[\] \}\)/);
});

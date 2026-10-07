/*
 * THE SIMULATOR SWAPS A SKILL BY THE SERVER'S RULE (student push D, item 3).
 *
 * A teacher previewing a student's week in the Teacher Path Simulator must see
 * the swaps that student's frozen week would carry, and must be refused
 * exactly where the server would refuse. The runtime freezes the week with the
 * same freezeWeeklyPathGoalProposal the callable uses and checks each weekly
 * launch with the same authorizeWeeklySlotLaunch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';
import { chooseWeeklyAlternative, mergeWeeklyGoalSnapshot } from '../../src/platform/path/weeklyPathChoice.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { freezeWeeklyPathGoalProposal } from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { gradeWeeklyGoal, matchWeeklyGoalCompletions } from '../../functions/shared/weeklyPathGrade.mjs';

const SLOT_TEKS = 'A.5A';
const SWAP_TEKS = 'A.5C';
const WEEK = '2026-10-05';

const question = (teks, prompt) => ({ type: 'algebra', prompt, equationLatex: '2x + 5 = 13', teks });
const ASSIGNMENTS = [{
  id: 'unit-3',
  title: 'Unit 3',
  questions: [
    question(SWAP_TEKS, 'Solve the two-step equation.'),
    question(SWAP_TEKS, 'Solve for x.'),
    question(SWAP_TEKS, 'Solve and check.'),
    question(SLOT_TEKS, 'What operation undoes addition?'),
    question(SLOT_TEKS, 'Solve the one-step equation.'),
  ],
}];

const runtimeFor = () => createTeacherPathRuntime({ assignments: ASSIGNMENTS, courseId: 'algebra1', learner: { id: 'sim-1', gradesByAssignment: {} } });

const proposal = (alternatives = [{
  skillId: teksSkillId(SWAP_TEKS),
  teksCode: SWAP_TEKS,
  studentLabel: 'Solving two-step equations',
  purpose: 'current_learning',
  purposeLabel: 'Current learning',
  context: 'course',
  dok: 3,
  difficultyBand: 4,
  swapReason: 'Also part of what your class is learning now.',
  score: 0.8,
}]) => ({
  weekKey: WEEK,
  courseId: 'algebra1',
  goalSessions: 3,
  dueAt: Date.parse(`${WEEK}T00:00:00Z`) + 7 * 86400000,
  sessions: [{
    slot: 1,
    weeklySlotKey: `1|${teksSkillId(SLOT_TEKS)}|${SLOT_TEKS}|current_learning|course|2|3`,
    skillId: teksSkillId(SLOT_TEKS),
    teksCode: SLOT_TEKS,
    purpose: 'current_learning',
    purposeLabel: 'Current learning',
    context: 'course',
    dok: 2,
    difficultyBand: 3,
    studentLabel: 'Solving one-step equations',
    alternatives,
  }],
});

const answerCorrectly = async (runtime, sessionId) => {
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId });
  return runtime.submitStudentResponse({
    sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    isCorrect: true,
    supportUsage: { isMathematicallyIndependent: true },
  });
};

test('the simulator freezes a week exactly as the server would', () => {
  const runtime = runtimeFor();
  const crowded = proposal(['A.5C', 'A.2A', 'A.3A', 'A.4A', 'A.6A'].map((code) => ({
    skillId: teksSkillId(code), teksCode: code, studentLabel: code, purpose: 'current_learning', context: 'course',
  })).concat([{ skillId: teksSkillId('A.7A'), teksCode: 'A.7A', context: 'act' }]));
  const frozen = runtime.freezeWeeklyPathGoal(crowded);

  assert.equal(frozen.assignmentState, 'simulation');
  const server = freezeWeeklyPathGoalProposal(crowded, {
    studentId: 'sim-1', classId: frozen.classId, courseId: 'algebra1',
  });
  // Same slots, same alternatives, same bound — the simulator does not have a
  // more generous idea of what a student may swap.
  assert.deepEqual(frozen.sessions, server.sessions);
  assert.deepEqual(frozen.sessions[0].alternatives.map((entry) => entry.teksCode), ['A.5C', 'A.2A', 'A.3A']);
});

test('a swapped simulated launch runs at the slot\'s rigor and records the swap', async () => {
  const runtime = runtimeFor();
  const frozen = runtime.freezeWeeklyPathGoal(proposal());
  const [slot] = frozen.sessions;

  const { session } = await runtime.startOrResumePathSession({
    targetAlignmentKey: `texas:${SWAP_TEKS}`,
    weekKey: WEEK,
    weeklySlotKey: slot.weeklySlotKey,
    weeklySlot: 1,
    chosenSkillId: teksSkillId(SWAP_TEKS),
    // What a stale or modified browser might claim. The frozen slot decides.
    intendedDok: 4,
    intendedDifficultyBand: 5,
    weeklyPurpose: 'extension',
  });
  assert.equal(session.target.alignmentKey, `texas:${SWAP_TEKS}`);
  assert.equal(session.weeklySlotKey, slot.weeklySlotKey, 'the swap keeps the slot key');
  assert.equal(session.intendedDok, 2);
  assert.equal(session.intendedDifficultyBand, 3);
  assert.equal(session.weeklyPurpose, 'current_learning');
  assert.equal(session.swappedFromTeks, SLOT_TEKS);
  assert.deepEqual(session.chosenAlternative, { skillId: teksSkillId(SWAP_TEKS), teksCode: SWAP_TEKS });

  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  assert.equal(questionInstance.preferredDok, 2);
  assert.equal(questionInstance.preferredBand, 3);

  // The slot's own standard is not a swap.
  const own = await runtime.startOrResumePathSession({ targetAlignmentKey: `texas:${SLOT_TEKS}`, weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey });
  assert.equal(own.session.swappedFromTeks, null);
  assert.equal(own.session.chosenAlternative, null);
});

test('the simulator refuses every weekly launch the server refuses', async () => {
  const runtime = runtimeFor();
  const frozen = runtime.freezeWeeklyPathGoal(proposal());
  const [slot] = frozen.sessions;
  const launch = (overrides) => runtime.startOrResumePathSession({
    targetAlignmentKey: `texas:${SWAP_TEKS}`, weekKey: WEEK, weeklySlotKey: slot.weeklySlotKey, ...overrides,
  });

  await assert.rejects(launch({ targetAlignmentKey: 'texas:A.2A' }), /does not match the assigned weekly standard/);
  await assert.rejects(launch({ assessmentFramework: 'act' }), /does not match the assigned weekly assessment context/);
  await assert.rejects(launch({ weeklySlotKey: 'not-a-slot' }), /no longer part of the assigned week/);
  await assert.rejects(launch({ weeklySlotKey: null }), /weekKey and weeklySlotKey are both required/);

  // A week frozen with no alternatives permits only its own standard.
  const bare = runtimeFor();
  const bareWeek = bare.freezeWeeklyPathGoal(proposal([]));
  await assert.rejects(bare.startOrResumePathSession({
    targetAlignmentKey: `texas:${SWAP_TEKS}`, weekKey: WEEK, weeklySlotKey: bareWeek.sessions[0].weeklySlotKey,
  }), /does not match the assigned weekly standard/);
});

test('a swap chosen on the simulated panel resumes, completes and fills its own slot', async () => {
  const runtime = runtimeFor();
  const frozen = runtime.freezeWeeklyPathGoal(proposal());
  // What the panel shows and what its Start button sends.
  const week = mergeWeeklyGoalSnapshot({ proposed: proposal(), snapshot: frozen, assignmentState: 'simulation' });
  const card = chooseWeeklyAlternative(week.sessions[0], teksSkillId(SWAP_TEKS));
  const launchConfig = {
    targetAlignmentKey: `texas:${card.teksCode}`,
    requiredQuestions: 2,
    weekKey: WEEK,
    weeklySlotKey: card.weeklySlotKey,
    weeklySlot: card.slot,
    chosenSkillId: card.chosenSkillId,
    intendedDok: card.dok,
    intendedDifficultyBand: card.difficultyBand,
    weeklyPurpose: card.purpose,
  };

  const first = await runtime.startOrResumePathSession(launchConfig);
  const again = await runtime.startOrResumePathSession(launchConfig);
  assert.equal(again.resumed, true);
  assert.equal(again.session.sessionId, first.session.sessionId, 'a swapped session resumes; it is not started twice');

  await answerCorrectly(runtime, first.session.sessionId);
  const done = await answerCorrectly(runtime, first.session.sessionId);
  assert.equal(done.session.status, 'completed');

  const { completions } = collectWeeklyPathSessions({ sessions: runtime.listPathSessions(), weekKey: WEEK });
  assert.equal(completions.length, 1);
  assert.equal(completions[0].teksCode, SWAP_TEKS);
  const { matched } = matchWeeklyGoalCompletions({ goal: week, completions });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].matchedSlot, 1);
  assert.equal(gradeWeeklyGoal({ goal: week, completions }).progress.completed, 1);
});

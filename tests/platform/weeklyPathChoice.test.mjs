import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWeeklyGoal, evaluateWeeklyGoalProgress, weeklySlotKey } from '../../src/platform/path/weeklyPathGoal.js';
import {
  MAX_ALTERNATIVES,
  attachWeeklyAlternatives,
  buildSlotAlternatives,
  chooseWeeklyAlternative,
  clearWeeklyAlternative,
  describeSlotChoice,
} from '../../src/platform/path/weeklyPathChoice.js';

const candidate = (skillId, teksCode, purpose, score, extra = {}) => ({
  skillId,
  teksCode,
  purpose,
  purposeLabel: 'Purpose',
  studentLabel: `Skill ${teksCode}`,
  studentExplanation: 'why this is here',
  context: 'course',
  dok: 2,
  difficultyBand: 3,
  score,
  eligibility: { eligible: true },
  ...extra,
});

const plan = () => ({
  sessions: [
    candidate('s1', 'A.5A', 'current_learning', 9),
    candidate('s2', 'A.3B', 'retention', 8),
  ],
  considered: [
    candidate('s1', 'A.5A', 'current_learning', 9),
    candidate('s9', 'A.7C', 'current_learning', 7),
    candidate('s8', 'A.2A', 'current_learning', 6),
    candidate('s5', 'A.9D', 'current_learning', 3, { eligibility: { eligible: false } }),
    candidate('s2', 'A.3B', 'retention', 8),
    candidate('s7', 'A.4D', 'retention', 5),
  ],
});

const goalFor = (config = { sessions: 2 }) => buildWeeklyGoal({ plan: plan(), config, studentId: 'S1' });

test('each weekly slot offers equally useful alternatives, best first', () => {
  const goal = goalFor();
  const [first] = goal.sessions;
  assert.equal(first.skillId, 's1');
  assert.deepEqual(first.alternatives.map((entry) => entry.skillId), ['s9', 's8']);
  assert.ok(first.alternatives.length <= MAX_ALTERNATIVES);
  assert.ok(first.alternatives.every((entry) => entry.swapReason));
});

test('an alternative must share the slot purpose and be one the engine would run', () => {
  const goal = goalFor();
  // A retention slot never offers current-learning work: swapping across
  // purposes would let a student opt out of the thing they most need.
  const retention = goal.sessions.find((session) => session.purpose === 'retention');
  assert.deepEqual(retention.alternatives.map((entry) => entry.skillId), ['s7']);
  assert.ok(retention.alternatives.every((entry) => entry.purpose === 'retention'));

  // An ineligible candidate is never offered, however well it scores.
  const everyOption = goal.sessions.flatMap((session) => session.alternatives.map((entry) => entry.skillId));
  assert.ok(!everyOption.includes('s5'));
});

test('a skill seated in another slot is never offered as an alternative', () => {
  // Offering it would make one of the two slots unfillable, because a completion
  // is consumed by the first slot it matches.
  const sessions = [
    { skillId: 'a', teksCode: 'A.1A', purpose: 'current_learning' },
    { skillId: 'b', teksCode: 'A.2A', purpose: 'current_learning' },
  ];
  const considered = [
    candidate('a', 'A.1A', 'current_learning', 9),
    candidate('b', 'A.2A', 'current_learning', 8),
    candidate('c', 'A.3A', 'current_learning', 7),
  ];
  const withOptions = attachWeeklyAlternatives({ sessions, considered });
  for (const session of withOptions) {
    assert.deepEqual(session.alternatives.map((entry) => entry.skillId), ['c']);
  }
});

test('choosing an alternative changes the work but never the slot identity', () => {
  // This is the load-bearing guarantee. weeklySlotKey is what stops one
  // completed session from filling two rows; if a swap minted a new key, every
  // week already in progress would stop counting finished work.
  const goal = goalFor();
  const [slot] = goal.sessions;
  const swapped = chooseWeeklyAlternative(slot, 's9');

  assert.equal(swapped.skillId, 's9');
  assert.equal(swapped.teksCode, 'A.7C');
  assert.equal(swapped.studentChose, true);
  assert.equal(swapped.chosenSkillId, 's9');

  assert.equal(swapped.weeklySlotKey, slot.weeklySlotKey);
  assert.equal(swapped.slot, slot.slot);
  assert.equal(swapped.purpose, slot.purpose);
  assert.equal(swapped.recommendedSkillId, 's1');
});

test('a swapped slot still earns credit for the week it belongs to', () => {
  const goal = goalFor();
  const swapped = chooseWeeklyAlternative(goal.sessions[0], 's9');

  // The completion carries the slot key it was launched with, which the swap
  // left alone, so the week counts it against the original slot.
  const progress = evaluateWeeklyGoalProgress({
    goal,
    completions: [{
      status: 'completed',
      weekKey: goal.weekKey,
      weeklySlotKey: swapped.weeklySlotKey,
      teksCode: swapped.teksCode,
      completedAt: goal.createdAt,
    }],
  });
  assert.equal(progress.completed, 1);
  // Derived, not hardcoded: the config clamps to the platform's minimum weekly
  // session count, so the required total is not simply what the test asked for.
  assert.equal(progress.required, goal.goalSessions);
  assert.equal(progress.remaining, goal.goalSessions - 1);
});

test('a student can put the recommendation back', () => {
  const goal = goalFor();
  const [slot] = goal.sessions;
  const restored = clearWeeklyAlternative(chooseWeeklyAlternative(slot, 's9'));

  assert.equal(restored.skillId, 's1');
  assert.equal(restored.teksCode, 'A.5A');
  assert.equal(restored.studentChose, false);
  assert.equal(restored.chosenSkillId, null);
  assert.equal(restored.weeklySlotKey, slot.weeklySlotKey);
});

test('a stale or unknown choice leaves the slot alone rather than emptying it', () => {
  const goal = goalFor();
  const [slot] = goal.sessions;

  assert.equal(chooseWeeklyAlternative(slot, 'does-not-exist').skillId, 's1');
  assert.equal(chooseWeeklyAlternative(slot, '').skillId, 's1');
  assert.equal(chooseWeeklyAlternative(null, 's9'), null);
  // Choosing the recommendation itself is a no-op, not a swap.
  assert.equal(chooseWeeklyAlternative(slot, 's1').studentChose, undefined);
});

test('slot choice is described once, for every surface that shows it', () => {
  const goal = goalFor();
  const [slot] = goal.sessions;

  const recommended = describeSlotChoice(slot);
  assert.equal(recommended.canChoose, true);
  assert.equal(recommended.chose, false);
  assert.equal(recommended.optionCount, 2);
  assert.equal(recommended.label, 'Recommended for you');

  const chosen = describeSlotChoice(chooseWeeklyAlternative(slot, 's9'));
  assert.equal(chosen.chose, true);
  assert.equal(chosen.label, 'You chose this');
  assert.equal(chosen.recommendedLabel, 'Skill A.5A');

  assert.equal(describeSlotChoice(null).canChoose, false);
});

test('a week with no considered pool still builds, just without choices', () => {
  // A blank settings record or an older stored plan must never be the reason a
  // student has no week at all.
  const goal = buildWeeklyGoal({
    plan: { sessions: [candidate('s1', 'A.5A', 'current_learning', 9)] },
    config: { sessions: 1 },
    studentId: 'S1',
  });
  assert.equal(goal.sessions.length, 1);
  assert.deepEqual(goal.sessions[0].alternatives, []);
  assert.equal(describeSlotChoice(goal.sessions[0]).canChoose, false);
  assert.equal(goal.sessions[0].weeklySlotKey, weeklySlotKey(goal.sessions[0], 1));
});

test('buildSlotAlternatives is defensive about missing input', () => {
  assert.deepEqual(buildSlotAlternatives({}), []);
  assert.deepEqual(buildSlotAlternatives({ session: { skillId: 'a' } }), []);
  assert.deepEqual(buildSlotAlternatives({ session: { purpose: 'retention' }, considered: null }), []);
  assert.deepEqual(attachWeeklyAlternatives({}), []);
});

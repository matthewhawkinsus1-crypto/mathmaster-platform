import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeacherWeeklyView, buildWeeklyGoal, evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions, weeklySlotKey,
} from '../../src/platform/path/weeklyPathGoal.js';
import {
  MAX_ALTERNATIVES,
  applyWeeklySlotChoices,
  attachWeeklyAlternatives,
  buildSlotAlternatives,
  chooseWeeklyAlternative,
  clearWeeklyAlternative,
  describeSlotChoice,
  describeWeeklySlotSwaps,
  frozenSlotAlternatives,
  mergeWeeklyGoalSnapshot,
  resolveWeeklySlotChoices,
  weeklyGoalOffersSwap,
} from '../../src/platform/path/weeklyPathChoice.js';
import {
  authorizeWeeklySlotLaunch,
  freezeWeeklyPathGoalProposal,
} from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { toCanonicalKey } from '../../src/utils/teksUtils.js';

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

// ---------------------------------------------------------------------------
// "Swap a skill" end to end (student push D, item 3). The server freezes each
// slot's alternatives and authorizes a launch against them
// (weeklyPathSlotAuthority.mjs); the browser must offer exactly those swaps,
// launch them at the slot's rigor, and remember an opened swap across reloads.
// ---------------------------------------------------------------------------

const frozenFrom = (goal) => ({
  ...freezeWeeklyPathGoalProposal(goal, { studentId: 'S1', classId: 'class-1', courseId: 'algebra1' }),
  assignmentState: 'assigned',
});

test('a swap runs at the slot\'s own context, depth and band, and can be put back exactly', () => {
  // The option names no context of its own, like the records the server
  // stores, and was built at its own depth and band.
  const slot = {
    slot: 1, weeklySlotKey: 'k1', skillId: 's1', teksCode: 'A.2C', studentLabel: 'Skill A.2C',
    purpose: 'transfer', context: 'digitalSAT', dok: 2, difficultyBand: 3, studentExplanation: 'why this slot',
    alternatives: [{ skillId: 's9', teksCode: 'A.7C', studentLabel: 'Skill A.7C', dok: 3, difficultyBand: 4, studentExplanation: 'other' }],
  };
  const swapped = chooseWeeklyAlternative(slot, 's9');
  assert.equal(swapped.teksCode, 'A.7C');
  // The server runs a swapped session at the slot's rigor, so the card must too.
  assert.equal(swapped.dok, 2);
  assert.equal(swapped.difficultyBand, 3);
  assert.equal(swapped.context, 'digitalSAT');
  assert.equal(swapped.studentExplanation, 'why this slot');

  // A frozen slot carries no recommendation fields of its own; putting the
  // recommendation back must still restore its standard, not keep the swap's.
  const restored = clearWeeklyAlternative(swapped);
  assert.equal(restored.skillId, 's1');
  assert.equal(restored.teksCode, 'A.2C');
  assert.equal(restored.studentLabel, 'Skill A.2C');
});

test('alternatives are only offered in the slot\'s assessment context', () => {
  const session = { skillId: 'sat1', teksCode: 'A.2C', purpose: 'transfer', context: 'digitalSAT' };
  const considered = [
    candidate('sat1', 'A.2C', 'transfer', 9, { context: 'digitalSAT' }),
    candidate('sat2', 'A.6A', 'transfer', 8, { context: 'digitalSAT' }),
    candidate('course2', 'A.6B', 'transfer', 7, { context: 'course' }),
    candidate('act2', 'A.6C', 'transfer', 6, { context: 'act' }),
  ];
  assert.deepEqual(buildSlotAlternatives({ session, considered }).map((entry) => entry.skillId), ['sat2']);
});

test('only the swaps frozen with the week are offered', () => {
  const proposed = goalFor();
  // Not frozen yet, or the freeze failed: the server has agreed to no swap.
  const unfrozen = mergeWeeklyGoalSnapshot({ proposed });
  assert.equal(unfrozen.assignmentState, 'proposed');
  assert.ok(proposed.sessions[0].alternatives.length > 0, 'the proposal itself has options');
  assert.ok(unfrozen.sessions.every((session) => describeSlotChoice(session).canChoose === false));
  assert.equal(mergeWeeklyGoalSnapshot({}), null);

  // Frozen with s9 and s8; today's recomputed proposal lists something else.
  const snapshot = frozenFrom(proposed);
  const recomputed = {
    ...proposed,
    sessions: proposed.sessions.map((session, index) => (index === 0
      ? { ...session, alternatives: [{ skillId: 's5', teksCode: 'A.9D', studentLabel: 'Skill A.9D', purpose: 'current_learning', context: 'course' }] }
      : session)),
  };
  // Even a snapshot that carried stale settings or a stale profile would not
  // override the live ones.
  const merged = mergeWeeklyGoalSnapshot({ proposed: recomputed, snapshot: { ...snapshot, settings: { sessions: 9 }, profile: { stale: true } } });
  assert.equal(merged.assignmentState, 'assigned');
  assert.deepEqual(merged.sessions[0].alternatives.map((entry) => entry.skillId), ['s9', 's8']);
  assert.equal(merged.sessions[0].alternatives[0].context, 'course');
  assert.equal(merged.sessions[0].alternatives[0].purpose, 'current_learning');
  assert.equal(merged.sessions[0].recommendedSkillId, 's1');
  assert.equal(merged.sessions[0].recommendedTeksCode, 'A.5A');
  // The teacher's settings and the profile are not part of the frozen week.
  assert.equal(merged.settings, recomputed.settings);
  assert.equal(merged.profile, recomputed.profile);

  // A week frozen before swaps existed offers nothing, whatever the proposal says.
  const legacy = { ...snapshot, schemaVersion: 1, sessions: snapshot.sessions.map(({ alternatives: _omitted, ...slot }) => slot) };
  const legacyMerged = mergeWeeklyGoalSnapshot({ proposed, snapshot: legacy });
  assert.ok(legacyMerged.sessions.every((session) => describeSlotChoice(session).canChoose === false));

  assert.equal(mergeWeeklyGoalSnapshot({ proposed, snapshot, assignmentState: 'simulation' }).assignmentState, 'simulation');
});

test('a frozen alternative becomes an option shaped by its slot', () => {
  const options = frozenSlotAlternatives({
    purpose: 'retention', purposeLabel: 'Retention', context: 'course',
    alternatives: [{ skillId: 'x', teksCode: 'A.4D' }, { skillId: '', teksCode: 'A.9D' }, null],
  });
  assert.deepEqual(options, [{
    skillId: 'x',
    teksCode: 'A.4D',
    studentLabel: 'A.4D',
    purpose: 'retention',
    purposeLabel: 'Retention',
    context: 'course',
    swapReason: 'Another skill you have already learned that is due for a refresh.',
  }]);
  assert.deepEqual(frozenSlotAlternatives(null), []);
});

test('a swap picked from the frozen week is a launch the server authorizes', () => {
  const proposed = goalFor();
  const snapshot = frozenFrom(proposed);
  const week = mergeWeeklyGoalSnapshot({ proposed, snapshot });
  const swapped = chooseWeeklyAlternative(week.sessions[0], 's9');
  // What startWeeklySession sends for that card.
  const launch = authorizeWeeklySlotLaunch({
    goal: snapshot,
    weeklySlotKey: swapped.weeklySlotKey,
    targetAlignmentKey: toCanonicalKey(swapped.teksCode),
    requestedFramework: swapped.context !== 'course' ? swapped.context : null,
    chosenSkillId: swapped.chosenSkillId,
  });
  assert.equal(launch.ok, true);
  assert.equal(launch.swappedFromTeks, 'A.5A');
  assert.equal(launch.intendedDok, swapped.dok);
  assert.equal(launch.intendedDifficultyBand, swapped.difficultyBand);
  // An option that only today's proposal lists would be refused — which is why
  // it is never offered.
  assert.equal(authorizeWeeklySlotLaunch({ goal: snapshot, weeklySlotKey: swapped.weeklySlotKey, targetAlignmentKey: 'texas:A.9D' }).ok, false);
});

test('an opened or finished swap is the slot\'s choice after a reload', () => {
  const proposed = goalFor();
  const week = mergeWeeklyGoalSnapshot({ proposed, snapshot: frozenFrom(proposed) });
  const [first, second] = week.sessions;

  // Opened on A.7C with no click in this tab: Resume must relaunch A.7C, the
  // session the server holds, not the recommendation as a second session.
  const opened = resolveWeeklySlotChoices({ goal: week, inProgress: [{ weeklySlotKey: first.weeklySlotKey, teksCode: 'A.7C' }] });
  assert.deepEqual(opened, { [first.weeklySlotKey]: 's9' });
  const resumed = applyWeeklySlotChoices({ goal: week, choices: opened });
  assert.equal(resumed.sessions[0].teksCode, 'A.7C');
  assert.equal(resumed.sessions[0].weeklySlotKey, first.weeklySlotKey);

  // What the server holds outranks a stale click.
  assert.deepEqual(resolveWeeklySlotChoices({
    goal: week,
    choices: { [first.weeklySlotKey]: 's8' },
    inProgress: [{ weeklySlotKey: first.weeklySlotKey, teksCode: 'A.5A' }],
  }), {});

  // A finished swap, read from the slot key the session was launched with.
  const finished = { status: 'completed', weekKey: week.weekKey, weeklySlotKey: first.weeklySlotKey, teksCode: 'A.7C', completedAt: week.createdAt };
  assert.deepEqual(resolveWeeklySlotChoices({ goal: week, completions: [finished] }), { [first.weeklySlotKey]: 's9' });
  // ...and it is the session that filled the slot.
  assert.equal(matchWeeklyGoalCompletions({ goal: week, completions: [finished] }).matched[0].matchedSlot, first.slot);
  // A session from another week that happens to share the key is not this week's choice.
  assert.deepEqual(resolveWeeklySlotChoices({ goal: week, completions: [{ ...finished, weekKey: '2026-01-05' }] }), {});
  // Free practice on an option's standard is not a swap. A count-based legacy
  // match would stamp it with a slot key; the session's own (absent) key is
  // what counts.
  const freePractice = { ...finished, weeklySlotKey: null, weekKey: null };
  const legacy = { ...week, assignmentState: 'proposed' };
  assert.equal(matchWeeklyGoalCompletions({ goal: legacy, completions: [freePractice] }).matched[0].weeklySlotKey, first.weeklySlotKey);
  assert.deepEqual(resolveWeeklySlotChoices({ goal: legacy, completions: [freePractice] }), {});

  // No server fact: this tab's click stands. A fact for a standard that is
  // neither the slot nor an option changes nothing.
  assert.deepEqual(resolveWeeklySlotChoices({ goal: week, choices: { [second.weeklySlotKey]: 's7' } }), { [second.weeklySlotKey]: 's7' });
  assert.deepEqual(resolveWeeklySlotChoices({ goal: week, inProgress: [{ weeklySlotKey: first.weeklySlotKey, teksCode: 'A.11A' }] }), {});
});

test('options another slot holds, or the bank cannot issue, are not offered', () => {
  const week = {
    weekKey: 'w',
    sessions: [
      { slot: 1, weeklySlotKey: 'k1', skillId: 'a', teksCode: 'A.1A', purpose: 'current_learning', context: 'course', alternatives: [{ skillId: 'c', teksCode: 'A.3A' }, { skillId: 'd', teksCode: 'A.4A' }] },
      { slot: 2, weeklySlotKey: 'k2', skillId: 'b', teksCode: 'A.2A', purpose: 'current_learning', context: 'course', alternatives: [{ skillId: 'c', teksCode: 'A.3A' }, { skillId: 'e', teksCode: 'A.5A' }] },
    ],
  };
  const applied = applyWeeklySlotChoices({ goal: week, choices: { k1: 'c' }, isLaunchable: (code) => code !== 'A.5A' });
  assert.equal(applied.sessions[0].skillId, 'c');
  // The option a slot holds stays listed, so the student sees it chosen and can switch back.
  assert.deepEqual(applied.sessions[0].alternatives.map((entry) => entry.skillId), ['c', 'd']);
  // Slot 2 no longer offers c (slot 1 holds it) or e (the bank cannot issue it).
  assert.deepEqual(applied.sessions[1].alternatives.map((entry) => entry.skillId), []);
  assert.equal(describeSlotChoice(applied.sessions[1]).canChoose, false);
  // Even when the bank can no longer issue the option a slot holds, it stays
  // listed: otherwise a slot whose only option that is would lose its swap
  // control, and the student could not switch back to the recommendation.
  const onlyOption = {
    sessions: [{ slot: 1, weeklySlotKey: 'k1', skillId: 'a', teksCode: 'A.1A', purpose: 'current_learning', context: 'course', alternatives: [{ skillId: 'c', teksCode: 'A.3A' }] }],
  };
  const stranded = applyWeeklySlotChoices({ goal: onlyOption, choices: { k1: 'c' }, isLaunchable: () => false });
  assert.deepEqual(stranded.sessions[0].alternatives.map((entry) => entry.skillId), ['c']);
  assert.equal(describeSlotChoice(stranded.sessions[0]).canChoose, true);
  // Coverage not loaded yet: nothing is filtered on its account.
  assert.deepEqual(applyWeeklySlotChoices({ goal: week }).sessions[1].alternatives.map((entry) => entry.skillId), ['c', 'e']);
  // Coverage is asked about the slot's own context.
  const asked = new Set();
  applyWeeklySlotChoices({
    goal: { sessions: [{ ...week.sessions[0], context: 'digitalSAT' }] },
    isLaunchable: (code, context) => { asked.add(context); return true; },
  });
  assert.deepEqual([...asked], ['digitalSAT']);
  assert.equal(applyWeeklySlotChoices({ goal: null }), null);
});

test('the teacher sees "chose X instead of Y" for a slot a swap filled', () => {
  const proposed = goalFor();
  // The teacher receives the frozen snapshot itself (goalsByStudentId).
  const week = frozenFrom(proposed);
  const [first, second] = week.sessions;
  const at = proposed.createdAt;
  const completions = [
    { status: 'completed', weekKey: week.weekKey, weeklySlotKey: first.weeklySlotKey, teksCode: 'A.7C', completedAt: at + 1000, accuracy: 1 },
    { status: 'completed', weekKey: week.weekKey, weeklySlotKey: second.weeklySlotKey, teksCode: 'A.3B', completedAt: at + 2000, accuracy: 1 },
    // Free practice on slot 2's option is not a swap.
    { status: 'completed', weekKey: null, weeklySlotKey: null, teksCode: 'A.4D', completedAt: at + 3000, accuracy: 1 },
  ];
  const swaps = describeWeeklySlotSwaps({ goal: week, completions });
  assert.deepEqual(swaps.map((swap) => swap.sentence), ['Session 1: chose A.7C instead of A.5A']);
  assert.equal(swaps[0].chosenLabel, 'Skill A.7C', 'labelled from the frozen week');
  assert.equal(swaps[0].recommendedLabel, 'Skill A.5A');
  // Another week's session with the same key says nothing about this week.
  assert.deepEqual(describeWeeklySlotSwaps({ goal: week, completions: [{ ...completions[0], weekKey: '2026-01-05' }] }), []);
  assert.deepEqual(describeWeeklySlotSwaps({}), []);

  const [row] = buildTeacherWeeklyView([{ studentId: 'S1', studentName: 'Student', goal: week, completions }], { now: at + 4000 });
  assert.equal(row.complete, 2, 'the swapped session counts for its slot in the teacher table');
  assert.deepEqual(row.swaps.map((swap) => swap.chosenTeks), ['A.7C']);
});

test('the panel promises a swap only where an open card offers one', () => {
  const proposed = goalFor();
  const week = mergeWeeklyGoalSnapshot({ proposed, snapshot: frozenFrom(proposed) });
  assert.equal(weeklyGoalOffersSwap({ goal: week }), true);
  assert.equal(weeklyGoalOffersSwap({ goal: week, completedSlots: [1] }), true);
  // Done and opened cards cannot be swapped.
  assert.equal(weeklyGoalOffersSwap({ goal: week, completedSlots: [1], inProgress: [{ weeklySlotKey: week.sessions[1].weeklySlotKey }] }), false);
  // Unfrozen, or frozen before swaps: nothing to promise.
  assert.equal(weeklyGoalOffersSwap({ goal: mergeWeeklyGoalSnapshot({ proposed }) }), false);
  assert.equal(weeklyGoalOffersSwap({}), false);
});

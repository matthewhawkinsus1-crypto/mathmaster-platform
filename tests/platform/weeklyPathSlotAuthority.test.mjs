/*
 * "SWAP A SKILL" MUST WORK END TO END (student push D, item 3).
 *
 * The weekly panel offered "Want something else? N other options", but the
 * server froze the week WITHOUT those options and refused any launch whose
 * standard differed from the slot ("That launch does not match the assigned
 * weekly standard"). A student could pick a swap the platform would never run.
 *
 * functions/shared/weeklyPathSlotAuthority.mjs is now the one rule: the freeze
 * keeps a bounded, sanitized list of alternatives per slot, and a launch for a
 * slot may target the slot's standard or one of those — always in the slot's
 * assessment context, at the slot's depth, under the slot's key. These tests pin
 * that rule, and that a swapped completion fills the slot it was launched for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  MAX_WEEKLY_SLOT_ALTERNATIVES,
  WEEKLY_PATH_GOAL_SCHEMA_VERSION,
  WeeklyPathGoalError,
  authorizeWeeklySlotLaunch,
  freezeWeeklyPathGoalProposal,
  permittedWeeklySlotAlternatives,
  sanitizeWeeklySlotAlternatives,
} from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { evaluateWeeklyGoalProgress, gradeWeeklyGoal, matchWeeklyGoalCompletions } from '../../functions/shared/weeklyPathGrade.mjs';
import { teksSkillId } from '../../functions/shared/pathSkillGraph.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// Exactly what the callable injects.
const SERVER = {
  canonicalTeks: mathPath.canonicalAlignmentKey,
  displayTeks: mathPath.displayAlignmentKey,
};
const CONTEXT = { studentId: 'S1', classId: 'class-1', courseId: 'algebra1', ...SERVER };
const WEEK = '2026-10-05';
const MON = Date.parse(`${WEEK}T15:00:00Z`);

const alt = (teksCode, extra = {}) => ({
  skillId: `teks:${teksCode}`,
  teksCode,
  studentLabel: `Skill ${teksCode}`,
  purpose: 'current_learning',
  purposeLabel: 'Current learning',
  context: 'course',
  dok: 3,
  difficultyBand: 4,
  swapReason: 'Also part of what your class is learning now.',
  score: 0.71,
  scoreTerms: { positive: { pacing: 0.4 } },
  studentExplanation: 'why',
  ...extra,
});

const slotProposal = (teksCode, extra = {}) => ({
  skillId: `teks:${teksCode}`,
  teksCode,
  purpose: 'current_learning',
  purposeLabel: 'Current learning',
  context: 'course',
  dok: 2,
  difficultyBand: 3,
  studentLabel: `Skill ${teksCode}`,
  studentExplanation: 'Part of what your class is learning now.',
  ...extra,
});

const proposal = (sessions) => ({ weekKey: WEEK, courseId: 'algebra1', goalSessions: sessions.length, dueAt: MON + 6 * 86400000, sessions });

const frozenWeek = () => ({
  ...freezeWeeklyPathGoalProposal(proposal([
    slotProposal('A.5A', { alternatives: [alt('A.7C'), alt('A.2A')] }),
    slotProposal('A.3B', { purpose: 'retention', alternatives: [alt('A.4D', { purpose: 'retention' })] }),
    slotProposal('A.2C', {
      purpose: 'transfer', context: 'digitalSAT', dok: 3, difficultyBand: 4,
      alternatives: [alt('A.6A', { purpose: 'transfer', context: 'digitalSAT' })],
    }),
  ]), CONTEXT),
  assignmentState: 'assigned',
});

test('the freeze keeps a bounded, sanitized alternatives list on every slot', () => {
  const goal = freezeWeeklyPathGoalProposal(proposal([
    slotProposal('A.5A', { alternatives: ['A.7C', 'A.2A', 'A.9D', 'A.10B', 'A.11A'].map((code) => alt(code)) }),
    slotProposal('A.3B'),
    slotProposal('A.2C'),
  ]), CONTEXT);

  assert.equal(goal.schemaVersion, WEEKLY_PATH_GOAL_SCHEMA_VERSION);
  const [first, second] = goal.sessions;
  assert.equal(MAX_WEEKLY_SLOT_ALTERNATIVES, 3);
  assert.deepEqual(first.alternatives.map((entry) => entry.teksCode), ['A.7C', 'A.2A', 'A.9D'], 'at most three, in the order proposed');
  // Only what the swap control shows and the launch check needs. Scores and
  // reasoning stay out of the student-readable snapshot.
  assert.deepEqual(Object.keys(first.alternatives[0]).sort(), ['purposeLabel', 'skillId', 'studentLabel', 'swapReason', 'teksCode']);
  assert.deepEqual(first.alternatives[0], {
    skillId: 'teks:A.7C',
    teksCode: 'A.7C',
    studentLabel: 'Skill A.7C',
    purposeLabel: 'Current learning',
    swapReason: 'Also part of what your class is learning now.',
  });
  // A slot proposed without alternatives freezes with an empty list, never undefined.
  assert.deepEqual(second.alternatives, []);
  // The slot itself is frozen exactly as before.
  assert.equal(first.teksCode, 'A.5A');
  assert.equal(first.dok, 2);
  assert.equal(first.difficultyBand, 3);
  assert.equal(first.status, 'notStarted');
});

test('the freeze drops alternatives that are not a fair swap for the slot', () => {
  const slot = { slot: 1, teksCode: 'A.5A', purpose: 'current_learning', context: 'course', purposeLabel: 'Current learning' };
  const kept = sanitizeWeeklySlotAlternatives([
    null,
    'A.7C',
    alt('not a standard'),
    alt(''),
    alt('A.5A'), // the slot's own standard is not an alternative
    alt('A.3B'), // seated in another slot
    alt('A.6A', { context: 'digitalSAT' }), // another assessment context
    alt('A.6B', { purpose: 'retention' }), // another purpose
    alt('A.6C', { skillId: 'teks:A.9D' }), // a skill id naming a different standard
    alt('a.7c'), // normalized, then kept
    alt('A.7C'), // a duplicate of the one just kept
    alt('A.2A', { skillId: undefined }), // a missing id is derived from the standard
  ], { slot, seated: new Set(['texas:A.5A', 'texas:A.3B']), ...SERVER });

  assert.deepEqual(kept.map((entry) => entry.teksCode), ['A.7C', 'A.2A']);
  // The derived id is the skill graph's own id for that standard.
  assert.equal(kept[1].skillId, teksSkillId('A.2A'));
  // Even when nothing else is seated, a slot is never its own alternative.
  assert.deepEqual(
    sanitizeWeeklySlotAlternatives([alt('A.5A'), alt('A.7C')], { slot, ...SERVER }).map((entry) => entry.teksCode),
    ['A.7C'],
  );
});

test('a transfer slot only keeps alternatives in the same exam context', () => {
  const goal = frozenWeek();
  const transfer = goal.sessions[2];
  assert.equal(transfer.context, 'digitalSAT');
  assert.deepEqual(transfer.alternatives.map((entry) => entry.teksCode), ['A.6A']);

  const courseAlternative = freezeWeeklyPathGoalProposal(proposal([
    slotProposal('A.2C', { purpose: 'transfer', context: 'digitalSAT', alternatives: [alt('A.6A', { purpose: 'transfer' })] }),
    slotProposal('A.5A'),
    slotProposal('A.3B'),
  ]), CONTEXT);
  assert.deepEqual(courseAlternative.sessions[0].alternatives, [], 'course practice is not a swap for SAT practice');
});

test('the freeze still rejects a malformed week the way it always did', () => {
  assert.throws(() => freezeWeeklyPathGoalProposal({ weekKey: 'soon', sessions: [slotProposal('A.5A')] }, CONTEXT),
    (error) => error instanceof WeeklyPathGoalError && error.code === 'invalid-argument');
  assert.throws(() => freezeWeeklyPathGoalProposal(proposal([slotProposal('A.5A')]), { ...CONTEXT, classId: '' }),
    (error) => error.code === 'failed-precondition' && /not fully configured/.test(error.message));
  assert.throws(() => freezeWeeklyPathGoalProposal({ ...proposal([slotProposal('A.5A')]), courseId: 'algebra2' }, CONTEXT),
    (error) => error.code === 'failed-precondition' && /different course/.test(error.message));
  assert.throws(() => freezeWeeklyPathGoalProposal(proposal([]), CONTEXT),
    (error) => error.code === 'failed-precondition');
});

test('a launch of the slot\'s own standard is authorized and is not a swap', () => {
  const goal = frozenWeek();
  const [slot] = goal.sessions;
  const result = authorizeWeeklySlotLaunch({ goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.5A', classId: 'class-1', ...SERVER });
  assert.equal(result.ok, true);
  assert.equal(result.swapped, false);
  assert.equal(result.chosenAlternative, null);
  assert.equal(result.swappedFromTeks, null);
  assert.equal(result.slot.weeklySlotKey, slot.weeklySlotKey);
});

test('a launch of a frozen alternative is authorized at the slot\'s context, depth and band', () => {
  const goal = frozenWeek();
  const [slot] = goal.sessions;
  const result = authorizeWeeklySlotLaunch({
    goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.7C', chosenSkillId: 'teks:A.7C', classId: 'class-1', ...SERVER,
  });
  assert.equal(result.ok, true);
  assert.equal(result.swapped, true);
  assert.deepEqual(result.chosenAlternative, { skillId: 'teks:A.7C', teksCode: 'A.7C' });
  assert.equal(result.swappedFromTeks, 'A.5A');
  // The alternative was proposed at DOK 3 / band 4; the slot is DOK 2 / band 3.
  // A swap changes the standard and nothing else.
  assert.equal(result.intendedDok, 2);
  assert.equal(result.intendedDifficultyBand, 3);
  assert.equal(result.weeklyPurpose, 'current_learning');
  assert.equal(result.assessmentFramework, null);

  // A transfer slot's swap still runs as SAT practice even when the browser
  // does not say so.
  const transfer = goal.sessions[2];
  const sat = authorizeWeeklySlotLaunch({ goal, weeklySlotKey: transfer.weeklySlotKey, targetAlignmentKey: 'texas:A.6A', ...SERVER });
  assert.equal(sat.ok, true);
  assert.equal(sat.assessmentFramework, 'digitalSAT');
  assert.equal(sat.intendedDok, 3);
  assert.equal(sat.intendedDifficultyBand, 4);
});

test('a launch of any other standard, context, slot or class is refused', () => {
  const goal = frozenWeek();
  const [slot, retention, transfer] = goal.sessions;
  const launch = (overrides) => authorizeWeeklySlotLaunch({
    goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.7C', classId: 'class-1', ...SERVER, ...overrides,
  });

  const other = launch({ targetAlignmentKey: 'texas:A.9D' });
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'target-mismatch');
  assert.equal(other.message, 'That launch does not match the assigned weekly standard.');
  // Another slot's alternative does not become this slot's.
  assert.equal(launch({ targetAlignmentKey: 'texas:A.4D' }).reason, 'target-mismatch');
  // Another slot's own standard is not a swap either.
  assert.equal(launch({ targetAlignmentKey: 'texas:A.3B' }).reason, 'target-mismatch');
  assert.equal(launch({ weeklySlotKey: retention.weeklySlotKey, targetAlignmentKey: 'texas:A.7C' }).reason, 'target-mismatch');
  // An alternative launched as a different exam.
  assert.equal(launch({ weeklySlotKey: transfer.weeklySlotKey, targetAlignmentKey: 'texas:A.6A', requestedFramework: 'act' }).reason, 'framework-mismatch');
  assert.equal(launch({ requestedFramework: 'digitalSAT' }).reason, 'framework-mismatch');
  assert.equal(launch({ weeklySlotKey: 'not-a-slot' }).reason, 'slot-missing');
  assert.equal(launch({ classId: 'class-2' }).reason, 'class-mismatch');
  assert.equal(launch({ goal: null }).reason, 'week-not-assigned');
  assert.equal(launch({ targetAlignmentKey: '' }).reason, 'target-mismatch');
});

test('a week frozen before swaps permits only its own standards', () => {
  // The schema-1 snapshot shape: no `alternatives` on any slot.
  const legacy = frozenWeek();
  legacy.schemaVersion = 1;
  legacy.sessions = legacy.sessions.map(({ alternatives, ...slot }) => slot);
  const [slot] = legacy.sessions;
  assert.deepEqual(permittedWeeklySlotAlternatives(legacy, slot, SERVER), []);
  assert.equal(authorizeWeeklySlotLaunch({ goal: legacy, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.7C', ...SERVER }).ok, false);
  assert.equal(authorizeWeeklySlotLaunch({ goal: legacy, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.5A', ...SERVER }).ok, true);
});

test('a stored alternative is re-checked at launch, not trusted', () => {
  const goal = frozenWeek();
  const [slot] = goal.sessions;
  // A snapshot edited by hand to permit another slot's standard or another
  // context authorizes nothing a fresh freeze would not keep.
  slot.alternatives = [
    { skillId: 'teks:A.3B', teksCode: 'A.3B' },
    { skillId: 'teks:A.8B', teksCode: 'A.8B', context: 'act' },
    ...slot.alternatives,
  ];
  assert.equal(authorizeWeeklySlotLaunch({ goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.3B', ...SERVER }).ok, false);
  assert.equal(authorizeWeeklySlotLaunch({ goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.8B', ...SERVER }).ok, false);
  assert.equal(authorizeWeeklySlotLaunch({ goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.7C', ...SERVER }).ok, true);
});

test('a swapped session fills the slot it was launched for — student, teacher and Classroom', () => {
  const goal = frozenWeek();
  const [slot] = goal.sessions;
  const authorized = authorizeWeeklySlotLaunch({ goal, weeklySlotKey: slot.weeklySlotKey, targetAlignmentKey: 'texas:A.7C', ...SERVER });
  // The session document the callable writes for that launch, finished.
  const swapped = {
    studentId: 'S1',
    status: 'completed',
    weekKey: WEEK,
    weeklySlotKey: slot.weeklySlotKey,
    weeklySlot: slot.slot,
    target: { alignmentKey: 'texas:A.7C' },
    swappedFromTeks: authorized.swappedFromTeks,
    chosenAlternative: authorized.chosenAlternative,
    summary: { completedQuestions: 5, correctQuestions: 4 },
    completedAt: MON + 60_000,
  };
  // Free practice on the same alternative standard, with no weekly slot.
  const freePractice = { ...swapped, weeklySlotKey: null, weekKey: null, weeklySlot: null, completedAt: MON + 120_000 };
  const { completions } = collectWeeklyPathSessions({
    sessions: [{ id: 'swapped', data: swapped }, { id: 'free', data: freePractice }],
    weekKey: WEEK,
    displayTeks: mathPath.displayAlignmentKey,
  });
  assert.equal(completions.length, 2);
  assert.equal(completions[0].teksCode, 'A.7C', 'the completion is for the standard actually practised');

  const { matched, unmatched } = matchWeeklyGoalCompletions({ goal, completions });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].sessionId, 'swapped');
  assert.equal(matched[0].matchedSlot, slot.slot, 'the swap keeps the slot it was launched for');
  assert.equal(matched[0].weeklySlotKey, slot.weeklySlotKey);
  // Practising the alternative outside the weekly slot never fills it.
  assert.deepEqual(unmatched.map((entry) => entry.sessionId), ['free']);

  const now = MON + 200_000;
  const progress = evaluateWeeklyGoalProgress({ goal, completions, now });
  assert.equal(progress.completed, 1);
  const grade = gradeWeeklyGoal({ goal, completions, now });
  assert.equal(grade.progress.completedOnTime, 1);
  assert.equal(grade.components.qualityRatio, 0.8, 'quality is read from the swapped session alone');
});

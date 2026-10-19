// The reader rewards (job E) use to learn what happened on a student's Path:
// weekly goals hit and skills mastered, each with a deterministic eventKey.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PATH_GROWTH_EVENT,
  masteryStatusOf,
  pathGrowthEventKey,
  skillMasteredEvents,
  skillMasteredEventsFromHistory,
  weeklyGoalHitEvent,
  weeklyGoalHitEvents,
} from '../../functions/shared/pathGrowthEvents.mjs';
import { describeWeeklyGradeForStudent } from '../../functions/shared/weeklyPathGrade.mjs';
import { completionFromPathSession } from '../../functions/shared/weeklyPathCompletion.mjs';
import { MASTERY_RULE, MASTERY_STATUS, classifyMasteryStatus, masteryFactsFromProfile } from '../../functions/shared/masteryRule.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const WEEK = '2026-08-31';
const DUE = Date.parse('2026-09-06T23:59:59.999-05:00');
const HOUR = 60 * 60 * 1000;

const frozenGoal = (slots = 3, extra = {}) => ({
  studentId: 'S1',
  classId: 'c1',
  weekKey: WEEK,
  dueAt: DUE,
  goalSessions: slots,
  assignmentState: 'assigned',
  sessions: Array.from({ length: slots }, (_, index) => ({
    slot: index + 1,
    teksCode: `A.${index + 2}A`,
    weeklySlotKey: `${index + 1}|teks:A.${index + 2}A|A.${index + 2}A|current_learning|course|2|3`,
  })),
  ...extra,
});
const done = (goal, slotIndex, completedAt, extra = {}) => ({
  status: 'completed',
  sessionId: `P${slotIndex + 1}`,
  weekKey: goal.weekKey,
  weeklySlotKey: goal.sessions[slotIndex].weeklySlotKey,
  teksCode: goal.sessions[slotIndex].teksCode,
  completedAt,
  accuracy: 0.8,
  ...extra,
});

/* ------------------------------------------------------- weeklyGoalHit */

test('a finished frozen week is one weeklyGoalHit, dated when it was finished', () => {
  const goal = frozenGoal(3);
  const completions = [done(goal, 2, DUE - 2 * HOUR), done(goal, 0, DUE - 30 * HOUR), done(goal, 1, DUE - 10 * HOUR)];
  const event = weeklyGoalHitEvent({ goal, completions });
  assert.deepEqual({ ...event }, {
    type: 'weeklyGoalHit',
    eventKey: `weeklyGoalHit:S1:${WEEK}`,
    studentId: 'S1',
    classId: 'c1',
    weekKey: WEEK,
    completedAt: DUE - 2 * HOUR,
    onTime: true,
    required: 3,
    completedOnTime: 3,
  });
  assert.ok(Object.isFrozen(event));
});

test('reading the same records twice gives the same event and key', () => {
  const goal = frozenGoal(2);
  const completions = [done(goal, 0, DUE - HOUR), done(goal, 1, DUE - 2 * HOUR)];
  assert.deepEqual(weeklyGoalHitEvent({ goal, completions }), weeklyGoalHitEvent({ goal, completions: [...completions].reverse() }));
});

test('an unfinished week is no event, and the reader agrees with the grade on every count', () => {
  const goal = frozenGoal(4);
  const all = [0, 1, 2, 3].map((slot) => done(goal, slot, DUE - (slot + 1) * HOUR));
  for (let count = 0; count <= 4; count += 1) {
    const completions = all.slice(0, count);
    const event = weeklyGoalHitEvent({ goal, completions });
    const shown = describeWeeklyGradeForStudent({ goal, completions, now: DUE - HOUR / 2 });
    assert.equal(event !== null, shown.complete, `${count} of 4: the reward and the grade must agree`);
  }
});

test('a week finished after the deadline is still hit, and says it was late', () => {
  const goal = frozenGoal(2);
  const event = weeklyGoalHitEvent({ goal, completions: [done(goal, 0, DUE - HOUR), done(goal, 1, DUE + 3 * HOUR)] });
  assert.equal(event.completedAt, DUE + 3 * HOUR);
  assert.equal(event.onTime, false);
  assert.equal(event.completedOnTime, 1);
});

test('only completed sessions of this week\'s slots count', () => {
  const goal = frozenGoal(2);
  // Session documents, through the one completion rule.
  const sessions = [
    ['P1', { status: 'completed', completedAt: DUE - HOUR, weekKey: WEEK, weeklySlotKey: goal.sessions[0].weeklySlotKey, target: { alignmentKey: 'texas:A.2A' } }],
    ['P2', { status: 'active', updatedAt: DUE - HOUR, weekKey: WEEK, weeklySlotKey: goal.sessions[1].weeklySlotKey, target: { alignmentKey: 'texas:A.3A' } }],
  ];
  const completions = sessions.map(([id, data]) => completionFromPathSession(id, data)).filter(Boolean);
  assert.equal(weeklyGoalHitEvent({ goal, completions }), null, 'a session still open does not finish the week');

  // Extra practice, and a completion from another week, fill no slot.
  const extra = { status: 'completed', completedAt: DUE - HOUR, teksCode: 'A.9A', accuracy: 1 };
  const otherWeek = done(goal, 1, DUE - HOUR, { weekKey: '2026-08-24' });
  assert.equal(weeklyGoalHitEvent({ goal, completions: [done(goal, 0, DUE - HOUR), extra, otherWeek] }), null);
});

test('a short week is hit when its own cards are done', () => {
  // Frozen before the server capped the count: four asked, three cards.
  const goal = frozenGoal(3, { goalSessions: 4 });
  const event = weeklyGoalHitEvent({ goal, completions: [0, 1, 2].map((slot) => done(goal, slot, DUE - HOUR)) });
  assert.equal(event?.required, 3);
});

test('only a frozen, assigned week can be an event', () => {
  const completions = (goal) => [done(goal, 0, DUE - HOUR), done(goal, 1, DUE - HOUR)];
  for (const assignmentState of ['proposed', 'simulation', undefined]) {
    const goal = frozenGoal(2, { assignmentState });
    assert.equal(weeklyGoalHitEvent({ goal, completions: completions(goal) }), null, `assignmentState ${assignmentState}`);
  }
  const noStudent = frozenGoal(2, { studentId: undefined });
  assert.equal(weeklyGoalHitEvent({ goal: noStudent, completions: completions(noStudent) }), null);
  assert.equal(weeklyGoalHitEvent({ studentId: 'S9', goal: noStudent, completions: completions(noStudent) })?.eventKey, `weeklyGoalHit:S9:${WEEK}`);
  const badWeek = frozenGoal(2, { weekKey: '2026-W36' });
  assert.equal(weeklyGoalHitEvent({ goal: badWeek, completions: completions(badWeek) }), null);
  assert.equal(weeklyGoalHitEvent({ goal: frozenGoal(0), completions: [] }), null, 'an empty week is never "hit"');
  assert.equal(weeklyGoalHitEvent({ goal: null }), null);
  assert.equal(weeklyGoalHitEvent(), null);
});

test('a completion with no usable time still counts, with no time claimed', () => {
  const goal = frozenGoal(2);
  const event = weeklyGoalHitEvent({ goal, completions: [done(goal, 0, DUE - HOUR), done(goal, 1, 0)] });
  assert.equal(event.completedAt, null);
});

test('a class-week gives one event per student who finished, ordered by key', () => {
  const a = frozenGoal(2, { studentId: 'S2' });
  const b = frozenGoal(2, { studentId: 'S1' });
  const c = frozenGoal(2, { studentId: 'S3' });
  const events = weeklyGoalHitEvents({
    goalsByStudentId: { S2: a, S1: b, S3: c },
    completionsByStudentId: {
      S2: [done(a, 0, DUE - HOUR), done(a, 1, DUE - HOUR)],
      S1: [done(b, 0, DUE - HOUR), done(b, 1, DUE - HOUR)],
      S3: [done(c, 0, DUE - HOUR)],
    },
  });
  assert.deepEqual(events.map((event) => event.eventKey), [`weeklyGoalHit:S1:${WEEK}`, `weeklyGoalHit:S2:${WEEK}`]);
  assert.deepEqual(weeklyGoalHitEvents(), []);
});

/* ------------------------------------------------------- skillMastered */

// A profile in the stored studentMasteryProfiles shape.
const profile = ({ estimate, events = 5, independent = 2, doks = [2, 3], updatedAt = 1_000 } = {}) => ({
  mastery: { estimate, status: 'Mastered' },
  accumulator: { eligibleEvents: events, effectiveWeight: events, independentSuccesses: independent },
  dimensions: { dokRepresented: doks },
  updatedAt,
});
const MASTERED = profile({ estimate: MASTERY_RULE.masteredEstimate + 5 });
const SECURE = profile({ estimate: MASTERY_RULE.masteredEstimate - 5 });

test('the fixtures mean what they say under the one rule', () => {
  assert.equal(classifyMasteryStatus(masteryFactsFromProfile(MASTERED)), MASTERY_STATUS.MASTERED);
  assert.equal(classifyMasteryStatus(masteryFactsFromProfile(SECURE)), MASTERY_STATUS.SECURE);
});

test('a skill that becomes Mastered between two snapshots is one event', () => {
  const events = skillMasteredEvents({
    studentId: 'S1',
    classId: 'c1',
    before: { 'A.5A': SECURE, 'A.3A': MASTERED },
    after: { 'A.5A': MASTERED, 'A.3A': MASTERED, 'A.9A': SECURE },
    at: 5_000,
  });
  assert.deepEqual(events.map((event) => ({ ...event })), [{
    type: 'skillMastered', eventKey: 'skillMastered:S1:A.5A', studentId: 'S1', classId: 'c1', teksCode: 'A.5A', at: 5_000,
  }]);
});

test('Mastered comes from the rule, never from the stored label', () => {
  // SECURE carries a stored status of "Mastered"; its facts say Secure.
  assert.equal(SECURE.mastery.status, 'Mastered');
  assert.deepEqual(skillMasteredEvents({ studentId: 'S1', before: {}, after: { 'A.5A': SECURE } }), []);
  // No DOK 3 item, no independent successes: not Mastered whatever the score.
  const noDok3 = profile({ estimate: 99, doks: [1, 2] });
  const noIndependence = profile({ estimate: 99, independent: 0 });
  assert.deepEqual(skillMasteredEvents({ studentId: 'S1', before: {}, after: { 'A.5A': noDok3, 'A.3A': noIndependence } }), []);
});

test('a skill new to the record that arrives Mastered is an event; one already Mastered is not', () => {
  const events = skillMasteredEvents({ studentId: 'S1', before: { 'A.3A': MASTERED }, after: { 'A.3A': MASTERED, 'A.5A': MASTERED } });
  assert.deepEqual(events.map((event) => event.teksCode), ['A.5A']);
  assert.equal(events[0].at, MASTERED.updatedAt, 'without an explicit time the profile\'s own update time is used');
});

test('one skill under any spelling is one key', () => {
  const events = skillMasteredEvents({ studentId: 'S1', before: { 'texas:A.5A': SECURE }, after: { 'a.5a': MASTERED, 'teks:A.5A': MASTERED } });
  assert.deepEqual(events.map((event) => event.eventKey), ['skillMastered:S1:A.5A']);
  assert.deepEqual(skillMasteredEvents({ studentId: 'S1', before: { 'texas:A.5A': MASTERED }, after: { 'A.5A': MASTERED } }), []);
  assert.deepEqual(skillMasteredEvents({ studentId: '', after: { 'A.5A': MASTERED } }), []);
});

test('a history yields each skill once, at its first move to Mastered', () => {
  const history = [
    { at: 100, skills: { 'A.5A': 'Secure', 'A.3A': 'Mastered' } },
    { at: 200, skills: { 'A.5A': 'Mastered', 'A.3A': 'Mastered' } },
    { at: 300, skills: { 'A.5A': 'Secure', 'A.3A': 'Mastered', 'A.9A': 'Developing' } },
    // A.5A comes back: the same key, so no second reward.
    { at: 400, skills: { 'A.5A': 'Mastered', 'A.3A': 'Mastered', 'A.9A': 'Mastered' } },
  ];
  const events = skillMasteredEventsFromHistory({ studentId: 'S1', history });
  assert.deepEqual(events.map((event) => [event.teksCode, event.at]), [['A.5A', 200], ['A.9A', 400]]);
  assert.equal(new Set(events.map((event) => event.eventKey)).size, events.length);

  // The first snapshot is a baseline unless told otherwise.
  const backfill = skillMasteredEventsFromHistory({ studentId: 'S1', history, assumeEmptyBaseline: true });
  assert.deepEqual(backfill.map((event) => [event.teksCode, event.at]), [['A.3A', 100], ['A.5A', 200], ['A.9A', 400]]);
});

test('any stored shape can be read through statusOf', () => {
  // e.g. a weekly history that stores [estimate, statusCode] per skill.
  const CODES = ['Not Enough Evidence', 'Needs Attention', 'Developing', 'Secure', 'Mastered'];
  const history = [
    { at: 1, skills: { 'A.5A': [70, 3] } },
    { at: 2, skills: { 'A.5A': [90, 4] } },
  ];
  const events = skillMasteredEventsFromHistory({ studentId: 'S1', history, statusOf: ([, code] = []) => CODES[code] });
  assert.deepEqual(events.map((event) => event.eventKey), ['skillMastered:S1:A.5A']);
  // `profiles` and `statuses` are accepted names for a snapshot's skills.
  assert.equal(skillMasteredEventsFromHistory({
    studentId: 'S1',
    history: [{ at: 1, statuses: { 'A.5A': 'Secure' } }, { at: 2, profiles: { 'A.5A': MASTERED } }],
  }).length, 1);
});

test('a status string is taken as given; an unknown value is no evidence', () => {
  assert.equal(masteryStatusOf('Mastered'), MASTERY_STATUS.MASTERED);
  assert.equal(masteryStatusOf('mastered!'), MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.equal(masteryStatusOf(null), MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.equal(masteryStatusOf([90, 4]), MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.equal(masteryStatusOf(MASTERED), MASTERY_STATUS.MASTERED);
});

/* ------------------------------------------------------------ the keys */

test('event keys are deterministic and complete, or absent', () => {
  assert.equal(pathGrowthEventKey({ type: PATH_GROWTH_EVENT.WEEKLY_GOAL_HIT, studentId: 'S1', weekKey: WEEK }), `weeklyGoalHit:S1:${WEEK}`);
  assert.equal(pathGrowthEventKey({ type: PATH_GROWTH_EVENT.SKILL_MASTERED, studentId: 'S1', teksCode: 'texas:a.5a' }), 'skillMastered:S1:A.5A');
  assert.equal(pathGrowthEventKey({ type: PATH_GROWTH_EVENT.WEEKLY_GOAL_HIT, studentId: 'S1', weekKey: 'soon' }), null);
  assert.equal(pathGrowthEventKey({ type: PATH_GROWTH_EVENT.SKILL_MASTERED, studentId: 'S1', teksCode: '' }), null);
  assert.equal(pathGrowthEventKey({ type: PATH_GROWTH_EVENT.WEEKLY_GOAL_HIT, studentId: '', weekKey: WEEK }), null);
  assert.equal(pathGrowthEventKey({ type: 'streak', studentId: 'S1', weekKey: WEEK }), null);
});

test('the reader is pure: no Firestore, no clock, nothing written', () => {
  const source = readFileSync(new URL('../../functions/shared/pathGrowthEvents.mjs', import.meta.url), 'utf8');
  const code = executableSource(source);
  assert.doesNotMatch(code, /firebase|firestore|runTransaction|\.collection\(|\.doc\(/i);
  assert.doesNotMatch(code, /Date\.now\(|new Date\(\)/);
  const imports = [...code.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
  assert.deepEqual(imports.sort(), ['./masteryRule.mjs', './teksUtils.mjs', './weeklyPathGrade.mjs']);
});

test('the handoff doc states the same contract as the code', () => {
  const doc = readFileSync(new URL('../../docs/handoffs/PATH_GROWTH_EVENTS_FOR_REWARDS.md', import.meta.url), 'utf8');
  assert.match(doc, /functions\/shared\/pathGrowthEvents\.mjs/);
  for (const name of ['weeklyGoalHitEvent', 'weeklyGoalHitEvents', 'skillMasteredEvents', 'skillMasteredEventsFromHistory']) {
    assert.match(doc, new RegExp(`\\b${name}\\(`), `${name} must be documented`);
  }
  // The documented key formats are the ones the code produces.
  assert.ok(doc.includes('`weeklyGoalHit:<studentId>:<weekKey>`'));
  assert.ok(doc.includes('`skillMastered:<studentId>:<TEKS>`'));
  assert.match(pathGrowthEventKey({ type: 'weeklyGoalHit', studentId: 'S', weekKey: WEEK }), /^weeklyGoalHit:S:\d{4}-\d{2}-\d{2}$/);
  assert.match(pathGrowthEventKey({ type: 'skillMastered', studentId: 'S', teksCode: 'A.5A' }), /^skillMastered:S:A\.5A$/);
});

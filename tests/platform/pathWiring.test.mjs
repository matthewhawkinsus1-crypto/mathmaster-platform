import test from 'node:test';
import assert from 'node:assert/strict';
import { recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { buildStudentMasteryProfile } from '../../src/masteryEngine.js';
import {
  CONFIDENT_EVIDENCE, buildMasteryBySkill, buildMasteryBySkillForStudent,
  collectAssignmentSkillIds, toSkillMastery,
} from '../../src/platform/path/masteryAdapter.js';
import {
  MAX_HISTORY_EVENTS, ROUTE_EVENTS,
  appendRouteEvent, buildRouteEvent, getPacingForClass, normalizeOverrides,
  normalizePacingByClass, overridesForClass, pruneExpiredOverrides,
  removeOverride, upsertOverride,
} from '../../src/platform/path/pathStore.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { STATUS, getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';

const CODE = 'A.5A';
const SKILL = teksSkillId(CODE);

const question = (code, dok = 2) => ({
  type: 'algebra',
  alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }],
  dok,
});

// Build a real student document by running real attempts through the real
// attempt policy — no hand-written mastery numbers anywhere in this file.
const studentWith = (code, outcomes) => {
  const assignment = { id: 'a1', title: 'Lesson', questions: outcomes.map((_, i) => question(code, i % 3 === 0 ? 3 : 2)) };
  const grades = {};
  outcomes.forEach((isCorrect, index) => {
    let record = recordQuestionAttempt({ record: null, isCorrect }).record;
    if (!isCorrect) {
      record = recordQuestionAttempt({ record, isCorrect: false }).record;
      record = recordQuestionAttempt({ record, isCorrect: false }).record;
    }
    grades[index] = record;
  });
  return { student: { id: 's1', gradesByAssignment: { a1: grades } }, assignments: [assignment] };
};

// --- adapter ----------------------------------------------------------------
test('the adapter converts the mastery engine 0-100 scale to 0-1', () => {
  const record = toSkillMastery({
    score: 72, itemCount: 8, firstAttemptCorrectRate: 50,
    effectiveEvidence: 6, performance: { key: 'meets', label: 'Meets' },
  });
  assert.equal(record.mastery, 0.72);
  assert.equal(record.attempts, 8);
  assert.equal(record.recentAccuracy, 0.5);
  assert.equal(record.evidenceStrength, 1, `${CONFIDENT_EVIDENCE} weighted items is full strength`);
  assert.equal(record.performanceKey, 'meets');
});

test('weighted evidence, not raw item count, drives evidence strength', () => {
  // Four easy items and four hard items are not the same evidence.
  const light = toSkillMastery({ score: 90, itemCount: 4, effectiveEvidence: 1.5 });
  const heavy = toSkillMastery({ score: 90, itemCount: 4, effectiveEvidence: 6 });
  assert.ok(heavy.evidenceStrength > light.evidenceStrength);
});

test('a skill with no evidence is absent, not present with mastery zero', () => {
  // Present-with-zero would read as a severe gap and lock everything downstream.
  const map = buildMasteryBySkill({ teks: { [CODE]: { score: 0, itemCount: 0, effectiveEvidence: 0 } } });
  assert.deepEqual(map, {});
});

test('a real student document flows through to a path-engine mastery map', () => {
  const { student, assignments } = studentWith(CODE, [true, true, true, false, true, true]);
  const map = buildMasteryBySkillForStudent({ student, assignments });
  assert.ok(map[SKILL], 'the TEKS code became a skillId');
  assert.ok(map[SKILL].mastery > 0 && map[SKILL].mastery <= 1, `got ${map[SKILL].mastery}`);
  assert.equal(map[SKILL].attempts, 6);
  // Cross-check against the engine the adapter reads from.
  const profile = buildStudentMasteryProfile({ student, assignments });
  assert.equal(map[SKILL].mastery, Number((profile.teks[CODE].score / 100).toFixed(10)));
});

test('assignment skill ids are collected for current-work weighting', () => {
  const ids = collectAssignmentSkillIds([
    { questions: [question('A.5A'), question('A.2A'), { type: 'algebra' }] },
    { questions: [question('A.5A')] },
  ]);
  assert.deepEqual(ids.sort(), [teksSkillId('A.2A'), teksSkillId('A.5A')].sort());
  assert.deepEqual(collectAssignmentSkillIds(null), []);
});

// --- the actual point of batch 2 -------------------------------------------
test('end to end: a struggling student document produces remediation routing', () => {
  const { student, assignments } = studentWith(CODE, [false, false, false, true, false, false]);
  const masteryBySkill = buildMasteryBySkillForStudent({ student, assignments });

  assert.ok(masteryBySkill[SKILL].mastery < 0.55, `expected a weak skill, got ${masteryBySkill[SKILL].mastery}`);

  // A.5A is a prerequisite for later Algebra I skills, so the weakness has to
  // show up as remediation or a lock somewhere downstream.
  const result = getStudentPathOptions({ courseId: 'algebra1', masteryBySkill });
  const affected = [...result.remediation, ...result.locked];
  assert.ok(affected.length > 0, 'a real weakness has to change the routing, not just the report');
  assert.ok(affected.every((row) => row.remediationTarget), 'every affected skill names where to send the student');

  // And unrelated branches stay open — the graph, not a sequence.
  assert.ok(result.available.length + result.recommended.length > 0);
});

test('end to end: a strong student document does not produce remediation on that skill', () => {
  const { student, assignments } = studentWith(CODE, [true, true, true, true, true, true]);
  const masteryBySkill = buildMasteryBySkillForStudent({ student, assignments });
  const result = getStudentPathOptions({ courseId: 'algebra1', masteryBySkill });
  assert.ok(!result.remediation.some((row) => row.remediationTarget === SKILL));
  assert.ok(!result.locked.some((row) => row.unmetPrerequisites.includes(SKILL)));
});

// --- pacing store -----------------------------------------------------------
test('pacing is stored per class so sections can differ', () => {
  const stored = normalizePacingByClass({
    'Period 1': { currentWindow: 3, windowCount: 8 },
    'Period 2': { currentWindow: 5, windowCount: 8 },
    '': { currentWindow: 9 },
  });
  assert.equal(Object.keys(stored).length, 2, 'a blank class id is dropped');
  assert.equal(stored['Period 1'].currentWindow, 3);
  assert.equal(stored['Period 2'].currentWindow, 5);
  // Out-of-range positions are clamped rather than trusted.
  assert.equal(normalizePacingByClass({ x: { currentWindow: 99, windowCount: 8 } }).x.currentWindow, 8);
  assert.equal(getPacingForClass(stored, 'Period 9').currentWindow, 1, 'an unknown class falls back to the start');
  assert.doesNotThrow(() => normalizePacingByClass(null));
});

// --- overrides --------------------------------------------------------------
test('overrides validate their action and reject junk', () => {
  const list = normalizeOverrides([
    { classId: 'P1', skillId: SKILL, action: 'open' },
    { classId: 'P1', skillId: SKILL, action: 'teleport' },
    { classId: 'P1', action: 'open' },
    null, 42,
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].action, 'open');
});

test('one action per class and skill — a later decision replaces the earlier one', () => {
  let overrides = upsertOverride([], { classId: 'P1', skillId: SKILL, action: 'recommend' });
  overrides = upsertOverride(overrides, { classId: 'P1', skillId: SKILL, action: 'hide' });
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].action, 'hide');

  // A different class is a different decision.
  overrides = upsertOverride(overrides, { classId: 'P2', skillId: SKILL, action: 'open' });
  assert.equal(overrides.length, 2);
  assert.equal(removeOverride(overrides, { classId: 'P1', skillId: SKILL }).length, 1);
});

test('overrides are scoped to a class, and class-less ones apply everywhere', () => {
  const overrides = [
    { classId: 'P1', skillId: SKILL, action: 'open' },
    { classId: '', skillId: teksSkillId('A.2A'), action: 'priority' },
  ];
  const forP2 = overridesForClass(overrides, 'P2');
  assert.equal(forP2.length, 1, 'another class does not inherit a period-specific unlock');
  assert.equal(forP2[0].skillId, teksSkillId('A.2A'));
});

test('expired overrides are pruned on write', () => {
  const kept = pruneExpiredOverrides([
    { classId: 'P1', skillId: SKILL, action: 'open', expiresAt: '2020-01-01' },
    { classId: 'P1', skillId: teksSkillId('A.2A'), action: 'open', expiresAt: '2099-01-01' },
    { classId: 'P1', skillId: teksSkillId('A.3A'), action: 'open' },
  ]);
  assert.equal(kept.length, 2, 'an entry with no expiry is permanent until removed');
});

test('a stored override actually changes the engine result', () => {
  const skillId = teksSkillId('A.2A');
  const overrides = overridesForClass(upsertOverride([], { classId: 'P1', skillId, action: 'priority' }), 'P1');
  const result = getStudentPathOptions({ courseId: 'algebra1', teacherOverrides: overrides });
  const row = [...result.priority, ...result.recommended, ...result.available].find((item) => item.skillId === skillId);
  assert.equal(row.status, STATUS.PRIORITY, 'the persisted shape has to be the shape the engine reads');
});

// --- route history ----------------------------------------------------------
test('a route event records the decision in reason codes, not prose', () => {
  const event = buildRouteEvent({
    studentId: 's1',
    event: ROUTE_EVENTS.REMEDIATION_STARTED,
    originSkillId: teksSkillId('A.5C'),
    selectedSkillId: SKILL,
    decisionType: 'remediation',
    reasons: ['prerequisite_gap', 'recent_accuracy_below_threshold'],
    nowValue: Date.UTC(2026, 0, 2, 3, 4, 5),
  });
  assert.equal(event.timestamp, '2026-01-02T03:04:05.000Z');
  assert.equal(event.decisionType, 'remediation');
  assert.deepEqual(event.reasons, ['prerequisite_gap', 'recent_accuracy_below_threshold']);
  assert.ok(event.originSkillId && event.selectedSkillId, 'both ends of the move are recorded');
});

test('history is a rolling window, not an archive', () => {
  let history = [];
  for (let i = 0; i < MAX_HISTORY_EVENTS + 25; i += 1) {
    history = appendRouteEvent(history, buildRouteEvent({ studentId: 's1', event: ROUTE_EVENTS.GENERATED, context: { i } }));
  }
  assert.equal(history.length, MAX_HISTORY_EVENTS);
  assert.equal(history.at(-1).context.i, MAX_HISTORY_EVENTS + 24, 'the newest event survives');
  assert.equal(history[0].context.i, 25, 'the oldest is dropped');
});

test('hostile input never throws anywhere in the wiring layer', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => buildMasteryBySkill(bad));
    assert.doesNotThrow(() => normalizeOverrides(bad));
    assert.doesNotThrow(() => normalizePacingByClass(bad));
    assert.doesNotThrow(() => appendRouteEvent(bad, buildRouteEvent()));
    assert.doesNotThrow(() => collectAssignmentSkillIds(bad));
  }
  assert.equal(toSkillMastery(null), null);
  assert.doesNotThrow(() => buildRouteEvent());
});

test('the brief section 28 scenario is now expressible end to end', () => {
  // Strong at functions, weak at solving equations. Systems must lock because
  // it genuinely depends on A.5A; the function branch must stay open.
  const weak = studentWith('A.5A', [false, false, false, false, true, false]);
  const masteryBySkill = buildMasteryBySkillForStudent(weak);
  const result = getStudentPathOptions({ courseId: 'algebra1', masteryBySkill });

  const systems = [...result.locked, ...result.remediation].find((row) => row.skillId === teksSkillId('A.5C'));
  assert.ok(systems, 'A.5C must be gated by the A.5A weakness');
  assert.ok(systems.unmetPrerequisites.includes(SKILL));
  assert.equal(systems.remediationTarget, SKILL, 'and it names A.5A as where to send the student');

  // An unrelated branch — graphing quadratics — must be untouched.
  const quadratics = [...result.recommended, ...result.available]
    .find((row) => row.skillId === teksSkillId('A.7A'));
  assert.ok(quadratics, 'Guardrail 3: one local weakness must not close unrelated branches');
});

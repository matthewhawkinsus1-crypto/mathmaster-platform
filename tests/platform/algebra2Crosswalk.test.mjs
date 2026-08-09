import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGEBRA_II_CROSSWALK_CODES, ALGEBRA_II_CURRICULUM_CROSSWALK,
  buildAlgebraIIReinforcementLinks, buildAlgebraIISkillCurriculumLinks, isAlgebraIICoursewideStandard,
} from '../../src/platform/curriculum/algebra2CurriculumCrosswalk.js';
import { TEXAS_STANDARDS_BY_COURSE, getTexasStandard } from '../../src/texasStandards.js';
import ALG2H from '../../src/curriculum/calendars/algebra2Honors-2026-2027.js';
import { CALENDAR_TIMING, loadCalendar } from '../../src/platform/path/curriculumCalendar.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { STATUS, explainForStudent } from '../../src/platform/path/recommendationEngine.js';

const calendar = loadCalendar(ALG2H);
const all = TEXAS_STANDARDS_BY_COURSE.algebra2;
const content = all.filter((s) => s.classification !== 'process');
const process = all.filter((s) => s.classification === 'process');
const on = (date) => Date.parse(`${date}T12:00:00Z`);
const PACING = { currentWindow: 1, windowCount: 8 };
const rowsOn = (date, extra = {}) => {
  const opts = buildStudentPathOptions({
    student: { id: 's', gradesByAssignment: {} }, assignments: [],
    courseId: 'algebra2', pacing: PACING, nowValue: on(date), ...extra,
  });
  return { opts, find: (code) => Object.values(opts).filter(Array.isArray).flat().find((r) => r.skillId === teksSkillId(code)) };
};

test('the registry is 55 = 48 content + 7 process, and all 48 are mapped once', () => {
  assert.equal(all.length, 55);
  assert.equal(content.length, 48);
  assert.equal(process.length, 7);
  const unmapped = content.filter((s) => !ALGEBRA_II_CURRICULUM_CROSSWALK[s.code]);
  assert.deepEqual(unmapped.map((s) => s.code), [], 'these content standards have no curriculum home');
  assert.equal(ALGEBRA_II_CROSSWALK_CODES.length, 48);
  assert.equal(new Set(ALGEBRA_II_CROSSWALK_CODES).size, 48, 'no standard appears twice');
});

test('every crosswalk code is a real Algebra II standard', () => {
  ALGEBRA_II_CROSSWALK_CODES.forEach((code) => {
    const standard = getTexasStandard(code);
    assert.ok(standard, `${code} is not in the registry`);
    assert.equal(standard.courseId, 'algebra2');
  });
});

test('every curriculum id resolves to a real calendar node', () => {
  const ids = new Set();
  Object.values(ALGEBRA_II_CURRICULUM_CROSSWALK).forEach((entry) => {
    ids.add(entry.primaryCurriculumId);
    (entry.reinforcementCurriculumIds || []).forEach((id) => ids.add(id));
  });
  const missing = [...ids].filter((id) => !calendar.byCurriculumId.has(id));
  assert.deepEqual(missing, [], 'these curriculum ids have no node in the Algebra II calendar');
  // The four locally named units and the four Bluebonnet modules are all present.
  ['alg2.u1.t1', 'alg2.u1.t2', 'alg2.u2.t1', 'alg2.u2.t2', 'alg2.u3', 'alg2.u4',
    'alg2.m2', 'alg2.m3', 'alg2.m4', 'alg2.m5', 'alg2.modeling'].forEach((id) => {
    assert.ok(calendar.byCurriculumId.has(id), `${id} missing from the calendar`);
  });
});

test('the seven A2.1 process standards stay coursewide', () => {
  process.forEach((standard) => {
    assert.ok(isAlgebraIICoursewideStandard(standard.code));
    assert.equal(ALGEBRA_II_CURRICULUM_CROSSWALK[standard.code], undefined,
      `${standard.code} must not be date gated`);
  });
});

// --- the state Algebra II forced into existence -----------------------------
test('a revisit never relocks a skill the student already reached', () => {
  // Module 5 runs Nov 30 - Dec 17 and again Mar 22 - Apr 9.
  assert.equal(rowsOn('2026-12-08').find('A2.5D').calendarTiming, CALENDAR_TIMING.CURRENT);

  const february = rowsOn('2027-02-10').find('A2.5D');
  assert.equal(february.calendarTiming, CALENDAR_TIMING.REVIEW,
    'a later window must not push an already-taught skill back to future');
  assert.notEqual(february.status, STATUS.FUTURE);
  assert.notEqual(february.status, STATUS.LOCKED);
  // ...and the revisit is reported separately so a card can mention it.
  assert.ok(february.reinforcementStatus);
  assert.ok(february.calendarDaysUntilReinforcement > 0);
  assert.match(explainForStudent(february), /revisits it in \d+ days?/);
});

test('the revisit becomes upcoming five instructional days before it returns', () => {
  // Second Module 5 window starts 2027-03-22; spring break sits just before it.
  const near = rowsOn('2027-03-12').find('A2.5D');
  assert.equal(near.calendarTiming, CALENDAR_TIMING.REVIEW, 'still review — access is never withdrawn');
  assert.equal(near.reinforcementStatus, CALENDAR_TIMING.UPCOMING);
});

test('Module 2 is unscheduled rather than invented or locked', () => {
  const row = rowsOn('2026-09-15').find('A2.4A');
  assert.equal(row.calendarTiming, CALENDAR_TIMING.UNSCHEDULED);
  assert.equal(row.unscheduled, true);
  assert.notEqual(row.status, STATUS.FUTURE, 'a source-data gap must not hard-lock content');
  assert.notEqual(row.status, STATUS.LOCKED);
  assert.match(explainForStudent(row), /not scheduled this yet/i);
});

test('a teacher can still place or open an unscheduled skill', () => {
  const skillId = teksSkillId('A2.4A');
  const opened = rowsOn('2026-09-15', { teacherOverrides: [{ skillId, action: 'recommend' }] });
  assert.equal(opened.find('A2.4A').status, STATUS.PRIORITY);
});

test('embedded modelling standards are always in scope, never gated', () => {
  ['A2.8A', 'A2.8B', 'A2.8C'].forEach((code) => {
    const row = rowsOn('2026-09-15').find(code);
    assert.equal(row.calendarTiming, CALENDAR_TIMING.CURRENT);
    assert.notEqual(row.status, STATUS.FUTURE);
  });
});

// --- function-family exposure is not mastery access -------------------------
test('analysing every parent graph in August does not open every family in September', () => {
  const { find } = rowsOn('2026-09-15');
  // A2.2A covers reciprocal and radical parent graphs in Unit 1...
  assert.notEqual(find('A2.2A').calendarTiming, CALENDAR_TIMING.FUTURE);
  // ...but rational and radical SOLVING keep their Module 4 home.
  ['A2.6I', 'A2.6J', 'A2.6K', 'A2.7F', 'A2.4G'].forEach((code) => {
    assert.equal(find(code).status, STATUS.FUTURE, `${code} must stay gated in September`);
  });
});

test('systems are current when the calendar says so and not before', () => {
  assert.equal(rowsOn('2026-09-01').find('A2.3B').calendarTiming, CALENDAR_TIMING.FUTURE);
  assert.equal(rowsOn('2026-09-14').find('A2.3B').calendarTiming, CALENDAR_TIMING.UPCOMING);
  assert.equal(rowsOn('2026-09-25').find('A2.3B').calendarTiming, CALENDAR_TIMING.CURRENT);
});

test('reinforcement links never gate — they are exposed separately', () => {
  const gates = buildAlgebraIISkillCurriculumLinks(teksSkillId);
  const boosts = buildAlgebraIIReinforcementLinks(teksSkillId);
  assert.equal(Object.keys(gates).length, 48);
  assert.equal(gates[teksSkillId('A2.7G')], 'alg2.u4');
  assert.deepEqual(boosts[teksSkillId('A2.7G')], ['alg2.m4']);
  // A reinforcement id is never also the primary.
  ALGEBRA_II_CROSSWALK_CODES.forEach((code) => {
    const entry = ALGEBRA_II_CURRICULUM_CROSSWALK[code];
    assert.ok(!(entry.reinforcementCurriculumIds || []).includes(entry.primaryCurriculumId),
      `${code} reinforces its own primary home`);
  });
});

test('Algebra II is no longer provisional and still offers real choice', () => {
  const { opts } = rowsOn('2026-09-25');
  assert.equal(opts.pacingIsProvisional, false);
  const offered = [...opts.recommended, ...opts.available];
  assert.ok(offered.length > 3, `expected multiple valid paths, got ${offered.length}`);
});

test('past content stays available for remediation all year', () => {
  const row = rowsOn('2027-04-05').find('A2.6E'); // Unit 2, taught in September
  assert.notEqual(row.status, STATUS.FUTURE);
  assert.notEqual(row.status, STATUS.LOCKED);
});

test('no dates leaked into the TEKS registry', () => {
  const serialized = JSON.stringify(TEXAS_STANDARDS_BY_COURSE.algebra2);
  assert.ok(!/20\d\d-\d\d-\d\d/.test(serialized), 'the registry must stay date free');
});

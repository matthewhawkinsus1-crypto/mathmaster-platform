import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGEBRA_I_CURRICULUM_CROSSWALK, COURSEWIDE_SCOPE, CROSSWALK_CODES,
  buildReinforcementLinks, buildSkillCurriculumLinks, getCurriculumLink, isCoursewideStandard,
} from '../../src/platform/curriculum/algebra1CurriculumCrosswalk.js';
import { TEXAS_STANDARDS_BY_COURSE, getTexasStandard } from '../../src/texasStandards.js';
import ALG1 from '../../src/curriculum/calendars/algebra1-2026-2027.js';
import { CALENDAR_TIMING, loadCalendar } from '../../src/platform/path/curriculumCalendar.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { curateStudentPanel } from '../../src/platform/path/studentPanel.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { STATUS } from '../../src/platform/path/recommendationEngine.js';

const calendar = loadCalendar(ALG1);
const contentStandards = TEXAS_STANDARDS_BY_COURSE.algebra1.filter((s) => s.classification !== 'process');
const processStandards = TEXAS_STANDARDS_BY_COURSE.algebra1.filter((s) => s.classification === 'process');
const on = (date) => Date.parse(`${date}T12:00:00Z`);
const PACING = { currentWindow: 1, windowCount: 8 };
const rowsOn = (date, extra = {}) => {
  const opts = buildStudentPathOptions({
    student: { id: 's', gradesByAssignment: {} }, assignments: [],
    courseId: 'algebra1', pacing: PACING, nowValue: on(date), ...extra,
  });
  return { opts, find: (code) => Object.values(opts).filter(Array.isArray).flat().find((r) => r.skillId === teksSkillId(code)) };
};

// --- acceptance: every content TEKS is mapped, not merely 49 entries --------
test('every Algebra I content standard resolves to a primary curriculum id', () => {
  const unmapped = contentStandards.filter((s) => !ALGEBRA_I_CURRICULUM_CROSSWALK[s.code]);
  assert.deepEqual(unmapped.map((s) => s.code), [], 'these content standards have no curriculum home');
  assert.equal(contentStandards.length, 49, `the registry should hold 49 content standards, found ${contentStandards.length}`);
  assert.equal(CROSSWALK_CODES.length, 49);
});

test('every crosswalk code is a real standard in the registry', () => {
  const bogus = CROSSWALK_CODES.filter((code) => !getTexasStandard(code));
  assert.deepEqual(bogus, [], 'the crosswalk names standards that do not exist');
  const wrongCourse = CROSSWALK_CODES.filter((code) => getTexasStandard(code).courseId !== 'algebra1');
  assert.deepEqual(wrongCourse, []);
});

test('every curriculum id resolves to a real calendar node', () => {
  const ids = new Set();
  Object.values(ALGEBRA_I_CURRICULUM_CROSSWALK).forEach((entry) => {
    ids.add(entry.primaryCurriculumId);
    (entry.reinforcementCurriculumIds || []).forEach((id) => ids.add(id));
  });
  const missing = [...ids].filter((id) => !calendar.byCurriculumId.has(id));
  assert.deepEqual(missing, [], 'these curriculum ids have no window in the 2026-27 calendar');
});

test('the seven process standards are coursewide and never date gated', () => {
  assert.equal(processStandards.length, 7);
  processStandards.forEach((standard) => {
    assert.ok(isCoursewideStandard(standard.code), `${standard.code} must be coursewide`);
    assert.equal(ALGEBRA_I_CURRICULUM_CROSSWALK[standard.code], undefined,
      `${standard.code} must not be pinned to a module`);
    assert.equal(getCurriculumLink(standard.code).curriculumScope, COURSEWIDE_SCOPE);
    assert.equal(getCurriculumLink(standard.code).primaryCurriculumId, null);
  });
});

test('every skill has exactly one primary home', () => {
  const homes = CROSSWALK_CODES.map((code) => ALGEBRA_I_CURRICULUM_CROSSWALK[code].primaryCurriculumId);
  assert.ok(homes.every(Boolean), 'a missing primary home would leave a skill ungated');
  // Reinforcement must never duplicate the primary — that would be a second gate.
  CROSSWALK_CODES.forEach((code) => {
    const entry = ALGEBRA_I_CURRICULUM_CROSSWALK[code];
    assert.ok(!(entry.reinforcementCurriculumIds || []).includes(entry.primaryCurriculumId),
      `${code} reinforces its own primary home`);
  });
});

// --- acceptance: the timing chain end to end -------------------------------
test('the chain skill -> curriculum -> calendar -> timing works for a real skill', () => {
  // A.9C lives in Module 4 Topic 2, which starts 2027-01-25.
  assert.equal(getCurriculumLink('A.9C').primaryCurriculumId, 'alg1.m4.t2');
  assert.equal(rowsOn('2026-09-15').find('A.9C').calendarTiming, CALENDAR_TIMING.FUTURE);
  assert.equal(rowsOn('2027-01-19').find('A.9C').calendarTiming, CALENDAR_TIMING.UPCOMING);
  assert.equal(rowsOn('2027-01-26').find('A.9C').calendarTiming, CALENDAR_TIMING.CURRENT);
  assert.equal(rowsOn('2027-03-01').find('A.9C').calendarTiming, CALENDAR_TIMING.REVIEW);
});

test('the September exponentials problem is solved with the real crosswalk', () => {
  const { find } = rowsOn('2026-09-15');
  // Module 4 growth and decay withheld...
  ['A.9A', 'A.9B', 'A.9C', 'A.9D', 'A.9E'].forEach((code) => {
    assert.equal(find(code).status, STATUS.FUTURE, `${code} must not be recommended in September`);
  });
  // ...while Module 2 rate-of-change work is what the class is on.
  ['A.3A', 'A.3B', 'A.3C'].forEach((code) => {
    assert.equal(find(code).calendarTiming, CALENDAR_TIMING.CURRENT);
  });
});

test('past skills stay eligible for review and remediation', () => {
  // In February, Module 1 sequence work is review — available, never withheld.
  const { find } = rowsOn('2027-02-10');
  const row = find('A.12C');
  assert.equal(row.calendarTiming, CALENDAR_TIMING.REVIEW);
  assert.notEqual(row.status, STATUS.FUTURE);
  assert.notEqual(row.status, STATUS.LOCKED);
});

test('a teacher override still opens a future skill', () => {
  const skillId = teksSkillId('A.9C');
  assert.equal(rowsOn('2026-09-15').find('A.9C').status, STATUS.FUTURE);
  const opened = rowsOn('2026-09-15', { teacherOverrides: [{ skillId, action: 'open' }] });
  assert.notEqual(opened.find('A.9C').status, STATUS.FUTURE);
});

test('reinforcement links never relock a skill', () => {
  // A.12C is primary in Module 1 Topic 2 and reinforced in Module 4 Topic 1.
  // When Module 4 approaches it must NOT go back to future.
  const entry = ALGEBRA_I_CURRICULUM_CROSSWALK['A.12C'];
  assert.equal(entry.primaryCurriculumId, 'alg1.m1.t2');
  assert.deepEqual(entry.reinforcementCurriculumIds, ['alg1.m4.t1']);

  const decemberRow = rowsOn('2026-12-15').find('A.12C');
  assert.notEqual(decemberRow.calendarTiming, CALENDAR_TIMING.FUTURE,
    'a reinforcement link must not act as a second gate');
  assert.equal(decemberRow.calendarTiming, CALENDAR_TIMING.REVIEW);

  // Reinforcement links are exposed separately from the gating links.
  const gates = buildSkillCurriculumLinks(teksSkillId);
  const boosts = buildReinforcementLinks(teksSkillId);
  assert.equal(gates[teksSkillId('A.12C')], 'alg1.m1.t2');
  assert.deepEqual(boosts[teksSkillId('A.12C')], ['alg1.m4.t1']);
  assert.equal(Object.keys(gates).length, 49);
});

test('the live student path is no longer provisional for Algebra I', () => {
  const { opts } = rowsOn('2026-09-15');
  assert.equal(opts.pacingIsProvisional, false);
  const panel = curateStudentPanel(opts);
  assert.equal(panel.pacingIsProvisional, false, 'no "still setting up" note once the calendar is live');
});

test('students are told when their class reaches an upcoming skill', () => {
  // 2026-10-27 is five instructional days before Module 3 Topic 1 opens.
  const { find } = rowsOn('2026-10-27');
  const row = find('A.5A');
  assert.equal(row.calendarTiming, CALENDAR_TIMING.UPCOMING);
  assert.equal(row.instructionalDaysUntilStart, 5);
  assert.equal(row.calendarDaysUntilStart, 6, 'students count in calendar days, the engine in school days');
});

test('multiple valid choices survive — the engine did not become a single next skill', () => {
  const { opts } = rowsOn('2026-09-15');
  const offered = [...opts.recommended, ...opts.available];
  assert.ok(offered.length > 3, `expected real choice, got ${offered.length}`);
  const panel = curateStudentPanel(opts);
  assert.ok(panel.best);
  assert.ok(panel.choices.length >= 1, 'Your Choice must still hold alternatives');
});

test('honors uses the same calendar, differing only by policy', () => {
  const regular = buildStudentPathOptions({
    student: { id: 's', gradesByAssignment: {} }, assignments: [],
    courseId: 'algebra1', pacing: PACING, nowValue: on('2026-09-15'),
  });
  const honors = buildStudentPathOptions({
    student: { id: 's', gradesByAssignment: {} }, assignments: [],
    courseId: 'algebra1', pacing: PACING, nowValue: on('2026-09-15'),
    courseProfile: { rigor: 'honors' },
  });
  assert.equal(regular.pacingIsProvisional, false);
  assert.equal(honors.pacingIsProvisional, false);
  const find = (o, c) => Object.values(o).filter(Array.isArray).flat().find((r) => r.skillId === teksSkillId(c));
  assert.equal(find(regular, 'A.3A').calendarTiming, find(honors, 'A.3A').calendarTiming,
    'honors must not get fabricated different dates');
});

test('hostile input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => getCurriculumLink(bad));
    assert.doesNotThrow(() => isCoursewideStandard(bad));
  }
  assert.equal(getCurriculumLink('NOT.A.CODE'), null);
  assert.doesNotThrow(() => buildSkillCurriculumLinks((c) => c));
});

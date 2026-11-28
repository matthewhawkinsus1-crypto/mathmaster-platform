// The Discipline Tracker's rows in the Action Center
// (src/platform/teacher/disciplineActionItems.js), and how they reach it:
// the Action Center's model loads only when it opens, the rows are read then,
// each row opens the tracker on its class, and the teacher marks the
// principal report sent from the tracker. All data here is synthetic.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  DISCIPLINE_ACTION_WINDOW_DAYS, buildDisciplineActionItems, loadDisciplineActionItems, principalReportWeek,
} from '../../src/platform/teacher/disciplineActionItems.js';
import { TEACHER_ACTION_KIND, buildTeacherActionItems, openTeacherActionCount } from '../../src/platform/teacher/teacherActionCenter.js';
import { otherDaysNeedingTeacher } from '../../src/platform/teacher/disciplineTrackerModel.js';
import { functionsDeclaration } from './helpers/functionsBackendSource.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const TODAY = '2026-11-19'; // a Thursday; the report is due Friday 11/20
const NOW = Date.parse('2026-11-19T21:00:00Z');
const CLASS = 'class-p2';
// 9 am Chicago on a day (UTC-6 in November), plus minutes.
const at = (dateKey, minutes = 0) => Date.parse(`${dateKey}T15:00:00Z`) + minutes * 60000;
const incident = (id, studentId, type, dateKey, extra = {}) => ({
  id, classId: CLASS, classPeriod: '2', studentId, type, detail: '', occurredAtMs: at(dateKey, extra.minutes || 0), dateKey,
  form: { state: 'submitted', reason: null, submittedAtMs: null }, voidedAtMs: null, ...extra,
});
const INCIDENTS = [
  // s1: three tardies in three days, a repeat offender twice over.
  incident('a', 's1', 'tardy', '2026-11-17'), incident('b', 's1', 'tardy', '2026-11-18'), incident('c', 's1', 'tardy', '2026-11-19', { minutes: 60 }),
  // s2: one violation, not a repeat.
  incident('d', 's2', 'dressCode', '2026-11-18'),
  // s3: the same violation twice in five school days.
  incident('e', 's3', 'idViolation', '2026-11-18'), incident('f', 's3', 'idViolation', '2026-11-19'),
  // s4: the form gave no reply to one day's response; refused another's.
  incident('g', 's4', 'tardy', '2026-11-18', { form: { state: 'unknown', reason: 'No reply' } }),
  incident('h', 's4', 'deviceCollected', '2026-11-18', { minutes: 5, form: { state: 'unknown', reason: null } }),
  incident('i', 's4', 'dressCode', '2026-11-16', { form: { state: 'failed', reason: 'The form refused it' } }),
  // Undone, waiting and sent: none of them a form row.
  incident('j', 's2', 'tardy', '2026-11-17', { voidedAtMs: at('2026-11-17', 1), form: { state: 'failed', reason: 'x' } }),
  incident('k', 's2', 'idViolation', '2026-11-19', { form: { state: 'pending' } }),
];
const MESSAGES = [
  { id: 'm1', messageKey: `${CLASS}|2026-11-18|s2`, sequence: 1, classId: CLASS, studentId: 's2', dateKey: '2026-11-18', state: 'failed', reason: 'No guardian phone in SchoolStatus', queuedAtMs: at('2026-11-18', 300) },
  // s1's failed message was queued again: the newer one decides, and it is queued.
  { id: 'm2', messageKey: `${CLASS}|2026-11-17|s1`, sequence: 1, classId: CLASS, studentId: 's1', dateKey: '2026-11-17', state: 'failed', reason: 'x' },
  { id: 'm3', messageKey: `${CLASS}|2026-11-17|s1`, sequence: 2, classId: CLASS, studentId: 's1', dateKey: '2026-11-17', state: 'queued' },
  { id: 'm4', messageKey: `${CLASS}|2026-11-18|s4`, sequence: 1, classId: CLASS, studentId: 's4', dateKey: '2026-11-18', state: 'unknown' },
  { id: 'm5', messageKey: `${CLASS}|2026-11-18|s3`, sequence: 1, classId: CLASS, studentId: 's3', dateKey: '2026-11-18', state: 'sent' },
];
const build = (extra = {}) => buildDisciplineActionItems({
  incidents: INCIDENTS, familyMessages: MESSAGES, principalReports: [], todayDateKey: TODAY, nowMs: NOW, ...extra,
});
const byKind = (rows, kind) => rows.filter((item) => item.kind === kind);

/* ------------------------------------------------------------ the rows */

test('a violation the form refused or did not answer is one row per student, class and day, for the teacher to decide', () => {
  const rows = byKind(build(), TEACHER_ACTION_KIND.DISCIPLINE_FORM);
  assert.deepEqual(rows.map((item) => [item.studentId, item.dueAt, item.title]), [
    ['s4', '2026-11-18', 'Check the district violation form'],
    ['s4', '2026-11-16', 'Violation not sent to the district form'],
  ]);
  const [unknown, failed] = rows;
  assert.equal(unknown.summary, 'Tardy at 9:00 AM, Device Collected at 9:05 AM on Wed, 11/18: the form gave no reply, so it may or may not have it. Check the form\'s responses, then choose Send again or It was recorded.');
  assert.match(failed.summary, /^Dress Code at 9:00 AM on Mon, 11\/16: not sent \(The form refused it\)\. Choose Send again or It was recorded\.$/);
  assert.ok(rows.every((item) => item.priority === 'high' && item.classId === CLASS && item.sourceType === 'discipline' && item.status === 'open'));
  assert.deepEqual(unknown.availableActions, ['openDisciplineTracker']);
});

test('a changed district form is a row for a teacher who uses the tracker', () => {
  const formStatus = { ok: false, problems: ['The district form no longer offers: Tardy.'], checkedAtMs: NOW - 60000 };
  const changed = byKind(build({ formStatus }), TEACHER_ACTION_KIND.DISCIPLINE_FORM).find((item) => item.sourceId === 'formChanged');
  assert.equal(changed.title, 'The district violation form changed');
  assert.equal(changed.summary, 'Violations wait in MathMaster until the form is checked. The district form no longer offers: Tardy.');
  assert.deepEqual([changed.studentId, changed.classId, changed.studentName, changed.dueAt], [null, null, 'All classes', TODAY]);
  // No records, no row: a teacher who never uses the tracker is not told about its form.
  assert.ok(!build({ formStatus, incidents: [] }).some((item) => item.sourceId === 'formChanged'));
  assert.ok(!build({ formStatus: { ok: true, problems: [] } }).some((item) => item.sourceId === 'formChanged'));
});

test('a family message that did not go out, or may not have, is a row; the newest for a student\'s day decides', () => {
  const rows = byKind(build(), TEACHER_ACTION_KIND.FAMILY_MESSAGE);
  assert.deepEqual(rows.map((item) => [item.studentId, item.title]), [
    ['s2', 'Family message not sent'],
    ['s4', 'Check whether the family message went out'],
  ]);
  assert.equal(rows[0].summary, 'The message about Wed, 11/18 did not go out (No guardian phone in SchoolStatus). Queue it again, or contact the family another way.');
  assert.match(rows[1].summary, /may have gone out: SchoolStatus did not confirm it/);
});

test('the week\'s principal report lists the repeat offenders not in a report marked sent since their latest violation', () => {
  const [report] = byKind(build(), TEACHER_ACTION_KIND.PRINCIPAL_REPORT);
  // s4's three count too, though the form did not take them: a violation is what the teacher recorded.
  assert.deepEqual([report.title, report.status, report.dueAt, report.studentName], ['Send the principal report', 'open', '2026-11-20', '3 students']);
  assert.deepEqual(report.contextStudentIds, ['s1', 's4', 's3']);
  assert.match(report.summary, /^3 students meet the repeat rule \(3 or more violations in 10 school days, or the same one 2 times in 5\) and are not in a report you marked sent since\./);
  // s3 was in a report sent after their last violation; s1's last came later, and s4 was not in it.
  const sentAfterS3 = { sentAtMs: at('2026-11-19', 30), studentIds: ['s1', 's3'] };
  assert.deepEqual(byKind(build({ principalReports: [sentAfterS3] }), TEACHER_ACTION_KIND.PRINCIPAL_REPORT)[0].contextStudentIds, ['s1', 's4']);
  // All covered: the row says it went, and is done.
  const sentAfterAll = { sentAtMs: at('2026-11-19', 120), studentIds: ['s1', 's3', 's4'] };
  const [done] = byKind(build({ principalReports: [sentAfterAll] }), TEACHER_ACTION_KIND.PRINCIPAL_REPORT);
  assert.deepEqual([done.title, done.status, done.contextStudentIds], ['Principal report sent', 'completed', ['s1', 's3', 's4']]);
  assert.equal(done.summary, 'Marked sent Thu, 11/19 at 11:00 AM.');
  // A new violation after the report puts that student back on it.
  const again = build({ principalReports: [sentAfterAll], incidents: [...INCIDENTS, incident('z', 's3', 'tardy', '2026-11-19', { minutes: 300 })] });
  assert.deepEqual(byKind(again, TEACHER_ACTION_KIND.PRINCIPAL_REPORT)[0].contextStudentIds, ['s3']);
  // No repeat offender and no report this week: no row. An undone tap does not count.
  assert.deepEqual(byKind(build({ incidents: INCIDENTS.filter((item) => item.studentId === 's2') }), TEACHER_ACTION_KIND.PRINCIPAL_REPORT), []);
});

test('the report is due on the week\'s last school day; on a weekend it is the week just past', () => {
  assert.deepEqual(principalReportWeek('2026-11-16'), { weekStart: '2026-11-16', reportDay: '2026-11-20' });
  assert.deepEqual(principalReportWeek('2026-11-20'), { weekStart: '2026-11-16', reportDay: '2026-11-20' });
  assert.deepEqual(principalReportWeek('2026-11-21'), { weekStart: '2026-11-16', reportDay: '2026-11-20' });
  assert.deepEqual(principalReportWeek('2026-11-22'), { weekStart: '2026-11-16', reportDay: '2026-11-20' });
  // The district closes Friday 9/4: that week's report is due Thursday.
  assert.deepEqual(principalReportWeek('2026-09-01'), { weekStart: '2026-08-31', reportDay: '2026-09-03' });
});

test('the rows are read from the tracker\'s own callables for the last 30 days; a settings failure does not lose them', async () => {
  const calls = [];
  const store = {
    listDisciplineIncidents: async (args) => { calls.push(args); return { incidents: INCIDENTS, formStatus: null, familyMessages: MESSAGES }; },
    getDisciplineSettings: async () => { throw new Error('offline'); },
  };
  const rows = await loadDisciplineActionItems({ nowMs: NOW, store });
  assert.equal(DISCIPLINE_ACTION_WINDOW_DAYS, 30);
  assert.deepEqual(calls, [{ fromDateKey: '2026-10-20', toDateKey: TODAY }]);
  assert.equal(rows.length, build().length);
});

/* ------------------------------------------------------------ in the Action Center */

const students = ['s1', 's2', 's3', 's4'].map((id, index) => ({ id, classId: CLASS, firstName: `First${index}`, lastName: `Last${index}` }));
const classes = [{ classId: CLASS, name: 'Algebra I — Period 2 (synthetic)', period: '2' }];

test('the rows join the Action Center for the teacher\'s classes only, named from the roster, sorted with the rest', () => {
  const extra = [...build(), { ...build()[0], id: 'disciplineForm:elsewhere', classId: 'class-not-mine' }];
  const items = buildTeacherActionItems({ students, classes, extraItems: extra, now: NOW, todayDateKey: TODAY });
  assert.ok(!items.some((item) => item.id === 'disciplineForm:elsewhere'), 'another class\'s row is dropped');
  const form = items.find((item) => item.id.startsWith('disciplineForm:class-p2|s4|2026-11-18'));
  assert.deepEqual([form.studentName, form.classLabel], ['First3 Last3', 'Algebra I — Period 2 (synthetic)']);
  const report = items.find((item) => item.kind === TEACHER_ACTION_KIND.PRINCIPAL_REPORT);
  assert.deepEqual(report.context, ['First0 Last0', 'First3 Last3', 'First2 Last2']);
  // The overdue (earlier days') rows come first; the report, due tomorrow, after them.
  assert.ok(items.indexOf(form) < items.indexOf(report));
  assert.equal(openTeacherActionCount(items), items.length);
});

/* ------------------------------------------------------------ the wiring */

test('the Action Center\'s model and its discipline rows load only when it opens, through App\'s state', () => {
  const hook = executableSource(readFileSync('src/app/teacher/useTeacherActionCenterData.js', 'utf8'));
  assert.match(hook, /if \(user\?\.role !== 'teacher' \|\| teacherWorkspaceMode !== 'teacher' \|\| teacherTab !== 'actionCenter' \|\| teacherPreviewRuntimeActive\) \{\s*setActionDisciplineItems\(\[\]\);/);
  assert.match(hook, /import\('\.\.\/\.\.\/platform\/teacher\/disciplineActionItems\.js'\)\s*\.then\(\(\{ loadDisciplineActionItems \}\) => loadDisciplineActionItems\(\{ nowMs: Date\.now\(\) \}\)\)\s*\.then\(\(items\) => \{ if \(!cancelled\) setActionDisciplineItems\(items\); \}\)/);
  assert.match(hook, /retestRecoveryActions, extraItems: actionDisciplineItems, now, todayDateKey: localDateKeyOf\(now\),/);
  const app = executableSource(readFileSync('src/App.jsx', 'utf8'));
  assert.match(app, /const \[actionCenterModel, setActionCenterModel\] = useState\(null\);/);
  assert.match(app, /const \[actionDisciplineItems, setActionDisciplineItems\] = useState\(\[\]\);/);
});

test('a discipline row opens the Discipline Tracker on its class', () => {
  const workspace = executableSource(readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8'));
  assert.match(workspace, /if \(item\.sourceType === 'discipline'\) \{\s*if \(item\.classId\) setActiveClass\(\{ classId: item\.classId, classPeriod: classesById\[item\.classId\]\?\.period \|\| '' \}\);\s*setTeacherTab\('discipline'\);\s*return;\s*\}/);
  const screen = executableSource(readFileSync('src/components/teacher/TeacherActionCenter.jsx', 'utf8'));
  assert.match(screen, /if \(item\.sourceType === 'discipline'\) return 'Open Discipline Tracker';/);
  for (const label of ['District violation form', 'Family message', 'Principal report']) assert.ok(screen.includes(`'${label}'`), label);
});

test('the tracker shows the other days that need the teacher, one tap from each', () => {
  const days = otherDaysNeedingTeacher({ incidents: INCIDENTS, familyMessages: MESSAGES, dateKey: '2026-11-19', classId: CLASS });
  assert.deepEqual(days, [
    { dateKey: '2026-11-18', classId: CLASS, count: 4 },
    { dateKey: '2026-11-16', classId: CLASS, count: 1 },
  ]);
  // The day on screen is not listed again.
  assert.ok(!otherDaysNeedingTeacher({ incidents: INCIDENTS, familyMessages: MESSAGES, dateKey: '2026-11-18', classId: CLASS }).some((entry) => entry.dateKey === '2026-11-18'));
  const tracker = readFileSync('src/components/teacher/DisciplineTracker.jsx', 'utf8');
  assert.match(tracker, /onClick=\{\(\) => \{ setClassId\(entry\.classId\); setDateKey\(entry\.dateKey\); \}\}/);
});

test('the teacher marks the principal report sent; the record is theirs, and saving the address keeps it', () => {
  const tracker = executableSource(readFileSync('src/components/teacher/DisciplineTracker.jsx', 'utf8'));
  assert.match(tracker, /await recordPrincipalReportSent\(\{ studentIds: report\.offenders\.map\(\(offender\) => offender\.studentId\) \}\)/);
  assert.match(tracker, /\{report\.offenders\.length > 0 && <button type="button" className="tw-btn tw-btn--sm" onClick=\{markReportSent\}>Mark as sent<\/button>\}/);
  assert.match(tracker, /setSettings\(\(current\) => \(\{ \.\.\.current, \.\.\.saved \}\)\);/);
  const record = executableSource(functionsDeclaration('recordPrincipalReportSent'));
  assert.ok(record.indexOf('await requireTeacher(request)') > 0);
  assert.match(record, /const ref = db\.collection\("disciplineSettings"\)\.doc\(email\);/, 'the caller\'s own settings');
  assert.match(record, /\.slice\(0, 200\);/);
  assert.match(record, /\]\.slice\(-PRINCIPAL_REPORTS_KEPT\);/, 'only the newest are kept');
  assert.match(executableSource(functionsDeclaration('getDisciplineSettings')), /principalReports: Array\.isArray\(data\.principalReports\) \? data\.principalReports\.slice\(-PRINCIPAL_REPORTS_KEPT\) : \[\],/);
  assert.match(readFileSync('functions/disciplineFunctions.js', 'utf8'), /const PRINCIPAL_REPORTS_KEPT = 20;/);
});

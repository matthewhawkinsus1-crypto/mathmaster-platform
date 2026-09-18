import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherActionItems, openTeacherActionCount, resolveTeacherActionState, TEACHER_ACTION_KIND } from '../../src/platform/teacher/teacherActionCenter.js';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../../src/platform/teacher/studentSupportSignals.js';
import { TRANSFER_STATE } from '../../src/platform/gradeTransfer/gradeTransferModel.js';

const classes = [{ classId: 'a', name: 'Algebra 1' }, { classId: 'b', name: 'Period 2' }];
const students = [{ id: 's1', displayName: 'Ada Lovelace', classId: 'a' }, { id: 's2', displayName: 'Grace Hopper', classId: 'b' }];
const parent = (overrides = {}) => ({ id: 'p1', kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP, stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED, studentId: 's1', studentName: 'stale name', classId: 'a', createdAt: '2026-09-10T00:00:00Z', ...overrides });

test('aggregates authorized actions across classes and uses canonical roster names', () => {
  const items = buildTeacherActionItems({ students, classes, supportEvents: [parent(), parent({ id: 'p2', studentId: 's2', classId: 'b' })] });
  assert.deepEqual(items.map((item) => item.classId).sort(), ['a', 'b']);
  assert.deepEqual(items.map((item) => item.studentName).sort(), ['Ada Lovelace', 'Grace Hopper']);
});

test('deduplicates a confirmed incident and its linked parent follow-up', () => {
  const items = buildTeacherActionItems({ students, classes, supportEvents: [
    // Exact linkage emitted by functions/index.js: both records carry the
    // incident ref as relatedEventId; only the follow-up evidence has incidentId.
    { ...parent({ id: 'incident-1', kind: SUPPORT_EVENT_KIND.ACADEMIC_INTEGRITY_INCIDENT }), relatedEventId: 'incident-1', evidence: { scope: 'assignment' } },
    { ...parent({ id: 'p1' }), relatedEventId: 'incident-1', evidence: { incidentId: 'incident-1', forbiddenAnswerText: 'must not escape' } },
  ] });
  assert.equal(items.length, 1);
  assert.equal(items[0].priority, 'high');
  assert.deepEqual(items[0].context, ['Confirmed academic-integrity incident']);
  assert.equal(JSON.stringify(items).includes('forbiddenAnswerText'), false);
});

test('school-local date key controls today/overdue at the UTC boundary', () => {
  const items = buildTeacherActionItems({ students, classes, now: Date.parse('2026-09-19T01:00:00Z'), todayDateKey: '2026-09-18', supportEvents: [
    parent({ id: 'today-local', dueAt: '2026-09-18' }), parent({ id: 'tomorrow-local', dueAt: '2026-09-19' }),
  ] });
  assert.deepEqual(items.map((item) => item.sourceId), ['today-local', 'tomorrow-local']);
});

test('keeps independent same-day parent follow-ups as distinct obligations', () => {
  const items = buildTeacherActionItems({ students, classes, supportEvents: [
    parent({ id: 'assignment-follow-up', dueAt: '2026-09-18', assignmentId: 'a1', summary: 'Assignment follow-up' }),
    parent({ id: 'behavior-follow-up', dueAt: '2026-09-18', assignmentId: null, summary: 'Behavior follow-up' }),
  ] });
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.sourceId).sort(), ['assignment-follow-up', 'behavior-follow-up']);
});

test('completed support and contact follow-ups leave Open but remain in Completed', () => {
  const supportEvents = [parent(), { id: 'done', kind: SUPPORT_EVENT_KIND.RESOLVED, stage: SUPPORT_EVENT_STAGE.RESOLVED, evidence: { sourceEventId: 'p1' } }];
  const completedSupport = buildTeacherActionItems({ students, classes, supportEvents });
  assert.equal(resolveTeacherActionState(completedSupport, { status: 'open' }).length, 0);
  assert.equal(resolveTeacherActionState(completedSupport, { status: 'completed' }).length, 1);
  const contacts = [{ id: 'c1', recordType: 'contact', studentId: 's1', classId: 'a', followUpDate: '2026-09-20' }, { id: 'r1', recordType: 'followUpResolution', parentContactId: 'c1' }];
  assert.equal(resolveTeacherActionState(buildTeacherActionItems({ students, classes, parentContacts: contacts }), { status: 'open' }).length, 0);
});

test('return-from-absence append-only resolution controls open state', () => {
  const base = { key: 's1|a|2026-09-16', studentId: 's1', classId: 'a', classPeriod: '1', meetingsMissed: 1, returnDateKey: '2026-09-18' };
  assert.equal(buildTeacherActionItems({ students, classes, returnCheckIns: [{ ...base, status: 'open' }] })[0].status, 'open');
  assert.equal(buildTeacherActionItems({ students, classes, returnCheckIns: [{ ...base, status: 'completed' }] })[0].status, 'completed');
});

test('extension reconciliation groups into the return episode', () => {
  const items = buildTeacherActionItems({ students, classes, returnCheckIns: [{ key: 'episode', studentId: 's1', classId: 'a', status: 'open', meetingsMissed: 2, extensions: [{ assignmentId: 'x' }] }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, TEACHER_ACTION_KIND.EXTENSION_RECONCILIATION);
});

test('grade upload appears only while the canonical transfer state needs action', () => {
  const unit = { key: 'a__x', classId: 'a', assignmentId: 'x', state: TRANSFER_STATE.EXPORTED };
  assert.equal(buildTeacherActionItems({ students, classes, gradeTransferUnits: [unit] }).length, 1);
  assert.equal(buildTeacherActionItems({ students, classes, gradeTransferUnits: [{ ...unit, state: TRANSFER_STATE.UPLOAD_CONFIRMED }] }).length, 0);
});

test('an automated integrity review never becomes a confirmed action', () => {
  const signal = parent({ kind: SUPPORT_EVENT_KIND.INTEGRITY_REVIEW, stage: SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL });
  assert.deepEqual(buildTeacherActionItems({ students, classes, supportEvents: [signal] }), []);
});

test('orders overdue, today, confirmed high priority, absence, export, then normal oldest first', () => {
  const items = buildTeacherActionItems({ students, classes, now: Date.parse('2026-09-18T12:00:00Z'), supportEvents: [
    parent({ id: 'normal', createdAt: '2026-09-01' }),
    parent({ id: 'high', incidentId: 'high', kind: SUPPORT_EVENT_KIND.ACADEMIC_INTEGRITY_INCIDENT, createdAt: '2026-09-03' }),
    parent({ id: 'today', dueAt: '2026-09-18', createdAt: '2026-09-04' }),
    parent({ id: 'late', dueAt: '2026-09-17', createdAt: '2026-09-05' }),
  ], returnCheckIns: [{ key: 'absence', studentId: 's1', classId: 'a', status: 'open', meetingsMissed: 1 }], gradeTransferUnits: [{ key: 'export', classId: 'a', state: TRANSFER_STATE.EXPORTED }] });
  assert.deepEqual(items.map((item) => item.sourceId), ['late', 'today', 'high', 'absence', 'export', 'normal']);
});

test('teacher reassignment follows the authorized class projection', () => {
  assert.deepEqual(buildTeacherActionItems({ students, classes: [classes[0]], supportEvents: [parent({ id: 'other', classId: 'b' })] }), []);
});

test('normalized rows allow-list fields and never leak answer/evidence payloads', () => {
  const [item] = buildTeacherActionItems({ students, classes, supportEvents: [parent({ answerText: 'secret', evidence: { response: 'secret' } })] });
  assert.equal('evidence' in item, false);
  assert.equal('answerText' in item, false);
  assert.equal(JSON.stringify(item).includes('secret'), false);
});

test('open/completed filters partition the projection and badge uses that same selector', () => {
  const items = buildTeacherActionItems({ students, classes, supportEvents: [parent(), parent({ id: 'p2' }), { kind: SUPPORT_EVENT_KIND.RESOLVED, stage: SUPPORT_EVENT_STAGE.RESOLVED, sourceEventId: 'p2' }] });
  const open = resolveTeacherActionState(items, { status: 'open' });
  const completed = resolveTeacherActionState(items, { status: 'completed' });
  assert.equal(open.length + completed.length, items.length);
  assert.equal(openTeacherActionCount(items), open.length);
});

test('retest rows link to the existing workflow and do not project scores or policy', () => {
  const [item] = buildTeacherActionItems({ students, classes, retestRecoveryActions: [{ id: 'r1', studentId: 's1', classId: 'a', actionRequired: true, rawRetestScore: 99 }] });
  assert.equal(item.kind, TEACHER_ACTION_KIND.RETEST_RECOVERY);
  assert.equal('rawRetestScore' in item, false);
  assert.deepEqual(item.availableActions, ['openRetestWorkflow']);
});

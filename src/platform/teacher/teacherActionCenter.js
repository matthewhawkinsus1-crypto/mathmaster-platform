import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from './studentSupportSignals.js';
import { TRANSFER_STATE } from '../gradeTransfer/gradeTransferModel.js';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();
const instant = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const day = (value) => {
  const moment = instant(value);
  return moment ? new Date(moment).toISOString().slice(0, 10) : text(value).slice(0, 10);
};
const idOf = (record) => text(record?.id || record?.eventId || record?.key);
const classIdOf = (record) => text(record?.classId || record?.classRecordId);
const studentIdOf = (record) => text(record?.studentId);

export const TEACHER_ACTION_KIND = Object.freeze({
  PARENT_FOLLOW_UP: 'parentFollowUp',
  RETURN_FROM_ABSENCE: 'returnFromAbsence',
  EXTENSION_RECONCILIATION: 'extensionReconciliation',
  GRADE_UPLOAD: 'gradeUpload',
  RETEST_RECOVERY: 'retestRecovery',
});

const resolutionReferences = (event) => new Set([
  event?.resolvesEventId, event?.sourceEventId, event?.parentEventId,
  event?.evidence?.resolvesEventId, event?.evidence?.sourceEventId,
  event?.evidence?.parentFollowUpId, event?.evidence?.incidentId,
].map(text).filter(Boolean));

const canonicalStudentName = (studentById, studentId, fallback = '') => {
  const student = studentById.get(studentId);
  return text(student?.displayName || student?.name || student?.studentName || fallback || studentId);
};

const statusForDueDate = (dueAt, status, now) => {
  if (status === 'completed') return 90;
  const due = instant(dueAt);
  if (due && day(dueAt) < day(now)) return 0;
  if (due && day(dueAt) === day(new Date(now).toISOString())) return 1;
  return null;
};

const priorityRank = (item, now) => {
  const dueRank = statusForDueDate(item.dueAt, item.status, now);
  if (dueRank !== null) return dueRank;
  if (item.priority === 'high') return 2;
  if (item.kind === TEACHER_ACTION_KIND.RETURN_FROM_ABSENCE || item.kind === TEACHER_ACTION_KIND.EXTENSION_RECONCILIATION) return 3;
  if (item.kind === TEACHER_ACTION_KIND.GRADE_UPLOAD) return 4;
  return 5;
};

/**
 * A read-only projection over existing authorities. It intentionally accepts
 * already-authorized records and never manufactures a mutable todo record.
 * The returned allow-list also prevents answer/evidence payloads from leaking
 * into an operational queue row.
 */
export const buildTeacherActionItems = ({
  students = [], classes = [], supportEvents = [], parentContacts = [],
  returnCheckIns = [], gradeTransferUnits = [], retestRecoveryActions = [],
  now = Date.now(),
} = {}) => {
  const studentById = new Map(list(students).map((student) => [text(student.id || student.studentId), student]));
  const classById = new Map(list(classes).map((record) => [text(record.classId || record.id), record]));
  // `classes` is the teacher/root-admin authorized class projection. Applying
  // it here makes a stale event disappear after teacher reassignment too.
  const authorizedClassIds = new Set(classById.keys());
  const authorized = (record) => !classIdOf(record) || authorizedClassIds.has(classIdOf(record));
  const events = list(supportEvents).filter(authorized);
  const completedIds = new Set();
  events.filter((event) => event.kind === SUPPORT_EVENT_KIND.RESOLVED || event.stage === SUPPORT_EVENT_STAGE.RESOLVED)
    .forEach((event) => resolutionReferences(event).forEach((id) => completedIds.add(id)));

  const contactResolutions = new Set(list(parentContacts)
    .filter((contact) => contact.recordType === 'followUpResolution')
    .map((contact) => text(contact.parentContactId)).filter(Boolean));
  const items = [];
  const parentByObligation = new Map();

  const addParent = (source, sourceType, completed = false) => {
    if (!authorized(source)) return;
    const sourceId = idOf(source);
    const incidentId = text(source?.linkedIncidentId || source?.incidentId || source?.evidence?.incidentId);
    const obligation = incidentId || text(source?.followUpKey || source?.evidence?.followUpKey)
      || `${studentIdOf(source)}|${classIdOf(source)}|${day(source.dueAt || source.followUpDate || source.createdAt)}`;
    const existing = parentByObligation.get(obligation);
    const isIncident = source.kind === SUPPORT_EVENT_KIND.ACADEMIC_INTEGRITY_INCIDENT;
    const item = existing || {
      id: `parent:${obligation}`, kind: TEACHER_ACTION_KIND.PARENT_FOLLOW_UP,
      studentId: studentIdOf(source), classId: classIdOf(source) || null,
      assignmentId: text(source.assignmentId) || null, title: 'Parent follow-up',
      summary: isIncident ? 'Confirmed academic-integrity incident requires parent follow-up.' : 'Parent follow-up is due.',
      priority: isIncident ? 'high' : 'normal', createdAt: source.createdAt || source.occurredAt || null,
      dueAt: source.dueAt || source.followUpDate || null, sourceType, sourceId,
      status: 'open', availableActions: ['openParentContact'], context: [],
    };
    item.studentName = canonicalStudentName(studentById, item.studentId, source.studentName);
    item.classLabel = text(classById.get(item.classId)?.name || classById.get(item.classId)?.period || source.classPeriod || item.classId);
    if (isIncident) { item.priority = 'high'; item.context = ['Confirmed academic-integrity incident']; }
    if (completed || completedIds.has(sourceId)) item.status = 'completed';
    if (sourceType === 'parentContact' && sourceId) item.availableActions = item.status === 'open' ? ['completeParentFollowUp', 'openParentContact'] : ['openParentContact'];
    parentByObligation.set(obligation, item);
    if (!existing) items.push(item);
  };

  events.filter((event) => event.kind === SUPPORT_EVENT_KIND.ACADEMIC_INTEGRITY_INCIDENT
      && event.stage !== SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL).forEach((event) => addParent(event, 'studentSupportEvent'));
  events.filter((event) => event.kind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP)
    .forEach((event) => addParent(event, 'studentSupportEvent'));
  list(parentContacts).filter(authorized).filter((contact) => contact.recordType !== 'followUpResolution' && contact.followUpDate)
    .forEach((contact) => addParent(contact, 'parentContact', contact.followUpCompleted || contactResolutions.has(idOf(contact))));

  list(returnCheckIns).filter(authorized).forEach((candidate) => {
    const status = candidate.status === 'open' ? 'open' : 'completed';
    const hasReconciliation = list(candidate.extensions).some((entry) => entry.actionRequired !== false);
    items.push({
      id: `absence:${candidate.key}`, kind: hasReconciliation ? TEACHER_ACTION_KIND.EXTENSION_RECONCILIATION : TEACHER_ACTION_KIND.RETURN_FROM_ABSENCE,
      studentId: studentIdOf(candidate), studentName: canonicalStudentName(studentById, studentIdOf(candidate), candidate.studentName),
      classId: classIdOf(candidate) || null, classLabel: text(classById.get(classIdOf(candidate))?.name || classById.get(classIdOf(candidate))?.period || candidate.classPeriod),
      assignmentId: null, title: hasReconciliation ? 'Return and extension check-in' : 'Returned after absence',
      summary: `${Number(candidate.meetingsMissed) || list(candidate.missedMeetingDates).length} missed lesson${Number(candidate.meetingsMissed) === 1 ? '' : 's'}; check in after returning.`,
      priority: 'normal', createdAt: candidate.returnDateKey || null, dueAt: candidate.returnDateKey || null,
      sourceType: 'returnCheckIn', sourceId: candidate.key, status,
      availableActions: status === 'open' ? ['resolveReturnCheckIn', 'openAttendance'] : ['openAttendance'],
    });
  });

  list(gradeTransferUnits).filter(authorized).forEach((unit) => {
    if (![TRANSFER_STATE.EXPORTED, TRANSFER_STATE.READY_TO_EXPORT, TRANSFER_STATE.UPDATE_REQUIRED].includes(unit.state)) return;
    items.push({ id: `upload:${unit.key || `${unit.classId}:${unit.assignmentId}`}`, kind: TEACHER_ACTION_KIND.GRADE_UPLOAD,
      studentId: null, studentName: '', classId: classIdOf(unit) || null,
      classLabel: text(unit.classLabel || classById.get(classIdOf(unit))?.name || classIdOf(unit)), assignmentId: text(unit.assignmentId) || null,
      title: unit.state === TRANSFER_STATE.EXPORTED ? 'Upload grade package' : 'Prepare grade export',
      summary: unit.state === TRANSFER_STATE.EXPORTED ? 'Exported package still needs upload acknowledgement.' : 'Finalized grades are ready in Grade Transfer.',
      priority: 'normal', createdAt: unit.createdAt || unit.ordinaryDeadline || null, dueAt: unit.ordinaryDeadline || null,
      sourceType: 'gradeTransfer', sourceId: text(unit.key), status: 'open', availableActions: ['openGradeTransfer'] });
  });

  list(retestRecoveryActions).filter(authorized).filter((action) => action.actionRequired !== false).forEach((action) => items.push({
    id: `retest:${idOf(action)}`, kind: TEACHER_ACTION_KIND.RETEST_RECOVERY,
    studentId: studentIdOf(action), studentName: canonicalStudentName(studentById, studentIdOf(action), action.studentName),
    classId: classIdOf(action) || null, classLabel: text(classById.get(classIdOf(action))?.name || action.classPeriod),
    assignmentId: text(action.assignmentId) || null, title: 'Retest / recovery follow-up',
    summary: text(action.summary) || 'Review the existing retest or recovery workflow.', priority: action.priority === 'high' ? 'high' : 'normal',
    createdAt: action.createdAt || null, dueAt: action.dueAt || null, sourceType: 'testCycle', sourceId: idOf(action),
    status: action.completed ? 'completed' : 'open', availableActions: ['openRetestWorkflow'],
  }));

  return items.sort((left, right) => priorityRank(left, now) - priorityRank(right, now)
    || instant(left.createdAt) - instant(right.createdAt) || left.id.localeCompare(right.id));
};

export const resolveTeacherActionState = (items, { status = 'open', classId = '', kind = '' } = {}) => list(items)
  .filter((item) => !status || item.status === status)
  .filter((item) => !classId || item.classId === classId)
  .filter((item) => !kind || item.kind === kind);

export const openTeacherActionCount = (items) => resolveTeacherActionState(items, { status: 'open' }).length;

export default buildTeacherActionItems;

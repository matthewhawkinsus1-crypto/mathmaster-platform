export const TRANSFER_STATE = Object.freeze({
  WAITING_FOR_FINALIZATION: 'WAITING_FOR_FINALIZATION',
  READY_TO_EXPORT: 'READY_TO_EXPORT',
  EXPORTED: 'EXPORTED',
  UPLOAD_CONFIRMED: 'UPLOAD_CONFIRMED',
  WAITING_ON_EXTENDED_STUDENTS: 'WAITING_ON_EXTENDED_STUDENTS',
  UPDATE_REQUIRED: 'UPDATE_REQUIRED',
  ROSTER_ID_PROBLEM: 'ROSTER_ID_PROBLEM',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

const text = (value) => String(value ?? '').trim();
const time = (value) => {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const resolvedStudentFinal = (value) => {
  if (value && typeof value === 'object' && typeof value?.toMillis !== 'function' && !(value instanceof Date)) {
    return {
      deadline: time(value.deadline ?? value.lateDueAt ?? value.dueAt ?? null),
      reopened: value.reopened === true,
    };
  }
  return { deadline: time(value), reopened: false };
};

const snapshotMoment = (snapshot) => (
  time(snapshot?.uploadConfirmedAt) ?? time(snapshot?.createdAt) ?? 0
);

const confirmedHistory = ({ confirmedSnapshots, confirmedSnapshot }) => {
  const history = Array.isArray(confirmedSnapshots) ? confirmedSnapshots.filter(Boolean) : [];
  if (confirmedSnapshot && !history.includes(confirmedSnapshot)) history.push(confirmedSnapshot);
  return history.sort((left, right) => {
    const byTime = snapshotMoment(left) - snapshotMoment(right);
    if (byTime) return byTime;
    if (left?.exportKind === right?.exportKind) return 0;
    if (left?.exportKind === 'initial') return -1;
    if (right?.exportKind === 'initial') return 1;
    return 0;
  });
};

export const validSisStudentId = (value) => /^\d{3,20}$/.test(text(value));

// TEAMS requires the district/SIS number, not MathMaster's internal account key.
// Existing all-digit roster document ids remain a safe compatibility fallback,
// while legacy email/alphanumeric account keys must be repaired by storing a
// verified sisStudentId on the student record.
export const authoritativeSisStudentId = (student) => {
  const explicit = text(student?.sisStudentId);
  if (explicit) return explicit;
  const legacy = text(student?.studentId || student?.id);
  return validSisStudentId(legacy) ? legacy : '';
};

export const canonicalGradeVersion = ({ student, assignmentId, grade }) => text(
  student?.canonicalGradeVersions?.[assignmentId]
  || student?.gradeFinalizationByAssignment?.[assignmentId]?.version
  || student?.gradesByAssignment?.[assignmentId]?.finalizationId
  || `${assignmentId}:${grade}`,
);

export const buildTransferUnit = ({
  classRecord, assignment, students, now = Date.now(), projectCanonicalGrade,
  hasAuthoritativePracticePass = () => false,
  resolveStudentFinalDeadline = () => null,
  confirmedSnapshots = null, confirmedSnapshot = null, latestExport = null,
}) => {
  const ordinaryDeadline = time(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate);
  const ordinaryFinal = ordinaryDeadline !== null && now >= ordinaryDeadline;
  const rows = [];
  const withheld = [];
  const problems = [];
  const finalizedStudentIds = new Set();
  const history = confirmedHistory({ confirmedSnapshots, confirmedSnapshot });
  const hasConfirmedBaseline = history.length > 0;
  const baseline = new Map();
  history.forEach((snapshot) => {
    (snapshot?.rows || []).forEach((row) => baseline.set(text(row.studentId), row));
  });

  for (const student of students || []) {
    const studentFinal = resolvedStudentFinal(resolveStudentFinalDeadline({ student, assignment, classRecord }));
    const individualDeadline = studentFinal.deadline;
    // A student-specific cutoff may extend the class cutoff, but a stale or
    // legacy override is never allowed to make a student's grade final sooner.
    const effectiveDeadline = ordinaryDeadline === null
      ? individualDeadline
      : individualDeadline === null ? ordinaryDeadline : Math.max(ordinaryDeadline, individualDeadline);
    const reopenedActive = studentFinal.reopened && (ordinaryDeadline === null || ordinaryFinal);
    const extensionActive = ordinaryFinal && individualDeadline !== null && effectiveDeadline !== null && now < effectiveDeadline;

    if (reopenedActive || extensionActive) {
      withheld.push({
        studentId: text(student.id),
        name: text(student.displayName || student.name || student.id),
        reason: reopenedActive ? 'Student explicitly reopened' : 'Active individual extension',
        deadline: effectiveDeadline !== null ? new Date(effectiveDeadline).toISOString() : null,
      });
      continue;
    }
    if (effectiveDeadline === null || now < effectiveDeadline) continue;

    const projectedGrade = projectCanonicalGrade({
      student,
      assignment,
      practicePassRedeemed: hasAuthoritativePracticePass({ student, assignment, classRecord }),
    });
    if (projectedGrade === null || projectedGrade === undefined || projectedGrade === '') {
      problems.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'No finalized canonical grade' });
      continue;
    }
    const numericGrade = Number(projectedGrade);
    if (!Number.isFinite(numericGrade)) {
      problems.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'Canonical grade needs review' });
      continue;
    }
    const grade = Math.max(0, Math.min(100, Math.round(numericGrade)));
    finalizedStudentIds.add(text(student.id));

    const sisStudentId = authoritativeSisStudentId(student);
    if (!validSisStudentId(sisStudentId)) {
      problems.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'Missing or invalid SIS Student ID' });
      continue;
    }
    const row = { studentId: text(student.id), sisStudentId, grade, gradeVersion: canonicalGradeVersion({ student, assignmentId: assignment.id, grade }) };
    const previous = baseline.get(row.studentId);
    // Provenance is retained in every snapshot for audit, but a harmless
    // canonical rewrite that leaves the TEAMS value unchanged is not a delta.
    if (!hasConfirmedBaseline || !previous || previous.grade !== row.grade || previous.sisStudentId !== row.sisStudentId) rows.push(row);
  }

  let state = ordinaryFinal ? TRANSFER_STATE.READY_TO_EXPORT : TRANSFER_STATE.WAITING_FOR_FINALIZATION;
  if (hasConfirmedBaseline) state = rows.length
    ? TRANSFER_STATE.UPDATE_REQUIRED
    : withheld.length ? TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS : TRANSFER_STATE.UPLOAD_CONFIRMED;
  else if (latestExport) state = TRANSFER_STATE.EXPORTED;
  else if (withheld.length && !rows.length) state = TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS;
  if (problems.some((item) => item.reason.includes('SIS Student ID'))) state = TRANSFER_STATE.ROSTER_ID_PROBLEM;
  else if (problems.length && !rows.length) state = TRANSFER_STATE.REVIEW_REQUIRED;

  return {
    key: `${classRecord.classId}__${assignment.id}`,
    classId: classRecord.classId,
    classLabel: classRecord.name || classRecord.period || classRecord.classId,
    classPeriod: classRecord.period || '', assignmentId: assignment.id,
    assignmentTitle: assignment.title || 'Untitled assignment', ordinaryDeadline,
    exportKind: hasConfirmedBaseline ? 'delta' : 'initial', state, rows, withheld, problems,
    finalizedCount: finalizedStudentIds.size,
    extensionCount: withheld.length, changedCount: hasConfirmedBaseline ? rows.length : 0,
  };
};

export const teamsCsv = (rows) => (rows || []).map((row) => {
  if (!validSisStudentId(row.sisStudentId) || !Number.isInteger(row.grade) || row.grade < 0 || row.grade > 100) throw new Error('Invalid TEAMS export row.');
  return `${row.sisStudentId},${row.grade}`;
}).join('\r\n') + ((rows || []).length ? '\r\n' : '');

const safeName = (value) => text(value).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64) || 'GradeExport';
const shortIdentity = (value) => {
  let hash = 2166136261;
  for (const character of text(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${safeName(value).slice(0, 12)}-${(hash >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`;
};
export const transferSnapshotId = (unit) => `transfer_${shortIdentity([
  unit.classId,
  unit.assignmentId,
  unit.exportKind,
  ...(unit.rows || []).map((row) => `${row.studentId}:${row.sisStudentId}:${row.grade}:${row.gradeVersion}`),
].join('|'))}`;
export const transferFileName = (unit) => {
  const deadline = unit.ordinaryDeadline ? new Date(unit.ordinaryDeadline).toISOString().slice(0, 10) : 'no-date';
  return `${safeName(unit.classPeriod || unit.classLabel)}_${safeName(unit.assignmentTitle)}_${deadline}_${shortIdentity(unit.assignmentId)}${unit.exportKind === 'delta' ? '_UPDATE' : ''}.csv`;
};

export const packageManifest = (units) => ['MathMaster Gradebook Package', '', ...(units || []).flatMap((unit) => [
  `Class/period: ${unit.classLabel}`,
  `Assignment: ${unit.assignmentTitle}`,
  `File: ${transferFileName(unit)}`,
  `Student grades: ${unit.rows.length}`,
  `Withheld for active extensions: ${unit.withheld.length}${unit.withheld.length ? ` (${unit.withheld.map((row) => row.name).join(', ')})` : ''}`,
  `Export: ${unit.exportKind === 'delta' ? 'update' : 'initial'}`,
  `TEAMS “Overwrite existing grades?”: ${unit.exportKind === 'delta' ? 'YES' : 'NO'}`,
  '',
])].join('\n');

export const createExportSnapshot = ({ unit, transferId, teacherUid, teacherEmail, packageId }) => ({
  transferId, teacherUid, teacherEmail, classId: unit.classId, assignmentId: unit.assignmentId,
  assignmentTitle: unit.assignmentTitle, exportKind: unit.exportKind,
  rows: unit.rows.map((row) => ({ ...row })), withheld: unit.withheld.map((row) => ({ ...row })),
  fileName: transferFileName(unit), packageId, schemaVersion: 1,
});

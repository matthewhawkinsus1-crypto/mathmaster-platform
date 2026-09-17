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

export const validSisStudentId = (value) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(text(value));

// The roster document id is MathMaster's existing Student ID. An explicitly
// migrated sisStudentId wins, but names and email addresses are never keys.
export const authoritativeSisStudentId = (student) => text(student?.sisStudentId || student?.studentId || student?.id);

export const canonicalGradeVersion = ({ student, assignmentId, grade }) => text(
  student?.canonicalGradeVersions?.[assignmentId]
  || student?.gradeFinalizationByAssignment?.[assignmentId]?.version
  || student?.gradesByAssignment?.[assignmentId]?.finalizationId
  || `${assignmentId}:${grade}`,
);

export const studentFinalDeadline = (student, assignmentId) => time(
  student?.finalDeadlinesByAssignment?.[assignmentId]
  || student?.assignmentDeadlineOverrides?.[assignmentId]?.finalDeadline
  || student?.assignmentDeadlineOverrides?.[assignmentId]?.lateDueAt,
);

export const buildTransferUnit = ({
  classRecord, assignment, students, now = Date.now(), calculateCanonicalGrade,
  confirmedSnapshot = null, latestExport = null,
}) => {
  const ordinaryDeadline = time(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate);
  const ordinaryFinal = ordinaryDeadline !== null && now >= ordinaryDeadline;
  const rows = [];
  const withheld = [];
  const problems = [];
  const baseline = new Map((confirmedSnapshot?.rows || []).map((row) => [text(row.studentId), row]));

  for (const student of students || []) {
    const tracker = student?.gradesByAssignment?.[assignment.id];
    const overrideDeadline = studentFinalDeadline(student, assignment.id);
    const extensionActive = ordinaryFinal && overrideDeadline !== null && now < overrideDeadline;
    if (extensionActive) {
      withheld.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'Active individual extension', deadline: new Date(overrideDeadline).toISOString() });
      continue;
    }
    if (!ordinaryFinal && !(overrideDeadline !== null && now >= overrideDeadline)) continue;
    if (!tracker) {
      problems.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'No finalized canonical grade' });
      continue;
    }
    const sisStudentId = authoritativeSisStudentId(student);
    if (!validSisStudentId(sisStudentId)) {
      problems.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'Missing or invalid SIS Student ID' });
      continue;
    }
    const grade = Math.max(0, Math.min(100, Math.round(Number(calculateCanonicalGrade(tracker, assignment)))));
    if (!Number.isFinite(grade)) {
      problems.push({ studentId: text(student.id), name: text(student.displayName || student.name || student.id), reason: 'Canonical grade needs review' });
      continue;
    }
    const row = { studentId: text(student.id), sisStudentId, grade, gradeVersion: canonicalGradeVersion({ student, assignmentId: assignment.id, grade }) };
    const previous = baseline.get(row.studentId);
    // Provenance is retained in every snapshot for audit, but a harmless
    // canonical rewrite that leaves the TEAMS value unchanged is not a delta.
    if (!confirmedSnapshot || !previous || previous.grade !== row.grade || previous.sisStudentId !== row.sisStudentId) rows.push(row);
  }

  let state = ordinaryFinal ? TRANSFER_STATE.READY_TO_EXPORT : TRANSFER_STATE.WAITING_FOR_FINALIZATION;
  if (confirmedSnapshot) state = rows.length ? TRANSFER_STATE.UPDATE_REQUIRED : TRANSFER_STATE.UPLOAD_CONFIRMED;
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
    exportKind: confirmedSnapshot ? 'delta' : 'initial', state, rows, withheld, problems,
    finalizedCount: rows.length + (confirmedSnapshot?.rows?.length || 0),
    extensionCount: withheld.length, changedCount: confirmedSnapshot ? rows.length : 0,
  };
};

export const teamsCsv = (rows) => (rows || []).map((row) => {
  if (!validSisStudentId(row.sisStudentId) || !Number.isInteger(row.grade) || row.grade < 0 || row.grade > 100) throw new Error('Invalid TEAMS export row.');
  return `${row.sisStudentId},${row.grade}`;
}).join('\r\n') + ((rows || []).length ? '\r\n' : '');

const safeName = (value) => text(value).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64) || 'GradeExport';
export const transferFileName = (unit) => `${safeName(unit.classPeriod || unit.classLabel)}_${safeName(unit.assignmentTitle)}${unit.exportKind === 'delta' ? '_UPDATE' : ''}.csv`;

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

export const createExportSnapshot = ({ unit, transferId, teacherUid, teacherEmail, packageId, createdAt = new Date().toISOString() }) => ({
  transferId, teacherUid, teacherEmail, classId: unit.classId, assignmentId: unit.assignmentId,
  assignmentTitle: unit.assignmentTitle, exportKind: unit.exportKind, createdAt,
  rows: unit.rows.map((row) => ({ ...row })), withheld: unit.withheld.map((row) => ({ ...row })),
  fileName: transferFileName(unit), packageId, schemaVersion: 1,
});

import { studentNameForStorage } from '../../../functions/shared/studentIdentity.mjs';
import {
  canonicalDistrictStudentId,
  effectiveDistrictStudentId,
  isValidDistrictStudentId,
} from '../../../functions/shared/studentDistrictId.mjs';
import {
  STUDENT_NAME_UNAVAILABLE,
  formatStudentLabel,
  resolveRosterStudentName,
} from '../studentName.js';

export const TRANSFER_STATE = Object.freeze({
  WAITING_FOR_FINALIZATION: 'WAITING_FOR_FINALIZATION',
  READY_TO_EXPORT: 'READY_TO_EXPORT',
  EXPORTED: 'EXPORTED',
  UPLOAD_CONFIRMED: 'UPLOAD_CONFIRMED',
  WAITING_ON_EXTENDED_STUDENTS: 'WAITING_ON_EXTENDED_STUDENTS',
  UPDATE_REQUIRED: 'UPDATE_REQUIRED',
  ROSTER_ID_PROBLEM: 'ROSTER_ID_PROBLEM',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  NO_TRANSFER_REQUIRED: 'NO_TRANSFER_REQUIRED',
});

export const SECTION_TRANSFER_LABELS = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
});

const text = (value) => String(value ?? '').trim();

// Held-back, excused and problem rows name the student so a teacher can act on
// them, and the withheld list is persisted inside every export snapshot. They
// carry the studentId plus a REAL name or null — never the id standing in for
// a name (a nameless Classroom-linked student used to be listed as '101410').
// Screens and the MANIFEST resolve the label at display time.
const transferPerson = (student, fields) => ({
  studentId: text(student?.id ?? student?.studentId),
  name: studentNameForStorage({ ...student, studentId: text(student?.id ?? student?.studentId) }),
  ...fields,
});

/**
 * How a held-back/excused/problem row names its student: the current roster
 * name when an identity index (Map studentId -> roster record) is given, then
 * the row's stored name if it is really a name, else
 * "Name unavailable · ID 101410". Legacy snapshots that stored the id as the
 * name read as unavailable, not as a name.
 */
export const transferStudentLabel = (row = {}, index = null) => {
  const studentId = text(row?.studentId);
  const name = resolveRosterStudentName({ studentId, index: index instanceof Map ? index : new Map(), historicalName: row?.name });
  return name === STUDENT_NAME_UNAVAILABLE ? formatStudentLabel(studentId) : name;
};
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

export const validSisStudentId = (value) => isValidDistrictStudentId(value);

// A held Practice-based Recovery (canonicalGradeProjection.js recoveryHoldFor):
// the grade is not settled, so no TEAMS row leaves for this student. Named,
// so the teacher knows exactly what to resolve (the gradebook's Recovery
// details), and never confused with "no grade".
export const RECOVERY_HELD_TRANSFER_REASON = 'Recovery held for teacher review';

// A student whose district ID cannot address a TEAMS row: none on file, or not
// a number — or one that another student on the roster also carries, where a
// file would put one child's grade on the other's record. Either holds the
// row back and makes the unit a roster-ID problem until a teacher fixes it.
export const MISSING_SIS_TRANSFER_REASON = 'Missing or invalid SIS Student ID';
export const SHARED_SIS_TRANSFER_REASON = 'SIS Student ID shared with another student';
const ROSTER_ID_PROBLEM_REASONS = new Set([MISSING_SIS_TRANSFER_REASON, SHARED_SIS_TRANSFER_REASON]);

// TEAMS requires the district/SIS number, not MathMaster's internal account key.
// A stored district ID always wins — a teacher may have corrected it away from
// a mistyped account ID (setStudentSisId). Existing all-digit roster document
// ids without one remain a safe compatibility fallback, while legacy
// email/alphanumeric account keys must be repaired by storing a verified
// sisStudentId. The rule lives in functions/shared/studentDistrictId.mjs.
export const authoritativeSisStudentId = (student) => effectiveDistrictStudentId(student);

/**
 * The district IDs (canonical: leading zeros ignored) that more than one
 * student in `students` would export under. Grade Export holds those rows back
 * rather than send two children's grades to one district record.
 */
export const sharedSisStudentIds = (students = []) => {
  const seen = new Set();
  const shared = new Set();
  (students || []).forEach((student) => {
    const canonical = canonicalDistrictStudentId(authoritativeSisStudentId(student));
    if (!canonical) return;
    if (seen.has(canonical)) shared.add(canonical);
    seen.add(canonical);
  });
  return shared;
};
export const sisStudentIdIsShared = (sharedIds, sisStudentId) => (
  sharedIds instanceof Set && sharedIds.has(canonicalDistrictStudentId(sisStudentId))
);

export const canonicalGradeVersion = ({ student, assignmentId, sectionKey = '', grade }) => {
  const base = text(
    student?.canonicalGradeVersions?.[assignmentId]
    || student?.gradeFinalizationByAssignment?.[assignmentId]?.version
    || student?.gradesByAssignment?.[assignmentId]?.finalizationId
    || `${assignmentId}:${grade}`,
  );
  return sectionKey ? `${base}:${sectionKey}` : base;
};

export const buildTransferUnit = ({
  classRecord, assignment, students, now = Date.now(), projectCanonicalGrade,
  hasAuthoritativePracticePass = () => false,
  // ({ student, assignment, classRecord, sectionKey, practicePassRedeemed })
  // => true when none of this section is the student's required work because
  // of their reduced-item-count accommodation (canonicalGradeProjection.js
  // sectionNotRequiredForStudent). Absent → never.
  isSectionNotRequired = () => false,
  // ({ student, assignment, classRecord, sectionKey }) => true while this
  // student's grade for this unit waits on a held Practice-based Recovery
  // (canonicalGradeProjection.js recoveryHoldFor). Absent → never.
  recoveryHeldFor = () => false,
  resolveStudentFinalDeadline = () => null,
  // Set of district IDs more than one roster student carries
  // (sharedSisStudentIds). Absent → none.
  sharedDistrictIds = null,
  confirmedSnapshots = null, confirmedSnapshot = null, latestExport = null,
  sectionKey = '', sectionLabel = '',
}) => {
  const ordinaryDeadline = time(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate);
  const ordinaryFinal = ordinaryDeadline !== null && now >= ordinaryDeadline;
  const rows = [];
  // Every finalized, SIS-valid row — whether or not it differs from what was
  // already uploaded. `rows` stays the delta the state machine is built on;
  // `allRows` is what a teacher needs when a file is lost, rejected by the SIS,
  // or simply has to be sent again (see gradeTransferHistory.js).
  const allRows = [];
  const withheld = [];
  const problems = [];
  const excused = [];
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
      withheld.push(transferPerson(student, {
        reason: reopenedActive ? 'Student explicitly reopened' : 'Active individual extension',
        deadline: effectiveDeadline !== null ? new Date(effectiveDeadline).toISOString() : null,
      }));
      continue;
    }
    if (effectiveDeadline === null || now < effectiveDeadline) continue;

    // Not settled: MathMaster could not grade this student's Recovery well
    // enough to score it, and a teacher has not resolved it yet. Exporting
    // the original now would hand TEAMS a "final" grade that can still move.
    if (recoveryHeldFor({ student, assignment, classRecord, sectionKey }) === true) {
      problems.push(transferPerson(student, { reason: RECOVERY_HELD_TRANSFER_REASON }));
      continue;
    }

    const practicePassRedeemed = hasAuthoritativePracticePass({ student, assignment, classRecord });
    const projectedGrade = projectCanonicalGrade({
      student,
      assignment,
      sectionKey,
      practicePassRedeemed,
    });
    if (projectedGrade === null || projectedGrade === undefined || projectedGrade === '') {
      // Practice Pass is an excusal only when no stronger canonical authority
      // supplied a numeric grade. This preserves assignment-level teacher
      // consequences, which intentionally outrank the waiver.
      if (sectionKey === 'practice' && practicePassRedeemed) {
        finalizedStudentIds.add(text(student.id));
        excused.push(transferPerson(student, { reason: 'Practice Pass' }));
        continue;
      }
      // The accommodation can leave a section with nothing required of this
      // student only in a degenerate case (the plan keeps an item in every
      // coverage cell). That is an excusal with no numeric TEAMS row, exactly
      // like a Practice Pass — not a grade for the teacher to repair.
      if (sectionKey && isSectionNotRequired({ student, assignment, classRecord, sectionKey, practicePassRedeemed }) === true) {
        finalizedStudentIds.add(text(student.id));
        excused.push(transferPerson(student, { reason: 'Not required (fewer items, same rigor)' }));
        continue;
      }
      problems.push(transferPerson(student, { reason: 'No finalized canonical grade' }));
      continue;
    }
    const numericGrade = Number(projectedGrade);
    if (!Number.isFinite(numericGrade)) {
      problems.push(transferPerson(student, { reason: 'Canonical grade needs review' }));
      continue;
    }
    const grade = Math.max(0, Math.min(100, Math.round(numericGrade)));
    finalizedStudentIds.add(text(student.id));

    const sisStudentId = authoritativeSisStudentId(student);
    if (!validSisStudentId(sisStudentId)) {
      problems.push(transferPerson(student, { reason: MISSING_SIS_TRANSFER_REASON }));
      continue;
    }
    if (sisStudentIdIsShared(sharedDistrictIds, sisStudentId)) {
      problems.push(transferPerson(student, { reason: SHARED_SIS_TRANSFER_REASON }));
      continue;
    }
    const row = {
      studentId: text(student.id),
      sisStudentId,
      grade,
      gradeVersion: canonicalGradeVersion({ student, assignmentId: assignment.id, sectionKey, grade }),
    };
    allRows.push(row);
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
  if (
    ordinaryFinal
    && sectionKey === 'practice'
    && excused.length
    && !rows.length
    && !withheld.length
    && !problems.length
    && !hasConfirmedBaseline
    && !latestExport
  ) state = TRANSFER_STATE.NO_TRANSFER_REQUIRED;
  if (problems.some((item) => ROSTER_ID_PROBLEM_REASONS.has(item.reason))) state = TRANSFER_STATE.ROSTER_ID_PROBLEM;
  else if (problems.length && !rows.length) state = TRANSFER_STATE.REVIEW_REQUIRED;

  const resolvedSectionLabel = sectionLabel || SECTION_TRANSFER_LABELS[sectionKey] || '';
  return {
    key: `${classRecord.classId}__${assignment.id}${sectionKey ? `__${sectionKey}` : ''}`,
    assignmentKey: `${classRecord.classId}__${assignment.id}`,
    classId: classRecord.classId,
    classLabel: classRecord.name || classRecord.period || classRecord.classId,
    classPeriod: classRecord.period || '',
    assignmentId: assignment.id,
    assignmentTitle: assignment.title || 'Untitled assignment',
    sectionKey,
    sectionLabel: resolvedSectionLabel,
    ordinaryDeadline,
    exportKind: hasConfirmedBaseline ? 'delta' : 'initial',
    state,
    rows,
    allRows,
    withheld,
    problems,
    excused,
    finalizedCount: finalizedStudentIds.size,
    extensionCount: withheld.length,
    changedCount: hasConfirmedBaseline ? rows.length : 0,
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
  unit.sectionKey || 'assignment',
  unit.exportKind,
  ...(unit.rows || []).map((row) => `${row.studentId}:${row.sisStudentId}:${row.grade}:${row.gradeVersion}`),
].join('|'))}`;

export const transferAssignmentFolderName = (unit) => {
  const deadline = unit.ordinaryDeadline ? new Date(unit.ordinaryDeadline).toISOString().slice(0, 10) : 'no-date';
  return `${safeName(unit.classPeriod || unit.classLabel)}_${safeName(unit.assignmentTitle)}_${deadline}_${shortIdentity(`${unit.classId}:${unit.assignmentId}`)}`;
};

export const transferFileName = (unit) => {
  if (unit.sectionKey) {
    return `${safeName(unit.sectionLabel || SECTION_TRANSFER_LABELS[unit.sectionKey] || unit.sectionKey)}${unit.exportKind === 'delta' ? '_UPDATE' : ''}.csv`;
  }
  const deadline = unit.ordinaryDeadline ? new Date(unit.ordinaryDeadline).toISOString().slice(0, 10) : 'no-date';
  return `${safeName(unit.classPeriod || unit.classLabel)}_${safeName(unit.assignmentTitle)}_${deadline}_${shortIdentity(unit.assignmentId)}${unit.exportKind === 'delta' ? '_UPDATE' : ''}.csv`;
};

export const transferPackagePath = (unit) => (
  unit.sectionKey
    ? `${transferAssignmentFolderName(unit)}/${transferFileName(unit)}`
    : transferFileName(unit)
);

export const packageManifest = (units) => ['MathMaster Gradebook Package', '', ...(units || []).flatMap((unit) => [
  `Class/period: ${unit.classLabel}`,
  `Assignment: ${unit.assignmentTitle}`,
  ...(unit.sectionKey ? [`Section: ${unit.sectionLabel || unit.sectionKey}`, `Folder: ${transferAssignmentFolderName(unit)}`] : []),
  `File: ${transferPackagePath(unit)}`,
  `Student grades: ${unit.rows.length}`,
  `Excused/no numeric TEAMS row: ${unit.excused?.length || 0}${unit.excused?.length ? ` (${unit.excused.map((row) => transferStudentLabel(row)).join(', ')})` : ''}`,
  `Withheld for active extensions: ${unit.withheld.length}${unit.withheld.length ? ` (${unit.withheld.map((row) => transferStudentLabel(row)).join(', ')})` : ''}`,
  `Export: ${unit.reexport ? 'full re-export of current grades' : unit.exportKind === 'delta' ? 'update' : 'initial'}`,
  // A re-export may land on top of grades the SIS already holds, so it must
  // overwrite exactly like an update does.
  `TEAMS “Overwrite existing grades?”: ${unit.exportKind === 'delta' || unit.reexport ? 'YES' : 'NO'}`,
  // A teacher corrected a district ID after this file was last exported
  // (gradeTransferHistory.js buildExportPlan). This file sends the grade
  // under the corrected number; nothing MathMaster sends can remove what an
  // earlier file put under the old one.
  ...(unit.reidentified?.length ? [
    `District ID corrected since the last export: ${unit.reidentified.map((entry) => `${entry.previousSisStudentId} → ${entry.sisStudentId}`).join(', ')}. This file uses the corrected ID. A grade uploaded earlier under the old ID stays in TEAMS until it is removed there.`,
  ] : []),
  '',
])].join('\n');

const zipStamp = (now) => {
  const date = new Date(now);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
};

// Words kept apart with hyphens so "Algebra II — Period 3" reads as
// Algebra-II-Period-3 in a Downloads folder rather than AlgebraIIPeriod3.
const readableName = (value, max = 48) => text(value)
  .replace(/[^A-Za-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, max)
  .replace(/-+$/, '') || 'GradeExport';

/**
 * A ZIP name a teacher can find again in Downloads: what is in it and when it
 * was made, never an opaque package id. One class names the class — by its
 * NAME, because two classes can share a period ("Algebra II — Period 3" and
 * "Algebra II Lab — Period 3"); several say how many. The package id stays
 * inside the snapshots for audit.
 */
export const gradePackageFileName = (units = [], now = Date.now()) => {
  const classKeys = [...new Set((units || []).map((unit) => text(unit.classId || unit.classLabel || unit.classPeriod)).filter(Boolean))];
  const assignmentIds = [...new Set((units || []).map((unit) => text(unit.assignmentId)).filter(Boolean))];
  const firstOfClass = (units || []).find((unit) => text(unit.classId || unit.classLabel || unit.classPeriod) === classKeys[0]);
  const scope = classKeys.length === 1 ? readableName(firstOfClass?.classLabel || firstOfClass?.classPeriod) : `${classKeys.length}-classes`;
  const what = assignmentIds.length === 1
    ? readableName((units || []).find((unit) => unit.assignmentId === assignmentIds[0])?.assignmentTitle, 40)
    : `${assignmentIds.length}-assignments`;
  const kind = (units || []).some((unit) => unit.reexport) ? '_REEXPORT' : (units || []).every((unit) => unit.exportKind === 'delta') && units.length ? '_UPDATE' : '';
  return `MathMaster-grades_${scope}_${what}_${zipStamp(now)}${kind}.zip`;
};

export const createExportSnapshot = ({ unit, transferId, teacherUid, teacherEmail, packageId }) => ({
  transferId,
  teacherUid,
  teacherEmail,
  classId: unit.classId,
  assignmentId: unit.assignmentId,
  assignmentTitle: unit.assignmentTitle,
  sectionKey: unit.sectionKey || '',
  sectionLabel: unit.sectionLabel || '',
  exportKind: unit.exportKind,
  rows: unit.rows.map((row) => ({ ...row })),
  withheld: unit.withheld.map((row) => ({ ...row })),
  fileName: transferPackagePath(unit),
  packageId,
  schemaVersion: unit.sectionKey ? 2 : 1,
});

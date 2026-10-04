// THE CLASS AND LESSONS THE STUDENT-CONTROLS COST CERTIFICATIONS MEASURE.
//
// Shared by scripts/certify-student-assignment-overrides-cost.mjs (what the
// server reads and writes) and scripts/certify-student-controls-client-cost.mjs
// (what each device's listeners receive), so both measure the same lesson
// and the same spread of per-student controls.

export const DAY = 86_400_000;

export const bytes = (value) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

const pad = (text, size) => (text + ' ').repeat(Math.ceil(size / (text.length + 1))).slice(0, size);

/**
 * A realistic lesson: 28 questions across Warm-Up, Classwork, Practice and a
 * DOL, each with the prompt, worked solution and hints a real lesson carries
 * (~1.5 KB each).
 */
export const costLesson = (id, classId, { closed, now = Date.now() }) => {
  const roles = [['warmup', 3], ['classwork', 12], ['practice', 10], ['dol', 3]];
  let index = 0;
  const sections = roles.map(([role, size]) => ({
    id: `${id}-${role}`,
    role,
    title: role,
    questions: Array.from({ length: size }, () => {
      const questionIndex = index;
      index += 1;
      return {
        questionId: `${id}-q${questionIndex}`, id: `${id}-q${questionIndex}`, type: 'literal', activityRole: role,
        prompt: pad(`Solve for y in question ${questionIndex}.`, 320), solveFor: 'y', acceptedAnswers: [`${questionIndex}`],
        solution: pad('Isolate the variable, then check by substitution.', 700),
        hints: [pad('Start from the inverse operation.', 160), pad('Undo addition before multiplication.', 160)],
      };
    }),
  }));
  return {
    title: `Lesson ${id}`,
    assignedClassIds: [classId],
    schemaVersion: 5,
    releaseAt: new Date(now - (closed ? 3 : 1) * DAY).toISOString(),
    dueAt: new Date(now + (closed ? -2 : 1) * DAY).toISOString(),
    lateDueAt: new Date(now + (closed ? -1 : 2) * DAY).toISOString(),
    sections,
    sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
    dol: { enabled: true, minutesBeforeEnd: 10 },
  };
};

/**
 * Every per-student control shape the platform has stored on a shared lesson,
 * spread over the class: 25% with an attendance extension, 10% excused, 5%
 * reopened, 10% with extra DOL attempts (and the recovery log naming them).
 * `everyone` gives every student an extension and an attempt grant.
 */
export const legacyControls = (studentIds, { everyone = false, now = Date.now() } = {}) => {
  const share = (fraction) => studentIds.slice(0, everyone ? studentIds.length : Math.ceil(studentIds.length * fraction));
  const studentOverrides = {};
  share(0.25).forEach((id, n) => {
    studentOverrides[id] = { lateDueAt: new Date(now + 2 * DAY + n * 60_000).toISOString(), extension: { dateKey: '2026-10-06', grantedAt: now - DAY } };
  });
  (everyone ? [] : studentIds.slice(-Math.ceil(studentIds.length * 0.1))).forEach((id) => { studentOverrides[id] = { ...studentOverrides[id], excused: true }; });
  (everyone ? [] : studentIds.slice(-Math.ceil(studentIds.length * 0.15), -Math.ceil(studentIds.length * 0.1))).forEach((id) => { studentOverrides[id] = { ...studentOverrides[id], reopened: true }; });
  const granted = everyone ? studentIds : studentIds.slice(Math.ceil(studentIds.length * 0.3), Math.ceil(studentIds.length * 0.4));
  const attemptGrantsByStudentId = Object.fromEntries(granted.map((id) => [id, { extraAttempts: 1, changedAt: new Date(now - DAY).toISOString(), changedBy: 'uid-teacher', reason: 'teacher-dol-recovery' }]));
  const recoveryAudit = granted.length ? [{
    id: `grantAttempts:students:${granted.join('+')}:${new Date(now - DAY).toISOString()}`,
    action: 'grantAttempts', section: 'dol', scope: { type: 'students', studentIds: granted, classId: null },
    previous: { extraAttemptsByStudent: Object.fromEntries(granted.map((id) => [id, 0])) },
    next: { extraAttemptsByStudent: Object.fromEntries(granted.map((id) => [id, 1])) },
    teacherId: 'uid-teacher', at: new Date(now - DAY).toISOString(),
  }] : [];
  return { studentOverrides, attemptGrantsByStudentId, recoveryAudit };
};

export const withControls = (doc, controls) => ({
  ...doc,
  studentOverrides: controls.studentOverrides,
  dol: { ...doc.dol, attemptGrantsByStudentId: controls.attemptGrantsByStudentId, recoveryAudit: controls.recoveryAudit },
});

export const WALKTHROUGH_STATUS = Object.freeze({
  NEEDS_CHECK: 'needsCheck',
  ON_QUESTION: 'onQuestion',
  AHEAD: 'ahead',
  DONE: 'done',
  ELSEWHERE: 'elsewhere',
});

const TERMINAL_STATES = new Set(['c', 'x']);
const ABSENT_MARKS = new Set(['absent', 'excused', 'unexcused']);
const OFFLINE_AFTER_MS = 75000;
const IDLE_AFTER_MS = 180000;

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const studentName = (student) => String(
  student?.displayName || student?.name || student?.studentName || student?.id || 'Student',
);

const normalizeAttendance = (entry) => {
  if (typeof entry === 'string') return { mark: entry, arrivedAt: null };
  return {
    mark: String(entry?.mark || entry?.status || '').toLowerCase(),
    arrivedAt: toMillis(entry?.arrivedAt || entry?.arrivalAt || entry?.markedAt),
  };
};

const stateAt = (live, teacherQuestionIndex) => (
  String(live?.classworkQuestionStates || '')[teacherQuestionIndex] || '.'
);

const reasonFor = ({ status, behindBy, inactive, offline, live, attendance }) => {
  if (live?.helpRequestedAt || live?.helpRequested) return 'Help requested';
  if (status === WALKTHROUGH_STATUS.DONE) return 'Teacher question completed';
  if (status === WALKTHROUGH_STATUS.ON_QUESTION) return 'On this question';
  if (status === WALKTHROUGH_STATUS.AHEAD) return 'Working ahead';
  if (status === WALKTHROUGH_STATUS.ELSEWHERE) return 'Working another assignment';
  if (status !== WALKTHROUGH_STATUS.NEEDS_CHECK) return '';
  if (!live?.assignmentId) return attendance.mark === 'late' ? 'Late arrival · not started' : 'Not started';
  if (offline) return `${behindBy || 0} behind · connection inactive`;
  if (inactive) return `${behindBy || 0} behind · no MathMaster activity`;
  if (live?.activityRole !== 'classwork') return `In ${String(live?.activityRole || 'another section')}`;
  return `${behindBy || 0} behind · active`;
};

/**
 * Build the teacher's room-walk view without changing student progress.
 *
 * Completion is read from the compact classwork state strip that is already
 * safe for live presence; no student response text is needed. Attendance is an
 * optional map because older class records may not have a reconciled mark yet.
 * Unmarked attendance never causes an automatic absence.
 */
export function buildWalkthroughMonitor({
  students = [],
  assignmentId,
  teacherQuestionIndex = 0,
  checkedStudentIds = [],
  attendanceByStudentId = {},
  nowValue = Date.now(),
} = {}) {
  const checked = new Set(checkedStudentIds || []);
  const all = [];

  for (const student of students || []) {
    if (!student) continue;
    const id = String(student.id || student.studentId || '');
    const attendance = normalizeAttendance(attendanceByStudentId?.[id]);
    if (ABSENT_MARKS.has(attendance.mark)) continue;

    const live = student.liveStatus && typeof student.liveStatus === 'object' ? student.liveStatus : null;
    const sameAssignment = Boolean(live?.assignmentId && String(live.assignmentId) === String(assignmentId || ''));
    const questionState = sameAssignment ? stateAt(live, teacherQuestionIndex) : '.';
    const completed = sameAssignment && TERMINAL_STATES.has(questionState);
    const updatedAt = toMillis(live?.updatedAt) || 0;
    const rawInteractionAt = toMillis(live?.lastInteractionAt) || updatedAt;
    // A late student cannot be "inactive for 40 minutes" thirty seconds after
    // arriving. Arrival becomes the earliest fair activity clock for that day.
    const effectiveInteractionAt = Math.max(rawInteractionAt, attendance.arrivedAt || 0);
    const offline = Boolean(live?.assignmentId) && nowValue - updatedAt > OFFLINE_AFTER_MS;
    const inactive = Boolean(live?.assignmentId) && !offline && nowValue - effectiveInteractionAt > IDLE_AFTER_MS;
    const sectionIndex = Math.max(0, Number(live?.sectionQuestionIndex) || 0);

    let status;
    let behindBy = 0;
    if (completed) status = WALKTHROUGH_STATUS.DONE;
    else if (!live?.assignmentId) {
      status = WALKTHROUGH_STATUS.NEEDS_CHECK;
      behindBy = teacherQuestionIndex + 1;
    } else if (!sameAssignment) status = WALKTHROUGH_STATUS.ELSEWHERE;
    else if (live?.activityRole !== 'classwork') {
      status = WALKTHROUGH_STATUS.NEEDS_CHECK;
      behindBy = teacherQuestionIndex + 1;
    } else if (sectionIndex === teacherQuestionIndex) status = WALKTHROUGH_STATUS.ON_QUESTION;
    else if (sectionIndex > teacherQuestionIndex) status = WALKTHROUGH_STATUS.AHEAD;
    else {
      status = WALKTHROUGH_STATUS.NEEDS_CHECK;
      behindBy = teacherQuestionIndex - sectionIndex;
    }

    const row = {
      id,
      name: studentName(student),
      student,
      live,
      attendance,
      status,
      completed,
      checked: checked.has(id),
      behindBy,
      offline,
      inactive,
      helpRequested: Boolean(live?.helpRequestedAt || live?.helpRequested),
      reason: '',
    };
    row.reason = reasonFor({ status, behindBy, inactive, offline, live, attendance });
    all.push(row);
  }

  const needsCheck = all.filter((row) => row.status === WALKTHROUGH_STATUS.NEEDS_CHECK && !row.checked);
  const priority = (row) => {
    if (row.helpRequested) return 0;
    if (!row.live?.assignmentId) return 1;
    if (row.offline || row.inactive) return 2;
    return 3;
  };
  needsCheck.sort((a, b) => priority(a) - priority(b)
    || b.behindBy - a.behindBy
    || a.name.localeCompare(b.name));

  const bottlenecks = new Map();
  all.forEach((row) => {
    if (row.offline || !row.live || String(row.live.assignmentId) !== String(assignmentId || '') || row.live.activityRole !== 'classwork') return;
    const index = Math.max(0, Number(row.live.sectionQuestionIndex) || 0);
    bottlenecks.set(index, (bottlenecks.get(index) || 0) + 1);
  });

  const aheadDone = all.filter((row) => [WALKTHROUGH_STATUS.AHEAD, WALKTHROUGH_STATUS.DONE].includes(row.status));
  const onQuestion = all.filter((row) => row.status === WALKTHROUGH_STATUS.ON_QUESTION);

  return {
    all,
    needsCheck,
    onQuestion,
    aheadDone,
    elsewhere: all.filter((row) => row.status === WALKTHROUGH_STATUS.ELSEWHERE),
    visitNext: needsCheck[0] || null,
    bottlenecks: [...bottlenecks.entries()]
      .map(([questionIndex, count]) => ({ questionIndex, count }))
      .sort((a, b) => b.count - a.count || a.questionIndex - b.questionIndex),
    counts: {
      present: all.length,
      needsCheck: needsCheck.length,
      onQuestion: onQuestion.length,
      aheadDone: aheadDone.length,
      helpRequests: all.filter((row) => row.helpRequested).length,
    },
  };
}

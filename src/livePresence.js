import { formatStudentName } from './platform/studentName.js';

// Live class monitoring, as pure functions so the whole thing is testable
// without Firestore.
//
// Design note on "thumbnail of the student's screen". A literal screen capture
// is the wrong tool here: it needs a getDisplayMedia permission prompt from
// every student every period, it uploads continuous video of minors' screens,
// and it costs orders of magnitude more bandwidth than the classroom needs.
// What a teacher actually wants to know from across the room is: which
// question is this student on, are they moving, and are they getting them
// right. All of that is already in the app's own state, so a live tile is
// reconstructed from a few hundred bytes rather than a video frame — and it is
// readable at thumbnail size in a way a real screenshot never is.
//
// The payload lives on a single `liveStatus` field of the student's existing
// grades document. It is overwritten on every heartbeat and cleared on sign
// out, so nothing accumulates and no new collection or security rule is needed.

export const HEARTBEAT_INTERVAL_MS = 20000;
// A tile goes grey when a heartbeat is this late — a closed laptop, a dropped
// network, or a student who navigated away.
export const OFFLINE_AFTER_MS = 75000;
// "On task" is generous on purpose: reading a problem, working on paper, and
// listening to the teacher are all legitimately quiet.
export const IDLE_AFTER_MS = 180000;

export const LIVE_SEVERITY = Object.freeze({ OK: 'ok', WATCH: 'watch', ALERT: 'alert' });

export const LIVE_FLAGS = Object.freeze({
  OFFLINE: 'offline',
  NOT_STARTED: 'notStarted',
  IDLE: 'idle',
  BEHIND_PACE: 'behindPace',
  STRUGGLING: 'struggling',
  STUCK: 'stuck',
});

// How far behind the class a student must fall before the tile turns red.
export const PACE_QUESTION_GAP = 3;
export const ACCURACY_GAP_POINTS = 25;
export const MIN_ANSWERED_FOR_ACCURACY = 3;
// Repeated wrong attempts on the same question is the clearest "come here" signal.
export const STUCK_ATTEMPTS = 3;

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  // Firestore Timestamp, in either its live or its plain-object form.
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const clampInt = (value, min = 0) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(min, number) : min;
};

/**
 * The payload a student's client writes on each heartbeat. Deliberately small
 * and free of any student response text — the teacher sees where the student
 * is, not what they typed.
 */
export const buildLiveStatus = ({
  assignmentId = null,
  assignmentTitle = '',
  activityRole = 'classwork',
  questionIndex = 0,
  questionCount = 0,
  sectionQuestionIndex = 0,
  sectionQuestionCount = 0,
  questionLabel = '',
  representation = 'text',
  questionStates = [],
  currentAttempts = 0,
  focusLossCount = 0,
  rapidCorrectCount = 0,
  rapidDeepCorrectCount = 0,
  timedIndependentCorrectCount = 0,
  sessionActiveSeconds = 0,
  lastInteractionAt = null,
  startedAt = null,
  nowValue = Date.now(),
} = {}) => ({
  assignmentId: assignmentId || null,
  assignmentTitle: String(assignmentTitle || '').slice(0, 120),
  activityRole: String(activityRole || 'classwork'),
  questionIndex: clampInt(questionIndex),
  questionCount: clampInt(questionCount),
  sectionQuestionIndex: clampInt(sectionQuestionIndex),
  sectionQuestionCount: clampInt(sectionQuestionCount),
  questionLabel: String(questionLabel || '').slice(0, 80),
  representation: String(representation || 'text'),
  // One character per question: c=correct, x=incorrect, a=attempted, .=untouched.
  // A whole assignment's progress bar in a handful of bytes.
  questionStates: String(questionStates || '').slice(0, 200),
  currentAttempts: clampInt(currentAttempts),
  // Coarse session telemetry only. No URLs, response text, keystrokes, or
  // screenshots are collected. These are corroborating signals for a teacher
  // review, never proof of behavior or academic integrity.
  focusLossCount: clampInt(focusLossCount),
  rapidCorrectCount: clampInt(rapidCorrectCount),
  rapidDeepCorrectCount: clampInt(rapidDeepCorrectCount),
  timedIndependentCorrectCount: clampInt(timedIndependentCorrectCount),
  sessionActiveSeconds: clampInt(sessionActiveSeconds),
  lastInteractionAt: toMillis(lastInteractionAt) ?? nowValue,
  startedAt: toMillis(startedAt) ?? nowValue,
  updatedAt: nowValue,
});

export const QUESTION_STATE_CHARS = Object.freeze({
  CORRECT: 'c', INCORRECT: 'x', ATTEMPTED: 'a', UNTOUCHED: '.',
});

/**
 * Compress an assignment tracker into one character per question. This is the
 * whole progress bar the teacher sees, so it has to stay in step with the
 * attempt-policy statuses: correct, expired (out of attempts), attempted, and
 * unattempted.
 */
export const encodeQuestionStates = (assignmentTracker = {}, questionIndices = []) => (
  (Array.isArray(questionIndices) ? questionIndices : [])
    .map((index) => {
      const status = assignmentTracker?.[index]?.status
        ?? (typeof assignmentTracker?.[index] === 'string' ? assignmentTracker[index] : null);
      if (status === 'correct') return QUESTION_STATE_CHARS.CORRECT;
      // "expired" means the attempts ran out without a correct answer, which
      // for the teacher's purposes is a wrong answer.
      if (status === 'expired' || status === 'incorrect') return QUESTION_STATE_CHARS.INCORRECT;
      if (status === 'attempted') return QUESTION_STATE_CHARS.ATTEMPTED;
      return QUESTION_STATE_CHARS.UNTOUCHED;
    })
    .join('')
);

export const countQuestionStates = (questionStates) => {
  const text = String(questionStates || '');
  const counts = { correct: 0, incorrect: 0, attempted: 0, untouched: 0 };
  for (const character of text) {
    if (character === QUESTION_STATE_CHARS.CORRECT) counts.correct += 1;
    else if (character === QUESTION_STATE_CHARS.INCORRECT) counts.incorrect += 1;
    else if (character === QUESTION_STATE_CHARS.ATTEMPTED) counts.attempted += 1;
    else counts.untouched += 1;
  }
  counts.answered = counts.correct + counts.incorrect;
  counts.accuracy = counts.answered ? Math.round((counts.correct / counts.answered) * 100) : null;
  return counts;
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const mean = (values) => (values.length
  ? values.reduce((total, value) => total + value, 0) / values.length
  : null);

/**
 * Read one student's live row. `student` is a grades document; `classStats`
 * comes from summarizeLiveClass and is what makes "behind" mean "behind the
 * rest of this room" rather than behind an arbitrary number.
 */
export const classifyLiveStudent = (student, { classStats = null, nowValue = Date.now() } = {}) => {
  const live = student?.liveStatus && typeof student.liveStatus === 'object' ? student.liveStatus : null;
  const name = formatStudentName(student, { lastFirst: false, fallbackToId: true });
  const base = {
    id: student?.id || '',
    name,
    classPeriod: student?.classPeriod || student?.profile?.classPeriod || '',
    live,
    flags: [],
    severity: LIVE_SEVERITY.OK,
  };

  if (!live || !live.assignmentId) {
    return {
      ...base,
      isOnline: false,
      counts: countQuestionStates(''),
      idleMs: null,
      flags: [LIVE_FLAGS.NOT_STARTED],
      severity: LIVE_SEVERITY.ALERT,
      headline: 'Not started',
    };
  }

  const updatedAt = toMillis(live.updatedAt) ?? 0;
  const lastInteractionAt = toMillis(live.lastInteractionAt) ?? updatedAt;
  const isOnline = nowValue - updatedAt <= OFFLINE_AFTER_MS;
  const idleMs = Math.max(0, nowValue - lastInteractionAt);
  const counts = countQuestionStates(live.questionStates);
  const flags = [];

  if (!isOnline) flags.push(LIVE_FLAGS.OFFLINE);
  else if (idleMs >= IDLE_AFTER_MS) flags.push(LIVE_FLAGS.IDLE);

  if (clampInt(live.currentAttempts) >= STUCK_ATTEMPTS) flags.push(LIVE_FLAGS.STUCK);

  if (classStats) {
    if (classStats.medianAnswered >= PACE_QUESTION_GAP
      && counts.answered <= classStats.medianAnswered - PACE_QUESTION_GAP) {
      flags.push(LIVE_FLAGS.BEHIND_PACE);
    }
    if (counts.answered >= MIN_ANSWERED_FOR_ACCURACY
      && counts.accuracy !== null
      && classStats.meanAccuracy !== null
      && counts.accuracy <= classStats.meanAccuracy - ACCURACY_GAP_POINTS) {
      flags.push(LIVE_FLAGS.STRUGGLING);
    }
  }

  // Red is reserved for "go talk to this student now". Amber is "keep an eye".
  // Offline counts as red: at a 20-second heartbeat, being marked offline means
  // four in a row were missed, which is a closed laptop rather than a blip.
  const alerting = flags.some((flag) => [
    LIVE_FLAGS.OFFLINE, LIVE_FLAGS.IDLE, LIVE_FLAGS.BEHIND_PACE, LIVE_FLAGS.STRUGGLING,
  ].includes(flag));
  const severity = alerting
    ? LIVE_SEVERITY.ALERT
    : flags.length ? LIVE_SEVERITY.WATCH : LIVE_SEVERITY.OK;

  return {
    ...base,
    isOnline,
    counts,
    idleMs,
    flags,
    severity,
    headline: describeLiveStudent({ isOnline, idleMs, flags, counts, live }),
  };
};

const formatMinutes = (milliseconds) => {
  const minutes = Math.floor(milliseconds / 60000);
  if (minutes < 1) return 'just now';
  return `${minutes} min`;
};

export const describeLiveStudent = ({ isOnline, idleMs, flags, counts, live }) => {
  if (!isOnline) return 'Offline';
  if (flags.includes(LIVE_FLAGS.IDLE)) return `Idle ${formatMinutes(idleMs)}`;
  if (flags.includes(LIVE_FLAGS.STUCK)) return `Stuck on Q${clampInt(live?.questionIndex) + 1}`;
  if (flags.includes(LIVE_FLAGS.BEHIND_PACE)) return `Behind — ${counts.answered} answered`;
  if (flags.includes(LIVE_FLAGS.STRUGGLING)) return `${counts.accuracy}% correct`;
  return `On Q${clampInt(live?.questionIndex) + 1}`;
};

/**
 * Class-level statistics and the roster, sorted so the students who need the
 * teacher are at the top of the grid rather than in alphabetical limbo.
 */
export const summarizeLiveClass = (students = [], { nowValue = Date.now(), assignmentId = null } = {}) => {
  const roster = (Array.isArray(students) ? students : []).filter(Boolean);

  const relevant = roster.map((student) => {
    const live = student?.liveStatus && typeof student.liveStatus === 'object' ? student.liveStatus : null;
    // A student working a *different* assignment is elsewhere and is left out.
    // A student working on nothing stays in the grid — "has not started" is the
    // single most important thing this screen exists to show.
    const onThisAssignment = !assignmentId
      || !live?.assignmentId
      || live.assignmentId === assignmentId;
    return { student, onThisAssignment };
  });

  // Pace is measured against the students who are actually working. Counting a
  // student whose laptop closed ten minutes ago drags the median down and makes
  // everyone still in the room look fine.
  const active = relevant
    .filter((entry) => {
      const live = entry.student?.liveStatus;
      if (!entry.onThisAssignment || !live?.assignmentId) return false;
      return nowValue - (toMillis(live.updatedAt) ?? 0) <= OFFLINE_AFTER_MS;
    })
    .map((entry) => countQuestionStates(entry.student.liveStatus.questionStates));

  const classStats = {
    medianAnswered: median(active.map((counts) => counts.answered)),
    meanAccuracy: mean(active.filter((counts) => counts.answered >= MIN_ANSWERED_FOR_ACCURACY)
      .map((counts) => counts.accuracy)),
    activeCount: active.length,
  };
  if (classStats.meanAccuracy !== null) classStats.meanAccuracy = Math.round(classStats.meanAccuracy);

  const rows = relevant
    .filter((entry) => entry.onThisAssignment)
    .map((entry) => classifyLiveStudent(entry.student, { classStats, nowValue }));

  const severityRank = { [LIVE_SEVERITY.ALERT]: 0, [LIVE_SEVERITY.WATCH]: 1, [LIVE_SEVERITY.OK]: 2 };
  rows.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]
    || a.name.localeCompare(b.name));

  return {
    rows,
    classStats,
    counts: {
      total: rows.length,
      online: rows.filter((row) => row.isOnline).length,
      needsAttention: rows.filter((row) => row.severity === LIVE_SEVERITY.ALERT).length,
    },
  };
};

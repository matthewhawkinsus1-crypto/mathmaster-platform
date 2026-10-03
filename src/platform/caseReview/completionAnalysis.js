/*
 * COMPLETION AND WORK PATTERN — FROM WHAT WAS RECORDED, LABELLED BY HOW.
 *
 * MathMaster keeps no "opened" record and no assignment-level "turned in"
 * record (docs/STUDENT_CASE_REVIEW_DESIGN.md §1.2). So:
 *
 *   opened      is "recorded" only when some record proves it — an attempt,
 *               a server-timed active minute, a session summary, or a support
 *               made available at launch — and otherwise "no open record",
 *               which is NOT "never opened";
 *   completed   is the gradebook's own rule (every current question answered
 *               at least once), and "completed on" is the time of the last
 *               recorded answer — derived, and labelled so;
 *   time        keeps four numbers apart and never merges them: active minutes
 *               (server ledger, else browser seconds, else Not recorded),
 *               elapsed (first to last active minute), the assignment window
 *               (release to the student's own final cutoff), and Practice Mode
 *               time, which MathMaster does not record at all.
 *
 * Work sessions are runs of server-timed active minutes with no gap longer
 * than SESSION_GAP_MINUTES — the only session boundary the records can
 * defend. Browser session summaries are listed beside them with their
 * client-clock caveat.
 */
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { CASE_PROVENANCE, fromSupportProvenance } from './caseProvenance.js';
import { QUESTION_OUTCOME, isRequiredQuestion } from './attemptAnalysis.js';

export const SESSION_GAP_MINUTES = 20;
const SCHOOL_TIME_ZONE = 'America/Chicago';
const DAY_MS = 86400000;

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const finite = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
const millis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Runs of active minutes; a gap longer than SESSION_GAP_MINUTES starts a new session. */
export const ledgerSessions = (ledgerDocs = []) => {
  const minutes = [...new Set(list(ledgerDocs).flatMap((doc) => list(doc?.minutes).map((minute) => Math.trunc(Number(minute)))).filter((minute) => Number.isFinite(minute) && minute > 0))]
    .sort((a, b) => a - b);
  const sessions = [];
  minutes.forEach((minute) => {
    const current = sessions[sessions.length - 1];
    if (current && minute - current.lastMinute <= SESSION_GAP_MINUTES) {
      current.lastMinute = minute;
      current.minutes += 1;
    } else {
      sessions.push({ firstMinute: minute, lastMinute: minute, minutes: 1 });
    }
  });
  return sessions.map((session) => ({
    startMs: session.firstMinute * 60000,
    endMs: session.lastMinute * 60000 + 59999,
    activeMinutes: session.minutes,
  }));
};

const earliest = (candidates) => candidates
  .filter((candidate) => Number.isFinite(candidate.atMs))
  .sort((a, b) => a.atMs - b.atMs)[0] || null;
const latest = (candidates) => candidates
  .filter((candidate) => Number.isFinite(candidate.atMs))
  .sort((a, b) => b.atMs - a.atMs)[0] || null;

/**
 * One assignment's completion and work pattern.
 *
 * `row` is the PR #401 assignment evidence row; `questions` its attempt-analysis
 * rows; the rest are that assignment's records. `undefined` for a source means
 * it was not loaded (said so), `[]` / `null` that it was loaded and empty.
 */
export const analyzeAssignmentCompletion = ({
  row,
  questions = [],
  attemptEvents = undefined,
  ledgerDocs = [],
  sessionSummaries = undefined,
  supportEvidence = [],
  practice = undefined,
  receipts = undefined,
  studentOverride = null,
  extensionGrants = undefined,
  recovery = null,
  challenge = null,
  nowValue = Date.now(),
} = {}) => {
  const now = Number(nowValue);
  const status = row?.status;
  // The student's own required questions: one their reduced-item-count
  // accommodation omitted was never theirs to start or finish.
  const required = list(questions).filter(isRequiredQuestion);
  const attempted = required.filter((question) => ![QUESTION_OUTCOME.NOT_ATTEMPTED, QUESTION_OUTCOME.SKIPPED].includes(question.outcome));
  const events = list(attemptEvents).filter((event) => clean(event?.performance?.status) !== 'unattempted');
  const eventTimes = events.map((event) => finite(event.occurredAt)).filter(Number.isFinite);
  const recordTimes = attempted.map((question) => question.lastAttemptAtMs).filter(Number.isFinite);
  const sessions = ledgerSessions(ledgerDocs);
  const availability = list(supportEvidence).filter((event) => clean(event?.assignmentId) === clean(row?.assignmentId) && ['available', 'provided'].includes(event?.eventType));
  const summaries = list(sessionSummaries);

  // Opened: only what some record proves.
  const openCandidates = [
    ...eventTimes.map((atMs) => ({ atMs, via: 'attempt-event', provenance: CASE_PROVENANCE.DIRECT })),
    ...recordTimes.map((atMs) => ({ atMs, via: 'question-record', provenance: CASE_PROVENANCE.DERIVED })),
    ...sessions.map((session) => ({ atMs: session.startMs, via: 'engagement-ledger', provenance: CASE_PROVENANCE.DIRECT })),
    ...summaries.map((summary) => ({ atMs: finite(summary.startedAt), via: 'session-summary', provenance: CASE_PROVENANCE.LEGACY })),
    ...availability.map((event) => ({ atMs: finite(event.occurredAtMs) ?? millis(event.occurredAt), via: 'support-availability', provenance: CASE_PROVENANCE.DIRECT })),
  ];
  const firstOpen = earliest(openCandidates);
  const openedRecorded = Boolean(firstOpen) || attempted.length > 0;
  const started = attempted.length > 0 || required.some((question) => question.viewed);

  // Completed on: the last recorded answer, when the gradebook calls it complete.
  const completed = status === 'completed';
  const lastAnswer = latest([
    ...eventTimes.map((atMs) => ({ atMs, provenance: CASE_PROVENANCE.DIRECT })),
    ...attempted.map((question) => ({ atMs: question.lastAttemptAtMs, provenance: question.lastAttemptTimeProvenance === CASE_PROVENANCE.DIRECT ? CASE_PROVENANCE.DERIVED : CASE_PROVENANCE.LEGACY })),
  ]);

  // Work days and resumption.
  const dayKeys = [...new Set([
    ...eventTimes,
    ...sessions.flatMap((session) => [session.startMs, session.endMs]),
  ].map((ms) => zonedDateKey(ms, SCHOOL_TIME_ZONE)))].sort();
  const timedEvidence = eventTimes.length > 0 || sessions.length > 0;

  // After the deadline.
  const dueAtMs = finite(row?.effectiveDueAtMs);
  const finalAtMs = finite(row?.effectiveFinalAtMs);
  const attemptsAfterDue = dueAtMs === null ? 0 : eventTimes.filter((atMs) => atMs > dueAtMs && (finalAtMs === null || atMs <= finalAtMs)).length;

  // Reopened: an attendance extension, a Recovery, a teacher DOL grant.
  //
  // Why a deadline moved is kept privately, one record per grant
  // (grades/{student}/attendanceExtensionGrants — shared/assignmentPrivacy.mjs);
  // the shared assignment keeps only the deadline and a stub. An extension
  // granted before that, and not yet migrated, still has its details on the
  // stub, so those are the fallback.
  const extension = studentOverride?.extension || null;
  const grants = list(extensionGrants)
    .filter((grant) => clean(grant?.assignmentId) === clean(row?.assignmentId))
    .map((grant) => ({
      grantedAtMs: finite(grant.grantedAtMs) ?? millis(grant.grantedAt),
      meetingsGranted: finite(grant.meetingsGranted),
      finalAtMs: millis(grant.lateDueAt),
    }))
    .sort((a, b) => (a.grantedAtMs ?? 0) - (b.grantedAtMs ?? 0));
  const latestGrant = grants.length ? grants[grants.length - 1] : null;
  const recoveries = Object.entries(recovery || {})
    .filter(([section, entry]) => ['warmup', 'dol'].includes(section) && entry && typeof entry === 'object')
    .map(([section, entry]) => ({
      section,
      status: clean(entry.status) || null,
      startedAtMs: millis(entry.startedAt),
      completedAtMs: millis(entry.completedAt),
      recordedScore: finite(entry.recordedScoreAtCompletion),
    }));
  const reopened = {
    attendanceExtension: studentOverride?.lateDueAt || extension || latestGrant
      ? {
        finalAtMs: finite(row?.attendanceFinalAtMs),
        grantedAtMs: latestGrant?.grantedAtMs ?? finite(extension?.grantedAt) ?? millis(extension?.grantedAt),
        meetingsGranted: latestGrant?.meetingsGranted ?? finite(extension?.meetingsGranted),
        // Every recorded grant, oldest first; empty when the history was not
        // loaded or the extension predates it.
        grants,
        source: grants.length ? 'grant-history' : 'assignment-stub',
        provenance: CASE_PROVENANCE.DIRECT,
      }
      : null,
    recoveries,
    warmupLiveChallenge: challenge && typeof challenge === 'object'
      ? { recordedAtMs: millis(challenge.recordedAt), roundsPlayed: finite(challenge.roundsPlayed), provenance: CASE_PROVENANCE.DIRECT }
      : null,
  };

  // Practice Mode: recorded activity, never recorded time.
  let practiceMode;
  if (practice === undefined) practiceMode = { loaded: false };
  else if (!practice) practiceMode = { loaded: true, recorded: false };
  else {
    practiceMode = {
      loaded: true,
      recorded: true,
      questionsPracticed: finite(practice.questionsPracticed) ?? 0,
      attempts: finite(practice.attempts) ?? 0,
      correct: finite(practice.correct) ?? 0,
      lastPracticeAtMs: finite(practice.lastPracticeAtMs),
      provenance: CASE_PROVENANCE.LEGACY,
      limitation: 'Practice Mode times come from the student\'s device clock.',
    };
  }

  const engagement = row?.engagement || {};
  const activity = [
    ...openCandidates,
    ...sessions.map((session) => ({ atMs: session.endMs, via: 'engagement-ledger', provenance: CASE_PROVENANCE.DIRECT })),
    ...summaries.map((summary) => ({ atMs: finite(summary.endedAt), via: 'session-summary', provenance: CASE_PROVENANCE.LEGACY })),
  ];
  const first = earliest(activity);
  const last = latest(activity);
  const releaseAtMs = finite(row?.releaseAtMs);

  return {
    assignmentId: clean(row?.assignmentId),
    title: clean(row?.title),
    status,
    statusLabel: row?.statusLabel || status,
    opened: openedRecorded
      ? { recorded: true, firstAtMs: firstOpen?.atMs ?? null, via: firstOpen?.via || 'question-record', provenance: firstOpen?.provenance || CASE_PROVENANCE.DERIVED }
      : { recorded: false, firstAtMs: null, via: null, provenance: CASE_PROVENANCE.NOT_RECORDED, note: 'No MathMaster record shows this assignment being opened. MathMaster does not record every open, so this is not evidence it was never opened.' },
    started,
    completed,
    incomplete: ['in-progress', 'closed-incomplete'].includes(status),
    missing: status === 'missing',
    excused: status === 'excused',
    late: row?.completedLate === true,
    completedAt: completed && lastAnswer
      ? { atMs: lastAnswer.atMs, provenance: lastAnswer.provenance, note: 'Time of the last recorded answer; MathMaster has no separate turn-in record.' }
      : null,
    workDays: dayKeys,
    resumed: timedEvidence ? dayKeys.length >= 2 : null,
    afterDeadline: {
      attemptsAfterDue,
      attemptsAfterDueKnown: attemptEvents !== undefined,
      notCountedAfterClose: receipts === undefined ? null : finite(receipts?.notCountedAfterClose) ?? 0,
      lastNotCountedAtMs: receipts === undefined ? null : finite(receipts?.lastNotCountedAtMs),
      lateActiveMinutes: engagement.source === 'ledger' ? finite(engagement.lateMinutes) ?? 0 : null,
    },
    reopened,
    practiceMode,
    sessions: {
      ledger: sessions,
      summaries: summaries.map((summary) => ({
        startedAtMs: finite(summary.startedAt),
        endedAtMs: finite(summary.endedAt),
        activeSeconds: finite(summary.activeSeconds),
        answered: finite(summary.answered),
        correct: finite(summary.correct),
        afterFinal: finalAtMs !== null && finite(summary.startedAt) !== null && finite(summary.startedAt) > finalAtMs,
      })),
      summariesLoaded: sessionSummaries !== undefined,
    },
    firstActivity: first ? { atMs: first.atMs, via: first.via, provenance: first.provenance } : null,
    lastActivity: last ? { atMs: last.atMs, via: last.via, provenance: last.provenance } : null,
    time: {
      activeMinutes: finite(engagement.activeMinutes),
      activeSource: engagement.source || 'none',
      activeProvenance: fromSupportProvenance(engagement.provenance),
      activeNote: engagement.note || '',
      elapsedMinutes: engagement.source === 'ledger' ? finite(engagement.elapsedMinutes) : null,
      windowDays: releaseAtMs !== null && finalAtMs !== null && finalAtMs > releaseAtMs ? Math.round(((finalAtMs - releaseAtMs) / DAY_MS) * 10) / 10 : null,
      practiceModeTime: 'not-recorded',
    },
    nowMs: now,
  };
};

/** Period totals over the assignment analyses. */
export const summarizeCompletion = (assignments = []) => {
  const rows = list(assignments);
  const count = (predicate) => rows.filter(predicate).length;
  const activity = rows.flatMap((row) => [row.firstActivity, row.lastActivity]).filter(Boolean);
  return {
    assigned: rows.length,
    openedRecorded: count((row) => row.opened.recorded),
    noOpenRecord: count((row) => !row.opened.recorded),
    started: count((row) => row.started),
    notStarted: count((row) => !row.started && !row.excused),
    completed: count((row) => row.completed),
    incomplete: count((row) => row.incomplete),
    missing: count((row) => row.missing),
    excused: count((row) => row.excused),
    completedLate: count((row) => row.late),
    resumed: count((row) => row.resumed === true),
    resumedDeterminable: count((row) => row.resumed !== null),
    reopened: count((row) => Boolean(row.reopened.attendanceExtension) || row.reopened.recoveries.length > 0),
    attendanceExtensions: count((row) => Boolean(row.reopened.attendanceExtension)),
    practiceModeAssignments: count((row) => row.practiceMode.recorded === true),
    practiceModeLoaded: rows.every((row) => row.practiceMode.loaded !== false),
    workSessions: rows.reduce((sum, row) => sum + row.sessions.ledger.length, 0),
    activeMinutesServer: rows.reduce((sum, row) => sum + (row.time.activeSource === 'ledger' ? row.time.activeMinutes || 0 : 0), 0),
    activeMinutesBrowser: rows.reduce((sum, row) => sum + (row.time.activeSource === 'legacy-browser' ? row.time.activeMinutes || 0 : 0), 0),
    timeNotRecorded: count((row) => row.started && row.time.activeMinutes === null),
    notCountedAfterClose: rows.reduce((sum, row) => sum + (row.afterDeadline.notCountedAfterClose || 0), 0),
    firstActivityMs: activity.length ? Math.min(...activity.map((entry) => entry.atMs)) : null,
    lastActivityMs: activity.length ? Math.max(...activity.map((entry) => entry.atMs)) : null,
  };
};

export default analyzeAssignmentCompletion;

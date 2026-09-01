import { LIVE_FLAGS, LIVE_SEVERITY } from '../../livePresence.js';

export const SUPPORT_EVENT_KIND = Object.freeze({
  WATCH_PRACTICE: 'watchPractice',
  SMALL_GROUP: 'smallGroup',
  PARENT_FOLLOW_UP: 'parentFollowUp',
  TEACHER_INTERVENTION: 'teacherIntervention',
  OFF_TASK_CONCERN: 'offTaskConcern',
  INTEGRITY_REVIEW: 'integrityReview',
  SIGNAL_DISMISSED: 'signalDismissed',
  RESOLVED: 'resolved',
});

export const SUPPORT_EVENT_STAGE = Object.freeze({
  SYSTEM_SIGNAL: 'systemSignal',
  TEACHER_CONFIRMED: 'teacherConfirmed',
  ACTION_TAKEN: 'actionTaken',
  DISMISSED: 'dismissed',
  RESOLVED: 'resolved',
});

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isIndependentRecord = (record = {}) => (
  record?.supportUsage?.isMathematicallyIndependent !== false
  && record?.supportUsage?.teacherAssisted !== true
  && record?.supportUsage?.hintUsed !== true
  && record?.supportUsage?.scaffoldUsed !== true
  && record?.supportUsage?.workedExampleUsed !== true
  && record?.supportUsage?.remediationUsed !== true
);

const questionDemand = (question = {}) => {
  const dok = Math.max(1, num(question.dok ?? question.cognitiveDemand?.dok, 1));
  const difficulty = Math.max(1, num(
    question.difficultyBand
      ?? question.difficulty
      ?? question.cognitiveDemand?.difficultyBand,
    1,
  ));
  const type = clean(question.type || question.toolId).toLowerCase();
  const constructed = [
    'functiongraph', 'modelinglab', 'relationshipmodel', 'equationinput',
    'stepalgebra2', 'systemsworkspace', 'sequenceexplorer', 'transformationslab',
  ].some((token) => type.includes(token));
  return { dok, difficulty, constructed };
};

/**
 * "Fast" is contextual, not one magic number. A DOK-1 recognition item and a
 * multi-step graphing/modeling task should never share the same threshold.
 *
 * These thresholds are deliberately conservative because they are only one
 * ingredient in an Integrity Review signal; speed alone never produces one.
 */
export const rapidCorrectThresholdSeconds = (question = {}) => {
  const { dok, difficulty, constructed } = questionDemand(question);
  if (constructed || dok >= 3 || difficulty >= 4) return 12;
  if (dok >= 2 || difficulty >= 3) return 8;
  return 5;
};

/**
 * Compact live response-timing summary. No response text, answer key, or raw
 * keystroke history leaves the student device.
 */
export const summarizeRapidCorrectness = ({
  questions = [],
  tracker = {},
  includedIndices = null,
} = {}) => {
  const indices = Array.isArray(includedIndices)
    ? includedIndices
    : list(questions).map((unused, index) => index);

  let answered = 0;
  let correct = 0;
  let rapidCorrect = 0;
  let rapidDeepCorrect = 0;
  let timedIndependentCorrect = 0;

  indices.forEach((index) => {
    const record = tracker?.[index] || {};
    const status = clean(record.status);
    if (!['correct', 'expired', 'incorrect'].includes(status)) return;
    answered += 1;
    if (status !== 'correct') return;
    correct += 1;

    const seconds = num(record.timeSpent, 0);
    if (seconds <= 0 || !isIndependentRecord(record)) return;
    timedIndependentCorrect += 1;

    const question = questions[index] || {};
    const threshold = rapidCorrectThresholdSeconds(question);
    if (seconds > threshold) return;

    rapidCorrect += 1;
    const demand = questionDemand(question);
    if (demand.dok >= 2 || demand.difficulty >= 3 || demand.constructed) {
      rapidDeepCorrect += 1;
    }
  });

  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    timedIndependentCorrect,
    rapidCorrect,
    rapidDeepCorrect,
    rapidShare: timedIndependentCorrect
      ? rapidCorrect / timedIndependentCorrect
      : 0,
  };
};

const profileMismatch = (profile = null) => {
  if (!profile?.baseline?.established) return false;
  // A broad "below level" label is not enough to corroborate an integrity
  // review. Students improve, and the label may summarize older/easier work.
  // Require established higher-demand evidence that directly contradicts the
  // current rapid higher-demand success pattern.
  const deepBuckets = [profile?.dokProfile?.['2'], profile?.dokProfile?.['3']]
    .filter((bucket) => bucket?.confident);
  if (!deepBuckets.length) return false;
  const attempts = deepBuckets.reduce((sum, bucket) => sum + num(bucket.attempts), 0);
  const weighted = deepBuckets.reduce(
    (sum, bucket) => sum + num(bucket.accuracy) * num(bucket.attempts),
    0,
  );
  return attempts >= 4 && (weighted / attempts) < 0.5;
};

/**
 * This never says "cheating". It says only that the combination of signals is
 * unusual enough for a teacher to review.
 *
 * False-positive protection:
 *  - speed alone is insufficient;
 *  - fewer than five terminal answers is insufficient;
 *  - even an extreme repeated speed pattern is still only speed, so it never
 *    stands alone;
 *  - a rapid pattern must be corroborated by repeated sustained focus loss or
 *    a large contradiction with established performance.
 */
export const buildIntegrityReviewSignal = ({ row = null, profile = null } = {}) => {
  if (!row?.live || !row.isOnline) return null;
  const live = row.live;
  const answered = num(live.answeredCount ?? row.counts?.answered);
  const accuracy = num(live.accuracy ?? row.counts?.accuracy, -1);
  const rapidCorrect = num(live.rapidCorrectCount);
  const rapidDeepCorrect = num(live.rapidDeepCorrectCount);
  const timedIndependentCorrect = num(live.timedIndependentCorrectCount);
  const rapidShare = timedIndependentCorrect > 0
    ? rapidCorrect / timedIndependentCorrect
    : num(live.rapidCorrectShare);
  const focusLossCount = num(live.focusLossCount);

  if (answered < 5 || accuracy < 80 || rapidCorrect < 3) return null;

  const strongRapidPattern = rapidCorrect >= 4 && rapidDeepCorrect >= 2 && rapidShare >= 0.6;
  const extremeRapidPattern = rapidCorrect >= 6 && rapidDeepCorrect >= 3 && rapidShare >= 0.75;
  const focusCorroboration = focusLossCount >= 3;
  const mismatchCorroboration = profileMismatch(profile);

  if (!(strongRapidPattern || extremeRapidPattern) || !(focusCorroboration || mismatchCorroboration)) {
    return null;
  }

  const reasons = [];
  if (strongRapidPattern || extremeRapidPattern) {
    reasons.push(`${rapidCorrect} unusually fast independent correct responses`);
  }
  if (rapidDeepCorrect >= 2) {
    reasons.push(`${rapidDeepCorrect} were on higher-demand items`);
  }
  if (focusCorroboration) {
    reasons.push(`${focusLossCount} focus-loss events during the session`);
  }
  if (mismatchCorroboration) {
    reasons.push('the pattern differs sharply from established performance');
  }

  return {
    kind: SUPPORT_EVENT_KIND.INTEGRITY_REVIEW,
    stage: SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL,
    label: 'Unusual response pattern — review',
    confidence: extremeRapidPattern ? 'strong-review-signal' : 'review-signal',
    reasons,
    evidence: {
      answered,
      accuracy,
      rapidCorrect,
      rapidDeepCorrect,
      timedIndependentCorrect,
      rapidShare: Number(rapidShare.toFixed(3)),
      focusLossCount,
      profileMismatch: mismatchCorroboration,
    },
  };
};

/**
 * After the student leaves the assignment, the rich live row is gone but the
 * compact server-owned session summary remains. Only the most extreme
 * response-timing pattern can surface from that summary by itself because the
 * server archive does not carry the student's full academic profile.
 *
 * This is still only "review recommended". It is never a cheating finding.
 */
export const buildArchivedIntegrityReviewSignal = (summary = {}) => {
  const answered = Math.max(0, num(summary.answered));
  const accuracy = num(summary.accuracy, -1);
  const rapidCorrect = Math.max(0, num(summary.rapidCorrectCount));
  const rapidDeepCorrect = Math.max(0, num(summary.rapidDeepCorrectCount));
  const timedIndependentCorrect = Math.max(0, num(summary.timedIndependentCorrectCount));
  const rapidShare = timedIndependentCorrect > 0
    ? rapidCorrect / timedIndependentCorrect
    : 0;

  const focusLossCount = Math.max(0, num(summary.focusLossCount));
  if (
    answered < 6
    || accuracy < 80
    || timedIndependentCorrect < 6
    || rapidCorrect < 6
    || rapidDeepCorrect < 3
    || rapidShare < 0.75
    // The archive does not carry the student's full profile, so it can only
    // corroborate timing with repeated sustained focus loss. Without that
    // second signal the pattern stays unflagged.
    || focusLossCount < 3
  ) return null;

  return {
    kind: SUPPORT_EVENT_KIND.INTEGRITY_REVIEW,
    stage: SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL,
    label: 'Unusual response pattern — review',
    confidence: 'strong-review-signal',
    reasons: [
      `${rapidCorrect} unusually fast independent correct responses`,
      `${rapidDeepCorrect} were on higher-demand items`,
      'the pattern remained extreme across the archived session',
    ],
    evidence: {
      answered,
      accuracy,
      rapidCorrect,
      rapidDeepCorrect,
      timedIndependentCorrect,
      rapidShare: Number(rapidShare.toFixed(3)),
      focusLossCount,
      archivedSession: true,
    },
  };
};

const hasFlag = (row, flag) => list(row?.flags).includes(flag);
const recent = (event, nowValue, days = 7) => {
  const time = Date.parse(event?.createdAt || event?.recordedAt || '') || num(event?.createdAtMs);
  return time > 0 && nowValue - time <= days * 86400000;
};

export const buildWatchPracticeList = ({
  rows = [],
  profilesByStudentId = {},
  supportEvents = [],
  nowValue = Date.now(),
  maxStudents = 6,
} = {}) => {
  const latestWatchAt = new Map();
  const latestResolvedAt = new Map();
  list(supportEvents)
    .filter((event) => recent(event, nowValue, 7))
    .forEach((event) => {
      const at = Date.parse(event.createdAt || event.recordedAt || '') || num(event.createdAtMs);
      if (!event.studentId || !at) return;
      if (event.kind === SUPPORT_EVENT_KIND.WATCH_PRACTICE
        && event.stage !== SUPPORT_EVENT_STAGE.DISMISSED) {
        latestWatchAt.set(event.studentId, Math.max(latestWatchAt.get(event.studentId) || 0, at));
      }
      if (event.kind === SUPPORT_EVENT_KIND.RESOLVED
        && event.stage === SUPPORT_EVENT_STAGE.RESOLVED) {
        latestResolvedAt.set(event.studentId, Math.max(latestResolvedAt.get(event.studentId) || 0, at));
      }
    });
  const pinned = new Set(
    [...latestWatchAt.entries()]
      .filter(([studentId, at]) => at > (latestResolvedAt.get(studentId) || 0))
      .map(([studentId]) => studentId),
  );

  return list(rows)
    .filter((row) => row?.id && row.isOnline && !hasFlag(row, LIVE_FLAGS.OFFLINE))
    .map((row) => {
      const profile = profilesByStudentId[row.id] || null;
      const integrity = buildIntegrityReviewSignal({ row, profile });
      let score = pinned.has(row.id) ? 4 : 0;
      const reasons = [];

      if (pinned.has(row.id)) reasons.push('teacher watch-list');
      if (hasFlag(row, LIVE_FLAGS.STUCK)) { score += 5; reasons.push('repeated attempts'); }
      if (hasFlag(row, LIVE_FLAGS.STRUGGLING)) { score += 4; reasons.push('accuracy well below class'); }
      if (hasFlag(row, LIVE_FLAGS.BEHIND_PACE)) { score += 2; reasons.push('well behind class pace'); }
      if (hasFlag(row, LIVE_FLAGS.IDLE)) { score += 2; reasons.push('extended inactivity'); }
      if (integrity) { score += 4; reasons.push('unusual response pattern'); }

      const dok2 = profile?.dokProfile?.['2'];
      const dok3 = profile?.dokProfile?.['3'];
      const reasoningWeak = [dok2, dok3].some((bucket) => (
        bucket?.confident && num(bucket.accuracy, 1) < 0.5
      ));
      if (reasoningWeak) { score += 2; reasons.push('established reasoning gap'); }

      return {
        studentId: row.id,
        studentName: row.name,
        score,
        reasons: [...new Set(reasons)],
        integrity,
        row,
      };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName))
    .slice(0, Math.max(1, maxStudents));
};

const SMALL_GROUP_LABELS = Object.freeze({
  foundationGap: 'Prerequisite / foundation bridge',
  reasoningGap: 'Reasoning and interpretation',
  retentionSlipping: 'Retention rebuild',
  belowLevel: 'Course-access support',
});

export const buildSuggestedSmallGroups = ({
  needsAttention = [],
  maxGroups = 4,
} = {}) => {
  const byKey = new Map();

  list(needsAttention)
    .filter((alert) => alert?.kind === 'academic')
    .forEach((alert) => {
      const students = alert.studentId
        ? [{ studentId: alert.studentId, studentName: alert.studentName }]
        : list(alert.students);
      if (!students.length) return;
      const key = `${clean(alert.classId)}::${clean(alert.rule)}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          classId: alert.classId || null,
          rule: alert.rule,
          label: SMALL_GROUP_LABELS[alert.rule] || alert.headline || 'Targeted support',
          students: new Map(),
          detail: alert.detail || '',
        });
      }
      const group = byKey.get(key);
      students.forEach((student) => {
        if (student?.studentId) group.students.set(student.studentId, student);
      });
    });

  return [...byKey.values()]
    .map((group) => ({
      ...group,
      students: [...group.students.values()],
    }))
    .filter((group) => group.students.length >= 2)
    .sort((a, b) => b.students.length - a.students.length || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, maxGroups));
};

const eventDateKey = (event) => {
  const raw = event?.createdAt || event?.recordedAt || '';
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
};

export const sessionProductivitySignal = (summary = {}, {
  peerSummaries = null,
} = {}) => {
  const startedAt = num(summary.startedAt);
  const endedAt = num(summary.endedAt);
  const elapsedSeconds = Math.max(0, (endedAt - startedAt) / 1000);
  const activeSeconds = Math.max(0, num(summary.activeSeconds));
  const activeRatio = elapsedSeconds > 0 ? Math.min(1, activeSeconds / elapsedSeconds) : null;
  const answered = Math.max(0, num(summary.answered));
  const focusLossCount = Math.max(0, num(summary.focusLossCount));
  const role = clean(summary.activityRole).toLowerCase();

  // Ten minutes gives enough room for reading, teacher talk and paper work.
  // Even then, low platform activity alone is not enough. It must be paired
  // with little assignment progress or repeated focus loss, and it is still
  // only a "review" signal until a teacher confirms what they observed.
  if (elapsedSeconds < 600 || !['classwork', 'practice'].includes(role)) return null;
  if (activeRatio == null || activeRatio >= 0.45) return null;
  if (!(answered <= 2 || focusLossCount >= 3)) return null;

  let activePeerCount = null;
  if (Array.isArray(peerSummaries)) {
    const assignmentId = clean(summary.assignmentId);
    activePeerCount = peerSummaries.filter((peer) => {
      if (!peer || clean(peer.studentId) === clean(summary.studentId)) return false;
      if (assignmentId && clean(peer.assignmentId) !== assignmentId) return false;
      const peerStart = num(peer.startedAt);
      const peerEnd = num(peer.endedAt);
      const overlapSeconds = Math.max(
        0,
        (Math.min(endedAt, peerEnd) - Math.max(startedAt, peerStart)) / 1000,
      );
      if (overlapSeconds < 300) return false;

      const peerElapsed = Math.max(0, (peerEnd - peerStart) / 1000);
      const peerActiveRatio = peerElapsed > 0
        ? Math.min(1, Math.max(0, num(peer.activeSeconds)) / peerElapsed)
        : 0;
      return peerActiveRatio >= 0.55 || num(peer.answered) >= 4;
    }).length;

    // If the rest of the class was not demonstrably working in MathMaster at
    // the same time, do not infer low productivity from quiet telemetry. The
    // teacher may have been explaining, conferencing, or using paper.
    if (activePeerCount < 2) return null;
  }

  return {
    kind: 'productivityReview',
    label: 'Low-productivity session — review',
    evidence: {
      elapsedSeconds: Math.round(elapsedSeconds),
      activeSeconds: Math.round(activeSeconds),
      activeRatio: Number(activeRatio.toFixed(3)),
      answered,
      focusLossCount,
      activePeerCount,
      assignmentId: summary.assignmentId || null,
      activityRole: role,
    },
  };
};

export const buildParentFollowUpCandidates = ({
  needsAttention = [],
  supportEvents = [],
  sessionSummaries = [],
  nowValue = Date.now(),
} = {}) => {
  const map = new Map();
  const ensure = (studentId, studentName = studentId) => {
    if (!studentId) return null;
    if (!map.has(studentId)) {
      map.set(studentId, {
        studentId,
        studentName: studentName || studentId,
        completionSignals: [],
        confirmedProductivityDays: new Set(),
        systemProductivityDays: new Set(),
        systemProductivitySignals: [],
        manualParentFollowUp: false,
        recentParentContact: false,
      });
    }
    return map.get(studentId);
  };

  list(needsAttention).forEach((alert) => {
    if (!alert?.studentId || !['weeklyPathBehind', 'engagementFollowUp'].includes(alert.rule)) return;
    const entry = ensure(alert.studentId, alert.studentName);
    entry.completionSignals.push(alert.headline || alert.rule);
  });

  list(supportEvents)
    .filter((event) => recent(event, nowValue, 14))
    .forEach((event) => {
      const entry = ensure(event.studentId, event.studentName);
      if (!entry) return;
      if (
        event.kind === SUPPORT_EVENT_KIND.OFF_TASK_CONCERN
        && [SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED, SUPPORT_EVENT_STAGE.ACTION_TAKEN].includes(event.stage)
      ) {
        const day = eventDateKey(event);
        if (day) entry.confirmedProductivityDays.add(day);
      }
      if (
        event.kind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP
        && event.stage === SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED
      ) {
        entry.manualParentFollowUp = true;
      }
      if (
        event.kind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP
        && event.stage === SUPPORT_EVENT_STAGE.ACTION_TAKEN
        && recent(event, nowValue, 7)
      ) {
        entry.recentParentContact = true;
      }
    });

  list(sessionSummaries)
    .filter((summary) => {
      const endedAt = num(summary?.endedAt);
      return endedAt > 0 && nowValue - endedAt <= 14 * 86400000;
    })
    .forEach((summary) => {
      const signal = sessionProductivitySignal(summary, { peerSummaries: sessionSummaries });
      if (!signal) return;
      const entry = ensure(summary.studentId, summary.studentName);
      if (!entry) return;
      const day = summary.endedAt ? new Date(Number(summary.endedAt)).toISOString().slice(0, 10) : null;
      if (day) entry.systemProductivityDays.add(day);
      entry.systemProductivitySignals.push({
        day,
        assignmentId: summary.assignmentId || null,
        evidence: signal.evidence,
      });
    });

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      confirmedProductivityDays: [...entry.confirmedProductivityDays],
      systemProductivityDays: [...entry.systemProductivityDays],
      score: entry.completionSignals.length
        + entry.confirmedProductivityDays.size * 3
        + entry.systemProductivityDays.size
        + (entry.manualParentFollowUp ? 4 : 0),
    }))
    .filter((entry) => {
      if (entry.recentParentContact) return false;
      // A teacher can explicitly add a student to follow-up from Live Class.
      // Otherwise a parent list should never be generated from platform
      // telemetry alone: it needs teacher-confirmed productivity evidence.
      if (entry.manualParentFollowUp) return true;
      if (entry.confirmedProductivityDays.length >= 2) return true;
      if (entry.confirmedProductivityDays.length >= 1
        && (entry.completionSignals.length >= 1 || entry.systemProductivityDays.length >= 1)) return true;
      return false;
    })
    .sort((a, b) => b.score - a.score || a.studentName.localeCompare(b.studentName));
};

export const supportSessionKey = ({
  studentId,
  assignmentId,
  startedAt,
} = {}) => {
  const student = clean(studentId);
  const assignment = clean(assignmentId);
  const start = num(startedAt);
  if (!student || !assignment || !start) return null;
  // Must stay byte-for-byte compatible with functions/lib/studentSessionSummary.js.
  return `${student}|${assignment}|${start}`;
};

export const supportEventSignalKey = ({
  kind,
  studentId,
  classId = null,
  assignmentId = null,
  sessionKey = null,
  dayKey = null,
} = {}) => [
  clean(kind),
  clean(studentId),
  clean(classId),
  clean(assignmentId),
  clean(sessionKey),
  clean(dayKey),
].join('|');

export const supportEventIsActive = (event = {}) => (
  ![SUPPORT_EVENT_STAGE.DISMISSED, SUPPORT_EVENT_STAGE.RESOLVED].includes(event.stage)
);

export const hasDismissedSignal = ({
  supportEvents = [],
  studentId,
  assignmentId = null,
  sessionKey = null,
  afterMs = 0,
} = {}) => list(supportEvents).some((event) => {
  if (event.kind !== SUPPORT_EVENT_KIND.SIGNAL_DISMISSED || event.stage !== SUPPORT_EVENT_STAGE.DISMISSED) return false;
  if (clean(event.studentId) !== clean(studentId)) return false;
  if (sessionKey && event.sessionKey) return clean(event.sessionKey) === clean(sessionKey);
  if (assignmentId && event.assignmentId && clean(event.assignmentId) !== clean(assignmentId)) return false;
  const at = Date.parse(event.createdAt || event.recordedAt || '') || num(event.createdAtMs);
  return !afterMs || at >= afterMs;
});

export const SUPPORT_STAGE_LABEL = Object.freeze({
  [SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL]: 'System signal — not teacher-confirmed',
  [SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED]: 'Teacher reviewed / confirmed',
  [SUPPORT_EVENT_STAGE.ACTION_TAKEN]: 'Action taken',
  [SUPPORT_EVENT_STAGE.DISMISSED]: 'Teacher reviewed / dismissed',
  [SUPPORT_EVENT_STAGE.RESOLVED]: 'Resolved',
});

export const SUPPORT_EVENT_LABEL = Object.freeze({
  [SUPPORT_EVENT_KIND.WATCH_PRACTICE]: 'Watch Practice',
  [SUPPORT_EVENT_KIND.SMALL_GROUP]: 'Small Group',
  [SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP]: 'Parent Follow-Up',
  [SUPPORT_EVENT_KIND.TEACHER_INTERVENTION]: 'Teacher Intervention',
  [SUPPORT_EVENT_KIND.OFF_TASK_CONCERN]: 'Productivity / Off-Task Concern',
  [SUPPORT_EVENT_KIND.INTEGRITY_REVIEW]: 'Integrity Review',
  [SUPPORT_EVENT_KIND.SIGNAL_DISMISSED]: 'Signal Dismissed',
  [SUPPORT_EVENT_KIND.RESOLVED]: 'Resolved',
});

export const liveRowNeedsAttention = (row = {}) => (
  row.severity === LIVE_SEVERITY.ALERT || row.severity === LIVE_SEVERITY.WATCH
);

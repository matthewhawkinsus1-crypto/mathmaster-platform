import { ENGAGEMENT, INSTRUCTIONAL_BAND } from '../profile/studentLearningProfile.js';

/*
 * ONE QUEUE, AND A HIGH BAR FOR ENTERING IT.
 *
 * A teacher command centre is only useful if the teacher believes it. The way
 * these screens fail is not by missing things — it is by crying wolf until the
 * teacher stops reading, at which point the one alert that mattered is buried
 * under forty that did not. So the governing constraint here is not coverage,
 * it is restraint:
 *
 *   A single wrong question must never produce an alert.
 *
 * Every academic rule below therefore has an evidence floor, and none of them
 * fire until the Student Learning Profile has actually established a baseline.
 * Until then the honest statement is "we don't know yet", and "we don't know
 * yet" is not something to interrupt a teacher about.
 *
 * THREE KINDS, KEPT APART.
 *
 * Academic, completion and system alerts are different claims about different
 * things, and collapsing them is how a platform tells a teacher that a strong
 * student who missed a week is failing mathematics. A student can be Above
 * Level and Needs Follow-Up at the same time; both are true, neither implies
 * the other, and the queue says so.
 *
 * ROLL-UP RATHER THAN REPEAT.
 *
 * Nine students behind on Weekly Path is one fact about the class, not nine
 * facts about nine children. When a rule catches a large enough share of a
 * class, the per-student alerts collapse into a single class alert that still
 * names who is in it. This is the difference between a queue a teacher works
 * through and a list they scroll past.
 */

export const ALERT_KIND = Object.freeze({
  ACADEMIC: 'academic',
  COMPLETION: 'completion',
  SYSTEM: 'system',
});

export const ALERT_KIND_LABEL = Object.freeze({
  [ALERT_KIND.ACADEMIC]: 'Academic',
  [ALERT_KIND.COMPLETION]: 'Completion',
  [ALERT_KIND.SYSTEM]: 'System',
});

export const URGENCY = Object.freeze({
  NOW: 'now',
  TODAY: 'today',
  THIS_WEEK: 'thisWeek',
});

export const URGENCY_LABEL = Object.freeze({
  [URGENCY.NOW]: 'Now',
  [URGENCY.TODAY]: 'Today',
  [URGENCY.THIS_WEEK]: 'This week',
});

const URGENCY_RANK = Object.freeze({
  [URGENCY.NOW]: 0,
  [URGENCY.TODAY]: 1,
  [URGENCY.THIS_WEEK]: 2,
});

/**
 * The evidence floors. Named, exported and adjustable, because they are a
 * professional judgement about when a pattern is real — not a constant of
 * nature — and a district that disagrees should be able to see the number they
 * are disagreeing with.
 */
export const THRESHOLDS = Object.freeze({
  // No academic alert about a student the profile has not classified.
  requireEstablishedBaseline: true,
  // A DOK or difficulty bucket is a rumour below this many attempts.
  minAttemptsPerBucket: 4,
  // How wrong a bucket has to be before it is a finding.
  strugglingAccuracy: 0.5,
  // A retention alert needs enough scheduled reviews to mean something.
  minRetentionSchedules: 4,
  retentionAtRisk: 0.5,
  // Below this share of the required weekly sessions, with the week more than
  // half gone.
  weeklyShortfall: 0.5,
  weekFractionBeforeNagging: 0.5,
  // The share of a class a rule must catch before per-student alerts collapse
  // into one class alert.
  rollUpShare: 0.34,
  minRollUpStudents: 3,
});

const list = (value) => (Array.isArray(value) ? value : []);
const pct = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

/* -------------------------------------------------------------------------- */
/* Academic rules                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Academic findings for one student.
 *
 * Every rule here answers the same question in a different way: is there
 * something about this student's mathematics that the teacher would want to act
 * on this week? Not "did they get something wrong" — that is a Tuesday, not an
 * alert.
 */
export const academicFindingsFor = ({ studentId, studentName, profile, classId = null }) => {
  const findings = [];
  if (!profile) return findings;
  if (THRESHOLDS.requireEstablishedBaseline && !profile.baseline?.established) return findings;

  const push = (rule, urgency, headline, detail) => findings.push({
    id: `${rule}:${studentId}`,
    rule,
    kind: ALERT_KIND.ACADEMIC,
    urgency,
    classId,
    studentId,
    studentName,
    headline,
    detail,
  });

  // A confirmed prerequisite gap is a statement about access to the course. It
  // outranks everything else because no amount of grade-level practice fixes it.
  if (Number(profile.foundationGapDepth) >= 2) {
    push(
      'foundationGap',
      URGENCY.THIS_WEEK,
      'Prerequisite gaps are blocking grade-level work',
      `${studentName} has confirmed gaps ${profile.foundationGapDepth} levels below this course. Foundation Bridge work is already in their weekly path; a short conference would help more than another grade-level assignment.`,
    );
  } else if (profile.instructionalBand === INSTRUCTIONAL_BAND.BELOW) {
    push(
      'belowLevel',
      URGENCY.THIS_WEEK,
      'Working below the course expectation',
      `Nothing is holding steadily at the independent course band yet. Based on ${profile.baseline?.events || 0} pieces of evidence across ${profile.skillsWithEvidence || 0} skills.`,
    );
  }

  // CAN COMPUTE, CANNOT REASON — the finding that difficulty alone cannot see.
  // A student fluent at DOK 1 and failing at DOK 2/3 does not need easier
  // numbers; they need a different kind of question, and this is the only place
  // that distinction is visible.
  const dok1 = profile.dokProfile?.['1'];
  const deeper = [profile.dokProfile?.['2'], profile.dokProfile?.['3']]
    .filter((bucket) => bucket && bucket.attempts >= THRESHOLDS.minAttemptsPerBucket);
  const deeperAttempts = deeper.reduce((sum, bucket) => sum + bucket.attempts, 0);
  const deeperCorrect = deeper.reduce((sum, bucket) => sum + (bucket.accuracy * bucket.attempts), 0);
  const deeperAccuracy = deeperAttempts ? deeperCorrect / deeperAttempts : null;
  if (
    dok1 && dok1.attempts >= THRESHOLDS.minAttemptsPerBucket && dok1.accuracy >= 0.8
    && deeperAccuracy != null && deeperAccuracy < THRESHOLDS.strugglingAccuracy
  ) {
    push(
      'reasoningGap',
      URGENCY.THIS_WEEK,
      'Procedures are secure; reasoning is not',
      `${pct(dok1.accuracy)} at recall and procedure, ${pct(deeperAccuracy)} when the question asks for reasoning (${deeperAttempts} attempts). Easier numbers will not help here — this needs a different kind of question.`,
    );
  }

  // Mastered once, slipping now. Worth catching because it is invisible in any
  // view that only looks at current work.
  const retention = Number(profile.retentionStrength);
  // Read straight off the profile. This used to fall back to
  // `profile.retentionSchedules`, a field that does not exist — so the count was
  // always 0, the threshold was never met, and this alert could not fire for
  // anybody. It passed its unit test the whole time, because the fixture
  // supplied the number the real profile did not.
  const schedules = Number(profile.retentionScheduleCount) || 0;
  if (
    Number.isFinite(retention) && retention < THRESHOLDS.retentionAtRisk
    && schedules >= THRESHOLDS.minRetentionSchedules
  ) {
    push(
      'retentionSlipping',
      URGENCY.THIS_WEEK,
      'Previously mastered skills are slipping',
      `Only ${pct(retention)} of what this student had mastered is still holding. Retention practice is scheduled, but a check-in would confirm whether it is the skill or the recall that has gone.`,
    );
  }

  return findings;
};

/* -------------------------------------------------------------------------- */
/* Completion rules                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Completion findings for one student.
 *
 * These are deliberately a separate kind with separate wording. Unanswered work
 * is MISSING evidence, not wrong evidence, and the moment a queue lets the two
 * blur, a strong student who was absent starts reading as a struggling one.
 */
export const completionFindingsFor = ({
  studentId, studentName, profile, classId = null, weekly = null, weekFraction = 1,
}) => {
  const findings = [];
  const push = (rule, urgency, headline, detail) => findings.push({
    id: `${rule}:${studentId}`,
    rule,
    kind: ALERT_KIND.COMPLETION,
    urgency,
    classId,
    studentId,
    studentName,
    headline,
    detail,
  });

  if (weekly && Number(weekly.goal) > 0 && weekFraction >= THRESHOLDS.weekFractionBeforeNagging) {
    const share = Number(weekly.complete || 0) / Number(weekly.goal);
    if (share < THRESHOLDS.weeklyShortfall) {
      push(
        'weeklyPathBehind',
        weekly.overdue ? URGENCY.TODAY : URGENCY.THIS_WEEK,
        'Behind on this week’s learning path',
        `${weekly.complete || 0} of ${weekly.goal} sessions done${weekly.overdue ? ', and the week’s work is now overdue' : ''}. This is a completion gap, not a performance one${
          profile?.instructionalBand === INSTRUCTIONAL_BAND.ABOVE
            ? ' — this student is working above the course expectation when they do engage.'
            : '.'
        }`,
      );
    }
  }

  if (profile?.engagement === ENGAGEMENT.NEEDS_FOLLOW_UP) {
    push(
      'engagementFollowUp',
      URGENCY.THIS_WEEK,
      'Not finishing enough work to read',
      'Too little completed work to say anything about this student’s mathematics. The first thing to fix is engagement, not rigor.',
    );
  }

  return findings;
};

/* -------------------------------------------------------------------------- */
/* System rules                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Findings about the platform itself, not about a child.
 *
 * These belong in the same queue because a teacher who does not know their data
 * is incomplete will act on it anyway.
 */
export const systemFindings = ({
  unplaceable = [], weeklyProgressTruncated = false, classCount = 0,
} = {}) => {
  const findings = [];
  const push = (rule, urgency, headline, detail) => findings.push({
    id: rule, rule, kind: ALERT_KIND.SYSTEM, urgency, headline, detail, classId: null, studentId: null,
  });

  if (!classCount) {
    push(
      'noClasses',
      URGENCY.TODAY,
      'No classes have been created yet',
      'Rosters, pacing, grades and weekly goals all belong to a class. Until one exists, every screen is guessing from class period labels.',
    );
  }

  if (unplaceable.length) {
    push(
      'unplaceableStudents',
      URGENCY.TODAY,
      `${unplaceable.length} student${unplaceable.length === 1 ? '' : 's'} on no class roster`,
      `${unplaceable.map((student) => student.displayName || student.id).slice(0, 6).join(', ')}${unplaceable.length > 6 ? ` and ${unplaceable.length - 6} more` : ''}. Their class period is used by more than one class, so MathMaster cannot tell which one they belong to.`,
    );
  }

  if (weeklyProgressTruncated) {
    push(
      'weeklyProgressTruncated',
      URGENCY.NOW,
      'This week’s path activity could not be read in full',
      'Completion counts and weekly path grades may be lower than the real figures. Do not publish weekly grades until this is resolved.',
    );
  }

  return findings;
};

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

const rollUp = (findings, classSizes) => {
  const byRuleAndClass = new Map();
  findings.forEach((finding) => {
    if (!finding.studentId) return;
    const key = `${finding.rule}::${finding.classId || ''}`;
    if (!byRuleAndClass.has(key)) byRuleAndClass.set(key, []);
    byRuleAndClass.get(key).push(finding);
  });

  const absorbed = new Set();
  const classAlerts = [];
  byRuleAndClass.forEach((group, key) => {
    const [rule, classId] = key.split('::');
    const size = Number(classSizes?.[classId]) || 0;
    const share = size ? group.length / size : 0;
    if (group.length < THRESHOLDS.minRollUpStudents || share < THRESHOLDS.rollUpShare) return;
    group.forEach((finding) => absorbed.add(finding.id));
    const sample = group[0];
    classAlerts.push({
      id: `class:${key}`,
      rule,
      kind: sample.kind,
      urgency: group.some((finding) => finding.urgency === URGENCY.TODAY) ? URGENCY.TODAY : sample.urgency,
      classId: classId || null,
      studentId: null,
      // A class alert that does not name the students is a statistic. The
      // teacher still has to know who to talk to.
      students: group.map((finding) => ({ studentId: finding.studentId, studentName: finding.studentName })),
      headline: `${group.length} of ${size} students · ${sample.headline.toLowerCase()}`,
      detail: `This is a pattern across the class rather than a handful of individuals, which usually means the instruction needs adjusting before the students do. ${sample.detail}`,
    });
  });

  return [...classAlerts, ...findings.filter((finding) => !absorbed.has(finding.id))];
};

/**
 * The whole queue: one ranked, deduplicated, rolled-up list.
 *
 * Ranking is urgency first, then breadth (a class alert outranks one student),
 * then kind — academic before completion before system, because an academic
 * finding is about a child's mathematics and the other two are about
 * circumstances. Within a tie, alphabetical by student, so the list does not
 * reshuffle itself every render and a teacher can find where they left off.
 */
export const buildNeedsAttentionQueue = ({
  students = [],
  profilesByStudentId = {},
  weeklyByStudentId = {},
  classSizes = {},
  unplaceable = [],
  weeklyProgressTruncated = false,
  classCount = 0,
  weekFraction = 1,
} = {}) => {
  const perStudent = [];
  list(students).forEach((student) => {
    const shared = {
      studentId: student.id,
      studentName: student.displayName || student.name || String(student.id),
      profile: profilesByStudentId[student.id] || null,
      classId: student.classId || null,
    };
    perStudent.push(...academicFindingsFor(shared));
    perStudent.push(...completionFindingsFor({
      ...shared,
      weekly: weeklyByStudentId[student.id] || null,
      weekFraction,
    }));
  });

  const queue = [
    ...rollUp(perStudent, classSizes),
    ...systemFindings({ unplaceable, weeklyProgressTruncated, classCount }),
  ];

  const kindRank = { [ALERT_KIND.ACADEMIC]: 0, [ALERT_KIND.COMPLETION]: 1, [ALERT_KIND.SYSTEM]: 2 };
  return queue.sort((a, b) => (
    URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
    || (b.students ? 1 : 0) - (a.students ? 1 : 0)
    || kindRank[a.kind] - kindRank[b.kind]
    || String(a.studentName || a.headline).localeCompare(String(b.studentName || b.headline))
  ));
};

/**
 * Narrow the queue. Every filter is an AND, and an unset filter is not a filter.
 */
export const filterQueue = (queue = [], {
  classId = null, kind = null, urgency = null, studentId = null, search = '',
} = {}) => {
  const needle = String(search || '').trim().toLowerCase();
  return list(queue).filter((alert) => {
    if (classId && alert.classId !== classId) return false;
    if (kind && alert.kind !== kind) return false;
    if (urgency && alert.urgency !== urgency) return false;
    if (studentId) {
      const named = alert.studentId === studentId
        || list(alert.students).some((entry) => entry.studentId === studentId);
      if (!named) return false;
    }
    if (needle) {
      const haystack = [
        alert.headline, alert.detail, alert.studentName,
        ...list(alert.students).map((entry) => entry.studentName),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
};

/** Counts for the filter chips, so a teacher can see what is behind each one. */
export const summarizeQueue = (queue = []) => {
  const counts = { total: list(queue).length, byKind: {}, byUrgency: {} };
  Object.values(ALERT_KIND).forEach((value) => { counts.byKind[value] = 0; });
  Object.values(URGENCY).forEach((value) => { counts.byUrgency[value] = 0; });
  list(queue).forEach((alert) => {
    counts.byKind[alert.kind] = (counts.byKind[alert.kind] || 0) + 1;
    counts.byUrgency[alert.urgency] = (counts.byUrgency[alert.urgency] || 0) + 1;
  });
  return counts;
};

export default buildNeedsAttentionQueue;

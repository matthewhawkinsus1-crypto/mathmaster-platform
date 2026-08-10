// The nearby learning map a student actually sees.
//
// The engine returns every skill in the course, classified — roughly fifty rows
// for Algebra I. A dependency graph of fifty nodes is not a learning path; it is
// a diagram. This file selects the handful around where the student is standing
// and arranges them into the four things a student needs to know:
//
//   what am I working on now
//   what else can I choose right now
//   what is coming, and when
//   what is blocked, and what would unblock it
//
// It NEVER re-ranks and never re-classifies. Every status, score, day count and
// sentence comes from the engine output it is handed, which is the same object
// Recommended for You is built from — that is what makes it impossible for the
// panel and the map to disagree about the same skill.

import { STATUS, explainForStudent } from './recommendationEngine.js';
import { describeSkill } from './skillGraph.js';

export const PATH_MARK = Object.freeze({
  [STATUS.REQUIRED]: { symbol: '★', label: 'Assigned', tone: '#a50e0e' },
  [STATUS.PRIORITY]: { symbol: '★', label: 'Teacher priority', tone: '#b06000' },
  [STATUS.RECOMMENDED]: { symbol: '★', label: 'Recommended', tone: '#137333' },
  [STATUS.REMEDIATION]: { symbol: '↑', label: 'Strengthen', tone: '#b06000' },
  [STATUS.AVAILABLE]: { symbol: '●', label: 'Ready', tone: '#1a73e8' },
  [STATUS.EXTENSION]: { symbol: '◆', label: 'Challenge', tone: '#8430ce' },
  [STATUS.MASTERED]: { symbol: '✓', label: 'Mastered', tone: '#1e8e3e' },
  [STATUS.FUTURE]: { symbol: '○', label: 'Coming up', tone: '#5f6368' },
  [STATUS.LOCKED]: { symbol: '🔒', label: 'Needs support first', tone: '#5f6368' },
});

// A skill MathMaster does not have practice content for yet.
//
// Shown rather than hidden, deliberately: a student seeing the shape of the
// course is worth something, and half a wheel reading "Coming soon" is how an
// administrator discovers a content problem the same day rather than in March.
// It is not a door, and it never shows the student a bank error.
export const CONTENT_PENDING_MARK = Object.freeze({
  symbol: '◌', label: 'Coming soon', tone: '#7a4f00',
});

const mark = (status) => PATH_MARK[status] || { symbol: '●', label: 'Available', tone: '#5f6368' };

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Why a locked skill is locked, in a sentence a student can act on.
 *
 * Deliberately not the graph language. "prerequisite_severe_gap on
 * texas:A.5A" is true and useless; "Strengthen A.5A first" is the same fact
 * expressed as the next thing to do.
 */
export const explainLock = (row) => {
  const target = row?.remediationTarget || list(row?.unmetPrerequisites)[0] || null;
  if (!target) return 'This is not open yet.';
  const described = describeSkill(target);
  return `Strengthen ${described.shortLabel || target} first — this skill builds on it.`;
};

const toPathNode = (row, extra = {}) => {
  if (!row) return null;
  const described = describeSkill(row.skillId);
  return {
    skillId: row.skillId,
    code: described.code || null,
    title: described.shortLabel || row.skillId,
    description: (described.label || '').split(' — ').slice(1).join(' — '),
    status: row.status,
    symbol: mark(row.status).symbol,
    statusLabel: mark(row.status).label,
    tone: mark(row.status).tone,
    // Straight from the engine: the countdown, the "your class is working on
    // this now", the review wording. No screen writes its own.
    reason: explainForStudent(row),
    mastery: row.mastery,
    calendarTiming: row.calendarTiming || null,
    instructionalDaysUntilStart: row.instructionalDaysUntilStart ?? 0,
    calendarDaysUntilStart: row.calendarDaysUntilStart ?? 0,
    curriculumTitle: row.curriculumTitle || null,
    pacingIsProvisional: Boolean(row.pacingIsProvisional),
    teacherPriority: Boolean(row.teacherPriority),
    // A student may open anything they are permitted to work on. Future and
    // locked skills are shown so the path has shape, but they are not doors.
    selectable: ![STATUS.FUTURE, STATUS.LOCKED].includes(row.status),
    supportingSkillGaps: list(row.supportingSkillGaps),
    ...extra,
  };
};

/**
 * Overlay content availability onto a node.
 *
 * Availability is a separate axis from where the student is in the course: a
 * skill can be recommended, unlocked and still have nothing to practise. So it
 * is applied after the pedagogy rather than mixed into it, and it can only ever
 * close a door — it never opens one that prerequisites had locked.
 */
const withCoverage = (node, isCovered) => {
  if (typeof isCovered !== 'function' || isCovered(node.skillId)) return node;
  return {
    ...node,
    selectable: false,
    contentPending: true,
    symbol: CONTENT_PENDING_MARK.symbol,
    statusLabel: CONTENT_PENDING_MARK.label,
    tone: CONTENT_PENDING_MARK.tone,
    reason: 'Practice for this skill is being prepared. Your teacher can see when it is ready.',
  };
};

// Ready early, but the class has not arrived. Selectable, and shown under
// "coming up" rather than as a headline recommendation — being ahead is not the
// same as being told this is the best use of the next twenty minutes.
const isEarly = (row) => row.calendarTiming === 'upcoming';

export const DEFAULT_LIMITS = Object.freeze({
  current: 3, branches: 4, comingUp: 3, needsSupport: 3, challenge: 2,
});

/**
 * Build the map.
 *
 * `options` is exactly what getStudentPathOptions returned. Returns null when
 * there is nothing to draw, so the caller can say why rather than render an
 * empty diagram.
 */
export const buildPathMap = (options, { limits = {}, isCovered = null } = {}) => {
  if (!options || typeof options !== 'object') return null;
  const cap = { ...DEFAULT_LIMITS, ...limits };
  const rows = (key) => list(options[key]);
  const toNode = (row, extra) => withCoverage(toPathNode(row, extra), isCovered);

  // Required work outranks everything and suspends free choice, so it leads.
  const focus = [...rows('required'), ...rows('priority'), ...rows('recommended')]
    .filter((row) => !isEarly(row))
    .slice(0, cap.current)
    .map((row) => toNode(row));

  const focusIds = new Set(focus.map((node) => node.skillId));

  // The branches. These are the "one weakness does not shut down the course"
  // guarantee made visible: they stay open regardless of what is locked.
  const branches = rows('available')
    .filter((row) => !focusIds.has(row.skillId) && !isEarly(row))
    .slice(0, cap.branches)
    .map((row) => toNode(row));

  const earlyRows = [...rows('recommended'), ...rows('available'), ...rows('extension')].filter(isEarly);
  const comingUp = [...earlyRows, ...rows('future')]
    .filter((row) => !focusIds.has(row.skillId))
    .slice(0, cap.comingUp)
    .map((row) => toNode(row));

  // A blocked skill is shown WITH the repair that opens it, because the skill
  // itself is not something the student can act on.
  const needsSupport = [...rows('remediation'), ...rows('locked')]
    .slice(0, cap.needsSupport)
    .map((row) => {
      const targetId = row.remediationTarget || list(row.unmetPrerequisites)[0] || null;
      const described = targetId ? describeSkill(targetId) : null;
      return {
        ...toNode(row),
        lockedExplanation: explainLock(row),
        strengthen: described ? {
          skillId: targetId,
          code: described.code || null,
          title: described.shortLabel || targetId,
          symbol: PATH_MARK[STATUS.REMEDIATION].symbol,
          statusLabel: PATH_MARK[STATUS.REMEDIATION].label,
          tone: PATH_MARK[STATUS.REMEDIATION].tone,
          selectable: true,
        } : null,
      };
    });

  const challenge = rows('extension')
    .filter((row) => !isEarly(row))
    .slice(0, cap.challenge)
    .map((row) => toNode(row));

  const mastered = rows('mastered');

  return {
    courseId: options.courseId || null,
    pacingIsProvisional: Boolean(options.pacingIsProvisional),
    focus,
    branches,
    comingUp,
    needsSupport,
    challenge,
    masteredCount: mastered.length,
    // What the whole course looks like, so a screen can say "8 of 48" without
    // counting rows itself.
    totalSkills: ['required', 'remediation', 'priority', 'recommended', 'available', 'extension', 'future', 'locked', 'mastered']
      .reduce((sum, key) => sum + rows(key).length, 0),
    isEmpty: !focus.length && !branches.length && !comingUp.length && !needsSupport.length && !challenge.length,
  };
};

/**
 * The status a given skill has on the path, for cross-checking against another
 * surface. Two screens built from the same options must agree, and this makes
 * that checkable rather than assumed.
 */
export const statusForSkill = (options, skillId) => {
  if (!options || !skillId) return null;
  const buckets = ['required', 'remediation', 'priority', 'recommended', 'available', 'extension', 'future', 'locked', 'mastered'];
  for (const key of buckets) {
    const found = list(options[key]).find((row) => row.skillId === skillId);
    if (found) return found.status;
  }
  return null;
};

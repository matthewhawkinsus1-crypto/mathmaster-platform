import { assignmentIsForStudent, getAssignmentDate } from '../../assignmentLifecycle.js';
import { TEST_CYCLE_DISCOVERY, describeTestCycleForStudent } from './testCycleDiscovery.js';
import { SECTION_LABEL } from './lessonSections.js';
import { assignmentIsArchived, assignmentIsUnpublished } from '../../../functions/shared/assessmentAvailability.mjs';
import { isUnpublishedDraft } from '../assignments/assignmentAvailability.js';

/*
 * "WHAT CHANGED" — READ FROM WHAT THE PLATFORM ALREADY RECORDS.
 *
 * Product decision 6: a read-only list of the things that happened to a
 * student's work since they last looked — results released, a grade their
 * teacher changed (with the teacher's fixed-list reason when there is one),
 * work reopened / extended / excused, new assignments, a retest opening.
 *
 * It is NOT an inbox. Nothing here writes to the server, and nothing here can
 * carry a free-form teacher sentence: every line of text is built from a fixed
 * template, a title and a date. The override records on the student-readable
 * grades document are deliberately free of teacher identity, but an integrity
 * zero carries `note` and `actor` beside its fixed `reason` — this module reads
 * the fields it names (`reason`, `at`, `updatedAt`, `score`, `active`,
 * `source`, `sectionRole`, `incidentId`) and never spreads a record, so a note
 * or a teacher's email cannot reach the student's screen through it.
 *
 * Sources (all already on the student's device):
 *   assignments[]                      feedbackReleased / feedbackReleasedAt,
 *                                      createdAt / releaseAt
 *   testCycleGrades[assignmentId]      the server's Test Cycle projection
 *   teacherGradeOverridesByAssignment  per-question and integrity overrides
 *   controlsByAssignmentId             this student's own controls
 *                                      (studentAssignmentControls.byAssignmentId)
 */

export const WHAT_CHANGED_KIND = Object.freeze({
  RELEASED: 'released',
  GRADE_CHANGED: 'gradeChanged',
  EXCUSED: 'excused',
  REOPENED: 'reopened',
  EXTENDED: 'extended',
  MORE_ATTEMPTS: 'moreAttempts',
  NEW: 'new',
  RETEST: 'retest',
});

export const WHAT_CHANGED_DEFAULT_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const ASSIGNMENT_OVERRIDE_KEY = '__assignment';
const SECTION_INTEGRITY_PREFIX = '__sectionIntegrity_';
const SECTION_ZERO_SOURCE = 'teacher-section-zero';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Any stored time (ms, ISO, Firestore Timestamp or its plain {seconds}) → ms, or null. */
export const toMillis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value?.toMillis === 'function') {
    const ms = Number(value.toMillis());
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }
  if (isObject(value)) {
    const seconds = Number(value.seconds ?? value._seconds);
    if (!Number.isFinite(seconds)) return null;
    const nanos = Number(value.nanoseconds ?? value._nanoseconds) || 0;
    return seconds * 1000 + Math.floor(nanos / 1e6);
  }
  const text = clean(value);
  if (/^\d+$/.test(text)) return Number(text) || null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
};

const titleOf = (assignment) => clean(assignment?.title) || clean(assignment?.name) || 'an assignment';

const sectionName = (role) => SECTION_LABEL[clean(role)] || (clean(role) ? clean(role).charAt(0).toUpperCase() + clean(role).slice(1) : '');

const formatDue = (ms) => new Date(ms).toLocaleString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const questionList = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 1) return `Question ${sorted[0]}`;
  if (sorted.length === 2) return `Questions ${sorted[0]} and ${sorted[1]}`;
  return `Questions ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
};

/*
 * Work the teacher has hidden from students — archived, PAUSED (`unpublished`)
 * or still an authoring draft — is never news: Home does not list it either
 * (studentDashboardModel `visible`), and "New: <title>" for a paused lesson
 * would announce work the student cannot open.
 */
const assignmentHidden = (assignment) => assignmentIsArchived(assignment)
  || assignmentIsUnpublished(assignment)
  || isUnpublishedDraft(assignment)
  || ['archived', 'draft', 'deleted'].includes(clean(assignment?.status).toLowerCase());

/*
 * THE ONLY REASONS A STUDENT IS SHOWN: the fixed integrity labels the server
 * writes (functions/index.js ASSIGNMENT_ZERO_REASONS; asserted equal by
 * tests/platform/studentVerifyFixes.test.mjs). Anything else in `reason` — an
 * older record, a hand-edited one — is not shown, so a teacher's free-typed
 * sentence can never reach the student's screen through this list.
 */
export const STUDENT_VISIBLE_REASONS = Object.freeze([
  'Prohibited cellphone use',
  'Unauthorized assistance / cheating',
  'Account or laptop switching',
]);
const fixedReason = (value) => (STUDENT_VISIBLE_REASONS.includes(clean(value)) ? clean(value) : null);

/* ---- one assignment's events -------------------------------------------- */

const releasedAndRetest = ({ assignment, projection, nowValue }) => {
  const items = [];
  const title = titleOf(assignment);
  let releasedAt = null;
  let released = assignment.feedbackReleased === true || Boolean(assignment.feedbackReleasedAt);
  if (released) releasedAt = toMillis(assignment.feedbackReleasedAt);

  const view = isObject(projection) ? projection : null;
  if (view) {
    const described = describeTestCycleForStudent({ assignment, projection: view, nowValue });
    const stage = clean(view.stage);
    const changedAt = Number(view.stageChangedAt) || null;
    const key = described?.key || null;
    if (key === TEST_CYCLE_DISCOVERY.RETEST_READY || key === TEST_CYCLE_DISCOVERY.RETEST_IN_PROGRESS) {
      items.push({ kind: WHAT_CHANGED_KIND.RETEST, at: changedAt, text: `Retest ready: ${title}` });
      // The retest is the newer fact; the earlier release is subsumed by it.
      return items;
    }
    const cycleReleased = ['corrections', 'passed', 'complete', 'retestReady'].includes(stage)
      || (view.recordedGrade !== null && view.recordedGrade !== undefined && view.recordedGrade !== '')
      || [TEST_CYCLE_DISCOVERY.CORRECTIONS, TEST_CYCLE_DISCOVERY.COMPLETE, TEST_CYCLE_DISCOVERY.RETEST_PREPARING].includes(key);
    if (described && cycleReleased) {
      released = true;
      if (changedAt && (!releasedAt || changedAt > releasedAt)) releasedAt = changedAt;
    }
  }
  if (released) items.push({ kind: WHAT_CHANGED_KIND.RELEASED, at: releasedAt, text: `Results released: ${title}` });
  return items;
};

const gradeChanges = ({ assignment, overrides }) => {
  if (!isObject(overrides)) return [];
  const title = titleOf(assignment);
  const items = [];
  const questions = [];
  let questionsAt = null;
  const incidents = new Map();

  Object.keys(overrides).forEach((key) => {
    const record = overrides[key];
    if (!isObject(record) || record.active !== true) return;
    if (key === ASSIGNMENT_OVERRIDE_KEY) {
      items.push({
        kind: WHAT_CHANGED_KIND.GRADE_CHANGED,
        keySuffix: 'assignment',
        at: toMillis(record.at) ?? toMillis(record.updatedAt),
        text: `Your teacher updated your grade on ${title}`,
        reasonText: fixedReason(record.reason),
      });
      return;
    }
    // The section's bookkeeping entry (previous scores, incident id) — the
    // per-question entries it wrote carry the reason and time.
    if (key.startsWith(SECTION_INTEGRITY_PREFIX)) return;
    if (!/^\d+$/.test(key)) return;
    const at = toMillis(record.updatedAt) ?? toMillis(record.at);
    if (clean(record.source) === SECTION_ZERO_SOURCE) {
      const incident = clean(record.incidentId) || `section-${clean(record.sectionRole)}`;
      const existing = incidents.get(incident);
      incidents.set(incident, {
        at: Math.max(existing?.at || 0, at || 0) || null,
        sectionRole: clean(record.sectionRole) || existing?.sectionRole || '',
        reason: clean(record.reason) || existing?.reason || '',
      });
      return;
    }
    questions.push(Number(key) + 1);
    if (at && (!questionsAt || at > questionsAt)) questionsAt = at;
  });

  if (questions.length) {
    items.push({
      kind: WHAT_CHANGED_KIND.GRADE_CHANGED,
      keySuffix: 'questions',
      at: questionsAt,
      text: `Your teacher updated your grade on ${title} (${questionList(questions)})`,
      reasonText: null,
    });
  }
  incidents.forEach((incident, incidentKey) => {
    const section = sectionName(incident.sectionRole);
    items.push({
      kind: WHAT_CHANGED_KIND.GRADE_CHANGED,
      keySuffix: `section:${incidentKey}`,
      at: incident.at,
      text: `Your teacher updated your grade on ${title}${section ? ` (${section})` : ''}`,
      reasonText: fixedReason(incident.reason),
    });
  });
  return items;
};

const controlChanges = ({ assignment, control, studentId }) => {
  if (!isObject(control)) return [];
  const title = titleOf(assignment);
  if (control.excused === true) {
    // Excused work needs nothing more, so nothing else about it is news.
    return [{ kind: WHAT_CHANGED_KIND.EXCUSED, at: null, text: `${title} is excused` }];
  }
  const items = [];
  if (control.reopened === true) items.push({ kind: WHAT_CHANGED_KIND.REOPENED, at: null, text: `${title} was reopened` });
  const extended = Boolean(control.lateDueAt) || Boolean(control.extension);
  if (extended) {
    const dueAt = getAssignmentDate(assignment, 'late', studentId, { privateOverride: control });
    items.push({
      kind: WHAT_CHANGED_KIND.EXTENDED,
      at: toMillis(control.extension?.grantedAt),
      text: dueAt ? `You have more time on ${title} — now due ${formatDue(dueAt.getTime())}` : `You have more time on ${title}`,
    });
  }
  if (control.dolAttemptGrant && Number(control.dolAttemptGrant.extraAttempts) > 0) {
    items.push({
      kind: WHAT_CHANGED_KIND.MORE_ATTEMPTS,
      at: toMillis(control.dolAttemptGrant.changedAt),
      text: `You have another try on the DOL for ${title}`,
    });
  }
  return items;
};

const newAssignment = ({ assignment, nowValue }) => {
  const created = toMillis(assignment.createdAt);
  const release = getAssignmentDate(assignment, 'release')?.getTime() ?? null;
  const at = Math.max(created || 0, release || 0) || null;
  if (!at || at > nowValue) return [];
  return [{ kind: WHAT_CHANGED_KIND.NEW, at, text: `New: ${titleOf(assignment)}` }];
};

/**
 * Everything that changed for this student, newest first.
 *
 * Items with no recorded time (excused, reopened) have `at: null` unless the
 * caller remembered when this device first saw them (`firstSeenByKey`, from
 * rememberWhatChangedFirstSeen); untimed items are never "new" and sort last.
 */
export const buildWhatChanged = ({
  studentId = null,
  classId = null,
  classPeriod = null,
  assignments = [],
  testCycleGrades = {},
  teacherGradeOverridesByAssignment = {},
  controlsByAssignmentId = {},
  nowValue = Date.now(),
  windowDays = 14,
  seenAt = 0,
  firstSeenByKey = null,
  limit = WHAT_CHANGED_DEFAULT_LIMIT,
} = {}) => {
  const now = toMillis(nowValue) ?? Date.now();
  const oldest = now - Math.max(0, Number(windowDays) || 0) * DAY_MS;
  const seen = Number(seenAt) || 0;
  const firstSeen = isObject(firstSeenByKey) ? firstSeenByKey : {};
  const byKey = new Map();

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const assignmentId = clean(assignment?.id);
    if (!assignmentId || assignmentHidden(assignment)) return;
    if (!assignmentIsForStudent(assignment, { classId, classPeriod })) return;
    const control = controlsByAssignmentId?.[assignmentId] || null;
    const events = [
      ...releasedAndRetest({ assignment, projection: testCycleGrades?.[assignmentId], nowValue: now }),
      ...gradeChanges({ assignment, overrides: teacherGradeOverridesByAssignment?.[assignmentId] }),
      ...controlChanges({ assignment, control, studentId }),
      ...(control?.excused === true ? [] : newAssignment({ assignment, nowValue: now })),
    ];
    events.forEach((event) => {
      const key = `${event.kind}:${assignmentId}${event.keySuffix ? `:${event.keySuffix}` : ''}`;
      const at = event.at ?? (Number(firstSeen[key]) || null);
      if (at !== null && at < oldest) return;
      const item = {
        key,
        kind: event.kind,
        assignmentId,
        title: titleOf(assignment),
        at,
        text: event.text,
        reasonText: event.reasonText ?? null,
        unseen: at !== null && at > seen,
      };
      const existing = byKey.get(key);
      if (!existing || (item.at || 0) > (existing.at || 0)) byKey.set(key, item);
    });
  });

  return [...byKey.values()]
    .sort((a, b) => {
      if (a.at === null && b.at !== null) return 1;
      if (b.at === null && a.at !== null) return -1;
      if (a.at !== b.at) return (b.at || 0) - (a.at || 0);
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    })
    .slice(0, Math.max(0, Number(limit) || WHAT_CHANGED_DEFAULT_LIMIT));
};

/* ---- per-device "seen" ---------------------------------------------------
 * Best effort, like the Test Cycle "new" badge: losing it only loses a
 * marker, never a state. Every storage call is guarded — private windows and
 * blocked storage throw.
 */
const SEEN_PREFIX = 'mm-what-changed-seen:';
const FIRST_SEEN_PREFIX = 'mm-what-changed-first-seen:';

const storage = () => {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
};

export const whatChangedSeenKey = (studentId) => `${SEEN_PREFIX}${clean(studentId)}`;

export const readWhatChangedSeenAt = (studentId) => {
  if (!clean(studentId)) return 0;
  try {
    const value = Number(storage()?.getItem(whatChangedSeenKey(studentId)) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
};

export const markWhatChangedSeen = (studentId, ms = Date.now()) => {
  if (!clean(studentId)) return;
  try { storage()?.setItem(whatChangedSeenKey(studentId), String(Number(ms) || Date.now())); } catch { /* best effort */ }
};

/**
 * For items with no recorded time: remember when this device first saw each
 * key, so "Unit 3 is excused" becomes new once and then ages out with the
 * window like everything else. Returns the map to pass as `firstSeenByKey`.
 */
export const rememberWhatChangedFirstSeen = (studentId, keys = [], nowValue = Date.now()) => {
  if (!clean(studentId)) return {};
  const storageKey = `${FIRST_SEEN_PREFIX}${clean(studentId)}`;
  let map = {};
  try {
    const parsed = JSON.parse(storage()?.getItem(storageKey) || '{}');
    map = isObject(parsed) ? parsed : {};
  } catch { map = {}; }
  const live = new Set(keys.map(clean).filter(Boolean));
  const next = {};
  live.forEach((key) => { next[key] = Number(map[key]) || Number(nowValue) || Date.now(); });
  try { storage()?.setItem(storageKey, JSON.stringify(next)); } catch { /* best effort */ }
  return next;
};

/** Keys of the untimed (state) items, for rememberWhatChangedFirstSeen. */
export const untimedWhatChangedKeys = (items = []) => (Array.isArray(items) ? items : [])
  .filter((item) => item && (item.kind === WHAT_CHANGED_KIND.EXCUSED || item.kind === WHAT_CHANGED_KIND.REOPENED))
  .map((item) => item.key);

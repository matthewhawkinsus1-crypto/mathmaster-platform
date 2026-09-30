// SUPPORT EVIDENCE — what happened, who says so, and how we know.
//
// Three stored record kinds, all under grades/{studentId}/ and all immutable
// (firestore.rules):
//
//   supportEvidence/{id}      one event: a support made available, provided,
//                             used, or documented by staff
//   supportServiceLog/{id}    minutes of a service (inclusion, co-teaching …)
//   engagementMinutes/{id}    the active-minute ledger for one assignment/day
//
// The distinction the whole system exists to keep: CONFIGURED is not
// AVAILABLE is not PROVIDED is not USED, and NOT RECORDED is not "not
// provided". Each record says which of those it is (`eventType`), where it
// came from (`source`), and the report derives a PROVENANCE level for every
// fact it prints.
//
// The builders here mirror the Firestore rules field-for-field; the rules tests
// and these validators must agree (tests/rules/supportEvidenceRules.test.mjs).
import { supportById, SUPPORT_CLASSIFICATION } from './supportCatalog.mjs';

export const SUPPORT_EVIDENCE_SCHEMA_VERSION = 1;
export const SUPPORT_EVIDENCE_SUBCOLLECTION = 'supportEvidence';
export const SUPPORT_SERVICE_LOG_SUBCOLLECTION = 'supportServiceLog';
export const ENGAGEMENT_MINUTES_SUBCOLLECTION = 'engagementMinutes';

export const EVIDENCE_EVENT_TYPE = Object.freeze({
  AVAILABLE: 'available',
  PROVIDED: 'provided',
  ACTIVATED: 'activated',
  USED: 'used',
  TEACHER_DOCUMENTED: 'teacher-documented',
  PROVIDER_DOCUMENTED: 'provider-documented',
  DECLINED: 'declined',
  NOT_APPLICABLE: 'not-applicable',
});

export const EVIDENCE_SOURCE = Object.freeze({
  AUTOMATIC_TELEMETRY: 'automatic-telemetry',
  TEACHER_CLICK: 'teacher-click',
  PROVIDER_ENTRY: 'provider-entry',
  EXISTING_PLATFORM_EVENT: 'existing-platform-event',
  DERIVED: 'derived',
});

export const ACTOR_TYPE = Object.freeze({
  STUDENT: 'student',
  TEACHER: 'teacher',
  PROVIDER: 'provider',
  SYSTEM: 'system',
});

/** What a student's own client may record: platform facts, never staff facts. */
export const STUDENT_EVIDENCE_EVENT_TYPES = Object.freeze([
  EVIDENCE_EVENT_TYPE.AVAILABLE,
  EVIDENCE_EVENT_TYPE.PROVIDED,
  EVIDENCE_EVENT_TYPE.ACTIVATED,
  EVIDENCE_EVENT_TYPE.USED,
]);

/** What staff record. `provided` is here too: "I handed the student graph paper". */
export const STAFF_EVIDENCE_EVENT_TYPES = Object.freeze([
  EVIDENCE_EVENT_TYPE.TEACHER_DOCUMENTED,
  EVIDENCE_EVENT_TYPE.PROVIDER_DOCUMENTED,
  EVIDENCE_EVENT_TYPE.PROVIDED,
  EVIDENCE_EVENT_TYPE.DECLINED,
  EVIDENCE_EVENT_TYPE.NOT_APPLICABLE,
]);

export const PROVIDER_ROLES = Object.freeze([
  'teacher-of-record',
  'inclusion-teacher',
  'special-education-teacher',
  'paraprofessional',
  'related-service-provider',
  'other',
]);

export const PROVIDER_ROLE_LABEL = Object.freeze({
  'teacher-of-record': 'Teacher of record',
  'inclusion-teacher': 'Inclusion teacher',
  'special-education-teacher': 'Special education teacher',
  paraprofessional: 'Paraprofessional',
  'related-service-provider': 'Related-service provider',
  other: 'Other staff',
});

export const ACTIVITY_ROLES = Object.freeze(['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test']);

export const EVIDENCE_LIMITS = Object.freeze({
  note: 280,
  providerLabel: 80,
  topic: 120,
  id: 160,
  maxServiceMinutes: 600,
  maxDurationSeconds: 86400,
});

/**
 * How well a reported fact is known. Every material report field carries one.
 */
export const PROVENANCE = Object.freeze({
  RECORDED: 'recorded',
  DOCUMENTED: 'documented',
  DERIVED: 'derived',
  CONFIGURED: 'configured',
  NOT_RECORDED: 'not-recorded',
});

export const PROVENANCE_LABEL = Object.freeze({
  recorded: 'Recorded by MathMaster',
  documented: 'Documented by staff',
  derived: 'Derived from stored records',
  configured: 'Configured only',
  'not-recorded': 'Not recorded',
});

/**
 * The report's legend, word for word. Kept here so the printed report and the
 * teacher screens can never define the same word two ways.
 */
export const EVIDENCE_LEGEND = Object.freeze([
  { term: 'Configured', meaning: 'The support is listed in the student\'s support profile in MathMaster. Configuration alone does not show the support was made available or used.' },
  { term: 'Available', meaning: 'MathMaster made the support available to the student in an assignment, recorded automatically when the student opened it.' },
  { term: 'Provided', meaning: 'MathMaster applied the support automatically (for example a decluttered screen or an individualized due date), or a staff member recorded providing it.' },
  { term: 'Used', meaning: 'The student activated or used the support (for example pressed Read aloud or opened the calculator), recorded at the moment of use.' },
  { term: 'Teacher documented', meaning: 'A teacher recorded delivering the support, with the time it was recorded.' },
  { term: 'Provider documented', meaning: 'Staff recorded support or service delivered by a provider (for example an inclusion teacher), with the provider\'s role.' },
  { term: 'Derived', meaning: 'Worked out from other stored records (for example chunk completion from saved answers). The record it came from is named.' },
  { term: 'Not recorded', meaning: 'MathMaster has no record either way. This is not evidence that the support was not provided outside the platform.' },
]);

export const REPORT_LIMITATIONS = Object.freeze([
  'This report lists only what was recorded in MathMaster. The absence of a MathMaster record is not proof that a support was not provided outside the platform.',
  'MathMaster does not determine legal compliance with an IEP or Section 504 plan. Recorded service minutes are the minutes staff entered in MathMaster, not an independent measurement.',
  'Records made before this evidence system existed may be incomplete. Where a value could not be reconstructed from stored data it is shown as "Not recorded".',
  'Grade figures are MathMaster grade contributions. They are not the official report-card average, which is calculated in the student information system with categories and weights MathMaster does not hold.',
]);

const clean = (value) => String(value ?? '').trim();
const cleanId = (value) => clean(value).slice(0, EVIDENCE_LIMITS.id);
const lower = (value) => clean(value).toLowerCase();

const baseEvent = ({
  studentId, classId = null, assignmentId = null, activityRole = null, questionIndex = null,
  supportId, profileRevisionId = null,
}) => {
  const entry = supportById(supportId);
  const role = lower(activityRole);
  // Number(null) is 0: an absent question must stay absent, not become Q1.
  const index = questionIndex === null || questionIndex === undefined || questionIndex === '' ? Number.NaN : Number(questionIndex);
  return {
    schemaVersion: SUPPORT_EVIDENCE_SCHEMA_VERSION,
    studentId: cleanId(studentId),
    classId: cleanId(classId) || null,
    assignmentId: cleanId(assignmentId) || null,
    activityRole: ACTIVITY_ROLES.includes(role) ? role : null,
    questionIndex: Number.isInteger(index) && index >= 0 && index < 1000 ? index : null,
    supportId: entry ? entry.id : cleanId(supportId),
    classification: entry ? entry.classification : null,
    profileRevisionId: cleanId(profileRevisionId) || null,
  };
};

/**
 * A staff record: a one-click classroom action, a provider entry, a
 * "declined" or "not applicable" determination.
 */
export const buildStaffEvidenceEvent = ({
  studentId, classId, assignmentId, activityRole, questionIndex, supportId,
  eventType = EVIDENCE_EVENT_TYPE.TEACHER_DOCUMENTED,
  actorEmail, actorType = ACTOR_TYPE.TEACHER, providerRole = null,
  note = '', profileRevisionId = null, source = null,
  // A correction: this record withdraws an earlier staff record (a mis-click).
  // Both stay in the history; neither is counted (evidenceAggregation.js).
  voidsEventId = null,
} = {}) => {
  const errors = [];
  const event = baseEvent({ studentId, classId, assignmentId, activityRole, questionIndex, supportId, profileRevisionId });
  const type = lower(eventType);
  const actor = lower(actorType) === ACTOR_TYPE.PROVIDER ? ACTOR_TYPE.PROVIDER : ACTOR_TYPE.TEACHER;
  const role = lower(providerRole);
  const email = lower(actorEmail);
  if (!event.studentId) errors.push('A student is required.');
  if (!event.classification) errors.push(`Unknown support "${clean(supportId)}".`);
  if (!STAFF_EVIDENCE_EVENT_TYPES.includes(type)) errors.push(`"${type}" is not a staff evidence type.`);
  if (!email) errors.push('The signed-in staff email is required.');
  if (actor === ACTOR_TYPE.PROVIDER && !PROVIDER_ROLES.includes(role)) errors.push('Choose the provider\'s role.');
  const payload = {
    ...event,
    eventType: type,
    source: source && Object.values(EVIDENCE_SOURCE).includes(source)
      ? source
      : (actor === ACTOR_TYPE.PROVIDER ? EVIDENCE_SOURCE.PROVIDER_ENTRY : EVIDENCE_SOURCE.TEACHER_CLICK),
    actorType: actor,
    actorEmail: email,
    providerRole: PROVIDER_ROLES.includes(role) ? role : null,
    note: clean(note).slice(0, EVIDENCE_LIMITS.note),
    durationSeconds: null,
    voidsEventId: cleanId(voidsEventId) || null,
    authorizedTeacherEmails: [email],
  };
  return { payload, errors };
};

/** Minutes after a staff record during which its author may add a note once. */
export const NOTE_AFTER_WINDOW_MINUTES = 15;

/**
 * A record the student's own client makes: a support made available when an
 * assignment opened, applied automatically, or used. No note, no staff fields;
 * the rules also require the support to be in the student's pinned profile.
 */
export const buildStudentEvidenceEvent = ({
  studentId, classId, assignmentId, activityRole, questionIndex, supportId,
  eventType = EVIDENCE_EVENT_TYPE.USED,
  profileRevisionId = null, assignedTeacherEmail, durationSeconds = null,
} = {}) => {
  const errors = [];
  const event = baseEvent({ studentId, classId, assignmentId, activityRole, questionIndex, supportId, profileRevisionId });
  const type = lower(eventType);
  // Copied verbatim from the roster row: the rules compare it for exact
  // equality with grades/{id}.assignedTeacherEmail.
  const teacherEmail = clean(assignedTeacherEmail);
  if (!event.studentId) errors.push('A student is required.');
  if (!event.classification) errors.push(`Unknown support "${clean(supportId)}".`);
  if (!STUDENT_EVIDENCE_EVENT_TYPES.includes(type)) errors.push(`"${type}" is not a student evidence type.`);
  if (!teacherEmail) errors.push('The student has no teacher of record.');
  const seconds = Math.trunc(Number(durationSeconds));
  const payload = {
    ...event,
    eventType: type,
    source: EVIDENCE_SOURCE.AUTOMATIC_TELEMETRY,
    // The platform applied it (available/provided) or the student did (used).
    actorType: type === EVIDENCE_EVENT_TYPE.USED || type === EVIDENCE_EVENT_TYPE.ACTIVATED ? ACTOR_TYPE.STUDENT : ACTOR_TYPE.SYSTEM,
    actorEmail: null,
    providerRole: null,
    note: '',
    durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(EVIDENCE_LIMITS.maxDurationSeconds, seconds) : null,
    voidsEventId: null,
    authorizedTeacherEmails: teacherEmail ? [teacherEmail] : [],
  };
  return { payload, errors };
};

/**
 * Deterministic ids for records that must exist once: "available" per
 * assignment and revision. A relaunch or a second tab writes the same id,
 * which the rules refuse as an update — harmless, and never a duplicate.
 */
export const availabilityEventId = ({ assignmentId, profileRevisionId, supportId }) => (
  ['avail', cleanId(assignmentId), cleanId(profileRevisionId) || 'none', cleanId(supportId)]
    .join('__')
    .replace(/[^A-Za-z0-9_.-]/g, '-')
    .slice(0, 400)
);

// --- Service / support log -----------------------------------------------------

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const minutesOfDay = (text) => {
  const match = clean(text).match(TIME);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * One entry of recorded service minutes. Minutes come from start/end when
 * both are given (and must agree with an explicit minutes value), otherwise
 * from the minutes entered. A correction is a new entry naming the one it
 * replaces (`voidsEntryId`); a pure void has 0 minutes.
 */
export const buildServiceLogEntry = ({
  studentId, classId = null, dateKey, startTime = null, endTime = null, minutes = null,
  serviceType, providerRole, providerLabel = '', assignmentId = null, topic = '', note = '',
  voidsEntryId = null, createdByEmail,
} = {}) => {
  const errors = [];
  const service = supportById(serviceType);
  const role = lower(providerRole);
  const email = lower(createdByEmail);
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  const isVoid = Boolean(cleanId(voidsEntryId)) && Number(minutes) === 0;
  let total = Math.trunc(Number(minutes));
  if (start !== null && end !== null) {
    if (end <= start) errors.push('The end time must be after the start time.');
    const span = end - start;
    if (Number.isFinite(total) && clean(minutes) !== '' && total !== span && !isVoid) {
      errors.push(`The times give ${span} minutes but ${total} were entered.`);
    }
    total = span;
  }
  if (!isVoid && (!Number.isFinite(total) || total < 1 || total > EVIDENCE_LIMITS.maxServiceMinutes)) {
    errors.push(`Minutes must be between 1 and ${EVIDENCE_LIMITS.maxServiceMinutes}.`);
  }
  if (!clean(studentId)) errors.push('A student is required.');
  if (!DATE_KEY.test(clean(dateKey))) errors.push('Choose the date of the service.');
  if (!service || !service.serviceLoggable) errors.push('Choose the type of service or support.');
  if (!PROVIDER_ROLES.includes(role)) errors.push('Choose who provided it.');
  if (!email) errors.push('The signed-in staff email is required.');
  const payload = {
    schemaVersion: SUPPORT_EVIDENCE_SCHEMA_VERSION,
    studentId: cleanId(studentId),
    classId: cleanId(classId) || null,
    dateKey: clean(dateKey),
    startMinute: start,
    endMinute: end,
    minutes: isVoid ? 0 : (Number.isFinite(total) ? total : 0),
    serviceType: service ? service.id : cleanId(serviceType),
    classification: SUPPORT_CLASSIFICATION.SERVICE,
    providerRole: PROVIDER_ROLES.includes(role) ? role : null,
    providerLabel: clean(providerLabel).slice(0, EVIDENCE_LIMITS.providerLabel),
    assignmentId: cleanId(assignmentId) || null,
    topic: clean(topic).slice(0, EVIDENCE_LIMITS.topic),
    note: clean(note).slice(0, EVIDENCE_LIMITS.note),
    voidsEntryId: cleanId(voidsEntryId) || null,
    createdByEmail: email,
    authorizedTeacherEmails: [email],
  };
  return { payload, errors };
};

/** Monday of the school week containing a date key. */
export const weekStartOf = (dateKey) => {
  if (!DATE_KEY.test(clean(dateKey))) return null;
  const [year, month, day] = clean(dateKey).split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const weekday = new Date(utc).getUTCDay();
  const monday = new Date(utc - ((weekday + 6) % 7) * 86400000);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
};

/**
 * Recorded minutes by week and by service, inside a date range. Entries voided
 * by a later correction are excluded; nothing is ever inferred. When the
 * profile configured a weekly expectation, each week shows it next to what
 * was recorded — with no judgement attached.
 */
export const summarizeServiceMinutes = (entries = [], {
  fromDateKey = null, toDateKey = null, expectations = [],
} = {}) => {
  const all = (Array.isArray(entries) ? entries : []).filter((entry) => entry && DATE_KEY.test(clean(entry.dateKey)));
  const voided = new Set(all.map((entry) => cleanId(entry.voidsEntryId)).filter(Boolean));
  const inRange = all.filter((entry) => (
    (!fromDateKey || entry.dateKey >= fromDateKey) && (!toDateKey || entry.dateKey <= toDateKey)
  ));
  const counted = inRange.filter((entry) => !voided.has(cleanId(entry.id)) && Number(entry.minutes) > 0);
  const byWeek = new Map();
  const byServiceType = {};
  counted.forEach((entry) => {
    const week = weekStartOf(entry.dateKey);
    const bucket = byWeek.get(week) || { weekStart: week, minutes: 0, entries: 0, byServiceType: {} };
    bucket.minutes += Number(entry.minutes) || 0;
    bucket.entries += 1;
    bucket.byServiceType[entry.serviceType] = (bucket.byServiceType[entry.serviceType] || 0) + (Number(entry.minutes) || 0);
    byWeek.set(week, bucket);
    byServiceType[entry.serviceType] = (byServiceType[entry.serviceType] || 0) + (Number(entry.minutes) || 0);
  });
  const weeks = [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const expectationRows = (Array.isArray(expectations) ? expectations : [])
    .filter((expectation) => expectation && Number(expectation.minutesPerWeek) > 0)
    .map((expectation) => ({
      serviceType: expectation.serviceType,
      minutesPerWeek: Number(expectation.minutesPerWeek),
      weeks: weeks.map((week) => ({
        weekStart: week.weekStart,
        recordedMinutes: week.byServiceType[expectation.serviceType] || 0,
        configuredMinutes: Number(expectation.minutesPerWeek),
      })),
    }));
  return {
    totalMinutes: counted.reduce((sum, entry) => sum + (Number(entry.minutes) || 0), 0),
    entryCount: counted.length,
    voidedCount: inRange.filter((entry) => voided.has(cleanId(entry.id))).length,
    weeks,
    byServiceType,
    expectations: expectationRows,
  };
};

// --- Active-engagement minute ledger ----------------------------------------------

/** No interaction for this long and the student stops accruing active time. */
export const ENGAGEMENT_IDLE_CUTOFF_MS = 120000;
export const MINUTE_MS = 60000;
export const DAY_MS = 86400000;
/** One UTC day holds at most 1,440 minutes; the rules cap the array there. */
export const MAX_MINUTES_PER_DOC = 1440;

export const epochMinuteOf = (ms) => Math.floor(Number(ms) / MINUTE_MS);
export const utcDayOf = (ms) => Math.floor(Number(ms) / DAY_MS);
export const engagementDocId = (assignmentId, utcDay) => `${cleanId(assignmentId)}__${Math.trunc(Number(utcDay))}`;

/**
 * Should this second's activity be recorded as an active minute?
 *
 * The same definition for every student, whatever their accommodations: the
 * page is visible, the assignment is open for credit, and the student did
 * something within the idle cutoff. The idle-prompt accommodation only hides
 * the prompt; it does not make a walked-away tab count as work.
 */
export const isEngagedNow = ({ nowMs, lastInteractionMs, pageVisible, creditEligible }) => (
  Boolean(pageVisible)
  && Boolean(creditEligible)
  && Number.isFinite(Number(lastInteractionMs))
  && Number(nowMs) - Number(lastInteractionMs) <= ENGAGEMENT_IDLE_CUTOFF_MS
  && Number(nowMs) >= Number(lastInteractionMs)
);

/**
 * Summarize ledger documents into active time. Minutes are unioned, so the
 * same minute from two tabs or a replayed write counts once. Minutes after the
 * individualized due date are "late" minutes.
 */
export const summarizeEngagementMinutes = (docs = [], { dueAtMs = null, finalAtMs = null } = {}) => {
  const minutes = new Set();
  (Array.isArray(docs) ? docs : []).forEach((doc) => {
    (Array.isArray(doc?.minutes) ? doc.minutes : []).forEach((minute) => {
      const value = Math.trunc(Number(minute));
      if (Number.isFinite(value) && value > 0) minutes.add(value);
    });
  });
  const sorted = [...minutes].sort((a, b) => a - b);
  const dueMinute = Number.isFinite(Number(dueAtMs)) && dueAtMs !== null ? epochMinuteOf(dueAtMs) : null;
  const finalMinute = Number.isFinite(Number(finalAtMs)) && finalAtMs !== null ? epochMinuteOf(finalAtMs) : null;
  const days = new Set(sorted.map((minute) => Math.floor(minute / 1440)));
  let onTime = 0;
  let late = 0;
  let afterFinal = 0;
  sorted.forEach((minute) => {
    if (dueMinute === null || minute <= dueMinute) onTime += 1;
    else if (finalMinute === null || minute <= finalMinute) late += 1;
    else afterFinal += 1;
  });
  return {
    activeMinutes: sorted.length,
    onTimeMinutes: onTime,
    lateMinutes: late,
    afterFinalMinutes: afterFinal,
    firstActiveAtMs: sorted.length ? sorted[0] * MINUTE_MS : null,
    lastActiveAtMs: sorted.length ? sorted[sorted.length - 1] * MINUTE_MS + MINUTE_MS - 1 : null,
    // Wall-clock span between the first and last active minute: the elapsed
    // window, which is always at least the active time.
    elapsedMinutes: sorted.length ? sorted[sorted.length - 1] - sorted[0] + 1 : 0,
    activeDays: days.size,
  };
};

export default EVIDENCE_EVENT_TYPE;

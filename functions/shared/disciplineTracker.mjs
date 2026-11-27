// The discipline tracker's rules, shared by the teacher's screen and the
// backend (functions/disciplineFunctions.js). Pure: no Firestore, no network,
// no clock except what is passed in.
//
// What a teacher does: open a class's roster, tap a student's violation
// buttons as things happen. Each tap is one incident, time-stamped by the
// server. Everything after that happens without them:
//
//   - the district's Campus Violation Tracker Google Form gets one response
//     per student per class per day, carrying every violation category that
//     student had in that class, a few minutes after the class period ends
//     (or at the end of the school day when the bell schedule has no window);
//   - a parent message per student per day is drafted from the wording below;
//   - students who keep coming back are listed for the principal, with every
//     date and time and how their family has been contacted.
//
// The district form asks only for Student ID, First Name and the violation
// category. The tracker keeps more: the exact time, the class period, and a
// detail for ID and dress code violations. Those stay in MathMaster (the form
// is not being changed); "First Name" carries "First Last".

import { resolvePeriodWindow } from './classSchedule.mjs';
import { zonedDateKey, zonedTimeOnDate } from './instructionalCalendar.mjs';
import { schoolYearClosedDateKeys } from './schoolYearCalendar.mjs';
import { effectiveDistrictStudentId, isValidDistrictStudentId } from './studentDistrictId.mjs';
import { naturalStudentName, resolveStudentIdentity, studentNamePartsFromIdentity } from './studentIdentity.mjs';

export const DISCIPLINE_TIME_ZONE = 'America/Chicago';

/**
 * An undone tap. The backend marks one with `voidedAtMs` (and a server
 * timestamp `voidedAt`); either one means it is not a violation any more:
 * never sent to the form, counted, or written to a family.
 */
export const isVoidedIncident = (incident) => Boolean(incident?.voidedAtMs || incident?.voidedAt);
const text = (value) => String(value ?? '').trim();

/* ------------------------------------------------------------ the catalog */

/**
 * Each violation a teacher can record. `formOption` is the checkbox the
 * district form has for it; `details` are MathMaster's own, finer record.
 * Wording for parents is written to be factual, neutral and brief: what was
 * observed, when, and the expectation, never a judgement of the student.
 */
export const VIOLATION_TYPES = Object.freeze([
  Object.freeze({
    id: 'tardy',
    label: 'Tardy',
    formOption: 'Tardy',
    contactCategory: 'attendance',
    details: Object.freeze([]),
    parent: Object.freeze({
      observed: 'arrived late to class',
      expectation: 'Students are expected to be in the classroom when the bell rings so they do not miss the start of the lesson.',
      brief: 'be in class when the bell rings',
    }),
  }),
  Object.freeze({
    id: 'dressCode',
    label: 'Dress Code',
    formOption: 'Dress Code',
    contactCategory: 'behavior',
    details: Object.freeze([
      Object.freeze({
        id: 'swapping',
        label: 'Swapping in and out of dress code',
        parent: 'was changing in and out of dress code during the school day',
        expectation: 'Students are expected to remain in dress code for the entire school day, including between classes.',
        brief: 'stay in dress code all day, including between classes',
      }),
    ]),
    parent: Object.freeze({
      observed: 'was out of dress code',
      expectation: 'Students are expected to follow the campus dress code throughout the school day.',
      brief: 'follow the dress code all day',
    }),
  }),
  Object.freeze({
    id: 'idViolation',
    label: 'ID Violation',
    formOption: 'ID Violation',
    contactCategory: 'behavior',
    details: Object.freeze([
      Object.freeze({
        id: 'idRemoved',
        label: 'ID removed',
        parent: 'removed their student ID during class',
      }),
      Object.freeze({
        id: 'noLanyard',
        label: 'ID not displayed (no lanyard)',
        parent: 'was not displaying their student ID on a lanyard',
      }),
      Object.freeze({
        id: 'notVisibleAllDay',
        label: 'ID not on and visible all day',
        parent: 'did not keep their student ID on and visible',
      }),
    ]),
    parent: Object.freeze({
      observed: 'was not wearing their student ID as expected',
      expectation: 'Students are expected to wear their student ID on a lanyard, visible, for the entire school day.',
      brief: 'wear their student ID on a lanyard, visible, all day',
    }),
  }),
  Object.freeze({
    id: 'deviceCollected',
    label: 'Device Collected',
    formOption: 'Electronic Device Collected',
    contactCategory: 'cellphone',
    details: Object.freeze([]),
    parent: Object.freeze({
      observed: 'had an electronic device collected during class',
      expectation: 'Electronic devices are expected to be put away during class unless the teacher directs otherwise.',
      brief: 'keep devices put away in class',
    }),
  }),
]);

const TYPES = new Map(VIOLATION_TYPES.map((entry) => [entry.id, entry]));
export const violationType = (id) => TYPES.get(text(id)) || null;
export const violationDetail = (typeId, detailId) => violationType(typeId)?.details.find((entry) => entry.id === text(detailId)) || null;

/** What one recorded violation reads as in MathMaster: "ID Violation · no lanyard". */
export const violationLabel = ({ type, detail = '' } = {}) => {
  const entry = violationType(type);
  if (!entry) return 'Violation';
  const sub = violationDetail(type, detail);
  return sub ? `${entry.label} · ${sub.label}` : entry.label;
};

export class DisciplineInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DisciplineInputError';
  }
}
const refuse = (message) => { throw new DisciplineInputError(message); };

/** A tap from the roster, checked: a known type and, if any, one of its details. */
export const normalizeViolationInput = ({ type, detail = '' } = {}) => {
  const entry = violationType(type) || refuse('Choose a violation.');
  const cleanDetail = text(detail);
  if (cleanDetail && !violationDetail(entry.id, cleanDetail)) refuse(`${entry.label} has no detail "${cleanDetail}".`);
  return { type: entry.id, detail: cleanDetail };
};

/* ------------------------------------------------------------ time */

export const disciplineDateKey = (ms) => zonedDateKey(ms, DISCIPLINE_TIME_ZONE);

const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: DISCIPLINE_TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' });
const longDayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const keyToUtc = (dateKey) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(dateKey));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
/** "8:07 AM", in the district's time zone. */
export const disciplineTime = (ms) => (Number.isFinite(ms) ? timeFormat.format(new Date(ms)) : '');
/** "Tue, 12/1" for a date key. */
export const disciplineShortDay = (dateKey) => {
  const utc = keyToUtc(dateKey);
  return utc === null ? '' : dayFormat.format(new Date(utc));
};
/** "Tuesday, December 1" for a date key. */
export const disciplineLongDay = (dateKey) => {
  const utc = keyToUtc(dateKey);
  return utc === null ? '' : longDayFormat.format(new Date(utc));
};

const CLOSED = schoolYearClosedDateKeys();
const isSchoolDay = (dateKey) => {
  const utc = keyToUtc(dateKey);
  if (utc === null) return false;
  const weekday = new Date(utc).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !CLOSED.has(dateKey);
};
/** The last `count` school days ending on `dateKey` (weekends and district closures skipped). */
export const schoolDaysEndingOn = (dateKey, count) => {
  const days = [];
  let utc = keyToUtc(dateKey);
  if (utc === null) return days;
  for (let guard = 0; days.length < count && guard < 400; guard += 1, utc -= 86400000) {
    const key = new Date(utc).toISOString().slice(0, 10);
    if (isSchoolDay(key)) days.push(key);
  }
  return days.reverse();
};

/* ------------------------------------------------------------ the district form */

/**
 * DeSoto ISD's "Campus Violation Tracker" (read 2026-11-27). Anyone with the
 * link can respond: no sign-in, so MathMaster's backend submits it itself.
 * Before every batch the backend reads the live form again and checks it
 * against this (checkDistrictForm), so an edited form stops the batch rather
 * than recording the wrong thing.
 */
export const DISTRICT_VIOLATION_FORM = Object.freeze({
  formId: '1FAIpQLSfYSd6Z_xOg2btdwGG3RqzjZnQ0QTE0r2BkYcC77gbIQg2ZAw',
  title: 'Campus Violation Tracker',
  fields: Object.freeze({
    studentId: Object.freeze({ title: 'Student ID', entry: '53561676' }),
    name: Object.freeze({ title: 'First Name', entry: '1778257346' }),
    violations: Object.freeze({ title: 'Violation Assigned', entry: '420745546' }),
  }),
  options: Object.freeze(['Dress Code', 'Tardy', 'ID Violation', 'Electronic Device Collected']),
});
export const districtFormViewUrl = (form = DISTRICT_VIOLATION_FORM) => `https://docs.google.com/forms/d/e/${form.formId}/viewform`;
export const districtFormResponseUrl = (form = DISTRICT_VIOLATION_FORM) => `https://docs.google.com/forms/d/e/${form.formId}/formResponse`;

/**
 * The questions a Google Form page declares (its FB_PUBLIC_LOAD_DATA_):
 * [{ title, entry, required, options }]. Null when the page is not a form
 * (a sign-in page, an error page).
 */
export const parseGoogleFormDefinition = (html) => {
  const match = /FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/.exec(String(html || ''));
  if (!match) return null;
  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const items = Array.isArray(data?.[1]?.[1]) ? data[1][1] : [];
  const questions = [];
  for (const item of items) {
    for (const question of Array.isArray(item?.[4]) ? item[4] : []) {
      questions.push({
        title: text(item[1]),
        entry: text(question?.[0]),
        required: question?.[2] === 1,
        options: (Array.isArray(question?.[1]) ? question[1] : []).map((option) => text(option?.[0])).filter(Boolean),
      });
    }
  }
  return { title: text(data?.[1]?.[8] || data?.[3]), questions };
};

const sameTitle = (left, right) => text(left).toLowerCase() === text(right).toLowerCase();

/**
 * Match the live form to what the tracker sends. Fields are found by their
 * question title, so a re-ordered form still works; a renamed or removed
 * question, a removed checkbox, or a new required question stops the batch.
 * Returns the entry ids to post to.
 */
export const checkDistrictForm = (definition, form = DISTRICT_VIOLATION_FORM) => {
  if (!definition) return { ok: false, problems: ['The district form could not be read (it may now require a sign-in).'] };
  const problems = [];
  const entries = {};
  for (const [key, field] of Object.entries(form.fields)) {
    const found = definition.questions.filter((question) => sameTitle(question.title, field.title));
    if (found.length !== 1) {
      problems.push(`The district form has ${found.length ? 'more than one' : 'no'} "${field.title}" question.`);
      continue;
    }
    entries[key] = found[0].entry;
    if (key === 'violations') {
      const missing = form.options.filter((option) => !found[0].options.includes(option));
      if (missing.length) problems.push(`The district form no longer offers: ${missing.join(', ')}.`);
    }
  }
  const known = new Set(Object.values(form.fields).map((field) => field.title.toLowerCase()));
  definition.questions
    .filter((question) => question.required && !known.has(question.title.toLowerCase()))
    .forEach((question) => problems.push(`The district form has a new required question: "${question.title}".`));
  return problems.length ? { ok: false, problems } : { ok: true, entries };
};

/** "First Last" for the form's First Name field, from MathMaster's name record. */
export const formStudentName = (student = {}) => {
  const identity = resolveStudentIdentity(student);
  const parts = studentNamePartsFromIdentity(identity);
  return [parts.firstName, parts.lastName].filter(Boolean).join(' ') || naturalStudentName(identity);
};

/**
 * Pending incidents as form responses: one per student per class per day,
 * checking every category that student had there, in the form's own order.
 * A student without a valid district ID cannot be submitted (the form's
 * Student ID would be wrong) and is returned in `blocked`.
 */
export const pendingFormSubmissions = ({ incidents = [], studentsById = new Map() } = {}) => {
  const groups = new Map();
  const blocked = [];
  for (const incident of incidents || []) {
    if (isVoidedIncident(incident) || incident?.form?.state !== 'pending') continue;
    const key = `${incident.classId}|${incident.dateKey}|${incident.studentId}`;
    if (!groups.has(key)) groups.set(key, { key, classId: incident.classId, dateKey: incident.dateKey, studentId: incident.studentId, incidents: [] });
    groups.get(key).incidents.push(incident);
  }
  const submissions = [];
  for (const group of groups.values()) {
    const student = studentsById.get(group.studentId) || {};
    const sisStudentId = effectiveDistrictStudentId({ id: group.studentId, ...student });
    const name = formStudentName({ id: group.studentId, ...student });
    const ids = group.incidents.map((incident) => incident.id);
    if (!isValidDistrictStudentId(sisStudentId) || !name) {
      blocked.push({ ...group, incidentIds: ids, reason: !name ? 'No student name on file' : 'Missing or invalid district student ID' });
      continue;
    }
    const categories = new Set(group.incidents.map((incident) => violationType(incident.type)?.formOption).filter(Boolean));
    submissions.push({
      key: group.key,
      classId: group.classId,
      dateKey: group.dateKey,
      studentId: group.studentId,
      sisStudentId,
      name,
      options: DISTRICT_VIOLATION_FORM.options.filter((option) => categories.has(option)),
      incidentIds: ids,
      firstOccurredAtMs: Math.min(...group.incidents.map((incident) => Number(incident.occurredAtMs))),
      lastRecordedAtMs: Math.max(...group.incidents.map((incident) => Number(incident.occurredAtMs))),
    });
  }
  return { submissions, blocked };
};

/** The POST body for one response: the form's own fields, one value per checked box. */
export const formResponseBody = ({ entries, sisStudentId, name, options }) => {
  const body = new URLSearchParams();
  body.append(`entry.${entries.studentId}`, text(sisStudentId));
  body.append(`entry.${entries.name}`, text(name));
  (options || []).forEach((option) => body.append(`entry.${entries.violations}`, option));
  body.append('fvv', '1');
  body.append('pageHistory', '0');
  return body.toString();
};

/**
 * What a response to one submission means. A Google Form answers 200 when it
 * records a response and 400 when it refuses one (a required answer missing,
 * an option it does not have). There is no way to ask it later whether a
 * response arrived, so a reply that never came is `unknown` and is NOT sent
 * again on its own: a second response would be a second violation on the
 * district's record. Only a refusal the form clearly gave is retried, and
 * only when it was not about the answers.
 */
export const classifyFormReply = ({ status = null, networkError = null } = {}) => {
  if (networkError) {
    // Nothing reached Google: safe to send again.
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|before connect/i.test(String(networkError))) return { state: 'retry', reason: String(networkError).slice(0, 160) };
    return { state: 'unknown', reason: 'No reply from the form. It may or may not have been recorded.' };
  }
  if (status === 200) return { state: 'submitted' };
  if (status === 429 || (status >= 500 && status <= 599)) return { state: 'retry', reason: `The form answered ${status}.` };
  if (status === 401 || status === 403) return { state: 'failed', reason: 'The district form now requires a sign-in.' };
  return { state: 'failed', reason: `The form refused the response (${status}).` };
};

/**
 * When a class's batch goes to the form: a few minutes after its period
 * ends (the bell schedule's window for that day), or at the end of the
 * school day when the schedule has no window for it. Never sooner than a
 * few minutes after the last tap, so an undo is still possible.
 */
export const DISCIPLINE_SUBMIT_TIMING = Object.freeze({ afterPeriodMs: 10 * 60 * 1000, quietMs: 5 * 60 * 1000, endOfDay: '16:30' });
export const submissionDueAtMs = ({ submission, classPeriod = '', schedule = null, timing = DISCIPLINE_SUBMIT_TIMING }) => {
  const window = classPeriod && schedule
    ? resolvePeriodWindow({ schedule, classPeriod, nowValue: submission.firstOccurredAtMs, timeZone: DISCIPLINE_TIME_ZONE })
    : null;
  const periodDue = window && window.dateKey === submission.dateKey ? window.endMs + timing.afterPeriodMs : null;
  const dayDue = zonedTimeOnDate(submission.firstOccurredAtMs, timing.endOfDay, DISCIPLINE_TIME_ZONE);
  const due = periodDue ?? dayDue ?? submission.firstOccurredAtMs;
  return Math.max(due, submission.lastRecordedAtMs + timing.quietMs);
};

/* ------------------------------------------------------------ repeat offenders */

export const REPEAT_RULE = Object.freeze({ totalCount: 3, totalSchoolDays: 10, sameTypeCount: 2, sameTypeSchoolDays: 5 });

/**
 * Students to bring to the principal as of `asOfDateKey`: 3 or more
 * violations in the last 10 school days, or the same violation twice in the
 * last 5. Each comes with every violation in the window, oldest first.
 */
export const repeatOffenders = ({ incidents = [], asOfDateKey, rule = REPEAT_RULE } = {}) => {
  const wide = new Set(schoolDaysEndingOn(asOfDateKey, rule.totalSchoolDays));
  const narrow = new Set(schoolDaysEndingOn(asOfDateKey, rule.sameTypeSchoolDays));
  const byStudent = new Map();
  (incidents || [])
    .filter((incident) => !isVoidedIncident(incident) && wide.has(incident.dateKey))
    .forEach((incident) => {
      if (!byStudent.has(incident.studentId)) byStudent.set(incident.studentId, []);
      byStudent.get(incident.studentId).push(incident);
    });
  const offenders = [];
  for (const [studentId, list] of byStudent) {
    const sorted = [...list].sort((left, right) => left.occurredAtMs - right.occurredAtMs);
    const recentByType = new Map();
    sorted.filter((incident) => narrow.has(incident.dateKey)).forEach((incident) => recentByType.set(incident.type, (recentByType.get(incident.type) || 0) + 1));
    const repeatedTypes = [...recentByType].filter(([, count]) => count >= rule.sameTypeCount).map(([type]) => type);
    const reasons = [];
    if (sorted.length >= rule.totalCount) reasons.push(`${sorted.length} violations in ${rule.totalSchoolDays} school days`);
    repeatedTypes.forEach((type) => reasons.push(`${violationType(type)?.label || type} ${recentByType.get(type)} times in ${rule.sameTypeSchoolDays} school days`));
    if (!reasons.length) continue;
    const counts = {};
    sorted.forEach((incident) => { counts[incident.type] = (counts[incident.type] || 0) + 1; });
    offenders.push({ studentId, incidents: sorted, total: sorted.length, counts, reasons });
  }
  return offenders.sort((left, right) => right.total - left.total || String(left.studentId).localeCompare(String(right.studentId)));
};

/* ------------------------------------------------------------ parent message */

const firstNameOf = (student = {}) => {
  const parts = studentNamePartsFromIdentity(resolveStudentIdentity(student));
  return parts.firstName || formStudentName(student) || 'your student';
};
const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The longest text SchoolStatus sends: its composer counts "0/480"
 * (SchoolStatus Classic, read 2026-11-27). Each guardian gets this one text,
 * so a family message always fits in it.
 */
export const FAMILY_TEXT_MAX = 480;

/**
 * One text to a student's family about one day: who is writing and for which
 * class, what was observed and when, the expectation, then an invitation to
 * reply. Factual and courteous; it names only this student, by first name.
 * The owner chose this short form on 2026-11-27 so it fits one SchoolStatus
 * text; it never exceeds FAMILY_TEXT_MAX. If an unusual day would, the class
 * name, then the "please review" line, then the expectations are left out,
 * in that order, and last the times are dropped.
 */
export const parentMessage = ({ student = {}, incidents = [], dateKey, teacherName = '', classLabel = '' } = {}) => {
  const first = firstNameOf(student);
  const sorted = [...incidents].filter((incident) => !isVoidedIncident(incident)).sort((left, right) => left.occurredAtMs - right.occurredAtMs);
  // One phrase per kind of violation, with every time it happened.
  const groups = new Map();
  sorted.forEach((incident) => {
    const entry = violationType(incident.type);
    const sub = violationDetail(incident.type, incident.detail);
    const phrase = sub?.parent || entry?.parent.observed || 'had a violation';
    if (!groups.has(phrase)) groups.set(phrase, { phrase, times: [], brief: sub?.brief || entry?.parent.brief || '' });
    groups.get(phrase).times.push(disciplineTime(incident.occurredAtMs));
  });
  const observed = (withTimes) => joinList([...groups.values()].map((group) => (withTimes ? `${group.phrase} at ${joinList(group.times)}` : group.phrase)));
  const briefs = [...new Set([...groups.values()].map((group) => group.brief).filter(Boolean))];
  const subject = `${first}: ${joinList([...new Set(sorted.map((incident) => violationType(incident.type)?.label))].filter(Boolean))} on ${disciplineShortDay(dateKey)}`;
  const day = disciplineShortDay(dateKey);
  const build = ({ withClass = true, withReview = true, withExpectations = true, withTimes = true } = {}) => {
    const by = text(teacherName) || `${first}'s teacher`;
    const header = withClass && text(classLabel) ? `${by} (${text(classLabel)})` : by;
    return [
      `${header}: On ${day}, ${first} ${observed(withTimes)}.`,
      withExpectations && briefs.length ? `Students are expected to ${joinList(briefs)}.` : '',
      withReview ? `Please review this with ${first}.` : '',
      'Reply here with any questions.',
    ].filter(Boolean).join(' ');
  };
  const tries = [{}, { withClass: false }, { withClass: false, withReview: false }, { withClass: false, withReview: false, withExpectations: false }, { withClass: false, withReview: false, withExpectations: false, withTimes: false }];
  let body = '';
  for (const option of tries) {
    body = build(option);
    if (body.length <= FAMILY_TEXT_MAX) break;
  }
  return { subject, body: body.length <= FAMILY_TEXT_MAX ? body : `${body.slice(0, FAMILY_TEXT_MAX - 1)}…` };
};

/* ------------------------------------------------------------ principal report */

const CONTACT_METHOD_WORDS = Object.freeze({ phone: 'Phone call', email: 'Email', text: 'Text message', conference: 'Conference', voicemail: 'Voicemail', other: 'Contact' });

/**
 * The principal's email: each repeat offender with name, district ID, class,
 * every violation with its date and time, and how and when the family was
 * contacted (from MathMaster's parent contact log), or that they have not
 * been yet.
 */
export const principalReport = ({
  offenders = [], studentsById = new Map(), classLabelsById = new Map(), contactsByStudentId = new Map(),
  asOfDateKey, teacherName = '', principalName = '', rule = REPEAT_RULE,
} = {}) => {
  const from = schoolDaysEndingOn(asOfDateKey, rule.totalSchoolDays)[0] || asOfDateKey;
  const subject = `Repeat student violations: ${disciplineShortDay(from)} to ${disciplineShortDay(asOfDateKey)}${teacherName ? ` (${teacherName})` : ''}`;
  const lines = [
    principalName ? `${principalName},` : 'Hello,',
    '',
    offenders.length
      ? `These students have repeated violations in my classes over the last ${rule.totalSchoolDays} school days (${rule.totalCount} or more violations, or the same violation ${rule.sameTypeCount} times in ${rule.sameTypeSchoolDays} school days). Each was also submitted to the Campus Violation Tracker form.`
      : `No student has repeated violations in my classes over the last ${rule.totalSchoolDays} school days.`,
  ];
  offenders.forEach((offender, index) => {
    const student = { id: offender.studentId, ...studentsById.get(offender.studentId) };
    const sis = effectiveDistrictStudentId(student);
    const classes = [...new Set(offender.incidents.map((incident) => classLabelsById.get(incident.classId) || incident.classPeriod || ''))].filter(Boolean);
    lines.push('', `${index + 1}. ${formStudentName(student) || 'Name unavailable'} (ID ${isValidDistrictStudentId(sis) ? sis : 'not on file'})${classes.length ? `, ${classes.join(', ')}` : ''}: ${offender.reasons.join('; ')}`);
    offender.incidents.forEach((incident) => {
      lines.push(`   - ${disciplineShortDay(incident.dateKey)} ${disciplineTime(incident.occurredAtMs)}: ${violationLabel(incident)}`);
    });
    const firstAt = offender.incidents[0]?.occurredAtMs ?? 0;
    const contacts = (contactsByStudentId.get(offender.studentId) || [])
      .filter((contact) => Date.parse(contact.occurredAt || '') >= firstAt - 86400000)
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    lines.push(contacts.length
      ? `   Parent contact: ${contacts.map((contact) => `${CONTACT_METHOD_WORDS[contact.method] || 'Contact'} on ${disciplineShortDay(disciplineDateKey(Date.parse(contact.occurredAt)))} ${disciplineTime(Date.parse(contact.occurredAt))}${text(contact.outcome) ? ` (${text(contact.outcome).slice(0, 80)})` : ''}`).join('; ')}`
      : '   Parent contact: none recorded yet');
  });
  lines.push('', 'Thank you,', teacherName || '');
  return { subject, body: lines.join('\n').trim() };
};

/** A new Outlook (Microsoft 365) message, filled in, for the teacher to review and send. */
export const outlookComposeUrl = ({ to = '', subject = '', body = '' } = {}) => {
  const query = [
    to ? `to=${encodeURIComponent(to)}` : '',
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join('&');
  return `https://outlook.office.com/mail/deeplink/compose?${query}`;
};

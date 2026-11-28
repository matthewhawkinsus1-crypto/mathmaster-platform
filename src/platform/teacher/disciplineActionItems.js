/*
 * THE DISCIPLINE TRACKER'S ROWS IN THE ACTION CENTER.
 *
 * What in the Discipline Tracker needs the teacher, in the Action Center's
 * row shape (teacherActionCenter.js), from the tracker's own records
 * (listDisciplineIncidents: the caller's classes only):
 *
 *   - a violation the district form did not take, or may not have: the form
 *     refused it, or gave no reply. The tracker's Send again / It was recorded
 *     decides; nothing is resent by itself, because a duplicate would be a
 *     second violation on the student's district record;
 *   - the live district form changed, so violations wait in MathMaster;
 *   - a message to a family that did not go out through SchoolStatus, or may
 *     not have;
 *   - the week's principal report: students who meet the repeat rule and are
 *     not in a report the teacher has marked sent since their latest
 *     violation. Due on the week's last school day (Friday, unless the
 *     district calendar closes it).
 *
 * Every row opens the Discipline Tracker on its class. Pure but for
 * `loadDisciplineActionItems`, which reads through the store it is given (or
 * the tracker's own, loaded then).
 */
import {
  REPEAT_RULE, disciplineDateKey, disciplineShortDay, disciplineTime, isVoidedIncident, repeatOffenders, schoolDaysEndingOn,
  violationLabel,
} from '../../../functions/shared/disciplineTracker.mjs';
import { TEACHER_ACTION_KIND } from './teacherActionCenter.js';

/** How far back the Action Center reads the tracker's records. */
export const DISCIPLINE_ACTION_WINDOW_DAYS = 30;

const DAY_MS = 86400000;
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();
const keyToUtc = (dateKey) => Date.parse(`${dateKey}T00:00:00Z`);
const utcToKey = (utc) => new Date(utc).toISOString().slice(0, 10);
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The date key `days` calendar days before `dateKey`. */
export const dateKeyDaysBefore = (dateKey, days) => utcToKey(keyToUtc(dateKey) - days * DAY_MS);

/**
 * The week the principal report is for: Monday to its report day, the last
 * school day on or before that Friday. On a weekend it is the week just past.
 */
export const principalReportWeek = (todayDateKey) => {
  const today = keyToUtc(todayDateKey);
  const weekday = new Date(today).getUTCDay();
  const friday = today + (weekday === 0 ? -2 : 5 - weekday) * DAY_MS;
  const fridayKey = utcToKey(friday);
  return { weekStart: utcToKey(friday - 4 * DAY_MS), reportDay: schoolDaysEndingOn(fridayKey, 1)[0] || fridayKey };
};

const row = (fields) => ({
  studentId: null, studentName: '', classId: null, assignmentId: null, context: [],
  sourceType: 'discipline', status: 'open', availableActions: ['openDisciplineTracker'], ...fields,
});

/** Violation sends the district form refused, or did not answer: one row per student, class and day (one form response). */
const formRows = (incidents) => {
  const groups = new Map();
  incidents.filter((incident) => ['unknown', 'failed'].includes(incident.form?.state)).forEach((incident) => {
    const key = `${incident.classId}|${incident.studentId}|${incident.dateKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(incident);
  });
  return [...groups].map(([key, group]) => {
    const sorted = [...group].sort((left, right) => left.occurredAtMs - right.occurredAtMs);
    const first = sorted[0];
    const what = sorted.map((incident) => `${violationLabel(incident)} at ${disciplineTime(incident.occurredAtMs)}`).join(', ');
    const unknown = sorted.some((incident) => incident.form?.state === 'unknown');
    const reason = text(sorted.find((incident) => incident.form?.reason)?.form?.reason);
    return row({
      id: `disciplineForm:${key}`,
      kind: TEACHER_ACTION_KIND.DISCIPLINE_FORM,
      studentId: first.studentId,
      classId: first.classId,
      title: unknown ? 'Check the district violation form' : 'Violation not sent to the district form',
      summary: unknown
        ? `${what} on ${disciplineShortDay(first.dateKey)}: the form gave no reply, so it may or may not have it. Check the form's responses, then choose Send again or It was recorded.`
        : `${what} on ${disciplineShortDay(first.dateKey)}: not sent${reason ? ` (${reason})` : ''}. Choose Send again or It was recorded.`,
      priority: 'high',
      createdAt: first.occurredAtMs,
      dueAt: first.dateKey,
      sourceId: key,
    });
  });
};

/** The latest message for each student's day, where it did not go out or may not have. */
const familyMessageRows = (messages) => {
  const latest = new Map();
  list(messages).forEach((message) => {
    const key = text(message.messageKey) || `${message.classId}|${message.dateKey}|${message.studentId}`;
    const current = latest.get(key);
    if (!current || (Number(message.sequence) || 1) > (Number(current.sequence) || 1)) latest.set(key, message);
  });
  return [...latest.values()].filter((message) => ['failed', 'unknown'].includes(message.state)).map((message) => {
    const unknown = message.state === 'unknown';
    return row({
      id: `familyMessage:${message.id}`,
      kind: TEACHER_ACTION_KIND.FAMILY_MESSAGE,
      studentId: message.studentId,
      classId: message.classId,
      title: unknown ? 'Check whether the family message went out' : 'Family message not sent',
      summary: unknown
        ? `The message about ${disciplineShortDay(message.dateKey)} may have gone out: SchoolStatus did not confirm it. Check SchoolStatus, then choose Send again or It was sent.`
        : `The message about ${disciplineShortDay(message.dateKey)} did not go out${message.reason ? ` (${text(message.reason)})` : ''}. Queue it again, or contact the family another way.`,
      priority: 'normal',
      createdAt: message.queuedAtMs || null,
      dueAt: message.dateKey,
      sourceId: message.id,
    });
  });
};

/** The week's principal report: who still needs to be in it, or that it went. */
const principalReportRows = ({ incidents, principalReports, todayDateKey }) => {
  const { weekStart, reportDay } = principalReportWeek(todayDateKey);
  const reports = list(principalReports).filter((report) => Number.isFinite(Number(report?.sentAtMs)));
  const latestOf = (offender) => Math.max(...offender.incidents.map((incident) => Number(incident.occurredAtMs) || 0));
  // In a report sent after their latest violation: a new one puts them back on.
  const reported = (offender) => reports.some((report) => Number(report.sentAtMs) >= latestOf(offender) && list(report.studentIds).includes(offender.studentId));
  const waiting = repeatOffenders({ incidents, asOfDateKey: todayDateKey }).filter((offender) => !reported(offender));
  if (waiting.length) {
    return [row({
      id: `principalReport:${reportDay}`,
      kind: TEACHER_ACTION_KIND.PRINCIPAL_REPORT,
      studentName: plural(waiting.length, 'student'),
      title: 'Send the principal report',
      summary: `${plural(waiting.length, 'student')} ${waiting.length === 1 ? 'meets' : 'meet'} the repeat rule (${REPEAT_RULE.totalCount} or more violations in ${REPEAT_RULE.totalSchoolDays} school days, or the same one ${REPEAT_RULE.sameTypeCount} times in ${REPEAT_RULE.sameTypeSchoolDays}) and ${waiting.length === 1 ? 'is' : 'are'} not in a report you marked sent since. Open the report in the Discipline Tracker, send it, then mark it sent.`,
      priority: 'normal',
      createdAt: Math.min(...waiting.map(latestOf)),
      dueAt: reportDay,
      sourceId: `principalReport:${reportDay}`,
      contextStudentIds: waiting.map((offender) => offender.studentId),
    })];
  }
  const sent = reports
    .filter((report) => disciplineDateKey(Number(report.sentAtMs)) >= weekStart)
    .sort((left, right) => Number(right.sentAtMs) - Number(left.sentAtMs))[0];
  if (!sent) return [];
  return [row({
    id: `principalReport:${reportDay}`,
    kind: TEACHER_ACTION_KIND.PRINCIPAL_REPORT,
    studentName: plural(list(sent.studentIds).length, 'student'),
    title: 'Principal report sent',
    summary: `Marked sent ${disciplineShortDay(disciplineDateKey(Number(sent.sentAtMs)))} at ${disciplineTime(Number(sent.sentAtMs))}.`,
    priority: 'normal',
    createdAt: Number(sent.sentAtMs),
    dueAt: reportDay,
    sourceId: `principalReport:${reportDay}`,
    status: 'completed',
    contextStudentIds: list(sent.studentIds),
  })];
};

/**
 * The tracker's rows for the Action Center. `incidents`, `formStatus` and
 * `familyMessages` are listDisciplineIncidents' answer; `principalReports`
 * the reports the teacher marked sent (getDisciplineSettings).
 */
export const buildDisciplineActionItems = ({
  incidents = [], formStatus = null, familyMessages = [], principalReports = [], todayDateKey, nowMs = Date.now(),
} = {}) => {
  const live = list(incidents).filter((incident) => !isVoidedIncident(incident));
  const rows = [...formRows(live), ...familyMessageRows(familyMessages), ...principalReportRows({ incidents: live, principalReports, todayDateKey })];
  // The live form changed: every class's violations wait. Only for a teacher who uses the tracker.
  if (formStatus && formStatus.ok === false && live.length) {
    rows.push(row({
      id: 'disciplineForm:formChanged',
      kind: TEACHER_ACTION_KIND.DISCIPLINE_FORM,
      studentName: 'All classes',
      title: 'The district violation form changed',
      summary: `Violations wait in MathMaster until the form is checked. ${list(formStatus.problems).join(' ') || 'The form could not be read.'}`,
      priority: 'high',
      createdAt: Number(formStatus.checkedAtMs) || nowMs,
      dueAt: todayDateKey,
      sourceId: 'formChanged',
    }));
  }
  return rows;
};

/** Read the tracker's records for the window and build its rows. */
export const loadDisciplineActionItems = async ({ nowMs = Date.now(), store = null } = {}) => {
  const api = store || await import('./disciplineStore.js');
  const todayDateKey = disciplineDateKey(nowMs);
  const [listed, settings] = await Promise.all([
    api.listDisciplineIncidents({ fromDateKey: dateKeyDaysBefore(todayDateKey, DISCIPLINE_ACTION_WINDOW_DAYS), toDateKey: todayDateKey }),
    // The report rows only: without the settings there are no sent reports to count.
    api.getDisciplineSettings().catch(() => ({})),
  ]);
  return buildDisciplineActionItems({
    incidents: listed?.incidents,
    formStatus: listed?.formStatus,
    familyMessages: listed?.familyMessages,
    principalReports: settings?.principalReports,
    todayDateKey,
    nowMs,
  });
};

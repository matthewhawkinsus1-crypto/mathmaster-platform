/*
 * THE CASE TIMELINE — MEANINGFUL RECORDED EVENTS, IN ORDER.
 *
 * PR #401's support timeline (profile revisions, support evidence, service
 * minutes, classroom records) is reused as it is, and the academic events the
 * support report does not have are added beside it:
 *
 *   assigned · class due · individualized due (derived) · attendance extension
 *   · work on a school day (answers grouped per assignment per day, never one
 *   row per keystroke or attempt; the attempts are in the expansion) ·
 *   completion (last answer) · Practice Mode activity · answers refused after
 *   the final cutoff · Recovery · Live Challenge Warm-Up credit · grade export
 *   and upload · teacher grade changes.
 *
 * Every entry carries a provenance category and, where there is more to see,
 * `details` for the teacher to expand.
 */
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { CASE_PROVENANCE, fromSupportProvenance } from './caseProvenance.js';
import { SECTION_ROLE_LABEL } from './attemptAnalysis.js';

export const CASE_TIMELINE_LIMIT = 600;
const SCHOOL_TIME_ZONE = 'America/Chicago';

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const finite = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
const timeOfDay = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE });
const dayText = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: SCHOOL_TIME_ZONE });

const entry = ({ atMs, kind, label, detail = '', provenance, assignmentId = null, details = [], withdrawn = false, group = 'academic' }) => ({
  atMs, dateKey: zonedDateKey(atMs, SCHOOL_TIME_ZONE), kind, group, label, detail, provenance, assignmentId, details, withdrawn,
});

/** Answers on one assignment, grouped by school day. */
const workDayEntries = ({ assignment, events, questions }) => {
  const entries = [];
  const timed = list(events)
    .filter((event) => clean(event?.performance?.status) !== 'unattempted' && Number.isFinite(finite(event.occurredAt)))
    .sort((a, b) => a.occurredAt - b.occurredAt);
  const byDay = new Map();
  timed.forEach((event) => {
    const key = zonedDateKey(event.occurredAt, SCHOOL_TIME_ZONE);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  });
  const questionNumber = (index) => list(questions).find((row) => row.storageIndex === index);
  byDay.forEach((dayEvents) => {
    const first = dayEvents[0].occurredAt;
    const last = dayEvents[dayEvents.length - 1].occurredAt;
    const correct = dayEvents.filter((event) => event.performance?.isCorrect).length;
    const roles = [...new Set(dayEvents.map((event) => SECTION_ROLE_LABEL[clean(event.source?.activityRole)] || clean(event.source?.activityRole)).filter(Boolean))];
    entries.push(entry({
      atMs: first,
      kind: 'work-day',
      label: `Worked on ${assignment.title}: ${dayEvents.length} answer${dayEvents.length === 1 ? '' : 's'} recorded (${correct} correct)`,
      detail: `${timeOfDay(first)}${last !== first ? `–${timeOfDay(last)}` : ''}${roles.length ? ` · ${roles.join(', ')}` : ''}`,
      provenance: CASE_PROVENANCE.DIRECT,
      assignmentId: assignment.assignmentId,
      details: dayEvents.slice(0, 80).map((event) => {
        const row = questionNumber(event.source?.questionIndex);
        return {
          label: `${timeOfDay(event.occurredAt)} · ${row ? `${row.sectionLabel} Q${row.sectionNumber}` : `Question ${Number(event.source?.questionIndex) + 1}`} · attempt ${event.performance?.attemptNumber ?? '—'}`,
          value: event.performance?.isCorrect ? 'Correct' : (Number(event.performance?.partialCredit) > 0 ? `Partial (${event.performance.partialCredit}%)` : 'Not correct'),
        };
      }),
    }));
  });
  // Without per-attempt events, the question records still date their LAST answer.
  if (!timed.length) {
    const dated = list(questions).filter((row) => Number.isFinite(row.lastAttemptAtMs));
    const byRecordDay = new Map();
    dated.forEach((row) => {
      const key = zonedDateKey(row.lastAttemptAtMs, SCHOOL_TIME_ZONE);
      if (!byRecordDay.has(key)) byRecordDay.set(key, []);
      byRecordDay.get(key).push(row);
    });
    byRecordDay.forEach((rows) => {
      const sorted = rows.sort((a, b) => a.lastAttemptAtMs - b.lastAttemptAtMs);
      const legacy = sorted.some((row) => row.lastAttemptTimeProvenance === CASE_PROVENANCE.LEGACY);
      entries.push(entry({
        atMs: sorted[0].lastAttemptAtMs,
        kind: 'work-day',
        label: `Last answers recorded on ${assignment.title}: ${sorted.length} question${sorted.length === 1 ? '' : 's'}`,
        detail: 'Each question record keeps only the time of its last answer; earlier attempts are not dated.',
        provenance: legacy ? CASE_PROVENANCE.LEGACY : CASE_PROVENANCE.DERIVED,
        assignmentId: assignment.assignmentId,
        details: sorted.slice(0, 80).map((row) => ({ label: `${timeOfDay(row.lastAttemptAtMs)} · ${row.sectionLabel} Q${row.sectionNumber}`, value: row.outcomeLabel })),
      }));
    });
  }
  return entries;
};

/**
 * Build the timeline. `assignments` are the case's assignment entries:
 * `{ row (PR #401), questions, events, completion, gradeImpact }`.
 */
export const buildCaseTimeline = ({
  assignments = [],
  supportTimeline = [],
  overrideAudits = [],
  fromMs = null,
  toMs = null,
} = {}) => {
  const within = (ms) => Number.isFinite(ms) && (fromMs === null || ms >= fromMs) && (toMs === null || ms <= toMs);
  const entries = [];

  list(assignments).forEach(({ row, questions = [], events = [], completion = null, gradeImpact = null }) => {
    const assignment = { assignmentId: row.assignmentId, title: clean(row.title) || 'Untitled assignment' };
    if (Number.isFinite(row.releaseAtMs)) {
      entries.push(entry({ atMs: row.releaseAtMs, kind: 'assigned', label: `${assignment.title} assigned`, detail: 'Released to the student\'s class', provenance: CASE_PROVENANCE.DIRECT, assignmentId: row.assignmentId }));
    }
    if (Number.isFinite(row.classDueAtMs)) {
      entries.push(entry({ atMs: row.classDueAtMs, kind: 'due', label: `${assignment.title} class due date`, provenance: CASE_PROVENANCE.DIRECT, assignmentId: row.assignmentId }));
    }
    if (row.individualizedDue?.dueAtMs) {
      entries.push(entry({ atMs: row.individualizedDue.dueAtMs, kind: 'individual-due', label: `${assignment.title} individualized due date`, detail: 'From the support profile\'s extra-time rule', provenance: CASE_PROVENANCE.DERIVED, assignmentId: row.assignmentId }));
    }
    const extension = completion?.reopened?.attendanceExtension;
    // Each recorded grant is its own event; an extension from before the
    // grant history has only its latest grant.
    const extensionGrants = extension?.grants?.length ? extension.grants : (extension ? [extension] : []);
    extensionGrants.filter((grant) => Number.isFinite(grant.grantedAtMs)).forEach((grant) => {
      entries.push(entry({
        atMs: grant.grantedAtMs,
        kind: 'attendance-extension',
        label: `Attendance extension recorded for ${assignment.title}`,
        detail: [Number.isFinite(grant.finalAtMs) ? `last day to turn in ${dayText(grant.finalAtMs)}` : '', grant.meetingsGranted ? `${grant.meetingsGranted} class meeting${grant.meetingsGranted === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
        provenance: CASE_PROVENANCE.DIRECT,
        assignmentId: row.assignmentId,
      }));
    });
    entries.push(...workDayEntries({ assignment, events, questions }));
    (completion?.sessions?.ledger || []).forEach((session) => {
      entries.push(entry({
        atMs: session.startMs,
        kind: 'work-session',
        label: `Active on ${assignment.title}: ${session.activeMinutes} min`,
        detail: `${timeOfDay(session.startMs)}–${timeOfDay(session.endMs)} · server-timed active minutes`,
        provenance: CASE_PROVENANCE.DIRECT,
        assignmentId: row.assignmentId,
      }));
    });
    if (completion?.completedAt && Number.isFinite(completion.completedAt.atMs)) {
      entries.push(entry({
        atMs: completion.completedAt.atMs,
        kind: 'completed',
        label: `${assignment.title}: every question answered`,
        detail: `${row.completedLate ? 'After the student\'s due date · ' : ''}time of the last recorded answer`,
        provenance: completion.completedAt.provenance,
        assignmentId: row.assignmentId,
      }));
    }
    const practice = completion?.practiceMode;
    if (practice?.recorded && Number.isFinite(practice.lastPracticeAtMs)) {
      entries.push(entry({
        atMs: practice.lastPracticeAtMs,
        kind: 'practice-mode',
        label: `Practice Mode on ${assignment.title}: ${practice.questionsPracticed} question${practice.questionsPracticed === 1 ? '' : 's'} practiced`,
        detail: 'After the final cutoff; not for credit · time from the student\'s device',
        provenance: CASE_PROVENANCE.LEGACY,
        assignmentId: row.assignmentId,
      }));
    }
    if (completion?.afterDeadline?.notCountedAfterClose && Number.isFinite(completion.afterDeadline.lastNotCountedAtMs)) {
      entries.push(entry({
        atMs: completion.afterDeadline.lastNotCountedAtMs,
        kind: 'not-counted',
        label: `${completion.afterDeadline.notCountedAfterClose} answer${completion.afterDeadline.notCountedAfterClose === 1 ? '' : 's'} to ${assignment.title} arrived after the final cutoff and were not counted`,
        provenance: CASE_PROVENANCE.DIRECT,
        assignmentId: row.assignmentId,
      }));
    }
    list(completion?.reopened?.recoveries).forEach((recovery) => {
      const sectionLabel = SECTION_ROLE_LABEL[recovery.section] || recovery.section;
      if (Number.isFinite(recovery.startedAtMs)) {
        entries.push(entry({ atMs: recovery.startedAtMs, kind: 'recovery', label: `${sectionLabel} Recovery started on ${assignment.title}`, provenance: CASE_PROVENANCE.DIRECT, assignmentId: row.assignmentId }));
      }
      if (Number.isFinite(recovery.completedAtMs)) {
        entries.push(entry({ atMs: recovery.completedAtMs, kind: 'recovery', label: `${sectionLabel} Recovery completed on ${assignment.title}`, detail: Number.isFinite(recovery.recordedScore) ? `recorded section score ${recovery.recordedScore}%` : '', provenance: CASE_PROVENANCE.DIRECT, assignmentId: row.assignmentId }));
      }
    });
    const challenge = completion?.reopened?.warmupLiveChallenge;
    if (challenge && Number.isFinite(challenge.recordedAtMs)) {
      entries.push(entry({ atMs: challenge.recordedAtMs, kind: 'live-challenge', label: `Live Challenge result recorded as the Warm-Up grade for ${assignment.title}`, provenance: CASE_PROVENANCE.DIRECT, assignmentId: row.assignmentId }));
    }
    list(gradeImpact?.items).forEach((item) => {
      const status = item.exportStatus || {};
      if (Number.isFinite(status.exportedAtMs)) {
        entries.push(entry({ atMs: status.exportedAtMs, kind: 'grade-export', label: `${assignment.title}${item.key !== 'assignment' ? ` — ${item.label}` : ''} exported (sent ${status.exportedGrade ?? '—'})`, provenance: CASE_PROVENANCE.DIRECT, assignmentId: row.assignmentId }));
      }
      if (Number.isFinite(status.uploadedAtMs)) {
        entries.push(entry({ atMs: status.uploadedAtMs, kind: 'grade-export', label: `${assignment.title}${item.key !== 'assignment' ? ` — ${item.label}` : ''} upload confirmed`, provenance: CASE_PROVENANCE.STAFF, assignmentId: row.assignmentId }));
      }
    });
  });

  const titleOf = (assignmentId) => clean(list(assignments).find((entryValue) => entryValue.row.assignmentId === assignmentId)?.row?.title) || 'an assignment';
  list(overrideAudits).forEach((audit) => {
    if (!Number.isFinite(audit.at)) return;
    const where = Number.isInteger(audit.questionIndex) ? ` question ${audit.questionIndex + 1}` : (audit.sectionRole ? ` ${SECTION_ROLE_LABEL[audit.sectionRole] || audit.sectionRole}` : '');
    entries.push(entry({
      atMs: audit.at,
      kind: 'grade-change',
      label: `Teacher grade change on ${titleOf(audit.assignmentId)}${where}${Number.isFinite(audit.previousScore) || Number.isFinite(audit.newScore) ? `: ${audit.previousScore ?? '—'}% → ${audit.newScore ?? '—'}%` : ''}`,
      detail: [audit.reason, audit.note, audit.actorEmail ? `by ${audit.actorEmail}` : ''].filter(Boolean).join(' · '),
      provenance: CASE_PROVENANCE.STAFF,
      assignmentId: audit.assignmentId,
    }));
  });

  list(supportTimeline).forEach((item) => {
    entries.push({
      atMs: item.atMs,
      dateKey: zonedDateKey(item.atMs, SCHOOL_TIME_ZONE),
      kind: item.kind,
      group: 'support',
      label: item.label,
      detail: item.detail || '',
      provenance: fromSupportProvenance(item.provenance),
      assignmentId: null,
      details: [],
      withdrawn: item.withdrawn === true,
    });
  });

  const all = entries.filter((item) => within(item.atMs)).sort((a, b) => a.atMs - b.atMs);
  return {
    entries: all.slice(-CASE_TIMELINE_LIMIT),
    truncated: all.length > CASE_TIMELINE_LIMIT,
    total: all.length,
    days: new Set(all.map((item) => item.dateKey)).size,
  };
};

export default buildCaseTimeline;

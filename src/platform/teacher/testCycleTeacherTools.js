/*
 * THE SECURE TEST SCREEN'S TOOLS, AS PLAIN FUNCTIONS.
 *
 * Everything the teacher's Test Cycle panel works out before it asks the
 * server for something: which students a class-wide action would reach, how a
 * running operation is driven to its end, the time a teacher typed read as
 * SCHOOL time, the sources a grade can be set from, who can still be added.
 * None of it decides anything — the server authorizes every action and
 * resolves every audience itself — but each piece is what a button's label or
 * a confirmation's sentence is made from, so each is tested without a browser.
 *
 * Pure: no React, no Firebase.
 */

import { zonedInstant, zonedParts } from '../../../functions/shared/instructionalCalendar.mjs';
import { BULK_ACTION, BULK_ACTION_LABEL } from '../../../functions/shared/testCycleBulk.mjs';
import { isRootAdminEmail } from '../../../functions/shared/rolePolicy.mjs';
import { SCHOOL_TIME_ZONE } from '../../../functions/shared/sectionDeadline.mjs';

export { BULK_ACTION, BULK_ACTION_LABEL };

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const pad = (value) => String(value).padStart(2, '0');

/*
 * A TIME A TEACHER TYPES IS SCHOOL TIME, WHEREVER THE TEACHER IS.
 *
 * `<input type="datetime-local">` hands back wall-clock text with no zone. A
 * teacher extending a window from a conference in another zone still means
 * the time on the classroom wall, so the text is read in the school's zone —
 * never the browser's — and shown back the same way.
 */
export const schoolInputValue = (instant, timeZone) => {
  const at = Number(instant);
  if (!Number.isFinite(at) || at <= 0) return '';
  const parts = zonedParts(at, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
};

export const instantFromSchoolInput = (value, timeZone) => {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const instant = zonedInstant({ year, month, day, hour, minute }, timeZone);
  return Number.isFinite(instant) ? instant : null;
};

/** Today's date in the school's zone, for a date picker's minimum. */
export const schoolDateKey = (instant, timeZone) => {
  const parts = zonedParts(Number(instant) || Date.now(), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

/*
 * WHO A CLASS-WIDE ACTION WOULD CHANGE — FOR THE BUTTON AND THE CONFIRMATION.
 *
 * The server decides each student's outcome when the operation runs; this is
 * the same reading of the table the teacher is looking at, so "Waive Review
 * for 12 students" names twelve students rather than promising the class.
 */
const needsReviewWaived = (row) => row?.stage === 'review' && row?.teacherControls?.reviewWaived !== true;
const needsTestSession = (row) => !row?.test?.examSessionId
  && !['submitted', 'released'].includes(row?.test?.state)
  // A student sitting (or past) the Retest that replaced a missed Test is not
  // given a Test: the server reports them as not eligible.
  && !(row?.retestWithoutOriginal && ['inProgress', 'submitted', 'released'].includes(row?.retest?.state));

const BULK_NEEDS = Object.freeze({
  [BULK_ACTION.WAIVE_REVIEW]: needsReviewWaived,
  [BULK_ACTION.OPEN_TEST_SESSIONS]: needsTestSession,
});

/**
 * What a class-wide action covers: everyone on the table, or the students the
 * teacher ticked. `scope` is what is sent; `willChange` is how many of them
 * the action has anything to do for (the rest come back "already complete").
 */
export const planBulkAction = ({ action, rows = [], selectedIds = [] } = {}) => {
  const needs = BULK_NEEDS[action];
  if (!needs) return null;
  const onTable = list(rows).filter((row) => clean(row?.studentId));
  const picked = new Set(list(selectedIds).map(clean).filter(Boolean));
  const targeted = picked.size ? onTable.filter((row) => picked.has(clean(row.studentId))) : onTable;
  const willChange = targeted.filter(needs);
  return {
    action,
    label: BULK_ACTION_LABEL[action],
    scope: picked.size ? { kind: 'students', studentIds: targeted.map((row) => clean(row.studentId)) } : { kind: 'all' },
    selected: picked.size > 0,
    targetCount: targeted.length,
    willChangeCount: willChange.length,
    willChangeIds: willChange.map((row) => clean(row.studentId)),
    alreadyCount: targeted.length - willChange.length,
  };
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The button and the confirmation for a planned class-wide action. */
export const describeBulkPlan = (plan, { external = false } = {}) => {
  if (!plan) return null;
  const who = plan.selected ? plural(plan.targetCount, 'selected student') : `all ${plural(plan.targetCount, 'student')}`;
  const noun = external ? 'Retest' : 'Test';
  const waive = plan.action === BULK_ACTION.WAIVE_REVIEW;
  return {
    button: waive
      ? `Waive Review · ${plan.willChangeCount}`
      : `Open ${noun} sessions · ${plan.willChangeCount}`,
    disabled: plan.willChangeCount === 0,
    title: waive ? `Waive Review for ${who}?` : `Open secure ${noun} sessions for ${who}?`,
    body: [
      waive
        ? `${plural(plan.willChangeCount, 'student')} still in Review will be able to start the ${noun} without finishing it.`
        : `${plural(plan.willChangeCount, 'student')} will be issued a secure ${noun} session.`,
      plan.alreadyCount ? `${plural(plan.alreadyCount, 'student')} ${plan.alreadyCount === 1 ? 'needs' : 'need'} nothing and will be reported as already complete.` : '',
      waive
        ? 'Their Review work is kept exactly as it is. You can require Review again for a student who has not started.'
        : 'A student who already has a session keeps it: nobody is given a second one.',
      'It runs on the server a few students at a time, and you will see each student\'s outcome.',
    ].filter(Boolean).join(' '),
    confirmLabel: waive ? 'Waive Review' : `Open ${noun} sessions`,
  };
};

/** An id for a new operation: the idempotency key the server stores it under. */
export const newBulkOperationId = (action, { now = Date.now(), random = Math.random } = {}) => {
  const tail = Array.from({ length: 10 }, () => Math.floor(random() * 36).toString(36)).join('');
  return `${clean(action) || 'bulk'}-${Number(now).toString(36)}-${tail}`.slice(0, 80);
};

/*
 * DRIVE ONE OPERATION TO ITS END.
 *
 * The server works for a bounded time and hands back; this asks again with the
 * same id until every student has an outcome. Each answer is reported as it
 * arrives, so the teacher watches the count move instead of a spinner. A call
 * that fails stops the loop and is thrown: what was done is stored on the
 * server, and "Continue" (the same id) picks it up.
 *
 * `step` performs one call and resolves to the operation's view.
 */
export const driveBulkOperation = async ({ step, onProgress = () => {}, wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }), maxRounds = 120 } = {}) => {
  let view = null;
  for (let round = 0; round < maxRounds; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    view = await step();
    onProgress(view);
    if (view?.finished) return view;
    // Another request is working it (a second tab, a retried click): wait for
    // that one rather than piling on.
    // eslint-disable-next-line no-await-in-loop
    if (view?.busy) await wait(2000);
  }
  return view;
};

/** A finished or unfinished operation, with the students named. */
export const describeOperation = (view, nameOf = (studentId) => studentId) => {
  if (!view) return null;
  const named = (entries) => list(entries).map((entry) => ({ studentId: entry.studentId, name: nameOf(entry.studentId), detail: entry.detail }));
  return {
    operationId: view.operationId,
    action: view.action,
    actionLabel: view.actionLabel || BULK_ACTION_LABEL[view.action] || 'Class-wide action',
    headline: view.headline,
    // Only a clean finish is shown as one. Running is neutral; anything with a
    // failure is an error, finished or not.
    tone: view.tone === 'success' ? 'success' : view.tone === 'error' ? 'error' : 'progress',
    finished: view.finished === true,
    canContinue: view.finished !== true,
    counts: view.counts || null,
    failures: named(view.failures),
    notEligible: named(view.notEligible),
  };
};

/*
 * THE REVIEW COLUMN: what the student did, as numbers a teacher can grade from.
 */
const REVIEW_STATUS_LABEL = Object.freeze({
  noReview: 'No Review',
  notStarted: 'Not started',
  inProgress: 'In progress',
  complete: 'Complete',
  waived: 'Waived',
});

const trim = (value) => Number(Number(value).toFixed(2));

// "Oct 8, 10:28 AM": the saved time as the table has room for it, in SCHOOL
// time. The full label, weekday and zone included, is the cell's tooltip.
const shortSchoolTime = (instant, timeZone) => {
  const at = Number(instant);
  if (!Number.isFinite(at) || at <= 0) return null;
  // Newer engines put a narrow no-break space before AM/PM; a plain space
  // reads the same and matches every other time on the panel.
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(new Date(at)).replace(/[\u202f\u00a0]/g, ' ');
};

export const describeReviewSummary = (review = {}, { timeZone = SCHOOL_TIME_ZONE, percentWithProgress = false } = {}) => {
  const total = Number(review.total) || 0;
  const status = REVIEW_STATUS_LABEL[review.status] || (review.complete ? 'Complete' : '—');
  if (!total) return { status: REVIEW_STATUS_LABEL.noReview, progress: '—', points: '—', percent: null, saved: null, savedShort: null, lines: [], line: 'No Review questions' };
  const percent = review.percent === null || review.percent === undefined ? null : Number(review.percent);
  const progress = `${Number(review.attempted) || 0}/${total}`;
  const earned = trim(review.earnedPoints || 0);
  const possible = trim(review.possiblePoints || 0);
  const savedShort = shortSchoolTime(review.lastSavedAt, timeZone) || review.lastSavedLabel || null;
  // "Oct 8, 10:28 AM" as two facts, so the date and the time each stay whole.
  const savedFacts = savedShort
    ? savedShort.split(', ').map((part, index, all) => `${index === 0 ? '· saved ' : ''}${part}${index < all.length - 1 ? ',' : ''}`)
    : [];
  return {
    status,
    progress,
    points: `${earned}/${possible} pts`,
    percent,
    saved: review.lastSavedLabel || null,
    savedShort,
    /*
     * The table's short lines, under the cell's own "Done · 75%". Each inner
     * string is one FACT that is never broken; a line wraps only between
     * facts. As one sentence these wrapped at every space in a narrow column
     * and made a row seven lines tall.
     *
     * The percent is on the cell's first line beside the status, so it is not
     * repeated here — unless that line is already a mastery percent
     * (`percentWithProgress`), where a second bare percent would be misread.
     * The last line is when the work was saved; before anything is saved it
     * is the status in words.
     */
    lines: [
      [`${progress} answered`, percentWithProgress && percent !== null ? `· ${percent}%` : null].filter(Boolean),
      [`${earned} / ${possible} pts`],
      savedFacts.length ? savedFacts.map((fact) => fact.replace(/^· /, '')) : [status],
    ],
    line: `${status} · ${progress} answered · ${earned}/${possible} pts${percent === null ? '' : ` · ${percent}%`}`,
  };
};

/*
 * WHAT A GRADE CAN BE SET FROM, FOR THIS STUDENT, NOW.
 *
 * Each choice names its source and the number the server will read for it.
 * The number shown is the server's own (from the same table); the server
 * reads it again when the teacher confirms, and never takes it from here.
 */
export const gradeAdjustmentChoices = (row = {}) => {
  const choices = [];
  const review = row.review || {};
  if (Number(review.total) > 0 && review.percent !== null && review.percent !== undefined) {
    choices.push({
      source: 'review',
      label: `Use the Review score (${review.percent}%)`,
      grade: Number(review.percent),
      detail: `Records ${review.percent}% from this student's Review work (${trim(review.earnedPoints || 0)} of ${trim(review.possiblePoints || 0)} points). The Review was done with hints and retries; the secure scores are kept as they are.`,
    });
  }
  if (row.rawRetestGrade !== null && row.rawRetestGrade !== undefined) {
    choices.push({
      source: 'retestActual',
      label: `Use the actual Retest score (${trim(row.rawRetestGrade)}%)`,
      grade: Number(row.rawRetestGrade),
      detail: `Records the Retest's own score instead of the capped ${trim(row.retestCappedContribution ?? row.rawRetestGrade)}%.`,
    });
  }
  choices.push({
    source: 'manual',
    label: 'Enter a grade',
    grade: null,
    detail: 'Records the grade you type. A short note saying why is required.',
    needsGrade: true,
    needsNote: true,
  });
  return {
    choices,
    adjusted: Boolean(row.gradeAdjustment),
    current: row.gradeAdjustment
      ? `Set by ${row.gradeAdjustment.by || 'a teacher'} to ${trim(row.gradeAdjustment.grade)}%. The grade rule alone would record ${row.ruleRecordedGrade === null || row.ruleRecordedGrade === undefined ? 'no grade' : `${trim(row.ruleRecordedGrade)}%`}.`
      : null,
  };
};

/** A typed grade and note, checked before the server is asked. */
export const validateManualGrade = ({ grade, note }) => {
  const text = clean(grade);
  const value = Number(text);
  if (!text || !Number.isFinite(value) || value < 0 || value > 100) return 'Enter a grade from 0 to 100.';
  if (!clean(note)) return 'Add a short note saying why you are setting this grade.';
  return null;
};

/*
 * WHO CAN STILL BE ADDED. The classes this teacher is teacher of record for
 * that do not have the Test yet, and the students who are not on its table.
 * The server checks both again; this only keeps the list honest.
 */
export const audienceCandidates = ({ classes = [], students = [], audienceClassIds = [], rows = [], teacherEmail = '' } = {}) => {
  const assigned = new Set(list(audienceClassIds).map(clean));
  const me = clean(teacherEmail).toLowerCase();
  const onTable = new Set(list(rows).map((row) => clean(row?.studentId)));
  // The server lets the root administrator add any class (teacherOwnedClassIds
  // returns "all of them"), so the list must not hide the classes they are
  // not teacher of record for.
  const mine = (entry) => !me || isRootAdminEmail(me) || clean(entry?.teacherOfRecord).toLowerCase() === me;
  const byId = new Map(list(classes).map((entry) => [clean(entry?.classId || entry?.id), entry]));
  const classLabel = (classId) => {
    const entry = byId.get(clean(classId));
    return entry ? clean(entry.name) || clean(entry.period) || clean(classId) : clean(classId);
  };
  // A student's class by NAME when this teacher's class list has it, else the
  // period on their record: two classes can meet in the same period.
  const classNameOf = (student) => {
    const entry = byId.get(clean(student?.classId));
    return clean(entry?.name) || clean(student?.classPeriod) || clean(entry?.period) || '';
  };
  return {
    classLabel,
    classNameOf,
    assignedClasses: [...assigned].filter(Boolean).map((classId) => ({ classId, label: classLabel(classId) })),
    classes: list(classes)
      .map((entry) => ({ classId: clean(entry?.classId || entry?.id), label: clean(entry?.name) || clean(entry?.period), status: entry?.status, entry }))
      .filter(({ classId, status, entry }) => classId && status !== 'archived' && !assigned.has(classId) && mine(entry))
      .map(({ classId, label }) => ({ classId, label: label || classId })),
    students: list(students)
      .map((student) => ({ studentId: clean(student?.id ?? student?.studentId), classId: clean(student?.classId), student }))
      .filter(({ studentId, classId, student }) => studentId && !onTable.has(studentId) && !assigned.has(classId) && student?.status !== 'inactive'),
  };
};

/** "Added 1 student." — only what was added is counted; "0 classes" is noise. */
export const describeAudienceAddition = (counts = {}, { noun = 'Test' } = {}) => {
  const classes = Number(counts.classesAdded) || 0;
  const students = Number(counts.studentsAdded) || 0;
  const failed = Number(counts.failed) || 0;
  const failedNote = failed ? ` ${failed} could not be added; see the list below.` : '';
  const parts = [
    classes ? `${classes} class${classes === 1 ? '' : 'es'}` : null,
    students ? plural(students, 'student') : null,
  ].filter(Boolean);
  if (!parts.length) return `Nothing new was added: everyone asked for already has this ${noun}.${failedNote}`;
  return `Added ${parts.join(' and ')}.${failedNote} Open ${noun} sessions for them when you are ready.`;
};

/** The evidence check before a delete, in the words the confirmation uses. */
export const describeLifecycleEvidence = (summary) => {
  if (!summary) return null;
  if (summary.canDelete) {
    return {
      canDelete: true,
      text: `No student has worked on this Test. Deleting removes it, ${plural(Number(summary.secureSessions) || 0, 'unstarted secure session')} and every record opened for it.`
        + (Number(summary.classroomPublications) > 0 ? ' Its Google Classroom post is not removed by deleting here.' : ''),
      classroomPublications: Number(summary.classroomPublications) || 0,
    };
  }
  return {
    canDelete: false,
    text: summary.scanIncomplete && !Number(summary.studentsWithWork)
      ? 'This Test has more secure sessions than can be checked in one pass, so it cannot be deleted. Archive it instead: archiving hides it from students and keeps everything.'
      : `${plural(Number(summary.studentsWithWork) || 0, 'student')} ${Number(summary.studentsWithWork) === 1 ? 'has' : 'have'} work on this Test, so it cannot be deleted. Archive it instead: archiving hides it from students and keeps their work and grades.`,
    classroomPublications: Number(summary.classroomPublications) || 0,
  };
};

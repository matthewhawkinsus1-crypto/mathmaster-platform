import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  MAX_TEACHER_GRANTED_ATTEMPTS,
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  studentAssignmentView,
} from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { withStudentSupportDates } from '../../../functions/shared/supportDeadline.mjs';

/*
 * A STUDENT'S OWN ASSIGNMENT CONTROLS, ON THEIR OWN DEVICE.
 *
 * Their individual final cutoff (attendance extension), excusal, reopen and
 * extra DOL attempts live in `studentAssignmentOverrides`, one small record per
 * (student, assignment) that only they, their teacher of record and the root
 * administrator can read (docs/architecture/student-assignment-overrides.md).
 *
 * ONE LISTENER PER DEVICE. `where('studentId', '==', <the signed-in student>)`
 * — the only list the rules allow a student — bounded by that student's own
 * controls, never by class size, lesson count or section count. Its results
 * become one map keyed by assignment id; every lesson the device holds is then
 * projected ONCE, here, through the shared resolver:
 *
 *   studentAssignmentView(lesson, { studentId, privateOverride })
 *     → withStudentSupportDates(view, studentId, profile)
 *
 * so the dashboard cards, Resume/Open, the lifecycle, due/final dates, the
 * Grade Center, Recovery, Practice Pass, make-up and the DOL attempt budget all
 * read the same merged answer from the same objects. Nothing here decides a
 * precedence: studentAssignmentOverrides.mjs does.
 *
 * IDENTITY-SCOPED. Controls are always held with the student they belong to
 * (`ownerId`). A projection for any other student — the next person on a
 * shared Chromebook, a render that runs before the old listener is torn down,
 * a cached snapshot from an earlier session — gets none of them
 * (`controlsForStudent`), and a record that is not the signed-in student's is
 * dropped even if a cache handed it over. What a student's JavaScript holds is
 * the allow-listed controls only: no teacher account, no reason, no
 * authorization list, no classmate.
 */

export const STUDENT_CONTROLS_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const EMPTY_STUDENT_CONTROLS = Object.freeze({
  ownerId: null,
  status: STUDENT_CONTROLS_STATUS.IDLE,
  byAssignmentId: Object.freeze({}),
  fromCache: false,
});

/** The one query a student's device makes. */
export const studentAssignmentControlsQuery = (db, studentId) => query(
  collection(db, STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION),
  where('studentId', '==', clean(studentId)),
);

const attemptCount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, Math.floor(parsed))) : 0;
};

/**
 * A stored record reduced to what the student's runtime may hold: the controls
 * and when a grant was made. Who granted it, why, and who may read the record
 * stay out of every student-side object.
 */
export const ownControlRecord = (data) => {
  if (!isObject(data)) return null;
  const extension = isObject(data.extension) ? {
    dateKey: typeof data.extension.dateKey === 'string' ? data.extension.dateKey : null,
    grantedAt: Number.isFinite(Number(data.extension.grantedAt)) && data.extension.grantedAt !== null ? Number(data.extension.grantedAt) : null,
  } : null;
  const dolExtraAttempts = attemptCount(data.dolExtraAttempts);
  return {
    lateDueAt: typeof data.lateDueAt === 'string' && data.lateDueAt.trim() ? data.lateDueAt.trim() : null,
    extension: extension && (extension.dateKey !== null || extension.grantedAt !== null) ? extension : null,
    excused: data.excused === true,
    reopened: data.reopened === true,
    dolExtraAttempts,
    dolAttemptGrant: dolExtraAttempts > 0
      ? { extraAttempts: dolExtraAttempts, changedAt: data.dolAttemptGrant?.changedAt ? String(data.dolAttemptGrant.changedAt) : null }
      : null,
  };
};

/**
 * The listener's documents as one map, assignment id → this student's record.
 * A document for anyone else is dropped: the query and the rules already
 * exclude it, and a projection must not depend on that alone.
 */
export const ownControlsByAssignment = (documents = [], studentId) => {
  const owner = clean(studentId);
  const byAssignmentId = {};
  if (!owner) return byAssignmentId;
  (documents || []).forEach((document) => {
    const data = typeof document?.data === 'function' ? document.data() : document;
    if (!isObject(data) || clean(data.studentId) !== owner) return;
    const assignmentId = clean(data.assignmentId);
    const record = ownControlRecord(data);
    if (assignmentId && record) byAssignmentId[assignmentId] = record;
  });
  return byAssignmentId;
};

/**
 * Subscribe the signed-in student's device to their own controls. Returns the
 * unsubscribe function; no student id, no listener. (`listen` is Firestore's
 * onSnapshot; the suite passes a recorder to count listeners.)
 */
export const subscribeStudentAssignmentControls = ({ db, studentId, onChange, onError, listen = onSnapshot }) => {
  const owner = clean(studentId);
  if (!db || !owner) return () => {};
  return listen(
    studentAssignmentControlsQuery(db, owner),
    (snapshot) => onChange?.({
      byAssignmentId: ownControlsByAssignment(snapshot.docs, owner),
      fromCache: snapshot.metadata?.fromCache === true,
    }),
    (error) => onError?.(error),
  );
};

/** The controls if, and only if, they belong to `studentId`. */
export const controlsForStudent = (controls, studentId) => {
  const owner = clean(studentId);
  return owner && controls && controls.ownerId === owner ? controls : EMPTY_STUDENT_CONTROLS;
};

/**
 * What to hand the resolver for one assignment:
 *   a record — the student's private controls;
 *   null      — private storage was read and holds nothing for it;
 *   undefined — not read yet (or unreadable): the student's own shared entry,
 *               which the mirror keeps complete until the shared copy retires.
 */
export const privateOverrideFor = (controls, assignmentId) => {
  if (!controls || controls.status !== STUDENT_CONTROLS_STATUS.READY) return undefined;
  return controls.byAssignmentId?.[clean(assignmentId)] ?? null;
};

/**
 * Every lesson the device holds, as THIS student experiences it. Run on lessons
 * that are already peer-free (studentAssignmentScope.js); the view is applied
 * again here so a caller can never skip the strip.
 */
export const projectStudentAssignments = ({ assignments = [], studentId = null, profile = null, controls = EMPTY_STUDENT_CONTROLS } = {}) => {
  const owner = clean(studentId);
  if (!owner) return [];
  const own = controlsForStudent(controls, owner);
  return (assignments || []).filter((assignment) => assignment?.id).map((assignment) => withStudentSupportDates(
    studentAssignmentView(assignment, { studentId: owner, privateOverride: privateOverrideFor(own, assignment.id) }),
    owner,
    profile,
  ));
};

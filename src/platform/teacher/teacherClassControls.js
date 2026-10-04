import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  teacherAssignmentView,
} from '../../../functions/shared/studentAssignmentOverrides.mjs';

/*
 * A TEACHER'S VIEW OF THEIR STUDENTS' OWN ASSIGNMENT CONTROLS — ONE LISTENER.
 *
 * Each student's extension, excusal, reopen and extra DOL attempts on an
 * assignment are a private record (studentAssignmentOverrides). A teacher's
 * screens — the gradebook drill, the assignment hub's individual deadlines,
 * Grade Export's holds, the Action Center, Live Classroom's "extension
 * through…", attendance reconciliation, the case review and the support
 * report — read them through teacherAssignmentView, which merges the records
 * into `studentOverrides` of the teacher's in-memory copy of each lesson and
 * changes nothing else (functions/shared/studentAssignmentOverrides.mjs).
 *
 * THE SCOPE IS THE CLASSES ON SCREEN, NEVER THE SCHOOL. One query, bounded by
 * those classes' controls and independent of how many students or lessons
 * they have:
 *
 *   teacher     where('authorizedTeacherEmails', 'array-contains', me)
 *               .where('classId', '==' | 'in', classes)
 *   root admin  where('classId', '==' | 'in', classes)   (rules: reads all)
 *
 * The classes are, in order: the class the teacher is working in, then any
 * other class a visible surface is showing (Live Classroom's class in session,
 * the assignment hub's class, the attendance panel's class, the class of the
 * student whose report is open), and — only on the tabs that are inherently
 * cross-class (Grade Export, the Action Center, Parent Contacts) — the classes
 * the teacher teaches. At most MAX_TEACHER_CONTROLS_CLASSES (Firestore's `in`
 * limit). When the set changes the listener is REPLACED: the old one is torn
 * down before the new one opens, so there is never more than one, and none
 * survives a class switch, a route change or sign-out.
 *
 * A record's classId is the student's CURRENT class (a class move
 * re-authorizes the record and keeps the origin teacher on it), so a
 * student's records — including those on a previous class's lessons — come
 * with their current class.
 */

export const MAX_TEACHER_CONTROLS_CLASSES = 30;

export const TEACHER_CONTROLS_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const EMPTY_TEACHER_CONTROLS = Object.freeze({
  scopeKey: '',
  status: TEACHER_CONTROLS_STATUS.IDLE,
  classIds: Object.freeze([]),
  byAssignment: Object.freeze({}),
  recordCount: 0,
});

/** Ordered, de-duplicated, bounded: the active class first. */
export const normalizeControlsClassIds = (classIds = []) => {
  const seen = new Set();
  const ids = [];
  (Array.isArray(classIds) ? classIds : [classIds]).forEach((value) => {
    const id = clean(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids.slice(0, MAX_TEACHER_CONTROLS_CLASSES);
};

/**
 * The classes whose controls the teacher's screens need right now.
 *
 *   activeClassId    the class the teacher is working in (Home, Classes,
 *                    Gradebook follow it)
 *   surfaceClassIds  other classes a visible surface is showing
 *   crossClassTab    Grade Export / Action Center / Parent Contacts
 *   taughtClassIds   the classes the viewer is teacher of record for
 */
export const teacherControlsClassIds = ({
  activeClassId = null,
  surfaceClassIds = [],
  crossClassTab = false,
  taughtClassIds = [],
} = {}) => normalizeControlsClassIds([
  activeClassId,
  ...(Array.isArray(surfaceClassIds) ? surfaceClassIds : []),
  ...(crossClassTab && Array.isArray(taughtClassIds) ? taughtClassIds : []),
]);

/** A stable identity for one listener: who is looking, and at which classes. */
export const teacherControlsScopeKey = ({ email = '', isRootAdmin = false, classIds = [] } = {}) => {
  const ids = normalizeControlsClassIds(classIds);
  const viewer = clean(email).toLowerCase();
  if (!ids.length || (!viewer && !isRootAdmin)) return '';
  return JSON.stringify({ viewer, root: isRootAdmin === true, classIds: ids });
};

export const decodeTeacherControlsScope = (scopeKey) => {
  try {
    const parsed = JSON.parse(scopeKey);
    return {
      email: clean(parsed?.viewer),
      isRootAdmin: parsed?.root === true,
      classIds: normalizeControlsClassIds(parsed?.classIds),
    };
  } catch {
    return null;
  }
};

/** The one query for a scope (see the header). */
export const teacherClassControlsQuery = (db, { email = '', isRootAdmin = false, classIds = [] } = {}) => {
  const ids = normalizeControlsClassIds(classIds);
  if (!ids.length) throw new Error('A class is required to read students’ controls.');
  const byClass = ids.length === 1 ? where('classId', '==', ids[0]) : where('classId', 'in', ids);
  if (isRootAdmin) return query(collection(db, STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION), byClass);
  const viewer = clean(email).toLowerCase();
  if (!viewer) throw new Error('A teacher email is required to read students’ controls.');
  return query(
    collection(db, STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION),
    where('authorizedTeacherEmails', 'array-contains', viewer),
    byClass,
  );
};

/**
 * The listener's documents as assignment id → student id → record, keeping
 * only the classes asked for (the query already does; a projection does not
 * rely on it).
 */
export const controlsByAssignment = (documents = [], classIds = []) => {
  const allowed = new Set(normalizeControlsClassIds(classIds));
  const byAssignment = {};
  let recordCount = 0;
  (documents || []).forEach((document) => {
    const data = typeof document?.data === 'function' ? document.data() : document;
    if (!isObject(data)) return;
    const assignmentId = clean(data.assignmentId);
    const studentId = clean(data.studentId);
    if (!assignmentId || !studentId || (allowed.size && !allowed.has(clean(data.classId)))) return;
    if (!byAssignment[assignmentId]) byAssignment[assignmentId] = {};
    byAssignment[assignmentId][studentId] = data;
    recordCount += 1;
  });
  return { byAssignment, recordCount };
};

/**
 * Subscribe one scope. Returns the unsubscribe function (a no-op for no
 * scope). (`listen` is Firestore's onSnapshot; the suite passes a recorder.)
 */
export const subscribeTeacherClassControls = ({ db, scopeKey, onChange, onError, listen = onSnapshot }) => {
  const scope = scopeKey ? decodeTeacherControlsScope(scopeKey) : null;
  if (!db || !scope || !scope.classIds.length) return () => {};
  return listen(
    teacherClassControlsQuery(db, scope),
    (snapshot) => onChange?.({ ...controlsByAssignment(snapshot.docs, scope.classIds), fromCache: snapshot.metadata?.fromCache === true }),
    (error) => onError?.(error),
  );
};

/** Controls for this scope only; anything held for another scope (or viewer) is not returned. */
export const controlsForScope = (controls, scopeKey) => (
  scopeKey && controls && controls.scopeKey === scopeKey ? controls : EMPTY_TEACHER_CONTROLS
);

/**
 * The teacher's lessons with their students' controls merged in. Only
 * `studentOverrides` changes (teacherAssignmentView): no client may write it,
 * and every teacher action that writes `dol`, `warmup` or `sectionAccess`
 * still writes exactly what the shared document said.
 */
export const projectTeacherAssignments = ({ assignments = [], controls = EMPTY_TEACHER_CONTROLS } = {}) => {
  const byAssignment = isObject(controls?.byAssignment) ? controls.byAssignment : {};
  return (assignments || []).map((assignment) => (
    assignment?.id ? teacherAssignmentView(assignment, byAssignment[assignment.id] || {}) : assignment
  ));
};

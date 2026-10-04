import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { studentAssignmentView } from '../../../functions/shared/studentAssignmentOverrides.mjs';

/*
 * WHAT A STUDENT'S DEVICE READS FROM `assignments`.
 *
 * It used to be the whole collection: every class's assignments, with every
 * other class's per-student entries, delivered to every student's Chromebook
 * and re-delivered on every write anywhere in the school (PR #407 deep dive
 * F-PRIV-1 and §10.1). A student needs two things:
 *
 *   1. their own class's assignments, live — the class query below, which is
 *      also the only student list the scoped rule allows (firestore.rules);
 *   2. any assignment they have recorded work on that is not their current
 *      class's — work from before a class move still feeds their mastery
 *      profile, sign-in grade repair and resume — read once, by id.
 *
 * NO CLASSMATE'S CONTROLS SURVIVE THE SNAPSHOT. Until the migration's strip
 * (docs/architecture/student-assignment-overrides.md §11, Stage 4) a shared
 * assignment can still physically carry every classmate's extension entry,
 * excusal, reopen, DOL attempt grant and recovery-log entry. Every document
 * this module hands the app is first reduced to ONE student's view
 * (studentAssignmentView, functions/shared/studentAssignmentOverrides.mjs):
 * the classmates' forms are gone and only this student's own shared entry is
 * left, to be merged with their private record later
 * (studentAssignmentControls.js). So no student-side object — state, ref,
 * model, cache of ours — ever holds the classmate map just because Firestore
 * still sent a legacy document. Without a student id nothing per-student is
 * kept at all: the view fails closed.
 *
 * Teachers keep the whole-collection listener; their screens span classes.
 */

export const MAX_PRIOR_WORK_ASSIGNMENTS = 200;

const cleanId = (value) => String(value ?? '').trim();

const byDueDate = (a, b) => String(a.dueAt || a.dueDate || '').localeCompare(String(b.dueAt || b.dueDate || ''));

/** The query a student's device lists: their class's assignments and nothing else. */
export const studentClassAssignmentsQuery = (db, classId) => query(
  collection(db, 'assignments'),
  where('assignedClassIds', 'array-contains', cleanId(classId)),
);

/**
 * Assignments the student has recorded work on that `loadedIds` does not
 * already hold, plus any explicitly needed id (a resume target). Sorted and
 * capped, so the result is stable for a given set of work.
 */
export const priorWorkAssignmentIds = ({ gradesByAssignment = {}, loadedIds = [], extraIds = [] } = {}) => {
  const loaded = new Set((loadedIds || []).map(cleanId));
  const wanted = new Set([
    ...Object.keys(gradesByAssignment && typeof gradesByAssignment === 'object' ? gradesByAssignment : {}),
    ...(extraIds || []),
  ].map(cleanId).filter(Boolean));
  return [...wanted].filter((id) => !loaded.has(id)).sort().slice(0, MAX_PRIOR_WORK_ASSIGNMENTS);
};

/** A stable key for "which assignments does this student have work on". */
export const workedAssignmentKey = (gradesByAssignment = {}) => Object.keys(
  gradesByAssignment && typeof gradesByAssignment === 'object' ? gradesByAssignment : {},
).sort().join('|');

/** One list, each assignment once (the class's live copy wins), sorted by due date like the old listener. */
export const mergeStudentAssignments = (classAssignments = [], priorWorkAssignments = []) => {
  const merged = new Map();
  (priorWorkAssignments || []).forEach((assignment) => { if (assignment?.id) merged.set(assignment.id, assignment); });
  (classAssignments || []).forEach((assignment) => { if (assignment?.id) merged.set(assignment.id, assignment); });
  return [...merged.values()].sort(byDueDate);
};

/**
 * One shared assignment as `studentId` may hold it: their own shared entry
 * (if any) and no classmate's. The only door from a Firestore snapshot into
 * the student's app.
 */
export const studentScopedAssignment = (id, data, studentId) => ({
  id,
  ...studentAssignmentView(data && typeof data === 'object' ? data : {}, { studentId: cleanId(studentId) || null }),
});

const snapshotToStudentAssignment = (snapshot, studentId) => studentScopedAssignment(snapshot.id, snapshot.data(), studentId);

/** Read assignments one id at a time (the rules allow any signed-in user to open one by id). */
export const fetchAssignmentsById = async (db, ids = [], { studentId = null } = {}) => {
  const snapshots = await Promise.all((ids || []).map((id) => getDoc(doc(db, 'assignments', id)).catch(() => null)));
  return snapshots.filter((snapshot) => snapshot?.exists?.()).map((snapshot) => snapshotToStudentAssignment(snapshot, studentId));
};

/** The student's class assignments once, plus their prior work by id. */
export const fetchStudentAssignments = async ({
  db, studentId = null, classId = null, gradesByAssignment = {}, extraIds = [],
} = {}) => {
  const classAssignments = cleanId(classId)
    ? (await getDocs(studentClassAssignmentsQuery(db, classId))).docs.map((snapshot) => snapshotToStudentAssignment(snapshot, studentId))
    : [];
  const priorIds = priorWorkAssignmentIds({
    gradesByAssignment,
    loadedIds: classAssignments.map((assignment) => assignment.id),
    extraIds,
  });
  const priorWork = await fetchAssignmentsById(db, priorIds, { studentId });
  return mergeStudentAssignments(classAssignments, priorWork);
};

/** Live class assignments for a student; `onChange` receives that student's views. */
export const subscribeStudentClassAssignments = ({
  db, studentId = null, classId, onChange, onError, listen = onSnapshot,
}) => {
  if (!cleanId(classId)) {
    onChange?.([]);
    return () => {};
  }
  return listen(
    studentClassAssignmentsQuery(db, classId),
    (snapshot) => onChange?.(snapshot.docs.map((entry) => snapshotToStudentAssignment(entry, studentId))),
    (error) => onError?.(error),
  );
};

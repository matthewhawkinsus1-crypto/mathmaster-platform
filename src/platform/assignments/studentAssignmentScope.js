import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';

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

const snapshotToAssignment = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

/** Read assignments one id at a time (the rules allow any signed-in user to open one by id). */
export const fetchAssignmentsById = async (db, ids = []) => {
  const snapshots = await Promise.all((ids || []).map((id) => getDoc(doc(db, 'assignments', id)).catch(() => null)));
  return snapshots.filter((snapshot) => snapshot?.exists?.()).map(snapshotToAssignment);
};

/** The student's class assignments once, plus their prior work by id. */
export const fetchStudentAssignments = async ({ db, classId = null, gradesByAssignment = {}, extraIds = [] } = {}) => {
  const classAssignments = cleanId(classId)
    ? (await getDocs(studentClassAssignmentsQuery(db, classId))).docs.map(snapshotToAssignment)
    : [];
  const priorIds = priorWorkAssignmentIds({
    gradesByAssignment,
    loadedIds: classAssignments.map((assignment) => assignment.id),
    extraIds,
  });
  const priorWork = await fetchAssignmentsById(db, priorIds);
  return mergeStudentAssignments(classAssignments, priorWork);
};

/** Live class assignments for a student; `onChange` receives the raw list. */
export const subscribeStudentClassAssignments = ({ db, classId, onChange, onError }) => {
  if (!cleanId(classId)) {
    onChange?.([]);
    return () => {};
  }
  return onSnapshot(
    studentClassAssignmentsQuery(db, classId),
    (snapshot) => onChange?.(snapshot.docs.map(snapshotToAssignment)),
    (error) => onError?.(error),
  );
};

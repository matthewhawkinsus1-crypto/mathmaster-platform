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

/*
 * NO STUDENT'S EARLIER WORK IS LEFT UNREAD (MP01).
 *
 * This used to be a CAP, MAX_PRIOR_WORK_ASSIGNMENTS = 200: each read took the
 * first 200 ids in sort order and silently dropped the rest. A student with more
 * than 200 graded assignments outside their current class (a move between
 * classes, a repeated course) then showed less mastery evidence in the scoped
 * read than the old whole-collection read gave, with nothing to say so. The
 * owner decided to lift it (MP01, 2026-10-23).
 *
 * Every id is read now. 200 is the size of ONE round of reads, the most this
 * read ever had in flight at once, so a student at or under it reads exactly
 * as before and a larger account takes a few rounds, one after the other,
 * instead of an unbounded burst on a Chromebook. The ids come from the
 * student's own grade document, which only the server writes, so the number
 * is bounded by the work they have actually done.
 */
export const PRIOR_WORK_READ_BATCH = 200;

const cleanId = (value) => String(value ?? '').trim();

const byDueDate = (a, b) => String(a.dueAt || a.dueDate || '').localeCompare(String(b.dueAt || b.dueDate || ''));

/** The query a student's device lists: their class's assignments and nothing else. */
export const studentClassAssignmentsQuery = (db, classId) => query(
  collection(db, 'assignments'),
  where('assignedClassIds', 'array-contains', cleanId(classId)),
);

/**
 * Assignments the student has recorded work on that `loadedIds` does not
 * already hold, plus any explicitly needed id (a resume target). All of them,
 * sorted, so the result is stable for a given set of work (PRIOR_WORK_READ_BATCH
 * says how they are read; there is no longer a cap).
 */
export const priorWorkAssignmentIds = ({ gradesByAssignment = {}, loadedIds = [], extraIds = [] } = {}) => {
  const loaded = new Set((loadedIds || []).map(cleanId));
  const wanted = new Set([
    ...Object.keys(gradesByAssignment && typeof gradesByAssignment === 'object' ? gradesByAssignment : {}),
    ...(extraIds || []),
  ].map(cleanId).filter(Boolean));
  return [...wanted].filter((id) => !loaded.has(id)).sort();
};

/**
 * A stable key for "which assignments does this student need by id": the ones
 * they have work on, plus any named in `extraIds` (a Test they were added to
 * on their own, before they have done anything on it).
 */
export const workedAssignmentKey = (gradesByAssignment = {}, extraIds = []) => [...new Set([
  ...Object.keys(gradesByAssignment && typeof gradesByAssignment === 'object' ? gradesByAssignment : {}),
  ...(extraIds || []).map(cleanId).filter(Boolean),
])].sort().join('|');

/*
 * A TEST A STUDENT WAS ADDED TO ON THEIR OWN.
 *
 * A teacher can add one student to a secure Test without assigning their
 * class. The class query above can never return that assignment, so it is read
 * by id — and the proof that it is theirs is on the student's own grade
 * document: `testCycleGrades[assignmentId].individuallyAssigned`, which only
 * the server writes (firestore.rules refuses every client write to that map).
 * The device marks its own copy of the assignment so every list that asks
 * "is this for this student?" (assignmentIsForStudent) says yes. The mark is
 * display only: the server decides again, from its own record, on every call.
 */
export const individuallyAssignedTestCycleIds = (testCycleGrades = {}) => Object.entries(
  testCycleGrades && typeof testCycleGrades === 'object' ? testCycleGrades : {},
)
  .filter(([, projection]) => projection?.individuallyAssigned === true)
  .map(([assignmentId]) => cleanId(assignmentId))
  .filter(Boolean)
  .sort();

export const markIndividuallyAssigned = (assignments = [], assignmentIds = []) => {
  const wanted = new Set((assignmentIds || []).map(cleanId).filter(Boolean));
  if (!wanted.size) return assignments || [];
  return (assignments || []).map((assignment) => (
    assignment?.id && wanted.has(assignment.id) ? { ...assignment, assignedToStudentIndividually: true } : assignment
  ));
};

/** One list, each assignment once (the class's live copy wins), sorted by due date like the old listener. */
export const mergeStudentAssignments = (classAssignments = [], priorWorkAssignments = []) => {
  const merged = new Map();
  (priorWorkAssignments || []).forEach((assignment) => { if (assignment?.id) merged.set(assignment.id, assignment); });
  (classAssignments || []).forEach((assignment) => { if (assignment?.id) merged.set(assignment.id, assignment); });
  return [...merged.values()].sort(byDueDate);
};

/*
 * WHO ACTED STAYS WITH STAFF. A class's DOL attempt grant, its recovery,
 * early-unlock and close windows, and its class-scoped recovery-log entries
 * are class-wide — every student in the class needs their counts and dates —
 * but each also names the teacher who acted (`changedBy`, `openedBy`,
 * `unlockedBy`, `closedBy`, `teacherId`: a staff uid). The student's copy
 * keeps the class-wide facts and drops the names. The teacher's own copy, the
 * stored document and the staff-only history
 * (grades/{sid}/assignmentOverrideEvents) keep them.
 */
const STAFF_ACTOR_KEYS = new Set(['changedBy', 'openedBy', 'unlockedBy', 'closedBy', 'teacherId']);

const withoutStaffActors = (value) => {
  if (Array.isArray(value)) return value.map(withoutStaffActors);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !STAFF_ACTOR_KEYS.has(key))
    .map(([key, item]) => [key, withoutStaffActors(item)]));
};

/** A lesson's `dol` as a student's device keeps it: every class-wide fact, nobody's name. */
export const studentFacingDol = (assignment) => (
  assignment && typeof assignment === 'object' && assignment.dol && typeof assignment.dol === 'object' && !Array.isArray(assignment.dol)
    ? { ...assignment, dol: withoutStaffActors(assignment.dol) }
    : assignment
);

/**
 * One shared assignment as `studentId` may hold it: their own shared entry
 * (if any), no classmate's, and no staff member's name. The only door from a
 * Firestore snapshot into the student's app.
 */
export const studentScopedAssignment = (id, data, studentId) => ({
  id,
  ...studentFacingDol(studentAssignmentView(data && typeof data === 'object' ? data : {}, { studentId: cleanId(studentId) || null })),
});

const snapshotToStudentAssignment = (snapshot, studentId) => studentScopedAssignment(snapshot.id, snapshot.data(), studentId);

/**
 * Read assignments one id at a time (the rules allow any signed-in user to open
 * one by id), PRIOR_WORK_READ_BATCH at a time, in the order given. An id that
 * cannot be read is skipped; it never fails the others. `readOne` is the seam
 * for a test (it returns a snapshot or null); the app reads the real document.
 */
export const fetchAssignmentsById = async (db, ids = [], {
  studentId = null,
  readOne = (id) => getDoc(doc(db, 'assignments', id)).catch(() => null),
} = {}) => {
  const wanted = ids || [];
  const snapshots = [];
  for (let start = 0; start < wanted.length; start += PRIOR_WORK_READ_BATCH) {
    // One round at a time: the next starts when this one is back.
    // eslint-disable-next-line no-await-in-loop
    snapshots.push(...await Promise.all(wanted.slice(start, start + PRIOR_WORK_READ_BATCH).map((id) => readOne(id))));
  }
  return snapshots.filter((snapshot) => snapshot?.exists?.()).map((snapshot) => snapshotToStudentAssignment(snapshot, studentId));
};

/** The student's class assignments once, plus their prior work by id. */
export const fetchStudentAssignments = async ({
  db, studentId = null, classId = null, gradesByAssignment = {}, extraIds = [], individualAssignmentIds = [], readOne,
} = {}) => {
  const classAssignments = cleanId(classId)
    ? (await getDocs(studentClassAssignmentsQuery(db, classId))).docs.map((snapshot) => snapshotToStudentAssignment(snapshot, studentId))
    : [];
  const priorIds = priorWorkAssignmentIds({
    gradesByAssignment,
    loadedIds: classAssignments.map((assignment) => assignment.id),
    extraIds: [...(extraIds || []), ...(individualAssignmentIds || [])],
  });
  const priorWork = markIndividuallyAssigned(await fetchAssignmentsById(db, priorIds, { studentId, readOne }), individualAssignmentIds);
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

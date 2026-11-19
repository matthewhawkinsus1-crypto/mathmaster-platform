/*
 * THE BROWSER'S SIDE OF A QUESTION RECORD STORED SPLIT.
 *
 * A record's summary lives in grades/{studentId}.gradesByAssignment[a][q]; its
 * detail (parts, steps, last response, support flags, algebra state, family
 * pin) lives in grades/{studentId}/responseDetail/{a}.questions[q], tied by one
 * detailRef (functions/shared/gradeEntryStorage.mjs). Since Nov 16, 2026 the
 * grades document was approaching Firestore's 1 MiB cap.
 *
 * Every screen reads records whole: a load point joins the grades document to
 * the student's detail (withResponseDetail) before anything else sees it, so
 * the screens are unchanged. Firestore rules let exactly who may read a grades
 * document read its responseDetail.
 *
 * A browser that WRITES records (a teacher's live-question correction, the
 * current-grader repair) writes them as the functions do (writeTrackerSplit):
 * split with settings/serverGrading.splitGradeRecords on (readSplitSwitch);
 * until then whole, except a record already stored split
 * (gradeEntryStorage.mjs recordForStorage). It writes only from a tracker
 * whose records were all joined: writing a summary that never met its detail
 * would orphan the detail, so that is refused.
 */
import {
  FieldPath,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  DETAIL_FIELDS,
  RESPONSE_DETAIL_COLLECTION,
  assignmentsWithSplitRecords,
  hydrateGradeDocument,
  isSplitSummary,
  splitSwitchOn,
  trackerForStorage,
} from '../../../functions/shared/gradeEntryStorage.mjs';

export { RESPONSE_DETAIL_COLLECTION };

const detailCollection = (db, studentId) => collection(db, 'grades', String(studentId), RESPONSE_DETAIL_COLLECTION);
export const responseDetailDoc = (db, studentId, assignmentId) => doc(db, 'grades', String(studentId), RESPONSE_DETAIL_COLLECTION, String(assignmentId));

/** Whether this grades document has any record whose detail is stored apart. */
export const needsResponseDetail = (gradeData) => assignmentsWithSplitRecords(gradeData).length > 0;

/** The grades document joined to a { [assignmentId]: detail document } map. */
export const withResponseDetail = (gradeData, detailByAssignment) => hydrateGradeDocument(gradeData, detailByAssignment || {});

const detailMapOf = (snapshot) => {
  const detail = {};
  snapshot.forEach((detailDoc) => { detail[detailDoc.id] = detailDoc.data(); });
  return detail;
};

/** One student's stored detail, every assignment (one query). */
export const loadResponseDetail = async (db, studentId) => detailMapOf(await getDocs(detailCollection(db, studentId)));

/** A grades document read once and joined (no read when nothing is stored apart). */
export const joinResponseDetail = async (db, studentId, gradeData) => {
  if (!gradeData || !needsResponseDetail(gradeData)) return gradeData;
  return withResponseDetail(gradeData, await loadResponseDetail(db, studentId));
};

/** Live detail for one student: onDetail({ [assignmentId]: data }). Returns the unsubscribe. */
export const subscribeResponseDetail = (db, studentId, onDetail, onError = () => {}) => onSnapshot(
  detailCollection(db, studentId),
  (snapshot) => onDetail(detailMapOf(snapshot)),
  onError,
);

/**
 * Live detail for a roster of students: one listener each, all released by the
 * returned cleanup. onChange(detailByStudent) fires with a Map of every
 * student whose detail has arrived ({ [assignmentId]: data } per student).
 */
export const subscribeResponseDetailRoster = (db, studentIds, onChange, onError = () => {}) => {
  const detailByStudent = new Map();
  const ids = [...new Set([...(studentIds || [])].map(String))];
  const unsubscribes = ids.map((id) => subscribeResponseDetail(db, id, (detail) => {
    detailByStudent.set(id, detail);
    onChange(detailByStudent);
  }, onError));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
};

/** Read one assignment's detail in a client transaction and join it (reads before writes). */
export const joinTrackerInTransaction = async (transaction, db, studentId, gradeData, assignmentId) => {
  if (!gradeData || !assignmentsWithSplitRecords(gradeData, [assignmentId]).length) return gradeData;
  const snapshot = await transaction.get(responseDetailDoc(db, studentId, assignmentId));
  return withResponseDetail(gradeData, { [String(assignmentId)]: snapshot.exists() ? snapshot.data() : null });
};

/** A record that names a stored detail but was never joined to it (no detail field present). */
const unjoined = (record) => isSplitSummary(record) && !DETAIL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(record, field));

/** Whether every record of a tracker is whole (joined, or stored inline). */
export const trackerFullyJoined = (tracker) => !tracker || typeof tracker !== 'object'
  || Object.values(tracker).every((record) => !unjoined(record));

export class UnjoinedTrackerError extends Error {
  constructor(studentId, assignmentId) {
    super(`The saved work for student ${studentId} on assignment ${assignmentId} has not finished loading; nothing was written for them.`);
    this.name = 'UnjoinedTrackerError';
  }
}

/**
 * Whether settings/serverGrading.splitGradeRecords is on, read now (the
 * operator turns it on after a release, while a teacher's tab stays open).
 * Off when it cannot be read: a record is then written whole, as the browsers
 * still open from before the split read it.
 */
export const readSplitSwitch = async (db) => {
  try {
    return splitSwitchOn((await getDoc(doc(db, 'settings', 'serverGrading'))).data());
  } catch {
    return false;
  }
};

/**
 * Write one assignment's whole tracker on `writer` (a client batch or
 * transaction): its records replace the tracker on the grades document, split
 * when `splitAll` (readSplitSwitch) or already stored split, and when any is
 * split or was, the detail document is replaced to match. Refuses a tracker
 * that is not whole. Returns the records written (for the caller's own state).
 */
export const writeTrackerSplit = ({ db, writer, studentId, assignmentId, tracker, splitAll = false }) => {
  if (!trackerFullyJoined(tracker)) throw new UnjoinedTrackerError(studentId, assignmentId);
  const { summaries, details, hadSplit } = trackerForStorage(tracker, { splitAll });
  writer.update(doc(db, 'grades', String(studentId)), new FieldPath('gradesByAssignment', String(assignmentId)), summaries);
  if (hadSplit || Object.keys(details).length) {
    writer.set(responseDetailDoc(db, studentId, assignmentId), {
      studentId: String(studentId),
      assignmentId: String(assignmentId),
      questions: details,
      updatedAt: serverTimestamp(),
    });
  }
  return summaries;
};


/**
 * The server's trackers as a student's open session may adopt them: joined to
 * the detail that has arrived, with any record whose detail has NOT arrived
 * yet left out. The grades document and its detail are written together but
 * reach a listener as two snapshots; adopting a summary in between would show
 * the question without its parts, and the joined record would then not read as
 * an advance. Left out, it is adopted whole when its detail arrives.
 */
export const serverTrackersForAdoption = (gradesByAssignment, detailByAssignment) => {
  const joined = withResponseDetail({ gradesByAssignment: gradesByAssignment || {} }, detailByAssignment || {}).gradesByAssignment || {};
  const out = {};
  for (const [assignmentId, tracker] of Object.entries(joined)) {
    if (!tracker || typeof tracker !== 'object') { out[assignmentId] = tracker; continue; }
    out[assignmentId] = Object.fromEntries(Object.entries(tracker).filter(([, record]) => !unjoined(record)));
  }
  return out;
};

/*
 * READING AND WRITING A QUESTION RECORD THAT IS STORED SPLIT.
 *
 * functions/shared/gradeEntryStorage.mjs defines the split: a record's summary
 * stays in grades/{studentId}.gradesByAssignment[a][q] and its detail lives in
 * grades/{studentId}/responseDetail/{a}.questions[q], tied by one detailRef.
 * This is the Firestore side of it for the functions:
 *
 *   hydrateGradeData      a grades document with assignments joined to their detail
 *   questionRecordUpdates write one record: detail on the writer, summary returned
 *   writeSplitTracker     write a whole tracker: summaries and a replaced detail doc
 *   hydrateTrackerRows    rows of { ref, studentId, tracker } joined to their detail
 *
 * A reader that only grades (credit, status, attempts) may read the summary
 * alone: it carries `stepCredit`, and a read-only check over every production
 * record found a summary grades exactly as its full record. A reader that uses
 * the parts, steps, last response, support flags, algebra state or family pin
 * joins first.
 */
const { FieldPath, FieldValue } = require("firebase-admin/firestore");

const RESPONSE_DETAIL_COLLECTION = "responseDetail";

let storageModule = null;
async function gradeEntryStorage() {
  if (!storageModule) storageModule = await import("../shared/gradeEntryStorage.mjs");
  return storageModule;
}

function responseDetailRef(gradeRef, assignmentId) {
  return gradeRef.collection(RESPONSE_DETAIL_COLLECTION).doc(String(assignmentId));
}

/**
 * The grades document with the named assignments (all, when assignmentIds is
 * null) joined to their stored detail. In a transaction the detail is read in
 * it, so call this before the transaction's first write.
 */
async function hydrateGradeData({ db, transaction = null, gradeRef, gradeData, assignmentIds = null }) {
  if (!gradeData || typeof gradeData !== "object") return gradeData;
  const storage = await gradeEntryStorage();
  const ids = storage.assignmentsWithSplitRecords(gradeData, assignmentIds);
  if (!ids.length) return gradeData;
  const refs = ids.map((id) => responseDetailRef(gradeRef, id));
  const snapshots = transaction ? await transaction.getAll(...refs) : await (db || gradeRef.firestore).getAll(...refs);
  const detail = {};
  for (const snapshot of snapshots) if (snapshot.exists) detail[snapshot.id] = snapshot.data();
  return storage.hydrateGradeDocument(gradeData, detail);
}

/**
 * Store one question's record: the detail is set on `writer` (the caller's
 * transaction or batch), and the summary is returned as an update pair for the
 * caller's own update of the grades document.
 */
async function questionRecordUpdates({ writer, gradeRef, studentId, assignmentId, questionKey, record }) {
  const storage = await gradeEntryStorage();
  const { summary, detail } = storage.splitQuestionRecord(record);
  if (detail) {
    writer.set(responseDetailRef(gradeRef, assignmentId), {
      studentId: String(studentId || gradeRef.id),
      assignmentId: String(assignmentId),
      questions: { [String(questionKey)]: detail },
      updatedAt: FieldValue.serverTimestamp(),
    }, { mergeFields: ["studentId", "assignmentId", new FieldPath("questions", String(questionKey)), "updatedAt"] });
  }
  return [new FieldPath("gradesByAssignment", String(assignmentId), String(questionKey)), summary];
}

/**
 * Write a whole tracker split: its summaries replace the tracker on the grades
 * document and its detail document is replaced to match, so no question's old
 * detail survives. `storage` is the loaded gradeEntryStorage module (this stays
 * synchronous for callers inside a forEach).
 */
function writeSplitTracker(storage, writer, gradeRef, assignmentId, tracker) {
  const { summaries, details } = storage.splitTracker(tracker);
  writer.update(gradeRef, new FieldPath("gradesByAssignment", String(assignmentId)), summaries);
  writer.set(responseDetailRef(gradeRef, assignmentId), {
    studentId: gradeRef.id,
    assignmentId: String(assignmentId),
    questions: details,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Rows of { ref, studentId, tracker } for one assignment, each tracker joined to its detail. */
async function hydrateTrackerRows(rows, assignmentId, { db, transaction = null }) {
  const storage = await gradeEntryStorage();
  const needing = rows.filter((row) => storage.assignmentsWithSplitRecords({ gradesByAssignment: { [assignmentId]: row.tracker } }).length);
  if (!needing.length) return rows;
  const refs = needing.map((row) => responseDetailRef(row.ref, assignmentId));
  const snapshots = transaction ? await transaction.getAll(...refs) : await db.getAll(...refs);
  const detailByStudent = new Map(snapshots.map((snapshot, index) => [needing[index].studentId, snapshot.exists ? snapshot.data() : null]));
  return rows.map((row) => (detailByStudent.has(row.studentId)
    ? { ...row, tracker: storage.mergeTracker(row.tracker, detailByStudent.get(row.studentId)) }
    : row));
}

/*
 * MOVING A STUDENT'S RECORDS THAT ARE STILL STORED WHOLE.
 *
 * Records written before the split carry their detail inline on the grades
 * document. This moves every such record of one student into the split, in
 * one transaction: each is checked first (joined back it is the record; its
 * summary alone grades exactly as the record, by the browser's rules and the
 * Classroom runtime's), and a record that fails the check is left as it is.
 * It changes no grade: the Classroom triggers see the trackers change, compute
 * the same grade, and skip a column already synced with it.
 *
 * Run after a student's submissions are recorded (best effort, never in the
 * way of the submission itself), so the students whose records grow, the
 * ones doing work, move first.
 */
async function splitInlineRecords({ db, studentId }) {
  const storage = await gradeEntryStorage();
  const runtime = require("./classroomGradeRuntime");
  const extraChecks = [
    (record) => runtime.getQuestionCredit(record),
    (record) => runtime.isQuestionTerminal(record),
    (record) => runtime.questionWasAttempted(record),
  ];
  const gradeRef = db.collection("grades").doc(String(studentId));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(gradeRef);
    if (!snapshot.exists) return { split: 0, kept: 0 };
    const byAssignment = snapshot.data()?.gradesByAssignment || {};
    const updates = [];
    const detailByAssignment = {};
    let split = 0;
    let kept = 0;
    for (const [assignmentId, tracker] of Object.entries(byAssignment)) {
      if (!tracker || typeof tracker !== "object" || Array.isArray(tracker)) continue;
      for (const [questionKey, record] of Object.entries(tracker)) {
        if (!storage.isInlineRecord(record)) continue;
        const halves = storage.splitQuestionRecord(record);
        if (!storage.splitIsFaithful(record, halves, extraChecks)) { kept += 1; continue; }
        updates.push(new FieldPath("gradesByAssignment", assignmentId, questionKey), halves.summary);
        (detailByAssignment[assignmentId] ||= {})[questionKey] = halves.detail;
        split += 1;
      }
    }
    if (!split) return { split, kept };
    for (const [assignmentId, questions] of Object.entries(detailByAssignment)) {
      transaction.set(responseDetailRef(gradeRef, assignmentId), {
        studentId: String(studentId),
        assignmentId: String(assignmentId),
        questions,
        updatedAt: FieldValue.serverTimestamp(),
      }, {
        mergeFields: ["studentId", "assignmentId", "updatedAt", ...Object.keys(questions).map((key) => new FieldPath("questions", key))],
      });
    }
    transaction.update(gradeRef, ...updates);
    return { split, kept };
  });
}

module.exports = {
  splitInlineRecords,
  RESPONSE_DETAIL_COLLECTION,
  gradeEntryStorage,
  responseDetailRef,
  hydrateGradeData,
  questionRecordUpdates,
  writeSplitTracker,
  hydrateTrackerRows,
};

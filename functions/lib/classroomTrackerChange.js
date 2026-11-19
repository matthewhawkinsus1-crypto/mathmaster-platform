"use strict";

/*
 * TIME ON TASK MOVES NO CLASSROOM GRADE.
 *
 * Each Next writes the question's `timeSpent` back to its record
 * (ingestStudentSubmissions, a questionProgress envelope:
 * submissionIngestion.mjs questionProgressRecord), and nothing else in it. Both
 * grade triggers (syncGradeToClassroom, syncSectionGradeToClassroom) woke on
 * any change to a tracker and did their whole work, an assignment, its links
 * and the audit rows read, to compute the grade they had already sent. Nothing
 * either computes reads `timeSpent`: credit, attempts, terminal and meaningful
 * progress read status, attempts, partial and step credit, and a teacher's
 * override (assignmentGradeProgress, getQuestionCredit,
 * lib/classroomSectionGrade.js), and the stage reads those and the clock.
 *
 * So a tracker whose records differ only in `timeSpent` has not changed. Only
 * a record that exists, as an object, on both sides is read this way: a record
 * a Next creates for a question never answered is new (an empty record lets a
 * teacher's override for that question apply where no record does not), and a
 * legacy string record a Next turns into an object is a new shape. Both still
 * wake the triggers, as does every other field of every record.
 *
 * The same rule decides which grade inputs a teacher's sync of a retroactive
 * correction authorizes (lib/retroactiveAccommodation.js): the tracker without
 * its time on task. Only the two triggers and that check load this
 * (scripts/lib/functionsImportGraph.mjs).
 */
const isRecordObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const withoutTimeOnTask = (record) => {
  if (!isRecordObject(record) || !Object.prototype.hasOwnProperty.call(record, "timeSpent")) return record;
  const { timeSpent: _timeOnTask, ...rest } = record;
  return rest;
};

/*
 * A RECORD THAT ONLY MOVED INTO THE SPLIT HAS NOT CHANGED EITHER.
 *
 * After a student's submission, every record of theirs still stored whole is
 * moved into the split (lib/gradeDetailStore.js splitInlineRecords): its detail
 * fields leave the grades document and the summary gains `detailRef` and, when
 * steps earned any, `stepCredit`. That rewrites the tracker of every assignment
 * the student has, and it moves no grade: a summary grades exactly as its
 * record (shared/gradeEntryStorage.mjs). Read as a change, it sent both
 * triggers through every assignment, and the section trigger, whose evidence
 * fingerprint is taken over the stored records, sent every synced column to
 * Classroom again.
 *
 * So a record is unchanged when the stored one had no `detailRef`, the new one
 * has, and every field outside the detail list is the same. DETAIL_FIELDS is
 * gradeEntryStorage.mjs's list (an ES module this synchronous code cannot
 * import); tests/platform/classroomTimeOnTask.test.mjs holds the two equal.
 */
const DETAIL_FIELDS = Object.freeze([
  "partGrades",
  "stepGrades",
  "supportUsage",
  "lastResponseKey",
  "questionDetails",
  "algebraState",
  "familyDelivery",
  "familyDeliveryVerification",
  "liveCorrectionHistory",
]);
const SPLIT_MARKERS = ["detailRef", "stepCredit"];
const movedIntoSplit = (was, now) => {
  if (typeof now.detailRef !== "string" || !now.detailRef) return false;
  if (Object.prototype.hasOwnProperty.call(was, "detailRef")) return false;
  if (DETAIL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(now, field))) return false;
  const summaryOf = (record) => Object.fromEntries(Object.keys(record)
    .filter((field) => !DETAIL_FIELDS.includes(field) && !SPLIT_MARKERS.includes(field) && record[field] !== undefined)
    .sort()
    .map((field) => [field, record[field]]));
  return JSON.stringify(summaryOf(withoutTimeOnTask(was))) === JSON.stringify(summaryOf(withoutTimeOnTask(now)));
};

function trackerChangedBeyondTimeOnTask(before, after) {
  if (JSON.stringify(after) === JSON.stringify(before)) return false;
  if (!isRecordObject(before) || !isRecordObject(after)) return true;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(before, key) || !Object.prototype.hasOwnProperty.call(after, key)) return true;
    const [was, now] = [before[key], after[key]];
    if (!isRecordObject(was) || !isRecordObject(now)) {
      if (JSON.stringify(was) !== JSON.stringify(now)) return true;
      continue;
    }
    if (JSON.stringify(withoutTimeOnTask(was)) !== JSON.stringify(withoutTimeOnTask(now)) && !movedIntoSplit(was, now)) return true;
  }
  return false;
}

/** The tracker as a grade reads it: each record without its time on task. */
function trackerWithoutTimeOnTask(tracker) {
  if (!isRecordObject(tracker)) return tracker;
  return Object.fromEntries(Object.entries(tracker).map(([key, record]) => [key, withoutTimeOnTask(record)]));
}

module.exports = { DETAIL_FIELDS, trackerChangedBeyondTimeOnTask, trackerWithoutTimeOnTask };

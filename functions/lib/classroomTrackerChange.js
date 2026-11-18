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
    if (JSON.stringify(withoutTimeOnTask(was)) !== JSON.stringify(withoutTimeOnTask(now))) return true;
  }
  return false;
}

/** The tracker as a grade reads it: each record without its time on task. */
function trackerWithoutTimeOnTask(tracker) {
  if (!isRecordObject(tracker)) return tracker;
  return Object.fromEntries(Object.entries(tracker).map(([key, record]) => [key, withoutTimeOnTask(record)]));
}

module.exports = { trackerChangedBeyondTimeOnTask, trackerWithoutTimeOnTask };

"use strict";

/*
 * HOW MUCH ONE INSTANCE OF A CLASSROOM GRADE TRIGGER IS GIVEN.
 *
 * syncGradeToClassroom (functions/index.js) and syncSectionGradeToClassroom
 * (functions/classroomSectionEntry.js) fire on every write to grades/{studentId}.
 * Each event holds that student's grade document twice, before and after.
 * Measured on Oct 14, 2026, the document is about 300 KB and some exceed 700 KB.
 * The section trigger also reads the assignment, and one of those was 1.6 MB.
 *
 * A grade checkpoint or a teacher's "Reconcile section grades" flags every
 * student in a class at once. At the platform default of 80 events per
 * instance, the six checkpoints sent on Oct 14 (314 students) killed both
 * triggers at 512 MiB (512-537 MiB in use). A killed instance drops every
 * event it was holding, and neither trigger is retried.
 *
 * With at most 20 events an instance and the 20-instance cap these functions
 * deploy with, 400 events can be held at once.
 */
const CLASSROOM_GRADE_TRIGGER_CAPACITY = Object.freeze({
  memory: "1GiB",
  concurrency: 20,
});

module.exports = { CLASSROOM_GRADE_TRIGGER_CAPACITY };

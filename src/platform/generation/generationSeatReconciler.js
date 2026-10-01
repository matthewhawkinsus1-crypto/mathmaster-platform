/*
 * SEATING A CLASS FOR UNIQUE QUESTIONS — DONE BY THE TEACHER'S APP, AUTOMATICALLY.
 *
 * Class-wide uniqueness needs every student in a class to hold a distinct seat
 * (see functions/shared/questionGenerationIdentity.mjs). The roster is known
 * only to the teacher's app, so that is where seats are written: whenever an
 * assignment that uses question families is assigned to a class, or a class's
 * roster grows, the app appends seats for the students who lack one. The
 * teacher does nothing — there is no button, because routine uniqueness is not
 * a teacher task.
 *
 * Pure planning lives here; App.jsx performs the write inside a Firestore
 * transaction, re-planning against the freshly read document so two teacher
 * tabs cannot hand out the same seat twice.
 */

import { getSectionVariantMode } from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { isFamilyBackedQuestion } from '../../../functions/shared/questionFamilyInstance.mjs';
import {
  GENERATION_SEATS_VERSION,
  planSeatAdditions,
} from '../../../functions/shared/questionGenerationIdentity.mjs';

const clean = (value) => String(value ?? '').trim();

/**
 * Does any family-backed question on this assignment vary per student?
 * Shared sections give every student the same question by design, so an
 * assignment whose family questions are all shared needs no seats.
 */
export const assignmentNeedsGenerationSeats = (assignment) => getStoredAssignmentQuestions(assignment).some((question) => (
  isFamilyBackedQuestion(question)
  && getSectionVariantMode(assignment, clean(question?.activityRole).toLowerCase() || 'practice') !== 'shared'
));

/**
 * Every seat that should be added: [{ classId, token, seat }], append-only.
 *
 * Only active student accounts in a class the assignment is assigned to are
 * seated; the seat map never names a student id (tokens only).
 */
export const planGenerationSeatWrites = ({ assignment = null, students = [] } = {}) => {
  if (!assignment?.id || !assignmentNeedsGenerationSeats(assignment)) return [];
  const classIds = [...new Set((Array.isArray(assignment.assignedClassIds) ? assignment.assignedClassIds : []).map(clean).filter(Boolean))];
  const roster = Array.isArray(students) ? students : [];
  const writes = [];
  classIds.forEach((classId) => {
    const studentIds = roster
      .filter((student) => clean(student?.classId) === classId)
      .filter((student) => clean(student?.role || 'student') === 'student')
      .filter((student) => clean(student?.accountStatus || student?.status || 'active') !== 'disabled')
      .map((student) => clean(student?.id))
      .filter(Boolean);
    const additions = planSeatAdditions({ assignment, classId, studentIds });
    Object.entries(additions).forEach(([token, seat]) => writes.push({ classId, token, seat }));
  });
  return writes;
};

/** A cheap signature so the app re-plans only when the inputs changed. */
export const generationSeatPlanSignature = ({ assignment = null, students = [] } = {}) => {
  if (!assignment?.id || !assignmentNeedsGenerationSeats(assignment)) return null;
  const classIds = (Array.isArray(assignment.assignedClassIds) ? assignment.assignedClassIds : []).map(clean).sort();
  const rosterIds = (Array.isArray(students) ? students : [])
    .filter((student) => classIds.includes(clean(student?.classId)))
    .map((student) => `${clean(student?.classId)}:${clean(student?.id)}`)
    .sort();
  const seats = assignment.generationSeats?.byClassId || {};
  const seated = Object.entries(seats).map(([classId, entry]) => `${classId}:${Object.keys(entry || {}).length}`).sort();
  return `${assignment.id}|${classIds.join(',')}|${rosterIds.join(',')}|${seated.join(',')}`;
};

export { GENERATION_SEATS_VERSION };

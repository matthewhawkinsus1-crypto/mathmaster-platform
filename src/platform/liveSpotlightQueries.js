import {
  Timestamp, collection, query, where,
} from 'firebase/firestore';
import { SPOTLIGHT_REQUEST_COLLECTION, SPOTLIGHT_STATUS } from './liveSpotlight.js';

const activeStatuses = [SPOTLIGHT_STATUS.REQUESTED, SPOTLIGHT_STATUS.ACCEPTED];

// Firestore evaluates every value in an `in` filter against Security Rules.
// Keep each teacher query small enough that the class lookup plus roster
// membership lookups stay comfortably below the rules access-call limit.
export const SPOTLIGHT_TEACHER_QUERY_STUDENT_CHUNK_SIZE = 8;

const normalizeStudentIds = (studentIds = []) => [...new Set(
  studentIds
    .map((studentId) => String(studentId || '').trim())
    .filter(Boolean),
)];

export const activeTeacherSpotlightQuery = (db, {
  teacherEmail,
  classId,
  studentIds = [],
  now = Timestamp.now(),
}) => {
  const rosterStudentIds = normalizeStudentIds(studentIds);
  if (rosterStudentIds.length === 0) {
    throw new Error('Teacher Spotlight queries require at least one roster studentId.');
  }
  if (rosterStudentIds.length > SPOTLIGHT_TEACHER_QUERY_STUDENT_CHUNK_SIZE) {
    throw new Error(`Teacher Spotlight query exceeds the ${SPOTLIGHT_TEACHER_QUERY_STUDENT_CHUNK_SIZE}-student security chunk.`);
  }

  return query(
    collection(db, SPOTLIGHT_REQUEST_COLLECTION),
    where('teacherEmail', '==', teacherEmail),
    where('classId', '==', classId),
    where('studentId', 'in', rosterStudentIds),
    where('status', 'in', activeStatuses),
    where('expiresAt', '>', now),
  );
};

export const activeTeacherSpotlightQueries = (db, {
  teacherEmail,
  classId,
  studentIds = [],
  now = Timestamp.now(),
}) => {
  const rosterStudentIds = normalizeStudentIds(studentIds);
  const queries = [];
  for (let index = 0; index < rosterStudentIds.length; index += SPOTLIGHT_TEACHER_QUERY_STUDENT_CHUNK_SIZE) {
    queries.push(activeTeacherSpotlightQuery(db, {
      teacherEmail,
      classId,
      studentIds: rosterStudentIds.slice(index, index + SPOTLIGHT_TEACHER_QUERY_STUDENT_CHUNK_SIZE),
      now,
    }));
  }
  return queries;
};

export const activeStudentSpotlightQuery = (db, { studentId, now = Timestamp.now() }) => query(
  collection(db, SPOTLIGHT_REQUEST_COLLECTION),
  where('studentId', '==', studentId),
  where('status', 'in', activeStatuses),
  where('expiresAt', '>', now),
);

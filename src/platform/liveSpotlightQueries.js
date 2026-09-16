import {
  Timestamp, collection, query, where,
} from 'firebase/firestore';
import { SPOTLIGHT_REQUEST_COLLECTION, SPOTLIGHT_STATUS } from './liveSpotlight.js';

const activeStatuses = [SPOTLIGHT_STATUS.REQUESTED, SPOTLIGHT_STATUS.ACCEPTED];

export const activeTeacherSpotlightQuery = (db, { teacherEmail, classId, now = Timestamp.now() }) => query(
  collection(db, SPOTLIGHT_REQUEST_COLLECTION),
  where('teacherEmail', '==', teacherEmail),
  where('classId', '==', classId),
  where('status', 'in', activeStatuses),
  where('expiresAt', '>', now),
);

export const activeStudentSpotlightQuery = (db, { studentId, now = Timestamp.now() }) => query(
  collection(db, SPOTLIGHT_REQUEST_COLLECTION),
  where('studentId', '==', studentId),
  where('status', 'in', activeStatuses),
  where('expiresAt', '>', now),
);

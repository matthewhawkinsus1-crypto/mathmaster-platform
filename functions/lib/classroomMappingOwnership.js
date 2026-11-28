"use strict";

/**
 * IS A SAVED GOOGLE CLASSROOM COURSE MAPPING STILL ITS TEACHER'S?
 *
 * A mapping (classroomCourseMappings/{teacherUid__courseId}) is saved only by
 * the class's teacher of record or the root administrator
 * (saveClassroomCourseMapping). It names the teacher who saved it, not the
 * class's teacher today, and nothing deletes it when the class moves to
 * another teacher. Read as authority after that, it would let the former
 * teacher keep linking the class's students to Classroom accounts and
 * publishing to it (security review 2026-11-28, A3). Every reader asks this
 * first, so a mapping counts only while its teacher still teaches the class.
 */

const lower = (value) => String(value || "").trim().toLowerCase();

/** True when the mapping's teacher is still the class's teacher of record (or the root administrator). */
function mappingStillOwned(mapping, classRecord, { isRootAdminEmail = () => false } = {}) {
  const teacherEmail = lower(mapping?.teacherEmail);
  // A mapping saved before it recorded its teacher's email cannot be checked
  // here; it keeps its old meaning rather than stopping that teacher's
  // Classroom posts (the review's report lists this as not verified).
  if (!teacherEmail) return true;
  if (isRootAdminEmail(teacherEmail)) return true;
  return Boolean(classRecord) && lower(classRecord.teacherOfRecord) === teacherEmail;
}

/** The mappings among `mappings` that are still owned, reading each class once. */
async function ownedMappings(db, mappings, options = {}) {
  const classIds = [...new Set(mappings.map((mapping) => String(mapping?.classId || "")).filter((id) => id && !id.includes("/")))];
  const snapshots = classIds.length ? await db.getAll(...classIds.map((id) => db.collection("classes").doc(id)), { fieldMask: ["teacherOfRecord"] }) : [];
  const classes = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.exists ? snapshot.data() || {} : null]));
  return mappings.filter((mapping) => mappingStillOwned(mapping, classes.get(String(mapping?.classId || "")) || null, options));
}

module.exports = { mappingStillOwned, ownedMappings };

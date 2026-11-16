"use strict";

/*
 * WHOSE GOOGLE CLASSROOM PUBLICATION A TEACHER MAY SEE, AND ACT ON.
 *
 * A classroomLinks document records the teacher whose Google account made the
 * post, `teacherUid`. Every path that creates or claims one has written it
 * since Classroom V2 (Aug 17, 2026): the whole-assignment publish and its
 * forced repost, and the split-section publish and its forced repost. A link
 * that records a teacher is that teacher's alone.
 *
 * A link that records no teacher can only be older: the original integration
 * posted through one shared Google connection and did not record who posted.
 * It is shown, and acted on, only for a caller who manages its assignment, as
 * every other assignment callable decides it (assertTeacherMayManageAssignment
 * in functions/index.js): the root administrator, or the verified teacher of
 * record of every class the assignment is assigned to. Anyone else gets what
 * they get for another teacher's link: nothing.
 *
 * The six publication callables in functions/index.js ask this one rule:
 * updateAssignmentClassroomPublications, repairClassroomAssignmentPublications,
 * inspectClassroomPublication, removeAssignmentClassroomPackage,
 * listPublishedAssignments and listClassroomGradeSyncs.
 */

/** The teacher a link records, or "" when it records none. */
function linkTeacherUid(link) {
  return String(link?.teacherUid || "").trim();
}

/**
 * The `entries` this teacher may see and act on, in their order: each link
 * that records `teacherUid`, and each link that records no teacher whose
 * assignment `managesAssignment(assignmentId)` says the caller manages.
 *
 * `linkOf(entry)` is the entry's link data (the entry itself by default).
 * `managesAssignment` is asked at most once an assignment, and only for a link
 * that records no teacher, so a teacher's own links cost no reads.
 */
async function linksForTeacher(entries, { teacherUid, linkOf = (entry) => entry, managesAssignment }) {
  const caller = String(teacherUid || "").trim();
  const managed = new Map();
  const kept = [];
  for (const entry of entries) {
    const link = linkOf(entry) || {};
    const owner = linkTeacherUid(link);
    if (owner) {
      if (caller && owner === caller) kept.push(entry);
      continue;
    }
    const assignmentId = String(link.assignmentId || "").trim();
    if (!caller || !assignmentId) continue;
    if (!managed.has(assignmentId)) {
      // eslint-disable-next-line no-await-in-loop
      managed.set(assignmentId, (await managesAssignment(assignmentId)) === true);
    }
    if (managed.get(assignmentId)) kept.push(entry);
  }
  return kept;
}

module.exports = {
  linkTeacherUid,
  linksForTeacher,
};

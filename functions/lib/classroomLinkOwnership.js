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
 * The eight publication callables in functions/index.js ask this one rule.
 * Four act on one assignment and read its links by `assignmentId`:
 * updateAssignmentClassroomPublications, repairClassroomAssignmentPublications,
 * inspectClassroomPublication and removeAssignmentClassroomPackage. They keep
 * the links `linksForTeacher` gives them.
 *
 * Two queue a grade passback's resend: retryClassroomGradeSync, for the post
 * a monitor row names, and retryAllClassroomGradeSyncs, for the posts every
 * failed row names. They resend only for the posts `linksForTeacher` keeps:
 * to a caller who does not manage its assignment, a post that records no
 * teacher is refused, or left out, as another teacher's post is.
 *
 * The two lists, listPublishedAssignments and listClassroomGradeSyncs, read
 * the teacher's own links by `teacherUid`, a page at a time
 * (`readTeacherLinks`). They read every teacher's links before, any 500 (or
 * 2,000) of them unordered, and dropped a teacher's own past that. A link that
 * records no teacher cannot be found by `teacherUid`, and nothing else finds
 * it without reading every link, so the lists show it to nobody: its
 * assignment's teacher and the administrator still act on it through the four
 * callables above, and scripts/backfill-classroom-link-teachers.mjs stamps the
 * teacher on any that remain.
 */

const { FieldPath } = require("firebase-admin/firestore");

// A page of a teacher's links: the size of the read the lists replaced. Below
// it a list is one query reading exactly the teacher's links; an exact
// multiple costs one more query, which reads nothing (billed as one read).
const TEACHER_LINK_PAGE_SIZE = 500;
// 10,000 links. A read that reaches it stops and says so.
const TEACHER_LINK_MAX_PAGES = 20;
// From here a list warns: one teacher's publications have grown large enough
// for the screens to want their own paging.
const TEACHER_LINK_WARN_AT = 2000;

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

/**
 * Every classroomLinks document that records `teacherUid`, with only `fields`
 * when they are given, in document-id order, a page at a time (the pattern of
 * lib/classroomCheckpointScan.js). One equality filter, ordered by document id:
 * Firestore serves it from the automatic single-field index on `teacherUid`,
 * so it needs no composite index. `complete` is false only when the read
 * stopped at `maxPages` with a full last page.
 */
async function readTeacherLinks(db, teacherUid, {
  fields = null,
  pageSize = TEACHER_LINK_PAGE_SIZE,
  maxPages = TEACHER_LINK_MAX_PAGES,
} = {}) {
  const uid = String(teacherUid || "").trim();
  if (!uid) return { docs: [], pages: 0, complete: true };
  let base = db.collection("classroomLinks").where("teacherUid", "==", uid);
  if (fields) base = base.select(...fields);
  base = base.orderBy(FieldPath.documentId()).limit(pageSize);

  const docs = [];
  let pages = 0;
  let cursor = null;
  while (pages < maxPages) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await (cursor ? base.startAfter(cursor) : base).get();
    pages += 1;
    docs.push(...snapshot.docs);
    if (snapshot.docs.length < pageSize) return { docs, pages, complete: true };
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return { docs, pages, complete: false };
}

/** What a read of one teacher's `links` links is near or at: nothing, or one concern. */
function teacherLinkReadConcerns({ links, complete, warnAt = TEACHER_LINK_WARN_AT }) {
  if (!complete) return ["stopped-at-page-limit"];
  return links >= warnAt ? ["many-links"] : [];
}

module.exports = {
  TEACHER_LINK_MAX_PAGES,
  TEACHER_LINK_PAGE_SIZE,
  TEACHER_LINK_WARN_AT,
  linkTeacherUid,
  linksForTeacher,
  readTeacherLinks,
  teacherLinkReadConcerns,
};

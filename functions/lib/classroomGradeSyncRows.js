"use strict";

/*
 * THE GRADE PASSBACK MONITOR'S ROWS: A TEACHER'S OWN, READ BY THEIR OWN POSTS.
 *
 * A classroomGradeSyncs row is one student's grade on one Classroom post (one
 * column). Its id is gradeSyncDocumentId(publicationId, studentId)
 * (lib/publication.js), and both of its writers, writeGradeSyncAudit in
 * functions/index.js and in functions/classroomSectionEntry.js, store
 * `publicationId`, `studentId` and `updatedAt` (a server timestamp) on every
 * write, as they have since their first versions in this repository (Aug 30
 * and Sep 6, 2026). A row records no teacher: it is the teacher's whose post
 * it names.
 *
 * listClassroomGradeSyncs read the newest 500 rows of the whole school and
 * kept the caller's. Production holds a row per student and column, so a
 * teacher whose rows were not among the school's newest 500 saw part of their
 * monitor or none of it, and every call billed 500 rows, most of them other
 * teachers'. It now reads only the rows of the caller's own posts (their ids
 * come from lib/classroomLinkOwnership.js's readTeacherLinks): `in` queries of
 * 30 post ids, a page of 500 at a time in document-id order. An `in` filter on
 * one field, ordered by document id, is served by Firestore's automatic
 * single-field index on `publicationId`, so it needs no composite index.
 *
 * The screen still gets the newest 500 rows, newest first. Firestore orders
 * by `updatedAt` within those queries only with a composite index
 * (publicationId, updatedAt), so they are sorted here, as the old query
 * ordered them: `updatedAt` newest first, ties by document id, last first. A
 * row is never left out for lacking `updatedAt`, as an orderBy query leaves it
 * out: it is placed by its `syncedAt` if it has one, and otherwise after every
 * row that has a time.
 *
 * So a call reads all of the teacher's own rows: a teacher with fewer than 500
 * reads fewer than before, and one with more reads more. A read warns from
 * 2,000 rows and stops at 10,000 with an error, answering the newest of what
 * it read (gradeSyncReadConcerns). The composite index would hold a call to
 * at most 500 rows a query of 30 posts; the warning says when one teacher's
 * monitor has grown enough to want it.
 */

const { FieldPath } = require("firebase-admin/firestore");

const GRADE_SYNC_COLLECTION = "classroomGradeSyncs";
// Firestore's limit on the values of one `in` filter.
const GRADE_SYNC_POSTS_PER_QUERY = 30;
// A page of one query: the size of the read the monitor replaced.
const GRADE_SYNC_PAGE_SIZE = 500;
// From here a read warns: one teacher's rows cost this many reads a call.
const GRADE_SYNC_WARN_AT = 2000;
// A read that reaches this many rows stops and says so.
const GRADE_SYNC_MAX_ROWS = 10000;
// The rows the monitor answers with: the newest 500, as it always has.
const GRADE_SYNC_MONITOR_LIMIT = 500;

/**
 * Every classroomGradeSyncs row that names one of `publicationIds`, in pages
 * of `pageSize`, `postsPerQuery` post ids a query, each query in document-id
 * order. `complete` is false only when the read stopped at `maxRows` with rows
 * possibly left unread; `queries` is how many it ran (Firestore bills a query
 * one read when it returns nothing).
 */
async function readPublicationGradeSyncs(db, publicationIds, {
  postsPerQuery = GRADE_SYNC_POSTS_PER_QUERY,
  pageSize = GRADE_SYNC_PAGE_SIZE,
  maxRows = GRADE_SYNC_MAX_ROWS,
} = {}) {
  const ids = [...new Set((publicationIds || []).map((id) => String(id ?? "")).filter(Boolean))];
  const docs = [];
  let queries = 0;
  for (let start = 0; start < ids.length; start += postsPerQuery) {
    const base = db.collection(GRADE_SYNC_COLLECTION)
      .where("publicationId", "in", ids.slice(start, start + postsPerQuery))
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    let cursor = null;
    for (;;) {
      if (docs.length >= maxRows) return { docs, queries, complete: false };
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await (cursor ? base.startAfter(cursor) : base).get();
      queries += 1;
      docs.push(...snapshot.docs);
      if (snapshot.docs.length < pageSize) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
  return { docs, queries, complete: true };
}

/** A stored time as milliseconds (a Firestore Timestamp keeps its microseconds), or null. */
function timeMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toMillis === "function") {
    const seconds = Number(value.seconds);
    const nanoseconds = Number(value.nanoseconds);
    if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) return seconds * 1000 + nanoseconds / 1e6;
    const millis = Number(value.toMillis());
    return Number.isFinite(millis) ? millis : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** When a row was last written: `updatedAt`, else `syncedAt`, else null. */
function gradeSyncTimeMs(row) {
  return timeMs(row?.updatedAt) ?? timeMs(row?.syncedAt);
}

/**
 * The newest `limit` of `rows` ({ id, ...data }), newest first: by when each
 * was last written, ties by id, last first (the order of the old
 * `orderBy("updatedAt", "desc")`), and a row with no time after every row
 * with one.
 */
function newestGradeSyncs(rows, { limit = GRADE_SYNC_MONITOR_LIMIT } = {}) {
  return (rows || [])
    .map((row) => ({ row, at: gradeSyncTimeMs(row), id: String(row?.id ?? "") }))
    .sort((a, b) => {
      if (a.at !== b.at) {
        if (a.at === null) return 1;
        if (b.at === null) return -1;
        return b.at - a.at;
      }
      if (a.id === b.id) return 0;
      return a.id < b.id ? 1 : -1;
    })
    .slice(0, limit)
    .map(({ row }) => row);
}

/** What a read of `rows` rows is near or at: nothing, or one concern. */
function gradeSyncReadConcerns({ rows, complete, warnAt = GRADE_SYNC_WARN_AT }) {
  if (!complete) return ["stopped-at-row-limit"];
  return rows >= warnAt ? ["many-rows"] : [];
}

module.exports = {
  GRADE_SYNC_MAX_ROWS,
  GRADE_SYNC_MONITOR_LIMIT,
  GRADE_SYNC_PAGE_SIZE,
  GRADE_SYNC_POSTS_PER_QUERY,
  GRADE_SYNC_WARN_AT,
  gradeSyncReadConcerns,
  gradeSyncTimeMs,
  newestGradeSyncs,
  readPublicationGradeSyncs,
};

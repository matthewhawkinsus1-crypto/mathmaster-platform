"use strict";

/*
 * THE CLASSROOM CHECKPOINT SCHEDULER'S READS: EVERY LINK, A PAGE AT A TIME.
 *
 * queueClassroomSectionGradeCheckpoints (functions/classroomSectionEntry.js)
 * reads every published section link on each 5-minute run: 445 on Nov 11,
 * 2026, and more every week. It read them through one unordered limit(1000),
 * so past 1,000 links a run would have dropped publications, and with them
 * their classes' due and final checkpoints, without a sign: Classroom would
 * then mark that work Missing or keep its own draft 0.
 *
 * It now reads them a page at a time in document-id order, which is also
 * Firestore's own order for an equality-only query, so the query needs no new
 * index. The scheduler logs a warning when a run nears its limits and an error
 * if it ever stops at the page limit.
 *
 * A bounded "next wake" query on due work would read far less. It needs every
 * existing deadline migrated onto a new field first, so it is not done here.
 */

const { FieldPath } = require("firebase-admin/firestore");

const CHECKPOINT_LINK_PAGE_SIZE = 500;
// 20,000 links. A run that reaches it reads no further and logs an error.
const CHECKPOINT_LINK_MAX_PAGES = 40;
// From here every run warns: reading each link every 5 minutes has become
// costly enough that the bounded "next wake" query should replace it.
const CHECKPOINT_LINK_WARN_AT = 2000;
// The section scheduler may run for 300 s.
const CHECKPOINT_SLOW_RUN_MS = 120_000;
// Documents per getAll call.
const CHECKPOINT_GET_ALL_BATCH = 100;

/**
 * Every classroomLinks document matching the equality `filters` (pairs of
 * field and value), with only `fields`, in document-id order. `complete` is
 * false only when the scan stopped at `maxPages` with a full last page.
 */
async function scanPublishedLinks(db, {
  filters,
  fields,
  pageSize = CHECKPOINT_LINK_PAGE_SIZE,
  maxPages = CHECKPOINT_LINK_MAX_PAGES,
}) {
  let base = db.collection("classroomLinks");
  for (const [field, value] of filters) base = base.where(field, "==", value);
  base = base.select(...fields).orderBy(FieldPath.documentId()).limit(pageSize);

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

/** db.getAll over any number of references, `batchSize` at a time, in order. */
async function getAllInBatches(db, refs, { fieldMask = null, batchSize = CHECKPOINT_GET_ALL_BATCH } = {}) {
  const snapshots = [];
  for (let start = 0; start < refs.length; start += batchSize) {
    const batch = refs.slice(start, start + batchSize);
    // eslint-disable-next-line no-await-in-loop
    snapshots.push(...await (fieldMask ? db.getAll(...batch, { fieldMask: [...fieldMask] }) : db.getAll(...batch)));
  }
  return snapshots;
}

/** What a scan of `links` links is near or at: nothing, or one concern. */
function checkpointScanConcerns({ links, complete, warnAt = CHECKPOINT_LINK_WARN_AT }) {
  if (!complete) return ["stopped-at-page-limit"];
  return links >= warnAt ? ["many-links"] : [];
}

module.exports = {
  CHECKPOINT_GET_ALL_BATCH,
  CHECKPOINT_LINK_MAX_PAGES,
  CHECKPOINT_LINK_PAGE_SIZE,
  CHECKPOINT_LINK_WARN_AT,
  CHECKPOINT_SLOW_RUN_MS,
  checkpointScanConcerns,
  getAllInBatches,
  scanPublishedLinks,
};

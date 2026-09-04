"use strict";

/*
 * REACHING THE WHOLE BANK, NOT THE FIRST PAGE OF IT.
 *
 * The challenge loader used `.limit(300)` with no ordering. Firestore then
 * returns documents in document-ID order, so every mixed Algebra I game drew
 * from the same first 300 of 837 questions — about two thirds of the bank was
 * unreachable, and the reachable third was identical every time. The shuffle
 * downstream made each game feel varied while the pool behind it never moved.
 *
 * A RANDOM DOCUMENT-ID PIVOT WAS TRIED FIRST AND DOES NOT WORK HERE, which the
 * coverage test caught. These ids are authored strings sharing a long prefix
 * (`mm_act_alg_1_...`, `mm_alg1_...`), not evenly spread auto-ids. A pivot drawn
 * at random from the id alphabet therefore lands either before every document
 * or past every document — never inside the range — so it returns the first
 * page or wraps to the first page. The old bug with extra steps.
 *
 * So the offset is counted instead. One aggregation query gives the size of the
 * filtered set, a random start is chosen inside it, and the page is read from
 * there. That is uniform over the documents themselves rather than over the
 * shape of their names.
 *
 * THE COST, STATED. Firestore bills skipped documents on an offset, so a draw
 * costs up to the size of the filtered set in reads. A challenge is created a
 * handful of times a day, not per student per round, so this is a fine trade
 * for making the bank reachable — but it is a real cost and it grows with the
 * bank, which is worth remembering if this is ever called from a hot path.
 */

const { FieldPath } = require("firebase-admin/firestore");

const randomOffset = (span) => Math.floor(Math.random() * Math.max(1, span));

/**
 * A page of documents starting from a random point in the filtered collection.
 *
 * `baseQuery` carries whatever filters the caller needs; this adds only the
 * ordering, the offset and the limit. `offset` is injectable so a test can pin
 * the window instead of hoping for one.
 */
async function sampleBankWindow({ baseQuery, pageSize, offset = null, total = null } = {}) {
  const size = Math.max(1, Math.round(Number(pageSize) || 0));
  const ordered = baseQuery.orderBy(FieldPath.documentId());

  // `Number(null)` is 0 and Number.isFinite(0) is true, so testing the coerced
  // value treated "no total supplied" as "the collection is empty" and returned
  // nothing on every call. The presence of the argument has to be checked
  // before its value is.
  let count = typeof total === "number" && Number.isFinite(total)
    ? Math.max(0, Math.round(total))
    : null;
  if (count === null) {
    const aggregate = await baseQuery.count().get();
    count = Math.max(0, Number(aggregate.data()?.count) || 0);
  }
  if (count === 0) return [];

  // A bank smaller than a page has nothing to choose between: read it once
  // rather than paying for an offset that cannot help.
  if (count <= size) return (await ordered.limit(size).get()).docs;

  const start = offset === null ? randomOffset(count) : Math.max(0, Math.round(Number(offset) || 0)) % count;
  const forward = await ordered.offset(start).limit(size).get();
  const docs = [...forward.docs];
  if (docs.length >= size) return docs;

  // The window ran off the end. Take the rest from the beginning so a game is
  // never short of questions because of where the offset happened to fall.
  const wrapped = await ordered.limit(size - docs.length).get();
  const seen = new Set(docs.map((docSnapshot) => docSnapshot.id));
  wrapped.docs.forEach((docSnapshot) => {
    if (!seen.has(docSnapshot.id)) docs.push(docSnapshot);
  });
  return docs;
}

module.exports = { sampleBankWindow, randomOffset };

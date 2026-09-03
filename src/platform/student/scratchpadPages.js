/*
 * MORE ROOM TO WORK, WITHOUT ERASING WHAT IS ALREADY THERE.
 *
 * The scratchpad was one page. A student who filled it solving a multi-step
 * equation had exactly two options: erase working they might still need, or
 * stop. Neither is what a piece of paper does, and the whole point of the
 * scratchpad is to be the piece of paper.
 *
 * ONE FIRESTORE DOCUMENT PER PAGE, AND WHY IT HAS TO BE.
 *
 * A page is stored flattened, as a compressed image data URL capped at 700KB.
 * A Firestore document caps at 1MiB. So two pages cannot share a document, and
 * an array-of-pages model would have to shrink every page's budget as pages were
 * added — the student's earlier working would visibly degrade each time they
 * asked for more room. Separate documents give every page the full budget.
 *
 * PAGE ONE KEEPS THE ID IT ALREADY HAS. There is saved student work in
 * production right now under `{assignmentId}__question_{n}`, and the teacher's
 * review dialog reads `dataUrl` from exactly that document. Page one therefore
 * stays at that id with that field, and pages two onward are new documents
 * beside it. Nothing already saved has to be migrated, and a teacher opening an
 * old scratchpad sees what they always saw.
 *
 * DELETING IS PART OF SAVING. If a student had three pages and saves two, the
 * third document has to go. Leaving it makes the page reappear on the next
 * load — work the student deliberately removed, back again, which reads as the
 * platform losing track of their answer.
 */

// Four pages of flattened image at 700KB each is already 2.8MB per question for
// one student. That is generous for showing algebra work and mean enough to
// keep a class's storage predictable.
export const MAX_SCRATCHPAD_PAGES = 4;

const text = (value) => String(value ?? '').trim();

const isDataUrl = (value) => text(value).startsWith('data:');

/**
 * The document id for one page.
 *
 * Page 0 returns the base id unchanged — that is the compatibility hinge, and
 * changing it would strand every scratchpad already saved.
 */
export const scratchpadPageDocId = (baseId, pageIndex = 0) => {
  const base = text(baseId);
  if (!base) return null;
  const index = Math.trunc(Number(pageIndex) || 0);
  if (index <= 0) return base;
  return `${base}__p${index + 1}`;
};

/** How many pages a stored page-one record claims. Always at least one. */
export const scratchpadPageCount = (record = null) => {
  const declared = Math.trunc(Number(record?.pageCount) || 0);
  if (declared >= 1) return Math.min(MAX_SCRATCHPAD_PAGES, declared);
  return record ? 1 : 0;
};

/**
 * The pages to draw, from whatever shape the store returned.
 *
 * Accepts the legacy single-image record, the new multi-page record, and the
 * half-loaded case where a later page failed to read — a missing page becomes a
 * blank one rather than collapsing the numbering, so page three is still page
 * three even if page two could not be fetched.
 */
export const normalizeScratchpadPages = (record = null, laterPages = []) => {
  if (!record) return [''];
  const first = isDataUrl(record.dataUrl) ? record.dataUrl : '';
  const rest = (Array.isArray(laterPages) ? laterPages : [])
    .map((page) => (isDataUrl(page?.dataUrl ?? page) ? (page?.dataUrl ?? page) : ''));

  const declared = scratchpadPageCount(record);
  const pages = [first, ...rest].slice(0, Math.max(1, declared));
  while (pages.length < Math.max(1, Math.min(declared, MAX_SCRATCHPAD_PAGES))) pages.push('');
  return pages.length ? pages : [''];
};

/** Whether another page may be added. */
export const canAddScratchpadPage = (pages = []) => (
  (Array.isArray(pages) ? pages.length : 0) < MAX_SCRATCHPAD_PAGES
);

/**
 * Turn the pages a student saved into the documents to write and remove.
 *
 * `previousPageCount` is what the store last held. Anything beyond the new page
 * count is returned in `deletes`, because a page the student removed must not
 * come back on the next load.
 */
export const buildScratchpadWrites = ({
  baseId = null,
  pages = [],
  metadata = {},
  previousPageCount = 0,
} = {}) => {
  const base = text(baseId);
  const kept = (Array.isArray(pages) ? pages : []).filter(isDataUrl).slice(0, MAX_SCRATCHPAD_PAGES);
  if (!base || !kept.length) return { writes: [], deletes: [] };

  const writes = kept.map((dataUrl, index) => ({
    docId: scratchpadPageDocId(base, index),
    data: {
      dataUrl,
      pageIndex: index,
      // Only page one carries the count, because it is the only page a loader
      // can find without already knowing how many there are.
      ...(index === 0 ? { pageCount: kept.length } : {}),
      ...metadata,
    },
  }));

  const previous = Math.max(0, Math.trunc(Number(previousPageCount) || 0));
  const deletes = [];
  for (let index = kept.length; index < Math.min(previous, MAX_SCRATCHPAD_PAGES); index += 1) {
    deletes.push(scratchpadPageDocId(base, index));
  }

  return { writes, deletes };
};

export default normalizeScratchpadPages;

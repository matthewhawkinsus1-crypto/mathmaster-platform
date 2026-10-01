/*
 * SCRATCHPADS THAT LIVE ONLY IN MEMORY, KEPT WITHIN A BUDGET
 * (platform engineering deep dive 2026-10-01, §10.5).
 *
 * Two kinds of scratchpad never reach Firestore: a student's Practice Mode
 * after an assignment's deadline, and a teacher's "View as Student". App held
 * each as a plain map of page documents, and nothing ever left the practice map
 * before sign-out. A page is a flattened image data URL of up to ~700KB, so a
 * student practising all afternoon carried every page of every question of
 * every assignment they had practised, all day, on a school Chromebook.
 *
 * This is the same store with a budget. It is pure: every operation returns a
 * new store (or the same one, when nothing changed, so a React state update
 * can bail out) and never edits the one it was given.
 *
 * WHAT IS KEPT. Moving to another question and back is ordinary in-progress
 * work, and a student relies on finding their working where they left it. So
 * nothing is dropped for being old or for leaving a question — only when the
 * store is over budget, and then the least recently used scratchpad first.
 * Opening a scratchpad counts as using it, not only saving it.
 *
 * A SCRATCHPAD GOES WHOLE. Its pages are separate documents (scratchpadPages.js:
 * page one at the base id, later pages beside it), but they are one piece of
 * work: a scratchpad that came back with page one and not page three would be
 * worse than one that came back empty. Pages are grouped by their scratchpad
 * and evicted together.
 *
 * THE OPEN QUESTION IS NEVER EVICTED. Only the question on screen is ever
 * saved, so the scratchpad being stored is the open question's. It is exempt
 * from eviction even when it alone is over budget — the student is looking at
 * it — and everything else goes first.
 *
 * THE BUDGET: 8 MiB per store. Sizes are estimated from the data URL lengths:
 * a data URL is ASCII, which the JS engine keeps at one byte per character.
 *   - The worst case is bounded: a page is capped at 700,000 characters
 *     (875,000 is the hard refusal), so the open question's scratchpad is at
 *     most 4 × 875,000 = 3.5 MB, and the budget still leaves 4.9 MB — six more
 *     pages even at the cap — for the questions around it.
 *   - The usual case is never touched: a full page of handwritten working,
 *     exported the overlay's way from a 1366×768 Chromebook canvas, measured
 *     about 51KB in Chromium (66KB on graph paper; 19KB for four lines). 8 MiB
 *     is well over a hundred such pages — more than any practice assignment —
 *     so ordinary back-and-forth practice loses nothing.
 * Only dense, near-cap pages or a very long day reach the budget, and then
 * memory stays a fixed few megabytes instead of growing with every question.
 */
import { MAX_SCRATCHPAD_PAGES, scratchpadPageDocId } from './scratchpadPages.js';

export const SCRATCHPAD_CACHE_BUDGET_BYTES = 8 * 1024 * 1024;

export const EMPTY_SCRATCHPAD_CACHE = Object.freeze({
  // baseId -> { pages: { [pageDocId]: record }, bytes }
  groups: Object.freeze({}),
  // base ids, least recently used first
  order: Object.freeze([]),
  bytes: 0,
});

const text = (value) => String(value ?? '').trim();

const asCache = (cache) => (
  cache && typeof cache === 'object' && cache.groups && typeof cache.groups === 'object' && Array.isArray(cache.order)
    ? cache
    : EMPTY_SCRATCHPAD_CACHE
);

/** The bytes one stored page holds, estimated from its data URL. */
export const scratchpadPageBytes = (record) => (typeof record?.dataUrl === 'string' ? record.dataUrl.length : 0);

const groupBytes = (pages) => Object.values(pages).reduce((sum, record) => sum + scratchpadPageBytes(record), 0);

/** One page document of a stored scratchpad, or null. Reading does not count as use — see touch. */
export const readCachedScratchpadPage = (cache, baseId, pageDocId = baseId) => (
  asCache(cache).groups[text(baseId)]?.pages?.[text(pageDocId)] ?? null
);

/** Base ids of the stored scratchpads, least recently used first. */
export const cachedScratchpadIds = (cache) => [...asCache(cache).order];

/** The estimated bytes the store holds. */
export const cachedScratchpadBytes = (cache) => asCache(cache).bytes;

/**
 * Mark a scratchpad as just used (the student opened it). Returns the same
 * store when there is nothing to move — absent, or already the most recent.
 */
export const touchCachedScratchpad = (cache, baseId) => {
  const current = asCache(cache);
  const id = text(baseId);
  if (!id || !current.groups[id] || current.order[current.order.length - 1] === id) return current;
  return { ...current, order: [...current.order.filter((entry) => entry !== id), id] };
};

/**
 * Store a scratchpad's pages after a save, then evict least-recently-used
 * scratchpads until the store is within budget.
 *
 * `writes` and `deletes` are buildScratchpadWrites' output for `baseId`: the
 * pages to write, and the later pages the student removed. A write for a
 * document that is not one of this scratchpad's pages is ignored, so one
 * scratchpad can never hold, or evict, another's page.
 */
export const storeCachedScratchpad = (cache, {
  baseId,
  writes = [],
  deletes = [],
  budgetBytes = SCRATCHPAD_CACHE_BUDGET_BYTES,
} = {}) => {
  const current = asCache(cache);
  const id = text(baseId);
  if (!id) return current;
  const pageIds = new Set(Array.from({ length: MAX_SCRATCHPAD_PAGES }, (_, index) => scratchpadPageDocId(id, index)));

  const pages = { ...current.groups[id]?.pages };
  (Array.isArray(deletes) ? deletes : []).forEach((docId) => { delete pages[text(docId)]; });
  (Array.isArray(writes) ? writes : []).forEach((entry) => {
    const docId = text(entry?.docId);
    if (pageIds.has(docId) && entry.data) pages[docId] = entry.data;
  });

  const groups = { ...current.groups };
  const order = current.order.filter((entry) => entry !== id);
  if (Object.keys(pages).length) {
    groups[id] = { pages, bytes: groupBytes(pages) };
    order.push(id);
  } else {
    delete groups[id];
  }

  const budget = Number.isFinite(Number(budgetBytes)) && Number(budgetBytes) >= 0
    ? Number(budgetBytes)
    : SCRATCHPAD_CACHE_BUDGET_BYTES;
  let bytes = order.reduce((sum, entry) => sum + groups[entry].bytes, 0);
  const kept = [];
  order.forEach((entry) => {
    // Least recently used first; the scratchpad just stored is the open one.
    if (bytes > budget && entry !== id) {
      bytes -= groups[entry].bytes;
      delete groups[entry];
      return;
    }
    kept.push(entry);
  });
  return { groups, order: kept, bytes };
};

export default storeCachedScratchpad;

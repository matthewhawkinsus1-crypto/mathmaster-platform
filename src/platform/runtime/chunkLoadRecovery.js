/*
 * A TAB THAT OUTLIVED A DEPLOY.
 *
 * Firebase Hosting serves exactly one release. The moment a new one is
 * deployed, every hashed chunk of the old one is gone — and because of the SPA
 * rewrite (`** -> /index.html`), a request for an old chunk does not even 404:
 * it returns the HTML page, which the browser refuses as a module. So a student
 * who opened MathMaster before lunch and opens a tool, the Work View or an
 * assignment after a lunchtime deploy gets a failed dynamic import.
 *
 * Before this, that failure reached either the root boundary ("MathMaster
 * could not start", with a stack trace) or, for a tool, the question boundary,
 * which told the student the QUESTION was broken and to tell their teacher.
 * Neither is true. The fix is the same every time — load the current build —
 * and the student's work is in local drafts and the durable outbox, which a
 * reload restores.
 *
 * A failed module import is not retried in place: browsers remember a failed
 * module URL for the life of the page, so the same import() rejects again.
 */

// Every spelling the major browsers and Vite use for "that chunk did not load".
const CHUNK_LOAD_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Expected a JavaScript(?:-or-Wasm)? module script/i, // HTML served for a .js (the SPA rewrite)
  /Unable to preload CSS/i, // Vite CSS preload
  /Loading (?:CSS )?chunk [\w-]+ failed/i, // webpack-style, kept for safety
  /'text\/html' is not a valid JavaScript MIME type/i,
];

export const isChunkLoadError = (error) => {
  if (!error) return false;
  if (error.name === 'ChunkLoadError' || error.mmChunkLoad === true) return true;
  const message = String(error.message || error || '');
  return CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(message));
};

export const CHUNK_RELOAD_GUARD_KEY = 'mm:chunk-reload-at';
// A second failure this soon after a reload is not a stale tab — the current
// build itself cannot load the chunk (offline, a broken deploy). Reloading
// again would loop; the panel says so instead.
export const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

const sessionStore = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/** Whether a reload was already tried for this failure moments ago. */
export const recentlyReloadedForChunk = ({ store = sessionStore(), now = Date.now() } = {}) => {
  const last = Number(store?.getItem?.(CHUNK_RELOAD_GUARD_KEY) || 0);
  return Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_COOLDOWN_MS;
};

/**
 * Load the current build. The query parameter defeats any intermediate cache
 * of the page shell; index.html's own boot recovery uses the same one.
 */
export const reloadForCurrentBuild = ({ store = sessionStore(), location = typeof window !== 'undefined' ? window.location : null, now = Date.now() } = {}) => {
  try {
    store?.setItem?.(CHUNK_RELOAD_GUARD_KEY, String(now));
  } catch {
    // A blocked sessionStorage only loses the loop guard.
  }
  if (!location) return;
  try {
    const url = new URL(location.href);
    url.searchParams.set('_mm_reload', String(now));
    location.replace(url.toString());
  } catch {
    location.reload?.();
  }
};

/*
 * FIRST-LOAD BUDGET — the pure half of scripts/check-first-load-budget.mjs.
 *
 * What a student downloads before they can act, measured from the production
 * build's Vite manifest (dist/.vite/manifest.json): every chunk and stylesheet
 * a path loads, following static imports only (a dynamic import is a later
 * download, which is the point). Bytes are gzip-compressed, the way Hosting
 * serves them.
 *
 *   signIn        index.html's entry: what the sign-in screen needs.
 *   studentHome   signIn plus the app a signed-in student loads to see Home.
 *
 * The ratchet: a path's bytes may grow by at most `allowanceBytes` over its
 * checked-in baseline (scripts/first-load-baseline.json). Ordinary growth from
 * other work fits; a screen or library dragged onto the critical path does
 * not. A path below its baseline passes and says the baseline can be lowered
 * (`--write-baseline`, only after a deliberate reduction).
 */

export const BASELINE_VERSION = 1;
export const DEFAULT_ALLOWANCE_BYTES = 8 * 1024;

const entryKeyOf = (manifest) => {
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
  const html = entries.find(([key]) => key === 'index.html');
  return (html || entries[0] || [null])[0];
};

/** The files a chunk loads before it runs: itself, its static imports, their CSS. */
export const staticClosure = (manifest, startKeys = []) => {
  const files = new Set();
  const seen = new Set();
  const visit = (key) => {
    if (!key || seen.has(key) || !manifest[key]) return;
    seen.add(key);
    const chunk = manifest[key];
    if (chunk.file) files.add(chunk.file);
    (chunk.css || []).forEach((file) => files.add(file));
    (chunk.imports || []).forEach(visit);
  };
  startKeys.forEach(visit);
  return files;
};

/**
 * The critical-path files of each measured path.
 * `studentAppKey` is the manifest key of the chunk a signed-in student loads
 * (src/app/shell/AppShell.jsx lazy-loads src/App.jsx). A build without that
 * key throws: Home cannot be measured, so the budget cannot pass.
 */
export const criticalPaths = (manifest, { studentAppKey = 'src/App.jsx' } = {}) => {
  const entry = entryKeyOf(manifest);
  const signIn = staticClosure(manifest, [entry]);
  // The student's app must be a chunk of its own. If its key disappears (a
  // rename or a further split), Home would quietly measure as sign-in alone
  // and pass "below baseline": fail instead, and name the key to update.
  if (!manifest[studentAppKey]) {
    throw new Error(`The build has no chunk for ${studentAppKey}: update studentAppKey in scripts/lib/firstLoadBudget.mjs to the module a signed-in student loads.`);
  }
  const app = !manifest[studentAppKey].isEntry
    ? staticClosure(manifest, [studentAppKey])
    : new Set();
  return {
    signIn: [...signIn].sort(),
    studentHome: [...new Set([...signIn, ...app])].sort(),
  };
};

export const measurePaths = (paths, sizeOf) => Object.fromEntries(
  Object.entries(paths).map(([name, files]) => [name, {
    bytes: files.reduce((sum, file) => sum + sizeOf(file), 0),
    files: files.length,
  }]),
);

export const compareToBaseline = ({ measured, baseline, allowanceBytes = DEFAULT_ALLOWANCE_BYTES }) => {
  const over = [];
  const reduced = [];
  const unknown = [];
  for (const [name, { bytes }] of Object.entries(measured)) {
    const limit = baseline?.paths?.[name]?.bytes;
    if (!Number.isFinite(limit)) { unknown.push(name); continue; }
    if (bytes > limit + allowanceBytes) over.push({ name, bytes, baseline: limit, growth: bytes - limit });
    else if (bytes < limit) reduced.push({ name, bytes, baseline: limit });
  }
  return { ok: over.length === 0 && unknown.length === 0, over, reduced, unknown };
};

export const baselineFrom = (measured, previous = null) => ({
  version: BASELINE_VERSION,
  description: previous?.description || 'Gzip bytes a student downloads before the sign-in screen (signIn) and before Home (studentHome), from the production build. Ratchet: may grow by at most allowanceBytes. Regenerate with `node scripts/check-first-load-budget.mjs --write-baseline` only after a deliberate reduction.',
  allowanceBytes: previous?.allowanceBytes ?? DEFAULT_ALLOWANCE_BYTES,
  paths: Object.fromEntries(Object.entries(measured).map(([name, value]) => [name, { bytes: value.bytes, files: value.files }])),
});

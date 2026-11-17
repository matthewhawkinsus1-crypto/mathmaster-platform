/*
 * FIRST-LOAD BUDGET — the pure half of scripts/check-first-load-budget.mjs.
 *
 * What a student or a teacher downloads before they can act, measured from
 * the production build's Vite manifest (dist/.vite/manifest.json): every chunk
 * and stylesheet a path loads, following static imports only (a dynamic
 * import is a later download, which is the point). Bytes are gzip-compressed,
 * the way Hosting serves them.
 *
 *   signIn        index.html's entry: what the sign-in screen needs.
 *   studentHome   signIn plus the app a signed-in student loads to see Home.
 *   teacherHome   studentHome plus what a signed-in teacher's Home asks for
 *                 before it draws (TEACHER_HOME_KEYS, each with its static
 *                 imports): the teacher kit and the workspace, which App
 *                 fetches at a teacher's sign-in (app/teacher/teacherKitLoader
 *                 .js); the sidebar and Home itself, which the workspace waits
 *                 for; and the class bar and the panels the workspace draws on
 *                 every screen while closed. Those have Suspense of their own,
 *                 so Home does not wait for them, but they are requested in the
 *                 same render, before Home draws, and share the download and the
 *                 main thread with it (a production build at 4x CPU requests
 *                 exactly these). Home is where a teacher lands; a restored
 *                 screen (the workspace reopens the teacher's last one) loads
 *                 its own screen in Home's place.
 *
 * The ratchet: a path's bytes may grow by at most `allowanceBytes` over its
 * checked-in baseline (scripts/first-load-baseline.json). Ordinary growth from
 * other work fits; a screen or library dragged onto the critical path does
 * not. A path below its baseline passes and says the baseline can be lowered
 * (`--write-baseline`, only after a deliberate reduction).
 */

export const BASELINE_VERSION = 1;
export const DEFAULT_ALLOWANCE_BYTES = 8 * 1024;

// The manifest keys of the chunks a teacher's Home asks for before it draws,
// beyond App (teacherHome above). A key that disappears (a rename, or a
// screen made static) fails the budget rather than measure less.
export const TEACHER_HOME_KEYS = Object.freeze([
  'src/app/teacher/teacherKit.js',
  'src/app/teacher/TeacherWorkspace.jsx',
  'src/TeacherSidebar.jsx',
  'src/TeacherHome.jsx',
  'src/components/teacher/ClassContextBar.jsx',
  'src/components/teacher/TeacherQuickSearch.jsx',
  'src/components/teacher/ClassroomSyncReview.jsx',
  'src/components/teacher/AssignmentHub.jsx',
  'src/components/teacher/StudentProfileDrawer.jsx',
  'src/components/teacher/SupportEvidenceReportView.jsx',
]);

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
 * (src/app/shell/AppShell.jsx lazy-loads src/App.jsx), and `teacherHomeKeys`
 * those a teacher's Home asks for beyond it. A build without one of them
 * throws: that Home cannot be measured, so the budget cannot pass.
 */
export const criticalPaths = (manifest, { studentAppKey = 'src/App.jsx', teacherHomeKeys = TEACHER_HOME_KEYS } = {}) => {
  const entry = entryKeyOf(manifest);
  const signIn = staticClosure(manifest, [entry]);
  // The student's app must be a chunk of its own. If its key disappears (a
  // rename or a further split), Home would quietly measure as sign-in alone
  // and pass "below baseline": fail instead, and name the key to update.
  if (!manifest[studentAppKey]) {
    throw new Error(`The build has no chunk for ${studentAppKey}: update studentAppKey in scripts/lib/firstLoadBudget.mjs to the module a signed-in student loads.`);
  }
  // The same for each of the teacher's: a screen that left (or joined) a
  // chunk of its own changes what Home asks for, and the list must say so.
  const missing = teacherHomeKeys.filter((key) => !manifest[key]);
  if (missing.length) {
    throw new Error(`The build has no chunk for ${missing.join(', ')}: update TEACHER_HOME_KEYS in scripts/lib/firstLoadBudget.mjs to the modules a signed-in teacher's Home asks for.`);
  }
  const app = !manifest[studentAppKey].isEntry
    ? staticClosure(manifest, [studentAppKey])
    : new Set();
  const studentHome = new Set([...signIn, ...app]);
  return {
    signIn: [...signIn].sort(),
    studentHome: [...studentHome].sort(),
    teacherHome: [...new Set([...studentHome, ...staticClosure(manifest, teacherHomeKeys)])].sort(),
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

export const BASELINE_DESCRIPTION = 'Gzip bytes a student downloads before the sign-in screen (signIn) and before Home (studentHome), and a signed-in teacher before their Home draws (teacherHome), from the production build. Ratchet: may grow by at most allowanceBytes. Regenerate with `node scripts/check-first-load-budget.mjs --write-baseline` only after a deliberate reduction.';

export const baselineFrom = (measured, previous = null) => ({
  version: BASELINE_VERSION,
  description: previous?.description || BASELINE_DESCRIPTION,
  allowanceBytes: previous?.allowanceBytes ?? DEFAULT_ALLOWANCE_BYTES,
  paths: Object.fromEntries(Object.entries(measured).map(([name, value]) => [name, { bytes: value.bytes, files: value.files }])),
});

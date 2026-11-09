import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const requiredEvents = [
  'initial_app_usable_ms', 'question_ready_ms', 'submit_local_ack_ms',
  'submit_server_ack_ms', 'next_question_ready_ms', 'tool_prefetch_ms',
  'assignment_open_ms', 'workview_ready_ms', 'grading_ms', 'firestore_request_ms',
  'callable_request_ms',
  'route_transition_ms',
  'submission_capture_ms', 'submission_queue_write_ms', 'submission_reconcile_ms',
  'submission_queue_depth', 'submission_recovery_count',
];
const sourceFiles = ['src/main.jsx', 'src/App.jsx', 'src/QuestionEngine.jsx', 'src/platform/performance/questionPrefetch.js', 'src/platform/performance/durableActionOutbox.js', 'src/services/secureExamService.js'];
const source = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join('\n');
requiredEvents.forEach((event) => assert.match(source, new RegExp(`['\"]${event}['\"]`), `missing ${event}`));

// The September 2026 certification's bundle (docs/handoffs/PERFORMANCE_CERTIFICATION.md).
// Reported against, never silently: these were assertions inside a catch meant
// for "no build yet", so once a limit was passed the report said `bundle: null`
// as if nothing had been built. The student's first load has its own ratchet
// (npm run check:first-load); whether these limits still apply is the owner's
// call, so a limit passed is named here and does not fail the run.
const SEPTEMBER_LIMITS = Object.freeze({ chunks: 140, totalJsBytes: 5_800_000, coreEntryBytes: 1_100_000, initialTransferBytes: 4_000_000 });

let assets = null;
try {
  assets = await readdir('dist/assets');
} catch (error) {
  // Architecture certification can run before a build: the bundle is then
  // reported as unavailable rather than as zero.
  if (error?.code !== 'ENOENT') throw error;
}
let bundle = null;
let septemberLimitsPassed = [];
if (assets) {
  const js = await Promise.all(assets.filter((file) => file.endsWith('.js')).map(async (file) => ({ file, bytes: (await stat(`dist/assets/${file}`)).size })));
  const totalJsBytes = js.reduce((sum, item) => sum + item.bytes, 0);
  const coreEntryBytes = js.find((item) => /^index-[^.]+\.js$/.test(item.file))?.bytes || null;
  const html = await readFile('dist/index.html', 'utf8');
  const initialFiles = [
    html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)?.[1],
    ...[...html.matchAll(/rel="modulepreload"[^>]+href="\/assets\/([^"]+\.js)"/g)].map((match) => match[1]),
  ].filter(Boolean);
  const initialTransferBytes = initialFiles.reduce((sum, file) => sum + (js.find((item) => item.file === file)?.bytes || 0), 0);
  bundle = { chunks: js.length, totalJsBytes, coreEntryBytes, initialTransferBytes, initialRequests: initialFiles.length, largestChunks: js.sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
  septemberLimitsPassed = Object.entries(SEPTEMBER_LIMITS)
    .filter(([key, limit]) => !(Number.isFinite(bundle[key]) && bundle[key] <= limit))
    .map(([key, limit]) => ({ measure: key, now: bundle[key], septemberLimit: limit }));
}

console.log(JSON.stringify({
  certifiedEvents: requiredEvents,
  bundle,
  septemberLimitsPassed,
  // What a student's interactions cost, in a browser:
  // tests/browser/teacherWorkflow/studentRuntimePerformance.mjs.
}, null, 2));
septemberLimitsPassed.forEach(({ measure, now, septemberLimit }) => console.error(`${measure} is ${now}, past September's limit of ${septemberLimit}.`));

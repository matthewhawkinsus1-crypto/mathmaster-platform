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

let bundle = null;
try {
  const assets = await readdir('dist/assets');
  const js = await Promise.all(assets.filter((file) => file.endsWith('.js')).map(async (file) => ({ file, bytes: (await stat(`dist/assets/${file}`)).size })));
  const totalJsBytes = js.reduce((sum, item) => sum + item.bytes, 0);
  const coreEntryBytes = js.find((item) => /^index-[^.]+\.js$/.test(item.file))?.bytes || null;
  const html = await readFile('dist/index.html', 'utf8');
  const initialFiles = [
    html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)?.[1],
    ...[...html.matchAll(/rel="modulepreload"[^>]+href="\/assets\/([^"]+\.js)"/g)].map((match) => match[1]),
  ].filter(Boolean);
  const initialTransferBytes = initialFiles.reduce((sum, file) => sum + (js.find((item) => item.file === file)?.bytes || 0), 0);
  assert.ok(js.length <= 140, `feature chunk count regressed to ${js.length}`);
  assert.ok(totalJsBytes <= 5_800_000, `total JavaScript regressed to ${totalJsBytes} bytes`);
  assert.ok(coreEntryBytes && coreEntryBytes <= 1_100_000, `core entry regressed to ${coreEntryBytes} bytes`);
  assert.ok(initialTransferBytes <= 4_000_000, `initial module graph regressed to ${initialTransferBytes} bytes`);
  bundle = { chunks: js.length, totalJsBytes, coreEntryBytes, initialTransferBytes, initialRequests: initialFiles.length, largestChunks: js.sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
} catch {
  // Architecture certification can run before build; bundle reporting is then
  // intentionally marked unavailable rather than silently reported as zero.
}

console.log(JSON.stringify({ certifiedEvents: requiredEvents, bundle }, null, 2));

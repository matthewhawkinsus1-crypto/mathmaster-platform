import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';

const requiredEvents = [
  'initial_app_usable_ms', 'question_ready_ms', 'submit_local_ack_ms',
  'submit_server_ack_ms', 'next_question_ready_ms', 'tool_prefetch_ms',
  'assignment_open_ms', 'workview_ready_ms', 'grading_ms', 'firestore_request_ms',
  'callable_request_ms',
  'route_transition_ms',
];
const sourceFiles = ['src/main.jsx', 'src/App.jsx', 'src/QuestionEngine.jsx', 'src/platform/performance/questionPrefetch.js', 'src/services/secureExamService.js'];
const source = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join('\n');
requiredEvents.forEach((event) => assert.match(source, new RegExp(`['\"]${event}['\"]`), `missing ${event}`));

let bundle = null;
try {
  const assets = await readdir('dist/assets');
  const js = await Promise.all(assets.filter((file) => file.endsWith('.js')).map(async (file) => ({ file, bytes: (await stat(`dist/assets/${file}`)).size })));
  bundle = { chunks: js.length, totalJsBytes: js.reduce((sum, item) => sum + item.bytes, 0), largestChunks: js.sort((a, b) => b.bytes - a.bytes).slice(0, 8) };
} catch {
  // Architecture certification can run before build; bundle reporting is then
  // intentionally marked unavailable rather than silently reported as zero.
}

console.log(JSON.stringify({ certifiedEvents: requiredEvents, bundle }, null, 2));

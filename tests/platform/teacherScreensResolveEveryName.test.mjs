/*
 * EVERY NAME A TEACHER SCREEN CALLS MUST RESOLVE.
 *
 * AGENTS.md: "A call with no import" passes every check — App.jsx is .jsx, no
 * test imports it, the build does not resolve free identifiers, and the repo's
 * lint does not enable no-undef. It is a ReferenceError at runtime.
 *
 * That is not hypothetical: App.jsx called buildAttendanceCorrectionReviewEvent
 * without importing it, so "Keep current extension" and "Apply shorter
 * extension" on Attendance History always failed ("Could not resolve the
 * review"), and absence-extension corrections could never be resolved.
 *
 * This runs oxlint's no-undef over App.jsx and the teacher screens and allows
 * only browser globals.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const oxlint = `${root}node_modules/.bin/oxlint`;
const teacherComponents = readdirSync(`${root}src/components/teacher`)
  .filter((name) => /\.jsx?$/.test(name))
  .map((name) => `src/components/teacher/${name}`);
const FILES = ['src/App.jsx', 'src/TeacherHome.jsx', 'src/ClassesWorkspace.jsx', 'src/TeacherSidebar.jsx', ...teacherComponents];

const BROWSER_GLOBALS = new Set([
  'window', 'document', 'console', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'crypto', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'fetch', 'Request', 'Response', 'Headers',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'queueMicrotask', 'structuredClone', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'CSS',
  'Image', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'AbortController',
  'performance', 'alert', 'confirm', 'prompt', 'getComputedStyle', 'matchMedia', 'atob', 'btoa',
  'TextEncoder', 'TextDecoder', 'indexedDB', 'BroadcastChannel', 'Worker', 'DOMParser', 'XMLSerializer',
  'MathfieldElement', 'self', 'globalThis', 'process',
]);

test('App.jsx and the teacher screens call no undefined name', { skip: !existsSync(oxlint) && 'oxlint is not installed (run npm ci)' }, () => {
  let output = '';
  try {
    output = execFileSync(oxlint, ['-A', 'all', '-D', 'no-undef', ...FILES], { cwd: root, encoding: 'utf8' });
  } catch (error) {
    output = `${error.stdout || ''}${error.stderr || ''}`;
  }
  const unresolved = [...output.matchAll(/^(\S+?):(\d+):\d+: error eslint\(no-undef\): '([^']+)' is not defined/gm)]
    .filter(([, , , name]) => !BROWSER_GLOBALS.has(name))
    .map(([, file, line, name]) => `${file}:${line} ${name}`);
  assert.deepEqual(unresolved, [], `Undefined names (missing imports?):\n${unresolved.join('\n')}`);
});

test('the attendance correction review builder is imported where App.jsx calls it', () => {
  // The specific regression, asserted without the linter.
  const app = readFileSync(`${root}src/App.jsx`, 'utf8');
  assert.match(app, /import \{[^}]*\bbuildAttendanceCorrectionReviewEvent\b[^}]*\} from '\.\/platform\/attendance\/returnCheckIn\.js';/);
});

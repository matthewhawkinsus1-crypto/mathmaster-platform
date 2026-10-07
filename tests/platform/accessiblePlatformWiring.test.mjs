// Platform-level accessibility wiring (job F): visible focus, real section
// controls, the new-question announcement and reading-as-activity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READING_ACTIVITY_EVENTS, subscribeToReadingActivity } from '../../src/components/common/readingActivity.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = executableSource(read('src/App.jsx'));

// WCAG 2.4.7: role="button" spans, tabs and options had no ring, and inline
// outline:none beat the stylesheet. Keyboard focus only (:focus-visible).
test('a keyboard focus ring covers ARIA widgets and beats inline outline:none', () => {
  const css = read('src/index.css');
  const rule = region(css, 'body :is(', '}', 'the global focus ring');
  for (const selector of ['[role="button"]', '[role="tab"]', '[role="option"]', '[role="radio"]', '[tabindex]:not([tabindex="-1"])', 'a[href]']) {
    assert.ok(rule.includes(selector), selector);
  }
  assert.match(rule, /:focus-visible \{\s*outline: 3px solid var\(--mm-focus\) !important;/);
  assert.doesNotMatch(rule, /:focus \{/, 'never on mouse focus');
});

test('assignment sections are a group of buttons, not buttons pretending to be list items', () => {
  const nav = region(app, 'className="mathmaster-section-tabs"', 'navigationSections.map', 'the section bar');
  assert.match(nav, /role="group" aria-label="Assignment sections"/);
  const tab = region(app, 'navigationSections.map((section) => {', '</button>', 'a section button');
  assert.doesNotMatch(tab, /role="listitem"/);
});

test('moving to another question is announced from the rendered prompt', () => {
  assert.match(app, /import QuestionAnnouncer from '\.\/components\/common\/QuestionAnnouncer\.jsx';/);
  const call = region(app, '<QuestionAnnouncer', '/>', 'the announcer');
  assert.match(call, /announceKey=\{`\$\{activeAssignmentId\}-\$\{currentQuestionIndex\}`\}/);
  assert.match(call, /containerRef=\{assignmentQuestionStageRef\}/);
  const announcer = executableSource(read('src/components/common/QuestionAnnouncer.jsx'));
  assert.match(announcer, /role="status" aria-live="polite"/);
  // Read from the screen, never from question data: no question prop at all.
  assert.doesNotMatch(announcer, /\bquestion\b\s*[,}=]/);
  assert.match(announcer, /const words = spokenTextOf\(prompt\)/);
  // The typeset math (whose light DOM is LaTeX) and hidden copies are skipped.
  assert.match(announcer, /'MATH-SPAN', 'MATH-DIV'/);
  assert.match(announcer, /getAttribute\('aria-hidden'\) === 'true'/);
});

test('reading with a screen reader keeps the idle prompt away', () => {
  assert.match(app, /import \{ subscribeToReadingActivity \} from '\.\/components\/common\/readingActivity\.js';/);
  const effect = region(app, "const suppressIdlePrompt = activeSupportPresentation.disableIdleTimer;", 'activeSupportPresentation.disableIdleTimer]);', 'the idle effect');
  assert.match(effect, /const stopReadingActivity = subscribeToReadingActivity\(window, resetActivity\);/);
  assert.match(effect, /stopReadingActivity\(\);/, 'and unsubscribes');
  assert.deepEqual([...READING_ACTIVITY_EVENTS].sort(), ['focusin', 'keyup', 'scroll', 'selectionchange']);
  assert.match(region(app, 'const renderIdleOverlay', 'Yes, I&apos;m Back!', 'the idle overlay'), /data-idle-prompt=""/);
});

test('reading signals count, but the idle prompt focusing itself does not', () => {
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; }, activeElement: null };
  const win = { document: doc, addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  let count = 0;
  const stop = subscribeToReadingActivity(win, () => { count += 1; });
  const outside = { closest: () => null };
  const inPrompt = { closest: (selector) => (selector === '[data-idle-prompt]' ? {} : null) };
  listeners.focusin({ type: 'focusin', target: outside });
  listeners.scroll({ type: 'scroll', target: outside });
  listeners.keyup({ type: 'keyup', target: outside });
  assert.equal(count, 3);
  listeners.focusin({ type: 'focusin', target: inPrompt });
  doc.activeElement = inPrompt;
  listeners.selectionchange({ type: 'selectionchange', target: doc });
  assert.equal(count, 3, 'the overlay focusing its own button is not activity');
  stop();
  assert.deepEqual(Object.keys(listeners), []);
});

// WCAG 2.4.2: every tab said "Vite + React".
test('the document title names the screen', () => {
  // .jsx cannot be imported by node; the title rule is checked from source and
  // in the real app by tests/browser/accessibilityCertification.mjs.
  const chrome = executableSource(read('src/components/common/pageChrome.jsx'));
  for (const [mode, title] of [['assignments', 'Home'], ['assignmentsCenter', 'Assignments'], ['grades', 'Grades'], ['mathPath', 'My Math Path'], ['testCycle', 'Tests & Exams']]) {
    assert.match(chrome, new RegExp(`${mode}: '${title}'`), mode);
  }
  assert.match(chrome, /if \(view === 'assignment'\) return `\$\{String\(assignmentTitle \|\| ''\)\.trim\(\) \|\| 'Assignment'\} – \$\{suffix\}`;/);
  assert.match(app, /import \{ MAIN_CONTENT_ID, SkipToContent, pageTitleFor, useDocumentTitle \} from '\.\/components\/common\/pageChrome\.jsx';/);
  assert.match(app, /useDocumentTitle\(pageTitleFor\(\{\s*signedIn: Boolean\(user\),\s*role: user\?\.role \|\| null,\s*view: activeView,\s*studentMode: studentDashboardMode,/);
});

// WCAG 2.4.1: the first Tab stop on a student screen skips the navigation.
test('a student screen starts with a skip link past the navigation', () => {
  const shell = region(app, 'const renderStudentIdentityShell', '{content}', 'the student shell');
  assert.match(shell, /<div data-authenticated-student-shell=[^>]*>\s*<SkipToContent \/>/, 'first in the shell');
  assert.match(shell, /<div id=\{MAIN_CONTENT_ID\} tabIndex=\{-1\} \/>/);
  const chrome = executableSource(read('src/components/common/pageChrome.jsx'));
  assert.match(region(chrome, 'export const skipTarget', '\n};', 'skipTarget'), /!nav\.contains\(element\)\s*&& \(nav\.compareDocumentPosition\(element\) & 4\)/, 'lands after the nav');
});

// Keyboard sweep S1: Check locked the question (disabled fieldset + inert),
// which dropped a keyboard student's focus to <body> after every Check.
test('focus returns to where it was when the Check lock lifts', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /import \{ useFocusReturnAfterLock \} from '\.\/components\/common\/useFocusReturnAfterLock\.js';/);
  assert.match(engine, /const \[submitting, setSubmitting\] = useState\(false\);[\s\S]{0,200}useFocusReturnAfterLock\(submitting\);/);
  const hook = executableSource(read('src/components/common/useFocusReturnAfterLock.js'));
  const restore = region(hook, 'const frame = requestAnimationFrame(() => {', 'return () => cancelAnimationFrame(frame);', 'the restore');
  assert.match(restore, /if \(active && active !== document\.body\) return;/, 'a student who moved on is left alone');
  assert.match(restore, /if \(canTakeFocusAgain\(lastFocused\.current\)\) lastFocused\.current\.focus\(\{ preventScroll: true \}\);/);
  assert.match(region(hook, 'const canTakeFocusAgain', ');', 'focusable again'), /!element\.closest\?\.\('\[inert\], fieldset\[disabled\]'\)/);
});

// Keyboard sweep S5: hosts other than the assignment screen had no room
// reserved under the sticky action bar.
test('every question host keeps focused controls clear of the action bar', () => {
  const css = read('src/index.css');
  assert.match(css, /html:has\(\.mathmaster-desktop-action-bar\):not\(:has\(\.mathmaster-assignment-screen\)\) \{\s*scroll-padding-bottom: calc\(var\(--mm-action-bar-height, 72px\) \+ 18px\);/);
});

// Keyboard sweep S6: a plotted point could be moved only by pointer.
// Browser proof: tests/browser/graphDescription.mjs ("Move a point").
test('a movable point is picked up, carried and dropped by keyboard', () => {
  const plane = executableSource(read('src/tools/shared/CoordinatePlane.jsx'));
  const keys = region(plane, 'const handleKeyDown = (event) => {', '\n  };', 'plane keys');
  const enter = region(keys, "case 'Enter':", "case 'Escape':", 'Enter');
  assert.match(enter, /if \(keyboardHeldIndex != null\) \{[\s\S]*?onMovePoint\(moved, /, 'Enter while holding drops the point');
  assert.match(enter, /const onPoint = canMovePoints \? pointIndexNear\(target\) : null;\s*if \(onPoint != null\) \{ setKeyboardHeldIndex\(onPoint\); break; \}\s*onPlot\(target\);/, 'Enter on a movable point picks it up; elsewhere it plots');
  const escape = region(keys, "case 'Escape':", 'default:', 'Escape');
  assert.match(escape, /if \(keyboardHeldIndex != null\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*setKeyboardHeldIndex\(null\);/, 'Escape puts it back without closing Work View');
  assert.match(plane, /else if \(keyboardHeldIndex === index && keyboardCursor\) \[pointX, pointY\] = keyboardCursor;/, 'the held point is drawn at the crosshair');
});

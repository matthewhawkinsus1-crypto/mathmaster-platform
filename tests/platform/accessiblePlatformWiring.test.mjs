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

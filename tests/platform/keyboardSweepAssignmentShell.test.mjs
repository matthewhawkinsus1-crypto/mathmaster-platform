/*
 * THE KEYBOARD SWEEP'S STAND-IN FOR THE ASSIGNMENT SCREEN IS THE APP'S OWN
 * STRUCTURE (student-a11y-3).
 *
 * tests/browser/keyboardSweep.html?shell=assignment puts a question where
 * App.jsx's student assignment screen puts it, so that what a walk finds there
 * is what a student meets. On a phone App.css makes that screen one screen tall
 * and its shell a grid of the navigator and the stage, and the question as tall
 * as the stage: the work scrolls above the work bar at the screen's foot. The
 * stand-in had the screen's class on a wrapper with no shell, and the sweep's
 * two sentinels inside it, so the stage had no height: a fraction question
 * collapsed to 258px of an 844px phone, its work area to 16px, and the work bar
 * lay over five of its 14 stops. The legacy question types' phone walk read
 * that as theirs (the VPAT's evaluation notes). Now the stand-in nests what the
 * App nests, with the App's inline styles, and its sentinels take no room.
 *
 * Node renders nothing, so this binds the harness to App.jsx's own markup; the
 * geometry was measured at 390×844 (stage 797px, work area 555px, the work bar
 * at the foot, nothing of the question under it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const harness = executableSource(read('tests/browser/keyboardSweepMain.jsx'));
const app = executableSource(read('src/App.jsx'));
const tidy = (text) => String(text).replace(/\s+/g, ' ').trim();
// The object literal a constant is set to: `Object.freeze({ ... })`.
const frozen = (name) => tidy(harness.match(new RegExp(`const ${name} = Object\\.freeze\\((\\{[^}]*\\})\\);`))?.[1] || '');

test('the stand-in nests what the App nests: screen, shell, navigator and stage', () => {
  const shell = region(harness, 'if (shell) {', '\n  }\n', 'the shell branch');
  const order = [
    'className="mathmaster-assignment-screen"',
    'className="mathmaster-assignment-shell"',
    'data-kb-stand-in="navigator"',
    'className="mathmaster-question-stage"',
  ].map((needle) => shell.indexOf(needle));
  assert.ok(order.every((at) => at >= 0), `each part is there: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the App\'s order');
  // The screen and its shell close round the stage: the sentinels are outside them.
  assert.match(shell, /<\/main>\s*<\/div>\s*<\/div>\s*<button type="button" data-kb-sentinel="end"/);
  assert.match(shell, /<button type="button" data-kb-sentinel="start" style=\{SENTINEL_STYLE\}>[^<]*<\/button>\s*<div className="mathmaster-assignment-screen"/);
  // The App's order is the same (App.jsx renderAssignmentWorkspace).
  const appScreen = app.indexOf('className={`mathmaster-assignment-screen ');
  const appShell = app.indexOf('<div className="mathmaster-assignment-shell"', appScreen);
  const appStage = app.indexOf('className="mathmaster-question-stage"', appShell);
  assert.ok(appScreen > 0 && appShell > appScreen && appStage > appShell, 'the App: screen, shell, stage');
});

test('with the App\'s inline styles, which the phone layout overrides as it does in the App', () => {
  // The shell, as App.jsx draws it.
  const appShell = tidy(app.match(/<div className="mathmaster-assignment-shell" style=\{(\{[^}]*\})\}>/)?.[1] || '');
  assert.equal(appShell, "{ maxWidth: '1120px', margin: '0 auto' }");
  assert.match(harness, /<div className="mathmaster-assignment-shell" style=\{\{ maxWidth: '1120px', margin: '0 auto' \}\}>/);
  // The stage's card, the same literal.
  const appStage = tidy(app.match(/<main ref=\{assignmentQuestionStageRef\} className="mathmaster-question-stage" style=\{(\{[^}]*\})\}>/)?.[1] || '');
  assert.ok(appStage.length > 10, 'the App\'s stage style is found');
  assert.equal(frozen('QUESTION_STAGE_STYLE'), appStage);
  assert.match(harness, /className="mathmaster-question-stage" data-kb-root="true" style=\{QUESTION_STAGE_STYLE\}/);
  // The screen: its font, its padding, its height, and the background of a student with no support presentation.
  const appScreen = tidy(region(app, 'className={`mathmaster-assignment-screen ', '}}\n', 'the App\'s screen'));
  const screen = frozen('ASSIGNMENT_SCREEN_STYLE');
  for (const declaration of [`fontFamily: '"Segoe UI", sans-serif'`, "minHeight: '100vh'", "padding: '20px'"]) {
    assert.ok(appScreen.includes(declaration), `the App's screen: ${declaration}`);
    assert.ok(screen.includes(declaration), `the stand-in's screen: ${declaration}`);
  }
  assert.ok(appScreen.includes("supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)'"));
  assert.ok(screen.includes("backgroundColor: 'var(--mm-surface-control)'"));
  assert.match(harness, /<div className="mathmaster-assignment-screen" style=\{ASSIGNMENT_SCREEN_STYLE\}>/);
  // On a phone held upright App.css makes the screen one screen tall and its shell the grid the stage fills.
  const upright = parseCss(read('src/App.css')).filter((rule) => rule.atRules.some((at) => /max-width: 768px\) and \(orientation: portrait/.test(at)));
  const shellRule = upright.find((rule) => rule.selectors.includes('.mathmaster-assignment-screen .mathmaster-assignment-shell'));
  assert.equal(shellRule?.declarations['grid-template-rows']?.value, 'auto minmax(0, 1fr)');
});

test('the sentinels take no room, so the screen starts where the App\'s does', () => {
  const sentinel = frozen('SENTINEL_STYLE');
  assert.match(sentinel, /position: 'fixed'/);
  assert.match(sentinel, /width: 1, height: 1/);
  // Both of the shell's sentinels are drawn that way; without the shell the page is as it was.
  const shell = region(harness, 'if (shell) {', '\n  }\n', 'the shell branch');
  assert.equal(shell.match(/data-kb-sentinel="(start|end)" style=\{SENTINEL_STYLE\}/g)?.length, 2);
  const plain = region(harness, '\n  return (\n    <div className={params.get(\'host\') === \'bare\'', '\n  );\n}', 'the page without the shell');
  assert.match(plain, /<button type="button" data-kb-sentinel="start">Start of page \(sweep sentinel\)<\/button>/);
  assert.doesNotMatch(plain, /mathmaster-assignment-shell|data-kb-stand-in/);
});

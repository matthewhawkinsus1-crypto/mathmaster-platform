/*
 * NOTHING THE PAGE DRAWS SITS OVER A STUDENT'S TAB STOP (WCAG 2.2 2.4.11,
 * Focus Not Obscured, Minimum).
 *
 * The Tab walk's criterion (tests/browser/accessibilityKeyboardReach.mjs: a
 * focused control with 3 or more of its 5 sample points under something the
 * page drew) was run over the student scenes at 1366x768 and 390x844 on
 * 2026-11-06, Work View's drawers, the secure exam's tools, My Math Path's
 * session and Recovery among them. Three places hid a Tab stop:
 *
 *   - a Live Challenge question-set round (Graph Feature Rush, Graph the Line)
 *     is a full-screen surface over the arena page, and the page's header kept
 *     its exit button in the tab order under the round's own top bar;
 *   - in Work View every tool's workspace was held to the view's height, and a
 *     taller tool ran on over the attempt results that follow it ("Show a hint",
 *     and after a Submit the outcome and the way on);
 *   - on a phone, My Math Path's last controls stayed under the number keypad
 *     (keyboardRevealsFocusedField.test.mjs holds that one).
 *
 * Node renders nothing, so these hold the two stylesheet rules that fix the
 * first two, read as the cascade reads them; each was broken once to see it go
 * red. The browser proof is tests/browser/studentShellLargeText.mjs
 * --check=obscured, which walks the same scenes in CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GRAND_PRIX_CSS } from '../../src/components/liveChallenge/grandPrixTheme.js';
import { parseCss } from './helpers/cssRules.mjs';
import { componentSource, region } from './helpers/sourceContract.mjs';
import { jobsOf, readWorkflow, stepsOf } from './helpers/ciWorkflows.mjs';

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

// Every selector of every rule in `rules` that sets `property` to `value`.
const selectorsSetting = (rules, property, value) => rules
  .filter((rule) => rule.declarations[property]?.value === value)
  .flatMap((rule) => rule.selectors);

test('a full-screen round hides the arena page parts it covers, and only while it is on the page', () => {
  const hiding = selectorsSetting(parseCss(GRAND_PRIX_CSS), 'visibility', 'hidden')
    .filter((selector) => selector.endsWith('[data-mm-under-round]'));
  assert.equal(hiding.length, 1, `one rule hides what a round covers (${hiding.join(' | ')})`);
  const [selector] = hiding;
  // Conditional on a round's shell being on the student's arena page: with no
  // round (the lobby, results, the final card, or while the round's code loads)
  // the header is there as before.
  const condition = /^\.mm-gp-arena-page:has\(([^)]*)\) \[data-mm-under-round\]$/.exec(selector);
  assert.ok(condition, `the rule is keyed to a round on the arena page: ${selector}`);
  const shells = condition[1].split(',').map((part) => part.trim()).sort();
  assert.deepEqual(shells, ['.mm-line-shell', '.mm-rush-shell']);

  // Both shells are the full-screen surface the rule assumes: each round's root
  // carries the class, and its stylesheet pins it over the whole screen.
  for (const [file, name, css] of [
    ['src/components/liveChallenge/GraphFeatureRushRound.jsx', 'mm-rush-shell', 'RUSH_CSS'],
    ['src/components/liveChallenge/LineGraphRound.jsx', 'mm-line-shell', 'LINE_CSS'],
  ]) {
    const source = componentSource(file);
    assert.match(source, new RegExp(`<div className="${name}" role="region"`), `${file}: the round's root is the shell`);
    // The stylesheet as written, without the `const … = \`` it opens with.
    const sheet = parseCss(region(source, `const ${css} = \``, '\n`;', css).replace(/^const \w+ = `/, ''));
    const shellRule = sheet.find((rule) => rule.selectors.includes(`.${name}`) && rule.declarations.position);
    assert.equal(shellRule?.declarations.position.value, 'fixed', `${name} is fixed over the page`);
    for (const side of ['right', 'bottom', 'left']) assert.equal(shellRule.declarations[side]?.value, '0', `${name} reaches the ${side} edge`);
  }
});

test('the arena header, with its exit button, and the missed-rounds notice are what the round covers', () => {
  const student = componentSource('src/components/liveChallenge/LiveChallengeStudent.jsx');
  const page = region(student, '<div className="mm-gp-arena-page" style={{ minHeight: \'100vh\', padding: \'20px 14px 50px\'', '{room.status === \'lobby\'', 'the arena page above its stages');
  const header = region(page, '<header', '</header>', 'the arena header');
  assert.match(header, /^<header data-mm-under-round="" /, 'the header is marked');
  assert.match(header, /<button[\s\S]*onClick=\{onExit\}[\s\S]*\{exitLabel\}[\s\S]*<\/button>/, 'and it holds the exit button the walk found under the round');
  assert.match(page, /<div role="status" data-mm-missed-rounds="1" data-mm-under-round="" /, 'the missed-rounds notice, with its Got it, is marked');
  // The rounds themselves are never marked: hidden, they would be the screen gone.
  const marked = [...student.matchAll(/data-mm-under-round=""/g)].length;
  assert.equal(marked, 2, 'nothing else on the student page is marked');
});

test('in Work View only a staged workflow\'s workspace is held to the view\'s height; any other tool grows with its work', () => {
  const sheets = ['src/components/common/WorkViewShell.css', 'src/App.css', 'src/index.css', 'src/components/student/MathToolMobileLayout.css'];
  const workspaceLast = /\.mathmaster-question-tool-workspace(?::[\w-]+\((?:[^()]|\([^()]*\))*\))*$/;
  for (const file of sheets) {
    for (const rule of parseCss(read(file))) {
      const height = rule.declarations.height?.value;
      if (!height || height === 'auto') continue;
      for (const selector of rule.selectors.filter((entry) => workspaceLast.test(entry))) {
        // A height on the workspace itself bounds it. Only a workflow may be
        // bounded (its step body scrolls inside); any other tool would run on
        // past the box, over the attempt results laid out after it.
        assert.match(selector, /:has\(\.workflow-focus\)/, `${file}: "${selector}" holds every tool's workspace to height ${height}`);
      }
    }
  }
  const growing = parseCss(read('src/components/common/WorkViewShell.css'))
    .filter((rule) => rule.declarations['min-height']?.value === '100%')
    .flatMap((rule) => rule.selectors)
    .filter((selector) => /^\[data-open="true"\] \.mathmaster-question-tool-workspace:not\(:has\(\.workflow-focus\)\)$/.test(selector));
  assert.equal(growing.length, 1, 'any other tool\'s workspace is at least the view\'s height, so a short tool\'s results stay where they were');
});

test('a control that focus scrolls up into view stops below the sticky identity bar, on every student screen', () => {
  // The bar sticks at the top of every student screen and publishes its measured height (with the pack-up line).
  const bar = componentSource('src/components/student/StudentIdentityBar.jsx');
  assert.match(region(bar, 'className="mm-identity-bar"', 'color:', 'the bar\'s element'), /position: 'sticky', top: 0,/, 'the bar sticks at the top');
  assert.match(bar, /setProperty\(STUDENT_IDENTITY_STACK_OFFSET, `\$\{bar\.offsetHeight \+ noticeHeight\}px`\)/, 'and publishes its height');
  // Shift+Tab up Grades left "See results" under it, and a secure exam's Tab coming round left its first control
  // there: the page keeps that much room at the top for whatever focus scrolls into view.
  const padded = parseCss(read('src/components/student/StudentIdentityBar.css')).filter((rule) => rule.declarations['scroll-padding-top']);
  assert.equal(padded.length, 1, 'one rule pads the page for the bar');
  assert.equal(padded[0].atRules.length, 0, 'at every size');
  // Zero specificity: a screen's own padding (the assignment's, which also clears its navigator and task card) wins.
  assert.deepEqual(padded[0].selectors, [':where(html:has(.mm-identity-bar))'], 'the page, while the bar is on it');
  assert.match(padded[0].declarations['scroll-padding-top'].value, /^calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ \d+px\)$/, 'the bar\'s own height');
  const assignment = parseCss(read('src/App.css')).filter((rule) => rule.selectors.includes('html:has(.mathmaster-assignment-screen)') && rule.declarations['scroll-padding-top']);
  assert.ok(assignment.length, 'the assignment screen keeps its own padding');
  for (const rule of assignment) {
    // Either the bar's offset itself, or the task's top, which the same rule builds from it.
    const value = rule.declarations['scroll-padding-top'].value;
    const top = rule.declarations['--mm-sticky-task-top']?.value || '';
    assert.ok(/--mm-student-identity-stack-offset/.test(value) || /--mm-student-identity-stack-offset/.test(top), `the assignment screen's padding still clears the bar (${value})`);
  }
});

test('CI walks every student scene for 2.4.11, forward and back, in a job of its own', () => {
  const job = jobsOf(readWorkflow('accessibility-certification.yml'))['browser-focus-not-obscured'];
  assert.ok(job, 'the accessibility workflow has the job');
  assert.match(job, /timeout-minutes: \d+/, 'with a time limit');
  const steps = stepsOf(job);
  const at = steps.findIndex((step) => /run: node tests\/browser\/studentShellLargeText\.mjs --check=obscured\s*$/m.test(step));
  assert.ok(at >= 0, 'it runs the check');
  // Both harnesses, started before it: the real app in memory and the standalone pages.
  assert.ok(steps.slice(0, at).some((step) => /vite --config tests\/browser\/emulator\/vite\.config\.mjs --host 127\.0\.0\.1 --port 5199/.test(step)), 'the standalone server');
  assert.ok(steps.slice(0, at).some((step) => /TEACHER_HARNESS_PORT=5188 npx vite --config tests\/browser\/accessibilityAppHarness\.vite\.config\.mjs/.test(step)), 'the app harness');
  assert.match(steps[at], /AUDIT_ORIGIN: "http:\/\/127\.0\.0\.1:5199"/);
  assert.match(steps[at], /TEACHER_HARNESS_ORIGIN: "http:\/\/127\.0\.0\.1:5188"/);
  // What the check does: every scene and the extra ones (Work View and its drawers, the session hosts), the Tab walk
  // forward, and back with Shift+Tab under the walk's own rule.
  const driver = read('tests/browser/studentShellLargeText.mjs');
  const check = region(driver, "if (CHECKS.has('obscured'))", "if (CHECKS.has('workviewheader'))", 'the obscured check');
  assert.match(check, /await auditKeyboardReach\(page, /, 'forward: the Tab walk');
  assert.match(check, /await page\.keyboard\.press\('Shift\+Tab'\)/, 'back: Shift+Tab');
  assert.match(check, /if \(hiddenUnderOverlay\(stop\)\) hidden\.push/, 'judged by the walk\'s rule');
  assert.match(check, /\}, \[\.\.\.LARGE_TEXT_SCREENS, \.\.\.FOCUS_SCREENS\]\);/, 'over the student scenes and the extra ones');
  const extra = region(driver, 'export const FOCUS_SCREENS = [', '\n];', 'the extra scenes');
  for (const id of ['work-view', 'session-hosts', 'work-bar-tools']) assert.match(extra, new RegExp(`id: '${id}'`), `the ${id} scenes are walked`);
  // The Scratchpad over a question (student-a11y-2): opened from the work bar, a modal the walk stays in.
  assert.match(extra, /scenes: \[\{ id: 'scratchpad', run: scratchpadOverQuestion \}\]/);
  assert.match(region(driver, 'const scratchpadOverQuestion = async', '\n};', 'the Scratchpad scene'), /\[role="dialog"\]\[aria-label="Full-screen scratchpad"\]/);
  // Both kinds of question-set round, each opened on its own top row (student-a11y-2 added Graph the Line,
  // which no scene had reached): the large-text scenes are walked, measured and sized.
  const screens = region(driver, 'export const LARGE_TEXT_SCREENS = [', '\n];', 'the large-text scenes');
  assert.match(screens, /\{ id: 'graph-feature-rush', harness: liveChallenge\.harness, schoolClock: liveChallenge\.schoolClock, open: liveChallenge\.open, scenes: \[\{ id: 'round', run: rushRound \}\] \}/);
  assert.match(screens, /\{ id: 'graph-the-line', harness: liveChallenge\.harness, schoolClock: liveChallenge\.schoolClock, open: liveChallenge\.open, scenes: \[\{ id: 'round', run: lineRound \}\] \}/);
  assert.match(driver, /const lineRound = questionSetRound\(\{ challengeMode: 'lineGraphClassic', [^\n]*shell: '\.mm-line-shell', bar: '\.mm-line-bar', ready: '\.mm-line-overlay strong'/);
  assert.match(region(driver, 'const questionSetRound = (', '\n};', 'a round'), /if \(covered\.length\) throw new Error\(/, 'a round whose top row is covered fails the scene');
});

// The rounds open on the app harness, whose bell schedule reads the clock: on
// CI's (UTC) clock after about 23:05 the exit ticket's reminder covered their
// top bar and a phone's navigation. They open as the live-challenge screen
// does, on the school's clock (accessibilityCertification.mjs newScreenContext).
test('the walk opens its two rounds on the school clock, as the live-challenge screen opens', () => {
  const driver = read('tests/browser/studentShellLargeText.mjs');
  for (const id of ['graph-feature-rush', 'graph-the-line']) {
    assert.match(driver, new RegExp(`\\{ id: '${id}', harness: liveChallenge\\.harness, schoolClock: liveChallenge\\.schoolClock, open: liveChallenge\\.open, `), `${id} opens as the live-challenge screen does`);
  }
  assert.match(driver, /const context = await \(screen \? newScreenContext\(browser, screen, contextOptions\) : browser\.newContext\(contextOptions\)\);/, 'a screen\'s context comes from newScreenContext');
});

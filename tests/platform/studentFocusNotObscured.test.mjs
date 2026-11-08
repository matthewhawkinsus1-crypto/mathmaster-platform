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
import { KEYBOARD_RULE_IDS } from '../../scripts/lib/keyboardReach.mjs';

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

// STEP ALGEBRA'S BOARD (student-a11y-3). Its two side boxes answered a click at rest,
// when they place nothing, and the walk counted them as pointer-only, 2 a walk; with
// an operation in hand they are named Tab stops whose keys place it. The same CI job
// walks the board in both states and judges it by the walk's keyboard rules too, so a
// box that answers a pointer and no key, an unnamed stop, one Enter cannot press, or
// a side the walk never reaches fails it (each broken once to see it go red).
test('CI walks Step Algebra\'s board at rest and with an operation in hand, and judges its keyboard rules', () => {
  const driver = read('tests/browser/studentShellLargeText.mjs');
  const extra = region(driver, 'export const FOCUS_SCREENS = [', '\n];', 'the extra scenes');
  const board = region(extra, "id: 'step-algebra-board'", '\n  },', 'the board');
  assert.match(board, /keyboardRules: KEYBOARD_RULES_JUDGED/);
  assert.match(board, /\{ id: 'at-rest', run: toolQuestion\('ux-step'\) \}/);
  assert.match(board, /\{ id: 'operation-in-hand', run: stepAlgebraOperationInHand, mustReach: \[\/\^button: Place add 5 on the left side\$\/, \/\^button: Place add 5 on the right side\$\/\] \}/);
  // The operation is really in hand when the walk starts: the side is a named button by then.
  assert.match(region(driver, 'const stepAlgebraOperationInHand = async', '\n};', 'the scene'), /await host\.locator\('\[aria-label="Place add 5 on the right side"\]'\)\.waitFor\(/);
  // The rules judged are the walk's own (a misspelt one would judge nothing).
  const judged = JSON.parse(driver.match(/const KEYBOARD_RULES_JUDGED = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  assert.deepEqual(judged, ['mm-pointer-only-control', 'mm-tab-stop-not-activatable', 'mm-unnamed-tab-stop']);
  for (const rule of judged) assert.ok(KEYBOARD_RULE_IDS.includes(rule), rule);
  // A count of a judged rule fails the run, and so does a stop the walk had to reach and did not.
  const check = region(driver, "if (CHECKS.has('obscured'))", "if (CHECKS.has('workviewheader'))", 'the obscured check');
  assert.match(check, /keyboardRules: screen\.keyboardRules, mustReach: scene\?\.mustReach/);
  assert.match(check, /for \(const rule of keyboardRules\) \{[\s\S]*?if \(total\) failures\.push\(/);
  assert.match(check, /for \(const pattern of mustReach\) \{[\s\S]*?if \(!reached\) failures\.push\(/);
});

// MY MATH PATH AFTER A SUBMITTED QUESTION, WITH THE PHONE'S KEYPAD UP (student-a11y-3).
// No scene had reached what follows a submit (the solution review and "Next question"),
// and there the number keypad, still up from the number box, hid "Next question" from a
// keyboard on a phone (numberKeypadClosesWhenFocusLeaves.test.mjs holds the fix). The
// session host keeps a one-try question's grading as the container does, and the CI job
// walks it after a keyboard submit, at both sizes.
test('CI walks My Math Path after a submitted question, its keypad up from the number box', () => {
  const driver = read('tests/browser/studentShellLargeText.mjs');
  const extra = region(driver, 'export const FOCUS_SCREENS = [', '\n];', 'the extra scenes');
  assert.match(region(extra, "id: 'session-hosts'", '\n  },', 'the session hosts'), /\{ id: 'path-after-submit', run: pathAfterSubmit \}/);
  const scene = region(driver, 'const pathAfterSubmit = async', '\n};', 'the scene');
  assert.match(scene, /sessionHost\('scene=path-tool&tool=stepAlgebra2&submitted=1'\)/);
  // Worked and submitted by keyboard, from the number box: the keypad is up when the walk begins.
  assert.match(scene, /locator\('main input\[type="number"\]'\)\.first\(\)\.focus\(\);\s*await page\.keyboard\.type\('6'\);/);
  assert.match(scene, /\/\^Submit\/\.test\(/);
  assert.match(scene, /getByRole\('button', \{ name: 'Next question' \}\)\.waitFor\(/);
  // The host holds a submitted question as MyMathPathProductionContainer does: closed, reviewed, and a way on.
  const host = read('tests/browser/hostAccessibilityMain.jsx');
  const tool = region(host, 'function PathTool() {', '\n}\n', 'the Path tool scene');
  assert.match(tool, /const submittedFlow = params\.get\('submitted'\) === '1';/);
  assert.match(tool, /if \(submittedFlow\) setGrading\(\{ isCorrect: false, questionFinalized: true, attemptNumber: 1, attemptsRemaining: 0 \}\);/);
  assert.match(tool, /solutionReview=\{grading \? SUBMITTED_REVIEW : null\}/);
  assert.match(tool, /onContinue=\{submittedFlow && grading \? /);
});

// AND AS THE QUESTION CLOSES (student-a11y-3). The engine counted the try the session had
// closed as still left, so on a phone the keypad stayed over the review and "Next question"
// until Done: only focus leaving the question closed it, and a tap that moves no focus does
// not. Before the walk moves focus, the scene reads the closed question: the keypad gone (and
// up when Submit was pressed, so its closing is what is tested), no Submit, the engine's strip
// closed, each a failure of the run (pathClosedQuestionEngine.test.mjs holds the count).
test('CI reads My Math Path\'s closed question before the walk: no keypad, no Submit, the engine says closed', () => {
  const driver = read('tests/browser/studentShellLargeText.mjs');
  const scene = region(driver, 'const pathAfterSubmit = async', '\n};', 'the scene');
  const submit = scene.indexOf("await page.keyboard.press('Enter');\n  await page.getByRole('button', { name: 'Next question' }).waitFor(");
  assert.ok(submit > 0, 'submitted by keyboard, then Next question awaited');
  const before = scene.indexOf("const keypadBeforeSubmit = await page.locator('.mathmaster-mobile-numeric-keypad').count();");
  assert.ok(before > 0 && before < submit, 'the keypad is counted before the submit');
  const closing = region(scene, "getByRole('button', { name: 'Next question' }).waitFor(", 'document.activeElement?.blur?.()', 'what the scene reads as the question closes');
  assert.match(closing, /keypad: document\.querySelectorAll\('\.mathmaster-mobile-numeric-keypad'\)\.length,/);
  assert.match(closing, /submit: \[\.\.\.document\.querySelectorAll\('button'\)\]\.filter\(\(button\) => button\.textContent\.trim\(\)\.startsWith\('Submit'\) && !button\.matches\(':disabled'\)\)\.length,/);
  assert.match(closing, /\.\.\.\(setting === 'phone' && !keypadBeforeSubmit \? \[/);
  assert.match(closing, /\.\.\.\(closed\.keypad \? \[/);
  assert.match(closing, /\.\.\.\(closed\.submit \? \[/);
  assert.match(closing, /\.\.\.\(closed\.strip !== 'This question is closed' \? \[/);
  assert.match(closing, /problems\.forEach\(\(problem\) => failures\.push\(`session-hosts\/path-after-submit \$\{setting\}: \$\{problem\}`\)\);/);
});

// THE MATH TOOLS LAB (student-a11y-3, keypad-done). The teacher's bench mounts every student tool with its sample
// question. All 24 tools were walked by hand at both sizes (nothing found); the Matrix Lab stays in the CI walk on the
// page, and every Work View the Lab's tools open is walked there too (the Matrix Lab's was the only one), each opened as
// the certification opens it, judged by the keyboard rules as well as 2.4.11. The walk found Shift+Tab going round
// Work View to a control left under its row of actions (mathToolsLabWorkViewFindings.test.mjs).
test('CI walks the Math Tools Lab with a tool on the page and in every Work View its tools open', async () => {
  const { MATH_TOOLS_LAB_WORK_VIEW_TOOLS } = await import('../browser/accessibilityTeacherScreens.mjs');
  const driver = read('tests/browser/studentShellLargeText.mjs');
  const extra = region(driver, 'export const FOCUS_SCREENS = [', '\n];', 'the extra scenes');
  const lab = region(extra, "id: 'math-tools-lab'", '\n  },', 'the Lab');
  assert.match(lab, /harness: 'app',\s*schoolClock: true,\s*keyboardRules: KEYBOARD_RULES_JUDGED,\s*open: openMathToolsLab,/);
  assert.match(lab, /\{ id: 'matrix-lab', run: labTool\('Matrix Lab'\) \}/);
  assert.match(lab, /\.\.\.MATH_TOOLS_LAB_WORK_VIEW_TOOLS\.map\(\(\{ toolId, label \}\) => \(\{ id: `\$\{toolId\}-work-view`, run: openLabWorkView\(label\) \}\)\),/, 'a scene for each Work View, opened as the certification opens it');
  assert.match(driver, /import \{ MATH_TOOLS_LAB_WORK_VIEW_TOOLS, TEACHER_SCREENS, openLabWorkView, openTeacherApp \} from '\.\/accessibilityTeacherScreens\.mjs';/);
  assert.equal(MATH_TOOLS_LAB_WORK_VIEW_TOOLS.length, 24, 'every one the Lab\'s tools open, the Matrix Lab\'s among them');
  assert.ok(MATH_TOOLS_LAB_WORK_VIEW_TOOLS.some((tool) => tool.toolId === 'matrixLab'));
  // Opened as a teacher opens it, and the tool chosen from the Lab's own list; a Work View it opened on its own is closed.
  assert.match(region(driver, 'const openMathToolsLab = async', '\n};', 'the Lab'), /button\[title="Math Tools Lab"\][\s\S]*getByRole\('heading', \{ name: \/\^Math Tools Lab\$\/ \}\)/);
  const tool = region(driver, 'const labTool = (label) =>', '\n};', 'a tool');
  assert.match(tool, /aside\.mm-tools-lab-list button', \{ hasText: label \}/);
  assert.match(tool, /await page\.waitForTimeout\(1500\);\s*await closeLabWorkView\(page\);$/);
});

/*
 * WHAT WORK VIEW'S OPENER COVERS, THE HEADER'S BADGES, AND ONE SCROLLER IN WORK VIEW (#386 R17, R10).
 *
 * The geometry is proved in a browser by tests/browser/workViewOpenerCover.mjs (the CI job
 * work-view-opener-cover): nothing a student needs under "Open Work View" on any surface it floats
 * over, at three phones at 100% and 200% text and a Chromebook; the assignment screen's tries and
 * completion badges clear of the opener and of each other; with Work View open, the view the one
 * thing that scrolls up and down. Nothing here lays a page out, so this binds the rules that
 * geometry depends on, each to the region that does the work, and the driver to CI.
 *
 * Each assertion was broken once to see it go red (see the commit).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss, declared, rulesFor } from './helpers/cssRules.mjs';
import { atRuleHolds, compareSpecificity, specificity, winning } from './helpers/cssCascade.mjs';
import { jobsOf, readWorkflow, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';
import { OPENER_GAP, openerSharesRow } from '../../src/platform/workView/openerPlacement.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const shellCss = parseCss(read('src/components/common/WorkViewShell.css'));
const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));

/* ------------------------------------------------- a figure that is its own Work View, on a phone */

const OWN_FIGURE = '.mathmaster-work-view-surface[data-enlarged="false"]:not([data-opener-stacked="true"]):not(:has(> .mathmaster-question-tool-workspace, .mathmaster-tool-shell-header))';

test('on a phone, a figure that is its own Work View starts below its opener', () => {
  // My Math Path's question with a graph, the session recap and a secure Test's field item draw their plane
  // with an opener of its own (PathQuestionStimulus), and on a 360-390 px phone its y-axis name and top numbers
  // were under it. The figure's content starts at the button's measured bottom edge.
  assert.deepEqual(declared(shellCss, OWN_FIGURE, 'padding-top', { media: '(max-width: 600px)' }), { value: 'var(--mm-work-view-opener-bottom, 52px)', important: true },
    'padding on the surface itself, over a figure\'s own inline padding (GraphDisplay\'s 12px)');
  // A phone only: on a Chromebook nothing moves (the sweep finds nothing under these openers there).
  assert.equal(declared(shellCss, OWN_FIGURE, 'padding-top', { media: null }), null, 'not at every width');
  assert.ok(rulesFor(shellCss, OWN_FIGURE).every((rule) => rule.atRules.some((atRule) => atRule.includes('(max-width: 600px)'))));
});

test('the figure\'s lane leaves alone the question\'s own work, a button on a row of its own, and a tool whose header shares the button\'s row', () => {
  // The question's work has its own phone lane (phoneOpenerLane.test.mjs); counting it twice would put two rows of
  // nothing above every question.
  assert.match(OWN_FIGURE, /:not\(:has\(> \.mathmaster-question-tool-workspace/);
  // Where the button has a row of its own (200% text, a narrow figure), nothing is under it already.
  assert.match(OWN_FIGURE, /:not\(\[data-opener-stacked="true"\]\)/);
  // A tool's header keeps clear of the button's width itself (the Math Tools Lab's registered tools).
  assert.match(OWN_FIGURE, /\.mathmaster-tool-shell-header\)\)$/);
  assert.match(OWN_FIGURE, /^\.mathmaster-work-view-surface\[data-enlarged="false"\]/, 'never an open Work View');
});

test('padding moves the figure, not the button, and the button\'s bottom edge is measured for every figure that has one', () => {
  // The button is placed from the top of the surface's padding box, so padding the surface moves only what is under it.
  const control = region(figure, 'const CONTROL = {', '};', 'the opener\'s place');
  assert.match(control, /position: 'absolute',\s*top: 8,\s*right: 8,/);
  assert.match(control, /minHeight: 44,/, 'its 44 px target');
  // Measured wherever there is a button, a question's or a figure's own: nothing in the effect asks which.
  const effect = region(figure, 'const publishSpace = () => {', '}, [enlarged]);', 'the opener measurement');
  assert.match(effect, /'--mm-work-view-opener-bottom', stacked \? '0px' :/);
  assert.match(figure, /const surface = opener\?\.parentElement;\n\s*if \(enlarged \|\| !opener \|\| !surface\) return undefined;/);
  // At the sizes the sweep measured, the stimulus plane's figure shares the button's row (so the lane applies):
  // a 330 px figure on a 390 px phone and a 300 px one on a 360 px phone at 100% text...
  assert.equal(openerSharesRow({ surfaceWidth: 330, openerWidth: 142, fontSize: 13 }), true);
  assert.equal(openerSharesRow({ surfaceWidth: 300, openerWidth: 142, fontSize: 13 }), true);
  // ...and at 200% text the button takes a row of its own, where the lane is not needed.
  assert.equal(openerSharesRow({ surfaceWidth: 330, openerWidth: 257, fontSize: 26 }), false);
  assert.equal(OPENER_GAP, 16);
});

/* ------------------------------------------------- rows a question starts with, on a wide screen */

const WIDE_ROWS = [
  '.mathmaster-desktop-question-content .mathmaster-work-view-surface[data-enlarged="false"] .graph-scenario-match-heading-row',
  '.mathmaster-question-container.mode-landscape .mathmaster-work-view-surface[data-enlarged="false"] .graph-scenario-match-heading-row',
  '.mathmaster-desktop-question-content .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-interactive-lab-heading',
  '.mathmaster-question-container.mode-landscape .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-interactive-lab-heading',
];

test('on a Chromebook the Visual Match Board\'s count and the modeling lab\'s TEKS line keep clear of the opener', () => {
  // Measured at 1366x768: "0 of 2 matched" and "No TEKS alignment" were under the button. Each row keeps the
  // button's measured width clear, as a staged question's step chips do (PQ-025).
  for (const selector of WIDE_ROWS) {
    assert.deepEqual(declared(shellCss, selector, 'margin-right', { media: null }), { value: 'var(--mm-work-view-opener-space, 176px)', important: false }, selector);
  }
  // Only where the question's work has no row of its own for the button. On a phone held upright the work starts
  // below the button (the phone lane), and a margin there would narrow the row by the button's width for nothing.
  for (const selector of WIDE_ROWS) assert.doesNotMatch(selector, /mode-portrait/);
  // The rows are drawn where the rule names them, and hold what was covered.
  const match = executableSource(read('src/GraphScenarioMatch.jsx'));
  const row = region(match, '<div className="graph-scenario-match-heading-row">', '</div>\n      </div>', 'the board\'s heading row');
  assert.match(row, /className="graph-scenario-match-progress"/, 'the count is in that row');
  const lab = executableSource(read('src/components/labs/InteractiveModelingLabPlayer.jsx'));
  const heading = region(lab, 'className="mathmaster-interactive-lab-heading"', '</div>', 'the lab\'s first row');
  assert.match(heading, /No TEKS alignment/, 'the TEKS line is in that row');
});

/* ------------------------------------------------- #386 R17: tries and completion badges */

test('a question\'s tries and "Question complete" are drawn above its work, never in the corner the opener floats over', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const panel = region(engine, 'const questionContextPanel = (', '\n  );\n', 'the question\'s context panel');
  assert.match(panel, /className="mathmaster-question-attempt-strip"/, 'the tries line is in the context panel');
  assert.match(panel, /'Question complete'/, 'and so is the question\'s completion');
  // The panel is handed to the container beside the work, not inside it.
  assert.match(engine, /contextPanel=\{solverWorkspaceActive \? null : questionContextPanel\}/);
  const work = region(engine, '<EnlargeableFigure\n        label="Question Work View"', '</EnlargeableFigure>', 'the question\'s Work View');
  assert.doesNotMatch(work, /mathmaster-question-attempt-strip|questionContextPanel/, 'nothing of the tries line inside the work');
  // The container draws the panel before the work, as a sibling of it.
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  assert.match(container, /\{!workspaceActive && contextPanel\}/);
});

test('on a phone the tries line and the grade weight share one row and wrap rather than overlap', () => {
  const mobile = parseCss(read('src/components/student/MathToolMobileLayout.css'));
  const PANEL = '.mathmaster-question-container.mode-portrait .mathmaster-question-context-panel:has(> *)';
  assert.equal(declared(mobile, PANEL, 'display')?.value, 'flex');
  assert.equal(declared(mobile, PANEL, 'flex-wrap')?.value, 'wrap', 'a second badge wraps to a row of its own');
  const strip = '.mathmaster-question-container.mode-portrait .mathmaster-question-context-panel > .mathmaster-question-attempt-strip';
  assert.equal(declared(mobile, strip, 'flex')?.value, '0 1 auto', 'the tries line shrinks to its words, never past them');
  assert.equal(declared(mobile, strip, 'position'), null, 'in the flow');
});

test('a closed question\'s verdict shares the opener\'s row and stops short of it', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const row = region(engine, 'className="mathmaster-closed-verdict-row"', '}}', 'the verdict\'s row');
  assert.match(row, /minHeight: 'var\(--mm-work-view-opener-bottom, 0px\)'/, 'as tall as the button, so the row after it starts below it');
  assert.match(row, /marginRight: 'var\(--mm-work-view-opener-space, 0px\)'/, 'it stops before the button');
  // On a phone it is one of the rows that share the button's row (so the work area adds no second gap).
  assert.match(read('src/components/common/WorkViewShell.css'), /\.mathmaster-question-tool-workspace:not\(:has\([^)]*\.mathmaster-closed-verdict-row,/);
});

test('a finished section\'s "Complete" is drawn in its tab, and the section tabs never run under the header\'s buttons', () => {
  const app = parseCss(read('src/App.css'));
  // The medallion sits in the tab's own row, a fixed 24 px, not floated over its neighbours.
  assert.equal(declared(app, '.mathmaster-section-complete-medallion', 'position'), null);
  assert.equal(declared(app, '.mathmaster-section-complete-medallion', 'flex')?.value, '0 0 24px');
  // On a phone every tab is in view: the tabs wrap onto rows of their own rather than run on under the buttons
  // beside them (a DOL tab was clipped under "Focus view"), so no tab's "Complete" is drawn under another control.
  const tabs = '.mathmaster-assignment-screen .mathmaster-section-tabs';
  const PHONE = '(max-width: 768px) and (orientation: portrait)';
  assert.equal(declared(app, tabs, 'flex-wrap', { media: PHONE })?.value, 'wrap');
  assert.equal(declared(app, tabs, 'overflow-x', { media: PHONE })?.value, 'visible');
  // The Focus view button is not in the tabs' row of its own: it sits beside them, never over one.
  const nav = executableSource(read('src/App.jsx'));
  const strip = region(nav, '<div className="mathmaster-section-tabs" role="group" aria-label="Assignment sections">', '</div>\n              ) : (', 'the section strip');
  assert.doesNotMatch(strip, /mathmaster-focus-view-button|mathmaster-overview-button|mathmaster-assignment-status-chip/);
  assert.match(nav, /className="mathmaster-focus-view-button"/);
});

test('below 22em the section tabs are never narrower than their widest tab, and the chips take the row under them', () => {
  // At 360x740 and 320x568 with 200% text, and at 320x568, the tabs ran on under "More" and the Warm-Up's time left,
  // a finished section's "Complete" and the tabs' "0/2" among them (workViewOpenerCover.mjs --check=badges).
  const app = parseCss(read('src/App.css'));
  const NARROW = '(max-width: 22em)';
  const top = '.mathmaster-assignment-screen .mathmaster-assignment-unified-nav:not(.is-collapsed) .mathmaster-assignment-unified-top';
  const tabs = '.mathmaster-assignment-screen .mathmaster-assignment-unified-nav:not(.is-collapsed) .mathmaster-section-tabs';
  assert.equal(declared(app, top, 'flex-wrap', { media: NARROW })?.value, 'wrap', 'the chips and Focus view wrap under the tabs');
  assert.equal(declared(app, tabs, 'min-width', { media: NARROW })?.value, 'min-content', 'a tab is never wider than the tabs\' own box');
  assert.equal(declared(app, tabs, 'flex', { media: NARROW })?.value, '1 1 0', 'the row breaks on the tabs\' least width, not on all of them in one line');
  // In ems, the browser's own text size: a 360px phone at 100% (22.5em) keeps its one row; a laptop never wraps.
  assert.equal(declared(app, top, 'flex-wrap', { media: null }), null);
  const ems = (px, textScale) => px / (16 * textScale);
  assert.ok(ems(360, 1) > 22 && ems(390, 1) > 22, 'a 360 or 390px phone at 100% text keeps its one row');
  assert.ok(ems(320, 1) <= 22 && [390, 360, 320].every((px) => ems(px, 2) <= 22), 'a 320px phone, and every phone at 200% text, wraps');
  // Folded (Focus view) the row has its own rule (RUN-15), untouched.
  assert.match(top, /:not\(\.is-collapsed\)/);
});

/* ------------------------------------------------- #386 R10: one scroller in Work View */

test('with "Show progress" open on a narrow screen the page scrolls, and the question under the navigator keeps a whole screen', () => {
  // At 320x568, and on every phone at 200% text, the expanded navigator was 306 to 520px of a screen that does not
  // scroll: the question had 16px for its work, or none, and at 320x568 at 200% its tries and opener were below it.
  const app = parseCss(read('src/App.css'));
  const NARROW_UPRIGHT = '(max-width: 22em) and (orientation: portrait)';
  const screen = '.mathmaster-assignment-screen:has(.mathmaster-assignment-unified-nav:not(.is-collapsed))';
  const shell = `${screen} .mathmaster-assignment-shell`;
  assert.deepEqual(declared(app, screen, 'height', { media: NARROW_UPRIGHT }), { value: 'auto', important: true });
  assert.deepEqual(declared(app, screen, 'overflow', { media: NARROW_UPRIGHT }), { value: 'visible', important: true });
  assert.deepEqual(declared(app, shell, 'height', { media: NARROW_UPRIGHT }), { value: 'auto', important: true });
  assert.equal(declared(app, shell, 'overflow', { media: NARROW_UPRIGHT })?.value, 'visible');
  // The navigator's row, then the question's: a whole screen under the identity bar, as Focus view gives it.
  assert.equal(declared(app, shell, 'grid-template-rows', { media: NARROW_UPRIGHT })?.value, 'auto calc(100dvh - var(--mm-student-identity-stack-offset, 0px))');
  // Only there: one screen per question everywhere else, and folded (Focus view) as before.
  assert.ok([...rulesFor(app, screen), ...rulesFor(app, shell)].every((rule) => rule.atRules.length === 1 && rule.atRules[0].includes(NARROW_UPRIGHT)));
  // In the browser's own text size: a 320px phone, and every phone at 200% text; not a 360 or 390px phone at 100%, not
  // a phone on its side, not a Chromebook at 200%.
  const holds = (width, height, fontSize = 16) => atRuleHolds(`@media ${NARROW_UPRIGHT}`, { width, height, fontSize });
  assert.ok(holds(320, 568) && holds(390, 844, 32) && holds(360, 740, 32) && holds(320, 568, 32));
  assert.ok(!holds(360, 740) && !holds(390, 844) && !holds(844, 390, 32) && !holds(1366, 768, 32));
  assert.match(screen, /:not\(\.is-collapsed\)/);
  // The !important it outranks: the phone's one-screen frame (App.css, "One phone viewport = one question").
  const frame = region(read('src/App.css'), '@media (max-width: 768px) and (orientation: portrait) {\n  /* One phone viewport = one question.', '.mathmaster-assignment-screen .mathmaster-assignment-header,', 'the one-screen frame');
  assert.match(frame, /\.mathmaster-assignment-screen \{[^}]*height: calc\(100dvh - var\(--mm-student-identity-stack-offset, 0px\)\) !important;[^}]*overflow: hidden !important;/);
  // The sweep holds it in a browser: every header badge whole with progress shown, and room for the question's work.
  const sweep = read('tests/browser/workViewOpenerCover.mjs');
  assert.match(sweep, /reading\.items\.filter\(\(item\) => item\.cut && BADGE_KINDS\.has\(item\.kind\)\)\.forEach\(\(item\) => problems\.push\(`\$\{state\}: \$\{item\.kind\} "\$\{item\.text\}" is cut off by a box that does not scroll`\)\);\n  \}/);
  assert.doesNotMatch(sweep, /if \(state\.startsWith\('focus view'\)\) \{/, 'not only in Focus view');
  assert.match(sweep, /if \(workRoom\['progress shown'\] != null && workRoom\['progress shown'\] < PROGRESS_WORK_MIN\) \{/);
  assert.match(sweep, /export const PROGRESS_WORK_MIN = 160;/);
});

/* ------------------------------------------------- a phone question's room at a large text size */

// The stylesheets that reach the assignment screen on a phone, in either order: App.css's one-screen frame and the
// question's phone column (MathToolMobileLayout.css).
const ROOM_SHEETS = ['src/App.css', 'src/components/student/MathToolMobileLayout.css'].map((name) => ({ name, rules: parseCss(read(name)) }));
const ROOM_SHEET_ORDERS = { 'App.css first': ROOM_SHEETS, 'App.css last': [...ROOM_SHEETS].reverse() };
const SCREEN_PATH = [{ tag: 'html' }, { tag: 'body' }, { tag: 'div', id: 'root' }, { tag: 'div', classes: ['mathmaster-assignment-screen'] }];
const SHELL_PATH = [...SCREEN_PATH, { tag: 'div', classes: ['mathmaster-assignment-shell'] }];
const STAGE_PATH = [...SHELL_PATH, { tag: 'main', classes: ['mathmaster-question-stage'] }];
const CONTEXT_PATH = [
  ...SHELL_PATH, { tag: 'main', classes: ['mathmaster-question-stage'] }, { tag: 'div', classes: ['mathmaster-question-engine'] },
  { tag: 'div', classes: ['mathmaster-question-container', 'mode-portrait'] }, { tag: 'div', classes: ['mathmaster-question-context-panel'] },
];
const phone = (width, height, scale = 1) => ({ width, height, fontSize: 16 * scale, pointer: 'coarse' });
const FRAME_HEIGHT = 'calc(100dvh - var(--mm-student-identity-stack-offset, 0px))';

test('at a large text size a phone\'s question keeps a whole screen in Focus view too, and the lines under its task take no more of it than the task does', () => {
  // Folded (Focus view), the navigator and the identity bar were 174 to 220px of a screen that did not scroll at 150%
  // and 200% text: a phone's question had 16 to 242px for its work at 200% and 67 to 327px at 150%, and a question of
  // choices 16px, its one-try line and hint offer 382 to 522px, its tries and Submit below the screen at 320x568.
  const app = parseCss(read('src/App.css'));
  const LARGE_UPRIGHT = '(max-width: 19em) and (orientation: portrait)';
  // The question's screen: the one with the assignment's shell. A Warm-Up played as a Live Challenge is drawn in a
  // screen of the same name with no shell (App.jsx), and Live Challenge's own questions are in no question stage:
  // both are the owner's and keep their frame.
  const screen = '.mathmaster-assignment-screen:has(> .mathmaster-assignment-shell)';
  const shell = '.mathmaster-assignment-screen .mathmaster-assignment-shell';
  const context = '.mathmaster-assignment-screen .mathmaster-question-stage .mathmaster-question-container.mode-portrait .mathmaster-question-context-panel';
  assert.deepEqual(declared(app, screen, 'height', { media: LARGE_UPRIGHT }), { value: 'auto', important: true });
  assert.deepEqual(declared(app, screen, 'overflow', { media: LARGE_UPRIGHT }), { value: 'visible', important: true });
  assert.deepEqual(declared(app, shell, 'height', { media: LARGE_UPRIGHT }), { value: 'auto', important: true });
  assert.equal(declared(app, shell, 'overflow', { media: LARGE_UPRIGHT })?.value, 'visible');
  // The navigator's row, then the question's: a whole screen under the identity bar, as with progress shown.
  assert.equal(declared(app, shell, 'grid-template-rows', { media: LARGE_UPRIGHT })?.value, `auto ${FRAME_HEIGHT}`);
  // Whichever state the navigator is in: the rule asks nothing of it.
  assert.ok(rulesFor(app, screen, { media: LARGE_UPRIGHT }).every((rule) => rule.selectors.every((selector) => !selector.includes('unified-nav'))));
  const warmupChallenge = region(executableSource(read('src/App.jsx')), 'if (warmupChallengeDecision?.route === WARMUP_CHALLENGE_ROUTE.PLAY && warmupChallengeDecision.roomId) {', '<WarmupChallengeGate', 'the Warm-Up challenge\'s screen');
  assert.match(warmupChallenge, /<div className="mathmaster-assignment-screen"/);
  assert.doesNotMatch(warmupChallenge, /mathmaster-assignment-shell/, 'no shell: the rule leaves it alone');
  for (const file of ['src/components/liveChallenge/LiveChallengeStudent.jsx', 'src/components/liveChallenge/LiveChallengeFieldQuestion.jsx']) {
    assert.doesNotMatch(read(file), /mathmaster-question-stage/, `${file}: its questions are in no question stage`);
  }
  // The one-screen frame's height is !important too: the question's screen outranks it, by specificity, wherever the
  // two sheets load.
  const frame = rulesFor(app, '.mathmaster-assignment-screen', { media: '(max-width: 768px) and (orientation: portrait)' }).find((rule) => rule.declarations.height);
  assert.deepEqual(frame?.declarations.height, { value: FRAME_HEIGHT, important: true });
  assert.ok(compareSpecificity(specificity(screen), specificity('.mathmaster-assignment-screen')) > 0);
  // A question opens on its screen: App.jsx brings the stage into view as a question opens (block: 'start'), and the
  // stage lands right under the identity bar, the 8px the bar's scroll padding adds taken back, not 142px down (the
  // desktop's sticky navigator's margin), where the bottom of the question was under the screen's foot.
  const stage = '.mathmaster-assignment-screen .mathmaster-assignment-shell .mathmaster-question-stage';
  assert.equal(declared(app, stage, 'scroll-margin-top', { media: LARGE_UPRIGHT })?.value, '-8px');
  assert.equal(declared(app, '.mathmaster-question-stage', 'scroll-margin-top', { media: null })?.value, '142px');
  assert.match(read('src/components/student/StudentIdentityBar.css'), /:where\(html:has\(\.mm-identity-bar\)\) \{\n  scroll-padding-top: calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ 8px\);/);
  const reveal = region(executableSource(read('src/App.jsx')), 'const reveal = (behavior) => {', '\n    };', 'the reveal as a question opens');
  assert.match(reveal, /else stage\?\.scrollIntoView\?\.\(\{ behavior, block: 'start' \}\);/);
  // Under the task, what it has (the one-try line and its hint offer, the tries, the grade weight) is a quarter of
  // the screen at most, as the task card above it is, and scrolls in place past that.
  assert.equal(declared(app, context, 'max-height', { media: LARGE_UPRIGHT })?.value, '25dvh');
  assert.equal(declared(app, context, 'overflow-y', { media: LARGE_UPRIGHT })?.value, 'auto');
  assert.equal(declared(parseCss(read('src/components/student/MathToolMobileLayout.css')), '.mathmaster-question-container.mode-portrait .question-prompt-panel', 'max-height', { media: '(max-width: 768px) and (orientation: portrait)' })?.value, '25dvh', 'the task card\'s own quarter');
  // In the browser's own text size: every phone at 150% and 200% text (a 412px phone is 17.2em at 150%), and at 125%
  // the phones to 380px wide (a choice at 375x667 had 92px in the frame there; a 390px phone keeps 269px); no phone
  // 320px or wider at 100%, which stays one screen; not a phone on its side, a tablet or a Chromebook at 200%.
  const holds = (width, height, scale = 1) => atRuleHolds(`@media ${LARGE_UPRIGHT}`, phone(width, height, scale));
  for (const [width, height] of [[320, 568], [360, 740], [375, 667], [390, 844], [412, 915]]) {
    assert.ok(holds(width, height, 1.5) && holds(width, height, 2), `${width}x${height} at 150% and 200%`);
    assert.ok(!holds(width, height), `${width}x${height} at 100%`);
  }
  assert.ok(holds(320, 568, 1.25) && holds(360, 740, 1.25) && holds(375, 667, 1.25) && !holds(390, 844, 1.25) && !holds(412, 915, 1.25));
  assert.ok(!holds(844, 390, 2) && !holds(768, 1024, 2) && !holds(1366, 768, 2));
  // The cascade, as a phone's browser resolves it, in either sheet order: the question's row a whole screen and the
  // lines under the task capped at a large text size, and both as they were at 100%.
  for (const [order, sheets] of Object.entries(ROOM_SHEET_ORDERS)) {
    const won = (path, property, device) => winning({ sheets, path, property, device });
    for (const device of [phone(320, 568, 2), phone(390, 844, 2), phone(412, 915, 1.5), phone(360, 740, 1.5)]) {
      const at = `${order}, ${device.width}x${device.height} at ${device.fontSize / 16 * 100}%`;
      assert.deepEqual(won(SHELL_PATH, 'height', device), { value: 'auto', important: true, sheet: 'src/App.css', selector: shell, specificity: [0, 2, 0] }, at);
      assert.equal(won(SHELL_PATH, 'grid-template-rows', device)?.value, `auto ${FRAME_HEIGHT}`, at);
      assert.equal(won(CONTEXT_PATH, 'max-height', device)?.value, '25dvh', at);
      assert.equal(won(STAGE_PATH, 'scroll-margin-top', device)?.value, '-8px', at);
    }
    for (const device of [phone(320, 568), phone(360, 740), phone(390, 844)]) {
      const at = `${order}, ${device.width}x${device.height} at 100%`;
      assert.equal(won(SCREEN_PATH, 'height', device)?.value, FRAME_HEIGHT, `${at}: one screen`);
      assert.equal(won(SHELL_PATH, 'height', device)?.value, FRAME_HEIGHT, at);
      assert.equal(won(SHELL_PATH, 'grid-template-rows', device)?.value, 'auto minmax(0, 1fr)', at);
      assert.equal(won(CONTEXT_PATH, 'max-height', device), null, `${at}: the lines under the task as they were`);
      assert.equal(won(STAGE_PATH, 'scroll-margin-top', device)?.value, '142px', at);
    }
  }
});

test('at a large text size on a phone held upright, Work View\'s task is two lines in its header, and the header keeps its rows', async () => {
  // At 200% text on a 320x568 phone the task's four lines, the buttons' row and the actions' rows left Work View 172px
  // under a staged question's long task, too short for a plane at its 160px floor and its zoom row together.
  const { WORK_VIEW_SHORT_MAX } = await import('../../src/platform/workView/workViewViewport.js');
  const TASK = '[data-open="true"]:not([data-height="short"]) .mathmaster-work-view-persistent-task';
  const SHORT_FOR_ITS_TEXT = `(max-width: 22em) and (max-height: ${WORK_VIEW_SHORT_MAX / 16}em) and (orientation: portrait)`;
  assert.equal(SHORT_FOR_ITS_TEXT, '(max-width: 22em) and (max-height: 28.75em) and (orientation: portrait)', 'the height a phone on its side is short at, in the text\'s size');
  assert.equal(declared(shellCss, TASK, 'max-height', { media: SHORT_FOR_ITS_TEXT })?.value, 'calc(1.35em * 2)');
  assert.equal(declared(shellCss, '.mathmaster-work-view-persistent-task', 'max-height', { media: null })?.value, 'calc(1.35em * 4)', 'four lines elsewhere');
  assert.equal(declared(shellCss, '.mathmaster-work-view-persistent-task', 'overflow-y', { media: null })?.value, 'auto', 'and the rest scrolls');
  // The device's own text size: every phone at 200%, the 320x568 and 375x667 at 150%; no phone at 100%, not a
  // 360x740 or 390x844 at 150%, a tablet or a Chromebook at 200%.
  const holds = (width, height, scale = 1) => atRuleHolds(`@media ${SHORT_FOR_ITS_TEXT}`, phone(width, height, scale));
  for (const [width, height] of [[320, 568], [360, 740], [375, 667], [390, 844], [412, 915]]) {
    assert.ok(holds(width, height, 2), `${width}x${height} at 200%`);
    assert.ok(!holds(width, height), `${width}x${height} at 100%`);
  }
  assert.ok(holds(320, 568, 1.5) && holds(375, 667, 1.5) && !holds(360, 740, 1.5) && !holds(390, 844, 1.5));
  assert.ok(!holds(768, 1024, 2) && !holds(1366, 768, 2) && !holds(844, 390, 2));
  // The cascade: two lines there, four at 100% and on a Chromebook, and a phone on its side keeps its one line.
  const sheets = [{ name: 'WorkViewShell.css', rules: shellCss }];
  const host = (height) => ({ tag: 'div', classes: ['mathmaster-work-view-host'], attrs: { 'data-open': 'true', 'data-height': height } });
  const task = (height) => [{ tag: 'html' }, { tag: 'body' }, host(height), { tag: 'header', classes: ['mathmaster-work-view-header'] }, { tag: 'div', classes: ['mathmaster-work-view-heading'] }, { tag: 'div', classes: ['mathmaster-work-view-persistent-task'] }];
  const lines = (height, device) => winning({ sheets, path: task(height), property: 'max-height', device })?.value;
  assert.equal(lines('regular', phone(320, 568, 2)), 'calc(1.35em * 2)');
  assert.equal(lines('regular', phone(412, 915, 2)), 'calc(1.35em * 2)');
  assert.equal(lines('regular', phone(375, 667, 1.5)), 'calc(1.35em * 2)');
  assert.equal(lines('regular', phone(320, 568)), 'calc(1.35em * 4)');
  assert.equal(lines('regular', phone(360, 740, 1.5)), 'calc(1.35em * 4)');
  assert.equal(lines('regular', { width: 1366, height: 768, fontSize: 32 }), 'calc(1.35em * 4)');
  assert.equal(lines('short', phone(667, 375, 2)), 'none', 'a phone on its side: one line, as before');
  // The header still puts the task on a row of its own and the buttons under it there (below 22em, not short).
  const header = [{ tag: 'html' }, { tag: 'body' }, host('regular'), { tag: 'header', classes: ['mathmaster-work-view-header'] }];
  assert.equal(winning({ sheets, path: header, property: 'flex-wrap', device: phone(320, 568, 2) })?.value, 'wrap');
});

test('in Work View a region the keyboard scrolls takes its own height: the view is the one thing that scrolls up and down', () => {
  // The Data Modeling Lab's residual table, capped at 185 px, was a scroller inside the view's scroll at every
  // size, phone to desktop.
  const REGION = '[data-open="true"] .mathmaster-work-view-surface [role="region"][tabindex="0"]';
  assert.deepEqual(declared(shellCss, REGION, 'max-height', { media: null }), { value: 'none', important: true }, 'over a region\'s inline cap');
  assert.equal(declared(shellCss, REGION, 'overflow'), null, 'a region that scrolls sideways keeps doing so');
  // The view itself is the scroller, and a split's panels already stand down there.
  assert.equal(declared(shellCss, '[data-open="true"] .mathmaster-work-view-surface', 'overflow')?.value, 'auto');
  assert.deepEqual(declared(shellCss, '[data-open="true"] .mathmaster-tool-split > .mathmaster-tool-panel', 'max-height'), { value: 'none', important: true });
  // The residual table is such a region, so the rule reaches it.
  const lab = executableSource(read('src/tools/dataModeling/DataModelingLab.jsx'));
  const table = region(lab, 'aria-label="Residual table"', '>', 'the residual table');
  assert.match(table, /tabIndex=\{0\}/);
  assert.match(lab, /<div role="region" aria-label="Residual table"/);
});

/* ------------------------------------------------- a staged step's heading row */

// The sheets that reach the row, in either order: the question's resets (every box in a question may shrink to
// nothing) before or after the staged runner's own sheet and Work View's.
const stepSheet = (name) => ({ name, rules: parseCss(read(name)) });
const RESETS = ['src/components/student/MathToolMobileLayout.css', 'src/platform/mobile/MobileInteractionFoundation.css'].map(stepSheet);
const STAGED_SHEETS = ['src/platform/workflow/WorkflowFocusMode.css', 'src/components/common/WorkViewShell.css'].map(stepSheet);
const STEP_SHEET_ORDERS = { 'resets first': [...RESETS, ...STAGED_SHEETS], 'resets last': [...STAGED_SHEETS, ...RESETS] };
const PHONE_200 = { width: 390, height: 844, pointer: 'coarse', fontSize: 32 };
const QUESTION = [
  { tag: 'html' }, { tag: 'body' }, { tag: 'div', id: 'root' }, { tag: 'div', classes: ['mathmaster-question-container', 'mode-portrait'] },
  { tag: 'div', classes: ['mathmaster-work-view-host'], attrs: { 'data-open': 'true', 'data-height': 'regular' } },
  { tag: 'figure', classes: ['mathmaster-work-view-surface'] }, { tag: 'div', classes: ['workflow-focus'] },
];
// Above the step, as the page and a regular Work View draw it; and in a short Work View's Previous/Next row.
const ABOVE = [...QUESTION, { tag: 'main', classes: ['workflow-focus__workspace'] }, { tag: 'div', classes: ['workflow-focus__workspace-heading'] }];
const SHORT = [
  ...QUESTION.slice(0, 4), { tag: 'div', classes: ['mathmaster-work-view-host'], attrs: { 'data-open': 'true', 'data-height': 'short' } },
  ...QUESTION.slice(5), { tag: 'footer', classes: ['workflow-focus__footer'] }, { tag: 'div', classes: ['workflow-focus__workspace-heading'] },
];
const COUNTER = { tag: 'span', classes: ['workflow-focus__counter'] };
const LEFT = { tag: 'div', classes: ['workflow-focus__workspace-heading-left'] };

test('a staged step\'s counter is never cut off: never narrower than its words, beside its heading where it fits and under it where it does not', () => {
  // At 200% text on every phone "3 of 17" ran 23 to 57px past its box, 3 to 39px of it cut off, on every step of
  // both staged questions: a question's reset let it shrink under its words in a row that did not wrap.
  for (const [order, sheets] of Object.entries(STEP_SHEET_ORDERS)) {
    const won = (path, property) => winning({ sheets, path, property, device: PHONE_200 });
    for (const [place, row] of [['above the step', ABOVE], ['in a short Work View', SHORT]]) {
      const counter = [...row, COUNTER];
      // The reset still reaches it (that is what shrank it); what holds it is that it never shrinks.
      assert.equal(won(counter, 'min-width')?.value, '0', `${order}, ${place}: the reset is still there`);
      assert.equal(won(counter, 'flex')?.value?.split(/\s+/)[1], '0', `${order}, ${place}: the counter never shrinks under its words`);
      assert.equal(won(counter, 'white-space')?.value, 'nowrap', 'one line');
    }
    // Above the step the row wraps, so the counter drops under the heading where there is no room beside it...
    assert.equal(won(ABOVE, 'flex-wrap')?.value, 'wrap', `${order}: the row above the step wraps`);
    assert.equal(won([...ABOVE, COUNTER], 'margin-left')?.value, 'auto', 'and the counter stays at the right, beside the heading or under it');
    // ...and only where the heading's longest word does not fit beside it: the heading's side counts its least width
    // (with its one-line width before it, for a browser without the keyword), and grows into the rest of the row.
    assert.equal(won([...ABOVE, LEFT], 'flex-basis')?.value, 'min-content', order);
    assert.equal(won([...ABOVE, LEFT], 'flex')?.value, '1 1 auto', order);
    // A word wider than the whole row ("Increasing/decreasing" at 200% text on a 360px phone) breaks, there only.
    assert.equal(won([...ABOVE, { tag: 'h4' }], 'overflow-wrap')?.value, 'break-word', order);
    // A short Work View keeps its one row (the heading in the Previous/Next row, the name ellipsized), untouched.
    assert.notEqual(won(SHORT, 'flex-wrap')?.value, 'wrap', `${order}: the Previous/Next row stays one line`);
    assert.equal(won([...SHORT, LEFT], 'flex-basis'), null, 'nor counts the heading\'s least width');
    assert.equal(won([...SHORT, LEFT, { tag: 'h4' }], 'text-overflow')?.value, 'ellipsis');
  }
});

test('the sweep fails a staged step whose heading row is cut, on the page and in Work View', async () => {
  const { STEP_HEADING_ITEMS, stepHeadingProblems } = await import('../browser/workViewOpenerCover.mjs');
  for (const kind of ['counter', 'step name', 'step kind', 'review status']) assert.ok(kind in STEP_HEADING_ITEMS, kind);
  const whole = { kind: 'counter', text: '3 of 17', overflow: 0, outOfRow: 0, cut: 0, cutBy: null };
  assert.deepEqual(stepHeadingProblems({ items: [whole, { ...whole, kind: 'step name', text: 'Step 3. x-intercept?' }] }), []);
  // As measured on the base at 390x844 with 200% text, in Work View: "3 of 1" on screen.
  const [problem] = stepHeadingProblems({ items: [{ ...whole, overflow: 24, outOfRow: 24, cut: 9, cutBy: 'figure.mathmaster-work-view-surface' }] });
  assert.match(problem, /^the counter "3 of 17" runs 24px past its own box, is 24px out of the heading's row, has 9px cut off by figure\.mathmaster-work-view-surface$/);
  // Each of the three fails on its own: 2px into the step's padding at 390x844 was a failure too.
  assert.equal(stepHeadingProblems({ items: [{ ...whole, overflow: 2 }] }).length, 1);
  assert.equal(stepHeadingProblems({ items: [{ ...whole, outOfRow: 3 }] }).length, 1);
  assert.equal(stepHeadingProblems({ items: [{ ...whole, cut: 6, cutBy: 'the page' }] }).length, 1);
  assert.match(stepHeadingProblems({ items: [{ ...whole, kind: 'step name', text: 'Step 10. Increasing/decreasing', overflow: 68 }] })[0], /^the step name "Step 10\. Increasing\/decreasing" runs 68px/);
  assert.deepEqual(stepHeadingProblems(null), ['no step heading to read'], 'a heading that is not there is not whole');
  // Read on every step on the page before Work View opens, and again in it; each problem fails the size.
  const sweep = read('tests/browser/workViewOpenerCover.mjs');
  const staged = region(sweep, 'const runStaged = async', '\n};\n', 'the staged check');
  const onPage = staged.indexOf('const headingOnPage = await page.evaluate(READ_STEP_HEADING, [`[data-question-id="${id}"] .mathmaster-work-view-host[data-open="false"]`, STEP_HEADING_ITEMS]);');
  assert.ok(onPage > 0 && onPage < staged.indexOf('button.mathmaster-work-view-opener'), 'the page is read before the opener is pressed');
  assert.match(staged, /m\.headingRow = \{ page: headingOnPage, view: await page\.evaluate\(READ_STEP_HEADING, \['\.mathmaster-work-view-host\[data-open="true"\]', STEP_HEADING_ITEMS\]\) \};/);
  assert.match(staged, /stepHeadingProblems\(m\.headingRow\.page\)\.forEach\(\(problem\) => problems\.push\(`\$\{where\}, on the page: \$\{problem\}`\)\);/);
  assert.match(staged, /stepHeadingProblems\(m\.headingRow\.view\)\.forEach\(\(problem\) => problems\.push\(`\$\{where\}, in Work View: \$\{problem\}`\)\);/);
  // What clips is read through the containing blocks (an open Work View is a fixed layer the question does not clip),
  // up to the page's own edges; a name a short Work View ellipsizes is its box.
  const reader = region(sweep, 'export const READ_STEP_HEADING = ', '\n};\n', 'the heading reader');
  assert.match(reader, /for \(const node of blocks\(element\)\) \{/);
  assert.match(reader, /node === document\.documentElement \? \{ left: 0, right: document\.documentElement\.clientWidth \}/);
  assert.match(reader, /overflow: ellipsis \? 0 : Math\.max\(0, element\.scrollWidth - element\.clientWidth\),/);
});

/* ------------------------------------------------- the browser sweep, wired into CI */

test('the sweep reads every surface the opener floats over, at the phones, at 200% text and on a Chromebook', async () => {
  const { SIZES, SCROLL_SIZES, SURFACES, SCROLL_SCENES, HEADER_ITEMS, KNOWN_SCROLL, STAGED_SCENES, STAGED_SIZES, SETTLE_SIZES, SETTLE_SCENES, SETTLE_WATCH_MS } = await import('../browser/workViewOpenerCover.mjs');
  assert.deepEqual(SIZES.map((size) => size.id), ['390x844', '360x740', '320x568', '390x844@200%', '360x740@200%', '320x568@200%', '1366x768']);
  assert.ok(SIZES.filter((size) => size.phone).every((size) => size.width <= 390));
  assert.deepEqual(SCROLL_SIZES.map((size) => size.id), ['390x844', '360x740', '320x568', '1366x768', '1920x1080']);
  assert.deepEqual(SURFACES.map((surface) => surface.id), ['assignment', 'hosts', 'lab', 'cues']);
  // The figures on their own are read on the phones; everything else at every size.
  assert.deepEqual(SURFACES.find((surface) => surface.id === 'cues').sizes.map((size) => size.id), SIZES.filter((size) => size.phone).map((size) => size.id));
  for (const id of ['assignment', 'hosts', 'lab']) assert.equal(SURFACES.find((surface) => surface.id === id).sizes, SIZES);
  // A scene with no opener to read fails rather than passing as clear: but the one Lab tool the Work View inventory
  // exempts, and every figure on the colour-alone page is expected, the two cases section 6 recorded among them.
  const { WORK_VIEW_INVENTORY } = await import('../../src/tools/workViewInventory.js');
  const lab = SURFACES.find((surface) => surface.id === 'lab');
  assert.deepEqual([...lab.noOpener], ['solutionReview2']);
  for (const toolId of lab.noOpener) assert.equal(WORK_VIEW_INVENTORY[toolId]?.status, 'exempt', toolId);
  const cues = SURFACES.find((surface) => surface.id === 'cues');
  for (const scene of ['inverse-lab', 'system-equations', 'workspace-inverse', 'static-figure']) assert.ok(cues.expects.includes(scene), scene);
  assert.match(read('tests/browser/workViewOpenerCover.mjs'), /if \(unread\.length\) problems\.push\(`no opener to read on \$\{unread\.join\(', '\)\}`\);/);
  // R10's set: the plane tools, the table tools and the Step Algebra boards.
  for (const id of ['tool-graphing2', 'tool-transformationsLab', 'tool-systemsWorkspace', 'tool-dataModelingLab', 'tool-linearTableWorkbench', 'tool-stepAlgebra2', 'legacy-stepAlgebra']) {
    assert.ok(SCROLL_SCENES.includes(id), id);
  }
  // Nothing is left for the owner: a staged question's plane fits its step now, and the run fails where it does not.
  assert.deepEqual(KNOWN_SCROLL, {});
  // Every step of every staged question the harness mounts, at the phones at 100% and 200% text, a Chromebook at both
  // and a desktop, and by default.
  assert.deepEqual([...STAGED_SCENES], ['legacy-functionCharacteristics', 'legacy-relationshipModel']);
  assert.deepEqual(STAGED_SIZES.map((size) => size.id), [...SIZES.map((size) => size.id), '1366x768@200%', '1920x1080']);
  const sweep = read('tests/browser/workViewOpenerCover.mjs');
  assert.match(sweep, /const checks = new Set\(\(arg\('check'\) \|\| 'cover,badges,room,scroll,staged,settle,hint'\)\.split\(','\)\);/);
  assert.match(sweep, /if \(!m\.flow && m\.body\[0\] < STEP_MIN_ROOM\) problems\.push\(/, 'a step with no room fails');
  // The question's results never drawn over the step (the review of 2026-11-18: in a flowing view they were).
  assert.match(sweep, /step\.resultsOverStep = resultsBox\.top < stepBox\.bottom - 1 && resultsBox\.bottom > stepBox\.top \+ 1;/);
  assert.match(sweep, /if \(m\.resultsOverStep\) problems\.push\(/, 'results drawn over the step fail');
  // Every staged step watched once it has settled, and with the keypad up on a phone: a step that changes its layout
  // or its plane's cap again, or a box typed into that leaves the view, fails. At the sizes the review found loops.
  assert.deepEqual(SETTLE_SIZES.map((size) => size.id), ['360x640', '412x915', '1920x970', '1920x1080']);
  assert.ok(SETTLE_SIZES.filter((size) => size.phone).every((size) => size.width < 700), 'the phones are touch phones');
  assert.deepEqual([...SETTLE_SCENES], ['ux-staged-table', ...STAGED_SCENES]);
  assert.ok(SETTLE_WATCH_MS >= 1000);
  const settle = region(sweep, 'const runSettle = async', '\n};\n', 'the settle check');
  assert.match(settle, /\?legacy=1&staged=1&identity=1/, 'the harness\'s staged table, with the identity bar');
  assert.match(settle, /else if \(opened\.changes\) problems\.push\(/);
  assert.match(settle, /if \(typing\.changes\) problems\.push\(/);
  assert.match(settle, /if \(typing\.hidden\) problems\.push\(/);
  assert.match(settle, /if \(!typing\?\.keypad\) problems\.push\(/, 'a keypad that does not come up is not a pass');
  assert.match(sweep, /observer\.observe\(root, \{ attributes: true, attributeFilter: \['data-step-room', 'style'\] \}\);/, 'every write of the layout and the cap is counted');
  assert.match(sweep, /if \(m\.plane && m\.plane\.height > m\.plane\.room \+ 1\) problems\.push\(/, 'a plane taller than its step fails');
  assert.match(sweep, /else if \(m\.plane && m\.plane\.withControls > m\.plane\.room \+ 1\) \{[\s\S]*?if \(m\.plane\.room >= PLANE_MIN \+ controls\) problems\.push\(/, 'and one whose controls fall out of a step that could hold them');
  // And a view too short for a plane at its floor and its controls together: reported once (at 320x568 with 200% text
  // it was 172px), it fails since Work View's task is two lines there.
  assert.match(region(sweep, 'const runStaged = async', '\n};\n', 'the staged check'), /else problems\.push\(`\$\{where\}: the view is \$\{m\.plane\.room\}px, too short for a plane at its \$\{PLANE_MIN\}px floor/);
  assert.doesNotMatch(sweep, /cramped/, 'nothing is reported instead of failed');
  assert.match(sweep, /m\.nested\.forEach\(\(entry\) => problems\.push\(`\$\{where\}: \$\{entry\}`\)\);/, 'and a scroller inside a scroller');
  assert.match(read('tests/browser/studentUxPlatformMain.jsx'), /writeQuestionDraft\(`\$\{draftKeyFor\(flat\)\}:workflow-stage`, index, \{ edit: false \}\);/, 'the harness opens a staged question on a chosen step');
  // R17's: the tries line, the completion medallion and the opener are among what is measured.
  for (const kind of ['tries', 'completion medallion', 'section progress', 'closed verdict', 'opener']) assert.ok(kind in HEADER_ITEMS, kind);
  // The assignment harness mounts every registry tool, every Path tool and every legacy question type.
  const driver = read('tests/browser/workViewOpenerCover.mjs');
  assert.match(driver, /\?tools=1&legacy=1&path=1/);
  const harness = read('tests/browser/studentUxPlatformMain.jsx');
  assert.match(harness, /params\.get\('path'\) === '1'/);
  assert.match(harness, /questionFromToolPayload\(buildPublicToolPayload\(authored\)\)/, 'as My Math Path delivers it');
});

test('the sweep presses "Show a hint" on every staged step, and fails a hint out of sight or focus left on the page', async () => {
  const { HINT_SIZES, HINT_SCENES, HINT_SETTLE_MS, SETTLE_SCENES, STAGED_SCENES, hintProblems } = await import('../browser/workViewOpenerCover.mjs');
  // Where a step switched to flowing under its hint (the review of 2026-11-18): a Chromebook with and without its
  // shelf, a 1280x689 laptop, and three phones, by touch.
  assert.deepEqual(HINT_SIZES.map((size) => size.id), ['1366x768', '1366x657', '1280x689', '390x844', '360x740', '412x915']);
  assert.deepEqual(HINT_SIZES.filter((size) => size.phone).map((size) => size.id), ['390x844', '360x740', '412x915']);
  for (const size of HINT_SIZES) assert.equal(`${size.width}x${size.height}`, size.id);
  assert.ok(HINT_SIZES.every((size) => size.textScale === 1));
  // Every step of the harness's staged questions: its staged table and the two staged question types.
  assert.equal(HINT_SCENES, SETTLE_SCENES);
  assert.deepEqual([...HINT_SCENES], ['ux-staged-table', ...STAGED_SCENES]);
  assert.ok(HINT_SETTLE_MS >= 1000, 'the step has flowed, and its plane been capped, before it is read');

  // As measured on the base at 1366x768, the staged table: the hint 873px down a view that ends at 767, the button
  // pressed gone and focus on <body>.
  const hidden = { flow: true, view: [58, 767], scrollTop: 0, hint: { top: 873, bottom: 1009, height: 136, seen: 0 }, focus: { on: 'body', hint: false, panel: false } };
  assert.deepEqual(hintProblems(hidden), [
    'the newest hint has 0 of its 136px in sight once the step has settled (the view scrolling as one, scrolled 0px)',
    'focus is on body, not on the hint or its panel',
  ]);
  // Whole where it fits: Axis of symmetry at 1366x657 showed 132 of its 136px, and that fails too.
  const cut = { ...hidden, hint: { top: 635, bottom: 771, height: 136, seen: 132 }, focus: { on: 'li', hint: true, panel: true } };
  assert.deepEqual(hintProblems(cut), ['the newest hint has 132 of its 136px in sight once the step has settled (the view scrolling as one, scrolled 0px)']);
  assert.deepEqual(hintProblems({ ...cut, flow: false, scrollTop: 12 }), ['the newest hint has 132 of its 136px in sight once the step has settled (a bounded step, scrolled 12px)']);
  // In sight, and focus on the hint or anywhere in its panel: nothing.
  const fixed = { ...hidden, scrollTop: 242, hint: { top: 631, bottom: 767, height: 136, seen: 136 }, focus: { on: 'li', hint: true, panel: true } };
  assert.deepEqual(hintProblems(fixed), []);
  assert.deepEqual(hintProblems({ ...fixed, hint: { ...fixed.hint, seen: 135 } }), [], 'a pixel of rounding is not a fault');
  assert.deepEqual(hintProblems({ ...fixed, focus: { on: 'section', hint: false, panel: true } }), [], 'the panel, while a rung loads');
  // Focus anywhere else is not the hint: the page, or a control left in the step.
  assert.deepEqual(hintProblems({ ...fixed, focus: { on: 'button.workflow-focus__nav-button "Next step"', hint: false, panel: false } }), ['focus is on button.workflow-focus__nav-button "Next step", not on the hint or its panel']);
  // A hint taller than the view fills it.
  assert.deepEqual(hintProblems({ ...fixed, view: [58, 300], hint: { top: 40, bottom: 400, height: 360, seen: 242 } }), []);
  assert.equal(hintProblems({ ...fixed, view: [58, 300], hint: { top: 100, bottom: 460, height: 360, seen: 200 } }).length, 1);
  // A step that could not be read is not a pass.
  assert.deepEqual(hintProblems(null), ['Work View did not stay open on the staged step']);
  assert.deepEqual(hintProblems({ ...fixed, hint: null }), ['"Show a hint" opened no hint']);

  // Run by default; on each step the first hint is offered again (the help a question had is kept across a remount),
  // the offer under the work is pressed as a student presses it, and each problem fails the size.
  const sweep = read('tests/browser/workViewOpenerCover.mjs');
  const hint = region(sweep, 'const runHint = async', '\n};\n', 'the hint check');
  assert.match(hint, /\?legacy=1&staged=1&identity=1/, 'the harness\'s staged table, with the identity bar');
  assert.match(hint, /window\.__ux\.forgetHelp\(qid\) && window\.__ux\.atStep\(qid, at\)/);
  assert.match(hint, /const offer = page\.locator\(`\$\{OPEN\} \.mathmaster-attempt-results \[data-first-hint-offer\] button`, \{ hasText: 'Show a hint' \}\)\.first\(\);/);
  assert.match(hint, /if \(size\.phone\) await offer\.tap\(\);\s*else await offer\.click\(\);\s*await settled\(page, HINT_SETTLE_MS\);\s*const reading = await page\.evaluate\(READ_HINT\);/);
  assert.match(hint, /hintProblems\(reading\)\.forEach\(\(problem\) => problems\.push\(`\$\{where\}: \$\{problem\}`\)\);/);
  assert.match(hint, /problems\.push\(`\$\{where\}: no "Show a hint" offered under the step`\);/, 'a step with nothing to press is not a pass');
  assert.match(sweep, /for \(const size of sized\(HINT_SIZES\)\) tasks\.push\(\(\) => runHint\(browser, origins, size\)\);/);
  // What is read: the newest hint, the reveal's target, against the view's own box inside the window.
  const reader = region(sweep, 'export const READ_HINT = () => {', '\n};\n', 'the hint reader');
  assert.match(reader, /const hint = hints\[hints\.length - 1\] \|\| null;/);
  assert.match(reader, /const bottom = Math\.min\(window\.innerHeight, s\.top \+ surface\.clientTop \+ surface\.clientHeight\);/);
  assert.match(reader, /focus: \{ on: name\(active\), hint: Boolean\(hint\) && active === hint, panel: Boolean\(panel\?\.contains\(active\)\) \},/);
  const harness = read('tests/browser/studentUxPlatformMain.jsx');
  assert.match(harness, /window\.localStorage\.removeItem\(supportUseStorageKey\(draftKeyFor\(flat\)\)\);/, 'the harness forgets a question\'s help on request');
});

test('the sweep fails a phone question left without room for its work at a large text size, in Focus view and with progress shown', async () => {
  const { ROOM_SIZES, ROOM_SCENES, ROOM_REACH, WORK_ROOM_SHARE } = await import('../browser/workViewOpenerCover.mjs');
  const { PLANE_MIN } = await import('../../src/platform/workflow/stepRoom.js');
  // The five phones at 200% text, the smallest at 150%, and the smallest at 100% as the control.
  assert.deepEqual(ROOM_SIZES.map((size) => size.id), ['320x568', '320x568@150%', '320x568@200%', '360x740@200%', '375x667@200%', '390x844@200%', '412x915@200%']);
  assert.ok(ROOM_SIZES.every((size) => size.phone && size.width < size.height), 'phones held upright');
  // A typed answer, a choice, a graph a student draws and a staged question, Work View on the last two.
  assert.deepEqual(ROOM_SCENES.map((scene) => scene.kind), ['typed', 'choice', 'graph', 'staged']);
  assert.deepEqual(ROOM_SCENES.filter((scene) => scene.workView).map((scene) => scene.kind), ['graph', 'staged']);
  assert.ok(ROOM_SCENES.every((scene) => scene.shows), 'each scene must show its kind of work, or it proves nothing');
  assert.equal(WORK_ROOM_SHARE, 0.2);
  for (const name of ['tries', 'opener', 'submit', 'next']) assert.ok(name in ROOM_REACH, name);
  const sweep = read('tests/browser/workViewOpenerCover.mjs');
  const room = region(sweep, 'const runRoom = async', '\n};\n', 'the room check');
  // Read in Focus view and with progress shown, each question; Work View on the graph and the staged question.
  assert.match(room, /for \(const state of \['focus view', 'progress shown'\]\) \{/);
  assert.match(room, /if \(room && room\.seen < least\) problems\.push\(/, 'too little of the screen for the work fails');
  assert.match(room, /const least = Math\.round\(size\.height \* WORK_ROOM_SHARE\);/);
  assert.match(room, /else if \(!target\.reached\) problems\.push\(/, 'a target that cannot be reached fails');
  assert.match(room, /else if \(zoomRow != null && !size\.side && view\.view < PLANE_MIN \+ zoomRow\) problems\.push\(/, 'a Work View too short for a plane at its floor and its zoom row fails, held upright');
  assert.match(room, /if \(folded && room\?\.pageScrolls\) problems\.push\(/, 'at 100% text a page that scrolls fails');
  assert.ok(PLANE_MIN === 160);
  // Reached as a finger reaches it: a box that clips is never scrolled, only one that scrolls, and the page.
  const reach = region(sweep, 'const READ_REACH = (selector) => {', '\n};\n', 'the reach reader');
  assert.match(reach, /\? \/\(auto\|scroll\)\/\.test\(getComputedStyle\(node\)\.overflowY\) && node\.scrollHeight > node\.clientHeight \+ 1/);
  assert.match(reach, /: \/\(auto\|scroll\)\/\.test\(getComputedStyle\(node\)\.overflowX\) && node\.scrollWidth > node\.clientWidth \+ 1\);/);
  assert.match(reach, /if \(fingerScrolls\(node, 'y'\)\) node\.scrollTop \+=/);
  assert.match(reach, /if \(fingerScrolls\(node, 'x'\)\) node\.scrollLeft \+=/);
  // Whole: cut on no side, by any box between it and the page.
  assert.match(reach, /const cut = seen\.bottom - seen\.top < box\.height - 1 \|\| seen\.right - seen\.left < box\.width - 1;/);
  assert.doesNotMatch(executableSource(reach), /scrollIntoView/, 'scrollIntoView moves a box that clips');
  assert.match(reach, /reached: onScreen && !cut && onTop/);
  // The real App's lesson of one question of each kind.
  assert.match(room, /await page\.goto\(`\$\{origins\.app\}\$\{ROOM_APP\}`/);
  assert.match(sweep, /const ROOM_APP = '\/tests\/browser\/teacherWorkflow\/index\.html\?reset=1&as=student&studentId=910002&questions=room';/);
  const lesson = read('tests/browser/teacherWorkflow/textRoomLesson.js');
  assert.match(lesson, /studentActions: \['multipleResponses'\],\n\s+responses: \[\{ id: 'm', label: 'Slope'/, 'a typed answer');
  assert.match(lesson, /type: 'choice',/, 'a choice');
  assert.match(lesson, /studentActions: \['constructLine'\]/, 'a graph a student draws');
  assert.match(lesson, /studentActions: \['completeTable', 'constructGraph', 'stateDomain', 'stateRange'\]/, 'a staged question');
  assert.match(read('tests/browser/teacherWorkflow/fakeFirestore.js'), /requestedLesson === 'room' \? await import\('\.\/textRoomLesson\.js'\)/);
  assert.match(read('tests/browser/teacherWorkflow/fixture.js'), /\['matrices', 'dividing', 'radicals', 'runtime', 'room'\]\.includes\(questionSet\) && compiledSections/);
});

test('the sweep fails an action bar that does not fit the screen, at every size it reads, 100% included, and on a phone on its side', async () => {
  // At 200% text on a 320 to 375px phone Submit ran up to 25px past the screen and the bar scrolled sideways; on every
  // phone the words under Undo and Start over ran into the tools beside them (6px at 100% on a 320px phone), and in
  // Work View "Submit — uses 1 of 3 tries" ran 72px past its button.
  const { ACTION_BARS, TARGET_MIN, ROOM_SIDE_SIZES, barProblems } = await import('../browser/workViewOpenerCover.mjs');
  // Every bar a question shows: its own on an upright phone, on its side and on a laptop, and Work View's while open.
  for (const bar of ['.portrait-action-bar', '.landscape-action-bar', '.mathmaster-desktop-action-bar', '.mathmaster-work-view-host[data-open="true"] .mathmaster-work-view-actions']) {
    assert.ok(ACTION_BARS.split(',').some((selector) => selector.trim().endsWith(bar)), bar);
  }
  assert.equal(TARGET_MIN, 24, 'WCAG 2.5.8');
  // Two phones on their side at 200% text, read for their bars alone.
  assert.deepEqual(ROOM_SIDE_SIZES.map((size) => size.id), ['667x375@200%', '740x360@200%']);
  assert.ok(ROOM_SIDE_SIZES.every((size) => size.phone && size.side && size.width > size.height && size.textScale === 2));
  // What fails, on a reading: a bar that fits says nothing; each way of not fitting is said.
  const control = (fields = {}) => ({ name: 'Submit', left: 200, right: 300, width: 100, height: 44, wordsPast: 0, ...fields });
  const bar = (fields = {}, controls = [control()]) => ({ name: 'action bar', screen: 320, left: 1, right: 319, width: 318, content: 318, controls, ...fields });
  assert.deepEqual(barProblems([bar()], 'typed'), []);
  assert.deepEqual(barProblems([bar({}, [control({ wordsPast: 1 })])], 'typed'), [], 'a pixel of ink past the box is rounding');
  const said = (reading) => barProblems([reading], 'typed').join(' | ');
  assert.match(said(bar({ right: 345 })), /^typed: the action bar runs 25px past the screen$/);
  assert.match(said(bar({ content: 354 })), /^typed: the action bar holds 354px in 318px and scrolls sideways$/);
  assert.match(said(bar({}, [control({ left: 221, right: 345 })])), /^typed: "Submit" in the action bar runs past the screen \(221 to 345 of 320px\)$/);
  assert.match(said(bar({}, [control({ left: -3 })])), /runs past the screen/, 'off the left edge too');
  assert.match(said(bar({}, [control({ wordsPast: 31 })])), /^typed: the words of "Submit" in the action bar run 31px past its own box$/);
  assert.match(said(bar({}, [control({ width: 22 })])), /^typed: "Submit" in the action bar is 22x44, under 24x24$/);
  assert.match(said(bar({}, [control({ height: 20 })])), /under 24x24/);
  const sweep = read('tests/browser/workViewOpenerCover.mjs');
  // The reader: the bar scrolled back to its start, its controls' boxes, and the words each draws (a name kept for a
  // screen reader, clipped to a pixel, is not drawn).
  const reader = region(sweep, 'const READ_BARS = (selector) => {', '\n};\n', 'the bar reader');
  assert.match(reader, /bar\.scrollLeft = 0;/);
  assert.match(reader, /\(style\.clip && style\.clip !== 'auto'\) \|\| \(style\.position === 'absolute' && box\.width <= 1 && box\.height <= 1\)\) return false;/);
  assert.match(reader, /wordsPast = Math\.max\(wordsPast, ink\.right - rect\.right, rect\.left - ink\.left, ink\.bottom - rect\.bottom, rect\.top - ink\.top\);/);
  assert.match(reader, /screen, left: round\(box\.left\), right: round\(box\.right\), width: bar\.clientWidth, content: bar\.scrollWidth,/);
  // Read in each state before the reach (which scrolls a box that scrolls sideways, as the bar did), and judged at
  // every size before the 100% control skips the room; and again in Work View. On its side, the bars alone.
  const room = region(sweep, 'const runRoom = async', '\n};\n', 'the room check');
  const order = ['const bars = await page.evaluate(READ_BARS, ACTION_BARS);', 'reach[name] = await page.evaluate(READ_REACH, selector);', 'problems.push(...barProblems(bars, where));', 'if (size.side) continue;', 'if (!large) {'];
  order.reduce((at, line) => {
    const next = room.indexOf(line, at);
    assert.ok(next > at, `${line} comes after what precedes it`);
    return next;
  }, -1);
  assert.match(room, /const viewBars = await page\.evaluate\(READ_BARS, ACTION_BARS\);[\s\S]*?problems\.push\(\.\.\.barProblems\(viewBars, `\$\{scene\.kind\}, work view`\)\);/);
  assert.match(room, /if \(!bars\.length\) problems\.push\(/, 'no bar to read fails');
  // ...and it settles: once the question has, every bar and control keeps one size and place for 1.5s, read every
  // frame, in Focus view and in Work View; a change, or a watch that read too few frames to say, fails.
  const { BAR_WATCH_MS } = await import('../browser/workViewOpenerCover.mjs');
  assert.equal(BAR_WATCH_MS, 1500);
  const watcher = region(sweep, 'const WATCH_BARS = ({ selector, ms }) => new Promise((resolve) => {', '\n});\n', 'the bar watch');
  assert.match(watcher, /return `\$\{Math\.round\(rect\.width\)\}x\$\{Math\.round\(rect\.height\)\}@\$\{Math\.round\(rect\.left - box\.left\)\},\$\{Math\.round\(rect\.top - box\.top\)\}`;/);
  assert.match(watcher, /if \(now !== last\) \{ changes \+= 1; last = now; \}/);
  assert.match(watcher, /if \(performance\.now\(\) - started < ms\) requestAnimationFrame\(tick\);/);
  assert.match(room, /if \(folded\) \{\s*const watch = await page\.evaluate\(WATCH_BARS, \{ selector: ACTION_BARS, ms: BAR_WATCH_MS \}\);[\s\S]*?if \(watch\.changes \|\| watch\.frames < 10\) problems\.push\(/);
  assert.match(room, /const viewWatch = await page\.evaluate\(WATCH_BARS, \{ selector: ACTION_BARS, ms: BAR_WATCH_MS \}\);\s*if \(viewWatch\.changes \|\| viewWatch\.frames < 10\) problems\.push\(/);
  assert.match(sweep, /for \(const size of sized\(\[\.\.\.ROOM_SIZES, \.\.\.ROOM_SIDE_SIZES\]\)\) tasks\.push\(\(\) => runRoom\(browser, origins, size\)\);/);
});

test('a pull request that changes the sweep, what it reads or what draws it runs the opener sweep', () => {
  const job = jobsOf(readWorkflow('work-view-browser-matrix.yml'))['work-view-opener-cover'];
  assert.ok(job, 'the job is in the Work View workflow');
  const steps = stepsOf(job);
  const run = steps.find((step) => /run: node tests\/browser\/workViewOpenerCover\.mjs\s*$/m.test(step));
  assert.ok(run, 'it runs the sweep');
  assert.match(run, /AUDIT_ORIGIN: "http:\/\/127\.0\.0\.1:5198"/);
  assert.match(run, /TEACHER_HARNESS_ORIGIN: "http:\/\/127\.0\.0\.1:5188"/);
  assert.ok(steps.some((step) => /forcedColors\.vite\.config\.mjs --host 127\.0\.0\.1 --port 5198/.test(step)), 'the stubbed harness');
  assert.ok(steps.some((step) => /teacherWorkflow\/vite\.config\.mjs/.test(step)), 'the in-memory app');
  assert.ok(steps.some((step) => /uses: actions\/upload-artifact@/.test(step) && /path: tests\/browser\/artifacts\/workViewOpenerCover/.test(step)), 'its report is kept');
  for (const file of [
    'tests/browser/workViewOpenerCover.mjs', 'tests/browser/support/openerCover.mjs', 'tests/browser/studentUxPlatformMain.jsx',
    'tests/browser/hostAccessibilityMain.jsx', 'tests/browser/colourAloneCuesMain.jsx', 'tests/browser/accessibilityTeacherScreens.mjs',
    'tests/platform/fixtures/pathToolQuestions.mjs', 'src/components/common/WorkViewShell.css', 'src/components/common/EnlargeableFigure.jsx',
    'src/QuestionEngine.jsx', 'src/App.css', 'src/GraphScenarioMatch.jsx', 'src/components/labs/InteractiveModelingLabPlayer.jsx',
    'src/components/student/PathQuestionStimulus.jsx', 'src/tools/dataModeling/DataModelingLab.jsx', 'src/GraphDisplay.jsx',
    'src/platform/workflow/WorkflowRunner.jsx', 'src/platform/workflow/stepRoom.js', 'src/platform/workflow/useStepRoom.js',
    'src/platform/workflow/WorkflowFocusMode.css', 'src/platform/supports/hints/hintPanelReveal.js', 'src/platform/supports/hints/HintPanel.jsx',
    'tests/browser/teacherWorkflow/textRoomLesson.js', 'src/components/student/MathToolMobileLayout.css',
    'src/components/student/SubmitCost.css',
  ]) {
    assert.ok(runsOnPullRequest('work-view-browser-matrix.yml', file), `a change to ${file} runs the opener sweep`);
  }
});

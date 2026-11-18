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
import { atRuleHolds, winning } from './helpers/cssCascade.mjs';
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
  assert.match(sweep, /const checks = new Set\(\(arg\('check'\) \|\| 'cover,badges,scroll,staged,settle'\)\.split\(','\)\);/);
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
    'src/platform/workflow/WorkflowFocusMode.css',
  ]) {
    assert.ok(runsOnPullRequest('work-view-browser-matrix.yml', file), `a change to ${file} runs the opener sweep`);
  }
});

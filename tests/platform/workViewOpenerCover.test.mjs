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

/* ------------------------------------------------- the browser sweep, wired into CI */

test('the sweep reads every surface the opener floats over, at the phones, at 200% text and on a Chromebook', async () => {
  const { SIZES, SCROLL_SIZES, SURFACES, SCROLL_SCENES, HEADER_ITEMS } = await import('../browser/workViewOpenerCover.mjs');
  assert.deepEqual(SIZES.map((size) => size.id), ['390x844', '360x740', '320x568', '390x844@200%', '360x740@200%', '320x568@200%', '1366x768']);
  assert.ok(SIZES.filter((size) => size.phone).every((size) => size.width <= 390));
  assert.deepEqual(SCROLL_SIZES.map((size) => size.id), ['390x844', '360x740', '320x568', '1366x768', '1920x1080']);
  assert.deepEqual(SURFACES.map((surface) => surface.id), ['assignment', 'hosts', 'lab', 'cues']);
  // The figures on their own are read on the phones; everything else at every size.
  assert.deepEqual(SURFACES.find((surface) => surface.id === 'cues').sizes.map((size) => size.id), SIZES.filter((size) => size.phone).map((size) => size.id));
  for (const id of ['assignment', 'hosts', 'lab']) assert.equal(SURFACES.find((surface) => surface.id === id).sizes, SIZES);
  // R10's set: the plane tools, the table tools and the Step Algebra boards.
  for (const id of ['tool-graphing2', 'tool-transformationsLab', 'tool-systemsWorkspace', 'tool-dataModelingLab', 'tool-linearTableWorkbench', 'tool-stepAlgebra2', 'legacy-stepAlgebra']) {
    assert.ok(SCROLL_SCENES.includes(id), id);
  }
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
  ]) {
    assert.ok(runsOnPullRequest('work-view-browser-matrix.yml', file), `a change to ${file} runs the opener sweep`);
  }
});

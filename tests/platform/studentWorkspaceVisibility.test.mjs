import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSIGNMENT_NAV_HEIGHT_VAR, STICKY_TASK_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// Live QA, 1536×900, systems substitution: the two given equations took a
// 300px column with ~750px of blank space beneath them, while the Step Algebra
// balance board got 165px per side and cancellation terms were clipped.
test('an active systems solver gets the full width; the givens become a strip above it', () => {
  const css = read('src/tools/systemsWorkspace/AlgebraicSystemMode.css');
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf('}', start));
  };
  assert.match(rule('.mathmaster-algebraic-system-layout.has-active-solver'), /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(rule('.mathmaster-work-view-host[data-open="true"] .mathmaster-algebraic-system-layout.has-active-solver'), /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(rule('.mathmaster-algebraic-system-layout.has-active-solver .mathmaster-algebraic-system-givens > .mathmaster-tool-panel'), /display:\s*flex;/);
  assert.doesNotMatch(css, /algebraic-system-layout\.has-active-solver \{\s*grid-template-columns:\s*minmax\(2\d0px/, 'no fixed side column while solving');
});

// Live QA, 1536×900: the navigator (top: 8px) sat 30px under the identity bar,
// hiding the section tabs; the task card's Hide button sat under the navigator
// (fixed top: 118px); the TEKS/CCMR chips rode in the sticky area over the
// tool's own buttons.
test('the sticky stack is offset by measured heights, not guesses', () => {
  const css = read('src/App.css');
  const nav = css.slice(css.indexOf('.mathmaster-assignment-unified-nav {'), css.indexOf('}', css.indexOf('.mathmaster-assignment-unified-nav {')));
  assert.match(nav, /top: calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ 6px\);/);
  assert.match(css, /--mm-sticky-task-top: calc\(var\(--mm-student-identity-stack-offset, 0px\) \+ 6px \+ var\(--mm-assignment-nav-height, 112px\) \+ 4px\);/);
  assert.equal(ASSIGNMENT_NAV_HEIGHT_VAR, '--mm-assignment-nav-height');

  // App.jsx is never imported by a test, so assert the import next to the call.
  const app = read('src/App.jsx');
  assert.match(app, /import \{ ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef \} from '\.\/platform\/layout\/stickyHeightRef\.js';/);
  assert.match(app, /<nav ref=\{stickyHeightRef\(ASSIGNMENT_NAV_HEIGHT_VAR\)\} className=\{`mathmaster-assignment-unified-nav/);
});

test('the navigator height ref is stable across renders and publishes the height', () => {
  assert.equal(stickyHeightRef('--x-test'), stickyHeightRef('--x-test'), 'same function every render');
  const set = [];
  const removed = [];
  globalThis.document = { documentElement: { style: { setProperty: (k, v) => set.push([k, v]), removeProperty: (k) => removed.push(k) } } };
  try {
    const ref = stickyHeightRef('--x-publish');
    ref({ offsetHeight: 143 });
    assert.deepEqual(set.at(-1), ['--x-publish', '143px']);
    ref(null);
    assert.deepEqual(removed, ['--x-publish']);
  } finally {
    delete globalThis.document;
  }
});

test('reference chips scroll with the page; the Hide task control sits on the card', () => {
  const container = read('src/components/student/MobileViewportContainer.jsx');
  const anchorStart = container.lastIndexOf('<div', container.indexOf('className={`mathmaster-desktop-question-anchor'));
  const anchorEnd = container.indexOf('{!workspaceActive && !isPromptCollapsed && taskMeta');
  assert.ok(anchorStart > 0 && anchorEnd > anchorStart);
  assert.doesNotMatch(container.slice(anchorStart, anchorEnd), /taskMeta &&/, 'chips are not inside the sticky anchor');
  const css = read('src/App.css');
  assert.match(css, /\.mathmaster-desktop-question-anchor:not\(\.is-collapsed\) \.mathmaster-desktop-task-toggle-row \{\s*position: absolute;/);
  assert.match(css, /\.mathmaster-desktop-question-anchor:not\(\.is-collapsed\) > \.mathmaster-question-prompt \{\s*padding-right: 104px !important;/);
  assert.match(read('src/index.css'), /\.mathmaster-desktop-question-anchor,\s*\.mathmaster-desktop-task-meta \{\s*display: none;/);
});

// Live QA, Work View at 1536×900: the surface opened at its top and the balance
// board the student was working on started ~620px down, half below the fold.
test('Work View opens on the region the tool marks as the student\'s current work', () => {
  const shell = read('src/components/common/EnlargeableFigure.jsx');
  const effect = shell.slice(shell.indexOf('OPEN ON THE STUDENT\'S CURRENT WORK'), shell.indexOf('// Focus goes back where it came from'));
  assert.match(effect, /if \(!enlarged \|\| typeof window === 'undefined'\) return undefined;/);
  assert.match(effect, /querySelectorAll\?\.\('\[data-work-view-focus="true"\]'\)/);
  assert.match(effect, /if \(targetBox\.top >= surfaceBox\.top && targetBox\.bottom <= surfaceBox\.bottom\) return;/, 'an already visible region is not moved');
  assert.match(effect, /surface\.scrollTop \+= targetBox\.top - surfaceBox\.top - 8;/);
  assert.match(shell, /<div\s+ref=\{hostRef\}\s+className=\{`mathmaster-work-view-host/);

  const systems = read('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  assert.match(systems, /className="mathmaster-systems-embedded-step-algebra" data-work-view-focus="true"/);
});

// Live QA round 2, 1536×900: opening Work View pinned the tool to the viewport,
// the document shrank by the tool's height and the browser clamped scrollY
// 294 → 0. After a correct answer closed Work View the student sat at the top
// of the assignment header, with the feedback and Next Question ~1600px below.
test('Work View holds the tool’s place and restores the scroll position on close', async () => {
  const { captureWorkViewScrollHold, restoreWorkViewScrollHold } = await import('../../src/platform/workView/workViewScrollHold.js');
  const calls = [];
  const win = { scrollX: 0, scrollY: 294, scrollTo: (options) => { calls.push(options); win.scrollY = options.top; } };
  const hold = captureWorkViewScrollHold({ getBoundingClientRect: () => ({ height: 1180.4 }) }, win);
  assert.deepEqual(hold, { scrollX: 0, scrollY: 294, height: 1180 });

  win.scrollY = 0; // clamped while the page was locked
  assert.equal(restoreWorkViewScrollHold(hold, win), true);
  assert.equal(win.scrollY, 294);
  assert.equal(restoreWorkViewScrollHold(hold, win), false, 'no scroll when already in place');
  assert.equal(calls.length, 1);

  const source = read('src/components/common/EnlargeableFigure.jsx');
  const open = source.slice(source.indexOf('const openWorkView = () => {'), source.indexOf('// Focus goes back where it came from'));
  assert.match(open, /const hold = captureWorkViewScrollHold\(hostRef\.current\?\.querySelector\?\.\('\.mathmaster-work-view-surface'\)\);\s*scrollHoldRef\.current = hold;\s*setPlaceholderHeight\(hold\?\.height \|\| 0\);\s*setEnlarged\(true\);/, 'captured before the tool leaves the flow');
  assert.match(source, /onClick=\{openWorkView\}/);
  const restore = source.slice(source.indexOf('useLayoutEffect(() => {'), source.indexOf('const openWorkView'));
  assert.match(restore, /restoreWorkViewScrollHold\(hold\);\s*const frame = window\.requestAnimationFrame\(\(\) => restoreWorkViewScrollHold\(hold\)\);/, 'restored before paint and again after scroll anchoring');
  assert.match(source, /\{enlarged && placeholderHeight \? \(\s*<div className="mathmaster-work-view-placeholder" aria-hidden="true" style=\{\{ height: placeholderHeight \}\} \/>/);
  assert.match(source, /closeRef\.current\?\.focus\?\.\(\{ preventScroll: true \}\);/, 'focusing the panel must not scroll the page behind it');
});

// Live QA round 2, Connect the Line in Work View: the header showed "Your task:
// …" and the instruction banner under it repeated the same prompt; the rail
// chips read "numeric Controls" and "table Data".
test('registered-tool Work View shows the task once and labels chips in sentence case', () => {
  const source = read('src/tools/shared/RegisteredToolWorkView.jsx');
  const describe = source.slice(source.indexOf('const capabilityDescriptor'), source.indexOf('// Final-registry safety net'));
  assert.match(describe, /if \(key === 'instruction'\) return descriptor\(key\);/);
  assert.doesNotMatch(describe, /'instruction'\) return \{[^}]*content: taskText/);

  // Evaluate the label helper without importing JSX.
  const helper = source.slice(source.indexOf('export const capabilityLabel'), source.indexOf('const descriptor'));
  const capabilityLabel = new Function(`${helper.replace('export const', 'const')} return capabilityLabel;`)();
  assert.equal(capabilityLabel('numericControls'), 'Numeric controls');
  assert.equal(capabilityLabel('tableData'), 'Table data');
  assert.equal(capabilityLabel('pointEditing'), 'Edit mathematical objects');
});

// Live QA round 2, 1536×900 Work View: twelve line cards in a 540px column with
// "Check groups" below the fold while reference text took the other half.
test('line card sets take the full width; graph cards span two columns where there is room', () => {
  const source = read('src/tools/representationMatch/RepresentationMatch.jsx');
  assert.match(source, /const cardSetLayout = mode === 'linearConnections';\s*const Layout = cardSetLayout \? CardSetStack : ToolGrid;/);
  assert.match(source, /<Layout min=\{330\}>[\s\S]*<Panel title="Representation reasoning" collapsible>[\s\S]*<\/Layout>/);
  assert.match(source, /const CardSetStack = [\s\S]{0,120}gridTemplateColumns: 'minmax\(0, 1fr\)'/);
  const css = read('src/tools/representationMatch/RepresentationMatch.css');
  assert.match(css, /@container line-cards \(min-width: 520px\) \{\s*\.mathmaster-line-card-grid > \.mathmaster-line-card\[data-card-kind="graph"\] \{\s*grid-column: span 2;/);
  assert.match(source, /import '\.\/RepresentationMatch\.css';/);
  // Short cards keep their height beside a tall graph card, and the graph's
  // proportions leave its axis labels apart.
  assert.match(css, /\.mathmaster-line-card-grid \{\s*align-items: start;/);
  assert.match(source, /<CoordinatePlane enlargeable=\{false\} width=\{320\} height=\{240\}/);
});

// Live QA round 2, 1536×900: Start landed on a Warm-Up closed for the period.
// Every control was disabled under "3 of 3 tries left"; the reason was ~1470px
// below the landing position, past the tool.
test('a locked question says why in the attempt strip, not only below the tool', () => {
  const source = read('src/QuestionEngine.jsx');
  const strip = source.slice(source.indexOf('className="mathmaster-question-attempt-strip"'), source.indexOf('{dolMode && <div'));
  const lockedAt = strip.search(/: assignmentLocked\s*\?\s*\(assignmentLockedMessage \|\|/);
  const triesAt = strip.indexOf("'try' : 'tries'} left`");
  assert.ok(lockedAt > 0, 'the strip shows the lock message');
  assert.ok(triesAt > lockedAt, 'the lock message wins over the tries count');
});

// Live QA round 2: the substitution token "Solved value 20/9" and the step chip
// "x = 20/9" showed scrollbar arrows under a clipped fraction.
test('inline math never becomes a scroll container', () => {
  const source = read('src/MathDisplay.jsx');
  const style = source.slice(source.indexOf('style={{', source.indexOf('<Element')), source.indexOf('...style,', source.indexOf('<Element')));
  assert.match(style, /overflowX: inline \? 'visible' : 'auto',/);
  assert.match(style, /overflowY: inline \? 'visible' : 'hidden',/);
  // Block math keeps its vertical clip, so a stacked fraction gets room inside it.
  assert.match(style, /\.\.\.\(!inline && cleanValue\.includes\('\\\\frac'\) \? \{ paddingTop: '0\.1em', paddingBottom: '0\.4em' \} : null\),/);
});

// Live QA round 2: finishing a simplification left the page clamped at its
// bottom with the equation under the sticky task card.
test('a committed step reveals the equation when it is under the sticky chrome', async () => {
  const { workspaceNeedsReveal } = await import('../../src/platform/layout/workspaceReveal.js');
  assert.equal(workspaceNeedsReveal({ top: 120, bottom: 170 }, 900), true, 'under the task card');
  assert.equal(workspaceNeedsReveal({ top: 850, bottom: 900 }, 900), true, 'under the action bar');
  assert.equal(workspaceNeedsReveal({ top: 430, bottom: 480 }, 900), false);
  const core = read('src/StepByStepAlgebraCore.jsx');
  assert.match(core, /import \{ workspaceNeedsReveal \} from '\.\/platform\/layout\/workspaceReveal\.js';/);
  const commit = core.slice(core.indexOf('setBalancePulse(true);'), core.indexOf("'Balanced step complete. Continue from the equation shown.'"));
  assert.match(commit, /if \(equals && workspaceNeedsReveal\(equals\.getBoundingClientRect\(\), window\.innerHeight\)\) \{\s*equals\.scrollIntoView\?\.\(\{ block: 'center'/);
});

// Live QA round 2, 1536×900: the back-substitution solver opened with its
// equation behind the action bar; only the reduce solver revealed itself.
test('every embedded systems solver reveals itself when it opens', () => {
  const source = read('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  const solvers = source.split('<EmbeddedStepAlgebra').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('/>')));
  assert.equal(solvers.length, 3);
  solvers.forEach((solver) => assert.match(solver, /\n\s*autoReveal\n/, solver.slice(0, 80)));
});

test('opening a question lands on its live work when a tool marks one', () => {
  const app = read('src/App.jsx');
  const effect = app.slice(app.indexOf("const liveWork = stage?.querySelectorAll?.('[data-work-view-focus=\"true\"]');"), app.indexOf("const changeQuestion = async"));
  assert.match(effect, /if \(target\) target\.scrollIntoView\?\.\(\{ behavior, block: 'start' \}\);\s*else stage\?\.scrollIntoView\?\.\(\{ behavior, block: 'start' \}\);/);
  // Re-aims while the next question renders (the page is briefly short and the
  // scroll clamps), and stops as soon as the student scrolls, types or touches.
  assert.match(effect, /new ResizeObserver\(\(\) => \{ if \(!settled\) reveal\('auto'\); \}\)/);
  assert.match(effect, /const settleEvents = \['wheel', 'touchstart', 'keydown', 'pointerdown'\];/);

  // ...with its top just under the sticky task, whose height is measured.
  const css = read('src/App.css');
  assert.match(css, /\.mathmaster-desktop-question-content \[data-work-view-focus="true"\] \{\s*scroll-margin-top: calc\(var\(--mm-sticky-task-top, 0px\) \+ var\(--mm-sticky-task-height, 0px\) \+ 8px\);/);
  const container = read('src/components/student/MobileViewportContainer.jsx');
  assert.match(container, /import \{ STICKY_TASK_HEIGHT_VAR, stickyHeightRef \} from '\.\.\/\.\.\/platform\/layout\/stickyHeightRef\.js';/);
  assert.match(container, /<div ref=\{stickyHeightRef\(STICKY_TASK_HEIGHT_VAR\)\} className=\{`mathmaster-desktop-question-anchor/);
  assert.equal(STICKY_TASK_HEIGHT_VAR, '--mm-sticky-task-height');
});

// Live QA round 2: subtracting 40/9 showed "⠿ Pick up − \frac{40}{9}" — the
// math field's LaTeX printed as text, and read aloud as such.
test('operation chips typeset the operand instead of printing its LaTeX', () => {
  const core = read('src/StepByStepAlgebraCore.jsx');
  const chip = core.slice(core.indexOf('function OperationChip'), core.indexOf('export default function StepByStepAlgebra'));
  assert.match(chip, /<MathDisplay value=\{latex\} format="latex" inline ariaLabel=\{token\.operand\} \/>/);
  assert.doesNotMatch(core, /describeOperationToken\(armedTile\.operation, operand\)/, 'tokens are described from the parsed operand');
  assert.match(core, /<OperationChip token=\{describeOperationToken\(armedTile\.operation, operandLabel\)\} latex=\{operand\} \/>/);
  assert.match(core, /<OperationChip token=\{heldToken\.label\} latex=\{heldToken\.latex\} \/>/);
});

// Live QA round 2: idle for two minutes with Work View open, the overlay
// (z-index 9999) rendered behind Work View (2147483000) — the timer paused and
// the student was never told. It was also an unlabelled div without focus.
test('the inactivity overlay sits above Work View and is a focused, labelled dialog', () => {
  const app = read('src/App.jsx');
  const overlay = app.slice(app.indexOf('const renderIdleOverlay = () => {'), app.indexOf('const renderDeleteAssignmentDialog'));
  const zIndex = Number(overlay.match(/zIndex: (\d+),/)?.[1]);
  const workView = read('src/components/common/WorkViewShell.css');
  const workViewZ = Number(workView.match(/\.mathmaster-work-view-host\[data-open="true"\] \{[\s\S]*?z-index: (\d+);/)?.[1]);
  assert.ok(workViewZ > 0 && zIndex > workViewZ, `${zIndex} must exceed Work View ${workViewZ}`);
  assert.match(overlay, /role="alertdialog"\s*aria-modal="true"\s*aria-labelledby="mathmaster-idle-title"/);
  assert.match(overlay, /ref=\{\(element\) => element\?\.focus\?\.\(\{ preventScroll: true \}\)\}/);
});

// Live QA round 2: once the overlay was on top, the browser's synthetic
// mousemove (content appearing under a resting cursor) dismissed it instantly
// and restarted the timer.
test('only a pointer that actually moved counts as activity', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const lastPointerRef = useRef\(null\);/);
  const effect = app.slice(app.indexOf('const resetOnPointerMove = (event) => {'), app.indexOf("window.addEventListener('keydown', resetActivity);"));
  assert.match(effect, /if \(point === lastPointerRef\.current\) return;/);
  assert.match(effect, /window\.addEventListener\('mousemove', resetOnPointerMove\);/);
  assert.doesNotMatch(app, /addEventListener\('mousemove', resetActivity\)/);
  // Touch reading, wheel scrolling and drags are activity too.
  for (const type of ['pointerdown', 'touchstart', 'wheel']) {
    assert.match(app, new RegExp(`window\\.addEventListener\\('${type}', resetActivity, passive\\);`), type);
    assert.match(app, new RegExp(`window\\.removeEventListener\\('${type}', resetActivity, passive\\);`), type);
  }
});

// Live QA round 2: the floating Enlarge button covered "About this tool" on
// desktop and the tool's title on a phone.
test('the tool header leaves room for the floating Work View opener', () => {
  const css = read('src/components/common/WorkViewShell.css');
  assert.match(css, /\.mathmaster-question-container \.mathmaster-work-view-surface\[data-enlarged="false"\] \.mathmaster-tool-shell-header \{\s*padding-right: 176px !important;/);
  const opener = read('src/components/common/EnlargeableFigure.jsx');
  assert.match(opener, /const CONTROL = \{\s*position: 'absolute',\s*top: 8,\s*right: 8,/, 'the opener still floats at the top-right corner');
});

// Live QA round 2, 390×844: the four work-bar pills (446px) wrapped into a
// 105px two-row bar.
test('the phone work bar is one flexible row with a short Reset label', () => {
  const css = read('src/components/student/MathToolMobileLayout.css');
  assert.match(css, /\.mathmaster-question-container\.mode-portrait \.portrait-action-bar \{\s*display: flex;\s*flex-wrap: wrap;\s*gap: 6px;/);
  assert.match(css, /\.mathmaster-question-container\.mode-portrait \.mathmaster-action-label-long \{\s*display: none;/);
  const engine = read('src/QuestionEngine.jsx');
  assert.match(engine, /aria-label=\{resettingQuestion \? 'Resetting…' : 'Reset Question'\}/);
  assert.match(engine, /↺ Reset<span className="mathmaster-action-label-long"> Question<\/span>/);
});

// Live QA round 2, 390×844 Work View: the numeric keypad (z 13000) opened
// behind Work View (z 2147483000) while its height was still reserved.
test('the numeric keypad stacks above Work View and below the inactivity dialog', () => {
  const shell = read('src/components/common/WorkViewShell.css');
  const z = (pattern) => Number(shell.match(pattern)?.[1]);
  const workView = z(/\.mathmaster-work-view-host\[data-open="true"\] \{[\s\S]*?z-index: (\d+);/);
  const keypad = z(/html\[data-work-view-open="true"\] \.mathmaster-mobile-numeric-keypad \{\s*z-index: (\d+) !important;/);
  const idle = Number(read('src/App.jsx').match(/className="mathmaster-idle-overlay"[\s\S]*?zIndex: (\d+),/)?.[1]);
  assert.ok(keypad > workView, `${keypad} > ${workView}`);
  assert.ok(idle > keypad, `${idle} > ${keypad}`);
});

// Live QA round 2, 390×844: Work View's four controls wrapped to ~107px.
test('Work View phone controls use short labels and share one row', () => {
  const figure = read('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /aria-label=\{action\.shortLabel && typeof action\.label === 'string' \? action\.label : undefined\}/);
  assert.match(figure, /<span className="mathmaster-work-view-action-short" aria-hidden="true">\{action\.shortLabel\}<\/span>/);
  const css = read('src/components/common/WorkViewShell.css');
  assert.match(css, /\[data-open="true"\]\[data-layout="mobile"\] \.mathmaster-work-view-action-full \{ display: none; \}/);
  assert.match(css, /\[data-open="true"\]\[data-layout="mobile"\]\[data-controls="bottom"\] \.mathmaster-work-view-actions button \{\s*flex: 1 1 auto;/);
  assert.match(read('src/QuestionEngine.jsx'), /shortLabel: resettingQuestion \? 'Resetting…' : '↺ Reset',/);
});

// Live QA round 2, 390×844: after a correct answer "Next Question" was at
// y=939, clipped by the fixed-height question container — unreachable.
test('a finished question puts its next step in the action bar', () => {
  const engine = read('src/QuestionEngine.jsx');
  const decide = engine.slice(engine.indexOf('const barContinueAction = !locked'), engine.indexOf('// UNDO BELONGS WHERE THE HANDS ARE.'));
  assert.match(decide, /sectionComplete && typeof onContinueSection === 'function'\s*\? \{ label: `Continue to \$\{continueSectionLabel \|\| 'next section'\} →`, onClick: onContinueSection \}/);
  assert.match(decide, /!sectionComplete && typeof onNextQuestion === 'function'\s*\? \{ label: 'Next question →', onClick: onNextQuestion \}/);
  assert.match(engine, /\) : barContinueAction \? \(\s*\/\/[\s\S]*?<button\s*type="button"\s*className="mathmaster-bar-continue"\s*onClick=\{barContinueAction\.onClick\}/);
});

// Live QA round 2, 1180×820: a multi-part question's table sat centred with
// ~370px blank either side and every answer field below the fold; scrolling to
// the fields slid the table under the sticky task card.
test('a multi-part data table sits beside its fields where there is room', () => {
  const grader = read('src/MultiAnswerGrader.jsx');
  assert.match(grader, /import '\.\/MultiAnswerGrader\.css';/);
  assert.match(grader, /data-side-table=\{Boolean\(question\?\.table\) && !question\?\.graph && !question\?\.visual && !question\?\.mathDisplay && !question\?\.supportingMath && !candidateGraphs\.length \? 'true' : 'false'\}/);
  assert.match(grader, /<div className="mathmaster-multipart-body">\s*<QuestionVisual question=\{question\} \/>/);
  const css = read('src/MultiAnswerGrader.css');
  assert.match(css, /@container multipart \(min-width: 900px\) \{\s*\.mathmaster-multipart-layout\[data-side-table="true"\] > \.mathmaster-multipart-body \{\s*display: grid;\s*grid-template-columns: max-content minmax\(0, 1fr\);/);
  assert.match(css, /html:not\(\[data-work-view-open="true"\]\) \.mathmaster-multipart-layout\[data-side-table="true"\] > \.mathmaster-multipart-body > :first-child \{\s*position: sticky;/);
});

// Live QA round 2, 1536×900: focusing E(2)'s field scrolled it to just under
// the sticky task card, with its label hidden beneath the card.
test('a focused answer field keeps its label clear of the sticky task', () => {
  const css = read('src/App.css');
  assert.match(css, /\.mathmaster-desktop-question-content math-field,\s*\.mathmaster-desktop-question-content input,\s*\.mathmaster-desktop-question-content select,\s*\.mathmaster-desktop-question-content textarea \{\s*scroll-margin-top: calc\(var\(--mm-sticky-task-top, 0px\) \+ var\(--mm-sticky-task-height, 0px\) \+ 56px\);/);
});

// Live QA round 2: seven elimination steps in a 612px panel scrolled sideways,
// hiding Back-substitute and Verify behind a scrollbar.
test('the systems step trail wraps instead of scrolling sideways', () => {
  const css = read('src/tools/systemsWorkspace/AlgebraicSystemMode.css');
  const rule = css.slice(css.indexOf('.mathmaster-systems-work-trail-steps {'), css.indexOf('}', css.indexOf('.mathmaster-systems-work-trail-steps {')));
  assert.match(rule, /flex-wrap: wrap;/);
  assert.doesNotMatch(rule, /overflow-x: auto/);
});

// Live QA round 2: the elimination Prepare/Combine cards were squeezed beside
// a 380px column of the given equations.
test('systems work gets the full width once a route is under way', () => {
  const source = read('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  assert.match(source, /className=\{`mathmaster-algebraic-system-layout\$\{embeddedSolverActive \|\| Boolean\(selection\.variable\) \? ' has-active-solver' : ''\}`\}/);
});

// Live QA round 2: each new elimination stage opened below the fold with
// nothing bringing it into view.
test('new elimination stages come into view when they appear', () => {
  const source = read('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  assert.match(source, /const revealStageOnAppear = useCallback\(\(element\) => \{\s*if \(!element \|\| !stagesMountedRef\.current/);
  for (const stage of ['mathmaster-systems-multiplier-products', 'mathmaster-systems-cancellation-stage', 'mathmaster-systems-student-combination']) {
    assert.match(source, new RegExp(`<div ref=\\{revealStageOnAppear\\} className="${stage}">`), stage);
  }
  const css = read('src/tools/systemsWorkspace/AlgebraicSystemMode.css');
  assert.match(css, /\.mathmaster-systems-student-combination \{\s*scroll-margin-bottom: 96px;/, 'clears the sticky action bar');
});

// Live QA round 2, 390×844: the phone operation palette's labels read
// "Subt…", "Multi…", "Divi…" — the tiles were pinned to 44px by App.css.
test('phone operation palette tiles fill their column', () => {
  const css = read('src/StepByStepAlgebra.css');
  assert.match(css, /\.algebra-mobile-operation-palette \.algebra-rail-tile \{\s*width: 100% !important;\s*height: auto !important;/);
  const small = css.slice(css.indexOf('.algebra-mobile-operation-palette .algebra-rail-tile small {'), css.indexOf('}', css.indexOf('.algebra-mobile-operation-palette .algebra-rail-tile small {')));
  assert.match(small, /white-space: normal;/);
  assert.doesNotMatch(small, /text-overflow: ellipsis/);
});

// Live QA round 2, 390×844 Work View: nested padding left the board 267px.
test('phone Work View trims nested padding around the math', () => {
  const css = read('src/components/common/WorkViewShell.css');
  for (const layer of ['mathmaster-work-view-surface', 'mathmaster-tool-shell-body', 'mathmaster-tool-panel', 'mathmaster-systems-embedded-step-algebra']) {
    assert.match(css, new RegExp(`\\[data-open="true"\\]\\[data-layout="mobile"\\] \\.${layer} \\{ padding: \\d+px !important; \\}`), layer);
  }
});

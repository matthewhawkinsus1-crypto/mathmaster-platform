import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';

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
  const anchorStart = container.indexOf('<div className={`mathmaster-desktop-question-anchor');
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

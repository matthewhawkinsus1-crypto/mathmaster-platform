// THE PHONE WORK BAR'S PRIMARY ACTION IS NEVER CUT OFF (release-candidate QA
// m8). At 390px the one-row bar read "Sub…" (scrollWidth 70 > clientWidth 68)
// and "Next quest…": six icon tools at a fixed 44px took the row and the
// primary ellipsed. Measured in the browser by tests/browser/workBarPrimaryLabel.mjs
// at 344, 390 and 1366 wide; these checks hold the same rules without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = read('src/components/student/MathToolMobileLayout.css');
const engine = read('src/QuestionEngine.jsx');

const BAR = '.mathmaster-question-container.mode-portrait .portrait-action-bar';
const PRIMARY_BAR = `${BAR}[data-has-primary="true"]`;
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};
const px = (block, property) => {
  const match = block.match(new RegExp(`(?:^|[\\s;{])${property}: (\\d+(?:\\.\\d+)?)px`));
  return match ? Number(match[1]) : null;
};

test('the primary action keeps its words: it never shrinks below them and never ellipses', () => {
  const primary = rule(`${PRIMARY_BAR} > .mathmaster-bar-submit,\n  ${PRIMARY_BAR} > .mathmaster-bar-continue`);
  assert.match(primary, /flex: 1 0 auto;/, 'grows into the rest of the row, never shrinks');
  assert.match(primary, /min-width: max-content;/);
  assert.doesNotMatch(primary, /text-overflow: ellipsis/);
  assert.doesNotMatch(primary, /overflow: hidden/);
  assert.doesNotMatch(css, /portrait-action-bar[^{]*mathmaster-bar-(submit|continue)[^{]*\{[^}]*text-overflow: ellipsis/);
});

test('the tools give way instead, down to a floor that is still a target', () => {
  const tools = rule(`${PRIMARY_BAR} > .mathmaster-work-bar-tool`);
  const shrink = tools.match(/flex: (\d+) (\d+) (\d+)px;/);
  assert.ok(shrink, 'the tools have a definite flex basis');
  assert.equal(Number(shrink[2]) > 0, true, 'the tools can shrink');
  assert.equal(Number(shrink[3]), 44, 'they are 44px wide where there is room');
  assert.ok(px(tools, 'min-width') >= 36, 'and never narrower than 36px');
});

// The arithmetic of the narrowest supported phone (the 344px foldable) with
// every tool the bar can carry beside Submit: Undo, Reset, Scratchpad,
// Calculator, Hint and Read aloud. "Submit" with the bar's 8px side padding is
// 70px in Arial/Arimo/Liberation Sans Bold and 80px in DejaVu Sans Bold — a
// face wider than Roboto and SF — as measured by the browser proof.
test('at 344px six tools at their floor leave the primary room for "Submit" in a wide font', () => {
  const bar = rule(BAR);
  const sidePadding = Number(bar.match(/padding: \d+px max\((\d+)px, env\(safe-area-inset-right\)\)/)?.[1]);
  assert.ok(sidePadding > 0, 'the bar declares its side padding');
  const gap = px(rule(PRIMARY_BAR), 'gap');
  assert.ok(gap !== null, 'the primary bar declares its gap');
  const toolFloor = px(rule(`${PRIMARY_BAR} > .mathmaster-work-bar-tool`), 'min-width');
  const TOOLS = 6;
  const room = 344 - 2 * 1 /* borders of the stage */ - 2 * sidePadding - TOOLS * toolFloor - TOOLS * gap;
  assert.ok(room >= 80, `the primary gets ${room}px; "Submit" needs up to 80px`);
});

test('Next and Continue show their first word and arrow on a phone, and keep the whole label as their name', () => {
  const helper = engine.match(/const barActionLabel = \(label\) => \{\s*const parts = (\/.+\/)\.exec\(label\);\s*return parts \? <>\{parts\[1\]\}<span className="mathmaster-action-label-long">\{parts\[2\]\}<\/span>\{parts\[3\]\}<\/> : label;/);
  assert.ok(helper, 'the bar label helper puts the middle words in the span a phone hides');
  const pattern = new RegExp(helper[1].slice(1, -1));
  const split = (label) => {
    const parts = pattern.exec(label);
    return parts ? { phone: `${parts[1]}${parts[3]}`, desktop: `${parts[1]}${parts[2]}${parts[3]}` } : { phone: label, desktop: label };
  };
  // The labels barContinueAction actually produces.
  assert.match(engine, /\{ label: 'Next question →', onClick: onNextQuestion \}/);
  assert.match(engine, /\{ label: `Continue to \$\{continueSectionLabel \|\| 'next section'\} →`, onClick: onContinueSection \}/);
  assert.deepEqual(split('Next question →'), { phone: 'Next →', desktop: 'Next question →' });
  assert.deepEqual(split('Continue to Unit 2 Review →'), { phone: 'Continue →', desktop: 'Continue to Unit 2 Review →' });
  assert.deepEqual(split('Continue to next section →'), { phone: 'Continue →', desktop: 'Continue to next section →' });
  // The span is hidden only on a portrait phone.
  assert.match(css, /\.mathmaster-question-container\.mode-portrait \.mathmaster-action-label-long \{\s*display: none;/);
  // The words hidden on a phone stay in the accessible name.
  const button = engine.slice(engine.indexOf('className="mathmaster-bar-continue"'), engine.indexOf('{barActionLabel(barContinueAction.label)}'));
  assert.match(button, /aria-label=\{barContinueAction\.label\}/);
});

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

// THE TOOLS GIVE WAY BY COMING INTO THE ROW NARROW. They were 44px wide and
// shrank to a fixed 36px (32px below 340px) whatever they held, so at 200% text
// the row could not fit and scrolled sideways, and Undo's and Start over's words
// ran into the tools beside them (the bar's reflow, phoneActionBarReflow.test.mjs).
test('the tools give way instead: they come into the row at a floor that is still a target, and take its room first', () => {
  const tools = rule(`${PRIMARY_BAR} > .mathmaster-work-bar-tool`);
  const flex = tools.match(/flex: (\d+) (\d+) (\d+)px;/);
  assert.ok(flex, 'the tools have a definite flex basis');
  assert.ok(Number(flex[3]) >= 24, 'they come into the row at 24px or more, a target WCAG 2.5.8 counts');
  assert.equal(Number(flex[2]), 0, 'never narrower: a row that cannot hold them all wraps instead');
  assert.match(tools, /min-width: min-content;/, 'and never narrower than what each shows');
  assert.equal(px(tools, 'max-width'), 44, 'they are 44px wide where there is room...');
  const primary = rule(`${PRIMARY_BAR} > .mathmaster-bar-submit,\n  ${PRIMARY_BAR} > .mathmaster-bar-continue`);
  assert.ok(Number(flex[1]) >= 100 * Number(primary.match(/flex: (\d+) /)[1]), '...which goes to them before the primary grows');
  assert.match(rule(PRIMARY_BAR), /flex-wrap: wrap;/);
});

// The arithmetic of the narrowest supported phones, a 320px phone and the 344px
// foldable, with every tool the bar can carry beside Submit: Undo, Start over,
// Scratchpad, Calculator, Hint and Read aloud. In the control font Chromium
// gives a button (Liberation Sans on Linux, Arial's metrics, a Chromebook's
// Arimo), Undo is 32px and Start over 53px with the 2px sides a 320px phone
// gives a tool, their words under their icons (36px and 57px at 4px sides), as
// measured by the browser proof; "Submit" with the bar's 8px side padding is
// 70px there and 80px in DejaVu Sans Bold, counted at 80. Every other tool
// comes in at its basis. (With DejaVu Sans forced onto the whole bar Undo and
// Start over are 4 and 10px wider, and the proof lets Submit take a row of its
// own there.)
const MEASURED = Object.freeze({ undo: 31.5, startOver: 52.7, sideBelow340: 2, submit: 80 });
test('at 320px and 344px, six tools and "Submit" share one row at 100% text in a wide font', () => {
  const bar = rule(BAR);
  const sidePadding = Number(bar.match(/padding: \d+px max\((\d+)px, env\(safe-area-inset-right\)\)/)?.[1]);
  assert.ok(sidePadding > 0, 'the bar declares its side padding');
  const basis = Number(rule(`${PRIMARY_BAR} > .mathmaster-work-bar-tool`).match(/flex: \d+ \d+ (\d+)px;/)?.[1]);
  assert.ok(basis >= 24, 'the tools declare their basis');
  const narrow = css.slice(css.indexOf('@media (max-width: 339.98px) {'));
  const narrowBar = narrow.slice(narrow.indexOf(`${PRIMARY_BAR} {`), narrow.indexOf('}'));
  const narrowTools = narrow.slice(narrow.indexOf(`${PRIMARY_BAR} > .mathmaster-work-bar-tool {`));
  const toolSide = (block) => Number(block.match(/padding-left: (\d+)px !important;/)?.[1]);
  for (const [width, gap, side] of [[320, px(narrowBar, 'gap'), toolSide(narrowTools)], [344, px(rule(PRIMARY_BAR), 'gap'), toolSide(rule(`${PRIMARY_BAR} > .mathmaster-work-bar-tool`))]]) {
    assert.ok(gap > 0 && side > 0, `${width}px: the gap and the tools' sides are declared`);
    // Undo and Start over are as wide as their words, measured at a 320px phone's sides and widened by the sides here.
    const words = (measured) => measured + 2 * (side - MEASURED.sideBelow340);
    const used = 2 /* the stage's borders */ + 2 * sidePadding + 6 * gap + words(MEASURED.undo) + words(MEASURED.startOver) + 4 * basis + MEASURED.submit;
    assert.ok(used <= width, `${width}px: six tools and Submit need ${used}px`);
  }
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
  assert.match(engine, /\{ kind: 'next', label: 'Next question →', onClick: onNextQuestion \}/);
  assert.match(engine, /\{ kind: 'continue', label: `Continue to \$\{continueSectionLabel \|\| 'next section'\} →`, onClick: onContinueSection \}/);
  // The way back to a skipped question has no arrow: on a phone it shows its
  // own short words ("Go back", the start of its name) instead (student pass 3, RUN-12).
  assert.match(engine, /barContinueAction\.kind === 'back'(?:\s*\/\/[^\n]*)*\s*\? <><span aria-hidden="true">← <\/span><span className="mathmaster-action-label-long">\{barContinueAction\.label\}<\/span><span className="mathmaster-action-label-short">/);
  assert.deepEqual(split('Next question →'), { phone: 'Next →', desktop: 'Next question →' });
  assert.deepEqual(split('Continue to Unit 2 Review →'), { phone: 'Continue →', desktop: 'Continue to Unit 2 Review →' });
  assert.deepEqual(split('Continue to next section →'), { phone: 'Continue →', desktop: 'Continue to next section →' });
  // The span is hidden only on a portrait phone.
  assert.match(css, /\.mathmaster-question-container\.mode-portrait \.mathmaster-action-label-long \{\s*display: none;/);
  // The words hidden on a phone stay in the accessible name.
  const button = engine.slice(engine.indexOf('className="mathmaster-bar-continue"'), engine.indexOf('{barActionLabel(barContinueAction.label)}'));
  assert.match(button, /aria-label=\{barContinueAction\.label\}/);
});

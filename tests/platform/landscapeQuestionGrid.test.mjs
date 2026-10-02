// Platform quirks audit, phone landscape (844x390, 740x360, 667x375): the
// attempt strip was auto-placed into the tool's grid column, stretched to the
// prompt's height, and pushed the tool into an implicit second row that
// started at y=480 — below the fold of a 390px screen. PR #394 fixed the same
// collision in portrait. Each child of the landscape question grid now claims
// its row and column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/components/student/MathToolMobileLayout.css', import.meta.url), 'utf8');
const landscape = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 500px)'));
const rule = (selector) => {
  const start = landscape.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return landscape.slice(start, landscape.indexOf('}', start));
};

test('the landscape question grid has a row for the attempt strip and a row for the tool', () => {
  assert.match(rule('.mathmaster-question-container.mode-landscape'), /grid-template-rows: auto minmax\(0, 1fr\);/);
  assert.match(rule('.mathmaster-question-container.mode-landscape .question-prompt-panel'), /grid-column: 1;\s*grid-row: 1 \/ -1;/);
  assert.match(rule('.mathmaster-question-container.mode-landscape .mathmaster-question-context-panel'), /grid-column: 2;\s*grid-row: 1;/);
  assert.match(rule('.mathmaster-question-container.mode-landscape .math-tool-workspace'), /grid-column: 2;\s*grid-row: 2;/);
});

test('the attempt strip is still rendered as its own panel beside the prompt', () => {
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  assert.match(engine, /<div className="mathmaster-question-context-panel">/);
});

// The landscape layout is one screen: the assignment screen is the window's
// height, the question stage clips (overflow: hidden), and the two columns are
// meant to scroll inside it. Rules are read with comments stripped, one
// selector list and declaration block at a time.
const rulesOf = (text) => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, body]) => ({ selectors: selectors.split(',').map((entry) => entry.trim()).filter(Boolean), body }));
const landscapeRules = rulesOf(landscape.slice(0, landscape.indexOf('@media', 10)));

test('on its side the question is as tall as its stage, so its columns scroll', () => {
  // The engine sits between the clipping stage and the container. Left out, it
  // grew to its content (1150px in a 287px stage at 664×390) and neither
  // column could scroll: a finger drag moved nothing.
  const clips = landscapeRules.find((rule) => rule.selectors.includes('.mathmaster-assignment-screen .mathmaster-question-stage'));
  assert.match(clips.body, /overflow: hidden !important;/);
  const bounded = landscapeRules.filter((rule) => /height: 100% !important;/.test(rule.body)).flatMap((rule) => rule.selectors);
  for (const link of ['.mathmaster-assignment-screen .mathmaster-question-engine', '.mathmaster-assignment-screen .mathmaster-question-container']) {
    assert.ok(bounded.includes(link), `${link} is not held to its stage's height`);
  }
});

test('on its side the actions follow the question instead of covering it', () => {
  // Pinned to the bottom of a 287px column, five full-width buttons covered
  // the question above them.
  const bar = landscapeRules.find((rule) => rule.selectors.includes('.mathmaster-question-container.mode-landscape .landscape-action-bar'));
  assert.match(bar.body, /position: static;/);
  assert.doesNotMatch(bar.body, /position: sticky/);
});

test('inside the phone container the coordinate plane keeps its screen cap', () => {
  // App.css caps the plane by the screen. A blanket `max-height: 100%` on every
  // svg in the phone workspace outranked it and, against a box with no set
  // height, capped nothing: 303px of plane in a 233px column at 664×390.
  const app = readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');
  const cap = rulesOf(app).find((rule) => rule.selectors.length === 1 && rule.selectors[0] === '.mathmaster-responsive-canvas');
  assert.match(cap.body, /max-height: max\(140px, min\(70dvh, calc\(100dvh - 240px\)\)\);/);
  const blanket = rulesOf(css).filter((rule) => /max-height: 100%;/.test(rule.body))
    .flatMap((rule) => rule.selectors)
    .filter((selector) => /\.math-tool-workspace svg/.test(selector));
  assert.ok(blanket.length > 0, 'the phone workspace still keeps other figures inside their box');
  for (const selector of blanket) {
    assert.match(selector, /svg:not\(\.mathmaster-responsive-canvas\)/, `${selector} switches the plane's screen cap off`);
  }
});

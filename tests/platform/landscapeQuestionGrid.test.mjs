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

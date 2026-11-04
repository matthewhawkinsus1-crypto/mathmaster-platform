// THE WORK VIEW HEADER AT LARGE TEXT ON A PHONE (student walkthrough).
//
// Task, Help and Close sat beside the task text. At 150-200% text on a 360-390
// px phone each button was squeezed to its 44px minimum and its label ran over
// its neighbour. Below 22em the header now wraps: the task takes the first row
// whole and the buttons share the row under it, each at least 44px.
// Browser proof (rects, at five sizes): tests/browser/studentShellLargeText.mjs
// --check=workviewheader, which CI runs in the accessibility certification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { executableSource, region } from './helpers/sourceContract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(path.join(root, 'src/components/common/WorkViewShell.css'), 'utf8');
const wrapRule = region(css.replace(/\/\*[\s\S]*?\*\//g, ''), '@media (max-width: 22em) {', '\n}\n', 'the narrow-header rule');

test('below 22em the header wraps, the task takes the row and the buttons share the next one', () => {
  // `em` in a media query is the browser's text size: a 100% phone (360px is
  // 22.5em) keeps its one row, 125% and over wraps, a laptop never does.
  assert.match(wrapRule, /> \.mathmaster-work-view-header \{ flex-wrap: wrap; \}/);
  // The heading's inline `flex: 1 1 auto` would keep it beside the buttons.
  assert.match(wrapRule, /\.mathmaster-work-view-heading \{ flex: 1 1 100% !important; \}/);
  assert.match(wrapRule, /> \.mathmaster-work-view-header > button \{ flex: 1 1 auto; min-width: 44px; min-height: 44px; \}/);
});

test('a phone on its side keeps its single row, and nothing outside the rule changes', () => {
  assert.equal((wrapRule.match(/:not\(\[data-height="short"\]\)/g) || []).length, 3, 'every selector leaves the short layout alone');
  // The header's own rule is not given a wrap: only the narrow-screen rule does it.
  const base = region(css, '[data-open="true"] > .mathmaster-work-view-header {', '\n}', 'the open header');
  assert.doesNotMatch(base, /flex-wrap/);
});

test('the driver measures the header and CI runs it', () => {
  const driver = executableSource(readFileSync(path.join(root, 'tests/browser/studentShellLargeText.mjs'), 'utf8'));
  assert.match(driver, /CHECKS\.has\('workviewheader'\)/);
  const workflow = readFileSync(path.join(root, '.github/workflows/accessibility-certification.yml'), 'utf8');
  const runs = [...workflow.matchAll(/run: node tests\/browser\/studentShellLargeText\.mjs --check=([\w,]+)/g)].map((match) => match[1].split(','));
  assert.ok(runs.some((checks) => checks.includes('workviewheader')), 'a CI step runs --check=workviewheader');
});

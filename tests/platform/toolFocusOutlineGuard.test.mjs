/*
 * NO TOOL STYLESHEET MAY HIDE THE KEYBOARD FOCUS RING (WCAG 2.4.7).
 *
 * Keyboard sweep T8 (docs/accessibility/KEYBOARD_SWEEP.md): six
 * `outline: none` / `outline: 0` rules in tool CSS were harmless only by luck —
 * the ones on native controls lost to the global `#root :is(...):focus-visible`
 * ring on ID specificity, and the ones on tabIndex={-1} containers were never
 * keyboard-reachable. Any of them stops being harmless the moment it is written
 * with an ID, a more specific selector or `!important`.
 *
 * The rule now: under src/tools/, an outline may be switched off only for
 * focus that is NOT keyboard focus — every selector carrying the declaration
 * must say `:not(:focus-visible)`. That is the one form that cannot suppress a
 * keyboard ring, whatever specificity it is later given. Nothing is exempt.
 *
 * Second contract (T6): Data Modeling Lab's scrolling residual table is a tab
 * stop in Chrome whether or not the markup says so; it must be a NAMED region
 * that is deliberately focusable, so it is announced and scrollable by keys.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS_DIR = path.join(repo, 'src/tools');

const listCss = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return listCss(full);
  return name.endsWith('.css') ? [full] : [];
});

// `outline: none`, `outline: 0`, `outline:0 none`, `outline-style: none`,
// `outline-width: 0` — every way of drawing no outline. `outline: 0 solid red`
// draws nothing either, so a 0 width anywhere in the shorthand counts.
const HIDES_OUTLINE = /(^|[;{\s])outline(-style|-width)?\s*:\s*([^;}]*\b(none|hidden)\b|0(px|em|rem)?(?![.\d])[^;}]*)\s*(!important\s*)?(;|$)/i;
const KEYBOARD_SAFE = /:not\(\s*:focus-visible\s*\)/;

/**
 * Every rule in a stylesheet that switches the outline off, with the selectors
 * that do NOT exclude keyboard focus. Comments are stripped first (a comment
 * explaining a removed rule is not a rule); nested at-rules are handled because
 * only innermost `selector { declarations }` blocks are read.
 */
export const unguardedOutlineRules = (css) => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const offenders = [];
  const block = /([^{}]*)\{([^{}]*)\}/g;
  let match;
  while ((match = block.exec(stripped))) {
    const [, rawSelector, body] = match;
    if (!HIDES_OUTLINE.test(body)) continue;
    const selectors = rawSelector.split(',').map((s) => s.trim()).filter(Boolean);
    const unguarded = selectors.filter((s) => !KEYBOARD_SAFE.test(s));
    if (unguarded.length) {
      const line = stripped.slice(0, match.index + rawSelector.length).split('\n').length;
      offenders.push({ line, selectors: unguarded });
    }
  }
  return offenders;
};

test('the scanner itself: it finds every spelling and accepts only the :not(:focus-visible) guard', () => {
  // Each of these must be caught — a scanner that misses one passes vacuously.
  for (const css of [
    '.a:focus { outline: none; }',
    '.a:focus{outline:0}',
    '.a { outline: 0 none; }',
    '.a, .b:not(:focus-visible) { outline: none !important; }',
    '@media (min-width: 1px) { .a:focus-visible { outline-style: none; } }',
    '.a input {\n  border:0;\n  outline:0;\n  background:transparent;\n}',
    '.a { outline-width: 0px; }',
  ]) {
    assert.ok(unguardedOutlineRules(css).length === 1, `not caught: ${css}`);
  }
  for (const css of [
    '.a:focus:not(:focus-visible) { outline: none; }',
    '.a:not(:focus-visible), .b:focus:not( :focus-visible ) { outline: 0; }',
    '.a:focus-visible { outline: 3px solid red; outline-offset: 0; }',
    '.a { outline: 0.2rem solid blue; }',
    '/* .a:focus { outline: none; } */ .b { color: red; }',
  ]) {
    assert.deepEqual(unguardedOutlineRules(css), [], `wrongly flagged: ${css}`);
  }
});

test('no stylesheet under src/tools switches the outline off for keyboard focus', () => {
  const files = listCss(TOOLS_DIR);
  // The scan has to be looking at the tool CSS, not an empty directory.
  assert.ok(files.length >= 5, `expected the tool stylesheets, found ${files.length}`);
  const found = files.flatMap((file) => unguardedOutlineRules(readFileSync(file, 'utf8'))
    .map(({ line, selectors }) => `${path.relative(repo, file)}:${line}  ${selectors.join(', ')}`));
  assert.deepEqual(found, [], `outline hidden without a :not(:focus-visible) guard:\n${found.join('\n')}`);
});

test('the two programmatic-focus containers keep pointer focus ring-free only with the guard', () => {
  // AlgebraicSystemMode.jsx's embedded solver host and InequalityBuildPanels'
  // StepHeading are tabIndex={-1}: focused by code (auto-reveal, a Check that
  // opens the next step) or a mouse press. Their rule must still exist —
  // deleting it is fine in Chromium today, but the guard documents why — and
  // must be the guarded form.
  const algebraic = readFileSync(path.join(TOOLS_DIR, 'systemsWorkspace/AlgebraicSystemMode.css'), 'utf8');
  const inequality = readFileSync(path.join(TOOLS_DIR, 'systemsWorkspace/InequalityWorkspace.css'), 'utf8');
  assert.match(algebraic, /\.mathmaster-systems-embedded-step-algebra:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;\s*\}/);
  assert.match(inequality, /\.mm-ineq-step-heading:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none;\s*\}/);
});

test('Data Modeling Lab: every scrolling box is a named, focusable region (T6)', () => {
  const source = readFileSync(path.join(TOOLS_DIR, 'dataModeling/DataModelingLab.jsx'), 'utf8');
  // Every JSX opening tag whose inline style scrolls.
  const tags = [...source.matchAll(/<(div|section)\b[^>]*overflow\s*:\s*'(auto|scroll)'[^>]*>/g)].map((m) => m[0]);
  assert.ok(tags.length >= 1, 'the residual table scroller is gone — update this contract');
  for (const tag of tags) {
    assert.match(tag, /\brole="region"/, `scroller without role="region": ${tag}`);
    assert.match(tag, /\baria-label="[^"]+"/, `scroller without a name: ${tag}`);
    assert.match(tag, /\btabIndex=\{0\}/, `scroller not deliberately focusable: ${tag}`);
  }
  const residual = tags.find((tag) => /aria-label="Residual table"/.test(tag));
  assert.ok(residual, 'the residual table scroller is named "Residual table"');
});

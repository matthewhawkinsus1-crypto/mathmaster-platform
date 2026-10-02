/*
 * ISSUE #369: ON A PHONE THE CURRENT MATHEMATICS STAYS ON SCREEN.
 *
 * 390×844 Work View, PR1 after both elimination rounds: the 3×3 progress trail
 * was 207px (seven labelled steps over three rows, then every completed-work
 * chip on a row of its own) and the reduced 2×2's own trail another 176px — the
 * question the student had to answer next ("Which variable will you
 * eliminate?") was below the fold. The five reference equations took 360px as
 * two-line cards.
 *
 * Now, at ≤ 620px: one row of step badges with only the current step named
 * (73px each), the completed work still listed, inline; one line per reference
 * equation; and the embedded solver's "Reset work" beside the hint switch
 * instead of a full-width row. Nothing is removed — every step's name is still
 * read aloud, and every completed-work entry is still shown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const systems = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
const css = read('src/tools/systemsWorkspace/AlgebraicSystemMode.css');

/** Every `@media (max-width: 620px)` block in a stylesheet, concatenated. */
const phoneBlocks = (source) => {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('@media (max-width: 620px) {', from);
    if (start < 0) return blocks.join('\n');
    let depth = 0;
    let index = source.indexOf('{', start);
    for (; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') { depth -= 1; if (depth === 0) break; }
    }
    blocks.push(source.slice(start, index + 1));
    from = index + 1;
  }
};
const rule = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `no rule for ${selector}`);
  return source.slice(start, source.indexOf('}', start));
};
const visuallyHidden = (body) => /clip-path:\s*inset\(50%\)/.test(body) && /position:\s*absolute/.test(body) && !/display:\s*none/.test(body);

test('the trail names the current step and speaks each step’s state', () => {
  const trail = region(systems, 'export function SystemsWorkTrail', 'const solvedExpressionFor', 'SystemsWorkTrail');
  assert.match(trail, /aria-current=\{active \? 'step' : undefined\}/);
  assert.match(trail, /stage\.complete \? <span className="mathmaster-systems-work-step-status">, done<\/span> : null/);
  assert.ok(visuallyHidden(rule(css, '.mathmaster-systems-work-step-status')), 'the step state must be read, not shown');
});

test('on a phone only the current step keeps a visible name — the others stay readable to assistive tech', () => {
  const phone = phoneBlocks(css);
  assert.ok(visuallyHidden(rule(phone, '.mathmaster-systems-work-step:not(.is-active) > strong')),
    'labels of non-current steps must be visually hidden (clip), never display: none');
  assert.doesNotMatch(phone, /\.mathmaster-systems-work-step\.is-active > strong\s*\{[^}]*clip/);
});

test('on a phone the completed work stays listed, wrapping inline instead of one row per entry', () => {
  const phone = phoneBlocks(css);
  const completed = rule(phone, '.mathmaster-systems-completed-work');
  assert.doesNotMatch(completed, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(completed, /display:\s*none/);
  assert.match(rule(css, '.mathmaster-systems-completed-work'), /flex-wrap:\s*wrap/);
});

test('on a phone each reference equation sits on one line with its name', () => {
  const phone = phoneBlocks(css);
  assert.match(rule(phone, '.mathmaster-reduction-equation-card'), /grid-template-columns:\s*fit-content\(\d+%\)\s+minmax\(0,\s*1fr\)/);
});

test('embedded on a touch screen, "Reset work" is not a full-width row', () => {
  const board = read('src/StepByStepAlgebra.css');
  const start = board.indexOf('.algebra-embedded .algebra-reset-work {');
  assert.notEqual(start, -1);
  const media = board.lastIndexOf('@media', start);
  assert.match(board.slice(media, start), /@media \(max-width: 768px\), \(pointer: coarse\) \{\s*$/);
  const body = board.slice(start, board.indexOf('}', start));
  assert.match(body, /width:\s*auto/);
  assert.ok(Number(body.match(/min-height:\s*(\d+)px/)?.[1]) >= 44);
});

// The reduced 2×2's Prepare chip read "✓ R₁ · 1   R₂ · 1" — scale factors as
// bare numbers after a dot. It names what happened to each equation instead.
test('the Prepare chip says how each equation was scaled, in classroom notation', () => {
  const prepare = region(systems, "id: 'prepare'", "id: 'combine'", 'Prepare stage');
  assert.match(prepare, /`\$\{name\} as written`/);
  assert.match(prepare, /`\$\{name\} × \$\{factor\.replace\(\/\^-\/, '−'\)\}`/);
  assert.doesNotMatch(prepare, /· \$\{multipliers\[/);
});

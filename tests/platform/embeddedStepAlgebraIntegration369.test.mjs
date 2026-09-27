/*
 * ISSUE #369: EMBEDDED STEP ALGEBRA READS AS ONE STEP OF THE SYSTEMS WORKSHEET.
 *
 * Inside the Systems Workspace, Step Algebra was a second application: its own
 * centred heading, a "Support 3 · Standard" badge, a Target pill, a nested card
 * and a footnote saying "Attempts remaining: 3 … it uses an attempt" — while the
 * question above already showed "3 of 3 tries left", and the embed passes no
 * onStepGrade, so no move there ever spent one. On a Chromebook the solver was
 * 585px tall for "6y = −24"; the board itself was 286px of it.
 *
 * The engine is untouched. These contracts hold the presentation: the embed
 * asks for `embedded`, and in that role the solver names the step on its tool
 * row, drops the badge and the footnote, and never claims an attempt count.
 * node cannot render .jsx, so the wiring is read as source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
const systems = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
const css = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the Systems embed asks Step Algebra for its embedded role and hands it the step name', () => {
  const embed = region(systems, 'function EmbeddedStepAlgebra(', 'export const subsystemReportFromDraft', 'EmbeddedStepAlgebra');
  const mount = region(embed, '<StepByStepAlgebraCore', '/>', 'the Step Algebra mount');
  assert.match(mount, /\sembedded(?:=\{true\})?\s/, 'the embed must switch the embedded role ON');
  assert.match(mount, /embeddedTitle=\{label\}/);
  // The step name is said once, on the solver's tool row — not again above it.
  assert.doesNotMatch(embed, /\{label \? <div/);
  // Still the real engine, still reporting only its own solved signal.
  assert.match(mount, /onStepGrade=\{null\}/);
  assert.match(embed, /algebra-objective/);
});

test('embedded, the tool row carries the step name and target instead of the support badge', () => {
  assert.match(core, /embedded = false,\s*embeddedTitle = null,/);
  const ternary = region(core, '{embedded ? (', '</>', 'tool-row heading');
  const [heading, standalone = ''] = ternary.split(') : (');
  assert.match(heading, /algebra-embedded-heading/);
  assert.match(heading, /embeddedTitle/);
  assert.match(heading, /objectiveLabel/);
  assert.doesNotMatch(heading, /supportPolicy/);
  // The standalone solver keeps its badge.
  assert.match(standalone, /Support \$\{supportPolicy\.level\}/);
});

test('embedded, the solver never states an attempt count it does not keep', () => {
  // The policy footnote ("Attempts remaining: 3 …") is the standalone solver's.
  const footnote = region(core, '{!embedded && <p', '</p>}', 'policy footnote');
  assert.match(footnote, /supportPolicy\.description/);
  assert.match(footnote, /Attempts remaining/);
  // Every in-flight message that counts attempts is gated off when embedded.
  const counted = [...core.matchAll(/attempts remain/g)];
  assert.ok(counted.length >= 2, 'the attempt messages were not found');
  counted.forEach((match) => {
    const before = core.slice(Math.max(0, match.index - 700), match.index);
    assert.match(before, /(\|\| embedded \?|&& !embedded\))/, `an attempt count near …${core.slice(match.index - 60, match.index + 20)}… is not gated`);
  });
});

test('embedded, the solver is not a card inside the stage card and its board fits one step', () => {
  const host = css('src/tools/systemsWorkspace/AlgebraicSystemMode.css');
  const rule = region(host, '.mathmaster-systems-embedded-step-algebra {', '}', 'embedded host rule');
  assert.doesNotMatch(rule, /border:\s*1px solid|background:/);
  const board = css('src/StepByStepAlgebra.css');
  const embeddedBoard = region(board, '.algebra-embedded .algebra-connected-balance {', '}', 'embedded board');
  const floor = Number(embeddedBoard.match(/min-height:\s*(\d+)px/)?.[1]);
  const standalone = Number(region(board, '.algebra-connected-balance {', '}', 'board').match(/min-height:\s*(\d+)px/)?.[1]);
  assert.ok(floor < standalone, `embedded board floor ${floor}px is not below the standalone ${standalone}px`);
  // Smaller rail tiles still meet the 44px target, and only above phone width.
  const rails = region(board, '@media (min-width: 621px) {\n  .algebra-embedded .algebra-rail', '\n}\n', 'embedded rails');
  assert.ok(Number(rails.match(/width:\s*(\d+)px/)?.[1]) >= 44);
});

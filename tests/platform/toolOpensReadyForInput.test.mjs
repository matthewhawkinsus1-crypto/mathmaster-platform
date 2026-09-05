import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../src/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

const shell = read('tools/shared/ToolShell.jsx');
const disclosure = read('components/common/QuietDisclosure.jsx');
const registry = read('tools/toolRegistry.js');

// Every directory under src/tools that ships a student tool, discovered rather
// than listed — a tool added later is held to the same rules without anyone
// remembering to add it here.
const TOOL_DIRS = readdirSync(new URL('tools/', root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
  .map((entry) => entry.name);

const toolFiles = TOOL_DIRS.map((dir) => {
  const files = readdirSync(new URL(`tools/${dir}/`, root)).filter((name) => name.endsWith('.jsx'));
  return { dir, files: files.map((name) => ({ name, source: read(`tools/${dir}/${name}`) })) };
});

test('every student tool is discovered and none were missed', () => {
  // Nineteen today. The floor is a tripwire for a directory going missing, not
  // a target — a tool added later raises it.
  assert.ok(TOOL_DIRS.length >= 19, `expected at least 19 tool directories, found ${TOOL_DIRS.length}`);
  TOOL_DIRS.forEach((dir) => {
    assert.ok(registry.includes(dir) || registry.includes(`${dir}2`) || registry.toLowerCase().includes(dir.toLowerCase()),
      `${dir} is not reachable from the tool registry`);
  });
});

/* ---------- 1. the tool is visible and ready for input ---------- */

test('a tool puts the cursor in its first answer control on open', () => {
  // Without this a student on a Chromebook lands on a page and has to hunt for
  // where to type before the round clock has even settled.
  assert.match(shell, /focusFirstAnswerControl\(shellRef\.current\)/);
  assert.match(shell, /requestAnimationFrame/);
});

test('every tool renders through the shared shell, so none of this is optional', () => {
  toolFiles.forEach(({ dir, files }) => {
    const usesShell = files.some(({ source }) => source.includes('ToolShell'));
    assert.ok(usesShell, `${dir} does not render through ToolShell`);
  });
});

/* ---------- 2. directions and hints start collapsed ---------- */

test('the numbered steps start folded', () => {
  assert.match(shell, /summary=\{`How to do this \(\$\{steps\.length\} step/);
  assert.match(shell, /storageKey=\{`mm\.tool\.steps\.[\s\S]{0,80}defaultOpen=\{false\}/);
  // `defaultOpen` with no value is `true` in JSX and is exactly the regression
  // this guards against.
  assert.doesNotMatch(shell, /storageKey=\{`mm\.tool\.steps\.[\s\S]{0,80}defaultOpen\s*\n/);
});

test('the "about this tool" blurb starts folded', () => {
  assert.match(shell, /summary="About this tool"[\s\S]{0,200}defaultOpen=\{false\}/);
});

test('an unused hint block costs one row and no box', () => {
  // It used to be a bordered panel with a heading and two lines of "try it
  // yourself first" on every question, whether or not a hint was wanted.
  assert.match(shell, /const used = revealed > 0;/);
  assert.match(shell, /style=\{\{ marginTop: 16, \.\.\.\(used \? \{ border[^}]*\} : null\) \}\}/);
});

test('no tool re-opens the directions behind the shell', () => {
  // A tool passing defaultOpen to a steps or hints disclosure would undo the
  // default for that tool only, which is the hardest kind of drift to see.
  toolFiles.forEach(({ dir, files }) => {
    files.forEach(({ name, source }) => {
      assert.doesNotMatch(source, /<QuietDisclosure/, `${dir}/${name} should fold through ToolShell, not its own disclosure`);
      assert.doesNotMatch(source, /stepsKey=\{[^}]*\}\s+defaultOpen/, `${dir}/${name} must not force the steps open`);
    });
  });
});

/* ---------- 3. a folded panel does not take up space ---------- */

test('a folded disclosure reserves no room for the body it is not showing', () => {
  assert.match(disclosure, /style=\{\{ margin: open \? '0 0 10px' : 0, \.\.\.style \}\}/);
  assert.match(disclosure, /\{open \? <div style=\{\{ marginTop: 8 \}\}>\{children\}<\/div> : null\}/);
});

test('the fold is still a real control, not a shrunken one', () => {
  // Compactness must not come out of the touch target. 44px is the Chromebook
  // minimum used by every other student control.
  assert.match(disclosure, /minHeight: 44/);
  assert.match(disclosure, /aria-expanded=\{open\}/);
});

/* ---------- the working surface must NOT have been folded away ---------- */

test('the working panels still open by default', () => {
  // The point was to fold the directions, not the graph. Panel carries titles
  // like "Build the graph" and "Coordinate plot" — folding those by default
  // would leave a student staring at a stack of closed pills.
  assert.match(shell, /export const Panel = \(\{ title, children, collapsible = false, defaultOpen = true \}\)/);
});

test('the task itself is never folded, only the directions about it', () => {
  const taskCard = shell.slice(shell.indexOf('export const TaskCard'), shell.indexOf('export const HintPanel'));
  // The authored prompt and the one-line task render directly, outside any
  // disclosure. A student must never have to open something to see the question.
  const promptIndex = taskCard.indexOf('authoredPrompt}</MathText>');
  const disclosureIndex = taskCard.indexOf('<QuietDisclosure');
  assert.ok(promptIndex > 0, 'the authored prompt must render');
  assert.ok(disclosureIndex > promptIndex, 'the prompt must render before, and outside, the fold');
});

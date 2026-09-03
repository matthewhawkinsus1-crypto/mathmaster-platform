import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const codeOf = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('no authoring metadata reaches a student above the graph', () => {
  // "Coordinates shown · required for skip-count grid" explained to whoever
  // authored the question why the coordinate setting was forced. A student
  // reading it learns nothing they can act on — the same class of leak as an
  // internal field printed inside a prompt.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.doesNotMatch(source, /required for skip-count grid/);
  // The fact a student CAN use is still stated.
  assert.match(source, /Coordinates \{showCoordinates \? 'shown' : 'hidden'\}/);
});

test('a single-stage question shows no stage picker', () => {
  // With construction disabled the row rendered one button that did nothing but
  // name the screen the student was already on.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  assert.match(source, /const stageCount = \(constructionEnabled \? 1 : 0\) \+ \(analysisEnabled \? 1 : 0\);/);
  assert.match(source, /\{stageCount > 1 && \(/);
});

test('the workspace name does not restate the task', () => {
  // "Determine the domain and range" in the task panel, then "Analyze the
  // Graph" in 24px centred type directly beneath it. The heading survives only
  // where there is no authored prompt to have said it already.
  const source = codeOf('src/InteractiveGraphWorkspace.jsx');
  const heading = source.indexOf('{workspaceTitle}</h2>');
  assert.ok(heading > 0);
  const guard = source.slice(Math.max(0, heading - 220), heading);
  assert.match(guard, /!String\(question\.prompt \|\| ''\)\.trim\(\)/);
});

test('the tool header is a label, not a headline plus a paragraph', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.doesNotMatch(source, /fontSize: 24/);
  assert.match(source, /summary="About this tool"/);
  // The description folds and starts folded: it describes the tool, which is
  // worth reading once rather than on every question.
  const about = source.slice(source.indexOf('summary="About this tool"'));
  assert.match(about.slice(0, 400), /defaultOpen=\{false\}/);
});

test('the steps fold but start open, because they are still directions', () => {
  // Hiding instructions by default would trade one problem for a worse one.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  const steps = source.slice(source.indexOf('How to do this'));
  assert.match(steps.slice(0, 500), /defaultOpen\b/);
  assert.doesNotMatch(steps.slice(0, 500), /defaultOpen=\{false\}/);
  // The count is named, so a student who folds them knows what is inside.
  assert.match(source, /How to do this \(\$\{steps\.length\} step/);
});

test('a fold is remembered per block of text, not per tool', () => {
  // Keying on content means rewritten instructions reopen for everyone, which
  // is what should happen when they are no longer the steps the student read.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /const contentKey = \(value\)/);
  assert.match(source, /contentKey\(steps\.join\('\|'\)\)/);
  assert.match(source, /contentKey\(`\$\{title\}\|\$\{subtitle\}`\)/);
});

test('a browser that refuses storage still shows the directions', () => {
  // A private window, cleared site data, or blocked storage all make the read
  // throw. Failing open is the only safe direction: an unreadable preference
  // must never be why a struggling student loses their steps.
  const source = codeOf('src/components/common/QuietDisclosure.jsx');
  const reads = source.match(/catch \{/g) || [];
  assert.ok(reads.length >= 2, 'both the read and the write must be guarded');
  assert.match(source, /window\.localStorage\.getItem/);
  assert.match(source, /return stored === null \? defaultOpen : stored/);
});

test('the fold control is operable and announces its state', () => {
  const source = codeOf('src/components/common/QuietDisclosure.jsx');
  assert.match(source, /aria-expanded=\{open\}/);
  // The Chromebook touch minimum, same as every other student control.
  assert.match(source, /minHeight: 44/);
  assert.match(source, /type="button"/);
});

test('a disclosure with nothing in it renders nothing', () => {
  const source = codeOf('src/components/common/QuietDisclosure.jsx');
  assert.match(source, /if \(!children\) return null;/);
});

test('changing surface picks up that surface own fold state', () => {
  // Without this the panel carries the previous question's preference across,
  // so a student who folded one tool's steps finds the next tool's already gone.
  const source = codeOf('src/components/common/QuietDisclosure.jsx');
  const effect = source.slice(source.indexOf('useEffect(() => {'));
  assert.match(effect.slice(0, 300), /\[storageKey, defaultOpen\]/);
});

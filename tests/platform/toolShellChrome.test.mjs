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

test('the steps fold and start folded, so the tool is what opens', () => {
  // THIS REVERSES AN EARLIER DECISION, deliberately. The steps used to start
  // open on the reasoning that folding directions by default trades one problem
  // for a worse one. In practice they are identical for every question in a
  // section, so on a Chromebook the first screen was directions the student had
  // already read three times and the tool was below the fold.
  //
  // Folded is not hidden: the summary names the block and its step count, the
  // control is a 44px target, and the student's choice to open is remembered.
  // The authored problem remains outside the disclosure. Tool-specific
  // directions and repeated steps fold together so a phone does not spend most
  // of its viewport on a second copy of how to operate the tool.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  // The TaskCard's fold (its summary is worked out above it since PQ-023).
  const taskCard = source.slice(source.indexOf('export const TaskCard'), source.indexOf('export const HintPanel'));
  const fold = taskCard.slice(taskCard.indexOf('<QuietDisclosure'), taskCard.indexOf('</QuietDisclosure>'));
  assert.match(fold.slice(0, 300), /summary=\{summary\}[\s\S]*defaultOpen=\{false\}/);
  // The count is named, so a student who has not opened them knows what is inside.
  assert.match(taskCard, /const summary = steps\.length\s*\?\s*`How to do this \(\$\{steps\.length\} step/);
});

test('a fold is remembered per block of text, not per tool', () => {
  // Keying on content means rewritten instructions reopen for everyone, which
  // is what should happen when they are no longer the steps the student read.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /const contentKey = \(value\)/);
  assert.match(source, /contentKey\(\[taskText, \.\.\.steps, note \|\| ''\]/);
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


test('tool directions themselves are folded with the repeated steps', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  const taskCard = source.slice(source.indexOf('export const TaskCard'), source.indexOf('export const HintPanel'));
  const disclosure = taskCard.slice(taskCard.indexOf('<QuietDisclosure'));
  const direction = disclosure.indexOf('mathmaster-tool-task-directions');
  const close = disclosure.indexOf('</QuietDisclosure>');
  assert.ok(direction > 0 && direction < close, 'tool directions belong inside the folded support block');
  assert.match(disclosure.slice(0, 300), /defaultOpen=\{false\}/);
});

// PLATFORM QUIRKS AUDIT PQ-023: ONE FOLD FOR THE TOOL'S HELP, NOT TWO.
// "About this tool" (header) and "How to do this" (task card) were two rows
// between the task and the mathematics; on a 390px phone the header alone was
// 98–117px and the first answer box sat at 634–1359px.
test('the tool description opens the steps fold, and the header offers it only where nothing else does', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  // The shell hands its description to the TaskCards in its body.
  const shell = source.slice(source.indexOf('export default function ToolShell'), source.indexOf('export const ToolGrid'));
  assert.match(shell, /const shellContext = useMemo\(\(\) => \(\{\s*description: subtitle \|\| null,/);
  assert.match(shell, /<ToolShellContext\.Provider value=\{shellContext\}><PlotHelpScope>\{children\}<\/PlotHelpScope><\/ToolShellContext\.Provider>/);
  // A TaskCard says it took it, and opens its fold with it, ahead of the steps.
  const taskCard = source.slice(source.indexOf('export const TaskCard'), source.indexOf('export const HintPanel'));
  assert.match(taskCard, /useLayoutEffect\(\(\) => \(registerTaskCard \? registerTaskCard\(\) : undefined\), \[registerTaskCard\]\);/);
  assert.match(taskCard, /const hasSupport = Boolean\(description \|\|/);
  const fold = taskCard.slice(taskCard.indexOf('<QuietDisclosure'), taskCard.indexOf('</QuietDisclosure>'));
  const about = fold.indexOf('mathmaster-tool-task-about');
  assert.ok(about > 0 && about < fold.indexOf('mathmaster-tool-task-directions') && about < fold.indexOf('steps.map'), 'the description is the fold\'s first line');
  // The header's own fold is marked merged once a TaskCard took the description...
  assert.match(shell, /<div className="mathmaster-tool-shell-about" data-merged=\{taskCards > 0 \? 'true' : undefined\}/);
  // ...and is then hidden, except in Work View, which hides the task card.
  const css = codeOf('src/App.css');
  assert.match(css, /\.mathmaster-tool-shell-about\[data-merged="true"\]\s*\{\s*display:\s*none !important;/);
  assert.match(css, /html\[data-work-view-open="true"\] \.mathmaster-tool-shell-about\[data-merged="true"\]\s*\{\s*display:\s*contents !important;/);
});

test('on a phone the tool name is a label on the Enlarge row, and the steps fold takes its row', () => {
  const css = codeOf('src/components/student/MathToolMobileLayout.css');
  const title = css.slice(css.indexOf('.mathmaster-question-container .mathmaster-tool-shell-header h2 {'));
  assert.match(title.slice(0, 260), /font-size:\s*13px !important;[\s\S]*-webkit-line-clamp:\s*2;/);
  assert.doesNotMatch(css, /tool-shell-header h2\s*\{\s*font-size:\s*clamp\(/, 'the 16–21px headline is the defect');
  // As tall as the opener's row, level with it — portrait only: a phone held
  // sideways hides the name and keeps its 6px header.
  const row = css.slice(css.indexOf('.mathmaster-question-container.mode-portrait .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-tool-shell-header {'));
  assert.match(row.slice(0, 260), /align-items:\s*center;[\s\S]*min-height:\s*58px;/);
  // With the prompt hidden, the fold is not squeezed into the prompt's 46% row.
  const fold = css.slice(css.indexOf('.mathmaster-question-engine-has-anchor .mathmaster-tool-task-card > .mathmaster-quiet-disclosure {'));
  assert.match(fold.slice(0, 600), /max-width:\s*none !important;[\s\S]*flex:\s*1 1 auto !important;[\s\S]*min-width:\s*0;/);
});


test('tool help cards scroll with the workspace; only the student task anchor stays persistent', () => {
  const css = codeOf('src/App.css');
  assert.match(css, /\.mathmaster-tool-task-card\s*\{[\s\S]*?position:\s*static;/);
  assert.doesNotMatch(css, /\.mathmaster-tool-task-card\s*\{[\s\S]{0,180}?position:\s*sticky;/);
  assert.match(css, /\.mathmaster-desktop-question-content\s+\.mathmaster-desktop-question-anchor\s*\{[\s\S]*?position:\s*sticky;/);
});

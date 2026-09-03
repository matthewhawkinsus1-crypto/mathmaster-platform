import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const codeOf = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const TOOLS = globSync('src/tools/*/*.jsx');

// A control is anything a student operates. A panel holding one must never be
// foldable: hiding part of the answer behind a disclosure is worse than a long
// page, because a student who cannot find the field does not know to look.
const CONTROLS = /<button|<input|<select|<textarea|MathInput|CoordinatePlane|<svg|onClick|onChange|onPlot|Enlargeable/;

const panelBodies = (source) => {
  const found = [];
  for (const match of source.matchAll(/<Panel\s+title=(\{`[^`]*`\}|"[^"]*")(\s+collapsible)?[^>]*>/g)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < source.length && depth) {
      const open = source.indexOf('<Panel', index);
      const close = source.indexOf('</Panel>', index);
      if (close === -1) break;
      if (open !== -1 && open < close) { depth += 1; index = open + 6; } else { depth -= 1; index = close + 8; }
    }
    found.push({ title: match[1], collapsible: Boolean(match[2]), body: source.slice(start, index) });
  }
  return found;
};

test('no panel holding a control can be folded away', () => {
  // This is the rule the whole pass rests on, and it has to hold for panels
  // added later too, not only the ones marked today.
  for (const path of TOOLS) {
    for (const panel of panelBodies(codeOf(path))) {
      if (!panel.collapsible) continue;
      assert.ok(
        !CONTROLS.test(panel.body),
        `${path}: ${panel.title} is collapsible but contains a control`,
      );
    }
  }
});

test('no panel holding this question data can be folded away', () => {
  // The rule that a first pass got wrong. Folding is remembered, so a student
  // who folds one question's given ordered pairs arrives at the next question
  // with the thing it asks about already hidden. Only text that is identical on
  // every question of a tool — general teaching reference — may fold.
  const stripAttributes = (body) => body
    .replace(/style=\{\{[^}]*\}\}/g, '')
    .replace(/\b(style|className|key|aria-[\w-]+)=\{[^}]*\}/g, '');

  for (const path of TOOLS) {
    for (const panel of panelBodies(codeOf(path))) {
      if (!panel.collapsible) continue;
      assert.ok(
        !stripAttributes(panel.body).includes('{'),
        `${path}: ${panel.title} folds away a value derived from the question`,
      );
    }
  }
});

test('the general reference panels are foldable', () => {
  const folded = TOOLS.flatMap((path) => panelBodies(codeOf(path)).filter((panel) => panel.collapsible));
  assert.ok(folded.length >= 2, `expected the static reference panels to fold, found ${folded.length}`);
});

test('a folded panel opens by default, because the student decides what to put away', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /collapsible = false, defaultOpen = true/);
  // No call site turns a panel off on the student's behalf.
  for (const path of TOOLS) {
    assert.doesNotMatch(codeOf(path), /<Panel[^>]*defaultOpen=\{false\}/, path);
  }
});

test('a panel with no title cannot be folded, since nothing would name it', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /if \(!collapsible \|\| !title\) return body;/);
});

test('an unused hint block is one row, not a bordered box with a lecture', () => {
  // It used to carry a heading, a button and two lines telling the student to
  // try it themselves first, on every question of every tool that has hints.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.doesNotMatch(source, /Try it on your own first/);
  assert.doesNotMatch(source, /Hints get more specific as you go/);
  assert.match(source, /Stuck\? Show a hint/);
});

test('the consequence of using a hint is still stated before it is used', () => {
  // Dropping the paragraph must not drop the one fact in it that a student
  // needs before deciding: their teacher sees this.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /title="Using a hint is recorded for your teacher\."/);
  assert.match(source, /Recorded for your teacher/);
});

test('revealing a hint still reports it for attempt scoring', () => {
  // The compaction is presentational. If it had dropped onHintUsed, mathematical
  // help would stop being discounted and every hinted answer would score as
  // unaided work.
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /onHintUsed\?\.\(next\)/);
});

test('the hint control clears the Chromebook touch minimum', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  const panel = source.slice(source.indexOf('export const HintPanel'));
  assert.match(panel, /minHeight: 44/);
});

test('folding is remembered per panel, by its name', () => {
  const source = codeOf('src/tools/shared/ToolShell.jsx');
  assert.match(source, /mm\.tool\.panel\.\$\{contentKey\(String\(title\)\)\}/);
});

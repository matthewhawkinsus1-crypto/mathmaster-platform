/*
 * ONE UNDO: THE WORK BAR'S. A TOOL KEEPS ITS OWN CLEAR (owner decision
 * 2026-10-23; R-14 in docs/qa/student-ux-platform-pass.md).
 *
 * A student saw "↶ Undo ↷ Redo Start over" inside the tool and "↶ Undo" in the
 * work bar under it, two Undo buttons for one history (walkthrough 2026-10-22,
 * DOL #3 PR 3). Every tool feeds its work to useMathUndoHistory or
 * useActiveUndoOwner, and the work bar's UniversalUndoButton takes it back. A
 * tool that covers the work bar (an enlarged graph, an enlarged figure) shows
 * that same button or publishes the same capability, never a second history.
 * Start over / Clear stays with the tool.
 *
 * Read from source: no student-facing component renders a button named Undo or
 * Redo, or one showing ↶ or ↷, except UniversalUndoButton itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executableSource } from './helpers/sourceContract.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(root, 'src');
// Teacher and admin screens are not the student's work surface.
const SKIP = new Set(['components/teacher', 'components/admin', 'components/common/UniversalUndoButton.jsx']);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  const rel = relative(SRC, path).split('\\').join('/');
  if ([...SKIP].some((skip) => rel === skip || rel.startsWith(`${skip}/`))) return [];
  if (statSync(path).isDirectory()) return walk(path);
  return name.endsWith('.jsx') ? [path] : [];
});

const RENDERED_UNDO = [
  // aria-label="Undo", aria-label={`Undo on ${…}`}, aria-label="Redo"
  /aria-label=(?:"|\{`|\{')\s*(?:Undo|Redo)\b/,
  // a button whose text is or starts with the glyph or the word
  />\s*[↶↷](?!\s*out)[^<]*</,
  />\s*(?:Undo|Redo)\b[^<]*<\/(?:button|FocusSafeButton)>/,
];

test('no student-facing tool renders an Undo or Redo of its own', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const source = executableSource(readFileSync(file, 'utf8'));
    const hits = RENDERED_UNDO.filter((pattern) => pattern.test(source));
    if (hits.length) offenders.push(`${relative(root, file)} (${hits.map(String).join(', ')})`);
  }
  assert.deepEqual(offenders, [], 'Undo belongs to the work bar; a tool keeps only its Start over or Clear');
});

test('the patterns catch the controls they were written for', () => {
  const caught = (jsx) => RENDERED_UNDO.some((pattern) => pattern.test(jsx));
  assert.ok(caught('<FocusSafeButton onClick={undo} enabled={canUndo} aria-label="Undo">↶ Undo</FocusSafeButton>'));
  assert.ok(caught('<FocusSafeButton onClick={redo} enabled={Boolean(redoDepth)} aria-label="Redo" title="Redo">↷</FocusSafeButton>'));
  assert.ok(caught('<button type="button" onClick={() => undoGraph(graph.key)} aria-label={`Undo on ${graph.title}`}>\n  ↶ Undo\n</button>'));
  assert.ok(caught('<button type="button" onClick={undo}>Undo placement</button>'));
  assert.ok(!caught("capabilities={{ undo: { label: '↶ Undo', onAction: undo } }}"), 'a capability handed to the work bar is not a second button');
  assert.ok(!caught('<button type="button" onClick={startOver}>Start over</button>'));
  assert.ok(!caught("{ label: '↷ out', insert: 'out' }"), 'MathInput\'s "↷ out" leaves a fraction; it is not Redo');
});

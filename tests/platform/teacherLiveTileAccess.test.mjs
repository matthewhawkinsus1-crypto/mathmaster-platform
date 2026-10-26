// THE LIVE CLASS STUDENT TILE, FOR A SCREEN READER AND THE KEYBOARD (TT27).
//
// The tile was one role="button" around the buttons it holds ("+ Points",
// "Watch Practice", "Use this move", "Ask to Present", …). axe calls that
// nested-interactive: a button's children are presentational, so a screen
// reader cannot offer the buttons inside it apart, and Enter on any of them
// also bubbled to the tile and opened the student. 13 nodes on Teacher Home and
// Live Class's Attention view (8 and 5), measured on 2026-10-25. Now the tile is
// a group; its name row is the button that opens the student, with the name the
// tile always had; and a click anywhere on the tile still opens them.
//
// The behaviour is in the browser: the teacher-home and teacher-live-class/
// attention scenes of the accessibility ratchet (tests/browser/
// accessibilityCertification.mjs) count nested-interactive at both viewports and
// are held at zero, and the student-name journey
// (tests/browser/teacherWorkflow/studentNameJourneys.mjs) reads the tiles' names
// and opens one. This reads the markup that makes both true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const monitor = executableSource(readFileSync(new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url), 'utf8'));
const tile = region(monitor, 'function StudentTile({', 'function withClassworkStates', 'the Live Class student tile');

test('the tile is a named group, and no element of it is a button that holds other controls', () => {
  assert.doesNotMatch(tile, /role=\{[^}]*'button'[^}]*\}|role="button"/, 'the tile declares no role="button" of its own');
  assert.match(tile, /<div\s+role="group"\s+aria-label=\{tileLabel\}\s+data-live-tile=\{row\.id\}/, 'the card is a group named with the student\'s one line');
  // The one line is still what a screen reader is given for an unnamed student: the name, or "Name unavailable · ID x".
  assert.match(tile, /const tileLabel = formatStudentLabel\(\{ studentId: row\.id, displayName: row\.nameMissing \? '' : row\.name \}, \{ lastFirst: false \}\);/);
});

test('the name row is the native button that opens the student, named as the whole tile always was', () => {
  const button = region(tile, '<button\n          type="button"\n          onClick={(event) => {', '</button>', 'the open button');
  assert.match(button, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onOpenStudent\(row\.id\); \}\}/, 'it opens the student, and the click goes no further');
  assert.match(button, /aria-label=\{`\$\{tileLabel\}: \$\{row\.headline\}`\}/, 'it carries the tile\'s old name');
  // A tile with nowhere to open to (no handler) shows the same row without a control that does nothing.
  assert.match(tile, /\{onOpenStudent \? \(\s*<button/);
  assert.match(tile, /\) : \(\s*<div style=\{nameRowStyle\}>\{nameRow\}<\/div>\s*\)\}/);
});

test('a click anywhere on the tile still opens the student, and the keyboard route no longer depends on a key handler on the tile', () => {
  const opening = tile.slice(0, tile.indexOf('{onOpenStudent ? ('));
  assert.match(opening, /onClick=\{\(\) => onOpenStudent\?\.\(row\.id\)\}/, 'the mouse can still press the whole tile');
  assert.doesNotMatch(opening, /tabIndex|onKeyDown/, 'the tile is not a Tab stop of its own, and has no key handler that Enter on an inner button would also reach');
});

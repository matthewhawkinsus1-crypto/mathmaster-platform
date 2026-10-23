// A LIST WITH MARKERS INSIDE A TOOL READS FROM THE LEFT (walkthrough
// 2026-10-23, Solving Radical Equations PR 7 and CW 1).
//
// The question area is centred, so every <ol>/<ul> in a tool panel inherited
// text-align: center: "How to verify" and the radical solver's ✓/✗ list had
// their numbers and bullets stranded at the panel's edge, the text centred
// away from them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');

test('marker lists in a tool are left-aligned; marker-less and class-styled lists keep their own', () => {
  const rule = css.match(/\.mathmaster-tool-shell :is\(ol, ul\)([^{]*)\{([^}]*)\}/);
  assert.ok(rule, 'the tool list rule exists');
  assert.match(rule[1], /:not\(\[class\]\)/);
  assert.match(rule[1], /:not\(\[style\*="list-style: none"\]\)/);
  assert.match(rule[2], /text-align:\s*start/);
});

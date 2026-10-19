/*
 * TOOL-10 (pass 3): the Mapping Diagram's arrows in words.
 *
 * A screen-reader student who drew four arrows heard "4 arrows drawn" and could
 * not learn which, or remove one. The words come from arrowDescriptions.js; the
 * browser half (names on the nodes, the Remove list, focus after a removal) is
 * tests/browser/toolKeyboardRelationMapping.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  arrowText, domainNodeName, mappingStatus, orderedArrows, rangeNodeName,
} from '../../src/tools/relationMapping/arrowDescriptions.js';
import { executableSource } from './helpers/sourceContract.mjs';

const DRAWN = [[3, -1], [-2, 5], [1, 2], [-2, 3]];
// The component names nodes from the diagram-ordered list.
const ARROWS = orderedArrows(DRAWN, [-2, 1, 3], [-1, 2, 3, 5]);

test('each value names its arrows, as the node shows the value', () => {
  assert.equal(domainNodeName(-2, ARROWS), 'Domain value -2, maps to 3 and 5');
  assert.equal(domainNodeName(1, ARROWS), 'Domain value 1, maps to 2');
  assert.equal(domainNodeName(4, ARROWS), 'Domain value 4, no arrow yet');
  assert.equal(domainNodeName(1, ARROWS, { selected: true }), 'Domain value 1, maps to 2, selected');
  assert.equal(rangeNodeName(3, ARROWS), 'Range value 3, from -2');
  assert.equal(rangeNodeName(9, ARROWS), 'Range value 9, no arrow yet');
  assert.equal(rangeNodeName(2, [[1, 2], [0, 2], [5, 2]]), 'Range value 2, from 1, 0 and 5');
});

test('the arrows are listed in the diagram\'s order, each in words', () => {
  const ordered = orderedArrows(DRAWN, [-2, 1, 3], [-1, 2, 3, 5]);
  assert.deepEqual(ordered.map(arrowText), ['-2 → 3', '-2 → 5', '1 → 2', '3 → -1']);
});

test('the status line says what a press did', () => {
  assert.equal(mappingStatus({ arrows: [] }), '0 arrows drawn.');
  assert.equal(mappingStatus({ selectedDomain: -2, arrows: [] }), '-2 selected. Now choose the value it maps to.');
  assert.equal(mappingStatus({ arrows: [[-2, 3]], lastChange: { kind: 'added', x: -2, y: 3 } }), 'Arrow drawn from -2 to 3. 1 arrow drawn.');
  assert.equal(mappingStatus({ arrows: [], lastChange: { kind: 'removed', x: -2, y: 3 } }), 'Arrow from -2 to 3 removed. 0 arrows drawn.');
  assert.equal(mappingStatus({ arrows: [], lastChange: { kind: 'cleared' } }), 'All arrows cleared.');
});

test('the diagram is wired to the words', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/relationMapping/RelationMapping.jsx', import.meta.url), 'utf8'));
  assert.match(source, /const listedArrows = orderedArrows\(arrows, domainValues, rangeValues\);/);
  assert.match(source, /aria-label=\{domainNodeName\(value, listedArrows/);
  assert.match(source, /aria-label=\{rangeNodeName\(value, listedArrows\)\}/);
  assert.match(source, /\{mappingStatus\(\{ selectedDomain, arrows, lastChange: lastArrowChange \}\)\}/);
  assert.match(source, /\{listedArrows\.map\(\(\[x, y\], index\) =>/);
  assert.doesNotMatch(source, /role="application" aria-label="Mapping diagram"/, 'a group of controls, not an application');
});

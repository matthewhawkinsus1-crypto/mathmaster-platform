import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { clientPointToViewBox } from '../../src/utils/responsiveCoordinates.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/*
 * PLATFORM QUIRKS AUDIT PQ-034: A TAP LANDS ON THE VALUE DRAWN UNDER IT.
 *
 * Every plane draws with preserveAspectRatio "xMidYMid meet", so a height cap
 * draws it centred and narrower than its box. The plotting workspace and
 * CoordinatePlane map taps through the letterbox-aware clientPointToViewBox
 * (PQ-014); these three surfaces still stretched the box onto the viewBox. The
 * relation plot was already letterboxed on a phone held sideways (the landscape
 * layout caps `.mathmaster-tool-panel svg` at 62dvh): a tap on the drawn (2, 1)
 * plotted (0, 1). tests/browser/clickMapLetterbox.mjs drives all three in a
 * browser; this pins that each handler goes through the shared helper.
 */
const SURFACES = [
  { name: 'IntervalNumberLine', file: 'src/tools/intervalNumberLine/IntervalNumberLine.jsx', start: 'const valueFromEvent', end: '\n  };', width: 'WIDTH', height: 'HEIGHT' },
  { name: 'RelationMapping plot', file: 'src/tools/relationMapping/RelationMapping.jsx', start: 'const pointFromEvent', end: '\n  };', width: 'PLOT_SIZE', height: 'PLOT_SIZE' },
  { name: 'GraphStory sketch plane', file: 'src/GraphStory.jsx', start: 'const pointFromEvent', end: '\n};', width: 'WIDTH', height: 'HEIGHT' },
];

for (const surface of SURFACES) {
  test(`${surface.name} maps a tap through the letterbox-aware helper, not a box stretch`, () => {
    const source = read(surface.file);
    const handler = executableSource(region(source, surface.start, surface.end, `${surface.name} pointer mapping`));
    // The drawing's own size goes to the helper, with the measured box.
    assert.match(
      handler,
      new RegExp(`clientPointToViewBox\\(\\{[^}]*rect: event\\.currentTarget\\.getBoundingClientRect\\(\\)|clientPointToViewBox\\(\\{[^}]*rect: element\\.getBoundingClientRect\\(\\)`),
      `${surface.name}: the tap must be mapped by clientPointToViewBox from the surface's measured box`,
    );
    assert.match(handler, new RegExp(`viewBoxWidth: ${surface.width},\\s*viewBoxHeight: ${surface.height}`), `${surface.name}: the helper must be given the drawing's viewBox`);
    // ...and what comes back is what is converted into a value.
    assert.match(handler, /\bpoint\.x\b/, `${surface.name}: the helper's point must be the one converted`);
    // The straight stretch is gone.
    assert.doesNotMatch(handler, /\/\s*rect\.(width|height)\)\s*\*/, `${surface.name}: a box-to-viewBox stretch misplaces taps on a letterboxed plane`);
    // A .jsx call with no import is a runtime ReferenceError that the build and
    // lint both miss (AGENTS.md), so the import is asserted beside the call.
    assert.match(
      executableSource(source),
      /import \{[^}]*\bclientPointToViewBox\b[^}]*\} from '(?:\.\.\/\.\.\/|\.\/)utils\/responsiveCoordinates\.js';/,
      `${surface.name}: clientPointToViewBox must be imported where it is called`,
    );
  });
}

test('the measured phone-landscape relation plot: the helper finds the drawn point the stretch missed', () => {
  // 844x390, real landscape layout: a 520x242 box for the 430x430 plot.
  const rect = { left: 160, top: 100, width: 520, height: 242 };
  const scale = Math.min(520 / 430, 242 / 430);
  const offsetX = (520 - 430 * scale) / 2;
  const drawn = { x: 287.4, y: 178.8 }; // (2, 1) on that plot
  const clientX = rect.left + offsetX + drawn.x * scale;
  const clientY = rect.top + drawn.y * scale;
  const mapped = clientPointToViewBox({ clientX, clientY, rect, viewBoxWidth: 430, viewBoxHeight: 430 });
  assert.ok(Math.abs(mapped.x - drawn.x) < 1e-9 && Math.abs(mapped.y - drawn.y) < 1e-9);
  // The old stretch put it about two grid units to the left, at x = 0.
  const stretched = ((clientX - rect.left) / rect.width) * 430;
  assert.ok(Math.abs(stretched - drawn.x) > 30, `the stretch was ${stretched}`);
});

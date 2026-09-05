import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

/*
 * PINCH-TO-ZOOM ACROSS THE APP IS A FEATURE WE ALREADY HAVE.
 *
 * It is the browser's, not ours: every mobile browser zooms any page unless the
 * page asks it not to, and we never have. Measured at 1.0 -> 3.93 on a phone.
 *
 * That makes it something to PROTECT rather than build. It is also exactly the
 * kind of capability that disappears in a one-line "fix" — `user-scalable=no`
 * is the standard reflex when a mobile layout misbehaves, and it silently
 * removes the only zoom a student with low vision has. These tests exist so
 * that reflex fails loudly instead.
 */

test('no page tells a browser it may not be zoomed', () => {
  const html = read('index.html');
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i, 'never disable pinch zoom');
  assert.doesNotMatch(html, /maximum-scale/i, 'a maximum scale caps the zoom a student can reach');
});

test('nothing in the source smuggles the same restriction in later', () => {
  // A meta tag written at runtime would defeat the check above.
  const offenders = [];
  const walk = (dir) => {
    readdirSync(new URL(dir, root), { withFileTypes: true }).forEach((entry) => {
      const next = `${dir}${entry.name}${entry.isDirectory() ? '/' : ''}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(next); return; }
      if (!/\.(jsx?|css|html)$/.test(entry.name)) return;
      const source = read(next);
      if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(source)) offenders.push(next);
    });
  };
  walk('src/');
  assert.deepEqual(offenders, [], `these files disable pinch zoom: ${offenders.join(', ')}`);
});

test('the gesture is taken only where a tool genuinely needs it', () => {
  // `touch-action: none` is how an element says "I will handle touch myself",
  // and it stops the browser zooming on that element. That is correct for a
  // plane a student plots on — we give them a data-window zoom instead — but
  // applying it broadly would quietly remove page zoom everywhere it landed.
  const css = read('src/components/student/MathToolMobileLayout.css');
  const blanket = css.match(/[^\n}]+\{[^}]*touch-action:\s*none\s*!important/g) || [];
  blanket.forEach((rule) => {
    assert.match(
      rule,
      /svg\[role="application"\]|canvas|mathmaster-touch-surface/,
      `touch-action: none must name an interactive surface, not a container: ${rule.slice(0, 90)}`,
    );
  });
});

test('a plane that takes the gesture gives a zoom back in its place', () => {
  // The one place we remove the browser's zoom is the one place we owe the
  // student a replacement, or pinching a graph would do nothing at all.
  const plane = read('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /touchAction: interactive \? 'none' : 'auto'/);
  assert.match(plane, /const zoomable = panZoom == null \? interactive : Boolean\(panZoom\);/);
  assert.match(plane, /aria-label="Zoom in"/);
});

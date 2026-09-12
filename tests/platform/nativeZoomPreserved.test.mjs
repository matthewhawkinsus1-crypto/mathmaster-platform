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

test('a plane either leaves the gesture alone or gives a zoom back in its place', () => {
  /*
   * The rule this file protects is conditional, and the condition changed.
   *
   * It used to read `touch-action: none` — the plane took the touch gesture, so
   * it owed the student a replacement zoom or pinching a graph would do nothing
   * at all. The plane now declares `pan-y pinch-zoom` and hands the gesture back
   * to the browser, because intercepting the wheel and pinch meant scrolling the
   * page rewrote the graph's mathematical window underneath the student.
   *
   * Handing it back satisfies this file's actual purpose better than the old
   * arrangement did: browser pinch-zoom, the only zoom some students have, now
   * works ON the plane rather than being suppressed there. So the obligation is
   * written as the alternative it always was — take the gesture and replace it,
   * or do not take it — and the buttons are required either way, since this
   * suite already calls them the primary path rather than a fallback.
   */
  const plane = read('src/tools/shared/CoordinatePlane.jsx');
  const takesGesture = /touchAction: interactive \? 'none' : 'auto'/.test(plane);
  const leavesGesture = /touchAction: interactive \? 'pan-y pinch-zoom' : 'auto'/.test(plane);

  assert.ok(
    takesGesture || leavesGesture,
    'the plane must state its touch-action deliberately: either it handles touch itself or it lets the browser scroll and zoom',
  );
  if (takesGesture) {
    assert.match(plane, /const zoomable = panZoom == null \? interactive : Boolean\(panZoom\);/,
      'a plane that suppresses the browser zoom must offer its own');
  }
  assert.match(plane, /aria-label="Zoom in"/,
    'the zoom buttons are the primary path for a trackpad, a switch, or one hand on a bus — they are required whichever way the gesture goes');
});


test('pinch zoom never triggers viewport snap-back or Work View reflow', () => {
  const focus = read('src/platform/mobile/mobileFocusViewport.js');
  const mobile = read('src/components/student/MobileViewportContainer.jsx');
  const workView = read('src/platform/workView/workViewViewport.js');

  assert.match(focus, /if \(pinchZoomed\(windowObject\)\) return false/,
    'horizontal caret stabilization must stand down while the student pans a magnified page');
  assert.match(mobile, /if \(isBrowserPinchZoomed\(window\)\) return/,
    'visualViewport scroll must not be snapped back during pinch zoom');
  assert.match(workView, /readStableViewportBox/,
    'Work View geometry must use the stable layout viewport while page zoom is active');
});

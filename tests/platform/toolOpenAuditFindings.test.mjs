import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Every tool, on every screen a student uses it on.
 *
 * Recorded by tests/browser/toolOpenAudit.mjs in a real Chromium. Pixel
 * position and scroll depth are not things a source-inspection test can
 * measure, so the browser records and this asserts.
 *
 * WHY FIVE DEVICES. For a long time this checked two — a Chromebook and an
 * upright phone — and both passed, which read as "the tools are fine". Running
 * the same audit with the phone SIDEWAYS failed 10 of the 14 tools: the task
 * card had been unpinned on short screens to save room, so the question
 * scrolled as far as 522px above the answer boxes the student was typing into.
 * Nothing was wrong with the tools; the coverage was wrong. Tablets had never
 * been measured at all, and school carts are full of them.
 *
 * Re-record with:
 *   npx vite --port 5199 --strictPort &
 *   AUDIT_DEVICE=<device> node tests/browser/toolOpenAudit.mjs --write
 */
const DEVICES = [
  ['chromebook', 'toolOpenFindings.json', 1366, 640],
  ['phone', 'toolOpenPhoneFindings.json', 390, 664],
  ['phone-landscape', 'toolOpenPhoneLandscapeFindings.json', 844, 390],
  ['tablet', 'toolOpenTabletFindings.json', 820, 1180],
  ['tablet-landscape', 'toolOpenTabletLandscapeFindings.json', 1180, 820],
];

const load = (file) => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));

DEVICES.forEach(([device, file, width, height]) => {
  test(`every tool opens ready on ${device}`, () => {
    const recorded = load(file);
    assert.deepEqual(
      recorded.findings,
      [],
      `browser audit found problems on ${device}:\n${JSON.stringify(recorded.findings, null, 2)}`,
    );
  });

  test(`the ${device} audit measured the screen it claims to`, () => {
    // A pass recorded at the wrong viewport proves nothing about the right one.
    const recorded = load(file);
    assert.equal(recorded.device, device);
    assert.equal(recorded.viewport.width, width);
    assert.equal(recorded.viewport.height, height);
    assert.ok(recorded.measured >= 19, `expected at least 19 tools measured, got ${recorded.measured}`);
  });
});

test('both orientations are covered for every portable device', () => {
  // The gap this closes: passing upright and never being run sideways.
  const ids = DEVICES.map(([device]) => device);
  ['phone', 'tablet'].forEach((base) => {
    assert.ok(ids.includes(base), `${base} portrait is not covered`);
    assert.ok(ids.includes(`${base}-landscape`), `${base} landscape is not covered`);
  });
});

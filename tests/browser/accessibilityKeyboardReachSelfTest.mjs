/*
 * THE TAB WALK, SHOWN TO FIND WHAT IT CLAIMS (TT27).
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/accessibilityKeyboardReachSelfTest.mjs
 *
 * accessibilityKeyboardReach.mjs walks each teacher screen by Tab and counts what
 * the keyboard cannot do into the accessibility ratchet. A walk that found
 * nothing proves nothing unless it can be seen finding something. This page
 * (accessibilityKeyboardReachSelfTestMain.jsx, real React and the real Dialog)
 * is right for the keyboard in `clean`, and wrong in exactly one way in each
 * other plant: a control with no focus indicator, a Tab stop with no name, a
 * click handler with no key, a button that answers a click and not Enter, a
 * control under a sticky bar, a control Tab will not leave, a control Tab skips,
 * and a modal that lets focus out. Each must give exactly its own finding, and
 * `clean` and the real Dialog (a disclosure inside it, a closed one at its end, or
 * a single control that Tab has nowhere to leave) must give none; a dialog with
 * more than one control, one of which Tab will not leave, is still a trap.
 * `scrolling`, a page and a box in it that Tab has to scroll, must give none too,
 * and be left scrolled where the walk found it.
 */
import assert from 'node:assert/strict';
import { auditKeyboardReach } from './accessibilityKeyboardReach.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const walk = async (plant, options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/tests/browser/accessibilityKeyboardReachSelfTest.html?plant=${plant}`, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.getByRole('heading', { name: `Keyboard reach self-test: ${plant}` }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(300);
  const result = await auditKeyboardReach(page, { name: plant, viewport: 'desktop', ...options });
  // Where the page is scrolled to once the walk is over (the plant that scrolls starts at 40 and 10).
  const scrolledTo = await page.evaluate(() => ({ window: Math.round(scrollY), scroller: Math.round(document.querySelector('[data-scroller]')?.scrollTop ?? 0) }));
  await context.close();
  assert.deepEqual(errors, [], `${plant}: the page raised no error`);
  return { ...result, scrolledTo };
};

// Each plant's findings, exactly: nothing else may fire on the right parts of the page.
const EXPECTED = {
  clean: {},
  noRing: { 'mm-focus-not-visible': 1 },
  unnamed: { 'mm-unnamed-tab-stop': 1 },
  pointerOnly: { 'mm-pointer-only-control': 1 },
  notActivatable: { 'mm-tab-stop-not-activatable': 1 },
  obscured: { 'mm-focus-obscured': 1 },
  trap: { 'mm-keyboard-trap': 1 },
  skipped: { 'mm-tabbable-unreached': 1 },
  scrolling: {},
  dialog: {},
  singleControlDialog: {},
  dialogSwallowsTab: { 'mm-keyboard-trap': 1 },
  leakyDialog: { 'mm-keyboard-trap': 1 },
};

for (const [plant, expected] of Object.entries(EXPECTED)) {
  const result = await walk(plant);
  const wanted = Object.fromEntries(Object.entries(expected).map(([rule, count]) => [`${plant}|desktop|${rule}`, count]));
  assert.deepEqual(result.counts, wanted, `${plant}: findings (${JSON.stringify(result.summary.trap)})`);
  console.log(`ok   ${plant.padEnd(16)} ${Object.keys(expected).length ? Object.keys(expected).join(', ') : 'no findings'} (${result.summary.stops} stop(s), ${result.summary.mode})`);
  if (plant === 'clean') {
    const { summary } = result;
    assert.equal(summary.mode, 'page');
    assert.equal(summary.completed, true, 'clean: Tab reached the end of the page');
    assert.equal(summary.unreached, 0, 'clean: every control in the tab order was reached');
    // What a person is read, in order; what a closed disclosure holds is not a stop.
    const names = summary.stopNames.join(' | ');
    for (const name of ['Save', 'Nickname', 'Back to top', 'Due', 'More settings', 'Open the card', 'Custom button', 'Mark']) {
      assert.ok(summary.stopNames.some((entry) => entry.includes(name)), `clean: "${name}" is a Tab stop (${names})`);
    }
    assert.ok(!names.includes('Hidden until opened') && !names.includes('Hidden field'), `clean: a closed disclosure's controls are not stops (${names})`);
    // The audit sees React's handlers (a plain page has none), and ignores the ones that only stop a click.
    assert.ok(summary.pointerHandlers >= 3, `clean: the pointer audit found the page's handlers (${summary.pointerHandlers})`);
    assert.deepEqual(summary.pointerAudit, [], 'clean: none of them is out of the keyboard\'s reach');
  }
  if (plant === 'scrolling') {
    const { summary } = result;
    // The walk went to the far ends (so it scrolled), and what it moved is back where it was found.
    for (const name of ['Inside two', 'Far below']) assert.ok(summary.stopNames.some((entry) => entry.includes(name)), `scrolling: "${name}" is a Tab stop, so the walk scrolled to reach it`);
    assert.deepEqual(result.scrolledTo, { window: 40, scroller: 10 }, 'scrolling: the page and the box in it are scrolled where they were before the walk, not left at its end or sent to the top');
  }
  if (plant === 'dialog') {
    const { summary } = result;
    assert.equal(summary.mode, 'modal', 'dialog: the walk found the open modal and stayed in it');
    assert.equal(summary.completed, true);
    // Tab goes on from a disclosure's summary instead of back to the first control, and skips what a closed one holds.
    assert.deepEqual(summary.stopNames.map((entry) => entry.replace(/^[^:]*: /, '')), ['First control', 'More', 'After the disclosure', 'Advanced'], 'dialog: every control that can take Tab, in order');
    assert.equal(summary.unreached, 0);
  }
  if (plant === 'singleControlDialog') {
    // The dialog's one control keeps focus: that is the walk's end, and not a control Tab will not leave.
    assert.equal(result.summary.mode, 'modal');
    assert.equal(result.summary.completed, true);
    assert.equal(result.summary.stops, 1, 'singleControlDialog: the one control, once');
    assert.equal(result.summary.trap, null);
  }
  if (plant === 'dialogSwallowsTab') {
    assert.equal(result.summary.mode, 'modal');
    assert.equal(result.summary.trap.kind, 'tab-does-not-leave', 'dialogSwallowsTab: with another control in the dialog, a stop Tab will not leave is still a trap');
  }
  if (plant === 'trap') assert.equal(result.summary.trap.kind, 'tab-does-not-leave');
  if (plant === 'leakyDialog') assert.equal(result.summary.trap.kind, 'left-the-dialog');
}

// A walk that runs out of stops before the page runs out of controls is a finding, not a short, clean run.
const capped = await walk('clean', { maxStops: 4 });
assert.deepEqual(capped.counts, { 'clean|desktop|mm-keyboard-trap': 1, 'clean|desktop|mm-tabbable-unreached': 4 }, 'a walk stopped at 4 stops: a trap, and the four controls it never reached');
assert.equal(capped.summary.trap.kind, 'too-many-stops');
console.log('ok   capped           too many stops is a trap, and what was not reached is counted');

await browser.close();
console.log('Keyboard reach self-test passed: each planted defect is found, and the right pages are left alone.');

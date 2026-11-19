/*
 * THE SECURE EXAM'S OWN TOOLS ARE IN THE TEST'S TAB ROUND — by keyboard, in the
 * real app, at 1366×768 and 390×844 (a touch phone).
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/secureExamToolFocus.mjs
 *
 *   TEACHER_HARNESS_ORIGIN (default http://127.0.0.1:5188), PLAYWRIGHT_MODULE /
 *   CHROMIUM_PATH. A failure's screenshot goes to
 *   tests/browser/artifacts/secure-exam-tool-focus (git-ignored).
 *
 * The harness's `&innerScreens=1` school gives Theo (910975) a Digital SAT
 * practice test under way: Tests & Exams, Resume, then "Resume test" (the
 * MOCK_LOCAL sandbox starts it). Its toolbar carries the reference sheet and
 * the graphing calculator, whose drawers are portalled to the end of the body,
 * outside the test's two focus guards. Tab past the calculator's last control
 * used to walk out of the test to the page body, the skip link and the student
 * navigation (in a real browser, to the browser itself, which the integrity
 * logger records as leaving the test), and the open drawer was never reached
 * by Tab again: only pressing its toolbar button twice brought it back.
 *
 * For each tool, opened with Enter on its toolbar button:
 *   - 60 Tabs, then 60 Shift+Tabs: focus is always in the test or the open
 *     drawer, never on the page body, the skip link, the student navigation,
 *     or off the page;
 *   - every control in the drawer is reached going forward, and again going
 *     back;
 *   - the test records no departure: the window never loses focus and the
 *     page is never hidden, and no "Stay in the test window" notice or pause
 *     appears;
 *   - Escape inside the drawer closes it, and focus is back on its toolbar
 *     button.
 * At 1366×768 the two drawers fit side by side, so both are opened and one
 * walk must reach every control of both.
 *
 * WHERE A TOOL OPENS (the handoff's "secure exam's tool drawers"). A drawer
 * opened at the toolbar's height from the top of the screen, but the toolbar
 * sits under the student's name bar and navigation: at 1366×768 the
 * calculator covered the question list's button and the reference sheet both
 * tool buttons; on a phone the sheet covered the timer and the whole toolbar,
 * and every Tab stop in the test was hidden under it (14 of 14, and 36 of 36).
 * Now, with each tool open:
 *   - no control of the toolbar is covered by it;
 *   - no Tab stop in the test is hidden under it, going either way (WCAG 2.4.11);
 *   - on a laptop the drawer follows the toolbar as the page scrolls, and stops
 *     under the name bar, which a tool never covers;
 *   - on a phone, Escape on the toolbar closes the sheet too, and focus is back
 *     on its toolbar button.
 *
 * COMING INTO THE TEST (student-a11y-3). Tab from the student navigation above
 * the test landed on its last control: the guard at the test's start read every
 * focus as Shift+Tab before its first control. Now, with no tool open and with
 * each open: Tab from a stop just before the test lands on the round's first
 * control (the one Tab past its last reaches), Shift+Tab from a stop at the end
 * of the page lands on its last (with a drawer open, the drawer's last: the
 * drawer still comes after the test's last control), and Tab from the student
 * navigation's last control lands on the test's first control.
 *
 * NOTHING LEAVES LOCALHOST: every context aborts non-local requests.
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, 'artifacts/secure-exam-tool-focus');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const APP = `${ORIGIN}/tests?reset=1&recovery=p0&innerScreens=1&as=student&studentId=910975`;
const PRESSES = 60;
const DEVICES = [
  { id: 'chromebook', viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false },
  { id: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const TOOLS = {
  graphingCalculator: { name: 'the graphing calculator', launcher: '[data-graphing-calculator-launcher]' },
  referenceSheet: { name: 'the reference sheet', launcher: '[data-sat-reference-launcher]' },
};

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';

const failures = [];
let passes = 0;
const check = (ok, label, detail = '') => {
  if (ok) passes += 1;
  else failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
};

/*
 * In the page: where keyboard focus is now. "test" is inside the secure exam,
 * "tool" inside an open drawer of the round; anything else is a way out.
 */
const whereFocusIs = () => {
  const element = document.activeElement;
  const name = (node) => (node?.getAttribute?.('aria-label') || node?.textContent || node?.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!document.hasFocus()) return { kind: 'off the page' };
  if (!element || element === document.body || element === document.documentElement) return { kind: 'the page body' };
  if (element.closest('.mm-skip-link')) return { kind: 'the skip link' };
  if (element.closest('nav[aria-label="Student navigation"]')) return { kind: 'the student navigation' };
  const drawer = element.closest('[data-exam-tool-panel]');
  if (drawer) return { kind: 'tool', tool: drawer.getAttribute('data-exam-tool-panel'), name: name(element) };
  if (element.closest('[data-secure-exam-status]')) return { kind: 'test', name: name(element) };
  return { kind: `somewhere else (${element.tagName.toLowerCase()} "${name(element)}")` };
};

// In the page: the controls of each open drawer in the round that can take
// focus (what is inside a closed <details> cannot), named for the report, and
// those of them the walk has not focused yet (`onlyMissed`).
const drawerControls = (onlyMissed = false) => {
  const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, math-field, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll('[data-exam-tool-panel]')].flatMap((drawer) => [...drawer.querySelectorAll(TABBABLE)]
    .filter((element) => !element.closest('[inert]') && (typeof element.checkVisibility !== 'function' || element.checkVisibility()))
    .filter((element) => !onlyMissed || !window.__mmToolWalk?.has(element))
    .map((element) => `${drawer.getAttribute('data-exam-tool-panel')}: ${(element.getAttribute('aria-label') || element.textContent || element.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)}`));
};

// In the page: is the control that has focus, in the test, wholly hidden under
// an open tool (WCAG 2.4.11)? Its centre and two corners are each under one.
const hiddenUnderTool = () => {
  const element = document.activeElement;
  const drawers = [...document.querySelectorAll('[data-exam-tool-panel]')];
  if (!element || !drawers.length || element.closest('[data-exam-tool-panel]')) return null;
  const box = element.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const points = [[box.left + box.width / 2, box.top + box.height / 2], [box.left + 2, box.top + 2], [box.right - 2, box.bottom - 2]];
  const hidden = points.every(([x, y]) => drawers.some((drawer) => drawer.contains(document.elementFromPoint(x, y))));
  return hidden ? (element.getAttribute('aria-label') || element.textContent || element.tagName).replace(/\s+/g, ' ').trim().slice(0, 40) : null;
};

// In the page: the toolbar's controls an open tool covers (at their centre).
const coveredToolbarControls = () => {
  const drawers = [...document.querySelectorAll('[data-exam-tool-panel]')];
  return [...document.querySelectorAll('[data-secure-exam-header] button')].filter((button) => {
    if (!button.getClientRects().length) return false;
    const box = button.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return drawers.some((drawer) => drawer.contains(top));
  }).map((button) => (button.getAttribute('aria-label') || button.textContent).replace(/\s+/g, ' ').trim().slice(0, 40));
};

// In the page: where the name bar and the toolbar end, and where each open drawer starts.
const toolEdges = () => ({
  nameBar: Math.round(document.querySelector('.mm-identity-bar')?.getBoundingClientRect().bottom ?? 0),
  toolbar: Math.round(document.querySelector('[data-secure-exam-header]').getBoundingClientRect().bottom),
  drawers: [...document.querySelectorAll('[data-exam-tool-panel]')].map((drawer) => Math.round(drawer.getBoundingClientRect().top)),
});

const openPracticeTest = async (page) => {
  await page.goto(APP, { timeout: 180_000 });
  const row = page.locator('article', { hasText: 'Digital SAT Math — practice test' }).first();
  await row.waitFor({ timeout: 180_000 });
  await row.getByRole('button', { name: 'Resume', exact: true }).click();
  const resume = page.getByRole('button', { name: 'Resume test' });
  await resume.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Resume test' && !button.disabled), null, { timeout: 30_000 });
  await resume.click();
  await page.locator(`[data-secure-exam-header] ${TOOLS.graphingCalculator.launcher}`).waitFor({ timeout: 60_000 });
  await page.locator(`[data-secure-exam-header] ${TOOLS.referenceSheet.launcher}`).waitFor({ timeout: 10_000 });
  // Let the question settle (MathLive, the autosave line) before walking it.
  await page.waitForTimeout(1200);
};

// Opened as a keyboard user does: focus on its toolbar button, then Enter.
const openTool = async (page, tool) => {
  await page.locator(TOOLS[tool].launcher).focus();
  await page.keyboard.press('Enter');
  await page.locator(`[data-exam-tool-panel="${tool}"]`).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
};

// In the page: whether the stop that has focus is hidden under an open tool in
// the frame drawn next. A Tab can scroll the page; what the student sees is
// that frame, so the check runs in its animation-frame callback, after the
// scroll's own handlers and before it is drawn: a drawer that followed the
// toolbar a frame late is caught there, and nothing that is never drawn is.
const hiddenInNextFrame = () => new Promise((resolve) => {
  window.requestAnimationFrame(() => resolve(window.__mmHiddenUnderTool()));
});

const walk = async (page, key) => {
  await page.evaluate(`window.__mmHiddenUnderTool = ${hiddenUnderTool}`);
  await page.evaluate(() => {
    window.__mmToolWalk = new Set();
    window.__mmToolWalkListener ||= (event) => window.__mmToolWalk?.add(event.target);
    document.addEventListener('focusin', window.__mmToolWalkListener, true);
  });
  const strays = [];
  const hidden = new Set();
  const kinds = { test: 0, tool: 0 };
  for (let press = 1; press <= PRESSES; press += 1) {
    await page.keyboard.press(key);
    const under = await page.evaluate(hiddenInNextFrame);
    const where = await page.evaluate(whereFocusIs);
    if (where.kind === 'test' || where.kind === 'tool') kinds[where.kind] += 1;
    else strays.push(`${key} ${press}: ${where.kind}`);
    if (where.kind === 'test' && under) hidden.add(under);
  }
  // The drawer controls the walk never focused (focusin saw each one it did).
  const missed = await page.evaluate(drawerControls, true);
  return { strays, missed, kinds, hidden: [...hidden] };
};

const departures = (page) => page.evaluate(() => ({
  events: [...(window.__mmDepartures || [])],
  notice: Boolean(document.querySelector('[data-secure-integrity-warning]')),
  pause: Boolean(document.querySelector('[data-secure-pause]')),
}));

const closeWithEscape = async (page, tool, label) => {
  // From a control inside the drawer, as a student working in it would.
  await page.locator(`[data-exam-tool-panel="${tool}"] button`).first().focus();
  await page.keyboard.press('Escape');
  const closed = await page.locator(`[data-exam-tool-panel="${tool}"]`).waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(200);
  const onLauncher = await page.evaluate((selector) => Boolean(document.activeElement?.matches(selector)), TOOLS[tool].launcher);
  check(closed && onLauncher, `${label}: Escape inside it closes it, and focus is back on its toolbar button`, `closed ${closed}, on its button ${onLauncher}`);
};

// In the page: mark the round's first and last controls (the test, then each
// open drawer in page order: SecureExamContainer.jsx tabRound's own rule), and
// put a stop just before the test and one at the end of the page, outside it.
const markEntry = () => {
  const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, math-field, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
  const usable = (scope) => [...scope.querySelectorAll(TABBABLE)].filter((element) => !element.hasAttribute('data-secure-focus-guard')
    && !element.hasAttribute('data-exam-tool-tab-edge') && !element.closest('[inert]') && element.getClientRects().length > 0);
  const root = document.querySelector('[data-secure-exam-status]');
  const drawers = [...document.querySelectorAll('[data-exam-tool-panel]')];
  document.querySelectorAll('[data-mm-entry]').forEach((element) => element.removeAttribute('data-mm-entry'));
  document.querySelectorAll('[data-mm-entry-stop]').forEach((element) => element.remove());
  usable(root)[0]?.setAttribute('data-mm-entry', 'first');
  (drawers.length ? usable(drawers.at(-1)) : usable(root)).at(-1)?.setAttribute('data-mm-entry', 'last');
  const stop = (where) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mmEntryStop = where;
    button.textContent = `outside the test (${where})`;
    button.style.cssText = 'position:fixed;left:0;width:1px;height:1px;opacity:0.01;';
    return button;
  };
  root.before(stop('before'));
  document.body.append(stop('after'));
  const name = (element) => (element?.getAttribute('aria-label') || element?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { first: name(root.querySelector('[data-mm-entry="first"]')), last: name(document.querySelector('[data-mm-entry="last"]')) };
};
const entryNow = () => {
  const element = document.activeElement;
  return { entry: element?.getAttribute('data-mm-entry') || null, name: (element?.getAttribute('aria-label') || element?.textContent || element?.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
};
const entryChecks = async (page, label) => {
  // Focus goes back where it was afterwards, so the walks that follow start where they always did.
  await page.evaluate(() => { window.__mmEntryPrior = document.activeElement; });
  const expected = await page.evaluate(markEntry);
  await page.locator('[data-mm-entry-stop="before"]').focus();
  await page.keyboard.press('Tab');
  const forward = await page.evaluate(entryNow);
  check(forward.entry === 'first', `${label}: Tab into the test from just before it lands on its first control (${expected.first})`, `it landed on ${forward.name}`);
  await page.locator('[data-mm-entry-stop="after"]').focus();
  await page.keyboard.press('Shift+Tab');
  const backward = await page.evaluate(entryNow);
  check(backward.entry === 'last', `${label}: Shift+Tab into the test from the end of the page lands on the round's last control (${expected.last})`, `it landed on ${backward.name}`);
  // The real way in from above: the student navigation's last control, where it comes before the test.
  const navBefore = await page.evaluate(() => {
    document.querySelectorAll('[data-mm-entry-stop]').forEach((element) => element.remove());
    const controls = [...document.querySelectorAll('nav[aria-label="Student navigation"] :is(a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]))')]
      .filter((control) => control.getClientRects().length > 0 && !control.closest('[inert]'));
    const root = document.querySelector('[data-secure-exam-status]');
    const last = controls.at(-1);
    if (!last || !(last.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    last.focus();
    return document.activeElement === last;
  });
  if (navBefore) {
    await page.keyboard.press('Tab');
    const fromNav = await page.evaluate(entryNow);
    check(fromNav.entry === 'first', `${label}: Tab from the student navigation lands on the test's first control`, `it landed on ${fromNav.name}`);
  }
  await page.evaluate(() => {
    document.querySelectorAll('[data-mm-entry-stop]').forEach((element) => element.remove());
    if (window.__mmEntryPrior?.isConnected) window.__mmEntryPrior.focus();
    else document.activeElement?.blur?.();
  });
};

const walkTools = async (page, device, tools) => {
  const label = `${device.id}, ${tools.map((tool) => TOOLS[tool].name).join(' and ')}`;
  for (const tool of tools) await openTool(page, tool);
  const open = await page.evaluate(() => [...document.querySelectorAll('[data-exam-tool-panel]')].map((drawer) => drawer.getAttribute('data-exam-tool-panel')));
  check(tools.every((tool) => open.includes(tool)), `${label}: open`, `open: ${open.join(', ') || 'none'}`);
  const covered = await page.evaluate(coveredToolbarControls);
  check(covered.length === 0, `${label}: no control of the toolbar is covered`, covered.join('; '));
  if (!device.isMobile) {
    // A drawer opens where the toolbar ends, follows it as the page scrolls,
    // and stops under the name bar. The test is full screen, so the window
    // cannot be made shorter: room to scroll the toolbar away under the name
    // bar goes after the app instead, outside it, and then goes again.
    await page.evaluate(() => {
      const room = document.createElement('div');
      room.dataset.mmScrollRoom = '';
      room.style.height = '600px';
      document.body.append(room);
    });
    const follows = [];
    let underNameBar = false;
    for (const top of [0, 10_000, 0]) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
      await page.waitForTimeout(150);
      const edges = await page.evaluate(toolEdges);
      if (top) underNameBar = edges.toolbar < edges.nameBar;
      const expected = Math.max(edges.nameBar, edges.toolbar);
      if (!edges.drawers.length || edges.drawers.some((drawerTop) => Math.abs(drawerTop - expected) > 1)) follows.push(`scrolled to ${top ? 'the end' : 'the top'}: drawers at ${edges.drawers.join(', ') || 'none'}, the toolbar ends at ${edges.toolbar}, the name bar at ${edges.nameBar}`);
    }
    await page.evaluate(() => document.querySelector('[data-mm-scroll-room]')?.remove());
    await page.waitForTimeout(150);
    check(follows.length === 0 && underNameBar, `${label}: each drawer opens where the toolbar ends and follows it, never over the name bar`, `${follows.join('; ')}${underNameBar ? '' : ' (the page never scrolled the toolbar under the name bar)'}`);
  }
  await entryChecks(page, label);
  const controls = await page.evaluate(drawerControls);
  for (const [key, direction] of [['Tab', 'forward'], ['Shift+Tab', 'back']]) {
    // On a phone the walk starts with the toolbar part-way under the name bar,
    // as a page the student scrolled leaves it: a Tab onto a toolbar control
    // then scrolls the page, and the sheet must follow in that same frame (in
    // CI it was a frame late, and the toolbar's buttons were under the sheet).
    if (device.isMobile) {
      await page.evaluate(() => {
        const room = document.createElement('div');
        room.dataset.mmScrollRoom = '';
        room.style.height = '900px';
        document.body.append(room);
        window.scrollBy({ top: 125, behavior: 'instant' });
      });
      await page.waitForTimeout(250);
    }
    const { strays, missed, kinds, hidden } = await walk(page, key);
    if (device.isMobile) {
      await page.evaluate(() => document.querySelector('[data-mm-scroll-room]')?.remove());
      await page.waitForTimeout(150);
    }
    check(strays.length === 0, `${label}: ${PRESSES} × ${key} stay in the test and its open tools`, `${strays.length} left it: ${strays.slice(0, 6).join('; ')}`);
    check(hidden.length === 0, `${label}: going ${direction}, no stop in the test is hidden under the open tool (WCAG 2.4.11)`, hidden.slice(0, 8).join('; '));
    check(missed.length === 0 && kinds.tool > 0, `${label}: every control in the drawer is reached going ${direction} (${controls.length})`, `${kinds.tool} stops in the drawer, ${missed.length} control(s) never reached: ${missed.slice(0, 8).join('; ')}`);
    check(kinds.test > 0, `${label}: going ${direction}, Tab comes back into the test from the drawer`, `${kinds.test} stops in the test`);
  }
  // A failure's picture, small: the viewport only.
  if (failures.length) {
    mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, `${device.id}-${tools.join('-')}.png`) }).catch(() => {});
  }
  for (const tool of [...tools].reverse()) await closeWithEscape(page, tool, `${device.id}, ${TOOLS[tool].name}`);
  if (device.isMobile) {
    // Only the toolbar is in reach beside a phone's sheet: Escape there closes it too.
    for (const tool of tools) {
      await openTool(page, tool);
      await page.locator(TOOLS[tool].launcher).focus();
      await page.keyboard.press('Escape');
      const closed = await page.locator(`[data-exam-tool-panel="${tool}"]`).waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(200);
      const onLauncher = await page.evaluate((selector) => Boolean(document.activeElement?.matches(selector)), TOOLS[tool].launcher);
      check(closed && onLauncher, `${device.id}, ${TOOLS[tool].name}: Escape on the toolbar closes it, and focus is back on its toolbar button`, `closed ${closed}, on its button ${onLauncher}`);
    }
  }
};

const browser = await chromium.launch(launchOptions);
try {
  for (const device of DEVICES) {
    const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, colorScheme: 'light', reducedMotion: 'reduce' });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    // What the integrity logger listens for: the window losing focus, the page being hidden.
    await context.addInitScript(() => {
      window.__mmDepartures = [];
      window.addEventListener('blur', () => window.__mmDepartures.push('the window lost focus'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) window.__mmDepartures.push('the page was hidden'); });
    });
    const page = await context.newPage();
    try {
      await openPracticeTest(page);
      check(true, `${device.id}: the Digital SAT practice test is open, with its reference sheet and graphing calculator`);
      await entryChecks(page, `${device.id}, no tool open`);
      await walkTools(page, device, ['graphingCalculator']);
      await walkTools(page, device, ['referenceSheet']);
      // Side by side only where both fit (examToolLayout.js examToolsFitSideBySide).
      if (device.viewport.width >= 1280) await walkTools(page, device, ['referenceSheet', 'graphingCalculator']);
    } catch (error) {
      check(false, `${device.id}: the walk ran to the end`, String(error?.message || error).split('\n')[0]);
      mkdirSync(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, `${device.id}-error.png`) }).catch(() => {});
    } finally {
      // Asked even of a walk that stopped early: a pause is how a departure stops one.
      const left = await departures(page).catch((error) => ({ error: String(error?.message || error) }));
      check(Array.isArray(left.events) && left.events.length === 0 && !left.notice && !left.pause, `${device.id}: no departure from the test is recorded`, JSON.stringify(left));
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${passes} passed, ${failures.length} failed`);
if (failures.length) {
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}

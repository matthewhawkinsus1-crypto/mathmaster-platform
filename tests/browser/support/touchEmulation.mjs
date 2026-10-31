// A SCREENSHOT THAT HAS TO LOOK BEYOND THE VIEWPORT TAKES AN EMULATED PHONE'S
// TOUCH AWAY (CI12, finding E1-18).
//
// A browser context made with `hasTouch: true` (every phone and iPad check in
// tests/browser) answers `(pointer: coarse)`, `(hover: none)` and
// `navigator.maxTouchPoints > 0`. Ask the page for a full-page screenshot of a
// page taller than the viewport, or for a screenshot of an element larger than
// the viewport, and Playwright asks Chromium to capture beyond the viewport
// (Page.captureScreenshot with captureBeyondViewport). Afterwards the page
// answers `(pointer: fine)`, `(hover: hover)` and `maxTouchPoints === 0`: a
// mouse. It does not come back by itself or on a resize, only when the page
// next navigates or reloads. A screenshot that fits the viewport (the viewport
// itself, a small element, a full page that is no taller than the viewport)
// changes nothing. Seen with the Playwright 1.55 and 1.63 clients on Chromium
// 153, headless shell and full; not tried on the Chromium 140 that Playwright
// 1.55 installs in CI (the download is blocked where this was written), which
// is why the helper looks at the page instead of assuming it lost anything.
//
// So a check that ran after such a screenshot on a "phone", until the page next
// navigated, ran on a laptop with a narrow window: CSS and code that read the
// pointer or hover (larger tap targets, no hover styles, "is this a touch
// device") were not the ones a student gets. Playwright's own tap() still sends
// touch events, so nothing failed; the checks just stopped meaning what they
// said. Measured on the drivers' own pages: regressionCalculatorPhone,
// linearMultipleRepresentations, ccmrPlanHub, privateControlsJourneys,
// questionFamilyCases, studentShellLargeText and the three algebra lesson walks
// lost touch at most or all of their full-page screenshots; afterLastMiss,
// feedbackTeaches, lmrProcessMode and stepAlgebraStructureTools lost nothing.
//
// `screenshotKeepingTouch(target, options)` is `target.screenshot(options)` that
// leaves the page as it found it: if the page was touch before and is not
// after, it switches the emulation on again (Emulation.setTouchEmulationEnabled,
// the call Playwright itself made when it made the context) and checks that the
// page answers as before, or throws. On a page that was never touch it adds one
// probe and nothing else. `target` is a Page or a Locator; no target (an
// optional `pages.at(-1)?.`) does nothing.
//
// tests/platform/touchSurvivesScreenshots.test.mjs keeps every touch driver's
// screenshots on it, and tests/browser/touchAfterScreenshot.mjs proves it
// against the real Chromium.

/** What a page answers about its pointer: null if it cannot be asked (mid-navigation, closed). */
export const touchState = async (page) => {
  try {
    return await page.evaluate(() => ({
      coarse: window.matchMedia('(pointer: coarse)').matches,
      hoverNone: window.matchMedia('(hover: none)').matches,
      points: navigator.maxTouchPoints,
    }));
  } catch {
    return null;
  }
};

const isTouch = (state) => Boolean(state) && (state.points > 0 || state.coarse);
const sameTouch = (a, b) => Boolean(a) && Boolean(b) && a.coarse === b.coarse && a.hoverNone === b.hoverNone && a.points === b.points;

const SETTLE_MS = 3000;
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// An emulation a DevTools session switches on is the session's own: it is
// switched off again when the session detaches. So the session that restores
// touch is kept, one per page, until the page closes.
const sessions = new WeakMap();
const sessionFor = async (page) => {
  if (!sessions.has(page)) {
    sessions.set(page, await page.context().newCDPSession(page));
    page.once('close', () => sessions.delete(page));
  }
  return sessions.get(page);
};

/**
 * Switch a page's touch emulation back on, with the touch points it had, and
 * check the page answers as it did. Throws if it does not. The page is asked
 * again for a moment before it is called lost: it takes the change in a beat
 * after the command returns.
 */
export const restoreTouch = async (page, before) => {
  const session = await sessionFor(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: Math.max(1, before.points) });
  const until = Date.now() + SETTLE_MS;
  let after = await touchState(page);
  while (!sameTouch(before, after) && Date.now() < until) {
    await pause(50);
    after = await touchState(page);
  }
  if (!sameTouch(before, after)) {
    throw new Error(`touch emulation was lost to a screenshot and could not be restored: was ${JSON.stringify(before)}, is ${JSON.stringify(after)}`);
  }
};

/** `target.screenshot(options)` that leaves a touch page a touch page. */
export const screenshotKeepingTouch = async (target, options) => {
  if (!target) return undefined;
  const page = typeof target.page === 'function' ? target.page() : target;
  const before = await touchState(page);
  let result;
  let failure = null;
  try {
    result = await target.screenshot(options);
  } catch (error) {
    failure = error;
  }
  // Also after a screenshot that failed: Chromium may have reset it before it did.
  if (isTouch(before) && !page.isClosed()) {
    try {
      if (!sameTouch(before, await touchState(page))) await restoreTouch(page, before);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return result;
};

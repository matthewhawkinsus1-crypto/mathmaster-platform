// A Live Challenge round's bar on a narrow phone, with its largest counts.
//
// Graph Feature Rush (and Inequality Graphing Rush, on the same screen) and
// Graph the Line show a bar of counts over the graph. On a phone it must hold
// one row whatever the counts: when it wrapped, the graph under the student's
// finger moved (a three-digit total wrapped the rush bar at 360 px). This sets
// the page to 320 and then 360 px wide, writes the largest counts into the bar
// (a four-digit total, a two-digit streak) beside whatever it shows ("Reconnecting…"
// when the driver has taken the page offline), measures it, puts the counts and
// the page's width back, and returns what it found. No round in CI's time
// reaches a four-digit total, so the counts are written into the bar's own text:
// the bar keeps a slot as wide as its largest count, and this checks it holds.
//
// Used by the round drivers CI runs: graphFeatureRushGame.mjs, lineGraphGame.mjs.

export const NARROW_PHONES = Object.freeze([
  Object.freeze({ width: 320, height: 640 }),
  Object.freeze({ width: 360, height: 740 }),
]);

// In the page: the bar's rows, its width, and the status's lines.
const measureBar = (barSelector) => {
  const bar = document.querySelector(barSelector);
  if (!bar) return null;
  const boxOf = (node) => node.getBoundingClientRect();
  // Its items in the flow (the status is drawn on its edge, out of the row).
  const items = [...bar.children].filter((child) => getComputedStyle(child).position !== 'absolute' && boxOf(child).width > 0);
  const middles = items.map((child) => boxOf(child).top + boxOf(child).height / 2);
  const status = bar.querySelector('[role="status"]');
  let statusFit = null;
  if (status) {
    const box = boxOf(status);
    const range = document.createRange();
    range.selectNodeContents(status);
    statusFit = {
      text: status.textContent,
      lines: new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size,
      onScreen: box.left >= -0.5 && box.right <= window.innerWidth + 0.5,
      cut: status.scrollWidth > status.clientWidth + 1,
    };
  }
  return {
    width: window.innerWidth,
    height: Math.round(boxOf(bar).height * 10) / 10,
    oneRow: items.length > 0 && Math.max(...middles) - Math.min(...middles) < 2,
    items: items.map((child) => `${String(child.className).split(' ')[0]} ${Math.round(boxOf(child).left)}–${Math.round(boxOf(child).right)}`),
    overflow: bar.scrollWidth > bar.clientWidth + 1 || items.some((child) => boxOf(child).left < -0.5 || boxOf(child).right > window.innerWidth + 0.5),
    status: statusFit,
  };
};

// In the page: write each count's text, and return what was there.
const writeCounts = (entries) => entries.map(([selector, text]) => {
  const node = document.querySelector(selector);
  if (!node) return [selector, null];
  const was = node.textContent;
  node.textContent = text;
  return [selector, was];
});

/**
 * The bar at each narrow width, as it stands and with `counts` written in
 * ([selector, text] pairs; a selector that finds nothing is skipped and listed).
 * Returns one entry per width: { width, before, after, missing }. The page is
 * put back at `restore` (its own viewport) afterwards.
 */
export const roundBarAtNarrowWidths = async (page, { bar, counts, restore }) => {
  const results = [];
  for (const size of NARROW_PHONES) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    const before = await page.evaluate(measureBar, bar);
    const was = await page.evaluate(writeCounts, counts);
    await page.waitForTimeout(150);
    const after = await page.evaluate(measureBar, bar);
    await page.evaluate(writeCounts, was.filter(([, text]) => text !== null));
    results.push({ width: size.width, before, after, missing: was.filter(([, text]) => text === null).map(([selector]) => selector) });
  }
  await page.setViewportSize(restore);
  await page.waitForTimeout(250);
  return results;
};

/** What is wrong with one width's result, in a driver's words (empty when it holds). */
export const roundBarProblems = ({ width, before, after, missing }, { status = true } = {}) => {
  if (!before || !after) return [`${width} px: no bar`];
  const problems = [];
  if (missing.length) problems.push(`${width} px: nothing to write into (${missing.join(', ')})`);
  if (!after.oneRow) problems.push(`${width} px: the bar took more than one row with its largest counts (${after.items.join(', ')})`);
  if (after.height !== before.height) problems.push(`${width} px: the largest counts changed the bar's height (${before.height} → ${after.height} px)`);
  if (after.overflow) problems.push(`${width} px: the bar runs past the screen (${after.items.join(', ')})`);
  if (status && !after.status) problems.push(`${width} px: no "Reconnecting…" to measure`);
  if (after.status && (after.status.lines !== 1 || after.status.cut || !after.status.onScreen)) {
    problems.push(`${width} px: "Reconnecting…" is not one whole line on screen (${JSON.stringify(after.status)})`);
  }
  return problems;
};

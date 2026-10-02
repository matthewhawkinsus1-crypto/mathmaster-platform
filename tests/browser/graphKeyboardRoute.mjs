// THE GRAPH WORKSPACE TELLS A KEYBOARD STUDENT THE TRUTH, AND NAMES ITS FIELDS.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/graphKeyboardRoute.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// Selecting a point card or an end marker is announced with the routes that
// place it. The typed x / y entry is one of them only while it is on screen:
// end markers come after the curve has fixed the points, when it is gone, and
// the marker announcement used to offer it anyway. And each analysis field is
// called by its part ("Domain in interval notation"), not by its placeholder —
// the format example "[2, ∞)" — or, with none, "Math answer".
//
// Driven only through rendered controls, in the real QuestionEngine
// (graphKeyboardRouteMain.jsx), under practice and under a DOL (whose points
// are held still by the student's own sketch rather than by a passed check).
// Names are read from Chrome's accessibility tree. Exits non-zero on failure.

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
let total = 0;
const check = (ok, label, detail = '') => {
  total += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const stamp = Date.now();
let pageCount = 0;
const open = async (q, role = 'practice') => {
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${q} (${role}): page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/graphKeyboardRoute.html?q=${q}&role=${role}&run=${stamp}-${(pageCount += 1)}`, { waitUntil: 'networkidle' });
  await page.locator('[data-graph-keyboard-fixture]').waitFor();
  await page.waitForTimeout(700);
  return page;
};

const announcement = async (page) => (await page.locator('[role="status"][aria-live="polite"]').allInnerTexts()).join(' ').trim();
const OFFERS_TYPING = /type an exact coordinate/;
const exactEntryShown = async (page) => (await page.getByRole('button', { name: 'Place at this coordinate' }).count()) > 0
  && page.getByRole('button', { name: 'Place at this coordinate' }).isVisible();

/** What Chrome's accessibility tree calls each math field (role "math"), in page order. */
const mathFieldNames = async (page) => {
  const client = await page.context().newCDPSession(page);
  const { nodes } = await client.send('Accessibility.getFullAXTree');
  await client.detach();
  return nodes.filter((node) => node.role?.value === 'math' && !node.ignored).map((node) => node.name?.value ?? '');
};

// The grid's own axis labels give the screen mapping (as graphPointCheck.mjs).
const axisFit = (page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const marks = [...svg.querySelectorAll('text')]
    .filter((t) => /^-?\d+$/.test(t.textContent.trim()))
    .map((t) => { const r = t.getBoundingClientRect(); return { value: Number(t.textContent), cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  const line = (key, other) => {
    const rows = {};
    marks.forEach((m) => { const k = Math.round(m[other]); (rows[k] = rows[k] || []).push(m); });
    const best = Object.values(rows).sort((a, b) => b.length - a.length)[0].sort((a, b) => a.value - b.value);
    const [a, b] = [best[0], best[best.length - 1]];
    const scale = (b[key] - a[key]) / (b.value - a.value);
    return { zero: a[key] - a.value * scale, scale };
  };
  return { x: line('cx', 'cy'), y: line('cy', 'cx') };
});
const toScreen = (fit, x, y) => [fit.x.zero + x * fit.x.scale, fit.y.zero + y * fit.y.scale];
const line = (x) => 2 * x + 1;

const typePoint = async (page, card, x, y) => {
  await page.getByRole('button', { name: new RegExp(`^${card}`) }).click();
  await page.getByRole('spinbutton', { name: 'x', exact: true }).fill(String(x));
  await page.getByRole('spinbutton', { name: 'y', exact: true }).fill(String(y));
  await page.getByRole('button', { name: 'Place at this coordinate' }).click();
  await page.waitForTimeout(200);
};
const drawLine = async (page) => {
  const fit = await axisFit(page);
  const points = [];
  for (let x = -2.4; x <= 3.2 + 1e-9; x += 0.2) points.push(toScreen(fit, x, line(x)));
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...point, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(400);
};
const plane = (page) => page.locator('[aria-label^="Coordinate plane. Use the arrow keys"]').first();
const markerButton = (page, type) => page.locator('button', { hasText: type }).first();

/* ------------------------------------------- Function Investigation, by role */

for (const role of ['practice', 'dol']) {
  const page = await open('investigation', role);
  const label = `investigation (${role})`;

  // A point card: the typed entry is on screen, and offered.
  await page.getByRole('button', { name: /^Plot the point where x = 0/ }).click();
  await page.waitForTimeout(150);
  let said = await announcement(page);
  const cardName = await page.getByRole('button', { name: /^Plot the point where x = 0/ }).getAttribute('aria-label');
  check(await exactEntryShown(page) && OFFERS_TYPING.test(said) && OFFERS_TYPING.test(cardName),
    `${label}: a selected point card offers the typed coordinate, which is on screen`, `"${said}"`);

  // ...and the route it offers works.
  await typePoint(page, 'Plot the point where x = 0', 0, 1);
  check(/^Placed Plot the point where x = 0 at \(0, 1\)\.$/.test(await announcement(page)), `${label}: the typed coordinate places the point`, `"${await announcement(page)}"`);
  await typePoint(page, 'Plot the point where x = 2', 2, 5);
  if (role === 'practice') {
    await page.getByRole('button', { name: 'Check Point Placements' }).click();
    await page.waitForTimeout(250);
  }
  await drawLine(page);

  // An end marker: the curve holds the points still, the typed entry is gone,
  // and the announcement must not send the student looking for it.
  check(await markerButton(page, 'Arrow').count() === 1, `${label}: the curve is drawn and the end markers are offered`);
  await markerButton(page, 'Arrow').click();
  await page.waitForTimeout(150);
  said = await announcement(page);
  check(!(await exactEntryShown(page)), `${label}: with the curve drawn the typed entry is not on screen`);
  check(/^Arrow selected\. Use the arrow keys on the plane and press Enter\.$/.test(said) && !OFFERS_TYPING.test(said),
    `${label}: the marker announcement offers only what is there — the arrow keys and Enter`, `"${said}"`);

  // ...and the route it does offer places the marker.
  await plane(page).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  said = await announcement(page);
  check(said.startsWith('Placed Arrow at ('), `${label}: arrow keys and Enter place the marker`, `"${said}"`);
  await page.close();
}

/* ---------------------------------------- the analysis fields, named by part */

{
  // Through to the analysis stage of the investigation (practice).
  const page = await open('investigation', 'practice');
  await typePoint(page, 'Plot the point where x = 0', 0, 1);
  await typePoint(page, 'Plot the point where x = 2', 2, 5);
  await page.getByRole('button', { name: 'Check Point Placements' }).click();
  await page.waitForTimeout(250);
  await drawLine(page);
  // In practice the true ends pulse until they are marked, and a marker
  // dropped on one snaps to it. Read where the next one is before each drop:
  // the first drop's feedback moves the plane down the page.
  for (let drop = 0; drop < 2; drop += 1) {
    await markerButton(page, 'Arrow').click();
    await page.waitForTimeout(100);
    const [px, py] = await page.evaluate(() => {
      const box = document.querySelector('.mathmaster-endpoint-pulse').getBoundingClientRect();
      return [box.x + box.width / 2, box.y + box.height / 2];
    });
    await page.mouse.click(px, py);
    await page.waitForTimeout(200);
  }
  await page.getByRole('button', { name: '2. Analyze Function' }).click();
  await page.waitForTimeout(600);
  const names = await mathFieldNames(page);
  check(JSON.stringify(names) === JSON.stringify(['Domain in interval notation', 'Range in interval notation']),
    'investigation: the domain and range fields are named by their parts, not by the example "[2, ∞)"', JSON.stringify(names));
  await page.close();
}

{
  // An analysis-only question: a value with no placeholder, an authored label
  // with mathematics in it, and a point typed as coordinates.
  const page = await open('analysis');
  const names = await mathFieldNames(page);
  check(JSON.stringify(names) === JSON.stringify(['The value of f(2)', 'The domain of f', 'The y-intercept']),
    'analysis: every field is named by its part, in plain words', JSON.stringify(names));
  check(!names.some((name) => /^(Math answer|\[2, ∞\)|\(x, y\) or DNE)$/.test(name)), 'analysis: no field is called by its placeholder or the generic name', JSON.stringify(names));
  await page.close();
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} of ${total} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} checks passed: the keyboard announcements offer only routes that are on screen, and every analysis field is named by its part.`);

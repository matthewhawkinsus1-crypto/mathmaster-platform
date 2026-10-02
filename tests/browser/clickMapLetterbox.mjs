// A TAP LANDS ON THE VALUE DRAWN UNDER IT — ON EVERY CLICK SURFACE, LETTERBOXED OR NOT.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/clickMapLetterbox.mjs
//
// Every MathMaster plane draws with preserveAspectRatio "xMidYMid meet": capped
// to a shorter box, the drawing is scaled uniformly and centred, so a straight
// box-to-viewBox stretch puts a tap up to the empty band away from where it
// landed (PQ-014). The plotting workspace and CoordinatePlane were fixed then;
// IntervalNumberLine, RelationMapping's plot and GraphStory's sketch plane still
// stretched (platform quirks audit PQ-034). RelationMapping's plot is already
// letterboxed on a phone held sideways: the landscape layout caps
// `.mathmaster-tool-panel svg` at 62dvh.
//
// The oracle is the browser itself: `svg.getScreenCTM()` says where a viewBox
// point is DRAWN, the driver taps exactly there, and the component must record
// that same point — the snapped value for the number line and the plot, the
// stroke's first point for the sketch.
//
// Exits non-zero on any failure.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const CHROMEBOOK = { viewport: { width: 1366, height: 768 } };
const PHONE_LANDSCAPE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const open = async (device, surface, cap = 0) => {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${surface}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/clickMapLetterbox.html?surface=${surface}${cap ? `&cap=${cap}` : ''}&run=${Date.now()}`, { waitUntil: 'networkidle' });
  const selector = await page.evaluate(() => window.__clickMap.selector);
  await page.locator(selector).first().waitFor({ timeout: 30000 });
  if (cap) await page.waitForFunction(() => window.__clickMap.capped !== null, null, { timeout: 5000 });
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  return { context, page, selector };
};

// Where the browser draws viewBox point (x, y), in client pixels, plus whether
// the surface is letterboxed (its box and its viewBox disagree on shape).
const drawnAt = (page, selector, x, y) => page.evaluate(({ selector: css, x: vx, y: vy }) => {
  const svg = document.querySelector(css);
  const point = svg.createSVGPoint();
  point.x = vx;
  point.y = vy;
  const client = point.matrixTransform(svg.getScreenCTM());
  const rect = svg.getBoundingClientRect();
  const box = svg.viewBox.baseVal;
  const letterbox = Math.abs((rect.width / rect.height) / (box.width / box.height) - 1);
  return { clientX: client.x, clientY: client.y, letterboxed: letterbox > 0.02, box: `${Math.round(rect.width)}x${Math.round(rect.height)}`, viewBox: `${box.width}x${box.height}` };
}, { selector, x, y });

const tapAt = async (page, device, clientX, clientY) => {
  if (device.hasTouch) await page.touchscreen.tap(clientX, clientY);
  else await page.mouse.click(clientX, clientY);
  await page.waitForTimeout(200);
};

// ------------------------------------------------------------- number line
const numberLine = async (device, deviceLabel, cap) => {
  const { context, page, selector } = await open(device, 'interval', cap);
  // The drawn position of the major tick labelled "5" (labels sit at sx(value)).
  const target = await page.evaluate((css) => {
    const svg = document.querySelector(css);
    const label = [...svg.querySelectorAll('text')].find((text) => text.textContent.trim() === '5');
    const axis = svg.querySelector('line');
    return { x: Number(label.getAttribute('x')), y: Number(axis.getAttribute('y1')) };
  }, selector);
  const drawn = await drawnAt(page, selector, target.x, target.y);
  await tapAt(page, device, drawn.clientX, drawn.clientY);
  const placed = await page.evaluate(() => {
    const pending = document.querySelector('[aria-label*="pending endpoint at"]');
    return pending ? (pending.getAttribute('aria-label').match(/pending endpoint at (\S+?)\./) || [])[1] : null;
  });
  check(placed === '5', `${deviceLabel} number line${cap ? ` capped to ${cap}` : ''} (${drawn.box} for ${drawn.viewBox}${drawn.letterboxed ? ', letterboxed' : ''}): a tap on the drawn 5 places 5`, `placed ${placed}`);
  await context.close();
  return drawn.letterboxed;
};

// ------------------------------------------------------------ relation plot
const relationPlot = async (device, deviceLabel, surface, cap) => {
  const { context, page, selector } = await open(device, surface, cap);
  // Tick labels: x at xToPx(x) on the x-axis, y at yToPx(y) + 4 beside the y-axis.
  const target = await page.evaluate((css) => {
    const svg = document.querySelector(css);
    const texts = [...svg.querySelectorAll('text')];
    const xLabel = texts.find((text) => text.textContent.trim() === '2' && text.getAttribute('text-anchor') === 'middle');
    const yLabel = texts.find((text) => text.textContent.trim() === '1' && text.getAttribute('text-anchor') === 'end');
    return { x: Number(xLabel.getAttribute('x')), y: Number(yLabel.getAttribute('y')) - 4 };
  }, selector);
  const drawn = await drawnAt(page, selector, target.x, target.y);
  await tapAt(page, device, drawn.clientX, drawn.clientY);
  const plotted = await page.evaluate((css) => [...document.querySelector(css).querySelectorAll('circle[r="7"]')]
    .map((circle) => ({ x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')) })), selector);
  const hit = plotted.length === 1 && Math.abs(plotted[0].x - target.x) < 0.5 && Math.abs(plotted[0].y - target.y) < 0.5;
  check(hit, `${deviceLabel} relation plot${surface === 'relation-question' ? ' in the question' : ''}${cap ? ` capped to ${cap}` : ''} (${drawn.box} for ${drawn.viewBox}${drawn.letterboxed ? ', letterboxed' : ''}): a tap on the drawn (2, 1) plots (2, 1)`,
    `drew (${target.x.toFixed(1)}, ${target.y.toFixed(1)}), plotted ${JSON.stringify(plotted)}`);
  await context.close();
  return drawn.letterboxed;
};

// ------------------------------------------------------------- sketch plane
const sketch = async (device, deviceLabel, cap) => {
  const { context, page, selector } = await open(device, 'story', cap);
  const start = await drawnAt(page, selector, 200, 300);
  const end = await drawnAt(page, selector, 520, 120);
  await page.mouse.move(start.clientX, start.clientY);
  await page.mouse.down();
  await page.mouse.move((start.clientX + end.clientX) / 2, (start.clientY + end.clientY) / 2, { steps: 4 });
  await page.mouse.move(end.clientX, end.clientY, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const points = await page.evaluate((css) => {
    const line = document.querySelector(css).querySelector('polyline');
    return line ? line.getAttribute('points').trim().split(/\s+/).map((pair) => pair.split(',').map(Number)) : [];
  }, selector);
  const first = points[0] || [NaN, NaN];
  const last = points[points.length - 1] || [NaN, NaN];
  // The plane has a 2px CSS border, which the shared helper (like every other
  // plane's) does not subtract: within 3 viewBox units, never the tens of units
  // a letterbox costs.
  const near = (point, x, y) => Math.abs(point[0] - x) <= 3 && Math.abs(point[1] - y) <= 3;
  check(near(first, 200, 300) && near(last, 520, 120), `${deviceLabel} graph-story sketch${cap ? ` capped to ${cap}` : ''} (${start.box} for ${start.viewBox}${start.letterboxed ? ', letterboxed' : ''}): the stroke starts and ends where the pointer did`,
    `first (${first.map((value) => value.toFixed(1)).join(', ')}) for (200, 300), last (${last.map((value) => value.toFixed(1)).join(', ')}) for (520, 120)`);
  await context.close();
  return start.letterboxed;
};

check(!(await numberLine(CHROMEBOOK, 'chromebook', 0)), 'chromebook number line at its natural size is not letterboxed (control)');
check(await numberLine(CHROMEBOOK, 'chromebook', 0.55), 'chromebook number line capped to 0.55 is letterboxed (the case under test)');
check(!(await relationPlot(CHROMEBOOK, 'chromebook', 'relation', 0)), 'chromebook relation plot at its natural size is not letterboxed (control)');
check(await relationPlot(CHROMEBOOK, 'chromebook', 'relation', 0.55), 'chromebook relation plot capped to 0.55 is letterboxed (the case under test)');
check(!(await sketch(CHROMEBOOK, 'chromebook', 0)), 'chromebook sketch plane at its natural size is not letterboxed (control)');
check(await sketch(CHROMEBOOK, 'chromebook', 0.55), 'chromebook sketch plane capped to 0.55 is letterboxed (the case under test)');
// The real layout, no help from the harness: a phone held sideways.
const landscapeLetterboxed = await relationPlot(PHONE_LANDSCAPE, 'phone 844x390', 'relation-question', 0);
console.log(`     (phone landscape: the plot is ${landscapeLetterboxed ? 'letterboxed by the landscape layout' : 'not letterboxed'})`);

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nEvery click surface records the point drawn under the tap, letterboxed or not.');

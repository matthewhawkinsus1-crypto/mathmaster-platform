// A PHONE STAYS A PHONE AFTER A FULL-PAGE SCREENSHOT — AGAINST THE REAL CHROMIUM.
// CI12 (finding E1-18). tests/browser/support/touchEmulation.mjs says why.
//
//   node tests/browser/touchAfterScreenshot.mjs
//
// (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//  when the defaults below are not installed.) It needs no server: the page is
//  made in the browser.
//
// For a phone, an iPad, a Chromebook with a touch screen and a laptop:
//   1. the bare screenshot. A note says whether this Chromium still takes touch
//      away (it is not a failure either way: when it stops, the helper can go);
//   2. the helper, on a fresh page: a full-page screenshot, a screenshot of an
//      element taller than the viewport, and one that fits, each leave the page
//      answering as it did (pointer, hover, touch points), and a tap still
//      reaches the page as a touch;
//   3. a laptop stays a laptop: the helper never switches touch on.
// Exit code 1 on any failure.

import { screenshotKeepingTouch, touchState } from './support/touchEmulation.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${text ? ` — ${text}` : ''}`);
  if (!ok) failures.push(`${label}${text ? `: ${text}` : ''}`);
};

// A page taller than any viewport below, with a tall element inside it and one button.
const PAGE = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<body style="margin:0"><button id="target" style="margin:20px;padding:24px">Tap me</button>
<div id="tall" style="height:2600px;background:linear-gradient(#fdd,#ddf)">A tall element</div></body>`;

const DEVICES = [
  { name: 'phone', touch: true, options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } },
  { name: 'iPad', touch: true, options: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
  { name: 'Chromebook with a touch screen', touch: true, options: { viewport: { width: 1366, height: 768 }, hasTouch: true } },
  { name: 'laptop', touch: false, options: { viewport: { width: 1366, height: 768 } } },
];

const newPage = async (options) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.setContent(PAGE);
  // A page that has not painted yet cannot be captured beyond its viewport.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page };
};
const same = (a, b) => a && b && a.coarse === b.coarse && a.hoverNone === b.hoverNone && a.points === b.points;

for (const device of DEVICES) {
  console.log(`\n== ${device.name}`);

  // 1. What the bare call does to this Chromium.
  {
    const { context, page } = await newPage(device.options);
    const before = await touchState(page);
    check(device.touch ? before.coarse && before.points > 0 : !before.coarse && before.points === 0, `${device.name}: the page starts as a ${device.touch ? 'touch' : 'mouse'} device`, before);
    await page.screenshot({ fullPage: true });
    const after = await touchState(page);
    if (device.touch) {
      console.log(same(before, after)
        ? `note: ${browser.version()} keeps touch through a bare full-page screenshot: screenshotKeepingTouch is no longer needed`
        : `note: ${browser.version()} takes touch away in a bare full-page screenshot (${JSON.stringify(before)} -> ${JSON.stringify(after)}): screenshotKeepingTouch is needed`);
    }
    await context.close();
  }

  // 2. The helper.
  const { context, page } = await newPage(device.options);
  const before = await touchState(page);
  const shots = [
    ['a full-page screenshot', () => screenshotKeepingTouch(page, { fullPage: true })],
    ['a screenshot of an element taller than the viewport', () => screenshotKeepingTouch(page.locator('#tall'), {})],
    ['a screenshot that fits the viewport', () => screenshotKeepingTouch(page, {})],
    ['a second full-page screenshot, after the first', () => screenshotKeepingTouch(page, { fullPage: true })],
  ];
  for (const [what, take] of shots) {
    const png = await take();
    check(Buffer.isBuffer(png) && png.length > 1000, `${device.name}: ${what} is taken`, `${png?.length} bytes`);
    check(same(before, await touchState(page)), `${device.name}: ${what} leaves the page answering as before`, { before, after: await touchState(page) });
  }

  if (device.touch) {
    // A tap is a touch: the page sees touchstart and a touch pointer, and the media still say so.
    await page.evaluate(() => {
      window.__seen = [];
      document.querySelector('#target').addEventListener('pointerdown', (event) => window.__seen.push(`pointerdown:${event.pointerType}`));
      document.querySelector('#target').addEventListener('touchstart', () => window.__seen.push('touchstart'));
    });
    await page.tap('#target');
    const seen = await page.evaluate(() => window.__seen);
    check(seen.includes('pointerdown:touch') && seen.includes('touchstart'), `${device.name}: a tap after the screenshots reaches the page as a touch`, seen);
    const media = await page.evaluate(() => ({ pointer: window.matchMedia('(pointer: coarse)').matches, hover: window.matchMedia('(hover: none)').matches }));
    check(media.pointer && media.hover, `${device.name}: and it still reads as coarse, hover-less`, media);
  } else {
    // 3. The helper never gives a laptop a touch screen.
    const state = await touchState(page);
    check(!state.coarse && !state.hoverNone && state.points === 0, `${device.name}: stays a mouse device`, state);
  }
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s):\n- ${failures.join('\n- ')}` : '\nall touch-after-screenshot checks passed');
process.exit(failures.length ? 1 : 0);

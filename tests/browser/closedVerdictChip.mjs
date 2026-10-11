// THE CLOSED QUESTION'S VERDICT CHIP COVERS NOTHING (release-candidate QA m7).
//
//   npx vite --host 127.0.0.1 --port 5542 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5542 node tests/browser/closedVerdictChip.mjs
//
// Reuses the feedbackTeaches harness (the real QuestionEngine, a multi-part
// "Complete Each Part" question). At 1366x768 and 390x844, through rendered
// controls only:
//
//   practice  while attempts remain there is no verdict chip; the third miss
//             closes the question and shows "Incorrect — review below" as a
//             role="status" chip whose rectangle intersects no visible button
//             (the "⤢ Enlarge question" opener among them) and no heading
//             ("Complete Each Part" among them).
//   dol       a submitted DOL item never shows the chip (no outcome feedback).
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/closedVerdictChip.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5542';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/closedVerdictChip');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const DEVICES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

let run = 0;
const open = async (device, query) => {
  run += 1;
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=verdict-${Date.now()}-${run}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(700);
  return { page, context };
};
const answer = async (page, value) => {
  const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
  await field.waitFor();
  await field.evaluate((element, next) => {
    element.setValue(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForTimeout(250);
};
const submit = async (page) => {
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForTimeout(500);
};
const chip = (page) => page.locator('[role="status"]').filter({ hasText: /^(Incorrect|Almost)( — review below)?$/ });

// Every visible button and heading whose rectangle meets the chip's.
//
// Two layers. A control inside the same scroller as the chip shares its layout,
// so their raw rectangles must not meet at any scroll position. A control
// outside it (a phone's portrait action bar: Undo, Reset, Scratchpad) is a
// different layer: what matters is what the student can see, so both
// rectangles are first clipped by every ancestor that clips its overflow.
const collisions = (page) => chip(page).first().evaluate((element) => {
  const clips = (node) => {
    const out = [];
    for (let el = node.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      if (getComputedStyle(el).overflowY !== 'visible' || getComputedStyle(el).overflowX !== 'visible') out.push(el);
    }
    return out;
  };
  const visible = (node) => {
    let r = node.getBoundingClientRect();
    r = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (const clip of clips(node)) {
      const c = clip.getBoundingClientRect();
      r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    }
    return r;
  };
  const meets = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  const scroller = clips(element)[0] || document.body;
  const raw = element.getBoundingClientRect();
  const seen = visible(element);
  const hits = [];
  for (const other of document.querySelectorAll('button, h1, h2, h3, h4, h5, h6, [role="heading"], [role="button"]')) {
    if (other === element || element.contains(other) || other.contains(element)) continue;
    const style = getComputedStyle(other);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const b = other.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const sameLayer = scroller.contains(other);
    if (sameLayer ? meets(raw, b) : meets(seen, visible(other))) {
      hits.push(`${other.tagName.toLowerCase()} "${(other.textContent || '').trim().slice(0, 40)}"${sameLayer ? '' : ' (as seen)'}`);
    }
  }
  return hits;
});

for (const device of DEVICES) {
  {
    const { page, context } = await open(device, 'q=multi&role=practice');
    const heading = page.locator('.mathmaster-multipart-heading');
    check(await heading.isVisible() && /Complete Each Part/.test(await heading.textContent()), `${device.name}: the multi-part heading is shown`);
    const opener = page.getByRole('button', { name: /Enlarge question/ });
    check(await opener.isVisible(), `${device.name}: the Enlarge question opener is shown`);

    await answer(page, '-\\frac{3}{4}');
    await submit(page);
    check(await chip(page).count() === 0, `${device.name}: no verdict chip while attempts remain (1 miss)`);
    await answer(page, '5');
    await submit(page);
    check(await chip(page).count() === 0, `${device.name}: no verdict chip while attempts remain (2 misses)`);
    await answer(page, '2');
    await submit(page);

    const verdict = chip(page);
    check(await verdict.count() === 1 && await verdict.isVisible(), `${device.name}: the closed question shows its verdict chip`);
    check((await verdict.textContent()).trim() === 'Incorrect — review below', `${device.name}: worded "Incorrect — review below"`, (await verdict.textContent()).trim());
    check(await verdict.getAttribute('aria-label') === 'Incorrect', `${device.name}: still labelled for a screen reader`);
    // Centred in its scroller: the phone's sticky work bar (Undo, Reset,
    // Scratchpad) floats over whatever scrolls beneath it, chip or heading
    // alike — that is scrolling, not the chip's placement.
    await verdict.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
    const hits = await collisions(page);
    check(hits.length === 0, `${device.name}: the chip intersects no button and no heading`, hits.join('; '));
    // The two named in the QA report, measured directly as well.
    const box = await verdict.boundingBox();
    for (const [name, other] of [['Enlarge question', opener], ['Complete Each Part', heading]]) {
      const b = await other.boundingBox();
      const overlap = Boolean(box && b)
        && Math.min(box.x + box.width, b.x + b.width) - Math.max(box.x, b.x) > 0.5
        && Math.min(box.y + box.height, b.y + b.height) - Math.max(box.y, b.y) > 0.5;
      check(!overlap, `${device.name}: clear of "${name}"`, JSON.stringify({ chip: box, other: b }));
    }
    check(box && box.x >= 0 && box.x + box.width <= device.viewport.width + 1, `${device.name}: the chip fits the screen width`, JSON.stringify(box));
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-closed.png`), fullPage: false });
    await context.close();
  }
  {
    const { page, context } = await open(device, 'q=multi&role=dol');
    await answer(page, '-\\frac{3}{4}');
    await submit(page);
    check(await chip(page).count() === 0, `${device.name} dol: no verdict chip on a submitted DOL item`);
    await context.close();
  }
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);

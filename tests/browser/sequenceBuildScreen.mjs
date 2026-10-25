// THE "BUILD THE SEQUENCE MODEL" SCREEN: EVERY TERM'S BOX IS ON THE SCREEN.
//
//   node_modules/.bin/vite --host 127.0.0.1 --port 6020 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:6020 node tests/browser/sequenceBuildScreen.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// TL40 (finding D-52): at 1366 the sixth output box of the DOL #3 Review's
// question 13 table was cut off at its panel's right edge. The table is a row of
// one box per term; it sat in half the page whatever its width, so six terms
// (573px) were behind the edge of a 474px column and the last two boxes needed a
// sideways scroll nobody is told about. Measured here for 3 to 8 terms (the
// screen's range), under practice and under a DOL, at 1366x768: no box is behind
// the column's edge and the table needs no sideways scroll (the columns stack
// when the table is wider than half the page), and a value of five characters
// ("-12.5") fits in its box. At 390x844 a table of six boxes is wider than the
// screen, so there it scrolls — and every box must still be reachable:
// focusing one brings it fully on the screen.
//
// Driven only through rendered controls, in the real QuestionEngine
// (sequenceBuildScreenMain.jsx). Exits non-zero on failure.

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
let total = 0;
const check = (ok, label, detail = '') => {
  total += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const stamp = Date.now();
let pageCount = 0;
const SCREENS = [
  { name: '1366x768', viewport: { width: 1366, height: 768 }, touch: false },
  { name: '390x844', viewport: { width: 390, height: 844 }, touch: true },
];
const BOXES = 'input[aria-label^="Sequence output"]';

const open = async (context, label, role, extra = {}) => {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => check(false, `${label}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/sequenceBuildScreen.html?role=${role}&run=${stamp}-${(pageCount += 1)}&extra=${encodeURIComponent(JSON.stringify(extra))}`, { waitUntil: 'networkidle' });
  await page.locator(BOXES).first().waitFor();
  await page.waitForTimeout(500);
  return page;
};

// Where the table's boxes are, against the edge of the column they sit in.
const tableFit = (page) => page.evaluate((boxSelector) => {
  const inputs = [...document.querySelectorAll(boxSelector)];
  const table = inputs[0].closest('table');
  const wrapper = table.parentElement;
  const panel = wrapper.closest('.mathmaster-tool-panel');
  const wrapperRect = wrapper.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const neighbour = [...panel.parentElement.children].find((child) => child !== panel);
  const boxes = inputs.map((input) => { const rect = input.getBoundingClientRect(); return { name: input.getAttribute('aria-label').replace('Sequence output ', ''), left: rect.left, right: rect.right }; });
  return {
    boxes: inputs.length,
    scrolls: wrapper.scrollWidth > wrapper.clientWidth + 1,
    column: Math.round(wrapperRect.width),
    table: Math.round(table.getBoundingClientRect().width),
    besideTheAnalysis: neighbour ? Math.abs(neighbour.getBoundingClientRect().top - panelRect.top) < 4 : false,
    behindTheEdge: boxes.filter((box) => box.left < wrapperRect.left - 0.5 || box.right > wrapperRect.right + 0.5).map((box) => box.name),
  };
}, BOXES);

// Whether a box is wholly on the screen, and inside the column that scrolls it.
const onScreen = (page, index) => page.evaluate(([boxSelector, at]) => {
  const input = document.querySelectorAll(boxSelector)[at];
  const wrapper = input.closest('table').parentElement.getBoundingClientRect();
  const rect = input.getBoundingClientRect();
  return rect.left >= wrapper.left - 0.5 && rect.right <= wrapper.right + 0.5 && rect.left >= 0 && rect.right <= window.innerWidth;
}, [BOXES, index]);

/* ------------------------------------------- TL40: every box on the screen */

for (const screen of SCREENS) {
  const context = await browser.newContext({ viewport: screen.viewport, hasTouch: screen.touch, isMobile: screen.touch });
  const desktop = !screen.touch;
  for (const role of ['practice', 'dol']) {
    for (const count of desktop ? [3, 4, 5, 6, 7, 8] : [3, 6, 8]) {
      const label = `${count} terms (${screen.name}, ${role})`;
      const page = await open(context, label, role, { displayCount: count });
      const fit = await tableFit(page);
      check(fit.boxes === count, `${label}: a box for every term`, `${fit.boxes}`);
      if (desktop) {
        check(fit.behindTheEdge.length === 0, `${label}: no box is behind the column's edge`, `table ${fit.table}px in a ${fit.column}px column${fit.behindTheEdge.length ? `, past the edge: ${fit.behindTheEdge.join(', ')}` : ''}`);
        check(!fit.scrolls, `${label}: the table needs no sideways scroll`, `table ${fit.table}px in a ${fit.column}px column`);
        // The question this item came from keeps the table beside the analysis.
        if (count === 6) check(fit.besideTheAnalysis, `${label}: the table still sits beside the analysis`);
      } else {
        // A phone's column is one row of the screen: a wide table scrolls there, and each box must still be reachable.
        const unreachable = [];
        for (let index = 0; index < count; index += 1) {
          await page.locator(BOXES).nth(index).focus();
          await page.waitForTimeout(80);
          if (!(await onScreen(page, index))) unreachable.push(`a${index + 1}`);
        }
        check(unreachable.length === 0, `${label}: every box can be brought on to the screen`, unreachable.join(', '));
      }
      // The longest value a term takes, typed, fits in its box without the text scrolling.
      const first = page.locator(BOXES).first();
      await first.fill('-12.5');
      const fits = await first.evaluate((input) => input.scrollWidth <= input.clientWidth);
      check(fits, `${label}: "-12.5" fits in its box`);
      await page.close();
    }
  }
  await context.close();
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} of ${total} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} checks passed: every term's box is on the screen of the Build the Sequence Model table.`);

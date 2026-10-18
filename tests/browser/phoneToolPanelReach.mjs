// ON A PHONE, A STUDENT CAN REACH EVERY CONTROL OF A GRAPH TOOL BY TOUCH.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/phoneToolPanelReach.mjs
//
// Oct 15, 2026 (docs/qa/algebra1-m2t2-student-walkthrough.md, P0-1): on a
// 390x844 phone, "Check construction" on every Graphing item could not be
// tapped. MathToolMobileLayout.css pinned the graph panel (sticky, 46dvh =
// 388px) inside a workspace that is itself only ~346px tall in portrait, so
// the pinned graph covered the whole workspace at every scroll position and
// the panel after it — the student's construction and its Check button — was
// never on top.
//
// In the real QuestionEngine (the Algebra I M2 T2 harness), at phone sizes by
// touch: plot each Graphing item's line by tapping the grid, bring Check into
// view the way a browser does, require that nothing covers it, tap it, and
// require that the item was graded. The Transformations Lab, whose Check sits
// in the graph panel, is the control case. Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

// Graph coordinates to screen, from the plane's own axis labels.
const gridPoint = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = [...document.querySelectorAll('svg[role=application]')].find((s) => s.getBoundingClientRect().width > 100);
  const labels = [...svg.querySelectorAll('text')].filter((t) => /^-?\d+(\.\d+)?$/.test(t.textContent.trim()));
  const axis = (anchor) => labels.filter((t) => t.getAttribute('text-anchor') === anchor)
    .map((t) => [Number(t.textContent), Number(t.getAttribute(anchor === 'middle' ? 'x' : 'y'))])
    .sort((a, b) => a[0] - b[0]);
  const fit = (pairs) => {
    const [first, last] = [pairs[0], pairs[pairs.length - 1]];
    const k = (last[1] - first[1]) / (last[0] - first[0]);
    return (value) => first[1] + k * (value - first[0]);
  };
  const point = svg.createSVGPoint();
  point.x = fit(axis('middle'))(x);
  point.y = fit(axis('end'))(y) - 4;
  const screen = point.matrixTransform(svg.getScreenCTM());
  return [screen.x, screen.y];
}, [x, y]);

// Scroll a control into view as the browser would, then report what a tap at
// its centre would land on.
// The tool's final action spends a try, so it reads "Submit — uses 1 of 3
// tries" (student pass 3, D9) where it once read "Check construction" or
// "Check graph": it is found by that, among the buttons a student can see.
const reach = (page, label) => page.evaluate((label) => {
  const shown = (b) => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden';
  const button = [...document.querySelectorAll('button')].find((b) => shown(b) && /^Submit — /.test(b.innerText.trim()))
    || [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === label);
  if (!button) return { found: false };
  button.scrollIntoView({ block: 'center' });
  const r = button.getBoundingClientRect();
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  const onTop = hit === button || button.contains(hit);
  const describe = (el) => (el ? `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0]}` : 'nothing');
  return { found: true, onTop, x, y, hit: describe(hit) };
}, label);

const ITEMS = [
  // Graphing (graphing2): Check is in the panel AFTER the graph.
  { lesson: 'l2', id: 'l2-wu-1', points: [[0, -8], [1, -5]], action: 'Check construction', tool: 'Graphing, slope-intercept' },
  { lesson: 'l3', id: 'l3-cw-8', points: [[-3, -2], [4, -2]], action: 'Check construction', tool: 'Graphing, horizontal line' },
  { lesson: 'l3', id: 'l3-pr-6', points: [[-2, 4], [2, 2]], action: 'Check construction', tool: 'Graphing, point-slope' },
  // Transformations Lab: Check is in the graph panel itself (the control case).
  { lesson: 'l2', id: 'l2-pr-1', points: [[5, -2], [7, 0], [9, 2]], action: 'Check graph', tool: 'Transformations Lab' },
];

const VIEWPORTS = [
  { name: 'phone 390x844', viewport: { width: 390, height: 844 } },
  { name: 'small phone 360x640', viewport: { width: 360, height: 640 } },
];

for (const { name, viewport } of VIEWPORTS) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  for (const lesson of ['l2', 'l3']) {
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
    await page.goto(`${ORIGIN}/tests/browser/algebra1Module2Topic2.html?lesson=${lesson}&run=phone-reach-${lesson}-${Date.now()}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__m2t2?.go === 'function', null, { timeout: 60_000 });
    for (const item of ITEMS.filter((entry) => entry.lesson === lesson)) {
      await page.evaluate((id) => window.__m2t2.go(id), item.id);
      await page.waitForTimeout(600);
      for (const [x, y] of item.points) {
        await page.locator('svg[role=application]').first().scrollIntoViewIfNeeded();
        const [px, py] = await gridPoint(page, x, y);
        await page.touchscreen.tap(px, py);
        await page.waitForTimeout(150);
      }
      const before = await page.evaluate((id) => window.__m2t2.grades().filter((g) => g.questionId === id).length, item.id);
      const target = await reach(page, item.action);
      check(target.found && target.onTop, `${name} ${item.id} (${item.tool}): "${item.action}" is on top once in view`,
        target.found ? `a tap there lands on ${target.hit}` : 'button not found');
      if (target.found) {
        await page.touchscreen.tap(target.x, target.y);
        await page.waitForTimeout(700);
      }
      const graded = await page.evaluate(([id, before]) => {
        const grades = window.__m2t2.grades().filter((g) => g.questionId === id);
        return grades.length > before ? grades[grades.length - 1] : null;
      }, [item.id, before]);
      check(Boolean(graded?.isCorrect), `${name} ${item.id}: tapping "${item.action}" grades the line drawn by touch`,
        graded ? `isCorrect=${graded.isCorrect}` : 'no grade recorded');
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log('\nEvery control was reachable by touch.');

// GRAPHS SPEAK: A SCREEN READER CAN TELL TWO GRAPHS APART (WCAG 2.1 1.1.1).
//
//   npx vite --host 127.0.0.1 --port 5399 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5399 CHROMIUM_PATH=/opt/pw-browsers/chromium \
//     node tests/browser/graphDescription.mjs
//
// A read-only plane used to be announced as "Coordinate plane" and nothing
// else. Checks, from Chrome's own accessibility tree (CDP getPartialAXTree),
// at 1366×768 and 390×844:
//   - two different read-only graphs keep their short names and get different
//     computed accessible descriptions, read from their data;
//   - the description text is visually hidden;
//   - "Show data table" is a real disclosure reached by Tab and worked by
//     Enter and Space, revealing a captioned table with column headers;
//   - a plane inside a card button renders no nested button;
//   - the interactive plane describes what the student has plotted, and the
//     description follows a keyboard plot;
//   - no horizontal page scroll on the phone.
// Exits non-zero on any failure. Data in graphDescriptionMain.jsx is synthetic.

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5399';
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

// Name, role and description exactly as Chrome computes them for AT.
const axOf = async (cdp, selector) => {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const node = nodes[0] || {};
  return { role: node.role?.value, name: node.name?.value || '', description: node.description?.value || '' };
};

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const tag = `${viewport.width}×${viewport.height}`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => failures.push(`${tag}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/graphDescription.html`, { waitUntil: 'networkidle' });
  await page.locator('[data-graph="d"] svg[role="application"]').waitFor();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Accessibility.enable');

  const a = await axOf(cdp, '[data-graph="a"] svg[role="img"]');
  const b = await axOf(cdp, '[data-graph="b"] svg[role="img"]');
  console.log(`  [${tag}] Graph A: role=${a?.role} name="${a?.name}"\n    description: ${a?.description}`);
  console.log(`  [${tag}] Graph B: role=${b?.role} name="${b?.name}"\n    description: ${b?.description}`);
  check(a?.role === 'image' && a.name === 'Graph A', `${tag} graph A keeps its short name`, `${a?.role} "${a?.name}"`);
  check(b?.role === 'image' && b.name === 'Graph B', `${tag} graph B keeps its short name`, `${b?.role} "${b?.name}"`);
  check(/Line 1 rises from left to right, crosses the y-axis at 2/.test(a?.description) && /A at \(3, −2\)/.test(a?.description),
    `${tag} graph A is described from its line and point`);
  check(/has a low point at \(0, −4\)/.test(b?.description) && /Dashed vertical line through 3 on the x-axis/.test(b?.description),
    `${tag} graph B is described from its curve and guide`);
  check(Boolean(a?.description) && a.description !== b?.description, `${tag} the two graphs announce differently`);
  check(!/slope|y\s*=/i.test(`${a?.description} ${b?.description}`), `${tag} no equation or slope is spoken`);

  const snapshotCollapsed = await page.locator('[data-graph="a"]').ariaSnapshot();
  const hiddenBox =await page.locator('[data-graph="a"] p.mm-sr-only').first().boundingBox();
  check(Boolean(hiddenBox) && hiddenBox.width <= 1 && hiddenBox.height <= 1, `${tag} the description paragraph is visually hidden`, JSON.stringify(hiddenBox));

  // The disclosure, by keyboard only: Tab until it has focus.
  const toggle = page.locator('[data-graph="a"] button', { hasText: 'Show data table' });
  check(await toggle.count() === 1, `${tag} graph A offers a data table`);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  let reached = false;
  for (let i = 0; i < 25 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await toggle.evaluate((el) => el === document.activeElement);
  }
  check(reached, `${tag} the data-table toggle is reached with Tab`);
  check(await toggle.getAttribute('aria-expanded') === 'false', `${tag} the toggle starts collapsed`);
  await page.keyboard.press('Enter');
  const shown = page.locator('[data-graph="a"] button[aria-expanded="true"]');
  check(await shown.count() === 1, `${tag} Enter expands the table`);
  const table = page.locator('[data-graph="a"] table').first();
  check(await table.isVisible(), `${tag} the table is visible`);
  const caption = await table.locator('caption').textContent();
  const headers = await table.locator('th[scope="col"]').allTextContents();
  check(caption === 'Graph A: points' && headers.join('|') === 'Point|x|y', `${tag} captioned table with column headers`, `${caption} / ${headers.join('|')}`);
  const lineTable = page.locator('[data-graph="a"] table').nth(1);
  const rowZero = await lineTable.locator('tr', { has: page.locator('th[scope="row"]', { hasText: /^0$/ }) }).allTextContents();
  check(rowZero[0]?.replace(/\s+/g, '') === '02', `${tag} the line table reads y = value at each labelled x`, JSON.stringify(rowZero));
  const snapshot = await page.locator('[data-graph="a"]').ariaSnapshot();
  console.log(`  [${tag}] aria snapshot of Graph A (expanded):\n${snapshot.split('\n').slice(0, 14).map((l) => `    ${l}`).join('\n')}`);
  const scrollWidth = await page.evaluate(() => document.scrollingElement.scrollWidth);
  check(scrollWidth <= viewport.width, `${tag} no horizontal page scroll with the table open`, `scrollWidth ${scrollWidth}`);
  await page.keyboard.press(' ');
  check(await page.locator('[data-graph="a"] button[aria-expanded="false"]', { hasText: 'Show data table' }).count() === 1
    && !(await page.locator('[data-graph="a"] table').first().isVisible().catch(() => false)), `${tag} Space collapses it again`);

  // Inside a control: described, but no nested button.
  const c = await axOf(cdp, '[data-graph="c"] svg[role="img"]');
  check(/Line 1 falls from left to right/.test(c?.description || ''), `${tag} a graph inside a card button is still described`);
  check(await page.locator('[data-graph="c"] button button').count() === 0, `${tag} no button is nested inside the card button`);
  const card = await axOf(cdp, '[data-graph="c"] > button');
  check(/Graph C/.test(card?.name || '') && /Line 1 falls/.test(card?.name || ''), `${tag} the card button's name carries its graph's description`, card?.name);
  check(!/paragraph:/.test(snapshotCollapsed), `${tag} browse mode does not read the description a second time as a paragraph`);

  // The interactive plane: what the student has plotted, after each plot.
  const plane = page.locator('[data-graph="d"] svg[role="application"]');
  const before = await axOf(cdp, '[data-graph="d"] svg[role="application"]');
  check(/Click to plot/.test(before?.name || '') && /Nothing is plotted yet\./.test(before?.description || ''),
    `${tag} the interactive plane keeps its instructions and says nothing is plotted`, before?.description);
  await plane.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  const after = await axOf(cdp, '[data-graph="d"] svg[role="application"]');
  console.log(`  [${tag}] Plot here after two keyboard plots: ${after?.description}`);
  check(/2 points: \(0, 0\); \(2, 1\)\./.test(after?.description || ''), `${tag} the interactive plane describes what was plotted`, after?.description);
  check(await page.locator('[data-graph="d"] button', { hasText: 'Show data table' }).count() === 0, `${tag} the interactive plane has no data-table toggle`);

  await context.close();
}

await browser.close();
console.log(`\n${total - failures.length}/${total} checks passed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

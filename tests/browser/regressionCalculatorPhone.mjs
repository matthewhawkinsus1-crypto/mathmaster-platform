// Real 390px acceptance flow for Issue #202. Run with Vite on port 5199.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await page.goto('http://localhost:5199/tests/browser/captureToolResponses.html?tool=regressionCalculator', { waitUntil: 'networkidle' });

const sourceGraph = page.locator('[data-regression-source-graph]');
if (await sourceGraph.count() !== 1) throw new Error('Scatterplot source mode did not render its source graph');
if (await sourceGraph.locator('circle').count() !== 4) throw new Error('Source scatterplot did not render all canonical points');
await sourceGraph.locator('circle').first().hover({ force: true });
if (await sourceGraph.getByText('(1, 2)', { exact: true }).count()) throw new Error('Source point coordinates were revealed on hover');
if (await page.locator('.source-data').count()) throw new Error('Scatterplot source mode leaked the numeric source-data list');

// Blank settings must not reveal conversion. An ordered pair unlocks it, but
// entering every point as a separate expression still never runs regression.
await page.getByRole('button', { name: 'Settings and edit' }).click();
if (await page.getByRole('menuitem', { name: /Convert ordered pair/ }).count()) throw new Error('Blank expression offered table conversion');
await page.getByRole('button', { name: 'Done editing' }).click();
await page.getByLabel('Expression 1').fill('(1,2)');
for (const value of ['(2,4)', '(3,5)', '(4,8)']) {
  await page.getByRole('button', { name: 'Add expression' }).click();
  await page.locator('.regression-expression-row input').last().fill(value);
}
if (await page.locator('[data-regression-graph] circle').count() !== 4) throw new Error('Ordered-pair expressions did not plot');
if (await page.getByRole('button', { name: 'Evaluate regression expression' }).count()) throw new Error('Plotted expressions incorrectly unlocked regression');
await page.getByLabel('Expression 1').click();
await page.getByRole('button', { name: 'Settings and edit' }).click();
await page.getByRole('menuitem', { name: 'Convert ordered pair to table' }).click();
const cells = page.locator('.regression-table input');
if (await cells.nth(0).inputValue() !== '1' || await cells.nth(1).inputValue() !== '2') throw new Error('Conversion did not preserve row 1');
if (await page.getByRole('button', { name: 'Add Regression' }).count()) throw new Error('Add Regression appeared before two complete points existed');
const values = ['2', '4', '3', '5', '4', '8'];
for (let index = 0; index < values.length; index += 1) {
  const cellIndex = index + 2;
  await cells.nth(cellIndex).fill(values[index]);
  if (index === 1) {
    await page.getByRole('button', { name: 'Add Regression' }).waitFor();
  }
  if (index < values.length - 1) {
    await cells.nth(cellIndex).press('Enter');
    if (!(await cells.nth(cellIndex + 1).evaluate((node) => node === document.activeElement))) throw new Error(`Enter did not navigate from cell ${cellIndex + 1}`);
  }
}
if (await page.locator('[data-regression-graph] circle').count() !== 4) throw new Error('Live scatterplot did not draw all entered pairs');
await page.getByRole('button', { name: 'Add Regression' }).click();
await page.getByText(/m = 1\.9000/).waitFor();
await page.getByText(/b = 0\.0000/).waitFor();
await page.getByText(/r = 0\.9812/).waitFor();
if (await page.locator('[data-regression-graph] line[stroke="#1a73e8"]').count() !== 1) throw new Error('Fitted line is not visible');
await page.getByLabel('Direction').selectOption('positive');
await page.getByLabel('Strength').selectOption('strong');
await page.getByRole('button', { name: 'Submit workflow' }).click();
// This harness intentionally runs QuestionEngine in server-grading mode.
// Local tool feedback is suppressed there, so a correct submission is proven
// by the real wire payload reaching the server-grading adapter rather than by
// waiting for the tool's standalone "Workflow complete." message.
await page.waitForFunction(() => window.__mmCaptured?.rawWork?.regressionRun?.operation === 'linearRegression');
const captured = await page.evaluate(() => window.__mmCaptured);
if (!captured?.rawWork || captured.rawWork.table?.length !== 4) throw new Error('Regression workflow did not submit its table and run evidence');
if (Math.abs(Number(captured.rawWork.regressionRun?.r) - 0.9811557810392123) > 1e-9) throw new Error('Submitted regression evidence carried the wrong r value');
const overflowReport = await page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const offenders = [...document.querySelectorAll('body *')]
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        tag: node.tagName,
        className: typeof node.className === 'string' ? node.className : '',
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        scrollWidth: node.scrollWidth,
      };
    })
    .filter((item) => item.width > 0 && (item.left < -1 || item.right > viewport + 1))
    .slice(0, 12);
  return {
    viewport,
    documentScrollWidth: document.documentElement.scrollWidth,
    offenders,
  };
});
if (overflowReport.documentScrollWidth > overflowReport.viewport + 1) {
  throw new Error(`390px workflow has horizontal overflow: ${JSON.stringify(overflowReport)}`);
}
for (const label of ['Undo', 'Scratchpad', 'Calculator', 'Submit']) {
  const count = await page.getByRole('button', { name: new RegExp(label, 'i') }).evaluateAll((nodes) => nodes.filter((node) => { const r=node.getBoundingClientRect(); return r.width && r.height; }).length);
  if (count > 1) throw new Error(`Duplicate ${label} controls are visible`);
}
await page.screenshot({ path: 'tests/browser/artifacts/regression-calculator-390.png', fullPage: true });

// Chromebook acceptance: the same workflow is presented as an editor/graph
// split rather than the phone's vertical calculator.
const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await desktop.goto('http://localhost:5199/tests/browser/captureToolResponses.html?tool=regressionCalculator', { waitUntil: 'networkidle' });
const layout = await desktop.locator('.regression-calculator').evaluate((node) => ({ display:getComputedStyle(node).display, columns:getComputedStyle(node).gridTemplateColumns }));
if (layout.display !== 'grid' || layout.columns.split(' ').length < 2) throw new Error(`Desktop calculator is not split-pane: ${JSON.stringify(layout)}`);
await desktop.getByLabel('Expression 1').fill('(1,2)');
await desktop.getByRole('button', { name: 'Settings and edit' }).click();
await desktop.getByRole('menuitem', { name: 'Convert ordered pair to table' }).click();
const desktopCells = desktop.locator('.regression-table input');
for (let index = 0; index < values.length; index += 1) await desktopCells.nth(index + 2).fill(values[index]);
await desktop.getByRole('button', { name: 'Add Regression' }).click();
await desktop.getByText(/R² = 0\.9627/).waitFor();
await browser.close();
console.log('regressionCalculatorPhone: 390px and Chromebook workflows passed');

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

const cells = page.locator('.regression-table input');
const values = ['1', '2', '2', '4', '3', '5', '4', '8'];
for (let index = 0; index < values.length; index += 1) {
  await cells.nth(index).fill(values[index]);
  if (index < values.length - 1) {
    await cells.nth(index).press('Enter');
    if (!(await cells.nth(index + 1).evaluate((node) => node === document.activeElement))) throw new Error(`Enter did not navigate from cell ${index + 1}`);
  }
}
if (await page.locator('[data-regression-graph] circle').count() !== 4) throw new Error('Live scatterplot did not draw all entered pairs');
await page.getByLabel('Calculation').selectOption('linearRegression');
await page.getByRole('button', { name: 'Run regression' }).click();
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
await browser.close();
console.log('regressionCalculatorPhone: 390px workflow passed');

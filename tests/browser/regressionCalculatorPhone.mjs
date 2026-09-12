// Real 390px acceptance flow for Issue #202. Run with Vite on port 5199.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await page.goto('http://localhost:5199/tests/browser/captureToolResponses.html?tool=regressionCalculator', { waitUntil: 'networkidle' });
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
await page.getByText('Workflow complete.').waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
if (overflow) throw new Error('390px workflow has horizontal overflow');
for (const label of ['Undo', 'Scratchpad', 'Calculator', 'Submit']) {
  const count = await page.getByRole('button', { name: new RegExp(label, 'i') }).evaluateAll((nodes) => nodes.filter((node) => { const r=node.getBoundingClientRect(); return r.width && r.height; }).length);
  if (count > 1) throw new Error(`Duplicate ${label} controls are visible`);
}
await page.screenshot({ path: 'tests/browser/artifacts/regression-calculator-390.png', fullPage: true });
await browser.close();
console.log('regressionCalculatorPhone: 390px workflow passed');

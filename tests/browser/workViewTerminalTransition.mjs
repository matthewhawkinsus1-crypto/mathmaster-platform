const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const browser = await chromium.launch();

const openWorkView = async (page) => {
  const host = page.locator('.mathmaster-work-view-host').first();
  if (await host.getAttribute('data-open') === 'true') return;
  const open = page.getByRole('button', { name: /Open Work View/i }).first();
  await open.waitFor({ state: 'visible' });
  await open.click();
  await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor();
};

const assertCleanClose = async (page) => {
  await page.locator('.mathmaster-work-view-host[data-open="false"]').first().waitFor();
  const state = await page.evaluate(() => ({
    flag: document.documentElement.dataset.workViewOpen,
    overflow: document.documentElement.style.overflow,
    actions: document.documentElement.style.getPropertyValue('--mm-work-view-actions'),
    activeInWorkView: Boolean(document.activeElement?.closest?.('.mathmaster-work-view-host')),
  }));
  if (state.flag || state.overflow === 'hidden' || state.actions || state.activeInWorkView) throw new Error(`terminal cleanup failed: ${JSON.stringify(state)}`);
};

for (const viewport of [{ name: 'chromebook', width: 1366, height: 768 }, { name: 'phone', width: 390, height: 844 }]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.name === 'phone',
    isMobile: viewport.name === 'phone',
  });
  const page = await context.newPage();
  await page.goto(`${origin}/tests/browser/workViewTerminalTransition.html`, { waitUntil: 'networkidle' });

  await openWorkView(page);
  const input = page.locator('.mathmaster-work-view-host[data-open="true"] input:visible').first();
  if (await input.count()) await input.focus();
  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'correct' })));
  await assertCleanClose(page);
  const next = page.getByRole('button', { name: /Next Question/i });
  const box = await next.boundingBox();
  if (!box || box.width < 44 || box.height < 44) throw new Error(`${viewport.name}: Next Question is not tappable`);
  await next.click();
  await page.locator('[data-terminal-question="2"]').waitFor();

  await openWorkView(page);
  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'attempted' })));
  await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor();

  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'expired' })));
  await assertCleanClose(page);
  await page.getByText(/response is closed after/i).waitFor();

  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, index: 3, status: 'unattempted', assignmentLocked: false })));
  await openWorkView(page);
  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, assignmentLocked: true })));
  await assertCleanClose(page);
  await page.getByText('This assignment is closed.').waitFor();

  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, index: 4, status: 'unattempted', assignmentLocked: false, sectionComplete: false })));
  await openWorkView(page);
  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'correct', sectionComplete: true })));
  await assertCleanClose(page);
  const continuation = page.getByRole('button', { name: /Continue to Review/i });
  await continuation.click();
  await page.locator('[data-terminal-question="5"]').waitFor();
  await context.close();
}

await browser.close();
console.log('Work View terminal transition passed on Chromebook and 390px phone.');

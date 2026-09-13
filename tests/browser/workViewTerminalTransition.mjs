const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const browser = await chromium.launch();

const openWorkView = async (page) => {
  if (await page.locator('.mathmaster-work-view-host[data-open="true"]').count()) return;
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => {
      if (!/Open Work View/i.test(button.textContent || '') || button.disabled) return false;
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }), null, { timeout: 6000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      question: document.querySelector('[data-terminal-question]')?.getAttribute('data-terminal-question'),
      hosts: [...document.querySelectorAll('.mathmaster-work-view-host')].map((host) => ({
        open: host.getAttribute('data-open'),
        text: host.textContent?.slice(0, 160),
      })),
      buttons: [...document.querySelectorAll('button')].map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          text: button.textContent?.trim(),
          disabled: button.disabled,
          width: rect.width,
          height: rect.height,
          display: getComputedStyle(button).display,
          visibility: getComputedStyle(button).visibility,
        };
      }).filter((button) => /Work View|Next Question|Continue/i.test(button.text || '')),
    }));
    throw new Error(`No enabled Work View opener was available: ${JSON.stringify(diagnostics)}; ${error.message}`);
  }
  // This regression is about terminal lifecycle, not pointer hit-testing (the
  // Stage 4 device matrix already certifies the opener). Dispatch to the
  // currently visible/enabled opener so a stale hidden question instance can
  // never be selected by locator ordering during the React transition.
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      if (!/Open Work View/i.test(candidate.textContent || '') || candidate.disabled) return false;
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    button?.click();
    return Boolean(button);
  });
  if (!opened) throw new Error('No enabled Work View opener was available after the question transition');
  await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor();
};

const assertCleanClose = async (page) => {
  await page.waitForFunction(() => document.querySelectorAll('.mathmaster-work-view-host[data-open="true"]').length === 0);
  const state = await page.evaluate(() => ({
    flag: document.documentElement.dataset.workViewOpen,
    overflow: document.documentElement.style.overflow,
    actions: document.documentElement.style.getPropertyValue('--mm-work-view-actions'),
    activeInWorkView: Boolean(document.activeElement?.closest?.('.mathmaster-work-view-host')),
  }));
  if (state.flag || state.overflow === 'hidden' || state.actions || state.activeInWorkView) throw new Error(`terminal cleanup failed: ${JSON.stringify(state)}`);
};

const assertTappableContinuation = async (page, viewportName) => {
  const continuation = page.getByRole('button', { name: /Next Question|Continue/i }).first();
  await continuation.waitFor({ state: 'visible' });
  const box = await continuation.boundingBox();
  if (!box || box.width < 44 || box.height < 44) throw new Error(`${viewportName}: continuation is not tappable`);
  return continuation;
};

for (const viewport of [{ name: 'chromebook', width: 1366, height: 768 }, { name: 'phone', width: 390, height: 844 }]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.name === 'phone',
    isMobile: viewport.name === 'phone',
  });
  const page = await context.newPage();
  for (const route of ['simpleRegistry', 'relationAlgebra', 'nestedRegistry']) {
    await page.goto(`${origin}/tests/browser/workViewTerminalTransition.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mmTerminalLifecycleReady === true);
    await page.evaluate((nextRoute) => window.__mmTerminalLifecycle((current) => ({ ...current, route: nextRoute })), route);
    try {
      await page.waitForFunction(
        (expectedRoute) => document.querySelector('[data-terminal-route]')?.getAttribute('data-terminal-route') === expectedRoute,
        route,
        { timeout: 8000 },
      );
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        route: document.querySelector('[data-terminal-route]')?.getAttribute('data-terminal-route') || null,
        question: document.querySelector('[data-terminal-question]')?.getAttribute('data-terminal-question') || null,
        text: document.body?.innerText?.slice(0, 1200) || '',
      }));
      throw new Error(`terminal route did not render: ${JSON.stringify(diagnostics)}; ${error.message}`);
    }

    await openWorkView(page);
    const input = page.locator('.mathmaster-work-view-host[data-open="true"] input:visible').first();
    if (await input.count()) await input.focus();
    await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'correct' })));
    await assertCleanClose(page);
    const next = await assertTappableContinuation(page, `${viewport.name}/${route}/correct`);
    await next.click();
    await page.locator('[data-terminal-question="2"]').waitFor();

    await openWorkView(page);
    await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'attempted' })));
    await page.locator('.mathmaster-work-view-host[data-open="true"]').waitFor();

    await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'expired' })));
    await assertCleanClose(page);
    await page.getByText(/response is closed after/i).waitFor();
    await assertTappableContinuation(page, `${viewport.name}/${route}/expired`);

  // Start the assignment-lock scenario from a fresh QuestionEngine. The
  // expired scenario intentionally leaves terminal feedback mounted; reusing
  // that harness instance would test React transition timing between synthetic
  // scenes rather than the production terminal-close lifecycle.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mmTerminalLifecycleReady === true);
    await page.evaluate((nextRoute) => window.__mmTerminalLifecycle((current) => ({ ...current, route: nextRoute, index: 3, status: 'unattempted', assignmentLocked: false })), route);
    await page.locator('[data-terminal-question="3"]').waitFor();
    await openWorkView(page);
    await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, assignmentLocked: true })));
    await assertCleanClose(page);
    await page.getByText('This assignment is closed.').waitFor();
    await assertTappableContinuation(page, `${viewport.name}/${route}/locked`);
  }

  // Section continuation is certified once per device in addition to the
  // three route families above.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mmTerminalLifecycleReady === true);
  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, index: 4, status: 'unattempted', assignmentLocked: false, sectionComplete: false })));
  await page.locator('[data-terminal-question="4"]').waitFor();
  await openWorkView(page);
  await page.evaluate(() => window.__mmTerminalLifecycle((current) => ({ ...current, status: 'correct', sectionComplete: true })));
  await assertCleanClose(page);
  const continuation = await assertTappableContinuation(page, `${viewport.name}/section-complete`);
  await continuation.click();
  await page.locator('[data-terminal-question="5"]').waitFor();
  await context.close();
}

await browser.close();
console.log('Work View terminal transition passed on Chromebook and 390px phone.');

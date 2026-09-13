const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${origin}/tests/browser/durableOutboxHarness.html`);
  await page.getByText('Durable outbox ready').waitFor();
  await page.evaluate(() => window.outboxHarness.enqueue('browser-reload-action'));
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const recovered = await page.evaluate(() => window.outboxHarness.list());
  if (recovered.length !== 1 || recovered[0].actionId !== 'browser-reload-action') throw new Error('Queued action did not survive browser reload.');
  await page.evaluate(() => window.outboxHarness.drain());
  const remaining = await page.evaluate(() => window.outboxHarness.list());
  if (remaining.length) throw new Error('Durable action remained after successful reconciliation.');
  console.log('Chromebook IndexedDB reload/reconcile certification passed.');
} finally {
  await browser.close();
}

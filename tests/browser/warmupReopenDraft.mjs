// A TIMED WARM-UP CLOSES AND IS REOPENED UNDER A STUDENT'S UNFINISHED WORK.
//
//   npx vite --host 127.0.0.1 --port 5197 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/warmupReopenDraft.mjs [--family] [--slow]
//
// The production incident: lmr-wu-1 (representationMatch / linear.representationSort).
// Partial card sort → no Submit → the Warm-Up timer expires → the teacher
// reopens → the question must mount without an exception, with the student's
// cards where they left them, and take a Submit.
//
// The clock is Playwright's fake clock, so the ten-minute Warm-Up passes in
// milliseconds and the stale timer armed for the original close really is
// still pending when the teacher reopens. `--slow` adds 6× CPU throttling and a
// slow network, the Chromebook this has to hold on.
//
// Exit code 1 on any finding. Findings are printed with the captured stack.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5197';
const FAMILY = process.argv.includes('--family');
const SLOW = process.argv.includes('--slow');
const REPORT_DIR = path.join(here, 'artifacts/warmupReopenDraft');
const QUESTION = 'lmr-wu-1';

const findings = [];
const log = [];
const step = (text) => { log.push(text); console.log(`  · ${text}`); };
const fail = (text, detail = null) => { findings.push({ text, detail }); console.log(`  ✗ ${text}${detail ? `\n${typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)}` : ''}`); };

// 08:58 school time today: Period 3 began at 08:53's Warm-Up open, class at 09:00.
const schoolTime = (hhmm) => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
  const date = fmt.format(now);
  // Chicago offset for that date, from the formatter itself.
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const offsetMs = probe.getTime() - local.getTime();
  return new Date(new Date(`${date}T${hhmm}:00Z`).getTime() + offsetMs);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ timezoneId: 'America/Chicago', viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.stack || error.message}`));
await page.clock.install({ time: schoolTime('09:02') });

if (SLOW) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  step('throttled: 6× CPU, slow 3G-class network');
}

const url = `${ORIGIN}/tests/browser/warmupReopenDraft.html?q=${QUESTION}${FAMILY ? '&family=1' : ''}`;
const ready = async () => {
  await page.waitForSelector(`[data-question-id="${QUESTION}"]`, { timeout: 120000 });
  await page.waitForFunction(() => !document.body.textContent.includes('Opening Work View…'), null, { timeout: 60000 });
  await page.waitForTimeout(300);
};
const wu = (expr, ...args) => page.evaluate(([source, values]) => {
  // eslint-disable-next-line no-new-func
  return new Function('wu', 'args', `return (${source})(wu, ...args);`)(window.__wu, values);
}, [expr.toString(), args]);
const errors = () => wu((w) => w.errors());
const status = () => wu((w) => w.state());
const cards = () => page.locator('.mathmaster-line-card');
const groupButton = (index) => page.locator('[role="radio"]').nth(index);
const placements = async () => {
  const work = await wu((w, id) => w.work(id), QUESTION);
  return work?.linearAssignments || null;
};
const checkErrors = async (where) => {
  const captured = await errors();
  const errorBoundary = await page.locator('text=/Something went wrong|could not open|Reload the question/i').count();
  if (captured.length || errorBoundary) {
    fail(`exception ${where}`, captured.map((entry) => `${entry.source}: ${entry.message}\n${entry.stack}\n${entry.componentStack || ''}`).join('\n----\n') || 'error UI visible');
    return false;
  }
  step(`no exception ${where}`);
  return true;
};

console.log(`Warm-Up reopen journey (${FAMILY ? 'family-backed' : 'final'} assignment${SLOW ? ', throttled' : ''})`);
await page.goto(url);
await ready();
const opening = await status();
if (opening.status !== 'active') fail('Warm-Up should be active at 09:02', opening);
else step(`Warm-Up active until ${opening.endsAt}`);

// 1. Partial work: three cards into Line A, two into Line B. No Submit.
const total = await cards().count();
step(`board has ${total} cards`);
await groupButton(0).click();
for (const index of [0, 2, 4]) await cards().nth(index).click();
await groupButton(1).click();
for (const index of [1, 3]) await cards().nth(index).click();
await page.waitForTimeout(200);
const before = await placements();
if (!before || Object.keys(before).length !== 5) fail('the partial sort was not persisted as five placements', before);
else step(`persisted partial sort: ${JSON.stringify(before)}`);

// 2. Timer expires: 09:10 + the transition callback.
await page.clock.fastForward('09:00');
await page.waitForTimeout(300);
const closed = await status();
if (closed.status !== 'closed') fail('Warm-Up should be closed after its ten-minute cutoff', closed);
else step('Warm-Up closed by its timer');
const lockedFieldset = await page.locator('fieldset[disabled]').count();
if (!lockedFieldset) fail('the question should be locked while the Warm-Up is closed');
const frozen = await placements();
if (JSON.stringify(frozen) !== JSON.stringify(before)) fail('closing changed the saved draft', { before, frozen });
else step('draft unchanged by the close (frozen, not cleared, not submitted)');
const trackerAtClose = await wu((w) => w.tracker());
if (Object.keys(trackerAtClose).length) fail('closing recorded an attempt for unfinished work', trackerAtClose);
await checkErrors('at close');

// 3. Teacher reopens two minutes later.
await page.clock.fastForward('02:00');
const reopened = await wu((w) => w.teacher('reopen'));
await page.waitForTimeout(300);
if (reopened.status !== 'active') fail('Warm-Up should be active after the teacher reopens', reopened);
else step(`teacher reopened: active until ${reopened.endsAt}`);
await checkErrors('after reopen (mounted question)');

// 4. The stale timer armed for the ORIGINAL close has no business closing the new window.
await page.clock.fastForward('01:00');
await page.waitForTimeout(200);
const afterStale = await status();
if (afterStale.status !== 'active') fail('a timer from the previous window closed the reopened Warm-Up', afterStale);
else step('reopened window survives the old window\'s timers');

// 5. Remount (App's draft generation) and a full refresh.
await wu((w) => w.remount());
await page.waitForTimeout(400);
await checkErrors('after remount');
await page.reload();
await ready();
await checkErrors('after refresh');
const restored = await placements();
if (JSON.stringify(restored) !== JSON.stringify(before)) fail('the partial sort was not restored after reopen', { before, restored });
const shown = (await page.locator('.mathmaster-line-card').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') || ''))).filter((label) => !/not sorted yet/i.test(label)).length;
if (shown !== 5) fail(`the restored board shows ${shown} sorted cards, expected 5`);
else step('restored: the same five cards are sorted on screen');
const unlocked = await page.locator('fieldset[disabled]').count();
if (unlocked) fail('the reopened question is still locked');

// 6. Finish and submit — the answer is the board's own sets.
step(`finishing the remaining ${total - 5} cards`);
for (let index = 0; index < total; index += 1) {
  const card = cards().nth(index);
  const label = (await card.getAttribute('aria-label')) || '';
  if (!/not sorted yet/i.test(label)) continue;
  // Any slot is fine for "submit succeeds"; correctness is not this journey's claim.
  await groupButton(index % 2).click();
  await card.click();
}
await page.locator('button', { hasText: /Check groups/i }).click();
await page.waitForTimeout(500);
const afterSubmit = await wu((w) => w.tracker());
const record = Object.values(afterSubmit)[0];
if (!record || record.totalAttempts !== 1) fail('the reopened Warm-Up did not take exactly one submission', afterSubmit);
else step(`submitted once after reopen (status ${record.status})`);
await checkErrors('after submit');

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(path.join(REPORT_DIR, `report${FAMILY ? '-family' : ''}${SLOW ? '-slow' : ''}.json`), JSON.stringify({ findings, log, consoleErrors }, null, 2));
await browser.close();
if (consoleErrors.length) console.log(`console errors:\n${consoleErrors.join('\n')}`);
console.log(findings.length ? `\n${findings.length} finding(s)` : '\nPASS');
process.exit(findings.length ? 1 : 0);

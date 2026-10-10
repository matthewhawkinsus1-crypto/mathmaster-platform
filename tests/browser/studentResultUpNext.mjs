// Drive the Assignments Center and the Assignment Result through the one
// "Today" rule, on a laptop and on a phone.
//
// HOW TO RUN:
//
//   npx vite --host 127.0.0.1 --port 5213 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5213 node tests/browser/studentResultUpNext.mjs [--shots <dir>]
//
// WHAT IT PROVES, at 1366×768 and 390×844:
//
//   - Upcoming lists soonest due first; Active puts past-due work first.
//   - Continue hands App the assignment id AND the question the Today rule
//     chose (index 1, not 0, for a lesson whose first question is done).
//   - A Recovery row says "Open Recovery" and opens the result page.
//   - Waiting rows/pages say what they wait for, section by section, and offer
//     no Start.
//   - The result page's Up next card is visible, on screen and clickable, and
//     hands over the next assignment and its question; with no Up next a
//     finished page offers Back to Home.
//   - Closed work reads "Try it again — no credit"; a review panel replaces the
//     "not replayed" copy and the Review My Work button.
//   - No sideways scroll, every control ≥ 44px, no console errors.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted.

import { mkdirSync } from 'node:fs';
import path from 'node:path';

const loadPlaywright = async () => {
  for (const specifier of [process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright/index.mjs', 'playwright']) {
    if (!specifier) continue;
    try { return await import(specifier); } catch { /* try the next one */ }
  }
  throw new Error('playwright is not available');
};
const { chromium } = await loadPlaywright();

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5213';
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'laptop', width: 1366, height: 768, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
];

let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox'] });
} catch {
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium' });
}

const allFindings = [];
const log = [];

const textOf = (page) => page.evaluate(() => (document.querySelector('[data-mm-scene]')?.innerText || '').replace(/\s+/g, ' ').trim());
const buttons = (page) => page.evaluate(() => [...document.querySelectorAll('[data-mm-scene] button')].map((element) => (element.innerText || '').replace(/\s+/g, ' ').trim()));
const calls = (page) => page.evaluate(() => window.__mmCalls);
const clickButton = async (page, label, { within = null } = {}) => page.evaluate(({ label: needle, within: scope }) => {
  const root = scope ? [...document.querySelectorAll(scope.selector)].find((element) => (element.innerText || '').includes(scope.text)) : document;
  if (!root) return 'no-scope';
  const target = [...root.querySelectorAll('button')].find((element) => (element.innerText || '').replace(/\s+/g, ' ').trim() === needle
    || (element.innerText || '').replace(/\s+/g, ' ').trim().startsWith(needle));
  if (!target) return 'no-button';
  target.scrollIntoView({ block: 'center' });
  const box = target.getBoundingClientRect();
  const visible = box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= window.innerHeight + 1
    && box.left >= 0 && box.right <= document.documentElement.clientWidth + 1;
  // A real hit test: the button must be the element under its own centre.
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!visible || !(hit === target || target.contains(hit))) return 'not-clickable';
  target.click();
  return 'ok';
}, { label, within });

const layoutProblems = (page) => page.evaluate((minTap) => {
  const viewportWidth = document.documentElement.clientWidth;
  const problems = [];
  if (document.documentElement.scrollWidth > viewportWidth + 1) {
    problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px in ${viewportWidth}px`);
  }
  for (const element of document.querySelectorAll('[data-mm-scene] *')) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.right > viewportWidth + 1) {
      problems.push(`<${element.tagName.toLowerCase()}> past the edge at ${Math.round(box.right)}px`);
      break;
    }
  }
  for (const element of document.querySelectorAll('[data-mm-scene] button, [data-mm-scene] a[href], [data-mm-scene] input, [data-mm-scene] select')) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0 && (box.height < minTap || box.width < minTap)) {
      problems.push(`tap target ${Math.round(box.width)}x${Math.round(box.height)}: "${(element.innerText || element.tagName).trim().slice(0, 40)}"`);
    }
  }
  if (document.querySelector('[data-mm-crashed]')) problems.push(`crashed: ${document.querySelector('[data-mm-crashed]').textContent}`);
  return problems;
}, MIN_TAP);

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const blocked = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('ws://')) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error?.message || error}`));
  await page.goto(`${ORIGIN}/tests/browser/studentResultUpNext.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmScene === 'function', { timeout: 30000 });

  const scene = async (name, check) => {
    consoleErrors.length = 0;
    await page.evaluate((sceneName) => window.__mmScene(sceneName), name);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    const problems = [...await layoutProblems(page)];
    try {
      await check(problems);
    } catch (error) {
      problems.push(`check threw: ${error.message}`);
    }
    problems.push(...consoleErrors.map((error) => `console: ${error}`));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-${name}.png`), fullPage: true });
    const status = problems.length ? 'FAIL' : 'ok';
    log.push(`${status.padEnd(4)} ${viewport.name.padEnd(6)} ${name}`);
    for (const problem of problems) log.push(`       -> ${problem}`);
    if (problems.length) allFindings.push({ viewport: viewport.name, scene: name, problems });
  };
  const expect = (problems, condition, message) => { if (!condition) problems.push(message); };
  const lastCall = async () => (await calls(page)).at(-1) || null;

  await scene('center', async (problems) => {
    // Upcoming: soonest due first.
    expect(problems, await clickButton(page, 'Upcoming ·') === 'ok', 'could not open Upcoming');
    await page.waitForTimeout(120);
    const upcoming = await page.evaluate(() => [...document.querySelectorAll('article h3')].map((h) => h.textContent));
    expect(problems, JSON.stringify(upcoming) === JSON.stringify(['Solving Inequalities', 'Slope from Two Points', 'Quadratics Investigation']), `Upcoming order: ${JSON.stringify(upcoming)}`);
    const upcomingText = await textOf(page);
    expect(problems, upcomingText.includes('Practice opens when your teacher starts it in class'), 'locked Practice wait text missing');
    expect(problems, /DOL opens at/.test(upcomingText), 'DOL wait text missing');
    const waitingButtons = await page.evaluate(() => [...document.querySelectorAll('article')]
      .filter((article) => /Solving Inequalities|Slope from Two Points/.test(article.innerText))
      .flatMap((article) => [...article.querySelectorAll('button')].map((button) => button.innerText.trim())));
    expect(problems, !waitingButtons.some((label) => /^(Start|Continue)$/.test(label)), `waiting rows offer ${JSON.stringify(waitingButtons)}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-center-upcoming.png`), fullPage: true });

    // Active: past due first; Continue carries the question index.
    expect(problems, await clickButton(page, 'Active ·') === 'ok', 'could not open Active');
    await page.waitForTimeout(120);
    const active = await page.evaluate(() => [...document.querySelectorAll('article h3')].map((h) => h.textContent));
    expect(problems, active[0] === 'Linear Functions', `Active does not lead with past-due work: ${JSON.stringify(active)}`);
    expect(problems, await clickButton(page, 'Continue', { within: { selector: 'article', text: 'Systems of Equations' } }) === 'ok', 'Continue not clickable');
    const cont = await lastCall();
    expect(problems, cont?.type === 'continue' && cont.args[0] === 'actionable' && cont.args[1] === 1, `Continue sent ${JSON.stringify(cont)}`);
    expect(problems, await clickButton(page, 'Open Recovery', { within: { selector: 'article', text: 'Graphing Lines' } }) === 'ok', 'Open Recovery not clickable');
    const recover = await lastCall();
    expect(problems, recover?.type === 'openResult' && recover.args[0] === 'recovery', `Open Recovery sent ${JSON.stringify(recover)}`);

    // Closed tab: try again, never "Practice".
    expect(problems, await clickButton(page, 'Closed — try again ·') === 'ok', 'could not open the Closed tab');
    await page.waitForTimeout(120);
    const closedText = await textOf(page);
    expect(problems, closedText.includes('You can try these again; they no longer change your grade.'), 'Closed hint missing');
    expect(problems, await clickButton(page, 'Try it again — no credit') === 'ok', 'Try it again not clickable');
    const retry = await lastCall();
    expect(problems, retry?.type === 'practice' && retry.args[0] === 'closed', `Try again sent ${JSON.stringify(retry)}`);
    expect(problems, !(await buttons(page)).some((label) => /^Practice$/.test(label)), 'a bare "Practice" button is on the Closed tab');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${viewport.name}-center-closed.png`), fullPage: true });

    // Completed: excused offers results only.
    expect(problems, await clickButton(page, 'Completed ·') === 'ok', 'could not open Completed');
    await page.waitForTimeout(120);
    const excusedButtons = await page.evaluate(() => [...document.querySelectorAll('article')]
      .filter((article) => article.innerText.includes('Unit 2 Review'))
      .map((article) => ({ text: article.innerText, buttons: [...article.querySelectorAll('button')].map((button) => button.innerText.trim()) }))[0]);
    expect(problems, /excused/i.test(excusedButtons?.text || ''), 'excused row does not say Excused');
    expect(problems, JSON.stringify(excusedButtons?.buttons) === JSON.stringify(['View Results']), `excused row offers ${JSON.stringify(excusedButtons?.buttons)}`);
    problems.push(...await layoutProblems(page));
  });

  await scene('grades', async (problems) => {
    const rowOf = (title) => page.evaluate((needle) => {
      const row = [...document.querySelectorAll('article')].find((article) => article.querySelector('h3')?.textContent === needle);
      return row ? { text: row.innerText, buttons: [...row.querySelectorAll('button')].map((button) => button.innerText.trim()) } : null;
    }, title);
    // Waiting work (DOL later today, Practice locked): no Start/Continue, and
    // the row says what it is waiting for.
    for (const [title, wait] of [['Slope from Two Points', /DOL opens at/], ['Solving Inequalities', /Practice opens when your teacher/]]) {
      const row = await rowOf(title);
      expect(problems, row && !row.buttons.some((label) => /^(Start|Continue)$/.test(label)), `${title} offers ${JSON.stringify(row?.buttons)} although nothing is open`);
      expect(problems, row && wait.test(row.text), `${title} does not say what it is waiting for`);
    }
    // A Recovery opens the result page, once.
    const recovery = await rowOf('Graphing Lines');
    expect(problems, JSON.stringify(recovery?.buttons) === JSON.stringify(['Open Recovery']), `Recovery row offers ${JSON.stringify(recovery?.buttons)}`);
    expect(problems, await clickButton(page, 'Open Recovery', { within: { selector: 'article', text: 'Graphing Lines' } }) === 'ok', 'Open Recovery not clickable');
    const recover = await lastCall();
    expect(problems, recover?.type === 'openResult' && recover.args[0] === 'recovery', `Open Recovery sent ${JSON.stringify(recover)}`);
    // Continue lands on the question Home would choose.
    expect(problems, await clickButton(page, 'Continue', { within: { selector: 'article', text: 'Systems of Equations' } }) === 'ok', 'Continue not clickable');
    const cont = await lastCall();
    expect(problems, cont?.type === 'continue' && cont.args[0] === 'actionable' && cont.args[1] === 1, `Continue sent ${JSON.stringify(cont)}`);
    // Start on missing work.
    expect(problems, (await rowOf('Linear Functions'))?.buttons.includes('Start'), 'missing work has no Start');
  });

  await scene('resultWaiting', async (problems) => {
    const text = await textOf(page);
    for (const needle of ['Nothing here is open right now', 'DOL opens at', 'Classwork — done', 'DOL — opens at', 'Up next', 'Systems of Equations']) {
      expect(problems, text.includes(needle) || text.toLowerCase().includes(needle.toLowerCase()), `missing "${needle}"`);
    }
    // Only the Up next card (another assignment) may offer Continue.
    const ownButtons = await page.evaluate(() => [...document.querySelectorAll('[data-mm-scene] button')]
      .filter((button) => !button.closest('[data-result-up-next]'))
      .map((button) => button.innerText.trim()));
    expect(problems, !ownButtons.some((label) => /^(Start|Continue)$/.test(label)), `a waiting result offers ${JSON.stringify(ownButtons)}`);
    expect(problems, await clickButton(page, 'Continue', { within: { selector: '[data-result-up-next]', text: 'Systems of Equations' } }) === 'ok', 'Up next button not visible/clickable');
    const handed = await lastCall();
    expect(problems, handed?.type === 'upNext' && handed.args[0].assignmentId === 'actionable' && handed.args[0].questionIndex === 1, `Up next sent ${JSON.stringify(handed)}`);
    expect(problems, (await buttons(page))[0] === '← Assignments', `Back reads ${JSON.stringify((await buttons(page))[0])}`);
  });

  await scene('resultLocked', async (problems) => {
    const text = await textOf(page);
    expect(problems, text.includes('Practice — opens when your teacher starts it in class'), 'locked Practice section line missing');
    expect(problems, (await buttons(page))[0] === '← Grades', `Back from Grades reads ${JSON.stringify((await buttons(page))[0])}`);
    expect(problems, (await buttons(page)).includes('All Assignments') && !(await buttons(page)).includes('View All Grades'), 'the Back destination is offered twice');
  });

  await scene('resultActionable', async (problems) => {
    expect(problems, await clickButton(page, 'Continue', { within: { selector: '[data-result-next]', text: 'open' } }) === 'ok', 'Continue not clickable');
    const cont = await lastCall();
    expect(problems, cont?.type === 'continue' && cont.args[0] === 'actionable' && cont.args[1] === 1, `Continue sent ${JSON.stringify(cont)}`);
  });

  await scene('resultFinished', async (problems) => {
    const text = await textOf(page);
    expect(problems, /up next/i.test(text), 'no Up next card');
    expect(problems, !(await buttons(page)).includes('Back to Home'), 'Home offered although Up next exists');
    expect(problems, await clickButton(page, 'Continue', { within: { selector: '[data-result-up-next]', text: 'Systems of Equations' } }) === 'ok', 'Up next not clickable');
    const handed = await lastCall();
    expect(problems, handed?.type === 'upNext' && handed.args[0].assignmentId === 'actionable', `Up next sent ${JSON.stringify(handed)}`);
  });

  await scene('resultFinishedAlone', async (problems) => {
    expect(problems, await clickButton(page, 'Back to Home') === 'ok', 'Back to Home not clickable');
    expect(problems, (await lastCall())?.type === 'home', 'Back to Home did not call onBackToHome');
  });

  await scene('resultClosed', async (problems) => {
    const labels = await buttons(page);
    expect(problems, labels.includes('Try DOL again — no credit'), `closed retry label: ${JSON.stringify(labels)}`);
    expect(problems, !labels.some((label) => label.startsWith('Practice')), 'a "Practice…" button on closed work');
    expect(problems, (await textOf(page)).includes('not replayed'), 'without a review panel the honest copy stays');
  });

  await scene('resultClosedReview', async (problems) => {
    const text = await textOf(page);
    expect(problems, text.includes('Your recorded answers'), 'review panel not rendered');
    expect(problems, !text.includes('not replayed'), '"not replayed" shown beside a review panel');
    expect(problems, !(await buttons(page)).includes('Review My Work'), 'Review My Work offered beside the panel');
  });

  await scene('resultExcused', async (problems) => {
    expect(problems, !(await buttons(page)).some((label) => /Try .*again/.test(label)), 'excused work offered a retry');
    expect(problems, /excused/i.test(await textOf(page)), 'excused result does not say Excused');
  });

  if (blocked.length) log.push(`(${viewport.name}) blocked ${blocked.length} non-local request(s)`);
  await context.close();
}

await browser.close();
console.log(log.join('\n'));
console.log(allFindings.length ? `\n${allFindings.length} scene(s) with problems` : '\nall scenes clean');
process.exit(allFindings.length ? 1 : 0);

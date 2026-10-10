// Drive student Home in Chromium at 1366×768 and 390×844.
//
// HOW TO RUN:
//
//   npx vite --host 127.0.0.1 --port 5211 --strictPort &
//   node tests/browser/studentHomeToday.mjs [--shots <dir>]
//
// WHAT IT CHECKS, on a dashboard built by the real model (see
// studentHomeTodayMain.jsx):
//
//   1. ONE PRIMARY ACTION. Exactly one [data-primary-action] on the page, and
//      the live DOL / Resume it names has no second big card of its own.
//   2. PRIVACY. The student record carries inclusionStatus: true; nothing
//      about it (or an IEP) is printed.
//   3. HONEST CARDS. Finished/excused/closed work is never "Late"; it offers
//      See results (and, when closed, "Try it again — no credit"). Waiting
//      work has no Start and says what it waits for, with the DOL's real time.
//   4. START LANDS RIGHT. Every Start/Continue/primary press calls back with
//      the question index the model chose; Recovery and results go to the
//      result page.
//   5. LAYOUT. No horizontal scroll, every control ≥44px tall, no console
//      errors, no crash.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted.

import { mkdirSync } from 'node:fs';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5211';
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > -1 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const MIN_TAP = 44;
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 768, isMobile: false },
  { name: 'phone', width: 390, height: 844, isMobile: true },
];

const failures = [];
const notes = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const launch = async () => {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch {
    return chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium' });
  }
};
const browser = await launch();

for (const viewport of VIEWPORTS) {
  const tag = (message) => `[${viewport.name}] ${message}`;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.isMobile ? 2 : 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(https?|wss?):\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url) || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));

  await page.goto(`${ORIGIN}/tests/browser/studentHomeToday.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mmHomeScene === 'function', { timeout: 60000 });

  const scene = async (name) => {
    await page.evaluate((n) => window.__mmHomeScene(n), name);
    await page.waitForSelector(`[data-mm-scene="${name}"]`);
    await page.waitForTimeout(150);
    const crashed = await page.$('[data-mm-crashed]');
    check(!crashed, tag(`${name}: crashed ${crashed ? await crashed.textContent() : ''}`));
    return page.evaluate(() => window.__mmHomeModel);
  };
  const calls = () => page.evaluate(() => window.__mmHomeCalls.splice(0));
  const text = () => page.evaluate(() => document.body.innerText);
  const cardButton = (id, label) => page.locator(`[data-assignment-card="${id}"] button`, { hasText: label });

  const layout = async (name) => {
    const metrics = await page.evaluate((min) => {
      const doc = document.documentElement;
      const small = [...document.querySelectorAll('button, a[href], [role="button"], input, select')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.height < min)
        .map(({ el, rect }) => ({
          text: (el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40),
          height: Math.round(rect.height),
          inNav: Boolean(el.closest('nav, header')),
        }));
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, small };
    }, MIN_TAP);
    check(metrics.scrollWidth <= metrics.clientWidth, tag(`${name}: horizontal scroll ${metrics.scrollWidth} > ${metrics.clientWidth}`));
    const mine = metrics.small.filter((item) => !item.inNav);
    check(mine.length === 0, tag(`${name}: tap targets under ${MIN_TAP}px: ${JSON.stringify(mine)}`));
    const nav = metrics.small.filter((item) => item.inNav);
    if (nav.length) notes.push(tag(`${name}: header/nav controls under ${MIN_TAP}px (StudentGlobalNav, not this screen): ${JSON.stringify(nav)}`));
  };

  // --- Scene: a normal school day -----------------------------------------
  const today = await scene('today');
  const primary = page.locator('[data-primary-action]');
  check(await primary.count() === 1, tag(`today: ${await primary.count()} primary actions`));
  check(today.nextAction.kind === 'resume' && today.nextAction.assignmentId === 'inprog', tag(`today: next action ${JSON.stringify(today.nextAction)}`));
  check(await page.locator('[data-secondary-live]').count() === 0, tag('today: Resume also rendered as its own card'));

  // Open the collapsed groups so every card is measured.
  const closedGroup = page.locator('button[aria-controls^="group-"][aria-expanded="false"]');
  for (let guard = 0; guard < 10 && await closedGroup.count(); guard += 1) await closedGroup.first().click();
  await page.waitForTimeout(100);
  const body = await text();
  check(!/Inclusion|\bIEP\b|special ed/i.test(body), tag('today: support-plan wording on Home'));
  check(/Continue at Classwork Question 2\. Your answers are kept as you go\./.test(body), tag('today: resume detail missing from the next-action card'));
  check(!/restored from this browser|Continue Late Work|teacher draft|checkpoint|SECTION-SPECIFIC|SAME CLASS VERSION|if stopped now|final \d+ minutes/i.test(body), tag('today: stale or jargon copy present'));
  check(!/Nothing waiting/.test(body), tag('today: "Nothing waiting" shown with work on screen'));
  check(await page.locator('[role="status"]', { hasText: 'All work saved' }).count() === 1, tag('today: save status line missing'));

  // Order: next action, then groups, then What changed.
  const y = (selector) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top + window.scrollY : -1;
  }, selector);
  const yNext = await y('#what-now-heading');
  const yGroup = await y('[aria-labelledby^="group-"]');
  const yChanged = await y('[aria-label="What changed"]');
  check(yNext > 0 && yNext < yGroup && yGroup < yChanged, tag(`today: order next=${yNext} groups=${yGroup} changed=${yChanged}`));

  const chip = async (id) => (await page.locator(`[data-assignment-card="${id}"] [data-status-chip]`).textContent())?.trim();
  for (const [id, expected] of [['finished', 'Finished'], ['excused', 'Excused'], ['closed', 'Closed'], ['pastdue-started', 'Late'], ['pastdue', 'Late'], ['locked', 'Not open yet'], ['dolwait', 'Not open yet']]) {
    check(await chip(id) === expected, tag(`today: ${id} chip is "${await chip(id)}", expected "${expected}"`));
  }
  for (const id of ['finished', 'excused', 'closed']) {
    const cardText = await page.locator(`[data-assignment-card="${id}"]`).innerText();
    check(!/\bLate\b/i.test(cardText), tag(`today: finished card ${id} says Late`));
    check(await cardButton(id, 'See results').count() === 1, tag(`today: ${id} has no See results`));
    check(await cardButton(id, /^(Start|Continue)$/).count() === 0, tag(`today: ${id} offers Start/Continue`));
  }
  check(await page.locator('[data-assignment-card="excused"] [data-grade-line]').count() === 0, tag('today: excused card shows a grade'));
  check(await cardButton('closed', 'Try it again — no credit').count() === 1, tag('today: closed card has no practice button'));
  for (const id of ['locked', 'dolwait']) {
    check(await cardButton(id, /Start|Continue|Locked/).count() === 0, tag(`today: waiting card ${id} has a Start/Locked button`));
  }
  const waitLocked = await page.locator('[data-assignment-card="locked"] [data-wait-line]').textContent();
  check(/Practice opens when your teacher/.test(waitLocked || ''), tag(`today: locked wait line "${waitLocked}"`));
  check(/Classwork 1\/1 ✓/.test(await page.locator('[data-assignment-card="locked"]').innerText()), tag('today: locked card has no "Classwork 1/1 ✓" chip'));
  const waitDol = await page.locator('[data-assignment-card="dolwait"] [data-wait-line]').textContent();
  check(/^DOL opens at \d{1,2}:\d{2}/.test(waitDol || ''), tag(`today: DOL wait line "${waitDol}"`));
  check(/Classwork · Practice/.test(await page.locator('[data-assignment-card="inprog"], [data-assignment-card="later"]').first().innerText()), tag('today: section makeup line missing'));

  // Presses land where the model said.
  const expectIndex = (id) => today.entries.find((entry) => entry.id === id).nextQuestionIndex ?? 0;
  await calls();
  await primary.click();
  await cardButton('pastdue-started', 'Continue').click();
  await cardButton('pastdue', 'Start').click();
  await cardButton('later', 'Start').click();
  await cardButton('finished', 'See results').click();
  await cardButton('excused', 'See results').click();
  await cardButton('closed', 'Try it again — no credit').click();
  await page.locator('[data-ways-to-raise]').click();
  const pressed = await calls();
  const want = [
    { fn: 'start', args: ['inprog', today.resumeQuestionIndex] },
    { fn: 'start', args: ['pastdue-started', expectIndex('pastdue-started')] },
    { fn: 'start', args: ['pastdue', expectIndex('pastdue')] },
    { fn: 'start', args: ['later', expectIndex('later')] },
    { fn: 'result', args: ['finished'] },
    { fn: 'result', args: ['excused'] },
    { fn: 'start', args: ['closed'] },
    { fn: 'navigate', args: ['grades'] },
  ];
  check(JSON.stringify(pressed) === JSON.stringify(want), tag(`today: callbacks ${JSON.stringify(pressed)} != ${JSON.stringify(want)}`));
  check(expectIndex('pastdue-started') === 1, tag(`today: the started late lesson should resume at question 1 (model said ${expectIndex('pastdue-started')})`));
  await layout('today');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `home-today-${viewport.name}.png`), fullPage: true });

  // --- Scene: the DOL is open ----------------------------------------------
  const dol = await scene('dol');
  check(dol.nextAction.kind === 'dol' && dol.nextAction.assignmentId === 'dollive', tag(`dol: next action ${JSON.stringify(dol.nextAction)}`));
  check(await page.locator('[data-primary-action]').count() === 1, tag('dol: more than one primary action'));
  check(await page.locator('[data-secondary-live="dol"]').count() === 0, tag('dol: DOL rendered twice'));
  check(await page.locator('[data-secondary-live="resume"][aria-label="Resume assignment"]').count() === 1, tag('dol: the other Resume is not a secondary card'));
  const countdown = await page.locator('[data-next-action-countdown]').textContent().catch(() => null);
  check(/^\d+:\d{2} left$/.test((countdown || '').trim()), tag(`dol: countdown "${countdown}"`));
  await page.locator('[data-primary-action]').click();
  const dolPress = await calls();
  check(JSON.stringify(dolPress) === JSON.stringify([{ fn: 'start', args: ['dollive', dol.nextAction.questionIndex] }]), tag(`dol: primary press ${JSON.stringify(dolPress)}`));
  check(dol.nextAction.questionIndex === 1, tag(`dol: should open the first DOL question (1), model said ${dol.nextAction.questionIndex}`));
  await layout('dol');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `home-dol-${viewport.name}.png`), fullPage: true });

  await scene('dolHidden');
  check(await page.locator('[data-next-action-countdown]').count() === 0, tag('dolHidden: countdown shown although hideCountdowns'));
  check(!/\d+:\d{2} left/.test(await text()), tag('dolHidden: some countdown still visible'));

  // --- Scene: a Recovery is the next action --------------------------------
  const recovery = await scene('recovery');
  check(recovery.nextAction.opensResult === true, tag(`recovery: next action ${JSON.stringify(recovery.nextAction)}`));
  const recoveryPrimary = page.locator('[data-primary-action]');
  check((await recoveryPrimary.textContent())?.trim() === 'Open Recovery', tag('recovery: primary is not Open Recovery'));
  await recoveryPrimary.click();
  const recoveryPress = await calls();
  check(JSON.stringify(recoveryPress) === JSON.stringify([{ fn: 'result', args: ['recovery'] }]), tag(`recovery: press ${JSON.stringify(recoveryPress)}`));
  await layout('recovery');

  // --- The other kinds of next action ---------------------------------------
  // Each scene: exactly one primary action, rewards below it, no support-plan
  // wording, no teacher jargon, no "Nothing waiting" beside work.
  const FORBIDDEN = /inclusion|\bIEP\b|special[- ]ed|accommodat|support plan|section-specific|teacher draft|checkpoint|\bvariant|\bseed\b|\btoken\b|restored from this browser/i;
  const sceneBasics = async (name, model) => {
    check(await page.locator('[data-primary-action]').count() === 1, tag(`${name}: ${await page.locator('[data-primary-action]').count()} primary actions`));
    const words = await text();
    const bad = words.match(FORBIDDEN);
    check(!bad, tag(`${name}: forbidden wording "${bad?.[0]}"`));
    const yPrimary = await y('[data-primary-action]');
    const yRewards = await y('[aria-labelledby="rewards-summary-heading"]');
    if (yRewards > -1) check(yPrimary > 0 && yRewards > yPrimary, tag(`${name}: rewards (${yRewards}) above the primary action (${yPrimary})`));
    await layout(name);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `home-${name}-${viewport.name}.png`), fullPage: true });
    return { words, model };
  };

  const warm = await scene('warmup');
  await sceneBasics('warmup', warm);
  check(warm.nextAction.kind === 'warmup' && warm.nextAction.assignmentId === 'warmlive', tag(`warmup: next action ${JSON.stringify(warm.nextAction)}`));
  check(await page.locator('[data-secondary-live="warmup"]').count() === 0, tag('warmup: Warm-Up rendered twice'));
  await page.locator('[data-primary-action]').click();
  const warmPress = await calls();
  // Question 0 of the Warm-Up is already correct; Start lands on question 1.
  check(JSON.stringify(warmPress) === JSON.stringify([{ fn: 'start', args: ['warmlive', 1] }]), tag(`warmup: primary press ${JSON.stringify(warmPress)} (question 0 is finished)`));

  const both = await scene('bothLive');
  await sceneBasics('bothLive', both);
  check(both.nextAction.kind === 'dol' && both.activeWarmups.includes('warmlive'), tag(`bothLive: ${JSON.stringify({ next: both.nextAction, warmups: both.activeWarmups })}`));
  await page.locator('[data-secondary-live="warmup"] button').click();
  const secondaryPress = await calls();
  check(JSON.stringify(secondaryPress) === JSON.stringify([{ fn: 'start', args: ['warmlive', 1] }]), tag(`bothLive: secondary Start Warm-Up sent ${JSON.stringify(secondaryPress)} (question 0 is finished)`));

  const waitingOnly = await scene('waitingOnly');
  const waitingWords = (await sceneBasics('waitingOnly', waitingOnly)).words;
  check(waitingOnly.nextAction.kind === 'assignedSoon', tag(`waitingOnly: next action ${JSON.stringify(waitingOnly.nextAction)}`));
  check(!/caught up|Nothing waiting/i.test(waitingWords), tag('waitingOnly: celebrates or says "Nothing waiting" while work is waiting'));
  check(/opens/i.test(await page.locator('#what-now-heading').locator('..').innerText()), tag('waitingOnly: the card does not say what the work is waiting for'));
  await page.locator('[data-primary-action]').click();
  check(JSON.stringify(await calls()) === JSON.stringify([{ fn: 'mathPath', args: [] }]), tag('waitingOnly: primary does not open My Math Path'));

  const nothing = await scene('nothingAssigned');
  const nothingWords = (await sceneBasics('nothingAssigned', nothing)).words;
  check(nothing.nextAction.kind === 'weeklyPath', tag(`nothingAssigned: next action ${JSON.stringify(nothing.nextAction)}`));
  check(/Nothing assigned yet/.test(nothingWords), tag('nothingAssigned: no "Nothing assigned yet"'));

  const allDone = await scene('allDone');
  const allDoneWords = (await sceneBasics('allDone', allDone)).words;
  check(allDone.nextAction.kind === 'clear', tag(`allDone: next action ${JSON.stringify(allDone.nextAction)}`));
  check(!/\bLate\b/.test(allDoneWords.replace(/Late work is still open and still counts\./g, '')), tag('allDone: finished work says Late'));

  const weekly = await scene('weeklyPath');
  await sceneBasics('weeklyPath', weekly);
  check(weekly.nextAction.kind === 'weeklyPath', tag(`weeklyPath: next action ${JSON.stringify(weekly.nextAction)}`));
  check(!/caught up/i.test(await text()), tag('weeklyPath: says "caught up" with the Path goal pending'));

  const unknown = await scene('pathUnknown');
  await sceneBasics('pathUnknown', unknown);
  check(unknown.nextAction.kind === 'weeklyPathStatus', tag(`pathUnknown: next action ${JSON.stringify(unknown.nextAction)}`));
  check(!/caught up/i.test(await text()), tag('pathUnknown: celebrates an unconfirmed Path goal'));

  check(consoleErrors.length === 0, tag(`console errors: ${consoleErrors.join(' | ')}`));
  await context.close();
}

await browser.close();
notes.forEach((note) => console.log(`NOTE ${note}`));
if (failures.length) {
  failures.forEach((failure) => console.log(`FAIL ${failure}`));
  process.exit(1);
}
console.log('PASS student Home: one primary action, honest cards, right question index, no sideways scroll, ≥44px targets, no console errors (1366×768 and 390×844)');

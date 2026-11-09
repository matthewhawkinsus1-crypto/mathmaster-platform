// THE QUESTION LIST AFTER A RELOAD, BEFORE THE FAMILY ENGINE LANDS (P-7), IN
// THE REAL APP.
//
//   TEACHER_HARNESS_PORT=5383 npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5383 node tests/browser/teacherWorkflow/familyListReloadJourneys.mjs
//
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed;
//    VIEWPORTS=1366x768,390x844; ONLY=choice,spent,landed to run some.)
//
// The real App.jsx with `firebase/*` replaced by the harness fakes and the
// harness server (`?server=1`: real ingestion writes the record and its
// delivery pin). The lesson is `?questions=familyChoice`: Classwork 1 is a
// Question Family slot dealt as one number (three tries), Classwork 2 one
// dealt as four choices (inequalities.translatePhrase, Algebra I M3 T1 L3
// Warm-Up 2's family: three tries stored, one dealt).
//
// A student misses the question, then reloads straight into it. The family
// engine (src/platform/generation/familyDelivery.js) loads with the question
// runtime, so for a moment the question reads "Loading this question…"; the
// driver holds the engine's module there, opens the section progress and the
// Overview, and records every state the list draws from the first frame (a
// MutationObserver installed before the app runs). Before the fix the list
// counted the slot on the stored slot in that moment.
//
//   choice   Classwork 2 missed once (its only try). Held: the number, its
//            card and the Classwork tab say "Loading…", never "2 tries left"
//            (what they said). Landed: "Out of tries · new question
//            available", the tab "0/2".
//   spent    Classwork 1 missed three times. Held: "Loading…", never
//            "Closed · no tries left" and a tab of "1/2" (what they said:
//            whether a new version is offered arrives with the engine).
//            Landed: "Out of tries · new question available", "0/2".
//   landed   The same reload with nothing held: no state the list draws is
//            ever one it takes back.
//
// Exit code 1 on any failure.

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));
const ASSIGNMENT = 'a-today';
const ENGINE = '**/src/platform/generation/familyDelivery.js*';
const NEW_VERSION = 'Out of tries · new question available';
const PENDING = 'Loading…';
// Background callables the harness leaves to production, as the other
// journeys do (prerequisiteEarlyJourneys.mjs, warmupReopenJourneys.mjs).
const NOT_SIMULATED = new Set(['reconcileAssignmentActivityProjection']);

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);

/* ------------------------------------------------------------- the page */

// Every state the question list draws, from the first frame of every document:
// the numbers' tooltips (their label), the section tabs, and the Overview's
// cards and section counts.
const RECORD_LIST_STATES = () => {
  const seen = [];
  window.__mmListStates = seen;
  const note = (kind, text) => {
    if (text && !seen.some((entry) => entry.kind === kind && entry.text === text)) seen.push({ kind, text, at: Math.round(performance.now()) });
  };
  const sample = () => {
    document.querySelectorAll('.mathmaster-question-number').forEach((node) => note('number', node.title));
    document.querySelectorAll('.mathmaster-section-tab').forEach((node) => note('tab', `${node.innerText.replace(/\s+/g, ' ').trim()} | ${node.title}`));
    document.querySelectorAll('.mathmaster-question-navigation section[aria-label$=" questions"]').forEach((section) => {
      section.querySelectorAll('button[aria-label]').forEach((card) => note('card', card.getAttribute('aria-label')));
      const count = section.querySelector('div > span');
      if (count) note('overview', `${section.getAttribute('aria-label')}: ${count.textContent.trim()}`);
    });
  };
  new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
};

const studentQuery = (student, extra = '') => `as=student&studentId=${student}&questions=familyChoice&server=1${extra}`;

const openStudent = async (label, student, viewport) => {
  const context = await newSchoolContext(browser, { viewport, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await context.addInitScript(RECORD_LIST_STATES);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${label}: page error ${error.message}`));
  const unimplemented = watchUnimplementedCallables(page);
  await page.goto(`${ORIGIN}/?reset=1&${studentQuery(student)}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  return { context, page, unimplemented };
};

const stageText = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-stage')?.innerText || '').replace(/\s+/g, ' '));
const recordOf = (page, student, index) => page.evaluate(([id, assignmentId, key]) => (
  window.__mmHarnessStore.get(`grades/${id}`)?.gradesByAssignment?.[assignmentId]?.[key] || null
), [student, ASSIGNMENT, String(index)]);
// The server's record for the slot, once it says what `done` asks.
const serverRecord = async (page, student, index, done, ms = 20000) => {
  const deadline = Date.now() + ms;
  let record = await recordOf(page, student, index);
  while (!done(record) && Date.now() < deadline) {
    await page.waitForTimeout(250);
    record = await recordOf(page, student, index);
  }
  return record;
};

const submit = (page) => page.getByRole('button', { name: /^Submit/ }).first().click();

/* ------------------------------------------------------------- answering */

// Each statement's relation, from its words (the family's own phrases).
const RELATIONS = [
  [/is greater than or equal to|is at least|is no less than/, '≥'],
  [/is at most|is no more than|cannot be more than/, '≤'],
  [/is more than|is greater than|exceeds/, '>'],
  [/is less than|is fewer than|is under/, '<'],
];
// Classwork 2, four statements: a wrong symbol for each.
const missEveryStatement = async (page) => {
  const groups = page.locator('.mathmaster-question-stage [role=radiogroup]');
  const count = await groups.count();
  for (let index = 0; index < count; index += 1) {
    const group = groups.nth(index);
    const statement = (await group.getAttribute('aria-label')) || (await group.innerText());
    const right = RELATIONS.find(([pattern]) => pattern.test(statement))?.[1];
    const radios = group.locator('[role=radio]');
    const names = await radios.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') || node.innerText));
    await radios.nth(names.findIndex((name) => !name.includes(right))).click();
  }
  return count;
};

// Classwork 1, a slope: three answers no slope between two lattice points is.
const missTheSlope = async (page, student, index) => {
  for (let miss = 1; miss <= 3; miss += 1) {
    // After the second miss a back-up step asks first.
    const backUp = page.locator('[data-scaffold] button', { hasText: 'The change in y' });
    if (await backUp.count()) {
      await backUp.first().click();
      await page.waitForTimeout(400);
    }
    const field = page.locator('.mathmaster-question-stage math-field').first();
    const answer = `9${miss}9`;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await field.evaluate((node) => node.focus());
      await page.waitForTimeout(300);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(answer);
      await page.waitForTimeout(200);
      if ((await field.evaluate((node) => node.value)) === answer) break;
    }
    await submit(page);
    await serverRecord(page, student, index, (record) => Number(record?.totalAttempts) >= miss);
    await page.waitForTimeout(500);
  }
};

/* ------------------------------------------------------------ the reload */

const listNow = (page) => page.evaluate(() => ({
  numbers: [...document.querySelectorAll('.mathmaster-question-number')].map((node) => ({ status: [...node.classList].find((name) => name.startsWith('is-') && name !== 'is-current' && name !== 'is-locked'), title: node.title, spoken: node.getAttribute('aria-label') })),
  tabs: [...document.querySelectorAll('.mathmaster-section-tab')].map((node) => ({ text: node.innerText.replace(/\s+/g, ' ').trim(), title: node.title })),
  cards: [...document.querySelectorAll('.mathmaster-question-navigation section[aria-label="Classwork questions"] button[aria-label]')].map((node) => node.getAttribute('aria-label')),
  overview: document.querySelector('.mathmaster-question-navigation section[aria-label="Classwork questions"] div > span')?.textContent?.trim() || '',
}));

// Show the section progress and, where there is one, the Overview (the
// navigator starts compact; a phone has no Overview button, App.css, so its
// tabs and numbers are the whole list there). Says whether the Overview is open.
const openTheList = async (page) => {
  await page.getByRole('button', { name: 'Show progress' }).click();
  await page.locator('.mathmaster-question-number').first().waitFor({ timeout: 30000 });
  const overview = page.locator('.mathmaster-overview-button');
  if (!(await overview.isVisible())) return false;
  await overview.click();
  await page.locator('.mathmaster-question-navigation section[aria-label="Classwork questions"]').waitFor({ timeout: 30000 });
  return true;
};

/**
 * Reload straight into the question, the family engine held until `hold` is
 * false; then the list as it stood while held (or at once), and once the
 * question has rendered.
 */
const reloadIntoQuestion = async (page, { hold }) => {
  let release = () => {};
  let requested = 0;
  if (hold) {
    const held = new Promise((resolve) => { release = resolve; });
    await page.route(ENGINE, async (route) => {
      requested += 1;
      await held;
      await route.continue();
    });
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.getByRole('button', { name: 'Show progress' }).waitFor({ timeout: 60000 });
  const loadingBefore = /Loading this question/.test(await stageText(page));
  const withOverview = await openTheList(page);
  const whileHeld = hold ? await listNow(page) : null;
  const stillLoading = hold ? /Loading this question/.test(await stageText(page)) : null;
  release();
  await page.waitForFunction(() => {
    const text = document.querySelector('.mathmaster-question-stage')?.innerText || '';
    return text && !/Loading this question/.test(text);
  }, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  if (hold) await page.unroute(ENGINE);
  return { whileHeld, stillLoading, loadingBefore, requested, withOverview, landed: await listNow(page), states: await page.evaluate(() => window.__mmListStates) };
};

const numberOf = (list, n) => list.numbers.find((entry) => entry.title.startsWith(`Classwork Question ${n} ·`)) || null;
const cardOf = (list, n) => list.cards.find((label) => label.startsWith(`Classwork question ${n}:`)) || '';
const classworkTab = (list) => list.tabs.find((tab) => tab.text.startsWith('Classwork')) || { text: '', title: '' };
const statesOf = (states, kind, prefix) => states.filter((entry) => entry.kind === kind && entry.text.startsWith(prefix)).map((entry) => entry.text);

/* ------------------------------------------------------------ journeys */

// What the list may ever say about the question: pending, or what it is.
const onlyEver = (tag, { states, withOverview }, { number, final }) => {
  const numberStates = statesOf(states, 'number', `Classwork Question ${number} ·`);
  const allowed = [`Classwork Question ${number} · ${PENDING}`, `Classwork Question ${number} · ${final}`];
  check(numberStates.length > 0 && numberStates.every((text) => allowed.includes(text)), `${tag}: Classwork ${number}'s number only ever reads "${PENDING}" or "${final}"`, JSON.stringify(numberStates));
  const cardStates = statesOf(states, 'card', `Classwork question ${number}:`);
  check((withOverview ? cardStates.length > 0 : !cardStates.length) && cardStates.every((text) => text === `Classwork question ${number}: ${PENDING}` || text === `Classwork question ${number}: ${final}`), `${tag}: its Overview card too`, JSON.stringify(cardStates));
  const tabStates = statesOf(states, 'tab', 'Classwork');
  check(tabStates.length > 0 && tabStates.every((text) => text === `Classwork ${PENDING} | Classwork: ${PENDING}` || text === 'Classwork 0/2 | Classwork: 0 of 2 done.'), `${tag}: the Classwork tab never counts it`, JSON.stringify(tabStates));
  const overviewStates = statesOf(states, 'overview', 'Classwork questions:');
  check(overviewStates.every((text) => text === `Classwork questions: ${PENDING}` || text === 'Classwork questions: 0 of 2 done'), `${tag}: nor the Overview's count`, JSON.stringify(overviewStates));
};

const heldShows = (tag, list, number, withOverview) => {
  const shown = numberOf(list, number);
  check(shown?.status === 'is-pending' && shown.title === `Classwork Question ${number} · ${PENDING}`, `${tag}: held, Classwork ${number}'s number reads "${PENDING}"`, JSON.stringify(shown));
  check(/: loading(, current question)?$/.test(shown?.spoken || ''), `${tag}: and is spoken as loading`, shown?.spoken || '');
  check(classworkTab(list).text === `Classwork ${PENDING}` && classworkTab(list).title === `Classwork: ${PENDING}`, `${tag}: the Classwork tab shows no count`, JSON.stringify(classworkTab(list)));
  if (!withOverview) return;
  check(cardOf(list, number) === `Classwork question ${number}: ${PENDING}`, `${tag}: its Overview card says the same`, cardOf(list, number));
  check(list.overview === PENDING, `${tag}: nor does the Overview's section`, list.overview);
};

const landedShows = (tag, list, number, withOverview) => {
  const shown = numberOf(list, number);
  check(shown?.status === 'is-newQuestion' && shown.title === `Classwork Question ${number} · ${NEW_VERSION}`, `${tag}: landed, Classwork ${number} reads "${NEW_VERSION}"`, JSON.stringify(shown));
  check(classworkTab(list).text === 'Classwork 0/2', `${tag}: and the Classwork tab "0/2"`, classworkTab(list).text);
  if (withOverview) check(list.overview === '0 of 2 done', `${tag}: the Overview "0 of 2 done"`, list.overview);
};

const journeyChoice = async (viewport, tag) => {
  const student = '910004';
  const { context, page, unimplemented } = await openStudent(`choice ${tag}`, student, viewport);
  await page.goto(`${ORIGIN}/assignments/${ASSIGNMENT}/classwork/2?${studentQuery(student)}`, { timeout: 180000 });
  await page.locator('.mathmaster-question-stage [role=radiogroup]').first().waitFor({ timeout: 60000 });
  check(/One try on this question/.test(await stageText(page)), `${tag}: Classwork 2 is dealt as choices, one try`);
  check(await missEveryStatement(page) === 4, `${tag}: four statements, each answered wrong`);
  await submit(page);
  const record = await serverRecord(page, student, 2, (value) => value?.status === 'expired' && value?.familyDelivery);
  check(record?.status === 'expired' && record?.attemptCount === 1 && Boolean(record?.familyDelivery), `${tag}: the server closes it after its one try, and keeps the pin`, JSON.stringify({ status: record?.status, attemptCount: record?.attemptCount }));

  const reload = await reloadIntoQuestion(page, { hold: true });
  check(reload.requested > 0 && reload.loadingBefore && reload.stillLoading, `${tag}: the reload waits on the family engine ("Loading this question…")`, `requested ${reload.requested}`);
  heldShows(tag, reload.whileHeld, 2, reload.withOverview);
  check(numberOf(reload.whileHeld, 1)?.title === 'Classwork Question 1 · Not started', `${tag}: held, a question not started says so`, numberOf(reload.whileHeld, 1)?.title);
  landedShows(tag, reload.landed, 2, reload.withOverview);
  onlyEver(tag, reload, { number: 2, final: NEW_VERSION });
  check(!reload.states.some((entry) => /tries? left/.test(entry.text)), `${tag}: no frame says "tries left"`, reload.states.filter((entry) => /tries? left/.test(entry.text)).map((entry) => entry.text).join(' | '));
  const lacking = unimplemented().filter((name) => !NOT_SIMULATED.has(name));
  check(!lacking.length, `${tag}: no callable the harness lacks`, lacking.join(', '));
  await context.close();
};

const journeySpent = async (viewport, tag) => {
  const student = '910005';
  const { context, page, unimplemented } = await openStudent(`spent ${tag}`, student, viewport);
  await page.goto(`${ORIGIN}/assignments/${ASSIGNMENT}/classwork/1?${studentQuery(student)}`, { timeout: 180000 });
  await page.waitForFunction(() => /Find the slope/.test(document.querySelector('.mathmaster-question-stage')?.innerText || ''), null, { timeout: 60000 });
  await missTheSlope(page, student, 1);
  const record = await recordOf(page, student, 1);
  check(record?.status === 'expired' && record?.attemptCount === 3, `${tag}: Classwork 1 is out of its three tries`, JSON.stringify({ status: record?.status, attemptCount: record?.attemptCount }));

  const reload = await reloadIntoQuestion(page, { hold: true });
  check(reload.requested > 0 && reload.stillLoading, `${tag}: the reload waits on the family engine`, `requested ${reload.requested}`);
  heldShows(tag, reload.whileHeld, 1, reload.withOverview);
  landedShows(tag, reload.landed, 1, reload.withOverview);
  onlyEver(tag, reload, { number: 1, final: NEW_VERSION });
  check(!reload.states.some((entry) => /Closed/.test(entry.text) || /\b1\/2\b|1 of 2 done/.test(entry.text)), `${tag}: no frame calls it closed, or counts it done`, reload.states.filter((entry) => /Closed|1\/2|1 of 2 done/.test(entry.text)).map((entry) => entry.text).join(' | '));
  const lacking = unimplemented().filter((name) => !NOT_SIMULATED.has(name));
  check(!lacking.length, `${tag}: no callable the harness lacks`, lacking.join(', '));
  await context.close();
};

const journeyLanded = async (viewport, tag) => {
  const student = '910006';
  const { context, page } = await openStudent(`landed ${tag}`, student, viewport);
  await page.goto(`${ORIGIN}/assignments/${ASSIGNMENT}/classwork/2?${studentQuery(student)}`, { timeout: 180000 });
  await page.locator('.mathmaster-question-stage [role=radiogroup]').first().waitFor({ timeout: 60000 });
  await missEveryStatement(page);
  await submit(page);
  await serverRecord(page, student, 2, (value) => value?.status === 'expired' && value?.familyDelivery);
  const reload = await reloadIntoQuestion(page, { hold: false });
  landedShows(tag, reload.landed, 2, reload.withOverview);
  onlyEver(tag, reload, { number: 2, final: NEW_VERSION });
  await context.close();
};

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`;
  for (const [name, run] of [['choice', journeyChoice], ['spent', journeySpent], ['landed', journeyLanded]]) {
    if (!wanted(name)) continue;
    console.log(`\n— ${name} (${tag})`);
    try {
      await run(viewport, `${name} ${tag}`);
    } catch (error) {
      check(false, `${name} ${tag}`, error?.stack || String(error));
    }
  }
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall question-list reload journeys passed');
process.exit(failures.length ? 1 : 0);

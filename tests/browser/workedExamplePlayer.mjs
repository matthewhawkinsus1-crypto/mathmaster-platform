// THE WORKED-EXAMPLE PLAYER AND THE SECTION RULES (WE-A), DRIVEN THROUGH THE
// REAL QUESTION ENGINE ON THE AUTHORING GUIDE'S EXAMPLE LESSON.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/workedExamplePlayer.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed. WORKED_EXAMPLE_SHOTS=<directory>
//    puts the screenshots somewhere other than tests/browser/artifacts.)
//
// The lesson (tests/platform/fixtures/learningSupportsLessonFragment.json) is
// compiled, stored and read back by workedExamplePlayerMain.jsx as a student's
// assignment is. At 1366×768 and 390×844, through rendered controls only:
//
//   classwork  CW 4 names an authored step card: it opens by itself on step 1
//              of 4, with the step's why under it and its mathematics typeset;
//              Next and Back work from the keyboard and keep focus; the slide
//              is a polite live region; the last slide is "Your turn", whose
//              button closes the example and puts the cursor in the student's
//              own answer box; it can be opened again from the Hint panel; it
//              does not open by itself a second time; the attempt that follows
//              is graded right and recorded as workedExampleUsed.
//              CW 2 names a tool replay (moves, a later package): the built-in
//              sibling opens instead, with no error. CW 3, the same skill,
//              plays on request only. CW 1 and CW 5 say they need none: no
//              example and no offer of one.
//   practice   nothing opens by itself; "Try a similar one" plays it.
//   dol        nothing: no player, no offer, none of its words, under the
//              DOL's own role and replayed as practice.
//   and        Read aloud and Translate on a slide; dark mode; forced colours;
//              reduced motion; a phone at 200% text; nothing scrolls sideways.
//
// Exits non-zero on any failure.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerParts } from './support/partByPart.mjs';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';
import { EXAMPLE_PLAYER_LEAK_TEXTS } from '../../src/platform/supports/workedExample/lessonExample.js';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = process.env.WORKED_EXAMPLE_SHOTS || path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/workedExamplePlayer');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const DEVICES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

let serial = 0;
const open = async (device, question, { extra = '', run = null, context: options = {}, textScale = 1 } = {}) => {
  serial += 1;
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => check(false, `${device.name} ${question}: page error`, error.message));
  if (textScale !== 1) {
    // The browser's text-size setting, before the page loads.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * textScale, fixed: 13 * textScale } });
  }
  await page.goto(`${ORIGIN}/tests/browser/workedExamplePlayer.html?q=${question}&run=${run || `${Date.now()}-${serial}`}${extra}`, { waitUntil: 'networkidle' });
  await page.locator('[data-worked-example-fixture]').waitFor();
  await page.waitForTimeout(1500);
  return { page, context };
};

// The player on screen: the one in the work, not the copy Work View keeps in its closed Help drawer.
const playerOf = (page) => page.locator('.mathmaster-hint-panel [data-worked-example-player]');
const EXAMPLE_CONTROLS = '[data-worked-example-player], [data-similar-example], [data-similar-offer]';
const offerOf = (page) => page.locator('.mathmaster-hint-panel').getByRole('button', { name: 'Try a similar one' });
const slideOf = (page) => playerOf(page).getAttribute('data-example-slide');
const shot = (page, name) => screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${name}.png`), fullPage: false });
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
const inView = async (page, locator) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  return Boolean(box) && box.x >= -1 && box.x + box.width <= viewport.width + 1 && box.y >= 0 && box.y < viewport.height;
};
const focusedText = (page) => page.evaluate(() => (document.activeElement?.textContent || '').trim());

for (const device of DEVICES) {
  const at = device.name;

  /* --------------------------- Classwork, an authored step card (CW 4) */
  {
    const run = `cw4-${at}-${Date.now()}`;
    const { page, context } = await open(device, 'ls-cw-4', { run });
    const mounted = await page.evaluate(() => window.__mmExample);
    check(mounted.storedLessonSupports && mounted.exampleField === 'ex-line-two-points', `${at} CW 4: the stored assignment carries the example the question names`, JSON.stringify(mounted));
    const player = playerOf(page);
    check(await player.count() === 1, `${at} CW 4: the example opens by itself`);
    check(await player.getAttribute('data-example-kind') === 'authored' && await slideOf(page) === '1', `${at} CW 4: the lesson's step card, on its first step`);
    const body = player.locator('[data-example-slide-body]');
    check(await body.getAttribute('aria-live') === 'polite' && await body.getAttribute('aria-atomic') === 'true' && await body.getAttribute('aria-label') === 'Step 1 of 4', `${at} CW 4: the slide is a polite live region that names its place`);
    check(/A line passes through \(1, 4\) and \(5, 24\)/.test(await player.innerText()), `${at} CW 4: the sibling problem is shown`);
    check(/Slope is the change in y over the change in x\./.test(await player.locator('[data-example-why]').innerText()), `${at} CW 4: the step's why is under it`);
    check(await body.locator('math-span').count() >= 1, `${at} CW 4: the step's mathematics is typeset, as a worked solution's is`);
    check(!/Check with the other point|y = 5x - 1/.test(await player.innerText()), `${at} CW 4: one slide at a time`);
    const status = await player.locator('[role="status"]').innerText();
    check(/A worked example is open above your question/.test(status), `${at} CW 4: it says it opened, once it is on the page`, status);
    check(await inView(page, player.locator('[data-example-next]')), `${at} CW 4: Next can be reached`);
    await noSidewaysScroll(page, `${at} CW 4, step 1`);
    await player.scrollIntoViewIfNeeded();
    await shot(page, `classwork-opens-${at}`);

    // Next and Back from the keyboard; focus stays on the button pressed.
    const next = player.locator('[data-example-next]');
    const back = player.locator('[data-example-back]');
    check(await back.getAttribute('aria-disabled') === 'true', `${at} CW 4: Back is inert on the first step`);
    await next.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    check(await slideOf(page) === '2' && await focusedText(page) === 'Next', `${at} CW 4: Enter on Next shows step 2 and keeps focus`, `${await slideOf(page)} / ${await focusedText(page)}`);
    check(await body.getAttribute('aria-label') === 'Step 2 of 4' && /4 = 5\(1\) \+ b, so b = -1/.test(await body.innerText()) && /Put one point and the slope/.test(await body.innerText()), `${at} CW 4: step 2 and its why`);
    await player.scrollIntoViewIfNeeded();
    await shot(page, `classwork-middle-step-${at}`);
    await page.keyboard.press('Shift+Tab');
    check(await focusedText(page) === 'Back', `${at} CW 4: Back is the stop before Next`, await focusedText(page));
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    check(await slideOf(page) === '1' && await focusedText(page) === 'Back', `${at} CW 4: Space on Back returns to step 1 and keeps focus`, `${await slideOf(page)} / ${await focusedText(page)}`);
    await page.keyboard.press('Enter');
    check(await slideOf(page) === '1', `${at} CW 4: Back on the first step stays there`);
    await page.keyboard.press('Tab');
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
    }
    check(await slideOf(page) === 'your-turn', `${at} CW 4: after the last step, Your turn`, await slideOf(page));
    check(await body.getAttribute('aria-label') === 'Your turn' && /Your question uses different numbers/.test(await body.innerText()), `${at} CW 4: Your turn says what to do next`);
    check(await focusedText(page) === 'Go to my question', `${at} CW 4: focus is on the button that goes back to the question`, await focusedText(page));
    await noSidewaysScroll(page, `${at} CW 4, Your turn`);
    await player.scrollIntoViewIfNeeded();
    await shot(page, `classwork-your-turn-${at}`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    check(await page.locator(EXAMPLE_CONTROLS).count() === 0 || await playerOf(page).count() === 0, `${at} CW 4: the example closes`);
    const landed = await page.evaluate(() => {
      const active = document.activeElement;
      const box = active?.getBoundingClientRect?.();
      return { tag: active?.tagName || '', inWork: Boolean(active?.closest?.('.mathmaster-question-tool-workspace')), onScreen: Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight + 1) };
    });
    check(landed.tag === 'MATH-FIELD' && landed.inWork, `${at} CW 4: the cursor is in the student's own answer box`, JSON.stringify(landed));
    check(landed.onScreen, `${at} CW 4: and the box is on screen`, JSON.stringify(landed));

    // On request, on the same question: the Hint control, then "Try a similar one".
    await page.locator('[data-hint-control]').click();
    check(await offerOf(page).count() === 1, `${at} CW 4: it can be opened again on request`);
    await offerOf(page).click();
    await page.waitForTimeout(400);
    check(await playerOf(page).count() === 1 && await slideOf(page) === '1', `${at} CW 4: asked for, it plays from its first step`);
    await playerOf(page).locator('[data-example-next]').click();
    check(await slideOf(page) === '2', `${at} CW 4: Next by pointer`);
    await page.locator('[data-hint-control]').click();

    // The attempt that follows is graded as any other, and recorded as supported.
    await answerParts(page, ['3', '-2', 'y=3x-2']);
    await page.locator('button.mathmaster-bar-submit:visible').first().click();
    await page.waitForTimeout(900);
    const grade = (await page.evaluate(() => window.__mmGrades)).at(-1);
    check(grade?.isCorrect === true, `${at} CW 4: the right answers are graded right after the example`, JSON.stringify(grade && { isCorrect: grade.isCorrect, partial: grade.partialCreditPercent }));
    check(grade?.supportUsage?.workedExampleUsed === true && grade?.supportUsage?.isMathematicallyIndependent === false, `${at} CW 4: opening the example is recorded with the attempt`, JSON.stringify(grade?.supportUsage));
    await context.close();
  }

  /* ------- Once: coming back to the question does not open it a second time */
  {
    const run = `cw4-once-${at}-${Date.now()}`;
    const { page, context } = await open(device, 'ls-cw-4', { run });
    check(await playerOf(page).count() === 1, `${at} CW 4, first visit: it opens by itself`);
    // The same student, the same device, the same question (its draft key): a remount.
    const again = await context.newPage();
    again.on('pageerror', (error) => check(false, `${at} CW 4, second visit: page error`, error.message));
    await again.goto(`${ORIGIN}/tests/browser/workedExamplePlayer.html?q=ls-cw-4&run=${run}`, { waitUntil: 'networkidle' });
    await again.locator('[data-worked-example-fixture]').waitFor();
    await again.waitForTimeout(1500);
    check(await playerOf(again).count() === 0, `${at} CW 4, second visit: it does not open by itself again`);
    await again.locator('[data-hint-control]').click();
    check(await offerOf(again).count() === 1, `${at} CW 4, second visit: but is still there to ask for`);
    await context.close();
  }

  /* --------------- Classwork, a tool replay the player does not play (CW 2) */
  {
    const { page, context } = await open(device, 'ls-cw-2');
    const player = playerOf(page);
    check(await player.count() === 1 && await player.getAttribute('data-example-kind') === 'builtIn', `${at} CW 2: an example with only moves degrades to the built-in sibling, which opens by itself`);
    const text = await player.innerText();
    check(/Step 1 of \d/i.test(text) && !/4x \+ 7 = x - 8/.test(text), `${at} CW 2: a sibling, never the student's own equation`, text.replace(/\s+/g, ' ').slice(0, 120));
    let steps = 0;
    while (await slideOf(page) !== 'your-turn' && steps < 12) {
      await player.locator('[data-example-next]').click();
      steps += 1;
    }
    check(steps >= 3 && /Answer:/.test(await player.innerText()), `${at} CW 2: stepped through to its answer and Your turn`, `${steps} steps`);
    await noSidewaysScroll(page, `${at} CW 2`);
    await context.close();
  }

  /* ---------------------- Classwork, the same skill again (CW 3): on request */
  {
    const { page, context } = await open(device, 'ls-cw-3');
    check(await playerOf(page).count() === 0, `${at} CW 3: a later question on the same skill opens nothing by itself`);
    await page.locator('[data-hint-control]').click();
    await offerOf(page).click();
    await page.waitForTimeout(300);
    check(await playerOf(page).count() === 1, `${at} CW 3: and plays one on request`);
    await context.close();
  }

  /* ------------------------------------ Classwork, exempt (CW 1 and CW 5) */
  for (const exempt of ['ls-cw-1', 'ls-cw-5']) {
    const { page, context } = await open(device, exempt);
    check(await page.locator(EXAMPLE_CONTROLS).count() === 0, `${at} ${exempt}: a question that says it needs none has no example`);
    await page.locator('[data-hint-control]').click();
    await page.waitForTimeout(200);
    check(await page.getByRole('button', { name: /Try a similar one|See a similar problem worked/ }).count() === 0, `${at} ${exempt}: and no offer of one`);
    await context.close();
  }

  /* ----------------------------------------------- Practice: on request */
  {
    const { page, context } = await open(device, 'ls-pr-1');
    check(await playerOf(page).count() === 0, `${at} Practice: nothing opens by itself`);
    await page.locator('[data-hint-control]').click();
    check(await offerOf(page).count() === 1, `${at} Practice: the example is offered on request`);
    await offerOf(page).click();
    await page.waitForTimeout(400);
    check(await playerOf(page).count() === 1 && await slideOf(page) === '1', `${at} Practice: and plays`);
    await noSidewaysScroll(page, `${at} Practice`);
    await playerOf(page).scrollIntoViewIfNeeded();
    await shot(page, `practice-on-request-${at}`);
    await context.close();
  }

  /* ---------------------------------------------------- The DOL: nothing */
  for (const extra of ['', '&as=practice']) {
    const where = `${at} DOL${extra ? ' replayed as practice' : ''}`;
    const { page, context } = await open(device, 'ls-dol-1', { extra });
    check(await page.locator(EXAMPLE_CONTROLS).count() === 0, `${where}: no player, no example and no offer of one`);
    check(await page.getByRole('button', { name: /Try a similar one|See a similar problem worked/ }).count() === 0, `${where}: no control for it`);
    if (await page.locator('[data-hint-control]').count()) {
      await page.locator('[data-hint-control]').click();
      await page.waitForTimeout(200);
      check(await page.locator(EXAMPLE_CONTROLS).count() === 0 && await page.getByRole('button', { name: /Try a similar one/ }).count() === 0, `${where}: the Hint panel offers none`);
    } else {
      check(extra === '', `${where}: no Hint control`);
    }
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const leaked = EXAMPLE_PLAYER_LEAK_TEXTS.filter((text) => html.includes(text));
    check(leaked.length === 0, `${where}: none of the player's words in the document`, leaked.join(' | '));
    await shot(page, `dol-nothing${extra ? '-replayed' : ''}-${at}`);
    await context.close();
  }
}

/* ------------------------------------- Read aloud and Translate on a slide */
{
  const device = DEVICES[0];
  // The built-in sibling's sentences are in the Spanish pack; a teacher's own
  // words are not, and the student is told so rather than given a dead button.
  const builtIn = await open(device, 'ls-cw-2', { extra: '&support=translate' });
  const player = playerOf(builtIn.page);
  check(await player.getByRole('button', { name: /^Read the worked example, step 1 of \d aloud$/ }).count() === 1, 'translate: Read aloud is on the slide, named for it');
  const translate = player.locator('[data-translate-ready]');
  check(await translate.count() === 1, 'translate: Translate is ready for the built-in sibling\'s step');
  await translate.click();
  await builtIn.page.waitForTimeout(300);
  check(await player.locator('[data-translated-text][lang="es"]').count() === 1, 'translate: the step is shown in Spanish');
  await player.locator('[data-example-next]').click();
  await builtIn.page.waitForTimeout(300);
  check(await player.locator('[data-translated-text]').count() === 0 && await player.getByRole('button', { name: /^Read the worked example, step 2 of \d aloud$/ }).count() === 1, 'translate: the next slide has its own Read aloud and Translate');
  await builtIn.context.close();

  const authored = await open(device, 'ls-cw-4', { extra: '&support=translate' });
  const actions = playerOf(authored.page).locator('[data-supported-text-actions]');
  check(await actions.getByRole('button', { name: /^Read the worked example, step 1 of 4 aloud$/ }).count() === 1, 'translate: Read aloud on the authored step');
  check(await actions.locator('[data-translate-ready], [data-translation-unavailable]').count() === 1, 'translate: Translate, or one plain line that it is not available for this text');
  await authored.context.close();
}

/* ------------------- Dark mode, forced colours, reduced motion, 200% text */
{
  const desktop = DEVICES[0];
  const dark = await open(desktop, 'ls-cw-4', { context: { colorScheme: 'dark' } });
  await dark.page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
  await dark.page.waitForTimeout(300);
  const luminance = await playerOf(dark.page).locator('[data-example-slide-body]').evaluate((element) => {
    const parse = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const light = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const style = getComputedStyle(element);
    return { text: light(parse(getComputedStyle(element.querySelector('p:nth-of-type(2)') || element).color)), surface: light(parse(style.backgroundColor)) };
  });
  check(luminance.surface < 0.35 && luminance.text > 0.6, 'dark mode: the slide is light text on a dark surface', JSON.stringify(luminance));
  await playerOf(dark.page).scrollIntoViewIfNeeded();
  await shot(dark.page, 'classwork-opens-dark-desktop');
  await dark.context.close();

  const forced = await open(desktop, 'ls-cw-4', { context: { forcedColors: 'active' } });
  const borders = await playerOf(forced.page).evaluate((element) => ['[data-example-slide-body]', '[data-example-back]', '[data-example-next]'].map((selector) => {
    const style = getComputedStyle(element.querySelector(selector));
    return { selector, width: parseFloat(style.borderTopWidth), line: style.borderTopStyle };
  }));
  check(borders.every((border) => border.width >= 1 && border.line !== 'none'), 'forced colours: the slide and its buttons keep a border to be seen by', JSON.stringify(borders));
  check(/Step 1 of 4/i.test(await playerOf(forced.page).innerText()) && /Why:/.test(await playerOf(forced.page).innerText()), 'forced colours: the place and "Why" are words, not colour');
  await playerOf(forced.page).scrollIntoViewIfNeeded();
  await shot(forced.page, 'classwork-opens-forced-colours-desktop');
  await forced.context.close();

  const reduced = await open(desktop, 'ls-cw-4', { context: { reducedMotion: 'reduce' } });
  const moving = await playerOf(reduced.page).evaluate((element) => [element, ...element.querySelectorAll('*')].filter((node) => {
    const style = getComputedStyle(node);
    return node.tagName !== 'MATH-SPAN' && !node.closest('math-span') && (style.animationName !== 'none' || parseFloat(style.transitionDuration) > 0);
  }).map((node) => node.tagName));
  check(moving.length === 0, 'reduced motion: nothing in the player animates or glides', moving.join(' '));
  await playerOf(reduced.page).locator('[data-example-next]').click();
  check(await slideOf(reduced.page) === '2', 'reduced motion: the slide changes at once');
  await reduced.context.close();

  const phone = DEVICES[1];
  const large = await open(phone, 'ls-cw-4', { textScale: 2 });
  const player = playerOf(large.page);
  check(await player.count() === 1, 'phone at 200% text: the example opens');
  await noSidewaysScroll(large.page, 'phone at 200% text, step 1');
  const fits = await player.evaluate((element) => [...element.querySelectorAll('button, [data-example-slide-body]')].every((node) => {
    const box = node.getBoundingClientRect();
    return box.left >= -1 && box.right <= window.innerWidth + 1;
  }));
  check(fits, 'phone at 200% text: the slide and every button fit the width');
  check(await inView(large.page, player.locator('[data-example-next]')), 'phone at 200% text: Next can be reached');
  await player.scrollIntoViewIfNeeded();
  await shot(large.page, 'classwork-opens-200-percent-text-phone');
  for (let step = 0; step < 4; step += 1) await player.locator('[data-example-next]').click();
  check(await slideOf(large.page) === 'your-turn', 'phone at 200% text: stepped through to Your turn');
  await noSidewaysScroll(large.page, 'phone at 200% text, Your turn');
  await large.context.close();
}

await browser.close();
console.log(`\nScreenshots: ${ARTIFACTS}`);
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n${failures.map((line) => `  - ${line}`).join('\n')}`);
  process.exit(1);
}
console.log('\nThe worked example opens by itself on Classwork, plays on request on Practice, and never reaches a DOL.');

// THE WORKED-EXAMPLE PLAYER AND THE SECTION RULES (WE-A; WORKED_EXAMPLES.md).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/workedExamplePlayer.mjs
//
// In the real QuestionEngine (the feedbackTeaches harness), through rendered
// controls only, at 1366×768 and on a 390×844 touch phone:
//
//   classwork   on the first question on a new skill the example is open
//               before anything is pressed, and says why; it does not take
//               the cursor. One slide at a time: the problem, each step, the
//               answer. It is announced to a screen reader, and recorded as shown
//               (workedExampleShown), not as help asked for: the attempt stays
//               independent. Opened again by the student, it is workedExampleUsed.
//               A later question on the skill opens none by itself;
//   keyboard    Tab reaches Back and Next; Enter and Space play it forward
//               and back; each slide is announced in a polite live region;
//               the last slide's button is "Your turn", which folds the
//               example away and puts the cursor in the student's own answer;
//   practice    nothing opens by itself; "Try a similar one" plays the same
//               player; a right answer after it is graded right, with the
//               same credit as without it, and recorded as workedExampleUsed;
//   failure     if the player's chunk cannot be fetched, the question stays and
//               the whole example is shown as a list in its place;
//   never       on a DOL, quiz or test, and on a DOL practised after its due
//               date, there is no example, no offer of one and none of the
//               player's words anywhere in the document, before or after a
//               miss;
//   supports    Read aloud is on every slide and Translate shows the step in
//               Spanish, for the student entitled to them;
//   display     nothing scrolls sideways and no control is clipped on the
//               phone, at 200% browser text, in the dark theme (text contrast
//               4.5:1) and in forced colours (every control keeps a border,
//               and Back's "not available" is a dashed edge, not a colour).
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/workedExamplePlayer.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';
import { ASSESSMENT_LEAK_TEXTS } from './support/assessmentLadderWords.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/workedExamplePlayer');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${String(detail).replace(/\s+/g, ' ')}` : ''}`);
  if (!ok) failures.push(label);
};

const DESKTOP = { name: 'desktop', viewport: { width: 1366, height: 768 } };
const PHONE = { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DEVICES = [DESKTOP, PHONE];

let runs = 0;
const open = async (device, query, { contextOptions = {}, textScale = 1, theme = null } = {}) => {
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile || false,
    hasTouch: device.hasTouch || false,
    reducedMotion: 'reduce',
    ...contextOptions,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, String(error)));
  if (textScale !== 1) {
    // The browser's text-size setting (WCAG 1.4.4), as studentShellLargeText does it.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * textScale), fixed: Math.round(13 * textScale) } });
  }
  runs += 1;
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${runs}`, { waitUntil: 'networkidle' });
  if (theme) await page.evaluate((scheme) => { document.documentElement.dataset.theme = scheme; document.documentElement.style.colorScheme = scheme; }, theme);
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(900);
  return { page, context };
};

// The player in the work (Work View's Help drawer keeps a panel of its own, closed here).
const player = (page) => page.locator('.mathmaster-hint-panel [data-worked-example-player]');
const slideState = (page) => player(page).first().evaluate((root) => ({
  number: Number(root.dataset.exampleSlideNumber),
  count: Number(root.dataset.exampleSlideCount),
  kind: root.dataset.exampleSlideKind,
  label: root.querySelector('[data-example-slide-label]')?.textContent || '',
  text: root.querySelector('[data-example-slide]')?.innerText.replace(/\s+/g, ' ').trim() || '',
  live: root.querySelector('[data-example-slide]')?.getAttribute('aria-live'),
  atomic: root.querySelector('[data-example-slide]')?.getAttribute('aria-atomic'),
  next: root.querySelector('[data-example-next]')?.textContent.trim() || '',
  backDisabled: root.querySelector('[data-example-back]')?.getAttribute('aria-disabled') === 'true',
  focusOn: document.activeElement?.hasAttribute('data-example-next') ? 'next' : document.activeElement?.hasAttribute('data-example-back') ? 'back' : 'elsewhere',
}));
const answer = async (page, value) => {
  const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
  await field.waitFor();
  await field.evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await page.waitForTimeout(250);
};
const submit = async (page) => {
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForTimeout(700);
};
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
// Every control and line of the player lies inside the player, and the player inside the screen's width.
const fitsItsBox = async (page, where) => {
  const problems = await player(page).first().evaluate((root) => {
    const found = [];
    const box = root.getBoundingClientRect();
    if (box.left < -1 || box.right > document.documentElement.clientWidth + 1) found.push(`player ${Math.round(box.left)}..${Math.round(box.right)} of ${document.documentElement.clientWidth}`);
    root.querySelectorAll('button, p, [data-example-progress]').forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return;
      if (rect.left < box.left - 1 || rect.right > box.right + 1) found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" leaves the player`);
      if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== 'visible') found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" is clipped`);
    });
    root.querySelectorAll('button').forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.height < 43.5) found.push(`button "${element.textContent.trim()}" is ${Math.round(rect.height)}px tall`);
    });
    return found;
  });
  check(problems.length === 0, `${where}: the player's controls and text fit`, problems.join('; '));
};
// The whole document's text, labels included, as the assessment leak gate reads it.
const documentText = (page) => page.evaluate(() => [
  document.documentElement.innerText,
  ...[...document.querySelectorAll('[aria-label], [title], [alt]')].flatMap((element) => [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')]),
  ...[...document.querySelectorAll('*')].filter((element) => element.children.length === 0).map((element) => element.textContent),
].filter(Boolean).join('\n'));
const PLAYER_WORDS = ['A similar problem, worked out', 'Try a similar one', 'See a similar problem worked', 'Your turn', 'Worked example', 'New skill. Here is one like it', 'This problem is like yours', 'Loading the example'];

/* --------------------------------------------- classwork, a new skill: opens */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=multi&role=classwork&section=classwork&newskill=1');
  const where = `${device.name} classwork, new skill`;
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, `${where}: the example is open before anything is pressed`);
  if (await player(page).count() !== 1) { await context.close(); continue; }
  check(await player(page).locator('[data-example-opened-by-itself]').count() === 1, `${where}: it says why it opened`);
  check(await page.locator('.mathmaster-top-panel-row .mathmaster-hint-panel [data-similar-example]').count() === 1, `${where}: it is at the top of the work, above the question`);
  let state = await slideState(page);
  check(state.number === 1 && state.kind === 'problem' && state.count >= 3, `${where}: it starts on the problem`, JSON.stringify(state));
  check(state.live === 'polite' && state.atomic === 'true', `${where}: the slide is a polite live region read whole`);
  check(state.backDisabled && state.next === 'Next', `${where}: Back is not available on the first slide; Next is`);
  check(state.focusOn === 'elsewhere', `${where}: opening by itself does not take the cursor`);
  // A screen reader is told: a polite region that was there, empty, before it opened.
  const announced = await page.locator('[data-example-announcement]').evaluateAll((regions) => regions.map((region) => ({ live: region.getAttribute('aria-live'), text: region.textContent.trim() })));
  check(announced.length === 1 && announced[0].live === 'polite' && /worked example opened/.test(announced[0].text), `${where}: the opening is announced in a polite live region`, JSON.stringify(announced));
  // The student's own question is on the same screen, not this problem.
  const own = await page.locator('.mathmaster-question-tool-workspace math-field').count();
  check(own >= 1, `${where}: the student's own answer box is still there`);
  check(!/\(1, 2\) and \(5, 5\)/.test(state.text), `${where}: the example is not the student's item`, state.text.slice(0, 120));
  await noSidewaysScroll(page, where);
  await fitsItsBox(page, where);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-classwork-open.png`) });

  // One slide at a time, to the answer.
  const seen = [state.text];
  const kinds = [state.kind];
  for (let step = 1; step < state.count; step += 1) {
    await player(page).locator('[data-example-next]').click();
    await page.waitForTimeout(120);
    const now = await slideState(page);
    check(now.number === step + 1, `${where}: Next shows slide ${step + 1}`, JSON.stringify(now).slice(0, 160));
    check(!seen.includes(now.text), `${where}: slide ${step + 1} is a new move`);
    check(await player(page).locator('[data-example-slide]').count() === 1, `${where}: one slide at a time`);
    check(await player(page).locator('[data-example-problem]').count() === 1, `${where}: the problem stays in sight on slide ${step + 1}`);
    seen.push(now.text);
    kinds.push(now.kind);
    state = now;
  }
  check(kinds.at(-1) === 'answer' && kinds.slice(1, -1).every((kind) => kind === 'step'), `${where}: the problem, each step, then the answer`, kinds.join(' '));
  check(/Answer:/.test(state.text) && state.next === 'Your turn', `${where}: the last slide gives the answer and "Your turn"`, state.text.slice(0, 120));
  check(!/3\/4|0\.75/.test(seen.join(' ')), `${where}: no slide states the student's answer`);
  await fitsItsBox(page, `${where}, last slide`);
  // Back goes back, and Next comes forward again.
  await player(page).locator('[data-example-back]').click();
  await page.waitForTimeout(120);
  check((await slideState(page)).number === state.count - 1, `${where}: Back shows the slide before`);
  await player(page).locator('[data-example-next]').click();
  await page.waitForTimeout(120);
  // Your turn: the example folds away and the student's work has the cursor (a laptop; a phone raises no keyboard unasked).
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-worked-example-player]').count() === 0 && await page.locator('[data-similar-example]').count() === 0, `${where}: "Your turn" folds the example away, everywhere`);
  if (!device.isMobile) {
    const inWork = await page.evaluate(() => Boolean(document.activeElement?.closest('.mathmaster-question-tool-workspace')) && document.activeElement?.tagName.toLowerCase() === 'math-field');
    check(inWork, `${where}: the cursor is in the student's own answer box`);
  }
  // Nobody asked for it: the attempt that follows is graded as ever and stays independent, with the
  // example recorded as shown, apart from one asked for.
  await answer(page, '3/4');
  await submit(page);
  const graded = await page.evaluate(() => window.__mmGrades.map((entry) => ({ isCorrect: entry.isCorrect, used: entry.supportUsage?.workedExampleUsed, shown: entry.supportUsage?.workedExampleShown, independent: entry.supportUsage?.isMathematicallyIndependent })));
  check(graded.length === 1 && graded[0].isCorrect === true, `${where}: the right answer is graded right`, JSON.stringify(graded));
  check(graded[0]?.shown === 'auto' && graded[0]?.used === false && graded[0]?.independent === true, `${where}: recorded as shown by itself, not as help asked for, and the attempt is independent`, JSON.stringify(graded));
  await context.close();
}

/* ------------------ classwork: shown by itself, then opened again by the student */
{
  const { page, context } = await open(DESKTOP, 'q=multi&role=classwork&section=classwork&newskill=1');
  const where = 'desktop classwork, opened again';
  await player(page).first().waitFor();
  const count = (await slideState(page)).count;
  for (let step = 1; step < count; step += 1) { await player(page).locator('[data-example-next]').click(); await page.waitForTimeout(80); }
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-hint-control]').click();
  await page.waitForTimeout(300);
  await page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' }).click();
  await player(page).first().waitFor();
  check(await player(page).locator('[data-example-opened-by-itself]').count() === 0, `${where}: asked for, it no longer says it opened by itself`);
  await answer(page, '3/4');
  await submit(page);
  const graded = await page.evaluate(() => window.__mmGrades.map((entry) => ({ isCorrect: entry.isCorrect, used: entry.supportUsage?.workedExampleUsed, shown: entry.supportUsage?.workedExampleShown, independent: entry.supportUsage?.isMathematicallyIndependent })));
  check(graded.length === 1 && graded[0].used === true && graded[0].independent === false && graded[0].shown === 'auto', `${where}: an example the student opens again is workedExampleUsed, as it always was`, JSON.stringify(graded));
  await context.close();
}

/* ----------------------- the player cannot load: the question stays, with the example */
for (const device of DEVICES) {
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const where = `${device.name} classwork, the player's chunk fails`;
  // The lazy chunk, as a stale tab after a release or a school network loses it.
  let refused = 0;
  await page.route(/WorkedExamplePlayer/, (route) => { refused += 1; return route.abort('failed'); });
  runs += 1;
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?q=multi&role=classwork&section=classwork&newskill=1&run=${Date.now()}-${runs}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  const whole = page.locator('.mathmaster-hint-panel [data-example-whole]');
  await whole.first().waitFor({ timeout: 8000 }).catch(() => {});
  check(refused >= 1, `${where}: the chunk was asked for and refused`, String(refused));
  check(await whole.count() === 1 && await page.locator('[data-worked-example-player]').count() === 0, `${where}: the whole example is shown as a list in the player's place`);
  check(await whole.locator('ol li').count() >= 2 && /Answer:/.test(await whole.first().innerText().catch(() => '')), `${where}: every step and the answer are there`);
  const text = await page.evaluate(() => document.body.innerText);
  check(!/did not load/i.test(text) && await page.locator('.mathmaster-question-tool-workspace math-field').count() >= 1, `${where}: the question is still there, with its answer box`);
  await answer(page, '3/4');
  await submit(page);
  const graded = await page.evaluate(() => window.__mmGrades.map((entry) => entry.isCorrect));
  check(graded.length === 1 && graded[0] === true, `${where}: it can still be answered and graded`, JSON.stringify(graded));
  await noSidewaysScroll(page, where);
  await context.close();
}

/* ------------------------- classwork, a later question on the skill: on request */
{
  const { page, context } = await open(DESKTOP, 'q=multi&role=classwork&section=classwork');
  check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, 'desktop classwork, same skill again: nothing opens by itself');
  await page.locator('[data-hint-control]').click();
  await page.waitForTimeout(300);
  check(await page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' }).count() === 1, 'desktop classwork, same skill again: the example is there on request');
  await context.close();
}

/* --------------------------------------------------------- the keyboard only */
{
  const { page, context } = await open(DESKTOP, 'q=multi&role=classwork&section=classwork&newskill=1');
  const where = 'desktop keyboard';
  await player(page).first().waitFor();
  // Tab from the top of the page reaches Back, then Next, in that order.
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const order = [];
  for (let presses = 0; presses < 40 && !order.includes('next'); presses += 1) {
    await page.keyboard.press('Tab');
    const on = await page.evaluate(() => (document.activeElement?.hasAttribute('data-example-back') ? 'back' : document.activeElement?.hasAttribute('data-example-next') ? 'next' : null));
    if (on) order.push(on);
  }
  check(order.join(' ') === 'back next', `${where}: Tab reaches Back, then Next`, order.join(' '));
  const focusRing = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });
  check(focusRing, `${where}: the focused button shows a focus ring`);
  const first = await slideState(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  let state = await slideState(page);
  check(state.number === 2 && state.focusOn === 'next', `${where}: Enter on Next plays the next slide, and focus stays on Next`, JSON.stringify(state).slice(0, 140));
  check(state.text !== first.text && /^Step 1 of/.test(state.label), `${where}: the live region now holds step 1`, state.label);
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  check((await slideState(page)).number === 3, `${where}: Space plays the next slide too`);
  await page.keyboard.press('Shift+Tab');
  check((await slideState(page)).focusOn === 'back', `${where}: Shift+Tab reaches Back`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  state = await slideState(page);
  check(state.number === 2 && state.focusOn === 'back', `${where}: Enter on Back goes back, and focus stays on Back`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  state = await slideState(page);
  check(state.number === 1 && state.backDisabled && state.focusOn === 'back', `${where}: on the first slide Back stays where focus is, and says it is not available`);
  await page.keyboard.press('Enter');
  check((await slideState(page)).number === 1, `${where}: Back does nothing on the first slide`);
  // Forward to the end by keyboard, then "Your turn".
  await page.keyboard.press('Tab');
  for (let step = 1; step < state.count; step += 1) { await page.keyboard.press('Enter'); await page.waitForTimeout(100); }
  state = await slideState(page);
  check(state.number === state.count && state.next === 'Your turn' && state.focusOn === 'next', `${where}: the same button is "Your turn" on the last slide, still focused`, JSON.stringify(state).slice(0, 140));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    player: document.querySelectorAll('[data-worked-example-player]').length,
    inWork: Boolean(document.activeElement?.closest('.mathmaster-question-tool-workspace')) && document.activeElement?.tagName.toLowerCase() === 'math-field',
  }));
  check(after.player === 0 && after.inWork, `${where}: "Your turn" by keyboard puts the cursor in the student's answer box`, JSON.stringify(after));
  await context.close();
}

/* -------------------------------- practice: on request, and the same score */
const practiceCredit = {};
for (const device of DEVICES) {
  for (const withExample of [false, true]) {
    const { page, context } = await open(device, 'q=multi&role=practice&section=practice&newskill=1');
    const where = `${device.name} practice${withExample ? ', example opened' : ''}`;
    check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, `${where}: nothing opens by itself`);
    check(await page.locator('[data-example-announcement]').count() === 0, `${where}: no announcement region where nothing opens by itself`);
    if (withExample) {
      await page.locator('[data-hint-control]').click();
      await page.waitForTimeout(300);
      await page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' }).click();
      await player(page).first().waitFor();
      const state = await slideState(page);
      check(state.number === 1 && state.kind === 'problem', `${where}: "Try a similar one" opens the player on the problem`);
      check(await player(page).locator('[data-example-opened-by-itself]').count() === 0, `${where}: asked for, it does not say it opened by itself`);
      for (let step = 1; step < state.count; step += 1) { await player(page).locator('[data-example-next]').click(); await page.waitForTimeout(100); }
      await fitsItsBox(page, where);
      await noSidewaysScroll(page, where);
      await player(page).locator('[data-example-your-turn]').click();
      await page.waitForTimeout(400);
      check(await player(page).count() === 0, `${where}: "Your turn" folds it away`);
    }
    // The same work either way: one miss, then right.
    await answer(page, '5');
    await submit(page);
    await answer(page, '3/4');
    await submit(page);
    const graded = await page.evaluate(() => window.__mmGrades.map((entry) => ({ isCorrect: entry.isCorrect, used: entry.supportUsage?.workedExampleUsed === true })));
    check(graded.length === 2 && graded[0].isCorrect === false && graded[1].isCorrect === true, `${where}: a miss, then right, graded as such`, JSON.stringify(graded));
    check(graded.every((entry) => entry.used === withExample), `${where}: workedExampleUsed is ${withExample}`, JSON.stringify(graded));
    const outcome = (await page.locator('[role="status"]').filter({ hasText: /Correct!/ }).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    practiceCredit[`${device.name}|${withExample}`] = { verdicts: graded.map((entry) => entry.isCorrect).join(','), outcome };
    await context.close();
  }
  const without = practiceCredit[`${device.name}|false`];
  const withIt = practiceCredit[`${device.name}|true`];
  check(Boolean(without?.outcome) && without.outcome === withIt?.outcome && without.verdicts === withIt.verdicts, `${device.name} practice: the outcome shown is the same with the example opened`, `${without?.outcome} / ${withIt?.outcome}`);
}

/* ------------------------------------ never on a DOL, quiz or test */
for (const [role, section] of [['dol', 'dol'], ['quiz', 'quiz'], ['test', 'test'], ['practice', 'dol'], ['practice', 'quiz'], ['practice', 'test'], ['classwork', 'dol']]) {
  const { page, context } = await open(DESKTOP, `q=multi&role=${role}&section=${section}&newskill=1`);
  const where = `${section} section run as ${role}`;
  const controls = () => page.evaluate(() => ({
    player: document.querySelectorAll('[data-worked-example-player]').length,
    example: document.querySelectorAll('[data-similar-example]').length,
    offer: document.querySelectorAll('[data-similar-offer]').length,
    openedByItself: document.querySelectorAll('[data-example-opened-by-itself]').length,
    announcement: document.querySelectorAll('[data-example-announcement]').length,
    whole: document.querySelectorAll('[data-example-whole]').length,
  }));
  const none = (found) => Object.values(found).every((count) => count === 0);
  let found = await controls();
  check(none(found), `${where}: no example and no offer of one on arrival`, JSON.stringify(found));
  let text = await documentText(page);
  let leaked = PLAYER_WORDS.filter((word) => text.includes(word));
  check(leaked.length === 0, `${where}: none of the example's words anywhere in the document`, leaked.join(' | '));
  // The help panel, where one is offered: still no example in it.
  const hint = page.locator('[data-hint-control]');
  if (await hint.count()) {
    await hint.first().click();
    await page.waitForTimeout(300);
    found = await controls();
    check(none(found) && await page.locator('button', { hasText: 'Try a similar one' }).count() === 0, `${where}: the help panel offers no example`, JSON.stringify(found));
  }
  // After a miss, where the outcome is shown: still none.
  await answer(page, '5');
  await submit(page);
  found = await controls();
  check(none(found), `${where}: no example and no offer of one after an answer`, JSON.stringify(found));
  text = await documentText(page);
  leaked = PLAYER_WORDS.filter((word) => text.includes(word));
  check(leaked.length === 0, `${where}: none of the example's words after an answer`, leaked.join(' | '));
  if (role === section) {
    // On the assessment itself, nothing of the classroom ladder either (the leak gate's own list).
    const ladder = ASSESSMENT_LEAK_TEXTS.filter((word) => text.includes(word));
    check(ladder.length === 0, `${where}: nothing of the feedback ladder in the document`, ladder.slice(0, 3).join(' | '));
  }
  await context.close();
}

/* ------------------------------------------------ Read aloud and Translate */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=multi&role=classwork&section=classwork&newskill=1&support=translate');
  const where = `${device.name} Read aloud and Translate`;
  await player(page).first().waitFor();
  await page.evaluate(() => {
    window.__mmSpoken = [];
    const speak = window.speechSynthesis?.speak?.bind(window.speechSynthesis);
    if (window.speechSynthesis) window.speechSynthesis.speak = (utterance) => { window.__mmSpoken.push({ text: utterance.text, lang: utterance.lang }); try { speak?.(utterance); } catch { /* no voice in this browser */ } };
  });
  const state = await slideState(page);
  let translated = 0;
  for (let step = 0; step < state.count; step += 1) {
    const now = await slideState(page);
    const read = player(page).locator('button', { hasText: 'Read' });
    check(await read.count() === 1, `${where}: slide ${now.number} has Read aloud`);
    const name = await read.first().getAttribute('aria-label');
    check(name === `Read the worked example, ${now.label.toLowerCase()} aloud`, `${where}: its name says which slide`, String(name));
    const translate = player(page).locator('[data-translate-ready]');
    if (await translate.count()) {
      await translate.first().click();
      await page.waitForTimeout(150);
      const shown = player(page).locator('[data-translated-text]');
      const lang = await shown.first().getAttribute('lang').catch(() => null);
      const spanish = (await shown.first().innerText().catch(() => '')).trim();
      check(lang === 'es' && spanish.length > 3, `${where}: slide ${now.number} is shown in Spanish, marked lang="es"`, spanish.slice(0, 80));
      translated += 1;
    } else {
      check(await player(page).locator('[data-translation-unavailable]').count() === 1, `${where}: slide ${now.number} says it has no Spanish yet`);
    }
    if (step < state.count - 1) {
      await player(page).locator('[data-example-next]').click();
      await page.waitForTimeout(150);
      check(await player(page).locator('[data-translated-text]').count() === 0, `${where}: a translation shown for one slide is not carried to the next`);
    }
  }
  check(translated >= 1, `${where}: at least one slide is translated`, `${translated} of ${state.count}`);
  await fitsItsBox(page, where);
  await noSidewaysScroll(page, where);
  // Read aloud says the slide on screen: its Spanish while that is showing, then its English.
  const lastSpoken = async () => (await page.evaluate(() => window.__mmSpoken)).at(-1) || null;
  const showingSpanish = await player(page).locator('[data-translated-text]').count() === 1;
  await player(page).locator('button', { hasText: 'Read' }).first().click();
  await page.waitForTimeout(200);
  let spoken = await lastSpoken();
  if (spoken && showingSpanish) check(/^Respuesta:/.test(spoken.text) && /^es/.test(spoken.lang), `${where}: Read aloud says the Spanish on screen, in Spanish`, `${spoken.lang} ${spoken.text.replace(/\s+/g, ' ').slice(0, 60)}`);
  if (showingSpanish) {
    await player(page).locator('[data-translate-ready]').first().click();
    await page.waitForTimeout(150);
    await player(page).locator('button', { hasText: 'Read' }).first().click();
    await page.waitForTimeout(200);
    spoken = await lastSpoken();
  }
  if (spoken) check(/^The answer\. Answer:/.test(spoken.text) && /Your question uses different numbers/.test(spoken.text), `${where}: Read aloud says the slide on screen, and that it is the student's turn`, spoken.text.replace(/\s+/g, ' ').slice(0, 80));
  await context.close();
}

/* ------------------------------------- 200% text, the dark theme, forced colours */
const walk = async (page, visit) => {
  const state = await slideState(page);
  for (let step = 0; step < state.count; step += 1) {
    await visit(await slideState(page));
    if (step < state.count - 1) { await player(page).locator('[data-example-next]').click(); await page.waitForTimeout(100); }
  }
};
for (const device of [DESKTOP, PHONE, { name: 'narrow', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]) {
  const { page, context } = await open(device, 'q=multi&role=classwork&section=classwork&newskill=1&support=translate', { textScale: 2 });
  const where = `${device.name} at 200% text`;
  await player(page).first().waitFor();
  const rootFont = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(rootFont >= 31, `${where}: the browser's text did grow`, `${rootFont}px`);
  await walk(page, async (state) => {
    await noSidewaysScroll(page, `${where}, slide ${state.number}`);
    await fitsItsBox(page, `${where}, slide ${state.number}`);
  });
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-200-text.png`) });
  await context.close();
}

// Contrast of each piece of the player's text against what is painted behind it.
const contrastProblems = (page) => player(page).first().evaluate((root) => {
  const parse = (value) => { const match = value.match(/rgba?\(([^)]+)\)/); if (!match) return null; const [r, g, b, a = '1'] = match[1].split(/[,/ ]+/).filter(Boolean); return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }; };
  const luminance = ({ r, g, b }) => { const channel = (value) => { const s = value / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const backgroundOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) { const colour = parse(getComputedStyle(node).backgroundColor); if (colour && colour.a > 0) { layers.push(colour); if (colour.a >= 1) break; } }
    const base = parse(getComputedStyle(document.documentElement).backgroundColor);
    return layers.reverse().reduce((under, top) => over(top, under), base && base.a > 0 ? { ...base, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  };
  const found = [];
  root.querySelectorAll('p, button, [data-example-progress], strong').forEach((element) => {
    if (!element.textContent.trim() || element.closest('.mm-math-spoken')) return;
    const style = getComputedStyle(element);
    const background = backgroundOf(element);
    const colour = over({ ...parse(style.color), a: (parse(style.color)?.a ?? 1) * Number(style.opacity || 1) }, background);
    const [light, dark] = [luminance(colour), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    // A control that is not available is exempt from 1.4.3; everything else needs 4.5:1.
    if (ratio < 4.5 && element.getAttribute('aria-disabled') !== 'true') found.push(`"${element.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
  });
  return found;
});
for (const theme of ['light', 'dark']) {
  for (const device of DEVICES) {
    const { page, context } = await open(device, 'q=multi&role=classwork&section=classwork&newskill=1&support=translate', { contextOptions: { colorScheme: theme }, theme });
    const where = `${device.name} ${theme} theme`;
    await player(page).first().waitFor();
    await walk(page, async (state) => {
      const problems = await contrastProblems(page);
      check(problems.length === 0, `${where}, slide ${state.number}: the player's text has 4.5:1 contrast`, problems.join('; '));
    });
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-${theme}.png`) });
    await context.close();
  }
}
for (const scheme of ['light', 'dark']) {
  const { page, context } = await open(DESKTOP, 'q=multi&role=classwork&section=classwork&newskill=1&support=translate', { contextOptions: { colorScheme: scheme, forcedColors: 'active' } });
  const where = `desktop forced colours (${scheme})`;
  await player(page).first().waitFor();
  check(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), `${where}: forced colours are on`);
  await player(page).locator('[data-example-next]').click();
  await page.waitForTimeout(100);
  const edges = await player(page).first().evaluate((root) => {
    const edge = (element) => { const style = getComputedStyle(element); return { style: style.borderTopStyle, width: parseFloat(style.borderTopWidth), colour: style.borderTopColor, background: style.backgroundColor, text: element.textContent.trim().slice(0, 20) }; };
    return {
      buttons: [...root.querySelectorAll('button')].map(edge),
      slide: edge(root.querySelector('[data-example-slide]')),
      why: Boolean(root.querySelector('[data-example-slide-label]')?.textContent.trim()),
    };
  });
  check(edges.buttons.length >= 2 && edges.buttons.every((button) => button.style !== 'none' && button.width >= 1 && button.colour !== button.background), `${where}: every button keeps a visible edge`, JSON.stringify(edges.buttons));
  check(edges.slide.style !== 'none' && edges.slide.width >= 1, `${where}: the slide keeps its edge`, JSON.stringify(edges.slide));
  check(edges.why, `${where}: where it is in the example is said in words`);
  // Back on the first slide: its "not available" is a dashed edge, not a colour.
  await player(page).locator('[data-example-back]').click();
  await page.waitForTimeout(100);
  const back = await player(page).locator('[data-example-back]').evaluate((element) => ({ style: getComputedStyle(element).borderTopStyle, disabled: element.getAttribute('aria-disabled') }));
  const next = await player(page).locator('[data-example-next]').evaluate((element) => getComputedStyle(element).borderTopStyle);
  check(back.disabled === 'true' && back.style === 'dashed' && next === 'solid', `${where}: Back's "not available" is a dashed edge, beside Next's solid one`, `${JSON.stringify(back)} ${next}`);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `forced-colours-${scheme}.png`) });
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nThe worked-example player: every check passed.');

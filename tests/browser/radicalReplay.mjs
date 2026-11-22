// THE RADICAL EQUATION REPLAY, WITH ITS FACTORING SLIDES (WE-D;
// docs/platform/WORKED_EXAMPLES.md).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/radicalReplay.mjs
//
// A published radical equations lesson (Algebra II Honors, Solving Radical
// Equations), in the real QuestionEngine (the feedbackTeaches harness),
// through rendered controls only, at 1366×768 and on a 390×844 touch phone:
//
//   classwork   Classwork 1 is a radical equation on the relation workspace.
//               A sibling equation opens by itself, above the student's own
//               board, one move per slide: isolate, square, multiply out,
//               collect to zero, the factoring slides in the sequence (its
//               quadratic has no number term, so the sibling's has none
//               either: three slides, by a common factor), each branch, then
//               every candidate checked in the first equation. The extraneous one is rejected on a slide of its
//               own. Then the answer and "Your turn";
//   faded       Classwork 2 is the next on the skill: the first move only;
//   practice    nothing opens by itself. On request the factor step is one
//               line with "Show how", which opens the factoring slides: two
//               more for x² + bx + c, four more for ax² + bx + c (six in all:
//               a·c, the pairs, split, group, the common binomial, zero product);
//   never       on the DOL there is no example, no board and none of its words;
//   keyboard, Read aloud, 200% text, the dark theme, forced colours.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/radicalReplay.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/radicalReplay');
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

const player = (page) => page.locator('.mathmaster-hint-panel [data-worked-example-player]');
const slideState = (page) => player(page).first().evaluate((root) => {
  const words = (element) => (element?.innerText || '').replace(/\s+/g, ' ').trim();
  const board = root.querySelector('[data-example-board]');
  return {
    number: Number(root.dataset.exampleSlideNumber),
    count: Number(root.dataset.exampleSlideCount),
    kind: root.dataset.exampleSlideKind,
    format: root.dataset.exampleFormat,
    faded: root.hasAttribute('data-example-faded'),
    label: words(root.querySelector('[data-example-slide-label]')),
    text: words(root.querySelector('[data-example-slide]')),
    next: words(root.querySelector('[data-example-next]')),
    openedText: words(root.querySelector('[data-example-opened-by-itself]')),
    board: board ? {
      kind: board.dataset.exampleBoard,
      operation: board.dataset.exampleBoardOperation,
      label: words(board.querySelector('[data-example-board-label]')),
      lines: [...board.querySelectorAll('[data-example-board-line]')].map((line) => ({
        id: line.dataset.exampleBoardLine,
        name: words(line.querySelector('p')),
        math: line.querySelectorAll('p')[1]?.textContent.replace(/\s+/g, ' ').trim() || '',
      })),
    } : null,
    focusOn: document.activeElement?.hasAttribute('data-example-next') ? 'next' : 'elsewhere',
  };
});
const next = async (page) => { await player(page).locator('[data-example-next]').click(); await page.waitForTimeout(140); };
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
const fitsItsBox = async (page, where) => {
  const problems = await player(page).first().evaluate((root) => {
    const found = [];
    const box = root.getBoundingClientRect();
    if (box.left < -1 || box.right > document.documentElement.clientWidth + 1) found.push(`player ${Math.round(box.left)}..${Math.round(box.right)} of ${document.documentElement.clientWidth}`);
    root.querySelectorAll('button, p, li, [data-example-progress]').forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0) return;
      if (rect.left < box.left - 1 || rect.right > box.right + 1) found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" leaves the player`);
      if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== 'visible') found.push(`${element.tagName} "${element.textContent.trim().slice(0, 30)}" is clipped`);
    });
    return found;
  });
  check(problems.length === 0, `${where}: the board's lines and the controls fit`, problems.join('; '));
};
const documentText = (page) => page.evaluate(() => [
  document.documentElement.innerText,
  ...[...document.querySelectorAll('[aria-label], [title], [alt]')].flatMap((element) => [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')]),
].filter(Boolean).join('\n'));
// The student's own board: the Step Algebra workspace under the example.
const ownBoard = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-tool-workspace')?.innerText || '').replace(/\s+/g, ' '));

const RADICAL_WORDS = ['Show how', 'Extraneous: rejected', 'Each factor equal to 0', 'factoring, 1 of', 'A similar problem, worked out', 'Try a similar one', 'in the first equation', 'Each side squared'];
// Every slide after the one showing, to the last: [{ label, text, board, showHow }].
const walk = async (page, where, { shots = null } = {}) => {
  const seen = [];
  let state = await slideState(page);
  for (let guard = 0; guard < 40 && state.next !== 'Your turn'; guard += 1) {
    await next(page);
    state = await slideState(page);
    state.showHow = await player(page).locator('[data-example-show-how]').count();
    seen.push(state);
    if (state.board) {
      check(state.board.lines.length >= 2 && state.board.lines.every((line) => line.name && line.math), where + ', slide ' + state.number + ': every line has its name in words and its mathematics', JSON.stringify(state.board.lines).slice(0, 160));
    }
    await fitsItsBox(page, where + ', slide ' + state.number);
    await noSidewaysScroll(page, where + ', slide ' + state.number);
    if (shots && shots[state.board?.kind === 'reject' ? 'reject' : state.label]) await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, shots[state.board?.kind === 'reject' ? 'reject' : state.label]) });
  }
  return seen;
};
const factoringLabels = (seen) => seen.map((state) => (/factoring, (\d+) of (\d+)$/.exec(state.label) || []).slice(1).join('/')).filter(Boolean);

/* ------------------------------------------- classwork: the whole replay */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=radical&role=classwork');
  const where = device.name + ' classwork, radical 1';
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, where + ': the replay is open before anything is pressed');
  if (await player(page).count() !== 1) { await context.close(); continue; }
  const first = await slideState(page);
  check(first.format === 'replay' && !first.faded && first.kind === 'problem', where + ': it is the tool replay, whole, starting from the problem', JSON.stringify({ format: first.format, faded: first.faded, kind: first.kind }));
  check(/New skill/.test(first.openedText), where + ': it says why it opened', first.openedText);
  check(/Check each candidate/.test(first.text) && !/x\s*\+\s*4/.test(first.text), where + ': the problem is a sibling, not the student\'s equation', first.text.slice(0, 90));
  check((await ownBoard(page)).length > 20, where + ': the student\'s own board is on the same screen');
  check(await page.locator('[data-example-show-how]').count() === 0, where + ': nothing is folded on Classwork');
  const seen = await walk(page, where, { shots: { reject: device.name + '-extraneous.png', 'Step 5 of 10: factoring, 1 of 3': device.name + '-factoring.png' } });
  check(first.count === 12 && seen.length === 11, where + ': the problem, ten steps and the answer', first.count + ' / ' + seen.length);
  // The student's quadratic is x² − 5x: the same method is a common factor, so the sibling's is too.
  check(factoringLabels(seen).join(' ') === '1/3 2/3 3/3', where + ': the three common-factor slides are in the sequence, in order', factoringLabels(seen).join(' '));
  const factoring = seen.filter((state) => /factoring/.test(state.label));
  check(/no number term/.test(factoring[0]?.text || '') && /common factor/.test(factoring[0]?.text || ''), where + ': factoring 1 says what to look for', (factoring[0]?.text || '').slice(0, 110));
  check(factoring[1]?.board?.lines.map((line) => line.name).join(' | ') === 'Start with | The common factor taken out | Multiplied back', where + ': factoring 2 is the common factor taken out, multiplied back', factoring[1]?.board?.lines.map((line) => line.name).join(' | '));
  check(factoring[2]?.board?.lines.map((line) => line.name).join(' | ') === 'Start with | Each factor equal to 0', where + ': factoring 3 is the zero product property', factoring[2]?.board?.lines.map((line) => line.name).join(' | '));
  const kinds = seen.filter((state) => state.board).map((state) => state.board.kind);
  check(kinds.filter((kind) => kind === 'reject').length === 1 && kinds.filter((kind) => kind === 'check').length === 1, where + ': one candidate is rejected and one checks', kinds.join(' '));
  const reject = seen.find((state) => state.board?.kind === 'reject');
  check(reject?.board.lines.map((line) => line.name).join(' | ') === 'The first equation | With the value put in | The two sides are not equal | Extraneous: rejected', where + ': the extraneous candidate is rejected on a slide of its own', reject?.board.lines.map((line) => line.name).join(' | '));
  check(/extraneous/i.test(reject?.text || '') && /Why:/.test(reject?.text || ''), where + ': the slide says why it is rejected');
  const holds = seen.find((state) => state.board?.kind === 'check');
  check(holds?.board.lines.at(-1).name === 'A solution', where + ': the other candidate is a solution', holds?.board.lines.map((line) => line.name).join(' | '));
  const moves = seen.filter((state) => state.board?.kind === 'move').map((state) => state.board);
  check(moves.slice(1).every((board, index) => board.lines[0].math === moves[index].lines.find((line, at, all) => at === all.length - 1 || line.name !== 'Multiplied back' && all[at + 1]?.name === 'Multiplied back').math), where + ': each move starts from the line the last one ended on');
  check(seen.filter((state) => state.kind === 'step').every((state) => /Why:/.test(state.text)), where + ': every step says why');
  const last = seen.at(-1);
  check(last.kind === 'answer' && /Answer:/.test(last.text) && last.next === 'Your turn', where + ': then the answer and "Your turn"', last.text.slice(0, 80));
  check(!last.text.includes(reject?.board.lines.at(-1).math || '\u0000'), where + ': the rejected value is not in the answer', last.text.slice(0, 80));
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-worked-example-player]').count() === 0, where + ': "Your turn" folds the replay away');
  check((await ownBoard(page)).length > 20, where + ': the student\'s own board is there to work on');
  await context.close();
}

/* --------------------------------- classwork, the next question: faded */
{
  const { page, context } = await open(DESKTOP, 'q=radical2&role=classwork');
  const where = 'desktop classwork, radical 2';
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, where + ': the faded example is open before anything is pressed');
  if (await player(page).count() === 1) {
    let state = await slideState(page);
    check(state.faded && state.count === 2 && /only the first part is worked for you/.test(state.openedText), where + ': the problem and the first move only', JSON.stringify({ faded: state.faded, count: state.count }));
    await next(page);
    state = await slideState(page);
    check(state.board?.kind === 'move' && /The rest is yours/.test(state.text) && state.next === 'Your turn', where + ': the first move, and the rest is the student\'s', state.label);
    const whole = await player(page).first().innerText();
    check(!/Answer:|Extraneous|A solution/.test(whole), where + ': a faded example shows no candidate and no answer');
    // Asked for, the whole example plays. Its quadratic is ax² + bx + c, like the student's: six slides, in the sequence.
    await player(page).locator('[data-example-your-turn]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-hint-control]').first().click();
    await page.waitForTimeout(300);
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' }).first().click();
    await player(page).first().waitFor();
    state = await slideState(page);
    check(!state.faded && state.kind === 'problem', where + ': asked for, the whole example plays', JSON.stringify({ faded: state.faded, count: state.count }));
    const seen = await walk(page, where + ', whole');
    check(factoringLabels(seen).join(' ') === '1/6 2/6 3/6 4/6 5/6 6/6', where + ': the six factoring slides are in the sequence, in order', factoringLabels(seen).join(' '));
    check(seen.every((entry) => !entry.showHow), where + ': nothing is folded on Classwork');
  }
  await context.close();
}

/* ------------------------------------- practice: on request, Show how */
for (const [query, device, count, added] of [['radicalpr', DESKTOP, 4, 2], ['radicalpr', PHONE, 4, 2], ['radicalac', DESKTOP, 6, 4], ['radicalac', PHONE, 6, 4]]) {
  const { page, context } = await open(device, 'q=' + query + '&role=practice');
  const where = device.name + ' practice (' + (count === 4 ? 'x² + bx + c' : 'ax² + bx + c') + ')';
  check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, where + ': nothing opens by itself');
  await page.locator('[data-hint-control]').first().click();
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  check(await offer.count() >= 1, where + ': the example is there on request');
  if (!await offer.count()) { await context.close(); continue; }
  await offer.first().click();
  await player(page).first().waitFor();
  let state = await slideState(page);
  const foldedCount = state.count;
  check(state.format === 'replay' && state.openedText === '', where + ': on request it is the replay', JSON.stringify({ format: state.format, count: state.count }));
  // To the factor step: one line, with Show how.
  let asking = null;
  for (let guard = 0; guard < 20 && !asking; guard += 1) {
    await next(page);
    state = await slideState(page);
    check(!/factoring, \d+ of/.test(state.label) || false, where + ', slide ' + state.number + ': no factoring slide is in the sequence yet', state.label);
    if (await player(page).locator('[data-example-show-how]').count()) asking = state;
  }
  check(Boolean(asking), where + ': the factor step has Show how');
  if (!asking) { await context.close(); continue; }
  check(asking.board?.label === 'Factor' && asking.board.lines.map((line) => line.name).join(' | ') === 'Start with | Factored | Multiplied back', where + ': the factor step is one line: the factors, multiplied back', asking.board?.lines.map((line) => line.name).join(' | '));
  const button = player(page).locator('[data-example-show-how]');
  const box = await button.boundingBox();
  check((await button.innerText()).trim() === 'Show how' && box.height >= 24 && box.width >= 24, where + ': "Show how" is a button of at least 24 px', JSON.stringify(box));
  await fitsItsBox(page, where + ', the factor step');
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, device.name + '-show-how-' + count + '.png') });
  // Keyboard: Enter on Show how opens the slides.
  await button.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  state = await slideState(page);
  check(state.count === foldedCount + added, where + ': Show how adds the ' + added + ' slides that were folded', foldedCount + ' → ' + state.count);
  check(new RegExp('factoring, 1 of ' + count + '$').test(state.label), where + ': and lands on the first factoring slide', state.label);
  check(await player(page).locator('[data-example-show-how]').count() === 0, where + ': the button is gone once they are shown');
  const seen = [state, ...await walk(page, where + ', shown')];
  check(factoringLabels(seen).join(' ') === Array.from({ length: count }, (_, index) => (index + 1) + '/' + count).join(' '), where + ': all ' + count + ' factoring slides, in order', factoringLabels(seen).join(' '));
  if (count === 6) {
    const names = seen.filter((entry) => /factoring/.test(entry.label)).map((entry) => entry.board?.lines.at(-1).name === 'Multiplied back' ? entry.board.lines.at(-2).name : entry.board?.lines.at(-1).name || '');
    check(/Multiply a and c/i.test(seen[0].text) || /Multiply \S+ and \S+:/.test(seen[0].text), where + ': factoring 1 is a·c', seen[0].text.slice(0, 80));
    check(/The factor pairs of/.test(seen[1].text), where + ': factoring 2 is the factor pairs');
    check(names.slice(2).join(' | ') === 'The middle term as two terms | Each pair with its common factor taken out | The common binomial taken out | Each factor equal to 0', where + ': then split, group, the common binomial, the zero product', names.slice(2).join(' | '));
  }
  check(seen.at(-1).kind === 'answer' && seen.at(-1).next === 'Your turn', where + ': it still ends on the answer and "Your turn"');
  await context.close();
}

/* ------------- a Classwork section revisited as practice (after its due date) */
{
  const { page, context } = await open(DESKTOP, 'q=radical2&role=practice');
  const where = 'desktop Classwork revisited as practice';
  check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, where + ': nothing opens by itself');
  await page.locator('[data-hint-control]').first().click();
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  check(await offer.count() >= 1, where + ': the example is there on request');
  if (await offer.count()) {
    await offer.first().click();
    await player(page).first().waitFor();
    const seen = await walk(page, where);
    check(factoringLabels(seen).length === 0, where + ': the factoring slides are not in the sequence', factoringLabels(seen).join(' '));
    check(seen.filter((state) => state.showHow).length === 1, where + ': the factor step has Show how', String(seen.filter((state) => state.showHow).length));
  }
  await context.close();
}

/* ---------------------------------------------------------- the DOL: never */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=radicaldol&role=dol');
  const where = device.name + ' DOL';
  check(await page.locator('[data-worked-example-player], [data-similar-example], [data-example-board], [data-example-whole], [data-example-show-how]').count() === 0, where + ': no example, no board of one and no Show how');
  const text = await documentText(page);
  const leaked = RADICAL_WORDS.filter((word) => text.includes(word));
  check(leaked.length === 0, where + ': none of the replay\'s words in the document', leaked.join(' | '));
  await context.close();
}

/* ------------------------------------------------------- the keyboard only */
{
  const { page, context } = await open(DESKTOP, 'q=radical&role=classwork');
  const where = 'desktop keyboard';
  await player(page).first().waitFor();
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  let reached = false;
  for (let presses = 0; presses < 60 && !reached; presses += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => Boolean(document.activeElement?.hasAttribute('data-example-next')));
  }
  check(reached, `${where}: Tab reaches Next`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const state = await slideState(page);
  check(state.number === 2 && state.focusOn === 'next' && Boolean(state.board), `${where}: Enter plays the first move, and focus stays on Next`, JSON.stringify({ number: state.number, focusOn: state.focusOn }));
  const live = await player(page).locator('[data-example-slide]').evaluate((region) => ({ live: region.getAttribute('aria-live'), atomic: region.getAttribute('aria-atomic'), holdsBoard: Boolean(region.querySelector('[data-example-board]')) }));
  check(live.live === 'polite' && live.atomic === 'true' && live.holdsBoard, `${where}: the move's lines are in the polite live region, read whole`, JSON.stringify(live));
  await context.close();
}

/* ------------------------------------------------------------- Read aloud */
{
  const { page, context } = await open(DESKTOP, 'q=radical&role=classwork&support=read');
  const where = 'desktop Read aloud';
  await player(page).first().waitFor();
  await page.evaluate(() => {
    window.__mmSpoken = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (utterance) => { window.__mmSpoken.push(utterance.text); };
  });
  await next(page);
  const read = player(page).locator('button', { hasText: 'Read' });
  check(await read.count() === 1, `${where}: a move has Read aloud`);
  const name = await read.first().getAttribute('aria-label').catch(() => null);
  check(name === 'Read the worked example, step 1 of 10 aloud', `${where}: its name says which move`, String(name));
  if (await read.count()) {
    await read.first().click();
    await page.waitForTimeout(250);
    const spoken = (await page.evaluate(() => window.__mmSpoken)).join(' ').replace(/\s+/g, ' ');
    if (spoken) check(/Step 1 of 10/.test(spoken) && /on both sides/.test(spoken) && /Why:/.test(spoken), `${where}: it reads the move as a sentence, then its why`, spoken.slice(0, 140));
  }
  await context.close();
}

/* ------------------------------- 200% text, the dark theme, forced colours */
for (const device of [DESKTOP, PHONE, { name: 'narrow', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]) {
  const { page, context } = await open(device, 'q=radical&role=classwork', { textScale: 2 });
  const where = `${device.name} at 200% text`;
  await player(page).first().waitFor();
  const rootFont = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(rootFont >= 31, `${where}: the browser's text did grow`, `${rootFont}px`);
  for (let slide = 2; slide <= 12; slide += 1) {
    await next(page);
    await noSidewaysScroll(page, `${where}, slide ${slide}`);
    await fitsItsBox(page, `${where}, slide ${slide}`);
  }
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-200-text.png`) });
  await context.close();
}
// Contrast of the board's text against what is painted behind it.
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
  root.querySelectorAll('[data-example-board] p').forEach((element) => {
    if (!element.textContent.trim()) return;
    const style = getComputedStyle(element);
    const background = backgroundOf(element);
    const colour = over({ ...parse(style.color), a: (parse(style.color)?.a ?? 1) * Number(style.opacity || 1) }, background);
    const [light, dark] = [luminance(colour), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    if (ratio < 4.5) found.push(`"${element.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
  });
  return found;
});
for (const theme of ['light', 'dark']) {
  for (const device of DEVICES) {
    const { page, context } = await open(device, 'q=radical&role=classwork', { contextOptions: { colorScheme: theme }, theme });
    const where = `${device.name} ${theme} theme`;
    await player(page).first().waitFor();
    await next(page);
    const problems = await contrastProblems(page);
    check(problems.length === 0, `${where}: the board's names and lines have 4.5:1 contrast`, problems.join('; '));
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-${theme}.png`) });
    await context.close();
  }
}
for (const scheme of ['light', 'dark']) {
  const { page, context } = await open(DESKTOP, 'q=radical&role=classwork', { contextOptions: { colorScheme: scheme, forcedColors: 'active' } });
  const where = `desktop forced colours (${scheme})`;
  await player(page).first().waitFor();
  check(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), `${where}: forced colours are on`);
  await next(page);
  const edges = await player(page).first().evaluate((root) => [...root.querySelectorAll('[data-example-board-line]')].map((line) => {
    const style = getComputedStyle(line);
    return { id: line.dataset.exampleBoardLine, style: style.borderLeftStyle, width: parseFloat(style.borderLeftWidth), named: Boolean(line.querySelector('p')?.textContent.trim()) };
  }));
  check(edges.length >= 3 && edges.every((edge) => edge.style !== 'none' && edge.width >= 1), `${where}: each line of the board keeps an edge`, JSON.stringify(edges));
  check(edges.every((edge) => edge.named), `${where}: each line is named in words, so nothing rests on colour`);
  check(edges.at(-1).style === 'solid' && edges.slice(0, -1).every((edge) => edge.style === 'dashed'), `${where}: the line the move ends on has a solid edge, the others dashed`, edges.map((edge) => edge.style).join(' '));
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `forced-colours-${scheme}.png`) });
  await context.close();
}


await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nThe radical equation replay: every check passed.');

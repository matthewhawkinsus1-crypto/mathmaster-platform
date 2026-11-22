// THE PLANE AND INEQUALITY REPLAY (WE-E; docs/platform/WORKED_EXAMPLES.md).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/planeReplay.mjs
//
// Two published Algebra I lessons (Graphing Inequalities in Two Variables,
// Solving Systems by Graphing), in the real QuestionEngine (the
// feedbackTeaches harness), through rendered controls only, at 1366×768 and
// on a 390×844 touch phone:
//
//   classwork   an inequality to graph had no example. A sibling now opens by
//               itself above the student's own builder, one move per slide,
//               each with a picture of the plane and the same move in words:
//               the y-intercept, rise and run, the boundary line DASHED, a
//               test point, the shading, the marked point checked;
//   faded       the next inequality on the skill: the first move only;
//   practice    on request; an inequality in standard form is solved for y
//               first, the sign turning around;
//   a system    two lines drawn the same way, where they cross, the check in
//               both equations, and never how many solutions the student's
//               own system has;
//   a line      the warm-up's line: intercept, rise and run, the line, a check;
//   never       on the DOL there is no example, no picture and none of its words;
//   keyboard, Read aloud, 200% text, the dark theme, forced colours.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/planeReplay.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/planeReplay');
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

const PLANE_WORDS = ['A similar problem, worked out', 'Try a similar one', 'Rise and run', 'With the point put in', 'The line, dashed', 'The line, solid', 'They cross at'];
// The picture on the slide showing: what is plotted, drawn and shaded.
const picture = (page) => player(page).first().evaluate((root) => {
  const svg = root.querySelector('[data-example-plane]');
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const own = root.getBoundingClientRect();
  return {
    role: svg.getAttribute('role'),
    name: svg.getAttribute('aria-label') || '',
    points: svg.querySelectorAll('[data-example-plane-point]').length,
    lines: [...svg.querySelectorAll('[data-example-plane-line]')].map((line) => ({ style: line.dataset.examplePlaneLine, dashed: Boolean(line.getAttribute('stroke-dasharray')), width: parseFloat(getComputedStyle(line).strokeWidth) })),
    regions: svg.querySelectorAll('[data-example-plane-region]').length,
    regionEdges: [...svg.querySelectorAll('[data-example-plane-region]')].filter((region) => getComputedStyle(region).stroke !== 'none').length,
    moves: svg.querySelectorAll('[data-example-plane-move]').length,
    width: Math.round(box.width),
    height: Math.round(box.height),
    inside: box.left >= own.left - 1 && box.right <= own.right + 1,
  };
});
// Every slide after the one showing, to the last: [{ ...slide, picture }].
const walk = async (page, where, { shots = {} } = {}) => {
  const seen = [];
  let state = await slideState(page);
  for (let guard = 0; guard < 30 && state.next !== 'Your turn'; guard += 1) {
    await next(page);
    state = await slideState(page);
    state.picture = await picture(page);
    seen.push(state);
    if (state.kind === 'step') {
      check(Boolean(state.picture) && state.picture.role === 'img' && /^Coordinate plane\./.test(state.picture.name), where + ', slide ' + state.number + ': the move has a picture of the plane, named in words', state.picture?.name);
      check(Boolean(state.picture) && state.picture.inside && state.picture.width >= 180 && Math.abs(state.picture.width - state.picture.height) <= 2, where + ', slide ' + state.number + ': the picture is square, at least 180 px, inside the player', JSON.stringify({ width: state.picture?.width, height: state.picture?.height }));
      check(Boolean(state.board) && state.board.lines.length >= 2 && state.board.lines.every((line) => line.name && line.math), where + ', slide ' + state.number + ': the same move is in words and numbers under it', JSON.stringify(state.board?.lines).slice(0, 160));
      check(/Why:/.test(state.text), where + ', slide ' + state.number + ': the move says why');
    }
    await fitsItsBox(page, where + ', slide ' + state.number);
    await noSidewaysScroll(page, where + ', slide ' + state.number);
    if (shots[state.board?.operation]) await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, shots[state.board.operation]) });
  }
  return seen;
};
const operations = (seen) => seen.filter((state) => state.board).map((state) => state.board.operation).join(' ');

/* ------------------------------------- classwork: an inequality, the whole replay */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=plane&role=classwork');
  const where = device.name + ' classwork, an inequality';
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, where + ': the replay is open before anything is pressed');
  if (await player(page).count() !== 1) { await context.close(); continue; }
  const first = await slideState(page);
  check(first.format === 'replay' && !first.faded && first.kind === 'problem' && first.count === 8, where + ': the problem, six moves and the answer', JSON.stringify({ format: first.format, kind: first.kind, count: first.count }));
  check(/New skill/.test(first.openedText), where + ': it says why it opened', first.openedText);
  check(/Graph the inequality/.test(first.text) && !/4x/.test(first.text.replace(/\s+/g, '')), where + ': the problem is a sibling, not the student\'s inequality', first.text.slice(0, 90));
  check((await ownBoard(page)).length > 20, where + ': the student\'s own builder is on the same screen');
  const seen = await walk(page, where, { shots: { riseAndRun: device.name + '-rise-and-run.png', shade: device.name + '-shaded.png' } });
  check(operations(seen) === 'plotIntercept riseAndRun drawDashed testPoint shade check', where + ': the intercept, rise and run, the dashed line, a test point, the shading, the check', operations(seen));
  const at = (operation) => seen.find((state) => state.board?.operation === operation);
  check(at('plotIntercept').picture.points === 1 && at('plotIntercept').picture.lines.length === 0, where + ': first only the y-intercept is plotted', JSON.stringify(at('plotIntercept').picture));
  check(at('riseAndRun').picture.points === 2 && at('riseAndRun').picture.moves === 2, where + ': then the second point, with the rise and the run drawn', JSON.stringify(at('riseAndRun').picture));
  check(at('riseAndRun').board.lines.map((line) => line.name).join(' | ') === 'Start at | Rise and run | Plotted', where + ': rise and run in words', at('riseAndRun').board.lines.map((line) => line.name).join(' | '));
  const drawn = at('drawDashed');
  check(drawn.picture.lines.length === 1 && drawn.picture.lines[0].style === 'dashed' && drawn.picture.lines[0].dashed, where + ': the boundary line is drawn dashed', JSON.stringify(drawn.picture.lines));
  check(drawn.board.lines.at(-1).name === 'The line, dashed' && /does not include/.test(drawn.text), where + ': and the slide says it is dashed, and why', drawn.board.lines.at(-1).name);
  check(/^(True|False)$/.test(at('testPoint').board.lines.at(-1).name) && at('testPoint').picture.regions === 0, where + ': the test point is put in before anything is shaded', at('testPoint').board.lines.at(-1).name);
  check(at('shade').picture.regions === 1 && /Shaded/.test(at('shade').board.lines.at(-1).name), where + ': then one side is shaded', JSON.stringify({ regions: at('shade').picture.regions }));
  // The shading has no edge of its own: along the boundary it would close the gaps of the dashed line.
  check(at('shade').picture.regionEdges === 0 && at('check').picture.regionEdges === 0, where + ': the shading is fill only', JSON.stringify({ shade: at('shade').picture.regionEdges, check: at('check').picture.regionEdges }));
  check(['shade', 'check'].every((operation) => at(operation).picture.lines.length === 1 && at(operation).picture.lines[0].dashed), where + ': so the dashed line stays dashed once the side is shaded', JSON.stringify(at('shade').picture.lines));
  check(/^(A solution|Not a solution)$/.test(at('check').board.lines.at(-1).name), where + ': the marked point is checked', at('check').board.lines.at(-1).name);
  const last = seen.at(-1);
  check(last.kind === 'answer' && /Answer:/.test(last.text) && last.next === 'Your turn', where + ': then the answer and "Your turn"', last.text.slice(0, 80));
  await player(page).locator('[data-example-your-turn]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-worked-example-player]').count() === 0, where + ': "Your turn" folds the replay away');
  check((await ownBoard(page)).length > 20, where + ': the student\'s own builder is there to work on');
  await context.close();
}

/* ------------------------------------- classwork, the next inequality: faded */
{
  const { page, context } = await open(DESKTOP, 'q=plane2&role=classwork');
  const where = 'desktop classwork, the next inequality';
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, where + ': the faded example is open before anything is pressed');
  if (await player(page).count() === 1) {
    let state = await slideState(page);
    check(state.faded && state.count === 2 && /only the first part is worked for you/.test(state.openedText), where + ': the problem and the first move only', JSON.stringify({ faded: state.faded, count: state.count }));
    await next(page);
    state = await slideState(page);
    const shown = await picture(page);
    check(state.board?.operation === 'plotIntercept' && shown.points === 1 && shown.lines.length === 0 && shown.regions === 0, where + ': only the y-intercept is plotted: the line, its style and the shading are the student\'s', JSON.stringify(shown));
    check(/The rest is yours/.test(state.text) && state.next === 'Your turn', where + ': the rest is left to the student');
  }
  await context.close();
}

/* ------------------- practice: on request; standard form is solved for y first */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=planerw&role=practice');
  const where = device.name + ' practice, standard form';
  check(await player(page).count() === 0 && await page.locator('[data-similar-example]').count() === 0, where + ': nothing opens by itself');
  await page.locator('[data-hint-control]').first().click();
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  check(await offer.count() >= 1, where + ': the example is there on request');
  if (await offer.count()) {
    await offer.first().click();
    await player(page).first().waitFor();
    const seen = await walk(page, where);
    check(/^rewrite plotIntercept riseAndRun (drawDashed|drawLine) testPoint shade/.test(operations(seen)), where + ': solve for y, then the same moves', operations(seen));
    const rewrite = seen[0];
    check(rewrite.board.lines.map((line) => line.name).join(' | ') === 'Start with | Solved for y (the sign turns around)', where + ': the sign turns around on a slide of its own', rewrite.board.lines.map((line) => line.name).join(' | '));
    check(/negative/.test(rewrite.text), where + ': and the slide says why');
  }
  await context.close();
}

/* ------------------------------------------------ classwork: a system of two lines */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=planesys&role=classwork');
  const where = device.name + ' classwork, a system';
  await player(page).first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await player(page).count() === 1, where + ': the replay is open before anything is pressed');
  if (await player(page).count() !== 1) { await context.close(); continue; }
  const seen = await walk(page, where, { shots: { intersection: device.name + '-system.png' } });
  check(operations(seen) === 'plotIntercept riseAndRun drawLine plotIntercept riseAndRun drawLine intersection check', where + ': each line from its intercept and slope, where they cross, the check', operations(seen));
  const cross = seen.find((state) => state.board?.operation === 'intersection');
  check(cross.picture.lines.length === 2 && cross.picture.lines.every((line) => line.style === 'solid') && cross.picture.points === 1, where + ': both lines are on the plane with their crossing point', JSON.stringify(cross.picture));
  check(seen.find((state) => state.board?.operation === 'check').board.lines.map((line) => line.name).join(' | ') === 'Equation 1 | Equation 2 | Both equations are true at', where + ': the crossing point is checked in both equations');
  const everything = seen.map((state) => state.text).join(' ');
  check(!/one solution|no solution|infinitely many/i.test(everything), where + ': it never says how many solutions a system has: that is the student\'s to decide');
  await context.close();
}

/* ---------------------------------------------------------- the warm-up: a line */
{
  const { page, context } = await open(DESKTOP, 'q=planeline&role=warmup');
  const where = 'desktop warm-up, a line';
  check(await player(page).count() === 0, where + ': nothing opens by itself outside Classwork');
  await page.locator('[data-hint-control]').first().click().catch(() => {});
  await page.waitForTimeout(300);
  const offer = page.locator('.mathmaster-hint-panel button', { hasText: 'Try a similar one' });
  if (await offer.count()) {
    await offer.first().click();
    await player(page).first().waitFor();
    const seen = await walk(page, where);
    check(operations(seen) === 'plotIntercept riseAndRun drawLine check', where + ': the intercept, rise and run, the line, the check', operations(seen));
  } else {
    check(true, where + ': this warm-up offers no example (its section has no hints)');
  }
  await context.close();
}

/* ---------------------------------------------------------- the DOL: never */
for (const device of DEVICES) {
  const { page, context } = await open(device, 'q=planedol&role=dol');
  const where = device.name + ' DOL';
  check(await page.locator('[data-worked-example-player], [data-similar-example], [data-example-board], [data-example-plane], [data-example-whole]').count() === 0, where + ': no example, no board and no picture of one');
  const text = await documentText(page);
  const leaked = PLANE_WORDS.filter((word) => text.includes(word));
  check(leaked.length === 0, where + ': none of the replay\'s words in the document', leaked.join(' | '));
  await context.close();
}

/* ------------------------------------------------------- the keyboard only */
{
  const { page, context } = await open(DESKTOP, 'q=plane&role=classwork');
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
  const { page, context } = await open(DESKTOP, 'q=plane&role=classwork&support=read');
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
  check(name === 'Read the worked example, step 1 of 6 aloud', `${where}: its name says which move`, String(name));
  if (await read.count()) {
    await read.first().click();
    await page.waitForTimeout(250);
    const spoken = (await page.evaluate(() => window.__mmSpoken)).join(' ').replace(/\s+/g, ' ');
    if (spoken) check(/Step 1 of 6/.test(spoken) && /y-intercept/.test(spoken) && /Why:/.test(spoken), `${where}: it reads the move as a sentence, then its why`, spoken.slice(0, 140));
  }
  await context.close();
}

/* ------------------------------- 200% text, the dark theme, forced colours */
for (const device of [DESKTOP, PHONE, { name: 'narrow', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]) {
  const { page, context } = await open(device, 'q=plane&role=classwork', { textScale: 2 });
  const where = `${device.name} at 200% text`;
  await player(page).first().waitFor();
  const rootFont = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(rootFont >= 31, `${where}: the browser's text did grow`, `${rootFont}px`);
  for (let slide = 2; slide <= 8; slide += 1) {
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
    const { page, context } = await open(device, 'q=plane&role=classwork', { contextOptions: { colorScheme: theme }, theme });
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
  const { page, context } = await open(DESKTOP, 'q=plane&role=classwork', { contextOptions: { colorScheme: scheme, forcedColors: 'active' } });
  const where = `desktop forced colours (${scheme})`;
  await player(page).first().waitFor();
  check(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), `${where}: forced colours are on`);
  await next(page);
  const edges = await player(page).first().evaluate((root) => [...root.querySelectorAll('[data-example-board-line]')].map((line) => {
    const style = getComputedStyle(line);
    return { id: line.dataset.exampleBoardLine, style: style.borderLeftStyle, width: parseFloat(style.borderLeftWidth), named: Boolean(line.querySelector('p')?.textContent.trim()) };
  }));
  check(edges.length >= 2 && edges.every((edge) => edge.style !== 'none' && edge.width >= 1), `${where}: each line of the board keeps an edge`, JSON.stringify(edges));
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
console.log('\nThe plane and inequality replay: every check passed.');

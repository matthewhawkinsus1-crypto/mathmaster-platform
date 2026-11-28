// SHOW THE STEP (SP-4; docs/platform/SHOWING_THE_PROCESS.md section 5).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/showTheStep.mjs
//
// A multi-part answer whose part carries a `checkpoint`, in the real
// QuestionEngine (the feedbackTeaches harness), through rendered controls
// only, at 1366×768 and on a 390×844 touch phone. Parts are answered through
// tests/browser/support/partByPart.mjs.
//
//   practice    the part opens on its step, with no answer box. Points are
//               picked on the plane from the keyboard; "Check my step" says in
//               words what is off, and never the answer; once the engine
//               accepts the step the answer box opens. The submitted response
//               carries the step, and the grade is the answers' alone;
//   stuck       after two refusals "Answer without this step" opens the box,
//               and the grade is the same as with the step done;
//   the DOL     the box opens once the step is done, right or not, and
//               nothing on the screen says which: no Check, no skip, no verdict;
//   the tools   Step Algebra's own workspace, a factor pair, a table's rows;
//   a reload    brings the step back, with the box still open;
//   supports    See every part at once opens the box from the start;
//   keyboard, Read aloud, phone width, 200% text, the dark theme, forced colours.
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/showTheStep.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';
import { answerParts } from './support/partByPart.mjs';
import { solveLinearInEquationWorkspace } from './equationWorkspacePlanner.mjs';
import { ASSESSMENT_LEAK_SELECTORS, ASSESSMENT_LEAK_TEXTS } from './support/assessmentLadderWords.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/showTheStep');
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

let runs = 0;
const open = async (device, query, { contextOptions = {}, textScale = 1, theme = null, url = null } = {}) => {
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
  const address = url || `${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${runs}`;
  await page.goto(address, { waitUntil: 'networkidle' });
  if (theme) await page.evaluate((scheme) => { document.documentElement.dataset.theme = scheme; document.documentElement.style.colorScheme = scheme; }, theme);
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.locator('[data-show-the-step]').first().waitFor();
  await page.waitForTimeout(600);
  return { page, context, address };
};

const step = (page) => page.locator('[data-show-the-step]').first();
const status = async (page) => (await step(page).locator('[data-step-status]').innerText()).replace(/\s+/g, ' ').trim();
const isOpen = async (page) => (await step(page).getAttribute('data-step-open')) === 'true';
const answerBoxes = (page) => page.locator('.mathmaster-question-stage [data-answer-box-index] :is(math-field, input[type="text"]):not([data-show-the-step] *)').count();
// The step says it is open in its own render; the answer boxes draw the box
// in the next one (the step reports upward from an effect). So "the box
// opens" is waited for, as a student's eye does, never read in between.
const boxesOpen = async (page, count = 1) => {
  await page.waitForFunction((wanted) => document.querySelector('[data-show-the-step]')?.getAttribute('data-step-open') === 'true'
    && document.querySelectorAll('.mathmaster-question-stage [data-answer-box-index] :is(math-field, input[type="text"]):not([data-show-the-step] *)').length === wanted, count, { timeout: 5000 }).catch(() => {});
  return await isOpen(page) && await answerBoxes(page) === count;
};
const grades = (page) => page.evaluate(() => window.__mmGrades);
const submit = async (page) => {
  const button = page.getByRole('button', { name: /^Submit/ }).last();
  await button.click();
  await page.waitForFunction(() => window.__mmGrades.length > 0);
};
const press = async (page, ...keys) => { for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(30); } };
// The plane's keyboard route: the crosshair starts on the origin.
const pickFromOrigin = async (page, [x, y], from = [0, 0]) => {
  const moves = [
    ...Array.from({ length: Math.abs(x - from[0]) }, () => (x > from[0] ? 'ArrowRight' : 'ArrowLeft')),
    ...Array.from({ length: Math.abs(y - from[1]) }, () => (y > from[1] ? 'ArrowUp' : 'ArrowDown')),
  ];
  await press(page, ...moves, 'Enter');
};
const points = async (page) => (await step(page).locator('[data-step-points]').innerText()).trim();
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `${where}: the page does not scroll sideways`, `${overflow}px`);
  const wide = await step(page).evaluate((root) => [...root.querySelectorAll('input, button, p, h4, table')].filter((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && (box.right > window.innerWidth + 1 || box.left < -1);
  }).map((element) => element.tagName));
  check(wide.length === 0, `${where}: every control of the step is inside the screen`, wide.join(' '));
};
// What the assessment leak gate refuses on a DOL page (assessmentLeakGates.mjs):
// every text of the feedback ladder and every control of a worked example,
// anywhere in the document.
const leaksOn = async (page) => {
  const html = await page.content();
  const controls = await page.evaluate((selectors) => selectors.filter((selector) => document.querySelector(selector)), ASSESSMENT_LEAK_SELECTORS);
  return [...ASSESSMENT_LEAK_TEXTS.filter((text) => html.includes(text.replace(/&/g, '&amp;'))), ...controls];
};
const VERDICT_WORDS = /not on the (line|graph)|are on the (line|graph)|do not match|match them|fits the|does not fit|do not fit|solves? the equation|not right|choose again|Count again/i;

/* --------------------------------------------- Practice: points on the plane */
const gradeOf = {};
for (const device of [DESKTOP, PHONE]) {
  const { page, context } = await open(device, 'q=stepPoints&role=practice&parts=1');
  const where = `${device.name} practice, pick points`;
  check((await step(page).getAttribute('data-show-the-step')) === 'pickPoints', `${where}: part 1 opens on its step`);
  check(await answerBoxes(page) === 0, `${where}: there is no answer box before the step`, String(await answerBoxes(page)));
  check(await page.getByRole('button', { name: 'Next part' }).isDisabled(), `${where}: Next part waits`);
  check(/^Pick 2 points on the line through \(0, -2\) and \(2, 4\)\./.test(await step(page).locator('[data-step-instruction]').innerText()), `${where}: the step says what to do`);
  check(await step(page).locator('[data-step-check]').isDisabled(), `${where}: Check my step waits for the step to be done`);
  await noSidewaysScroll(page, where);

  // From the keyboard: (0, -2), then a point that is not on the line.
  await step(page).locator('svg[data-mm-plane]').focus();
  await pickFromOrigin(page, [0, -2]);
  await pickFromOrigin(page, [1, 2], [0, -2]);
  check((await points(page)) === 'Your points: (0, -2) and (1, 2).', `${where}: both points are picked from the keyboard, and said in words`, await points(page));
  await step(page).locator('[data-step-entry="rise"]').fill('4');
  await step(page).locator('[data-step-entry="run"]').fill('1');
  await step(page).locator('[data-step-check]').click();
  const refused = await status(page);
  check(/^\(1, 2\) is not on the line\./.test(refused), `${where}: the engine says which point is off the line`, refused);
  check(!(await isOpen(page)) && await answerBoxes(page) === 0, `${where}: a refused step keeps the answer box shut`);
  check((await step(page).locator('[data-step-status]').getAttribute('role')) === 'status', `${where}: what is off is announced (role=status)`);

  // Take the stray point back (Enter on it again), and pick one on the line.
  await step(page).locator('svg[data-mm-plane]').focus();
  await press(page, 'Enter');
  check((await points(page)) === 'Your points: (0, -2).', `${where}: a picked point is taken back with the same key`, await points(page));
  await pickFromOrigin(page, [1, 1], [1, 2]);
  await step(page).locator('[data-step-entry="rise"]').fill('1');
  await step(page).locator('[data-step-entry="run"]').fill('3');
  await step(page).locator('[data-step-check]').click();
  const swapped = await status(page);
  check(/^Your rise and run do not match your points\. Count again from \(0, -2\) to \(1, 1\)/.test(swapped) && !/\b3\b|\b1\b(?!, 1)/.test(swapped.replace(/\(0, -2\) to \(1, 1\)/, '')), `${where}: a wrong rise and run is sent back to the points, with no number given`, swapped);
  await step(page).locator('[data-step-entry="rise"]').fill('3');
  check((await status(page)) === 'The answer box opens when this step is done.', `${where}: an edit takes the old verdict away`, await status(page));
  await step(page).locator('[data-step-entry="run"]').fill('1');
  await step(page).locator('[data-step-check]').click();
  check(/^Your points \(0, -2\) and \(1, 1\) are on the line, and your rise and run match them\./.test(await status(page)), `${where}: the engine accepts the step`, await status(page));
  check(await boxesOpen(page), `${where}: and the answer box opens`);
  check((await step(page).locator('[data-step-skip]').count()) === 0, `${where}: no "Answer without this step" once it is done`);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-points-accepted.png`) });

  await answerParts(page, ['3', '-2']);
  await submit(page);
  const [grade] = await grades(page);
  check(grade.isCorrect === true && grade.parts.length === 2 && grade.parts.every((part) => part.isCorrect && part.credit === 1), `${where}: the grade is the two answers', and both are right`, JSON.stringify(grade.parts.map((part) => [part.id, part.isCorrect])));
  check(JSON.parse(grade.responseKey)['slope::step'] === '(0, -2) (1, 1); rise 3; run 1', `${where}: the response carries the student's step`, grade.responseKey);
  gradeOf[device.name] = JSON.stringify({ isCorrect: grade.isCorrect, parts: grade.parts });
  await context.close();
}

/* ------------------------------------- Stuck: answer without the step, same grade */
{
  const { page, context } = await open(DESKTOP, 'q=stepPoints&role=practice&parts=1');
  const where = 'desktop practice, stuck';
  await step(page).locator('svg[data-mm-plane]').focus();
  await pickFromOrigin(page, [0, 5]);
  await pickFromOrigin(page, [4, 5], [0, 5]);
  await step(page).locator('[data-step-entry="rise"]').fill('0');
  await step(page).locator('[data-step-entry="run"]').fill('4');
  await step(page).locator('[data-step-check]').click();
  check((await step(page).locator('[data-step-skip]').count()) === 0, `${where}: one refusal offers no way round`);
  await step(page).locator('[data-step-entry="run"]').fill('5');
  await step(page).locator('[data-step-check]').click();
  const skip = step(page).locator('[data-step-skip]');
  check((await skip.count()) === 1 && (await skip.innerText()) === 'Answer without this step', `${where}: after two refusals the student may answer without the step`);
  await skip.focus();
  await press(page, 'Enter');
  check(await boxesOpen(page), `${where}: taking it opens the answer box`);
  check(/^You chose to answer without this step\. It does not change your score\./.test(await status(page)), `${where}: and says it costs nothing`, await status(page));
  await answerParts(page, ['3', '-2']);
  await submit(page);
  const [grade] = await grades(page);
  check(JSON.stringify({ isCorrect: grade.isCorrect, parts: grade.parts }) === gradeOf.desktop, `${where}: the grade is exactly the grade with the step done`);
  check(JSON.parse(grade.responseKey)['slope::step'] === 'skipped; (0, 5) (4, 5); rise 0; run 5', `${where}: the step is recorded as skipped, with what was done`, grade.responseKey);
  check(grade.supportUsage?.isMathematicallyIndependent === true && grade.supportUsage?.hintUsed === false, `${where}: skipping is not a hint and lowers nothing`);
  await context.close();
}

/* ---------------------------------------------------------------- The DOL */
for (const device of [DESKTOP, PHONE]) {
  const { page, context } = await open(device, 'q=stepPoints&role=dol&parts=1');
  const where = `${device.name} DOL, pick points`;
  check(await answerBoxes(page) === 0, `${where}: the part opens on its step, with no answer box`);
  check((await step(page).locator('[data-step-check]').count()) === 0, `${where}: there is no Check my step`);
  await step(page).locator('svg[data-mm-plane]').focus();
  await pickFromOrigin(page, [0, -2]);
  await pickFromOrigin(page, [3, 3], [0, -2]);
  await step(page).locator('[data-step-entry="rise"]').fill('9');
  await step(page).locator('[data-step-entry="run"]').fill('9');
  check((await status(page)) === 'Step recorded. Now answer the part below.', `${where}: a finished step is recorded, and nothing says it is wrong`, await status(page));
  check(await boxesOpen(page), `${where}: the answer box opens`);
  const said = await page.locator('.mathmaster-question-stage').innerText();
  check(!VERDICT_WORDS.test(said), `${where}: no word on the screen judges the step`, (said.match(VERDICT_WORDS) || [''])[0]);
  check((await step(page).locator('[data-step-skip]').count()) === 0, `${where}: and no "Answer without this step" is needed or shown`);
  const leaks = await leaksOn(page);
  check(leaks.length === 0, `${where}: the step brings no hint, example or feedback word onto the DOL`, leaks.join(' | '));
  await noSidewaysScroll(page, where);
  await answerParts(page, ['3', '-2']);
  await submit(page);
  const [grade] = await grades(page);
  check(JSON.stringify({ isCorrect: grade.isCorrect, parts: grade.parts }) === gradeOf.desktop, `${where}: a wrong step changes nothing in the grade`);
  check(JSON.parse(grade.responseKey)['slope::step'] === '(0, -2) (3, 3); rise 9; run 9', `${where}: the step is recorded as the student left it`, grade.responseKey);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-dol.png`) });
  await context.close();
}

/* ------------------------------------------------- Step Algebra's own workspace */
for (const role of ['practice', 'dol']) {
  const { page, context } = await open(DESKTOP, `q=stepMoves&role=${role}&parts=1`);
  const where = `desktop ${role}, moves in Step Algebra`;
  check(await step(page).locator('.algebra-embedded').count() === 1, `${where}: the step is the Step Algebra workspace itself`);
  check(await answerBoxes(page) === 0, `${where}: no answer box before a move`);
  check((await step(page).locator('[data-step-check]').count()) === 0, `${where}: the workspace checks each move, so there is no Check my step`);
  await solveLinearInEquationWorkspace(page, step(page));
  await page.waitForTimeout(400);
  const said = await status(page);
  check(role === 'dol' ? said === 'Step recorded. Now answer the part below.' : /^Your \d+ moves solve the equation\./.test(said), `${where}: ${role === 'dol' ? 'the moves are recorded with no verdict' : 'the engine accepts the moves'}`, said);
  check(await boxesOpen(page), `${where}: the answer box opens`);
  if (role === 'dol') {
    const leaks = await leaksOn(page);
    check(leaks.length === 0, `${where}: the workspace brings no hint, example or feedback word onto the DOL`, leaks.join(' | '));
    check(!VERDICT_WORDS.test(await page.locator('.mathmaster-question-stage').innerText()), `${where}: no word on the screen judges the step`);
  }
  await answerParts(page, ['4', '11']);
  await submit(page);
  const [grade] = await grades(page);
  const line = JSON.parse(grade.responseKey)['x::step'] || '';
  check(/^2x \+ 3 = 11 ; .*x = 4$/.test(line) && line.length <= 240, `${where}: the response carries the lines of the student's moves`, line);
  check(grade.isCorrect === true && grade.parts.length === 2, `${where}: graded on its two answers`);
  await context.close();
}

/* --------------------------------------------- A factor pair and a table's rows */
{
  const { page, context } = await open(PHONE, 'q=stepPair&role=practice&parts=1');
  const where = 'phone practice, factor pair';
  const labels = await step(page).locator('label').allInnerTexts();
  check(labels.join('|') === 'First number|Second number', `${where}: both boxes are labelled`, labels.join('|'));
  await step(page).locator('[data-step-entry="pair-0"]').fill('1');
  await step(page).locator('[data-step-entry="pair-1"]').fill('6');
  await step(page).locator('[data-step-check]').click();
  const said = await status(page);
  check(said === 'Your pair multiplies to 6 and adds to 7. Compare both with the trinomial and choose again.', `${where}: a wrong pair is told its own product and sum, and no more`, said);
  await step(page).locator('[data-step-entry="pair-0"]').fill('2');
  await step(page).locator('[data-step-entry="pair-1"]').fill('3');
  await step(page).locator('[data-step-check]').click();
  check(await isOpen(page) && /^Your pair fits the trinomial\./.test(await status(page)), `${where}: the right pair opens the box`, await status(page));
  const sizes = await step(page).locator('button, input').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
  check(sizes.every((height) => height >= 44), `${where}: every control is at least 44px tall`, sizes.join(' '));
  await noSidewaysScroll(page, where);
  await context.close();
}
{
  const { page, context, address } = await open(DESKTOP, 'q=stepRows&role=practice&parts=1');
  const where = 'desktop practice, table rows';
  const names = await step(page).locator('input').evaluateAll((inputs) => inputs.map((input) => input.getAttribute('aria-label')));
  check(names.join('|') === 'Row 1, x|Row 1, y|Row 2, x|Row 2, y', `${where}: each cell is named by its row and column`, names.join('|'));
  check((await step(page).locator('th[scope="col"]').allInnerTexts()).join('|') === 'x|y', `${where}: the table has column headers`);
  // Tab order runs through the table, then Check.
  await step(page).locator('[data-step-entry="row-0-0"]').focus();
  for (const value of ['1', '3', '1', '3']) { await page.keyboard.type(value); await press(page, 'Tab'); }
  await press(page, 'Enter');
  check((await status(page)) === 'Use a different value of x in each row.', `${where}: the same x twice is sent back, from the keyboard alone`, await status(page));
  await step(page).locator('[data-step-entry="row-1-0"]').fill('2');
  await step(page).locator('[data-step-entry="row-1-1"]').fill('6');
  await step(page).locator('[data-step-check]').click();
  check(/^A row does not fit the rule\./.test(await status(page)), `${where}: a row off the rule is refused without its value`, await status(page));
  await step(page).locator('[data-step-entry="row-1-1"]').fill('5');
  await step(page).locator('[data-step-check]').click();
  check(await boxesOpen(page), `${where}: rows on the rule open the box`);

  // A reload brings the step back, with the box still open.
  await page.goto(address, { waitUntil: 'networkidle' });
  await page.locator('[data-show-the-step]').first().waitFor();
  await page.waitForTimeout(600);
  const restored = await step(page).locator('input').evaluateAll((inputs) => inputs.map((input) => input.value).join(' '));
  check(restored === '1 3 2 5', `${where}: after a reload the rows are still there`, restored);
  check(await boxesOpen(page), `${where}: and the answer box is still open, with no second Check`);
  await context.close();
}

/* ------------------------------------------------- See every part at once */
{
  const { page, context } = await open(DESKTOP, 'q=stepPoints&role=practice&parts=1&support=everypart');
  const where = 'desktop, See every part at once';
  check(await boxesOpen(page, 2), `${where}: every part's answer box is open from the start`, String(await answerBoxes(page)));
  check(await isOpen(page) && /^This step is optional for you\./.test(await status(page)), `${where}: the step says it is optional`, await status(page));
  await step(page).locator('svg[data-mm-plane]').focus();
  await pickFromOrigin(page, [0, -2]);
  await answerParts(page, ['3', '-2']);
  await submit(page);
  const [grade] = await grades(page);
  check(grade.isCorrect === true && JSON.parse(grade.responseKey)['slope::step'] === '(0, -2)', `${where}: the step work that was done is still recorded`, grade.responseKey);
  await context.close();
}

/* ------------------------------------------------------------- Read aloud */
{
  const { page, context } = await open(DESKTOP, 'q=stepPoints&role=practice&parts=1&support=read');
  const where = 'desktop Read aloud';
  await page.evaluate(() => {
    window.__mmSpoken = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (utterance) => { window.__mmSpoken.push(utterance.text); };
  });
  const read = page.getByRole('button', { name: /Read aloud/ }).first();
  check(await read.count() === 1, `${where}: the question has Read aloud`);
  await read.click();
  await page.waitForTimeout(400);
  const spoken = (await page.evaluate(() => window.__mmSpoken)).join(' ').replace(/\s+/g, ' ');
  if (spoken) {
    check(/First, show the step: pick 2 points on the line through/.test(spoken), `${where}: it reads the step with its part`, spoken.slice(0, 200));
    check(!/y-intercept/i.test(spoken), `${where}: and not the part that is not on the screen yet`);
  } else {
    console.log(`note ${where}: this browser has no speech synthesis; the reading is proved in tests/platform/showTheStep.test.mjs`);
  }
  await context.close();
}

/* ------------------------------- 200% text, the dark theme, forced colours */
for (const fixture of ['stepPoints', 'stepPair', 'stepRows', 'stepMoves']) {
  const { page, context } = await open(PHONE, `q=${fixture}&role=practice&parts=1`, { textScale: 2 });
  const where = `phone at 200% text, ${fixture}`;
  const rootFont = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  check(rootFont >= 31, `${where}: the browser's text did grow`, `${rootFont}px`);
  await noSidewaysScroll(page, where);
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `phone-200-${fixture}.png`) });
  await context.close();
}
const contrastProblems = (page) => step(page).evaluate((root) => {
  const parse = (value) => { const match = String(value).match(/rgba?\(([^)]+)\)/); if (!match) return null; const [r, g, b, a = '1'] = match[1].split(/[,/ ]+/).filter(Boolean); return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }; };
  const luminance = ({ r, g, b }) => { const channel = (value) => { const s = value / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const backgroundOf = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) { const colour = parse(getComputedStyle(node).backgroundColor); if (colour && colour.a > 0) { layers.push(colour); if (colour.a >= 1) break; } }
    const base = parse(getComputedStyle(document.documentElement).backgroundColor);
    return layers.reverse().reduce((under, top) => over(top, under), base && base.a > 0 ? { ...base, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  };
  const found = [];
  root.querySelectorAll('h4, [data-step-instruction], [data-step-status], [data-step-points], label, input, button').forEach((element) => {
    if (element.closest('svg') || element.closest('.algebra-embedded')) return;
    const text = (element.value ?? element.textContent ?? '').trim();
    if (!text) return;
    const style = getComputedStyle(element);
    const background = backgroundOf(element);
    const colour = over({ ...parse(style.color), a: (parse(style.color)?.a ?? 1) * Number(style.opacity || 1) }, background);
    const [light, dark] = [luminance(colour), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const disabled = element.disabled === true;
    if (!disabled && ratio < 4.5) found.push(`"${text.slice(0, 30)}" ${ratio.toFixed(2)}:1`);
  });
  return found;
});
for (const theme of ['light', 'dark']) {
  for (const fixture of ['stepPoints', 'stepPair']) {
    const { page, context } = await open(DESKTOP, `q=${fixture}&role=practice&parts=1`, { contextOptions: { colorScheme: theme }, theme });
    const where = `desktop ${theme}, ${fixture}`;
    if (fixture === 'stepPair') {
      await step(page).locator('[data-step-entry="pair-0"]').fill('1');
      await step(page).locator('[data-step-entry="pair-1"]').fill('6');
      await step(page).locator('[data-step-check]').click();
    }
    const problems = await contrastProblems(page);
    check(problems.length === 0, `${where}: the step's words, boxes and buttons have 4.5:1 contrast`, problems.join('; '));
    if (fixture === 'stepPair') {
      await step(page).locator('[data-step-entry="pair-0"]').fill('2');
      await step(page).locator('[data-step-entry="pair-1"]').fill('3');
      await step(page).locator('[data-step-check]').click();
      const accepted = await contrastProblems(page);
      check(accepted.length === 0, `${where}: and so does the accepted step`, accepted.join('; '));
    }
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `desktop-${theme}-${fixture}.png`) });
    await context.close();
  }
}
for (const scheme of ['light', 'dark']) {
  const { page, context } = await open(DESKTOP, 'q=stepRows&role=practice&parts=1', { contextOptions: { colorScheme: scheme, forcedColors: 'active' } });
  const where = `desktop forced colours (${scheme})`;
  check(await page.evaluate(() => matchMedia('(forced-colors: active)').matches), `${where}: forced colours are on`);
  const edges = await step(page).evaluate((root) => {
    const edge = (element) => { const style = getComputedStyle(element); return style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) >= 1; };
    return { box: edge(root), inputs: [...root.querySelectorAll('input')].every(edge), cells: [...root.querySelectorAll('th, td')].every(edge), button: edge(root.querySelector('[data-step-check]')) || getComputedStyle(root.querySelector('[data-step-check]')).forcedColorAdjust !== 'none' };
  });
  check(edges.box && edges.inputs && edges.cells, `${where}: the step, its table and its boxes keep their edges`, JSON.stringify(edges));
  for (const [x, y] of [['1', '3'], ['2', '6']].entries()) { await step(page).locator(`[data-step-entry="row-${x}-0"]`).fill(y[0]); await step(page).locator(`[data-step-entry="row-${x}-1"]`).fill(y[1]); }
  await step(page).locator('[data-step-check]').click();
  check(/^A row does not fit the rule\./.test(await status(page)), `${where}: what is off is said in words, so nothing rests on colour`, await status(page));
  await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `forced-colours-${scheme}.png`) });
  await context.close();
}
{
  const { page, context } = await open(DESKTOP, 'q=stepPoints&role=practice&parts=1', { contextOptions: { forcedColors: 'active' } });
  const where = 'desktop forced colours, the plane';
  const plane = await step(page).locator('svg[data-mm-plane]').evaluate((svg) => ({ marked: svg.hasAttribute('data-mm-plane'), curves: svg.querySelectorAll('path, polyline, line').length, box: svg.getBoundingClientRect().width }));
  check(plane.marked && plane.curves > 4 && plane.box > 200, `${where}: the plane is the platform's own, which a contrast theme draws`, JSON.stringify(plane));
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nShow the step: every check passed.');

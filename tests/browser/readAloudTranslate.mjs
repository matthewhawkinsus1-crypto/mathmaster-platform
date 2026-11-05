// READ ALOUD AND TRANSLATE, HEARD AND SEEN THROUGH THE REAL QUESTION ENGINE
// (student pass 3, batch 6: HELP-6 / H-115 and HELP-3).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/readAloudTranslate.mjs
//
// The page's speech engine is replaced by a recorder (window.__mmSpoken), so
// the driver checks what a student would HEAR. At 1366×768 and 390×844:
//
//   read aloud   the work bar's Read (a plan's text-to-speech) says the whole
//                real matrices item: the prompt, both matrices row by row and
//                every part with its choices in the order they are drawn;
//                the Support tools tray offers "Read a part", and one part
//                can be heard again on its own.
//   universal    a student with no plan, in practice: the tray's Read aloud
//                says the same whole question and opens the parts.
//   figures      a graph on a real DOL is read by its own description, with
//                no position while it can be answered; a real fillable table
//                is read by rows with its headers, each cell to fill "blank".
//   HELP-19      an inclusion student meets "Let's back up" only where a step
//                is written for the problem, and hears those words once; the
//                card starts inside the work area, below the Work View button
//                (PH01).
//   translate    a platform hint is shown in Spanish (lang="es") and Read
//                then speaks the Spanish; a teacher-written hint says plainly
//                that it has no Spanish translation — no dead button.
//   figures, es  under an authored Spanish prompt the real DOL graph is read
//                in its own Spanish words, with the same numbers and still no
//                position; with the graph read-out (AX03) it is read in full,
//                in Spanish, and the 3D model and the graph workspace (the
//                student's own point) are read in Spanish too (AX05, slice 2).
//   tool tables  the DOL #3 review's tools read the tables they draw: the
//                workbench's rows, the residual table (and again once the
//                model changes), the sequence table (what the student typed,
//                never a term), and the board's given table (AX10); the
//                Regression Calculator's listed data and typed table, and the
//                board's process-mode row chooser (AX10, slice 2).
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/readAloudTranslate.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOpenerCover } from './support/openerCover.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/readAloudTranslate');
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

// A speech engine that records instead of speaking.
const SPEECH_RECORDER = () => {
  window.__mmSpoken = [];
  class Utterance { constructor(text) { this.text = text; this.lang = ''; } }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (utterance) => window.__mmSpoken.push({ text: utterance.text, lang: utterance.lang || '' }), cancel() {}, getVoices: () => [] },
  });
};

let run = 0;
const open = async (device, query) => {
  run += 1;
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false });
  await context.addInitScript(SPEECH_RECORDER);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${device.name} ${query}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?${query}&run=${Date.now()}-${run}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(700);
  return { page, context };
};
const lastSpoken = (page) => page.evaluate(() => window.__mmSpoken[window.__mmSpoken.length - 1] || null);
const noSidewaysScroll = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${where}: nothing scrolls sideways`, `${overflow}px`);
};
// The visible text of every choice button, in the order the screen draws them.
const drawnChoices = (page) => page.locator('[role="radio"]').evaluateAll((buttons) => buttons.map((button) => {
  const copy = button.cloneNode(true);
  copy.querySelectorAll('[style*="position: absolute"], [style*="position:absolute"]').forEach((node) => node.remove());
  return copy.textContent.trim();
}));
// What the drawn choice says aloud: "−6" is "negative 6", and in a question
// about dimensions "3 × 4" is "3 by 4".
const spokenChoice = (choice) => choice.replace(/−/g, 'negative ').replace(/ × /g, ' by ');
// A value a tool draws, as Read aloud says it: "-0.5" is "negative 0.5".
const spokenValue = (value) => String(value).replace(/^[-−]/, 'negative ');

for (const device of DEVICES) {
  /* ------------------------------------- a plan's Read aloud, work bar + parts */
  {
    const { page, context } = await open(device, 'q=matrices&role=practice&support=read');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    check(await read.isVisible(), `${device.name}: the work bar carries Read aloud`);
    await read.click();
    const whole = await lastSpoken(page);
    const said = whole?.text || '';
    check(/Matrices A and B are shown\. Matrix C has dimensions 3 by 2/.test(said), `${device.name}: the prompt is read, "3 × 2" as "3 by 2"`, said.slice(0, 120));
    check(/Matrix A, 2 by 2\. Row 1: 2, negative 1\. Row 2: 0, 3\. Matrix B, 2 by 2\. Row 1: 4, 1\. Row 2: negative 2, 5\./.test(said), `${device.name}: both matrices are read row by row`);
    const choices = await drawnChoices(page);
    let cursor = 0;
    const inOrder = choices.every((choice) => {
      const at = said.indexOf(spokenChoice(choice), cursor);
      if (at < 0) return false;
      cursor = at;
      return true;
    });
    check(choices.length === 12 && inOrder, `${device.name}: every choice is read, in the order it is drawn`, choices.join(' | '));
    check(/What are the dimensions of DC\? Choices: /.test(said), `${device.name}: each part's question is read before its choices`);

    const partsButton = page.locator('[data-support-tool="read-parts"]').first();
    check(await partsButton.isVisible(), `${device.name}: the tray offers "Read a part" beside the work bar's Read`);
    await partsButton.click();
    const part = page.locator('[data-read-part="part"]').nth(1);
    check(await part.isVisible(), `${device.name}: the parts are listed`);
    await part.click();
    const again = (await lastSpoken(page))?.text || '';
    check(/^What are the dimensions of CD\? Choices: .*\.$/.test(again) && !/Matrix A/.test(again), `${device.name}: one part is heard again, on its own`, again);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-read-parts.png`) });
    await noSidewaysScroll(page, `${device.name} read aloud`);
    await context.close();
  }

  /* ----------------------------------------- universal design: the tray's Read */
  {
    const { page, context } = await open(device, 'q=matrices&role=practice');
    check(await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').count() === 0, `${device.name}: no plan, no work-bar Read`);
    const trayRead = page.locator('[data-support-tool="read-aloud"]').first();
    check(await trayRead.isVisible(), `${device.name}: the tray offers Read aloud to every student in practice`);
    await trayRead.click();
    const said = (await lastSpoken(page))?.text || '';
    check(/Row 2: negative 2, 5\..*Choices: /.test(said), `${device.name}: the tray reads the whole question too`);
    check(await trayRead.getAttribute('aria-expanded') === 'true' && await page.locator('[data-read-part]').count() >= 5, `${device.name}: the parts open under it`);
    await context.close();
  }

  /* --------------------- a graph on a real exit ticket: said, without positions */
  {
    const { page, context } = await open(device, 'q=dolgraph&role=dol&support=read');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const said = (await lastSpoken(page))?.text || '';
    check(/x from negative 4 to 7, y from negative 6 to 16\. 1 curve\. 1 open dot and 1 closed dot\. Positions are not read out while this question can be answered\./.test(said), `${device.name}: the DOL's graph is read by the description it already has`, said);
    check(said.indexOf('1 curve') < said.indexOf('Step 1 of 2'), `${device.name}: the graph is read before the step that asks about it`);
    // No coordinate, crossing, turning point or corner: what the question asks for.
    check(!/\(\s*(?:negative )?\d|\bcrosses\b|\bthrough\b|\bbetween\b|\bcorners?\b|\bhigh point\b|\blow point\b/.test(said), `${device.name}: no position is read while the exit ticket is open`, said);
    const description = await page.locator('[data-graph-description]').first().textContent();
    check(said.includes(description.replace(/−/g, 'negative ').split('. ')[1] || '\u0000'), `${device.name}: what is read is the figure's own description`, description);
    await context.close();
  }

  /* ------------ the same graph under an authored Spanish prompt: Spanish (AX05) */
  {
    const { page, context } = await open(device, 'q=dolgraphes&role=dol&support=translate');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const heard = await lastSpoken(page);
    const said = heard?.text || '';
    check(heard?.lang === 'es' && said.startsWith('La gráfica muestra una función'), `${device.name}: the Spanish question is read in a Spanish voice`, `${heard?.lang}: ${said.slice(0, 60)}`);
    const figure = said.slice(said.indexOf('Gráfica.'), said.indexOf('Paso 1 de 2'));
    check(figure === 'Gráfica. El eje x va de negativo 4 a 7 y el eje y, de negativo 6 a 16. 1 curva. 1 círculo abierto y 1 círculo cerrado. Las posiciones no se leen mientras se pueda responder esta pregunta. ', `${device.name}: the DOL's graph is read in its own Spanish words`, figure || said);
    check(!/x from|Positions are not|inglés/.test(said), `${device.name}: no English description and no "in English" note`, said);
    check(!/\(\s*(?:negativo )?\d|\bcruza\b|\bpasa por\b|\bentre\b|\besquinas?\b/.test(said), `${device.name}: no position is read in Spanish while the exit ticket is open`, said);
    // The numbers are the figure's own: the ones its (English) description gives.
    const description = await page.locator('[data-graph-description]').first().textContent();
    const numbers = (text) => (text.replace(/−|negativo /g, '-').match(/-?\d+(?:\.\d+)?/g) || []).join(' ');
    check(numbers(figure) === numbers(description), `${device.name}: the same numbers as the figure's description`, `${numbers(figure)} | ${numbers(description)}`);
    await context.close();
  }
  {
    // The graph read-out (AX03) under the same Spanish prompt: the full reading,
    // positions and all, in Spanish (AX05, slice 2), as a closed question's is.
    const { page, context } = await open(device, 'q=dolgraphes&role=dol&support=translatereadout');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const heard = await lastSpoken(page);
    const said = heard?.text || '';
    const figure = said.slice(said.indexOf('Gráfica.'), said.indexOf('Paso 1 de 2'));
    check(heard?.lang === 'es' && figure.startsWith('Gráfica. El eje x va de negativo 4 a 7 y el eje y, de negativo 6 a 16. 1 curva. La curva 1 ') && /círculo cerrado/.test(figure) && /círculo abierto/.test(figure), `${device.name}: the read-out reads the DOL's graph in full, in Spanish`, figure || said.slice(0, 400));
    check(!/x from|Positions are not|inglés|no se leen/.test(said), `${device.name}: no English, no note, and no position held back`, said.slice(0, 400));
    const description = await page.locator('[data-graph-description]').first().textContent();
    const numbers = (text) => (text.replace(/−|negativo /g, '-').match(/-?\d+(?:\.\d+)?/g) || []).join(' ');
    check(numbers(figure) === numbers(description), `${device.name}: the read-out says the numbers its description gives`, `${numbers(figure)} | ${numbers(description)}`);
    await context.close();
  }
  {
    // The 3D model in its own Spanish words, its equations said as Spanish
    // mathematics, and no pair of planes while it can be answered (AX05, slice 2).
    const { page, context } = await open(device, 'q=planeses&role=classwork&support=translate');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const heard = await lastSpoken(page);
    const said = heard?.text || '';
    check(heard?.lang === 'es' && said.includes('Modelo 3D. Modelo 3D con los ejes x, y, z. Plano 1, azul: 2x menos y más 2z es igual a 15. Plano 2, rojo: negativo x más y más z es igual a 3. Plano 3, verde: 3x menos y más 2z es igual a 18.'), `${device.name}: the 3D model is read in Spanish`, said.slice(0, 400));
    check(!/inglés|3D model with|planos \d y \d/.test(said), `${device.name}: no English, no note, and no pair of planes named`, said.slice(0, 400));
    await context.close();
  }
  {
    // The legacy graph workspace: the student's own point, read back in Spanish;
    // the task's label is the item's own words (AX05, slice 2).
    const { page, context } = await open(device, 'q=workspacees&role=practice&support=translate');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    await read.click();
    const before = await lastSpoken(page);
    check(before?.lang === 'es' && (before?.text || '').includes('Gráfica. El eje x va de negativo 4 a 4 y el eje y, de negativo 6 a 8. Todavía no hay nada colocado.'), `${device.name}: the graph workspace is read in Spanish`, (before?.text || '').slice(0, 300));
    await page.getByRole('button', { name: /^Plot the point where x = 0/ }).click();
    await page.getByRole('spinbutton', { name: 'x', exact: true }).fill('0');
    await page.getByRole('spinbutton', { name: 'y', exact: true }).fill('1');
    await page.getByRole('button', { name: 'Place at this coordinate' }).click();
    await page.waitForTimeout(300);
    // On a phone the keypad holds the work bar's place until "Done".
    const done = page.locator('button:visible', { hasText: /^Done$/ });
    if (await done.count()) await done.first().click();
    else await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(300);
    await read.click();
    const after = (await lastSpoken(page))?.text || '';
    check(after.includes('Colocaste 1 punto: Plot the point where x es igual a 0 en el punto 0, 1.') && !/inglés|You placed/.test(after), `${device.name}: the student's point is read back in Spanish`, after.slice(0, 300));
    await context.close();
  }

  /* ------------ a hidden step's figure is not read (review B1, q_section-4_4_4) */
  {
    const { page, context } = await open(device, 'q=dolgraph7&role=dol&support=read');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const said = (await lastSpoken(page))?.text || '';
    const figures = (said.match(/x from /g) || []).length;
    check(figures === 1, `${device.name}: on step 1 of 7, exactly one figure is read — the one on screen`, `${figures}: ${said.slice(0, 400)}`);
    check(!/Mark the|maximum or minimum/i.test(said.split('Step 1 of 7')[0]), `${device.name}: no later step's prompt is read as a figure's name`, said.slice(0, 300));
    await context.close();
  }

  /* ------------------------------------- a fillable table: rows, headers, blanks */
  {
    const { page, context } = await open(device, 'q=table&role=classwork&support=read');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const said = (await lastSpoken(page))?.text || '';
    check(/A table, 5 rows\. Columns: x; f of x; c of x; new input for d; d of x\. Row 1: x, negative 2; f of x, negative 2; c of x, blank; new input for d, blank; d of x, negative 2\./.test(said), `${device.name}: the table is read by rows with its headers`, said.slice(0, 260));
    const answers = await page.evaluate(() => window.__mmAnswers);
    const filled = [...said.matchAll(/(?:c of x|new input for d), ([^;.]+)/g)].map((match) => match[1]);
    check(answers.length >= 10 && filled.length === 10 && filled.every((cell) => cell === 'blank'), `${device.name}: every cell to fill in is "blank", never its answer`, filled.join(' | '));
    const partsButton = page.locator('[data-support-tool="read-parts"]').first();
    if (await partsButton.count()) {
      await partsButton.click();
      await page.locator('[data-read-part="table"]').first().click();
      check(((await lastSpoken(page))?.text || '').startsWith('A table, 5 rows.'), `${device.name}: the table can be heard again on its own`);
    } else check(false, `${device.name}: the tray offers "Read a part"`);
    await noSidewaysScroll(page, `${device.name} table`);
    await context.close();
  }
  {
    // On a DOL: the student's own entry is read back, never a verdict (review S5).
    const { page, context } = await open(device, 'q=table&role=dol&support=read');
    const cell = page.locator('input[aria-label="Row 1, c(x)"]');
    await cell.fill('8/5');
    // Leave the cell, as a student does before using the work bar: on a phone
    // the number keypad holds the bar's place until "Done".
    const closeKeypad = async () => {
      const done = page.locator('button:visible', { hasText: /^Done$/ });
      if (await done.count()) await done.first().click();
      else await page.locator('table input').first().evaluate((element) => element.blur());
      await page.waitForTimeout(300);
    };
    await closeKeypad();
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    await read.click();
    const before = (await lastSpoken(page))?.text || '';
    check(/Row 1: x, negative 2; f of x, negative 2; c of x, you wrote 8 over 5; new input for d, blank;/.test(before), `${device.name}: the student's own entry is read as theirs`, before.slice(0, 320));
    const inputs = page.locator('table input');
    const count = await inputs.count();
    for (let index = 0; index < count; index += 1) await inputs.nth(index).fill('1');
    await closeKeypad();
    await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
    await page.waitForTimeout(800);
    await read.click();
    const after = (await lastSpoken(page))?.text || '';
    check(/c of x, you wrote 1/.test(after) && !/correct|incorrect|check this|wrong|✓|✗/i.test(after), `${device.name}: after a DOL submit, the entries — and no verdict`, after.slice(0, 320));
    await context.close();
  }

  /* -------------- tables a tool draws itself (AX10; the DOL #3 review's tools) */
  {
    // PR 3, the Linear Table Workbench: the 2026-10-22 walkthrough heard none of its rows.
    const { page, context } = await open(device, 'q=ltw&role=practice&support=read');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const said = (await lastSpoken(page))?.text || '';
    // Every row the workbench draws, as its row button names it ("Row 1: x equals -2, y equals -4").
    const rows = await page.locator('button[aria-pressed][aria-label^="Row "]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    const expected = rows.map((label) => label.replace(/^Row (\d+): x equals (\S+), y equals (\S+)$/, (match, n, x, y) => `Row ${n}: x, ${spokenValue(x)}; y, ${spokenValue(y)}.`));
    const at = said.indexOf('A table');
    check(rows.length === 4 && said.includes(`A table, 4 rows. Columns: x; y. ${expected.join(' ')}`), `${device.name}: the workbench's rows are read, as drawn`, at >= 0 ? said.slice(at, at + 220) : said.slice(0, 200));
    await context.close();
  }
  {
    // PR 11, the Data Modeling Lab: its residual table, as drawn, and again after the model changes.
    const { page, context } = await open(device, 'q=dml&role=practice&support=read');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    const drawnResiduals = () => page.locator('[data-residual-table-scroller] tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
    const residualReading = (cells) => `Residual table, ${cells.length} rows. Columns: x, Hours studied; y, Quiz score (points); y hat; residual. ${cells.map(([x, y, fitted, residual], index) => `Row ${index + 1}: x, ${spokenValue(x)}; y, ${spokenValue(y)}; y hat, ${spokenValue(fitted)}; residual, ${spokenValue(residual)}.`).join(' ')}`;
    const excerpt = (text) => text.slice(Math.max(0, text.indexOf('Residual table')), Math.max(0, text.indexOf('Residual table')) + 200);
    await read.click();
    const before = await drawnResiduals();
    const said = (await lastSpoken(page))?.text || '';
    check(before.length === 10 && said.includes(residualReading(before)), `${device.name}: the residual table is read, as drawn, ŷ as "y hat"`, excerpt(said));
    await page.getByRole('button', { name: 'Increase Slope m' }).click();
    await page.waitForTimeout(400);
    await read.click();
    const after = await drawnResiduals();
    const again = (await lastSpoken(page))?.text || '';
    check(JSON.stringify(after) !== JSON.stringify(before) && again.includes(residualReading(after)), `${device.name}: after the slope changes, the residuals read are the new ones`, excerpt(again));
    await context.close();
  }
  {
    // PR 13, the Sequence Explorer: what the student typed, or blank — never a term.
    const { page, context } = await open(device, 'q=sequence&role=practice&support=read');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    const excerpt = (text) => text.slice(Math.max(0, text.indexOf('Sequence table')), Math.max(0, text.indexOf('Sequence table')) + 240);
    await read.click();
    const said = (await lastSpoken(page))?.text || '';
    check(said.includes('Sequence table, 6 rows. Columns: n, domain input; f of n, output. Row 1: n, 1; f of n, blank. Row 2: n, 2; f of n, blank. Row 3: n, 3; f of n, blank. Row 4: n, 4; f of n, blank. Row 5: n, 5; f of n, blank. Row 6: n, 6; f of n, blank.'), `${device.name}: the sequence table is read, every box blank before the student types`, excerpt(said));
    const box = page.locator('input[aria-label="Sequence output f(1)"]');
    await box.fill('-7');
    // On a phone the number keypad holds the bar's place until "Done".
    const done = page.locator('button:visible', { hasText: /^Done$/ });
    if (await done.count()) await done.first().click();
    else await box.evaluate((element) => element.blur());
    await page.waitForTimeout(300);
    await read.click();
    const typed = (await lastSpoken(page))?.text || '';
    check(typed.includes('Row 1: n, 1; f of n, you wrote negative 7. Row 2: n, 2; f of n, blank.'), `${device.name}: the student's own entry is read as theirs`, excerpt(typed));
    await context.close();
  }
  {
    // The Linear Multiple Representations board's GIVEN table (lmr-pr-1).
    const { page, context } = await open(device, 'q=lmrtable&role=practice&support=read');
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const said = (await lastSpoken(page))?.text || '';
    check(said.includes('Given table of values, 4 rows. Columns: x; y. Row 1: x, negative 1; y, 9. Row 2: x, 1; y, 7. Row 3: x, 3; y, 5. Row 4: x, 5; y, 3.'), `${device.name}: the board's given table is read`, said.slice(0, 300));
    await context.close();
  }

  {
    // The Regression Calculator (AX10, slice 2): its listed source data, then the table the student fills.
    const { page, context } = await open(device, 'q=regression&role=practice&support=read');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    await read.click();
    const said = (await lastSpoken(page))?.text || '';
    const listed = await page.locator('.regression-givens-list span').allInnerTexts();
    check(listed.length === 4 && said.includes('Given table of values, 4 rows. Columns: x; y. Row 1: x, 1; y, 2. Row 2: x, 2; y, 4. Row 3: x, 3; y, 5. Row 4: x, 4; y, 8.'), `${device.name}: the calculator's listed source data is read (${listed.join(' ')})`, said.slice(0, 300));
    check(!/Table of values, \d+ rows/.test(said), `${device.name}: no table of the student's own before they add one`);
    await page.getByRole('button', { name: 'Add Item' }).click();
    await page.getByRole('menuitem', { name: 'table' }).click();
    const boxes = page.locator('.regression-table input');
    await boxes.nth(0).fill('1');
    await boxes.nth(1).fill('-2');
    // On a phone the number keypad holds the bar's place until "Done", as in
    // the Sequence Explorer case above.
    const done = page.locator('button:visible', { hasText: /^Done$/ });
    if (await done.count()) await done.first().click();
    else await boxes.nth(1).blur();
    await page.waitForTimeout(300);
    const rowCount = await page.locator('.regression-table tbody tr').count();
    await read.click();
    const typed = (await lastSpoken(page))?.text || '';
    const at = typed.indexOf('Table of values, ');
    check(rowCount > 0 && typed.includes(`Table of values, ${rowCount} rows. Columns: x sub 1; y sub 1. Row 1: x sub 1, you wrote 1; y sub 1, you wrote negative 2.`), `${device.name}: the student's table is read as typed, under x1 and y1`, at >= 0 ? typed.slice(at, at + 260) : typed.slice(0, 200));
    check(rowCount < 2 || typed.includes('Row 2: x sub 1, blank; y sub 1, blank.'), `${device.name}: an empty row is blank`);
    await context.close();
  }
  {
    // The board's process mode (AX10, slice 2): a row chooser says the rows and the picks, never the right row.
    const { page, context } = await open(device, 'q=lmrtable&role=practice&support=read');
    const read = page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]');
    const touch = device.hasTouch;
    const press = async (locator) => { await locator.scrollIntoViewIfNeeded(); if (touch) await locator.tap(); else await locator.click(); await page.waitForTimeout(300); };
    await press(page.locator('[data-process-facts] [data-process-find="slope"]'));
    const workspace = page.locator('[data-lmr-card="process"]');
    await workspace.waitFor();
    await press(workspace.locator('[data-process-choice="method:tableDelta"]'));
    await read.click();
    const none = (await lastSpoken(page))?.text || '';
    check(none.includes('Rows to choose from. Choose two rows: row 1, then row 2. Row 1: x, negative 1; y, 9. Row 2: x, 1; y, 7. Row 3: x, 3; y, 5. Row 4: x, 5; y, 3. None is chosen yet.'), `${device.name}: the row chooser is read, no row chosen`, none.slice(0, 360));
    await press(workspace.locator('[data-process-row="1"]'));
    await press(workspace.locator('[data-process-row="3"]'));
    const buttons = await workspace.locator('[data-process-row]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    await read.click();
    const picked = (await lastSpoken(page))?.text || '';
    check(buttons[1] === 'Row 2, chosen as row 1' && buttons[3] === 'Row 4, chosen as row 2' && picked.includes('Row 2: x, 1; y, 7; chosen as row 1. Row 3: x, 3; y, 5. Row 4: x, 5; y, 3; chosen as row 2.'), `${device.name}: the picks are read as the buttons name them`, picked.slice(0, 360));
    await context.close();
  }

  /* --------------------------- HELP-19: the back-up step only where it is written */
  {
    const missTwice = async (page) => {
      for (let miss = 0; miss < 2; miss += 1) {
        const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
        // Two different answers: the same one again asks to confirm first.
        await field.evaluate((element, value) => { element.setValue(value); element.dispatchEvent(new Event('input', { bubbles: true })); }, String(998 + miss));
        await page.waitForTimeout(250);
        await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
        await page.waitForTimeout(600);
      }
    };
    // A family item: its step names THIS problem's first move.
    const { page, context } = await open(device, 'q=family&role=practice&support=inclusion');
    await missTwice(page);
    const overlay = page.locator('[data-scaffold][aria-label="Let\'s back up"]');
    check(await overlay.count() === 1, `${device.name}: an inclusion student gets the step written for this problem`);
    const heading = (await overlay.locator('h2').textContent()) || '';
    check(heading.length > 10 && !/back up/i.test(heading), `${device.name}: the heading is the question, "Let's back up" is not said again`, heading);
    // The family writes its mathematics as $…$: drawn as mathematics, never as "$x$".
    const drawn = await overlay.evaluate((element) => element.innerText);
    check(!drawn.includes('$'), `${device.name}: the step's question and choices show no raw $`, drawn.slice(0, 200));
    await page.locator('.mathmaster-work-bar-tool[aria-label="Read aloud"]').click();
    const said = (await lastSpoken(page))?.text || '';
    check((said.match(/Let’s back up/g) || []).length === 1 && said.startsWith('Let’s back up.'), `${device.name}: Read aloud says "Let's back up" once, first`, said.slice(0, 160));
    // PH01: the floating "Open Work View" button sat on the end of the question
    // ("which move comes first|?"), and on a phone the card (taller than the one
    // box it covers) rose out of the work area, its label and first line under
    // the task card where nothing could scroll to them. Read from the top.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('.math-tool-workspace').forEach((element) => { element.scrollTop = 0; });
    });
    await page.waitForTimeout(250);
    const cover = await readOpenerCover(page);
    check(cover.opener !== null && cover.covered.length === 0, `${device.name}: the Work View button covers nothing of "Let's back up"`, cover.covered.join(', '));
    if (device.isMobile) {
      const reach = await page.evaluate(() => {
        const card = document.querySelector('[data-scaffold]')?.firstElementChild;
        const scroller = card?.closest('.math-tool-workspace');
        if (!card || !scroller) return null;
        return { card: Math.round(card.getBoundingClientRect().top), scroller: Math.round(scroller.getBoundingClientRect().top) };
      });
      check(reach && reach.card >= reach.scroller, `${device.name}: "Let's back up" starts inside the work area, not above it`, JSON.stringify(reach));
      // Below the button, so its first line is never on it at any text size.
      check(reach && cover.opener && reach.card >= Math.floor(cover.opener.bottom), `${device.name}: "Let's back up" starts below the Work View button`, JSON.stringify({ card: reach?.card, button: cover.opener && Math.round(cover.opener.bottom) }));
    }
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-back-up.png`) });
    await context.close();
  }
  {
    // No step written for this item: the work is not covered by a Yes/No.
    const { page, context } = await open(device, 'q=plain&role=practice&support=inclusion');
    for (const value of ['10', '7']) {
      const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
      await field.evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
      await page.waitForTimeout(250);
      await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
      await page.waitForTimeout(600);
    }
    check(await page.evaluate(() => window.__mmGrades.length) === 2, `${device.name}: two misses were graded`);
    check(await page.locator('[data-scaffold]').count() === 0, `${device.name}: no generic back-up step covers the work`);
    check(await page.getByText('should you revise the specific parts').count() === 0, `${device.name}: the generic Yes/No is gone`);
    await context.close();
  }

  {
    // A tool no family reads: its step is built from the tool's structure
    // (the owner, 2026-10-20; W7-5 decision 1). The three-planes model.
    const { page, context } = await open(device, 'q=planes&role=classwork&support=inclusion');
    for (const wrong of ['A different point on each plane.', 'Three separate intercepts.']) {
      await page.locator('[role="radio"]', { hasText: wrong }).first().click();
      await page.waitForTimeout(250);
      await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
      await page.waitForTimeout(700);
    }
    check(await page.evaluate(() => window.__mmGrades.length) === 2, `${device.name}: two misses on the planes item were graded`);
    const overlay = page.locator('[data-scaffold][aria-label="Let\'s back up"]');
    check(await overlay.count() === 1, `${device.name}: the planes item gets a step built from its structure`);
    const heading = ((await overlay.locator('h2').textContent().catch(() => '')) || '').trim();
    check(heading === 'Each equation in x, y and z is what shape in space?', `${device.name}: the step asks about this system's equations`, heading);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-back-up-planes.png`) });
    await overlay.getByRole('button', { name: 'A line' }).click();
    check(await overlay.getByText('Try the other choice.').count() === 1, `${device.name}: a wrong pick leaves only the other choice`);
    await overlay.getByRole('button', { name: 'A plane' }).click();
    await page.waitForTimeout(300);
    check(await page.locator('[data-scaffold]').count() === 0, `${device.name}: the right pick gives the work back`);
    await context.close();
  }

  /* ------------------------------------------------------------- Translate */
  {
    // A platform hint (the question family's own words).
    const { page, context } = await open(device, 'q=family&role=practice&support=translate');
    await page.locator('[data-hint-control]').click();
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
    const actions = page.locator('.mathmaster-hint-panel [data-supported-text-actions]').first();
    const translate = actions.getByRole('button', { name: /Translate/ });
    check(await translate.isVisible(), `${device.name}: a platform hint offers Translate`);
    await translate.click();
    const spanish = actions.locator('[data-translated-text][lang="es"]');
    await spanish.waitFor();
    const text = await spanish.textContent();
    check(/[áéíóúñ¿¡]|\b(la|el|los|las|de|en|para)\b/i.test(text), `${device.name}: the hint is shown in Spanish`, text.slice(0, 140));
    check(await actions.getByRole('button', { name: /Translate/ }).getAttribute('aria-pressed') === 'true', `${device.name}: the button says it is showing the translation`);
    await actions.getByRole('button', { name: /Read hint 1 aloud/ }).click();
    const heard = await lastSpoken(page);
    check(heard?.lang === 'es' && /[a-záéíóúñ]/i.test(heard?.text || ''), `${device.name}: Read then speaks the Spanish, in a Spanish voice`, JSON.stringify(heard).slice(0, 140));
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-translated-hint.png`) });
    await noSidewaysScroll(page, `${device.name} translate`);
    await context.close();
  }
  {
    // A teacher-written hint: honest, and no dead button.
    const { page, context } = await open(device, 'q=multi&role=practice&support=translate');
    await page.locator('[data-hint-control]').click();
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
    const actions = page.locator('.mathmaster-hint-panel [data-supported-text-actions]').first();
    await page.waitForTimeout(400);
    check(await actions.getByRole('button', { name: /Translate/ }).count() === 0, `${device.name}: no Translate button that cannot translate`);
    check(await actions.getByText('No Spanish translation for this text yet.').isVisible(), `${device.name}: the student is told there is no Spanish for this text`);
    check(await actions.getByRole('button', { name: /Read hint 1 aloud/ }).isVisible(), `${device.name}: Read aloud is still there`);
    await context.close();
  }
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);

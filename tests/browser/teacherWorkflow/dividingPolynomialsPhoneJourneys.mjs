// DIVIDING POLYNOMIALS ON A PHONE, IN THE REAL APP (PH06, PH09).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/teacherWorkflow/dividingPolynomialsPhoneJourneys.mjs
//
// tests/browser/algebra2DividingPolynomialsLesson.mjs opens every question of
// the lesson in the QuestionEngine harness, where the page is the scroller and
// the box around the table is not the App's. This is the App's phone shell
// (`?questions=dividing`, the real teacher-import chain), as student 910002 on a
// touch phone, at 390×844, 360×740, 344×882 and 320×640:
//
//   bracket   Classwork 5 (divisor x + 3) and Practice 14 (divisor y² + y − 5):
//             every cell holds its math, and no cell's math is drawn over
//             another's (the divisor over the dividend at 360px and 344px,
//             D-51). The bracket fits its box from 344px up; at 320px the
//             quadratic one is wider than the box and scrolls inside it.
//   table     Classwork 8 (four coefficients) and Practice 15 (five): the table
//             fits its box, so it does not scroll, and the remainder box is
//             inside the box and the screen (D-50).
//   large     390×844 at 200% browser text: the five-coefficient table is wider
//             than its box and scrolls inside it, shows a soft edge on the side
//             that has more, and the remainder box is reached by scrolling it.
//   supportPanel  390×844, Classwork 3 (PH09, C2-103): opening Vocabulary in the
//             task card shows at least 90% of its 320px list (23px of it showed
//             in a 211px card), the card takes no more than 60% of the screen,
//             and closing it gives the card its quarter and the work its room.
//
// Exit code 1 on any finding. DIVIDING_PHONE_SHOTS=<dir> saves a screenshot of each.
import { mkdirSync } from 'node:fs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const SHOTS = process.env.DIVIDING_PHONE_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const STUDENT = '910002';
const PHONES = [
  { name: 'phone 390×844', width: 390, height: 844 },
  { name: 'phone 360×740', width: 360, height: 740 },
  { name: 'foldable 344×882', width: 344, height: 882 },
  { name: 'phone 320×640', width: 320, height: 640 },
];
const BRACKETS = [['Classwork', 5, 'Classwork 5 (divisor x + 3)'], ['Practice', 14, 'Practice 14 (divisor y² + y − 5)']];
const TABLES = [['Classwork', 8, 'Classwork 8 (four coefficients)'], ['Practice', 15, 'Practice 15 (five coefficients)']];
// The box a bracket may not fit: the quadratic divisor's bracket is 277px wide and the box at 320px is 252px.
const BRACKET_NEEDS_SCROLL = (phone, number) => number === 14 && phone.width < 344;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

const openLesson = async (phone, textScale = 1) => {
  const context = await newSchoolContext(browser, { viewport: { width: phone.width, height: phone.height }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${phone.name}: page error ${error.message}`));
  if (textScale !== 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * textScale), fixed: Math.round(13 * textScale) } });
  }
  const search = new URLSearchParams({ reset: '1', as: 'student', studentId: STUDENT, questions: 'dividing', p3StartMin: '40' });
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1800);
  return { context, page };
};

// A question by its section and number, through the navigator a student uses.
const goTo = async (page, section, number) => {
  const progress = page.locator('.mathmaster-focus-view-button');
  if (/show progress/i.test(await progress.innerText())) {
    await progress.click();
    await page.waitForTimeout(500);
  }
  await page.locator('.mathmaster-section-tab', { hasText: section }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.mathmaster-question-number', { hasText: new RegExp(`^${number}$`) }).first().click();
  await page.waitForTimeout(1500);
  const focus = page.locator('.mathmaster-focus-view-button');
  if (/focus view/i.test(await focus.innerText())) {
    await focus.click();
    await page.waitForTimeout(500);
  }
};

// Math below the fold is typeset as it scrolls into view: bring the box up and wait for its math.
const bringIntoView = async (page, boxSelector, readySelector) => {
  const box = page.locator(boxSelector).first();
  await box.waitFor({ timeout: 20000 });
  await box.scrollIntoViewIfNeeded();
  await page.waitForFunction((selector) => {
    const cells = [...document.querySelectorAll(selector)];
    return cells.length > 0 && cells.every((cell) => cell.getBoundingClientRect().width > 30);
  }, readySelector, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
};

const readBracket = (page) => page.evaluate(() => {
  const grid = document.querySelector('.mm-long-division');
  const box = grid?.closest('.mm-long-division-scroll');
  const cells = [...(grid?.children || [])].filter((cell) => (cell.textContent || '').trim() && cell.getBoundingClientRect().width > 0);
  const mathBoxes = (cell) => [...cell.querySelectorAll('.katex-html, mjx-container, math, svg')].map((element) => element.getBoundingClientRect()).filter((rect) => rect.width > 0);
  const overlaps = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      for (const a of mathBoxes(cells[i])) {
        for (const b of mathBoxes(cells[j])) {
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
            overlaps.push(`${(cells[i].textContent || '').trim().slice(0, 10)} over ${(cells[j].textContent || '').trim().slice(0, 10)}`);
          }
        }
      }
    }
  }
  return {
    found: Boolean(grid),
    label: grid?.getAttribute('aria-label') || '',
    cut: cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).map((cell) => `${(cell.textContent || '').trim().slice(0, 14)} (${cell.clientWidth}px box, ${cell.scrollWidth}px math)`),
    overlaps: [...new Set(overlaps)],
    boxWidth: box ? Math.round(box.clientWidth) : 0,
    needs: box ? Math.round(box.scrollWidth) : 0,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const readTable = (page) => page.evaluate(() => {
  const grid = document.querySelector('.mm-synthetic');
  const box = grid?.closest('.mm-synthetic-scroll');
  const remainder = grid?.querySelector('.mm-synthetic-remainder .mm-synthetic-input');
  const place = () => {
    const rect = remainder?.getBoundingClientRect();
    const boxRect = box?.getBoundingClientRect();
    return rect && boxRect ? rect.right <= Math.min(boxRect.right, innerWidth) + 0.5 && rect.left >= Math.max(boxRect.left, 0) - 0.5 : null;
  };
  return {
    found: Boolean(grid),
    inputs: grid ? grid.querySelectorAll('.mm-synthetic-input').length : 0,
    boxWidth: box ? Math.round(box.clientWidth) : 0,
    needs: box ? Math.round(box.scrollWidth) : 0,
    remainderShown: place(),
    edges: box ? (getComputedStyle(box).backgroundImage.match(/linear-gradient/g) || []).length : 0,
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

/* -------------------------------------------------------------- the phones */
for (const phone of PHONES) {
  const { context, page } = await openLesson(phone);
  for (const [section, number, label] of BRACKETS) {
    await goTo(page, section, number);
    await bringIntoView(page, '.mm-long-division-scroll', '.mm-long-division .mm-ld-divisor, .mm-long-division .mm-ld-dividend');
    const bracket = await readBracket(page);
    const where = `${phone.name}, ${label}`;
    if (!check(bracket.found, `${where}: the long-division bracket is on screen`)) continue;
    check(bracket.cut.length === 0, `${where}: every cell holds its math`, bracket.cut.join('; '));
    check(bracket.overlaps.length === 0, `${where}: no cell's math is drawn over another's`, bracket.overlaps.join('; '));
    if (BRACKET_NEEDS_SCROLL(phone, number)) {
      check(bracket.needs > bracket.boxWidth, `${where}: wider than its box, so it scrolls inside it`, `${bracket.needs}px in a ${bracket.boxWidth}px box`);
    } else {
      check(bracket.needs <= bracket.boxWidth + 2, `${where}: the bracket fits its box`, `${bracket.needs}px in a ${bracket.boxWidth}px box`);
    }
    check(bracket.page <= 0, `${where}: nothing scrolls the page sideways`, `${bracket.page}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/bracket-${phone.width}-${section.toLowerCase()}-${number}.png` });
  }
  for (const [section, number, label] of TABLES) {
    await goTo(page, section, number);
    await bringIntoView(page, '.mm-synthetic-scroll', '.mm-synthetic-input');
    const table = await readTable(page);
    const where = `${phone.name}, ${label}`;
    if (!check(table.found && table.inputs >= 8, `${where}: the synthetic-division table is on screen`, `${table.inputs} boxes`)) continue;
    check(table.needs <= table.boxWidth + 1, `${where}: the table fits its box and does not scroll`, `${table.needs}px in a ${table.boxWidth}px box`);
    check(table.remainderShown === true, `${where}: the remainder box is inside its box and the screen`);
    check(table.page <= 0, `${where}: nothing scrolls the page sideways`, `${table.page}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/table-${phone.width}-${section.toLowerCase()}-${number}.png` });
  }
  await context.close();
}

/* ---------------------------------------------------------------- 200% text */
{
  const phone = PHONES[0];
  const { context, page } = await openLesson(phone, 2);
  await goTo(page, 'Practice', 15);
  await bringIntoView(page, '.mm-synthetic-scroll', '.mm-synthetic-input');
  const table = await readTable(page);
  const where = `${phone.name} at 200% text, Practice 15`;
  check(table.found && table.inputs >= 8, `${where}: the synthetic-division table is on screen`, `${table.inputs} boxes`);
  check(table.needs > table.boxWidth, `${where}: the table is wider than its box, so it scrolls inside it`, `${table.needs}px in a ${table.boxWidth}px box`);
  check(table.edges >= 4, `${where}: the box shows a soft edge on the side that has more`, `${table.edges} gradient layers`);
  check(table.page <= 0, `${where}: nothing scrolls the page sideways`, `${table.page}px`);
  // Scrolling the box the way a thumb does brings the remainder box into it.
  const reached = await page.evaluate(() => {
    const box = document.querySelector('.mm-synthetic-scroll');
    box.scrollLeft = box.scrollWidth;
    const rect = document.querySelector('.mm-synthetic-remainder .mm-synthetic-input').getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    return rect.right <= Math.min(boxRect.right, innerWidth) + 0.5 && rect.left >= boxRect.left - 0.5;
  });
  check(reached, `${where}: scrolling the box brings the remainder box into view`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/table-390-200pct-practice-15.png` });
  await context.close();
}

/* ------------------------------------------------------------ supportPanel */
// The task card is a quarter of the screen. Opening Vocabulary put a 320px list
// in a 211px card: 23px of it showed, the rest behind a scroll in a scroll
// (PH09, C2-103). While a support panel is open the card takes up to 60% of
// the screen, and is back to its quarter when the panel is closed. A card that
// scrolls shows a soft edge on the side that has more (D-63).
{
  const phone = PHONES[0];
  const { context, page } = await openLesson(phone);
  await goTo(page, 'Classwork', 3);
  const card = () => page.evaluate(() => {
    const panel = document.querySelector('.question-prompt-panel');
    const rect = panel.getBoundingClientRect();
    const region = panel.querySelector('[role="region"]');
    const regionRect = region ? region.getBoundingClientRect() : null;
    const visible = regionRect ? Math.max(0, Math.min(regionRect.bottom, rect.bottom) - Math.max(regionRect.top, rect.top)) : 0;
    return {
      height: Math.round(rect.height),
      screen: innerHeight,
      edges: (getComputedStyle(panel).backgroundImage.match(/linear-gradient/g) || []).length,
      region: regionRect ? Math.round(regionRect.height) : null,
      share: regionRect ? Math.round((visible / regionRect.height) * 100) : null,
      work: Math.round(document.querySelector('.math-tool-workspace').getBoundingClientRect().height),
    };
  });
  const closed = await card();
  const where = `${phone.name}, Classwork 3`;
  check(closed.height <= closed.screen * 0.25 + 1, `${where}: the task card is a quarter of the screen`, `${closed.height}px`);
  check(closed.edges >= 4, `${where}: the task card shows a soft edge where it has more (${closed.edges} gradient layers)`);
  const chip = page.locator('[data-support-tool="vocabulary"]').first();
  if (check(await chip.count() === 1, `${where}: the Support tools offer Vocabulary`)) {
    await chip.tap();
    await page.waitForTimeout(1200);
    const open = await card();
    check(open.region !== null && open.region > 100, `${where}: Vocabulary opens a list`, `${open.region}px`);
    check(open.share >= 90, `${where}: the open list is on screen, not behind a scroll in the card`, `${open.share}% of ${open.region}px, the card is ${open.height}px`);
    check(open.height <= open.screen * 0.6 + 1, `${where}: the card takes no more than 60% of the screen`, `${open.height}px`);
    check(open.work >= 100, `${where}: the work keeps a strip of the screen while the list is open`, `${open.work}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/vocabulary-open-390.png` });
    await chip.tap();
    await page.waitForTimeout(600);
    const shut = await card();
    check(shut.height <= shut.screen * 0.25 + 1, `${where}: closing it gives the card back its quarter`, `${shut.height}px`);
    check(shut.work >= closed.work - 1, `${where}: and the work its room`, `${shut.work}px, was ${closed.work}px`);
  }
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}` : '\nDividing Polynomials on a phone, in the real App: every check passed.');
process.exit(failures.length ? 1 : 0);

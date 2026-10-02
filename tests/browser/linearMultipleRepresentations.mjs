// PR #397: THE ALGEBRA I MULTIPLE-REPRESENTATIONS ASSIGNMENT, DONE AS A STUDENT DOES IT.
//
//   npx vite --host 127.0.0.1 --port 5197 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/linearMultipleRepresentations.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The FINAL assignment (docs/assignments/algebra1-linear-multiple-representations-final-v5.json),
// compiled through the teacher import chain by linearMultipleRepresentationsMain.jsx and
// mounted in the real QuestionEngine. Driven only through rendered controls:
// typing into MathLive fields, clicking and tapping the grid, dragging points,
// pressing Enter, collapsing, enlarging, reloading. The only thing read back
// from storage is the saved draft, to prove what survived a reload.
//
//   warmups        WU1 + WU2 card sorts, completed and checked.
//   cw1-free-order CW1 (laptop) in a deliberately non-sequential order with
//                  wrong answers first: point-slope → table → Graph 2 → y-int →
//                  Graph 1 (enlarged) → slope → Graph 3 → the rest. Undo, drag,
//                  Start over, collapse/expand everything, reload mid-way, submit.
//   fraction-anchor CW1: point-slope through (1, −5/2); Graph 3 refines to halves.
//   far-anchor     CW1: point-slope through (20, 7); Graph 3's window grows to it.
//   issue-b        y = x with an authored snapStep of 1; y − 1/2 = x − 1/2 is plottable.
//   given          Every GIVEN source kind renders what the author wrote.
//   ipad-table     PR1 (820×1180, touch): the GIVEN table, board completed by touch.
//   phone-scenario PR2 (390×844, touch): the candle story, keypad entry, context,
//                  enlarged graph; no horizontal overflow.
//   dol            DOL (laptop): no Check, no verdicts, Enter never submits,
//                  an incomplete board asks first, one submission.
//   complete       CW2, CW3, PR1 and PR2 finished and submitted correct; CW3 insists on
//                  its GIVEN anchor (3, 2) for Graph 3. A correct board is final:
//                  Undo cannot reopen it.
//   zoom           CW1 at 1920×1080 (a 1366 laptop at ~70% zoom).
//   family         The family-backed upgrade (?family=1): this student's generated
//                  versions of CW2, CW3, PR1 and PR2 completed and submitted correct,
//                  and the DOL submitted once — answers worked out from each
//                  version's own line; the GIVEN shown is the version's and read-only.
//                  CW2, CW3, PR1 and the DOL are Process Mode boards: their key facts
//                  are established through the board's own processes first
//                  (lmrProcessDriver.mjs), then the cards they open are built.
//   undo           PQ-009, PR2 (laptop): a checked card, then five edits across four
//                  cards (a meaning, the table twice, a typed equation, a point);
//                  the platform Undo takes them back one at a time, newest first,
//                  opens a folded card, brings each change into view, announces it
//                  once, keeps focus on Undo and never touches a verdict. A Check
//                  is not a step. Graph 3's own Undo is the same history filtered
//                  to Graph 3. After a reload one Undo takes back one step; after a
//                  submission the attempt and its result stay.
//   undo-phone     PQ-009 at 390×844 by touch: four edits on three cards, four Undos
//                  from the portrait bar, each revealed and announced — two in a
//                  row on one card both heard; no sideways scroll.
//
// Exit code 1 on any finding. Screenshots: tests/browser/artifacts/linearMultipleRepresentations/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { establishProcessFacts } from './lmrProcessDriver.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5197';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/linearMultipleRepresentations');
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const { chromium } = await import(PLAYWRIGHT_MODULE);
const { sanitizeWorkspaceDraftValue } = await import(path.join(ROOT, 'functions/shared/workspaceDraftSchema.mjs'));
const { deriveLinearMultipleRepresentations, resolveRequiredCards } = await import(path.join(ROOT, 'functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs'));

const LAPTOP = { width: 1366, height: 768 };
const IPAD = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };

const findings = [];
const notes = [];
let journeyName = '';
const check = (value, message) => {
  if (!value) findings.push(`[${journeyName}] ${message}`);
  return Boolean(value);
};
const note = (message) => notes.push(`[${journeyName}] ${message}`);
const settle = (page, ms = 350) => page.waitForTimeout(ms);

// ------------------------------------------------------------------ helpers
const open = async (page, id, run, { gallery = false, family = false } = {}) => {
  await page.goto(`${ORIGIN}/tests/browser/linearMultipleRepresentations.html?q=${id}&run=${run}${gallery ? '&gallery=1' : ''}${family ? '&family=1' : ''}`, { timeout: 120000 });
  await page.locator('[data-question-id]').first().waitFor({ timeout: 120000 });
  await page.locator('.mathmaster-tool-shell').first().waitFor({ timeout: 120000 });
  await settle(page, 1200);
};
const card = (scope, cardId) => scope.locator(`[data-lmr-card="${cardId}"]`).first();
const checkButton = (scope, cardId) => card(scope, cardId).locator('button[data-card-check="true"]').first();

// Every math element on the page is typeset lazily when it scrolls into view.
const renderAllMath = async (page) => {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight - 100);
    const scrollers = [document.scrollingElement, ...document.querySelectorAll('*')].filter((el) => el && el.scrollHeight > el.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(el).overflowY));
    for (const scroller of scrollers) {
      for (let y = 0; y <= scroller.scrollHeight; y += step) { scroller.scrollTop = y; await new Promise((r) => setTimeout(r, 60)); }
      scroller.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  });
  await settle(page, 500);
};
const shot = async (page, name, locator = null) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const file = path.join(ARTIFACTS, `${name}.png`);
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: true });
  return file;
};

let slowestFocusMs = 0;
/**
 * Click into a MathLive field and TYPE, the way a student does. A space leaves
 * a fraction. Like a person, it waits until the cursor is really in the field:
 * on a busy main thread MathLive's focus lands after the click, and keys sent
 * in between go to the PREVIOUS field (select-all + Backspace there wiped a
 * finished x-intercept during this PR's QA).
 */
const typeMath = async (page, field, text) => {
  await field.scrollIntoViewIfNeeded();
  await field.click();
  const waited = await field.evaluate((element) => new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (document.activeElement === element || performance.now() - started > 3000) resolve(performance.now() - started);
      else requestAnimationFrame(tick);
    };
    tick();
  }));
  slowestFocusMs = Math.max(slowestFocusMs, waited);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 25 });
  await settle(page, 250);
  return field.evaluate((element) => element.value);
};
const mathField = (scope, cardId, index = 0) => card(scope, cardId).locator('math-field').nth(index);

const geometry = async (scope, key) => {
  const wrap = scope.locator(`[data-lmr-plane="${key}"]`).first();
  await wrap.scrollIntoViewIfNeeded();
  const [xMin, xMax, yMin, yMax] = (await wrap.getAttribute('data-bounds')).split(',').map(Number);
  const svg = wrap.locator('svg').first();
  const box = await svg.boundingBox();
  const [, , width, height] = (await svg.getAttribute('viewBox')).split(/\s+/).map(Number);
  return { xMin, xMax, yMin, yMax, box, width, height, snap: Number(await wrap.getAttribute('data-snap')) };
};
const toScreen = (g, [x, y]) => {
  const pad = 42;
  const vx = pad + ((x - g.xMin) / (g.xMax - g.xMin)) * (g.width - pad * 2);
  const vy = g.height - pad - ((y - g.yMin) / (g.yMax - g.yMin)) * (g.height - pad * 2);
  return { x: g.box.x + (vx * g.box.width) / g.width, y: g.box.y + (vy * g.box.height) / g.height };
};
const plot = async (page, scope, key, point, { touch = false } = {}) => {
  const g = await geometry(scope, key);
  const at = toScreen(g, point);
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await settle(page, 300);
};
const drag = async (page, scope, key, from, to) => {
  const g = await geometry(scope, key);
  const a = toScreen(g, from);
  const b = toScreen(g, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await settle(page, 300);
};
// Fields the student never touched are absent from the saved record.
const work = async (page, id) => ({ graph1Points: [], graph2Points: [], graph3Points: [], ...(await page.evaluate((qid) => window.__lmr.work(qid), id)) });
const grades = (page) => page.evaluate(() => window.__lmr.grades());
const cardText = (scope, cardId) => card(scope, cardId).innerText();
const hasCorrectBadge = async (scope, cardId) => (await card(scope, cardId).locator('text=✓ Correct').count()) > 0;
const samePoints = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

/** Text a student can read that is NOT inside a typeset math element. */
const proseText = (locator) => locator.evaluate((root) => {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('math-span, math-div, math-field, svg, script, style').forEach((el) => el.remove());
  return clone.innerText;
});

/** Horizontal overflow anywhere in the question, at this viewport. */
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const root = document.querySelector('.mathmaster-tool-shell');
  const offenders = [...(root?.querySelectorAll('*') || [])]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed'; })
    .slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.dataset.lmrCard ? `[${el.dataset.lmrCard}]` : ''} right=${Math.round(el.getBoundingClientRect().right)}`);
  const scrollers = [...(root?.querySelectorAll('*') || [])]
    .filter((el) => el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX) && el.tagName !== 'MATH-FIELD')
    .slice(0, 5).map((el) => el.tagName.toLowerCase());
  return { vw, docScroll: document.documentElement.scrollWidth, offenders, scrollers };
});

// ------------------------------------------------------------- Undo helpers
// The platform Undo the student presses: in the desktop action bar, or the
// phone's portrait bar.
const platformUndo = (page) => page.locator('.mathmaster-universal-undo:visible').first();
// The work as a student built it, without the record's layout and Check
// fingerprints — what an Undo is allowed to change.
const mathOf = ({ expandedCards: _layout, checkedCards: _checks, ...rest }) => JSON.stringify(Object.keys(rest).sort().map((key) => [key, rest[key]]));
/**
 * Record what screen readers would be told: every node or text added to any
 * live region on the page (aria-live, role=status/alert), including regions
 * that appear later. Read and clear with takeAnnouncements.
 */
const watchAnnouncements = (page) => page.evaluate(() => {
  window.__announced = [];
  const watched = new WeakSet();
  const watch = () => document.querySelectorAll('[aria-live], [role="status"], [role="alert"]').forEach((region) => {
    if (watched.has(region)) return;
    watched.add(region);
    new MutationObserver((records) => {
      const text = records.flatMap((record) => (record.type === 'characterData'
        ? [record.target.textContent]
        : [...record.addedNodes].map((node) => node.textContent))).map((value) => String(value || '').trim()).filter(Boolean);
      if (text.length) window.__announced.push({ politeness: region.getAttribute('aria-live') || region.getAttribute('role'), board: region.hasAttribute('data-lmr-announcer'), text: text.join(' ') });
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
  watch();
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
});
const takeAnnouncements = (page) => page.evaluate(() => window.__announced.splice(0));
/** Whether an element is on screen with nothing over its middle: what the student can see. */
const uncovered = async (locator) => (await locator.count()) > 0 && locator.evaluate((element) => {
  const box = element.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + Math.min(box.height / 2, 30);
  if (!box.width || !box.height || x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit) && element.contains(hit);
});
/**
 * Press the platform Undo and report what it did: which card it marked, whether
 * the changed field is in view, what was announced, and where focus is.
 */
const pressUndo = async (page, button = platformUndo(page), { touch = false } = {}) => {
  await takeAnnouncements(page);
  // An Undo that is off is a finding, not a 30-second wait on a dead button.
  if (!(await button.isEnabled())) return { pressed: false, marked: [], announced: [], focusOnUndo: false };
  if (touch) await button.tap();
  else await button.click();
  await settle(page, 350);
  const marked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-lmr-undone]')];
    const newest = Math.max(0, ...cards.map((card) => Number(card.dataset.lmrUndone)));
    return [...new Set(cards.filter((card) => Number(card.dataset.lmrUndone) === newest).map((card) => card.dataset.lmrCard))];
  });
  const focusOnUndo = await page.evaluate(() => Boolean(document.activeElement?.closest?.('button')?.matches('.mathmaster-universal-undo, [aria-label^="Undo on"]')));
  return { marked, announced: await takeAnnouncements(page), focusOnUndo };
};
// The element an Undo of `field` must bring into view: inside the enlarged
// graph when that is open, on the board otherwise.
const fieldOnBoard = (page, field) => page.locator(`.mm-lmr-board [data-lmr-field="${field}"]`).first();

const measureDraft = async (page, id) => {
  const record = await work(page, id);
  const sanitized = sanitizeWorkspaceDraftValue(record);
  check(sanitized.ok, `${id}: the saved board record would not sync to the server (${sanitized.reason})`);
  if (sanitized.ok) note(`${id}: saved draft ${sanitized.bytes} bytes (cap 16000)`);
};

// ----------------------------------------------------------------- journeys
const journeys = {};

journeys.warmups = async (browser) => {
  const page = await (await browser.newContext({ viewport: LAPTOP })).newPage();
  for (const [id, sets] of [
    ['lmr-wu-1', { 'Line A': ['y = 2x - 4', '2x - y = 4', 'y - 2 = 2(x - 3)', '(2, 0)'], 'Line B': ['y = -x + 3', 'x + y = 3', 'y - 1 = -1(x - 2)', '(3, 0)'] }],
    // WU-2 sorts situations, so its groups are named for them (student UX pass, R-9).
    ['lmr-wu-2', { 'Situation A': ['Maya', 'y = 5x + 20', 'm = 5', '(0, 20)'], 'Situation B': ['tub', 'y = -4x + 40', 'm = -4', '(0, 40)'] }],
  ]) {
    await open(page, id, 'warmups');
    await renderAllMath(page);
    const cards = page.locator('button.mathmaster-line-card');
    const count = await cards.count();
    check(count >= 8, `${id}: expected at least 8 cards, found ${count}`);
    const describe = async (index) => cards.nth(index).evaluate((el) => {
      const math = [...el.querySelectorAll('math-span, math-div')].map((m) => m.textContent).join(' ');
      return `${el.getAttribute('aria-label')} ${el.innerText} ${math}`;
    });
    // Graph cards are identified by their line: the slope is readable from the plotted segment's direction.
    const graphSlopeSign = async (index) => cards.nth(index).evaluate((el) => {
      const line = [...el.querySelectorAll('svg line, svg path')].find((node) => (node.getAttribute('stroke') || '').toLowerCase() === '#1a73e8');
      if (!line) return 0;
      if (line.tagName === 'line') {
        const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(line.getAttribute(a)));
        return Math.sign(-(y2 - y1) / (x2 - x1));
      }
      const nums = (line.getAttribute('d') || '').match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
      return nums.length >= 4 ? Math.sign(-(nums[nums.length - 1] - nums[1]) / (nums[nums.length - 2] - nums[0])) : 0;
    });
    const normalize = (text) => text.replace(/−/g, '-').replace(/\s+/g, ' ');
    for (const [line, needles] of Object.entries(sets)) {
      await page.getByRole('radio', { name: line }).or(page.getByRole('button', { name: line, exact: true })).first().click();
      await settle(page, 200);
      for (let index = 0; index < count; index += 1) {
        const text = normalize(await describe(index));
        const isGraph = text.startsWith('Graph:');
        const wantPositive = / A$/.test(line);
        const belongs = isGraph
          ? (await graphSlopeSign(index)) === (wantPositive ? 1 : -1)
          : needles.some((needle) => text.includes(needle.replace(/\s+/g, ' ')) || text.replace(/\s/g, '').includes(needle.replace(/\s/g, '')));
        if (belongs) { await cards.nth(index).click(); await settle(page, 120); }
      }
    }
    await shot(page, `${id}-sorted`);
    await page.getByRole('button', { name: 'Check groups' }).click();
    await settle(page, 800);
    const body = await page.locator('.mathmaster-tool-shell').first().innerText();
    check(/correct|every card|all .* match|great/i.test(body) && !/not yet|try again/i.test(body.split('Check groups')[1] || ''), `${id}: sorting every card by its line was not accepted`);
    await shot(page, `${id}-checked`);
  }
  await page.context().close();
};

journeys['cw1-free-order'] = async (browser) => {
  const id = 'lmr-cw-1';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  let step = 'start';
  page.on('console', (message) => { if (message.type() === 'error' && !/font|404|Failed to load resource/i.test(message.text())) consoleErrors.push(`${step}: ${message.text().slice(0, 120)}`); });
  await open(page, id, 'cw1');
  const given = page.locator('[data-lmr-given]');
  const givenMath = await given.locator('math-div, math-span').first().textContent();
  check(/2x\s*-\s*4y\s*=\s*12/.test(givenMath), `GIVEN shows the authored 2x − 4y = 12 (saw "${givenMath}")`);
  check(!/x\s*-\s*2y\s*=\s*6/.test(await given.innerText()), 'GIVEN never shows the normalised x − 2y = 6');
  check(await card(page, 'standardForm').count() === 0, 'the GIVEN standard form is not asked for again');
  const strip = await page.locator('[aria-label="Your progress"]').innerText();
  check(/any order/i.test(strip) && /0 of 10/.test(strip), `progress strip: "${strip}"`);
  await renderAllMath(page);
  await shot(page, 'cw1-01-start');

  // 1. POINT-SLOPE FIRST — wrong slope, then right, both with Enter.
  step = 'point-slope';
  const psField = mathField(page, 'pointSlope');
  await typeMath(page, psField, 'y+2=2(x-2)');
  await page.keyboard.press('Enter');
  await settle(page);
  const psWrong = await cardText(page, 'pointSlope');
  check(/slope 2/.test(psWrong) && /Check the slope/.test(psWrong), `wrong slope names the slope to reconsider: "${psWrong}"`);
  check(!/1\/2|½/.test(psWrong), 'wrong-slope feedback does not reveal the slope');
  const psValue = await typeMath(page, psField, 'y+2=1/2 (x-2)');
  // MathLive writes a one-digit fraction compactly: \frac12.
  check(/\\frac(\{1\}\{2\}|12)/.test(psValue), `typing 1/2 builds a stacked fraction (field holds "${psValue}")`);
  check(/\\left\(x-2\\right\)|\(x-2\)/.test(psValue), `point-slope parentheses survive typing ("${psValue}")`);
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'pointSlope'), 'point-slope y + 2 = 1/2(x − 2) is accepted with Enter');
  check(await page.locator('[data-lmr-card="graphPointSlope"]').innerText().then((t) => /Start at your point/.test(t)), 'Graph 3 now names the student\'s own point');

  // 2. TABLE — whole numbers, a fraction, one wrong row, add/remove a row.
  step = 'table';
  const cell = (row, field) => card(page, 'table').locator(`input[aria-label="Row ${row} ${field}"]`);
  const rows = [['0', '-3'], ['2', '-2'], ['4', '-1'], ['1', '-2']];
  for (const [index, [x, y]] of rows.entries()) {
    await cell(index + 1, 'x').fill(x);
    await cell(index + 1, 'y').fill(y);
  }
  await cell(4, 'y').press('Enter');
  await settle(page);
  const tableWrong = await cardText(page, 'table');
  check(/\(1, -2\) is not on this line/.test(tableWrong), `a wrong row is named: "${tableWrong}"`);
  check((await grades(page)).length === 0, 'Enter in a table cell never submits the board');
  await cell(4, 'y').fill('-5/2');
  await card(page, 'table').getByRole('button', { name: '+ Add row' }).click();
  await settle(page, 200);
  check(await card(page, 'table').locator('input[aria-label="Row 5 x"]').count() === 1, 'Add row adds a fifth row');
  await card(page, 'table').getByRole('button', { name: 'Remove row 5' }).click();
  await settle(page, 200);
  await checkButton(page, 'table').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'table'), 'the table with the fractional row (1, −5/2) is accepted');

  // 3. GRAPH 2 — points that miss the y-intercept first, then Undo, drag, Start over.
  step = 'graph2';
  await plot(page, page, 'graph2', [2, -2]);
  await plot(page, page, 'graph2', [4, -1]);
  await checkButton(page, 'graphSlopeIntercept').click();
  await settle(page);
  const g2Wrong = await cardText(page, 'graphSlopeIntercept');
  check(/starts at the y-intercept/.test(g2Wrong), `Graph 2 names the missing method step: "${g2Wrong}"`);
  await card(page, 'graphSlopeIntercept').getByRole('button', { name: /^Undo/ }).click();
  await settle(page);
  check(samePoints((await work(page, id)).graph2Points, [[2, -2]]), 'Undo removes the last Graph 2 point');
  await plot(page, page, 'graph2', [0, -3]);
  await drag(page, page, 'graph2', [2, -2], [4, -1]);
  check(samePoints((await work(page, id)).graph2Points, [[4, -1], [0, -3]]), `dragging moves a point (${JSON.stringify((await work(page, id)).graph2Points)})`);
  await card(page, 'graphSlopeIntercept').getByRole('button', { name: /Start .* over/ }).click();
  await settle(page);
  check(samePoints((await work(page, id)).graph2Points, []), 'Start over clears Graph 2');
  await card(page, 'graphSlopeIntercept').getByRole('button', { name: /^Undo/ }).click();
  await settle(page);
  check(samePoints((await work(page, id)).graph2Points, [[4, -1], [0, -3]]), 'Undo brings back what Start over cleared');
  await checkButton(page, 'graphSlopeIntercept').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'graphSlopeIntercept'), 'Graph 2 (y-intercept + slope step) is accepted');
  check((await work(page, id)).graph1Points.length === 0 && (await work(page, id)).graph3Points.length === 0, 'plotting Graph 2 never fills Graph 1 or Graph 3');

  // 4. Y-INTERCEPT with Enter.
  step = 'y-intercept';
  await typeMath(page, mathField(page, 'yIntercept'), '(0,-3)');
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'yIntercept'), 'y-intercept (0, −3) accepted with Enter');

  // RELOAD mid-way: every draft comes back.
  step = 'reload';
  const before = await work(page, id);
  await page.reload();
  await page.locator('[data-lmr-given]').waitFor({ timeout: 120000 });
  await settle(page, 1500);
  const after = await work(page, id);
  check(samePoints(after.graph2Points, before.graph2Points) && after.pointSlopeEquation === before.pointSlopeEquation && JSON.stringify(after.tableRows) === JSON.stringify(before.tableRows), 'the saved work is unchanged by a reload');
  check((await mathField(page, 'pointSlope').evaluate((el) => el.value)) === before.pointSlopeEquation, 'the point-slope field is refilled after reload');
  check((await cell(4, 'y').inputValue()) === '-5/2', 'the table is refilled after reload');
  check(await page.locator('[data-lmr-plane="graph2"] svg circle').count() >= 2, 'Graph 2 points are redrawn after reload');
  check(await hasCorrectBadge(page, 'pointSlope') && await hasCorrectBadge(page, 'table'), 'checked cards show their verdict again after reload (recomputed, not stored)');
  check(/4 of 10/.test(await page.locator('[aria-label="Your progress"]').innerText()), 'the progress count survives the reload');
  await measureDraft(page, id);

  // 5. GRAPH 1 in the ENLARGED view: plot, check there, close with Escape.
  step = 'graph1';
  await card(page, 'graphIntercepts').getByRole('button', { name: /^Enlarge/ }).click();
  const dialog = page.locator('[role="dialog"][data-lmr-dialog="graph1"]');
  await dialog.waitFor();
  await settle(page, 400);
  check(/Your task/.test(await dialog.innerText()), 'the enlarged graph keeps the task in view');
  const dialogBox = await dialog.locator('[data-lmr-plane="graph1"] svg').boundingBox();
  check(dialogBox && dialogBox.width > 420, `the enlarged plane is actually larger (${Math.round(dialogBox?.width || 0)}px wide)`);
  const checkInDialog = await dialog.locator('button[data-card-check="true"]').boundingBox();
  check(checkInDialog && checkInDialog.y + checkInDialog.height <= LAPTOP.height, 'Check is visible without scrolling the enlarged view');
  await plot(page, dialog, 'graph1', [6, 0]);
  await plot(page, dialog, 'graph1', [0, -2]);
  await dialog.locator('button[data-card-check="true"]').click();
  await settle(page);
  check(/crosses/.test(await dialog.innerText()), 'a wrong intercept is caught in the enlarged view');
  await drag(page, dialog, 'graph1', [0, -2], [0, -3]);
  await dialog.locator('button[data-card-check="true"]').click();
  await settle(page);
  check(/✓ Correct/.test(await dialog.innerText()), 'Graph 1 accepted inside the enlarged view');
  await shot(page, 'cw1-02-graph1-enlarged');
  await page.keyboard.press('Escape');
  await settle(page);
  check(await dialog.count() === 0, 'Escape closes the enlarged graph');
  check(samePoints((await work(page, id)).graph1Points, [[6, 0], [0, -3]]) && await hasCorrectBadge(page, 'graphIntercepts'), 'enlarged work is on the board after closing');

  // 6. SLOPE — wrong, then a typed fraction.
  step = 'slope';
  await typeMath(page, mathField(page, 'slope'), '2');
  await page.keyboard.press('Enter');
  await settle(page);
  check(/rise to the run/.test(await cardText(page, 'slope')), 'a wrong slope says what to compare');
  await typeMath(page, mathField(page, 'slope'), '1/2');
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'slope'), 'slope 1/2 accepted');

  // 7. GRAPH 3 from the student's own point (2, −2).
  step = 'graph3';
  await plot(page, page, 'graph3', [2, -2]);
  await plot(page, page, 'graph3', [4, -1]);
  await checkButton(page, 'graphPointSlope').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'graphPointSlope'), 'Graph 3 from the student\'s point (2, −2) accepted');
  const overlay = page.locator('[data-lmr-comparison]');
  check(await overlay.count() === 1, 'the three-graph comparison appears once all three graphs are checked');
  if (await overlay.count()) check(!/y\s*=/.test(await overlay.innerText()), 'the comparison does not print an equation the student has not written yet');

  // 8. THE REST.
  step = 'rest';
  await typeMath(page, mathField(page, 'slopeIntercept'), 'y=1/2 x-3');
  await page.keyboard.press('Enter');
  await typeMath(page, mathField(page, 'xIntercept'), '(6,0)');
  await page.keyboard.press('Enter');
  await typeMath(page, mathField(page, 'twoPoints', 0), '(2,-2)');
  await typeMath(page, mathField(page, 'twoPoints', 1), '(4,-1)');
  await page.keyboard.press('Enter');
  await settle(page);
  for (const cardId of ['slopeIntercept', 'xIntercept', 'twoPoints']) check(await hasCorrectBadge(page, cardId), `${cardId} accepted`);
  const stripDone = await page.locator('[aria-label="Your progress"]').innerText();
  check(/10 of 10/.test(stripDone), `progress reaches 10 of 10 ("${stripDone}")`);
  await renderAllMath(page);
  await shot(page, 'cw1-03-complete');

  // 9. COLLAPSE EVERYTHING, read the summaries, reopen: nothing lost, no raw LaTeX.
  step = 'collapse';
  const beforeCollapse = await work(page, id);
  for (const label of ['Collapse equations', 'Collapse key features', 'Collapse table', /Collapse Graph 1/, /Collapse Graph 2/, /Collapse Graph 3/]) {
    await page.getByRole('button', { name: label }).first().click();
    await settle(page, 150);
  }
  await renderAllMath(page);
  const collapsedText = await proseText(page.locator('.mathmaster-tool-shell').first());
  check(!/\\frac|\\left|\\right/.test(collapsedText), 'collapsed summaries show no raw LaTeX');
  check(await page.locator('.mathmaster-tool-shell math-span').count() > 10, 'collapsed summaries show the student\'s work as mathematics');
  await shot(page, 'cw1-04-collapsed');
  for (const label of ['Expand equations', 'Expand key features', 'Expand table', /Expand Graph 1/, /Expand Graph 2/, /Expand Graph 3/]) {
    await page.getByRole('button', { name: label }).first().click();
    await settle(page, 150);
  }
  const withoutLayout = ({ expandedCards: _layout, ...rest }) => JSON.stringify(Object.keys(rest).sort().map((key) => [key, rest[key]]));
  check(withoutLayout(await work(page, id)) === withoutLayout(beforeCollapse), 'collapsing and reopening every card changes no work');
  check(await hasCorrectBadge(page, 'graphPointSlope'), 'verdicts survive collapse/expand');

  // 10. SUBMIT.
  step = 'submit';
  await page.getByRole('button', { name: 'Submit board' }).click();
  await settle(page, 1500);
  const submitted = await grades(page);
  check(submitted.length === 1 && submitted[0].isCorrect === true, `one correct submission recorded (${JSON.stringify(submitted.map((g) => g.isCorrect))})`);
  const labels = (submitted[0]?.parts || []).map((part) => part.label);
  check(labels.includes('Graph 3 (point-slope)') && labels.includes('Slope-intercept form') && !labels.includes('graph3'), `the attempt a teacher reads names each part (${labels.join(' | ')})`);
  check(submitted[0]?.partialCreditPercent === 100, `full credit recorded (${submitted[0]?.partialCreditPercent})`);
  check(/Every part is correct/.test(await page.locator('[data-lmr-submit]').innerText()), 'the board confirms a fully correct submission');
  await measureDraft(page, id);
  await renderAllMath(page);
  await shot(page, 'cw1-05-submitted');
  check(!consoleErrors.length, `no page errors (${consoleErrors.slice(0, 3).join(' | ')})`);
  await context.close();
};

journeys['fraction-anchor'] = async (browser) => {
  const id = 'lmr-cw-1';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  await open(page, id, 'fraction');
  const initial = await geometry(page, 'graph3');
  check(initial.snap === 1, `before a point is chosen Graph 3 is on whole numbers (${initial.snap})`);
  await typeMath(page, mathField(page, 'pointSlope'), 'y+5/2=1/2 (x-1)');
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'pointSlope'), 'y + 5/2 = 1/2(x − 1) accepted (any point on the line)');
  const refined = await geometry(page, 'graph3');
  check(refined.snap === 0.5, `Graph 3 refines to halves for (1, −5/2) (snap ${refined.snap})`);
  check((await geometry(page, 'graph1')).snap === 1 && (await geometry(page, 'graph2')).snap === 1, 'Graphs 1 and 2 stay on whole numbers');
  await plot(page, page, 'graph3', [1, -2.5]);
  await plot(page, page, 'graph3', [3, -1.5]);
  check(samePoints((await work(page, id)).graph3Points, [[1, -2.5], [3, -1.5]]), `the half-unit point lands exactly (${JSON.stringify((await work(page, id)).graph3Points)})`);
  await checkButton(page, 'graphPointSlope').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'graphPointSlope'), 'Graph 3 from (1, −5/2) accepted');
  await shot(page, 'fraction-anchor-graph3', card(page, 'graphPointSlope'));
  // Graph 3 is re-judged against the CURRENT anchor: move the point-slope
  // point off the plotted graph and the check turns into the method hint.
  await typeMath(page, mathField(page, 'pointSlope'), 'y+2=1/2 (x-2)');
  await settle(page);
  check(!(await hasCorrectBadge(page, 'graphPointSlope')) && /starts at the point from point-slope form/.test(await cardText(page, 'graphPointSlope')), 'a new anchor off the graph turns Graph 3\'s check into the method hint');
  await context.close();
};

journeys['far-anchor'] = async (browser) => {
  const id = 'lmr-cw-1';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  await open(page, id, 'far');
  const base = await geometry(page, 'graph1');
  await typeMath(page, mathField(page, 'pointSlope'), 'y-7=1/2 (x-20)');
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'pointSlope'), 'y − 7 = 1/2(x − 20) accepted');
  const g3 = await geometry(page, 'graph3');
  check(g3.xMax >= 22 && g3.yMax >= 8, `Graph 3's window grows to reach (20, 7) and its slope step (x ≤ ${g3.xMax}, y ≤ ${g3.yMax})`);
  const g1 = await geometry(page, 'graph1');
  check(g1.xMax === base.xMax && g1.yMax === base.yMax, 'Graphs 1 and 2 keep the question window');
  await plot(page, page, 'graph3', [20, 7]);
  await plot(page, page, 'graph3', [22, 8]);
  await checkButton(page, 'graphPointSlope').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'graphPointSlope'), 'Graph 3 from the far point (20, 7) accepted');
  await shot(page, 'far-anchor-graph3', card(page, 'graphPointSlope'));
  await context.close();
};

journeys['issue-b'] = async (browser) => {
  const id = 'gal-snap-y-equals-x';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  await open(page, id, 'issueb', { gallery: true });
  await typeMath(page, mathField(page, 'pointSlope'), 'y-1/2=x-1/2');
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'pointSlope'), 'y − 1/2 = x − 1/2 accepted on y = x');
  const g3 = await geometry(page, 'graph3');
  check(g3.snap === 0.5, `authored snapStep 1, student anchor (1/2, 1/2): Graph 3 snaps to 1/2 (saw ${g3.snap})`);
  check((await geometry(page, 'graph1')).snap === 1, 'Graph 1 keeps the authored whole-number grid');
  await plot(page, page, 'graph3', [0.5, 0.5]);
  await plot(page, page, 'graph3', [1.5, 1.5]);
  await checkButton(page, 'graphPointSlope').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'graphPointSlope'), '(1/2, 1/2) is plottable and Graph 3 is accepted');
  await shot(page, 'issue-b-graph3', card(page, 'graphPointSlope'));
  await context.close();
};

journeys.given = async (browser) => {
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  const expectations = [
    ['lmr-cw-1', 'standardForm', (d) => /2x\s*-\s*4y\s*=\s*12/.test(d.math)],
    ['lmr-cw-2', 'slopeIntercept', (d) => /y\s*=\s*-2x\s*\+\s*4/.test(d.math)],
    ['lmr-cw-3', 'pointSlope', (d) => /y\s*-\s*2\s*=\s*-1\(x\s*-\s*3\)/.test(d.math)],
    ['lmr-pr-1', 'table', (d) => d.rows === 4 && /-9/.test(d.math) && /9/.test(d.math)],
    ['lmr-pr-2', 'scenario', (d) => /A candle is 18 inches tall when it is lit\./.test(d.prose) && !d.math],
    ['gal-two-points', 'twoPoints', (d) => /\(-2, -5\)/.test(d.math) && /\(4, -2\)/.test(d.math)],
    ['gal-graph', 'graph', (d) => d.circles >= 2 && d.lines >= 1],
    ['gal-standard-abc', 'standardForm', (d) => /2x\s*-\s*4y\s*=\s*12/.test(d.math)],
    ['gal-point-slope-pm', 'pointSlope', (d) => /y\s*\+\s*2\s*=\s*\\frac\{1\}\{2\}\(x\s*-\s*2\)/.test(d.math)],
    ['gal-slope-intercept-mb', 'slopeIntercept', (d) => /y\s*=\s*-\\frac\{3\}\{4\}x\s*\+\s*2/.test(d.math)],
  ];
  for (const [id, kind, ok] of expectations) {
    await open(page, id, 'given', { gallery: true });
    const given = page.locator('[data-lmr-given]');
    await given.waitFor();
    await given.scrollIntoViewIfNeeded();
    await settle(page, 500);
    const description = await given.evaluate((root) => ({
      kind: root.dataset.lmrGiven,
      math: [...root.querySelectorAll('math-span, math-div')].map((m) => m.textContent).join(' | '),
      rows: root.querySelectorAll('tbody tr').length,
      circles: root.querySelectorAll('svg circle').length,
      lines: root.querySelectorAll('svg line').length,
      prose: [...root.querySelectorAll('p')].map((p) => p.innerText).join(' '),
      rendered: [...root.querySelectorAll('math-span, math-div')].every((m) => m.shadowRoot?.querySelector('[part="render"]')?.childElementCount),
    }));
    check(description.kind === kind, `${id}: GIVEN kind ${description.kind}`);
    check(ok(description), `${id}: GIVEN shows the authored ${kind} (${JSON.stringify(description).slice(0, 220)})`);
    check(description.rendered, `${id}: every GIVEN math element is typeset`);
    check(await given.locator('input, math-field, button[data-card-check]').count() === 0, `${id}: the GIVEN representation is read-only`);
    if (['table', 'twoPoints', 'standardForm', 'slopeIntercept', 'pointSlope'].includes(kind)) {
      const asked = { table: 'table', twoPoints: 'twoPoints', standardForm: 'standardForm', slopeIntercept: 'slopeIntercept', pointSlope: 'pointSlope' }[kind];
      check(await card(page, asked).count() === 0, `${id}: the student is not asked to rebuild the GIVEN ${kind}`);
    }
    await shot(page, `given-${id}`, given);
  }
  await context.close();
};

journeys['ipad-table'] = async (browser) => {
  const id = 'lmr-pr-1';
  const context = await browser.newContext({ viewport: IPAD, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  await open(page, id, 'ipad');
  await renderAllMath(page);
  await shot(page, 'ipad-pr1-01-start');
  const tableCells = await page.locator('[data-lmr-given] tbody td').count();
  check(tableCells === 8, `the GIVEN table has all 4 authored rows (${tableCells / 2})`);
  check(await card(page, 'table').count() === 0, 'the student does not rebuild the GIVEN table');
  // Touch-plot Graph 2 and Graph 1.
  await plot(page, page, 'graph2', [0, -6], { touch: true });
  await plot(page, page, 'graph2', [1, -3], { touch: true });
  await plot(page, page, 'graph1', [2, 0], { touch: true });
  await plot(page, page, 'graph1', [0, -6], { touch: true });
  const saved = await work(page, id);
  check(samePoints(saved.graph2Points, [[0, -6], [1, -3]]) && samePoints(saved.graph1Points, [[2, 0], [0, -6]]), `touch plotting lands on the aimed points (${JSON.stringify([saved.graph1Points, saved.graph2Points])})`);
  // Two quick taps, no pause between them: the second must build on the first.
  const g3 = await geometry(page, 'graph3');
  const first = toScreen(g3, [3, 3]);
  const second = toScreen(g3, [4, 6]);
  await page.touchscreen.tap(first.x, first.y);
  await page.touchscreen.tap(second.x, second.y);
  await settle(page, 600);
  check(samePoints((await work(page, id)).graph3Points, [[3, 3], [4, 6]]), `two rapid taps both land (${JSON.stringify((await work(page, id)).graph3Points)})`);
  for (const cardId of ['graphSlopeIntercept', 'graphIntercepts']) {
    await checkButton(page, cardId).tap();
    await settle(page);
    check(await hasCorrectBadge(page, cardId), `${cardId} accepted by touch`);
  }
  await typeMath(page, mathField(page, 'slope'), '3');
  await page.keyboard.press('Enter');
  await settle(page);
  check(await hasCorrectBadge(page, 'slope'), 'slope 3 from the table accepted');
  const layout = await overflow(page);
  check(layout.offenders.length === 0 && layout.scrollers.length === 0, `no horizontal overflow on iPad (${JSON.stringify(layout)})`);
  await renderAllMath(page);
  await shot(page, 'ipad-pr1-02-progress');
  await context.close();
};

journeys['phone-scenario'] = async (browser) => {
  const id = 'lmr-pr-2';
  const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await open(page, id, 'phone');
  await renderAllMath(page);
  await shot(page, 'phone-pr2-01-start');
  const story = await page.locator('[data-lmr-given] p').first().innerText();
  check(/candle is 18 inches tall/.test(story), `the candle story reads as prose on a phone ("${story.slice(0, 60)}…")`);
  const layout = await overflow(page);
  check(layout.offenders.length === 0 && layout.scrollers.length === 0, `no horizontal overflow on a phone (${JSON.stringify(layout)})`);
  // Context by choice banks.
  const selects = page.locator('[data-lmr-card="context"] select');
  check(await selects.count() === 6, `six meaning questions (${await selects.count()})`);
  const answers = [
    'time since the candle was lit (hours)',
    'height of the candle (inches)',
    'The candle gets 2 inches shorter every hour.',
    'The candle is 18 inches tall when it is lit.',
    'The candle is completely burned down after 9 hours.',
    '0 ≤ x ≤ 9',
  ];
  // One wrong answer first.
  for (const [index, answer] of answers.entries()) await selects.nth(index).selectOption(index === 2 ? 'The candle gets 2 inches taller every hour.' : answer);
  await page.locator('[data-lmr-card="context"] button[data-card-check="true"]').tap();
  await settle(page);
  const contextText = await page.locator('[data-lmr-card="context"]').innerText();
  check((contextText.match(/Take another look/g) || []).length === 1 && (contextText.match(/✓ Correct/g) || []).length === 5, 'context check marks the one wrong meaning, next to it');
  await selects.nth(2).selectOption(answers[2]);
  await page.locator('[data-lmr-card="context"] button[data-card-check="true"]').tap();
  await settle(page);
  check(((await page.locator('[data-lmr-card="context"]').innerText()).match(/✓ Correct/g) || []).length === 6, 'all six meanings accepted');
  // Slope via the on-screen keypad (the phone keyboard is suppressed).
  const slopeField = mathField(page, 'slope');
  await slopeField.scrollIntoViewIfNeeded();
  await slopeField.tap();
  await settle(page, 400);
  const keypad = card(page, 'slope');
  const minus = keypad.getByRole('button', { name: 'Insert negative sign' });
  check(await minus.count() > 0, 'the phone keypad offers a minus key');
  if (await minus.count()) {
    await minus.first().tap();
    await keypad.getByRole('button', { name: 'Insert 2' }).first().tap();
    await settle(page, 300);
  }
  const slopeValue = await slopeField.evaluate((el) => el.value);
  check(/^-2$/.test(slopeValue.replace(/\s/g, '')), `keypad entry gives −2 (${slopeValue})`);
  await checkButton(page, 'slope').tap();
  await settle(page);
  check(await hasCorrectBadge(page, 'slope'), 'slope −2 accepted on a phone');
  await shot(page, 'phone-pr2-02-keypad');
  // Enlarge Graph 2 on the phone and plot by touch.
  await card(page, 'graphSlopeIntercept').getByRole('button', { name: /^Enlarge/ }).tap();
  const dialog = page.locator('[role="dialog"][data-lmr-dialog="graph2"]');
  await dialog.waitFor();
  await settle(page, 500);
  await plot(page, dialog, 'graph2', [0, 18], { touch: true });
  await plot(page, dialog, 'graph2', [1, 16], { touch: true });
  const dialogCheck = await dialog.locator('button[data-card-check="true"]').boundingBox();
  check(dialogCheck && dialogCheck.y + dialogCheck.height <= PHONE.height, 'Check is on screen in the enlarged graph on a phone');
  await dialog.locator('button[data-card-check="true"]').tap();
  await settle(page);
  check(/✓ Correct/.test(await dialog.innerText()), 'Graph 2 accepted in the enlarged view on a phone');
  await shot(page, 'phone-pr2-03-enlarged');
  await dialog.getByRole('button', { name: 'Done' }).tap();
  await settle(page);
  check(samePoints((await work(page, id)).graph2Points, [[0, 18], [1, 16]]), 'the enlarged phone work is saved');
  const after = await overflow(page);
  check(after.offenders.length === 0, `still no overflow after work (${JSON.stringify(after.offenders)})`);
  await measureDraft(page, id);
  await context.close();
};

journeys.dol = async (browser) => {
  const id = 'lmr-dol-1';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  await open(page, id, 'dol');
  await renderAllMath(page);
  await shot(page, 'dol-01-start');
  check(await page.locator('button[data-card-check="true"]').count() === 0, 'a DOL has no Check buttons');
  const strip = await page.locator('[aria-label="Your progress"]').innerText();
  check(/Filled in/.test(strip) && !/Checked correct/.test(strip), `DOL progress counts filled-in work, not correctness ("${strip}")`);
  check(await card(page, 'table').count() === 0 && await card(page, 'graphIntercepts').count() === 0 && await card(page, 'pointSlope').count() === 0, 'the DOL shows only its required cards');
  // Enter in a field neither checks nor submits.
  await typeMath(page, mathField(page, 'slope'), '-3');
  await page.keyboard.press('Enter');
  await settle(page, 800);
  check((await grades(page)).length === 0, 'Enter in a DOL field never submits');
  check(!(await hasCorrectBadge(page, 'slope')), 'no verdict appears in a DOL');
  // Undo on a DOL takes back work and says where — and still says nothing
  // about correctness: no Check appears, no verdict, nothing announced but the
  // card's name (PQ-009).
  await watchAnnouncements(page);
  const dolUndo = await pressUndo(page);
  check((await work(page, id)).featureSlope === '' && dolUndo.announced.map((entry) => entry.text).join() === 'Undid your last change to Slope.', `Undo on a DOL takes back the slope and names only the card (${JSON.stringify(dolUndo.announced)})`);
  check(await page.locator('button[data-card-check="true"]').count() === 0 && !(await hasCorrectBadge(page, 'slope')), 'Undo on a DOL brings back no Check and no verdict');
  await typeMath(page, mathField(page, 'slope'), '-3');
  // An incomplete board asks first.
  await page.getByRole('button', { name: 'Submit board' }).click();
  await settle(page);
  const warning = await page.locator('[data-lmr-submit] [role="alert"]').innerText().catch(() => '');
  check(/still empty/.test(warning), `an incomplete DOL asks before submitting ("${warning.slice(0, 90)}")`);
  check((await grades(page)).length === 0, 'the first press on an incomplete DOL does not submit');
  await page.getByRole('button', { name: 'Keep working' }).click();
  // Complete it.
  await typeMath(page, mathField(page, 'slopeIntercept'), 'y=-3x+24');
  await typeMath(page, mathField(page, 'standardForm'), '3x+y=24');
  await typeMath(page, mathField(page, 'xIntercept'), '(8,0)');
  await typeMath(page, mathField(page, 'yIntercept'), '(0,24)');
  await plot(page, page, 'graph2', [0, 24]);
  await plot(page, page, 'graph2', [1, 21]);
  const selects = page.locator('[data-lmr-card="context"] select');
  await selects.nth(0).selectOption('The tank loses 3 liters of water every minute.');
  await selects.nth(1).selectOption('The tank holds 24 liters when it starts draining.');
  await selects.nth(2).selectOption('0 ≤ x ≤ 8');
  await settle(page);
  check(/9 of 9/.test(await page.locator('[aria-label="Your progress"]').innerText()), 'every DOL part counted as filled in');
  check(!(await page.locator('.mathmaster-tool-shell').first().innerText()).includes('✓ Correct'), 'still no verdicts anywhere in the DOL');
  await page.getByRole('button', { name: 'Submit board' }).click();
  await settle(page, 1500);
  const submitted = await grades(page);
  check(submitted.length === 1 && submitted[0].isCorrect === true, `the DOL records one correct submission (${JSON.stringify(submitted.map((g) => g.isCorrect))})`);
  check(!/Every part is correct|Not yet/.test(await page.locator('[data-lmr-submit]').innerText()), 'the DOL shows no result before the assignment is submitted');
  await renderAllMath(page);
  await shot(page, 'dol-02-submitted');
  await context.close();
};

// Every remaining board, finished the ordinary way: type, Enter, plot, Check, submit.
const BOARDS = {
  'lmr-cw-2': {
    math: { standardForm: '2x+y=4', pointSlope: 'y-0=-2(x-2)', slope: '-2', xIntercept: '(2,0)', yIntercept: '(0,4)', twoPoints: ['(1,2)', '(3,-2)'] },
    table: [['0', '4'], ['1', '2'], ['2', '0'], ['3', '-2']],
    graphs: { graph1: [[2, 0], [0, 4]], graph2: [[0, 4], [1, 2]], graph3: [[2, 0], [3, -2]] },
  },
  'lmr-cw-3': {
    math: { standardForm: 'x+y=5', slopeIntercept: 'y=-x+5', slope: '-1', xIntercept: '(5,0)', yIntercept: '(0,5)', twoPoints: ['(3,2)', '(1,4)'] },
    table: [['0', '5'], ['1', '4'], ['3', '2'], ['5', '0']],
    // A valid point that is NOT the given anchor first: the given point is part of what was given.
    wrongGraph3: [[1, 4], [2, 3]],
    graphs: { graph1: [[5, 0], [0, 5]], graph2: [[0, 5], [1, 4]], graph3: [[3, 2], [4, 1]] },
  },
  'lmr-pr-1': {
    math: { standardForm: '3x-y=6', slopeIntercept: 'y=3x-6', pointSlope: 'y-3=3(x-3)', slope: '3', xIntercept: '(2,0)', yIntercept: '(0,-6)', twoPoints: ['(1,-3)', '(3,3)'] },
    graphs: { graph1: [[2, 0], [0, -6]], graph2: [[0, -6], [1, -3]], graph3: [[3, 3], [4, 6]] },
  },
  'lmr-pr-2': {
    math: { standardForm: '2x+y=18', slopeIntercept: 'y=-2x+18', pointSlope: 'y-10=-2(x-4)', slope: '-2', xIntercept: '(9,0)', yIntercept: '(0,18)', twoPoints: ['(4,10)', '(9,0)'] },
    table: [['0', '18'], ['3', '12'], ['6', '6'], ['9', '0']],
    graphs: { graph1: [[9, 0], [0, 18]], graph2: [[0, 18], [1, 16]], graph3: [[4, 10], [5, 8]] },
    context: [
      'time since the candle was lit (hours)', 'height of the candle (inches)', 'The candle gets 2 inches shorter every hour.',
      'The candle is 18 inches tall when it is lit.', 'The candle is completely burned down after 9 hours.', '0 ≤ x ≤ 9',
    ],
  },
};
const GRAPH_CARD = { graph1: 'graphIntercepts', graph2: 'graphSlopeIntercept', graph3: 'graphPointSlope' };

journeys.complete = async (browser) => {
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  for (const [id, board] of Object.entries(BOARDS)) {
    await open(page, id, 'complete');
    // Graphs first this time — free order again.
    if (board.wrongGraph3) {
      for (const point of board.wrongGraph3) await plot(page, page, 'graph3', point);
      await checkButton(page, 'graphPointSlope').click();
      await settle(page);
      check(/starts at the point from point-slope form/.test(await cardText(page, 'graphPointSlope')), `${id}: another valid point does not replace the GIVEN anchor, and the hint says so`);
      await card(page, 'graphPointSlope').getByRole('button', { name: /Start .* over/ }).click();
    }
    for (const [key, points] of Object.entries(board.graphs)) {
      for (const point of points) await plot(page, page, key, point);
      await checkButton(page, GRAPH_CARD[key]).click();
      await settle(page);
    }
    for (const [cardId, value] of Object.entries(board.math)) {
      const values = Array.isArray(value) ? value : [value];
      for (const [index, text] of values.entries()) await typeMath(page, mathField(page, cardId, index), text);
      await page.keyboard.press('Enter');
      await settle(page);
    }
    if (board.table) {
      for (const [index, [x, y]] of board.table.entries()) {
        await card(page, 'table').locator(`input[aria-label="Row ${index + 1} x"]`).fill(x);
        await card(page, 'table').locator(`input[aria-label="Row ${index + 1} y"]`).fill(y);
      }
      await checkButton(page, 'table').click();
      await settle(page);
    }
    if (board.context) {
      const selects = page.locator('[data-lmr-card="context"] select');
      for (const [index, answer] of board.context.entries()) await selects.nth(index).selectOption(answer);
      await page.locator('[data-lmr-card="context"] button[data-card-check="true"]').click();
      await settle(page);
    }
    const strip = await page.locator('[aria-label="Your progress"]').innerText();
    const [, done, total] = strip.match(/(\d+) of (\d+)/) || [];
    check(done && done === total, `${id}: every part checked correct before submitting ("${strip.replace(/\n/g, ' ')}")`);
    await page.getByRole('button', { name: 'Submit board' }).click();
    await settle(page, 1500);
    const recorded = (await grades(page)).filter((grade) => grade.questionId === id);
    check(recorded.length === 1 && recorded[0].isCorrect === true, `${id}: submitted correct (${JSON.stringify(recorded.map((g) => [g.isCorrect, g.partialCreditPercent]))})`);
    // A finished question is final: the Undo that walks the board back cannot reopen it.
    check(!(await platformUndo(page).isEnabled()) && await page.getByRole('button', { name: 'Submit board' }).isDisabled(), `${id}: after a correct submission Undo is off and the board cannot be resubmitted`);
    await renderAllMath(page);
    await shot(page, `complete-${id}`);
  }
  await context.close();
};

/**
 * A complete, correct board for a GENERATED version, worked out from that
 * version's own line the way a student would (integer slopes only), with every
 * plotted point inside the version's own window.
 */
const familyBoard = (question) => {
  const facts = deriveLinearMultipleRepresentations(question);
  const m = facts.slopeNumber;
  const b = facts.yInterceptNumber;
  const zero = facts.zeroNumber;
  const term = (k, v) => (k === 1 ? v : k === -1 ? `-${v}` : `${k}${v}`);
  const signed = (k) => (k < 0 ? `${k}` : `+${k}`);
  const minus = (k) => (k === 0 ? '-0' : signed(-k));
  const { A, B, C } = facts.standard;
  const required = new Set(resolveRequiredCards(question));
  const bounds = question.graphBounds;
  const inside = ([x, y]) => x > bounds.xMin && x < bounds.xMax && y > bounds.yMin && y < bounds.yMax;
  const anchor = question.source.kind === 'pointSlope' ? facts.sourcePoint : [1, m + b];
  const next = [[anchor[0] + 1, anchor[1] + m], [anchor[0] - 1, anchor[1] - m]].find(inside);
  const math = {};
  if (required.has('standardForm')) math.standardForm = `${term(A, 'x')}${B < 0 ? '-' : '+'}${term(Math.abs(B), 'y')}=${C}`;
  if (required.has('slopeIntercept')) math.slopeIntercept = `y=${term(m, 'x')}${b === 0 ? '' : signed(b)}`;
  if (required.has('pointSlope')) math.pointSlope = `y${minus(anchor[1])}=${m}(x${minus(anchor[0])})`;
  if (required.has('slope')) math.slope = String(m);
  if (required.has('xIntercept')) math.xIntercept = `(${zero},0)`;
  if (required.has('yIntercept')) math.yIntercept = `(0,${b})`;
  if (required.has('twoPoints')) math.twoPoints = [`(0,${b})`, `(1,${m + b})`];
  const graphs = {};
  if (required.has('graphIntercepts')) graphs.graph1 = [[zero, 0], [0, b]];
  if (required.has('graphSlopeIntercept')) graphs.graph2 = [[0, b], [1, m + b]];
  if (required.has('graphPointSlope')) graphs.graph3 = [anchor, next];
  const context = question.context
    ? ['independentQuantity', 'dependentQuantity', 'slopeMeaning', 'yInterceptMeaning', 'xInterceptMeaning', 'domain']
      .filter((key) => question.context[key]).map((key) => question.context[key].value)
    : null;
  return {
    math,
    table: required.has('table') ? [0, 1, 2, 3].map((x) => [String(x), String(m * x + b)]) : null,
    graphs,
    context,
    line: { m, b, zero },
  };
};

journeys.family = async (browser) => {
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  const GIVEN_MATH = {
    slopeIntercept: (q) => q.source.equation,
    pointSlope: (q) => q.source.equation,
  };
  for (const id of ['lmr-cw-2', 'lmr-cw-3', 'lmr-pr-1', 'lmr-pr-2', 'lmr-dol-1']) {
    await open(page, id, 'family', { family: true });
    const delivered = await page.evaluate((qid) => window.__lmr.delivered(qid), id);
    const template = await page.evaluate((qid) => window.__lmr.question(qid), id);
    check(Boolean(template?.questionFamily) && Boolean(delivered?.familyDelivery?.fingerprint), `${id}: a family slot, delivered as a generated version`);
    check((await page.evaluate(() => window.__lmr.preflight())).isValid, 'the family-backed file passed Pre-Flight in the browser chain');
    const visible = await page.locator('[data-question-id]').first().innerText();
    check(!/\{\{/.test(visible), `${id}: no {{token}} reaches the page`);
    // The GIVEN on screen is this version's, and it is read-only.
    const given = page.locator('[data-lmr-given]');
    await given.waitFor();
    await given.scrollIntoViewIfNeeded();
    await settle(page, 500);
    const shown = await given.evaluate((root) => ({
      kind: root.dataset.lmrGiven,
      math: [...root.querySelectorAll('math-span, math-div')].map((m) => m.textContent).join(' | '),
      prose: [...root.querySelectorAll('p')].map((p) => p.innerText).join(' '),
      rows: root.querySelectorAll('tbody tr').length,
    }));
    check(shown.kind === delivered.source.kind, `${id}: the GIVEN is a ${delivered.source.kind} (${shown.kind})`);
    if (GIVEN_MATH[shown.kind]) {
      const compact = (text) => String(text).replace(/\s+/g, '').replace(/\\left|\\right/g, '');
      check(compact(shown.math).includes(compact(GIVEN_MATH[shown.kind](delivered))), `${id}: the GIVEN shows this version's equation (${shown.math} vs ${GIVEN_MATH[shown.kind](delivered)})`);
    }
    if (shown.kind === 'table') check(shown.rows === delivered.source.rows.length, `${id}: the GIVEN table shows this version's ${delivered.source.rows.length} rows`);
    if (shown.kind === 'scenario') check(shown.prose.includes(delivered.source.prompt), `${id}: the story is this version's ("${shown.prose.slice(0, 80)}")`);
    check(await given.locator('input, math-field, button[data-card-check]').count() === 0, `${id}: the GIVEN representation is read-only`);
    const board = familyBoard(delivered);
    note(`${id}: version ${delivered.familyDelivery.fingerprint} — y = ${board.line.m}x + ${board.line.b}, window ${JSON.stringify(delivered.graphBounds)}`);
    const dol = id === 'lmr-dol-1';
    // Process Mode: the key facts are established first, through the board's
    // own processes; they are never typed into a card.
    const processMode = delivered.interactionMode === 'process';
    if (processMode) {
      await establishProcessFacts(page, delivered, board.line);
      check(await page.locator('[data-process-locked]').count() === 0, `${id}: every card opened from the facts the student established`);
    }
    for (const [key, points] of Object.entries(board.graphs)) {
      check(points.every(Boolean), `${id}: every ${key} point is inside the version's window`);
      for (const point of points) await plot(page, page, key, point);
      if (!dol) { await checkButton(page, GRAPH_CARD[key]).click(); await settle(page); }
    }
    for (const [cardId, value] of Object.entries(board.math)) {
      if (processMode && ['slope', 'xIntercept', 'yIntercept', 'twoPoints'].includes(cardId)) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const [index, text] of values.entries()) await typeMath(page, mathField(page, cardId, index), text);
      if (!dol) { await page.keyboard.press('Enter'); await settle(page); }
    }
    if (board.table) {
      for (const [index, [x, y]] of board.table.entries()) {
        await card(page, 'table').locator(`input[aria-label="Row ${index + 1} x"]`).fill(x);
        await card(page, 'table').locator(`input[aria-label="Row ${index + 1} y"]`).fill(y);
      }
      if (!dol) { await checkButton(page, 'table').click(); await settle(page); }
    }
    if (board.context) {
      const selects = page.locator('[data-lmr-card="context"] select');
      for (const [index, answer] of board.context.entries()) await selects.nth(index).selectOption(answer);
      if (!dol) { await page.locator('[data-lmr-card="context"] button[data-card-check="true"]').click(); await settle(page); }
    }
    const strip = await page.locator('[aria-label="Your progress"]').innerText();
    const [, done, total] = strip.match(/(\d+) of (\d+)/) || [];
    check(done && done === total, `${id}: every part ${dol ? 'filled in' : 'checked correct'} before submitting ("${strip.replace(/\n/g, ' ')}")`);
    if (dol) check(await page.locator('button[data-card-check="true"]').count() === 0, 'the generated DOL has no Check buttons');
    await page.getByRole('button', { name: 'Submit board' }).click();
    await settle(page, 1500);
    const recorded = (await grades(page)).filter((grade) => grade.questionId === id);
    check(recorded.length === 1 && recorded[0].isCorrect === true, `${id}: submitted correct (${JSON.stringify(recorded.map((g) => [g.isCorrect, g.partialCreditPercent]))})`);
    await renderAllMath(page);
    await shot(page, `family-${id}`);
  }
  await context.close();
};

journeys.zoom = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await open(page, 'lmr-cw-1', 'zoom');
  await renderAllMath(page);
  await shot(page, 'zoom-1920-cw1');
  const layout = await overflow(page);
  check(layout.offenders.length === 0, `no overflow at 1920 (${JSON.stringify(layout.offenders)})`);
  note(`CW1 page height at 1920×1080: ${await page.evaluate(() => document.documentElement.scrollHeight)}px`);
  await context.close();
};

// The board's answer fields at their starting values, so a record that never
// saw a field compares equal to one an Undo wrote back to empty.
const BOARD_DEFAULTS = {
  standardFormEquation: '', slopeInterceptEquation: '', pointSlopeEquation: '',
  featureSlope: '', featureXIntercept: '', featureYIntercept: '', featurePoint1: '', featurePoint2: '',
  tableRows: [{ x: '', y: '' }, { x: '', y: '' }, { x: '', y: '' }, { x: '', y: '' }],
  graph1Points: [], graph2Points: [], graph3Points: [],
  contextIndependent: '', contextDependent: '', contextSlopeMeaning: '', contextYInterceptMeaning: '', contextXInterceptMeaning: '', contextDomain: '',
};
const boardMath = async (page, id) => mathOf({ ...BOARD_DEFAULTS, ...(await page.evaluate((qid) => window.__lmr.work(qid), id)) });

// PQ-009: ONE UNDO FOR THE WHOLE BOARD. PR2 (the candle) has every kind of
// card: meanings chosen from a list, typed equations, a table, three graphs.
journeys.undo = async (browser) => {
  const id = 'lmr-pr-2';
  const context = await browser.newContext({ viewport: LAPTOP });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, id, `undo-${Date.now()}`);
  await watchAnnouncements(page);
  check(!(await platformUndo(page).isEnabled()), 'nothing to undo on a fresh board');
  const strip = () => page.locator('[aria-label="Your progress"]').innerText();
  const cell = (row, field) => card(page, 'table').locator(`input[aria-label="Row ${row} ${field}"]`);
  const typeCell = async (row, field, text) => { await cell(row, field).click(); await page.keyboard.type(text, { delay: 30 }); await settle(page, 250); };

  // A CHECKED CARD stays on the board throughout: the slope, typed and checked.
  await typeMath(page, mathField(page, 'slope'), '-2');
  await checkButton(page, 'slope').click();
  await settle(page);
  check(await hasCorrectBadge(page, 'slope'), 'the slope −2 is checked correct before any Undo');
  const checkedBefore = JSON.stringify((await work(page, id)).checkedCards);
  const stripBefore = (await strip()).match(/Checked correct: \d+ of \d+/)?.[0];
  await takeAnnouncements(page);

  // FIVE EDITS ACROSS FOUR CARDS: a meaning, a table cell, a typed equation,
  // a graph point, another table cell.
  const states = [await boardMath(page, id)];
  const selects = page.locator('[data-lmr-card="context"] select');
  await selects.nth(0).selectOption('time since the candle was lit (hours)');
  await settle(page, 250);
  states.push(await boardMath(page, id));
  await typeCell(1, 'x', '3');
  states.push(await boardMath(page, id));
  // With a fraction bar and brackets in it, typed in one go: one step.
  await typeMath(page, mathField(page, 'pointSlope'), 'y-10=-4/2 (x-4)');
  states.push(await boardMath(page, id));
  await plot(page, page, 'graph2', [0, 18]);
  states.push(await boardMath(page, id));
  await typeCell(1, 'y', '12');
  states.push(await boardMath(page, id));
  check(new Set(states).size === 6, 'each of the five edits changed the board');
  check(/Undo your last change to Table of values/.test(await platformUndo(page).getAttribute('title') || ''), `the Undo button names what it will change ("${await platformUndo(page).getAttribute('title')}")`);
  // The table is folded away before the first Undo, which changes it.
  await page.getByRole('button', { name: 'Collapse table' }).click();
  await settle(page, 200);
  check(await cell(1, 'y').count() === 0, 'the table is folded');

  // UNDO, FIVE TIMES: each takes back exactly one edit, newest first, opens and
  // shows the card it changed, says so once, and leaves the verdict alone.
  const expected = [
    ['table', 'tableRows', 'Table of values'],
    ['graphSlopeIntercept', 'graph2Points', 'Graph 2 (slope-intercept)'],
    ['pointSlope', 'pointSlopeEquation', 'Point-slope form'],
    ['table', 'tableRows', 'Table of values'],
    ['context', 'contextIndependent', 'Independent quantity'],
  ];
  for (const [step, [cardId, field, label]] of expected.entries()) {
    // Start each Undo from the other end of the page from the change — except
    // once, with the change already in front of the student, where an Undo
    // must leave the page exactly where it is.
    const inView = step === 2;
    // In view but not centred, so an Undo that re-centred anyway would show.
    if (inView) await fieldOnBoard(page, field).evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - window.innerHeight * 0.25));
    else await page.evaluate((top) => window.scrollTo(0, top ? 0 : document.documentElement.scrollHeight), step % 2 === 1);
    await settle(page, 150);
    const scrolledFrom = await page.evaluate(() => window.scrollY);
    const result = await pressUndo(page);
    if (inView) check((await page.evaluate(() => window.scrollY)) === scrolledFrom, `Undo ${step + 1} does not move a page that already shows the change`);
    const after = await boardMath(page, id);
    check(after === states[4 - step], `Undo ${step + 1} takes back exactly the ${label} edit (${after === states[5 - step] ? 'nothing changed' : 'something else changed'})`);
    check(samePoints(result.marked, [cardId]), `Undo ${step + 1} marks the card it changed (${JSON.stringify(result.marked)}, expected ${cardId})`);
    check(await uncovered(fieldOnBoard(page, field)), `Undo ${step + 1} brings ${label} into view, uncovered`);
    const said = result.announced.map((entry) => entry.text);
    check(result.announced.length === 1 && result.announced[0].board && result.announced[0].politeness === 'polite' && said[0] === `Undid your last change to ${label}.`, `Undo ${step + 1} is announced once, politely, naming ${label} (${JSON.stringify(result.announced)})`);
    check(result.focusOnUndo, `Undo ${step + 1} leaves keyboard focus on the Undo button`);
    check(await hasCorrectBadge(page, 'slope'), `Undo ${step + 1} leaves the checked slope's verdict on the board`);
    check(JSON.stringify((await work(page, id)).checkedCards) === checkedBefore, `Undo ${step + 1} never changes what was checked`);
    check((await strip()).includes(stripBefore), `Undo ${step + 1} leaves the progress count (${stripBefore})`);
    if (step === 0) check(await cell(1, 'y').count() === 1, 'the folded table was opened to show the change');
  }
  await shot(page, 'undo-01-five-undone');

  // A CHECK, THEN UNDO. The next Undo is the slope's own typing, from before
  // the Check. It takes the typing back and NOT the Check: what was checked is
  // still recorded, so typing the same slope again shows its verdict without
  // another Check, and nothing announces a new one.
  const sixth = await pressUndo(page);
  check((await work(page, id)).featureSlope === '' && sixth.announced.map((entry) => entry.text).join() === 'Undid your last change to Slope.', `Undo 6 takes back the slope's typing (${JSON.stringify(sixth.announced)})`);
  check(JSON.stringify((await work(page, id)).checkedCards) === checkedBefore, 'Undo after a Check does not erase the Check');
  check(!(await hasCorrectBadge(page, 'slope')), 'an empty slope shows no verdict');
  check(!(await platformUndo(page).isEnabled()), 'the Check itself is not a step: nothing is left to undo');
  await typeMath(page, mathField(page, 'slope'), '-2');
  check(await hasCorrectBadge(page, 'slope'), 'the same slope typed again shows the verdict it was checked with');
  check(!(await takeAnnouncements(page)).some((entry) => /correct/i.test(entry.text)), 'no Check was replayed or announced');

  // EACH GRAPH'S OWN UNDO is the same history, filtered to that graph.
  await plot(page, page, 'graph3', [4, 10]);
  await plot(page, page, 'graph3', [5, 8]);
  await typeMath(page, mathField(page, 'xIntercept'), '(9,0)');
  const xIntercept = (await work(page, id)).featureXIntercept;
  const graph3Undo = card(page, 'graphPointSlope').getByRole('button', { name: /^Undo on Graph 3/ });
  const g3 = await pressUndo(page, graph3Undo);
  let saved = await work(page, id);
  check(samePoints(saved.graph3Points, [[4, 10]]) && saved.featureXIntercept === xIntercept, `Graph 3's Undo takes back its last point and keeps the x-intercept typed after it (${JSON.stringify([saved.graph3Points, saved.featureXIntercept])})`);
  check(samePoints(g3.marked, ['graphPointSlope']) && g3.announced.map((entry) => entry.text).join() === 'Undid your last change to Graph 3 (point-slope).', `Graph 3's Undo is shown and announced (${JSON.stringify(g3)})`);
  const xUndo = await pressUndo(page);
  saved = await work(page, id);
  check(saved.featureXIntercept === '' && samePoints(saved.graph3Points, [[4, 10]]), `the platform Undo then takes the x-intercept and never replays the point (${JSON.stringify([saved.graph3Points, saved.featureXIntercept])})`);
  check(samePoints(xUndo.marked, ['xIntercept']), 'and shows the x-intercept card');
  const g3Last = await pressUndo(page, graph3Undo);
  check(samePoints((await work(page, id)).graph3Points, []) && await graph3Undo.isDisabled(), 'Graph 3\'s Undo walks back to an empty graph, then has nothing left');
  check(!g3Last.focusOnUndo && await page.evaluate(() => Boolean(document.activeElement?.closest?.('.mm-lmr-board [data-lmr-plane="graph3"]'))), 'its last Undo hands focus to the Graph 3 plane, not the page');

  // IN THE ENLARGED GRAPH the graph's Undo shows its change there, in the dialog.
  await card(page, 'graphIntercepts').getByRole('button', { name: /^Enlarge/ }).click();
  const dialog = page.locator('[role="dialog"][data-lmr-dialog="graph1"]');
  await dialog.waitFor();
  await settle(page, 300);
  await plot(page, dialog, 'graph1', [9, 0]);
  const inDialog = await pressUndo(page, dialog.getByRole('button', { name: /^Undo on Graph 1/ }));
  check(samePoints((await work(page, id)).graph1Points, []), 'the enlarged graph\'s own Undo takes back its point');
  check(samePoints(inDialog.marked, ['graphIntercepts']) && await uncovered(dialog.locator('[data-lmr-field="graph1Points"]')), `the change is shown in the dialog (${JSON.stringify(inDialog.marked)})`);
  check(inDialog.announced.map((entry) => entry.text).join() === 'Undid your last change to Graph 1 (intercepts).', `and announced once (${JSON.stringify(inDialog)})`);
  // That was Graph 1's last step, so its Undo is now off; focus must not fall
  // out of the dialog — it goes to the plane, where the next point goes.
  check(await dialog.getByRole('button', { name: /^Undo on Graph 1/ }).isDisabled(), 'with nothing left on Graph 1, its Undo is off');
  check(await page.evaluate(() => Boolean(document.activeElement?.closest?.('[data-lmr-dialog="graph1"] [data-lmr-plane="graph1"]'))), 'focus stays in the dialog, on the plane');
  await page.keyboard.press('Escape');
  await settle(page, 300);

  // A RELOAD: the restored work stays, and one Undo takes back one step of it.
  await typeMath(page, mathField(page, 'yIntercept'), '(0,18)');
  await plot(page, page, 'graph1', [9, 0]);
  await settle(page, 400);
  const beforeReload = await work(page, id);
  await page.reload();
  await page.locator('[data-lmr-given]').waitFor({ timeout: 120000 });
  await settle(page, 1500);
  await watchAnnouncements(page);
  const restored = await work(page, id);
  check(mathOf(restored) === mathOf(beforeReload), 'the reload restores the board');
  check(await platformUndo(page).isEnabled(), 'Undo still works after a reload');
  const reloadUndo = await pressUndo(page);
  const afterReloadUndo = await work(page, id);
  check(mathOf(afterReloadUndo) === mathOf({ ...beforeReload, graph1Points: [] }), `an Undo after the reload takes back only the last point and keeps the rest of the restored work (${JSON.stringify(afterReloadUndo).slice(0, 160)})`);
  check(samePoints(reloadUndo.marked, ['graphIntercepts']), 'and shows Graph 1');
  const yField = mathField(page, 'yIntercept');
  await yField.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+z');
  await settle(page, 300);
  check((await yField.evaluate((element) => element.value)) === beforeReload.featureYIntercept, 'Ctrl+Z in a restored field does not empty it');

  // A SUBMISSION, THEN UNDO. The attempt is spent and stays spent: Undo takes
  // back a step of the work, never the attempt or what it said.
  const attempts = (await grades(page)).filter((grade) => grade.questionId === id).length;
  await page.getByRole('button', { name: 'Submit board' }).click();
  await settle(page, 300);
  await page.getByRole('button', { name: 'Submit anyway' }).click();
  await settle(page, 1500);
  const resultPanel = () => page.locator('[data-lmr-submit] [role="status"]').innerText({ timeout: 3000 }).catch(() => '(no result shown)');
  const result = await resultPanel();
  check(/Not yet/.test(result), `the incomplete board is graded (${result.slice(0, 60)})`);
  const submitted = (await grades(page)).filter((grade) => grade.questionId === id).length;
  check(submitted === attempts + 1, 'one attempt was spent');
  const afterSubmit = await pressUndo(page);
  check((await work(page, id)).featureYIntercept === '', 'Undo after a submission takes back the last edit');
  check((await resultPanel()) === result, `and leaves the submission result where it was (${(await resultPanel()).slice(0, 40)})`);
  check((await grades(page)).filter((grade) => grade.questionId === id).length === submitted, 'and neither spends nor gives back an attempt');
  check(afterSubmit.announced.length === 1 && afterSubmit.announced[0].board, `one announcement, the Undo's (${JSON.stringify(afterSubmit.announced)})`);
  await shot(page, 'undo-02-after-submission');
  check(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`);
  await context.close();
};

// The same on a phone, by touch: the portrait bar's Undo.
journeys['undo-phone'] = async (browser) => {
  const id = 'lmr-pr-2';
  const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await open(page, id, `undo-phone-${Date.now()}`);
  await watchAnnouncements(page);
  const states = [await boardMath(page, id)];
  await page.locator('[data-lmr-card="context"] select').nth(2).selectOption('The candle gets 2 inches shorter every hour.');
  await settle(page, 250);
  states.push(await boardMath(page, id));
  await plot(page, page, 'graph2', [0, 18], { touch: true });
  states.push(await boardMath(page, id));
  // Two cells of one row: two edits on one card, so two Undos in a row say the
  // same sentence — and both must be heard.
  for (const field of ['x', 'y']) {
    const input = card(page, 'table').locator(`input[aria-label="Row 2 ${field}"]`);
    await input.scrollIntoViewIfNeeded();
    await input.tap();
    await page.keyboard.type('6', { delay: 40 });
    await settle(page, 300);
    states.push(await boardMath(page, id));
  }
  check(new Set(states).size === 5, 'four edits on three cards');
  for (const [step, [cardId, field, label]] of [
    ['table', 'tableRows', 'Table of values'],
    ['table', 'tableRows', 'Table of values'],
    ['graphSlopeIntercept', 'graph2Points', 'Graph 2 (slope-intercept)'],
    ['context', 'contextSlopeMeaning', 'Meaning of the slope'],
  ].entries()) {
    const result = await pressUndo(page, platformUndo(page), { touch: true });
    check((await boardMath(page, id)) === states[3 - step], `phone Undo ${step + 1} takes back exactly the ${label} edit`);
    check(samePoints(result.marked, [cardId]), `phone Undo ${step + 1} marks ${cardId} (${JSON.stringify(result.marked)})`);
    check(await uncovered(fieldOnBoard(page, field)), `phone Undo ${step + 1} brings ${label} into view, uncovered`);
    check(result.announced.length === 1 && result.announced[0].text === `Undid your last change to ${label}.`, `phone Undo ${step + 1} is announced once (${JSON.stringify(result.announced)})`);
    if (step === 2) await shot(page, 'undo-phone-graph2');
  }
  check(!(await platformUndo(page).isEnabled()), 'nothing left to undo');
  const layout = await overflow(page);
  check(layout.offenders.length === 0 && layout.scrollers.length === 0, `no horizontal overflow after Undo on a phone (${JSON.stringify(layout)})`);
  await context.close();
};

// --------------------------------------------------------------------- run
const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(journeys);
const browser = await chromium.launch({ headless: true, ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}) });
for (const name of selected) {
  journeyName = name;
  const started = Date.now();
  try {
    await journeys[name](browser);
  } catch (error) {
    const where = (error.stack || '').split('\n').find((line) => line.includes('linearMultipleRepresentations.mjs')) || '';
    findings.push(`[${name}] crashed: ${error.message.split('\n')[0]} ${where.trim()}`);
  }
  console.log(`${name}: ${Math.round((Date.now() - started) / 1000)}s`);
}
await browser.close();
mkdirSync(ARTIFACTS, { recursive: true });
writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ selected, findings, notes }, null, 2));
notes.push(`slowest MathLive focus after a click: ${Math.round(slowestFocusMs)} ms`);
notes.forEach((line) => console.log(`note ${line}`));
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach((line) => console.log(`  ✗ ${line}`));
  process.exit(1);
}
console.log('\nno findings');

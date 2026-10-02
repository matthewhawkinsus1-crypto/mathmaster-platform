// THE STUDENT UX PLATFORM PASS, DONE AS A STUDENT DOES IT.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/studentUxPlatform.mjs [journey ...]
//   (PLAYWRIGHT_MODULE=<playwright/index.mjs> and CHROMIUM_PATH=<chrome> when the
//    defaults are not installed; ARTIFACTS_DIR overrides the screenshot folder.)
//
// studentUxPlatformMain.jsx compiles one assignment through the teacher import
// chain and mounts it in App.jsx's assignment-screen / shell / stage wrappers:
// the PR #397 warm-ups, board and DOL board, Step Algebra, Graphing 2, Linear
// Table Workbench, a three-part answer, a table-card sort, one ordinary answer
// and a submit-only DOL answer. Every journey drives rendered controls only —
// clicks, taps, keys — and reads back the saved draft solely to prove what a
// reload restores.
//
//   open-laptop   1366×768: what has focus and where the page sits when each
//                 question opens; chrome language; the bar's measured height.
//   open-ipad     820×1180 touch: nothing opens a keyboard on arrival.
//   rapid-switch  click one math field and type AT ONCE, slowed 4× like a busy
//                 Chromebook: Backspace, digits and a fraction land in the
//                 field that was clicked, and the finished one is untouched.
//   enter         Enter walks the blanks and never spends an attempt by
//                 surprise; one-box questions still submit on Enter; a DOL
//                 asks for a second, deliberate Enter; the board checks the
//                 card, never the board.
//   phone         390×844 touch: one-row bar with Submit; −2/3 typed with the
//                 keypad's fraction key into a box that stays above the keys;
//                 one math keypad at a time; group names; no sideways scroll.
//   graphs        lines clipped to the plot; the directions shown once; the
//                 board's platform Undo; enlarge and drag.
//   sort          the table-card sort done correctly on a phone, then checked.
//   persistence   typed, plotted and sorted work survives a reload, and every
//                 stored record passes the real draft sanitizer.
//   wide          1920×1080 (a Chromebook zoomed out): multi-column tools use
//                 the width; ordinary questions do not.
//   identity      the signed-in identity bar at 344, 390 and 479px (one line,
//                 ~38px, pinned, every name kept) and on iPad and Chromebook;
//                 its star drawn, not typed (PQ-021, PQ-030).
//   opener        "⤢ Enlarge question" covers no text or control of a
//                 multi-part answer or Step Algebra, phone to Chromebook
//                 (PQ-025).
//   staged        a composed question in phone Work View: the header is the
//                 task (PQ-026), all seven table rows typed on the number
//                 keypad stay on screen above the keys (PQ-037); then the
//                 phone turns on its side and the step gets the height
//                 (PQ-020), and turns back with the work intact.
//   sticky-reveal 1366×768: Enter walks to a blank below a tall task card and
//                 the blank lands below the card, not under it (PQ-031).
//   keypad-short  390×664 and 375×667: typing in a staged Work View with the
//                 number keypad up folds the chrome so the step keeps ≥140px
//                 and the box being typed into is wholly on screen; Done
//                 unfolds it; at 390×844 the chrome does not fold.
//
// Exit code 1 on any finding. Screenshots: tests/browser/artifacts/studentUxPlatform/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/studentUxPlatform');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const { sanitizeWorkspaceDraftValue } = await import(path.join(ROOT, 'functions/shared/workspaceDraftSchema.mjs'));

const LAPTOP = { viewport: { width: 1366, height: 768 } };
const IPAD = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const WIDE = { viewport: { width: 1920, height: 1080 } };

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
const open = async (page, id, run = `${journeyName}-${Date.now()}`) => {
  await page.goto(`${ORIGIN}/tests/browser/studentUxPlatform.html?q=${id}&run=${run}`, { timeout: 120000 });
  await page.waitForFunction((qid) => window.__ux && document.querySelector(`[data-question-id="${qid}"]`), id, { timeout: 120000 });
  await settle(page, 2500);
};
const go = async (page, id) => {
  await page.evaluate((qid) => window.__ux.go(qid), id);
  await page.waitForFunction((qid) => document.querySelector(`[data-question-id="${qid}"]`), id, { timeout: 60000 });
  await settle(page, 2500);
};
const shot = async (page, name) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`) });
};
const deepActive = (page) => page.evaluate(() => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  const host = active?.getRootNode?.()?.host;
  const owner = host || active;
  return owner ? { tag: owner.tagName.toLowerCase(), label: owner.getAttribute?.('aria-label') || owner.textContent?.trim().slice(0, 30) || '' } : null;
});
const mathValues = (page) => page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-engine math-field:not([data-calculator-expression])')].map((field) => field.value));
const grades = (page) => page.evaluate(() => window.__ux.grades());
// Waits until the clicked field REALLY has focus, like a person watching the
// caret, except in rapid-switch, which deliberately does not.
const focusField = async (field) => {
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await field.evaluate((element) => new Promise((resolve) => {
    const started = performance.now();
    const tick = () => (document.activeElement === element || performance.now() - started > 3000 ? resolve() : requestAnimationFrame(tick));
    tick();
  }));
};
const typeInto = async (page, field, text) => {
  await focusField(field);
  await page.keyboard.type(text, { delay: 30 });
  await settle(page, 200);
};

// ------------------------------------------------------------------ journeys
const JOURNEYS = {
  async 'open-laptop'(browser) {
    const page = await (await browser.newContext(LAPTOP)).newPage();
    await open(page, 'lmr-wu-1');
    const ids = await page.evaluate(() => window.__ux.ids());
    const ONE_BOX = new Set(['ux-simple', 'ux-dol-simple', 'ux-multi']);
    for (const id of ids) {
      await go(page, id);
      await page.evaluate(() => window.scrollTo(0, 0));
      await go(page, id);
      const active = await deepActive(page);
      const scrollY = await page.evaluate(() => Math.round(window.scrollY));
      if (ONE_BOX.has(id)) check(active?.tag === 'math-field', `${id}: a question with its own answer box opens ready to type on a laptop (focus: ${JSON.stringify(active)})`);
      else check(!active || ['body', 'html'].includes(active.tag), `${id}: opened with focus on ${JSON.stringify(active)} — a multi-part workspace has no "the" box`);
      check(scrollY === 0, `${id}: the page jumped to ${scrollY}px on open, past the prompt`);
      const chrome = await page.evaluate(() => document.querySelector('.mathmaster-question-alignment')?.innerText || '');
      check(!/TEKS|CCMR/.test(chrome) && /Learning goal/.test(chrome), `${id}: student chrome reads "${chrome.replace(/\s+/g, ' ')}"`);
      const bar = await page.evaluate(() => {
        const element = document.querySelector('.mathmaster-desktop-action-bar');
        const style = getComputedStyle(document.documentElement);
        return element ? { height: element.getBoundingClientRect().height, published: parseFloat(style.getPropertyValue('--mm-action-bar-height')), padding: parseFloat(style.scrollPaddingBottom) } : null;
      });
      if (bar) {
        check(Math.abs(bar.published - bar.height) < 1.5, `${id}: the bar publishes ${bar.published}px for a ${bar.height}px bar`);
        check(bar.padding >= bar.height + 12, `${id}: scroll padding ${bar.padding}px does not clear a ${bar.height}px bar`);
      }
    }
    await go(page, 'lmr-dol-1');
    await shot(page, 'laptop-dol-board-open');
    note('every question opened at the top; one-box questions focused; multi-part workspaces did not');
  },

  async 'open-ipad'(browser) {
    const page = await (await browser.newContext(IPAD)).newPage();
    await open(page, 'lmr-cw-2');
    const ids = await page.evaluate(() => window.__ux.ids());
    for (const id of ids) {
      await go(page, id);
      const active = await deepActive(page);
      check(!active || ['body', 'html'].includes(active.tag), `${id}: a touch device opened with focus on ${JSON.stringify(active)} (keyboard/keypad before reading)`);
      const keypads = await page.evaluate(() => document.querySelectorAll('.mathmaster-math-input-tools, .mathmaster-mobile-numeric-keypad').length);
      check(keypads === 0, `${id}: ${keypads} keypad(s) open on arrival`);
    }
    await go(page, 'lmr-cw-2');
    await shot(page, 'ipad-board-open');
  },

  async 'rapid-switch'(browser) {
    const context = await browser.newContext(LAPTOP);
    const page = await context.newPage();
    await open(page, 'ux-multi');
    const fields = page.locator('.mathmaster-question-engine math-field');
    await typeInto(page, fields.nth(0), '5');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // No waiting for focus: click and type at once, as a quick student does.
    const clickAndType = async (index, keys) => {
      const box = await fields.nth(index).boundingBox();
      await page.mouse.click(box.x + 24, box.y + box.height / 2);
      for (const key of keys) await page.keyboard.press(key);
    };
    await clickAndType(1, ['Backspace', '4']);
    await clickAndType(2, ['3', '/', '4']);
    await clickAndType(0, ['End']);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await settle(page, 800);
    const values = await mathValues(page);
    check(values[0] === '5', `the finished slope was edited by keys meant for other boxes: ${JSON.stringify(values)}`);
    check(values[1] === '4', `the y-intercept did not get its own typing: ${JSON.stringify(values)}`);
    check(/\\frac\{?3\}?\{?4\}?/.test(values[2] || ''), `a fraction typed straight after the click went elsewhere: ${JSON.stringify(values)}`);
    note(`values after rapid switching at 4× CPU throttle: ${JSON.stringify(values)}`);
  },

  async enter(browser) {
    const page = await (await browser.newContext(LAPTOP)).newPage();
    // A three-part answer: Enter walks the blanks, then asks before submitting.
    await open(page, 'ux-multi');
    const fields = page.locator('.mathmaster-question-engine math-field');
    await typeInto(page, fields.nth(0), '-2/3');
    await page.keyboard.press('Enter');
    await settle(page);
    check((await deepActive(page))?.label === 'y-intercept', `Enter in a filled box should move to the next blank (focus: ${JSON.stringify(await deepActive(page))})`);
    await page.keyboard.type('4');
    await page.keyboard.press('Enter');
    await settle(page);
    await page.keyboard.type('6');
    await page.keyboard.press('Enter');
    await settle(page);
    check((await grades(page)).length === 0, 'Enter in the last box of a multi-part question submitted it');
    const focused = await deepActive(page);
    check(focused?.tag === 'button' && /Submit/.test(focused.label), `Enter in the last box should bring Submit into focus (focus: ${JSON.stringify(focused)})`);
    await shot(page, 'laptop-enter-focuses-submit');
    await page.keyboard.press('Enter');
    await settle(page, 800);
    check((await grades(page)).length === 1, 'a second, deliberate Enter on Submit did not submit');

    // One box: the single-answer convention is kept.
    await go(page, 'ux-simple');
    await typeInto(page, page.locator('.mathmaster-question-engine math-field').first(), '2');
    await page.keyboard.press('Enter');
    await settle(page, 800);
    check((await grades(page)).some((grade) => grade.questionId === 'ux-simple'), 'Enter in a one-box question no longer submits it');

    // DOL: never on a reflexive Enter.
    await go(page, 'ux-dol-simple');
    await typeInto(page, page.locator('.mathmaster-question-engine math-field').first(), '-3');
    await page.keyboard.press('Enter');
    await settle(page, 500);
    check(!(await grades(page)).some((grade) => grade.questionId === 'ux-dol-simple'), 'Enter submitted a one-try DOL answer without a second press');
    await page.keyboard.press('Enter');
    await settle(page, 800);
    check((await grades(page)).some((grade) => grade.questionId === 'ux-dol-simple'), 'the second Enter on the focused Submit did not submit the DOL answer');

    // The board: Enter checks the card, never the board.
    await go(page, 'lmr-cw-2');
    const before = (await grades(page)).length;
    const slope = page.locator('[data-lmr-card="slope"] math-field').first();
    await typeInto(page, slope, '-2');
    await page.keyboard.press('Enter');
    await settle(page, 600);
    check((await grades(page)).length === before, 'Enter in a board card submitted the board');
    const verdict = await page.locator('[data-lmr-card="slope"]').innerText();
    check(/correct|Correct|✓/.test(verdict), `Enter did not check the slope card: "${verdict.slice(0, 120)}"`);

    // A registry tool: Enter in the first of several boxes never submits.
    await go(page, 'ux-ltw');
    const m = page.locator('input[aria-label="Slope m"]');
    await m.scrollIntoViewIfNeeded();
    await m.fill('-2/3');
    await m.press('Enter');
    await settle(page);
    check((await grades(page)).every((grade) => grade.questionId !== 'ux-ltw'), 'Enter in the table workbench slope box submitted the tool');
    check((await deepActive(page))?.label === 'y-intercept b', `Enter in the slope box should move to the y-intercept box (focus: ${JSON.stringify(await deepActive(page))})`);
  },

  async phone(browser) {
    const page = await (await browser.newContext(PHONE)).newPage();
    await open(page, 'ux-multi');
    const bar = await page.locator('.portrait-action-bar').boundingBox();
    check(bar && bar.height <= 64, `the phone bar with Submit is ${bar?.height}px — two rows over the work`);
    const names = await page.locator('.portrait-action-bar button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') || button.innerText.trim()));
    check(names.some((name) => /Undo/.test(name)) && names.some((name) => /Scratchpad/.test(name)), `icon-only tools must keep their names: ${JSON.stringify(names)}`);
    check(await page.evaluate(() => document.querySelectorAll('.mathmaster-math-input-tools').length) === 0, 'a math keypad was open before any field was touched');
    const fields = page.locator('.mathmaster-question-engine math-field');
    await fields.nth(0).tap();
    await settle(page, 500);
    const afterFirst = await page.evaluate(() => document.querySelectorAll('.mathmaster-math-input-tools').length);
    await fields.nth(1).tap();
    await settle(page, 500);
    const afterSecond = await page.evaluate(() => document.querySelectorAll('.mathmaster-math-input-tools').length);
    check(afterFirst === 1 && afterSecond === 1, `one keypad at a time expected, got ${afterFirst} then ${afterSecond}`);
    await shot(page, 'phone-multi-one-keypad');

    // −2/3 on the number keypad, into a box that stays above the keys.
    await go(page, 'ux-ltw');
    const slope = page.locator('input[aria-label="Slope m"]');
    await slope.scrollIntoViewIfNeeded();
    await slope.tap();
    await page.waitForSelector('.mathmaster-mobile-numeric-keypad', { timeout: 10000 });
    const key = (label) => page.locator('.mathmaster-mobile-numeric-keypad button', { hasText: new RegExp(`^${label}$`) }).first();
    await key('±').tap();
    await key('2').tap();
    await page.locator('.mathmaster-keypad-fraction').tap();
    await key('3').tap();
    await settle(page, 400);
    check(await slope.inputValue() === '-2/3', `the keypad typed "${await slope.inputValue()}" for ± 2 / 3`);
    const geometry = await page.evaluate(() => ({
      field: document.querySelector('input[aria-label="Slope m"]').getBoundingClientRect().bottom,
      keys: document.querySelector('.mathmaster-mobile-numeric-keypad').getBoundingClientRect().top,
    }));
    check(geometry.field <= geometry.keys, `the box being typed into is under the keypad (${Math.round(geometry.field)} > ${Math.round(geometry.keys)})`);
    check(!(await page.locator('.portrait-action-bar').isVisible()), 'the bar stayed under the keypad instead of yielding its row');
    await shot(page, 'phone-ltw-fraction-keypad');
    await page.locator('.mathmaster-keypad-done').tap();
    await settle(page, 300);
    check(await page.locator('.portrait-action-bar').isVisible(), 'the bar did not come back after Done');

    // Situations are sorted into situations.
    await go(page, 'lmr-wu-2');
    const slots = await page.locator('[role="radiogroup"] [role="radio"]').allInnerTexts();
    check(slots.every((text) => /Situation [AB]/.test(text)), `WU-2 group names: ${JSON.stringify(slots)}`);
    for (const id of ['lmr-wu-2', 'ux-rm-table', 'lmr-cw-2', 'ux-ltw']) {
      await go(page, id);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(overflow <= 1, `${id}: ${overflow}px of sideways scroll on a phone`);
    }
  },

  async graphs(browser) {
    const page = await (await browser.newContext(LAPTOP)).newPage();
    await open(page, 'ux-graph2');
    const plane = page.locator('svg[role="application"]').first();
    await plane.scrollIntoViewIfNeeded();
    const box = await plane.boundingBox();
    // (0, 3) then (1, 1): a steep line that leaves the window through the top
    // and the bottom.
    const [vbW, vbH] = (await plane.getAttribute('viewBox')).split(' ').slice(2).map(Number);
    const bounds = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    const at = ([x, y]) => ({
      x: box.x + ((42 + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * (vbW - 84)) * box.width) / vbW,
      y: box.y + ((vbH - 42 - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * (vbH - 84)) * box.height) / vbH,
    });
    for (const point of [[0, 3], [1, 1]]) {
      const p = at(point);
      await page.mouse.click(p.x, p.y);
      await settle(page, 300);
    }
    const clip = await page.evaluate(() => {
      const svg = document.querySelector('svg[role="application"]');
      const line = [...svg.querySelectorAll('line')].find((element) => element.getAttribute('stroke') === '#1a73e8' && element.getAttribute('stroke-width') === '3');
      const group = line?.closest('g[clip-path]');
      const id = group?.getAttribute('clip-path')?.match(/#([^)]+)/)?.[1];
      const rect = id ? document.getElementById(id)?.querySelector('rect') : null;
      const plotRect = svg.querySelector(':scope > rect');
      return {
        line: Boolean(line),
        clipped: Boolean(rect),
        matches: rect && plotRect && ['x', 'y', 'width', 'height'].every((attr) => rect.getAttribute(attr) === plotRect.getAttribute(attr)),
        help: document.querySelectorAll('.mathmaster-plot-help').length,
      };
    });
    check(clip.line, 'the student line was not drawn after two points');
    check(clip.clipped && clip.matches, `the student line is not clipped to the plot rectangle: ${JSON.stringify(clip)}`);
    check(clip.help === 1, `one set of plotting directions expected, found ${clip.help}`);
    await shot(page, 'laptop-graphing2-clipped');

    // The board: three planes, no repeated directions, and one Undo that works.
    await go(page, 'lmr-cw-2');
    check(await page.evaluate(() => document.querySelectorAll('.mathmaster-plot-help').length) === 0, 'the board repeats the plotting directions under its graphs');
    const platformUndo = page.locator('.mathmaster-desktop-action-bar .mathmaster-universal-undo');
    check(!(await platformUndo.isEnabled()), 'the platform Undo is enabled before any change');
    for (const key of ['graph1', 'graph2']) {
      const target = page.locator(`[data-lmr-plane="${key}"] svg[role="application"]`);
      await target.scrollIntoViewIfNeeded();
      const b = await target.boundingBox();
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.35);
      await settle(page, 300);
    }
    check(/Graph 2/.test(await platformUndo.getAttribute('title') || ''), 'the platform Undo does not name the graph it will undo');
    await platformUndo.click();
    await settle(page, 300);
    const work = await page.evaluate(() => window.__ux.work('lmr-cw-2') || {});
    check((work.graph2Points || []).length === 0 && (work.graph1Points || []).length === 1, `platform Undo undid the wrong graph: ${JSON.stringify({ g1: work.graph1Points, g2: work.graph2Points })}`);
    // Drag the Graph 1 point, then undo the drag with the graph's own Undo.
    const g1 = page.locator('[data-lmr-plane="graph1"] svg[role="application"]');
    const g1box = await g1.boundingBox();
    await page.mouse.move(g1box.x + g1box.width * 0.5, g1box.y + g1box.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(g1box.x + g1box.width * 0.62, g1box.y + g1box.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await settle(page, 300);
    const dragged = (await page.evaluate(() => window.__ux.work('lmr-cw-2')?.graph1Points))?.[0];
    await page.getByRole('button', { name: 'Undo on Graph 1 · Intercept method' }).click().catch(() => page.locator('[aria-label^="Undo on Graph 1"]').click());
    await settle(page, 300);
    const undone = (await page.evaluate(() => window.__ux.work('lmr-cw-2')?.graph1Points))?.[0];
    check(JSON.stringify(dragged) !== JSON.stringify(undone), `the graph's own Undo did not take back the drag (${JSON.stringify(dragged)} → ${JSON.stringify(undone)})`);
    // Enlarged, the plane is still clipped and still plots.
    await page.locator('[aria-label^="Enlarge Graph 1"], button:has-text("Enlarge")').first().click();
    await settle(page, 500);
    await shot(page, 'laptop-board-graph-enlarged');
    await page.keyboard.press('Escape');
  },

  async sort(browser) {
    const page = await (await browser.newContext(PHONE)).newPage();
    await open(page, 'ux-rm-table');
    const question = await page.evaluate(() => window.__ux.question('ux-rm-table'));
    check(await page.locator('.mathmaster-line-card[data-card-kind="table"]').count() === 2, 'the two table cards are missing');
    const names = await page.locator('.mathmaster-line-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')));
    check(names.every((name) => /: .+\. In /.test(name)), `a card's name does not say what it shows: ${names.find((name) => !/: .+\. In /.test(name))}`);
    // Sort every card: the phone plan is Situation A, the candle Situation B.
    // Read from each card's accessible name — which is the point: a student
    // using a screen reader can do this task now.
    const planFacts = /10 a month|2x \+ 10|m = 2\.|values 0, 10;|through \(0, 10\)/;
    for (const slot of [0, 1]) {
      await page.locator('[role="radiogroup"] [role="radio"]').nth(slot).tap();
      const cards = page.locator('.mathmaster-line-card');
      for (let index = 0; index < await cards.count(); index += 1) {
        const label = await cards.nth(index).getAttribute('aria-label');
        const isPlan = planFacts.test(label);
        if ((slot === 0) === isPlan && /In not sorted yet/.test(label)) {
          await cards.nth(index).scrollIntoViewIfNeeded();
          await cards.nth(index).tap();
          await settle(page, 120);
        }
      }
    }
    await shot(page, 'phone-table-sort-done');
    await page.getByRole('button', { name: 'Check groups' }).tap();
    await settle(page, 800);
    const graded = (await grades(page)).find((grade) => grade.questionId === 'ux-rm-table');
    check(graded?.isCorrect === true, `a correct sort was not graded correct: ${JSON.stringify(graded)} (sets: ${question?.sets?.map((set) => set.id).join(', ')})`);
  },

  async persistence(browser) {
    const context = await browser.newContext(LAPTOP);
    const page = await context.newPage();
    const run = `persist-${Date.now()}`;
    await open(page, 'ux-multi', run);
    const fields = page.locator('.mathmaster-question-engine math-field');
    await typeInto(page, fields.nth(0), '-2/3');
    await typeInto(page, fields.nth(1), '4');
    await go(page, 'lmr-cw-2');
    await typeInto(page, page.locator('[data-lmr-card="slope"] math-field').first(), '-2');
    await go(page, 'ux-ltw');
    await page.locator('input[aria-label="Slope m"]').fill('-2/3');
    await settle(page, 400);
    await page.reload({ timeout: 120000 });
    await page.waitForFunction(() => window.__ux, null, { timeout: 120000 });
    await settle(page, 2500);
    // The reload lands on the URL's question; the student goes back to each.
    await go(page, 'ux-ltw');
    check(await page.locator('input[aria-label="Slope m"]').inputValue() === '-2/3', 'the table workbench slope was lost on reload');
    await go(page, 'ux-multi');
    const values = await mathValues(page);
    // MathLive writes a one-digit fraction as \frac23.
    check(/-\\frac\{?2\}?\{?3\}?/.test(values[0] || '') && values[1] === '4', `typed answers were lost on reload: ${JSON.stringify(values)}`);
    await go(page, 'lmr-cw-2');
    const board = await page.locator('[data-lmr-card="slope"] math-field').first().evaluate((field) => field.value);
    check(board === '-2', `the board slope was lost on reload: ${board}`);
    const drafts = await page.evaluate(() => window.__ux.drafts());
    let records = 0;
    for (const [key, entry] of Object.entries(drafts)) {
      const verdict = sanitizeWorkspaceDraftValue(entry?.value);
      records += 1;
      check(verdict.ok, `draft ${key} would not reach the server: ${verdict.reason}`);
    }
    check(records >= 3, `expected the three questions' drafts, found ${records}`);
    const rejections = await page.evaluate(() => window.__ux.draftRejections());
    check(rejections.length === 0, `the draft-sync audit refused: ${JSON.stringify(rejections)}`);
    note(`${records} stored draft records, all accepted by the sanitizer`);
  },

  async wide(browser) {
    const page = await (await browser.newContext(WIDE)).newPage();
    await open(page, 'lmr-cw-2');
    const board = await page.evaluate(() => {
      const top = (title) => [...document.querySelectorAll('h3, strong, span')].find((element) => element.textContent.trim() === title)?.getBoundingClientRect().top;
      return {
        shell: document.querySelector('.mathmaster-tool-shell').getBoundingClientRect().width,
        task: document.querySelector('.mathmaster-desktop-question-anchor').getBoundingClientRect().width,
        rows: [top('Equations'), top('Table'), top('Key features')].map(Math.round),
      };
    });
    check(board.shell >= 1400, `the board did not use the wide screen (${board.shell}px)`);
    check(board.task <= 1120, `the task card stretched to ${board.task}px`);
    check(new Set(board.rows).size === 1, `Equations, Table and Key features are not one row: ${JSON.stringify(board.rows)}`);
    await shot(page, 'wide-board');
    await go(page, 'ux-multi');
    const plain = await page.evaluate(() => document.querySelector('.mathmaster-assignment-shell').getBoundingClientRect().width);
    check(plain <= 1120, `an ordinary question widened to ${plain}px`);
  },

  async identity(browser) {
    // Whose work is on the screen stays on the screen — compactly. Phones get
    // one ~38px line (was 67px at 390, 86px at 344); wider screens keep
    // "Not you?" (PQ-021). The star is an svg (PQ-030).
    for (const [width, height, phone] of [[344, 882, true], [390, 844, true], [479, 900, true], [820, 1180, true], [1366, 768, false]]) {
      const context = await browser.newContext(phone ? { viewport: { width, height }, hasTouch: true, isMobile: true } : { viewport: { width, height } });
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/tests/browser/studentUxPlatform.html?q=ux-multi&identity=1&run=identity-${width}-${Date.now()}`, { timeout: 120000 });
      await page.waitForFunction(() => window.__ux && document.querySelector('[data-student-identity]'), null, { timeout: 120000 });
      await settle(page, 1500);
      const bar = await page.evaluate(() => {
        const node = document.querySelector('[data-student-identity]');
        const middle = (element) => { const r = element.getBoundingClientRect(); return r.top + r.height / 2; };
        const name = node.querySelector('.mm-identity-name');
        const points = node.querySelector('[aria-label$="Class Points"]');
        const logout = [...node.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Log Out');
        const notYou = node.querySelector('.mm-identity-not-you');
        return {
          height: Math.round(node.getBoundingClientRect().height),
          offset: getComputedStyle(document.documentElement).getPropertyValue('--mm-student-identity-stack-offset').trim(),
          sticky: getComputedStyle(node).position === 'sticky',
          oneRow: Boolean(name && points && logout) && [points, logout].every((element) => Math.abs(middle(element) - middle(name)) <= 6),
          nameText: name?.textContent || '',
          pointsName: points?.getAttribute('aria-label') || '',
          pointsText: (points?.textContent || '').replace(/\s+/g, ' ').trim(),
          pointsDrawn: Boolean(points?.querySelector('svg')) && !/⭐/.test(points?.textContent || ''),
          notYouShown: Boolean(notYou && notYou.getBoundingClientRect().width > 0),
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      const where = `${width}×${height}`;
      check(bar.sticky, `${where}: the identity bar is not pinned`);
      check(bar.height <= 40, `${where}: the identity bar is ${bar.height}px`);
      check(bar.offset === `${bar.height}px`, `${where}: the bar publishes ${bar.offset} for a ${bar.height}px bar`);
      check(bar.oneRow, `${where}: the name, the points and Log Out are not one row`);
      check(bar.nameText === 'Claude QA Student • Period 3', `${where}: the name reads "${bar.nameText}"`);
      check(bar.pointsName === '120 Class Points' && bar.pointsText === '120 Class Points', `${where}: the points read ${JSON.stringify([bar.pointsName, bar.pointsText])}`);
      check(bar.pointsDrawn, `${where}: the points star is not drawn`);
      check(bar.notYouShown === (width >= 480), `${where}: "Not you?" ${bar.notYouShown ? 'shown' : 'hidden'} (expected only from 480px)`);
      check(bar.overflowX <= 1, `${where}: ${bar.overflowX}px of sideways scroll`);
      check(await page.getByRole('button', { name: 'Log Out', exact: true }).count() === 1, `${where}: no button named "Log Out"`);
      await shot(page, `identity-${width}x${height}`);
      await context.close();
    }
  },

  async opener(browser) {
    // The opener floats over the top-right corner of the question. Nothing the
    // student reads or presses may be under it: "Complete Each Pa|rt" at 390,
    // Step Algebra's "Reset work" at 1366×768 (PQ-025).
    const covered = (page) => page.evaluate(() => {
      const opener = [...document.querySelectorAll('.mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button')]
        .find((button) => /enlarge/i.test(button.textContent || ''));
      if (!opener) return ['(no opener)'];
      const o = opener.getBoundingClientRect();
      const over = (r) => r.width > 0 && r.height > 0 && r.left < o.right - 1 && r.right > o.left + 1 && r.top < o.bottom - 1 && r.bottom > o.top + 1;
      const hits = [];
      const walker = document.createTreeWalker(opener.parentElement, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (opener.contains(node) || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if ([...range.getClientRects()].some(over)) hits.push(`"${node.textContent.trim().slice(0, 24)}"`);
      }
      opener.parentElement.querySelectorAll('button, input, math-field, [role="radio"]').forEach((element) => {
        if (element !== opener && over(element.getBoundingClientRect())) hits.push(`<${element.tagName.toLowerCase()}> "${(element.textContent || '').trim().slice(0, 24)}"`);
      });
      return [...new Set(hits)];
    });
    for (const [width, height, phone] of [[344, 882, true], [390, 844, true], [820, 1180, true], [1366, 768, false]]) {
      const context = await browser.newContext(phone ? { viewport: { width, height }, hasTouch: true, isMobile: true } : { viewport: { width, height } });
      const page = await context.newPage();
      await open(page, 'ux-multi');
      for (const id of ['ux-multi', 'ux-simple', 'ux-step']) {
        if (id !== 'ux-multi') await go(page, id);
        const hits = await covered(page);
        check(hits.length === 0, `${width}×${height} ${id}: the Enlarge button covers ${hits.join(', ')}`);
      }
      await shot(page, `opener-step-${width}x${height}`);
      await context.close();
    }
  },

  async staged(browser) {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/tests/browser/studentUxPlatform.html?q=ux-staged-table&identity=1&staged=1&run=staged-${Date.now()}`, { timeout: 120000 });
    await page.waitForFunction(() => window.__ux && document.querySelector('[data-question-id="ux-staged-table"] .workflow-focus'), null, { timeout: 120000 });
    await settle(page, 2500);

    // Embedded: the Enlarge button sits beside the step chips, not on them (PQ-025).
    const chipRow = await page.evaluate(() => {
      const opener = [...document.querySelectorAll('button')].find((button) => /enlarge question/i.test(button.textContent || ''));
      const o = opener.getBoundingClientRect();
      const n = document.querySelector('.workflow-focus__navigator').getBoundingClientRect();
      return Math.max(0, Math.min(o.right, n.right) - Math.max(o.left, n.left)) * Math.max(0, Math.min(o.bottom, n.bottom) - Math.max(o.top, n.top));
    });
    check(chipRow === 0, `the Enlarge button overlaps the step chips by ${Math.round(chipRow)}px²`);

    await page.locator('.mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button', { hasText: /Enlarge/ }).first().tap();
    await page.waitForSelector('.mathmaster-work-view-host[data-open="true"]');
    await settle(page, 700);

    // The header is the task, all of it (PQ-026).
    const header = await page.evaluate(() => {
      const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
      const task = host.querySelector('.mathmaster-work-view-persistent-task');
      return {
        title: Boolean(host.querySelector('.mathmaster-work-view-title')),
        hidden: task ? task.scrollHeight - task.clientHeight : -1,
        height: Math.round(host.querySelector('.mathmaster-work-view-header').getBoundingClientRect().height),
      };
    });
    check(!header.title, 'the Work View header still says "Question Work View" above the task');
    check(header.hidden >= 0 && header.hidden <= 1, `${header.hidden}px of the task is cut off in the header`);
    // Four whole lines of task at most (81px); the old title-plus-2.4-lines
    // header was 78px and cut its third line in half.
    check(header.height <= 82, `the Work View header is ${header.height}px on a phone`);

    // Every row, typed on the number keypad, stays on screen above the keys (PQ-037).
    const cells = page.locator('.mathmaster-work-view-host[data-open="true"] input[aria-label^="Row "]');
    const count = await cells.count();
    check(count === 7, `expected the seven-row table, found ${count} rows`);
    const key = (label) => page.locator('.mathmaster-mobile-numeric-keypad button', { hasText: new RegExp(`^${label}$`) }).first();
    for (let index = 0; index < count; index += 1) {
      const cell = cells.nth(index);
      // The worst case, and a common one: the student pressed Done, scrolled
      // the next row just into view at the bottom of the step, and taps it —
      // then the keypad takes the bottom of the screen and the step shrinks.
      const done = page.locator('.mathmaster-keypad-done');
      if (await done.count()) {
        await done.tap();
        await settle(page, 250);
      }
      await cell.evaluate((element) => element.scrollIntoView({ block: 'end' }));
      await settle(page, 150);
      await cell.tap();
      await page.waitForSelector('.mathmaster-mobile-numeric-keypad', { timeout: 10000 });
      await settle(page, 450);
      const value = String(4 + 2 * index);
      for (const digit of value) await key(digit).tap();
      await settle(page, 150);
      const seen = await cell.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const keys = document.querySelector('.mathmaster-mobile-numeric-keypad').getBoundingClientRect();
        const body = element.closest('.workflow-focus__workspace-body').getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          box: `${Math.round(r.top)}-${Math.round(r.bottom)}`,
          keys: Math.round(keys.top),
          body: `${Math.round(body.top)}-${Math.round(body.bottom)}`,
          visible: r.bottom <= keys.top + 1 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && Boolean(top && (top === element || element.contains(top))),
          active: document.activeElement === element,
        };
      });
      check(seen.visible && seen.active, `row ${index + 1}: the box being typed into is not on screen (box ${seen.box}, step body ${seen.body}, keys from ${seen.keys})`);
      check(await cell.inputValue() === value, `row ${index + 1}: the keypad typed "${await cell.inputValue()}" for ${value}`);
      if (index === count - 1) await shot(page, 'staged-phone-keypad-last-row');
    }
    await page.locator('.mathmaster-keypad-done').tap();
    await settle(page, 300);

    const next = page.getByRole('button', { name: 'Next step', exact: true });
    check(await next.isEnabled(), 'Next step stayed disabled after the table was filled');
    await next.tap();
    await settle(page, 900);

    // On its side, the step gets the height (PQ-020): the instruction joins the
    // header, the step heading joins the Previous/Next row.
    const sideways = async (width, height) => {
      await page.setViewportSize({ width, height });
      await settle(page, 900);
      return page.evaluate(() => {
        const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
        if (!host) return { open: false };
        const box = (element) => element?.getBoundingClientRect();
        const body = box(host.querySelector('.workflow-focus__workspace-body'));
        const footer = host.querySelector('.workflow-focus__footer');
        const heading = host.querySelector('.workflow-focus__workspace-heading');
        const planes = [...host.querySelectorAll('.workflow-focus__workspace-body svg')].map((svg) => svg.getBoundingClientRect())
          .filter((r) => r.width > 60 && r.height > 60).sort((a, b) => b.width * b.height - a.width * a.height);
        const plane = planes[0];
        const shown = plane ? Math.max(0, Math.min(plane.bottom, body.bottom, innerHeight) - Math.max(plane.top, body.top, 0)) : 0;
        const buttons = [...host.querySelectorAll('.workflow-focus__nav-button')].map((button) => button.getBoundingClientRect());
        return {
          open: true,
          height: host.dataset.height,
          body: Math.round(body.height),
          headingInFooter: Boolean(heading && footer.contains(heading)),
          instructionInHeader: Boolean(host.querySelector('.mathmaster-work-view-header .mathmaster-work-view-instruction')),
          stepButtons: buttons.length === 2 && buttons.every((r) => r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight + 1),
          plane: plane ? Math.round((shown / plane.height) * 100) : 0,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
    };
    for (const [width, height, minimum] of [[844, 390, 250], [740, 360, 220]]) {
      const view = await sideways(width, height);
      const where = `${width}×${height}`;
      check(view.open, `${where}: Work View closed when the phone turned`);
      if (!view.open) break;
      check(view.height === 'short', `${where}: not laid out as a short Work View (${view.height})`);
      check(view.body >= minimum, `${where}: the step gets ${view.body}px (want ≥ ${minimum})`);
      check(view.headingInFooter && view.instructionInHeader, `${where}: the chrome did not fold (heading in footer ${view.headingInFooter}, instruction in header ${view.instructionInHeader})`);
      check(view.stepButtons, `${where}: Previous/Next are not both on screen at full size`);
      check(view.plane >= 95, `${where}: ${view.plane}% of the plane is on screen`);
      check(view.overflowX <= 1, `${where}: ${view.overflowX}px of sideways scroll`);
      await shot(page, `staged-sideways-${width}x${height}`);
    }

    // Back upright, still open, and the table still holds the student's work.
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page, 900);
    check(await page.locator('.mathmaster-work-view-host[data-open="true"]').count() === 1, 'Work View closed when the phone turned back');
    await page.getByRole('button', { name: 'Previous step', exact: true }).tap();
    await settle(page, 900);
    const kept = await cells.evaluateAll((inputs) => inputs.map((input) => input.value));
    check(JSON.stringify(kept) === JSON.stringify(['4', '6', '8', '10', '12', '14', '16']), `the table lost the student's work across the turns: ${JSON.stringify(kept)}`);
    await context.close();
  },

  async 'sticky-reveal'(browser) {
    // A blank the platform walks to with Enter lands BELOW the pinned task card,
    // whatever its height: scroll padding comes from the card's measured height
    // (PQ-031). A long task is stood in for by a taller card.
    const page = await (await browser.newContext(LAPTOP)).newPage();
    await open(page, 'ux-multi');
    for (const cardHeight of [null, 184]) {
      const placed = await page.evaluate(async (height) => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const anchor = document.querySelector('.mathmaster-desktop-question-anchor');
        anchor.style.minHeight = height ? `${height}px` : '';
        if (!document.querySelector('[data-reveal-room]')) {
          const room = document.createElement('div');
          room.dataset.revealRoom = '1';
          room.style.height = '2400px';
          document.querySelector('.mathmaster-assignment-shell').appendChild(room);
        }
        await wait(250);
        const fields = [...document.querySelectorAll('.mathmaster-question-engine math-field')];
        fields.forEach((field) => { field.value = ''; });
        // The second blank 30px under the card; the first one has the caret.
        window.scrollBy(0, fields[1].getBoundingClientRect().top - (anchor.getBoundingClientRect().bottom - 30));
        await wait(200);
        fields[0].focus({ preventScroll: true });
        await wait(200);
        return Math.round(anchor.getBoundingClientRect().height);
      }, cardHeight);
      await page.keyboard.press('Enter');
      await settle(page, 600);
      const after = await page.evaluate(() => {
        const anchor = document.querySelector('.mathmaster-desktop-question-anchor').getBoundingClientRect();
        const fields = [...document.querySelectorAll('.mathmaster-question-engine math-field')];
        const second = fields[1];
        return {
          active: second === document.activeElement || second.contains(document.activeElement),
          under: Math.round(anchor.bottom - second.getBoundingClientRect().top),
        };
      });
      check(after.active, `card ${placed}px: Enter did not walk to the next blank`);
      check(after.under <= 0, `card ${placed}px: the blank Enter walked to is ${after.under}px under the task card`);
    }
    await shot(page, 'sticky-reveal-tall-card');
  },

  async 'keypad-short'(browser) {
    // A small phone typing into a staged Work View: with MathMaster's number
    // keypad up the step has the height above the keys, so the chrome folds as
    // it does on a phone held sideways. At 390×664 the regular chrome left the
    // step 28px and the box being typed into 16px on screen (PQ-037). A taller
    // phone keeps the regular chrome with the keypad up.
    for (const [width, height, folds] of [[390, 664, true], [375, 667, true], [390, 844, false]]) {
      const where = `${width}×${height}`;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/tests/browser/studentUxPlatform.html?q=ux-staged-table&identity=1&staged=1&run=keypad-${width}x${height}-${Date.now()}`, { timeout: 120000 });
      await page.waitForFunction(() => window.__ux && document.querySelector('[data-question-id="ux-staged-table"] .workflow-focus'), null, { timeout: 120000 });
      await settle(page, 2000);
      await page.locator('.mathmaster-work-view-host[data-open="false"] > .mathmaster-work-view-body > .mathmaster-work-view-surface > button', { hasText: /Enlarge/ }).first().tap();
      await page.waitForSelector('.mathmaster-work-view-host[data-open="true"]');
      await settle(page, 700);
      const view = () => page.evaluate(() => {
        const host = document.querySelector('.mathmaster-work-view-host[data-open="true"]');
        const body = host.querySelector('.workflow-focus__workspace-body').getBoundingClientRect();
        const keys = document.querySelector('.mathmaster-mobile-numeric-keypad')?.getBoundingClientRect();
        const box = document.activeElement?.matches?.('input') ? document.activeElement.getBoundingClientRect() : null;
        const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null;
        return {
          height: host.dataset.height,
          body: Math.round(body.height),
          box: box ? `${Math.round(box.top)}-${Math.round(box.bottom)}` : null,
          boxShown: Boolean(box && box.top >= body.top - 1 && box.bottom <= body.bottom + 1
            && (!keys || box.bottom <= keys.top + 1) && hit && (hit === document.activeElement || document.activeElement.contains(hit))),
        };
      });
      const closed = await view();
      check(closed.height === 'regular', `${where}: keypad down, the Work View is ${closed.height}, not regular`);
      const cells = page.locator('.mathmaster-work-view-host[data-open="true"] input[aria-label^="Row "]');
      const last = cells.nth((await cells.count()) - 1);
      await last.evaluate((element) => element.scrollIntoView({ block: 'end' }));
      await settle(page, 150);
      await last.tap();
      await page.waitForSelector('.mathmaster-mobile-numeric-keypad', { timeout: 10000 });
      await settle(page, 700);
      const typing = await view();
      if (folds) {
        check(typing.height === 'short', `${where}: keypad up, the chrome did not fold (${typing.height})`);
        check(typing.body >= 140, `${where}: keypad up, the step gets ${typing.body}px (want ≥ 140)`);
      } else {
        check(typing.height === 'regular', `${where}: keypad up, the chrome folded although ${height - 274}px are left above the keys`);
      }
      check(typing.boxShown, `${where}: the box being typed into is not wholly on screen (${typing.box}, step ${typing.body}px)`);
      if (width === 390 && height === 664) await shot(page, 'keypad-short-390x664');
      await page.locator('.mathmaster-keypad-done').tap();
      await settle(page, 500);
      const after = await view();
      check(after.height === 'regular' && after.body >= closed.body - 1, `${where}: after Done the Work View stayed ${after.height} with ${after.body}px (was ${closed.body}px)`);
      await context.close();
    }
  },
};

// ------------------------------------------------------------------ runner
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const selected = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const names = selected.length ? selected : Object.keys(JOURNEYS);
const report = [];
for (const name of names) {
  journeyName = name;
  const browser = await chromium.launch(launch);
  const before = findings.length;
  const started = Date.now();
  try {
    await JOURNEYS[name](browser);
  } catch (error) {
    findings.push(`[${name}] journey failed: ${String(error?.message || error).split('\n')[0]}`);
  } finally {
    await browser.close();
  }
  const own = findings.slice(before);
  report.push({ journey: name, ok: own.length === 0, seconds: Math.round((Date.now() - started) / 1000), findings: own });
  console.log(`${own.length ? 'FAIL' : 'ok  '} ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  own.forEach((finding) => console.log(`     ${finding}`));
}
mkdirSync(ARTIFACTS, { recursive: true });
writeFileSync(path.join(ARTIFACTS, 'report.json'), `${JSON.stringify({ origin: ORIGIN, report, notes }, null, 2)}\n`);
notes.forEach((line) => console.log(`note ${line}`));
process.exit(findings.length ? 1 : 0);

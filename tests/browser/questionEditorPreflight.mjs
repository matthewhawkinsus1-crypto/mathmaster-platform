// CAN A TEACHER SEE, WHERE THEY EDIT A QUESTION, WHAT PRE-FLIGHT SAYS ABOUT IT?
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &   # 127.0.0.1:5188, firebase faked
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/questionEditorPreflight.mjs
//
// The REAL Question Editor, opened on a stored assignment built in node
// (tests/platform/helpers/editorPreflightFixtures.mjs): Algebra I M3 T2 L2,
// whose Question 21 says "Use the prices you found" (a note), with a Step
// Algebra question that writes x(x - 5) = 0 and one whose variable cancels
// (a warning each), and Review's question-version notes: Warm-Up 3 draws one of
// three cases a student is not told, and the whole assignment's (12 questions
// generate a version for each student, Recovery ready). On each screen a teacher:
//
//   SEES    the question with a warning shows it in full under its controls,
//           open from the start; the question with only notes says how many
//           and keeps them behind Show, and a warning an edit brings to it
//           opens them (weight 15 typed into Question 21: "counts ×15, but
//           the work it assesses …"); every text is the model's own
//   READS   each region is named by its heading ("Pre-Flight for Question
//           23: 1 warning, 2 notes"), a level-3 heading, and a list a screen
//           reader moves through item by item
//   KEYS    Show is a button that says whether it is open, pressed by Enter
//   QUIET   typing a grade weight keeps focus in the box, moves nothing above
//           it and announces nothing; Exclude takes a question's findings
//           away once Pre-Flight has run again; Save is never refused for them
//   FITS    nothing pushes the page sideways or is cut, at 1440×900, 390×844,
//           200% text, 320 px wide, and 320 px at 200% text
//
// and on a large assignment (82 questions) it measures what a keystroke in a
// grade weight costs, and the one Pre-Flight run after the teacher pauses, at
// full speed and with the CPU slowed 4×. That run is made in a worker
// (src/platform/preflight/editorPreflightWorker.js): no task on the page after
// the pause may be as long as half a run, or a key pressed then waits for it
// (COST).
//
// Each screen is its own browser context, closed before the next: a renderer
// navigated again and again on the dev server keeps shared-memory files in
// /tmp. Exit code 1 on any finding; screenshots and the measurements land in
// tests/browser/artifacts/questionEditorPreflight/.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/questionEditorPreflight');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/questionEditorPreflight.html`;
const MIN_TAP = 44;
rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const {
  CANCELS_QUESTION_ID, NOTED_QUESTION_ID, PRODUCT_QUESTION_ID, editorPreflightAssignment, largeEditorAssignment,
} = await import(`${repo}/tests/platform/helpers/editorPreflightFixtures.mjs`);
const { editorPreflightFindings, preflightFindingsCountText } = await import(`${repo}/src/platform/preflight/questionPreflightFindings.js`);
const { getStoredAssignmentQuestions } = await import(`${repo}/src/platform/contract/storedAssignmentV5.js`);

const FIXTURES = { flagged: editorPreflightAssignment(), large: largeEditorAssignment() };
const flaggedQuestions = getStoredAssignmentQuestions(FIXTURES.flagged);
const expected = editorPreflightFindings({ source: FIXTURES.flagged, questions: flaggedQuestions, classSize: 28 });
const numberOf = (id) => flaggedQuestions.findIndex((question) => question.questionId === id) + 1;
const WARNED = { id: PRODUCT_QUESTION_ID, number: numberOf(PRODUCT_QUESTION_ID) };
const CANCELLING = { id: CANCELS_QUESTION_ID, number: numberOf(CANCELS_QUESTION_ID) };
const NOTED = { id: NOTED_QUESTION_ID, number: numberOf(NOTED_QUESTION_ID) };
const itemsOf = (findings) => [...findings.warnings.map((text) => `Warning: ${text}`), ...findings.notes.map((text) => `Note: ${text}`)];

const SCREENS = Object.freeze([
  { id: 'desktop-1440', width: 1440, height: 900, interact: true },
  { id: 'phone-390', width: 390, height: 844, mobile: true, interact: true },
  { id: 'desktop-1440-text-200', width: 1440, height: 900, textScale: 2 },
  { id: 'narrow-320', width: 320, height: 800, mobile: true },
  { id: 'narrow-320-text-200', width: 320, height: 800, mobile: true, textScale: 2 },
]);

const findings = [];
const measurements = [];
const fail = (screen, rule, detail) => findings.push({ screen, rule, detail });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

const openEditor = async (screen, scenario) => {
  const context = await browser.newContext({
    viewport: { width: screen.width, height: screen.height },
    isMobile: Boolean(screen.mobile),
    hasTouch: Boolean(screen.mobile),
    deviceScaleFactor: screen.mobile ? 2 : 1,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((fixtures) => { window.__QUESTION_EDITOR_FIXTURES__ = fixtures; }, { [scenario]: FIXTURES[scenario] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  const cdp = await context.newCDPSession(page);
  const textScale = async () => {
    // The browser's text-size setting (Chromium's default font sizes).
    if (screen.textScale) await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * screen.textScale, fixed: Math.round(13 * screen.textScale) } });
  };
  await cdp.send('Page.enable');
  await textScale();
  await page.goto(`${PAGE}?scenario=${scenario}`);
  await textScale();
  await page.locator('[data-preflight-findings-state="current"]').waitFor({ state: 'attached', timeout: 60000 });
  return { context, page, cdp, errors };
};

const card = (page, number) => page.locator(`[data-question-card="${number}"]`);
const regionOf = (page, number) => card(page, number).locator(`section[data-preflight-findings="Question ${number}"]`);
// The state's wrapper has no box of its own (PreflightFindingsState), so it is waited for attached.
const settled = (page) => page.locator('[data-preflight-findings-state="current"]').waitFor({ state: 'attached', timeout: 30000 });
const textOf = async (locator) => (await locator.textContent() || '').replace(/\s+/g, ' ').trim();

// Nothing sideways, nothing cut: the page, the dialog, the cards, and every
// text inside a findings region against any box that clips it.
const fits = async (page, screen) => {
  const measured = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const regions = [...document.querySelectorAll('section[data-preflight-findings]')];
    const clipped = [];
    for (const regionNode of regions) {
      for (const element of [regionNode, ...regionNode.querySelectorAll('*')]) {
        if (element.closest('.mm-visually-hidden') || element.closest('[hidden]')) continue;
        const own = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== 'visible') clipped.push(`${element.tagName.toLowerCase()} scrolls sideways`);
        if (!own) continue;
        for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (/(auto|scroll)/.test(style.overflowY + style.overflowX)) break;
          if (!/hidden|clip/.test(style.overflowX + style.overflowY)) continue;
          const box = node.getBoundingClientRect();
          if (rect.right > box.right + 2 || rect.left < box.left - 2 || rect.bottom > box.bottom + 2 || rect.top < box.top - 2) {
            clipped.push(`"${own.slice(0, 40)}" cut by ${node.tagName.toLowerCase()}`);
            break;
          }
        }
      }
      const regionBox = regionNode.getBoundingClientRect();
      for (const control of regionNode.querySelectorAll('button, h3, li')) {
        const box = control.getBoundingClientRect();
        if (box.width && (box.right > regionBox.right + 1 || box.left < regionBox.left - 1)) clipped.push(`${control.tagName.toLowerCase()} runs out of its region`);
      }
    }
    return {
      page: document.scrollingElement.scrollWidth - window.innerWidth,
      dialog: dialog ? dialog.getBoundingClientRect().right - window.innerWidth : 0,
      cards: [...document.querySelectorAll('[data-question-card]')].filter((node) => node.scrollWidth - node.clientWidth > 1).length,
      regions: regions.length,
      clipped,
    };
  });
  if (measured.page > 1) fail(screen.id, 'FITS', `the page scrolls ${measured.page}px sideways`);
  if (measured.dialog > 1) fail(screen.id, 'FITS', `the dialog runs ${measured.dialog}px past the right edge`);
  if (measured.cards) fail(screen.id, 'FITS', `${measured.cards} question card(s) overflow sideways`);
  measured.clipped.forEach((detail) => fail(screen.id, 'FITS', detail));
  return measured;
};

const certify = async (screen) => {
  const { context, page, errors } = await openEditor(screen, 'flagged');
  const observed = { screen: screen.id };
  try {
    /* SEES: every region holds Pre-Flight's findings for its question, message
       for message: made in the editor's worker, judged here against node's. */
    const norm = (text) => text.replace(/\s+/g, ' ').trim();
    const drawnFindings = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-preflight-findings]')]
      .map((node) => [node.getAttribute('data-preflight-findings'), [...node.querySelectorAll('li')].map((item) => item.textContent)])));
    const wantedFindings = Object.fromEntries([...expected.byQuestionId].map(([id, entry]) => [`Question ${numberOf(id)}`, itemsOf(entry)]));
    if (itemsOf(expected.assignment).length) wantedFindings['the whole assignment'] = itemsOf(expected.assignment);
    const asText = (byRegion) => JSON.stringify(Object.keys(byRegion).sort().map((key) => [key, byRegion[key].map(norm)]));
    observed.regionsMatched = Object.keys(drawnFindings).length;
    if (asText(drawnFindings) !== asText(wantedFindings)) fail(screen.id, 'SEES', `the regions do not hold Pre-Flight's findings: ${Object.keys(drawnFindings).length} regions drawn, ${Object.keys(wantedFindings).length} expected`);

    /* SEES + READS: the warned question, open from the start. */
    const warnedFindings = expected.byQuestionId.get(WARNED.id);
    const warned = regionOf(page, WARNED.number);
    await warned.scrollIntoViewIfNeeded();
    const name = `Pre-Flight for Question ${WARNED.number}: ${preflightFindingsCountText(warnedFindings)}`;
    if (await page.getByRole('region', { name, exact: true }).count() !== 1) fail(screen.id, 'READS', `no region named "${name}"`);
    if (await warned.getByRole('heading', { level: 3, name, exact: true }).count() !== 1) fail(screen.id, 'READS', 'the region has no level-3 heading with its count');
    const warnedToggle = warned.getByRole('button');
    if (await warnedToggle.getAttribute('aria-expanded') !== 'true') fail(screen.id, 'SEES', 'a question with a warning does not show it from the start');
    const warnedItems = await warned.getByRole('listitem').allTextContents();
    observed.warnedItems = warnedItems.length;
    if (JSON.stringify(warnedItems.map((text) => text.replace(/\s+/g, ' ').trim())) !== JSON.stringify(itemsOf(warnedFindings).map((text) => text.replace(/\s+/g, ' ').trim()))) {
      fail(screen.id, 'SEES', `Question ${WARNED.number} does not list Pre-Flight's findings in full: ${JSON.stringify(warnedItems).slice(0, 200)}`);
    }
    const controlsAbove = await card(page, WARNED.number).getByRole('button', { name: 'Duplicate', exact: true }).boundingBox();
    const regionBox = await warned.boundingBox();
    if (!controlsAbove || !regionBox || regionBox.y < controlsAbove.y + controlsAbove.height - 1) fail(screen.id, 'SEES', 'the findings are not under the question\'s controls');
    if ((await warnedToggle.boundingBox())?.height < MIN_TAP) fail(screen.id, 'TAP', 'Show / Hide is under 44px tall');

    /* KEYS: the noted question, its notes behind Show. */
    const notedFindings = expected.byQuestionId.get(NOTED.id);
    const noted = regionOf(page, NOTED.number);
    await noted.scrollIntoViewIfNeeded();
    const notedName = `Pre-Flight for Question ${NOTED.number}: ${preflightFindingsCountText(notedFindings)}`;
    observed.notedHeading = notedName;
    if (await noted.getByRole('heading', { level: 3, name: notedName, exact: true }).count() !== 1) fail(screen.id, 'READS', `Question ${NOTED.number}'s heading does not read "${notedName}" (${await textOf(noted.getByRole('heading', { level: 3 }))})`);
    if (await page.getByRole('region', { name: notedName, exact: true }).count() !== 1) fail(screen.id, 'READS', `no region named "${notedName}"`);
    // Drawn without the question's number, which the card already shows.
    const drawn = await noted.getByRole('heading', { level: 3 }).evaluate((node) => {
      const copy = node.cloneNode(true);
      copy.querySelectorAll('.mm-visually-hidden').forEach((hidden) => hidden.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    });
    if (drawn !== `Pre-Flight: ${preflightFindingsCountText(notedFindings)}`) fail(screen.id, 'SEES', `the heading is drawn as "${drawn}"`);
    const notedToggle = noted.getByRole('button');
    if (await notedToggle.getAttribute('aria-expanded') !== 'false' || await noted.getByRole('listitem').count() !== 0) fail(screen.id, 'SEES', 'notes alone are not kept behind Show');
    if (screen.interact) {
      await notedToggle.focus();
      await page.keyboard.press('Enter');
    } else {
      await notedToggle.click();
    }
    if (await notedToggle.getAttribute('aria-expanded') !== 'true') fail(screen.id, 'KEYS', 'Show did not open the notes');
    const notedItems = (await noted.getByRole('listitem').allTextContents()).map((text) => text.replace(/\s+/g, ' ').trim());
    if (JSON.stringify(notedItems) !== JSON.stringify(itemsOf(notedFindings).map((text) => text.replace(/\s+/g, ' ').trim()))) fail(screen.id, 'SEES', `Question ${NOTED.number}'s notes are not Pre-Flight's: ${JSON.stringify(notedItems).slice(0, 200)}`);
    if (!notedItems[0]?.includes('says "Use the prices you found"')) fail(screen.id, 'SEES', 'the question\'s own note does not come first');
    // The lesson's question-version notes that name no question ("12
    // questions generate a different version …", "DOL Recovery ready: …")
    // are the whole assignment's, above the cards; with none it has no region.
    const whole = page.locator('[data-preflight-findings="the whole assignment"]');
    const wholeName = `Pre-Flight for the whole assignment: ${preflightFindingsCountText(expected.assignment)}`;
    if (itemsOf(expected.assignment).length === 0 ? await whole.count() !== 0 : await whole.getByRole('heading', { level: 3, name: wholeName, exact: true }).count() !== 1) fail(screen.id, 'SEES', `the whole assignment's region does not match its findings ("${wholeName}")`);
    observed.wholeAssignmentNotes = expected.assignment.notes.length;
    await screenshotKeepingTouch(noted, { path: path.join(ARTIFACTS, `${screen.id}-note.png`) }).catch(() => {});
    await warned.scrollIntoViewIfNeeded();
    await screenshotKeepingTouch(card(page, WARNED.number), { path: path.join(ARTIFACTS, `${screen.id}-warning.png`) }).catch(() => {});

    /* FITS */
    observed.fits = await fits(page, screen);

    if (screen.interact) {
      /* SEES: a warning an edit brings to a question whose notes wait behind
         Show opens the list; focus stays in the box typed in. */
      if (await notedToggle.getAttribute('aria-expanded') === 'true') await notedToggle.click();
      const notedWeight = card(page, NOTED.number).getByRole('spinbutton', { name: `Grade weight for Question ${NOTED.number}` });
      await notedWeight.scrollIntoViewIfNeeded();
      await notedWeight.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('15', { delay: 80 });
      await page.locator('[data-preflight-findings-state="checking"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
      await settled(page);
      const risen = {
        expanded: await notedToggle.getAttribute('aria-expanded'),
        first: norm(await noted.getByRole('listitem').first().textContent({ timeout: 2000 }).catch(() => '')),
        focus: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      };
      observed.warningArrived = risen.expanded;
      if (risen.expanded !== 'true' || !new RegExp(`^Warning: Question ${NOTED.number} \\(Classwork Q18\\) counts ×15, but the work it assesses`).test(risen.first)) fail(screen.id, 'SEES', `a warning an edit brought stayed behind Show (${JSON.stringify(risen).slice(0, 200)})`);
      if (risen.focus !== `Grade weight for Question ${NOTED.number}`) fail(screen.id, 'QUIET', `focus left the grade weight when the warning came (${risen.focus})`);

      /* QUIET: a grade weight typed under the findings. */
      const weight = card(page, WARNED.number).getByRole('spinbutton', { name: `Grade weight for Question ${WARNED.number}` });
      await weight.scrollIntoViewIfNeeded();
      const before = await weight.boundingBox();
      await weight.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('3', { delay: 120 });
      await page.keyboard.press('ArrowUp');
      await page.locator('[data-preflight-findings-state="checking"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
      await settled(page);
      const focusedName = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName);
      if (focusedName !== `Grade weight for Question ${WARNED.number}`) fail(screen.id, 'QUIET', `focus left the grade weight (${focusedName})`);
      const after = await weight.boundingBox();
      if (!before || !after || Math.abs(after.y - before.y) > 1 || Math.abs(after.x - before.x) > 1) fail(screen.id, 'QUIET', `the grade weight moved while Pre-Flight ran (${JSON.stringify(before)} -> ${JSON.stringify(after)})`);
      if (await page.locator('[role="dialog"] [role="alert"], [role="dialog"] [aria-live]').count()) fail(screen.id, 'QUIET', 'something in the editor announces itself');
      observed.weightAfterTyping = await weight.inputValue();
      // Exclude the cancelling question: once Pre-Flight runs again, its findings go.
      const cancelling = card(page, CANCELLING.number);
      await cancelling.getByRole('button', { name: 'Exclude', exact: true }).click();
      await page.locator('[data-preflight-findings-state="checking"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
      await settled(page);
      if (await regionOf(page, CANCELLING.number).count() !== 0) fail(screen.id, 'QUIET', 'an excluded question still shows findings');
      // Neither kind stops the save.
      await page.getByRole('button', { name: 'Save Assignment Questions', exact: true }).click();
      await page.waitForFunction(() => window.__SAVES__?.length === 1, null, { timeout: 8000 }).catch(() => fail(screen.id, 'QUIET', 'Save did not save an assignment Pre-Flight has warnings and notes about'));
    }
    await page.screenshot({ path: path.join(ARTIFACTS, `${screen.id}.png`) });
  } catch (error) {
    fail(screen.id, 'RUN', `could not be carried out: ${String(error?.message || error).split('\n')[0]}`);
  }
  errors.forEach((message) => fail(screen.id, 'ERROR', message));
  await context.close();
  return observed;
};

/* ------------------------------------------------- what an edit costs */

// Each keystroke's time from keydown to the frame after it, and the long tasks
// around it, on the large assignment, at full speed and with the CPU slowed.
const measureCost = async (cpuSlowdown) => {
  const screen = { id: `large-cpu-${cpuSlowdown}x`, width: 1440, height: 900 };
  const { context, page, cdp, errors } = await openEditor(screen, 'large');
  const observed = { screen: screen.id, questions: getStoredAssignmentQuestions(FIXTURES.large).length };
  try {
    if (cpuSlowdown > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
    observed.findingsRunMs = (await page.evaluate(() => window.__timeEditorPreflight(3))).map((ms) => Math.round(ms));
    await page.evaluate(() => {
      window.__keys = [];
      window.__longTasks = [];
      document.addEventListener('keydown', () => {
        const started = performance.now();
        requestAnimationFrame(() => setTimeout(() => window.__keys.push(performance.now() - started), 0));
      }, true);
      new PerformanceObserver((list) => list.getEntries().forEach((entry) => window.__longTasks.push({ start: entry.startTime, duration: entry.duration }))).observe({ type: 'longtask' });
    });
    const number = 40;
    const weight = card(page, number).getByRole('spinbutton', { name: `Grade weight for Question ${number}` });
    await weight.scrollIntoViewIfNeeded();
    await weight.click();
    await page.keyboard.press('Control+A');
    const typingStarted = await page.evaluate(() => performance.now());
    for (const key of ['3', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowUp']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    const typingEnded = await page.evaluate(() => performance.now());
    await page.locator('[data-preflight-findings-state="checking"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    await settled(page);
    await page.waitForTimeout(300);
    const { keys, longTasks } = await page.evaluate(() => ({ keys: window.__keys, longTasks: window.__longTasks }));
    const sorted = [...keys].sort((a, b) => a - b);
    observed.keystrokes = keys.length;
    observed.keystrokeMs = { median: Math.round(sorted[Math.floor(sorted.length / 2)]), max: Math.round(sorted[sorted.length - 1]) };
    observed.longTasksWhileTyping = longTasks.filter((task) => task.start >= typingStarted && task.start < typingEnded).map((task) => Math.round(task.duration));
    observed.longTasksAfterPause = longTasks.filter((task) => task.start >= typingEnded).map((task) => Math.round(task.duration));
    observed.weight = await weight.inputValue();
    if (observed.keystrokes < 8) fail(screen.id, 'COST', `only ${observed.keystrokes} keystrokes were timed`);
    // The run after the pause is the worker's: the page only hands it the
    // questions and draws what changed. A task half as long as a run (timed in
    // this page, the first left out as its warm-up) is the run on the page's thread.
    const run = Math.min(...observed.findingsRunMs.slice(1));
    const blocking = observed.longTasksAfterPause.filter((ms) => ms >= Math.max(100, run / 2));
    if (blocking.length) fail(screen.id, 'COST', `the page was busy ${blocking.join(', ')} ms after the pause (a run takes ${run} ms here): Pre-Flight ran on the page's thread`);
  } catch (error) {
    fail(screen.id, 'RUN', `could not be carried out: ${String(error?.message || error).split('\n')[0]}`);
  }
  errors.forEach((message) => fail(screen.id, 'ERROR', message));
  await context.close();
  return observed;
};

/* ------------------------------------------------ the dialog's opener */

// src/ui/disabledOpener.js: a control that lost focus because it was disabled
// is held for the 4 s a dialog may borrow it, and then let go, so a closed
// lesson's tree is not kept alive through it.
const disabledOpenerLetGo = async () => {
  const screen = { id: 'dialog-opener', width: 1440, height: 900 };
  const { context, page, cdp, errors } = await openEditor(screen, 'flagged');
  const observed = { screen: screen.id };
  try {
    await cdp.send('HeapProfiler.enable');
    await page.evaluate(async () => {
      const button = document.createElement('button');
      button.textContent = 'Opener probe';
      // Inside the editor's dialog: its focus trap pulls focus back from anywhere else.
      document.querySelector('[role="dialog"]').append(button);
      button.focus();
      button.disabled = true;
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)));
      window.__lostFocus = document.activeElement !== button;
      button.remove();
      window.__opener = new WeakRef(button);
    });
    await cdp.send('HeapProfiler.collectGarbage');
    observed.lostFocusWhenDisabled = await page.evaluate(() => window.__lostFocus);
    observed.heldWithin4s = await page.evaluate(() => Boolean(window.__opener.deref()));
    await page.waitForTimeout(4300);
    await cdp.send('HeapProfiler.collectGarbage');
    observed.heldAfter4s = await page.evaluate(() => Boolean(window.__opener.deref()));
    if (!observed.lostFocusWhenDisabled || !observed.heldWithin4s) fail(screen.id, 'OPENER', `the probe never became the remembered opener (${JSON.stringify(observed)})`);
    if (observed.heldAfter4s) fail(screen.id, 'OPENER', 'a disabled control is still held 4 s after it lost focus');
  } catch (error) {
    fail(screen.id, 'RUN', `could not be carried out: ${String(error?.message || error).split('\n')[0]}`);
  }
  errors.forEach((message) => fail(screen.id, 'ERROR', message));
  await context.close();
  return observed;
};

const only = (process.env.ONLY || '').split(',').map((value) => value.trim()).filter(Boolean);
const wanted = (name) => !only.length || only.some((prefix) => name.startsWith(prefix));
try {
  for (const screen of SCREENS) if (wanted(screen.id)) measurements.push(await certify(screen));
  if (wanted('large')) {
    measurements.push(await measureCost(1));
    measurements.push(await measureCost(4));
  }
  if (wanted('dialog-opener')) measurements.push(await disabledOpenerLetGo());
} finally {
  await browser.close();
}

writeFileSync(path.join(ARTIFACTS, 'report.json'), `${JSON.stringify({ findings, measurements }, null, 2)}\n`);
measurements.forEach((row) => console.log(JSON.stringify(row)));
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.screen}] ${finding.rule}: ${finding.detail}`));
  process.exitCode = 1;
} else {
  console.log(`\nQuestion Editor Pre-Flight: ${measurements.length} screens and measurements, no findings.`);
}

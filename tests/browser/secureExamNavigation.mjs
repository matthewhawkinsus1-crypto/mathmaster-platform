// Drive a secure test the way a student moves through it — in a real browser,
// at Chromebook (1366×768) and phone (390×844) sizes.
//
// HOW TO RUN (it starts its own Vite unless SECURE_NAV_ORIGIN points at one):
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tests/browser/secureExamNavigation.mjs
//   SECURE_NAV_SHOTS=/some/dir …        # where screenshots go
//   SECURE_NAV_ORIGIN=http://localhost:5241 …   # reuse a running harness server
//   SECURE_NAV_JOURNEYS=backtrack,practice …     # run only these journeys
//
// WHAT IS REAL. The student's Tests & Exams list, the secure container, its
// header, question list, review screen and pause screens, RichQuestionRuntime
// and QuestionEngine with a real registry tool — the production components —
// against src/services/secureExamService.js in its MOCK_LOCAL sandbox, which
// plays the navigation contract (see that file's header). Nothing reaches a
// network: firebase.js is the emulator module and every non-local request is
// aborted.
//
// WHAT IT CHECKS, as a student would notice it:
//   - the start screen states the new rules (move, skip, mark, change until
//     Submit) and none of the old ones ("one attempt", "cannot go back") or
//     the jargon ("monitored web delivery");
//   - "Question N of M" follows the question on screen, not a count;
//   - Next skips ahead, Previous goes back, and a typed answer is still there;
//   - "Back to questions" from the review (and from the module review) shows
//     the answer as the student left it — a choice, a typed answer, and a
//     two-part answer whose untouched part survives a later change, all the
//     way to the record the teacher releases;
//   - mark for review shows in the header and the question list;
//   - the question list opens from the header, fits a phone, and shows
//     answered / no answer / marked / not opened / current;
//   - a Digital SAT practice test reviews module 1 before module 2 opens, and
//     module 1 is closed after that;
//   - the review before Submit lists blank and marked questions and says blank
//     ones count as zero; a practice test's results open from the finished
//     screen;
//   - a Rich Tool's final action reads "Save answer", saves a draft, shows no
//     verdict and leaves the tool open;
//   - a teacher pause mid-move shows the pause, never a question that will not
//     load — above an enlarged question too — and resuming reopens the SAME
//     question;
//   - an answer the older one-way runtime locked says so, and Next moves on;
//   - the second time the student leaves the window they are warned (naming
//     copy, paste and right-click too), with a way back to full screen; the
//     third time pauses the test with its own words; time running out ends the
//     test as timed out;
//   - a teacher's pause reaches a student who is only reading; the pause takes
//     focus and nothing typed reaches the answer under it; afterwards focus is
//     back where the student was;
//   - the question list keeps keyboard focus, and Tab never walks off the page
//     (which the integrity logger would count as leaving the test);
//   - the start screen states the student's own time — extended time before
//     Start, even from a card that does not know it, and the time LEFT when
//     they come back to a test whose clock kept running;
//   - the finished and pause titles do not overlap when they wrap on a phone,
//     and are readable on their backgrounds, in the light and the dark theme;
//   - nothing says right, wrong or correct while any question can be answered;
//   - no sideways scroll, and every control in these screens at least 44px.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PORT = Number(process.env.SECURE_NAV_PORT || 5243);
const ORIGIN = process.env.SECURE_NAV_ORIGIN || `http://localhost:${PORT}`;
const SHOTS = process.env.SECURE_NAV_SHOTS || '/tmp/claude-0/shots-a1';
mkdirSync(SHOTS, { recursive: true });

const DEVICES = [
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
  { id: 'phone', width: 390, height: 844, mobile: true },
];
const MIN_TAP = 44;
// Words that would tell a student whether an answer is right. None may appear
// while any question can still be answered.
const VERDICT = /\b(correct|incorrect|not quite|wrong|right answer|answer key|solution)\b/i;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const findings = [];
const passes = [];
const check = (ok, label, detail = '') => {
  (ok ? passes : findings).push(detail ? `${label} — ${detail}` : label);
  log(ok ? 'PASS' : 'FAIL', label, detail);
};

let server = null;
if (!process.env.SECURE_NAV_ORIGIN) {
  server = spawn('npx', ['vite', '--config', 'tests/browser/secureExamNavigation.vite.config.mjs', '--port', String(PORT), '--strictPort'], {
    cwd: repo,
    env: { ...process.env, VITE_MATHMASTER_EXECUTION_MODE: 'mockLocal' },
    stdio: 'ignore',
    detached: true,
  });
  process.on('exit', () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(ORIGIN)).status < 500) break; } catch { /* not up yet */ }
    await wait(500);
  }
}

const browser = await chromium.launch();
let blockedRequests = 0;
let coldServer = true;

const layout = async (page, label) => {
  const result = await page.evaluate((minTap) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    // Only the controls this package owns: the header, the move bar, the
    // question list, the review screen, the pause and warning, the start and
    // finished screens. (The question's own tool has its own certification.)
    const scopes = ['[data-secure-exam-header]', 'nav[aria-label="Move between questions"]', '[data-secure-navigator]', '[data-secure-review]', '[data-secure-integrity-warning]', '[data-secure-finished]', '[data-secure-start-rules]'];
    const controls = scopes.flatMap((selector) => [...document.querySelectorAll(`${selector} button, ${selector} ~ button`)])
      .filter((element, index, all) => all.indexOf(element) === index && visible(element) && !element.disabled);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      small: controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent || '').trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) };
      }).filter((entry) => Math.min(entry.width, entry.height) < minTap),
    };
  }, MIN_TAP);
  check(result.scrollWidth <= result.clientWidth, `${label}: no sideways scroll`, `${result.scrollWidth} vs ${result.clientWidth}`);
  check(result.small.length === 0, `${label}: controls at least ${MIN_TAP}px`, result.small.map((entry) => `${entry.text} ${entry.width}x${entry.height}`).join(', '));
};

const shot = async (page, device, name) => {
  await page.screenshot({ path: path.join(SHOTS, `${device.id}-${name}.png`), fullPage: true });
};
const bodyText = (page) => page.evaluate(() => document.body.innerText || '');
const headerPosition = async (page) => (await page.locator('[data-secure-navigator-toggle]').textContent()).replace('▾', '').trim();
const noVerdict = async (page, label) => {
  const text = await bodyText(page);
  const match = text.match(VERDICT);
  check(!match, `${label}: nothing says right or wrong`, match ? `found "${match[0]}"` : '');
};
const waitSaved = (page) => page.waitForSelector('[data-secure-save-state="saved"]', { timeout: 8000 });
const next = (page) => page.locator('[data-secure-nav="next"]').click();
const previous = (page) => page.locator('[data-secure-nav="previous"]').click();
const atQuestion = (page, text) => page.waitForFunction((expected) => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes(expected), text);
// A title that wraps must not overlap itself: line height at least its font size.
// …and readable: at least 4.5:1 against the first solid background behind it.
const titleFits = async (page, selector, label) => {
  const metrics = await page.evaluate((sel) => {
    const title = document.querySelector(sel);
    if (!title) return null;
    const style = getComputedStyle(title);
    const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = ([r, g, b]) => [r, g, b].map((channel) => channel / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
    let backdrop = title.parentElement;
    while (backdrop && !((rgb(getComputedStyle(backdrop).backgroundColor)[3] ?? 1) > 0.5 && getComputedStyle(backdrop).backgroundColor !== 'rgba(0, 0, 0, 0)')) backdrop = backdrop.parentElement;
    const [high, low] = [luminance(rgb(style.color)), luminance(rgb(backdrop ? getComputedStyle(backdrop).backgroundColor : 'rgb(255, 255, 255)'))].sort((a, b) => b - a);
    return {
      fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), height: Math.round(title.getBoundingClientRect().height),
      contrast: Math.round(((high + 0.05) / (low + 0.05)) * 10) / 10,
    };
  }, selector);
  check(Boolean(metrics) && metrics.lineHeight >= metrics.fontSize * 1.1, `${label}: title lines do not overlap`, JSON.stringify(metrics));
  check(Boolean(metrics) && metrics.contrast >= 4.5, `${label}: title is readable`, JSON.stringify(metrics));
};
// Where keyboard focus is: inside `selector`, or (no selector) anywhere in the page but a focus guard.
const focusIn = (page, selector = null) => page.evaluate((sel) => {
  const element = document.activeElement;
  if (!element || element === document.body || element.hasAttribute('data-secure-focus-guard')) return false;
  return sel ? Boolean(element.closest(sel)) : document.hasFocus();
}, selector);
const violations = async (page) => (await page.evaluate(() => window.__secureHarness.session()))?.violationCount ?? null;

/*
 * A TYPED ANSWER, as the student meets it: the math editor (MathLive's
 * math-field) for a number, set or interval field, a text box otherwise
 * (SecureMathAnswerField / secureAnswerEntry.js). `legend` picks the field of
 * a multi-part item by its label. Typing is real keystrokes into the field.
 */
const typedAnswer = (page, legend = null) => {
  const scope = legend ? page.locator('main fieldset', { has: page.locator('legend', { hasText: legend }) }) : page.locator('main');
  const box = scope.locator('[data-secure-answer-editor]').first();
  const isText = () => box.evaluate((element) => element.tagName === 'INPUT');
  return {
    count: () => scope.locator('[data-secure-answer-editor]').count(),
    isVisible: () => box.isVisible(),
    inputValue: () => box.evaluate((element) => (element.tagName === 'INPUT' ? element.value : element.querySelector('math-field')?.value ?? '')),
    focus: async () => { if (await isText()) await box.focus(); else await box.locator('math-field').focus(); },
    fill: async (value) => {
      if (await isText()) { await box.fill(value); return; }
      const field = box.locator('math-field');
      await field.focus();
      await field.evaluate((element) => element.executeCommand?.('selectAll'));
      await page.keyboard.type(value);
    },
  };
};

const openPage = async (context, scenario, device, query = '') => {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${ORIGIN}/tests/browser/secureExamNavigation.html?scenario=${scenario}${query}`, { waitUntil: 'load', timeout: coldServer ? 180000 : 30000 });
  coldServer = false;
  await page.waitForFunction(() => window.__secureHarness?.ready === true || window.__secureHarness?.error, null, { timeout: 60000 });
  const harnessError = await page.evaluate(() => window.__secureHarness?.error || null);
  check(!harnessError, `${device.id} ${scenario}: harness mounted`, harnessError || '');
  check(await page.evaluate(() => window.__secureHarness.mode) === 'mockLocal', `${device.id} ${scenario}: sandbox mode`);
  return { page, errors };
};

/* ------------------------------ practice test ----------------------------- */

const practiceJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'practice', device);
  const label = (name) => `${device.id} practice ${name}`;
  await page.waitForSelector('[data-secure-status-label]');
  let text = await bodyText(page);
  check(/Not started/.test(text) && /Results are ready right after you submit\./.test(text), label('list says Not started and when results come'));
  check(!/not_started|in_progress|locked_/.test(text), label('list shows no raw status'));
  await shot(page, device, 'practice-01-list');
  await layout(page, label('list'));

  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForSelector('[data-secure-start-rules]');
  text = await bodyText(page);
  check(/skip a question/.test(text) && /change any answer until you submit/.test(text) && /2 modules/.test(text), label('start screen states the new rules'));
  check(!/one attempt per question|cannot go back|monitored web delivery|lockdown/i.test(text), label('start screen has none of the old rules or jargon'));
  await shot(page, device, 'practice-02-start');
  await layout(page, label('start'));

  await page.getByRole('button', { name: 'Start test' }).click();
  await page.waitForSelector('[data-secure-navigator-toggle]');
  check(await headerPosition(page) === 'Question 1 of 4', label('header shows question 1 of 4'), await headerPosition(page));
  // A Digital SAT practice test carries its real tools in the toolbar: the
  // reference sheet the header used to only mention, and a graphing calculator.
  const toolbar = page.locator('[data-secure-exam-header]');
  const sheetButton = toolbar.getByRole('button', { name: /Reference sheet/ });
  const graphButton = toolbar.getByRole('button', { name: /Graphing calculator/ });
  check(await sheetButton.isVisible() && await graphButton.isVisible(), label('toolbar has the reference sheet and the graphing calculator'));
  await sheetButton.click();
  const sheet = page.locator('[role="dialog"]').filter({ hasText: /degrees of arc in a circle is 360/ });
  const sheetShown = await sheet.first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  check(sheetShown && !(await sheet.first().getAttribute('aria-modal') === 'true'), label('the reference sheet opens beside the question, not as a modal'));
  const clearOfToolbar = await page.evaluate(() => {
    const toolbar = document.querySelector('[data-secure-exam-header]').getBoundingClientRect();
    const drawer = [...document.querySelectorAll('[role="dialog"]')].find((element) => /degrees of arc/.test(element.textContent)).getBoundingClientRect();
    return { toolbarBottom: Math.round(toolbar.bottom), drawerTop: Math.round(drawer.top) };
  });
  check(clearOfToolbar.drawerTop >= clearOfToolbar.toolbarBottom - 1, label('the open sheet leaves the timer and tool buttons uncovered'), JSON.stringify(clearOfToolbar));
  await shot(page, device, 'practice-03a-reference-sheet');
  await sheetButton.click();
  await graphButton.click();
  const graph = page.locator('[role="dialog"]').filter({ has: page.getByRole('button', { name: 'Close graphing calculator' }) });
  check(await graph.first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false), label('the graphing calculator opens'));
  await shot(page, device, 'practice-03a-graphing-calculator');
  await page.getByRole('button', { name: 'Close graphing calculator' }).click();
  text = await bodyText(page);
  check(!/Record answer|Answer to continue/.test(text), label('no per-question record button'));
  check(await page.locator('[data-secure-nav="previous"]').isDisabled(), label('Previous is off on question 1'));
  await shot(page, device, 'practice-03-question1');
  await layout(page, label('question 1'));

  // Answer question 1 (typed or chosen, whichever it is).
  const answerCurrent = async () => {
    const radios = page.getByRole('radio');
    if (await radios.count()) await radios.nth(1).check();
    else await typedAnswer(page).fill('3');
    await waitSaved(page);
  };
  await answerCurrent();
  const readAnswer = async () => (await typedAnswer(page).count()
    ? typedAnswer(page).inputValue()
    : page.getByRole('radio').nth(1).isChecked());
  const q1Value = await readAnswer();
  await noVerdict(page, label('question 1 answered'));

  // Review, then back: the question comes back with its answer, not blank.
  await page.locator('[data-secure-nav="review"]').click();
  await page.waitForSelector('[data-secure-review="submit"]');
  await page.getByRole('button', { name: 'Back to questions' }).click();
  await atQuestion(page, 'Question 1 of 4');
  const backValue = await readAnswer();
  check(backValue === q1Value && backValue !== false && backValue !== '', label('Back to questions keeps question 1\'s answer'), `${backValue}`);
  await shot(page, device, 'practice-03b-back-from-review');

  await next(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 2 of 4'));
  check(true, label('Next opens question 2'));
  // Mark question 2 for review and leave it blank.
  await page.getByRole('button', { name: /Mark for review/ }).click();
  await page.waitForSelector('button[aria-pressed="true"]');
  check(/Marked for review/.test(await page.locator('[data-secure-exam-header]').innerText()), label('header shows the mark'));
  await shot(page, device, 'practice-04-question2-marked');

  await previous(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 1 of 4'));
  const restored = await typedAnswer(page).count()
    ? await typedAnswer(page).inputValue()
    : await page.getByRole('radio').nth(1).isChecked();
  check(restored === q1Value, label('Previous returns to question 1 with its answer'), `${restored}`);

  // The question list, from the header.
  await page.locator('[data-secure-navigator-toggle]').click();
  await page.waitForSelector('[data-secure-navigator]');
  const cells = await page.evaluate(() => [...document.querySelectorAll('[data-secure-navigator] [data-question-status]')].map((cell) => ({
    status: cell.getAttribute('data-question-status'), flagged: cell.getAttribute('data-question-flagged') === 'true', disabled: cell.disabled,
    current: cell.getAttribute('aria-current') === 'step', label: cell.getAttribute('aria-label'),
  })));
  check(cells.length === 4, label('list has 4 squares'));
  check(cells[0]?.status === 'answered' && cells[0]?.current, label('square 1: answered, current'), JSON.stringify(cells[0]));
  check(cells[1]?.status === 'unanswered' && cells[1]?.flagged, label('square 2: no answer, marked'), JSON.stringify(cells[1]));
  check(cells[2]?.status === 'notOpened' && !cells[2]?.disabled, label('square 3: not opened, reachable (module 2 start)'), JSON.stringify(cells[2]));
  check(cells[3]?.status === 'notOpened' && cells[3]?.disabled, label('square 4: not opened, out of reach'), JSON.stringify(cells[3]));
  await noVerdict(page, label('question list'));
  await shot(page, device, 'practice-05-question-list');
  await layout(page, label('question list'));

  // Square 3 starts module 2: the module review comes first.
  await page.locator('[data-secure-navigator] [data-question-status]').nth(2).click();
  await page.waitForSelector('[data-secure-review="moduleEnd"]');
  text = await bodyText(page);
  check(/End of module 1/.test(text) && /won't be able to return to module 1/.test(text), label('module review warns before leaving module 1'));
  check(/Question 2/.test(text) && /marked for review/.test(text) && /no answer yet/.test(text), label('module review lists question 2'));
  check(/count as zero/.test(text), label('module review says blanks count as zero'));
  await shot(page, device, 'practice-06-module-end');
  await layout(page, label('module review'));

  // Go back from the review, answer question 2, then continue into module 2.
  await page.getByRole('button', { name: /Go to question 2: no answer yet/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 2 of 4'));
  await answerCurrent();
  const q2Value = await readAnswer();
  await next(page);
  await page.waitForSelector('[data-secure-review="moduleEnd"]');
  // Back from the module review: question 2 keeps the answer just given.
  await page.getByRole('button', { name: 'Back to questions' }).click();
  await atQuestion(page, 'Question 2 of 4');
  const q2Back = await readAnswer();
  check(q2Back === q2Value && q2Back !== false && q2Back !== '', label('Back from the module review keeps question 2\'s answer'), `${q2Back}`);
  await next(page);
  await page.waitForSelector('[data-secure-review="moduleEnd"]');
  await page.getByRole('button', { name: 'Start module 2' }).click();
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 3 of 4'));
  check(await page.locator('[data-secure-nav="previous"]').isDisabled(), label('module 1 is closed: Previous is off on question 3'));
  await page.locator('[data-secure-navigator-toggle]').click();
  await page.waitForSelector('[data-secure-navigator]');
  const closed = await page.evaluate(() => [...document.querySelectorAll('[data-secure-navigator] [data-question-status]')].slice(0, 2).every((cell) => cell.disabled));
  check(closed && /Module 1 — finished/.test(await page.locator('[data-secure-navigator]').innerText()), label('list shows module 1 finished and closed'));
  await shot(page, device, 'practice-07-module2-list');
  await page.getByRole('button', { name: 'Close' }).click();

  // Skip question 3; question 4's Next is the review.
  await next(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 4 of 4'));
  check(/Review answers/.test(await page.locator('[data-secure-nav="next"]').innerText()), label('the last question leads to the review'));
  await next(page);
  await page.waitForSelector('[data-secure-review="submit"]');
  text = await bodyText(page);
  check(/You answered 2 of 4 questions/.test(text), label('review counts answered of total'), text.match(/You answered[^.]*\./)?.[0] || '');
  check(/2 questions have no answer\. Questions left blank count as zero\./.test(text), label('review warns blanks count as zero'));
  check(/Module 1 is finished/.test(text), label('review explains module 1 is closed'));
  await noVerdict(page, label('review'));
  await shot(page, device, 'practice-08-review');
  await layout(page, label('review'));

  await page.getByRole('button', { name: 'Submit practice test' }).click();
  await page.waitForSelector('[data-secure-finished]');
  text = await bodyText(page);
  check(/Practice test submitted/.test(text) && /Your results are ready\./.test(text), label('finished screen: results ready'));
  await titleFits(page, '[data-secure-finished] h1', label('finished screen'));
  await shot(page, device, 'practice-09-finished');
  await layout(page, label('finished'));
  await page.getByRole('button', { name: 'See your results' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-secure-finished]') && /released|results|score/i.test(document.body.innerText));
  check(true, label('See your results opens the released review'));
  await shot(page, device, 'practice-10-results');
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

/* ------------------------------- course test ------------------------------ */

const courseJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'course', device);
  const label = (name) => `${device.id} course ${name}`;
  await page.waitForSelector('[data-secure-start-rules]');
  let text = await bodyText(page);
  check(/You have 45 minutes, starting when you press Start\. The timer stays on screen\. This includes your extended time\./.test(text) && /There is no calculator/.test(text) && /Questions left blank count as zero/.test(text), label('start screen: extended time before Start, calculator, blanks'));
  await shot(page, device, 'course-01-start');

  await page.getByRole('button', { name: 'Start Test' }).click();
  await page.waitForSelector('[data-secure-navigator-toggle]');
  const header = await page.locator('[data-secure-exam-header]').innerText();
  check(/4[45]:\d\d/.test(header) && /Includes your extended time/.test(header), label('timer shows 45 minutes with extended time'), header.replace(/\s+/g, ' '));
  await page.getByRole('radio').nth(2).check();
  await waitSaved(page);
  await next(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 2 of 5'));

  // The Rich Tool item: its final action saves a draft and judges nothing.
  await page.getByText('Write it in notation').waitFor({ timeout: 20000 });
  text = await bodyText(page);
  check(/Save answer/.test(text) && !/Record answer/.test(text), label('the tool\'s final action is "Save answer"'));
  const endpoint = page.getByPlaceholder('Exact endpoint, e.g. -13/8');
  await endpoint.fill('-3');
  await page.getByRole('button', { name: 'Place endpoint' }).click();
  await page.getByRole('button', { name: /Open/ }).first().click();
  await endpoint.fill('5');
  await page.getByRole('button', { name: 'Place endpoint' }).click();
  const notation = page.locator('math-field').first();
  await notation.click();
  await page.keyboard.type('[-3,5)');
  const save = page.locator('[data-rich-question-runtime] button', { hasText: 'Save answer' }).first();
  const saveEnabled = await save.isEnabled();
  check(saveEnabled, label('Save answer is available once there is work'));
  if (saveEnabled) await save.click();
  await page.waitForSelector('[data-secure-save-state="saved"]', { timeout: 8000 });
  await wait(500);
  await noVerdict(page, label('after Save answer'));
  check(!/Recording|Response submitted|Feedback opens later|Question complete/.test(await bodyText(page)), label('Save answer records nothing'));
  check(await page.getByRole('button', { name: 'Place endpoint' }).isEnabled(), label('the tool stays open after Save answer'));
  await shot(page, device, 'course-02-tool-saved');
  await layout(page, label('tool item'));
  const toolValue = () => page.locator('math-field').first().evaluate((element) => element.value);

  // A pause must cover an enlarged question too (Work View is a fixed layer
  // above the page): typing there autosaves, the save is refused as paused,
  // and the pause screen is what the student sees.
  const enlarge = page.getByRole('button', { name: /Enlarge question/ });
  if (await enlarge.count()) {
    await enlarge.first().click();
    await page.waitForSelector('.mathmaster-work-view-host[data-open="true"]', { timeout: 8000 });
    await page.evaluate(() => window.__secureHarness.proctor('lock'));
    await page.getByPlaceholder('Exact endpoint, e.g. -13/8').fill('1');
    await page.waitForSelector('[data-secure-pause="teacher"]', { timeout: 8000 });
    const onTop = await page.evaluate(() => {
      const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return Boolean(hit && hit.closest('[data-secure-pause]'));
    });
    check(onTop, label('the pause covers an enlarged question'));
    await page.screenshot({ path: path.join(SHOTS, `${device.id}-course-03a-pause-over-work-view.png`) });
    await page.evaluate(() => window.__secureHarness.proctor('unlock'));
    await page.waitForSelector('[data-secure-pause]', { state: 'detached', timeout: 12000 });
    await page.keyboard.press('Escape').catch(() => {});
    const close = page.getByRole('button', { name: /Close/ });
    if (await page.locator('.mathmaster-work-view-host[data-open="true"]').count() && await close.count()) await close.first().click();
    await page.waitForSelector('.mathmaster-work-view-host[data-open="true"]', { state: 'detached', timeout: 8000 }).catch(() => {});
    await page.getByPlaceholder('Exact endpoint, e.g. -13/8').fill('');
  }

  // A teacher pause that lands on a move: the pause shows, not a dead question.
  await page.evaluate(() => window.__secureHarness.proctor('lock'));
  await next(page);
  await page.waitForSelector('[data-secure-pause="teacher"]', { timeout: 8000 });
  text = await bodyText(page);
  check(/Your teacher paused the test/.test(text) && /Your answers are saved\. Wait here/.test(text), label('teacher pause has its own words'));
  check(!/Preparing the next secure item/.test(text), label('a pause never strands the student on "Preparing…"'));
  check(await focusIn(page, '[data-secure-pause]'), label('the pause screen takes focus'));
  await titleFits(page, '[data-secure-pause] h1', label('teacher pause'));
  await shot(page, device, 'course-03-teacher-pause');
  await page.evaluate(() => window.__secureHarness.proctor('unlock'));
  await page.waitForSelector('[data-secure-pause]', { state: 'detached', timeout: 12000 });
  await page.getByText('Write it in notation').waitFor({ timeout: 12000 });
  check(await headerPosition(page) === 'Question 2 of 5', label('resume reopens the same question'), await headerPosition(page));
  check(await toolValue() === '[-3,5)', label('the saved work is still there after the pause'), await toolValue());

  // Leaving the window: warned on the second time, paused on the third. The
  // first is leaving full screen (Start entered it), the second a lost focus.
  const startedFullscreen = await page.evaluate(() => Boolean(document.fullscreenElement));
  if (startedFullscreen) await page.evaluate(() => document.exitFullscreen());
  else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(900);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForSelector('[data-secure-integrity-warning]', { timeout: 8000 });
  text = await page.locator('[data-secure-integrity-warning]').innerText();
  check(/One more time leaving the test window, or trying to copy, paste or right-click, will pause the test for your teacher\./.test(text), label('second leave warns before the pause, naming everything that counts'));
  check(/Return to full screen/.test(text), label('the warning offers a way back to full screen'), `started in full screen: ${startedFullscreen}`);
  await shot(page, device, 'course-04-integrity-warning');
  await layout(page, label('integrity warning'));
  const back = page.getByRole('button', { name: 'Return to full screen' });
  if (await back.count()) {
    await back.click();
    await wait(600);
    const fullscreenNow = await page.evaluate(() => Boolean(document.fullscreenElement));
    check(fullscreenNow && !(await back.count()), label('Return to full screen goes back to full screen'), `fullscreen: ${fullscreenNow}`);
  }
  await wait(900);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForSelector('[data-secure-pause="integrity"]', { timeout: 8000 });
  text = await bodyText(page);
  check(/Your test is paused/.test(text) && /left the test window or tried to copy, paste or right-click 3 times in all/.test(text) && /Raise your hand/.test(text), label('integrity pause has its own words'));
  check(!/Your teacher paused the test/.test(text), label('an integrity pause is not called the teacher\'s'));
  await titleFits(page, '[data-secure-pause] h1', label('integrity pause'));
  await shot(page, device, 'course-05-integrity-pause');
  await page.evaluate(() => window.__secureHarness.proctor('unlock'));
  await page.waitForSelector('[data-secure-pause]', { state: 'detached', timeout: 12000 });
  await page.waitForSelector('[data-secure-navigator-toggle]');
  check(await headerPosition(page) === 'Question 2 of 5', label('integrity resume reopens the same question'));

  // Skip ahead, review and submit.
  await next(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 3 of 5'));
  await typedAnswer(page).fill('6');
  await waitSaved(page);
  await page.locator('[data-secure-nav="review"]').click();
  await page.waitForSelector('[data-secure-review="submit"]');
  text = await bodyText(page);
  check(/You answered 3 of 5 questions/.test(text), label('review counts the tool answer'), text.match(/You answered[^.]*\./)?.[0] || '');
  check(/not opened yet \(questions 4–5\)/.test(text), label('review lists the questions not opened yet'));
  await noVerdict(page, label('review'));
  await shot(page, device, 'course-06-review');
  await page.getByRole('button', { name: 'Submit test' }).click();
  await page.waitForSelector('[data-secure-finished]');
  text = await bodyText(page);
  check(/Test submitted/.test(text) && /teacher releases results/.test(text) && !/See your results/.test(text), label('course test finish: results held for the teacher'));
  await titleFits(page, '[data-secure-finished] h1', label('course finished screen'));
  await shot(page, device, 'course-07-finished');
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

/* --------------------------- time runs out ------------------------------ */

const timeoutJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'timeout', device);
  const label = (name) => `${device.id} timeout ${name}`;
  await page.getByRole('button', { name: 'Start Test' }).click();
  await page.waitForSelector('[data-secure-navigator-toggle]');
  await page.locator('main [data-secure-answer-editor], main input[type="radio"]').first().waitFor();
  await page.waitForSelector('[data-secure-finished="time_expired"]', { timeout: 20000 });
  const text = await bodyText(page);
  check(/Time is up/.test(text) && /turned in when time ran out/.test(text), label('the test ends as timed out'));
  await shot(page, device, 'timeout-01-finished');
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

/* ------------- back to questions, focus, reading while paused ------------- */

const backtrackJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'backtrack', device);
  const label = (name) => `${device.id} backtrack ${name}`;
  const slope = () => typedAnswer(page, 'Slope');
  const intercept = () => typedAnswer(page, 'Intercept');
  const regressionX = () => page.locator('input[aria-label="Regression row 1 x"]');
  const openRegression = async () => {
    if (!(await regressionX().isVisible())) await page.locator('summary', { hasText: 'Linear regression calculator' }).click();
  };
  const reviewAndBack = async (question) => {
    await page.locator('[data-secure-nav="review"]').click();
    await page.waitForSelector('[data-secure-review="submit"]');
    await page.getByRole('button', { name: 'Back to questions' }).click();
    await atQuestion(page, question);
  };

  // The card only knows the base 20 minutes; the screen finds the student's 30.
  await page.waitForSelector('[data-secure-start-rules]');
  const extendedOnStart = await page.waitForFunction(() => /You have 30 minutes, starting when you press Start\. The timer stays on screen\. This includes your extended time\./.test(document.body.innerText), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(extendedOnStart, label('start screen: the student\'s extended time, from a card that did not know it'));
  await shot(page, device, 'backtrack-01-start');
  await page.getByRole('button', { name: 'Start Test' }).click();
  await page.waitForSelector('[data-secure-navigator-toggle]');
  const header = await page.locator('[data-secure-exam-header]').innerText();
  check(/(30:00|29:\d\d)/.test(header) && /Includes your extended time/.test(header), label('the timer has the time the start screen promised'), header.replace(/\s+/g, ' '));

  // A choice.
  await page.getByRole('radio').nth(2).check();
  await waitSaved(page);
  await reviewAndBack('Question 1 of 3');
  check(await page.getByRole('radio').nth(2).isChecked(), label('Back to questions keeps a choice'));
  await shot(page, device, 'backtrack-02-choice-after-back');

  // A typed answer.
  await next(page);
  await atQuestion(page, 'Question 2 of 3');
  await typedAnswer(page).fill('6');
  await waitSaved(page);
  await reviewAndBack('Question 2 of 3');
  check(await typedAnswer(page).inputValue() === '6', label('Back to questions keeps a typed answer'));

  // Two parts and the regression calculator.
  await next(page);
  await atQuestion(page, 'Question 3 of 3');
  await slope().fill('4');
  await intercept().fill('3');
  await openRegression();
  await regressionX().fill('1');
  await waitSaved(page);
  await reviewAndBack('Question 3 of 3');
  await openRegression();
  const afterBack = [await slope().inputValue(), await intercept().inputValue(), await regressionX().inputValue()];
  check(afterBack.join('|') === '4|3|1', label('Back to questions keeps both parts and the calculator\'s data'), afterBack.join('|'));
  await shot(page, device, 'backtrack-03-two-part-after-back');
  // Change one part only; the other must survive on the server.
  await slope().fill('5');
  await waitSaved(page);
  await previous(page);
  await atQuestion(page, 'Question 2 of 3');
  await next(page);
  await atQuestion(page, 'Question 3 of 3');
  await openRegression();
  const fromServer = [await slope().inputValue(), await intercept().inputValue(), await regressionX().inputValue()];
  check(fromServer.join('|') === '5|3|1', label('changing one part keeps the other, reopened from the server'), fromServer.join('|'));

  // The question list is a panel on the page: it takes focus, the question it
  // was opened over stays as it was, and Tab never walks off the page.
  const before = await violations(page);
  await page.locator('[data-secure-navigator-toggle]').click();
  await page.waitForSelector('[data-secure-navigator]');
  check(await focusIn(page, '[data-secure-navigator]'), label('the question list takes focus when it opens'));
  const listShape = await page.evaluate(() => {
    const list = document.querySelector('[data-secure-navigator]');
    return {
      modal: Boolean(list.closest('[aria-modal="true"]')) || list.getAttribute('role') === 'dialog',
      inertBehind: Boolean(document.querySelector('[data-secure-exam-surface][inert]')),
      expanded: document.querySelector('[data-secure-navigator-toggle]')?.getAttribute('aria-expanded'),
      controls: document.querySelector('[data-secure-navigator-toggle]')?.getAttribute('aria-controls') === list.id,
    };
  });
  check(!listShape.modal && !listShape.inertBehind && listShape.expanded === 'true' && listShape.controls, label('the list is an expanded panel on the page, not a modal'), JSON.stringify(listShape));
  check(await slope().isVisible() && (await slope().inputValue()) === '5', label('the question stays mounted, with its answer, under the open list'));
  let strayed = 0;
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press(press % 7 === 6 ? 'Shift+Tab' : 'Tab');
    if (!(await focusIn(page))) strayed += 1;
  }
  check(strayed === 0, label('Tab stays on the page with the list open'), `${strayed} of 30 presses left it`);
  await page.locator('[data-secure-navigator] button', { hasText: 'Close' }).focus();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-secure-navigator]', { state: 'detached' });
  check(await page.evaluate(() => document.activeElement?.hasAttribute('data-secure-navigator-toggle')), label('closing the list returns focus to its button'));
  let offPage = 0;
  for (let press = 0; press < 60; press += 1) {
    await page.keyboard.press(press % 9 === 8 ? 'Shift+Tab' : 'Tab');
    if (!(await focusIn(page))) offPage += 1;
  }
  await wait(1200);
  const after = await violations(page);
  check(offPage === 0, label('Tab comes round instead of leaving the page'), `${offPage} of 60 presses left it`);
  check(before === after && !(await page.locator('[data-secure-integrity-warning]').count()), label('tabbing around is never counted as leaving the test'), `violations ${before} -> ${after}`);

  // Leave and come back: the clock kept running, and the screen says what is left.
  await page.evaluate(() => window.__secureHarness.remount());
  await page.waitForSelector('[data-secure-start-rules]');
  const resumeRule = await page.waitForFunction(() => /has kept running: about \d+ minutes? (is|are) left\./.test(document.body.innerText), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(resumeRule && !/starting when you press Start/.test(await bodyText(page)), label('coming back: the time left, not the whole allowance'));
  await shot(page, device, 'backtrack-04-resume-start');
  await page.getByRole('button', { name: 'Start Test' }).click();
  await atQuestion(page, 'Question 3 of 3');
  check([await slope().inputValue(), await intercept().inputValue()].join('|') === '5|3', label('resumes on the same question with its answer'));

  // A teacher's pause while the student is only reading.
  await slope().focus();
  await page.evaluate(() => window.__secureHarness.proctor('lock'));
  const pausedAt = Date.now();
  const pauseShown = await page.waitForSelector('[data-secure-pause="teacher"]', { timeout: 45000 }).then(() => true).catch(() => false);
  check(pauseShown, label('a teacher\'s pause reaches a student who is only reading'), `${Math.round((Date.now() - pausedAt) / 1000)}s`);
  check(await focusIn(page, '[data-secure-pause]'), label('the pause takes focus'));
  const uncovered = await page.evaluate(() => {
    const [w, h] = [window.innerWidth, window.innerHeight];
    return [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8], [w / 2, h / 2]]
      .filter(([x, y]) => !document.elementFromPoint(x, y)?.closest('[data-secure-pause]'))
      .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`);
  });
  check(uncovered.length === 0, label('the pause covers the whole screen, corner to corner'), uncovered.join(' '));
  await page.screenshot({ path: path.join(SHOTS, `${device.id}-backtrack-05a-pause-viewport.png`) });
  let behindPause = 0;
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press(press % 2 ? 'Shift+Tab' : 'Tab');
    if (!(await focusIn(page, '[data-secure-pause]'))) behindPause += 1;
  }
  check(behindPause === 0, label('Tab cannot reach the test behind the pause'), `${behindPause} of 6 presses did`);
  await page.keyboard.type('9');
  check(await slope().inputValue() === '5', label('typing during the pause reaches no answer'), await slope().inputValue());
  await titleFits(page, '[data-secure-pause] h1', label('teacher pause'));
  await shot(page, device, 'backtrack-05-paused-while-reading');
  await page.evaluate(() => window.__secureHarness.proctor('unlock'));
  await page.waitForSelector('[data-secure-pause]', { state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('[data-secure-exam-surface][inert]'));
  // MathLive moves focus into a math field 60 ms after it is asked to
  // (MathfieldPrivate.onFocus defers keyboardDelegate.focus()), so wait for it
  // to land rather than sample the instant the pause is gone.
  const focusBack = await page.waitForFunction(() => Boolean(document.activeElement?.closest('fieldset')?.querySelector('legend')?.textContent.includes('Slope')), null, { timeout: 2000 }).then(() => true).catch(() => false);
  check(focusBack, label('after the pause, focus is back on the answer'), await page.evaluate(() => document.activeElement?.tagName));
  check(await slope().inputValue() === '5', label('the answer is unchanged by the pause'));

  // Submit; the record the teacher releases has every part.
  await page.locator('[data-secure-nav="review"]').click();
  await page.waitForSelector('[data-secure-review="submit"]');
  await page.getByRole('button', { name: 'Submit test' }).click();
  await page.waitForSelector('[data-secure-finished]');
  await titleFits(page, '[data-secure-finished] h1', label('finished screen'));
  await page.evaluate(() => window.__secureHarness.proctor('releaseFeedback'));
  const record = await page.evaluate(async () => (await window.__secureHarness.review()).review.items.map((item) => item.responsePayload?.responses || {}));
  check(JSON.stringify(record) === JSON.stringify([{ answer: 'c' }, { answer: '6' }, { slope: '5', intercept: '3' }]), label('the submitted record keeps every answer and both parts'), JSON.stringify(record));
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

/* -------------------------- the dark theme -------------------------------- */

const darkJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'course', device, '&theme=dark');
  const label = (name) => `${device.id} dark ${name}`;
  await page.getByRole('button', { name: 'Start Test' }).click();
  await page.waitForSelector('[data-secure-navigator-toggle]');
  await page.getByRole('radio').nth(1).check();
  await waitSaved(page);
  await page.evaluate(() => window.__secureHarness.proctor('lock'));
  await next(page);
  await page.waitForSelector('[data-secure-pause="teacher"]', { timeout: 8000 });
  await titleFits(page, '[data-secure-pause] h1', label('teacher pause'));
  await shot(page, device, 'dark-01-teacher-pause');
  await page.evaluate(() => window.__secureHarness.proctor('unlock'));
  await page.waitForSelector('[data-secure-pause]', { state: 'detached', timeout: 15000 });
  await page.locator('[data-secure-nav="review"]').click();
  await page.waitForSelector('[data-secure-review="submit"]');
  await page.getByRole('button', { name: 'Back to questions' }).click();
  await atQuestion(page, 'Question 1 of 5');
  check(await page.getByRole('radio').nth(1).isChecked(), label('Back to questions keeps the answer'));
  await page.locator('[data-secure-nav="review"]').click();
  await page.waitForSelector('[data-secure-review="submit"]');
  await shot(page, device, 'dark-02-review');
  await page.getByRole('button', { name: 'Submit test' }).click();
  await page.waitForSelector('[data-secure-finished]');
  await titleFits(page, '[data-secure-finished] h1', label('finished screen'));
  await shot(page, device, 'dark-03-finished');
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

/* ------------------- an answer the one-way runtime locked ------------------ */

const legacyJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'legacy', device);
  const label = (name) => `${device.id} legacy ${name}`;
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Resume test' }).click();
  await page.waitForSelector('[data-secure-navigator-toggle]');
  check(await headerPosition(page) === 'Question 2 of 3', label('resumes where the student left off'), await headerPosition(page));
  await previous(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 1 of 3'));
  const text = await bodyText(page);
  check(/This answer was recorded earlier and can't be changed\./.test(text), label('a locked answer says so instead of reopening'));
  check(!/Preparing the next secure item/.test(text), label('no dead "Preparing…" screen'));
  check(!(await page.getByRole('button', { name: /Mark for review/ }).count()), label('a locked answer cannot be marked'));
  await page.locator('[data-secure-navigator-toggle]').click();
  const first = await page.locator('[data-secure-navigator] [data-question-status]').first().getAttribute('data-question-status');
  check(first === 'recorded', label('the list shows it as recorded'), first);
  await shot(page, device, 'legacy-01-recorded');
  await page.getByRole('button', { name: 'Close' }).click();
  await next(page);
  await page.waitForFunction(() => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes('Question 2 of 3'));
  check(true, label('Next moves on from a locked answer'));
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

/* ------------------------------ status list ------------------------------- */

const dashboardJourney = async (context, device) => {
  const { page, errors } = await openPage(context, 'dashboard', device);
  const label = (name) => `${device.id} list ${name}`;
  await page.waitForSelector('[data-secure-status-label]');
  const labels = await page.locator('[data-secure-status-label]').allInnerTexts();
  for (const expected of ['Not started', 'In progress', 'Paused by your teacher', 'Paused — ask your teacher', 'Results ready', 'Submitted', 'Submitted by your teacher']) {
    check(labels.includes(expected), label(`shows "${expected}"`), labels.join(', '));
  }
  const text = await bodyText(page);
  check(!/not_started|in_progress|locked_proctor|locked_integrity|force_submitted|time_expired/.test(text), label('no raw status anywhere'));
  check(/See your results/.test(text) && /Waiting for results/.test(text), label('released results open; held ones wait'));
  check(/includes your extended time/.test(text), label('extended time is named'));
  const notStartedRow = await page.locator('article', { hasText: 'ACT Mathematics — not started' }).innerText();
  check(/Not started/.test(notStartedRow) && /\(includes your extended time\)/.test(notStartedRow), label('a test not started yet states the student\'s extended time'), notStartedRow.replace(/\s+/g, ' '));
  await shot(page, device, 'list-01-statuses');
  await layout(page, label('statuses'));
  check(errors.length === 0, label('no console errors'), errors.slice(0, 3).join(' | '));
  await page.close();
};

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: device.mobile ? 2 : 1,
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blockedRequests += 1;
    return route.abort();
  });
  const only = (process.env.SECURE_NAV_JOURNEYS || '').split(',').map((name) => name.trim()).filter(Boolean);
  const journeys = [practiceJourney, courseJourney, backtrackJourney, darkJourney, timeoutJourney, legacyJourney, dashboardJourney]
    .filter((journey) => !only.length || only.includes(journey.name.replace(/Journey$/, '')));
  for (const journey of journeys) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await journey(context, device);
    } catch (error) {
      check(false, `${device.id} ${journey.name} ran to the end`, String(error?.message || error).split('\n')[0]);
    }
  }
  await context.close();
}

await browser.close();
log(`blocked ${blockedRequests} non-local request(s) — no production contact`);
log(`${passes.length} passed, ${findings.length} failed. Screenshots: ${SHOTS}`);
if (findings.length) {
  findings.forEach((finding) => log('  -', finding));
  process.exit(1);
}
process.exit(0);

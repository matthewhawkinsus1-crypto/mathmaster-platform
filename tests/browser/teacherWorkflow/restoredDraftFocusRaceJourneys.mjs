// THE STUDENT'S CLICK BEATS EVERY LATE FOCUS FROM A RESTORE, IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/restoredDraftFocusRaceJourneys.mjs
//
//   ONLY=window,echo,...   some journeys (names below)
//   DEVICES=chromebook,ipad,phone
//   REPEAT=50              repetitions of the normal-speed race (default 5)
//   THROTTLED_REPEAT=20    repetitions under 4x CPU / slow network (default 3)
//   (TEACHER_HARNESS_ORIGIN, PLAYWRIGHT_MODULE, CHROMIUM_PATH as in
//    draftCrossDeviceJourneys.mjs.)
//
// THE RACE (reproduced on main and on PR #435, see deferredFocusAuthority.js):
// a server copy from another Chromebook lands after the question opened, App
// remounts the question to show it, and the cursor is put back in the box the
// student had (box A) — a frame later, and MathLive focuses that box AGAIN 60
// ms after that. A student who clicks box B in between has focus pulled back
// to A, and what they type goes into A, over the restored answer.
//
// DETERMINISTIC, NOT LUCKY. The page gets a gate (installed before the app):
// while armed it HOLDS every animation frame the app schedules (`/src/`, not
// MathLive's own rendering) and every MathLive deferred focus (its timer that
// calls `keyboardDelegate.focus()`), and releases them on command. So "the
// student clicks before the late focus fires" is not a timing hope: the late
// focus cannot fire until the test has clicked. `held` counts prove a late
// focus really was pending each time. The same journeys also run with no gate
// at all, at normal speed and throttled, many times.
//
//   window      the restore's own frame held; the student clicks B, types:
//               focus stays in B, the keys go to B, A's restored value is
//               untouched (Chromebook mouse, iPad and phone touch)
//   echo        the restore focused A; MathLive's 60 ms focus of A held; the
//               student clicks/taps B, types: the same
//   tab         Tab, and Shift+Tab, while MathLive's focus of A is pending:
//               keyboard focus movement wins; then keyboard entry into B
//   quiet       no interaction: the held restore, released, still puts the
//               cursor back in A (helpful restore still works)
//   press       a press on the question's text (focus does not move): the
//               restore still must not take the cursor
//   keys        a keyboard user pressing a key on the Next button while the
//               next question's opening autofocus is pending keeps focus there
//   newer       a second, newer server copy lands while the first restore's
//               focus is held: only the newest restore runs, A shows the newest
//               work, the student's click still wins, nothing typed is lost
//   typing      the student is typing in B when an OLDER server copy is read
//               again: no remount, no focus move, B's newer work kept
//   switch      a question switch, an assignment switch and a sign-out while a
//               restore's focus is held: nothing from the old question fires
//   workview    the student opens Work View while the restore's focus is held:
//               the cursor is not put back behind/under it
//   repeat      REPEAT rounds at normal speed and THROTTLED_REPEAT at 4x CPU
//               throttling (Chromebook), each round three races on one page:
//               no gate (click B the moment A gets the cursor), the restore's
//               frame held, and MathLive's late focus held
//
// Exit code 1 on any failure.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const REPEAT = Number(process.env.REPEAT || 5);
const THROTTLED_REPEAT = Number(process.env.THROTTLED_REPEAT || 3);
const STUDENT = '910002';
const ASSIGNMENT = 'a-today';
const DOC = `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}`;
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const Q_LINE = { index: 2, prompt: /A line passes through \(0, 4\) and \(3, 2\)/ };
const LINE_KEY = `${Q_LINE.index}:0:student:multi-answer`;
const RESTORED = ['-\\frac23', ''];
const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  ipad: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
};
const deviceNames = (process.env.DEVICES || 'chromebook,ipad,phone').split(',');

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const consoleProblems = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/* --------------------------------------------------------------- gate */

// Runs in the page before the app. Nothing is held until the test arms it.
function installFocusRaceGate() {
  const nativeFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelFrame = window.cancelAnimationFrame.bind(window);
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const held = [];
  let nextId = 1e9;
  let holdFrames = false;
  let holdMathLive = false;
  // The function that called requestAnimationFrame: hold the app's frames
  // (QuestionEngine, ToolShell, MathInput, the focus authority), never
  // MathLive's own rendering or React's.
  const calledFromApp = () => {
    const caller = String(new Error().stack || '').split('\n')[3] || '';
    return /\/src\//.test(caller) && !/node_modules/.test(caller);
  };
  const isMathLiveDeferredFocus = (callback) => typeof callback === 'function' && /keyboardDelegate\.focus\(\)/.test(String(callback));
  window.requestAnimationFrame = (callback) => {
    if (holdFrames && calledFromApp()) {
      const id = (nextId += 1);
      held.push({ kind: 'frame', id, callback });
      return id;
    }
    return nativeFrame(callback);
  };
  window.cancelAnimationFrame = (id) => {
    const index = held.findIndex((entry) => entry.kind === 'frame' && entry.id === id);
    if (index >= 0) held.splice(index, 1);
    else nativeCancelFrame(id);
  };
  window.setTimeout = (callback, ms, ...args) => {
    if (holdMathLive && isMathLiveDeferredFocus(callback)) {
      const id = (nextId += 1);
      held.push({ kind: 'mathlive', id, callback, args });
      return id;
    }
    return nativeTimeout(callback, ms, ...args);
  };
  window.clearTimeout = (id) => {
    const index = held.findIndex((entry) => entry.kind === 'mathlive' && entry.id === id);
    if (index >= 0) held.splice(index, 1);
    else nativeClearTimeout(id);
  };
  window.__mmFocusRaceGate = {
    arm({ frames = false, mathlive = false } = {}) { holdFrames = frames; holdMathLive = mathlive; },
    disarm() { holdFrames = false; holdMathLive = false; },
    held: () => held.map((entry) => entry.kind),
    // Everything held fires now, in the order it was scheduled — as it would
    // have on a machine slow enough to let the student act first.
    release() {
      holdFrames = false;
      holdMathLive = false;
      const due = held.splice(0, held.length);
      due.forEach((entry) => {
        if (entry.kind === 'frame') entry.callback(performance.now());
        else entry.callback(...entry.args);
      });
      return due.length;
    },
  };
}

/* ------------------------------------------------------------- devices */

const openDevice = async (label, { server = null, device = 'chromebook', params = {} } = {}) => {
  const context = await newSchoolContext(browser, { ...DEVICES[device] });
  await context.addInitScript(installFocusRaceGate);
  if (server) {
    await context.addInitScript(([key, value]) => {
      if (window.sessionStorage.getItem('mm-journey-server')) return;
      window.sessionStorage.setItem('mm-journey-server', '1');
      window.localStorage.setItem(key, value);
    }, [DB_KEY, server]);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${label}: page error ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    // React warnings and errors, and the MathLive compat alarm: none expected.
    if (/Warning:|React|MathLive compat|Maximum update depth|act\(/.test(text)) consoleProblems.push(`${label}: ${text.slice(0, 300)}`);
  });
  const search = new URLSearchParams({ as: 'student', studentId: STUDENT, questions: 'real', ...params });
  if (!server) search.set('reset', '1');
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  return { context, page, device, touch: Boolean(DEVICES[device].hasTouch) };
};

const stageText = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-stage')?.innerText || '').replace(/\s+/g, ' '));
const fields = (page) => page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-stage math-field')].map((field) => field.value));
// Which box has the cursor: its index among the question's math fields, or a
// description of whatever else has focus.
const focusedBox = (page) => page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.mathmaster-question-stage math-field')];
  const index = boxes.findIndex((box) => box === document.activeElement || box.contains(document.activeElement));
  if (index >= 0) return index;
  const active = document.activeElement;
  if (!active || active === document.body) return 'nowhere';
  return `${active.tagName.toLowerCase()}${active.getAttribute('aria-label') ? `[${active.getAttribute('aria-label')}]` : ''}${active.textContent ? `"${active.textContent.trim().slice(0, 24)}"` : ''}`;
});
const box = (page, index) => page.locator('.mathmaster-question-stage math-field').nth(index);
const press = async (target, touch) => {
  await target.scrollIntoViewIfNeeded();
  const rect = await target.boundingBox();
  const x = rect.x + Math.min(rect.width / 2, 60);
  const y = rect.y + rect.height / 2;
  if (touch) await target.page().touchscreen.tap(x, y);
  else await target.page().mouse.click(x, y);
};
const waitFor = async (page, test, ms = 8000, step = 20) => {
  const deadline = Date.now() + ms;
  let value = await test();
  while (!value && Date.now() < deadline) {
    await page.waitForTimeout(step);
    value = await test();
  }
  return value;
};

const openAssignmentOnLine = async (page) => {
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);
  for (let step = 0; step < 6 && !Q_LINE.prompt.test(await stageText(page)); step += 1) {
    await page.getByRole('button', { name: 'Next question' }).first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('.mathmaster-question-stage math-field').nth(1).waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
};

// The device B situation every journey starts from: the question with A's
// work on the server, this Chromebook offline (so the read lands exactly when
// the test says), and the cursor in box A — autofocus on a Chromebook, a tap
// on a touch device (which does not autofocus).
const deviceBReady = async (label, device, server) => {
  const B = await openDevice(label, { server, device, params: { offline: '1' } });
  await openAssignmentOnLine(B.page);
  check(same(await fields(B.page), ['', '']), `${label}: before the server copy lands, B shows its own (empty) boxes`);
  if ((await focusedBox(B.page)) !== 0) await press(box(B.page, 0), B.touch);
  await B.page.waitForTimeout(200);
  check((await focusedBox(B.page)) === 0, `${label}: the cursor is in box A before the restore`, String(await focusedBox(B.page)));
  return B;
};
const landServerCopy = (page) => page.evaluate(() => window.__mmHarnessStore.setOnline(true));
const showsRestored = async (page, expected = RESTORED) => same(await waitFor(page, async () => (same(await fields(page), expected) ? expected : null), 10000), expected);
const gate = {
  arm: (page, options) => page.evaluate((o) => window.__mmFocusRaceGate.arm(o), options),
  held: (page) => page.evaluate(() => window.__mmFocusRaceGate.held()),
  disarm: (page) => page.evaluate(() => window.__mmFocusRaceGate.disarm()),
  release: (page) => page.evaluate(() => window.__mmFocusRaceGate.release()),
};
const typeDigit = async (page, digit) => {
  await page.keyboard.type(digit, { delay: 30 });
  await page.waitForTimeout(250);
};
const throttle = async (page, rate) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
};
// A newer server copy of the line question, as another Chromebook would leave
// it: `slope` in box A, nothing in box B, edited `aheadMs` after now.
const newerServerCopy = (page, slope, aheadMs = 60000) => page.evaluate(([doc, key, value, ahead]) => {
  const stored = window.__mmHarnessStore.exportDoc(doc);
  const at = Date.now() + ahead;
  const entries = (stored?.entries || []).map((entry) => (String(entry.key).endsWith(`:${key}`)
    ? { ...entry, valueJson: JSON.stringify({ m: value }), savedAt: at, savedAtIsEdit: true }
    : entry));
  window.__mmHarnessStore.importDoc(doc, { ...stored, entries, updatedAt: { __ts: at } });
  window.dispatchEvent(new Event('online'));
}, [DOC, LINE_KEY, slope, aheadMs]);

/* ===================================================== device A works */

const A = await openDevice('A');
await openAssignmentOnLine(A.page);
await box(A.page, 0).click();
await A.page.keyboard.press('Control+a');
await A.page.keyboard.press('Backspace');
await A.page.keyboard.type('-2/3', { delay: 25 });
await A.page.keyboard.press('Tab');
const afterA = await waitFor(A.page, () => A.page.evaluate((doc) => {
  const stored = window.__mmHarnessStore.get(doc);
  return (stored?.entries || []).some((entry) => /-\\\\frac23|-\\frac23/.test(entry.valueJson)) ? true : null;
}, DOC), 15000, 300);
check(afterA, 'A: the partial draft (slope only) reaches the server copy');
const serverAfterA = await A.page.evaluate((key) => window.localStorage.getItem(key), DB_KEY);
await A.context.close();

/* ============================================================= window */

if (wanted('window')) {
  for (const device of deviceNames) {
    const tag = `window (${device})`;
    const B = await deviceBReady(`${tag} B`, device, serverAfterA);
    await gate.arm(B.page, { frames: true, mathlive: true });
    await landServerCopy(B.page);
    check(await showsRestored(B.page), `${tag}: B shows A's restored work`, JSON.stringify(await fields(B.page)));
    const held = await gate.held(B.page);
    check(held.includes('frame'), `${tag}: the restore's focus is still pending when the student acts`, JSON.stringify(held));
    await press(box(B.page, 1), B.touch);
    check((await focusedBox(B.page)) === 1, `${tag}: the student's click/tap puts the cursor in box B`, String(await focusedBox(B.page)));
    await gate.release(B.page);
    await B.page.waitForTimeout(150);
    check((await focusedBox(B.page)) === 1, `${tag}: the late restore focus does not take the cursor back`, String(await focusedBox(B.page)));
    await typeDigit(B.page, '4');
    const after = await fields(B.page);
    check(same(after, ['-\\frac23', '4']), `${tag}: what the student types lands in B; A's restored value is unchanged`, JSON.stringify(after));
    await B.context.close();
  }
}

/* =============================================================== echo */

if (wanted('echo')) {
  for (const device of deviceNames) {
    const tag = `echo (${device})`;
    const B = await deviceBReady(`${tag} B`, device, serverAfterA);
    await gate.arm(B.page, { mathlive: true });
    await landServerCopy(B.page);
    check(await showsRestored(B.page), `${tag}: B shows A's restored work`);
    const restoredFocus = await waitFor(B.page, async () => ((await focusedBox(B.page)) === 0 ? 0 : null), 3000);
    check(restoredFocus === 0, `${tag}: the restore put the cursor back in A`, String(await focusedBox(B.page)));
    const held = await gate.held(B.page);
    check(held.includes('mathlive'), `${tag}: MathLive's own focus of A is still pending when the student acts`, JSON.stringify(held));
    // Only A's late focus is held: B's own, from the student's click, runs
    // on time, so A's arrives last — as it does when a busy Chromebook runs
    // A's timer late.
    await gate.disarm(B.page);
    await press(box(B.page, 1), B.touch);
    await B.page.waitForTimeout(150);
    check((await focusedBox(B.page)) === 1, `${tag}: the student's click/tap puts the cursor in box B`, String(await focusedBox(B.page)));
    await gate.release(B.page);
    await B.page.waitForTimeout(150);
    check((await focusedBox(B.page)) === 1, `${tag}: MathLive's late focus of A does not take the cursor back`, String(await focusedBox(B.page)));
    const models = await B.page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-stage math-field')].map((field) => field.hasFocus()));
    check(same(models, [false, true]), `${tag}: MathLive agrees: B is the focused field, A is not`, JSON.stringify(models));
    await typeDigit(B.page, '4');
    check(same(await fields(B.page), ['-\\frac23', '4']), `${tag}: the keys go to B; A's restored value is unchanged`, JSON.stringify(await fields(B.page)));
    await B.context.close();
  }
}

/* ================================================================ tab */

if (wanted('tab')) {
  for (const backwards of [false, true]) {
    const tag = `tab (${backwards ? 'Shift+Tab' : 'Tab'})`;
    const B = await deviceBReady(`${tag} B`, 'chromebook', serverAfterA);
    // Shift+Tab leaves from the EMPTY box: inside the restored fraction −2/3
    // MathLive keeps Shift+Tab to move between its numerator and denominator.
    // So for Shift+Tab the student had the cursor in B, and the restore puts
    // it back there.
    const start = backwards ? 1 : 0;
    if (backwards) {
      await press(box(B.page, 1), false);
      await B.page.waitForTimeout(200);
    }
    await gate.arm(B.page, { mathlive: true });
    await landServerCopy(B.page);
    await showsRestored(B.page);
    await waitFor(B.page, async () => ((await focusedBox(B.page)) === start ? true : null), 3000);
    check((await focusedBox(B.page)) === start, `${tag}: the restore put the cursor back in box ${start ? 'B' : 'A'}`, String(await focusedBox(B.page)));
    check((await gate.held(B.page)).includes('mathlive'), `${tag}: MathLive's focus of that box is pending`);
    await gate.disarm(B.page);
    await B.page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
    const moved = await focusedBox(B.page);
    check(moved !== start, `${tag}: the key moves focus out of the restored box`, String(moved));
    await gate.release(B.page);
    await B.page.waitForTimeout(150);
    check(same(await focusedBox(B.page), moved), `${tag}: focus stays where the keyboard put it`, `${moved} → ${await focusedBox(B.page)}`);
    if (!backwards) {
      // Keyboard entry: on to box B with Tab alone, then type.
      for (let step = 0; step < 6 && (await focusedBox(B.page)) !== 1; step += 1) await B.page.keyboard.press('Tab');
      check((await focusedBox(B.page)) === 1, `${tag}: Tab reaches box B`, String(await focusedBox(B.page)));
      await typeDigit(B.page, '4');
      check(same(await fields(B.page), ['-\\frac23', '4']), `${tag}: keyboard entry lands in B; A untouched`, JSON.stringify(await fields(B.page)));
    }
    await B.context.close();
  }
}

/* ============================================================== quiet */

if (wanted('quiet')) {
  for (const device of deviceNames) {
    const tag = `quiet (${device})`;
    const B = await deviceBReady(`${tag} B`, device, serverAfterA);
    await gate.arm(B.page, { frames: true });
    await landServerCopy(B.page);
    await showsRestored(B.page);
    check((await gate.held(B.page)).includes('frame'), `${tag}: the restore's focus is pending`);
    await gate.release(B.page);
    const back = await waitFor(B.page, async () => ((await focusedBox(B.page)) === 0 ? 0 : null), 3000);
    check(back === 0, `${tag}: with no interaction, the restore still puts the cursor back in A`, String(await focusedBox(B.page)));
    await typeDigit(B.page, '1');
    check(same(await fields(B.page), ['-\\frac231', '']), `${tag}: and a key typed straight on goes there, as before`, JSON.stringify(await fields(B.page)));
    await B.context.close();
  }
}

/* ============================================================== press */

if (wanted('press')) {
  const tag = 'press';
  const B = await deviceBReady(`${tag} B`, 'chromebook', serverAfterA);
  await gate.arm(B.page, { frames: true, mathlive: true });
  await landServerCopy(B.page);
  await showsRestored(B.page);
  check((await gate.held(B.page)).includes('frame'), `${tag}: the restore's focus is pending`);
  // The question's own text: a press that moves no focus.
  await B.page.getByText('Complete Each Part').first().click();
  check((await focusedBox(B.page)) === 'nowhere', `${tag}: the press itself moves no focus`, String(await focusedBox(B.page)));
  await gate.release(B.page);
  await B.page.waitForTimeout(150);
  check((await focusedBox(B.page)) === 'nowhere', `${tag}: the late restore does not take the cursor after the student pressed`, String(await focusedBox(B.page)));
  await B.context.close();
}

/* =============================================================== keys */

if (wanted('keys')) {
  const tag = 'keys';
  const B = await openDevice(`${tag} B`, { server: serverAfterA, device: 'chromebook' });
  await B.page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await B.page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await B.page.waitForTimeout(800);
  // A keyboard user is on the Log Out button (it stays across questions) when
  // another question opens (moved by the app: a synthetic click is not the
  // student) and presses a key there while its opening autofocus is pending.
  // The previous question, which is open (the one after it opens locked).
  await B.page.getByRole('button', { name: /^Log Out$/ }).first().focus();
  check(/Log Out/.test(String(await focusedBox(B.page))), `${tag}: the keyboard user is on the Log Out button`, String(await focusedBox(B.page)));
  const opened = await stageText(B.page);
  await gate.arm(B.page, { frames: true, mathlive: true });
  await B.page.evaluate(() => document.querySelector('[aria-label="Previous question"]')?.click());
  await waitFor(B.page, async () => ((await stageText(B.page)) !== opened && (await fields(B.page)).length > 0 && (await gate.held(B.page)).includes('frame') ? true : null), 8000);
  await B.page.waitForTimeout(100);
  check((await gate.held(B.page)).includes('frame'), `${tag}: the next question's opening autofocus is pending`);
  const before = await focusedBox(B.page);
  check(/Log Out/.test(String(before)), `${tag}: and still is when the next question has opened`, String(before));
  await B.page.keyboard.press('ArrowDown');
  await gate.release(B.page);
  await B.page.waitForTimeout(150);
  check(same(await focusedBox(B.page), before), `${tag}: a key the student pressed meanwhile keeps focus where it is`, `${before} → ${await focusedBox(B.page)}`);
  await B.context.close();

  // And with no key in between, the opening still focuses its first box.
  const C = await openDevice(`${tag} C`, { server: serverAfterA, device: 'chromebook' });
  await C.page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await C.page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await C.page.waitForTimeout(800);
  await C.page.getByRole('button', { name: /^Log Out$/ }).first().focus();
  const openedC = await stageText(C.page);
  await gate.arm(C.page, { frames: true });
  await C.page.evaluate(() => document.querySelector('[aria-label="Previous question"]')?.click());
  await waitFor(C.page, async () => ((await stageText(C.page)) !== openedC && (await fields(C.page)).length > 0 && (await gate.held(C.page)).includes('frame') ? true : null), 8000);
  await C.page.waitForTimeout(100);
  await gate.release(C.page);
  const first = await waitFor(C.page, async () => ((await focusedBox(C.page)) === 0 ? 0 : null), 3000);
  check(first === 0, `${tag}: without one, a Chromebook question still opens with the cursor in its first box`, String(await focusedBox(C.page)));
  await C.context.close();
}

/* ============================================================== newer */

if (wanted('newer')) {
  for (const interacts of [true, false]) {
    const tag = `newer (${interacts ? 'student clicks B' : 'no interaction'})`;
    const B = await deviceBReady(`${tag} B`, 'chromebook', serverAfterA);
    await gate.arm(B.page, { frames: true, mathlive: true });
    await landServerCopy(B.page);
    await showsRestored(B.page);
    // A second, newer copy (A edited again) lands before the first restore's
    // focus has run.
    await newerServerCopy(B.page, '-\\frac12');
    check(await showsRestored(B.page, ['-\\frac12', '']), `${tag}: B shows the newest work`, JSON.stringify(await fields(B.page)));
    const held = await gate.held(B.page);
    check(held.filter((kind) => kind === 'frame').length >= 1, `${tag}: a restore focus is pending`, JSON.stringify(held));
    if (interacts) await press(box(B.page, 1), false);
    await gate.release(B.page);
    await B.page.waitForTimeout(150);
    if (interacts) {
      check((await focusedBox(B.page)) === 1, `${tag}: neither restore takes the cursor from B`, String(await focusedBox(B.page)));
      await typeDigit(B.page, '4');
      check(same(await fields(B.page), ['-\\frac12', '4']), `${tag}: the keys go to B; the newest restored slope is untouched`, JSON.stringify(await fields(B.page)));
    } else {
      // The second restore was ordered while the first one's focus had not
      // run (the cursor was nowhere), so it puts the cursor nowhere — and
      // the first one's stale request does not revive.
      check((await focusedBox(B.page)) === 'nowhere', `${tag}: the superseded restore's focus does not run`, String(await focusedBox(B.page)));
    }
    await B.context.close();
  }
}

/* ============================================================= typing */

if (wanted('typing')) {
  const tag = 'typing';
  const B = await deviceBReady(`${tag} B`, 'chromebook', serverAfterA);
  await landServerCopy(B.page);
  await showsRestored(B.page);
  await B.page.waitForTimeout(300);
  await press(box(B.page, 1), false);
  await B.page.keyboard.type('4', { delay: 30 });
  await B.page.waitForTimeout(200);
  // The device reads the server again (back online) while the student is in
  // B. The server still holds A's older copy: B's own edit is newer.
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.page.keyboard.type('2', { delay: 30 });
  await B.page.waitForTimeout(1200);
  check((await focusedBox(B.page)) === 1, `${tag}: a re-read during typing does not move the cursor`, String(await focusedBox(B.page)));
  check(same(await fields(B.page), ['-\\frac23', '42']), `${tag}: no keystroke lost, and the older server copy does not overwrite B's newer work`, JSON.stringify(await fields(B.page)));
  await B.context.close();
}

/* ============================================================= switch */

if (wanted('switch')) {
  const leave = {
    question: async (page) => page.evaluate(() => document.querySelector('[aria-label="Next question"]')?.click()),
    assignment: async (page) => page.evaluate(() => document.querySelector('.mathmaster-unified-nav-back')?.click()),
    account: async (page) => page.evaluate(() => [...document.querySelectorAll('button')].find((button) => /Log Out/.test(button.textContent))?.click()),
  };
  for (const device of ['chromebook', 'ipad']) {
    for (const [what, go] of Object.entries(leave)) {
      const tag = `switch (${what}, ${device})`;
      const B = await deviceBReady(`${tag} B`, device, serverAfterA);
      await gate.arm(B.page, { frames: true, mathlive: true });
      await landServerCopy(B.page);
      await showsRestored(B.page);
      check((await gate.held(B.page)).length > 0, `${tag}: the restore's focus is pending`);
      // Moved on by the app, not by a student press (a synthetic click is
      // not an interaction): only the question going away can cancel it.
      await go(B.page);
      await B.page.waitForTimeout(600);
      await gate.release(B.page);
      await B.page.waitForTimeout(200);
      const where = await focusedBox(B.page);
      const ok = what === 'question' && !B.touch
        // The next question opens as any question opens: its own first box.
        ? where === 0 && !Q_LINE.prompt.test(await stageText(B.page))
        : where === 'nowhere' || (typeof where === 'string' && !/math-field/.test(where));
      check(ok, `${tag}: nothing from the old question's restore fires into what comes next`, String(where));
      await B.context.close();
    }
  }
}

/* =========================================================== workview */

if (wanted('workview')) {
  for (const device of ['chromebook', 'ipad']) {
    const tag = `workview (${device})`;
    const B = await deviceBReady(`${tag} B`, device, serverAfterA);
    await gate.arm(B.page, { frames: true, mathlive: true });
    await landServerCopy(B.page);
    await showsRestored(B.page);
    check((await gate.held(B.page)).includes('frame'), `${tag}: the restore's focus is pending`);
    await press(B.page.getByRole('button', { name: /Enlarge question/ }).first(), B.touch);
    await B.page.waitForTimeout(400);
    const opened = await B.page.evaluate(() => Boolean(document.querySelector('[aria-modal="true"]')));
    check(opened, `${tag}: Work View opens`);
    const before = await focusedBox(B.page);
    await gate.release(B.page);
    await B.page.waitForTimeout(200);
    check(same(await focusedBox(B.page), before) && before !== 0, `${tag}: the restore does not put the cursor back after the student opened Work View`, `${before} → ${await focusedBox(B.page)}`);
    await B.context.close();
  }
}

/* ============================================================= repeat */

if (wanted('repeat')) {
  // Every round, three races on the same Chromebook, each started by a newer
  // server copy from "another Chromebook":
  //   natural  no gate: the student clicks B the moment the restore has put
  //            the cursor in A (MathLive's own focus of A due ~60 ms later)
  //   window   the restore's frame held until after the click
  //   echo     MathLive's late focus of A held until after the click
  // and types at once. A steal is the cursor anywhere but B, or A's restored
  // value changed; a lost keystroke is B without the digit.
  const MODES = ['natural', 'window', 'echo'];
  for (const [label, count, rate] of [['normal speed', REPEAT, 1], ['4x CPU, slow network', THROTTLED_REPEAT, 4]]) {
    if (!count) continue;
    const B = await deviceBReady(`repeat ${label} B`, 'chromebook', serverAfterA);
    if (rate > 1) await throttle(B.page, rate);
    const tally = Object.fromEntries(MODES.map((mode) => [mode, { races: 0, steals: 0, lost: 0, pending: 0 }]));
    let sequence = 0;
    let first = true;
    for (let round = 1; round <= count; round += 1) {
      for (const mode of MODES) {
        sequence += 1;
        if ((await focusedBox(B.page)) !== 0) await press(box(B.page, 0), false);
        await B.page.waitForTimeout(150 * rate);
        const slope = `-\\frac{${sequence}}{7}`;
        const expected = first ? RESTORED : [slope, ''];
        if (mode === 'window') await gate.arm(B.page, { frames: true, mathlive: true });
        if (mode === 'echo') await gate.arm(B.page, { mathlive: true });
        if (first) await landServerCopy(B.page);
        else await newerServerCopy(B.page, slope, 60000 * sequence);
        first = false;
        const ready = mode === 'window'
          ? async () => (same(await fields(B.page), expected) ? true : null)
          : async () => (same(await fields(B.page), expected) && (await focusedBox(B.page)) === 0 ? true : null);
        const landed = await waitFor(B.page, ready, 15000, 5);
        if (!landed) {
          check(false, `repeat ${label} ${mode} race ${round}: the restore landed`, `${JSON.stringify(await fields(B.page))} focus ${await focusedBox(B.page)}`);
          await gate.release(B.page);
          continue;
        }
        tally[mode].races += 1;
        if (mode !== 'natural') {
          const held = await gate.held(B.page);
          if (held.includes(mode === 'window' ? 'frame' : 'mathlive')) tally[mode].pending += 1;
          if (mode === 'echo') await gate.disarm(B.page);
        }
        await press(box(B.page, 1), false);
        if (mode === 'echo') await B.page.waitForTimeout(100 * rate);
        if (mode !== 'natural') await gate.release(B.page);
        await B.page.keyboard.type('5', { delay: 15 });
        await B.page.waitForTimeout(200 * rate);
        const after = await fields(B.page);
        if ((await focusedBox(B.page)) !== 1 || after[0] !== expected[0]) tally[mode].steals += 1;
        if (after[1] !== '5') tally[mode].lost += 1;
      }
    }
    MODES.forEach((mode) => {
      const { races, steals, lost, pending } = tally[mode];
      check(races === count, `repeat ${label} ${mode}: ${races}/${count} restores landed`);
      if (mode !== 'natural') check(pending === races, `repeat ${label} ${mode}: a late focus was pending at the click in ${pending}/${races}`);
      check(steals === 0, `repeat ${label} ${mode}: ${races} races, ${steals} focus steals`);
      check(lost === 0, `repeat ${label} ${mode}: ${races} races, ${lost} lost keystrokes`);
    });
    await B.context.close();
  }
}

await browser.close();
check(consoleProblems.length === 0, 'no React warnings or errors, no MathLive compat alarms', consoleProblems.slice(0, 5).join(' | '));
if (failures.length) {
  console.error(`\n${failures.length} restored-draft focus race failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nrestored-draft focus: once the student acts, no late focus from a restore moves the cursor; with no action, the restore still puts it back.');

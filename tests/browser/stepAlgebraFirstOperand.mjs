// THE FIRST OPERAND ON A FRESH STEP ALGEBRA STAGE IS KEPT (issue #386 R12),
// A DIGIT TYPED BEFORE ITS BOX HAS THE CURSOR GOES INTO IT, AND A COMMITTED
// STEP LEAVES THE CURSOR ON THE BOARD (#386, after R12 and R5).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/stepAlgebraFirstOperand.mjs
//
//   ONLY=plain,cold,steps,list,blind,space,check,cancel,double   some journeys (names below)
//   REPEAT=<n>       fresh stages raced in each journey, per device and speed
//                    (default 3)
//   THROTTLE=1,4,6   CPU throttling rates (default 1,4)
//   DEVICES=chromebook,phone   (default both)
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed.)
//
// The real QuestionEngine, Step Algebra solver and workflow runner
// (stepAlgebraFirstOperandMain.jsx). A student-experience pass saw the value a
// student typed for "Divide by what?" straight after a fresh Step Algebra stage
// mounted vanish, now and then. Every way a stage is freshly mounted here is
// raced the way a fast student works: the moment Divide is there it is pressed,
// and the moment a frame shows the box 5 is typed (on a phone, tapped on the
// math keypad). A run is lost when, once the page is quiet, the box or the draft
// does not hold 5, or the box the student typed in is gone. Each failing run
// prints the operand's draft writes, the box's value each frame and every key,
// so it says what changed the value and when.
//
//   plain   a Step Algebra question (5x = 35), a fresh one mounted in place for
//           every run, as the next question of a lesson is
//   cold    the same, the page loaded for every run (MathLive and the fonts
//           cold): the first stage after opening
//   steps   a composed question shown one step at a time: the student writes
//           5x=35 in step 1 and presses Next step; the balance step mounts on
//           their equation
//   list    the same two steps on one screen: the balance step waits for step
//           1 and mounts on its first answer, then follows every key of it;
//           the student presses Divide the moment they finish step 1
//   blind   the 5 typed the moment Divide is pressed, before the page has
//           run a frame since (frames held, as a busy Chromebook runs the key
//           before its next frame): the box is there but has not yet been
//           given the cursor, which waits for a frame. The 5 goes into the
//           box, and the box has the cursor. (A Chromebook: a phone types on
//           the keypad the box brings.) Then "(-5)", "(", "pi" and "sqrt(2)",
//           every key typed before the frame: each gives what the same keys
//           give once the box has the cursor (measured first, on a fresh
//           stage), a key pressed in the box, not text put in it.
//   space   Divide pressed with Space and a digit typed before Space comes up
//           (key rollover, as a fast typist types): Space held, 5, Space up;
//           then 6 after it; the same with the next frame held; Space alone;
//           and Enter then 5. The box holds what was typed (5, 56, 5, nothing,
//           5), with the cursor: Space chooses the tile as it goes down, as
//           Enter does, and its release presses nothing again. (A Chromebook.)
//   check   a whole step on the standalone board: Divide, 5, placed on both
//           sides, the 5s crossed out, 7 typed in the simplification box, then
//           checked with Enter or with Check my simplification (a phone taps
//           it). The step is committed and its box goes; the cursor is back on
//           the Divide tile the move began from, not on the page. (In a
//           composed question: tests/browser/workflowStepEnter.mjs.)
//   cancel  a pair cancelled with no operation in hand on the standalone
//           board: x + 4 − 4 = 9 (and x = 9 + 4 − 4), one term of the pair
//           pressed by keyboard (Enter on it, as the directions say) or by
//           pointer (a click, a tap on a phone). The cancellation is committed
//           and the pressed term goes with it; the cursor is on the first
//           operation tile of the cancelled side's rail (the phone's palette),
//           as after a committed step, not on the page.
//   double  a step's commit pressed twice, the second press while the step
//           settles (its 620 ms animation, before it is saved): Check my
//           simplification clicked twice, double-clicked, tapped twice on a
//           phone; Enter twice in the simplification box (and the number
//           pad's Enter), Enter and Space twice on the button; Keep as
//           written clicked twice; a pair cancelled with no operation in hand
//           by Enter twice, a double click or two taps; and Check clicked
//           twice and Enter twice in a composed question's balance step.
//           Each commits the step once: one step grade, one work step.
//           (At the first THROTTLE rate: the window is the animation's.)
//
// A saved draft that arrives from the server after the student started is
// raced in the real App: tests/browser/teacherWorkflow/
// stepAlgebraOperandDraftJourneys.mjs.
//
// Exit code 1 on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const JOURNEYS = ['plain', 'cold', 'steps', 'list', 'blind', 'space', 'check', 'cancel', 'double'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const REPEAT = Number(process.env.REPEAT ?? 3);
const THROTTLE = (process.env.THROTTLE || '1,4').split(',').map(Number).filter((rate) => rate >= 1);
const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
};
const deviceNames = (process.env.DEVICES || 'chromebook,phone').split(',').filter((name) => DEVICES[name]);

const unknown = (ONLY || []).filter((name) => !JOURNEYS.includes(name));
if (unknown.length) {
  console.error(`No journey called ${unknown.join(', ')}. The journeys are: ${JOURNEYS.join(', ')}.`);
  process.exit(2);
}
const wanted = (name) => !ONLY || ONLY.includes(name);

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const tally = {};
const count = (label, lost) => {
  tally[label] ||= { runs: 0, lost: 0 };
  tally[label].runs += 1;
  if (lost) tally[label].lost += 1;
};

/* ---------------------------------------------------------- the operand watch */

// Runs in the page before the app: every Step Algebra draft write, what the
// operation box shows each frame, and every key and where it went.
function installOperandWatch() {
  const log = [];
  window.__operandLog = log;
  const started = performance.now();
  const at = () => Math.round(performance.now() - started);
  const nativeSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key, value) {
    if (this === window.localStorage && String(key).endsWith(':step-algebra')) {
      try {
        const envelope = JSON.parse(value);
        const equation = envelope?.value?.equation;
        log.push({ t: at(), draft: envelope?.value?.operand ?? null, operation: envelope?.value?.armedTile?.operation || null, equation: equation ? `${equation.left}=${equation.right}` : null });
      } catch { /* not a draft envelope */ }
    }
    return nativeSet.call(this, key, value);
  };
  let shown;
  const watch = () => {
    const field = document.querySelector('.algebra-operation-composer math-field');
    const now = field ? field.value : null;
    if (now !== shown) { log.push({ t: at(), box: now }); shown = now; }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  document.addEventListener('keydown', (event) => {
    const target = event.composedPath?.()?.[0];
    log.push({ t: at(), key: event.key, to: target?.closest?.('.algebra-operation-composer') ? 'operation box' : String(target?.tagName || '').toLowerCase() });
  }, true);
}

// Frames on hold, for `blind`: while held, what the page asks to run on its
// next frame waits, as on a busy Chromebook that handles a key before it
// draws again; released, it all runs on the next real frame. (As the restore
// race holds the restore's frame: restoredDraftFocusRaceJourneys.mjs.) Typed
// with no hold, the key reaches the tile first only now and then (1 of 120
// runs at 4x and 6x, measured for #386), so only a hold makes it every run.
function installFrameHold() {
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const held = new Map();
  let serial = 0;
  let holding = false;
  window.requestAnimationFrame = (callback) => {
    if (!holding) return nativeRequest(callback);
    serial += 1;
    held.set(-serial, callback);
    return -serial;
  };
  window.cancelAnimationFrame = (id) => {
    if (held.has(id)) held.delete(id);
    else nativeCancel(id);
  };
  window.__frames = {
    hold: () => { holding = true; },
    release: () => {
      holding = false;
      const callbacks = [...held.values()];
      held.clear();
      nativeRequest((time) => callbacks.forEach((callback) => callback(time)));
    },
  };
}

/* ------------------------------------------------------------- the page */

const pageUrl = (scene) => `${ORIGIN}/tests/browser/stepAlgebraFirstOperand.html?scene=${scene}&run=${Date.now()}`;
const divide = (page) => page.locator('button[aria-label="Choose Divide by operation"]:visible').first();
const operandBox = (page) => page.locator('.algebra-operation-composer math-field').first();
const settle = (page, ms) => page.waitForTimeout(ms);

const open = async (scene, device) => {
  const context = await browser.newContext(DEVICES[device]);
  await context.addInitScript(installFrameHold);
  await context.addInitScript(installOperandWatch);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${scene} ${device}: page error ${error.message}`));
  const cdp = await context.newCDPSession(page);
  await page.goto(pageUrl(scene), { timeout: 180_000 });
  await page.locator('.mathmaster-question-engine').first().waitFor({ timeout: 180_000 });
  return { context, page, cdp };
};
const throttle = (cdp, rate) => cdp.send('Emulation.setCPUThrottlingRate', { rate });

// A fresh stage in place: the next question, with a draft key of its own.
const freshStage = async (page) => {
  const mount = await page.evaluate(() => {
    window.__operandLog.length = 0;
    const next = Number(document.querySelector('[data-question-stage]').dataset.mount) + 1;
    window.__fresh();
    return next;
  });
  await page.waitForFunction((value) => document.querySelector('[data-question-stage]')?.dataset.mount === String(value), mount, { timeout: 60_000 });
};

const typeStepOne = async (page) => {
  const box = page.locator('.workflow-stage math-field').first();
  await box.waitFor({ timeout: 120_000 });
  await box.click();
  await page.keyboard.type('5x=35');
};

// What a student can react to: an element once a frame has painted it. (The
// page lays a new box out before its first frame; a key sent then is typed
// blind, before the box is on screen, and goes to the button still holding
// focus.)
const painted = (page) => page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => setTimeout(resolve, 0)); }));

// Divide and 5, as fast as a student: each the moment it is on screen.
const firstOperand = async (page, device) => {
  await divide(page).waitFor({ timeout: 120_000 });
  if (device === 'phone') {
    await divide(page).tap();
    const five = page.locator('.algebra-operation-composer button[aria-label="Insert 5"]').first();
    await five.waitFor({ timeout: 60_000 });
    await painted(page);
    await five.tap();
  } else {
    await divide(page).click();
    await operandBox(page).waitFor({ timeout: 60_000 });
    await painted(page);
    await page.keyboard.type('5');
  }
  await page.evaluate(() => {
    const field = document.querySelector('.algebra-operation-composer math-field');
    if (field) field.__r12Typed = true;
  });
};

const operandNow = (page) => page.evaluate(() => {
  const field = document.querySelector('.algebra-operation-composer math-field');
  const keys = Object.keys(window.localStorage).filter((key) => key.endsWith(':step-algebra'));
  const latest = keys.map((key) => JSON.parse(window.localStorage.getItem(key))).sort((a, b) => (b.touchedAt || 0) - (a.touchedAt || 0))[0];
  return {
    box: field ? field.value : null,
    sameBox: Boolean(field?.__r12Typed),
    draft: latest?.value?.operand ?? null,
    operation: latest?.value?.armedTile?.operation || null,
    log: (window.__operandLog || []).map((entry) => JSON.stringify(entry)).join(' '),
  };
});

const judge = (label, after) => {
  const kept = after.box === '5' && after.draft === '5' && after.operation === 'divide' && after.sameBox;
  count(label, !kept);
  if (!kept) check(false, `${label}: the first operand is kept`, `box ${JSON.stringify(after.box)}, draft ${JSON.stringify(after.draft)}, ${after.sameBox ? 'same box' : 'the box was replaced'}\n      ${after.log}`);
};

/* ============================================================ R12 races */

const raceScene = async (journey, device) => {
  const scene = journey === 'cold' ? 'plain' : journey;
  const { context, page, cdp } = await open(scene, device);
  for (const rate of THROTTLE) {
    const label = `${journey} ${device} ×${rate}`;
    for (let index = 0; index < REPEAT; index += 1) {
      if (journey === 'cold') {
        await throttle(cdp, 1);
        await page.goto(pageUrl(scene), { timeout: 180_000 });
        await page.locator('.mathmaster-question-engine').first().waitFor({ timeout: 180_000 });
        await throttle(cdp, rate);
      } else {
        await throttle(cdp, rate);
        await freshStage(page);
      }
      if (journey === 'steps' || journey === 'list') await typeStepOne(page);
      if (journey === 'steps') await page.getByRole('button', { name: /Next step/ }).click();
      await firstOperand(page, device);
      await settle(page, 1000 * rate);
      judge(label, await operandNow(page));
    }
    const { runs, lost } = tally[label] || { runs: 0, lost: 0 };
    check(lost === 0, `${label}: ${runs - lost} of ${runs} fresh stages kept the first operand`);
  }
  await throttle(cdp, 1);
  await context.close();
};

for (const journey of ['plain', 'cold', 'steps', 'list']) {
  if (!wanted(journey)) continue;
  console.log(`\n${journey}`);
  for (const device of deviceNames) await raceScene(journey, device);
}

/* ======================================================== a blind digit */

// Typed before the frame in `blind`, after the digit: a pair opened, a pair
// left open, and two of MathLive's inline shortcuts.
const BLIND_OPERANDS = ['(-5)', '(', 'pi', 'sqrt(2)'];

// Where the cursor is: the operation box, or what else holds it.
const cursorOn = (page) => page.evaluate(() => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  let owner = active;
  while (owner?.getRootNode?.()?.host) owner = owner.getRootNode().host;
  if (owner && owner === document.querySelector('.algebra-operation-composer math-field')) return 'the operation box';
  const group = owner?.closest?.('.algebra-rail-left') ? ' in the left rail'
    : owner?.closest?.('.algebra-rail-right') ? ' in the right rail'
      : owner?.closest?.('.algebra-mobile-operation-palette') ? ' in the phone palette' : '';
  return `${String(owner?.tagName || 'nothing').toLowerCase()} "${owner?.getAttribute?.('aria-label') || ''}"${group}`;
});

if (wanted('blind') && deviceNames.includes('chromebook')) {
  console.log('\nblind');
  const { context, page, cdp } = await open('plain', 'chromebook');
  for (const rate of THROTTLE) {
    const label = `blind chromebook ×${rate}`;
    let blind = 0;
    for (let index = 0; index < REPEAT; index += 1) {
      await throttle(cdp, rate);
      await freshStage(page);
      await divide(page).waitFor({ timeout: 120_000 });
      await painted(page);
      await page.evaluate(() => window.__frames.hold());
      await divide(page).click();
      await page.keyboard.type('5');
      await page.evaluate(() => {
        const field = document.querySelector('.algebra-operation-composer math-field');
        if (field) field.__r12Typed = true;
        window.__frames.release();
      });
      await settle(page, 1000 * rate);
      const after = await operandNow(page);
      const cursor = await cursorOn(page);
      // Typed blind: the key reached something other than the box.
      if (/"key":"5","to":"(?!operation box)/.test(after.log)) blind += 1;
      const kept = after.box === '5' && after.draft === '5' && after.operation === 'divide' && after.sameBox && cursor === 'the operation box';
      count(label, !kept);
      if (!kept) check(false, `${label}: the digit is in the box, and the box has the cursor`, `box ${JSON.stringify(after.box)}, draft ${JSON.stringify(after.draft)}, cursor on ${cursor}\n      ${after.log}`);
    }
    const { runs, lost } = tally[label] || { runs: 0, lost: 0 };
    check(lost === 0, `${label}: ${runs - lost} of ${runs} digits typed before a frame are in the box (${blind} reached the tile first)`);
  }

  // Not a digit only (review after 608e5ee6). The key that reaches the tile was
  // put in the box as typed text, past the box's own keyboard path: "(" typed
  // before the frame stayed a bare "(" — "(-5)" became \left((-5\right),
  // shown "((-5)", and placed on both sides it failed with "Parenthesis )
  // expected"; "(" alone stayed open — and "pi" and "sqrt(2)" stayed letters,
  // every time. Each operand's every key is typed before the frame; what the
  // box and the draft then hold must be what the same keys give once the box
  // has the cursor, measured first on a fresh stage.
  const typedOnce = {};
  await throttle(cdp, 1);
  for (const operand of BLIND_OPERANDS) {
    await freshStage(page);
    await divide(page).waitFor({ timeout: 120_000 });
    await divide(page).click();
    await operandBox(page).waitFor({ timeout: 60_000 });
    await painted(page);
    await settle(page, 400);
    await page.keyboard.type(operand, { delay: 30 });
    await settle(page, 800);
    const control = await operandNow(page);
    typedOnce[operand] = { box: control.box, draft: control.draft };
    const typed = control.box === control.draft && control.operation === 'divide';
    check(typed, `blind: "${operand}" typed in the box once it has the cursor gives ${JSON.stringify(control.box)}`, typed ? '' : JSON.stringify(control));
  }
  for (const rate of THROTTLE) {
    const label = `blind chromebook ×${rate}, keys that are not a digit`;
    for (const operand of BLIND_OPERANDS) {
      await throttle(cdp, rate);
      await freshStage(page);
      await divide(page).waitFor({ timeout: 120_000 });
      await painted(page);
      await page.evaluate(() => window.__frames.hold());
      await divide(page).click();
      await page.keyboard.type(operand, { delay: 30 });
      await page.evaluate(() => {
        const field = document.querySelector('.algebra-operation-composer math-field');
        if (field) field.__r12Typed = true;
        window.__frames.release();
      });
      await settle(page, 1000 * rate);
      const after = await operandNow(page);
      const cursor = await cursorOn(page);
      const reachedTile = new RegExp(`"key":"${operand[0].replace(/[()]/g, '\\$&')}","to":"(?!operation box)`).test(after.log);
      const expected = typedOnce[operand];
      const kept = after.box === expected.box && after.draft === expected.draft && after.operation === 'divide' && after.sameBox && cursor === 'the operation box';
      count(label, !kept);
      check(kept, `${label}: "${operand}" typed before a frame gives ${JSON.stringify(expected.box)}, as typed in the box${reachedTile ? '' : ' (its first key did not reach the tile)'}`, kept ? '' : `box ${JSON.stringify(after.box)}, draft ${JSON.stringify(after.draft)}, cursor on ${cursor}\n      ${after.log}`);
    }
  }
  await throttle(cdp, 1);
  await context.close();
}

/* ======================================================== Space held */

// A review after #386: a tile is pressed by Space as Space comes up, and the
// type-ahead into its box listens only on the tile already chosen. A 5 typed
// while Space was still held reached a tile not chosen yet and was lost: Space
// held, 5, Space up left the box empty, and with 6 typed after the release the
// box held only the 6.
const SPACE_PRESSES = [
  { name: 'Space held, 5, Space up', typed: '5', run: async (page) => { await page.keyboard.down('Space'); await page.keyboard.press('5'); await page.keyboard.up('Space'); } },
  { name: 'Space held, 5, Space up, then 6', typed: '56', run: async (page) => { await page.keyboard.down('Space'); await page.keyboard.press('5'); await page.keyboard.up('Space'); await page.keyboard.press('6'); } },
  {
    name: 'Space held, 5 before the next frame, Space up',
    typed: '5',
    run: async (page) => {
      await page.evaluate(() => window.__frames.hold());
      await page.keyboard.down('Space');
      await page.keyboard.press('5');
      await page.keyboard.up('Space');
      await page.evaluate(() => window.__frames.release());
    },
  },
  { name: 'Space alone', typed: '', run: (page) => page.keyboard.press('Space') },
  { name: 'Enter, then 5', typed: '5', run: async (page) => { await page.keyboard.press('Enter'); await page.keyboard.press('5'); } },
];

if (wanted('space') && deviceNames.includes('chromebook')) {
  console.log('\nspace');
  const { context, page, cdp } = await open('plain', 'chromebook');
  for (const rate of THROTTLE) {
    for (const how of SPACE_PRESSES) {
      const label = `space chromebook ×${rate}, ${how.name}`;
      await throttle(cdp, rate);
      await freshStage(page);
      await divide(page).waitFor({ timeout: 120_000 });
      await painted(page);
      await divide(page).focus();
      await how.run(page);
      await settle(page, 1000 * rate);
      const after = await operandNow(page);
      const cursor = await cursorOn(page);
      const kept = after.box === how.typed && after.draft === how.typed && after.operation === 'divide' && cursor === 'the operation box';
      count(label, !kept);
      check(kept, `${label}: Divide is chosen and its box holds ${JSON.stringify(how.typed)}, with the cursor`, kept ? '' : `box ${JSON.stringify(after.box)}, draft ${JSON.stringify(after.draft)}, cursor on ${cursor}\n      ${after.log}`);
    }
  }
  await throttle(cdp, 1);
  await context.close();
}

/* ==================================================== after a whole step */

const press = (locator, device) => (device === 'phone' ? locator.tap() : locator.click());
const boardState = (page) => page.evaluate(() => String(document.querySelector('[data-math-state]')?.getAttribute('data-math-state') || '').replace(/[\s~]/g, ''));

// Divide by 5, placed on both sides, the 5s crossed out, 7 typed as the right
// side (stagedStep), and checked: with Enter, or with Check my simplification.
const stagedStep = async (page, device) => {
  await divide(page).waitFor({ timeout: 120_000 });
  await press(divide(page), device);
  await operandBox(page).waitFor({ timeout: 60_000 });
  await painted(page);
  if (device === 'phone') {
    await page.locator('.algebra-operation-composer button[aria-label="Insert 5"]').first().tap();
    await settle(page, 200);
    await page.locator('.algebra-pickup-button').first().tap();
  } else {
    await page.keyboard.type('5');
    await settle(page, 200);
    await page.keyboard.press('Enter');
  }
  await settle(page, 300);
  await press(page.locator('[aria-label$="on the left side"]').first(), device);
  await settle(page, 300);
  await press(page.locator('[aria-label$="on the right side"]').first(), device);
  await press(page.locator('[aria-label="5, mark this factor for cancellation"]').first(), device);
  const simplification = page.locator('math-field[aria-label="Right side: enter your simplification"]').first();
  await simplification.waitFor({ timeout: 30_000 });
  await press(simplification, device);
  await painted(page);
  if (device === 'phone') await page.locator('button[aria-label="Insert 7"]').filter({ visible: true }).first().tap();
  else await page.keyboard.type('7');
  await settle(page, 300);
};
const wholeStep = async (page, device, how) => {
  await stagedStep(page, device);
  if (how === 'Enter') await page.keyboard.press('Enter');
  else await press(page.locator('button.algebra-check-simplification'), device);
  for (let tries = 0; tries < 40 && await boardState(page) !== 'x=7'; tries += 1) await settle(page, 250);
};

if (wanted('check')) {
  console.log('\ncheck');
  for (const device of deviceNames) {
    const { context, page, cdp } = await open('plain', device);
    const expected = device === 'phone' ? 'button "Choose Divide by operation" in the phone palette' : 'button "Choose Divide by operation" in the left rail';
    for (const rate of THROTTLE) {
      for (const how of device === 'phone' ? ['Check my simplification'] : ['Enter', 'Check my simplification']) {
        const label = `check ${device} ×${rate}, ${how}`;
        await throttle(cdp, rate);
        await freshStage(page);
        await wholeStep(page, device, how);
        await settle(page, 600 * rate);
        check(await boardState(page) === 'x=7', `${label}: the step is committed (x = 7)`, await boardState(page));
        const cursor = await cursorOn(page);
        check(cursor === expected, `${label}: the cursor is back on the Divide tile the move began from`, cursor);
      }
    }
    await throttle(cdp, 1);
    await context.close();
  }
}

/* ============================================ a pair cancelled on its own */

// One term of the pair, pressed the way the directions say (Tab to it and
// press Enter: focused, then Enter) or with the pointer.
const cancelPair = async (page, device, how) => {
  const term = page.locator('[aria-label$=", select to cancel"]').nth(1);
  await term.waitFor({ timeout: 60_000 });
  await painted(page);
  if (how === 'keyboard') {
    await term.focus();
    await page.keyboard.press('Enter');
  } else {
    await press(term, device);
  }
};

if (wanted('cancel')) {
  console.log('\ncancel');
  for (const [scene, side, after] of [['cancel', 'left', 'x=9'], ['cancelRight', 'right', 'x=9']]) {
    for (const device of deviceNames) {
      const { context, page, cdp } = await open(scene, device);
      const expected = device === 'phone' ? 'button "Choose Add operation" in the phone palette' : `button "Choose Add operation" in the ${side} rail`;
      for (const rate of THROTTLE) {
        for (const how of ['keyboard', 'pointer']) {
          const label = `cancel ${scene} ${device} ×${rate}, ${how}`;
          await throttle(cdp, rate);
          await freshStage(page);
          await cancelPair(page, device, how);
          for (let tries = 0; tries < 40 && await boardState(page) !== after; tries += 1) await settle(page, 250);
          await settle(page, 600 * rate);
          check(await boardState(page) === after, `${label}: the cancellation is committed (${after})`, await boardState(page));
          const cursor = await cursorOn(page);
          check(cursor === expected, `${label}: the cursor is on the cancelled side's first operation tile`, cursor);
        }
      }
      await throttle(cdp, 1);
      await context.close();
    }
  }
}

/* ===================================================== a second press */

// A review after #386: a balanced step settles for 620 ms before it is saved,
// and Check my simplification took a second press in between. Two clicks
// committed the step twice: 2 step grades, 2 work steps "Divided both sides
// by 5" (one press: 1 and 1). Measured on the base in Chromium for every way
// below that reaches Check, and in a composed question's step; Keep as
// written and a cancelled pair already refused the second press.
const commitsNow = (page) => page.evaluate(() => {
  const keys = Object.keys(window.localStorage).filter((key) => key.endsWith(':step-algebra'));
  const latest = keys.map((key) => JSON.parse(window.localStorage.getItem(key))).sort((a, b) => (b.touchedAt || 0) - (a.touchedAt || 0))[0];
  return { grades: window.__steps.length, workSteps: (latest?.value?.workSteps || []).length };
});
// A second click or tap lands where the first did, on whatever is there by
// then: a disabled button takes nothing (a locator would wait for it).
const centreOf = async (locator) => {
  // In the middle of the screen, clear of the question's sticky bar, and
  // shown to be what a press there reaches.
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = await locator.boundingBox();
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reached = await locator.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), at);
  if (!reached) throw new Error(`a press at the centre of ${await locator.evaluate((element) => element.outerHTML.slice(0, 80))} reaches something else`);
  return at;
};
const SECOND_PRESS_MS = 120;
const twice = async (page, act) => {
  await act();
  await settle(page, SECOND_PRESS_MS);
  await act();
};
const checkButton = (page) => page.locator('button.algebra-check-simplification').first();
const pairTerm = (page) => page.locator('[aria-label$=", select to cancel"]').nth(1);
const clickTwice = async (page, locator) => {
  const at = await centreOf(locator);
  await twice(page, () => page.mouse.click(at.x, at.y));
};
const DOUBLE_PRESSES = [
  { scene: 'plain', device: 'chromebook', how: 'Check my simplification clicked twice', run: (page) => clickTwice(page, checkButton(page)) },
  { scene: 'plain', device: 'chromebook', how: 'Check my simplification double-clicked', run: async (page) => { const at = await centreOf(checkButton(page)); await page.mouse.dblclick(at.x, at.y); } },
  { scene: 'plain', device: 'chromebook', how: 'Enter twice in the simplification box', run: (page) => twice(page, () => page.keyboard.press('Enter')) },
  { scene: 'plain', device: 'chromebook', how: 'the number pad\'s Enter twice in the box', run: (page) => twice(page, () => page.keyboard.press('NumpadEnter')) },
  { scene: 'plain', device: 'chromebook', how: 'Enter twice on Check my simplification', run: async (page) => { await checkButton(page).focus(); await twice(page, () => page.keyboard.press('Enter')); } },
  { scene: 'plain', device: 'chromebook', how: 'Space twice on Check my simplification', run: async (page) => { await checkButton(page).focus(); await twice(page, () => page.keyboard.press(' ')); } },
  { scene: 'plain', device: 'chromebook', how: 'Keep as written clicked twice', board: 'x=\\frac{35}{5}', run: (page) => clickTwice(page, page.locator('button.algebra-keep-written').first()) },
  { scene: 'plain', device: 'phone', how: 'Check my simplification tapped twice', run: async (page) => { const at = await centreOf(checkButton(page)); await twice(page, () => page.touchscreen.tap(at.x, at.y)); } },
  { scene: 'cancel', device: 'chromebook', how: 'Enter twice on a term of the pair', board: 'x=9', run: async (page) => { await pairTerm(page).focus(); await twice(page, () => page.keyboard.press('Enter')); } },
  { scene: 'cancel', device: 'chromebook', how: 'a term of the pair double-clicked', board: 'x=9', run: async (page) => { const at = await centreOf(pairTerm(page)); await page.mouse.dblclick(at.x, at.y); } },
  { scene: 'cancel', device: 'phone', how: 'a term of the pair tapped twice', board: 'x=9', run: async (page) => { const at = await centreOf(pairTerm(page)); await twice(page, () => page.touchscreen.tap(at.x, at.y)); } },
  // A composed question's balance step reports no step grade to this host: its work steps say it.
  { scene: 'steps', device: 'chromebook', how: 'Check my simplification clicked twice in a composed question', composed: true, run: (page) => clickTwice(page, checkButton(page)) },
  { scene: 'steps', device: 'chromebook', how: 'Enter twice in a composed question\'s simplification box', composed: true, run: (page) => twice(page, () => page.keyboard.press('Enter')) },
];

if (wanted('double')) {
  console.log('\ndouble');
  const rate = THROTTLE[0];
  const groups = [...new Set(DOUBLE_PRESSES.map((way) => `${way.scene}|${way.device}`))];
  for (const group of groups) {
    const [scene, device] = group.split('|');
    if (!deviceNames.includes(device)) continue;
    const { context, page, cdp } = await open(scene, device);
    await throttle(cdp, rate);
    for (const way of DOUBLE_PRESSES.filter((entry) => `${entry.scene}|${entry.device}` === group)) {
      const label = `double ${device} ×${rate}: ${way.how}`;
      await freshStage(page);
      if (scene === 'cancel') {
        await pairTerm(page).waitFor({ timeout: 60_000 });
        await painted(page);
      } else {
        if (scene === 'steps') {
          await typeStepOne(page);
          await page.getByRole('button', { name: /Next step/ }).click();
        }
        await stagedStep(page, device);
      }
      const before = await commitsNow(page);
      const boardBefore = await boardState(page);
      await way.run(page);
      for (let tries = 0; tries < 40 && await boardState(page) === boardBefore; tries += 1) await settle(page, 250);
      // Long enough for a second commit to settle and be saved too.
      await settle(page, 2000 * rate);
      const after = await commitsNow(page);
      const board = await boardState(page);
      const expectedBoard = way.board || 'x=7';
      const grades = after.grades - before.grades;
      const once = board === expectedBoard && after.workSteps === 1 && (way.composed ? grades <= 1 : grades === 1);
      check(once, `${label}: the step is committed once (${expectedBoard})`, `${grades} step grade(s), ${after.workSteps} work step(s), board ${board}`);
    }
    await throttle(cdp, 1);
    await context.close();
  }
}

await browser.close();

if (Object.keys(tally).length) {
  console.log('\nFirst operands lost, by journey, device and speed:');
  Object.entries(tally).forEach(([label, { runs, lost }]) => console.log(`  ${label}: ${lost} of ${runs}`));
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nEvery fresh stage kept its first operand.');

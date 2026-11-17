// THE FIRST OPERAND ON A FRESH STEP ALGEBRA STAGE IS KEPT (issue #386 R12).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/stepAlgebraFirstOperand.mjs
//
//   ONLY=plain,cold,steps,list   some journeys (names below)
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
//
// A saved draft that arrives from the server after the student started is
// raced in the real App: tests/browser/teacherWorkflow/
// stepAlgebraOperandDraftJourneys.mjs.
//
// Exit code 1 on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const JOURNEYS = ['plain', 'cold', 'steps', 'list'];
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

/* ------------------------------------------------------------- the page */

const pageUrl = (scene) => `${ORIGIN}/tests/browser/stepAlgebraFirstOperand.html?scene=${scene}&run=${Date.now()}`;
const divide = (page) => page.locator('button[aria-label="Choose Divide by operation"]:visible').first();
const operandBox = (page) => page.locator('.algebra-operation-composer math-field').first();
const settle = (page, ms) => page.waitForTimeout(ms);

const open = async (scene, device) => {
  const context = await browser.newContext(DEVICES[device]);
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

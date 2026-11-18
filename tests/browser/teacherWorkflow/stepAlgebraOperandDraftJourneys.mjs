// THE OPERAND A STUDENT TYPES ON A FRESH STEP ALGEBRA STAGE OUTLIVES THE
// SERVER'S COPY ARRIVING, IN THE REAL APP (issue #386 R12).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/stepAlgebraOperandDraftJourneys.mjs
//
//   ONLY=fresh,cancelled,reload,stepped,phone   some journeys (names below)
//   REPEAT=<n>       random races of each journey at each speed (default 2)
//   THROTTLE=1,4,6   CPU throttling rates the races run at (default 1,4), set
//                    once the question is on screen
//   (TEACHER_HARNESS_ORIGIN, PLAYWRIGHT_MODULE, CHROMIUM_PATH as in
//    draftCrossDeviceJourneys.mjs.)
//
// The real App.jsx — its read of the student's drafts as the lesson opens, the
// settle of each Step Algebra draft against the server's copy, the remount —
// with `firebase/*` faked. Today's lesson is the student runtime lesson
// (`?questions=runtime`); its Classwork question 3 is Step Algebra, 3x − 5 = 10.
//
// THE RACE (R12, reproduced on this harness before the fix, every time): a
// Chromebook opens the question before the server's copy of the drafts has
// been read, and the student chooses Divide and types 3. The copy that lands
// holds the same board, saved on another Chromebook with an older operation
// (Divide, 7) or none (cancelled). Choosing an operation and typing its value
// date nothing (workspaceDraftSchema.mjs), so the two copies' work was a tie,
// and a copy begun before the read yields: the question was remounted and the
// box said 7, or was gone. questionDraftStorage.js now keeps the later
// operation when the two copies hold the same committed board.
//
// HELD, THEN RACED. The page holds every read of the drafts
// (`?draftReadHold=1`, fakeFirestore.js) until the driver lets it through: once
// right after the student's key (the order that always lost), then REPEAT
// times at each THROTTLE rate at a random moment from the student's press on
// Divide reaching the draft to well after the key. (A read let through before
// that press is a restore shown before the student acts: a student who then
// presses Divide and types 3 at once gets 73, as before. It is not this race.)
// A run counts as lost when the box or the draft does not end with what the
// student typed; the question being remounted under them is reported too. The
// operand's draft writes and the box's value every frame are logged for a run
// that fails.
//
//   fresh      Chromebook B opens the question fresh; the saved copy (A) holds
//              Divide 7 on the same board. B's box keeps 3, its draft holds 3,
//              and the question is not remounted.
//   cancelled  A cancelled its operation: B's box stays open with its 3.
//   reload     A reloads; its own copy brings Divide 7 back, and the student
//              types 3 over it: 3 stays, and nothing is remounted (a settle
//              that changed nothing used to remount the question every time).
//   stepped    A took a step (3x = 15): it comes back whole over B's operation,
//              which was typed for 3x − 5 = 10 — saved steps still win.
//   phone      fresh, on a 390×844 phone: Divide and 3 tapped, the 3 on the
//              math keypad.
//
// Exit code 1 on any failure.

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const JOURNEYS = ['fresh', 'cancelled', 'reload', 'stepped', 'phone'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const REPEAT = Number(process.env.REPEAT ?? 2);
const THROTTLE = (process.env.THROTTLE || '1,4').split(',').map(Number).filter((rate) => rate >= 1);
const STUDENT = '910002';
const DOC = `studentWorkspaceDrafts/${STUDENT}__a-today`;
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const QUESTION = `${ORIGIN}/assignments/a-today/classwork/3`;
const AS_STUDENT = `as=student&studentId=${STUDENT}&questions=runtime`;
const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
};

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

// Runs in the page before the app: every Step Algebra draft write (its
// operand, operation and whether it is still fresh) and what the operation box
// shows each frame, so a failing run says who changed the value, and when.
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
        log.push({
          t: at(), draft: envelope?.value?.operand ?? null, operation: envelope?.value?.armedTile?.operation || null, fresh: envelope?.fieldsFresh === true,
        });
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
}

/* ------------------------------------------------------------- the board */

const operationButton = (page, label) => page.locator(`button[aria-label="Choose ${label} operation"]:visible`).first();
const operandBox = (page) => page.locator('.algebra-operation-composer math-field').first();
const settle = (page, ms) => page.waitForTimeout(ms);

const board = (page) => page.evaluate(() => {
  const field = document.querySelector('.algebra-operation-composer math-field');
  const key = Object.keys(window.localStorage).find((name) => name.endsWith(':step-algebra'));
  const envelope = key ? JSON.parse(window.localStorage.getItem(key)) : null;
  return {
    box: field ? field.value : null,
    // The question the student started on is the same element: nothing
    // remounted it under them.
    sameQuestion: Boolean(document.querySelector('.mathmaster-question-engine')?.__r12Started),
    draft: envelope?.value?.operand ?? null,
    operation: envelope?.value?.armedTile?.operation || null,
    fresh: envelope?.fieldsFresh === true,
    equation: document.querySelector('[data-math-state]')?.getAttribute('data-math-state') || null,
  };
});
const markQuestion = (page) => page.evaluate(() => {
  const question = document.querySelector('.mathmaster-question-engine');
  if (question) question.__r12Started = true;
});
const logOf = (page) => page.evaluate(() => (window.__operandLog || []).map((entry) => JSON.stringify(entry)).join(' '));

// The held read has come back and App has settled the drafts: the opening
// read is a transaction's read of the drafts document.
const readLanded = async (page, rate) => {
  await page.waitForFunction((doc) => (window.__mmHarnessStore.stats().transactionReads?.[doc] || 0) > 0, DOC, { timeout: 60_000 * rate });
  await settle(page, 1200 * rate);
};

/* ------------------------------------------------------------- devices */

const openDevice = async ({ server = null, storageState = null, device = 'chromebook', rate = 1, hold = true } = {}) => {
  const context = await newSchoolContext(browser, { ...DEVICES[device], ...(storageState ? { storageState } : {}) });
  if (server) {
    await context.addInitScript(([key, value]) => {
      // Once per tab: what this device saves afterwards is its own.
      if (window.sessionStorage.getItem('mm-r12-server')) return;
      window.sessionStorage.setItem('mm-r12-server', '1');
      window.localStorage.setItem(key, value);
    }, [DB_KEY, server]);
  }
  await context.addInitScript(installOperandWatch);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
  await page.goto(`${QUESTION}?${AS_STUDENT}${hold ? '&draftReadHold=1' : ''}`, { timeout: 180_000 });
  await operationButton(page, 'Divide by').waitFor({ timeout: 180_000 });
  // The race is run slowed: the student's presses, the read landing, the
  // settle and any remount (the app's own first load is not).
  if (rate > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
  return { context, page };
};

const serverDb = (page) => page.evaluate((key) => window.localStorage.getItem(key), DB_KEY);
const savedDraft = (page) => page.evaluate((doc) => {
  const stored = window.__mmHarnessStore.get(doc);
  const entry = (stored?.entries || []).find((item) => String(item.key).endsWith(':step-algebra'));
  return entry ? JSON.parse(entry.valueJson) : null;
}, DOC);
// The server copy once it holds what `test` asks for (the background save
// waits for its debounce, and a loaded machine for longer), or as it is after
// a minute.
const savedWhen = async (page, test) => {
  const deadline = Date.now() + 60_000;
  let saved = await savedDraft(page);
  while (!test(saved) && Date.now() < deadline) {
    await settle(page, 500);
    saved = await savedDraft(page);
  }
  return saved;
};

// What a student does on the board: one balanced step. Add 5 on both sides,
// cross out −5 and +5, and simplify 10 + 5 to 15.
const equationShown = async (page) => String(await page.locator('[data-math-state]').first().getAttribute('data-math-state')).replace(/[\s~]/g, '');
const addFive = async (page) => {
  await operationButton(page, 'Add').click();
  await operandBox(page).waitFor();
  await page.keyboard.type('5');
  await page.locator('button.algebra-pickup-button').click();
  await page.locator('[aria-label$="on the left side"]').first().click();
  await settle(page, 300);
  await page.locator('[aria-label$="on the right side"]').first().click();
  await page.locator('[aria-label="plus 5, select to cancel"]').first().click();
  const right = page.locator('math-field[aria-label="Right side: enter your simplification"]').first();
  await right.waitFor({ timeout: 30_000 });
  await right.click();
  await page.keyboard.type('15');
  await page.locator('button.algebra-check-simplification').click();
  for (let tries = 0; tries < 20 && await equationShown(page) !== '3x=15'; tries += 1) await settle(page, 300);
  return await equationShown(page) === '3x=15';
};

/* ======================================= Chromebook A leaves three copies */

console.log('Chromebook A works on the question');
const A = await newSchoolContext(browser, DEVICES.chromebook);
const pageA = await A.newPage();
pageA.on('pageerror', (error) => failures.push(`A: page error ${error.message}`));
await pageA.goto(`${PAGE}?${AS_STUDENT}&reset=1`, { timeout: 180_000 });
await pageA.getByText('Log Out').first().waitFor({ timeout: 180_000 });
await pageA.goto(`${QUESTION}?${AS_STUDENT}`, { timeout: 180_000 });
await operationButton(pageA, 'Divide by').waitFor({ timeout: 180_000 });
await settle(pageA, 1000);
await operationButton(pageA, 'Divide by').click();
await operandBox(pageA).waitFor();
await pageA.keyboard.type('7');
const stagedA = await savedWhen(pageA, (saved) => saved?.operand === '7');
check(stagedA?.operand === '7' && stagedA?.armedTile?.operation === 'divide', 'A: Divide 7, not applied, reaches the server copy', JSON.stringify(stagedA));
const SERVERS = { staged: await serverDb(pageA) };
const storageA = await A.storageState();
await pageA.locator('button.algebra-composer-cancel').click();
const cancelledA = await savedWhen(pageA, (saved) => saved && !saved.armedTile);
check(cancelledA && !cancelledA.armedTile && cancelledA.operand === '', 'A: the cancelled operation reaches the server copy', JSON.stringify(cancelledA));
SERVERS.cancelled = await serverDb(pageA);
if (wanted('stepped')) {
  check(await addFive(pageA), 'A: Add 5 on both sides, the 5s crossed out, 10 + 5 simplified (3x = 15)');
  const steppedA = await savedWhen(pageA, (saved) => saved?.workSteps?.length === 1);
  check(steppedA?.workSteps?.length === 1, 'A: the step reaches the server copy', JSON.stringify(steppedA?.equation));
  SERVERS.stepped = await serverDb(pageA);
}
await A.close();

/* ============================================================ the race */

/*
 * One run: the device opens the question with the read held, and the student
 * chooses Divide and types 3 at once. The read is let through `releaseAfterMs`
 * after the press on Divide (null: right after the key), and the board is read
 * once App has settled the drafts.
 */
const race = async ({ journey, server = null, storageState = null, device = 'chromebook', rate = 1, releaseAfterMs = null }) => {
  const { context, page } = await openDevice({ server, storageState, device, rate });
  const phone = device === 'phone';
  const release = () => page.evaluate(() => window.__mmHarnessStore.releaseDraftReads());
  await markQuestion(page);
  // A box the read closes before it is there is never there: the student
  // types anyway, and the run is judged on what the page holds. A box that
  // is there is typed in once a frame has painted it: what a student can
  // react to (a key sent before then goes to the button still holding focus).
  const painted = () => page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => setTimeout(resolve, 0)); }));
  const appears = (locator) => locator.waitFor({ timeout: 15_000 * rate }).then(painted).then(() => true, () => false);
  const student = (async () => {
    if (journey === 'reload') {
      // The operation came back from this Chromebook's own copy: the student
      // types 3 over the restored 7.
      if (await appears(operandBox(page))) {
        await operandBox(page).click();
        await page.keyboard.press('Control+a');
      }
      await page.keyboard.type('3');
    } else if (phone) {
      await operationButton(page, 'Divide by').tap();
      const key = page.locator('.algebra-operation-composer button[aria-label="Insert 3"]').first();
      if (await appears(key)) await key.tap();
    } else {
      await operationButton(page, 'Divide by').click();
      await appears(operandBox(page));
      await page.keyboard.type('3');
    }
  })();
  // R12 is the read landing after the student has started: from the moment
  // their press on Divide is in the draft. (A read that lands before it is a
  // restore of the other Chromebook's work, shown before the student acts.)
  // On a reload the operation is there already: from the press on the box.
  const started = journey === 'reload' ? Promise.resolve() : page.waitForFunction(() => {
    const key = Object.keys(window.localStorage).find((name) => name.endsWith(':step-algebra'));
    const envelope = key ? JSON.parse(window.localStorage.getItem(key)) : null;
    return envelope?.savedAtIsEdit === true && envelope.value?.armedTile?.operation === 'divide';
  }, null, { timeout: 60_000 * rate });
  if (releaseAfterMs === null) {
    await student;
    await release();
  } else {
    await Promise.all([student, started.then(() => settle(page, releaseAfterMs)).then(release)]);
  }
  await readLanded(page, rate);
  const after = await board(page);
  const log = await logOf(page);
  await context.close();
  return { after, log };
};

const runJourney = async (journey) => {
  const device = journey === 'phone' ? 'phone' : 'chromebook';
  const server = journey === 'reload' ? null : SERVERS[journey === 'phone' || journey === 'fresh' ? 'staged' : journey];
  const storageState = journey === 'reload' ? storageA : null;
  const expectKept = journey !== 'stepped';
  const judge = (label, { after, log }) => {
    if (expectKept) {
      const kept = after.box === '3' && after.draft === '3' && after.operation === 'divide';
      count(label, !kept);
      check(kept, `${label}: the box and the draft keep the student's 3`, kept ? '' : `${JSON.stringify(after)}\n      ${log}`);
      check(after.sameQuestion, `${label}: the question was not remounted under the student`, after.sameQuestion ? '' : JSON.stringify(after));
      check(!after.fresh, `${label}: the draft has been settled against the server copy`);
    } else {
      // Saved steps come back whole; the operation typed for the old equation goes.
      const restored = String(after.equation).replace(/[\s~]/g, '') === '3x=15' && after.operation === null;
      count(label, false);
      check(restored, `${label}: the saved step comes back whole (3x = 15), and the Divide typed for 3x − 5 = 10 goes with the old board`, JSON.stringify(after));
    }
  };
  console.log(`\n${journey}: the read held until the student has typed`);
  judge(`${journey} (held)`, await race({ journey, server, storageState, device }));
  if (journey === 'stepped') return;
  for (const rate of THROTTLE) {
    for (let index = 0; index < REPEAT; index += 1) {
      // From the press on Divide (in the draft) to well after the key, at this speed.
      const releaseAfterMs = Math.round(Math.random() * 600 * rate);
      const label = `${journey} ×${rate}`;
      const result = await race({ journey, server, storageState, device, rate, releaseAfterMs });
      console.log(`  run ${index + 1} (read let through ${releaseAfterMs} ms after the student's press): box ${JSON.stringify(result.after.box)}, draft ${JSON.stringify(result.after.draft)}${result.after.sameQuestion ? '' : ', remounted'}`);
      judge(label, result);
    }
  }
};

for (const journey of JOURNEYS) {
  if (!wanted(journey)) continue;
  await runJourney(journey);
}

await browser.close();

console.log('\nLost, by journey and speed:');
Object.entries(tally).forEach(([label, { runs, lost }]) => console.log(`  ${label}: ${lost} of ${runs}`));
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  failures.forEach((failure) => console.log(`  - ${failure}`));
  process.exit(1);
}
console.log('\nEvery journey kept what the student typed.');

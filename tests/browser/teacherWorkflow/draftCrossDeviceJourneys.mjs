// UNFINISHED WORK ACROSS CHROMEBOOKS, IN THE REAL APP (PQ-044).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/draftCrossDeviceJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed;
//    ONLY=fresh,offline,... to run some journeys.)
//
// The real App.jsx — its draft sync effect, its restore, its question remount —
// with `firebase/*` replaced by the harness fakes. Each "device" is a browser
// context of its own: its own local storage, so its own drafts, and its own
// copy of the in-memory server, which the driver carries from device to device
// as the student moves (the server copy one device saved is what the next one
// reads). The read of `studentWorkspaceDrafts/…` can be made slow
// (`?draftReadMs=`) or the device offline (`?offline=1`, then
// `__mmHarnessStore.setOnline(true)`), see fakeFirestore.js.
//
// Every workspace writes its draft back the moment it mounts. Until PQ-044
// those writes were stamped "now", so a Chromebook that merely OPENED a
// question made its empty boxes the newest work: the server copy then lost the
// restore to them, and the background save carried them over the real work.
//
//   fresh      device A works two questions; a fresh device B opens the
//              assignment with the read quick, then slow: B shows A's work in
//              the question on screen and in the other one, and the server copy
//              is exactly A's afterwards. A itself reloads: its own work, as
//              before, and the server copy unchanged.
//   offline    a fresh device opens offline: its own (empty) boxes, nothing
//              saved; back online: A's work comes in, the server copy is
//              unchanged.
//   directions A works; B opens and edits; A comes back (reopened): B's edit —
//              saved marked as an edit, which is what lets it replace A's own
//              older edit — is what A sees and what the server keeps; A edits
//              again: A's is the newest. B, left open and asleep, is woken: it
//              shows A's newest work, not its own older copy.
//   late       the server copy lands after the student has opened the question
//              on B and clicked into its second box, before typing: the
//              restore remounts the question with A's work, and the cursor is
//              back in the second box, so what the student types goes there —
//              not into the first box, over the slope A wrote.
//   legacy     the rollout: a build from before the edit-time marker merely
//              opens the question on another Chromebook after A's work, and
//              saves its empty boxes dated later, unmarked. A comes back to
//              the work it typed and sends nothing over it; A's next edit wins
//              (marked); a fresh device takes the server copy as an older
//              build would. The same empty boxes saved as an edit (marked)
//              do replace A's older work.
//   canonical  a submitted question reopened on the device that submitted it
//              does not make its pre-submission draft newer than the
//              submission, so another device does not bring that draft back
//              (the harness has no ingestion, so the journey writes the
//              canonical record the server would).
//   practice   post-deadline Practice Mode: the student practises on one
//              device; another opens Practice Mode with the server out of
//              reach and back without an `online` event (its read failed, its
//              save gets through): the saved practice survives, and the next
//              device shows it. With the `online` event: the same.
//
// Exit code 1 on any failure.

import { newSchoolContext, schoolNow } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const STUDENT = '910002';
const ASSIGNMENT = 'a-today';
const DOC = `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}`;
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const VIEWPORT = { width: 1366, height: 900 };
// Two of the lesson's questions (fixture.js, `?questions=real`).
// (6/8 is drawn as a fraction, so it is not in the prompt's text.)
const Q_FRACTION = { index: 1, prompt: /Write .*in lowest terms/ };
const Q_LINE = { index: 2, prompt: /A line passes through \(0, 4\) and \(3, 2\)/ };
const position = (text) => {
  if (Q_LINE.prompt.test(text)) return Q_LINE.index;
  if (Q_FRACTION.prompt.test(text)) return Q_FRACTION.index;
  return /Solve 2y = 10/.test(text) ? 0 : 3;
};
// workspaceDraftSync's debounce is 2.5 s.
const SAVED = 4500;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);

/* ------------------------------------------------------------- devices */

/**
 * A Chromebook. `server`: the server as the previous device left it (the
 * harness database, serialized); none means a freshly seeded school.
 * `storageState`: this device's own browser storage, when it comes back.
 */
const openDevice = async (label, { server = null, storageState = null, params = {} } = {}) => {
  const context = await newSchoolContext(browser, { viewport: VIEWPORT, ...(storageState ? { storageState } : {}) });
  if (server) {
    await context.addInitScript(([key, value]) => {
      // Once per tab: a reload keeps what this device has saved since.
      if (window.sessionStorage.getItem('mm-journey-server')) return;
      window.sessionStorage.setItem('mm-journey-server', '1');
      window.localStorage.setItem(key, value);
    }, [DB_KEY, server]);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${label}: page error ${error.message}`));
  const search = new URLSearchParams({ as: 'student', studentId: STUDENT, questions: 'real', ...params });
  if (!server && !storageState) search.set('reset', '1');
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  return { context, page, search };
};

const openAssignment = async (page) => {
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(400);
};

const stageText = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-stage')?.innerText || '').replace(/\s+/g, ' '));
const fields = (page) => page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-stage math-field')].map((field) => field.value));
const goTo = async (page, question) => {
  for (let step = 0; step < 6 && !question.prompt.test(await stageText(page)); step += 1) {
    const index = position(await stageText(page));
    await page.getByRole('button', { name: index > question.index ? 'Previous question' : 'Next question' }).first().click();
    await page.waitForTimeout(500);
  }
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
};
const typeInto = async (page, index, text) => {
  const field = page.locator('.mathmaster-question-stage math-field').nth(index);
  await field.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 25 });
  await page.keyboard.press('Tab');
};
// What the screen shows, once it has settled on `expected` (a restore lands
// when the read does, and remounts the question) — or what it shows after
// `ms` if it never does.
const shows = async (page, expected, ms = 6000) => {
  const deadline = Date.now() + ms;
  let now = await fields(page);
  while (JSON.stringify(now) !== JSON.stringify(expected) && Date.now() < deadline) {
    await page.waitForTimeout(250);
    now = await fields(page);
  }
  return now;
};

/* -------------------------------------------------------------- server */

const serverDb = (page) => page.evaluate((key) => window.localStorage.getItem(key), DB_KEY);
// The server copy of this assignment's drafts, by key suffix: value, time, and
// whether the time is marked as an edit's (workspaceDraftSchema.mjs).
const serverDrafts = (page) => page.evaluate((doc) => {
  const stored = window.__mmHarnessStore.get(doc);
  return Object.fromEntries((stored?.entries || []).map((entry) => [
    String(entry.key).split(':').slice(6).join(':'),
    { value: JSON.parse(entry.valueJson), savedAt: entry.savedAt, marked: entry.savedAtIsEdit === true },
  ]));
}, DOC);
const waitForServer = async (page, test, ms = 15000) => {
  const deadline = Date.now() + ms;
  let drafts = await serverDrafts(page);
  while (!test(drafts) && Date.now() < deadline) {
    await page.waitForTimeout(300);
    drafts = await serverDrafts(page);
  }
  return drafts;
};
const LINE_KEY = `${Q_LINE.index}:0:student:multi-answer`;
const FRACTION_KEY = `${Q_FRACTION.index}:0:student:multi-answer`;
// This device's own copy of a draft: the envelope in its local storage.
const localDraft = (page, suffix) => page.evaluate(([student, assignment, tail]) => {
  const key = `mathmaster:draft:v2::${student}:${assignment}:${tail}`;
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}, [STUDENT, ASSIGNMENT, suffix]);
// A device's whole storage, with the server replaced by `server`: the same
// Chromebook, opened again after the student worked somewhere else.
const comingBack = (storageState, server) => ({
  ...storageState,
  origins: storageState.origins.map((origin) => ({
    ...origin,
    localStorage: origin.localStorage.map((item) => (item.name === DB_KEY ? { ...item, value: server } : item)),
  })),
});
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
// The server as a build from before the edit-time marker leaves it after
// merely OPENING the line question on another Chromebook: its write-back of
// empty boxes, dated when it opened, over A's work — saved with the entry
// fields that build knows, so no entry keeps a marker. `marked`: the same
// empty boxes saved by this build as the student's edit (they cleared it).
const openedElsewhere = (db, openedAt, { marked = false } = {}) => JSON.stringify(JSON.parse(db).map(([path, data]) => {
  if (path !== DOC) return [path, data];
  return [path, {
    ...data,
    entries: data.entries.map(({ savedAtIsEdit, ...entry }) => {
      if (!String(entry.key).endsWith(`:${LINE_KEY}`)) return marked ? { ...entry, savedAtIsEdit } : entry;
      return { ...entry, valueJson: '{}', savedAt: openedAt, ...(marked ? { savedAtIsEdit: true } : {}) };
    }),
  }];
}));
const hidden = (page, value) => page.evaluate((isHidden) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (isHidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, value);

/* ===================================================== device A works */

let afterA = null;
let serverAfterA = null;
let stateA = null;
if (['fresh', 'offline', 'directions', 'late', 'canonical', 'legacy'].some(wanted)) {
  const A = await openDevice('A');
  await openAssignment(A.page);
  await goTo(A.page, Q_FRACTION);
  await typeInto(A.page, 0, '7');
  await goTo(A.page, Q_LINE);
  await typeInto(A.page, 0, '-2/3');
  afterA = await waitForServer(A.page, (drafts) => drafts[LINE_KEY]?.value?.m && drafts[FRACTION_KEY]?.value?.f);
  check(afterA[FRACTION_KEY]?.value?.f === '7' && afterA[LINE_KEY]?.value?.m === '-\\frac23', 'A: both answers reach the server copy', JSON.stringify(afterA));
  const unedited = Object.keys(afterA).filter((key) => ![FRACTION_KEY, LINE_KEY].includes(key));
  check(unedited.length === 0, 'A: nothing the student did not edit is in the server copy (a workspace writing back what it read is not work)', unedited.join(', '));
  check(afterA[FRACTION_KEY]?.marked === true && afterA[LINE_KEY]?.marked === true, 'A: each saved entry says its time is an edit\'s', JSON.stringify(afterA));
  serverAfterA = await serverDb(A.page);
  stateA = await A.context.storageState();
  await A.context.close();
}

/* ============================================================== fresh */

if (wanted('fresh')) {
  for (const readMs of [0, 2000]) {
    const tag = `fresh (server read ${readMs ? `${readMs} ms, slower than the question` : 'quick'})`;
    const B = await openDevice(`B ${readMs}`, { server: serverAfterA, params: { draftReadMs: String(readMs) } });
    await openAssignment(B.page);
    check(Q_LINE.prompt.test(await stageText(B.page)), `${tag}: B opens where the student was`);
    const onScreen = await shows(B.page, ['-\\frac23', ''], readMs + 6000);
    check(same(onScreen, ['-\\frac23', '']), `${tag}: the question on screen shows A's work`, JSON.stringify(onScreen));
    await goTo(B.page, Q_FRACTION);
    const other = await shows(B.page, ['7']);
    check(same(other, ['7']), `${tag}: so does the other question`, JSON.stringify(other));
    await B.page.waitForTimeout(SAVED);
    const after = await serverDrafts(B.page);
    check(same(after, afterA), `${tag}: opening the questions changed nothing in the server copy`, same(after, afterA) ? '' : JSON.stringify(after));
    await B.context.close();
  }

  // The same Chromebook, reloaded: its own work, exactly as before.
  const again = await openDevice('A again', { storageState: stateA });
  await openAssignment(again.page);
  await goTo(again.page, Q_LINE);
  const own = await shows(again.page, ['-\\frac23', '']);
  check(same(own, ['-\\frac23', '']), 'same device: reopened, A shows its own work', JSON.stringify(own));
  await again.page.waitForTimeout(SAVED);
  check(same(await serverDrafts(again.page), afterA), 'same device: and the server copy is unchanged');
  await again.context.close();
}

/* ============================================================ offline */

if (wanted('offline')) {
  const C = await openDevice('C offline', { server: serverAfterA, params: { offline: '1' } });
  await openAssignment(C.page);
  const offline = await fields(C.page);
  check(same(offline, ['', '']), 'offline: a fresh device opens the question from what it has (nothing yet)', JSON.stringify(offline));
  await C.page.waitForTimeout(SAVED);
  await C.page.evaluate(() => window.__mmHarnessStore.setOnline(true));
  const back = await shows(C.page, ['-\\frac23', ''], 8000);
  check(same(back, ['-\\frac23', '']), 'offline: back online, the student\'s work comes in', JSON.stringify(back));
  await C.page.waitForTimeout(SAVED);
  const after = await serverDrafts(C.page);
  check(same(after, afterA), 'offline: back online, the empty boxes it opened with never reach the server copy', same(after, afterA) ? '' : JSON.stringify(after));
  await C.context.close();
}

/* ========================================================= directions */

if (wanted('directions')) {
  // B opens (A's work arrives) and edits: the intercept, and a new slope.
  const B = await openDevice('B edits', { server: serverAfterA, params: { draftReadMs: '600' } });
  await openAssignment(B.page);
  await shows(B.page, ['-\\frac23', ''], 7000);
  await typeInto(B.page, 1, '4');
  const afterB = await waitForServer(B.page, (drafts) => drafts[LINE_KEY]?.value?.b === '4');
  check(afterB[LINE_KEY]?.value?.b === '4' && afterB[LINE_KEY]?.value?.m === '-\\frac23' && afterB[LINE_KEY].savedAt > afterA[LINE_KEY].savedAt && afterB[LINE_KEY].marked === true,
    'directions: B\'s edit is saved, newer than A\'s and marked as an edit', JSON.stringify(afterB[LINE_KEY]));
  const serverAfterB = await serverDb(B.page);

  // A comes back: its own copy is older than B's edit. A has an edit of its
  // own there, so only the marker lets B's in (see `legacy`).
  const A2 = await openDevice('A back', { storageState: comingBack(stateA, serverAfterB), params: { draftReadMs: '600' } });
  await openAssignment(A2.page);
  await goTo(A2.page, Q_LINE);
  const seen = await shows(A2.page, ['-\\frac23', '4'], 7000);
  check(same(seen, ['-\\frac23', '4']), 'directions: A comes back to B\'s newer work, not its own older copy', JSON.stringify(seen));
  const restoredOnA = await localDraft(A2.page, LINE_KEY);
  check(restoredOnA?.savedAt === afterB[LINE_KEY].savedAt && restoredOnA?.savedAtIsEdit === true,
    'directions: A\'s copy is now B\'s edit, at B\'s time and still marked', JSON.stringify(restoredOnA && { savedAt: restoredOnA.savedAt, savedAtIsEdit: restoredOnA.savedAtIsEdit }));
  await A2.page.waitForTimeout(SAVED);
  const afterReturn = await serverDrafts(A2.page);
  check(same(afterReturn[LINE_KEY], afterB[LINE_KEY]), 'directions: coming back changes nothing in the server copy', JSON.stringify(afterReturn[LINE_KEY]));
  // ...and edits: the newest edit is A's.
  await typeInto(A2.page, 0, '-1/2');
  const afterA2 = await waitForServer(A2.page, (drafts) => drafts[LINE_KEY]?.value?.m === '-\\frac12');
  check(afterA2[LINE_KEY]?.value?.m === '-\\frac12' && afterA2[LINE_KEY]?.value?.b === '4', 'directions: A\'s new edit is the one the server keeps, with B\'s intercept', JSON.stringify(afterA2[LINE_KEY]));
  const lineDocFromA2 = await A2.page.evaluate((doc) => window.__mmHarnessStore.exportDoc(doc), DOC);

  // B was left open and put to sleep. The student comes back to it.
  await hidden(B.page, true);
  await B.page.evaluate(([doc, data]) => window.__mmHarnessStore.importDoc(doc, data), [DOC, lineDocFromA2]);
  await B.page.waitForTimeout(16000);
  await hidden(B.page, false);
  const woken = await shows(B.page, ['-\\frac12', '4'], 7000);
  check(same(woken, ['-\\frac12', '4']), 'directions: B, woken after A\'s edit, shows A\'s newest work, not its own older copy', JSON.stringify(woken));
  await B.page.waitForTimeout(SAVED);
  const afterWake = await serverDrafts(B.page);
  check(same(afterWake[LINE_KEY], afterA2[LINE_KEY]), 'directions: waking B changes nothing in the server copy', JSON.stringify(afterWake[LINE_KEY]));
  await A2.context.close();
  await B.context.close();
}

/* =============================================================== late */

if (wanted('late')) {
  // The read is slower than the student: B is on the line question, with the
  // cursor in the intercept box, before A's work arrives.
  const L = await openDevice('L late read', { server: serverAfterA, params: { draftReadMs: '5000' } });
  await openAssignment(L.page);
  await goTo(L.page, Q_LINE);
  const before = await fields(L.page);
  check(same(before, ['', '']), 'late: before the read lands, the boxes are this device\'s own (empty)', JSON.stringify(before));
  await L.page.locator('.mathmaster-question-stage math-field').nth(1).click();
  const restored = await shows(L.page, ['-\\frac23', ''], 12000);
  check(same(restored, ['-\\frac23', '']), 'late: the read lands and shows A\'s slope', JSON.stringify(restored));
  await L.page.waitForTimeout(300);
  const cursorIn = await L.page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-stage math-field')].indexOf(document.activeElement));
  check(cursorIn === 1, 'late: the cursor is back in the intercept box the student had clicked', `focused box ${cursorIn}`);
  // Typing straight on, without clicking again.
  await L.page.keyboard.type('4', { delay: 25 });
  await L.page.keyboard.press('Tab');
  const typed = await shows(L.page, ['-\\frac23', '4'], 4000);
  check(same(typed, ['-\\frac23', '4']), 'late: what the student types lands in that box; the slope A wrote is untouched', JSON.stringify(typed));
  const saved = await waitForServer(L.page, (drafts) => drafts[LINE_KEY]?.value?.b === '4');
  check(saved[LINE_KEY]?.value?.m === '-\\frac23' && saved[LINE_KEY]?.value?.b === '4', 'late: the server copy keeps A\'s slope and the new intercept', JSON.stringify(saved[LINE_KEY]));
  await L.context.close();
}

/* ============================================================= legacy */

if (wanted('legacy')) {
  // The rollout: a Chromebook still on the build before the edit-time marker
  // merely opens the line question after A's work. Its write-back of empty
  // boxes is dated when it opened — later than A's edit — and carries no
  // marker (openedElsewhere). That build kept whatever copy a device already
  // had (opening re-dated it); this one must not do worse.
  const openedAt = schoolNow(); // the devices' clock (schoolClock.mjs)
  const legacyServer = openedElsewhere(serverAfterA, openedAt);

  const A3 = await openDevice('A after an older build', { storageState: comingBack(stateA, legacyServer), params: { draftReadMs: '600' } });
  await openAssignment(A3.page);
  await goTo(A3.page, Q_LINE);
  await A3.page.waitForTimeout(2500);
  const kept = await fields(A3.page);
  check(same(kept, ['-\\frac23', '']), 'legacy: A comes back to the −2/3 it typed, not the empty boxes an older build saved over it later', JSON.stringify(kept));
  await A3.page.waitForTimeout(SAVED);
  const untouched = await serverDrafts(A3.page);
  check(untouched[LINE_KEY]?.savedAt === openedAt && untouched[LINE_KEY]?.marked === false,
    'legacy: coming back sends nothing over it — A\'s copy is the older one', JSON.stringify(untouched[LINE_KEY]));
  await typeInto(A3.page, 1, '4');
  const edited = await waitForServer(A3.page, (drafts) => drafts[LINE_KEY]?.value?.b === '4');
  check(edited[LINE_KEY]?.value?.m === '-\\frac23' && edited[LINE_KEY]?.savedAt > openedAt && edited[LINE_KEY]?.marked === true,
    'legacy: A\'s next edit replaces it in the server copy, marked as an edit', JSON.stringify(edited[LINE_KEY]));
  await A3.context.close();

  // A fresh Chromebook has nothing of its own: it takes what the server holds,
  // as an older build would — A's other answer, and the empty boxes.
  const F = await openDevice('F after an older build', { server: legacyServer, params: { draftReadMs: '600' } });
  await openAssignment(F.page);
  await goTo(F.page, Q_FRACTION);
  const other = await shows(F.page, ['7'], 7000);
  check(same(other, ['7']), 'legacy: a fresh device restores the unmarked entries (A\'s other answer)', JSON.stringify(other));
  const takenAsIs = await localDraft(F.page, LINE_KEY);
  check(takenAsIs?.savedAt === openedAt && same(takenAsIs?.value, {}) && !takenAsIs?.savedAtIsEdit,
    'legacy: and the empty boxes the older build saved, as that build would have', JSON.stringify(takenAsIs));
  await F.context.close();

  // The same empty boxes saved by THIS build are the student's edit — they
  // cleared the slope on another Chromebook, after A — and replace A's work.
  const clearedServer = openedElsewhere(serverAfterA, openedAt, { marked: true });
  const A4 = await openDevice('A after B cleared it', { storageState: comingBack(stateA, clearedServer), params: { draftReadMs: '600' } });
  await openAssignment(A4.page);
  await goTo(A4.page, Q_LINE);
  const cleared = await shows(A4.page, ['', ''], 7000);
  check(same(cleared, ['', '']), 'legacy: marked as an edit, the same newer empty boxes do replace A\'s older work', JSON.stringify(cleared));
  await A4.context.close();
}

/* ========================================================== canonical */

if (wanted('canonical')) {
  const D = await openDevice('D submits', { server: serverAfterA });
  await openAssignment(D.page);
  await goTo(D.page, Q_FRACTION);
  await shows(D.page, ['7']);
  await typeInto(D.page, 0, '3/4');
  const typed = await waitForServer(D.page, (drafts) => drafts[FRACTION_KEY]?.value?.f === '\\frac34');
  await D.page.getByRole('button', { name: /^Submit/ }).first().click();
  const submittedAt = await D.page.evaluate(() => Date.now());
  // The harness has no submission ingestion (fakeFunctions.js), so the
  // canonical record it would write — this attempt, at this time — is written
  // here, where every device reads grades from.
  await D.page.evaluate(([at, index]) => {
    const grades = window.__mmHarnessStore.get('grades/910002');
    const byAssignment = { ...grades.gradesByAssignment };
    byAssignment['a-today'] = {
      ...byAssignment['a-today'],
      [index]: { status: 'correct', attemptCount: 1, totalAttempts: 1, timeSpent: 20, lastAttemptAt: new Date(at).toISOString() },
    };
    window.__mmHarnessStore.update('grades/910002', { gradesByAssignment: byAssignment });
  }, [submittedAt, Q_FRACTION.index]);
  await D.page.waitForTimeout(2500);
  // Away and back: the question mounts again and writes its draft back. Then
  // on to the other question, where the next device will open.
  await goTo(D.page, Q_LINE);
  await goTo(D.page, Q_FRACTION);
  await goTo(D.page, Q_LINE);
  await D.page.waitForTimeout(SAVED);
  const afterReopen = await serverDrafts(D.page);
  check(afterReopen[FRACTION_KEY]?.savedAt === typed[FRACTION_KEY]?.savedAt && afterReopen[FRACTION_KEY].savedAt < submittedAt,
    'canonical: reopening the submitted question leaves its draft as old as the edit, older than the submission',
    JSON.stringify({ edited: typed[FRACTION_KEY]?.savedAt, now: afterReopen[FRACTION_KEY]?.savedAt }));
  const serverAfterD = await serverDb(D.page);
  await D.context.close();

  // A device that has never seen this work, opening on the other question:
  // the read decides alone whether the submitted question's draft comes back.
  const E = await openDevice('E', { server: serverAfterD });
  await openAssignment(E.page);
  check(Q_LINE.prompt.test(await stageText(E.page)), 'canonical: E opens on the other question');
  await E.page.waitForTimeout(2500);
  const envelope = await localDraft(E.page, FRACTION_KEY);
  check(envelope === null, 'canonical: another device does not bring the pre-submission draft back over the submission', JSON.stringify(envelope));
  await E.context.close();
}

/* =========================================================== practice */

if (wanted('practice')) {
  // Post-deadline Practice Mode on last week's closed lesson. Its progress
  // rides the same server copy (App.jsx), and every entry into it starts from
  // a fresh tracker — every question unattempted — sent at once.
  const PRACTICE_DOC = `studentWorkspaceDrafts/${STUDENT}__a-lastweek`;
  const openPractice = async (page) => {
    await page.getByRole('button', { name: /^Grades$/ }).first().click();
    await page.waitForTimeout(800);
    // A closed row's voluntary-practice button — "Try it again — no credit"
    // (student copy keeps "Practice" for the lesson's Practice section).
    await page.getByRole('button', { name: /^(Try it again — no credit|Practice)$/ }).first().click();
    await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(600);
  };
  // The first Warm-Up question as the question navigator states it.
  const warmUp = (page) => page.evaluate(() => (
    [...document.querySelectorAll('.mathmaster-question-number')]
      .map((button) => button.getAttribute('aria-label') || '')
      .find((label) => label.startsWith('Warm-Up question 1:')) || ''
  ));
  const showsWarmUp = async (page, pattern, ms = 6000) => {
    const deadline = Date.now() + ms;
    let label = await warmUp(page);
    while (!pattern.test(label) && Date.now() < deadline) {
      await page.waitForTimeout(250);
      label = await warmUp(page);
    }
    return label;
  };
  const savedPractice = (page) => page.evaluate((doc) => {
    const stored = window.__mmHarnessStore.get(doc);
    return Object.fromEntries(Object.entries(stored?.practice || {}).map(([index, record]) => [index, `${record?.status}/${record?.totalAttempts}`]));
  }, PRACTICE_DOC);
  const practiced = (rows) => rows['0'] === 'correct/1';

  // The student practises on one Chromebook: the Warm-Up, answered correctly.
  const P = await openDevice('P practises');
  await openPractice(P.page);
  await typeInto(P.page, 0, '5');
  await P.page.getByRole('button', { name: /^Submit Answer/ }).first().click();
  await showsWarmUp(P.page, /: correct/);
  let rows = await savedPractice(P.page);
  for (let wait = 0; wait < 40 && !practiced(rows); wait += 1) {
    await P.page.waitForTimeout(300);
    rows = await savedPractice(P.page);
  }
  check(practiced(rows), 'practice: the student\'s practice reaches the server copy', JSON.stringify(rows));
  const serverAfterPractice = await serverDb(P.page);
  await P.context.close();

  // Another Chromebook opens Practice Mode with the server out of reach. The
  // browser never noticed — Wi-Fi up, the school's connection down — so when
  // the server is back no `online` event says so: the read that failed is not
  // retried, while the background save keeps trying, and gets through.
  const Q = await openDevice('Q unreachable', { server: serverAfterPractice, params: { offline: '1' } });
  await openPractice(Q.page);
  await Q.page.waitForTimeout(SAVED);
  await Q.page.evaluate(() => window.__mmHarnessStore.setOnline(true, { announce: false }));
  await Q.page.waitForTimeout(SAVED);
  const afterQ = await savedPractice(Q.page);
  check(practiced(afterQ), 'practice: a device that opened Practice Mode unreachable does not replace the saved practice with its fresh start', JSON.stringify(afterQ));
  const serverAfterQ = await serverDb(Q.page);
  await Q.context.close();

  // The same, with the browser noticing it is back: the read comes first.
  const R = await openDevice('R offline', { server: serverAfterPractice, params: { offline: '1' } });
  await openPractice(R.page);
  await R.page.waitForTimeout(SAVED);
  await R.page.evaluate(() => window.__mmHarnessStore.setOnline(true));
  const backOnline = await showsWarmUp(R.page, /: correct/, 8000);
  check(/: correct/.test(backOnline), 'practice: back online, the saved practice comes in', backOnline);
  await R.page.waitForTimeout(SAVED);
  const afterR = await savedPractice(R.page);
  check(practiced(afterR), 'practice: and stays saved', JSON.stringify(afterR));
  await R.context.close();

  // Whatever the order, the next Chromebook picks up where the student was.
  const S = await openDevice('S fresh', { server: serverAfterQ });
  await openPractice(S.page);
  const resumed = await showsWarmUp(S.page, /: correct/, 8000);
  check(/: correct/.test(resumed), 'practice: the next device shows the practice already done', resumed);
  await S.context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} cross-device draft failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\ncross-device drafts: opening a question never outranks or overwrites real work; the newest edit wins wherever it was made.');

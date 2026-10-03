// A TIMED WARM-UP, CLOSED AND REOPENED UNDER UNFINISHED WORK — IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/warmupReopenJourneys.mjs [--slow]
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    ONLY=inprogress,submitted,... to run some journeys.)
//
// The production incident: Algebra I Warm-Up Question 1, lmr-wu-1
// (representationMatch / linear.representationSort, family-backed). A student
// sorts some cards and does not submit; the Warm-Up's ten-minute timer runs
// out; the teacher reopens the Warm-Up; the student's question must come back
// — no crash, the same cards sorted, controls usable, the new deadline — and
// take a Submit.
//
// The whole student App.jsx runs: the assignment listener, the Warm-Up gate,
// the precise transition timer, the response checkpoint, the server draft
// backup and restore, the QuestionEngine remount. Only `firebase/*` is the
// harness fake (fakeFirestore.js). The clock is Playwright's fake clock, so
// ten minutes pass in milliseconds and the timer App armed for the ORIGINAL
// close is still pending when the teacher reopens.
//
// The teacher's Close / Reopen / Timer is applyWarmupTeacherControl — what
// App.jsx's teacher handler writes — applied to the same assignment document
// the student's listener is watching.
//
//   inprogress   B sorts five cards, timer closes, teacher reopens: B's question
//                mounts without an exception, restores the five, is unlocked,
//                shows the reopened deadline, survives the old window's timer,
//                a refresh, and another Chromebook; B finishes and submits once.
//   submitted    A submits before the close; the reopen neither unlocks nor
//                duplicates A's response; B (in progress, same class) still
//                resumes — the two stay independent.
//   pristine     a student who never opened Q1 gets the ordinary board.
//   corrupt      B's saved draft for Q1 is malformed on the device (the shape a
//                build-to-build mismatch or a damaged backup leaves): the
//                question recovers to a usable board, the rest of the
//                assignment stays reachable.
//   cycles       close / reopen / close / reopen: deterministic, the work kept.
//   bridge       the scope audit: the Linear Multiple Representations board in
//                the same Warm-Up, partly built, through the same close/reopen.
//
// `--slow` adds 4× CPU throttling and a slow network: the Chromebook.
// Exit code 1 on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SLOW = process.argv.includes('--slow');
const ASSIGNMENT = 'a-today';
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const STUDENT_A = '910004';
const STUDENT_B = '910005';
const VIEWPORT = { width: 1366, height: 768 };
const SAVED_MS = 4500; // workspaceDraftSync's debounce is 2.5 s

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${text ? ` — ${text}` : ''}`);
  if (!ok) failures.push(`${label}${text ? `: ${text}` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);

/* ------------------------------------------------------------- devices */

const openDevice = async (label, { studentId, server = null, storageState = null, startMs = null } = {}) => {
  const context = await browser.newContext({ viewport: VIEWPORT, ...(storageState ? { storageState } : {}) });
  if (server) {
    await context.addInitScript(([key, value]) => {
      if (window.sessionStorage.getItem('mm-journey-server')) return;
      window.sessionStorage.setItem('mm-journey-server', '1');
      window.localStorage.setItem(key, value);
    }, [DB_KEY, server]);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/Download the React DevTools|favicon/i.test(text)) errors.push(`console.error: ${text}`);
  });
  await page.clock.install({ time: startMs ?? Date.now() });
  if (SLOW) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  }
  const search = new URLSearchParams({ as: 'student', studentId, questions: 'lmr', p3StartMin: '2' });
  if (!server && !storageState) search.set('reset', '1');
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  // A refresh must NOT carry `?reset=1`: that reseeds the whole school (the
  // server copy of every draft, and the teacher's reopen with it).
  search.delete('reset');
  const refresh = async () => {
    await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
    await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
    await page.waitForTimeout(800);
  };
  return { label, context, page, errors, refresh };
};

const stage = (page) => page.locator('.mathmaster-question-stage');
const stageText = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-stage')?.innerText || '').replace(/\s+/g, ' '));
const cards = (page) => page.locator('.mathmaster-question-stage .mathmaster-line-card');
const groupButton = (page, index) => page.locator('.mathmaster-question-stage [role="radio"]').nth(index);

const openTodayWarmup = async (page) => {
  // The dashboard's card for today's lesson.
  const start = page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first();
  await start.click({ timeout: 60000 });
  await stage(page).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.body.textContent.includes('Opening Work View…'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
};

const sortedOnScreen = (page) => cards(page).evaluateAll((nodes) => nodes
  .map((node) => node.getAttribute('aria-label') || '')
  .filter((label) => !/In not sorted yet/i.test(label)).length);

const sortPartially = async (page) => {
  await cards(page).first().waitFor({ timeout: 30000 });
  await groupButton(page, 0).click();
  for (const index of [0, 2, 4]) await cards(page).nth(index).click();
  await groupButton(page, 1).click();
  for (const index of [1, 3]) await cards(page).nth(index).click();
};

// The draft every device keeps for Q1 (storage index 0, variant 0).
const toolDraft = (page, studentId, index = 0) => page.evaluate(([student, assignment, questionIndex]) => {
  const raw = window.localStorage.getItem(`mathmaster:draft:v2::${student}:${assignment}:${questionIndex}:0:student:work:tool`);
  return raw ? JSON.parse(raw) : null;
}, [studentId, ASSIGNMENT, index]);

const record = (page, studentId, index = 0) => page.evaluate(([student, assignment, questionIndex]) => (
  window.__mmHarnessStore.get(`students/${student}`)?.gradesByAssignment?.[assignment]?.[questionIndex] || null
), [studentId, ASSIGNMENT, index]);

const teacher = (page, action, options = {}) => page.evaluate(async ([assignmentId, act, opts]) => {
  const deadline = await import('/functions/shared/sectionDeadline.mjs');
  const schedule = await import('/functions/shared/classSchedule.mjs');
  const calendar = await import('/functions/shared/instructionalCalendar.mjs');
  const store = window.__mmHarnessStore;
  const assignment = { id: assignmentId, ...store.get(`assignments/${assignmentId}`) };
  const now = Date.now();
  const window_ = schedule.resolvePeriodWindow({ schedule: store.get('settings/classSchedule'), classPeriod: 'Period 3', nowValue: now });
  const result = deadline.applyWarmupTeacherControl({
    assignment,
    classId: 'c-alg2-p3',
    action: act,
    nowMs: now,
    dateKey: calendar.zonedDateKey(now),
    windowEndMs: window_.endMs,
    timerMinutes: opts.timerMinutes,
    teacherIdentity: 'teacher@harness.example',
  });
  store.update(`assignments/${assignmentId}`, { warmup: result.warmup, updatedAt: result.changedAt });
  return result.warmup;
}, [ASSIGNMENT, action, options]);

const lockedNow = (page) => page.evaluate(() => Boolean(document.querySelector('.mathmaster-question-stage fieldset[disabled]')));
const crashed = async (page) => {
  const text = await page.evaluate(() => document.body.innerText || '');
  return /Something went wrong|MathMaster hit a problem|Reload MathMaster|unexpected error/i.test(text) || !(await stage(page).count());
};
const noErrors = (device, where) => {
  const relevant = device.errors.filter((entry) => !/Could not read response checkpoint receipts|ERR_/.test(entry));
  check(relevant.length === 0, `${device.label}: no exception ${where}`, relevant.join('\n---\n'));
  device.errors.length = 0;
};
const serverDb = (page) => page.evaluate((key) => window.localStorage.getItem(key), DB_KEY);

/* ------------------------------------------------------------ journeys */

const journeyInProgress = async () => {
  console.log('\n== inprogress: partial sort → timer close → teacher reopen → resume → submit');
  const b = await openDevice('B', { studentId: STUDENT_B });
  await openTodayWarmup(b.page);
  check(/Two different lines/.test(await stageText(b.page)), 'B: opened Warm-Up Q1 (lmr-wu-1)');
  check(!(await lockedNow(b.page)), 'B: Q1 is open while the Warm-Up runs');
  await sortPartially(b.page);
  await b.page.waitForTimeout(SAVED_MS);
  const before = (await toolDraft(b.page, STUDENT_B))?.value?.linearAssignments || null;
  check(before && Object.keys(before).length === 5, 'B: five placements saved on the device', before);
  noErrors(b, 'while sorting');

  // The Warm-Up's ten-minute cutoff (Period 3 began two minutes ago).
  await b.page.clock.fastForward('10:00');
  await b.page.waitForTimeout(1500);
  check(await lockedNow(b.page), 'B: Q1 locks when the Warm-Up timer ends');
  const frozen = (await toolDraft(b.page, STUDENT_B))?.value?.linearAssignments || null;
  check(JSON.stringify(frozen) === JSON.stringify(before), 'B: the close kept the draft exactly (frozen, not cleared)', { before, frozen });
  check((await record(b.page, STUDENT_B)) === null || (await record(b.page, STUDENT_B))?.totalAttempts === 0, 'B: the close recorded no attempt', await record(b.page, STUDENT_B));
  noErrors(b, 'at the close');

  await b.page.clock.fastForward('02:00');
  await teacher(b.page, 'reopen');
  await b.page.waitForTimeout(1500);
  check(!(await crashed(b.page)), 'B: still on the question after the reopen (mounted)');
  noErrors(b, 'after the reopen (mounted)');
  check(!(await lockedNow(b.page)), 'B: Q1 unlocked by the reopen');
  check((await sortedOnScreen(b.page)) === 5, 'B: the five sorted cards are on screen', await sortedOnScreen(b.page));

  // The callback armed for the ORIGINAL close has fired by now; a minute later the window is still open.
  await b.page.clock.fastForward('01:00');
  await b.page.waitForTimeout(800);
  check(!(await lockedNow(b.page)), 'B: the previous window\'s timer did not close the reopened Warm-Up');

  // Refresh.
  await b.refresh();
  await openTodayWarmup(b.page);
  check(!(await crashed(b.page)), 'B: Q1 opens after a refresh');
  noErrors(b, 'after a refresh');
  check((await sortedOnScreen(b.page)) === 5, 'B: refresh restores the five', await sortedOnScreen(b.page));
  check(!(await lockedNow(b.page)), 'B: still unlocked after a refresh');

  // Another Chromebook: only the server copy.
  await b.page.waitForTimeout(SAVED_MS);
  const server = await serverDb(b.page);
  const b2 = await openDevice('B (second Chromebook)', { studentId: STUDENT_B, server, startMs: await b.page.evaluate(() => Date.now()) });
  await openTodayWarmup(b2.page);
  await b2.page.waitForTimeout(2000);
  check(!(await crashed(b2.page)), 'B2: Q1 opens on another device after the reopen');
  noErrors(b2, 'on another device');
  check((await sortedOnScreen(b2.page)) === 5, 'B2: the server copy brings back the five', {
    shown: await sortedOnScreen(b2.page),
    local: (await toolDraft(b2.page, STUDENT_B))?.value || null,
    server: await b2.page.evaluate((doc) => (window.__mmHarnessStore.get(doc)?.entries || []).map((entry) => [entry.key.split(':').slice(6).join(':'), entry.valueJson, entry.savedAt]), `studentWorkspaceDrafts/${STUDENT_B}__${ASSIGNMENT}`),
    stage: (await stageText(b2.page)).slice(0, 160),
  });
  await b2.context.close();

  // Finish and submit on the first device.
  const total = await cards(b.page).count();
  for (let index = 0; index < total; index += 1) {
    const label = (await cards(b.page).nth(index).getAttribute('aria-label')) || '';
    if (!/In not sorted yet/i.test(label)) continue;
    await groupButton(b.page, index % 2).click();
    await cards(b.page).nth(index).click();
  }
  await b.page.getByRole('button', { name: /Check groups/i }).click();
  await b.page.waitForTimeout(2500);
  const submitted = await record(b.page, STUDENT_B);
  check(submitted && submitted.totalAttempts === 1, 'B: one submission recorded after the reopen', submitted);
  noErrors(b, 'after submitting');
  await b.context.close();
};

const journeySubmitted = async () => {
  console.log('\n== submitted: A submits before the close; B in progress; reopen');
  const a = await openDevice('A', { studentId: STUDENT_A });
  await openTodayWarmup(a.page);
  const total = await cards(a.page).count();
  for (let index = 0; index < total; index += 1) {
    await groupButton(a.page, index % 2).click();
    await cards(a.page).nth(index).click();
  }
  await a.page.getByRole('button', { name: /Check groups/i }).click();
  await a.page.waitForTimeout(2500);
  const submitted = await record(a.page, STUDENT_A);
  check(submitted && submitted.totalAttempts === 1, 'A: submitted once before the close', submitted);
  await a.page.clock.fastForward('10:00');
  await a.page.waitForTimeout(1000);
  await a.page.clock.fastForward('02:00');
  await teacher(a.page, 'reopen');
  await a.page.waitForTimeout(1500);
  noErrors(a, 'after the reopen');
  const after = await record(a.page, STUDENT_A);
  check(after && after.totalAttempts === submitted?.totalAttempts && after.lastAttemptAt === submitted?.lastAttemptAt,
    'A: the reopen neither added nor rewrote an attempt', { submitted, after });
  check(after?.questionId === undefined || after?.questionId === submitted?.questionId, 'A: question identity unchanged');
  await a.context.close();
};

const journeyPristine = async () => {
  console.log('\n== pristine: never opened Q1 before the close');
  const c = await openDevice('C', { studentId: '910006' });
  await c.page.clock.fastForward('10:00');
  await c.page.waitForTimeout(600);
  await c.page.clock.fastForward('01:00');
  await teacher(c.page, 'reopen');
  await c.page.waitForTimeout(800);
  await openTodayWarmup(c.page);
  check(!(await crashed(c.page)), 'C: Q1 opens after the reopen');
  check((await sortedOnScreen(c.page)) === 0, 'C: an untouched board', await sortedOnScreen(c.page));
  check(!(await lockedNow(c.page)), 'C: unlocked');
  noErrors(c, 'on a pristine reopen');
  await c.context.close();
};

const CORRUPT_VALUES = {
  'null map': { linearAssignments: null },
  'string map': { linearAssignments: 'line-a:graph=0' },
  'array map (submitted-response shape)': { linearAssignments: [{ cardId: 'line-a:graph', slot: 0 }, { cardId: 'line-b:standard', slot: 1 }] },
  'stale card + bad slots': { linearAssignments: { 'line-z:graph': 0, 'line-a:graph': 7, 'line-b:standard': '1', 'line-a:standard': 1 } },
  'whole record not an object': 'linearAssignments',
};

const journeyCorrupt = async () => {
  console.log('\n== corrupt: malformed drafts for Q1 on the device');
  for (const [name, value] of Object.entries(CORRUPT_VALUES)) {
    const d = await openDevice(`D [${name}]`, { studentId: '910007' });
    await d.page.evaluate(([student, assignment, stored]) => {
      window.localStorage.setItem(
        `mathmaster:draft:v2::${student}:${assignment}:0:0:student:work:tool`,
        JSON.stringify({ version: 2, savedAt: Date.now(), touchedAt: Date.now(), savedAtIsEdit: true, value: stored }),
      );
    }, ['910007', ASSIGNMENT, value]);
    await d.refresh();
    await openTodayWarmup(d.page);
    await d.page.waitForTimeout(600);
    check(!(await crashed(d.page)), `D [${name}]: the assignment survives`);
    check((await cards(d.page).count()) > 0, `D [${name}]: Q1 shows a usable board`, String(await cards(d.page).count()));
    if (name === 'stale card + bad slots') {
      check((await sortedOnScreen(d.page)) === 1, `D [${name}]: the one valid placement is salvaged`, String(await sortedOnScreen(d.page)));
    }
    noErrors(d, `with a ${name} draft`);
    // Neighbouring questions stay reachable.
    await d.page.getByRole('button', { name: 'Next question' }).first().click();
    await d.page.waitForTimeout(800);
    check(/Two different situations|Sort every card|situation/i.test(await stageText(d.page)), `D [${name}]: Q2 reachable`);
    await d.context.close();
  }
};

const journeyCycles = async () => {
  console.log('\n== cycles: close / reopen / close / reopen');
  const e = await openDevice('E', { studentId: '910008' });
  await openTodayWarmup(e.page);
  await sortPartially(e.page);
  await e.page.waitForTimeout(800);
  const before = (await toolDraft(e.page, '910008'))?.value?.linearAssignments;
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    await e.page.clock.fastForward('01:00');
    await teacher(e.page, 'close');
    await e.page.waitForTimeout(800);
    check(await lockedNow(e.page), `E: cycle ${cycle} closed`);
    await e.page.clock.fastForward('01:00');
    await teacher(e.page, 'reopen');
    await e.page.waitForTimeout(800);
    check(!(await lockedNow(e.page)), `E: cycle ${cycle} reopened`);
    check((await sortedOnScreen(e.page)) === 5, `E: cycle ${cycle} work intact`, String(await sortedOnScreen(e.page)));
  }
  const after = (await toolDraft(e.page, '910008'))?.value?.linearAssignments;
  check(JSON.stringify(before) === JSON.stringify(after), 'E: the draft is byte-identical after two cycles');
  noErrors(e, 'across cycles');
  await e.context.close();
};

const journeyBridge = async () => {
  console.log('\n== bridge: the Linear Multiple Representations board through the same close/reopen');
  const f = await openDevice('F', { studentId: '910003' });
  await openTodayWarmup(f.page);
  // Q1 is already correct for this student (fixture: warmupOnly) — go to the board, Q3.
  for (let step = 0; step < 4 && !/slope|y-intercept|Build/i.test(await stageText(f.page)); step += 1) {
    await f.page.getByRole('button', { name: 'Next question' }).first().click();
    await f.page.waitForTimeout(700);
  }
  const field = f.page.locator('.mathmaster-question-stage math-field').first();
  const hasField = await field.count();
  check(hasField > 0, 'F: the board has an answer field');
  if (hasField) {
    await field.click();
    await f.page.keyboard.type('3', { delay: 25 });
    await f.page.keyboard.press('Tab');
  }
  await f.page.waitForTimeout(800);
  const index = await f.page.evaluate(() => Number((window.location.search.match(/q=(\d+)/) || [])[1] ?? 2));
  void index;
  const before = await f.page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.includes(':a-today:2:')).sort());
  check(before.length > 0, 'F: the board keeps a draft', before);
  await f.page.clock.fastForward('10:00');
  await f.page.waitForTimeout(800);
  check(await lockedNow(f.page), 'F: locks at the close');
  await f.page.clock.fastForward('02:00');
  await teacher(f.page, 'reopen');
  await f.page.waitForTimeout(1200);
  check(!(await crashed(f.page)), 'F: the board survives the reopen');
  check(!(await lockedNow(f.page)), 'F: unlocked');
  const values = await f.page.evaluate(() => [...document.querySelectorAll('.mathmaster-question-stage math-field')].map((node) => node.value));
  check(values.includes('3'), 'F: the typed value is back', values);
  noErrors(f, 'on the board');
  await f.context.close();
};

if (wanted('inprogress')) await journeyInProgress();
if (wanted('submitted')) await journeySubmitted();
if (wanted('pristine')) await journeyPristine();
if (wanted('corrupt')) await journeyCorrupt();
if (wanted('cycles')) await journeyCycles();
if (wanted('bridge')) await journeyBridge();

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s):\n- ${failures.join('\n- ')}` : '\nall Warm-Up reopen journeys passed');
process.exit(failures.length ? 1 : 0);

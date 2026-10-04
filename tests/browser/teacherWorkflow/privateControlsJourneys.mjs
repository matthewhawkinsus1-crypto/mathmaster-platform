// STUDENTS' PRIVATE ASSIGNMENT CONTROLS IN THE REAL APP — PR #432'S CLIENT CUTOVER.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/privateControlsJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; MODES=mirror,retired; VIEWPORTS=1440x900,390x844.)
//
// Same harness as journeys.mjs: the real App.jsx with `firebase/*` replaced by
// in-memory fakes. `?controls=mirror|retired` (fixture.js PRIVATE_CONTROLS)
// seeds students' private records with the shared copy still mirroring them
// (Stages 1-3) or retired and stripped (Stage 4); every journey runs in both.
//
//   P1  a student: the class's lessons listener and ONE own-controls listener;
//       the app holds their own controls only — no classmate's map, no
//       student-scoped recovery entry, no staff name — and their extension
//       reaches the dashboard ("Your last day to turn in") from the private
//       record alone once retired; moving around the app opens nothing more
//       and leaves nothing open.
//   P2  a shared Chromebook: A signs out and B signs in on the same page, with
//       slow claims and slow private controls — nothing of A's is ever
//       rendered for B, B's app holds none of A's controls, A's listeners are
//       closed; again with B signing in over A with no sign-out; and B starting
//       from a cached snapshot that carries A's records.
//   P3  a teacher: ONE controls listener, for the class on screen; a class
//       switch replaces it once; Grades and Grade Transfer and back add none
//       and leave none; signing out closes it.
//   P4  DOL: "Grant +1 DOL attempt", double-clicked — one confirmation, one
//       request; the browser writes nothing itself; the count updates from the
//       private record; the grant history (staff-only) shows the grant.
//   P5  the administrator's staged workflow: the stages, the backfill, the
//       cutover (attested), retirement refused until the gates pass and then
//       only typed and attested, the strip's dry run and — separately — the
//       strip, and the rollback.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/private-controls/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/private-controls');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const MODES = (process.env.MODES || 'mirror,retired').split(',').map((entry) => entry.trim()).filter(Boolean);
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const passed = [];
const expect = (label, condition, detail) => {
  if (condition) passed.push(label);
  else findings.push(`${label}: ${detail}`);
  return Boolean(condition);
};

// fixture.js PRIVATE_CONTROLS, and the roster names the fixture gives them.
const A = '910001'; // an extension on last week's lesson (closed for the class); a reopen of today's
const GRANTED = '910003'; // two extra DOL attempts of their own on today's lesson
const B = '910004'; // nothing: the next student on the shared Chromebook
const A_NAME = 'Harper Dunn';
const B_NAME = 'Devon Mercer';
const LAST_DAY = 'Your last day to turn in';
const LAST_WEEK = 'Linear Functions — Review';
const CONTROLS = 'studentAssignmentOverrides';

const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const stats = (page) => page.evaluate(() => window.__mmHarnessStore.stats());
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const confirmDialog = async (page) => {
  const dialog = page.getByRole('alertdialog').last();
  await dialog.waitFor({ timeout: 5000 });
  const buttons = dialog.getByRole('button');
  await buttons.nth((await buttons.count()) - 1).click();
};

/*
 * EVERYTHING THE APP HOLDS, READ FROM REACT ITSELF: every hook's state and
 * ref, every context value and every prop, from the root fiber down. Reports
 * whose controls appear in any `studentOverrides` / `attemptGrantsByStudentId`
 * map, any non-empty `excusedStudentIds` / `reopenedStudentIds`, any
 * students-scope recovery entry, and any staff name inside a `dol`.
 */
const scanAppState = (page) => page.evaluate(() => {
  const root = document.getElementById('root');
  const key = Object.keys(root).find((name) => name.startsWith('__reactContainer$'));
  const STAFF = new Set(['changedBy', 'openedBy', 'unlockedBy', 'closedBy', 'teacherId']);
  const SKIP = new Set(['stateNode', 'return', '_owner', '_store', 'alternate', '_debugOwner']);
  const out = { objects: 0, overrideIds: new Set(), grantIds: new Set(), excusedLists: 0, reopenedLists: 0, studentAudit: 0, staffNamesInDol: 0 };
  const seen = new WeakSet();
  const visit = (value, inDol, depth) => {
    if (!value || typeof value !== 'object' || depth > 80 || seen.has(value)) return;
    if (value === window || (typeof Node !== 'undefined' && value instanceof Node)) return;
    seen.add(value);
    out.objects += 1;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, inDol, depth + 1)); return; }
    let entries;
    try { entries = Object.entries(value); } catch { return; }
    entries.forEach(([name, item]) => {
      if (SKIP.has(name)) return;
      if (name === 'studentOverrides' && item && typeof item === 'object') Object.keys(item).forEach((id) => out.overrideIds.add(id));
      if (name === 'attemptGrantsByStudentId' && item && typeof item === 'object') Object.keys(item).forEach((id) => out.grantIds.add(id));
      if (name === 'excusedStudentIds' && Array.isArray(item) && item.length) out.excusedLists += 1;
      if (name === 'reopenedStudentIds' && Array.isArray(item) && item.length) out.reopenedLists += 1;
      if (name === 'recoveryAudit' && Array.isArray(item)) out.studentAudit += item.filter((entry) => entry?.scope?.type === 'students').length;
      if (inDol && STAFF.has(name)) out.staffNamesInDol += 1;
      visit(item, inDol || name === 'dol', depth + 1);
    });
  };
  const stack = [root[key]];
  while (stack.length) {
    const fiber = stack.pop();
    if (!fiber) continue;
    let hook = fiber.memoizedState;
    let guard = 0;
    if (hook && typeof hook === 'object' && 'next' in hook && 'memoizedState' in hook) {
      while (hook && guard < 1000) { visit(hook.memoizedState, false, 0); hook = hook.next; guard += 1; }
    } else visit(fiber.memoizedState, false, 0);
    visit(fiber.memoizedProps, false, 0);
    if (fiber.child) stack.push(fiber.child);
    if (fiber.sibling) stack.push(fiber.sibling);
  }
  return { ...out, overrideIds: [...out.overrideIds].sort(), grantIds: [...out.grantIds].sort() };
});

/** What the browser keeps in its own storage (the harness's fake backend excluded). */
const storageMentions = (page, needle) => page.evaluate((id) => {
  const hits = [];
  [['local', localStorage], ['session', sessionStorage]].forEach(([kind, storage]) => {
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name === 'mm-teacher-workflow-harness-db-v1') continue;
      if (String(storage.getItem(name) || '').includes(id)) hits.push(`${kind}:${name}`);
    }
  });
  return hits;
}, needle);

const expectOwnStateOnly = (label, scan, self) => {
  const others = scan.overrideIds.filter((id) => id !== self);
  expect(label, scan.objects > 1000, `the state scan reached the app (${scan.objects} objects)`);
  expect(label, others.length === 0, `no classmate's controls in the app's state (found ${others.join(', ')})`);
  expect(label, scan.grantIds.every((id) => id === self), `no classmate's DOL grant in the app's state (${scan.grantIds.join(', ')})`);
  expect(label, scan.excusedLists === 0 && scan.reopenedLists === 0, `no excused/reopened lists (${scan.excusedLists}/${scan.reopenedLists})`);
  expect(label, scan.studentAudit === 0, `no student-scoped recovery-log entry (${scan.studentAudit})`);
  expect(label, scan.staffNamesInDol === 0, `no staff name in any lesson's DOL data (${scan.staffNamesInDol})`);
};

/*
 * EVERY FRAME REACT COMMITS. A DevTools-style hook installed before the app
 * loads is called by React after each commit, with the DOM updated: the
 * shared-Chromebook journey checks the screen there, so even a single stale
 * frame of the previous account between two commits is caught.
 */
const COMMIT_PROBE = () => {
  window.__mmCommits = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
    onCommitFiberRoot() { window.__mmCommits += 1; window.__mmOnCommit?.(); },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {},
    isDisabled: false,
  };
};

const openStudent = async (context, mode, studentId, extra = '') => {
  const page = await context.newPage();
  await page.addInitScript(COMMIT_PROBE);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unimplemented = watchUnimplementedCallables(page);
  await page.goto(`${PAGE}?reset=1&controls=${mode}&as=student&studentId=${studentId}${extra}`, { timeout: 180_000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 120_000 });
  await settle(page, 2500);
  return { page, errors, unimplemented };
};

const home = async (page) => {
  await page.getByRole('button', { name: /^Home$/ }).first().click();
  await settle(page, 900);
};

/* --------------------------------------------------------------- P1 */

const studentJourney = async (mode, viewport) => {
  const label = `P1 ${mode} ${viewport.width}`;
  const context = await browser.newContext({ viewport });
  const { page, errors, unimplemented } = await openStudent(context, mode, A);
  const start = await stats(page);
  expect(label, start.openListenersByPath[CONTROLS] === 1, `one own-controls listener (${start.openListenersByPath[CONTROLS]})`);
  expect(label, start.openListenersByPath.assignments === 1, `one lessons listener (${start.openListenersByPath.assignments})`);
  const body = await text(page.locator('body'));
  expect(label, body.includes(LAST_WEEK) && body.includes(LAST_DAY), `their extension shows: last week's lesson is open to them, with their own last day (${mode})`);
  expectOwnStateOnly(label, await scanAppState(page), A);
  expect(label, (await scanAppState(page)).overrideIds.includes(A), 'their own controls are in the app (the scan sees assignments)');
  for (const tab of ['Assignments', 'Grades', 'My Rewards']) {
    await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).first().click();
    await settle(page, 900);
    const during = await stats(page);
    expect(label, during.openListenersByPath[CONTROLS] === 1 && during.openListenersByPath.assignments === 1, `${tab}: still one of each (${during.openListenersByPath[CONTROLS]}/${during.openListenersByPath.assignments})`);
  }
  await home(page);
  const end = await stats(page);
  expect(label, end.subscriptions[CONTROLS] === 1, `the own-controls listener was opened once (${end.subscriptions[CONTROLS]})`);
  expect(label, end.subscriptions.assignments === 1, `the lessons listener was opened once (${end.subscriptions.assignments})`);
  expect(label, end.openListeners === start.openListeners, `back home, the same listeners are open (${start.openListeners} → ${end.openListeners})`);
  expect(label, end.clientWrites.every((write) => !write.path.startsWith(`${CONTROLS}/`)), 'the student\'s browser never writes a controls record');
  expect(label, errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
  expect(label, unimplemented().length === 0, `no unimplemented callable (${unimplemented().join(', ')})`);
  await page.screenshot({ path: path.join(ARTIFACTS, `p1-${mode}-${viewport.width}.png`) });
  await context.close();
};

/* --------------------------------------------------------------- P2 */

const watchFor = (page, markers) => page.evaluate((list) => {
  window.__mmSeen = [];
  const check = (value) => list.forEach((marker) => { if (value && value.includes(marker)) window.__mmSeen.push(marker); });
  window.__mmObserver?.disconnect();
  window.__mmObserver = new MutationObserver((mutations) => mutations.forEach((mutation) => {
    if (mutation.type === 'characterData') check(mutation.target.data);
    mutation.addedNodes.forEach((node) => check(node.textContent || ''));
  }));
  window.__mmObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
}, markers);
const seenMarkers = (page) => page.evaluate(() => {
  clearInterval(window.__mmSampler);
  window.__mmOnCommit = null;
  return [...new Set(window.__mmSeen || [])];
});
const commitsSinceSwitch = (page) => page.evaluate(() => window.__mmCommits - (window.__mmCommitsAtSwitch ?? window.__mmCommits));
// Sign the next account in and, from one render later, sample what is on
// screen every 50 ms: a previous screen that merely STAYS up (no node added)
// is caught too.
const signInNext = (page, studentId, markers) => page.evaluate(({ id, list }) => {
  window.__mmCommitsAtSwitch = window.__mmCommits;
  window.__mmOnCommit = () => {
    const visible = document.body.innerText;
    list.forEach((marker) => { if (visible.includes(marker)) window.__mmSeen.push(`committed frame: ${marker}`); });
  };
  window.__mmHarnessAuth.signInStudent(id);
  setTimeout(() => {
    window.__mmSampler = setInterval(() => {
      const visible = document.body.innerText;
      list.forEach((marker) => { if (visible.includes(marker)) window.__mmSeen.push(`on screen: ${marker}`); });
    }, 50);
  }, 120);
}, { id: studentId, list: markers });
const A_MARKERS = [A_NAME, `ID ${A}`, LAST_DAY];

const bSettled = async (page, label, mode) => {
  await page.getByText(B_NAME).first().waitFor({ timeout: 60_000 });
  await settle(page, 2500);
  const body = await text(page.locator('body'));
  expect(label, !body.includes(A_NAME) && !body.includes(LAST_DAY), `B's screen shows nothing of A's (${mode})`);
  expect(label, !body.includes(LAST_WEEK) || !body.includes(LAST_DAY), 'A\'s extended lesson is not open for B');
  const commits = await commitsSinceSwitch(page);
  const seen = await seenMarkers(page);
  expect(label, commits > 0, `the commit probe saw React render the switch (${commits} commits)`);
  expect(label, seen.length === 0, `nothing of A's was rendered at any moment of the switch (saw ${seen.join(', ')})`);
  expectOwnStateOnly(label, await scanAppState(page), B);
  const now = await stats(page);
  expect(label, now.openListenersByPath[CONTROLS] === 1, `exactly one own-controls listener: B's (${now.openListenersByPath[CONTROLS]})`);
  expect(label, now.openListenersByPath.assignments === 1, `exactly one lessons listener (${now.openListenersByPath.assignments})`);
  const kept = await storageMentions(page, A);
  expect(label, kept.length === 0, `the browser's own storage keeps nothing naming A (${kept.join(', ')})`);
};

const sharedChromebookJourney = async (mode, viewport) => {
  // Slow claims and slow private controls: the switch is observed while B's
  // account and B's records are still on their way.
  const slow = '&authDelayMs=1200&controlsLatencyMs=900';
  {
    const label = `P2 sign-out ${mode} ${viewport.width}`;
    const context = await browser.newContext({ viewport });
    const { page, errors } = await openStudent(context, mode, A, slow);
    expect(label, (await text(page.locator('body'))).includes(LAST_DAY), 'A sees their own extension first (the marker is real)');
    await page.getByText('Log Out').first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Log Out'), null, { timeout: 30_000 });
    await settle(page, 600);
    const signedOut = await stats(page);
    expect(label, !signedOut.openListenersByPath[CONTROLS] && !signedOut.openListenersByPath.assignments, `signing out closed A's controls and lessons listeners (${JSON.stringify(signedOut.openListenersByPath)})`);
    const loginScreen = await text(page.locator('body'));
    expect(label, !A_MARKERS.some((marker) => loginScreen.includes(marker)), 'the signed-out screen shows nothing of A\'s');
    expectOwnStateOnly(label, await scanAppState(page), '(nobody)');
    await watchFor(page, A_MARKERS);
    await signInNext(page, B, A_MARKERS);
    await bSettled(page, label, mode);
    expect(label, errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
    await page.screenshot({ path: path.join(ARTIFACTS, `p2-signout-${mode}-${viewport.width}.png`) });
    await context.close();
  }
  {
    const label = `P2 switch ${mode} ${viewport.width}`;
    const context = await browser.newContext({ viewport });
    const { page, errors } = await openStudent(context, mode, A, slow);
    await watchFor(page, A_MARKERS);
    // Another tab signed B in on this device: no signed-out moment between.
    await signInNext(page, B, A_MARKERS);
    await bSettled(page, label, mode);
    expect(label, errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
    await context.close();
  }
  {
    const label = `P2 cached ${mode} ${viewport.width}`;
    const context = await browser.newContext({ viewport });
    const { page } = await openStudent(context, mode, B, `&leakForeignControls=${A}&controlsLatencyMs=600`);
    const body = await text(page.locator('body'));
    expect(label, !body.includes(LAST_DAY), 'a cached snapshot carrying A\'s records changes nothing B sees');
    expectOwnStateOnly(label, await scanAppState(page), B);
    await context.close();
  }
};

/* --------------------------------------------------------------- P3 */

const openTeacher = async (context, mode, extra = '') => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unimplemented = watchUnimplementedCallables(page);
  await page.goto(`${PAGE}?reset=1&controls=${mode}${extra}`, { timeout: 180_000 });
  await page.getByRole('heading', { name: 'Live Class', exact: true }).waitFor({ timeout: 90_000 });
  await settle(page, 1500);
  return { page, errors, unimplemented };
};
const sidebar = (page, name) => page.locator('nav, aside').getByRole('button', { name }).first().click();

const teacherJourney = async (mode, viewport) => {
  const label = `P3 ${mode} ${viewport.width}`;
  const context = await browser.newContext({ viewport });
  const { page, errors, unimplemented } = await openTeacher(context, mode);
  const atHome = await stats(page);
  expect(label, atHome.openListenersByPath[CONTROLS] === 1, `one controls listener for the class on screen (${atHome.openListenersByPath[CONTROLS]})`);
  const opened = () => stats(page).then((now) => now.subscriptions[CONTROLS] || 0);
  const before = await opened();
  const inSession = page.getByRole('group', { name: 'Classes in session' });
  if (await inSession.count()) {
    await inSession.getByRole('button', { name: /Lab/ }).click();
    await settle(page, 900);
    expect(label, (await opened()) === before + 1, `a class switch replaced the listener once (${before} → ${await opened()})`);
    expect(label, (await stats(page)).openListenersByPath[CONTROLS] === 1, 'still one');
    await inSession.getByRole('button', { name: 'Algebra II — Period 3', exact: true }).click();
    await settle(page, 900);
    expect(label, (await opened()) === before + 2, `and back once more (${await opened()})`);
  }
  let most = 0;
  const visit = async (step) => {
    await step();
    await settle(page, 1200);
    most = Math.max(most, (await stats(page)).openListenersByPath[CONTROLS] || 0);
  };
  // Grades and Classes follow the class on screen; Grade Export and the
  // Action Center span the teacher's classes — still one listener.
  for (const name of [/Grades$/, /Classes$/, /Grade Export$/, /Action Center$/, /Home$/]) {
    // eslint-disable-next-line no-await-in-loop
    await visit(() => sidebar(page, name));
  }
  expect(label, most === 1, `never more than one controls listener on any screen (${most})`);
  const back = await stats(page);
  expect(label, back.openListeners === atHome.openListeners, `back home, the same listeners are open (${atHome.openListeners} → ${back.openListeners})`);
  // The assignments listener is the teacher's one (unchanged by this release).
  expect(label, back.openListenersByPath.assignments === 1, `one assignments listener (${back.openListenersByPath.assignments})`);
  await page.getByRole('button', { name: 'Log Out' }).first().click();
  await page.waitForFunction(() => !document.body.innerText.includes('Live Class'), null, { timeout: 30_000 });
  await settle(page, 600);
  const out = await stats(page);
  expect(label, !out.openListenersByPath[CONTROLS] && !out.openListenersByPath.assignments, `signing out closed them (${JSON.stringify(out.openListenersByPath)})`);
  expect(label, errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
  expect(label, unimplemented().length === 0, `no unimplemented callable (${unimplemented().join(', ')})`);
  await context.close();
};

/* --------------------------------------------------------------- P4 */

const dolJourney = async (mode, viewport) => {
  const label = `P4 ${mode} ${viewport.width}`;
  const context = await browser.newContext({ viewport });
  const { page, errors, unimplemented } = await openTeacher(context, mode, '&controlsCallMs=800');
  await sidebar(page, /Classes$/);
  await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().click();
  await page.locator('[data-lesson-group="today"]').first().getByRole('button', { name: 'Details' }).click();
  const hub = page.locator('[data-assignment-hub]');
  await hub.waitFor();
  await hub.getByRole('button', { name: /^Grades/ }).click();
  await settle(page, 1500);
  await page.locator('table tbody tr').filter({ hasText: `ID ${GRANTED}` }).first().getByRole('button', { name: 'Details' }).click();
  const row = page.locator(`[data-dol-student-recovery="${GRANTED}"]`);
  await row.waitFor({ timeout: 15_000 });
  expect(label, /\(2 for this student\)/.test(await text(row)), `the teacher sees the student's own grant (${mode}: ${await text(row)})`);
  await page.evaluate(() => window.__mmHarnessStore.resetStats());
  await row.getByRole('button', { name: /Grant \+1 DOL attempt/ }).dblclick();
  await settle(page, 300);
  expect(label, (await page.getByRole('alertdialog').count()) === 1, 'a double-click asks once, and its second press does not dismiss the question');
  await confirmDialog(page);
  await settle(page, 150);
  expect(label, await row.getByRole('button', { name: /Granting|Grant \+1/ }).first().isDisabled(), 'the button waits while the request is on its way');
  await row.getByText(/\(3 for this student\)/).waitFor({ timeout: 10_000 }).catch(() => {});
  const after = await stats(page);
  expect(label, after.callables.setStudentAssignmentControls === 1, `one request (${after.callables.setStudentAssignmentControls})`);
  expect(label, after.clientWrites.length === 0, `the browser wrote nothing itself (${after.clientWrites.map((write) => `${write.op} ${write.path}`).join(', ')})`);
  expect(label, /\(3 for this student\)/.test(await text(row)), `the count follows the private record (${await text(row)})`);
  const record = await page.evaluate((id) => window.__mmHarnessStore.get(`studentAssignmentOverrides/6:${id}:a-today`), GRANTED);
  expect(label, record?.dolExtraAttempts === 3 && record?.revision === 2, `the private record: 3 attempts, revision 2 (${record?.dolExtraAttempts}/${record?.revision})`);
  const shared = await page.evaluate(() => window.__mmHarnessStore.get('assignments/a-today').dol?.attemptGrantsByStudentId?.['910003'] || null);
  if (mode === 'retired') expect(label, shared === null, 'retired: nothing per-student reaches the shared lesson');
  else expect(label, shared?.extraAttempts === 3, `mirrored for previous-release screens, by the server (${JSON.stringify(shared)})`);
  await row.locator('[data-dol-grant-history-toggle]').click();
  const history = page.locator(`[data-dol-grant-history="${GRANTED}"]`);
  await history.waitFor({ timeout: 10_000 });
  const entries = await history.locator('[data-dol-grant-history-entry]').count();
  expect(label, entries >= 2 && /2 → 3/.test(await text(history)), `the grant history shows the grant (${entries}: ${(await text(history)).slice(0, 120)})`);
  expect(label, errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
  expect(label, unimplemented().length === 0, `no unimplemented callable (${unimplemented().join(', ')})`);
  await page.screenshot({ path: path.join(ARTIFACTS, `p4-${mode}-${viewport.width}.png`) });
  await context.close();
};

/* --------------------------------------------------------------- P5 */

const adminJourney = async (viewport) => {
  const label = `P5 ${viewport.width}`;
  const context = await browser.newContext({ viewport });
  const { page, errors, unimplemented } = await openTeacher(context, 'mirror', '&rootAdmin=1');
  await page.locator('[aria-label="Root administrator workspace"]').getByRole('button', { name: 'Administration' }).click();
  await page.getByRole('heading', { name: 'MathMaster Administration' }).waitFor({ timeout: 15_000 });
  const card = page.locator('[data-student-controls-migration]');
  await card.waitFor({ timeout: 15_000 });
  const stage = () => card.getAttribute('data-student-controls-migration');
  const button = (name) => card.getByRole('button', { name, exact: true });
  const shared = () => page.evaluate(() => window.__mmHarnessStore.get('assignments/a-today'));
  expect(label, await stage() === 'backfillIncomplete', `starts at "Backfill incomplete" (${await stage()})`);
  expect(label, await card.locator('[data-retire-unavailable]').count() === 1, 'retiring is not offered');
  expect(label, await button('Strip dry run').isDisabled(), 'the strip waits for retirement');
  expect(label, !(await text(card)).includes('1970') && !/Thursday, Jan 1\b/.test(await text(card)), 'no school day is named before the release is recorded');

  await button('Check without changing anything').click();
  await card.getByRole('table', { name: 'Backfill report' }).waitFor({ timeout: 15_000 });
  await button('Copy into private records').click();
  await card.getByText(/Last full pass: .*\d/).waitFor({ timeout: 15_000 });
  expect(label, await stage() === 'waitingSafetyPeriod', `a clean full pass: waiting for the safety period (${await stage()})`);

  const record = button('Record this release as live');
  expect(label, await record.isDisabled(), 'recording the release needs the attestation (the build cannot be read here)');
  await card.getByText(/I confirm this release.s Hosting is deployed/).click();
  await record.click();
  await card.getByText(/Recorded: .*\d/).waitFor({ timeout: 15_000 });
  expect(label, await stage() === 'waitingSafetyPeriod', 'recorded: the school-day clock runs');
  await page.waitForFunction(() => /Still needed: it has been live for one full school day\./.test(document.querySelector('[data-retire-unavailable]')?.innerText || ''), null, { timeout: 10_000 }).catch(() => {});
  const stillNeeded = await text(card.locator('[data-retire-unavailable]'));
  expect(label, /Still needed: it has been live for one full school day\./.test(stillNeeded), `only the school day is still needed (${stillNeeded})`);

  // A school day passes (the record back-dated, as the rehearsal does).
  await page.evaluate(() => {
    const store = window.__mmHarnessStore;
    const progress = store.get('platformMigrations/studentAssignmentOverrides');
    store.set('platformMigrations/studentAssignmentOverrides', { ...progress, cutover: { ...progress.cutover, confirmedAtMs: progress.cutover.confirmedAtMs - 7 * 86_400_000 } });
  });
  await button('Check status').click();
  await card.getByRole('button', { name: 'Retire the shared copy' }).waitFor({ timeout: 15_000 });
  expect(label, await stage() === 'readyToRetire', `ready to retire (${await stage()})`);
  const retire = button('Retire the shared copy');
  expect(label, await retire.isDisabled(), 'retiring needs the attestation and the typed phrase');
  await card.getByLabel('Retirement confirmation').fill('retire');
  await card.getByText(/Students used this release for a full school day/).click();
  expect(label, await retire.isDisabled(), 'not with the wrong phrase');
  await card.getByLabel('Retirement confirmation').fill('RETIRE SHARED COPY');
  expect(label, !(await retire.isDisabled()), 'attested and typed: available');
  await retire.click();
  await page.waitForFunction(() => document.querySelector('[data-student-controls-migration]')?.getAttribute('data-student-controls-migration') === 'retired', null, { timeout: 15_000 });
  expect(label, Boolean((await shared()).studentOverrides), 'retiring alone strips nothing');

  // The dry run and the strip are two separate actions.
  const strip = button('Strip shared copies');
  expect(label, await strip.isDisabled(), 'the strip waits for its dry run');
  await button('Strip dry run').click();
  const dryTable = card.getByRole('table', { name: 'Strip dry-run report' });
  await dryTable.waitFor({ timeout: 15_000 });
  const dryText = await text(dryTable);
  ['Assignments scanned', 'Assignments with shared student data', 'Records confirmed private', 'Awaiting absorption', 'Failures', 'Archives that would be written']
    .forEach((row) => expect(label, dryText.includes(row), `the dry run reports "${row}"`));
  expect(label, Boolean((await shared()).studentOverrides), 'the dry run changed nothing');
  expect(label, await strip.isDisabled(), 'still not without the typed phrase');
  await card.getByLabel('Strip confirmation').fill('STRIP SHARED COPIES');
  await strip.click();
  await card.getByRole('table', { name: 'Strip report' }).waitFor({ timeout: 15_000 });
  const after = await shared();
  expect(label, !after.studentOverrides && !after.excusedStudentIds && !after.dol?.attemptGrantsByStudentId, 'stripped: nothing per-student on the shared lesson');
  const archives = await page.evaluate(() => window.__mmHarnessStore.paths('assignmentOverrideArchives/').length);
  expect(label, archives >= 1, `archived first (${archives})`);

  // The rollback.
  await card.getByText('Turn retirement off (rollback)').click();
  await button('Keep the shared copy in step again').click();
  await page.waitForFunction(() => document.querySelector('[data-student-controls-migration]')?.getAttribute('data-student-controls-migration') !== 'retired', null, { timeout: 15_000 });
  await button('Restore dry run').click();
  await settle(page, 600);
  await card.getByLabel('Restore confirmation').fill('RESTORE SHARED COPIES');
  await button('Restore shared copies').click();
  await page.waitForFunction(() => Boolean(window.__mmHarnessStore.get('assignments/a-today').studentOverrides), null, { timeout: 15_000 }).catch(() => {});
  expect(label, Boolean((await shared()).studentOverrides), 'restored for previous-release screens');
  expect(label, /record the release as live again/i.test(await text(card)) || await stage() !== 'readyToRetire', 'retiring again starts over');
  expect(label, errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
  expect(label, unimplemented().length === 0, `no unimplemented callable (${unimplemented().join(', ')})`);
  await page.screenshot({ path: path.join(ARTIFACTS, `p5-${viewport.width}.png`), fullPage: true });
  await context.close();
};

/* --------------------------------------------------------------- run */

const runs = [];
for (const viewport of VIEWPORTS) {
  for (const mode of MODES) {
    runs.push([`P1 ${mode} ${viewport.width}`, () => studentJourney(mode, viewport)]);
    runs.push([`P2 ${mode} ${viewport.width}`, () => sharedChromebookJourney(mode, viewport)]);
    runs.push([`P3 ${mode} ${viewport.width}`, () => teacherJourney(mode, viewport)]);
    runs.push([`P4 ${mode} ${viewport.width}`, () => dolJourney(mode, viewport)]);
  }
  runs.push([`P5 ${viewport.width}`, () => adminJourney(viewport)]);
}
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const [name, run] of runs) {
  if (only && !only.test(name)) continue;
  const started = Date.now();
  try {
    await run();
    console.log(`ran ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    findings.push(`${name}: the journey could not finish — ${String(error?.message || error).split('\n')[0]}`);
    console.log(`FAILED ${name}`);
  }
}
await browser.close();

console.log(`\n${passed.length} checks passed, ${findings.length} findings.`);
findings.forEach((finding) => console.log(`  ✗ ${finding}`));
process.exit(findings.length ? 1 : 0);

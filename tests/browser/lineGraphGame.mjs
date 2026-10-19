// Play whole Graph the Line games in real browsers, against the REAL server.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   node tests/browser/lineGraphGame.mjs
//   LINE_SHOTS=/some/dir node tests/browser/lineGraphGame.mjs     # keep screenshots
//   LINE_SCENARIOS=sprint,classic node tests/browser/lineGraphGame.mjs
//
// WHAT IS REAL. The student and teacher screens (the same harness pages as
// Graph Feature Rush's: graphFeatureRushStudent.html / Teacher.html), the
// snapshot watchers, the Firestore emulator, and every callable — each page
// posts its callables to a local bridge that runs the real handler under that
// page's identity, loaded from the deployed entry point. A line is checked by
// the device and recorded by the real transaction; a round closes through
// the real lifecycle; every screen shows what the server actually wrote.
//
// HOW IT PLAYS. Black box: the driver reads which item is on a student's
// screen (data-question-index), regenerates it from the room's private seed
// exactly as the server does, and draws its line where the grid DRAWS it —
// press, drag and release with a mouse, a finger (touch events through the
// DevTools protocol, so a drag is a real drag) or the keyboard — then reads
// the screen back.
//
// While Graph the Line is in preview only the platform administrator can
// launch it, so the console here is the administrator's.
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browsers block every non-local request, and the project id is throwaway.
// This is a QA tool, not part of the CI gate.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PROJECT = 'mathmaster-game-harness';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const VITE_PORT = Number(process.env.LINE_VITE_PORT || 5197);
const BRIDGE_PORT = Number(process.env.LINE_BRIDGE_PORT || 5298);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.LINE_SHOTS || path.join(os.tmpdir(), 'graph-the-line-shots');
const ONLY = (process.env.LINE_SCENARIOS || '').split(',').map((entry) => entry.trim()).filter(Boolean);
mkdirSync(SHOTS, { recursive: true });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);

const waitForHttp = async (url, attempts = 80) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch { /* not up yet */ }
    await wait(500);
  }
  return false;
};

// Children run in their own process groups; the emulator is asked to stop
// (SIGINT) before anything is killed, so its Java process frees its port.
const started = [];
const killAll = () => {
  for (const child of started) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
};
const stopAll = async () => {
  const exited = started.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  }));
  for (const child of started) {
    try { process.kill(-child.pid, 'SIGINT'); } catch { /* gone */ }
  }
  await Promise.race([Promise.all(exited), wait(15_000)]);
  killAll();
};
process.on('exit', killAll);
process.on('SIGINT', () => { stopAll().finally(() => process.exit(130)); });

/* ------------------------------ the emulator ----------------------------- */

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
if (!await waitForHttp(`http://${EMULATOR}/`, 2)) {
  const emulator = spawn(
    'npx',
    ['firebase', 'emulators:start', '--only', 'firestore', '--project', PROJECT, '--config', path.join(here, 'emulator/firebase.json')],
    { cwd: path.join(here, 'emulator'), stdio: 'ignore', detached: true },
  );
  started.push(emulator);
  if (!await waitForHttp(`http://${EMULATOR}/`)) {
    console.error('Firestore emulator did not start.');
    process.exit(2);
  }
}

/* -------------------- the real server, behind a bridge -------------------- */

const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const { generateLineQuestion } = await import(path.join(repo, 'functions/shared/lineGraphGenerator.mjs'));
const { latticePointsInView, slopeOf, yInterceptOf } = await import(path.join(repo, 'functions/shared/lineGraphMath.mjs'));
const { lineGraphFormatOfMode, lineLockoutMs } = await import(path.join(repo, 'functions/shared/lineGraphRules.mjs'));
const { unitX, unitY } = await import(path.join(repo, 'src/platform/liveChallenge/lineGraphModel.js'));

const authFor = (identity = {}) => (identity.as === 'teacher'
  ? { uid: `${identity.email}-uid`, token: { role: 'teacher', email: identity.email, email_verified: true } }
  : { uid: `${identity.studentId}-uid`, token: { role: 'student', studentId: identity.studentId, email: `${identity.studentId}@example.com`, email_verified: true } });

const bridgeCalls = [];
const bridge = http.createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const name = decodeURIComponent((request.url || '').replace(/^\/call\//, ''));
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const { identity, data } = JSON.parse(raw || '{}');
  const handler = functionsIndex[name];
  const startedAt = Date.now();
  if (!handler?.run) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'not-found', message: `No callable ${name}` }));
    return;
  }
  try {
    const result = await handler.run({ auth: authFor(identity), data, rawRequest: { headers: {} } });
    bridgeCalls.push({ name, identity, ms: Date.now() - startedAt, ok: true });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    bridgeCalls.push({ name, identity, ms: Date.now() - startedAt, ok: false, code: error?.code });
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

/* ------------------------------- the pages ------------------------------- */

const vite = spawn(
  'npx',
  ['vite', '--config', path.join(here, 'emulator/vite.bridge.config.mjs'), '--port', String(VITE_PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true },
);
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) {
  console.error('Vite did not start.');
  process.exit(2);
}

/* -------------------------------- the class ------------------------------- */

const TEACHER = ROOT_ADMIN_EMAIL;
const CLASSES = Object.freeze({
  pair: { classId: 'line-qa-pair', name: 'Period 1 Algebra I', period: 'P1', course: 'algebra1', size: 2 },
  trio: { classId: 'line-qa-trio', name: 'Period 3 Algebra I', period: 'P3', course: 'algebra1', size: 3 },
  solo: { classId: 'line-qa-solo', name: 'Period 6 Algebra II', period: 'P6', course: 'algebra2', size: 1 },
});
const studentsOf = (key) => Array.from({ length: CLASSES[key].size }, (_, index) => `${CLASSES[key].classId}-s${index + 1}`);

for (const entry of Object.values(CLASSES)) {
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: TEACHER, status: 'active', course: entry.course, period: entry.period, name: entry.name });
}
for (const key of Object.keys(CLASSES)) {
  const batch = db.batch();
  studentsOf(key).forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: TEACHER, classId: CLASSES[key].classId, classPeriod: CLASSES[key].period, firstName: `Student${index + 1}`, lastName: key,
  }));
  await batch.commit();
}
const teacherProps = {
  email: TEACHER,
  classes: Object.values(CLASSES).map(({ classId, name, period, course }) => ({ classId, name, period, course, status: 'active' })),
  allStudents: Object.keys(CLASSES).flatMap((key) => studentsOf(key).map((id) => ({ id, studentId: id, classId: CLASSES[key].classId }))),
};

/* -------------------------------- browsers -------------------------------- */

const DEVICES = Object.freeze({
  chromebook: { viewport: { width: 1366, height: 768 } },
  ipad: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  smallPhone: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
});

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const notes = [];
const finding = (scenario, problem) => { findings.push({ scenario, problem }); log(`  ✗ ${scenario}: ${problem}`); };
const check = (scenario, condition, problem) => { if (!condition) finding(scenario, problem); return Boolean(condition); };

const IGNORABLE_CONSOLE = /ERR_FAILED|net::|Failed to fetch|WebChannel|transport errored|Could not reach|math fonts could not be loaded|Download the React DevTools/i;
const handles = [];

const openPage = async ({ device = 'chromebook', url, init = null, colorScheme = 'light', reducedMotion = 'no-preference' }) => {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme, reducedMotion });
  await context.route('**/*', (route) => {
    const target = route.request().url();
    if (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(target)) return route.continue();
    return route.abort();
  });
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !IGNORABLE_CONSOLE.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const handle = { page, context, errors, device, touch: Boolean(DEVICES[device].hasTouch) };
  handles.push(handle);
  return handle;
};

const openStudent = async (studentId, device, options = {}) => {
  const handle = await openPage({ device, url: `${ORIGIN}/tests/browser/graphFeatureRushStudent.html?studentId=${encodeURIComponent(studentId)}&emulator=${EMULATOR}&bridge=${BRIDGE}`, ...options });
  return Object.assign(handle, { studentId });
};

const openTeacher = async (device = 'chromebook') => openPage({
  device,
  url: `${ORIGIN}/tests/browser/graphFeatureRushTeacher.html?as=teacher&email=${encodeURIComponent(TEACHER)}&emulator=${EMULATOR}&bridge=${BRIDGE}`,
  init: { fn: (props) => { window.__mmTeacherProps = props; }, arg: teacherProps },
});

const shot = async (handle, name) => {
  const file = path.join(SHOTS, `${name}.png`);
  await handle.page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  return file;
};

const textOf = async (handle) => (await handle.page.locator('body').innerText()).replace(/\s+/g, ' ');

const waitForText = async (handle, needle, timeout = 15_000) => {
  try {
    await handle.page.waitForFunction((value) => document.body.innerText.replace(/\s+/g, ' ').toLowerCase().includes(value.toLowerCase()), needle, { timeout });
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------ the server's view -------------------------- */

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const lineSecret = async (roomId) => (await db.collection('liveChallengePrivate').doc(roomId).get()).data()?.lineGraph || null;
const activeRoomId = async () => (await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).data()?.roomId || null;

const itemOnScreen = async (student, roomId) => {
  const attribute = await student.page.locator('.mm-line-graph-frame').getAttribute('data-question-index').catch(() => '');
  if (attribute === '' || attribute == null) return null;
  const secret = await lineSecret(roomId);
  const room = await roomOf(roomId);
  const config = { ...secret.config, format: lineGraphFormatOfMode(room.challengeMode) };
  return generateLineQuestion({ seed: secret.seed, studentKey: student.studentId, roundIndex: room.currentRound, questionIndex: Number(attribute), config });
};

const waitForItem = async (student, timeout = 20_000) => {
  try {
    await student.page.waitForFunction(() => {
      const frame = document.querySelector('.mm-line-graph-frame');
      return frame && frame.getAttribute('data-question-index') !== '' && document.querySelector('svg.mm-line-graph') && !document.querySelector('.mm-line-overlay');
    }, null, { timeout });
    return true;
  } catch {
    return false;
  }
};

const waitForItemChange = async (student, from, timeout = 5_000) => {
  try {
    await student.page.waitForFunction((value) => {
      const frame = document.querySelector('.mm-line-graph-frame');
      return frame && (frame.getAttribute('data-question-index') !== String(value) || document.querySelector('.mm-line-overlay'));
    }, from, { timeout });
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------ drawing a line ----------------------------- */

const screenPoint = async (student, view, point) => {
  const box = await student.page.locator('svg.mm-line-graph').boundingBox();
  return { x: box.x + unitX(view, point.x) * box.width, y: box.y + unitY(view, point.y) * box.height };
};

// A finger, through the DevTools protocol: touchstart, moves, touchend — so a
// drag is a real drag (Playwright's touchscreen only taps).
const cdpOf = async (student) => {
  if (!student.cdp) student.cdp = await student.context.newCDPSession(student.page);
  return student.cdp;
};
const touchDrag = async (student, from, to, { steps = 6, holdShot = null } = {}) => {
  const cdp = await cdpOf(student);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / steps;
    const y = from.y + ((to.y - from.y) * step) / steps;
    // eslint-disable-next-line no-await-in-loop
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    // eslint-disable-next-line no-await-in-loop
    await wait(16);
  }
  if (holdShot) await holdShot();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
// A finger that presses and drags, is looked at, and is then cancelled (the
// system took the touch): nothing is placed.
const touchHold = async (student, from, to, look, { steps = 6 } = {}) => {
  const cdp = await cdpOf(student);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= steps; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps }] });
    // eslint-disable-next-line no-await-in-loop
    await wait(16);
  }
  try {
    return await look();
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await wait(60);
  }
};
const heldLabelBox = async (student) => student.page.locator('svg.mm-line-graph .mm-line-held rect').boundingBox();
// The grid's own outline: the keyboard ring, or none.
const gridOutline = async (student) => student.page.locator('svg.mm-line-graph').evaluate((svg) => ({
  style: getComputedStyle(svg).outlineStyle,
  focused: document.activeElement === svg,
}));
const mouseDrag = async (student, from, to, { steps = 6 } = {}) => {
  await student.page.mouse.move(from.x, from.y);
  await student.page.mouse.down();
  await student.page.mouse.move(to.x, to.y, { steps });
  await student.page.mouse.up();
};

/** Place (or drag) one point: a press at `from`, a release at `to`. */
const placePoint = async (student, view, point, { from = null, holdShot = null } = {}) => {
  const to = await screenPoint(student, view, point);
  const start = from ? await screenPoint(student, view, from) : to;
  if (student.touch) await touchDrag(student, start, to, { holdShot });
  else await mouseDrag(student, start, to);
  await wait(60);
};

/** The keyboard: arrows from wherever the crosshair is, then Enter. */
const keyTo = async (student, from, to) => {
  const press = async (key, times) => { for (let index = 0; index < times; index += 1) await student.page.keyboard.press(key); }; // eslint-disable-line no-await-in-loop
  await press(to.x > from.x ? 'ArrowRight' : 'ArrowLeft', Math.abs(to.x - from.x));
  await press(to.y > from.y ? 'ArrowUp' : 'ArrowDown', Math.abs(to.y - from.y));
  await student.page.keyboard.press('Enter');
  await wait(60);
};

const rightPoints = (item) => {
  const points = latticePointsInView(item.line, item.view, { inset: 1 });
  return [points[0], points[Math.min(points.length - 1, 1)]];
};
// A wrong line: the first right point, and a point one step off the line.
const wrongPoints = (item, step = 1) => {
  const [first, second] = rightPoints(item);
  const y = second.y + step <= item.view.yMax - 1 ? second.y + step : second.y - step;
  return [first, { x: second.x, y }];
};

const feedbackOf = async (student) => ({
  kind: await student.page.locator('.mm-line-feedback').getAttribute('data-kind').catch(() => ''),
  text: (await student.page.locator('.mm-line-feedback').innerText().catch(() => '')).trim(),
});

// A built equation's boxes and symbols on one line, every one of them on the
// screen — and nothing on the round's stage wider than the screen.
const buildRowOnOneLine = async (student) => student.page.locator('.mm-line-build').evaluate((row) => {
  const boxes = [...row.children].map((child) => child.getBoundingClientRect());
  const middles = boxes.map((box) => box.top + box.height / 2);
  const stage = document.querySelector('.mm-line-stage');
  return {
    oneLine: Math.max(...middles) - Math.min(...middles) < 8,
    fits: boxes.every((box) => box.left >= -0.5 && box.right <= window.innerWidth + 0.5) && stage.scrollWidth <= stage.clientWidth + 1,
    right: Math.round(Math.max(...boxes.map((box) => box.right))),
    screen: window.innerWidth,
    stage: [stage.scrollWidth, stage.clientWidth],
  };
});

const doneCount = async (student) => Number((await student.page.locator('.mm-line-done').innerText()).replace(/\D+/g, '')) || 0;

/** Answer the item on screen the right way: a line, an option or the boxes. */
const answerRight = async (student, roomId, { scenario, keyboard = false, afterFirst = null } = {}) => {
  const item = await itemOnScreen(student, roomId);
  if (!item) return null;
  if (item.answerStyle === 'choice') {
    // The options render in the item's own order.
    await student.page.locator('.mm-line-choice').nth(item.choices.findIndex((choice) => choice.id === item.answerChoice)).click();
  } else if (item.answerStyle === 'build') {
    await typeBoxes(student, item, buildFieldsFor(item));
    await student.page.keyboard.press('Enter');
  } else if (keyboard) {
    await student.page.locator('svg.mm-line-graph').focus();
    const [p, q] = rightPoints(item);
    await keyTo(student, { x: 0, y: 0 }, p);
    if (afterFirst) await afterFirst();
    await keyTo(student, p, q);
  } else {
    const [p, q] = rightPoints(item);
    await placePoint(student, item.view, p);
    await placePoint(student, item.view, q);
  }
  const moved = await waitForItemChange(student, item.questionIndex);
  if (scenario) check(scenario, moved, `${student.studentId}: item ${item.questionIndex} (${item.itemType}/${item.form}) did not complete after its answer`);
  return item;
};

const text = (value) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);
const buildFieldsFor = (item) => {
  if (item.build.form === 'standard') return { A: String(item.line.a), B: String(item.line.b), C: String(item.line.c) };
  if (item.build.form === 'pointSlope') return { x1: String(item.marked.x), y1: String(item.marked.y), m: text(slopeOf(item.line)) };
  return { m: text(slopeOf(item.line)), b: text(yInterceptOf(item.line)) };
};
const FIELD_LABEL = Object.freeze({ m: /^m,/, b: /^b,/, A: /^A,/, B: /^B,/, C: /^C,/, x1: /^x₁,/, y1: /^y₁,/ });
const typeBoxes = async (student, item, fields) => {
  for (const [id, value] of Object.entries(fields)) {
    const box = student.page.getByLabel(FIELD_LABEL[id]);
    // eslint-disable-next-line no-await-in-loop
    await box.fill(value);
  }
};

/* -------------------------------- teacher UI ------------------------------- */

const selectInLabel = async (handle, labelStart, value) => {
  const select = handle.page.locator('label').filter({ hasText: new RegExp(`^${labelStart}`) }).locator('select').first();
  await select.selectOption(String(value));
};

const chooseLineGraph = async (teacher, classKey) => {
  await teacher.page.waitForSelector('text=Create a challenge', { timeout: 20_000 });
  await selectInLabel(teacher, 'Class', CLASSES[classKey].classId);
  await selectInLabel(teacher, 'Game type', 'lineGraph');
  await teacher.page.waitForSelector('[data-mm-line-setup="1"]', { timeout: 15_000 });
};

const createLine = async (teacher, { classKey, format = 'Classic', preset = null, rounds = 1, seconds = null, sprintLength = null, setup = null }) => {
  await chooseLineGraph(teacher, classKey);
  await teacher.page.locator('[data-mm-line-setup="1"] button', { hasText: new RegExp(`^${format}`) }).first().click();
  if (preset) await teacher.page.getByRole('button', { name: preset, exact: true }).click();
  if (sprintLength) await selectInLabel(teacher, 'Lines in a Sprint', sprintLength);
  if (setup) await setup(teacher);
  await selectInLabel(teacher, 'Rounds', rounds);
  if (seconds) await selectInLabel(teacher, 'Time per round', seconds);
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  try {
    await teacher.page.waitForSelector('text=Players in lobby', { timeout: 20_000 });
  } catch {
    await shot(teacher, `create-failed-${Date.now()}`);
    const alert = await teacher.page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    throw new Error(`no lobby after Create Lobby. Alerts: ${JSON.stringify(alert)}. Calls: ${JSON.stringify(bridgeCalls.slice(-5))}`);
  }
  return activeRoomId();
};

const startGame = async (teacher) => teacher.page.getByRole('button', { name: 'Start Challenge' }).click();

const waitForRoom = async (roomId, test, timeout = 60_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    // eslint-disable-next-line no-await-in-loop
    const room = await roomOf(roomId);
    if (test(room)) return room;
    // eslint-disable-next-line no-await-in-loop
    await wait(300);
  }
  return null;
};
const waitForRoundOpen = (roomId, roundIndex, timeout) => waitForRoom(roomId, (room) => room.status === 'running' && Number(room.currentRound) === roundIndex && room.roundState !== 'closed', timeout);
const waitForRoundClosed = (roomId, roundIndex, timeout) => waitForRoom(roomId, (room) => room.status !== 'running' || (Number(room.currentRound) === roundIndex && room.roundState === 'closed'), timeout);
const endsAtOf = (room) => (room.roundEndsAt?.toMillis?.() || room.endsAt?.toMillis?.() || 0);

const run = async (name, scenario) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  log(`▶ ${name}`);
  const before = findings.length;
  try {
    await scenario();
  } catch (error) {
    finding(name, `threw: ${error?.stack || error}`);
  }
  for (const handle of handles.splice(0)) {
    if (handle.errors.length) finding(name, `${handle.studentId || 'teacher'} (${handle.device}): console errors ${JSON.stringify(handle.errors.slice(0, 3))}`);
    // eslint-disable-next-line no-await-in-loop
    await handle.context.close().catch(() => {});
  }
  log(`${findings.length === before ? '✓' : '✗'} ${name}`);
};

/* ------------------------------- scenarios -------------------------------- */

// THE TEACHER'S SETUP, AND TRYING IT FIRST.
await run('setup', async () => {
  const S = 'setup';
  const teacher = await openTeacher('chromebook');
  await chooseLineGraph(teacher, 'pair');
  await shot(teacher, 'setup-classic');
  check(S, (await teacher.page.locator('text=Run as a Warm-Up').count()) === 0, 'Graph the Line offers a Warm-Up link');
  check(S, (await teacher.page.locator('text=Speed influence').count()) === 0, 'Graph the Line offers a speed setting');
  await teacher.page.locator('[data-mm-line-setup="1"] button', { hasText: /^Sprint/ }).first().click();
  check(S, await waitForText(teacher, 'Lines in a Sprint'), 'no Sprint length');
  // An impossible game says why before anything is created.
  for (const label of ['Slope-intercept form', 'Standard form', 'Point-slope form']) {
    // eslint-disable-next-line no-await-in-loop
    const box = teacher.page.locator('[data-mm-line-setup="1"] label', { hasText: label }).locator('input[type="checkbox"]');
    // eslint-disable-next-line no-await-in-loop
    if (await box.isChecked()) await box.uncheck();
  }
  check(S, await waitForText(teacher, 'Choose at least one form'), 'no forms: no warning');
  check(S, await teacher.page.getByRole('button', { name: 'Create Lobby' }).isDisabled(), 'an impossible game can be created');
  await shot(teacher, 'setup-sprint-problem');
  await teacher.page.getByRole('button', { name: 'All three forms' }).click();
  // Try it yourself first: the student's own screen, nothing recorded.
  await teacher.page.getByRole('button', { name: 'Try it yourself first' }).click();
  check(S, await waitForText(teacher, 'Practice — nothing is recorded'), 'no practice round');
  const practice = Object.assign(teacher, { studentId: 'practice' });
  await waitForItem(practice);
  await wait(2_200);
  const item = await practice.page.locator('.mm-line-graph-frame').getAttribute('data-question-index');
  check(S, item === '0', `practice starts on its first line (${item})`);
  await shot(teacher, 'practice');
  await teacher.page.getByRole('button', { name: 'Close practice' }).click();
  check(S, await waitForText(teacher, 'Create a challenge'), 'practice did not close');
  check(S, (await db.collection('liveChallengeRooms').where('classId', '==', CLASSES.pair.classId).get()).size === 0, 'practice created a room');
});

// A SPRINT OF FIVE: a mouse and a finger; a wrong line, a hint, a fix by
// dragging; three misses and the line shown; the round closes the moment
// both are done.
await run('sprint', async () => {
  const S = 'sprint';
  const [idA, idB] = studentsOf('pair');
  const teacher = await openTeacher('chromebook');
  const a = await openStudent(idA, 'chromebook');
  const b = await openStudent(idB, 'phone');
  const roomId = await createLine(teacher, { classKey: 'pair', format: 'Sprint', preset: 'Slope-intercept start', sprintLength: 5, rounds: 1, seconds: 120 });
  check(S, roomId, 'no room was created');
  for (const student of [a, b]) check(S, await waitForText(student, 'You are in as'), `${student.studentId} never reached the lobby`);
  check(S, await waitForText(a, 'Graph the Line Sprint'), 'the lobby does not say what the game is');
  await shot(b, 'sprint-lobby-phone');
  await startGame(teacher);
  const room = await waitForRoundOpen(roomId, 0);
  check(S, room, 'the round never opened');
  for (const student of [a, b]) check(S, await waitForItem(student), `${student.studentId}: no grid`);
  await shot(a, 'sprint-start-chromebook');
  await shot(b, 'sprint-start-phone');

  // A: a wrong line → its hint, the line stays; drag the wrong point to fix it.
  const first = await itemOnScreen(a, roomId);
  const [p, wrong] = wrongPoints(first);
  await placePoint(a, first.view, p);
  await placePoint(a, first.view, wrong);
  const miss = await feedbackOf(a);
  check(S, miss.kind === 'miss' && /tries? left/.test(miss.text), `A: a wrong line gave "${miss.text}" (${miss.kind})`);
  check(S, (await a.page.locator('.mm-line-graph circle').count()) >= 2, 'A: the wrong line\'s points are gone');
  const ring = await gridOutline(a);
  check(S, ring.style === 'none', `A: a keyboard ring on a grid drawn with the mouse (${JSON.stringify(ring)})`);
  await shot(a, 'sprint-wrong-line-chromebook');
  await placePoint(a, first.view, rightPoints(first)[1], { from: wrong });
  check(S, await waitForItemChange(a, first.questionIndex), 'A: dragging the point onto the line did not complete the item');
  check(S, (await doneCount(a)) === 1, 'A: the right line was not counted');
  for (let index = 1; index < 5; index += 1) await answerRight(a, roomId, { scenario: S }); // eslint-disable-line no-await-in-loop
  check(S, await waitForText(a, 'All done!'), 'A: no "All done" after the set');
  await shot(a, 'sprint-all-done-chromebook');

  // B, on a phone: the coordinates float above the finger while it drags.
  const firstB = await itemOnScreen(b, roomId);
  const [pb, qb] = rightPoints(firstB);
  // Near the top edge first: the coordinates go beside the finger, never under it.
  const topPoint = { x: 0, y: firstB.view.yMax };
  const topFinger = await screenPoint(b, firstB.view, topPoint);
  const besideBox = await touchHold(b, await screenPoint(b, firstB.view, { x: 0, y: firstB.view.yMax - 3 }), topFinger, async () => {
    await shot(b, 'sprint-drag-label-top-phone');
    return heldLabelBox(b);
  });
  check(S, besideBox && (besideBox.x + besideBox.width <= topFinger.x - 30 || besideBox.x >= topFinger.x + 30), `B: at the top edge, the coordinates are under the finger (${JSON.stringify(besideBox)} vs ${JSON.stringify(topFinger)})`);
  check(S, (await b.page.locator('svg.mm-line-graph .mm-line-held').count()) === 0 && (await b.page.locator('.mm-line-feedback').getAttribute('data-kind').catch(() => '')) !== 'miss', 'B: a cancelled touch placed a point');
  let label = '';
  let labelBox = null;
  const finger = await screenPoint(b, firstB.view, pb);
  await placePoint(b, firstB.view, pb, {
    // Pressed two grid lines away (inside the grid), dragged onto the point.
    from: { x: pb.x + (pb.x + 2 < firstB.view.xMax ? 2 : -2), y: pb.y + (pb.y + 2 < firstB.view.yMax ? 2 : -2) },
    holdShot: async () => {
      label = (await b.page.locator('svg.mm-line-graph .mm-line-held text').allTextContents()).join(' ');
      labelBox = await heldLabelBox(b);
      await shot(b, 'sprint-drag-label-phone');
    },
  });
  check(S, label === `(${pb.x < 0 ? '−' : ''}${Math.abs(pb.x)}, ${pb.y < 0 ? '−' : ''}${Math.abs(pb.y)})`, `B: the held point's coordinates read "${label}"`);
  const fitsAbove = finger.y - (await b.page.locator('svg.mm-line-graph').boundingBox()).y - 58 >= 17;
  if (fitsAbove) check(S, labelBox && labelBox.y + labelBox.height <= finger.y - 20, `B: the coordinates are not above the finger (${JSON.stringify(labelBox)} vs ${JSON.stringify(finger)})`);
  await placePoint(b, firstB.view, qb);
  check(S, await waitForItemChange(b, firstB.questionIndex), 'B: a right line drawn by touch did not complete');
  // Three wrong lines: the line is shown, dashed, and the next item follows.
  const stuck = await itemOnScreen(b, roomId);
  for (let step = 1; step <= 3; step += 1) {
    const [s1, s2] = wrongPoints(stuck, step);
    // eslint-disable-next-line no-await-in-loop
    if (step === 1) await placePoint(b, stuck.view, s1);
    // eslint-disable-next-line no-await-in-loop
    await placePoint(b, stuck.view, s2, step === 1 ? {} : { from: wrongPoints(stuck, step - 1)[1] });
    // eslint-disable-next-line no-await-in-loop
    if (step < 3) await wait(lineLockoutMs(step) + 120);
  }
  const shown = await feedbackOf(b);
  check(S, shown.kind === 'revealed', `B: the third miss did not show the line (${shown.kind}: ${shown.text})`);
  check(S, (await b.page.locator('.mm-line-reveal').count()) === 1, 'B: no dashed answer line');
  await shot(b, 'sprint-revealed-phone');
  check(S, await waitForItemChange(b, stuck.questionIndex, 4_000), 'B: the shown line did not move on');
  for (let index = 2; index < 5; index += 1) await answerRight(b, roomId, { scenario: S }); // eslint-disable-line no-await-in-loop
  const finishedAt = Date.now();
  const closed = await waitForRoundClosed(roomId, 0, 30_000);
  check(S, closed?.roundState === 'closed', 'the round did not close when both had finished');
  notes.push({ scenario: S, closedAfterLastFinishMs: Date.now() - finishedAt, deadlineLeftMs: endsAtOf(room) - Date.now() });
  check(S, Date.now() < endsAtOf(room) - 30_000, 'the round waited for its clock');
  for (const student of [a, b]) check(S, await waitForText(student, 'lines completed') || await waitForText(student, 'line completed'), `${student.studentId}: results do not count lines`);
  await shot(a, 'sprint-results-chromebook');
  await shot(b, 'sprint-results-phone');
  await teacher.page.getByRole('button', { name: 'Finish & Show Final Standings' }).click();
  check(S, await waitForText(teacher, 'lines right', 30_000), 'the report does not show the class\'s lines');
  await teacher.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(teacher, 'sprint-report-console');
});

// CLASSIC: THE CLASS GRAPHS ONE LINE. Two students draw the same wrong line
// first; after the round the class sees the line and that mistake — on each
// student's results and on the projector — and never before.
await run('classic', async () => {
  const S = 'classic';
  const [idA, idB, idC] = studentsOf('trio');
  const teacher = await openTeacher('chromebook');
  const students = [await openStudent(idA, 'chromebook'), await openStudent(idB, 'ipad'), await openStudent(idC, 'phone')];
  const roomId = await createLine(teacher, { classKey: 'trio', format: 'Classic', preset: 'Graph by intercepts', rounds: 3, seconds: 60 });
  for (const student of students) check(S, await waitForText(student, 'You are in as'), `${student.studentId} never reached the lobby`);
  await teacher.page.getByRole('button', { name: 'Projector View' }).click();
  await startGame(teacher).catch(() => teacher.page.locator('[data-mm-primary-action="start"]').click());
  await waitForRoundOpen(roomId, 0);
  for (const student of students) check(S, await waitForItem(student), `${student.studentId}: no grid`);
  await wait(800);
  check(S, (await teacher.page.locator('[data-mm-line-running]').count()) === 1, 'the projector has no Graph the Line view');
  const items = await Promise.all(students.map((student) => itemOnScreen(student, roomId)));
  // The settings line names the forms ("Ax + By = C"); the round's own equation never shows.
  const roundEquation = (items[0].equation || items[0].answer).text;
  check(S, !(await textOf(teacher)).includes(roundEquation), `the projector shows the round's equation (${roundEquation}) while it is open`);
  check(S, (await textOf(teacher)).includes('difficulty'), 'the projector\'s settings line does not say which difficulty');
  await shot(teacher, 'classic-projector-running');
  check(S, items.every((item) => JSON.stringify(item.line) === JSON.stringify(items[0].line)), 'Classic: not the same line for everyone');
  const [p, wrong] = wrongPoints(items[0]);
  for (const student of students.slice(0, 2)) {
    // eslint-disable-next-line no-await-in-loop
    await placePoint(student, items[0].view, p);
    // eslint-disable-next-line no-await-in-loop
    await placePoint(student, items[0].view, wrong);
  }
  await shot(students[1], 'classic-wrong-ipad');
  check(S, !(await roomRef(roomId).collection('solutions').doc('0').get()).exists, 'the line is public while the round is open');
  for (const [index, student] of students.entries()) {
    // eslint-disable-next-line no-await-in-loop
    if (index < 2) await placePoint(student, items[0].view, rightPoints(items[0])[1], { from: wrong });
    // eslint-disable-next-line no-await-in-loop
    else await answerRight(student, roomId, { scenario: S });
  }
  for (const student of students) check(S, await waitForText(student, 'All done!'), `${student.studentId}: no "All done"`);
  const closed = await waitForRoundClosed(roomId, 0, 20_000);
  check(S, closed?.roundState === 'closed', 'the Classic round did not close when everyone was done');
  for (const student of students) check(S, await waitForText(student, '2 students', 15_000), `${student.studentId}: the results do not show the class's mistake`);
  // The graph loads on first use (RevealedLine): wait for it, never count early.
  const drawn = async (handle) => handle.page.waitForSelector('[data-mm-line-reveal="1"]', { timeout: 10_000 }).then(() => true, () => false);
  check(S, await drawn(students[2]), 'the student results do not draw the line');
  await shot(students[2], 'classic-reveal-phone');
  await shot(students[0], 'classic-reveal-chromebook');
  check(S, await waitForText(teacher, '2 students', 15_000), 'the projector does not show the class\'s mistake');
  check(S, (await teacher.page.locator('[data-mm-projector-line="1"]').count()) === 1 && await drawn(teacher), 'the projector does not draw the line');
  await shot(teacher, 'classic-reveal-projector');
  const solution = (await roomRef(roomId).collection('solutions').doc('0').get()).data();
  check(S, solution?.lineGraph?.class?.mistake?.students === 2, `the published mistake: ${JSON.stringify(solution?.lineGraph?.class)}`);
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await teacher.page.getByRole('button', { name: 'End Game' }).last().click();
  await waitForRoom(roomId, (room) => room.status === 'finished', 20_000);
});

// NAMING A LINE, AND THE KEYBOARD: a Rush with both directions — built
// equations (Enter checks; unfinished boxes are not a miss) — and a student
// who graphs with the arrow keys.
await run('name-and-keyboard', async () => {
  const S = 'name-and-keyboard';
  const [id] = studentsOf('solo');
  const teacher = await openTeacher('chromebook');
  const student = await openStudent(id, 'chromebook');
  const roomId = await createLine(teacher, {
    classKey: 'solo',
    format: 'Rush',
    preset: 'Graph it and name it',
    rounds: 1,
    seconds: 60,
    setup: async (handle) => {
      await handle.page.locator('label', { hasText: 'Name it: Build it' }).locator('input').check();
    },
  });
  check(S, await waitForText(student, 'You are in as'), 'no lobby');
  await startGame(teacher);
  const room = await waitForRoundOpen(roomId, 0);
  check(S, await waitForItem(student), 'no grid');
  let built = 0;
  let keyed = 0;
  let unfinished = false;
  let ringWithKeys = null;
  let narrowChecked = false;
  while (Date.now() < endsAtOf(room) - 4_000 && (built < 2 || keyed < 2 || !narrowChecked)) {
    // eslint-disable-next-line no-await-in-loop
    const item = await itemOnScreen(student, roomId);
    if (!item) break;
    if (item.answerStyle === 'build') {
      // eslint-disable-next-line no-await-in-loop
      const row = await buildRowOnOneLine(student);
      check(S, row.oneLine && row.fits, `${item.build.form}: the boxes do not fit on one line (${JSON.stringify(row)})`);
      // The widest row, y − □ = □(x − □), on the narrowest phone.
      if (!narrowChecked && item.build.form === 'pointSlope') {
        narrowChecked = true;
        // eslint-disable-next-line no-await-in-loop
        await student.page.setViewportSize({ width: 320, height: 640 });
        // eslint-disable-next-line no-await-in-loop
        await wait(300);
        // eslint-disable-next-line no-await-in-loop
        const narrow = await buildRowOnOneLine(student);
        check(S, narrow.oneLine && narrow.fits, `${item.build.form} on a 320px phone: the boxes do not fit on one line (${JSON.stringify(narrow)})`);
        // eslint-disable-next-line no-await-in-loop
        await shot(student, `name-build-${item.build.form}-320`);
        // eslint-disable-next-line no-await-in-loop
        await student.page.setViewportSize(DEVICES.chromebook.viewport);
        // eslint-disable-next-line no-await-in-loop
        await wait(300);
      }
    }
    if (item.answerStyle === 'build' && !unfinished) {
      unfinished = true;
      // eslint-disable-next-line no-await-in-loop
      await typeBoxes(student, item, Object.fromEntries(Object.keys(buildFieldsFor(item)).map((key, index) => [key, index ? buildFieldsFor(item)[key] : ''])));
      // eslint-disable-next-line no-await-in-loop
      await student.page.keyboard.press('Enter');
      // eslint-disable-next-line no-await-in-loop
      const form = await feedbackOf(student);
      check(S, form.kind === 'form' && /Fill in every box/.test(form.text), `unfinished boxes: ${form.kind} "${form.text}"`);
      // eslint-disable-next-line no-await-in-loop
      await shot(student, 'name-build-unfinished');
    }
    // eslint-disable-next-line no-await-in-loop
    await answerRight(student, roomId, {
      scenario: S,
      keyboard: item.itemType === 'graph',
      // Halfway through a line drawn with the keys: the grid's own ring is on.
      afterFirst: async () => { if (!ringWithKeys) ringWithKeys = await gridOutline(student); },
    });
    if (item.answerStyle === 'build') built += 1;
    if (item.itemType === 'graph') keyed += 1;
  }
  check(S, built >= 1, 'no built equation was answered');
  check(S, narrowChecked, 'no point-slope equation was built, so its row was not measured on a narrow phone');
  check(S, keyed >= 1, 'no line was graphed with the keyboard');
  check(S, ringWithKeys?.focused && ringWithKeys.style === 'solid', `no keyboard ring while graphing with the keys (${JSON.stringify(ringWithKeys)})`);
  notes.push({ scenario: S, built, keyed });
  await shot(student, 'name-and-keyboard-play');
  await waitForRoundClosed(roomId, 0, 70_000);
  await teacher.page.getByRole('button', { name: 'Finish & Show Final Standings' }).click().catch(() => {});
  await waitForRoom(roomId, (current) => current.status === 'finished', 20_000);
});

/* --------------------------------- report --------------------------------- */

const summary = {
  findings,
  notes,
  bridge: {
    calls: bridgeCalls.length,
    byName: Object.fromEntries(Object.entries(bridgeCalls.reduce((counts, call) => ({ ...counts, [call.name]: (counts[call.name] || 0) + 1 }), {})).sort()),
    refused: bridgeCalls.filter((call) => !call.ok).map((call) => `${call.name}: ${call.code}`),
  },
  screenshots: SHOTS,
};
writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(summary, null, 2));
log(`${findings.length ? `${findings.length} finding(s)` : 'No findings'}. Screenshots and report: ${SHOTS}`);
await browser.close();
bridge.close();
await stopAll();
process.exit(findings.length ? 1 : 0);

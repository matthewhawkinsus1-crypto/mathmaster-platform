// Certify the secure Rich Tool runtime on the devices students use — in real
// browsers, against the REAL Cloud Functions.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   node tests/browser/testCycleRichToolQa.mjs
//   QA_SHOTS=/some/dir node tests/browser/testCycleRichToolQa.mjs   # keep screenshots
//   QA_TOOLS=graphing2,stepAlgebra QA_DEVICES=ipad QA_THEMES=dark …   # narrow a run
//   QA_DEBUG=1 …                                                      # log the draft saves
//
// WHAT IS REAL. The student's Test Cycle card, the secure exam container, the
// shared Rich Question Runtime and the authentic registry/engine tools — the
// production components — with every callable posted to a bridge that runs the
// real handler (functions/platformEntry.js) against the Firestore emulator.
// One single-item Test per certified Rich Tool the bank uses, built from the
// real bank family.
//
// FOR EVERY TOOL, at Chromebook (1366×768), iPad (820×1180) and phone (390×844),
// light and dark:
//   - the authentic tool renders under the Secure Test policy (the runtime
//     says so: data-rich-question-runtime="secureTest");
//   - the task is on screen;
//   - no sideways scroll, and no control outside the viewport;
//   - every visible button readable (4.5:1, 3:1 disabled);
//   - nothing that helps or judges: no hint, no "Correct"/"Not yet", no
//     "Your line:" readout, no "Check …" final action — it reads "Record
//     answer" (where the tool shows its final action before work is complete).
// Phone failures count only for a tool that CLAIMS phone support
// (secureToolCertification devices.phone); for the others they are reported.
//
// AND ON CHROMEBOOK AND iPAD (light), A STUDENT'S SESSION:
//   - work in the tool the way a student does (RECIPES: place by coordinate,
//     type an endpoint, describe the relation, make a balance move) → the
//     construction autosaves to the server and is kept on the device, with no
//     integrity event raised by the tool;
//   - reload → the same item reopens with the work kept;
//   - Submit test → the autosaved construction is recorded and graded (when it
//     is an answer by the server's own test; unfinished work records nothing);
//   - nothing of the session's work is left on the device.
//
// NOTHING TOUCHES PRODUCTION. This is a QA tool, not part of the CI gate.

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
const VITE_PORT = Number(process.env.QA_VITE_PORT || 5198);
const BRIDGE_PORT = Number(process.env.QA_BRIDGE_PORT || 5299);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.QA_SHOTS || path.join(os.tmpdir(), 'test-cycle-rich-tool-qa');
mkdirSync(SHOTS, { recursive: true });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const findings = [];
const notes = [];
const passes = [];
const check = (ok, label, detail = '', { soft = false } = {}) => {
  if (ok) passes.push(detail ? `${label} — ${detail}` : label);
  else (soft ? notes : findings).push(detail ? `${label} — ${detail}` : label);
  log(ok ? 'PASS' : soft ? 'NOTE' : 'FAIL', label, detail);
};

const waitForHttp = async (url, attempts = 120) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch { /* not up yet */ }
    await wait(500);
  }
  return false;
};

const started = [];
const killAll = () => { for (const child of started) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } } };
process.on('exit', killAll);
let startedEmulator = null;
const stopEmulator = async () => {
  if (!startedEmulator) return;
  try { process.kill(-startedEmulator.pid, 'SIGINT'); } catch { return; }
  for (let index = 0; index < 40; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!await waitForHttp(`http://${EMULATOR}/`, 1)) return;
    // eslint-disable-next-line no-await-in-loop
    await wait(500);
  }
};

/* --------------------------- emulator + server --------------------------- */

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
if (!await waitForHttp(`http://${EMULATOR}/`, 2)) {
  const emulator = spawn('npx', ['firebase', 'emulators:start', '--only', 'firestore', '--project', PROJECT, '--config', path.join(here, 'emulator/firebase.json')],
    { cwd: path.join(here, 'emulator'), stdio: 'ignore', detached: true });
  started.push(emulator);
  startedEmulator = emulator;
  if (!await waitForHttp(`http://${EMULATOR}/`)) { console.error('Firestore emulator did not start.'); process.exit(2); }
}
await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const { BANK_FAMILY_BY_TOOL, loadBankFamilies } = await import(path.join(repo, 'tests/fixtures/secureRichToolAnswers.mjs'));
const { SECURE_TOOL_CERTIFICATIONS } = await import(path.join(repo, 'functions/shared/secureToolCertification.mjs'));
const { readStoredItem } = require(path.join(repo, 'functions/lib/secureItemStorage.js'));
const { payloadHasWork } = require(path.join(repo, 'functions/lib/secureItems.js'));

const authFor = (identity = {}) => (identity.as === 'teacher'
  ? { uid: `${identity.email}-uid`, token: { role: 'teacher', email: identity.email, email_verified: true } }
  : { uid: `${identity.studentId}-uid`, token: { role: 'student', studentId: identity.studentId } });

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
  if (!handler?.run) { response.writeHead(404, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 'not-found', message: `No callable ${name}` })); return; }
  try {
    const result = await handler.run({ auth: authFor(identity), data, rawRequest: { headers: {} } });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

const vite = spawn('npx', ['vite', '--config', path.join(here, 'emulator/vite.testCycleBridge.config.mjs'), '--port', String(VITE_PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true });
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) { console.error('Vite did not start.'); killAll(); process.exit(2); }

/* -------------------------------- fixture -------------------------------- */

const PREFIX = 'richqa_';
const TEACHER = 'richqa.teacher@desotoisd.org';
const CLASS_ID = 'richqa-class';
// QA_TOOLS / QA_DEVICES / QA_THEMES (comma lists) narrow a run while debugging.
const only = (all, variable) => {
  const wanted = String(process.env[variable] || '').split(',').map((part) => part.trim()).filter(Boolean);
  return wanted.length ? all.filter((entry) => wanted.includes(entry)) : all;
};
const TOOLS = only(Object.keys(BANK_FAMILY_BY_TOOL), 'QA_TOOLS');
const ALL_DEVICES = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  ipad: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const DEVICES = Object.fromEntries(only(Object.keys(ALL_DEVICES), 'QA_DEVICES').map((device) => [device, ALL_DEVICES[device]]));
const THEMES = only(['light', 'dark'], 'QA_THEMES');
const SESSION_RUNS = new Set(['chromebook:light', 'ipad:light']);
const REPRESENTATIONS = new Set(['symbolic', 'graph', 'table', 'verbal', 'numeric', 'multiple']);
const assignmentIdFor = (toolId) => `${PREFIX}${toolId}`;
const studentFor = (toolId, device, theme) => `RICHQA_${toolId}_${device}_${theme}`.toUpperCase();

const seed = async () => {
  const bank = await loadBankFamilies();
  await db.collection('classes').doc(CLASS_ID).set({ name: 'Algebra I — Rich Tools', period: 'Period 3', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  for (const toolId of TOOLS) {
    const source = bank.find((entry) => entry.id === BANK_FAMILY_BY_TOOL[toolId]);
    const { id: _id, ...fields } = source;
    const familyId = `${PREFIX}${toolId}`;
    // eslint-disable-next-line no-await-in-loop
    await db.collection('pathQuestionBank').doc(familyId).set({ ...fields, active: true });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('assignments').doc(assignmentIdFor(toolId)).set({
      id: assignmentIdFor(toolId),
      schemaVersion: 5,
      title: `${SECURE_TOOL_CERTIFICATIONS[toolId].label} Check`,
      courseId: 'algebra1',
      assignedClassIds: [CLASS_ID],
      dueAt: '2099-01-01T00:00:00.000Z',
      assignment: { title: `${toolId} check`, courseId: 'algebra1' },
      assessmentPolicy: { mode: 'testCycle', passingScore: 70, review: { required: true } },
      testBlueprint: {
        blueprintId: `${PREFIX}${toolId}-blueprint`,
        version: 1,
        title: `${SECURE_TOOL_CERTIFICATIONS[toolId].label} Check`,
        calculatorMode: 'questionSpecific',
        targets: [{
          targetId: 't1', alignmentKey: (fields.alignmentKeys || [])[0] || fields.alignmentKey, label: toolId,
          dok: fields.dok, difficultyBand: fields.difficultyBand,
          representation: REPRESENTATIONS.has(fields.representation) ? fields.representation : 'multiple',
          toolId, anchor: true, weight: 1, questionCount: 1, familyIds: [familyId],
        }],
      },
      sections: [{ id: 'review', role: 'review', title: 'Review', questions: [{ questionId: `${PREFIX}r1`, type: 'response', prompt: 'Review' }] }],
    });
    for (const device of Object.keys(DEVICES)) {
      for (const theme of THEMES) {
        const studentId = studentFor(toolId, device, theme);
        // eslint-disable-next-line no-await-in-loop
        await db.collection('grades').doc(studentId).set({
          displayName: studentId, classId: CLASS_ID, classPeriod: 'Period 3', assignedTeacherEmail: TEACHER, status: 'active',
          gradesByAssignment: { [assignmentIdFor(toolId)]: { 0: { status: 'correct', totalAttempts: 1 } } },
        });
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await functionsIndex.assignTestCycleSessions.run({ auth: authFor({ as: 'teacher', email: TEACHER }), data: { assignmentId: assignmentIdFor(toolId), classId: CLASS_ID }, rawRequest: { headers: {} } });
  }
};

/* -------------------------------- browsers ------------------------------- */

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const open = async ({ studentId, assignmentId, device, theme }) => {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('ws://localhost') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    findings.push(`page error (${studentId}): ${error.message}`);
    log('PAGE ERROR', studentId, (error.stack || error.message).split('\n').slice(0, 6).join(' | '));
  });
  const query = `view=student&as=student&studentId=${studentId}&assignmentId=${assignmentId}`;
  await page.goto(`${ORIGIN}/tests/browser/testCycleLifecycleQa.html?${query}&bridge=${encodeURIComponent(BRIDGE)}&emulator=${EMULATOR}${theme === 'dark' ? '&theme=dark' : ''}`, { timeout: 180_000 });
  return page;
};

let shotIndex = 0;
const shot = async (page, name) => {
  shotIndex += 1;
  await page.screenshot({ path: path.join(SHOTS, `${String(shotIndex).padStart(3, '0')}-${name}.png`), fullPage: true });
};

const waitForStage = (page, stage, timeout = 60_000) => page.waitForFunction(
  (expected) => document.querySelector('[data-test-cycle-stage]')?.getAttribute('data-test-cycle-stage') === expected,
  stage,
  { timeout },
);

/** Open the secure Test from the card and wait for the tool itself. */
const enterTest = async (page) => {
  await waitForStage(page, 'test');
  await page.getByRole('button', { name: /Start Test|Resume Test/ }).click();
  await page.getByRole('button', { name: /Start Test|Resume Test/ }).click();
  await page.locator('[data-rich-question-runtime]').waitFor({ timeout: 60_000 });
  // The engine and the tool load lazily: wait for the workspace, not the shell.
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-rich-question-runtime]');
    return root && !/Opening the math workspace/.test(root.innerText) && root.querySelectorAll('button, input, svg, math-field').length > 2;
  }, null, { timeout: 60_000 });
  await wait(600);
};

const FORBIDDEN = [
  /\bCorrect\b/, /\bNot yet\b/, /Stuck\?/, /Show (me )?(a|the) hint/i, /strategic hint/i, /Cancellation hints/,
  /Your line:/, /Reference after submit/, /Something to think about/, /Check your graph/,
  /by itself, prove causation/, /Interpret r by its sign/, /residual plot should look/,
];
const CHECK_LABEL = /^(Check( construction| my work| system| data model| feasible region| inequality graph| matrix solution| intersections)?|Submit my regression)$/;

const audit = async (page, { label, prompt, phoneClaimed, device }) => {
  const result = await page.evaluate(() => {
    const parse = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = ([r, g, b]) => {
      const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const effectiveBackground = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const parts = parse(getComputedStyle(node).backgroundColor);
        if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0.5)) return parts.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const root = document.querySelector('[data-rich-question-runtime]');
    const width = document.documentElement.clientWidth;
    const buttons = [...document.querySelectorAll('button')].filter(visible).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: (button.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        disabled: button.disabled,
        contrast: ratio(parse(getComputedStyle(button).color).slice(0, 3), effectiveBackground(button)),
        outside: rect.left < -1 || rect.right > width + 1,
      };
    });
    return {
      mode: root?.getAttribute('data-rich-question-runtime') || null,
      tool: root?.getAttribute('data-path-tool') || null,
      overflow: document.documentElement.scrollWidth - width,
      text: root ? root.innerText : '',
      buttons,
    };
  });
  const strict = device !== 'phone' || phoneClaimed;
  check(result.mode === 'secureTest', `${label}: the tool runs under the Secure Test policy`, String(result.mode));
  check(result.overflow <= 1, `${label}: no sideways scroll`, `overflow ${result.overflow}px`, { soft: !strict });
  const outside = result.buttons.filter((button) => button.outside);
  check(outside.length === 0, `${label}: every control inside the viewport`, outside.map((button) => button.text).join('; '), { soft: !strict });
  const unreadable = result.buttons.filter((button) => button.contrast < (button.disabled ? 3 : 4.5));
  check(unreadable.length === 0, `${label}: every visible button is readable`, unreadable.map((button) => `"${button.text}" ${button.contrast.toFixed(2)}:1`).join('; '));
  const leaks = FORBIDDEN.filter((pattern) => pattern.test(result.text)).map(String);
  check(leaks.length === 0, `${label}: no hint, verdict or self-check on screen`, leaks.join(', '));
  const checks = result.buttons.filter((button) => CHECK_LABEL.test(button.text)).map((button) => button.text);
  check(checks.length === 0, `${label}: no "Check" final action on a secure item`, checks.join(', '));
  if (prompt) {
    const words = prompt.split('$')[0].replace(/[^A-Za-z0-9 ,.'-]/g, ' ').trim().split(/\s+/).slice(0, 4).join(' ');
    check(!words || result.text.replace(/\s+/g, ' ').includes(words), `${label}: the task is on screen`, words);
  }
  return result;
};

const currentItem = async (examSessionId) => {
  const session = (await db.collection('examSessions').doc(examSessionId).get()).data();
  return { session, current: readStoredItem(session?.currentQuestion || null) };
};

/**
 * A first touch of the tool: place two points by coordinate where the plane
 * offers exact entry (a tap there only moves the cursor), else tap its plane,
 * else type into its first field.
 */
const RECIPES = {
  // −5x − 8 ≥ −38 has the answer x ≤ 6: a closed endpoint at 6, shaded left.
  intervalNumberLine: async (root) => {
    await root.getByPlaceholder(/Exact endpoint/).fill('6');
    await root.getByRole('button', { name: 'Place endpoint' }).click();
    await root.getByRole('button', { name: /Shade left/ }).click();
    return 'placed an endpoint by value and shaded a ray';
  },
  // The relation is described in the student's own words: domain, range and
  // whether it is a function (the diagram's arrows are a drag gesture).
  relationMapping: async (root) => {
    const fields = root.locator('input[type="text"], input:not([type])');
    await fields.nth(0).fill('-3, -2, -1, 0');
    await fields.nth(1).fill('-8, -4, 0, 4');
    await root.getByText(/every input has exactly one output/).first().click();
    return 'described the domain, range and function verdict';
  },
  // One balance move: subtract x from both sides.
  stepAlgebra: async (root, page) => {
    await root.getByRole('button', { name: 'Choose Subtract operation' }).first().click();
    const operand = root.locator('math-field').last();
    await operand.click();
    await page.keyboard.type('x');
    await wait(300);
    await root.locator('.algebra-pickup-button').first().click();
    await wait(200);
    for (const side of [/^left side$/i, /^right side$/i]) {
      // eslint-disable-next-line no-await-in-loop
      await root.getByText(side).first().click();
      // eslint-disable-next-line no-await-in-loop
      await wait(300);
    }
    return 'chose an operation and placed it on both sides';
  },
};

const touchTool = async (page, toolId) => {
  const root = page.locator('[data-rich-question-runtime]');
  if (RECIPES[toolId]) return RECIPES[toolId](root, page);
  const exact = root.getByRole('button', { name: 'Place at this coordinate' });
  if (await exact.count()) {
    const [x, y] = [root.getByLabel('x', { exact: true }).first(), root.getByLabel('y', { exact: true }).first()];
    // The student names the point first (its card), then where it goes.
    const cards = root.getByRole('button', { name: /^Plot\b/ });
    await exact.first().scrollIntoViewIfNeeded();
    for (const [index, [px, py]] of [['0', '-1'], ['2', '1']].entries()) {
      // eslint-disable-next-line no-await-in-loop
      if (await cards.count() > index) await cards.nth(index).click();
      // eslint-disable-next-line no-await-in-loop
      await x.fill(px);
      // eslint-disable-next-line no-await-in-loop
      await y.fill(py);
      // eslint-disable-next-line no-await-in-loop
      await exact.first().click();
      // eslint-disable-next-line no-await-in-loop
      await wait(250);
    }
    return 'placed two points by coordinate';
  }
  const svg = root.locator('svg').filter({ hasNotText: '' });
  const planes = await root.locator('svg').evaluateAll((nodes) => nodes
    .map((node, index) => ({ index, area: node.getBoundingClientRect().width * node.getBoundingClientRect().height }))
    .filter((entry) => entry.area > 20_000)
    .sort((a, b) => b.area - a.area));
  if (planes.length) {
    const target = root.locator('svg').nth(planes[0].index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.38);
    await wait(250);
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.62);
    return 'tapped the plane';
  }
  const input = root.locator('input[type="text"], input:not([type]), textarea, math-field').first();
  if (await input.count()) {
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await page.keyboard.type('3');
    return 'typed into the first field';
  }
  void svg;
  return null;
};

/* -------------------------------- journeys ------------------------------- */

try {
  await seed();
  log(`fixture seeded: ${TOOLS.length} single-item Rich Tool Tests`);
  for (const toolId of TOOLS) {
    const phoneClaimed = SECURE_TOOL_CERTIFICATIONS[toolId].devices.phone === true;
    for (const device of Object.keys(DEVICES)) {
      for (const theme of THEMES) {
        const studentId = studentFor(toolId, device, theme);
        const assignmentId = assignmentIdFor(toolId);
        const label = `${toolId} (${device}, ${theme})`;
        // eslint-disable-next-line no-await-in-loop
        const page = await open({ studentId, assignmentId, device, theme });
        try {
          // eslint-disable-next-line no-await-in-loop
          await enterTest(page);
          // eslint-disable-next-line no-await-in-loop
          const examSessionId = (await db.collection('testCycleRecords').doc(`${assignmentId}__${studentId}`).get()).data().test.examSessionId;
          // eslint-disable-next-line no-await-in-loop
          const { current } = await currentItem(examSessionId);
          // eslint-disable-next-line no-await-in-loop
          const audited = await audit(page, { label, prompt: current?.tool?.prompt || current?.prompt || '', phoneClaimed, device });
          check(audited.tool === toolId, `${label}: the authentic ${toolId} renders`, String(audited.tool));
          // eslint-disable-next-line no-await-in-loop
          await shot(page, `${toolId}-${device}-${theme}`);

          if (SESSION_RUNS.has(`${device}:${theme}`)) {
            // INTERACT → AUTOSAVE (server and device), with no integrity event.
            // eslint-disable-next-line no-await-in-loop
            const how = await touchTool(page, toolId).catch((error) => { log('NOTE', `${label}: recipe stopped: ${error.message.split('\n').filter((line) => /intercepts|waiting for|locator\./.test(line)).slice(-4).join(' | ')}`); return null; });
            check(Boolean(how), `${label}: the student can interact with the tool`, how || 'no interactive surface found');
            // eslint-disable-next-line no-await-in-loop
            await page.waitForFunction(() => (window.__mmBridgeCalls || []).some((entry) => entry.name === 'saveSecureExamDraft' && entry.ok), null, { timeout: 15_000 }).catch(() => {});
            // eslint-disable-next-line no-await-in-loop
            const calls = await page.evaluate(() => (window.__mmBridgeCalls || []).map((entry) => ({ name: entry.name, ok: entry.ok, raw: Boolean(entry.payload?.responsePayload?.raw), drafts: (entry.payload?.responsePayload?.workspaceDrafts || []).length })));
            const saves = calls.filter((entry) => entry.name === 'saveSecureExamDraft' && entry.ok);
            check(saves.length > 0, `${label}: the construction autosaves to the server`, `${saves.length} saves, raw ${saves.some((entry) => entry.raw)}, drafts ${Math.max(0, ...saves.map((entry) => entry.drafts))}`);
            check(!calls.some((entry) => entry.name === 'recordSecureExamIntegrityEvent'), `${label}: working in the tool raises no integrity event`);
            // eslint-disable-next-line no-await-in-loop
            const deviceKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('mm-secure-work:exam:')).length);
            // eslint-disable-next-line no-await-in-loop
            const stored = (await currentItem(examSessionId)).session.currentQuestion?.draftResponse?.responsePayload || {};
            check(deviceKeys > 0 || Boolean(stored.rawJson), `${label}: the work is kept on the device or the server`, `device keys ${deviceKeys}, server raw ${Boolean(stored.rawJson)}, server drafts ${Boolean(stored.workspaceDraftsJson)}`);
            // eslint-disable-next-line no-await-in-loop
            await shot(page, `${toolId}-${device}-${theme}-worked`);

            // RELOAD → the same item, the work kept.
            const before = current.questionInstanceId;
            // eslint-disable-next-line no-await-in-loop
            await page.reload();
            // eslint-disable-next-line no-await-in-loop
            await enterTest(page);
            // eslint-disable-next-line no-await-in-loop
            const reopened = (await currentItem(examSessionId)).current;
            check(reopened?.questionInstanceId === before, `${label}: a reload reopens the same item`);
            // eslint-disable-next-line no-await-in-loop
            const keptKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('mm-secure-work:exam:')).length);
            check(keptKeys >= deviceKeys, `${label}: the tool's work survives the reload`, `${keptKeys} device keys`);
            // eslint-disable-next-line no-await-in-loop
            await shot(page, `${toolId}-${device}-${theme}-reloaded`);

            if (process.env.QA_DEBUG) {
              // eslint-disable-next-line no-await-in-loop
              log('DEBUG after reload', JSON.stringify(await page.evaluate(() => (window.__mmBridgeCalls || []).map((entry) => [entry.name, entry.ok, entry.payload?.responsePayload ? Object.keys(entry.payload.responsePayload) : null, JSON.stringify(entry.payload?.responsePayload?.raw || null).slice(0, 160)]))));
            }
            // SUBMIT → the autosaved construction is recorded.
            // eslint-disable-next-line no-await-in-loop
            await page.getByRole('button', { name: 'Submit test' }).click();
            // eslint-disable-next-line no-await-in-loop
            await page.getByRole('alertdialog').getByRole('button', { name: 'Submit test' }).click();
            // eslint-disable-next-line no-await-in-loop
            await page.getByRole('heading', { name: 'Test submitted' }).waitFor({ timeout: 30_000 });
            // eslint-disable-next-line no-await-in-loop
            const finished = (await currentItem(examSessionId)).session;
            if (process.env.QA_DEBUG) {
              // eslint-disable-next-line no-await-in-loop
              log('DEBUG after submit', JSON.stringify(await page.evaluate(() => (window.__mmBridgeCalls || []).map((entry) => [entry.name, entry.ok, entry.payload?.responsePayload ? Object.keys(entry.payload.responsePayload) : null, JSON.stringify(entry.payload?.responsePayload?.raw || null).slice(0, 160)]))));
            }
            const recorded = Object.values(finished.responses || {});
            check(finished.status === 'submitted', `${label}: the Test submits`, finished.status);
            // eslint-disable-next-line no-await-in-loop
            const gradable = stored.rawJson ? await payloadHasWork({ raw: JSON.parse(stored.rawJson) }) : false;
            if (gradable) {
              const shapes = recorded.map((response) => `${response.pathToolId || 'fields'}${response.finalizedFromAutosave ? ' from autosave' : ''}: ${Object.keys(response.responsePayload || {}).join('+') || 'empty'}`);
              check(recorded.some((response) => response.finalizedFromAutosave && response.pathToolId === toolId), `${label}: the autosaved construction is recorded and graded`, shapes.join('; ') || 'nothing recorded');
            } else {
              check(!recorded.some((response) => response.finalizedFromAutosave), `${label}: nothing gradable was built yet, so nothing was recorded`, 'the saved construction is not an answer yet');
            }
            // eslint-disable-next-line no-await-in-loop
            await wait(1500);
            // eslint-disable-next-line no-await-in-loop
            const leftovers = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('mm-secure-work:exam:')));
            check(leftovers.length === 0, `${label}: the device keeps no secure work after submit`, leftovers.length ? leftovers.join(', ') : '0 keys');
          }
        } catch (error) {
          findings.push(`${label}: ${error.message.split('\n')[0]}`);
          log('FAIL', label, error.message.split('\n')[0]);
          // eslint-disable-next-line no-await-in-loop
          await shot(page, `${toolId}-${device}-${theme}-error`).catch(() => {});
        } finally {
          // eslint-disable-next-line no-await-in-loop
          await page.context().close();
        }
      }
    }
  }
} catch (error) {
  findings.push(`journey aborted: ${error.message}`);
  log('ABORTED', error.stack || error.message);
} finally {
  writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify({ passes, notes, findings }, null, 2));
  log(`\n${passes.length} checks passed, ${notes.length} notes (phone on tools that do not claim it), ${findings.length} findings. Screenshots: ${SHOTS}`);
  notes.forEach((note) => log('NOTE', note));
  findings.forEach((finding) => log('FINDING', finding));
  await browser.close();
  bridge.close();
  await stopEmulator();
  killAll();
  process.exit(findings.length ? 1 : 0);
}

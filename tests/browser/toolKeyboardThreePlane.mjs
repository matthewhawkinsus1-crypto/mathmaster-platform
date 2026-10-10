// THE THREE-PLANE WORKSPACE BY KEYBOARD ALONE (KEYBOARD_SWEEP T2 + T7 + T8).
//
//   npx vite --host 127.0.0.1 --port 5502 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5502 node tests/browser/toolKeyboardThreePlane.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// A GATE: exits non-zero on the first failed assertion.
//
// The spatial systemsWorkspace scene of the keyboard sweep, with two authored
// interpretation choice fields, mounted through QuestionEngine on
// keyboardSweep.html. From the start sentinel, at 1366x768 and 390x844, keys
// only (Tab, Shift+Tab, arrows, Home, Enter, Space):
//
//   T2  Tab reaches the 3D model (role=application, named, described, with a
//       visible focus ring), whose drawing keeps the role=img name the other
//       browser gates find it by. An arrow key alone stops the idle orbit and
//       announces only the view angle. Home is Reset view; an arrow key
//       redraws the model; Shift+ArrowUp held pins the tilt at the drag's +1.3 rad clamp
//       (74 degrees) and ArrowDown at −1.3; Home restores the opening drawing
//       exactly. Rotating never changes a choice.
//   T7  each choice group is one Tab stop (roving tabIndex); ArrowUp from the
//       first option wraps to the last and selects it, ArrowDown selects the
//       next — aria-checked follows focus. No live region says right or wrong
//       before Check.
//   T8  the focused choice and the model show a non-none outline.
//
// Then Check (Enter) with one wrong choice records an incorrect grade in the
// harness's grade log; fixing it by keys, rotating, and Check again records a
// correct one — the state reached by keys is what the tool graded.

import assert from 'node:assert/strict';
import { statSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5502';
const launch = { args: ['--no-sandbox'] };
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
try { if (statSync(executablePath).isFile()) launch.executablePath = executablePath; } catch { /* Playwright's default */ }

const MEANING = ['A different point on each plane.', 'Three intercepts.', 'A point on all three planes.'];
const COUNT = ['None', 'Exactly one', 'Infinitely many'];
const SPEC = {
  mode: 'spatial',
  prompt: 'Explore the three planes, then interpret the solution.',
  spatialModel: { kind: 'threePlanes' },
  equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'],
  variables: ['x', 'y', 'z'],
  answerFields: [
    { id: 'meaning', label: 'What does the solution of the system mean?', options: MEANING, answer: MEANING[2] },
    { id: 'count', label: 'How many points do all three planes share?', options: COUNT, answer: COUNT[1] },
  ],
};

// The whole of what the polite status may say after a rotation key: the view
// angle, never a word about the planes or the answer.
const VIEW_STATUS = /^View turned −?\d+ degrees, tilted −?\d+ degrees\.$/;

const browser = await chromium.launch(launch);
let failed = false;

const run = async (width, height) => {
  const at = `${width}x${height}`;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/keyboardSweep.html?tool=systemsWorkspace&spec=${encodeURIComponent(JSON.stringify(SPEC))}&run=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-kb-sentinel="end"]');
  await page.waitForSelector('svg[role="application"]');
  await page.waitForTimeout(400);

  const active = () => page.evaluate(() => {
    const el = document.activeElement;
    const style = el ? getComputedStyle(el) : null;
    return {
      tag: el?.tagName?.toLowerCase() || null,
      role: el?.getAttribute('role') || null,
      text: (el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      name: el?.getAttribute('aria-label') || null,
      checked: el?.getAttribute('aria-checked'),
      sentinel: el?.getAttribute('data-kb-sentinel') || null,
      outline: style ? `${style.outlineStyle} ${style.outlineWidth}` : null,
      focusVisible: el ? el.matches(':focus-visible') : false,
    };
  });
  const tabUntil = async (predicate, label, key = 'Tab') => {
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press(key);
      const now = await active();
      if (predicate(now)) return now;
      assert.notEqual(now.sentinel, key === 'Tab' ? 'end' : 'start', `${at}: walked past the tool looking for ${label}`);
    }
    throw new Error(`${at}: never reached ${label}`);
  };
  const choices = (fieldLabel) => page.evaluate((labelText) => {
    const group = [...document.querySelectorAll('[role="radiogroup"]')].find((g) => g.getAttribute('aria-label') === labelText);
    return [...group.querySelectorAll('[role="radio"]')].map((r) => ({ text: r.textContent.trim(), checked: r.getAttribute('aria-checked'), tabIndex: r.tabIndex }));
  }, fieldLabel);
  const modelDrawing = () => page.evaluate(() => [...document.querySelectorAll('svg[role="application"] polygon')].map((p) => p.getAttribute('points')).join('|'));
  const viewStatus = () => page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]');
    return [...svg.parentElement.querySelectorAll('[role="status"]')].map((n) => n.textContent.trim()).join(' ');
  });
  const liveTexts = () => page.evaluate(() => [...document.querySelectorAll('[role="status"], [aria-live], [role="alert"]')].map((n) => n.textContent.trim()).filter(Boolean));
  const grades = () => page.evaluate(() => window.__KB_GRADES__.filter((g) => g.kind === 'grade'));

  // ---- T2: reach the model by Tab
  await page.evaluate(() => document.querySelector('[data-kb-sentinel="start"]').focus());
  const model = await tabUntil((s) => s.tag === 'svg', 'the 3D model');
  assert.equal(model.role, 'application', `${at}: the model is an application`);
  assert.match(model.name || '', /arrow keys/i, `${at}: the model's name says how to rotate it`);
  assert.ok(model.focusVisible, `${at}: the model matches :focus-visible`);
  assert.doesNotMatch(model.outline, /^none/, `${at}: the model shows a focus ring (${model.outline})`);
  const described = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]');
    return document.getElementById(svg.getAttribute('aria-describedby'))?.textContent || '';
  });
  assert.match(described, /Left and Right[\s\S]*Up and Down[\s\S]*Shift[\s\S]*Home/, `${at}: the model is described by its key instructions`);

  // The drawing inside the control keeps the image role and name the model
  // always had (assessmentLeakGates.mjs and day2NonuniqueJourneys.mjs find it so).
  const drawing = page.getByRole('img', { name: 'Interactive 3D view of the three planes. Drag to rotate.' });
  await drawing.waitFor({ state: 'visible' });
  assert.equal(await drawing.evaluate((g) => g.closest('svg')?.getAttribute('role')), 'application', `${at}: the named drawing sits inside the model control`);

  // An arrow key alone (no Home, which resets through Reset view) takes over
  // from the idle orbit, as a pointerdown does: the drawing then stays put.
  const idleBefore = await modelDrawing();
  await page.waitForTimeout(400);
  assert.notEqual(await modelDrawing(), idleBefore, `${at}: the idle orbit is running before any key (otherwise the next check proves nothing)`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  const afterArrow = await modelDrawing();
  assert.match(await viewStatus(), VIEW_STATUS, `${at}: an arrow key announces the view angle and nothing else`);
  await page.waitForTimeout(500);
  assert.equal(await modelDrawing(), afterArrow, `${at}: after an arrow key, the idle orbit has stopped`);

  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  const opening = await modelDrawing();
  assert.match(await viewStatus(), /^Opening view\. View turned −?\d+ degrees, tilted −?\d+ degrees\.$/, `${at}: Home announces the opening view`);
  await page.waitForTimeout(400);
  assert.equal(await modelDrawing(), opening, `${at}: after Home, the model stays at the opening view`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  const turned = await modelDrawing();
  assert.notEqual(turned, opening, `${at}: ArrowRight redraws the model`);
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('Shift+ArrowUp');
  await page.waitForTimeout(80);
  assert.match(await viewStatus(), /^View turned −?\d+ degrees, tilted 74 degrees\.$/, `${at}: Shift+ArrowUp held pins the tilt at the drag's clamp`);
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  assert.match(await viewStatus(), /^View turned −?\d+ degrees, tilted −74 degrees\.$/, `${at}: ArrowDown held pins the tilt at the other clamp`);
  assert.equal((await active()).tag, 'svg', `${at}: arrows keep focus on the model (no page scroll steals it)`);
  await page.keyboard.press('Home');
  await page.waitForTimeout(80);
  assert.equal(await modelDrawing(), opening, `${at}: Home restores the opening drawing exactly`);

  // ---- T7: radiogroups, one Tab stop each
  const meaningLabel = SPEC.answerFields[0].label;
  const countLabel = SPEC.answerFields[1].label;
  const first = await tabUntil((s) => s.role === 'radio', 'the first choice');
  assert.equal(first.text, MEANING[0], `${at}: nothing chosen yet, so the first option is the tab stop`);
  assert.equal(first.checked, 'false', `${at}: focusing by Tab selects nothing`);
  assert.ok(first.focusVisible && !first.outline.startsWith('none'), `${at}: the focused choice shows a ring (${first.outline})`);
  assert.deepEqual((await choices(meaningLabel)).map((c) => c.tabIndex), [0, -1, -1], `${at}: one tab stop per group`);

  // Choose "Three intercepts." (wrong) by ArrowDown — selection follows focus.
  await page.keyboard.press('ArrowDown');
  let now = await active();
  assert.equal(now.text, MEANING[1], `${at}: ArrowDown moves to the next option`);
  assert.equal(now.checked, 'true', `${at}: …and selects it`);
  assert.deepEqual((await choices(meaningLabel)).map((c) => [c.checked, c.tabIndex]), [['false', -1], ['true', 0], ['false', -1]], `${at}: the chosen option is the only tab stop`);

  // Tab leaves the group in one press and lands on the next group's first option.
  now = await tabUntil(() => true, 'the next stop');
  assert.equal(now.role, 'radio', `${at}: Tab goes to the next group, not the next option`);
  assert.equal(now.text, COUNT[0], `${at}: …on its first option`);
  await page.keyboard.press('ArrowRight');
  assert.equal((await active()).text, COUNT[1], `${at}: ArrowRight selects the next option`);
  assert.deepEqual((await choices(countLabel)).map((c) => c.checked), ['false', 'true', 'false']);

  const beforeCheck = await liveTexts();
  for (const text of beforeCheck) assert.doesNotMatch(text, /\b(correct|incorrect|right|wrong|not yet)\b/i, `${at}: nothing announces a verdict before Check: "${text}"`);

  // Check by keys: incorrect, as the keyed state says.
  const check = await tabUntil((s) => s.tag === 'button' && /^Check my answer$/.test(s.text), 'Check my answer');
  assert.ok(check.focusVisible);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  let log = await grades();
  assert.ok(log.length >= 1, `${at}: Check by Enter graded the tool`);
  assert.equal(log[log.length - 1].isCorrect, false, `${at}: "Three intercepts." grades as incorrect`);
  const gradedOnce = log.length;

  // Back to the meaning group (Shift+Tab) and fix it: ArrowUp goes 1 → 0, and
  // ArrowUp again wraps from the first option to the last, the right one.
  now = await tabUntil((s) => s.role === 'radio' && MEANING.includes(s.text), 'the meaning group', 'Shift+Tab');
  assert.equal(now.text, MEANING[1], `${at}: Shift+Tab returns to the chosen option, the group's tab stop`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  now = await active();
  assert.equal(now.text, MEANING[2], `${at}: ArrowUp from the first option wraps to the last`);
  assert.equal(now.checked, 'true');
  const chosen = { meaning: await choices(meaningLabel), count: await choices(countLabel) };

  // Rotate: view-only. Back to the model by Shift+Tab, turn it, nothing chosen changes.
  await tabUntil((s) => s.tag === 'svg', 'the model again', 'Shift+Tab');
  for (const key of ['ArrowLeft', 'Shift+ArrowLeft', 'ArrowUp', 'Shift+ArrowDown']) await page.keyboard.press(key);
  await page.waitForTimeout(80);
  assert.notEqual(await modelDrawing(), opening, `${at}: the model turned`);
  assert.deepEqual({ meaning: await choices(meaningLabel), count: await choices(countLabel) }, chosen, `${at}: rotating changes no choice`);
  assert.equal((await grades()).length, gradedOnce, `${at}: rotating grades nothing`);

  await tabUntil((s) => s.tag === 'button' && /^Check my answer$/.test(s.text), 'Check my answer again');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log = await grades();
  assert.equal(log.length, gradedOnce + 1, `${at}: the second Check graded once`);
  assert.equal(log[log.length - 1].isCorrect, true, `${at}: the keyed choices grade as correct`);

  assert.deepEqual(errors, [], `${at}: no page errors`);
  await page.close();
  console.log(`ok ${at}: model by keys (Home, arrows, clamp), radiogroups by arrows, graded wrong then right by Enter`);
};

for (const [width, height] of [[1366, 768], [390, 844]]) {
  try {
    await run(width, height);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${width}x${height}: ${error?.message || error}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

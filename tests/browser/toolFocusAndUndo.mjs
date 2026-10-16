// EVERY TOOL CAN BE TAKEN BACK, AND NO PRESS THROWS FOCUS TO THE PAGE.
//
//   npx vite --host 127.0.0.1 --port 5498 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5498 node tests/browser/toolFocusAndUndo.mjs [--only=<scene>]
//
// Pass 3, Batch 6 (docs/qa/student-experience-pass-3/04-tools-and-accessibility.md):
//
//   TOOL-2  Ten tools had no Universal Undo though the work bar always showed a
//           greyed ↶ Undo; Open Sort deleted a named group and its explanation
//           with no way back. For every one of them, in the real QuestionEngine
//           (toolFocusAndUndoMain.jsx): two edits, the work-bar Undo walks back
//           to exactly what the student had, one step at a time; after a reload
//           the draft is back and Undo still takes back the last edit; a Check
//           followed by Undo makes no new attempt.
//   A11Y-2  Buttons that disable or unmount themselves (Open Sort's placements,
//           Transformations' Clear, the derivation lab's Apply, the tools' own
//           Undo/Redo, the work-bar Undo after its last step): after the press
//           focus is never on <body>.
//   TOOL-1  Function-graph questions by keyboard: see graphKeyboardRoute.mjs.
//
// Run one at a time with no edits in flight; exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5498';
const ONLY = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length) || null;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const runId = Date.now();
let pageCount = 0;
const contexts = {
  desktop: await browser.newContext({ viewport: { width: 1366, height: 768 } }),
  phone: await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }),
};

const urlFor = (tool, spec, run) => `${ORIGIN}/tests/browser/toolFocusAndUndo.html?tool=${tool}${spec ? `&spec=${encodeURIComponent(JSON.stringify(spec))}` : ''}&run=${run}`;
const open = async (tool, { spec = null, device = 'desktop' } = {}) => {
  pageCount += 1;
  const run = `${runId}-${pageCount}`;
  const page = await contexts[device].newPage();
  page.on('pageerror', (error) => failures.push(`${tool}: page error ${error.message}`));
  await page.goto(urlFor(tool, spec, run), { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  return page;
};
const reload = async (page) => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
};

// Everything a student has put into the tool: field values, choices, pressed
// cards, and the names of the buttons (a placed card names its group).
const snapshot = (page, scene = null) => page.evaluate((extraSelector) => {
  const root = document.querySelector('.mathmaster-tool-shell') || document.body;
  const parts = [];
  root.querySelectorAll('input, select, textarea, math-field').forEach((el) => {
    if (el.type === 'hidden' || el.closest('details:not([open])')) return;
    parts.push(`${el.tagName}:${el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value}`);
  });
  root.querySelectorAll('button[aria-pressed], [role="radio"], [aria-checked]').forEach((el) => {
    parts.push(`${el.getAttribute('aria-label') || el.innerText.trim().slice(0, 40)}=${el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked')}`);
  });
  root.querySelectorAll('[data-sort-group]').forEach((el) => parts.push(`group:${el.innerText.replace(/\s+/g, ' ').slice(0, 200)}`));
  // Work a scene shows as text rather than in a field (the derivation's steps).
  if (extraSelector) root.querySelectorAll(extraSelector).forEach((el) => parts.push(`text:${el.innerText.replace(/\s+/g, ' ').slice(0, 300)}`));
  return parts.join(' | ');
}, scene?.extraSnapshot || null);
const workBarUndo = (page) => page.locator('.mathmaster-work-bar-tool.mathmaster-universal-undo:visible').first();
const undoState = async (page) => {
  const undo = workBarUndo(page);
  if (!(await undo.count())) return 'absent';
  return (await undo.isEnabled()) && (await undo.getAttribute('aria-disabled')) !== 'true' ? 'enabled' : 'disabled';
};
const focusOnBody = (page) => page.evaluate(() => !document.activeElement || document.activeElement === document.body);
// Pressed from the keyboard, as a keyboard student would: focus, then Enter.
const pressUndo = async (page) => {
  const undo = workBarUndo(page);
  await undo.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
};

// The first editable control of a kind inside the tool, not in a hint/how-to.
const editable = (page, index = 0) => page.locator('.mathmaster-tool-shell :is(input:not([type=hidden]):not([type=range]), select, textarea, math-field, button[aria-pressed], button[role=radio]):visible:enabled').nth(index);
const editControl = async (page, index, text) => {
  const control = editable(page, index);
  const tag = await control.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    const values = await control.evaluate((el) => [...el.options].map((option) => option.value));
    const current = await control.inputValue();
    await control.selectOption(values.find((value) => value && value !== current && !/^__/.test(value)) || values[1]);
  } else if (tag === 'math-field') {
    await control.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text, { delay: 60 });
    await page.keyboard.press('Tab');
  } else if (tag === 'input' || tag === 'textarea') {
    await control.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text, { delay: 30 });
    await control.blur();
  } else {
    await control.click();
  }
  // A pause, so the next edit is its own Undo step (mathUndoStack.js groups a
  // run of typing in one field).
  await page.waitForTimeout(1200);
};

/*
 * THE SCENES. `edit1`/`edit2` are two different edits; default: the first and
 * second editable control. `check` presses the tool's own Check.
 */
const genericEdits = {
  edit1: (page) => editControl(page, 0, '3'),
  edit2: (page) => editControl(page, 1, '7'),
};
const openSortPlace = (cardIndex, groupIndex) => async (page) => {
  await page.locator('.mathmaster-tool-shell [data-sort-card]').nth(cardIndex).click();
  await page.locator('.mathmaster-tool-shell [data-sort-group]').nth(groupIndex).locator('button', { hasText: /^Place / }).click();
  await page.waitForTimeout(400);
};
const SCENES = [
  { tool: 'dataModelingLab', ...genericEdits },
  { tool: 'inverseCompositionLab', ...genericEdits },
  {
    tool: 'inverseCompositionLab',
    variant: 'deriveInverse',
    spec: { mode: 'deriveInverse', f: { type: 'linear', a: 2, h: 0, k: 3 } },
    extraSnapshot: '.mathmaster-tool-panel',
    edit1: async (page) => { await page.getByRole('button', { name: 'Swap x and y' }).click(); await page.waitForTimeout(400); },
    edit2: async (page) => {
      await page.locator('.mathmaster-tool-shell input[type=number]').fill('3');
      await page.waitForTimeout(1200);
    },
    // Apply by keyboard: it clears the number and disables itself under focus.
    // One Undo then gives back the equation before it AND the number typed for
    // it — exactly what the student had.
    afterSecondEdit: async (page, key, before) => {
      const apply = page.getByRole('button', { name: 'Apply to both sides' });
      await apply.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      check(!(await focusOnBody(page)), `${key}: Apply, which disables itself, keeps keyboard focus`);
      check((await snapshot(page, { extraSnapshot: '.mathmaster-tool-panel' })) !== before, `${key}: Apply changes the equation`);
      await pressUndo(page);
      check((await snapshot(page, { extraSnapshot: '.mathmaster-tool-panel' })) === before, `${key}: one Undo takes back the step and gives back the number typed for it`);
    },
  },
  // Its answers are math fields; the restriction is a plain box.
  { tool: 'functionOperationsLab', ...genericEdits },
  { tool: 'parabolaGeometryLab', ...genericEdits },
  { tool: 'polynomialWorkshop', ...genericEdits },
  { tool: 'signSolutionAnalyzer', ...genericEdits },
  { tool: 'complexPlaneLab', ...genericEdits },
  { tool: 'exponentialLogBridge', ...genericEdits },
  { tool: 'representationMatch', ...genericEdits },
  {
    tool: 'openSortBoard',
    edit1: openSortPlace(0, 0),
    edit2: openSortPlace(0, 1),
  },
  {
    // The case the audit names: a group, its name and its explanation removed
    // with no way back.
    tool: 'openSortBoard',
    variant: 'removeGroup',
    spec: { minGroups: 2, maxGroups: 3, requireGroupNames: true, requireRationale: true },
    setup: async (page) => {
      await page.getByRole('button', { name: '+ Add another group' }).click();
      await page.waitForTimeout(300);
      await page.getByRole('textbox', { name: 'Name this group (Group 3)' }).fill('Curves');
      await page.waitForTimeout(1200);
      await page.locator('[data-sort-group]').nth(2).locator('textarea').fill('Each one bends and turns back.');
      await page.waitForTimeout(1200);
    },
    edit1: openSortPlace(0, 2),
    edit2: async (page) => {
      const remove = page.getByRole('button', { name: 'Remove group 3 · Curves' });
      await remove.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      check(!(await focusOnBody(page)), 'openSortBoard:removeGroup: removing a group by keyboard does not throw focus to the page');
    },
    // Undo once: the group is back with both of its sentences.
    afterFirstUndo: async (page) => {
      const back = await page.locator('[data-sort-group]').nth(2).evaluate((el) => ({ name: el.querySelector('input')?.value, why: el.querySelector('textarea')?.value })).catch(() => null);
      check(back?.name === 'Curves' && back?.why === 'Each one bends and turns back.', 'openSortBoard:removeGroup Undo brings back the group, its name and its explanation', JSON.stringify(back));
    },
  },
  { tool: 'openSortBoard', variant: 'phone', device: 'phone', edit1: openSortPlace(0, 0), edit2: openSortPlace(0, 1) },
  { tool: 'functionOperationsLab', variant: 'phone', device: 'phone', ...genericEdits },
];

for (const scene of SCENES) {
  const key = scene.variant ? `${scene.tool}:${scene.variant}` : scene.tool;
  if (ONLY && ONLY !== key && ONLY !== scene.tool) continue;
  const page = await open(scene.tool, { spec: scene.spec, device: scene.device || 'desktop' });
  try {
    await scene.setup?.(page);
    const s0 = await snapshot(page, scene);
    // (A scene with setup has made edits already; they are undoable too.)
    if (!scene.setup) check((await undoState(page)) === 'disabled', `${key}: the work bar has a ↶ Undo, unavailable before any edit`, await undoState(page));
    await scene.edit1(page);
    const s1 = await snapshot(page, scene);
    check(s1 !== s0, `${key}: the first edit changes the tool`);
    check((await undoState(page)) === 'enabled', `${key}: after an edit the work-bar Undo is available`);
    await scene.edit2(page);
    const s2 = await snapshot(page, scene);
    check(s2 !== s1, `${key}: the second edit changes the tool`);
    await scene.afterSecondEdit?.(page, key, s2);

    await pressUndo(page);
    check((await snapshot(page, scene)) === s1, `${key}: one Undo takes back exactly the second edit`);
    await scene.afterFirstUndo?.(page);
    await pressUndo(page);
    check((await snapshot(page, scene)) === s0, `${key}: a second Undo takes back the first, to exactly what the student had`);
    if (!scene.setup) check((await undoState(page)) === 'disabled', `${key}: with nothing left the Undo is unavailable`);
    check(!(await focusOnBody(page)), `${key}: the Undo that used up the history keeps keyboard focus`);

    // A reload: the draft comes back, and Undo still takes back the last edit.
    await scene.edit1(page);
    const s3 = await snapshot(page, scene);
    await reload(page);
    check((await snapshot(page, scene)) === s3, `${key}: after a reload the student's work is back`);
    check((await undoState(page)) === 'enabled', `${key}: after a reload Undo is still available`);
    await pressUndo(page);
    check((await snapshot(page, scene)) === s0, `${key}: after a reload one Undo takes back the edit made before it`);

    // A Check, then Undo: no attempt is made or changed by the Undo.
    await scene.edit1(page);
    const checkButton = page.locator('.mathmaster-tool-shell button[data-mm-enter-action="submit"]:visible, .mathmaster-tool-shell button:visible:is(:text-matches("^Check", "i"))').first();
    if (await checkButton.count() && await checkButton.isEnabled()) {
      await checkButton.click();
      await page.waitForTimeout(800);
      const gradesBefore = await page.evaluate(() => window.__GRADES__.length);
      if ((await undoState(page)) === 'enabled') await pressUndo(page);
      await page.waitForTimeout(400);
      const gradesAfter = await page.evaluate(() => window.__GRADES__.length);
      check(gradesAfter === gradesBefore, `${key}: an Undo after a Check makes no attempt`, `${gradesBefore} → ${gradesAfter}`);
    }
  } catch (error) {
    check(false, `${key}: scene ran`, String(error?.message || error).split('\n')[0]);
  }
  await page.close();
}

/*
 * A11Y-2: SELF-DISABLING BUTTONS KEEP FOCUS. Each control is pressed by
 * keyboard until it has nothing left to do; focus must not be on <body>.
 */
const FOCUS_SCENES = [
  {
    key: 'transformationsLab Clear',
    tool: 'transformationsLab',
    run: async (page) => {
      const plane = page.locator('.mathmaster-tool-shell [role="application"], .mathmaster-tool-shell svg[tabindex="0"]').first();
      await plane.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const clear = page.getByRole('button', { name: 'Clear' });
      await clear.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    },
  },
  ...['linearTableWorkbench', 'representationBridge'].map((tool) => ({
    key: `${tool} Undo/Redo`,
    tool,
    run: async (page) => {
      await editControl(page, 0, '3');
      const undo = page.locator('.mathmaster-tool-shell button[aria-label="Undo"]').first();
      await undo.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      check(!(await focusOnBody(page)), `${tool}: its Undo after the last step keeps focus`);
      const redo = page.locator('.mathmaster-tool-shell button[aria-label="Redo"]').first();
      await redo.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    },
  })),
  {
    key: 'regressionCalculator Undo/Redo',
    tool: 'regressionCalculator',
    run: async (page) => {
      const cell = page.locator('.mathmaster-tool-shell input:visible').first();
      await cell.click();
      await page.keyboard.type('4');
      await cell.blur();
      await page.waitForTimeout(1200);
      const undo = page.locator('.regression-toolbar button[aria-label="Undo"]').first();
      await undo.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      check(!(await focusOnBody(page)), 'regressionCalculator: its Undo after the last step keeps focus');
      const redo = page.locator('.regression-toolbar button[aria-label="Redo"]').first();
      await redo.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    },
  },
];
for (const scene of FOCUS_SCENES) {
  if (ONLY && ONLY !== scene.tool) continue;
  const page = await open(scene.tool);
  try {
    await scene.run(page);
    check(!(await focusOnBody(page)), `${scene.key}: after the press that disables it, focus is not on the page`);
  } catch (error) {
    check(false, `${scene.key}: scene ran`, String(error?.message || error).split('\n')[0]);
  }
  await page.close();
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nAll tool focus and Undo checks passed.');

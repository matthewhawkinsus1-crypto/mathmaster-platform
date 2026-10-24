/*
 * MAPPING DIAGRAM COORDINATE PLOT BY KEYBOARD (KEYBOARD_SWEEP.md T1 + T4), in
 * real Chromium at 1366x768 and 390x844.
 *
 *   npx vite --host 127.0.0.1 --port 5501 --strictPort &
 *   AUDIT_ORIGIN=http://127.0.0.1:5501 node tests/browser/toolKeyboardRelationMapping.mjs
 *
 * Mounted through QuestionEngine by the keyboard-sweep harness
 * (tests/browser/keyboardSweep.html) with the sweep's relationMapping:plot
 * question, which leaves typed point entry off: the plot itself is the only
 * way to answer it. Per viewport:
 *
 *   1. KEYS ONLY. Tab from the start sentinel to the plot (a focusable
 *      role="application" with a keyboard description and a visible ring),
 *      aim with the arrows, Enter/Space to plot, Enter again to remove a
 *      mis-plot, Escape to hide the crosshair; type the domain and range; Tab
 *      to Check and press Enter. Asserts the state the keys reached (the
 *      plotted list, in order), what the live region said (positions only,
 *      never a verdict) and that the tool graded, correct.
 *   2. POINTER. The same answer by mouse clicks on the drawn grid points must
 *      record the identical plotted list and grade the same.
 *   3. KEYS, WRONG. A keyboard-plotted wrong point grades wrong: the grade
 *      follows the keyboard's state, not a constant.
 *
 * AX37: "Is this relation a function?" and an analysis question with choices
 * are each ONE radio group on the shared choice group
 * (src/platform/interaction/choiceGroup.js): named by their question, one Tab
 * stop, arrows / Home / End move and choose, a ✓ on the chosen option as well as
 * its colour, and choosing grades nothing; what the keys chose is what Check
 * grades.
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5501';
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';

// The sweep's relationMapping:plot scene (tests/browser/keyboardSweep.mjs).
const SPEC = { pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }], ask: ['plot', 'domain', 'range'] };
const URL_FOR = ({ bare = false, spec = SPEC } = {}) => `${origin}/tests/browser/keyboardSweep.html?tool=relationMapping&spec=${encodeURIComponent(JSON.stringify(spec))}${bare ? '&host=bare' : ''}&run=${Date.now()}`;
const PLOT = 'svg[aria-label="Coordinate plane for plotting the relation"]';
const STATUS = '[data-relation-plot-status]';
const VERDICT = /\b(correct|incorrect|right|wrong|not quite|match|matches)\b/i;
const MAX_TABS = 80;

const browser = await chromium.launch(launchOptions);

const open = async (viewport, options = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(URL_FOR(options), { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector(options.ready || PLOT);
  return { page, errors };
};

const activeIs = (page, selector) => page.evaluate((sel) => document.activeElement?.matches?.(sel) === true, selector);
const activeName = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return '';
  const labelled = el.getAttribute('aria-label');
  if (labelled) return labelled;
  if (el.labels?.length) return el.labels[0].textContent.trim();
  return (el.textContent || '').trim();
});

/** Tab forward until `match(page)` holds; returns the number of presses. */
const tabUntil = async (page, match, what) => {
  for (let i = 1; i <= MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    if (await match()) return i;
  }
  throw new assert.AssertionError({ message: `${what}: not reached in ${MAX_TABS} Tab presses (focus on "${await activeName(page)}")` });
};

/** The plotted list exactly as the tool holds it: its "Remove plotted point" buttons, in order. */
const plottedList = (page) => page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Remove plotted point "]')]
  .map((button) => button.getAttribute('aria-label').replace('Remove plotted point ', '').split(', ').map(Number)));
const status = (page) => page.locator(STATUS).innerText();
const grades = (page) => page.evaluate(() => window.__KB_GRADES__.filter((entry) => entry.kind === 'grade'));

const pressAndHear = async (page, keys, at) => {
  const said = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    said.push(await status(page));
    assert.ok(await activeIs(page, PLOT), `${at}: focus stays on the plot after ${key}`);
  }
  return said;
};

/** Start sentinel -> Tab to the plot, keys only. */
const tabToPlot = async (page, at) => {
  await page.locator('[data-kb-sentinel="start"]').focus();
  const presses = await tabUntil(page, () => activeIs(page, PLOT), `${at}: the coordinate plot`);
  const info = await page.evaluate((sel) => {
    const svg = document.querySelector(sel);
    const help = document.getElementById(svg.getAttribute('aria-describedby') || '');
    const helpBox = help?.getBoundingClientRect();
    const style = getComputedStyle(svg);
    return {
      role: svg.getAttribute('role'),
      tabIndex: svg.tabIndex,
      focusVisible: svg.matches(':focus-visible'),
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      help: help?.textContent || '',
      helpShown: Boolean(helpBox && helpBox.width > 40 && helpBox.height > 8),
    };
  }, PLOT);
  assert.equal(info.role, 'application', `${at}: the plot keeps role="application" only because it takes keys`);
  assert.equal(info.tabIndex, 0, `${at}: the plot is in the Tab order`);
  assert.ok(info.focusVisible, `${at}: keyboard focus on the plot is :focus-visible`);
  assert.doesNotMatch(info.outline, /^none/, `${at}: the plot shows a focus ring (${info.outline})`);
  assert.match(info.help, /Arrow keys move the crosshair one unit/, `${at}: the plot's description is the keyboard instruction`);
  assert.match(info.help, /Enter or Space plots/, `${at}: ...including how to plot`);
  assert.ok(info.helpShown, `${at}: the instruction is on screen while the plot has keyboard focus`);
  return presses;
};

const typeAnswersAndCheck = async (page, at) => {
  // The text boxes, not the mapping diagram's "Domain value …" nodes.
  const inBox = async (pattern) => (await activeIs(page, 'input')) && pattern.test(await activeName(page));
  await tabUntil(page, () => inBox(/^Domain/), `${at}: the domain box`);
  await page.keyboard.type('-2, 1, 3');
  await tabUntil(page, () => inBox(/^Range/), `${at}: the range box`);
  await page.keyboard.type('-1, 2, 3');
  assert.equal((await grades(page)).length, 0, `${at}: nothing graded before Check`);
  await tabUntil(page, async () => /^(Check$|Submit — )/.test(await activeName(page)), `${at}: the Check button`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__KB_GRADES__.some((entry) => entry.kind === 'grade'), null, { timeout: 15000 });
  return grades(page);
};

const CORRECT = [[-2, 3], [1, 2], [3, -1]];

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const at = `${viewport.width}x${viewport.height}`;

  // ---- 1. Keys only: a correct answer, with a mis-plot removed on the way.
  {
    const { page, errors } = await open(viewport);
    await tabToPlot(page, at);
    assert.equal(await page.locator('[data-relation-crosshair]').count(), 0, `${at}: no crosshair before a key`);
    const said = await pressAndHear(page, [
      'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', // (-2, 3)
      'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'Space', // (1, 2) by Space
      'ArrowRight', 'Enter', // (2, 2): a mis-plot...
      'Enter', // ...removed again
      'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter', // (3, -1)
    ], at);
    assert.deepEqual(said, [
      'Crosshair at (-1, 0).', 'Crosshair at (-2, 0).', 'Crosshair at (-2, 1).', 'Crosshair at (-2, 2).', 'Crosshair at (-2, 3).', 'Plotted (-2, 3).',
      'Crosshair at (-1, 3).', 'Crosshair at (0, 3).', 'Crosshair at (1, 3).', 'Crosshair at (1, 2).', 'Plotted (1, 2).',
      'Crosshair at (2, 2).', 'Plotted (2, 2).',
      'Removed (2, 2).',
      'Crosshair at (3, 2).', 'Crosshair at (3, 1).', 'Crosshair at (3, 0).', 'Crosshair at (3, -1).', 'Plotted (3, -1).',
    ], `${at}: the live region says where, step by step`);
    said.forEach((line) => assert.doesNotMatch(line, VERDICT, `${at}: no verdict while answerable: "${line}"`));
    assert.equal(await page.locator(STATUS).getAttribute('aria-live'), 'polite', `${at}: the status is a polite live region`);
    assert.equal(await page.locator('[data-relation-crosshair="keyboard"]').count(), 1, `${at}: the keyboard crosshair is drawn`);
    assert.deepEqual(await plottedList(page), CORRECT, `${at}: the keys recorded exactly the three pairs, in order`);
    assert.equal(await page.locator(`${PLOT} circle[r="7"]`).count(), 3, `${at}: three points drawn`);

    // Escape leaves crosshair mode and keeps focus (it must not close the
    // question around the plot); the next arrow brings the crosshair back.
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-relation-crosshair]').count(), 0, `${at}: Escape hides the crosshair`);
    assert.ok(await activeIs(page, PLOT), `${at}: Escape keeps focus on the plot`);
    assert.match(await status(page), /^Crosshair hidden\./, `${at}: Escape is announced`);
    await page.keyboard.press('ArrowUp');
    assert.equal(await status(page), 'Crosshair at (0, 1).', `${at}: the next arrow starts again from the origin`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    assert.equal(await status(page), 'Crosshair at (-2, 5).', `${at}: Shift moves five`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await status(page), 'Crosshair at (-2, 3), on a plotted point.', `${at}: a plotted point under the crosshair is announced, without a verdict`);
    assert.deepEqual(await plottedList(page), CORRECT, `${at}: moving the crosshair changes nothing`);
    // AX34: the keyboard sentence stays once shown, as on the shared plane;
    // hiding it on blur moved the page under the pointer.
    const helpWidth = () => page.locator('[data-relation-plot-help]').evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(await helpWidth() > 1, `${at}: the keyboard sentence shows while the plot has keyboard focus`);
    await page.keyboard.press('Tab');
    assert.ok(!(await activeIs(page, PLOT)), `${at}: Tab leaves the plot`);
    assert.ok(await helpWidth() > 1, `${at}: the keyboard sentence stays after the plot loses focus`);
    await page.keyboard.press('Shift+Tab');
    assert.ok(await activeIs(page, PLOT), `${at}: Shift+Tab comes back to the plot`);

    const recorded = await typeAnswersAndCheck(page, at);
    assert.equal(recorded.length, 1, `${at}: one grade recorded`);
    assert.equal(recorded[0].isCorrect, true, `${at}: the keyboard-built answer graded correct`);
    assert.deepEqual(errors, [], `${at}: no page errors`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${at}: no horizontal page scroll (${overflow}px)`);
    await page.close();
  }

  // ---- 2. Pointer: the same answer by clicks records the identical state.
  // On the phone this run uses the harness's bare host: under the
  // assignment-screen wrapper at 390x844 the harness leaves the tool's scroll
  // region 16px tall, so most of the plot cannot be clicked at all (keyboard
  // focus scrolls inside it; a mouse cannot). The tool is the same either way.
  {
    const { page, errors } = await open(viewport, { bare: viewport.width < 600 });
    const clickGrid = async ([x, y], nudge = [0, 0]) => {
      const svg = page.locator(PLOT);
      // Centred, as a student scrolls it: on a phone the sticky task card and
      // work bar cover a plot that is merely "in view" at the edge.
      await svg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const box = await svg.boundingBox();
      const scale = Math.min(box.width / 430, box.height / 430);
      const left = box.x + (box.width - 430 * scale) / 2;
      const top = box.y + (box.height - 430 * scale) / 2;
      // The -5..5 window this question draws: 34px pad, 362px for 10 units.
      const vx = 34 + ((x + 5) / 10) * 362 + nudge[0];
      const vy = 34 + ((5 - y) / 10) * 362 + nudge[1];
      const cx = left + vx * scale;
      const cy = top + vy * scale;
      const hit = await page.evaluate(([px, py, sel]) => Boolean(document.elementFromPoint(px, py)?.closest(sel)), [cx, cy, PLOT]);
      assert.ok(hit, `${at}: the drawn (${x}, ${y}) is uncovered for the click`);
      await page.mouse.click(cx, cy);
    };
    await clickGrid([-2, 3], [4, -3]);
    await clickGrid([1, 2], [-3, 2]);
    await clickGrid([2, 2]);
    await clickGrid([2, 2], [2, 2]);
    await clickGrid([3, -1], [0, 4]);
    assert.deepEqual(await plottedList(page), CORRECT, `${at}: clicks record the same plotted list as the keys`);
    assert.equal(await page.locator('[data-relation-plot-help]').evaluate((el) => el.getBoundingClientRect().width), 1, `${at}: a pointer user does not see the keyboard instruction`);
    await page.locator('[data-kb-sentinel="start"]').focus();
    await tabUntil(page, () => activeIs(page, PLOT), `${at}: the plot (pointer run)`);
    const recorded = await typeAnswersAndCheck(page, at);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].isCorrect, true, `${at}: the pointer-built answer grades the same as the keyboard-built one`);
    assert.deepEqual(errors, [], `${at}: no page errors (pointer)`);
    await page.close();
  }

  // ---- 3. Keys, wrong: the grade follows what the keys plotted.
  {
    const { page, errors } = await open(viewport);
    await tabToPlot(page, `${at} wrong`);
    await pressAndHear(page, ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', 'Shift+ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'Enter'], `${at} wrong`);
    assert.deepEqual(await plottedList(page), [[-2, 3], [2, 1]], `${at}: the keys recorded (-2, 3) and (2, 1)`);
    const recorded = await typeAnswersAndCheck(page, `${at} wrong`);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].isCorrect, false, `${at}: a keyboard-plotted wrong point grades wrong`);
    assert.deepEqual(errors, [], `${at}: no page errors (wrong)`);
    await page.close();
  }

  console.log(`ok ${at}: plot reached by Tab, plotted/removed by keys, announced positions only, graded; pointer parity; wrong plot graded wrong`);
}

// Pass 3, TOOL-10: the mapping diagram's arrows can be reviewed and removed
// without sight. Arrows drawn by keyboard are named on their nodes, listed in
// words with a Remove each, and every press is said; removing one keeps focus
// in the list, and the last removal lands on Clear arrows, not the page.
for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const at = `${viewport.width}x${viewport.height}`;
  const { page, errors } = await open(viewport);
  const node = (kind, value) => page.locator(`[data-${kind}-node="${value}"]`);
  const status = () => page.locator('[data-mapping-status]').textContent().then((text) => text.trim());
  const draw = async (x, y) => {
    await node('domain', x).focus();
    await page.keyboard.press('Enter');
    await node('range', y).focus();
    await page.keyboard.press('Enter');
  };
  await draw(-2, 3);
  assert.equal(await status(), 'Arrow drawn from -2 to 3. 1 arrow drawn.', `${at}: drawing is said`);
  await draw(1, 2);
  assert.equal(await node('domain', -2).getAttribute('aria-label'), 'Domain value -2, maps to 3', `${at}: a domain node names its arrow`);
  assert.equal(await node('range', 2).getAttribute('aria-label'), 'Range value 2, from 1', `${at}: a range node names where its arrow comes from`);
  assert.equal(await node('domain', 3).getAttribute('aria-label'), 'Domain value 3, no arrow yet');
  assert.equal(await page.locator('svg[aria-label="Mapping diagram"]').getAttribute('role'), 'group', `${at}: the diagram is a group of controls`);
  const removes = page.locator('[data-mapping-arrows] button');
  assert.deepEqual(await removes.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))), ['Remove the arrow -2 to 3', 'Remove the arrow 1 to 2']);
  assert.deepEqual(await removes.evaluateAll((buttons) => buttons.map((button) => button.textContent.trim())), ['-2 → 3 ×', '1 → 2 ×'], `${at}: the arrows are listed in words`);
  await removes.first().focus();
  // A double-press takes one arrow, not two: the next Remove slides under focus.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('[data-mapping-arrows] button').length === 1);
  await page.waitForTimeout(450);
  assert.equal(await removes.count(), 1, `${at}: a double-press removed only one arrow`);
  assert.equal(await status(), 'Arrow from -2 to 3 removed. 1 arrow drawn.', `${at}: removing is said`);
  assert.equal(await activeName(page), 'Remove the arrow 1 to 2', `${at}: focus moves to the arrow now in its place`);
  assert.equal(await node('domain', -2).getAttribute('aria-label'), 'Domain value -2, no arrow yet');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[data-mapping-arrows]'));
  assert.equal(await activeName(page), 'Domain value -2, no arrow yet', `${at}: the last removal leaves focus on the diagram, where the next arrow starts, not the page`);
  await draw(3, -1);
  await page.locator('button:has-text("Clear arrows")').focus();
  await page.keyboard.press('Enter');
  assert.equal(await status(), 'All arrows cleared.');
  assert.equal(await activeName(page), 'Clear arrows', `${at}: Clear arrows keeps focus when it runs out of arrows`);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-disabled')), 'true', `${at}: and says it has nothing left to clear`);
  assert.deepEqual(errors, [], `${at}: no page errors (arrows)`);
  await page.close();
  console.log(`ok ${at}: mapping arrows named, listed, removable one by one, said; focus kept`);
}

// AX37: the two choice questions are radio groups. A function (every input one
// output) whose analysis question has choices.
const CHOICES_SPEC = {
  pairs: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 }],
  ask: ['isFunction'],
  answerFields: [{ id: 'kind', label: 'Discrete or continuous?', type: 'choice', options: ['discrete', 'continuous'], answer: 'discrete' }],
};
const FUNCTION_Q = 'Is this relation a function?';
const FIELD_Q = 'Discrete or continuous?';
const RIGHT_REASON = 'Yes — every input has exactly one output.';
const WRONG_REASON = 'No — at least one output value repeats.';

/** One group as the screen and the accessibility tree give it. */
const readGroup = (group) => group.evaluate((element) => {
  const radios = [...element.querySelectorAll('[role="radio"]')];
  const checked = radios.map((radio, index) => (radio.getAttribute('aria-checked') === 'true' ? index : -1)).filter((index) => index >= 0);
  const mark = checked.length === 1 ? radios[checked[0]].querySelector('[data-choice-mark]') : null;
  return {
    names: radios.map((radio) => radio.textContent.replace('✓', '').trim()),
    focused: radios.indexOf(document.activeElement),
    checked,
    tabStops: radios.map((radio, index) => (radio.tabIndex === 0 ? index : -1)).filter((index) => index >= 0),
    marks: element.querySelectorAll('[data-choice-mark]').length,
    markShown: Boolean(mark && mark.textContent.trim() === '✓' && mark.getBoundingClientRect().width > 0),
  };
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const at = `${viewport.width}x${viewport.height}`;
  const { page, errors } = await open(viewport, { spec: CHOICES_SPEC, ready: 'fieldset > legend' });
  const fn = page.getByRole('radiogroup', { name: FUNCTION_Q, exact: true });
  const kind = page.getByRole('radiogroup', { name: FIELD_Q, exact: true });
  await page.waitForTimeout(500);
  assert.equal(await fn.count(), 1, `${at}: "${FUNCTION_Q}" is a radio group named by its question`);
  assert.equal(await kind.count(), 1, `${at}: the analysis question is a radio group named by its question`);
  assert.equal(await page.locator('fieldset[role="radiogroup"] > legend').count(), 2, `${at}: each group is a fieldset named by its legend, so the question is heard once`);

  // One Tab stop per group, nothing chosen, no ✓ yet.
  let state = await readGroup(fn);
  assert.equal(state.names.length, 4, `${at}: four reasons to choose from`);
  assert.deepEqual(state.tabStops, [0], `${at}: one Tab stop in the function group, the first option (${JSON.stringify(state.tabStops)})`);
  assert.deepEqual([state.checked.length, state.marks], [0, 0], `${at}: nothing is chosen, so no ✓ is drawn`);
  assert.equal((await readGroup(kind)).tabStops.length, 1, `${at}: one Tab stop in the analysis group`);

  // Tab walks the groups, not every option: group one's stop, then group two's.
  await page.locator('[data-kb-sentinel="start"]').focus();
  await tabUntil(page, async () => (await readGroup(fn)).focused >= 0, `${at}: the function group`);
  await page.keyboard.press('Tab');
  assert.equal((await readGroup(fn)).focused, -1, `${at}: Tab leaves the function group (it does not visit each option)`);
  assert.ok((await readGroup(kind)).focused >= 0, `${at}: and lands on the analysis group's Tab stop`);
  await page.keyboard.press('Shift+Tab');
  assert.ok((await readGroup(fn)).focused >= 0, `${at}: Shift+Tab comes back to the function group`);

  // Arrows move AND choose, wrapping; Home / End go to the ends; one ✓, on the chosen option.
  const gradesBefore = (await grades(page)).length;
  const expectAt = async (key, index, why) => {
    await page.keyboard.press(key === 'Space' ? ' ' : key);
    state = await readGroup(fn);
    assert.deepEqual([state.focused, state.checked], [index, [index]], `${at}: ${key} ${why} (focus ${state.focused + 1}, chosen ${JSON.stringify(state.checked.map((n) => n + 1))})`);
    assert.ok(state.markShown && state.marks === 1, `${at}: after ${key} the chosen option shows its ✓, and only it (${state.marks} drawn)`);
    assert.deepEqual(state.tabStops, [index], `${at}: after ${key} the one Tab stop follows the chosen option`);
  };
  const last = state.names.length - 1;
  await expectAt('ArrowDown', 1, 'moves to the next option and chooses it');
  await expectAt('ArrowDown', 2, 'goes on');
  await expectAt('ArrowUp', 1, 'moves back');
  await expectAt('End', last, 'goes to the last option');
  await expectAt('ArrowRight', 0, 'wraps to the first');
  await expectAt('ArrowLeft', last, 'wraps to the last');
  await expectAt('Home', 0, 'goes to the first option');
  await expectAt('Space', 0, 'keeps the focused option chosen');
  assert.equal((await grades(page)).length, gradesBefore, `${at}: moving through the choices graded nothing`);
  const tree = await fn.ariaSnapshot();
  assert.match(tree, new RegExp(`radio "${state.names[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" \\[checked\\]`), `${at}: the accessibility tree says which is checked`);

  // What the keys chose is what Check grades: the right reason and the right
  // kind, by arrows alone, grade correct; a wrong reason grades wrong.
  const choose = async (group, name) => {
    const names = (await readGroup(group)).names;
    const target = names.indexOf(name);
    assert.ok(target >= 0, `${at}: "${name}" is one of the choices (${names.join(' | ')})`);
    await group.getByRole('radio').first().focus();
    for (let press = 0; press <= names.length; press += 1) {
      if ((await readGroup(group)).checked[0] === target) return;
      await page.keyboard.press('ArrowDown');
    }
    throw new assert.AssertionError({ message: `${at}: arrows never reached "${name}"` });
  };
  const check = async () => {
    await tabUntil(page, async () => /^(Check$|Submit — )/.test(await activeName(page)), `${at}: the Check button`);
    // The count is read BEFORE Enter: the grade is recorded as the key lands.
    const before = (await grades(page)).length;
    await page.keyboard.press('Enter');
    await page.waitForFunction((count) => window.__KB_GRADES__.filter((entry) => entry.kind === 'grade').length > count, before, { timeout: 15000 });
    return (await grades(page)).at(-1);
  };
  await choose(fn, WRONG_REASON);
  await choose(kind, 'discrete');
  assert.equal((await check()).isCorrect, false, `${at}: a wrong reason chosen by arrows grades wrong`);
  await choose(fn, RIGHT_REASON);
  assert.equal((await check()).isCorrect, true, `${at}: the right reason and kind chosen by arrows grade correct`);
  assert.deepEqual((await readGroup(fn)).checked.length, 1, `${at}: one reason stays chosen after Check`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${at}: no horizontal page scroll (${overflow}px)`);
  assert.deepEqual(errors, [], `${at}: no page errors (choices)`);
  await page.close();
  console.log(`ok ${at}: both choice questions are radio groups — named, one Tab stop, arrows and Home/End choose, ✓ on the choice, graded as chosen`);
}

await browser.close();
console.log('toolKeyboardRelationMapping: all assertions passed');

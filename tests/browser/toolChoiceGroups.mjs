/*
 * TOOL CHOICE GROUPS (student pass 3, TOOL-6) — the shared choice group
 * (src/platform/interaction/choiceGroup.js) driven in a real browser, on the
 * keyboard sweep's harness: the tool mounted through QuestionEngine as a
 * student gets it.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/toolChoiceGroups.mjs
 *
 *   PLAYWRIGHT_MODULE / CHROMIUM_PATH as in keyboardSweep.mjs.
 *
 * For every choice group on Representation Match (equation choices, graph
 * choices, the groups a card sorts into) and Matrix Lab (how many solutions):
 *
 *   - ONE tab stop: exactly one radio has tabindex 0;
 *   - ArrowRight / ArrowDown move focus to the next option AND check it,
 *     ArrowLeft / ArrowUp back, wrapping; Home / End go to the ends;
 *   - exactly one option is aria-checked, and it shows a ✓ — the selection
 *     is not its border colour alone;
 *   - the tab stop follows the checked option;
 *   - no key the group takes grades anything (choosing is not checking).
 *
 * Exits non-zero on any failure. On the base before TOOL-6 the arrow keys did
 * nothing and every option was a tab stop.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const artifacts = path.join(here, 'artifacts/tool-choice-groups');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';

const SCENES = [
  { tool: 'representationMatch', spec: null, group: 'Equation choices' },
  { tool: 'representationMatch', spec: { mode: 'graphMatch' }, group: 'Graph choices' },
  // Two situations to sort into (studentUxPlatformMain.jsx's ux-rm-table).
  { tool: 'representationMatch', spec: {
    mode: 'linearConnections', task: 'group', cardKinds: ['context', 'slopeIntercept', 'slope'],
    sets: [
      { id: 'plan', context: 'A phone plan costs $10 a month plus $2 for each gigabyte used.', slopeIntercept: 'y = 2x + 10', slope: 2, graphSpec: { type: 'linear', a: 2, h: 0, k: 10 } },
      { id: 'candle', context: 'A 20 cm candle burns down 3 cm every hour.', slopeIntercept: 'y = -3x + 20', slope: -3, graphSpec: { type: 'linear', a: -3, h: 0, k: 20 } },
    ],
  }, group: /to sort cards into$/ },
  { tool: 'matrixLab', spec: null, group: 'How many solutions does the system have?' },
];

const failures = [];
const check = (ok, message) => {
  if (ok) console.log(`  ok   ${message}`);
  else { console.log(`  FAIL ${message}`); failures.push(message); }
};

// The group's state, read from the DOM: which radio has focus, which are
// checked and tabbable, and whether the checked one shows its ✓.
const readGroup = (group) => group.evaluate((element) => {
  const radios = [...element.querySelectorAll('[role="radio"]')];
  const checked = radios.map((radio, index) => (radio.getAttribute('aria-checked') === 'true' ? index : -1)).filter((index) => index >= 0);
  const mark = checked.length === 1 ? radios[checked[0]].querySelector('[data-choice-mark]') : null;
  return {
    count: radios.length,
    focused: radios.indexOf(document.activeElement),
    checked,
    tabStops: radios.map((radio, index) => (radio.tabIndex === 0 ? index : -1)).filter((index) => index >= 0),
    markShown: Boolean(mark && mark.textContent.trim() === '✓' && mark.getBoundingClientRect().width > 0),
    marks: element.querySelectorAll('[data-choice-mark]').length,
  };
});

const runScene = async (page, { tool, spec, group: groupName }) => {
  const label = `${tool}${spec ? ` ${spec.mode}${spec.task ? `/${spec.task}` : ''}` : ''}`;
  console.log(`\n${label}`);
  const query = spec ? `&spec=${encodeURIComponent(JSON.stringify(spec))}` : '';
  await page.goto(`${ORIGIN}/tests/browser/keyboardSweep.html?tool=${tool}${query}`, { timeout: 180_000 });
  await page.locator('[data-kb-root] [role="radiogroup"]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
  const group = page.locator('[data-kb-root] [role="radiogroup"]').filter({ has: page.locator('[role="radio"]') })
    .and(typeof groupName === 'string' ? page.getByRole('radiogroup', { name: groupName, exact: true }) : page.getByRole('radiogroup', { name: groupName })).first();
  check(await group.count() === 1, `${label}: the "${groupName}" radio group is on the board`);
  if (!(await group.count())) return;
  const gradesBefore = await page.evaluate(() => window.__KB_GRADES__.length);

  let state = await readGroup(group);
  check(state.count >= 2, `${label}: the group has options to move between (${state.count})`);
  check(state.tabStops.length === 1, `${label}: one tab stop (tabbable: ${JSON.stringify(state.tabStops)})`);
  await group.locator('[role="radio"]').nth(state.tabStops[0] ?? 0).focus();
  const start = (await readGroup(group)).focused;

  const expectAt = async (key, index, why) => {
    await page.keyboard.press(key === 'Space' ? ' ' : key);
    await page.waitForTimeout(120);
    state = await readGroup(group);
    check(state.focused === index && state.checked.length === 1 && state.checked[0] === index,
      `${label}: ${key} ${why} — focus and the check on option ${index + 1} (focus ${state.focused + 1}, checked ${JSON.stringify(state.checked.map((at) => at + 1))})`);
    check(state.markShown, `${label}: after ${key} the checked option shows its ✓ (marks drawn: ${state.marks})`);
    check(state.tabStops.length === 1 && state.tabStops[0] === index, `${label}: after ${key} the one tab stop is the checked option (${JSON.stringify(state.tabStops.map((at) => at + 1))})`);
  };
  const last = state.count - 1;
  await expectAt('ArrowRight', (start + 1) % state.count, 'moves to the next option');
  await expectAt('ArrowLeft', start, 'moves back');
  await expectAt('End', last, 'goes to the last option');
  await expectAt('ArrowDown', 0, 'wraps to the first');
  await expectAt('ArrowUp', last, 'wraps to the last');
  await expectAt('Home', 0, 'goes to the first option');
  await expectAt('Space', 0, 'keeps the focused option checked');
  const gradesAfter = await page.evaluate(() => window.__KB_GRADES__.length);
  check(gradesAfter === gradesBefore, `${label}: moving through the choices graded nothing (${gradesAfter - gradesBefore} grade event(s))`);
  await page.screenshot({ path: path.join(artifacts, `${tool}-${spec ? [spec.mode, spec.task].filter(Boolean).join('-') : 'default'}.png`) }).catch(() => {});
};

const main = async () => {
  mkdirSync(artifacts, { recursive: true });
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => (
      /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(route.request().url()) || /^(data|blob):/.test(route.request().url())
        ? route.continue() : route.abort()
    ));
    const page = await context.newPage();
    for (const scene of SCENES) {
      try {
        await runScene(page, scene);
      } catch (error) {
        check(false, `${scene.tool}: could not finish — ${error.message.split('\n')[0]}`);
        await page.screenshot({ path: path.join(artifacts, `FAIL-${scene.tool}.png`), fullPage: true }).catch(() => {});
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(`\ntoolChoiceGroups FAILED (${failures.length}):\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\ntoolChoiceGroups passed.');
};

await main();

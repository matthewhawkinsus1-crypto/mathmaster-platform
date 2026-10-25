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
 * choices, the groups a card sorts into), Matrix Lab (how many solutions),
 * Relation Mapping (is it a function; an analysis question's choices, AX37),
 * Linear Intercepts (which variable is 0 at the x-intercept) and a multi-answer
 * question's choice field (MultiAnswerGrader) (CI02, C1-36: these two were
 * checked in node only):
 *
 *   - ONE tab stop: exactly one radio has tabindex 0;
 *   - ArrowRight / ArrowDown move focus to the next option AND check it,
 *     ArrowLeft / ArrowUp back, wrapping; Home / End go to the ends;
 *   - exactly one option is aria-checked, and it shows a ✓ — the selection
 *     is not its border colour alone;
 *   - the tab stop follows the checked option;
 *   - no key the group takes grades anything (choosing is not checking).
 *
 * And Figure Match (the real FigureMatchStage on toolChoiceGroups.html), whose
 * select toggles: Home, End and Space on the checked chip keep the answer.
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

// A function whose analysis question has choices, so both of Relation Mapping's
// choice groups are on the board (toolKeyboardRelationMapping.mjs drives the rest).
const RELATION_CHOICES = {
  pairs: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 4 }],
  ask: ['isFunction'],
  answerFields: [{ id: 'kind', label: 'Discrete or continuous?', type: 'choice', options: ['discrete', 'continuous'], answer: 'discrete' }],
};

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
  // VH-12: "which one does not belong" in its three places. The cards and rows
  // were plain buttons or colour-only; each is a radio group with a ✓ now.
  { name: 'representationMatch find the mismatch', tool: 'representationMatch', spec: { mode: 'findMismatch' }, group: 'Which card does not belong?' },
  { name: 'representationMatch check the table', tool: 'representationMatch', spec: { mode: 'tableAudit' }, group: 'Which row does not fit the rule?' },
  { name: 'representationMatch find the mismatched line', tool: 'representationMatch', spec: {
    mode: 'linearConnections', task: 'findMismatch',
    sets: [{ id: 'm', slopeIntercept: 'y=-2x+5', factoredLinear: 'y=-2(x-2.5)', pointSlope: 'y-1=-2(x+2)', standard: '2x+y=5' }],
    mismatchSetId: 'm',
    correctionOptions: [{ id: 'minus', label: 'y-1=-2(x-2)' }, { id: 'plus', label: 'y+1=-2(x+2)' }],
    correctionAnswerId: 'minus',
  }, group: 'Which card does not describe the same line?' },
  { tool: 'matrixLab', spec: null, group: 'How many solutions does the system have?' },
  { name: 'relationMapping function question', tool: 'relationMapping', spec: RELATION_CHOICES, group: 'Is this relation a function?' },
  { name: 'relationMapping analysis choices', tool: 'relationMapping', spec: RELATION_CHOICES, group: 'Discrete or continuous?' },
  // CI02 (C1-36). Linear Intercepts' first question, "which variable is 0 at the
  // x-intercept?" (the intercepts orchestrator, the keyboard sweep's own
  // stepAlgebra/intercepts scene), and a choice field of a multi-answer
  // question beside a typed one (MultiAnswerGrader; its options are shuffled
  // per student, so the scene never assumes an order).
  { name: 'linear intercepts which variable is 0', tool: 'stepAlgebra', spec: { mode: 'linearIntercepts', prompt: 'Find both intercepts.', equation: '3x + 4y = 24' }, group: 'Variable that equals zero at the x-intercept' },
  { name: 'multiAnswer choice field', tool: 'multiAnswer', spec: {
    prompt: 'Look at the graph, then answer both parts.',
    answerFields: [
      { id: 'kind', label: 'Which kind of function is it?', type: 'choice', options: ['linear', 'quadratic', 'exponential'], answer: 'quadratic' },
      { id: 'domain', label: 'Domain', answer: '(-∞, ∞)' },
    ],
  }, group: 'Which kind of function is it?' },
];
const sceneLabel = ({ name, tool, spec }) => name || `${tool}${spec ? ` ${spec.mode}${spec.task ? `/${spec.task}` : ''}` : ''}`;
// TOOL_CHOICE_GROUPS_ONLY="figureMatch,multiAnswer choice field" runs just those
// (every scene when it is not set), to work on one without the rest.
const ONLY = (process.env.TOOL_CHOICE_GROUPS_ONLY || '').split(',').map((entry) => entry.trim()).filter(Boolean);
const wanted = (label) => !ONLY.length || ONLY.includes(label);

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

const runScene = async (page, { name, tool, spec, group: groupName }) => {
  const label = sceneLabel({ name, tool, spec });
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
  const shot = name ? name.replaceAll(' ', '-') : `${tool}-${spec ? [spec.mode, spec.task].filter(Boolean).join('-') : 'default'}`;
  await page.screenshot({ path: path.join(artifacts, `${shot}.png`) }).catch(() => {});
};

// Figure Match, the real FigureMatchStage (toolChoiceGroups.html). Its select
// toggles: pressing the chosen chip clears it, as a pointer may. A key that
// lands on the checked chip — Home on the first, End on the last, Space —
// must leave the answer alone (review B1: it cleared it, and an exit ticket
// then sent the figure as unanswered).
const runFigureMatch = async (page) => {
  const label = 'figureMatch';
  console.log(`\n${label}`);
  await page.goto(`${ORIGIN}/tests/browser/toolChoiceGroups.html`, { timeout: 180_000 });
  const group = page.locator('[data-fm-stage="three"]').getByRole('radiogroup', { name: 'Category for Figure 1', exact: true });
  await group.waitFor({ timeout: 60_000 });
  const answer = () => page.evaluate(() => {
    const changes = window.__fm.changes;
    return { count: changes.length, f1: changes.length ? changes[changes.length - 1].assignments.f1 ?? null : null, cleared: changes.filter((change) => !change.assignments.f1).length };
  });
  const press = async (key) => { await page.keyboard.press(key); await page.waitForTimeout(120); return answer(); };
  await group.locator('[role="radio"]').first().focus();
  let state = await press('Space');
  check(state.f1 === 'linear' && state.count === 1, `${label}: Space on the first chip answers Linear (${JSON.stringify(state)})`);
  const holds = async (key, expected, why) => {
    const before = await answer();
    const after = await press(key);
    check(after.count === before.count && after.f1 === expected, `${label}: ${key} ${why} — the answer stays ${expected} (${before.count} -> ${after.count} change(s), now ${after.f1})`);
  };
  await holds('Home', 'linear', 'on the checked first chip');
  await holds('Space', 'linear', 'on the checked chip');
  state = await press('End');
  check(state.f1 === 'exponential', `${label}: End answers the last category (${state.f1})`);
  await holds('End', 'exponential', 'on the checked last chip');
  await holds('Space', 'exponential', 'on the checked chip');
  state = await press('ArrowRight');
  check(state.f1 === 'linear', `${label}: ArrowRight wraps to Linear (${state.f1})`);
  await holds('Home', 'linear', 'on the checked first chip, again');
  state = await answer();
  check(state.cleared === 0, `${label}: no key ever reported Figure 1 unanswered (${state.cleared} cleared value(s))`);
  // The middle chip checked: Space, Space writes nothing and focus stays there.
  await group.locator('[role="radio"]').nth(1).click();
  state = await answer();
  check(state.f1 === 'quadratic', `${label}: the middle chip answers Quadratic (${state.f1})`);
  const beforeMiddle = state.count;
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  state = await answer();
  const middleFocused = await group.locator('[role="radio"]').nth(1).evaluate((element) => element === document.activeElement);
  check(state.count === beforeMiddle && state.f1 === 'quadratic' && middleFocused, `${label}: Space, Space on the checked middle chip writes nothing (${state.count - beforeMiddle} write(s)) and focus stays on it (${middleFocused})`);
  // Pointer parity: Enter is the button's click, and a click on the chosen
  // chip still clears it on purpose.
  state = await press('Enter');
  check(state.f1 === null, `${label}: Enter (a click) on the chosen chip still clears it, as a pointer does (${state.f1})`);
  // One category: every key lands on the one chip. Space answers once, and
  // nothing after it writes or clears.
  const one = page.locator('[data-fm-stage="one"]').getByRole('radiogroup', { name: 'Category for Figure 1', exact: true });
  await one.locator('[role="radio"]').first().focus();
  for (const key of ['Space', 'ArrowRight', 'ArrowDown', 'Home', 'End', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
  }
  const single = await page.evaluate(() => ({ writes: window.__fm.one.length, cleared: window.__fm.one.filter((change) => !change.assignments.g1).length, g1: window.__fm.one.at(-1)?.assignments.g1 ?? null }));
  check(single.writes === 1 && single.cleared === 0 && single.g1 === 'linear', `${label}: a one-category group — Space, Right, Down, Home, End, Space give one write and never clear (${JSON.stringify(single)})`);
  await page.screenshot({ path: path.join(artifacts, 'figureMatch.png') }).catch(() => {});
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
    try {
      if (wanted('figureMatch')) await runFigureMatch(page);
    } catch (error) {
      check(false, `figureMatch: could not finish — ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: path.join(artifacts, 'FAIL-figureMatch.png'), fullPage: true }).catch(() => {});
    }
    const unknown = ONLY.filter((label) => label !== 'figureMatch' && !SCENES.some((scene) => sceneLabel(scene) === label));
    if (unknown.length) check(false, `TOOL_CHOICE_GROUPS_ONLY names a scene that does not exist: ${unknown.join(', ')}`);
    for (const scene of SCENES.filter((entry) => wanted(sceneLabel(entry)))) {
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

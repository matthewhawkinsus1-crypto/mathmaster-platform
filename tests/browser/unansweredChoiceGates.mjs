// A JUDGMENT THE STUDENT IS ASKED TO MAKE STARTS UNANSWERED, AND UNANSWERED IS
// NEVER CREDITED.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/unansweredChoiceGates.mjs [fixture ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// Several tools opened a choice on one of its own options — "Exactly one
// solution", "Positive", "Yes", "up", "Hole", "Continuous" — so a student who
// never chose was credited whenever that option was the answer; and a yes / no
// check read a blank as "no". Each fixture in unansweredChoiceGatesMain.jsx is
// a question whose answer is exactly the old default (or "no"), mounted in the
// real QuestionEngine and driven only through rendered controls:
//
//   every judgment opens on "Choose…" (a radio group: nothing checked);
//   left unanswered it earns nothing — graded wrong, or, where the server
//   refuses a response without it (the systems workspace), not sent at all;
//   chosen right it is graded right;
//   a choice survives a reload, and a draft saved before this change comes
//   back exactly as it was stored;
//   choosing exactly what a tool used to pre-select, without pressing Check,
//   is finished work a deadline submits (OWN_CHOICES), not the untouched
//   start an older client saved.
//
// Exits non-zero on any failure.

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
const tally = {};
let fixture = '';
const check = (ok, label, detail = '') => {
  tally[fixture] = tally[fixture] || { ok: 0, fail: 0 };
  tally[fixture][ok ? 'ok' : 'fail'] += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const settle = (page, ms = 250) => page.waitForTimeout(ms);
const stamp = Date.now();
let pageCount = 0;

/** A page for this fixture. The same `run` on a later page is a reload of the same student work. */
const open = async (q, run = `${stamp}-${(pageCount += 1)}`) => {
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${q}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/unansweredChoiceGates.html?q=${q}&run=${run}`, { waitUntil: 'networkidle' });
  await page.locator('[data-unanswered-fixture]').waitFor();
  await settle(page, 700);
  return { page, run };
};

const combo = (page, name, index = 0) => page.getByRole('combobox', { name, exact: true }).nth(index);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const choose = async (page, name, label, index = 0) => {
  await combo(page, name, index).selectOption({ label });
  await settle(page, 120);
};
const fill = async (page, role, name, value, index = 0) => {
  await page.getByRole(role, { name, exact: true }).nth(index).fill(String(value));
  await settle(page, 80);
};
const selectState = (page, name, index = 0) => combo(page, name, index).evaluate((select) => ({
  value: select.value,
  text: select.options[select.selectedIndex]?.text?.trim() || '',
}));
const grades = (page) => page.evaluate(() => window.__mmGraded.slice());
// What QuestionEngine checkpointed — the response a deadline would submit.
const checkpoints = (page) => page.evaluate(() => window.__mmCheckpoints.slice());
const lastGrade = async (page) => (await grades(page)).at(-1) || null;
const press = async (page, name) => {
  await button(page, name).click();
  await settle(page, 450);
};
const partOf = (grade, id) => (grade?.parts || []).find((part) => part.id === id) || null;
const brief = (grade) => (grade ? JSON.stringify({ isCorrect: grade.isCorrect, partial: grade.partialCreditPercent, parts: (grade.parts || []).map((part) => `${part.id}:${part.isCorrect}`) }) : 'no grade');

const startsUnanswered = async (page, name, index = 0) => {
  const state = await selectState(page, name, index);
  check(state.value === '' && state.text === 'Choose…', `${fixture}: "${name}"${index ? ` #${index + 1}` : ''} opens on Choose…`, JSON.stringify(state));
};

// A two- or three-way judgment offered as one-tap buttons (the inequality
// modes): a group named by its question, its choices pressed or not.
const group = (page, name, index = 0) => page.getByRole('group', { name, exact: true }).nth(index);
const pressedChoices = (page, name, index = 0) => group(page, name, index).locator('button[aria-pressed="true"]')
  .evaluateAll((buttons) => buttons.map((choice) => choice.textContent.trim()));
const startsUnpressed = async (page, name, index = 0) => {
  const pressed = await pressedChoices(page, name, index);
  check(pressed.length === 0, `${fixture}: "${name}"${index ? ` #${index + 1}` : ''} opens with nothing chosen`, JSON.stringify(pressed));
};
const pick = async (page, name, label, index = 0) => {
  await group(page, name, index).getByRole('button', { name: label, exact: true }).click();
  await settle(page, 120);
};

/** A tool that grades an unanswered choice as wrong: blank earns nothing, the right choice is credited. */
const blankThenRight = async (page, { checkLabel, answer }) => {
  const before = (await grades(page)).length;
  await press(page, checkLabel);
  const blank = await lastGrade(page);
  check((await grades(page)).length === before + 1 && blank?.isCorrect === false,
    `${fixture}: left unanswered, the choice earns nothing`, brief(blank));
  await answer();
  await press(page, checkLabel);
  const right = await lastGrade(page);
  check(right?.isCorrect === true, `${fixture}: chosen right, it is graded right`, brief(right));
};

/* --------------------------------------------------------------- fixtures */

const FIXTURES = {
  async 'data-correlation'() {
    const { page, run } = await open('data-correlation');
    await startsUnanswered(page, 'Direction');
    await startsUnanswered(page, 'Strength');
    await fill(page, 'spinbutton', 'Correlation coefficient r', 1);
    await press(page, 'Check data model');
    const blank = await lastGrade(page);
    check(partOf(blank, 'correlationInterpretation')?.isCorrect === false && partOf(blank, 'correlation')?.isCorrect === true,
      `${fixture}: r alone, direction and strength unanswered: the interpretation earns nothing`, brief(blank));
    await choose(page, 'Direction', 'Positive');
    await choose(page, 'Strength', 'Strong');
    await press(page, 'Check data model');
    check((await lastGrade(page))?.isCorrect === true, `${fixture}: chosen right, graded right`, brief(await lastGrade(page)));
    await page.close();
    // The same student coming back: what they chose, not the old defaults.
    const again = await open('data-correlation', run);
    const direction = await selectState(again.page, 'Direction');
    const strength = await selectState(again.page, 'Strength');
    check(direction.value === 'positive' && strength.value === 'strong', `${fixture}: the choices survive a reload`, `${direction.value} / ${strength.value}`);
    await again.page.close();
  },

  async 'data-full'() {
    const { page } = await open('data-full');
    for (const name of ['Direction', 'Strength', 'What can this observational data justify?', 'This prediction is...']) {
      await startsUnanswered(page, name);
    }
    const checked = await page.getByRole('radio').evaluateAll((radios) => radios.filter((radio) => radio.checked).length);
    check(checked === 0, `${fixture}: no model family is chosen for the student`, `${checked} checked`);
    // The exact linear prediction at x = 3.5 (least squares on the fixture's points).
    await fill(page, 'spinbutton', 'Predicted y', '7.015');
    await press(page, 'Check data model');
    const blank = await lastGrade(page);
    check(['association', 'modelChoice', 'prediction'].every((id) => partOf(blank, id)?.isCorrect === false),
      `${fixture}: unanswered association, model family and prediction type earn nothing (the prediction value alone is not enough)`, brief(blank));
    await choose(page, 'Direction', 'Positive');
    await choose(page, 'Strength', 'Strong');
    await choose(page, 'What can this observational data justify?', 'An association / relationship');
    await page.getByRole('radio', { name: /^Linear/ }).check();
    await choose(page, 'This prediction is...', 'Interpolation');
    await press(page, 'Check data model');
    const right = await lastGrade(page);
    check(['association', 'modelChoice', 'prediction'].every((id) => partOf(right, id)?.isCorrect === true),
      `${fixture}: chosen right, each judgment is graded right`, brief(right));
    await page.close();
  },

  async 'systems-linear'() {
    const name = 'How many solutions does this system have?';
    const { page, run } = await open('systems-linear');
    await startsUnanswered(page, name);
    check(await page.getByRole('spinbutton', { name: 'x', exact: true }).count() === 0, `${fixture}: x and y wait for the classification`);
    check(await button(page, 'Check system').isDisabled(), `${fixture}: Check waits for the classification (the server refuses a response without one)`);
    check(await page.getByText('Choose how many solutions the system has first.').isVisible(), `${fixture}: and says so`);
    check((await grades(page)).length === 0, `${fixture}: nothing was sent`);
    await choose(page, name, 'Exactly one solution');
    check(await page.getByRole('spinbutton', { name: 'x', exact: true }).isVisible(), `${fixture}: "Exactly one solution" reveals x and y`);
    // Undo takes the choice back to where it was — unanswered, not a default.
    await press(page, 'Undo');
    const undone = await selectState(page, name);
    check(undone.value === '' && await page.getByRole('spinbutton', { name: 'x', exact: true }).count() === 0,
      `${fixture}: Undo takes the classification back to unanswered`, JSON.stringify(undone));
    await choose(page, name, 'Exactly one solution');
    await fill(page, 'spinbutton', 'x', 2);
    await fill(page, 'spinbutton', 'y', 5);
    await press(page, 'Check system');
    check((await lastGrade(page))?.isCorrect === true, `${fixture}: chosen and solved, graded right`, brief(await lastGrade(page)));
    await page.close();
    const again = await open('systems-linear', run);
    const restored = await selectState(again.page, name);
    const x = await again.page.getByRole('spinbutton', { name: 'x', exact: true }).inputValue().catch(() => null);
    check(restored.value === 'one' && x === '2', `${fixture}: the classification and the point survive a reload`, `${restored.value} / x=${x}`);
    await again.page.close();

    // Drafts saved before this change come back exactly as they were stored:
    // a chosen classification stays chosen; a draft with no classification in
    // it (the student never touched it) is unanswered, not "one".
    for (const [record, expected, label] of [
      [{ classification: 'one', x: '2', y: '5' }, 'one', 'a stored "Exactly one solution"'],
      [{ classification: 'none' }, 'none', 'a stored "No solution"'],
      [{ x: '2', y: '5' }, '', 'a stored draft with no classification'],
    ]) {
      const seeded = await open('systems-linear');
      await seeded.page.evaluate((value) => window.__mmToolDraft.write(value), record);
      await seeded.page.close();
      const reopened = await open('systems-linear', seeded.run);
      const state = await selectState(reopened.page, name);
      const stored = await reopened.page.evaluate(() => window.__mmToolDraft.read());
      check(state.value === expected && JSON.stringify(stored) === JSON.stringify(record),
        `${fixture}: ${label} restores as ${expected || 'unanswered'} and is not rewritten`, `${JSON.stringify(state)} stored ${JSON.stringify(stored)}`);
      await reopened.page.close();
    }
  },

  async 'systems-matrix3'() {
    const name = 'How many solutions does this system have?';
    const { page } = await open('systems-matrix3');
    await startsUnanswered(page, name);
    await press(page, 'Use matrix technology · Compute RREF');
    check(await button(page, 'Check matrix solution').isDisabled(), `${fixture}: with RREF run, Check still waits for the classification`);
    await choose(page, name, 'Exactly one solution');
    await fill(page, 'spinbutton', 'x', 1);
    await fill(page, 'spinbutton', 'y', 2);
    await fill(page, 'spinbutton', 'z', 3);
    await press(page, 'Check matrix solution');
    check((await lastGrade(page))?.isCorrect === true, `${fixture}: classified and solved, graded right`, brief(await lastGrade(page)));
    await page.close();
  },

  async 'inequality-analyze'() {
    const name = 'Is the purple point (5, 1) in the feasible region?';
    const { page } = await open('inequality-analyze');
    await startsUnpressed(page, name);
    await fill(page, 'spinbutton', 'Your own feasible x', 0);
    await fill(page, 'spinbutton', 'Your own feasible y', 2);
    // The marked point is outside the region, so "no" is right — and a blank
    // used to be read as "no".
    check(await button(page, 'Check feasible region').isDisabled(), `${fixture}: a blank test-point answer is not sent (and not read as "no")`);
    check((await grades(page)).length === 0, `${fixture}: nothing was sent`);
    await pick(page, name, 'No');
    await press(page, 'Check feasible region');
    check((await lastGrade(page))?.isCorrect === true, `${fixture}: answered "No", graded right`, brief(await lastGrade(page)));
    await page.close();
  },

  async 'inequality-construct'() {
    const { page } = await open('inequality-construct');
    for (const index of [0, 1]) {
      await startsUnpressed(page, 'Boundary style', index);
      await startsUnpressed(page, 'Shade', index);
    }
    const points = [[0, 0, 1, 1], [0, 4, 1, 3]];
    for (const [index, [x1, y1, x2, y2]] of points.entries()) {
      await fill(page, 'spinbutton', 'Boundary point 1: x', x1, index);
      await fill(page, 'spinbutton', 'Boundary point 1: y', y1, index);
      await fill(page, 'spinbutton', 'Boundary point 2: x', x2, index);
      await fill(page, 'spinbutton', 'Boundary point 2: y', y2, index);
    }
    await pick(page, 'Boundary style', 'Solid', 0);
    await pick(page, 'Shade', 'Above the boundary', 0);
    check(await button(page, 'Check inequality graph').isDisabled(), `${fixture}: one boundary's style and shading still unanswered: not sent`);
    await pick(page, 'Boundary style', 'Dashed', 1);
    await pick(page, 'Shade', 'Below the boundary', 1);
    await press(page, 'Check inequality graph');
    check((await lastGrade(page))?.isCorrect === true, `${fixture}: every choice made right, graded right`, brief(await lastGrade(page)));
    await page.close();
  },

  async 'inequality-modeling'() {
    const { page } = await open('inequality-modeling');
    await startsUnanswered(page, 'Constraint 1: relation');
    await fill(page, 'spinbutton', 'Constraint 1: coefficient of x', 1);
    await fill(page, 'spinbutton', 'Constraint 1: coefficient of y', 1);
    await fill(page, 'spinbutton', 'Constraint 1: constant', 10);
    check(await button(page, 'Graph these constraints').isDisabled(), `${fixture}: a constraint with no relation chosen is not a constraint yet`);
    await choose(page, 'Constraint 1: relation', '≤');
    check(!(await button(page, 'Graph these constraints').isDisabled()), `${fixture}: with the relation chosen it can be sent`);
    await page.close();
  },

  async 'inverse-restriction-linear'() {
    const name = 'Does f need a restricted domain to have an inverse?';
    const { page } = await open('inverse-restriction-linear');
    check(await combo(page, name).isVisible(), `${fixture}: the restriction a "restriction" question asks is on screen for a linear f`);
    await startsUnanswered(page, name);
    await fill(page, 'spinbutton', 'f⁻¹(7) =', 3);
    await blankThenRight(page, { checkLabel: 'Check function reasoning', answer: () => choose(page, name, 'No restriction needed') });
    await page.close();
  },

  async 'parabola-equidistance'() {
    const name = 'Is P on the parabola?';
    const { page } = await open('parabola-equidistance');
    await startsUnanswered(page, name);
    await fill(page, 'textbox', 'Distance P → focus', '6.083');
    await fill(page, 'textbox', 'Perpendicular distance P → directrix', 3);
    await blankThenRight(page, { checkLabel: 'Check equidistance', answer: () => choose(page, name, 'No') });
    await page.close();
  },

  async 'parabola-equation'() {
    const name = 'Opening direction';
    const { page } = await open('parabola-equation');
    await startsUnanswered(page, name);
    await fill(page, 'textbox', 'Value of 4p', 6);
    await blankThenRight(page, { checkLabel: 'Check equation', answer: () => choose(page, name, 'up') });
    await page.close();
  },

  async 'polynomial-factor'() {
    const name = 'Is (x − 1) a factor?';
    const { page } = await open('polynomial-factor');
    await startsUnanswered(page, name);
    await fill(page, 'textbox', 'P(1) =', 2);
    await blankThenRight(page, { checkLabel: 'Check connection', answer: () => choose(page, name, 'No') });
    await page.close();
  },

  async 'polynomial-graph'() {
    const { page } = await open('polynomial-graph');
    await startsUnanswered(page, 'At the target zero');
    await startsUnanswered(page, 'End behavior');
    await blankThenRight(page, {
      checkLabel: 'Check graph connections',
      answer: async () => {
        await choose(page, 'At the target zero', 'crosses the x-axis');
        await choose(page, 'End behavior', 'left falls, right rises');
      },
    });
    await page.close();
  },

  async 'polynomial-rational'() {
    const name = 'What happens at x = 2?';
    const { page } = await open('polynomial-rational');
    await startsUnanswered(page, name);
    await blankThenRight(page, { checkLabel: 'Check feature', answer: () => choose(page, name, 'Hole') });
    await page.close();
  },

  // A deadline submits only work the shared grader calls finished, through the
  // checkpoint QuestionEngine writes. The options the lab used to pre-select
  // read as an older client's untouched start unless today's work says the
  // student chose them.
  async 'data-association-deadline'() {
    const { page } = await open('data-association');
    const names = ['Direction', 'Strength', 'What can this observational data justify?'];
    for (const name of names) await startsUnanswered(page, name);
    await choose(page, 'Direction', 'Positive');
    await choose(page, 'Strength', 'Moderate');
    await choose(page, 'What can this observational data justify?', 'An association / relationship');
    await settle(page, 1700); // past the checkpoint debounce, with no Check pressed
    const latest = (await checkpoints(page)).at(-1) || null;
    check(latest?.isComplete === true, `${fixture}: chosen, without Check, it is finished work a deadline submits`, JSON.stringify(latest));
    check(/"choicesOpenUnanswered":true/.test(latest?.responseKey || '') && /"direction":"positive"/.test(latest?.responseKey || ''),
      `${fixture}: the checkpoint carries the student's choices, marked as theirs`, latest?.responseKey);
    check((await grades(page)).length === 0, `${fixture}: and nothing was graded on the way`);
    await press(page, 'Check data model');
    check((await lastGrade(page))?.isCorrect === true, `${fixture}: the same choices are graded right`, brief(await lastGrade(page)));
    await page.close();
  },

  async 'polynomial-rational-deadline'() {
    const name = 'What happens at x = 2?';
    const { page } = await open('polynomial-rational');
    await startsUnanswered(page, name);
    await settle(page, 1700);
    check((await checkpoints(page)).length === 0, `${fixture}: an untouched select writes no checkpoint`);
    await choose(page, name, 'Hole');
    await settle(page, 1700);
    const latest = (await checkpoints(page)).at(-1) || null;
    check(latest?.isComplete === true && /"choice":"hole"/.test(latest?.responseKey || ''),
      `${fixture}: "Hole", chosen without Check, is finished work a deadline submits`, JSON.stringify(latest));
    await page.close();
  },

  async 'builder-continuity'() {
    const name = 'Graph type';
    const { page } = await open('builder-continuity');
    await startsUnanswered(page, name);
    check(await page.getByText('Choose a graph type to draw your relation.').isVisible(), `${fixture}: nothing is drawn as if "Continuous" had been chosen`);
    await fill(page, 'spinbutton', 'Slope m', 1);
    await fill(page, 'spinbutton', 'y-intercept b', 2);
    const continuity = page.locator('[data-constraint-satisfied]').filter({ hasText: 'Continuous graph' });
    check(await continuity.getAttribute('data-constraint-satisfied') === 'false', `${fixture}: "Continuous graph" is not met before the student chooses`);
    await blankThenRight(page, {
      checkLabel: 'Submit this model',
      answer: async () => {
        await choose(page, name, 'Continuous');
        check(await continuity.getAttribute('data-constraint-satisfied') === 'true', `${fixture}: met once "Continuous" is chosen`);
      },
    });
    await page.close();
  },
};

/* ----------------------------------------------------------------- runner */

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FIXTURES);
for (const name of selected) {
  fixture = name;
  console.log(`\n== ${name}`);
  if (!FIXTURES[name]) { check(false, `unknown fixture ${name}`); continue; }
  try {
    await FIXTURES[name]();
  } catch (error) {
    check(false, `${name}: the journey could not be completed`, error.message.split('\n')[0]);
  }
}

await browser.close();
console.log('\nfixture                      ok  fail');
for (const [name, counts] of Object.entries(tally)) console.log(`${name.padEnd(28)} ${String(counts.ok).padStart(3)} ${String(counts.fail).padStart(5)}`);
if (failures.length) {
  console.log(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log('\nEvery judgment opens unanswered; unanswered earns nothing; chosen right is graded right; drafts restore as stored.');

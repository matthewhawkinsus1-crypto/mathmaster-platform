// ON A DOL, A REGISTRY TOOL NEITHER GRADES A STAGE EARLY NOR OFFERS A HINT.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/toolPolicyGates.mjs
//
// Two defects, each a free answer key on an exit ticket:
//
//   The classic Representation Bridge's "Check this stage" said "General form
//   correct" / "Needs another look" on every activity, kept each later stage
//   locked until the one before it passed, and kept Submit disabled until every
//   stage passed — so a student could edit and re-check until it said correct,
//   then spend the one attempt.
//
//   Every registry tool's hint panel ignored the activity's hintsAllowed, and
//   the Work View Help drawer printed a question's authored hints outright.
//   Inside a composed question the stage tools (RelationMapping) had no runtime
//   context at all, so they showed hints AND "Correct / Not yet".
//
// Checks, in the real QuestionEngine, practice beside DOL:
//   bridge    practice: the check is a verdict and locks the next stage;
//             DOL: the check says only "Stage complete — graded when you
//             submit", nothing is locked, Submit opens on finished (wrong) work,
//             the submission is graded, and no verdict appears.
//   help      the bridge's authored hint is in the Work View Help drawer on
//             practice and absent on a DOL.
//   mapping   ONE LADDER (student pass 3, HELP-10): the tool's own "Stuck?
//             Show a hint" is gone inside a question; on practice its rungs
//             are in the platform's ladder, offered before the first try (D5);
//             on a DOL there is no hint anywhere.
//   composed  the mapping stage's rungs in the platform ladder and its "Not
//             yet" verdict on practice; both absent on a DOL.
//   graphing  Graphing2's rungs in the platform ladder, which is also its Work
//             View Help, on practice; absent on a DOL, where the drawer keeps
//             the platform's directions.
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const AUTHORED_BRIDGE_HINT = 'AUTHORED-BRIDGE-HINT';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const run = Date.now();
// `ready` must be something the TOOL renders, in the same render as whatever is
// asserted absent below. (A `text=` selector is a case-insensitive substring
// match: "Build the Mapping Diagram" matched the authored prompt while the lazy
// tool was still loading, and an absence check made then passes vacuously.)
const open = async (role, tool, ready) => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${role}/${tool}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/toolPolicyGates.html?role=${role}&tool=${tool}&run=${run}`, { waitUntil: 'networkidle' });
  await ready(page).first().waitFor({ timeout: 20000 });
  return page;
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const helpDrawers = (page) => page.evaluate(() => [...document.querySelectorAll('section[aria-label="Help and instructions"]')]
  .map((section) => section.textContent || '').join(' | '));
// Work View capabilities are published from an effect, after the tool renders.
// Wait until the drawer shows `expected` before judging what else it shows.
const helpDrawerShows = (page, expected) => page.waitForFunction(
  (needle) => [...document.querySelectorAll('section[aria-label="Help and instructions"]')].some((section) => (section.textContent || '').includes(needle)),
  expected,
  { timeout: 8000 },
).then(() => true, () => false);
// The tool's own ladder: inside a question there must be none (HELP-10).
const hintButtons = (page) => page.getByRole('button', { name: /Stuck\? Show a hint/ }).count();
// The platform's ladder, as a student meets it before the first try (D5):
// the offer in words, and "Show a hint" opens hint 1 in the Hint panel.
const firstHintOffer = (page) => page.locator('[data-first-hint-offer]');
const platformHint = async (page) => {
  await firstHintOffer(page).getByRole('button', { name: 'Show a hint' }).click();
  await page.waitForTimeout(200);
  return page.evaluate(() => [...document.querySelectorAll('[data-hint-panel] li[data-hint-source]')]
    .map((item) => `${item.dataset.hintSource}: ${item.textContent}`).join('\n'));
};
// Where each rung of the platform ladder came from (the panel says, without
// showing the rungs not yet revealed): the tool's rungs are "tool".
const ladderSources = (page) => page.evaluate(() => document.querySelector('[data-hint-panel]')?.dataset.hintSources || '');
// The mapping's final action: on its own it spends a try and says "Submit —
// …" (student pass 3, D9); as a composed question's step it is a free "Check".
const mappingCheck = (page) => page.getByRole('button', { name: /^(Check$|Submit — )/ });
const fill = async (page, label, value) => {
  await page.locator(`input[aria-label="${label}"]`).fill(value);
  await page.waitForTimeout(60);
};

// -------------------------------------------------------------------- bridge
const GENERAL = { m: 'Slope m in general form', b: 'y-intercept b in general form', equation: 'Equation in general/slope-intercept form' };
const FACTORED = { a: 'Coefficient a in factored form', c: 'Zero c in factored form', equation: 'Equation in factored linear form' };
const stageCheck = (page, index) => page.getByRole('button', { name: 'Check this stage' }).nth(index);
const GENERAL_CHECK = 1; // rate evidence, general form, factored form, graph, meaning
const FACTORED_CHECK = 2;
// The bridge's Submit says its cost (student pass 3, D9); its stage checks stay "Check".
const submitBridge = (page) => page.getByRole('button', { name: /^Submit — / });

{
  const page = await open('practice', 'bridge', (p) => p.locator(`input[aria-label="${GENERAL.m}"]`));
  // The line is y = 5x − 20; b is wrong.
  await fill(page, GENERAL.m, '5');
  await fill(page, GENERAL.b, '-19');
  await fill(page, GENERAL.equation, 'y = 5x - 19');
  await stageCheck(page, GENERAL_CHECK).click();
  await page.waitForTimeout(200);
  let text = await bodyText(page);
  check(/Needs another look/.test(text), 'practice bridge: a wrong stage check is a verdict');
  check(await page.locator(`input[aria-label="${FACTORED.a}"]`).isDisabled(), 'practice bridge: the next stage stays locked until this one passes');
  check(await submitBridge(page).isDisabled(), 'practice bridge: Submit waits for every stage to pass');
  await fill(page, GENERAL.b, '-20');
  await fill(page, GENERAL.equation, 'y = 5x - 20');
  await stageCheck(page, GENERAL_CHECK).click();
  await page.waitForTimeout(200);
  text = await bodyText(page);
  check(/General form correct/.test(text), 'practice bridge: a right stage check says so');
  check(await page.locator(`input[aria-label="${FACTORED.a}"]`).isEnabled(), 'practice bridge: a passed stage opens the next');
  // The drawer offers the authored hint the way every tool does — one reveal at
  // a time, recorded — not printed all at once and unrecorded.
  check(await helpDrawerShows(page, 'Show a hint'), 'practice bridge: the Work View Help drawer offers the authored hint as a recorded hint', await helpDrawers(page));
  check(!(await helpDrawers(page)).includes(AUTHORED_BRIDGE_HINT), 'practice bridge: the hint is not printed before the student asks for it', await helpDrawers(page));
  await page.getByRole('button', { name: /Enlarge question|Open Work View/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Help', exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.locator('section[aria-label="Help and instructions"]').getByRole('button', { name: /Show a hint/ }).first().click();
  await page.waitForTimeout(200);
  check(await helpDrawerShows(page, AUTHORED_BRIDGE_HINT), 'practice bridge: asking for it in the drawer shows the authored hint', await helpDrawers(page));
  await page.close();
}

{
  const page = await open('dol', 'bridge', (p) => p.locator(`input[aria-label="${GENERAL.m}"]`));
  // The drawer holds the platform's Help, never replaced by the tool's
  // (student pass 3, TOOL-3) — and on a DOL no tool description and no method
  // step (R-10, fail-closed), and not the authored hint.
  check(await helpDrawerShows(page, 'Hints are not part of this activity'), 'DOL bridge: the platform Help is in the drawer, not replaced', await helpDrawers(page));
  // What it keeps is how to work the panels (stepsAreControls on an
  // assessment, integrator round 2): not the tool's description and not a
  // method step.
  check(/tap two rows to form an interval/.test(await helpDrawers(page)), 'DOL bridge: the drawer says how to work the table', await helpDrawers(page));
  check(!/five connected views|using the b you determine|plot the x-intercept from your factored form/.test(await helpDrawers(page)), 'DOL bridge: the drawer holds neither the tool\'s description nor a method step', await helpDrawers(page));
  check(!(await helpDrawers(page)).includes(AUTHORED_BRIDGE_HINT), 'DOL bridge: the authored hint is NOT in the Work View Help drawer', await helpDrawers(page));
  await fill(page, GENERAL.m, '5');
  await fill(page, GENERAL.b, '-19');
  await fill(page, GENERAL.equation, 'y = 5x - 19');
  await stageCheck(page, GENERAL_CHECK).click();
  await page.waitForTimeout(200);
  let text = await bodyText(page);
  check(/Stage complete — it is graded when you submit\./.test(text), 'DOL bridge: the check says only that the stage is finished');
  check(!/Needs another look|General form correct|needs another look/.test(text), 'DOL bridge: the check names no verdict');
  const factoredOpen = await page.locator(`input[aria-label="${FACTORED.a}"]`).isEnabled();
  check(factoredOpen, 'DOL bridge: the next stage is open although this one is wrong');
  check(!/Check the general form stage first/.test(text), 'DOL bridge: no stage asks for an earlier one to pass');
  check(await submitBridge(page).isDisabled(), 'DOL bridge: Submit waits while a required stage is unfinished');
  check(/Finish every required stage above before submitting/.test(text), 'DOL bridge: and says to finish, not to check');
  if (!factoredOpen) {
    // A locked stage is the defect itself: report it rather than time out on it.
    check(false, 'DOL bridge: the rest of the journey (finish, submit) cannot run while the factored stage is locked');
  } else {
    await stageCheck(page, FACTORED_CHECK).click();
    await page.waitForTimeout(200);
    check(/Not finished yet — fill in every part of this stage\./.test(await bodyText(page)), 'DOL bridge: an unfinished stage says so, and nothing more');
    // Finish the factored form, wrong too (the zero is 4, not 3).
    await fill(page, FACTORED.a, '5');
    await fill(page, FACTORED.c, '3');
    await fill(page, FACTORED.equation, 'y = 5(x - 3)');
    await stageCheck(page, FACTORED_CHECK).click();
    await page.waitForTimeout(200);
    text = await bodyText(page);
    check(!/Factored form correct|Needs another look/.test(text), 'DOL bridge: the factored check names no verdict either');
    const submittable = await submitBridge(page).isEnabled();
    check(submittable, 'DOL bridge: finished-but-wrong work can be submitted');
    if (submittable) await submitBridge(page).click();
    await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 5000 }).catch(() => {});
    const graded = await page.evaluate(() => window.__mmGraded);
    check(graded?.isCorrect === false, 'DOL bridge: the submission is graded on the work as it stands', JSON.stringify(graded?.isCorrect));
    text = await bodyText(page);
    check(!/Every representation agrees|Some representations need another look|Recheck:/.test(text), 'DOL bridge: no verdict after submitting either');
  }
  await page.close();
}

// ------------------------------------------------------------- mapping (hints)
for (const role of ['practice', 'dol']) {
  // RelationMapping's Check is rendered in the same panel, in the same render,
  // as its HintPanel.
  const page = await open(role, 'mapping', mappingCheck);
  const count = await hintButtons(page);
  check(count === 0, `${role} mapping: the tool shows no ladder of its own`, `${count} tool hint button(s)`);
  if (role === 'practice') {
    check(/Hints never lower your score\. Your teacher can see you used one\./.test(await firstHintOffer(page).textContent().catch(() => '')), 'practice mapping: the first hint is offered before the first try, with what it costs');
    check(!/Each ordered pair \(x, y\) is one arrow/.test(await bodyText(page)), 'practice mapping: offered, not shown');
    const revealed = await platformHint(page);
    check(/^(family|authored|tool): /m.test(revealed), 'practice mapping: "Show a hint" opens hint 1 of the platform ladder', revealed);
    check(/\btool\b/.test(await ladderSources(page)), 'practice mapping: Relation Mapping\'s rungs are in that ladder', await ladderSources(page));
  } else {
    check(await firstHintOffer(page).count() === 0, 'DOL mapping: no hint is offered');
    check(!/Each ordered pair \(x, y\) is one arrow/.test(await bodyText(page)), 'DOL mapping: no hint text anywhere');
  }
  await page.close();
}

// ------------------------------------------------- composed (hints + verdicts)
for (const role of ['practice', 'dol']) {
  const page = await open(role, 'composed', mappingCheck);
  const count = await hintButtons(page);
  await mappingCheck(page).first().click();
  await page.waitForTimeout(250);
  const text = await bodyText(page);
  check(count === 0, `${role} composed: the mapping stage shows no ladder of its own`, `${count} tool hint button(s)`);
  if (role === 'practice') {
    check(/Not yet/.test(text) && /No arrows drawn yet/.test(text), 'practice composed: the mapping stage check is a verdict');
    const revealed = await platformHint(page);
    check(/^(family|authored|tool): /m.test(revealed), 'practice composed: "Show a hint" opens hint 1 of the platform ladder', revealed);
    check(/\btool\b/.test(await ladderSources(page)), 'practice composed: the mapping stage\'s rungs are in that ladder', await ladderSources(page));
  } else {
    check(await firstHintOffer(page).count() === 0, 'DOL composed: the mapping stage offers no hint');
    check(!/Not yet|No arrows drawn yet|Correct — the diagram/.test(text), 'DOL composed: the mapping stage check names no verdict');
  }
  await page.close();
}

// ----------------------------------------------------------- graphing (help)
for (const role of ['practice', 'dol']) {
  const page = await open(role, 'graphing', (p) => p.getByRole('button', { name: /^Submit — / }));
  // Graphing2 publishes its Work View capabilities from an effect: wait until
  // its Check construction action is on the Work View rail, so the Help drawer
  // below is the one it published (or chose not to).
  await page.waitForFunction(
    () => [...document.querySelectorAll('aside[aria-label="Work View controls"]')].some((rail) => /Submit — /.test(rail.textContent || '')),
    null,
    { timeout: 8000 },
  ).catch(() => failures.push(`${role} graphing: Graphing2 never published its Work View capabilities`));
  const count = await hintButtons(page);
  const drawers = await helpDrawers(page);
  check(count === 0, `${role} graphing: the tool shows no ladder of its own, inline or in Work View Help`, `${count} tool hint button(s)`);
  if (role === 'practice') {
    check(/Hints never lower your score/.test(drawers) && !/Stuck\? Show a hint/.test(drawers), 'practice graphing: Work View Help is the platform\'s Hint panel', drawers.slice(0, 200));
    const revealed = await platformHint(page);
    check(/^(family|authored|tool): /m.test(revealed), 'practice graphing: "Show a hint" opens hint 1 of the platform ladder', revealed);
    check(/\btool\b/.test(await ladderSources(page)), 'practice graphing: Graphing2\'s rungs are in that ladder', await ladderSources(page));
  } else {
    check(count === 0, 'DOL graphing: no hint is offered, inline or in Work View Help', `${count} hint button(s)`);
    check(/Use the task directions/.test(drawers), 'DOL graphing: Work View Help keeps the platform directions rather than an empty drawer', drawers.slice(0, 160));
  }
  await page.close();
}

// ------------------------------------------------------------- step algebra
// ONE LADDER (student pass 3, TOOL-5): the solver's strategic hint is a rung
// of the platform's ladder — released a try at a time and recorded with the
// other hints — not a second "Need a strategic hint?" beside the work bar's
// Hint, which opened with no try at all.
{
  // Ready: the solver's own footnote, in the same render as the disclosure was.
  const page = await open('practice', 'step', (p) => p.getByText(/A longer route is still correct algebra/));
  check(await page.getByText('Need a strategic hint?').count() === 0, 'practice step algebra: no second hint control beside the work bar\'s Hint');
  check(!/Look for a move that cancels a term/.test(await bodyText(page)), 'practice step algebra: the strategic hint is not on screen before it is asked for');
  await page.locator('button', { hasText: '💡 Hint' }).first().click();
  await page.waitForFunction(() => /\btool\b/.test(document.querySelector('[data-hint-panel]')?.dataset.hintSources || ''), null, { timeout: 8000 }).catch(() => {});
  check(/\btool\b/.test(await ladderSources(page)), 'practice step algebra: the strategic hint is a rung of the platform ladder', await ladderSources(page));
  // A STANDING rung (review S1): open before the first try, as the disclosure
  // was, and taking no family rung's place — hint 1 of the family still opens
  // before the first try too, and hint 2 waits for a try.
  const panel = page.locator('[data-hint-panel]:visible').first();
  await panel.getByRole('button', { name: /^Show a hint$/ }).click();
  await page.waitForTimeout(150);
  const first = await panel.locator('li[data-hint-source]').first().innerText().catch(() => '');
  check(/Look for a move that cancels a term/.test(first) && await panel.locator('li[data-hint-source="tool"]').count() === 1, 'practice step algebra: before any try, the strategic hint opens on request', first.slice(0, 100));
  check(await panel.getByRole('button', { name: /^Show the next hint$/ }).count() === 1, 'practice step algebra: the family\'s first hint still opens before any try');
  await panel.getByRole('button', { name: /^Show the next hint$/ }).click();
  await page.waitForTimeout(150);
  check(await panel.locator('li[data-hint-source="family"]').count() === 1 && await panel.getByRole('button', { name: /^Show the next hint$/ }).count() === 0, 'practice step algebra: the family\'s second hint waits for a try, as before');
  await page.close();
}
for (const role of ['dol', 'test']) {
  // Ready: the solver's own footnote, in the same render as the hint would be.
  // (Its student sentence: the level's policy sentence is a teacher's preview
  // only, pass 3 Q-12.)
  const page = await open(role, 'step', (p) => p.getByText(/A longer route is still correct algebra/));
  check(!/Nothing is simplified for the student|Support \d ·/.test(await bodyText(page)), `${role} step algebra: no teacher policy copy for the student`);
  check(await page.getByText('Need a strategic hint?').count() === 0, `${role} step algebra: no strategic hint is offered`);
  check(!/Hints are available on request/.test(await bodyText(page)), `${role} step algebra: nothing promises a hint on request`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} tool policy failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\ntool policy gates: no stage verdict and no hint where the activity withholds them.');

// ON A DOL, QUIZ OR TEST, THE GRAPH NEVER SAYS WHETHER THE STUDENT IS RIGHT.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/graphPointCheck.mjs
//
// "Check Point Placements" answered "Revise: Plot the point where x = 2" on
// every activity, including the ones that withhold outcomes until submission —
// so on an exit ticket a student could move one point until the check passed,
// free and as often as they liked, then submit a graph they had been told was
// right (PQ-036). Hiding the names was not enough: a curve could only be drawn
// through the CORRECT points, so the neutral check was still an oracle, and
// the curve then snapped to the true function, the true graph ends pulsed on
// screen, markers were pulled onto them, and the marker list offered only the
// right symbol.
//
// Checks, in the real QuestionEngine:
//   practice  a wrong point is still named; the curve snaps, the ends pulse and
//             only the right symbols are offered (immediate feedback is the
//             point of practice);
//   DOL curve no check at all: the student's own points stay movable, the curve
//             is drawn through THEIR points and stays as drawn, the ends do not
//             pulse, every marker symbol is offered and none is pulled — and
//             the submission grades each part, the curve against the function;
//   DOL curve a correct graph with markers where practice would accept them
//             earns full credit (the silent grading matches practice);
//   DOL ends  a finite-domain curve does not announce "Boundary Markers";
//   DOL plot  there is no check: placed points are the answer, graded as placed;
//   inverse   on a DOL there is no reflection check; the inverse is drawn
//             through the student's own reflected points and graded on submit.
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

// Every page gets its own draft: a second page for the same role and question
// would otherwise restore the first one's graph.
const run = Date.now();
let pageCount = 0;
const open = async (role, variant = '') => {
  pageCount += 1;
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${role}${variant}: page error ${error.message}`));
  const query = variant === 'inverse' ? '&inverse=1'
    : variant === 'inverse-sketch' ? '&inverse=sketch'
      : variant === 'boundary' ? '&ends=boundary'
        : variant ? `&plot=${variant}` : '';
  await page.goto(`${ORIGIN}/tests/browser/graphPointCheck.html?role=${role}${query}&run=${run}-${pageCount}`, { waitUntil: 'networkidle' });
  await page.locator('button', { hasText: 'Plot the point where x = 0' }).first().waitFor();
  return page;
};

// The grid's own axis labels give the screen mapping, so a click lands on a
// real coordinate rather than a guessed pixel.
const axisFit = (page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const marks = [...svg.querySelectorAll('text')]
    .filter((t) => /^-?\d+$/.test(t.textContent.trim()))
    .map((t) => { const r = t.getBoundingClientRect(); return { value: Number(t.textContent), cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  const line = (key, other) => {
    const rows = {};
    marks.forEach((m) => { const k = Math.round(m[other]); (rows[k] = rows[k] || []).push(m); });
    const best = Object.values(rows).sort((a, b) => b.length - a.length)[0].sort((a, b) => a.value - b.value);
    const [a, b] = [best[0], best[best.length - 1]];
    const scale = (b[key] - a[key]) / (b.value - a.value);
    return { zero: a[key] - a.value * scale, scale };
  };
  return { x: line('cx', 'cy'), y: line('cy', 'cx') };
});
const toScreen = (fit, x, y) => [fit.x.zero + x * fit.x.scale, fit.y.zero + y * fit.y.scale];
const toGraph = (fit, px, py) => [(px - fit.x.zero) / fit.x.scale, (py - fit.y.zero) / fit.y.scale];

const plot = async (page, label, x, y) => {
  const fit = await axisFit(page);
  await page.locator('button', { hasText: label }).first().click();
  await page.waitForTimeout(150);
  await page.mouse.click(...toScreen(fit, x, y));
  await page.waitForTimeout(250);
};
// A freehand stroke along y = f(x), one pointer-down to pointer-up.
const draw = async (page, f, fromX, toX) => {
  const fit = await axisFit(page);
  const points = [];
  for (let x = fromX; x <= toX + 1e-9; x += 0.2) points.push(toScreen(fit, x, f(x)));
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...point, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(350);
};
const placeMarker = async (page, type, x, y) => {
  const fit = await axisFit(page);
  await page.locator('button', { hasText: type }).first().click();
  await page.waitForTimeout(120);
  await page.mouse.click(...toScreen(fit, x, y));
  await page.waitForTimeout(250);
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const checkButton = (page) => page.getByRole('button', { name: 'Check Point Placements' });
const markerChoices = (page) => page.evaluate(() => [...document.querySelectorAll('button')]
  .map((button) => button.textContent.trim())
  .map((text) => (text.match(/^.(Arrow|Open Circle|Closed Circle)/) || [])[1])
  .filter(Boolean));
const submitAndRead = async (page) => {
  const submit = page.getByRole('button', { name: /^Submit/ }).first();
  const submittable = await submit.isEnabled();
  if (submittable) await submit.click();
  await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 5000 }).catch(() => {});
  return { submittable, graded: await page.evaluate(() => window.__mmGraded) };
};
const part = (graded, id) => graded?.parts?.find((entry) => entry.id === id);
const line = (x) => 2 * x + 1;

// PRACTICE: immediate feedback names the wrong point; a passed check lets the
// curve snap to the function and shows the true ends — that is practice.
let trueEnds = null;
{
  const page = await open('practice');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 4);
  await checkButton(page).click();
  await page.waitForTimeout(200);
  const text = await bodyText(page);
  check(/Revise: Plot the point where x = 2/.test(text), 'practice: the check names the wrong point', (text.match(/Revise:[^\n]*/) || ['(no revise message)'])[0]);

  await plot(page, 'Plot the point where x = 2', 2, 5);
  await checkButton(page).click();
  await page.waitForTimeout(200);
  await draw(page, line, -1.4, 2.8);
  check(await page.locator('.mathmaster-snap-curve').count() > 0, 'practice: the curve snaps to the function');
  check(await page.locator('.mathmaster-endpoint-pulse').count() === 2, 'practice: both true graph ends pulse');
  check(JSON.stringify(await markerChoices(page)) === JSON.stringify(['Arrow']), 'practice: only the right symbol is offered', JSON.stringify(await markerChoices(page)));
  // Where the true ends are, for the DOL run below (same question, same window).
  const fit = await axisFit(page);
  trueEnds = await page.evaluate(() => [...document.querySelectorAll('.mathmaster-endpoint-pulse')].map((ring) => {
    const box = ring.getBoundingClientRect();
    return [box.x + box.width / 2, box.y + box.height / 2];
  }));
  trueEnds = trueEnds.map(([px, py]) => toGraph(fit, px, py));
  await page.close();
}

// DOL, CURVE, WRONG: nothing says so until it is submitted.
{
  const page = await open('dol');
  check(await checkButton(page).count() === 0, 'DOL curve: there is no point check to iterate against');
  check(await page.locator('[data-points-graded-on-submit]').isVisible(), 'DOL curve: the student is told the points and curve are graded on submit');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, -1);
  check(/Draw your curve through all of your points/.test(await bodyText(page)), 'DOL curve: once every point is down the student is asked to draw through THEIR points');

  // The window is x -2..4, y -2..7 (built from the function and its points).
  const own = (x) => -x + 1;
  await draw(page, own, -1.8, 2.8);
  let text = await bodyText(page);
  check(/Your curve passes through your points\. It is graded when you submit\./.test(text), 'DOL curve: a curve through the student\'s own points is accepted', (text.match(/Your curve[^\n]*|Draw the curve[^\n]*/) || ['—'])[0]);
  check(/Add the end markers at the ends of your curve/.test(text) && !/continuation arrow/.test(text), 'DOL curve: the marker prompt does not name the symbol');
  check(await page.locator('.mathmaster-snap-curve').count() === 0, 'DOL curve: the true function is never drawn in place of the student\'s curve');
  check(await page.locator('.mathmaster-endpoint-pulse').count() === 0, 'DOL curve: the true graph ends do not pulse');
  check(JSON.stringify(await markerChoices(page)) === JSON.stringify(['Arrow', 'Open Circle', 'Closed Circle']), 'DOL curve: every marker symbol is offered', JSON.stringify(await markerChoices(page)));

  // The sketch holds the points still: no point is offered to move until
  // Clear Sketch (below) takes the curve away.
  check(await page.locator('button', { hasText: 'Plot the point where x = 2' }).count() === 0, 'DOL curve: a drawn curve holds its points still');
  await placeMarker(page, 'Arrow', -1.8, own(-1.8));
  text = await bodyText(page);
  check(/Arrow placed\. Markers are graded when you submit\./.test(text) && !/snapped to End/.test(text), 'DOL curve: a marker stays where it is put, with no pull toward the true end');
  await placeMarker(page, 'Arrow', 2.8, own(2.8));

  const { submittable, graded } = await submitAndRead(page);
  check(submittable, 'DOL curve: the finished graph can be submitted');
  check(graded?.isCorrect === false, 'DOL curve: the wrong graph is graded wrong', JSON.stringify(graded?.isCorrect));
  check(part(graded, 'p1')?.isCorrect === true && part(graded, 'p2')?.isCorrect === false && part(graded, 'p2')?.response === '(2, -1)',
    'DOL curve: each point is graded where it was put', JSON.stringify([part(graded, 'p1'), part(graded, 'p2')]));
  const curve = part(graded, 'graph-curve');
  check(curve?.isComplete === true && curve?.isCorrect === false && /student's points/.test(curve?.response || ''),
    'DOL curve: the curve is complete and graded against the function', JSON.stringify(curve));
  await page.close();
}

// DOL, CURVE, RIGHT: the same work practice accepts earns full credit here.
{
  const page = await open('dol');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 5);
  await draw(page, line, -1.4, 2.8);
  check(trueEnds?.length === 2, 'DOL curve right: practice showed two true ends to compare with', JSON.stringify(trueEnds));
  for (const [x, y] of trueEnds || []) await placeMarker(page, 'Arrow', x, y);
  const { graded } = await submitAndRead(page);
  const wrong = (graded?.parts || []).filter((entry) => !entry.isCorrect).map((entry) => entry.id);
  check(graded?.isCorrect === true, 'DOL curve right: a correct graph earns full credit', JSON.stringify(wrong));
  await page.close();
}

// Clear Sketch frees the points again (the student can change their mind).
{
  const page = await open('dol');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, -1);
  await draw(page, (x) => -x + 1, -1.8, 2.8);
  await page.getByRole('button', { name: 'Clear Sketch' }).click();
  await page.waitForTimeout(200);
  await plot(page, 'Plot the point where x = 2', 2, 5);
  await draw(page, line, -1.4, 2.8);
  for (const [x, y] of trueEnds || []) await placeMarker(page, 'Arrow', x, y);
  const { graded } = await submitAndRead(page);
  check(part(graded, 'p2')?.response === '(2, 5)' && part(graded, 'p2')?.isCorrect === true, 'DOL curve: after Clear Sketch a point can be moved again', JSON.stringify(part(graded, 'p2')));
  await page.close();
}

// A FINITE DOMAIN: practice offers only circles; a DOL does not say so.
{
  const practice = await open('practice', 'boundary');
  await plot(practice, 'Plot the point where x = 0', 0, 1);
  await plot(practice, 'Plot the point where x = 2', 2, 5);
  await checkButton(practice).click();
  await practice.waitForTimeout(200);
  await draw(practice, line, 0, 3);
  check(JSON.stringify(await markerChoices(practice)) === JSON.stringify(['Open Circle', 'Closed Circle']), 'practice ends: a finite domain offers the two circles', JSON.stringify(await markerChoices(practice)));
  check(/Boundary Markers/.test(await bodyText(practice)), 'practice ends: the section is titled for boundaries');
  await practice.close();

  const page = await open('dol', 'boundary');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 5);
  await draw(page, line, 0, 3);
  const text = await bodyText(page);
  check(JSON.stringify(await markerChoices(page)) === JSON.stringify(['Arrow', 'Open Circle', 'Closed Circle']), 'DOL ends: every symbol is offered for a finite domain too', JSON.stringify(await markerChoices(page)));
  check(!/Boundary Markers|finite domain\. Its graph must stop/.test(text), 'DOL ends: nothing announces that the graph stops');
  await page.close();
}

// DOL, POINT-ONLY PLOT: no check; the submission is the check.
for (const role of ['dol', 'test']) {
  const page = await open(role, 'points');
  check(await checkButton(page).count() === 0, `${role} plot: there is no point check to iterate against`);
  check(await page.locator('[data-points-graded-on-submit]').isVisible(), `${role} plot: the student is told the points are graded on submit`);
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 4);
  // Still movable: the student can change their mind before submitting.
  await plot(page, 'Plot the point where x = 2', 2, 3);
  const { submittable, graded } = await submitAndRead(page);
  check(submittable, `${role} plot: two placed points can be submitted`);
  check(graded?.isCorrect === false, `${role} plot: the submission is graded as placed (not correct)`, JSON.stringify(graded?.isCorrect));
  check(part(graded, 'p1')?.isCorrect === true && part(graded, 'p2')?.isCorrect === false && part(graded, 'p2')?.response === '(2, 3)', `${role} plot: each point is graded where it was last put`, JSON.stringify([part(graded, 'p1'), part(graded, 'p2')]));
  await page.close();
}

// INVERSE: reflect the plotted points across y = x.
for (const role of ['practice', 'dol']) {
  const page = await open(role, 'inverse');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 5);
  const buildInverse = page.getByRole('button', { name: '2. Build Inverse' });
  if (role === 'practice') {
    await checkButton(page).click();
    await page.waitForTimeout(400);
  } else {
    check(await page.locator('button', { hasText: 'Plot the point where x = 0' }).first().isVisible(), 'DOL inverse: placing the last point does not jump to step 2');
    check(await buildInverse.isEnabled(), 'DOL inverse: step 2 is open once every point is placed');
    await buildInverse.click();
    await page.waitForTimeout(400);
  }
  const reflect = page.getByRole('button', { name: 'Check Reflected Points' });
  check(await page.locator('button', { hasText: 'Reflect the point at x = 0' }).first().isVisible(), `${role} inverse: the student reaches the reflection step`);
  // (0, 1) reflects to (1, 0); put it at (2, 0). (2, 5) -> (5, 2) is right.
  await plot(page, 'Reflect the point at x = 0', 2, 0);
  await plot(page, 'Reflect the point at x = 2', 5, 2);
  if (role === 'practice') {
    await reflect.click();
    await page.waitForTimeout(250);
    check(/swaps the coordinates/.test(await bodyText(page)), 'practice inverse: the check explains the reflection');
  } else {
    check(await reflect.count() === 0, 'DOL inverse: there is no reflection check to iterate against');
    check(!/swaps the coordinates/.test(await bodyText(page)), 'DOL inverse: nothing teaches the rule');
    const { graded } = await submitAndRead(page);
    check(part(graded, 'r1')?.isCorrect === false && part(graded, 'r2')?.isCorrect === true, 'DOL inverse: each reflected point is graded as placed', JSON.stringify([part(graded, 'r1'), part(graded, 'r2')]));
  }
  await page.close();
}

// INVERSE, DRAWN: through the student's own reflected points, judged on submit.
{
  const page = await open('dol', 'inverse-sketch');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 5);
  await draw(page, line, -1.4, 2.8);
  await placeMarker(page, 'Arrow', -1.4, line(-1.4));
  await placeMarker(page, 'Arrow', 2.8, line(2.8));
  await page.getByRole('button', { name: '2. Build Inverse' }).click();
  await page.waitForTimeout(400);
  await plot(page, 'Reflect the point at x = 0', 1, 0);
  await plot(page, 'Reflect the point at x = 2', 5, 3);
  check(/through both of your reflected points\. They are graded when you submit\./.test(await bodyText(page)), 'DOL inverse sketch: the student is asked to draw through their own points');
  await draw(page, (x) => (3 / 4) * (x - 1), -1, 5.6);
  check(/Your inverse passes through your reflected points\. It is graded when you submit\./.test(await bodyText(page)), 'DOL inverse sketch: a sketch through the student\'s own points is accepted');
  check(await page.locator('path[stroke="#9334e6"]').count() === 0, 'DOL inverse sketch: the true inverse is never drawn');
  const { submittable, graded } = await submitAndRead(page);
  check(submittable, 'DOL inverse sketch: the finished inverse can be submitted');
  const sketch = part(graded, 'inverse-line-sketch');
  check(sketch?.isComplete === true && sketch?.isCorrect === false, 'DOL inverse sketch: the drawn inverse is graded against the true inverse', JSON.stringify(sketch));
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} graph point-check failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\ngraph point check: outcomes are shown only where the activity shows them, and graded the same either way.');

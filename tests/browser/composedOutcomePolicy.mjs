// A MULTI-STEP QUESTION ON A DOL, QUIZ OR TEST SAYS NOTHING ABOUT CORRECTNESS
// UNTIL IT IS SUBMITTED — NOT IN ANY STEP.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/composedOutcomePolicy.mjs
//
// A composed question is built from the same tools a single question uses,
// but it was mounted outside the policy that tells those tools whether they
// may show a verdict, so it showed them everywhere:
//   - the mapping-diagram step said "Correct" / "Not yet" (and which part was
//     wrong) every time the student pressed its Check, on an exit ticket;
//   - a table checked against the authored function decided the next step:
//     a wrong table got "Your table and function do not agree yet" and no
//     graph, a right one got "Magnetic placement is on" — a table oracle;
//   - "Your checked graph" appeared on the later steps only when the graph
//     was right (live QA, Algebra I DOL #2 saw it on the domain step).
// Practice keeps every one of those, because there they are the feedback.
//
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

const run = Date.now();
let pageCount = 0;
const open = async (role, q) => {
  pageCount += 1;
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${role} ${q}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/composedOutcomePolicy.html?role=${role}&q=${q}&run=${run}-${pageCount}`, { waitUntil: 'networkidle' });
  return page;
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);

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
const plot = async (page, label, x, y) => {
  const fit = await axisFit(page);
  await page.locator('button', { hasText: label }).first().click();
  await page.waitForTimeout(150);
  await page.mouse.click(...toScreen(fit, x, y));
  await page.waitForTimeout(250);
};
const draw = async (page, f, fromX, toX) => {
  const fit = await axisFit(page);
  const points = [];
  for (let x = fromX; x <= toX + 1e-9; x += 0.25) points.push(toScreen(fit, x, f(x)));
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...point, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(350);
};
const fillTable = async (page, values) => {
  for (const [index, value] of values.entries()) await page.getByLabel(`Row ${index + 1}, f(x)`).fill(String(value));
  await page.waitForTimeout(250);
};
const nextStep = async (page) => {
  await page.getByRole('button', { name: /Next step/ }).click();
  await page.waitForTimeout(800);
};
// The student's points: (0, 1), (1, 3) and the third table row.
const plotTable = async (page, thirdY) => {
  await plot(page, 'Center / Key Point', 0, 1);
  await plot(page, 'P1: x = 1', 1, 3);
  await plot(page, 'P2: x = 2', 2, thirdY);
};
const throughTable = (thirdY) => (x) => (x <= 1 ? 1 + 2 * x : 3 + (thirdY - 3) * (x - 1));

// DOL: a WRONG table still gets its graph step, built from the student's work.
{
  const page = await open('dol', 'model');
  check(/checked when you submit the whole question/.test(await bodyText(page)) && !/the function you wrote/.test(await bodyText(page)),
    'DOL model: the table does not claim to be checked against a function the student never wrote');
  await fillTable(page, [1, 3, 6]);
  await nextStep(page);
  let text = await bodyText(page);
  check(!/do not agree/.test(text), 'DOL model: a table that disagrees with the authored function is not called out');
  check(!/Magnetic placement is on/.test(text), 'DOL model: no magnet, whose presence would mean the table is right');
  check(await page.locator('button', { hasText: 'P2: x = 2' }).count() === 1, 'DOL model: the graph step is built from the student\'s table');
  await plotTable(page, 6);
  await draw(page, throughTable(6), -1.5, 3);
  check(/Your curve passes through your points/.test(await bodyText(page)), 'DOL model: the curve through the student\'s own points is accepted');
  await nextStep(page);
  text = await bodyText(page);
  check(/Your graph/.test(text) && !/Your checked graph/.test(text), 'DOL model: the later step shows "Your graph", never "Your checked graph"');
  check(/The points you plotted/.test(text), 'DOL model: the reference says it is the student\'s own points');
  const points = await page.evaluate(() => {
    const figure = document.querySelector('[aria-label="Your graph"]');
    return figure ? figure.querySelectorAll('circle').length : -1;
  });
  check(points >= 3, 'DOL model: the student\'s points are drawn in the reference', String(points));
  await page.close();
}

// DOL, RIGHT TABLE: the same reference — its presence says nothing.
{
  const page = await open('dol', 'model');
  await fillTable(page, [1, 3, 5]);
  await nextStep(page);
  check(!/Magnetic placement is on/.test(await bodyText(page)), 'DOL model (right table): still no magnet');
  await plotTable(page, 5);
  await draw(page, throughTable(5), -1.5, 3);
  await nextStep(page);
  const text = await bodyText(page);
  check(/Your graph/.test(text) && !/Your checked graph/.test(text), 'DOL model (right table): the same "Your graph" reference');
  await page.close();
}

// PRACTICE keeps its feedback.
{
  const page = await open('practice', 'model');
  await fillTable(page, [1, 3, 6]);
  await nextStep(page);
  check(/Your table and function do not agree yet/.test(await bodyText(page)), 'practice model: a wrong table is still called out');
  await page.getByRole('button', { name: /Previous step/ }).click();
  await page.waitForTimeout(500);
  await fillTable(page, [1, 3, 5]);
  await nextStep(page);
  check(/Magnetic placement is on/.test(await bodyText(page)), 'practice model: a right table still turns the magnet on');
  await plotTable(page, 5);
  await page.getByRole('button', { name: 'Check Point Placements' }).click();
  await page.waitForTimeout(250);
  await draw(page, throughTable(5), -1.5, 3);
  await nextStep(page);
  check(/Your checked graph/.test(await bodyText(page)), 'practice model: a right graph is still shown as "Your checked graph"');
  await page.close();
}

// PQ-024: a card that says "P1: x = 1" places at x = 1 — a fingertip off by
// half a square is not a wrong point. A key point keeps its x for the student.
{
  const page = await open('dol', 'model');
  await fillTable(page, [1, 3, 5]);
  await nextStep(page);
  await plot(page, 'P1: x = 1', 1.5, 3);
  // (The grid snaps x to whole numbers here, so "not held" is x = 1, not 0.)
  await plot(page, 'Center / Key Point', 1, 1);
  // This page's graph draft: the newest one (earlier pages left theirs).
  const placements = await page.evaluate(() => {
    const drafts = Object.entries(localStorage)
      .filter(([key]) => key.endsWith(':graph-construction'))
      .map(([, value]) => JSON.parse(value))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return drafts[0]?.value?.placements || null;
  });
  const p1 = Object.entries(placements || {}).find(([id]) => id === 'point-1')?.[1];
  const key = Object.entries(placements || {}).find(([id]) => id === 'point-key')?.[1];
  check(Array.isArray(p1) && p1[0] === 1 && p1[1] === 3, 'P1 is held to the x its card states', JSON.stringify(p1));
  check(Array.isArray(key) && key[0] === 1 && key[1] === 1, 'the key point stays where the student put it', JSON.stringify(key));
  await page.close();
}

// A REGISTRY TOOL AS A STEP: the mapping diagram's own Check.
for (const role of ['dol', 'quiz', 'practice']) {
  const page = await open(role, 'mapping');
  const arrow = async (x, y) => {
    await page.getByRole('button', { name: `Domain value ${x}` }).first().click();
    await page.getByRole('button', { name: `Range value ${y}` }).first().click();
  };
  await arrow(1, 2);
  await arrow(2, 6);
  await arrow(3, 4);
  await page.getByRole('button', { name: 'Check', exact: true }).first().click();
  await page.waitForTimeout(400);
  const text = await bodyText(page);
  const verdict = /\bNot yet\b|\bCorrect\b|The arrows do not match/.test(text);
  if (role === 'practice') check(verdict, 'practice mapping: the step still says whether the arrows are right');
  else check(!verdict, `${role} mapping: the step says nothing about whether the arrows are right`, (text.match(/Not yet|Correct[^\n]*|The arrows do not match[^\n]*/) || [''])[0]);
  check(/1 of 2 steps answered/.test(text), `${role} mapping: the step's answer is still recorded`);
  // Changing checked arrows withdraws the step's answer until the next Check,
  // so what is graded is what is on screen (useToolSubmission).
  await arrow(3, 6);
  await page.waitForTimeout(300);
  check(/0 of 2 steps answered/.test(await bodyText(page)), `${role} mapping: a change after Check waits for the next Check`, ((await bodyText(page)).match(/\d of 2 steps answered/) || [''])[0]);
  await page.getByRole('button', { name: 'Check', exact: true }).first().click();
  await page.waitForTimeout(400);
  check(/1 of 2 steps answered/.test(await bodyText(page)), `${role} mapping: and the next Check records the changed arrows`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} composed outcome-policy failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\ncomposed outcome policy: no step reveals correctness where the activity withholds it.');

// A CORRECT RELATION PLOT, SUBMITTED, IS GRADED CORRECT.
//
//   npx vite --port 5441 --strictPort &
//   AUDIT_ORIGIN=http://localhost:5441 node tests/browser/relationPlotGrading.mjs
//
// relationRepresentations keys its plot stage `{ pairs }`, and the grader read
// the plot's graph artifact as if it were a list of pairs: an empty list. Every
// plot was marked wrong — credit 0, "The arrows do not match the relation" —
// however exactly the student drew it, so a relation question asking for a
// plot could never reach full credit. tests/platform/relationPlotGrading.test.mjs
// covers the grader; this drives the real stage (WorkflowRunner's coordinate
// plot, InteractiveGraphWorkspace) and reads what QuestionEngine submits, so
// the artifact the grader reads is the one the plotting surface really builds.
//
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5441';

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
const open = async (pairs = '') => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/relationPlotGrading.html?role=practice${pairs ? `&pairs=${pairs}` : ''}&run=${run}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^P1\b/ }).first().waitFor({ timeout: 20000 });
  return page;
};

// Select a point task, type its exact coordinate, place it.
const place = async (page, task, [x, y]) => {
  await page.getByRole('button', { name: new RegExp(`^${task}\\b`) }).first().click();
  await page.getByLabel('x', { exact: true }).fill(String(x));
  await page.getByLabel('y', { exact: true }).fill(String(y));
  await page.getByRole('button', { name: 'Place at this coordinate' }).click();
  await page.waitForTimeout(120);
};

const submit = async (page) => {
  const button = page.getByRole('button', { name: 'Submit Answer' }).first();
  const enabled = await button.isEnabled();
  if (enabled) await button.click();
  await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 5000 }).catch(() => {});
  return { enabled, graded: await page.evaluate(() => window.__mmGraded) };
};

{
  const page = await open();
  const relation = [[-2, 3], [1, 2], [3, -1], [-4, -3]];
  for (const [index, point] of relation.entries()) await place(page, `P${index + 1}`, point);
  await page.getByRole('button', { name: 'Check Point Placements' }).click();
  await page.waitForTimeout(250);
  check(/All point placements are correct/.test(await page.evaluate(() => document.body.innerText)), 'the plotting surface accepts the plotted relation');
  const { enabled, graded } = await submit(page);
  check(enabled, 'the finished plot can be submitted');
  const plot = graded?.parts?.find((part) => part.id === 'plot');
  check(plot?.isCorrect === true, 'the plot stage is graded correct', JSON.stringify(plot));
  check(!/arrows/i.test(String(plot?.detail || '')), 'and is not described as a mapping diagram', String(plot?.detail || ''));
  check(graded?.isCorrect === true, 'the question is graded correct', JSON.stringify(graded?.isCorrect));
  await page.close();
}

{
  // A relation that is not a function: two point tasks share x = 1.
  const page = await open('nonfunction');
  for (const [index, point] of [[1, 2], [1, 5], [3, 4]].entries()) await place(page, `P${index + 1}`, point);
  await page.getByRole('button', { name: 'Check Point Placements' }).click();
  await page.waitForTimeout(250);
  const { graded } = await submit(page);
  const plot = graded?.parts?.find((part) => part.id === 'plot');
  check(plot?.isCorrect === true && graded?.isCorrect === true, 'a plotted non-function relation is graded correct', JSON.stringify(plot));
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} relation plot grading failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nrelation plot grading: a correct plot is graded correct, end to end.');

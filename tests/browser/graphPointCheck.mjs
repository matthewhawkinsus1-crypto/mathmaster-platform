// ON A DOL, QUIZ OR TEST, THE GRAPH NEVER TELLS THE STUDENT WHICH POINT IS WRONG.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/graphPointCheck.mjs
//
// "Check Point Placements" answered "Revise: Plot the point where x = 2" on
// every activity, including the ones that withhold outcomes until submission —
// so on an exit ticket a student could move one point until the check passed,
// free and as often as they liked, then submit a graph they had been told was
// right. The self-check next to it was already policy-gated; this one was not.
//
// Checks, in the real QuestionEngine:
//   practice  a wrong point is still named (immediate feedback is the point);
//   DOL curve the check says only that not every point is on the graph;
//   DOL plot  there is no check at all: placed points are the answer, they stay
//             movable, and the submission grades them as placed;
//   inverse   on a DOL the plot does not jump to step 2 under the student's
//             cursor, and the reflected-point check does not teach the rule
//             ("swaps the coordinates") that practice still shows.
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
const open = async (role, plot = '') => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${role}${plot}: page error ${error.message}`));
  const variant = plot === 'inverse' ? '&inverse=1' : plot ? `&plot=${plot}` : '';
  await page.goto(`${ORIGIN}/tests/browser/graphPointCheck.html?role=${role}${variant}&run=${run}`, { waitUntil: 'networkidle' });
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

const plot = async (page, label, x, y) => {
  const fit = await axisFit(page);
  await page.locator('button', { hasText: label }).first().click();
  await page.waitForTimeout(150);
  await page.mouse.click(fit.x.zero + x * fit.x.scale, fit.y.zero + y * fit.y.scale);
  await page.waitForTimeout(250);
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const checkButton = (page) => page.getByRole('button', { name: 'Check Point Placements' });

// PRACTICE: immediate feedback names the wrong point.
{
  const page = await open('practice');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 4);
  await checkButton(page).click();
  await page.waitForTimeout(200);
  const text = await bodyText(page);
  check(/Revise: Plot the point where x = 2/.test(text), 'practice: the check names the wrong point', (text.match(/Revise:[^\n]*/) || ['(no revise message)'])[0]);
  await page.close();
}

// DOL, CURVE: the check gates the drawing but names nothing.
{
  const page = await open('dol');
  await plot(page, 'Plot the point where x = 0', 0, 1);
  await plot(page, 'Plot the point where x = 2', 2, 4);
  await checkButton(page).click();
  await page.waitForTimeout(200);
  const text = await bodyText(page);
  check(!/Revise:/.test(text) && !/x = 2\b[^\n]*(wrong|revise|incorrect)/i.test(text), 'DOL curve: the check names no point', (text.match(/Revise:[^\n]*/) || ['—'])[0]);
  check(/Not every point is on the graph yet/.test(text), 'DOL curve: it says only that the plot is not finished');
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
  const submit = page.getByRole('button', { name: /^Submit/ }).first();
  const submittable = await submit.isEnabled();
  check(submittable, `${role} plot: two placed points can be submitted`);
  if (submittable) await submit.click();
  await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 5000 }).catch(() => {});
  const graded = await page.evaluate(() => window.__mmGraded);
  const p2 = graded?.parts?.find((part) => part.id === 'p2');
  const p1 = graded?.parts?.find((part) => part.id === 'p1');
  check(graded?.isCorrect === false, `${role} plot: the submission is graded as placed (not correct)`, JSON.stringify(graded?.isCorrect));
  check(p1?.isCorrect === true && p2?.isCorrect === false && p2?.response === '(2, 3)', `${role} plot: each point is graded where it was last put`, JSON.stringify([p1, p2]));
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
  check(await reflect.isVisible(), `${role} inverse: the student reaches the reflection step`);
  // (0, 1) reflects to (1, 0); put it at (2, 0). (2, 5) -> (5, 2) is right.
  await plot(page, 'Reflect the point at x = 0', 2, 0);
  await plot(page, 'Reflect the point at x = 2', 5, 2);
  await reflect.click();
  await page.waitForTimeout(250);
  const text = await bodyText(page);
  if (role === 'practice') {
    check(/swaps the coordinates/.test(text), 'practice inverse: the check explains the reflection');
  } else {
    check(!/swaps the coordinates/.test(text), 'DOL inverse: the check does not teach the rule');
    check(/Not every reflected point is in place yet/.test(text), 'DOL inverse: it says only that the reflection is not right yet');
  }
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} graph point-check failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\ngraph point check: outcomes are named only where the activity shows them.');

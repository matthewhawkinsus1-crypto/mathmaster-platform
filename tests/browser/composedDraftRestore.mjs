// A COMPOSED QUESTION WITH A GRAPH STEP SURVIVES A CHROMEBOOK SWAP (PQ-043).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/composedDraftRestore.mjs [model|tableGraph|analysis|relation ...]
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed)
//
// WorkflowRunner keeps every step's answer in one draft, and a graph step's
// answer carried the plotting workspace's verdict. The server guard refuses a
// record with `isCorrect` in it, so from the moment a graph step first
// reported, none of the question's answers reached the server copy: a student
// who changed Chromebooks lost all of them. The server copy now carries the
// graph step without its verdict, and the step works its verdict out again
// when it is opened.
//
// Driven in the real QuestionEngine with the real background sync and App.jsx's
// restore (composedDraftRestoreMain.jsx), for three questions — a model whose
// graph is graded by its own verdict, a function-characteristics question whose
// plot is closed by a later step, and a relation graded by its plotted pairs —
// each on Practice or a DOL, and each with the server copy arriving after the
// question has mounted (App.jsx's order whenever the read is the slower) and
// before it:
//
//   DEVICE A   the student works every step. Nothing is refused by the guard,
//              and the server copy holds every step's answer with no verdict
//              anywhere in it.
//   SAME       the same device opened again (its own storage AND the server
//              copy): it keeps its own copy and grades exactly as before.
//   DEVICE B   a fresh browser with nothing but the server copy: the other
//              steps' answers and the plotted points come back; the graph step
//              is a step to open, the question cannot be submitted yet and its
//              graph step is not graded wrong; opening it brings the verdict
//              back from the student's own construction (and Undo is not left
//              holding that as an edit, nor the answers re-stamped: the server
//              copy stays A's — PQ-044), and the submission grades exactly as
//              device A's.
//
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ONLY = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
// When the server copy arrives: `after` the question has mounted (a read
// slower than the question — App.jsx then remounts it) or `before` (a read that
// beat it). Both, unless RESTORE_ORDER names one. Until PQ-044, `after` restored
// nothing into the question on screen.
const ORDERS = process.env.RESTORE_ORDER ? [process.env.RESTORE_ORDER] : ['after', 'before'];

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const VIEWPORT = { width: 1366, height: 900 };

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const runId = Date.now();
const url = (q, role, run, extra = '') => `${ORIGIN}/tests/browser/composedDraftRestore.html?q=${q}&role=${role}&run=${run}${extra}`;

const openPage = async (context, q, role, run, extra = '') => {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${q}/${role}: page error ${error.message}`));
  const syncLines = [];
  page.on('console', (message) => { if (/\[MathMaster draft sync\]/.test(message.text())) syncLines.push(message.text()); });
  await page.goto(url(q, role, run, extra), { waitUntil: 'networkidle' });
  await page.waitForSelector('.workflow-focus, .math-tool-workspace, [data-generation]', { timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, syncLines };
};

/* ------------------------------------------------------- driving the plane */

// The grid's own axis labels give the screen mapping, so a click lands on a
// real coordinate rather than a guessed pixel (graphPointCheck.mjs).
const axisFit = (page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('.workflow-focus__active-stage svg, svg')]
    .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
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
// A question of four or more steps shows one at a time (focus mode); a shorter
// one stacks every step on the page.
const stageScope = async (page) => ((await page.locator('.workflow-focus__active-stage').count()) ? page.locator('.workflow-focus__active-stage') : page.locator('body'));
const tapPlane = async (page, label, x, y) => {
  if (label) await (await stageScope(page)).locator('button', { hasText: label }).first().click();
  await page.waitForTimeout(120);
  const fit = await axisFit(page);
  await page.mouse.click(...toScreen(fit, x, y));
  await page.waitForTimeout(220);
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
// Select a point card, type its exact coordinate, place it (relationPlotGrading.mjs).
const placeTyped = async (page, task, [x, y]) => {
  const stage = await stageScope(page);
  await stage.getByRole('button', { name: new RegExp(`^${task}\\b`) }).first().click();
  const numbers = stage.locator('input[type="number"]');
  if (await numbers.nth(0).isEditable().catch(() => false)) await numbers.nth(0).fill(String(x));
  await numbers.nth(1).fill(String(y));
  await stage.getByRole('button', { name: /place at this coordinate/i }).click();
  await page.waitForTimeout(150);
};

const nextStep = async (page) => {
  await page.getByRole('button', { name: /Next step/ }).click();
  await page.waitForTimeout(700);
};
const typeMath = async (page, text) => {
  // Simple steps stay mounted in focus mode (hidden), so the step's field is
  // the visible one.
  const field = (await stageScope(page)).locator('math-field:visible').first();
  await field.click();
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(350);
};

/* ----------------------------------------------------------- what we read */

const bodyText = (page) => page.evaluate(() => document.body.innerText);
const progress = async (page) => ((await bodyText(page)).match(/(\d+) of (\d+) steps answered/) || [null, '-1', '-1']).slice(1).map(Number);
const submitButton = (page) => page.getByRole('button', { name: /^Submit/ }).first();
const submitAndRead = async (page) => {
  const button = submitButton(page);
  const enabled = await button.isEnabled();
  if (enabled) await button.click();
  await page.waitForFunction(() => window.__mmGraded !== null, null, { timeout: 8000 }).catch(() => {});
  return { enabled, graded: await page.evaluate(() => window.__mmGraded) };
};
// The point cards say where each point is ("(1, 3)"), the strongest statement
// the screen makes about a restored construction.
const pointReadouts = (page) => page.evaluate(() => [...(document.querySelector('.workflow-focus__active-stage') || document.body).querySelectorAll('button')]
  .map((node) => (node.textContent || '').trim())
  .filter((text) => /\(\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*\)/.test(text))
  .map((text) => text.match(/\(\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*\)/)[0].replace(/\s+/g, ''))
  .sort());
// A table step's check against the authored function, and that function, are
// worked out where they are needed, never carried (tableSourceCheck.js).
const VERDICT_KEYS = ['isCorrect', 'score', 'partGrades', 'partialCreditPercent', 'credit', 'answerKey', 'solution', 'grading', 'accepted', 'acceptedAnswers', 'correctAnswer', 'expectedAnswer', 'sourceConsistent', 'sourceChecked', 'sourceFunctionSpec'];
const serverResponses = (page) => page.evaluate(() => {
  const entry = (window.__mm.server()?.entries || []).find((candidate) => candidate.key.endsWith(':workflow-responses'));
  return entry ? { savedAt: entry.savedAt, valueJson: entry.valueJson, value: JSON.parse(entry.valueJson) } : null;
});
const keysAnywhere = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((entry) => keysAnywhere(entry, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, nested]) => { out.push(key); keysAnywhere(nested, out); });
  return out;
};
const localGraph = (page, stageId) => page.evaluate((id) => window.__mm.local()[':workflow-responses']?.value?.[id] ?? null, stageId);
// The plotting workspace's own record of what the student built (points,
// strokes, markers) — what it rebuilds the step from when it is opened.
const constructions = (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.__mm.local())
  .filter(([suffix]) => suffix.endsWith(':graph-construction'))
  .map(([suffix, entry]) => [suffix, entry?.value ?? null])));
const workflowUndo = (page) => page.evaluate(() => {
  // The platform Undo the workflow registers with (priority -1): the work
  // bar's Undo control, whatever its exact wording.
  const control = [...document.querySelectorAll('button')].find((button) => /undo/i.test(`${button.getAttribute('aria-label') || ''} ${button.title || ''} ${button.textContent || ''}`));
  return control ? { present: true, disabled: control.disabled || control.getAttribute('aria-disabled') === 'true', label: control.getAttribute('aria-label') || control.title || control.textContent.trim() } : { present: false };
});
const sameGrade = (a, b) => JSON.stringify({ isCorrect: a?.isCorrect, partialCreditPercent: a?.partialCreditPercent, parts: a?.parts, responseKey: a?.responseKey })
  === JSON.stringify({ isCorrect: b?.isCorrect, partialCreditPercent: b?.partialCreditPercent, parts: b?.parts, responseKey: b?.responseKey });

/* ------------------------------------------------------------ the journeys */

// Each question: how device A does the work, and which step holds the graph.
const QUESTIONS = {
  model: {
    graphStage: 'graph',
    graphStep: 2,
    roles: ['practice', 'dol'],
    async work(page, role) {
      for (const [index, value] of [1, 3, 5].entries()) await page.getByLabel(`Row ${index + 1}, f(x)`).fill(String(value));
      await page.waitForTimeout(300);
      await nextStep(page);
      await tapPlane(page, 'Center / Key Point', 0, 1);
      await tapPlane(page, 'P1: x = 1', 1, 3);
      await tapPlane(page, 'P2: x = 2', 2, 5);
      if (role === 'practice') {
        await page.getByRole('button', { name: 'Check Point Placements' }).click();
        await page.waitForTimeout(250);
      }
      await draw(page, (x) => 2 * x + 1, -1.5, 3);
      await nextStep(page);
      await typeMath(page, '(-inf,inf)');
      await nextStep(page);
      await typeMath(page, '(-inf,inf)');
    },
  },
  // Stacked: the graph step mounts with the page, its draft named after the
  // table (which comes back from the server copy without its check).
  tableGraph: {
    graphStage: 'graph',
    graphStep: 2,
    stacked: true,
    roles: ['practice'],
    async work(page, role) {
      for (const [index, value] of [1, 3, 5].entries()) await page.getByLabel(`Row ${index + 1}, f(x)`).fill(String(value));
      await page.waitForTimeout(500);
      await tapPlane(page, 'Center / Key Point', 0, 1);
      await tapPlane(page, 'P1: x = 1', 1, 3);
      await tapPlane(page, 'P2: x = 2', 2, 5);
      if (role === 'practice') {
        await page.getByRole('button', { name: 'Check Point Placements' }).click();
        await page.waitForTimeout(250);
      }
      await draw(page, (x) => 2 * x + 1, -1.5, 3);
    },
  },
  analysis: {
    graphStage: 'plot',
    graphStep: 1,
    roles: ['dol', 'practice'],
    async work(page, role) {
      for (const [index, pair] of [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]].entries()) await placeTyped(page, `P${index + 1}`, pair);
      if (role === 'practice') {
        await page.getByRole('button', { name: 'Check Point Placements' }).click();
        await page.waitForTimeout(250);
      }
      await nextStep(page);
      await page.locator('.workflow-focus__active-stage button', { hasText: /^Quadratic$/ }).first().click();
      await page.waitForTimeout(250);
      await nextStep(page);
      await tapPlane(page, null, -1, 0);
      await tapPlane(page, null, 5, 0);
      await nextStep(page);
      await page.locator('.workflow-focus__active-stage button', { hasText: 'All Real Numbers' }).first().click();
      await page.waitForTimeout(300);
    },
  },
  relation: {
    graphStage: 'plot',
    graphStep: 1,
    // Two steps: stacked, so the graph step's workspace mounts with the page.
    stacked: true,
    roles: ['practice'],
    async work(page, role) {
      for (const [index, pair] of [[-2, 3], [1, 2], [3, -1], [-4, -3]].entries()) await placeTyped(page, `P${index + 1}`, pair);
      if (role === 'practice') {
        await page.getByRole('button', { name: 'Check Point Placements' }).click();
        await page.waitForTimeout(250);
      }
      await typeMath(page, '{-4,-2,1,3}');
    },
  },
};

for (const [q, spec] of Object.entries(QUESTIONS)) {
  if (ONLY.length && !ONLY.includes(q)) continue;
  for (const role of spec.roles) {
    const tag = `${q}/${role}`;
    const run = `${runId}-${q}-${role}`;

    /* DEVICE A: the work, and what reaches the server. */
    const contextA = await browser.newContext({ viewport: VIEWPORT });
    const { page: pageA, syncLines } = await openPage(contextA, q, role, run);
    await spec.work(pageA, role);
    await pageA.evaluate(() => window.__mm.flush());
    await pageA.waitForTimeout(400);

    const graphOnA = await localGraph(pageA, spec.graphStage);
    check(graphOnA?.isComplete === true && typeof graphOnA?.isCorrect === 'boolean', `${tag} A: the graph step is complete on the device, verdict kept there`, JSON.stringify({ isComplete: graphOnA?.isComplete, isCorrect: graphOnA?.isCorrect }));
    const rejections = await pageA.evaluate(() => window.__mm.rejections());
    check(!rejections.some((entry) => entry.key.endsWith(':workflow-responses')), `${tag} A: the guard refuses nothing of the question's answers`, JSON.stringify(rejections.map((entry) => `${entry.reason} at ${entry.path}`)));
    check(!syncLines.some((line) => /workflow-responses/.test(line)), `${tag} A: no draft-sync refusal in the console`, syncLines[0] || '');
    const stored = await serverResponses(pageA);
    const localAll = await pageA.evaluate(() => window.__mm.local()[':workflow-responses']?.value || {});
    check(Boolean(stored), `${tag} A: the server copy holds the question's answers`);
    const storedIds = Object.keys(stored?.value || {}).sort();
    check(JSON.stringify(storedIds) === JSON.stringify(Object.keys(localAll).sort()), `${tag} A: every step's answer is in the server copy`, `server ${storedIds.join(',')} / device ${Object.keys(localAll).sort().join(',')}`);
    const leaked = keysAnywhere(stored?.value).filter((key) => VERDICT_KEYS.includes(key));
    check(leaked.length === 0 && !/isCorrect|partialCredit|"credit"|"score"/.test(stored?.valueJson || ''), `${tag} A: no verdict anywhere in the server copy`, leaked.join(','));
    check(stored?.value?.[spec.graphStage]?.rederiveOnOpen === true && stored?.value?.[spec.graphStage]?.isComplete === false, `${tag} A: the server copy marks the graph step to be worked out again`);
    const server = await pageA.evaluate(() => window.__mm.server());
    const profileA = await contextA.storageState();
    const constructionsA = await constructions(pageA);
    check(Object.keys(constructionsA).length > 0, `${tag} A: the plotting workspace keeps its own construction`, Object.keys(constructionsA).join(','));
    const readoutsA = await (async () => {
      // The graph step as the student left it: its cards' readouts.
      if (!spec.stacked) {
        await pageA.getByRole('button', { name: new RegExp(`^Step ${spec.graphStep}:`) }).click();
        await pageA.waitForTimeout(700);
      }
      return pointReadouts(pageA);
    })();

    const { enabled: enabledA, graded: gradedA } = await submitAndRead(pageA);
    check(enabledA && gradedA, `${tag} A: the finished question can be submitted`);
    await contextA.close();

    for (const RESTORE of ORDERS) {
      const tagO = `${tag} [server copy ${RESTORE} the question]`;
      /* SAME DEVICE: its own copy AND the server copy. */
      const contextSame = await browser.newContext({ viewport: VIEWPORT, storageState: profileA });
      await contextSame.addInitScript((doc) => { window.__mmServerSeed = doc; }, server);
      const { page: pageSame } = await openPage(contextSame, q, role, run, `&restore=${RESTORE}`);
      await pageSame.waitForTimeout(RESTORE === 'after' ? 1200 : 300);
      const restoredSame = await pageSame.evaluate(() => window.__mmRestore.restored);
      check(restoredSame === 0, `${tagO} same device: nothing from the server copy replaces the device's own`, String(restoredSame));
      const graphSame = await localGraph(pageSame, spec.graphStage);
      check(JSON.stringify(graphSame) === JSON.stringify(graphOnA), `${tagO} same device: the graph step is exactly the device's own, verdict and all`);
      // Opened again, the finished question can be submitted as it stands
      // (fd739ea2: QuestionEngine no longer clears the first report on mount).
      const responsesSame = await pageSame.evaluate(() => window.__mm.local()[':workflow-responses']?.value);
      check(JSON.stringify(responsesSame) === JSON.stringify(localAll), `${tagO} same device: every answer is exactly the device's own`);
      const { enabled: enabledSame, graded: gradedSame } = await submitAndRead(pageSame);
      check(enabledSame && sameGrade(gradedSame, gradedA), `${tagO} same device: graded exactly as before`, JSON.stringify({ a: gradedA?.partialCreditPercent, again: gradedSame?.partialCreditPercent }));
      await contextSame.close();

      /* DEVICE B: nothing but the server copy. */
      const contextB = await browser.newContext({ viewport: VIEWPORT });
      await contextB.addInitScript((doc) => { window.__mmServerSeed = doc; }, server);
      const { page: pageB } = await openPage(contextB, q, role, run, `&restore=${RESTORE}`);
      await pageB.waitForTimeout(RESTORE === 'after' ? 1200 : 300);
      const restoredB = await pageB.evaluate(() => window.__mmRestore.restored);
      check(restoredB > 0, `${tagO} B: the server copy is restored`, String(restoredB));
      const notice = pageB.locator('[aria-label="Work brought back from another device"]');
      if (spec.stacked) {
        // Every step is on the page, so the graph step's workspace mounted with
        // it and has already worked its verdict out again: nothing to open.
        check(!(await notice.isVisible().catch(() => false)), `${tagO} B: stacked, there is nothing to open`);
      } else {
        const awaiting = await localGraph(pageB, spec.graphStage);
        check(awaiting?.rederiveOnOpen === true && !('isCorrect' in (awaiting || {})), `${tagO} B: the graph step came back without a verdict`);
        const [answeredB, totalB] = await progress(pageB);
        check(totalB > 0 && answeredB === totalB - 1, `${tagO} B: every other step's answer came back`, `${answeredB} of ${totalB}`);
        check(!(await submitButton(pageB).isEnabled()), `${tagO} B: the question cannot be submitted before the graph step is opened`);
        const pending = await pageB.evaluate((id) => window.__mm.gradeLocal().parts.find((part) => part.id === id), spec.graphStage);
        check(pending?.graded === false && pending?.isComplete === false, `${tagO} B: the graph step is not graded (in particular not graded wrong) until it is opened`, JSON.stringify({ graded: pending?.graded, isCorrect: pending?.isCorrect }));
        const noticeShown = await notice.isVisible().catch(() => false);
        const opener = notice.getByRole('button', { name: new RegExp(`^Open Step ${spec.graphStep}:`) });
        check(noticeShown && (await opener.count()) === 1, `${tagO} B: the student is told which step to open`, noticeShown ? '' : '(no notice)');
        if (await opener.count()) await opener.click();
        else await pageB.getByRole('button', { name: new RegExp(`^Step ${spec.graphStep}:`) }).click();
        await pageB.waitForTimeout(900);
      }

      const rederived = await localGraph(pageB, spec.graphStage);
      check(JSON.stringify(rederived) === JSON.stringify(graphOnA), `${tagO} B: opening the step brings back the device's exact graph answer, verdict re-derived`, JSON.stringify({ isComplete: rederived?.isComplete, isCorrect: rederived?.isCorrect, same: JSON.stringify(rederived) === JSON.stringify(graphOnA) }));
      const constructionsB = await constructions(pageB);
      check(JSON.stringify(constructionsB) === JSON.stringify(constructionsA), `${tagO} B: the plotting workspace has the student's construction back (points, curve, markers)`, Object.keys(constructionsB).join(','));
      const readoutsB = await pointReadouts(pageB);
      // A step closed by a later one shows no workspace once its answer is back
      // (the closed note is what shows it re-derived and closed again); a curve
      // that snapped hides its point cards. Where the cards show, they read the same.
      const closedAgain = /This step is closed/.test(await bodyText(pageB));
      check(closedAgain || JSON.stringify(readoutsB) === JSON.stringify(readoutsA), `${tagO} B: the plotted points read as the student left them`, `${readoutsA.join(' ') || '(no cards shown)'} -> ${closedAgain ? '(closed again)' : readoutsB.join(' ') || '(no cards shown)'}`);
      check(!(await notice.isVisible().catch(() => false)), `${tagO} B: the notice is gone once the step is back`);
      // Bringing the step back is the workspace reporting work the student did
      // on A, not an edit (PQ-044): the answers keep the time they came back
      // with, and the server copy is still exactly A's.
      const responsesB = await pageB.evaluate(() => window.__mm.local()[':workflow-responses'] || null);
      await pageB.evaluate(() => window.__mm.flush());
      await pageB.waitForTimeout(400);
      const serverB = await serverResponses(pageB);
      check(responsesB?.savedAt === stored?.savedAt && serverB?.savedAt === stored?.savedAt && serverB?.valueJson === stored?.valueJson,
        `${tagO} B: bringing the step back is not an edit — the answers keep A's time and the server copy is A's`,
        JSON.stringify({ a: stored?.savedAt, local: responsesB?.savedAt, server: serverB?.savedAt }));
      const [answeredAfter, totalAfter] = await progress(pageB);
      check(answeredAfter === totalAfter, `${tagO} B: every step answered again`, `${answeredAfter} of ${totalAfter}`);
      const undo = await workflowUndo(pageB);
      check(!undo.present || undo.disabled, `${tagO} B: getting the verdict back is not an Undo step`, JSON.stringify(undo));
      const { enabled: enabledB, graded: gradedB } = await submitAndRead(pageB);
      check(enabledB && sameGrade(gradedB, gradedA), `${tagO} B: graded exactly as on device A`, JSON.stringify({ a: { isCorrect: gradedA?.isCorrect, partial: gradedA?.partialCreditPercent }, b: { isCorrect: gradedB?.isCorrect, partial: gradedB?.partialCreditPercent } }));
      await contextB.close();
    }
  }
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} composed draft restore failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\ncomposed draft restore: every answer reaches the server copy without a verdict, and comes back graded as before.');

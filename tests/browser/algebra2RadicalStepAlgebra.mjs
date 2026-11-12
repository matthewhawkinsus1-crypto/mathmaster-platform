// ALGEBRA II HONORS · SOLVING RADICAL EQUATIONS (STEP ALGEBRA) — SOLVED, GRADED AND REPLAYED AS A STUDENT DOES.
//
//   npx vite --host 127.0.0.1 --port 5197 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/algebra2RadicalStepAlgebra.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome> when the defaults are not installed.)
//
// The lesson is compiled through the teacher import chain by algebra2RadicalStepAlgebraMain.jsx and
// mounted in the real QuestionEngine (no Firebase), on a Chromebook-sized screen (1366x768). Each
// journey solves an item ONLY through the workspace's controls (radicalStepAlgebraDriver.mjs), submits
// through the host's Submit, and then does what the platform does with the work:
//
//   - the app's own tool response is graded by the SERVER's grader (gradeServerResponse) and must give
//     the verdict, score and parts the browser showed;
//   - every step the workspace reported (its raw stepWork) is replayed through the server's step
//     verifier (verifyStepAlgebraStep), in order, on a growing record, and each must be verified and
//     earn the credit the workspace reported.
//
// Journeys:
//   lesson     every question opens; the nine converted ones open the relation workspace with the tools
//   examples   the lesson's own items solved: x = 5 (0 rejected), x = 2 (1/4 rejected), h = 24, ...
//   shapes     a cube root, a repeated root, two genuine solutions, no real solution (every candidate
//              fails), and the structural "no real solution"
//   variants   generated versions of the four family items (Practice 1-2, DOL 1 and 3)
//   misses     keeping the extraneous candidate, skipping the checks, a false no-solution claim, a
//              wrong power: refused or marked wrong, never credited
//   resume     leave mid-solve, reload, and continue from the saved draft; no write per keystroke
//   undo       Undo withdraws the checks and the final set that rested on the step taken back
//   regression an absolute-value item: no radical tool, its own stage, its own saved choices and grade
//   dol        a DOL item reveals no verdict and no hint after Submit
//
// Exit code 1 on any finding. Screenshots and report.json: tests/browser/artifacts/algebra2RadicalStepAlgebra/ (git-ignored).

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { emptyQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { normalizeStepWork } from '../../functions/shared/submissionEnvelope.mjs';
import { verifyStepAlgebraStep } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { relationSourceFromQuestion } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { parseRadicalEquation, solveRadicalShape } from '../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';
import {
  activateBranch, branchBalanced, branchCancel, checkCandidates, claimNoSolution, fillAria, isolateRadical, openTool, raiseBothSides, recordSolutionSet,
  relationState, relationStatus, settle, shapeOnScreen, solveRadical, solveQuadratic, submitAnswer,
} from './radicalStepAlgebraDriver.mjs';
import { rewriteSide, setMathField } from './relationWorkspaceDriver.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5197';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/algebra2RadicalStepAlgebra');
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;
const { chromium } = await import(PLAYWRIGHT_MODULE);

const CHROMEBOOK = { width: 1366, height: 768 };
const VERBOSE = process.env.VERBOSE === '1';
const findings = [];
const report = [];
let journeyName = '';
const check = (value, message) => {
  if (!value) findings.push(`[${journeyName}] ${message}`);
  return Boolean(value);
};
const log = (message) => { if (VERBOSE) console.log(`    ${message}`); };

mkdirSync(ARTIFACTS, { recursive: true });

const newPage = async (browser, viewport = CHROMEBOOK) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  page.on('response', (response) => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  return { context, page, errors };
};

const open = async (page, run, id) => {
  await page.goto(`${ORIGIN}/tests/browser/algebra2RadicalStepAlgebra.html?run=${run}&q=${id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__radical), null, { timeout: 30000 });
  await page.waitForSelector(`[data-question-id="${id}"]`, { timeout: 20000 });
  await settle(page, 1200);
};

// --- What the server makes of the work the app reported --------------------------------------------

const replaySteps = async (page, id, generated) => {
  const reported = (await page.evaluate(() => window.__radical.steps())).filter((entry) => entry.questionId === id);
  let record = emptyQuestionRecord();
  const problems = [];
  reported.forEach(({ payload }, index) => {
    const stepWork = JSON.parse(JSON.stringify(normalizeStepWork(payload.stepWork)));
    const outcome = verifyStepAlgebraStep({ question: generated, record, stepWork });
    if (!outcome.eligible) { problems.push(`step ${index + 1} (${payload.stepGrade?.label}) not eligible: ${outcome.reason}`); return; }
    if (!outcome.verified) { problems.push(`step ${index + 1} (${payload.stepGrade?.label}) NOT verified: ${outcome.reason}`); return; }
    if (JSON.stringify(outcome.stepGrade) !== JSON.stringify(payload.stepGrade)) {
      problems.push(`step ${index + 1} (${payload.stepGrade?.label}): server credit ${JSON.stringify(outcome.stepGrade)} != workspace ${JSON.stringify(payload.stepGrade)}`);
    }
    record = recordQuestionStep({
      record, stepGrade: outcome.stepGrade, countsAttempt: outcome.countsAttempt, statePatch: outcome.statePatch, maximumAttempts: 3, occurredAt: Date.parse('2026-11-12T15:00:00Z'),
    }).record;
  });
  return { steps: reported.length, kinds: reported.map(({ payload }) => payload.stepWork?.kind || payload.stepGrade?.kind), problems };
};

const serverAgrees = async (page, id, label) => {
  const generated = await page.evaluate((questionId) => window.__radical.generated(questionId), id);
  const grades = (await page.evaluate(() => window.__radical.grades())).filter((grade) => grade.questionId === id);
  const last = grades[grades.length - 1];
  if (!check(last, `${label}: the app reported a graded attempt`)) return null;
  check(last.toolResponse, `${label}: the attempt carried its tool response`);
  const server = gradeServerResponse({ question: generated, response: last.toolResponse });
  check(server.graded === true, `${label}: the server graded it (${server.reason})`);
  check(server.isCorrect === last.isCorrect, `${label}: server verdict ${server.isCorrect} == browser verdict ${last.isCorrect}`);
  const browserCredit = last.partialCreditPercent;
  check(Math.round((server.score || 0) * 100) === (last.isCorrect ? 100 : browserCredit), `${label}: server score ${server.score} == browser credit ${browserCredit}`);
  check(JSON.stringify(server.parts.map((part) => [part.id, part.isCorrect])) === JSON.stringify((last.parts || []).map((part) => [part.id, part.isCorrect])), `${label}: server parts match the browser's`);
  const replay = await replaySteps(page, id, generated);
  check(replay.problems.length === 0, `${label}: every reported step verifies on the server (${replay.problems.join('; ')})`);
  return { generated, last, server, replay };
};

// --- A solve, graded -------------------------------------------------------------------------------------

const solveAndSubmit = async (browser, { id, run, expectCorrect = true, variable = 'x', label = id, solve = {}, screenshot = false }) => {
  const { context, page, errors } = await newPage(browser);
  try {
    await open(page, run, id);
    const solved = await solveRadical(page, { variable, log, ...solve });
    check(await submitAvailable(page), `${label}: Submit is available once every stage is recorded`);
    await submitAnswer(page);
    const result = await serverAgrees(page, id, label);
    if (result) check(result.last.isCorrect === expectCorrect, `${label}: the attempt is ${expectCorrect ? 'correct' : 'marked wrong'} (browser said ${result.last.isCorrect})`);
    const kinds = result?.replay.kinds || [];
    if (screenshot) await page.screenshot({ path: path.join(ARTIFACTS, `${label}.png`), fullPage: true });
    check(errors.length === 0, `${label}: no page or console errors (${errors.slice(0, 2).join(' | ')})`);
    report.push({ journey: journeyName, label, id, correct: result?.last.isCorrect ?? null, steps: result?.replay.steps ?? 0, kinds: [...new Set(kinds)], equation: relationSourceFromQuestion(result?.generated || {}) });
    return { page, result, solved };
  } finally {
    await context.close();
  }
};

// The host renders Submit only once the answer is complete; before that there is no button to press.
const submitAvailable = async (page) => {
  const button = page.locator('button:visible', { hasText: /^Submit/ }).first();
  return (await button.count()) > 0 && await button.isEnabled();
};
// A saved relation draft: the workspace's own record sits under `value`.
const savedDraft = async (page) => Object.entries(await page.evaluate(() => window.__radical.drafts())).find(([key]) => key.endsWith(':multi-relation'))?.[1]?.value;

const journeys = {};

journeys.examples = async (browser) => {
  const items = [
    ['srh-cw-1', 'x', 'x = 5 (x = 0 rejected)'],
    ['srh-cw-2', 'x', 'x = 2 (x = 1/4 rejected)'],
    ['srh-cw-9', 'h', 'h = 24'],
    ['srh-p-3', 'x', 'x = 5 (0 rejected)'],
    ['srh-p-4', 'x', 'x = 1 (-1/9 rejected)'],
  ];
  for (const [id, variable, label] of items) {
    await solveAndSubmit(browser, { id, run: `ex-${id}-${Date.now()}`, variable, label: `${id} ${label}`, screenshot: id === 'srh-cw-1' });
  }
};


journeys.shapes = async (browser) => {
  // A cube root, a repeated root, two genuine solutions, and no real solution.
  await solveAndSubmit(browser, { id: 'qa-cube', run: `shape-cube-${Date.now()}`, label: 'cube root: x = 14' });
  await solveAndSubmit(browser, { id: 'qa-repeated', run: `shape-rep-${Date.now()}`, label: 'repeated root: x = 2 once' });
  await solveAndSubmit(browser, { id: 'qa-two', run: `shape-two-${Date.now()}`, label: 'two genuine solutions: x = 2 and x = 3' });
  // Every candidate fails: the checks are owed, and "no real solution" is the finished answer.
  const none = await solveAndSubmit(browser, { id: 'qa-none', run: `shape-none-${Date.now()}`, label: 'no real solution: both candidates fail' });
  check(none.result?.server.parts.find((part) => part.id === 'solution-set')?.response === 'no real solution', 'qa-none: the final set recorded is "no real solution"');
  // The structural one, both ways.
  await solveAndSubmit(browser, { id: 'qa-structural', run: `shape-struct-long-${Date.now()}`, label: 'structural no real solution, the long way (candidate 8 rejected)' });
  const { context, page, errors } = await newPage(browser);
  try {
    await open(page, `shape-struct-short-${Date.now()}`, 'qa-structural');
    check(!(await submitAvailable(page)), 'structural: Submit is not available before anything is done');
    await claimNoSolution(page, log);
    check(/No solution/i.test(await relationState(page)), `structural: the claim is accepted (${await relationState(page)})`);
    check(await submitAvailable(page), 'structural: Submit is available once the claim stands');
    await submitAnswer(page);
    const result = await serverAgrees(page, 'qa-structural', 'structural shortcut');
    check(result?.last.isCorrect === true, 'structural: "no real solution" decided by structure is correct');
    check(JSON.stringify(result?.server.parts.map((part) => part.id)) === JSON.stringify(['relation-work']), 'structural: no candidate checks are owed when there is no candidate');
    check(errors.length === 0, `structural: no page errors (${errors.join(' | ')})`);
    report.push({ journey: journeyName, label: 'structural shortcut', id: 'qa-structural', correct: result?.last.isCorrect, steps: result?.replay.steps, kinds: [...new Set(result?.replay.kinds || [])], equation: 'sqrt(x + 1) = -3' });
  } finally {
    await context.close();
  }
};

// Generated versions of the four family items, each student a different one.
const FAMILY_ITEMS = [
  { id: 'srh-p-1', want: [2] },
  { id: 'srh-p-2', want: [4, 5] },
  { id: 'srh-dol-1', want: [2] },
  { id: 'srh-dol-3', want: [3, 4, 5] },
];
journeys.variants = async (browser) => {
  for (const { id, want } of FAMILY_ITEMS) {
    const seen = new Set();
    for (let attempt = 0; attempt < 14 && !want.every((index) => seen.has(index)); attempt += 1) {
      const run = `var-${id}-${attempt}`;
      // Read this student's version first, to pick runs that cover every root index.
      const probe = await newPage(browser);
      let index = null;
      try {
        await open(probe.page, run, id);
        const generated = await probe.page.evaluate((questionId) => window.__radical.generated(questionId), id);
        const parsed = parseRadicalEquation(relationSourceFromQuestion(generated), { variable: generated.solveFor });
        check(parsed.ok && solveRadicalShape(parsed.shape).ok, `${id}/${run}: the generated equation is one the workspace verifies (${relationSourceFromQuestion(generated)})`);
        index = parsed.ok ? parsed.shape.index : null;
      } finally {
        await probe.context.close();
      }
      if (index === null || (seen.has(index) && attempt >= 2 && want.some((wanted) => !seen.has(wanted)))) continue;
      seen.add(index);
      await solveAndSubmit(browser, { id, run, label: `${id} variant ${attempt} (index ${index})` });
    }
    check(want.every((index) => seen.has(index)), `${id}: solved a version for every root index ${want.join(', ')} (saw ${[...seen].join(', ')})`);
  }
};

journeys.misses = async (browser) => {
  // Keeping the extraneous candidate: right algebra, wrong decision, wrong set.
  await solveAndSubmit(browser, {
    id: 'srh-cw-1', run: `miss-keep-${Date.now()}`, expectCorrect: false, label: 'kept x = 0 as valid',
    solve: { decide: () => 'valid', setValues: ['0', '5'] },
  });
  // Right decisions, but a final set that still lists the rejected value.
  await solveAndSubmit(browser, {
    id: 'srh-cw-2', run: `miss-set-${Date.now()}`, expectCorrect: false, label: 'listed the rejected x = 1/4 in the solution set',
    solve: { setValues: ['1/4', '2'] },
  });
  // "No real solution" where x = 5 holds.
  await solveAndSubmit(browser, {
    id: 'srh-cw-1', run: `miss-none-${Date.now()}`, expectCorrect: false, label: 'false "no real solution"',
    solve: { setValues: [] },
  });

  const { context, page, errors } = await newPage(browser);
  try {
    await open(page, `miss-ui-${Date.now()}`, 'srh-cw-1');
    const stepCount = async () => (await page.evaluate(() => window.__radical.steps())).length;
    // A false no-solution claim is refused with a sentence and changes nothing.
    await claimNoSolution(page, log);
    const claimNote = await relationStatus(page);
    check(/not justified/i.test(claimNote), `a false "No solution" claim is refused in words (${claimNote.slice(0, 90)})`);
    check(!/No solution/i.test(await relationState(page)), 'the false claim did not change the relation');
    check((await stepCount()) === 0, 'the refused claim recorded no step');

    // Raising before the radical is alone, and to a power that does not match the root.
    await openTool(page, 'raisePower');
    await page.locator('[data-relation-tool="raisePower"] button', { hasText: /^Square$/ }).click();
    await fillAria(page, 'Left side after raising to the power', 'x+4');
    await fillAria(page, 'Right side after raising to the power', 'x^2');
    await page.locator('button:visible', { hasText: 'Check and apply' }).click();
    await settle(page, 600);
    check(/Isolate the radical/i.test(await relationStatus(page)), `raising before isolating is refused in words (${(await relationStatus(page)).slice(0, 90)})`);
    check((await stepCount()) === 0, 'the refused raise recorded no step');
    await page.locator('button:visible', { hasText: /^Cancel$/ }).first().click();

    const shape = await shapeOnScreen(page);
    await isolateRadical(page, shape, log);
    const before = await stepCount();
    await openTool(page, 'raisePower');
    await page.locator('[data-relation-tool="raisePower"] button', { hasText: /^Cube$/ }).click();
    await fillAria(page, 'Left side after raising to the power', 'x+4');
    await fillAria(page, 'Right side after raising to the power', 'x^3');
    await page.locator('button:visible', { hasText: 'Check and apply' }).click();
    await settle(page, 600);
    check(/power that matches/i.test(await relationStatus(page)), `a power that does not undo the root is refused in words (${(await relationStatus(page)).slice(0, 90)})`);
    await page.locator('[data-relation-tool="raisePower"] button', { hasText: /^Square$/ }).click();
    await fillAria(page, 'Right side after raising to the power', 'x^2+4');
    await page.locator('button:visible', { hasText: 'Check and apply' }).click();
    await settle(page, 600);
    check(/did not preserve/i.test(await relationStatus(page)), 'a wrong resulting line is refused in words');
    check((await stepCount()) === before, 'neither refused raise recorded a step');

    // Work that is not finished cannot be submitted, and the later stages are not there to skip to.
    await page.locator('button:visible', { hasText: /^Cancel$/ }).first().click();
    check(!(await submitAvailable(page)), 'Submit is not available before the candidates are checked');
    check((await page.locator('.radical-candidate-verification').count()) === 0, 'the candidate stage is not offered before the algebra is done');
    check((await page.locator('.radical-solution-set').count()) === 0, 'the final solution set is not offered before the candidates are checked');
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  } finally {
    await context.close();
  }
};

journeys.resume = async (browser) => {
  const run = `resume-${Date.now()}`;
  const { context, page, errors } = await newPage(browser);
  try {
    await open(page, run, 'srh-cw-2');
    const shape = await shapeOnScreen(page);
    const expected = solveRadicalShape(shape);
    await isolateRadical(page, shape, log);
    await raiseBothSides(page, shape, log);
    await solveQuadratic(page, shape, expected, log);
    const solvedState = await relationState(page);
    check(/x = (1 ?\/ ?4|0\.25)/.test(solvedState) && /x = 2/.test(solvedState), `solved to the two candidates (${solvedState})`);
    // Record ONE check, then leave.
    const card = page.locator('.radical-candidate-check[data-candidate="1/4"]');
    await card.scrollIntoViewIfNeeded();
    await setMathField(page, card.locator('math-field').nth(0), '1/2');
    await setMathField(page, card.locator('math-field').nth(1), '-1/2');
    await card.locator('button', { hasText: 'Extraneous' }).click();
    await card.locator('button', { hasText: 'Record this check' }).click();
    await settle(page, 600);

    // No write per keystroke: typing into a check field changes nothing that is saved.
    const writes = await page.evaluate(() => {
      window.__draftWrites = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(key, value) { if (String(key).includes('multi-relation')) window.__draftWrites += 1; return original.call(this, key, value); };
      return true;
    });
    void writes;
    const other = page.locator('.radical-candidate-check[data-candidate="2"]');
    await other.scrollIntoViewIfNeeded();
    for (const text of ['3', '3']) await other.locator('math-field').nth(text === '3' ? 0 : 1).evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, text);
    await settle(page, 500);
    check((await page.evaluate(() => window.__draftWrites)) === 0, 'typing into a candidate field writes nothing to the draft (no per-keystroke save)');

    // Reload as a returning student: the algebra and the recorded check come back.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__radical), null, { timeout: 30000 });
    await page.waitForSelector('[data-question-id="srh-cw-2"]');
    await settle(page, 1500);
    check((await relationState(page)) === solvedState, `the solved relation comes back after a reload (${await relationState(page)})`);
    const restored = page.locator('.radical-candidate-check[data-candidate="1/4"]');
    await restored.scrollIntoViewIfNeeded();
    check(/Extraneous/.test(await restored.innerText()) && /Change/.test(await restored.innerText()), 'the recorded check for 1/4 comes back recorded');
    check(/Record this check/.test(await page.locator('.radical-candidate-check[data-candidate="2"]').innerText()), 'the unrecorded candidate comes back open, never recorded for the student');

    // Finish from where they left off.
    await checkCandidates(page, { ...shape }, { candidates: expected.candidates.filter((candidate) => candidate.n === 2 && candidate.d === 1), genuine: expected.genuine }, log);
    check((await page.locator('.radical-solution-set').count()) === 1, 'the solution set is offered once every candidate is recorded');
    await recordSolutionSet(page, ['2'], log);

    // The saved draft holds the recorded check and the final set, and nothing typed toward them.
    const draft = await savedDraft(page);
    check(draft && draft.solutionSet?.values?.[0] === '2', `the recorded final set is in the saved draft (${JSON.stringify(draft?.solutionSet)})`);
    check(draft && Object.keys(draft.candidateChecks || {}).length === 2, 'both recorded checks are in the saved draft');
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  } finally {
    await context.close();
  }
};

journeys.undo = async (browser) => {
  // Undo, in the session that took the steps: it takes back the last step and everything that rested on it.
  const { context, page, errors } = await newPage(browser);
  try {
    await open(page, `undo-${Date.now()}`, 'srh-cw-1');
    const { shape, expected } = await solveRadical(page, { log });
    const solvedState = await relationState(page);
    check((await page.locator('.radical-solution-set [data-solution-set-recorded]').count()) === 1, 'the final solution set is recorded');
    const undo = page.locator('button:visible', { hasText: /Undo/ }).first();
    check(await undo.isEnabled(), 'Undo is available in the session that took the steps');
    await undo.click();
    await settle(page, 800);
    check((await page.locator('.radical-solution-set').count()) === 0, 'Undo withdrew the final solution set, which rested on the checks');
    // The relation after the last (cosmetic) step is still solved, so the stage stays — with every check withdrawn.
    check((await page.locator('.radical-candidate-check [data-candidate-choice]').count()) === 0, 'Undo withdrew every recorded candidate check');
    check((await page.locator('.radical-candidate-check button', { hasText: 'Record this check' }).count()) === expected.candidates.length, 'every candidate is open again, to be checked afresh');
    const afterUndo = await relationState(page);
    check(afterUndo !== solvedState, `the relation went back a step (${solvedState} -> ${afterUndo})`);
    const draft = await savedDraft(page);
    check(draft && Object.keys(draft.candidateChecks || {}).length === 0 && !draft.solutionSet, 'the saved draft no longer holds the withdrawn checks or set');
    // Solving again brings the stage back with nothing carried over: every check is owed again.
    check(!(await submitAvailable(page)), 'Submit is not available again until the checks and the set are recorded again');
    void shape; void expected;
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  } finally {
    await context.close();
  }
};

// What was already on the workspace is untouched: an absolute-value equation gets no radical tool, its own
// Valid / Extraneous stage, the choices it always saved, and the grade it always had.
journeys.regression = async (browser) => {
  const { context, page, errors } = await newPage(browser);
  try {
    const id = 'qa-abs';
    await open(page, `reg-abs-${Date.now()}`, id);
    // The tools row is open by default; open it only if it is not.
    if (!(await page.locator('[data-algebra-tool]:visible').count())) {
      await page.locator('button:visible').filter({ hasText: /^Other operations/ }).first().click();
      await settle(page, 400);
    }
    const tools = await page.locator('[data-algebra-tool]').evaluateAll((els) => els.map((e) => e.getAttribute('data-algebra-tool')));
    check(['squareRoot', 'reverseAbsolute', 'completeSquare', 'noSolution', 'allReals'].every((tool) => tools.includes(tool)), `the five existing tools are still offered (${tools.join(',')})`);
    check(!tools.some((tool) => ['raisePower', 'factor', 'zeroProduct'].includes(tool)), 'an absolute-value item gains no radical tool');

    // Split |x - 2| = 3 as the student writes it.
    await openTool(page, 'reverseAbsolute');
    await page.locator('button:visible', { hasText: 'Two branches (OR)' }).first().click();
    await settle(page, 300);
    await fillAria(page, 'Branch A right-side value', '3');
    await fillAria(page, 'Branch B right-side value', '-3');
    await page.locator('button:visible', { hasText: 'Check split' }).first().click();
    await settle(page, 900);
    check(/x - 2 = 3 OR x - 2 = -3/.test(await relationState(page)), `the split is accepted (${await relationState(page)})`);
    // Each branch: add 2, cancel, tidy.
    for (const [index, value] of [[0, '5'], [1, '-1']]) {
      if (index > 0) await activateBranch(page, index);
      await branchBalanced(page, index, 'add', '2');
      await branchCancel(page, index, 'left', 1, 2);
      await rewriteSide(page, 'right', value, () => {});
    }
    check(/x = 5 OR x = -1/.test(await relationState(page)), `solved (${await relationState(page)})`);
    await settle(page, 600);
    check((await page.locator('.absolute-candidate-verification').count()) === 1, 'the absolute-value stage is the one students always had');
    check((await page.locator('.radical-candidate-verification').count()) === 0 && (await page.locator('.radical-solution-set').count()) === 0, 'no radical stage appears');
    const valid = page.locator('.absolute-candidate-verification button', { hasText: 'Valid solution' });
    check((await valid.count()) === 2, 'a Valid / Extraneous choice for each candidate');
    check((await page.locator('.absolute-candidate-verification math-field').count()) === 0, 'no side values are asked for');
    await valid.nth(0).click();
    await valid.nth(1).click();
    await settle(page, 500);
    const draft = await savedDraft(page);
    check(JSON.stringify(draft?.candidateChecks) === JSON.stringify({ 5: 'valid', '-1': 'valid' }), `the choices are saved as they always were (${JSON.stringify(draft?.candidateChecks)})`);
    check(!('solutionSet' in (draft?.solutionSet ? { solutionSet: 1 } : {})), 'no final solution set is asked for or saved');
    check(await submitAvailable(page), 'Submit is available once both candidates are decided');
    await submitAnswer(page);
    const result = await serverAgrees(page, id, 'absolute value regression');
    check(result?.last.isCorrect === true, 'the absolute-value answer is graded correct');
    check(JSON.stringify(result?.server.parts.map((part) => part.id)) === JSON.stringify(['relation-work', 'candidate-verification']), `the same parts as before (${JSON.stringify(result?.server.parts.map((part) => part.id))})`);
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  } finally {
    await context.close();
  }
};

journeys.dol = async (browser) => {
  const { context, page, errors } = await newPage(browser);
  try {
    const id = 'srh-dol-1';
    // Where the verdict is withheld the workspace coaches nothing after a step: raising both
    // sides says only that the step was recorded, not what to do about candidates.
    const stepNotes = await newPage(browser);
    try {
      await open(stepNotes.page, `dol-notes-${Date.now()}`, id);
      const shape = await shapeOnScreen(stepNotes.page, 'x');
      await isolateRadical(stepNotes.page, shape, log);
      await raiseBothSides(stepNotes.page, shape, log);
      const notes = await stepNotes.page.locator('[role="status"]').allInnerTexts();
      check(notes.some((text) => /Step recorded/.test(text)), `a DOL records the raise without coaching (${JSON.stringify(notes)})`);
      check(!notes.some((text) => /candidate/i.test(text)), 'a DOL says nothing about candidates after raising both sides');
    } finally {
      await stepNotes.context.close();
    }
    await open(page, `dol-${Date.now()}`, id);
    await solveRadical(page, { log });
    await submitAnswer(page);
    const text = await page.evaluate(() => document.body.innerText);
    check(!/\bcorrect\b|incorrect|not quite|Verified solution|Verified: no real/i.test(text), 'a DOL shows no verdict after Submit');
    check(!/Step credit/i.test(text), 'a DOL shows no running step credit');
    check((await page.locator('button:visible', { hasText: /Show a hint|^Hint$/ }).count()) === 0, 'a DOL offers no hint');
    const result = await serverAgrees(page, id, 'DOL 1');
    check(result?.last.isCorrect === true, 'the DOL answer is graded correct on the server');
    check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  } finally {
    await context.close();
  }
};

journeys.lesson = async (browser) => {
  for (const [name, viewport] of [['chromebook-1366', CHROMEBOOK], ['chromebook-1280', { width: 1280, height: 720 }]]) {
    const { context, page, errors } = await newPage(browser, viewport);
    try {
      await open(page, `lesson-${name}-${Date.now()}`, 'srh-wu-1');
      const preflight = await page.evaluate(() => window.__radical.preflight());
      check(preflight.isValid && preflight.errors.length === 0, `${name}: Pre-Flight in the browser is valid`);
      const ids = await page.evaluate(() => window.__radical.ids());
      const converted = new Set(['srh-cw-1', 'srh-cw-2', 'srh-cw-9', 'srh-p-1', 'srh-p-2', 'srh-p-3', 'srh-p-4', 'srh-dol-1', 'srh-dol-3', 'qa-cube', 'qa-repeated', 'qa-two', 'qa-none', 'qa-structural']);
      for (const id of ids) {
        await page.evaluate((questionId) => window.__radical.go(questionId), id);
        await page.waitForSelector(`[data-question-id="${id}"]`, { timeout: 15000 });
        await settle(page, 700);
        const state = await page.evaluate(() => {
          const scroller = document.scrollingElement || document.documentElement;
          const text = document.body.innerText || '';
          return {
            overflow: scroller.scrollWidth - window.innerWidth,
            crashed: /something went wrong|could not load this question|error boundary/i.test(text),
            relation: Boolean(document.querySelector('[data-math-state]')),
            tools: [...document.querySelectorAll('[data-algebra-tool]')].map((element) => element.getAttribute('data-algebra-tool')),
          };
        });
        check(!state.crashed, `${name}/${id}: opens without an error card`);
        check(state.overflow <= 1, `${name}/${id}: no sideways scroll (${state.overflow}px)`);
        if (converted.has(id)) {
          check(state.relation, `${name}/${id}: opens the Step Algebra relation workspace`);
          check(['raisePower', 'factor', 'zeroProduct'].every((tool) => state.tools.includes(tool)), `${name}/${id}: offers Raise, Factor and Zero-product (${state.tools.join(',')})`);
        } else if (['srh-cw-3', 'srh-cw-10', 'srh-p-7', 'srh-wu-1', 'srh-dol-2', 'qa-abs'].includes(id)) {
          check(!state.tools.includes('raisePower'), `${name}/${id}: an item that is not a radical equation gains no radical tool`);
        }
      }
      check(errors.length === 0, `${name}: no page or console errors across the lesson (${errors.slice(0, 3).join(' | ')})`);
    } finally {
      await context.close();
    }
  }
};

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(journeys);
const browser = await chromium.launch(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {});
try {
  for (const name of selected) {
    if (!journeys[name]) { console.error(`unknown journey: ${name}`); process.exitCode = 2; continue; }
    journeyName = name;
    const started = Date.now();
    const before = findings.length;
    await journeys[name](browser);
    console.log(`${findings.length === before ? 'ok  ' : 'FAIL'} ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ at: new Date().toISOString(), findings, report }, null, 2));
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}
console.log(`\nno findings; ${report.length} solves reported`);

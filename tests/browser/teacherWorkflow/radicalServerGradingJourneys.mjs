// A RADICAL SOLVE, GRADED BY THE SERVER AS THE BROWSER SHOWS IT — IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/radicalServerGradingJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768.)
//
// #548 solves single-radical equations on Step Algebra's relation workspace,
// with every step and the final answer judged on the server. Its own journeys
// (tests/browser/algebra2RadicalStepAlgebra.mjs) mount QuestionEngine alone and
// re-grade the app's response in node. What they cannot see is the real App's
// way to the server: the envelopes App.jsx builds for a step (its raw work) and
// for an answer (its raw tool response), the device queue that delivers them,
// and the shared ingestion (functions/shared/submissionIngestion.mjs) that
// credits a step from its raw work and marks an answer from its raw response,
// against the question as the teacher's import stored it.
//
// Here today's lesson is the Algebra II Honors radical lesson, compiled by the
// teacher import chain (`?questions=radicals`, lessonFixtures.js), and the
// harness's server (`&server=1`, fakeServer.js) ingests what the App sends,
// around the same shared modules functions/index.js calls. Every envelope is
// set beside what the server made of it: the browser's own record of the work
// travels in the envelope, and the server's record is read back from the store
// (fakeServer.js `deliveries`).
//
//   R1  An honest solve of Classwork 1, √(x + 4) + 2 = x, through the
//       workspace's controls only: isolate the radical, square both sides,
//       standard form, Factor, Zero-product, each branch, both candidates
//       checked in the original equation (0 extraneous, 5 valid), the set {5},
//       Submit. Every step and the answer are accepted and marked by the
//       server itself (gradedBy server, no fallback reason). Each step,
//       Raise, Factor and Zero-product among them, is verified from its raw
//       work with the credit the browser gave it; the "Step credit" the
//       workspace shows is the server's; the answer is correct part for part,
//       as the browser said, and the screen says so.
//   R2  The extraneous root kept: the same algebra, 0 checked "valid" and the
//       set {0, 5}. The browser marks it wrong with partial credit; the server
//       records the same verdict, parts, credit and tries, and the screen's
//       "Not quite … Focus on:" names exactly the parts the server marked wrong.
//
// Exit code 1 on any finding. Screenshots and report.json (what each side
// said) in tests/browser/artifacts/radicalServerGrading/ (git-ignored).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';
import { relationState, settle, solveRadical, submitAnswer } from '../radicalStepAlgebraDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/radicalServerGrading');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

// fixture.js: today's lesson, given to Algebra II Period 3 (not imported:
// fixture.js pulls in the app's browser modules).
const ASSIGNMENT = 'a-today';
const QUESTION_ID = 'srh-cw-1';
const HONEST = '910002';
const KEEPS_ZERO = '910003';
// The radical lesson, the harness's server, and a period well under way (the
// Warm-Up closed), as the other real-lesson journeys open it.
const SCENARIO = 'questions=radicals&server=1&p3StartMin=40';
// The radical tools' steps: each must reach the server with its raw work and
// be verified there (submissionEnvelope.mjs reads only the kinds it names).
const RADICAL_TRANSITIONS = ['radicalRaise', 'factor', 'zeroProduct'];
// Not simulated by the harness (fakeFunctions.js): a projection repair the
// student's Home asks for. Nothing here depends on it.
const NOT_SIMULATED = new Set(['reconcileAssignmentActivityProjection']);

const findings = [];
const passed = [];
const report = [];
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/* ------------------------------ what each side said ------------------------------ */

// The store's runtime question list, flattened as the server reads it: the
// question's index is where the App and the server file its record.
const questionIndexOf = (page) => page.evaluate(([assignmentId, questionId]) => {
  const assignment = window.__mmHarnessStore.get(`assignments/${assignmentId}`);
  return (assignment?.sections || []).flatMap((section) => section.questions || []).findIndex((question) => question.questionId === questionId);
}, [ASSIGNMENT, QUESTION_ID]);

// Every step and answer the App delivered for this question, with its receipt
// and the record the server held once it was ingested.
const deliveriesFor = (page, studentId, questionIndex) => page.evaluate(({ studentId, assignmentId, questionIndex }) => (
  (window.__mmHarnessServer?.deliveries || [])
    .filter((entry) => entry.studentId === studentId && entry.envelope?.assignmentId === assignmentId && Number(entry.envelope?.questionIndex) === questionIndex)
    .filter((entry) => ['stepSubmission', 'ordinarySubmission'].includes(entry.envelope?.kind))
), { studentId, assignmentId: ASSIGNMENT, questionIndex });

// What a record says about the grade: verdict, credit, tries, the parts and
// every step's credit. Timestamps and delivery bookkeeping are left out.
const grading = (record) => ({
  status: record?.status ?? null,
  partialCredit: Math.round(Number(record?.partialCredit) || 0),
  bestPartialCredit: Math.round(Number(record?.bestPartialCredit) || 0),
  totalAttempts: Number(record?.totalAttempts) || 0,
  parts: (record?.partGrades || []).map((part) => `${part.id}:${part.isCorrect === true}`),
  steps: (record?.stepGrades || []).map((step) => `${step.kind}|${step.label}|${step.earned}/${step.possible}|${step.accepted !== false}`),
});

// The server's side of each delivery against the browser's: accepted, marked by
// the server itself, and graded exactly as the browser graded the same work.
const sameAsTheBrowser = (journey, entries) => {
  entries.forEach((entry, index) => {
    const where = `${entry.envelope.kind} ${index + 1} of ${entries.length}`;
    const server = entry.record;
    expect(journey, entry.receipt?.disposition === 'accepted', `${where}: the server did not accept it (${JSON.stringify(entry.receipt)})`);
    expect(journey, server?.gradedBy === 'server' && server?.submissionOrigin === 'server-ingestion',
      `${where}: the server did not mark it itself (gradedBy ${server?.gradedBy}, origin ${server?.submissionOrigin})`);
    expect(journey, !server?.serverGradingReason, `${where}: the server could not grade it from the work (${server?.serverGradingReason})`);
    const browserSaid = JSON.stringify(grading(entry.envelope.record));
    const serverSaid = JSON.stringify(grading(server));
    expect(journey, browserSaid === serverSaid, `${where}: the server's grade differs from the browser's\n      browser ${browserSaid}\n      server  ${serverSaid}`);
  });
  const steps = entries.filter((entry) => entry.envelope.kind === 'stepSubmission');
  expect(journey, steps.every((entry) => entry.envelope.stepWork), 'a step reached the server without its raw work');
  expect(journey, !steps.some((entry) => (entry.record?.stepGrades || []).some((step) => step.kind === 'unverified-step')), 'the server recorded an unverified step');
  const transitions = steps.map((entry) => entry.envelope.stepWork?.transition?.kind).filter(Boolean);
  expect(journey, RADICAL_TRANSITIONS.every((kind) => transitions.includes(kind)),
    `the server was not handed every radical tool's step (${[...new Set(transitions)].join(', ')})`);
  return transitions;
};

/* ------------------------------------ the page ------------------------------------ */

const openQuestion = async (page, studentId) => {
  await page.goto(`${ORIGIN}/assignments/${ASSIGNMENT}/classwork/1?${SCENARIO}&as=student&studentId=${studentId}`, { timeout: 180_000 });
  await page.locator('[data-math-state]').first().waitFor({ timeout: 90_000 });
  await settle(page, 1500);
};
// "3 of 3 tries left": the tries the question gives, before any is used.
const triesGiven = async (page) => Number((squash(await page.locator('body').innerText()).match(/\d+ of (\d+) tries? left/) || [])[1]) || null;
// The running score the workspace shows beside Start over.
const stepCreditShown = async (page) => {
  const text = squash(await page.locator('text=/Step credit \\d+%/').first().textContent({ timeout: 2_000 }).catch(() => ''));
  return Number((text.match(/Step credit (\d+)%/) || [])[1] ?? NaN);
};
// The verdict line the question shows after Submit (given the time to draw it).
const verdictShown = async (page) => {
  const read = () => [...document.querySelectorAll('[role="status"]')]
    .map((element) => element.innerText.replace(/\s+/g, ' ').trim())
    .find((text) => /^(Correct!|Not quite\.)/.test(text)) || '';
  await page.waitForFunction(read, null, { timeout: 15_000 }).catch(() => {});
  return page.evaluate(read);
};

// Wait until the step credit the workspace shows is the server's for the steps
// it was handed (the device queue delivers them as the student works).
const creditOnBothSides = async (page, studentId, questionIndex, timeout = 30_000) => {
  const deadline = Date.now() + timeout;
  let seen = { shown: NaN, server: null, steps: 0 };
  do {
    const entries = await deliveriesFor(page, studentId, questionIndex);
    seen = { shown: await stepCreditShown(page), server: entries.length ? grading(entries.at(-1).record).bestPartialCredit : null, steps: entries.length };
    if (seen.shown === seen.server) return seen;
    await page.waitForTimeout(250);
  } while (Date.now() < deadline);
  return seen;
};
// Wait until the answer has reached the server: the queue delivers in order, so
// every step is there before it.
const answerDelivered = async (page, studentId, questionIndex, timeout = 30_000) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const entries = await deliveriesFor(page, studentId, questionIndex);
    if (entries.some((entry) => entry.envelope.kind === 'ordinarySubmission') || Date.now() > deadline) return entries;
    await page.waitForTimeout(250);
  }
};

const solveAndSubmit = async ({ page, journey, studentId, tag, solve = {} }) => {
  await openQuestion(page, studentId);
  const questionIndex = await questionIndexOf(page);
  expect(journey, questionIndex >= 0, `${QUESTION_ID} is not in today's lesson`);
  const equation = await relationState(page);
  expect(journey, /sqrt\(x \+ 4\) \+ 2/.test(equation || ''), `Classwork 1 is not √(x + 4) + 2 = x: ${equation}`);
  const tries = await triesGiven(page);
  expect(journey, tries > 0, 'the question does not say how many tries it gives');

  await solveRadical(page, { ...solve });
  const credit = await creditOnBothSides(page, studentId, questionIndex);
  expect(journey, credit.shown === credit.server,
    `the workspace shows "Step credit ${credit.shown}%" where the server holds ${credit.server}% for the ${credit.steps} step(s) it was handed`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${journey.split(' ')[0]}-solved-${tag}.png`) });

  await submitAnswer(page);
  const entries = await answerDelivered(page, studentId, questionIndex);
  const answer = entries.find((entry) => entry.envelope.kind === 'ordinarySubmission');
  expect(journey, answer, 'the answer never reached the server');
  const transitions = sameAsTheBrowser(journey, entries);
  const verdict = await verdictShown(page);
  await page.screenshot({ path: path.join(ARTIFACTS, `${journey.split(' ')[0]}-submitted-${tag}.png`) });
  report.push({
    journey,
    steps: entries.length - (answer ? 1 : 0),
    transitions,
    stepCreditShown: credit.shown,
    verdictShown: verdict,
    browser: grading(answer?.envelope?.record),
    server: grading(answer?.record),
  });
  return { answer, tries, verdict };
};

/* ---------------------------------- the journeys ---------------------------------- */

const run = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const unimplemented = watchUnimplementedCallables(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Seed the school once, with the radical lesson and the server.
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&${SCENARIO}&as=student&studentId=${HONEST}`, { timeout: 180_000 });
  await page.getByText(/Welcome, /).first().waitFor({ timeout: 180_000 });

  // R1: an honest solve, correct on both sides, and on the screen.
  const R1 = `R1 ${tag}`;
  const honest = await solveAndSubmit({ page, journey: R1, studentId: HONEST, tag });
  expect(R1, honest.answer?.envelope?.record?.status === 'correct', `the browser did not mark the honest solve correct: ${honest.answer?.envelope?.record?.status}`);
  expect(R1, honest.answer?.record?.status === 'correct', `the server did not mark the honest solve correct: ${honest.answer?.record?.status}`);
  expect(R1, honest.verdict.startsWith('Correct! This question is complete.'), `the screen does not say the solve is correct: "${honest.verdict}"`);

  // R2: the extraneous root kept, wrong on both sides, with the same credit,
  // and the screen names the parts the server marked wrong.
  await page.getByRole('button', { name: /Log Out/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(1000);
  const R2 = `R2 ${tag}`;
  const kept = await solveAndSubmit({ page, journey: R2, studentId: KEEPS_ZERO, tag, solve: { decide: () => 'valid', setValues: ['0', '5'] } });
  const server = kept.answer?.record;
  expect(R2, kept.answer?.envelope?.record?.status !== 'correct' && server?.status !== 'correct',
    `keeping x = 0 was marked correct (browser ${kept.answer?.envelope?.record?.status}, server ${server?.status})`);
  expect(R2, JSON.stringify(grading(server).parts) === JSON.stringify(['relation-work:true', 'candidate-verification:false', 'solution-set:false']),
    `the server's parts are not "the algebra right, the checks and the set wrong": ${grading(server).parts.join(', ')}`);
  const left = Number((kept.verdict.match(/^Not quite\. You have (\d+) tr(?:y|ies) left\./) || [])[1]);
  expect(R2, left === kept.tries - grading(server).totalAttempts,
    `the screen says ${left} tries left; the server has used ${grading(server).totalAttempts} of ${kept.tries}: "${kept.verdict}"`);
  const focus = squash((kept.verdict.match(/Focus on: (.+?)\.?$/) || [])[1]).split(', ').filter(Boolean);
  const wrongParts = (server?.partGrades || []).filter((part) => part.isCorrect !== true).map((part) => part.label);
  expect(R2, focus.length > 0 && JSON.stringify(focus) === JSON.stringify(wrongParts),
    `the screen's "Focus on" (${focus.join(', ')}) is not the parts the server marked wrong (${wrongParts.join(', ')})`);

  expect(`errors ${tag}`, errors.length === 0, `page errors: ${errors.join(' | ')}`);
  expect(`callables ${tag}`, unimplemented().every((name) => NOT_SIMULATED.has(name)), `unimplemented callables: ${unimplemented().join(', ')}`);
  passed.push(tag);
  await context.close();
};

for (const viewport of VIEWPORTS) {
  try {
    await run(viewport);
  } catch (error) {
    findings.push({ journey: `${viewport.width}x${viewport.height}`, detail: `threw: ${error.stack || error.message}` });
  }
}
await browser.close();
writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ at: new Date().toISOString(), findings, report }, null, 2));

for (const entry of report) {
  console.log(`      ${entry.journey}: ${entry.steps} steps (${[...new Set(entry.transitions)].join(', ')}) and the answer; step credit ${entry.stepCreditShown}%; server ${entry.server.status} ${entry.server.partialCredit}%; "${entry.verdictShown}"`);
}
for (const tag of passed) console.log(`ran   ${tag}`);
for (const { journey, detail } of findings) console.log(`FAIL  ${journey}: ${detail}`);
console.log(findings.length ? `\n${findings.length} finding(s).` : '\nAll radical server-grading journeys passed.');
process.exit(findings.length ? 1 : 0);

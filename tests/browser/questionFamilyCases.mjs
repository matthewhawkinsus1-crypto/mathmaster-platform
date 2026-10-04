// GENERATED SPECIAL CASES, SOLVED IN A REAL BROWSER, RE-GRADED ON THE SERVER PATH.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/questionFamilyCases.mjs [journey ...]
//
// Each journey opens one seated student's version of one Question Family slot
// (questionFamilyCasesSlots.mjs) through the real QuestionEngine, solves it
// with the workspace's own controls — Step Algebra's relation or equation
// workspace, or the Systems Workspace's algebraic mode — and submits. Then,
// in node, the exact response the browser recorded is re-graded the way the
// server's ingestion does: the instance rebuilt from the delivery pin through
// resolveServerGradingQuestion (seat-verified), and marked by
// gradeServerResponse. Browser and server must agree, and both must say what
// the mathematics says.
//
// A generated question is "supported" only if a student can finish it here.
//
// Device profiles (phone 390×844, iPad 820×1180 — touch-capable, mobile —
// and Chromebook 1366×768) run the same journeys; on each, the page must
// never scroll sideways while the student works.
//
// Exit code 1 on any finding. Screenshots and report.json land in
// tests/browser/artifacts/questionFamilyCases/.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { familySlotKey, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { normalizeToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { CASES_CLASS_ID, CASES_STUDENTS, casesAssignment, CASES_SLOTS, slotStorageIndex } from './questionFamilyCasesSlots.mjs';
import { relationState, relationStatus, settle, solveLinearInRelationWorkspace, submitSolvedEquation, declareOutcome } from './relationWorkspaceDriver.mjs';
import { solveLinearInEquationWorkspace } from './equationWorkspacePlanner.mjs';
import {
  backSubstitute,
  checkMyWork,
  chooseMethod,
  eliminate,
  eliminationTarget,
  readSpecialCase,
  rowOf,
  solveEmbedded,
  substitute,
  verifyOriginalEquations,
} from './systemsWorkspaceDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/questionFamilyCases');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/questionFamilyCases.html`;
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

export const DEVICES = Object.freeze({
  chromebook: { viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
});

const assignment = casesAssignment();
const findings = [];
const report = [];
const note = (journey, detail) => findings.push({ journey, detail });

const open = async (context, slot, student) => {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${PAGE}?slot=${slot}&student=${student}`);
  await page.waitForFunction(() => Boolean(window.__qfc?.question), null, { timeout: 60000 });
  await page.waitForSelector('[data-math-state], .mathmaster-algebraic-system-workflow', { timeout: 60000 });
  await settle(page, 1000);
  return { page, pageErrors };
};

const captured = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__qfc)));

/** The page scrolls sideways — content wider than the device. */
const horizontalOverflow = (page) => page.evaluate(() => {
  const width = document.documentElement.scrollWidth;
  return width > window.innerWidth + 1 ? `${width}px of content in a ${window.innerWidth}px viewport` : null;
});
/** Controls "⤢ Enlarge question" floats over (PQ-025): a tap there would open Work View instead. */
const controlsUnderOpener = (page) => page.evaluate(() => {
  const opener = [...document.querySelectorAll('button')].find((button) => /Enlarge question/.test(button.textContent || ''));
  if (!opener || !opener.offsetParent) return [];
  const o = opener.getBoundingClientRect();
  const over = (r) => r.width > 0 && r.height > 0 && r.left < o.right - 1 && r.right > o.left + 1 && r.top < o.bottom - 1 && r.bottom > o.top + 1;
  return [...opener.parentElement.querySelectorAll('button, input, select, math-field, [role="button"]')]
    .filter((element) => element !== opener && !opener.contains(element) && element.offsetParent && over(element.getBoundingClientRect()))
    .map((element) => `<${element.tagName.toLowerCase()}> "${(element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
});

const checkLayout = async (name, page, moment) => {
  const overflow = await horizontalOverflow(page);
  if (overflow) note(name, `the page scrolls sideways ${moment}: ${overflow}`);
  const covered = await controlsUnderOpener(page);
  if (covered.length) note(name, `"Enlarge question" covers ${covered.join(', ')} ${moment}`);
};

/** The server's verdict on the response the browser recorded — ingestion's own resolution. */
export const serverVerdict = ({ slot, studentId, delivery, toolResponse }) => {
  const storageIndex = slotStorageIndex(slot);
  const forGrading = resolveServerGradingQuestion({
    assignment,
    question: CASES_SLOTS[slot],
    questionIndex: storageIndex,
    variantIndex: 0,
    claimedDelivery: delivery,
    studentId,
    classId: CASES_CLASS_ID,
  });
  if (!forGrading.question) return { refused: true, reason: forGrading.reason };
  const response = normalizeToolResponse(toolResponse);
  const graded = gradeServerResponse({ question: forGrading.question, response });
  return { refused: false, isCorrect: graded.isCorrect === true, graded: graded.graded, parts: graded.parts, question: forGrading.question };
};

/** What student n (1–30) is given for a slot: the browser's own resolution, run in node. */
const deliveredQuestion = (slot, student) => {
  const studentId = CASES_STUDENTS[student - 1];
  const question = CASES_SLOTS[slot];
  const storageIndex = slotStorageIndex(slot);
  const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: CASES_CLASS_ID });
  const allocation = resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0, preview: false });
  return resolveFamilyQuestionInstance({
    question,
    assignmentId: assignment.id,
    storageIndex,
    slotKey: familySlotKey({ assignmentId: assignment.id, question, storageIndex }),
    allocation,
  }).question;
};

/**
 * The students whose version is the case a journey is about — chosen by what
 * they are actually given, so a journey keeps testing its case whatever the
 * allocation hands each seat.
 */
const studentsWhere = (slot, wanted) => CASES_STUDENTS
  .map((_, index) => index + 1)
  .filter((student) => wanted(deliveredQuestion(slot, student)));
const studentWhere = (slot, wanted, which = 0) => {
  const found = studentsWhere(slot, wanted)[which];
  if (!found) throw new Error(`no student in ${slot} matches the journey's case`);
  return found;
};
const outcome = (wanted) => (question) => question.solutionKey.outcome === wanted;
// Substitution through a fraction: no coefficient of ±1 to isolate cleanly.
const noUnitCoefficient = (question) => question.equations.every((equation) => {
  const row = rowOf(equation);
  return ![row.a, row.b].some((value) => Math.abs(Number(value)) === 1);
});

const compare = (journey, expected, state, verdict) => {
  const grade = state.grades.at(-1);
  if (!grade) {
    note(journey, 'the browser recorded no grade');
    return null;
  }
  if (grade.isCorrect !== expected) note(journey, `browser verdict ${grade.isCorrect}, expected ${expected}`);
  if (verdict.refused) note(journey, `the server refused the pin: ${verdict.reason}`);
  else if (verdict.isCorrect !== grade.isCorrect) note(journey, `browser said ${grade.isCorrect}, server said ${verdict.isCorrect}`);
  return { browser: grade.isCorrect, server: verdict.isCorrect, parts: (verdict.parts || []).map((part) => `${part.id}:${part.isCorrect}`) };
};

const journeys = {};
const journey = (name, fn) => { journeys[name] = fn; };

/* ----------------------------------------------- Step Algebra: relation workspace */

const relationJourney = (slot, student, device = 'chromebook') => async (name) => {
  const context = await browser.newContext(DEVICES[device]);
  const { page, pageErrors } = await open(context, slot, student);
  const steps = [];
  const log = (line) => steps.push(line);
  try {
    const state = await captured(page);
    const key = state.question.solutionKey;
    const route = await page.locator('[data-algebra-route]').first().getAttribute('data-algebra-route');
    if (route !== 'relation') note(name, `opened the ${route} workspace, expected the relation workspace`);
    log(`start ${await relationState(page)} (key ${key.display})`);
    await checkLayout(name, page, 'when the question opens');
    const result = await solveLinearInRelationWorkspace(page, { variable: state.question.variable, log });
    await checkLayout(name, page, 'after the solve');
    const expectedOutcome = key.outcome === 'value' ? 'value' : key.outcome;
    if (result.outcome !== expectedOutcome) note(name, `the workspace led to ${result.outcome}, the key says ${key.outcome}`);
    if (result.outcome === 'value' && result.value !== key.value) note(name, `isolated ${result.value}, the key says ${key.value}`);
    await submitSolvedEquation(page, log);
    const after = await captured(page);
    const verdict = serverVerdict({ slot, studentId: after.studentId, delivery: after.delivery, toolResponse: after.grades.at(-1)?.toolResponse });
    const parity = compare(name, true, after, verdict);
    await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
    if (pageErrors.length) note(name, `page errors: ${pageErrors.join(' | ')}`);
    report.push({ journey: name, slot, student, device, equation: state.question.equation, key: key.display, steps, parity });
  } catch (error) {
    await page.screenshot({ path: path.join(ARTIFACTS, `FAILED-${name}.png`), fullPage: true }).catch(() => {});
    note(name, `${error.message.split("\n").slice(0, 12).join(" // ")} — after: ${steps.at(-1) || "nothing"}`);
    report.push({ journey: name, slot, student, device, steps, error: error.message.split('\n')[0] });
  } finally {
    await context.close();
  }
};

journey('equation-none', relationJourney('eq-none', 1));
journey('equation-infinite', relationJourney('eq-infinite', 2));
journey('equation-none-distribute', relationJourney('eq-none-distribute', 3));
journey('equation-infinite-distribute', relationJourney('eq-infinite-distribute', 4));
// A mixed slot opens the relation workspace for every case, so the workspace
// never tells a student which case they drew: one student of each case.
journey('equation-mixed-one', relationJourney('eq-mixed', studentWhere('eq-mixed', outcome('value'))));
journey('equation-mixed-none', relationJourney('eq-mixed', studentWhere('eq-mixed', outcome('noSolution'))));
journey('equation-mixed-infinite', relationJourney('eq-mixed', studentWhere('eq-mixed', outcome('allReals'))));
// Identities with fraction coefficients (−(5/4)x − (5/3)x = −(35/12)x): the
// grader must credit "All real numbers" exactly, not by float probes.
journey('equation-infinite-fraction-coefficient', relationJourney('eq-mixed-fraction-coefficient', studentWhere('eq-mixed-fraction-coefficient', outcome('allReals'))));
journey('equation-none-fraction-coefficient', relationJourney('eq-mixed-fraction-coefficient', studentWhere('eq-mixed-fraction-coefficient', outcome('noSolution'))));

/* ----------------------------------------------- Step Algebra: equation workspace */

const equationJourney = (slot, student, device = 'chromebook') => async (name) => {
  const context = await browser.newContext(DEVICES[device]);
  const { page, pageErrors } = await open(context, slot, student);
  const steps = [];
  const log = (line) => steps.push(line);
  try {
    const state = await captured(page);
    const key = state.question.solutionKey;
    const host = page.locator('[data-algebra-route]').first();
    const route = await host.getAttribute('data-algebra-route');
    if (route !== 'stepAlgebra') note(name, `opened the ${route} workspace, expected the equation workspace`);
    log(`start ${state.question.equation} (key ${key.display})`);
    await checkLayout(name, page, 'when the question opens');
    const result = await solveLinearInEquationWorkspace(page, page.locator('body'), { variable: state.question.variable, log });
    await checkLayout(name, page, 'after the solve');
    if (result.value !== key.value) note(name, `isolated ${result.value}, the key says ${key.value}`);
    if (/\d\.\d/.test(result.latex)) note(name, `the finished equation shows a decimal: ${result.latex}`);
    await submitSolvedEquation(page, log);
    const after = await captured(page);
    const verdict = serverVerdict({ slot, studentId: after.studentId, delivery: after.delivery, toolResponse: after.grades.at(-1)?.toolResponse });
    const parity = compare(name, true, after, verdict);
    await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
    if (pageErrors.length) note(name, `page errors: ${pageErrors.join(' | ')}`);
    report.push({ journey: name, slot, student, device, equation: state.question.equation, key: key.display, final: result.latex, steps, parity });
  } catch (error) {
    await page.screenshot({ path: path.join(ARTIFACTS, `FAILED-${name}.png`), fullPage: true }).catch(() => {});
    note(name, `${error.message.split("\n").slice(0, 12).join(" // ")} — after: ${steps.at(-1) || "nothing"}`);
    report.push({ journey: name, slot, student, device, steps, error: error.message.split('\n')[0] });
  } finally {
    await context.close();
  }
};

journey('equation-one', equationJourney('eq-one', 1));
journey('equation-one-distribute', equationJourney('eq-one-distribute', 1));
journey('equation-fraction-solution', equationJourney('eq-fraction-solution', 1));
journey('two-step-fraction-coefficient', equationJourney('two-step-fraction-coefficient', 2));

/* ------------------------------------------- Systems Workspace: algebraic mode */

const sameValue = (left, right) => {
  const [a, b] = [left, right].map((value) => String(value).split('/').map(Number));
  return a[0] * (b[1] ?? 1) === b[0] * (a[1] ?? 1);
};

/**
 * Solve the system with the workspace's own controls. `method` is the
 * student's choice when the question leaves it to them; an authored method is
 * followed. Whether the reduced statement is true is read from the student's
 * own arithmetic — the key only judges the outcome afterwards. `reading`
 * forces the special-case readings (a wrong conclusion journey).
 */
const systemsJourney = (slot, student, { method = 'elimination', device = 'chromebook', reading = null, expected = true } = {}) => async (name) => {
  const context = await browser.newContext(DEVICES[device]);
  const { page, pageErrors } = await open(context, slot, student);
  const steps = [];
  const log = (line) => steps.push(line);
  try {
    const state = await captured(page);
    const question = state.question;
    const key = question.solutionKey;
    const rows = question.equations.map((equation) => rowOf(equation));
    const chosen = question.method === 'studentChoice' ? method : question.method;
    log(`start ${question.equations.join('  ;  ')} (key ${key.display}, ${question.method === 'studentChoice' ? `student chooses ${chosen}` : `authored ${chosen}`})`);
    await checkLayout(name, page, 'when the question opens');
    if (question.method === 'studentChoice') await chooseMethod(page, chosen, log);
    const reduction = chosen === 'elimination'
      ? await eliminate(page, rows, eliminationTarget(rows), log)
      : await substitute(page, rows, log);
    const statement = reduction.reduced;
    const special = Number(statement.coefficient) === 0;
    let outcome;
    if (special) {
      const isTrue = reading ? reading === 'infinite' : Number(statement.constant) === 0;
      if (!(await page.getByText('This reduces to a statement with no variable').count())) note(name, 'the reduced statement was not offered for interpretation');
      await readSpecialCase(page, { isTrue }, log);
      outcome = isTrue ? 'infinite' : 'noSolution';
    } else {
      const first = await solveEmbedded(page, reduction.surviving, (line) => log(line));
      const second = await backSubstitute(page, rows, { variable: reduction.surviving, value: first.value }, log);
      const solution = { [reduction.surviving]: first.value, [second.variable]: second.value };
      log(`solution (${solution.x}, ${solution.y})`);
      if (key.outcome === 'point' && (!sameValue(solution.x, key.x) || !sameValue(solution.y, key.y))) note(name, `solved (${solution.x}, ${solution.y}), the key says ${key.display}`);
      await verifyOriginalEquations(page, question.equations, solution, log);
      outcome = 'point';
    }
    if (!reading && outcome !== key.outcome) note(name, `the work led to ${outcome}, the key says ${key.outcome}`);
    await checkLayout(name, page, 'after the solve');
    await checkMyWork(page, log);
    const after = await captured(page);
    const verdict = serverVerdict({ slot, studentId: after.studentId, delivery: after.delivery, toolResponse: after.grades.at(-1)?.toolResponse });
    const parity = compare(name, expected, after, verdict);
    await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
    if (pageErrors.length) note(name, `page errors: ${pageErrors.join(' | ')}`);
    report.push({ journey: name, slot, student, device, method: chosen, equations: question.equations, key: key.display, steps, parity });
  } catch (error) {
    await page.screenshot({ path: path.join(ARTIFACTS, `FAILED-${name}.png`), fullPage: true }).catch(() => {});
    note(name, `${error.message.split('\n').slice(0, 12).join(' // ')} — after: ${steps.at(-1) || 'nothing'}`);
    report.push({ journey: name, slot, student, device, steps, error: error.message.split('\n')[0] });
  } finally {
    await context.close();
  }
};

journey('systems-one-elimination', systemsJourney('sys-one-elimination', 1));
journey('systems-one-substitution', systemsJourney('sys-one-substitution', studentWhere('sys-one-substitution', (question) => !noUnitCoefficient(question))));
// No coefficient of ±1: substitution has to isolate through a fraction.
journey('systems-one-substitution-fraction-isolation', systemsJourney('sys-one-substitution', studentWhere('sys-one-substitution', noUnitCoefficient)));
journey('systems-none-elimination', systemsJourney('sys-none', 1));
journey('systems-infinite-elimination', systemsJourney('sys-infinite', 1));
journey('systems-none-substitution', systemsJourney('sys-none-substitution', studentWhere('sys-none-substitution', (question) => !noUnitCoefficient(question))));
journey('systems-none-substitution-fraction-isolation', systemsJourney('sys-none-substitution', studentWhere('sys-none-substitution', noUnitCoefficient)));
journey('systems-infinite-substitution', systemsJourney('sys-infinite-substitution', 1));
journey('systems-fraction-solution', systemsJourney('sys-fraction', 1));
journey('systems-fraction-solution-substitution', systemsJourney('sys-fraction-substitution', studentWhere('sys-fraction-substitution', noUnitCoefficient)));
// Student's choice: the method is the student's, the mathematics is graded.
journey('systems-mixed-one-substitution', systemsJourney('sys-mixed', studentWhere('sys-mixed', outcome('point')), { method: 'substitution' }));
journey('systems-mixed-none-elimination', systemsJourney('sys-mixed', studentWhere('sys-mixed', outcome('noSolution')), { method: 'elimination' }));
journey('systems-mixed-infinite-substitution', systemsJourney('sys-mixed', studentWhere('sys-mixed', outcome('infinite')), { method: 'substitution' }));
// A wrong reading of 0 = c is graded wrong, by the browser and the server alike.
journey('systems-none-read-as-infinite', systemsJourney('sys-none', 2, { reading: 'infinite', expected: false }));
journey('systems-infinite-read-as-none', systemsJourney('sys-infinite', 2, { reading: 'none', expected: false }));

/* ----------------------------------------------------------- device profiles */

journey('phone-equation-none', relationJourney('eq-none', 6, 'phone'));
journey('ipad-equation-infinite-distribute', relationJourney('eq-infinite-distribute', 7, 'ipad'));
journey('phone-equation-one-distribute', equationJourney('eq-one-distribute', 8, 'phone'));
journey('phone-systems-none-elimination', systemsJourney('sys-none', 3, { device: 'phone' }));
journey('ipad-systems-one-substitution', systemsJourney('sys-one-substitution', studentWhere('sys-one-substitution', (question) => !noUnitCoefficient(question), 1), { device: 'ipad' }));
journey('chromebook-systems-mixed-infinite-elimination', systemsJourney('sys-mixed', studentWhere('sys-mixed', outcome('infinite'), 1), { method: 'elimination' }));
journey('phone-systems-mixed-one-substitution', systemsJourney('sys-mixed', studentWhere('sys-mixed', outcome('point'), 1), { method: 'substitution', device: 'phone' }));

/** A wrong conclusion is refused by the workspace itself; nothing is committed. */
journey('equation-wrong-claim-refused', async (name) => {
  const context = await browser.newContext(DEVICES.chromebook);
  const { page } = await open(context, 'eq-infinite', 5);
  try {
    const before = await relationState(page);
    await declareOutcome(page, 'noSolution');
    const after = await relationState(page);
    if (after !== before) note(name, `an unjustified "No solution" changed the work: ${before} -> ${after}`);
    if (!/not justified/i.test(await relationStatus(page))) note(name, 'the student was not told the conclusion is not justified');
    report.push({ journey: name, before, after, status: await relationStatus(page) });
  } finally {
    await context.close();
  }
});

/* ------------------------------------------------------------------- runner */

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const selected = requested.length ? requested : Object.keys(journeys);
for (const name of selected) {
  if (!journeys[name]) {
    note(name, 'no such journey');
    continue;
  }
  console.log(`journey ${name}`);
  await journeys[name](name);
}

await browser.close();
writeFileSync(path.join(ARTIFACTS, 'report.json'), `${JSON.stringify({ findings, report }, null, 2)}\n`);
for (const entry of report) console.log(JSON.stringify(entry));
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.journey}] ${finding.detail}`));
  process.exitCode = 1;
} else {
  console.log(`\nAll ${selected.length} journeys passed.`);
}

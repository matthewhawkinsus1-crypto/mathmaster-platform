// ON A DOL, QUIZ OR TEST NOTHING A STUDENT CAN OPERATE BEFORE SUBMITTING SAYS
// WHETHER THE WORK IS RIGHT — AND THE SUBMISSION IS STILL GRADED, RIGHT AND WRONG.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/assessmentLeakGates.mjs [surface ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// Every surface the assessment-integrity audit fixed, mounted in the real
// QuestionEngine by assessmentLeakGatesMain.jsx under the activity role in the
// URL and driven only through rendered controls. For each one:
//
//   practice  the verdicts are still there, exactly as before;
//   dol/test  a check records the work and says nothing about it, the next
//             step opens regardless, and the student can submit;
//   dol       a WRONG submission is graded wrong (and says which part) and a
//             RIGHT one is graded right.
//
// Surfaces:
//   systems-3x3        "Check my classification" / "Check the plane relationships"
//                      after a 3×3 elimination earns 0 = −3 (Day 2 PR2), and the
//                      caption under the 3D model opened from that result
//   systems-2x2        a 2×2 that eliminates to 0 = −2: true/false, solutions,
//                      classification
//   inequality-build   student-built inequalities: Check boundary / line style /
//                      shading, which step each Check opens, the progress marks,
//                      the overlap lock, the region check,
//                      and the boundary questions under the student's own test
//                      point (which must follow the student's own lines, not the
//                      true ones, once a wrong line can reach the overlap)
//   intercepts         "Check x-intercept" / "Check y-intercept" and their step credit
//   relation           the relation solver's graph-your-solution number line
//   constraint-builder the Constraint-Based Function Builder's live checklist
//   composed-algebra   "Need a strategic hint?" in a composed question's algebra step
//   three-plane-reveal the three-plane model's author-allowed "Reveal" button
//   feedback-ladder    the classroom feedback ladder (Hint control, miss message,
//                      hint offer, worked solution, similar problem, back-up step)
//                      on a plain key, a Question Family instance and a registry
//                      tool: none of its text anywhere in the document on a DOL
//                      or test, before or after Submit; and the partial-credit
//                      breakdown ("still to fix: …") only where feedback is open
//   graph-reading      a given graph whose intercepts are the answer: no feature
//                      value in its description and no data table, in any role
//
// (The modeling lab's result after submission comes from a Cloud Function, so
// it is held in node by tests/platform/solverRuntimeOutcomePolicy.test.mjs.)
//
// Exits non-zero on any failure.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chooseVariable, choosePair, combineRound, scaleEquation } from './day2NonuniqueDriver.mjs';
import { setMathField, settle } from './stepAlgebraDriver.mjs';
import { MISCONCEPTION_STUDENT_MESSAGES } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { GENERIC_MISS_MESSAGES, GENERIC_MISS_MESSAGES_OPEN } from '../../src/platform/supports/feedback/genericMissChecks.js';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
// Screenshots of any journey that could not be completed.
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/assessmentLeakGates');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
const tally = {};
let surface = '';
const check = (ok, label, detail = '') => {
  tally[surface] = tally[surface] || { ok: 0, fail: 0 };
  tally[surface][ok ? 'ok' : 'fail'] += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const run = Date.now();
let pageCount = 0;
const pages = [];
const open = async (role, q, extra = '', runId = null) => {
  pageCount += 1;
  const page = await context.newPage();
  pages.push(page);
  // A control that never appears is a finding, not a 30-second wait.
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${role} ${q}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/assessmentLeakGates.html?role=${role}&q=${q}&run=${runId || `${run}-${pageCount}`}${extra}`, { waitUntil: 'networkidle' });
  await page.locator('[data-leak-fixture]').waitFor();
  await settle(page, 900);
  return page;
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const lastGrade = async (page) => (await page.evaluate(() => window.__mmGraded)).at(-1) || null;
const stepGrades = (page) => page.evaluate(() => window.__mmStepGrades);
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const hasButton = async (page, name) => (await page.getByRole('button', { name, exact: true }).count()) > 0;
const partsOf = (grade) => Object.fromEntries((grade?.parts || []).map((part) => [part.id, part.isCorrect]));
const brief = (grade) => JSON.stringify(grade && { isCorrect: grade.isCorrect, parts: partsOf(grade), partial: grade.partialCreditPercent });
const firstMatch = (text, pattern) => (text.match(pattern) || [''])[0];

/** One scenario: never let a missing control stop the rest of the gate. */
const scenario = async (label, body) => {
  try {
    await body();
  } catch (error) {
    // The first line says what failed; Playwright's call log names the control
    // (between terminal colour codes, which are dropped).
    const waitedFor = (error.message.match(/waiting for (.*)/) || [])[1];
    const plain = (text) => text.split(String.fromCharCode(27)).map((piece) => piece.replace(/^\[\d+m/, '')).join('');
    check(false, `${label}: the journey could not be completed`, `${error.message.split('\n')[0]}${waitedFor ? ` (waiting for ${plain(waitedFor)})` : ''}`);
    mkdirSync(ARTIFACTS, { recursive: true });
    await pages.at(-1)?.screenshot({ path: path.join(ARTIFACTS, `FAILED-${label.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true }).catch(() => {});
  } finally {
    while (pages.length) await pages.pop().close().catch(() => {});
  }
};

/* ------------------------------------------------------------ systems-3x3 */

// Every line that would judge a reading of 0 = −3 or a plane relationship.
const SYSTEMS_VERDICT = /Evaluate both sides|does not fix any coordinate|Can any ordered triple|An identity (is true|places no condition)|compare the coefficient ratio|Are the x-, y- and z-coefficients|Check the ratios of the x-|Your contradiction means|Your identity means/;
const reachContradiction = async (page) => {
  await page.getByRole('heading', { name: '3×3 elimination steps' }).waitFor();
  await chooseVariable(page, 'x');
  await choosePair(page, 'Equation 1 and Equation 2');
  await scaleEquation(page, 'round1', 'Equation 1', '2', { x: '6', y: '-2', z: '-4', constant: '8' }, 'leak-gates');
  await combineRound(page, 'round1', 'subtract', ['Equation 1', 'Equation 2'], 'x', { y: '0', z: '0', constant: '-3' }, 'leak-gates');
};
const outcomePanel = (page) => page.locator('.mathmaster-algebraic-outcome');
const classify = async (page, kind, meaning) => {
  const panel = outcomePanel(page);
  await panel.getByLabel('What kind of statement is your result').selectOption(kind);
  await panel.getByLabel('Classify your algebraic result').selectOption(meaning);
  await panel.getByRole('button', { name: 'Check my classification', exact: true }).click();
  await settle(page, 500);
};
const planeStage = (page) => page.locator('[data-stage="plane-relationships"]');
const statePlanes = async (page, answers) => {
  for (const [pair, value] of Object.entries(answers)) {
    const [a, b] = pair.split('-');
    await planeStage(page).getByLabel(`How Planes ${a} and ${b} meet`).selectOption(value);
    await settle(page, 120);
  }
  await planeStage(page).getByRole('button', { name: 'Check the plane relationships', exact: true }).click();
  await settle(page, 500);
};
const openModelCaption = async (page) => {
  await button(page, 'Connect my result to 3D').click();
  await page.getByRole('img', { name: 'Interactive 3D view of the three planes. Drag to rotate.' }).waitFor();
  await settle(page, 400);
  return page.locator('.mathmaster-threeplane-viewport').innerText();
};
const WRONG_PLANES = { '1-2': 'coincident', '1-3': 'coincident', '2-3': 'parallel' };
const RIGHT_PLANES = { '1-2': 'parallel', '1-3': 'coincident', '2-3': 'parallel' };

const systems3x3 = async () => {
  await scenario('practice systems-3x3', async () => {
    const page = await open('practice', 'systems-3x3');
    await reachContradiction(page);
    await classify(page, 'identity', 'none');
    let text = await bodyText(page);
    check(/Evaluate both sides/.test(text), 'practice systems-3x3: a wrong reading of 0 = −3 still gets its nudge');
    check(await planeStage(page).count() === 0, 'practice systems-3x3: and the plane relationships stay locked behind it');
    await classify(page, 'contradiction', 'none');
    check(/Your contradiction means/.test(await openModelCaption(page)), 'practice systems-3x3: the earned model still reads the student\'s contradiction back');
    await statePlanes(page, WRONG_PLANES);
    text = await bodyText(page);
    check(/compare the coefficient ratio/.test(text) && !(await hasButton(page, 'Check my work')), 'practice systems-3x3: wrong plane relationships still get their nudge and hold Submit');
    await statePlanes(page, RIGHT_PLANES);
    await button(page, 'Check my work').click();
    await settle(page, 800);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true, 'practice systems-3x3: the right interpretation is submitted correct', brief(grade));
  });

  for (const role of ['dol', 'test']) {
    await scenario(`${role} systems-3x3 wrong`, async () => {
      const page = await open(role, 'systems-3x3');
      await reachContradiction(page);
      await classify(page, 'identity', 'none');
      let text = await bodyText(page);
      check(!SYSTEMS_VERDICT.test(text), `${role} systems-3x3: "Check my classification" says nothing about a wrong reading`, firstMatch(text, SYSTEMS_VERDICT));
      check(/Your classification: Identity \(always true\); No solution — inconsistent\. It is graded when you submit\./.test(text), `${role} systems-3x3: the student's own answers are recorded back to them`);
      check(await planeStage(page).count() === 1, `${role} systems-3x3: the plane relationships open whatever the classification`);
      const caption = await openModelCaption(page);
      check(!SYSTEMS_VERDICT.test(caption) && /how the three planes meet/.test(caption), `${role} systems-3x3: the model's caption names no outcome`, caption.replace(/\s+/g, ' ').slice(0, 160));
      await statePlanes(page, WRONG_PLANES);
      text = await bodyText(page);
      check(!SYSTEMS_VERDICT.test(text), `${role} systems-3x3: "Check the plane relationships" says nothing about wrong relationships`, firstMatch(text, SYSTEMS_VERDICT));
      check(/Your plane relationships: .*They are graded when you submit\./.test(text), `${role} systems-3x3: the stated relationships are recorded`);
      check(await hasButton(page, 'Check my work'), `${role} systems-3x3: the student can submit`);
      if (role !== 'dol') return;
      await button(page, 'Check my work').click();
      await settle(page, 800);
      const grade = await lastGrade(page);
      const parts = partsOf(grade);
      // The shared grader marks each plane pair; WRONG_PLANES gets Planes 1
      // and 2 wrong, so that pair is wrong and the relationships earn nothing.
      check(grade?.isCorrect === false && parts.classification === false && parts['planes-1-2'] === false && grade.partialCreditPercent === 0,
        'dol systems-3x3: the wrong interpretation is graded wrong, part by part', brief(grade));
      check(/"classificationKind":"identity"/.test(grade?.responseKey || '') && /"classificationChoice":"none"/.test(grade?.responseKey || ''), 'dol systems-3x3: the response is what the student chose', grade?.responseKey);
    });
  }

  await scenario('dol systems-3x3 right', async () => {
    const page = await open('dol', 'systems-3x3');
    await reachContradiction(page);
    await classify(page, 'contradiction', 'none');
    const text = await bodyText(page);
    check(!SYSTEMS_VERDICT.test(text) && /It is graded when you submit\./.test(text), 'dol systems-3x3: a right reading gets the same recorded line, no verdict');
    await statePlanes(page, RIGHT_PLANES);
    await button(page, 'Check my work').click();
    await settle(page, 800);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true && grade.partialCreditPercent === 100, 'dol systems-3x3: the right interpretation is graded right', brief(grade));
  });
};

/* ------------------------------------------------------------ systems-2x2 */

const SPECIAL_VERDICT = /Correct interpretation|check that statement again|0 = 0 is a true statement|Infinitely many solutions · consistent|No solution · inconsistent/;
const reachSpecialCase = async (page) => {
  await button(page, 'Eliminate x').click();
  await settle(page, 500);
  await page.locator('button[aria-label="Subtract Equation 2 from Equation 1"]:visible').first().click();
  await settle(page, 500);
  for (let index = 0; index < 2; index += 1) {
    await page.locator('button[aria-label^="Mark the "][aria-pressed="false"]:visible').first().click();
    await settle(page, 250);
  }
  await setMathField(page, page.locator('math-field[aria-label="Combined y term"]:visible').first(), '0');
  await setMathField(page, page.locator('math-field[aria-label="Combined right side"]:visible').first(), '-2');
  await button(page, 'Check my combination').click();
  await settle(page, 800);
  await page.getByLabel('Is this statement true or false?').waitFor();
};
const interpret = async (page, [truth, solutions, classification]) => {
  await page.getByLabel('Is this statement true or false?').selectOption(truth);
  await page.getByLabel('What does that mean for the system?').selectOption(solutions);
  await page.getByLabel('How would you classify this system?').selectOption(classification);
  await settle(page, 400);
};
const WRONG_SPECIAL = ['true', 'infinite', 'consistent-dependent'];
const RIGHT_SPECIAL = ['false', 'none', 'inconsistent'];

const systems2x2 = async () => {
  await scenario('practice systems-2x2', async () => {
    const page = await open('practice', 'systems-2x2');
    await reachSpecialCase(page);
    await interpret(page, WRONG_SPECIAL);
    check(/check that statement again/.test(await bodyText(page)), 'practice systems-2x2: a wrong interpretation is still called out at once');
    await interpret(page, RIGHT_SPECIAL);
    check(/Correct interpretation\./.test(await bodyText(page)), 'practice systems-2x2: a right one is still confirmed');
  });
  for (const role of ['dol', 'test']) {
    await scenario(`${role} systems-2x2 wrong`, async () => {
      const page = await open(role, 'systems-2x2');
      await reachSpecialCase(page);
      await interpret(page, WRONG_SPECIAL);
      const text = await bodyText(page);
      check(!SPECIAL_VERDICT.test(text), `${role} systems-2x2: the three answers are not judged before Submit`, firstMatch(text, SPECIAL_VERDICT));
      check(/Your interpretation is recorded\. It is graded when you submit\./.test(text), `${role} systems-2x2: they are recorded`);
      check(await hasButton(page, 'Check my work'), `${role} systems-2x2: the student can submit`);
      if (role !== 'dol') return;
      await button(page, 'Check my work').click();
      await settle(page, 800);
      const grade = await lastGrade(page);
      check(grade?.isCorrect === false, 'dol systems-2x2: the wrong interpretation is graded wrong', brief(grade));
    });
  }
  await scenario('dol systems-2x2 right', async () => {
    const page = await open('dol', 'systems-2x2');
    await reachSpecialCase(page);
    await interpret(page, RIGHT_SPECIAL);
    const text = await bodyText(page);
    check(!SPECIAL_VERDICT.test(text) && /Your interpretation is recorded\./.test(text), 'dol systems-2x2: a right interpretation gets the same recorded line');
    await button(page, 'Check my work').click();
    await settle(page, 800);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true, 'dol systems-2x2: the right interpretation is graded right', brief(grade));
  });
};

/* ------------------------------------------------------- inequality-build */

const BUILD_VERDICT = /Correct boundary\.|Correct line style\.|Correct shading\.|Check whether points on the boundary|Check whether the points you used|Use a test point or compare|Every constraint checks out|Locked until every constraint above is correct|Correct classification\.|Look at whether the shaded overlap|Correct —|misjudged|Re-examine|Not quite/;
// The graph's own mapping (CoordinatePlane: 560×380 viewBox, 42 padding) for
// this fixture's −6..8 × −4..10 window.
const GRAPH = 'svg[aria-label^="Student-constructed graph of the inequality system"]';
const tapGraph = async (page, x, y) => {
  // A control far down the panel may have scrolled the graph out of view; the
  // sticky chrome above it settles before the tap is aimed.
  const scrolled = await page.evaluate((selector) => {
    const svg = document.querySelector(selector);
    const rect = svg.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return false;
    svg.scrollIntoView({ block: 'center' });
    return true;
  }, GRAPH);
  if (scrolled) await settle(page, 400);
  const at = await page.evaluate(([gx, gy, selector]) => {
    const svg = document.querySelector(selector);
    const point = svg.createSVGPoint();
    point.x = 42 + ((gx + 6) / 14) * (560 - 84);
    point.y = 380 - 42 - ((gy + 4) / 14) * (380 - 84);
    const screen = point.matrixTransform(svg.getScreenCTM());
    return [screen.x, screen.y];
  }, [x, y, GRAPH]);
  await page.mouse.move(at[0], at[1]);
  await page.mouse.down();
  await page.mouse.up();
  await settle(page, 300);
};
// One step at a time (inequalityBuildFlow.js): a Check that completes a step
// opens the next one by itself, and a tap on the graph does what the open step
// needs — so there is no "shade" button to arm and no header to find.
const cursor = (page) => page.locator('[data-cursor]').first().getAttribute('data-cursor');
const choose = async (page, value) => {
  await page.locator(`button[data-choice="${value}"]:visible`).first().click();
  await settle(page, 150);
};
const buildBoundary = async (page, { method, field, value }) => {
  await page.getByLabel('Build it with').selectOption(method);
  await page.getByRole('spinbutton', { name: field }).fill(value);
  await button(page, 'Check boundary').click();
  await settle(page, 300);
};
const checkStyle = async (page, style) => {
  await choose(page, style);
  await button(page, 'Check line style').click();
  await settle(page, 300);
};
const checkShading = async (page, shadeAt) => {
  await tapGraph(page, ...shadeAt);
  await button(page, 'Check shading').click();
  await settle(page, 300);
};
// Each constraint's progress as the student sees it, one segment per step:
// done (outcomes shown: checked and right), recorded (withheld: finished),
// current, or open.
const progress = async (page) => page.$$eval('[data-constraint-index]', (cards) => cards.map((card) => (
  [...card.querySelectorAll('.mm-ineq-progress > span')].map((segment) => segment.dataset.state || 'open').join(' ')
)));
// Where outcomes are withheld no Check is a verdict, so the same steps open in
// the same order for right and wrong work. Returns the text after every Check
// and where each one left the student.
const buildSystemWithheld = async (page, firstStyle, firstBoundary = '1') => {
  const transcript = [];
  const cursors = [];
  const record = async () => { transcript.push(await bodyText(page)); cursors.push(await cursor(page)); };
  await buildBoundary(page, { method: 'vertical', field: 'x =', value: firstBoundary }); await record();
  await checkStyle(page, firstStyle); await record();
  await checkShading(page, [5, 0]); await record();
  await buildBoundary(page, { method: 'horizontal', field: 'y =', value: '3' }); await record();
  await checkStyle(page, 'dashed'); await record();
  await checkShading(page, [0, -2]); await record();
  return { transcript: transcript.join('\n'), cursors };
};
const WITHHELD_PATH = ['c0:lineStyle', 'c0:shading', 'c1:boundary', 'c1:lineStyle', 'c1:shading', 'combine'];
const classifyRegion = async (page, value = 'unbounded') => {
  await choose(page, value);
  await button(page, 'Check classification').click();
  await settle(page, 300);
};

const inequalityBuild = async () => {
  await scenario('practice inequality-build', async () => {
    const page = await open('practice', 'inequality-build');
    await buildBoundary(page, { method: 'vertical', field: 'x =', value: '1' });
    const boundaryRow = page.locator('[data-constraint-index="0"] [data-build-step="boundary"]');
    check(await cursor(page) === 'c0:lineStyle' && await boundaryRow.getAttribute('data-step-state') === 'done' && (await boundaryRow.innerText()).startsWith('✓'),
      'practice inequality-build: a right boundary is confirmed with a ✓ and the next step opens');
    await checkStyle(page, 'dashed');
    check(/Check whether points on the boundary are included\./.test(await bodyText(page)) && await cursor(page) === 'c0:lineStyle',
      'practice inequality-build: a wrong line style is still called out, and the student stays on it');
    check(!(await hasButton(page, 'Check shading')), 'practice inequality-build: the shading waits for the right style');
    // Constraint 2, from its header, built right.
    await page.locator('[data-constraint-index="1"] .mm-ineq-card-header').click();
    await settle(page, 300);
    await buildBoundary(page, { method: 'horizontal', field: 'y =', value: '3' });
    await checkStyle(page, 'dashed');
    await checkShading(page, [0, -2]);
    const marks = await progress(page);
    check(marks.join(' | ') === 'done current open | done done done', 'practice inequality-build: progress ticks only the steps that are right, and the student is sent back to the one that is not', marks.join(' | '));
    check(/Locked until every constraint above is correct\./.test(await bodyText(page)) && !(await hasButton(page, 'Find overlap / Combine regions')),
      'practice inequality-build: the overlap still waits for every constraint to be right');
    await checkStyle(page, 'solid');
    check(await cursor(page) === 'c0:shading', 'practice inequality-build: the right style is confirmed and the shading opens');
    await checkShading(page, [5, 0]);
    check(await cursor(page) === 'combine' && /Every constraint checks out\./.test(await bodyText(page)) && !(await button(page, 'Find overlap / Combine regions').isDisabled()),
      'practice inequality-build: every constraint right opens the overlap');
  });
  for (const role of ['dol', 'test']) {
    await scenario(`${role} inequality-build wrong`, async () => {
      const page = await open(role, 'inequality-build');
      // x ≥ 1 is SOLID: constraint 1's style is wrong.
      const { transcript, cursors } = await buildSystemWithheld(page, 'dashed');
      check(!BUILD_VERDICT.test(transcript), `${role} inequality-build: no check says whether a step is right`, firstMatch(transcript, BUILD_VERDICT));
      check(cursors.join(' ') === WITHHELD_PATH.join(' '), `${role} inequality-build: every Check moves on — the wrong style like any other`, cursors.join(' '));
      const marks = await progress(page);
      check(marks.join(' | ') === 'recorded recorded recorded | recorded recorded recorded', `${role} inequality-build: every finished step reads "recorded" — none ticks ✓ for being right`, marks.join(' | '));
      check(!(await bodyText(page)).includes('✓'), `${role} inequality-build: no ✓ anywhere`);
      check(!(await button(page, 'Find overlap / Combine regions').isDisabled()), `${role} inequality-build: the overlap opens on finished work`);
      await button(page, 'Find overlap / Combine regions').click();
      await settle(page, 300);
      await classifyRegion(page);
      const after = await bodyText(page);
      check(!BUILD_VERDICT.test(after) && await page.locator('[data-phase="classify"]').getAttribute('data-state') === 'done' && /●\s*Classify the region/.test(after),
        `${role} inequality-build: the region check records the answer only`, firstMatch(after, BUILD_VERDICT));
      if (role !== 'dol') return;
      await button(page, 'Check my work').click();
      await settle(page, 800);
      const grade = await lastGrade(page);
      check(grade?.isCorrect === false && grade.partialCreditPercent > 0 && grade.partialCreditPercent < 100,
        'dol inequality-build: one wrong line style is graded wrong, the rest earns credit', brief(grade));
    });
  }
  await scenario('dol inequality-build right', async () => {
    const page = await open('dol', 'inequality-build');
    // Where outcomes are withheld a step is done once it is finished; it still
    // stays on screen until the student presses its Check.
    await page.getByLabel('Build it with').selectOption('vertical');
    await page.getByRole('spinbutton', { name: 'x =' }).fill('1');
    await settle(page, 300);
    check(await cursor(page) === 'c0:boundary', 'dol inequality-build: a finished step stays open until its Check is pressed');
    await button(page, 'Check boundary').click();
    await settle(page, 300);
    const transcript = [await bodyText(page)];
    const cursors = [await cursor(page)];
    await checkStyle(page, 'solid'); transcript.push(await bodyText(page)); cursors.push(await cursor(page));
    await checkShading(page, [5, 0]); transcript.push(await bodyText(page)); cursors.push(await cursor(page));
    await buildBoundary(page, { method: 'horizontal', field: 'y =', value: '3' }); cursors.push(await cursor(page));
    await checkStyle(page, 'dashed'); cursors.push(await cursor(page));
    await checkShading(page, [0, -2]); transcript.push(await bodyText(page)); cursors.push(await cursor(page));
    check(!BUILD_VERDICT.test(transcript.join('\n')) && cursors.join(' ') === WITHHELD_PATH.join(' '), 'dol inequality-build: right work takes the same path with the same recorded lines', cursors.join(' '));
    await button(page, 'Find overlap / Combine regions').click();
    await settle(page, 300);
    await classifyRegion(page);
    await button(page, 'Check my work').click();
    await settle(page, 800);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true && grade.partialCreditPercent === 100, 'dol inequality-build: right work is graded right without a single verdict', brief(grade));
  });

  // The student's own test point and its boundary questions, which appear only
  // when the point is on a boundary. If that boundary is the TRUE one, tapping
  // along a line you built tells you whether the line is right.
  const PROBE = /Does this point lie exactly on one of the boundary lines\?/;
  const placeOwnPoint = async (page, x, y) => {
    await tapGraph(page, x, y);
    // The point really landed there, so what follows is about this point.
    await page.getByText(`Your point: (${x}, ${y})`).waitFor();
  };
  const answerPoint = async (page, answers) => {
    for (const [legend, value] of answers) {
      await page.getByRole('group', { name: legend }).locator(`button[data-choice="${value}"]`).click();
    }
    await button(page, 'Check this point').click();
    await settle(page, 300);
  };
  await scenario('practice inequality-probe', async () => {
    const page = await open('practice', 'inequality-probe');
    await buildSystemWithheld(page, 'solid');
    await button(page, 'Find overlap / Combine regions').click();
    await settle(page, 300);
    check(await cursor(page) === 'studentPoint', 'practice inequality-probe: combining opens the test point, ready for a tap');
    await placeOwnPoint(page, 1, 0);
    check(PROBE.test(await bodyText(page)), 'practice inequality-probe: a point on a boundary still gets the boundary questions');
    await placeOwnPoint(page, 2, 0);
    check(!PROBE.test(await bodyText(page)), 'practice inequality-probe: a point off every boundary still gets none');
  });
  for (const role of ['dol', 'test']) {
    await scenario(`${role} inequality-probe`, async () => {
      const page = await open(role, 'inequality-probe');
      // The student's first boundary is x = 2; the true one is x = 1.
      await buildSystemWithheld(page, 'solid', '2');
      await button(page, 'Find overlap / Combine regions').click();
      await settle(page, 300);
      await placeOwnPoint(page, 1, 0);
      check(!PROBE.test(await bodyText(page)), `${role} inequality-probe: a point on the true boundary, off the student's own line, gets no boundary questions`);
      await placeOwnPoint(page, 2, 0);
      check(PROBE.test(await bodyText(page)), `${role} inequality-probe: a point on the student's own line gets them`);
      await answerPoint(page, [[/Does the point satisfy inequality 1\?/, 'yes'], [/Does the point satisfy inequality 2\?/, 'yes'], ['Is the point a solution to the entire system?', 'yes']]);
      check(/Not finished yet — answer every part above\./.test(await bodyText(page)) && await cursor(page) === 'studentPoint', `${role} inequality-probe: the check asks for the boundary answers on screen`);
      await answerPoint(page, [['Does this point lie exactly on one of the boundary lines?', 'yes'], ['Since it is on that boundary, is it included in the solution region?', 'yes']]);
      const text = await bodyText(page);
      check(!BUILD_VERDICT.test(text) && await page.locator('[data-phase="studentPoint"]').getAttribute('data-state') === 'done', `${role} inequality-probe: then records the point without judging it`, firstMatch(text, BUILD_VERDICT));
    });
  }
};

/* ------------------------------------------------------------- intercepts */

const INTERCEPT_VERDICT = /does not match this equation|its y-coordinate is 0|its x-coordinate is 0|Both intercepts found|✓ x-intercept|✓ y-intercept/;
const interceptCreditReports = async (page) => (await stepGrades(page)).filter((report) => report?.stepGrade?.kind === 'linear-intercept');
const substitute = async (page, kind) => {
  const zeroOn = kind === 'x' ? 'y' : 'x';
  await page.locator('button:visible', { hasText: new RegExp(`^${zeroOn} = 0$`) }).first().click();
  await settle(page, 250);
  await page.locator('button[aria-label="Pick up zero for substitution"]:visible').first().click();
  await page.locator(`[aria-label="${zeroOn} variable substitution target"]:visible`).first().click();
  await settle(page, 200);
  await button(page, 'Substitute and solve').click();
  await settle(page, 1200);
};
const writeIntercept = async (page, kind, point) => {
  await setMathField(page, page.locator(`math-field[aria-label="${kind}-intercept as an ordered pair"]:visible`).first(), point);
  await button(page, `Check ${kind}-intercept`).click();
  await settle(page, 700);
};
const submitEngine = async (page) => {
  await page.getByRole('button', { name: /^Submit/ }).last().click();
  await settle(page, 900);
};

const intercepts = async () => {
  await scenario('practice intercepts', async () => {
    const page = await open('practice', 'intercepts');
    await substitute(page, 'x');
    await writeIntercept(page, 'x', '(4, 0)');
    check(/does not match this equation/.test(await bodyText(page)) && await hasButton(page, 'Check x-intercept'), 'practice intercepts: a wrong x-intercept is still called out and stays open');
    check((await interceptCreditReports(page)).length === 0, 'practice intercepts: and earns no step credit');
    await writeIntercept(page, 'x', '(5, 0)');
    check((await interceptCreditReports(page)).length === 1, 'practice intercepts: the right one still earns its step credit at once');
    await substitute(page, 'y');
    await writeIntercept(page, 'y', '(0, 5)');
    check(/Both intercepts found\./.test(await bodyText(page)), 'practice intercepts: both found is still announced');
    await submitEngine(page);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true, 'practice intercepts: submitted correct', brief(grade));
  });
  for (const role of ['dol', 'test']) {
    await scenario(`${role} intercepts wrong`, async () => {
      const page = await open(role, 'intercepts');
      await substitute(page, 'x');
      await writeIntercept(page, 'x', '(4, 0)');
      let text = await bodyText(page);
      check(!INTERCEPT_VERDICT.test(text), `${role} intercepts: "Check x-intercept" says nothing about a wrong point`, firstMatch(text, INTERCEPT_VERDICT));
      check(/x-intercept recorded/.test(text), `${role} intercepts: the point is recorded and the y-intercept opens`);
      check((await interceptCreditReports(page)).length === 0, `${role} intercepts: no step credit before Submit`);
      await substitute(page, 'y');
      await writeIntercept(page, 'y', '(0, 5)');
      text = await bodyText(page);
      check(!INTERCEPT_VERDICT.test(text) && /Both intercepts recorded\./.test(text), `${role} intercepts: both are recorded, neither judged`, firstMatch(text, INTERCEPT_VERDICT));
      check((await interceptCreditReports(page)).length === 0, `${role} intercepts: still no step credit — a right point earns none either`);
      check(await page.getByRole('button', { name: /^Submit/ }).count() > 0, `${role} intercepts: the student can submit`);
      if (role !== 'dol') return;
      await submitEngine(page);
      const grade = await lastGrade(page);
      const parts = partsOf(grade);
      check(grade?.isCorrect === false && parts['x-intercept'] === false && parts['y-intercept'] === true,
        'dol intercepts: graded wrong, with the wrong intercept attempted-and-wrong and the right one right', brief(grade));
    });
  }
  await scenario('dol intercepts change before submit', async () => {
    const page = await open('dol', 'intercepts');
    await substitute(page, 'x');
    await writeIntercept(page, 'x', '(4, 0)');
    await substitute(page, 'y');
    await writeIntercept(page, 'y', '(0, 5)');
    await button(page, 'Change x-intercept').click();
    await settle(page, 600);
    check(await page.getByRole('button', { name: /^Submit/ }).count() === 0, 'dol intercepts: a reopened intercept holds Submit until it is recorded again');
    await writeIntercept(page, 'x', '(5, 0)');
    check(/Both intercepts recorded\./.test(await bodyText(page)), 'dol intercepts: the changed point is recorded');
    await submitEngine(page);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true && partsOf(grade)['x-intercept'] === true, 'dol intercepts: the right intercepts are graded right', brief(grade));
  });
};

/* --------------------------------------------------------------- relation */

const NUMBER_LINE_VERDICT = /Not yet|\bCorrect\b|The graph is not right yet|Stuck\? Show a hint/;
const graphRay = async (page, endpoint) => {
  await page.locator('button:visible', { hasText: endpoint === 'open' ? 'Open' : 'Closed' }).first().click();
  await page.getByLabel('Exact endpoint value').fill('4');
  await page.locator('button:visible', { hasText: 'Place endpoint' }).first().click();
  await settle(page, 250);
  await page.locator('button:visible', { hasText: 'Shade right' }).first().click();
  await settle(page, 250);
  await button(page, 'Check').click();
  await settle(page, 700);
};
const RELATION = '&ineq=x%20%3E%204';

const relation = async () => {
  await scenario('practice relation', async () => {
    const page = await open('practice', 'relation', RELATION);
    check(await hasButton(page, 'Stuck? Show a hint'), 'practice relation: the number line still offers its hint');
    await graphRay(page, 'closed');
    check(/Not yet/.test(await bodyText(page)), 'practice relation: a wrong graph is still called out');
    check(await page.getByRole('button', { name: /^Submit/ }).count() === 0, 'practice relation: and Submit still waits for a right graph');
  });
  for (const role of ['dol', 'test']) {
    await scenario(`${role} relation wrong`, async () => {
      const page = await open(role, 'relation', RELATION);
      await graphRay(page, 'closed');
      const text = await bodyText(page);
      check(!NUMBER_LINE_VERDICT.test(text), `${role} relation: the number line neither judges the graph nor offers a hint`, firstMatch(text, NUMBER_LINE_VERDICT));
      check(/Your graph is recorded\. It is graded when you submit/.test(text), `${role} relation: the graph is recorded`);
      check(await page.getByRole('button', { name: /^Submit/ }).count() > 0, `${role} relation: the student can submit a graph nobody judged`);
      if (role !== 'dol') return;
      await submitEngine(page);
      const grade = await lastGrade(page);
      check(grade?.isCorrect === false && partsOf(grade)['solution-representations'] === false, 'dol relation: the wrong graph is graded wrong', brief(grade));
    });
  }
  // A graph changed after its Check is not the graph that was recorded: the
  // step waits for the next Check instead of grading the old one (practice
  // would otherwise grade a broken graph "correct", a DOL a fixed one wrong).
  await scenario('practice relation changed after a right graph', async () => {
    const page = await open('practice', 'relation', RELATION);
    await graphRay(page, 'open');
    check(await page.getByRole('button', { name: /^Submit/ }).count() > 0, 'practice relation changed: a right graph can be submitted');
    await button(page, 'Start over').click();
    await settle(page, 300);
    check(await page.getByRole('button', { name: /^Submit/ }).count() === 0, 'practice relation changed: after Start over the old graph is not submitted');
  });
  await scenario('dol relation changed after Check', async () => {
    const page = await open('dol', 'relation', RELATION);
    await graphRay(page, 'open');
    check(/Your graph is recorded/.test(await bodyText(page)), 'dol relation changed: the first graph is recorded');
    await button(page, 'Start over').click();
    await settle(page, 300);
    check(!/Your graph is recorded/.test(await bodyText(page)) && await page.getByRole('button', { name: /^Submit/ }).count() === 0,
      'dol relation changed: after a change nothing is recorded until the next Check');
    await graphRay(page, 'closed');
    check(/Your graph is recorded/.test(await bodyText(page)), 'dol relation changed: the next Check records the new graph');
    await submitEngine(page);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === false && partsOf(grade)['solution-representations'] === false, 'dol relation changed: the graph on screen is the one graded', brief(grade));
  });
  await scenario('dol relation right', async () => {
    const page = await open('dol', 'relation', RELATION);
    await graphRay(page, 'open');
    check(!NUMBER_LINE_VERDICT.test(await bodyText(page)), 'dol relation: a right graph gets the same recorded line');
    await submitEngine(page);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true, 'dol relation: the right graph is graded right', brief(grade));
  });
};

/* ----------------------------------------------------- constraint-builder */

// The checklist rows as the student sees them: "✓ Increasing", "• Increasing".
const checklist = (page) => page.locator('strong', { hasText: 'Constraint checklist' }).locator('xpath=following-sibling::div[1]/div').allInnerTexts();
const setParameter = async (page, label, value) => {
  await page.getByLabel(label).fill(String(value));
  await settle(page, 250);
};

const constraintBuilder = async () => {
  await scenario('practice constraint-builder', async () => {
    const page = await open('practice', 'constraint-builder');
    await setParameter(page, 'Slope m', 1);
    const rows = await checklist(page);
    check(rows.join('|') === '✓ Linear function|✓ Increasing|○ y-intercept 2', 'practice constraint-builder: the checklist still ticks live', rows.join(' | '));
  });
  for (const role of ['dol', 'test']) {
    await scenario(`${role} constraint-builder wrong`, async () => {
      const page = await open(role, 'constraint-builder');
      await setParameter(page, 'Slope m', 1);
      const rows = await checklist(page);
      check(rows.length === 3 && rows.every((row) => row.startsWith('•')), `${role} constraint-builder: no constraint ticks while the model is built`, rows.join(' | '));
      if (role !== 'dol') return;
      await button(page, 'Submit this model').click();
      await settle(page, 800);
      const grade = await lastGrade(page);
      check(grade?.isCorrect === false && partsOf(grade)['y-intercept'] === false && grade.partialCreditPercent === 67, 'dol constraint-builder: the model is graded at submission, part by part', brief(grade));
    });
  }
  await scenario('dol constraint-builder right', async () => {
    const page = await open('dol', 'constraint-builder');
    await setParameter(page, 'Slope m', 1);
    await setParameter(page, 'y-intercept b', 2);
    const rows = await checklist(page);
    check(rows.length === 3 && rows.every((row) => row.startsWith('•')), 'dol constraint-builder: a right model looks the same', rows.join(' | '));
    await button(page, 'Submit this model').click();
    await settle(page, 800);
    const grade = await lastGrade(page);
    check(grade?.isCorrect === true, 'dol constraint-builder: the right model is graded right', brief(grade));
  });
};

/* -------------------------------------------------- composed + 3D reveal */

const composedAlgebra = async () => {
  for (const role of ['practice', 'dol', 'test']) {
    await scenario(`${role} composed-algebra`, async () => {
      const page = await open(role, 'composed-algebra');
      await page.locator('[data-math-state]').first().waitFor();
      const offered = /Need a strategic hint\?/.test(await bodyText(page));
      if (role === 'practice') check(offered, 'practice composed-algebra: the algebra step still offers its strategic hint');
      else check(!offered, `${role} composed-algebra: the algebra step offers no hint`);
    });
  }
};

const threePlaneReveal = async () => {
  for (const role of ['practice', 'dol', 'test']) {
    await scenario(`${role} three-plane-reveal`, async () => {
      const page = await open(role, 'three-plane-reveal');
      await page.getByRole('img', { name: 'Interactive 3D view of the three planes. Drag to rotate.' }).waitFor();
      const offered = await page.getByRole('button', { name: /^Reveal / }).count() > 0;
      if (role === 'practice') check(offered, 'practice three-plane-reveal: the author-allowed reveal is still offered');
      else check(!offered, `${role} three-plane-reveal: no reveal before Submit`);
    });
  }
};

/* ------------------------------------------------------- feedback ladder */

// Every text the classroom feedback ladder can produce (Student push, Job A):
// authored supports (marked LEAKCHECK in the fixtures), every misconception
// and generic miss message, and the ladder's own words. On a DOL or test none
// may be anywhere in the document — visible text, aria-labels, live regions
// or hidden nodes — while the item can still be answered, nor after a
// submission whose outcome is held.
const LADDER_WORDS = ['LEAKCHECK', 'A hint is ready', 'Show a hint', 'See why it works', 'Worked solution', 'Why it works', 'Try a similar one', 'A similar problem, worked out', 'Let’s back up'];
const ladderLeaks = async (page) => {
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const messages = [...Object.values(MISCONCEPTION_STUDENT_MESSAGES), ...Object.values(GENERIC_MISS_MESSAGES), ...Object.values(GENERIC_MISS_MESSAGES_OPEN)];
  return [...LADDER_WORDS, ...messages].filter((text) => html.includes(text.replace(/&/g, '&amp;')));
};
const typeAnswer = async (page, value) => {
  await setMathField(page, page.locator('.mathmaster-question-tool-workspace math-field').first(), value);
};
const submitAnswer = async (page) => {
  await page.locator('button.mathmaster-bar-submit').first().click();
  await settle(page, 700);
};
const feedbackLadder = async () => {
  for (const role of ['practice', 'dol', 'test']) {
    await scenario(`${role} feedback-ladder`, async () => {
      const page = await open(role, 'feedback-ladder');
      const hintControl = await page.locator('[data-hint-control]').count();
      if (role === 'practice') check(hintControl === 1, 'practice feedback-ladder: the Hint control is offered');
      else check(hintControl === 0, `${role} feedback-ladder: no Hint control`);
      if (role !== 'practice') check((await ladderLeaks(page)).length === 0, `${role} feedback-ladder: nothing from the ladder in the document before Submit`, (await ladderLeaks(page)).join(' | '));
      if (role === 'practice') {
        await page.locator('[data-hint-control]').click();
        await page.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
        await settle(page, 200);
      }
      await typeAnswer(page, '-\\frac{3}{4}');
      await submitAnswer(page);
      const grade = await lastGrade(page);
      check(grade?.isCorrect === false, `${role} feedback-ladder: a wrong answer is graded wrong`, brief(grade));
      // Every hint revealed is recorded with the attempt (recordHintUse).
      if (role === 'practice') check(grade?.supportUsage?.hintUsed === true && grade?.supportUsage?.isMathematicallyIndependent === false, 'practice feedback-ladder: the hint revealed is recorded with the attempt', JSON.stringify(grade?.supportUsage));
      const miss = page.locator('[data-miss-feedback]');
      if (role === 'practice') {
        check(await miss.count() === 1 && /LEAKCHECK-MISCONCEPTION/.test(await miss.textContent()), 'practice feedback-ladder: the authored wrong-answer message is shown');
      } else {
        check(await miss.count() === 0, `${role} feedback-ladder: no miss message after Submit`);
        check((await ladderLeaks(page)).length === 0, `${role} feedback-ladder: nothing from the ladder in the document after Submit`, (await ladderLeaks(page)).join(' | '));
      }
    });
  }
  // PR #462 review B2 / M6c: help had on a question is recorded with the
  // attempts that follow it — across a remount (the same draft key), and a
  // miss message on screen makes the next attempt feedback-assisted.
  await scenario('practice feedback-ladder support use', async () => {
    const runId = `${run}-support-use`;
    const first = await open('practice', 'feedback-ladder', '', runId);
    await first.locator('[data-hint-control]').click();
    await first.locator('.mathmaster-hint-panel button', { hasText: 'Show a hint' }).click();
    await settle(first, 300);
    await first.close();
    const page = await open('practice', 'feedback-ladder', '', runId);
    await typeAnswer(page, '-\\frac{3}{4}');
    await submitAnswer(page);
    const remounted = (await lastGrade(page))?.supportUsage || {};
    check(remounted.hintUsed === true && remounted.isMathematicallyIndependent === false, 'practice feedback-ladder: a hint revealed before leaving is recorded after coming back', JSON.stringify(remounted));
    check(remounted.feedbackAssisted === false, 'practice feedback-ladder: the first attempt saw no miss message', JSON.stringify(remounted));
    await typeAnswer(page, '5');
    await submitAnswer(page);
    const next = (await lastGrade(page))?.supportUsage || {};
    check(next.feedbackAssisted === true && next.isMathematicallyIndependent === false, 'practice feedback-ladder: the attempt after a miss message is feedback-assisted', JSON.stringify(next));
  });
  // PR #462 review M4: a question locked without closing (DOL timer, a
  // section the teacher closed, the Warm-Up window) loses its Ask and Cancel
  // controls, so it lowers its own raised hand.
  for (const locked of ['1', '0']) {
    await scenario(`practice feedback-ladder raised hand (locked=${locked})`, async () => {
      const page = await open('practice', 'feedback-ladder', `&ask=1&hand=1&locked=${locked}`);
      const calls = await page.evaluate(() => window.__mmHelp);
      if (locked === '1') check(calls.includes(false), 'practice feedback-ladder: a locked question lowers its raised hand', JSON.stringify(calls));
      else check(calls.length === 0, 'practice feedback-ladder: an open question leaves the hand raised', JSON.stringify(calls));
    });
  }
  // PR #462 review: the partial-credit breakdown names the parts still wrong,
  // which steers the remaining attempts. Released feedback on a DOL, quiz or
  // test item that can still be answered keeps the percentage only.
  for (const role of ['practice', 'dol', 'quiz', 'test']) {
    await scenario(`${role} feedback-partial (released)`, async () => {
      const page = await open(role, 'feedback-partial', '&record=partial&released=1');
      const strip = page.locator('.mathmaster-question-attempt-strip');
      const stripText = await strip.textContent();
      check(/50% partial credit so far/.test(stripText), `${role} feedback-partial: the percentage is shown`, stripText);
      const breakdown = await strip.locator('.mathmaster-attempt-detail-breakdown').count();
      if (role === 'practice') {
        check(breakdown === 1 && /still to fix: LEAKCHECK-PART y-intercept/.test(stripText), 'practice feedback-partial: the breakdown names the part to fix', stripText);
      } else {
        check(breakdown === 0 && !/still to fix|parts right|LEAKCHECK-PART/.test(stripText), `${role} feedback-partial: no breakdown while the item can be answered`, stripText);
      }
    });
  }
  // PR #462 review B1: a DOL shows right/wrong per item as soon as the item
  // closes, and "Grant one more DOL attempt" reopens that same item. The
  // worked solution waits for the teacher's assignment-level release.
  for (const role of ['dol', 'quiz', 'test']) {
    for (const review of ['0', '1']) {
      await scenario(`${role} feedback-ladder closed (review=${review})`, async () => {
        const page = await open(role, 'feedback-ladder', `&record=expired&released=1&review=${review}`);
        const worked = await page.locator('[aria-label="Worked solution"]').count();
        const html = await page.evaluate(() => document.documentElement.outerHTML);
        if (review === '0') {
          check(worked === 0 && !html.includes('LEAKCHECK-REVIEW'), `${role} feedback-ladder: a closed item with right/wrong released shows no worked solution`, `${worked} panels`);
        } else {
          check(worked === 1 && html.includes('LEAKCHECK-REVIEW: change in y is 3.'), `${role} feedback-ladder: after the assignment's release the worked solution shows`, `${worked} panels`);
        }
      });
    }
  }
  for (const which of ['feedback-family', 'feedback-tool']) {
    for (const role of ['dol', 'test']) {
      await scenario(`${role} ${which}`, async () => {
        const page = await open(role, which);
        check(await page.locator('[data-hint-control]').count() === 0, `${role} ${which}: no Hint control`);
        check((await ladderLeaks(page)).length === 0, `${role} ${which}: nothing from the ladder in the document`, (await ladderLeaks(page)).join(' | '));
        if (which === 'feedback-family') {
          const prompt = await page.locator('.mathmaster-question-engine').first().textContent();
          const match = prompt.match(/(−|-)?\s*(\d+)x\s*([+−-])\s*(\d+)\s*=\s*(−|-)?\s*(\d+)/);
          check(Boolean(match), `${role} ${which}: the instance renders`, prompt.slice(0, 120));
          if (match) {
            const a = Number(match[2]) * (match[1] ? -1 : 1);
            const b = Number(match[4]) * (match[3] === '+' ? 1 : -1);
            const c = Number(match[6]) * (match[5] ? -1 : 1);
            // The kept-sign value: in practice the classifier would name it.
            await typeAnswer(page, String((c + b) / a));
            await submitAnswer(page);
            check((await lastGrade(page))?.isCorrect === false, `${role} ${which}: graded wrong`);
            check((await ladderLeaks(page)).length === 0, `${role} ${which}: no diagnosis, hint or review after Submit`, (await ladderLeaks(page)).join(' | '));
          }
        }
      });
    }
  }
};

/* --------------------------------------------------------- graph-reading */

// PR #454 review B1/B2: a screen reader (ChromeVox is one keystroke on every
// Chromebook) heard "crosses the y-axis at 2" and a "Show data table" listed
// the intercept rows on items whose answer IS the intercepts. While the item
// can be answered — in every role, not only assessments — the plane says what
// is drawn and never where, and offers no table.
const planeReading = (page) => page.evaluate(() => {
  const svg = document.querySelector('svg[aria-describedby][role="img"]');
  const description = svg ? document.getElementById(svg.getAttribute('aria-describedby'))?.textContent || '' : '';
  return { found: Boolean(svg), description, table: [...document.querySelectorAll('button')].some((b) => /data table/i.test(b.textContent)) };
});
const FEATURE_TALK = /cross|touch|high point|low point|passes through|\(3, 0\)|\(0, 2\)|at 2\b|at 3\b|between/;
const graphReading = async () => {
  for (const role of ['practice', 'dol', 'test']) {
    for (const read of ['1', '0']) {
      await scenario(`${role} graph-reading read=${read}`, async () => {
        const page = await open(role, 'graph-reading', `&read=${read}`);
        const plane = await planeReading(page);
        check(plane.found, `${role} graph-reading (read=${read}): the given graph is described`);
        check(/1 line/.test(plane.description), `${role} graph-reading (read=${read}): it says what is drawn`, plane.description);
        check(!FEATURE_TALK.test(plane.description), `${role} graph-reading (read=${read}): the description names no intercept or position`, firstMatch(plane.description, FEATURE_TALK));
        check(!plane.table, `${role} graph-reading (read=${read}): no data table while the item can be answered`);
      });
    }
  }
};

/* ----------------------------------------------------------------- runner */

const SURFACES = {
  'systems-3x3': systems3x3,
  'systems-2x2': systems2x2,
  'inequality-build': inequalityBuild,
  intercepts,
  relation,
  'constraint-builder': constraintBuilder,
  'composed-algebra': composedAlgebra,
  'three-plane-reveal': threePlaneReveal,
  'feedback-ladder': feedbackLadder,
  'graph-reading': graphReading,
};
const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SURFACES);
for (const name of selected) {
  surface = name;
  console.log(`\n== ${name}`);
  if (!SURFACES[name]) { check(false, `unknown surface ${name}`); continue; }
  await SURFACES[name]();
}

await browser.close();
console.log('\nsurface              ok  fail');
for (const [name, counts] of Object.entries(tally)) console.log(`${name.padEnd(20)} ${String(counts.ok).padStart(3)} ${String(counts.fail).padStart(5)}`);
if (failures.length) {
  console.log(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log('\nEvery surface: practice keeps its verdicts; DOL and test say nothing before Submit; DOL grades right and wrong.');

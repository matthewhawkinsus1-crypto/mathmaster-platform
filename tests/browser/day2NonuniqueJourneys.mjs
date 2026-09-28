// ISSUES #390 / #392: DAY 2's NON-UNIQUE 3×3 SYSTEMS, SOLVED THE WAY A STUDENT SOLVES THEM.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/day2NonuniqueJourneys.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The FINAL Day 2 assignment's own questions, mounted through the real
// QuestionEngine by day2NonuniqueMain.jsx, driven only through rendered
// controls — no state injection, no answer-key reads:
//
//   dependent-direct      CW1 (laptop): E1/E3 earns 0 = 0, which alone must NOT
//                         classify the system; E1/E2 (exact 1/2) accounts for
//                         the third equation. Refresh mid-distribution, after a
//                         round and after classifying; Undo straight after each
//                         refresh; two-part classification with misconception
//                         feedback; plane relationships stated by the student;
//                         route change via Undo + "Choose a different pair"
//                         revokes classification and relocks 3D.
//   dependent-substitution CW1 (laptop): R₁/R₂ from E1/E2 and E2/E3, reduced 2×2
//                         by substitution — the student simplifies the substituted
//                         equation themselves before 27 = 27 exists.
//   dependent-phone       CW1 at 390×844: the same interpretation with no overflow.
//   inconsistent-phone    PR2 (phone): E1/E3 first earns 0 = 0 (coincident pair),
//                         then E1/E2 earns 0 = −3. The earlier identity never
//                         classifies the system as dependent.
//   inconsistent-direct   PR2 (laptop): E1/E2 first — the contradiction is decisive.
//   unique                CW3 (laptop): the full unique path; 3D shows the student's
//                         own (−2, 6, −3) only after verification.
//
// On every screen: nothing classifies or captions the system before the student
// earns it. Exit code 1 on any finding; screenshots in
// tests/browser/artifacts/day2NonuniqueJourneys/.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  backSubstitute, choosePair, chooseVariable, combineRound, divideOut, scaleEquation, simplifyProducts, solver,
  subsystemBackSubstitute, subsystemCombine, subsystemElimination, subsystemScale, verifyAll,
} from './day2NonuniqueDriver.mjs';
import { balancedMove, cancelFactor, cancelTerm, closeInlineModes, combineLikeTerms, setMathField, settle, simplifySide } from './stepAlgebraDriver.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const here = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(path.resolve(here, '../..'), 'tests/browser/artifacts/day2NonuniqueJourneys');

class Finding extends Error {}
const check = (value, message) => { if (!value) throw new Finding(message); };

const LAPTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };
// Words that would classify, caption or solve the system for the student.
const EARLY = /0 = 0|0 = −3|0 = -3|27 = 27|identity|contradiction|dependent|inconsistent|infinitely|no solution|coincident|parallel|\(−2, 6, −3\)/i;

const open = async (page, id, run, viewport) => {
  await page.setViewportSize(viewport);
  await page.goto(`${ORIGIN}/tests/browser/day2Nonunique.html?q=${id}&run=${run}`);
  await page.getByRole('heading', { name: '3×3 elimination workflow' }).waitFor();
  await settle(page, 400);
};
const reload = async (page) => {
  await page.reload();
  await page.getByRole('heading', { name: '3×3 elimination workflow' }).waitFor();
  await settle(page, 900);
};
// MathLive renders into shadow DOM: read each math element's source as well as the text.
const withMath = (locator) => locator.evaluate((root) => `${root.innerText} ${[...root.querySelectorAll('math-span, math-div')].map((element) => element.textContent).join(' ')}`);
const workspaceText = (page) => withMath(page.locator('.mathmaster-reduction-workflow'));
/** The statement the interpretation stage shows, spaces removed: "0=-3". */
const statementShown = (page) => outcomePanel(page).locator('math-span, math-div').first().evaluate((element) => element.textContent.replace(/\s+/g, '').replace(/−/g, '-'));
const undo = async (page) => { await page.getByRole('button', { name: '↶ Undo', exact: true }).click(); await settle(page, 600); };
const outcomePanel = (page) => page.locator('.mathmaster-algebraic-outcome');

/** Nothing spatial or interpretive is reachable. */
const locked = async (page, where) => {
  check(await page.getByRole('button', { name: 'Connect my result to 3D', exact: true }).count() === 0, `${where}: the 3D connection is available before it was earned`);
  check(await page.locator('.mathmaster-threeplane-viewport').count() === 0, `${where}: a 3D model is on screen before it was earned`);
  check(await page.locator('[data-stage="plane-relationships"]').count() === 0, `${where}: plane relationships are asked before classification`);
  check(await page.getByRole('button', { name: 'Check my work', exact: true }).count() === 0, `${where}: the question can be submitted before it is interpreted`);
};
const noEarlyReveal = async (page, where) => {
  const text = await workspaceText(page);
  const match = text.match(EARLY);
  check(!match, `${where}: "${match?.[0]}" is on screen before the student earned it`);
};
const noOverflow = async (page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `${where}: the page scrolls sideways by ${overflow}px`);
};

const classify = async (page, kind, meaning) => {
  const panel = outcomePanel(page);
  await panel.getByLabel('What kind of statement is your result').selectOption(kind);
  await panel.getByLabel('Classify your algebraic result').selectOption(meaning);
  await panel.getByRole('button', { name: 'Check my classification', exact: true }).click();
  await settle(page, 500);
};
const classificationHint = async (page) => (await outcomePanel(page).locator('form [role="status"]').allInnerTexts()).join(' ');
const statePlanes = async (page, answers) => {
  const stage = page.locator('[data-stage="plane-relationships"]');
  for (const [pair, value] of Object.entries(answers)) {
    const [a, b] = pair.split('-');
    await stage.getByLabel(`How Planes ${a} and ${b} meet`).selectOption(value);
    await settle(page, 150);
  }
  await stage.getByRole('button', { name: 'Check the plane relationships', exact: true }).click();
  await settle(page, 500);
  return (await stage.innerText()).replace(/\s+/g, ' ');
};
const openModel = async (page, where) => {
  await page.getByRole('button', { name: 'Connect my result to 3D', exact: true }).click();
  await page.getByRole('img', { name: 'Interactive 3D view of the three planes. Drag to rotate.' }).waitFor();
  await settle(page, 400);
  const caption = await page.locator('.mathmaster-threeplane-viewport').innerText();
  check(!/coincident|parallel/i.test(caption), `${where}: the 3D model captions the plane relationships the student is about to state: ${caption.replace(/\s+/g, ' ').slice(0, 200)}`);
  await noOverflow(page, where);
};
const submitWork = async (page) => {
  await page.getByRole('button', { name: 'Check my work', exact: true }).click();
  await settle(page, 700);
  const grades = await page.evaluate(() => window.__day2Grades || []);
  return grades[grades.length - 1] || null;
};

/** Scale an equation but refresh before checking: typed products survive, nothing is accepted. */
const scaleWithRefreshMidEntry = async (page, roundKey, label, factor, products) => {
  const round = page.locator(`[data-round="${roundKey}"]`);
  await round.locator(`button[aria-label="Scale ${label}"]`).click();
  await settle(page, 300);
  await setMathField(page, round.locator(`math-field[aria-label="Scale factor for ${label}"]`), factor);
  await round.getByRole('button', { name: 'Apply this factor' }).click();
  await settle(page, 400);
  const entries = Object.entries(products);
  for (const [key, value] of entries.slice(0, -1)) {
    await setMathField(page, round.locator(`math-field[aria-label="${key === 'constant' ? `Scaled right side for ${label}` : `Scaled ${key} term for ${label}`}"]`), value);
  }
  await reload(page);
  const restored = page.locator(`[data-round="${roundKey}"]`);
  const typed = await restored.locator(`math-field[aria-label="Scaled ${entries[0][0]} term for ${label}"]`).evaluate((field) => field.value);
  check(typed === entries[0][1], `refresh mid-distribution lost the typed product (${typed})`);
  check(await restored.getByRole('button', { name: 'Check my scaled terms' }).count() === 1, 'refresh mid-distribution accepted the unfinished products');
  const [lastKey, lastValue] = entries[entries.length - 1];
  const lastField = restored.locator(`math-field[aria-label="${lastKey === 'constant' ? `Scaled right side for ${label}` : `Scaled ${lastKey} term for ${label}`}"]`);
  await setMathField(page, lastField, lastValue);
  // Enter checks the active distribution field (#390 keyboard consistency).
  await lastField.press('Enter');
  await settle(page, 600);
  check((await restored.locator('.mathmaster-elim-badge').allInnerTexts()).some((text) => text.includes(factor)), 'Enter did not check the scaled terms');
};

/* ---------------------------------------------------------------- journeys */

export async function dependentDirect(page, run = `dependent-${Date.now()}`) {
  await open(page, '3x3-d2-cw-1', run, LAPTOP);
  await locked(page, 'CW1 opened'); await noEarlyReveal(page, 'CW1 opened');
  await chooseVariable(page, 'x'); await choosePair(page, 'Equation 1 and Equation 3');
  await scaleWithRefreshMidEntry(page, 'round1', 'Equation 1', '3', { x: '6', y: '3', z: '-9', constant: '15' });
  await reload(page);
  await undo(page);
  check(await page.locator('math-field[aria-label="Scaled right side for Equation 1"]').isVisible(), 'Undo straight after refresh did not reopen the distribution');
  await page.getByRole('button', { name: 'Check my scaled terms', exact: true }).click(); await settle(page, 500);
  await combineRound(page, 'round1', 'subtract', ['Equation 1', 'Equation 3'], 'x', { y: '0', z: '0', constant: '0' }, 'dependent');
  // One pair's identity is not a statement about the whole system.
  check(await outcomePanel(page).count() === 0, 'an identity from ONE pair opened classification before the third equation was accounted for');
  await locked(page, 'after E1/E3 = 0 = 0');
  check(await page.getByRole('button', { name: 'Equation 1 and Equation 2', exact: true }).count() === 1, 'the second pair is not offered after the identity');
  await reload(page);
  check(await page.locator('[data-round="round1"].is-complete').count() === 1, 'refresh after one round lost the completed round');
  await undo(page);
  check(await page.getByRole('button', { name: 'Check my combination', exact: true }).count() === 1, 'Undo after refresh did not reopen the round-1 combination');
  await page.getByRole('button', { name: 'Check my combination', exact: true }).click(); await settle(page, 600);
  await choosePair(page, 'Equation 1 and Equation 2');
  await scaleEquation(page, 'round2', 'Equation 1', '1/2', { x: '1', y: '1/2', z: '-3/2', constant: '5/2' }, 'dependent');
  await combineRound(page, 'round2', 'subtract', ['Equation 1', 'Equation 2'], 'x', { y: '-3/2', z: '5/2', constant: '-9/2' }, 'dependent');
  check((await workspaceText(page)).includes('−3/2') || (await page.locator('[data-round="round2"]').innerText()).includes('3'), 'exact fractions were not kept');
  check(await outcomePanel(page).count() === 1 && await statementShown(page) === '0=0', 'accounting for all three equations did not open the interpretation of the student\'s 0 = 0');
  await locked(page, 'identity earned, not yet classified');

  await classify(page, 'origin', 'unique');
  check(/does not fix any coordinate/.test(await classificationHint(page)), `"0 = 0 means (0,0,0)" got no targeted feedback: ${await classificationHint(page)}`);
  await locked(page, 'origin misconception');
  await classify(page, 'identity', 'unique');
  const uniqueHint = await classificationHint(page);
  check(/no condition/.test(uniqueHint) && !/infinitely many/i.test(uniqueHint), `identity-but-unique feedback is missing or names the answer: ${uniqueHint}`);
  await locked(page, 'identity called unique');
  await classify(page, 'identity', 'infinite');
  check(/Your classification/.test(await outcomePanel(page).innerText()), 'a correct classification was not accepted');

  await reload(page);
  check(/Your classification/.test(await outcomePanel(page).innerText()), 'refresh after classification lost it');
  await undo(page);
  check(await outcomePanel(page).getByLabel('Classify your algebraic result').isVisible(), 'Undo after refresh did not revoke the classification');
  await locked(page, 'classification undone');
  await classify(page, 'identity', 'infinite');

  await openModel(page, 'dependent model');
  check(await page.getByRole('button', { name: 'Check my work', exact: true }).count() === 0, 'submittable before the plane relationships were stated');
  const wrong = await statePlanes(page, { '1-2': 'line', '1-3': 'parallel', '2-3': 'line' });
  check(/Planes 1 and 3, compare the coefficient ratio and the constant ratio/.test(wrong) && !/Your plane relationships/.test(wrong), `coincident-vs-parallel confusion got no targeted feedback: ${wrong.slice(0, 300)}`);
  check(await page.getByRole('button', { name: 'Check my work', exact: true }).count() === 0, 'submittable with wrong plane relationships');
  const right = await statePlanes(page, { '1-3': 'coincident' });
  check(/Your plane relationships/.test(right), `correct plane relationships were not accepted: ${right.slice(0, 200)}`);
  await undo(page);
  check(await page.getByRole('button', { name: 'Check the plane relationships', exact: true }).count() === 1, 'Undo did not reopen the plane relationships');
  await page.getByRole('button', { name: 'Check the plane relationships', exact: true }).click(); await settle(page, 400);

  // Change route without Reset Question — before submitting, because a correct
  // submission completes (locks) the question: Undo back into round 2, pick another pair.
  for (let i = 0; i < 12 && await page.getByRole('button', { name: 'Choose a different pair', exact: true }).count() === 0; i += 1) await undo(page);
  await locked(page, 'undone into round 2');
  check(await outcomePanel(page).count() === 0, 'the interpretation survived undoing the algebra it was built on');
  await page.getByRole('button', { name: 'Choose a different pair', exact: true }).last().click(); await settle(page, 500);
  await choosePair(page, 'Equation 2 and Equation 3');
  await scaleEquation(page, 'round2', 'Equation 2', '6', { x: '6', y: '12', z: '-24', constant: '42' }, 'dependent');
  await combineRound(page, 'round2', 'subtract', ['Equation 2', 'Equation 3'], 'x', { y: '9', z: '-15', constant: '27' }, 'dependent');
  check(await outcomePanel(page).count() === 1 && await outcomePanel(page).getByLabel('Classify your algebraic result').isVisible(), 'the new route did not ask for a fresh classification');
  await locked(page, 'new route');
  // R₁ (0 = 0) is kept from round 1, so the new route ends in the same statement —
  // and still has to be classified again, because the algebra under it changed.
  check(await page.locator('.mathmaster-reduction-subsystem').count() === 0, 'a reduced 2×2 opened although R₁ is already 0 = 0');
  await classify(page, 'identity', 'infinite');
  await openModel(page, 'dependent model, new route');
  await statePlanes(page, { '1-2': 'line', '1-3': 'coincident', '2-3': 'line' });
  const grade = await submitWork(page);
  check(grade?.isCorrect === true && /infinite/.test(grade.responseKey) && /0 = 0/.test(grade.responseKey), `submission was not the student's classified identity: ${JSON.stringify(grade)}`);
  check(await page.getByText('Correct! This question is complete.').count() === 1, 'a correct interpretation did not complete the question');
}

export async function dependentSubstitution(page, run = `dependent-sub-${Date.now()}`) {
  await open(page, '3x3-d2-cw-1', run, LAPTOP);
  await chooseVariable(page, 'x'); await choosePair(page, 'Equation 1 and Equation 2');
  await scaleEquation(page, 'round1', 'Equation 2', '2', { x: '2', y: '4', z: '-8', constant: '14' }, 'dependent-substitution');
  await combineRound(page, 'round1', 'subtract', ['Equation 1', 'Equation 2'], 'x', { y: '-3', z: '5', constant: '-9' }, 'dependent-substitution');
  await choosePair(page, 'Equation 2 and Equation 3');
  await scaleEquation(page, 'round2', 'Equation 2', '6', { x: '6', y: '12', z: '-24', constant: '42' }, 'dependent-substitution');
  await combineRound(page, 'round2', 'subtract', ['Equation 2', 'Equation 3'], 'x', { y: '9', z: '-15', constant: '27' }, 'dependent-substitution');
  await locked(page, 'reduced 2×2 open'); await noEarlyReveal(page, 'reduced 2×2 open');
  const sub = page.locator('.mathmaster-reduction-subsystem');
  await sub.getByRole('button', { name: 'Substitution', exact: true }).click(); await settle(page, 500);
  await sub.locator('button[aria-label="Isolate z in R₁"]').click(); await settle(page, 600);
  const host = solver(page);
  await host.waitFor({ timeout: 15000 });
  await balancedMove(page, host, 'Add', '3y'); await cancelTerm(page, host, '+ 3 y');
  await balancedMove(page, host, 'Divide by', '5'); await cancelFactor(page, host);
  await sub.locator('text=Isolated expression ready').waitFor({ timeout: 10000 });
  await sub.locator('button', { hasText: 'Use this expression' }).click(); await settle(page, 400);
  await sub.locator('.mathmaster-systems-substitution-token').click(); await settle(page, 200);
  await sub.locator('[aria-label^="R₂: choose where"] [data-variable="z"]').click(); await settle(page, 900);
  // The platform must not have simplified the substituted equation for them.
  check(await outcomePanel(page).count() === 0, 'substitution produced a terminal statement the student never simplified');
  await noEarlyReveal(page, 'substituted, not simplified');
  const stage = sub.locator('[data-stage="substituted-statement"]');
  check(await stage.count() === 1, 'no simplification stage after a substitution that cancels the variable');
  await setMathField(page, stage.locator('math-field[aria-label="Simplified left side"]'), '25');
  await stage.getByRole('button', { name: 'Check simplified sides', exact: true }).click(); await settle(page, 400);
  check(/Recheck the simplification of the left side/.test(await stage.innerText()), 'a wrong simplified side was not flagged');
  check(await outcomePanel(page).count() === 0, 'a wrong simplification produced a statement');
  const left = stage.locator('math-field[aria-label="Simplified left side"]');
  await setMathField(page, left, '27');
  await left.press('Enter'); await settle(page, 800);
  check(await statementShown(page) === '27=27', `the student's own statement did not reach classification: ${await statementShown(page)}`);
  await locked(page, '27 = 27 earned');
  await classify(page, 'identity', 'infinite');
  await reload(page);
  check(/Your classification/.test(await outcomePanel(page).innerText()), 'refresh after the reduced-2×2 classification lost it');
  await undo(page);
  await locked(page, 'reduced-2×2 classification undone');
  await undo(page);
  check(await page.locator('[data-stage="substituted-statement"] math-field[aria-label="Simplified left side"]').count() === 1, 'Undo did not reopen the simplification');
  check(await outcomePanel(page).count() === 0, 'the statement survived undoing its simplification');
  await page.getByRole('button', { name: 'Check simplified sides', exact: true }).click(); await settle(page, 700);
  await classify(page, 'identity', 'infinite');
  await openModel(page, 'substitution model');
  await statePlanes(page, { '1-2': 'line', '1-3': 'coincident', '2-3': 'line' });
  const grade = await submitWork(page);
  check(grade?.isCorrect === true && /27 = 27/.test(grade.responseKey), `submission was not the student's own 27 = 27: ${JSON.stringify(grade)}`);
}

export async function dependentPhone(page, run = `dependent-phone-${Date.now()}`) {
  await open(page, '3x3-d2-cw-1', run, PHONE);
  await noOverflow(page, 'CW1 phone'); await locked(page, 'CW1 phone');
  await chooseVariable(page, 'x'); await choosePair(page, 'Equation 1 and Equation 3');
  await scaleEquation(page, 'round1', 'Equation 1', '3', { x: '6', y: '3', z: '-9', constant: '15' }, 'dependent-phone');
  await combineRound(page, 'round1', 'subtract', ['Equation 1', 'Equation 3'], 'x', { y: '0', z: '0', constant: '0' }, 'dependent-phone');
  await choosePair(page, 'Equation 2 and Equation 3');
  await scaleEquation(page, 'round2', 'Equation 2', '6', { x: '6', y: '12', z: '-24', constant: '42' }, 'dependent-phone');
  await combineRound(page, 'round2', 'subtract', ['Equation 2', 'Equation 3'], 'x', { y: '9', z: '-15', constant: '27' }, 'dependent-phone');
  await noOverflow(page, 'CW1 phone interpretation');
  await classify(page, 'identity', 'infinite');
  await openModel(page, 'CW1 phone model');
  await statePlanes(page, { '1-2': 'line', '1-3': 'coincident', '2-3': 'line' });
  await noOverflow(page, 'CW1 phone planes');
  const grade = await submitWork(page);
  check(grade?.isCorrect === true, `phone submission not correct: ${JSON.stringify(grade)}`);
}

export async function inconsistentPhone(page, run = `inconsistent-phone-${Date.now()}`) {
  await open(page, '3x3-d2-pr-2', run, PHONE);
  await locked(page, 'PR2 opened'); await noEarlyReveal(page, 'PR2 opened'); await noOverflow(page, 'PR2 opened');
  await chooseVariable(page, 'x'); await choosePair(page, 'Equation 1 and Equation 3');
  await scaleEquation(page, 'round1', 'Equation 1', '3', { x: '9', y: '-3', z: '-6', constant: '12' }, 'inconsistent');
  await combineRound(page, 'round1', 'subtract', ['Equation 1', 'Equation 3'], 'x', { y: '0', z: '0', constant: '0' }, 'inconsistent');
  // The coincident pair's identity says nothing yet about Plane 2.
  check(await outcomePanel(page).count() === 0, 'the coincident pair (0 = 0) was treated as the answer for the whole inconsistent system');
  await locked(page, 'PR2 after coincident pair');
  await choosePair(page, 'Equation 1 and Equation 2');
  await scaleEquation(page, 'round2', 'Equation 1', '2', { x: '6', y: '-2', z: '-4', constant: '8' }, 'inconsistent');
  await combineRound(page, 'round2', 'subtract', ['Equation 1', 'Equation 2'], 'x', { y: '0', z: '0', constant: '-3' }, 'inconsistent');
  const statement = await statementShown(page);
  check(statement === '0=-3', `the contradiction is not the statement to classify: ${statement}`);
  check(await page.locator('.mathmaster-reduction-subsystem').count() === 0 && await page.locator('[data-destination-id]').count() === 0, 'a numeric solve opened after a contradiction');
  await locked(page, 'contradiction earned');
  await classify(page, 'identity', 'none');
  check(/Evaluate both sides/.test(await classificationHint(page)), `calling 0 = −3 an identity got no targeted feedback: ${await classificationHint(page)}`);
  await classify(page, 'contradiction', 'infinite');
  check(/Can any ordered triple/.test(await classificationHint(page)), 'contradiction-but-infinite got no targeted feedback');
  await classify(page, 'contradiction', 'none');
  await openModel(page, 'PR2 phone model');
  const wrong = await statePlanes(page, { '1-2': 'coincident', '1-3': 'coincident', '2-3': 'parallel' });
  check(/Planes 1 and 2/.test(wrong) && /constant ratio/.test(wrong), `Plane 2 called coincident got no targeted feedback: ${wrong.slice(0, 240)}`);
  const right = await statePlanes(page, { '1-2': 'parallel' });
  check(/Planes 1 and 2 are parallel and distinct\. Planes 1 and 3 are coincident \(same plane\)\. Planes 2 and 3 are parallel and distinct\./.test(right), `inconsistent geometry not accepted as stated: ${right.slice(0, 240)}`);
  await noOverflow(page, 'PR2 phone planes');
  const grade = await submitWork(page);
  check(grade?.isCorrect === true && /"none"/.test(grade.responseKey), `submission was not the classified contradiction: ${JSON.stringify(grade)}`);
  await reload(page);
  check(/Your plane relationships/.test(await page.locator('[data-stage="plane-relationships"]').innerText()), 'refresh lost the stated plane relationships');
  await undo(page);
  check(await page.getByRole('button', { name: 'Check the plane relationships', exact: true }).count() === 1, 'Undo after refresh did not reopen the plane relationships');
  check(await page.getByRole('button', { name: 'Check my work', exact: true }).count() === 0, 'still submittable after the plane relationships were undone');
}

export async function inconsistentDirect(page, run = `inconsistent-direct-${Date.now()}`) {
  await open(page, '3x3-d2-pr-2', run, LAPTOP);
  await chooseVariable(page, 'x'); await choosePair(page, 'Equation 1 and Equation 2');
  await scaleEquation(page, 'round1', 'Equation 1', '2', { x: '6', y: '-2', z: '-4', constant: '8' }, 'inconsistent-direct');
  await combineRound(page, 'round1', 'subtract', ['Equation 1', 'Equation 2'], 'x', { y: '0', z: '0', constant: '-3' }, 'inconsistent-direct');
  check(await outcomePanel(page).count() === 1, 'a contradiction from one pair did not end the elimination');
  check(await page.getByRole('button', { name: 'Equation 2 and Equation 3', exact: true }).count() === 0, 'a second pair was still demanded after a contradiction');
  await locked(page, 'contradiction, unclassified');
  await classify(page, 'contradiction', 'none');
  await openModel(page, 'PR2 laptop model');
  await statePlanes(page, { '1-2': 'parallel', '1-3': 'coincident', '2-3': 'parallel' });
  const grade = await submitWork(page);
  check(grade?.isCorrect === true, `submission not correct: ${JSON.stringify(grade)}`);
}

export async function uniqueJourney(page, run = `unique-${Date.now()}`) {
  await open(page, '3x3-d2-cw-3', run, LAPTOP);
  await locked(page, 'CW3 opened'); await noEarlyReveal(page, 'CW3 opened');
  await chooseVariable(page, 'z'); await choosePair(page, 'Equation 1 and Equation 2');
  await scaleEquation(page, 'round1', 'Equation 2', '2', { x: '4', y: '2', z: '-2', constant: '10' }, 'unique');
  await combineRound(page, 'round1', 'add', ['Equation 1', 'Equation 2'], 'z', { x: '9', y: '5', constant: '12' }, 'unique');
  await choosePair(page, 'Equation 2 and Equation 3');
  await scaleEquation(page, 'round2', 'Equation 2', '2', { x: '4', y: '2', z: '-2', constant: '10' }, 'unique');
  await combineRound(page, 'round2', 'add', ['Equation 2', 'Equation 3'], 'z', { x: '5', y: '6', constant: '26' }, 'unique');
  check(await outcomePanel(page).count() === 0, 'a unique system opened the interpretation stage');
  await subsystemElimination(page, 'x', 'unique');
  await subsystemScale(page, 'R₁', '5', { x: '45', y: '25', constant: '60' }, 'unique');
  await subsystemScale(page, 'R₂', '9', { x: '45', y: '54', constant: '234' }, 'unique');
  await subsystemCombine(page, 'subtract', 'y', '-29', '-174'); await divideOut(page, '-29', '6'); await settle(page, 1200);
  await subsystemBackSubstitute(page, '6', 0, 'y'); await simplifyProducts(page, solver(page), [[/5.*6/, '30']]);
  await balancedMove(page, solver(page), 'Subtract', '30'); await cancelTerm(page, solver(page), '+ 30'); await simplifySide(page, solver(page), 'right', '-18'); await divideOut(page, '9', '-2'); await settle(page, 1200);
  await locked(page, 'reduced 2×2 solved');
  await backSubstitute(page, 'E2', ['x', 'y']); await simplifyProducts(page, solver(page), [[/2.*-2/, '-4']]);
  await combineLikeTerms(page, solver(page), 'left', [0, 1], '2'); await closeInlineModes(page, solver(page));
  await balancedMove(page, solver(page), 'Subtract', '2'); await cancelTerm(page, solver(page), '2'); await simplifySide(page, solver(page), 'right', '3'); await divideOut(page, '-1', '-3'); await settle(page, 1200);
  await locked(page, 'all three values found, not yet verified');
  check(!/\(−2, 6, −3\)/.test(await workspaceText(page)), 'the ordered triple was stated before verification');
  await verifyAll(page, 'unique', [['2', '2'], ['5', '5'], ['16', '16']]);
  check(await page.locator('[data-stage="plane-relationships"]').count() === 0, 'a unique system asked for plane relationships');
  await openModel(page, 'unique model');
  check((await page.locator('.mathmaster-threeplane-viewport').innerText()).includes('(−2, 6, −3)'), 'the student\'s verified triple is not marked on the model');
  const grade = await submitWork(page);
  check(grade?.isCorrect === true && /"x":-2/.test(grade.responseKey) && /"z":-3/.test(grade.responseKey), `unique submission not the student's triple: ${JSON.stringify(grade)}`);
}

const JOURNEYS = {
  'dependent-direct': [dependentDirect, LAPTOP],
  'dependent-substitution': [dependentSubstitution, LAPTOP],
  'dependent-phone': [dependentPhone, PHONE],
  'inconsistent-phone': [inconsistentPhone, PHONE],
  'inconsistent-direct': [inconsistentDirect, LAPTOP],
  unique: [uniqueJourney, LAPTOP],
};

/* ------------------------------------------------------------------ runner */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = { args: ['--no-sandbox'] };
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  rmSync(ARTIFACTS, { recursive: true, force: true });
  mkdirSync(ARTIFACTS, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOURNEYS);
  const results = [];
  for (const name of selected) {
    const [journey] = JOURNEYS[name] || [];
    if (!journey) { results.push({ name, ok: false, detail: 'unknown journey' }); continue; }
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const started = Date.now();
    try {
      await journey(page, `${name}-${started}`);
      if (pageErrors.length) throw new Finding(`uncaught page error: ${pageErrors[0]}`);
      results.push({ name, ok: true, seconds: Math.round((Date.now() - started) / 1000) });
      await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
    } catch (error) {
      const where = (error.stack || '').split('\n').find((line) => /day2Nonunique|stepAlgebraDriver/.test(line)) || '';
      results.push({ name, ok: false, detail: `${error.message.split('\n')[0]} ${error instanceof Finding ? '' : where.trim()}` });
      await page.screenshot({ path: path.join(ARTIFACTS, `FAILED-${name}.png`), fullPage: true }).catch(() => {});
    }
    await context.close();
  }
  await browser.close();
  writeFileSync(path.join(ARTIFACTS, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.ok ? `  (${result.seconds}s)` : `\n      ${result.detail}`}`);
  const failed = results.filter((result) => !result.ok).length;
  console.log(`\n${results.length - failed}/${results.length} Day 2 non-unique journeys passed.`);
  process.exit(failed ? 1 : 0);
}

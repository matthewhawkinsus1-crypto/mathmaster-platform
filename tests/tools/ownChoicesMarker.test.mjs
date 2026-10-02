import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import dataModelingGrader from '../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import polynomialWorkshopGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { OWN_CHOICES, UNANSWERED, choicesAreOwn } from '../../functions/shared/toolMath/shared/judgmentChoices.mjs';
import {
  DATA_MODELING_PRESELECTED_CHOICES,
  DATA_MODELING_STARTING_CHOICES,
} from '../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';
import {
  POLYNOMIAL_WORKSHOP_PRESELECTED_SELECTIONS,
  POLYNOMIAL_WORKSHOP_STARTING_SELECTIONS,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * A STUDENT WHO CHOOSES WHAT AN EARLIER TOOL PRE-SELECTED HAS STILL ANSWERED.
 *
 * Data Modeling and the Polynomial Workshop used to open their judgments on
 * one of the options (positive / moderate / association / linear; crosses /
 * both ends rise; hole). Their shared graders read work that still holds
 * those options as untouched, so a deadline never submits a lab the student
 * only opened. Since every judgment opens on "Choose…", those same options
 * are often the student's own right answer — and a deadline used to drop
 * them as "never started". Today's tools say their choices are the student's
 * (OWN_CHOICES); only work without that marker, saved by an earlier client,
 * is read the old way. The marker never changes a verdict, only whether work
 * counts as started. Synthetic data only.
 */

const browser = (grader, question, work) => gradeToolCheck(grader, question, work);
const server = (result, question) => gradeServerResponse({ question, response: JSON.parse(JSON.stringify(result.toolResponse)) });
const verdict = (result) => ({ isCorrect: result.isCorrect, score: result.score, parts: result.parts.map((part) => [part.id, part.isCorrect]) });

// Positive, moderate data: the association the lab used to pre-select is the answer.
const MODERATE = [[1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 3], [7, 5]];
const association = { type: 'dataModelingLab', mode: 'association', points: MODERATE };
// Linear data: the family the lab used to pre-select is the answer.
const compare = { type: 'dataModelingLab', mode: 'modelCompare', points: [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]] };

// What the lab reports, keyed as DataModelingLab.jsx keys it; only the
// judgments matter to these modes.
const labWork = (choices, { own }) => ({
  r: '',
  ...DATA_MODELING_STARTING_CHOICES,
  predictionX: 6,
  predictionY: '',
  ...choices,
  ...(own ? OWN_CHOICES : {}),
});

test('the marker is one flag, and only the flag itself counts', () => {
  assert.deepEqual(OWN_CHOICES, { choicesOpenUnanswered: true });
  assert.ok(Object.isFrozen(OWN_CHOICES));
  assert.equal(choicesAreOwn(OWN_CHOICES), true);
  for (const work of [null, undefined, {}, { choicesOpenUnanswered: 'true' }, { choicesOpenUnanswered: 1 }]) {
    assert.equal(choicesAreOwn(work), false, JSON.stringify(work));
  }
});

test('Data Modeling: today\'s lab submits a student\'s chosen positive / moderate / association; an earlier client\'s untouched start stays unsubmitted', () => {
  const chosen = { direction: 'positive', strength: 'moderate', causation: 'association' };
  assert.deepEqual(chosen, { direction: DATA_MODELING_PRESELECTED_CHOICES.direction, strength: DATA_MODELING_PRESELECTED_CHOICES.strength, causation: DATA_MODELING_PRESELECTED_CHOICES.causation });

  const today = browser(dataModelingGrader, association, labWork(chosen, { own: true }));
  assert.equal(today.isCorrect, true);
  assert.equal(today.isComplete, true, 'the student chose every judgment: a deadline submits it');
  assert.equal(server(today, association).isComplete, true, 'and the server reads the marker from the same bytes');

  const earlier = browser(dataModelingGrader, association, labWork({ ...DATA_MODELING_PRESELECTED_CHOICES }, { own: false }));
  assert.equal(earlier.isComplete, false, 'an earlier client\'s work at its pre-selected start is still untouched');
  assert.equal(server(earlier, association).isComplete, false);
  assert.deepEqual(verdict(earlier), verdict(today), 'the marker never changes the verdict');

  // Today's lab as it opens is untouched with or without the marker.
  const opened = browser(dataModelingGrader, association, labWork({}, { own: true }));
  assert.deepEqual({ isComplete: opened.isComplete, isCorrect: opened.isCorrect, score: opened.score }, { isComplete: false, isCorrect: false, score: 0 });
});

test('Data Modeling: a chosen "linear" family is submitted from today\'s lab, and not from an earlier client\'s start', () => {
  const today = browser(dataModelingGrader, compare, labWork({ modelChoice: 'linear' }, { own: true }));
  assert.deepEqual({ isCorrect: today.isCorrect, isComplete: today.isComplete }, { isCorrect: true, isComplete: true });
  assert.equal(server(today, compare).isComplete, true);
  const earlier = browser(dataModelingGrader, compare, labWork({ ...DATA_MODELING_PRESELECTED_CHOICES }, { own: false }));
  assert.deepEqual({ isCorrect: earlier.isCorrect, isComplete: earlier.isComplete }, { isCorrect: true, isComplete: false });
});

test('Polynomial Workshop: today\'s chosen "hole" and "crosses / both ends rise" are submitted; an earlier client\'s start is not', () => {
  const hole = { type: 'polynomialWorkshop', mode: 'rationalFeatures', targetValue: 2 }; // the default rational function has a hole at x = 2
  const graph = { type: 'polynomialWorkshop', mode: 'graphConnection', targetRoot: 3 }; // x = 3 has multiplicity 1, degree 3, leading 1

  for (const [question, view] of [[hole, 'rationalFeatures'], [graph, 'graphConnection']]) {
    const preselected = POLYNOMIAL_WORKSHOP_PRESELECTED_SELECTIONS[view];
    const today = browser(polynomialWorkshopGrader, question, { ...preselected, ...OWN_CHOICES });
    const earlier = browser(polynomialWorkshopGrader, question, { ...preselected });
    assert.equal(today.isComplete, true, `${view}: the student chose it`);
    assert.equal(server(today, question).isComplete, true, `${view}: on the server too`);
    assert.equal(earlier.isComplete, false, `${view}: an earlier client's start is untouched`);
    assert.equal(server(earlier, question).isComplete, false);
    assert.deepEqual(verdict(earlier), verdict(today), `${view}: the verdict does not depend on the marker`);
    const opened = browser(polynomialWorkshopGrader, question, { ...POLYNOMIAL_WORKSHOP_STARTING_SELECTIONS[view], ...OWN_CHOICES });
    assert.equal(opened.isComplete, false, `${view}: today's unanswered start is untouched`);
    assert.equal(opened.isCorrect, false);
  }
  assert.equal(browser(polynomialWorkshopGrader, hole, { choice: 'hole', ...OWN_CHOICES }).isCorrect, true, 'x = 2 is a hole');
  assert.equal(browser(polynomialWorkshopGrader, hole, { choice: UNANSWERED, ...OWN_CHOICES }).isCorrect, false);
});

test('the tools report the marker with every piece of work they grade', () => {
  const lab = executableSource(readFileSync('src/tools/dataModeling/DataModelingLab.jsx', 'utf8'));
  assert.match(region(lab, '  const work = {', 'useReportToolWork(work);', 'the lab\'s work'), /\.\.\.OWN_CHOICES,/);
  const workshop = executableSource(readFileSync('src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', 'utf8'));
  for (const view of ['GraphConnection', 'RationalFeatures']) {
    // From the view's start to the work it reports: the object it grades.
    const body = region(workshop, `function ${view}(`, 'useReportToolWork(work);', view);
    assert.match(region(body, 'const work=', '\n', `${view} work`), /\.\.\.OWN_CHOICES/, `${view} reports its choices as the student's`);
  }
});

/*
 * TC11 (C1-12): A STUDENT'S CORRECTIONS REFLECTION REACHES THEIR TEACHER.
 *
 * Each Corrections skill starts with a short reflection (pick what went wrong,
 * say the fix). It used to stay on the device. The owner chose to carry it on
 * the correction response the student already sends, into the server-only plan,
 * and to show it in the teacher's per-student view. Pinned here: what the
 * server will keep (a known pick, a bounded sentence); that a skip never wipes
 * words written elsewhere; that browser and server agree on the picks; what the
 * teacher reads; and where it travels (the correction response, the teacher's
 * callable, and never a student's card).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CORRECTION_REFLECTION_CHOICE_IDS,
  CORRECTION_REFLECTION_SENTENCE_MAX,
  normalizeCorrectionReflection,
  withCorrectionReflection,
} from '../../functions/shared/testCycleReflection.mjs';
import {
  CORRECTION_REFLECTION_CHOICES,
  CORRECTION_REFLECTION_SENTENCE_MAX as CLIENT_SENTENCE_MAX,
  correctionReflectionForServer,
  saveCorrectionReflection,
} from '../../src/platform/student/correctionReflection.js';
import { describeCorrectionReflection } from '../../src/platform/teacher/correctionReflectionView.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const memory = () => {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
};

/* --- what the server keeps -------------------------------------------------- */

test('a known pick with a bounded sentence is kept; anything else is not', () => {
  assert.deepEqual(normalizeCorrectionReflection({ choice: 'misread', sentence: '  Next time, I will reread the question.  ' }), {
    skipped: false, choice: 'misread', sentence: 'Next time, I will reread the question.',
  });
  // A pick with no sentence is a reflection (the sentence is optional).
  assert.deepEqual(normalizeCorrectionReflection({ choice: 'start' }), { skipped: false, choice: 'start', sentence: '' });
  // Not a pick the step offers, no pick, or not an object: nothing to keep.
  for (const input of [{ choice: 'invented', sentence: 'x' }, { sentence: 'only words' }, { choice: 'toString' }, null, undefined, 'misread', 7, ['step']]) {
    assert.equal(normalizeCorrectionReflection(input), null, JSON.stringify(input));
  }
  // Skipped keeps no words, whatever came with it.
  assert.deepEqual(normalizeCorrectionReflection({ skipped: true, choice: 'step', sentence: 'x' }), { skipped: true, choice: null, sentence: '' });
});

test('the sentence is bounded, a single line, and free of control characters; a non-string is nothing', () => {
  const long = normalizeCorrectionReflection({ choice: 'step', sentence: 'a'.repeat(1000) });
  assert.equal(long.sentence.length, CORRECTION_REFLECTION_SENTENCE_MAX);
  assert.equal(normalizeCorrectionReflection({ choice: 'step', sentence: 'one\n\ntwo\tthree\u0000four\u007ffive' }).sentence, 'one two three four five');
  assert.equal(normalizeCorrectionReflection({ choice: 'step', sentence: { toString: () => 'x' } }).sentence, '');
  assert.equal(normalizeCorrectionReflection({ choice: 'step', sentence: 12345 }).sentence, '');
  // Markup is kept as the plain text it is: it is shown by React, never injected.
  assert.equal(normalizeCorrectionReflection({ choice: 'step', sentence: '<b>signs</b>' }).sentence, '<b>signs</b>');
});

test('the browser and the server agree on the picks and the length', () => {
  assert.deepEqual([...CORRECTION_REFLECTION_CHOICE_IDS].sort(), Object.keys(CORRECTION_REFLECTION_CHOICES).sort());
  assert.equal(CORRECTION_REFLECTION_SENTENCE_MAX, CLIENT_SENTENCE_MAX);
  // Whatever the device sends, the server keeps it as it was.
  const local = memory();
  const session = memory();
  for (const choice of Object.keys(CORRECTION_REFLECTION_CHOICES)) {
    const saved = saveCorrectionReflection({ planId: 'p', correctionId: `c-${choice}` }, { choice, sentence: `Plan for ${choice}.` }, { local, session });
    assert.deepEqual(normalizeCorrectionReflection(correctionReflectionForServer(saved)), { skipped: false, choice, sentence: `Plan for ${choice}.` });
  }
});

test('what the device sends: the pick and the sentence, or that it was skipped, and nothing before it is finished', () => {
  assert.equal(correctionReflectionForServer(null), null, 'not reflected yet');
  assert.equal(correctionReflectionForServer({ done: false, choice: 'step' }), null);
  assert.deepEqual(correctionReflectionForServer({ done: true, skipped: true, choice: null, sentence: '' }), { skipped: true });
  assert.deepEqual(correctionReflectionForServer({ done: true, skipped: false, choice: 'step', sentence: 'Check signs.' }), { choice: 'step', sentence: 'Check signs.' });
  // The tab closed: the pick is remembered, the words are not.
  assert.deepEqual(correctionReflectionForServer({ done: true, skipped: false, choice: 'step', sentence: '' }), { choice: 'step', sentence: '' });
  assert.equal(correctionReflectionForServer({ done: true, skipped: false, choice: null }), null);
  assert.equal(correctionReflectionForServer({ done: true, choice: 'step', sentence: 'x'.repeat(900) }).sentence.length, CLIENT_SENTENCE_MAX);
});

test('a reflection is kept beside the skill it names; a repeat or a worse one changes nothing', () => {
  const none = withCorrectionReflection(undefined, 'c1', { choice: 'step', sentence: 'Check signs.' }, 100);
  assert.deepEqual(none, { c1: { skipped: false, choice: 'step', sentence: 'Check signs.', at: 100 } });
  // The same again: the very same object back, so no write is made.
  assert.equal(withCorrectionReflection(none, 'c1', { choice: 'step', sentence: 'Check signs.' }, 200), none);
  // Changed words replace the old ones and say when.
  const changed = withCorrectionReflection(none, 'c1', { choice: 'misread', sentence: 'Reread it.' }, 300);
  assert.deepEqual(changed.c1, { skipped: false, choice: 'misread', sentence: 'Reread it.', at: 300 });
  // Another skill is its own; the first is untouched.
  const two = withCorrectionReflection(changed, 'c2', { skipped: true }, 400);
  assert.deepEqual([two.c1, two.c2.skipped], [changed.c1, true]);
  // Skipping on another device never wipes what was written; writing after a skip does replace it.
  assert.equal(withCorrectionReflection(none, 'c1', { skipped: true }, 500), none);
  assert.deepEqual(withCorrectionReflection(two, 'c2', { choice: 'start', sentence: '' }, 600).c2, { skipped: false, choice: 'start', sentence: '', at: 600 });
  // Nothing to keep, no skill id, or a damaged map: the map is as it was (or empty).
  assert.equal(withCorrectionReflection(none, 'c1', { choice: 'invented' }, 700), none);
  assert.equal(withCorrectionReflection(none, '', { choice: 'step' }, 700), none);
  assert.deepEqual(withCorrectionReflection('damaged', 'c1', { skipped: true }, 700), { c1: { skipped: true, choice: null, sentence: '', at: 700 } });
  assert.deepEqual(withCorrectionReflection(['array'], 'c1', null, 700), {});
});

/* --- what the teacher reads ------------------------------------------------ */

test('the teacher reads the pick in a teacher\'s words and the student\'s own sentence, or that it was skipped', () => {
  assert.deepEqual(describeCorrectionReflection({ skipped: false, choice: 'misread', sentence: 'Next time, I will reread the question and find the slope before I start.' }), {
    said: 'Said it was misreading what the question asked.',
    plan: 'Their plan: “Next time, I will reread the question and find the slope before I start.”',
  });
  assert.deepEqual(describeCorrectionReflection({ skipped: false, choice: 'pattern', sentence: '' }), { said: 'Said it was the mistake MathMaster named.', plan: null });
  assert.equal(describeCorrectionReflection({ skipped: false, choice: 'step', sentence: 'x' }).said, 'Said it was a slip in a step (a sign, a number, or the order).');
  assert.equal(describeCorrectionReflection({ skipped: false, choice: 'start', sentence: '' }).said, 'Said it was not knowing how to start.');
  assert.deepEqual(describeCorrectionReflection({ skipped: true, choice: null, sentence: '' }), { said: 'Skipped the reflection.', plan: null });
  // Nothing said, or a pick this build does not know: nothing shown.
  for (const input of [null, undefined, 'misread', { choice: 'invented' }, { choice: 'toString', sentence: 'x' }, {}]) {
    assert.equal(describeCorrectionReflection(input), null, JSON.stringify(input));
  }
  // Every pick the step offers has teacher words.
  CORRECTION_REFLECTION_CHOICE_IDS.forEach((choice) => assert.ok(describeCorrectionReflection({ choice, sentence: '' })?.said, choice));
});

/* --- where it travels ------------------------------------------------------- */

const server = executableSource(read('functions/index.js'));

test('the correction response carries it to the server, which keeps it beside the plan in the same write', () => {
  assert.match(executableSource(read('src/services/testCycleService.js')), /assignmentId, correctionId, questionInstanceId, responsePayload, reflection = null,/);
  assert.match(executableSource(read('src/services/testCycleService.js')), /\.\.\.\(reflection \? \{ reflection \} : \{\}\),/);
  const submit = region(server, 'exports.submitTestCycleCorrectionResponse = onCall(', '\n});\n', 'submitTestCycleCorrectionResponse');
  // Loaded before the transaction, never inside it.
  assert.ok(submit.indexOf('await import("./shared/testCycleReflection.mjs")') >= 0);
  assert.ok(submit.indexOf('await import("./shared/testCycleReflection.mjs")') < submit.indexOf('db.runTransaction('));
  // Normalized by the shared function, on the same write as the plan's progress.
  assert.match(submit, /const reflections = withCorrectionReflection\(stored\.reflections, correctionId, request\.data\?\.reflection, now\);/);
  assert.match(submit, /transaction\.set\(planRef, \{\s*\.\.\.stored, plan: nextPlan, activeQuestions, \.\.\.\(Object\.keys\(reflections\)\.length \? \{ reflections \} : \{\}\), updatedAt: now,\s*\}\);/);
  // It is stored OUTSIDE `plan`: the algorithm's targets and a student's card never see it.
  assert.doesNotMatch(submit, /plan:[^,]*reflection|nextPlan\.[a-z]*[Rr]eflection/);
});

test('only the teacher of record is handed it, per skill; no student payload carries it', () => {
  const plans = region(server, 'exports.getTeacherTestCyclePlans = onCall(', '\n});\n', 'getTeacherTestCyclePlans');
  assert.match(plans, /await assertTeacherMayManageAssignment\(request, assignmentSnapshot\);/);
  assert.match(plans, /reflection: correctionSnapshot\.data\(\)\?\.reflections\?\.\[target\.correctionId\] \|\| null,/);
  for (const [start, end, label] of [
    ['function studentVisibleCorrectionPlan(', '\n}\n', 'studentVisibleCorrectionPlan'],
    ['exports.getStudentTestCycle = onCall(', '\n});\n', 'getStudentTestCycle'],
    ['exports.issueTestCycleCorrectionQuestion = onCall(', '\n});\n', 'issueTestCycleCorrectionQuestion'],
  ]) {
    assert.doesNotMatch(region(server, start, end, label), /reflection/i, `${label} is a student's payload`);
  }
  // The plan document stays closed to every browser (firestore.rules), so only these two callables read it.
  assert.match(read('firestore.rules'), /match \/testCycleCorrectionPlans\/\{docId\} \{ allow read, write: if false; \}/);
});

test('the plans panel shows it under each skill, and the screens say who can read it', () => {
  const panel = executableSource(read('src/components/teacher/TestCycleControls.jsx'));
  assert.match(panel, /import \{ describeCorrectionReflection \} from '\.\.\/\.\.\/platform\/teacher\/correctionReflectionView\.js';/);
  assert.match(panel, /const reflection = describeCorrectionReflection\(target\.reflection\);/);
  assert.match(panel, /\{reflection && \(\s*<div data-correction-reflection=""[^>]*>\s*\{reflection\.said\}\{reflection\.plan \? ` \$\{reflection\.plan\}` : ''\}/);
  const step = componentSource('src/components/student/CorrectionReflectionStep.jsx');
  assert.match(step, /Your teacher can read what you pick and write here\. It does not change your grade\./);
});

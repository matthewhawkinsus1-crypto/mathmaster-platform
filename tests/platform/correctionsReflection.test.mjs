// HELP-13 (c), QA pass 3: Corrections were re-answering only. Each skill now
// starts with one short reflection — pick what went wrong from 2–3 options,
// then a "Help me say it" frame for the fix — kept on this device, because
// every corrections record is server-only (firestore.rules) and a student
// writes none of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  CORRECTION_REFLECTION_CHOICES,
  CORRECTION_REFLECTION_SENTENCE_MAX,
  correctionReflectionChoices,
  correctionReflectionFrame,
  correctionReflectionKey,
  readCorrectionReflection,
  saveCorrectionReflection,
} from '../../src/platform/student/correctionReflection.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
};
const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

const NAMED = { correctionId: 'correction-t1', diagnosis: 'misconception', misconception: 'domain-range-swapped', missed: 1 };
const STANDARD = { correctionId: 'correction-t2', diagnosis: 'standard', missed: 2 };

test('2–3 options about what happened: the recorded pattern first only when the plan names one', () => {
  assert.deepEqual(correctionReflectionChoices(NAMED).map((option) => option.id), ['pattern', 'misread', 'step']);
  assert.deepEqual(correctionReflectionChoices(STANDARD).map((option) => option.id), ['misread', 'step', 'start']);
  // A misconception diagnosis with no message names nothing, so offers no "named above".
  assert.deepEqual(correctionReflectionChoices({ diagnosis: 'misconception', misconception: 'legacy-text' }).map((option) => option.id), ['misread', 'step', 'start']);
});

test('every Help me say it frame is a starter with a blank, in English and Spanish, with no value in it', () => {
  Object.values(CORRECTION_REFLECTION_CHOICES).forEach((option) => {
    const frame = correctionReflectionFrame(option.id);
    assert.equal(frame, option.frame);
    for (const line of [frame.en, frame.es]) {
      assert.match(line, /_____/, `${option.id} has a blank`);
      assert.doesNotMatch(line, /\d/, `${option.id} carries no number`);
    }
  });
  assert.equal(correctionReflectionFrame('toString'), null, 'own options only');
  assert.equal(correctionReflectionFrame(null), null);
});

test('kept on this device: the pick in localStorage, the sentence only in sessionStorage, per student plan and skill', () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const ids = { planId: 'corrections|A1|S1|bp', correctionId: 'correction-t1' };
  assert.equal(readCorrectionReflection(ids, { local, session }), null, 'not reflected yet');
  const saved = saveCorrectionReflection(ids, { choice: 'step', sentence: '  Next time, I will check each step, especially signs.  ' }, { local, session });
  assert.deepEqual(saved, { done: true, choice: 'step', skipped: false, sentence: 'Next time, I will check each step, especially signs.' });
  const key = correctionReflectionKey(ids);
  assert.deepEqual(JSON.parse(local.getItem(key)), { done: true, choice: 'step', skipped: false });
  assert.doesNotMatch(local.getItem(key), /signs/, 'the words never reach localStorage');
  assert.equal(session.getItem(key), 'Next time, I will check each step, especially signs.');
  assert.deepEqual(readCorrectionReflection(ids, { local, session }), saved);
  // Another student on the same Chromebook, same assignment and skill: a different plan.
  assert.equal(readCorrectionReflection({ ...ids, planId: 'corrections|A1|S2|bp' }, { local, session }), null);
  // The tab closed: the pick is remembered, the sentence is not.
  assert.equal(readCorrectionReflection(ids, { local, session: memoryStorage() }).sentence, '');
});

test('skipping is remembered without a pick; long text is bounded; blocked storage never throws', () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const ids = { planId: 'p', correctionId: 'c' };
  assert.deepEqual(saveCorrectionReflection(ids, { skipped: true, choice: 'step', sentence: 'x' }, { local, session }), { done: true, choice: null, skipped: true, sentence: '' });
  assert.equal(session.map.size, 0);
  assert.equal(readCorrectionReflection(ids, { local, session }).skipped, true);
  const long = saveCorrectionReflection({ planId: 'p', correctionId: 'd' }, { choice: 'misread', sentence: 'a'.repeat(1000) }, { local, session });
  assert.equal(long.sentence.length, CORRECTION_REFLECTION_SENTENCE_MAX);
  assert.equal(saveCorrectionReflection(ids, { choice: 'invented' }, { local, session }).choice, null, 'own options only');
  assert.doesNotThrow(() => saveCorrectionReflection(ids, { choice: 'step', sentence: 'y' }, { local: throwing, session: throwing }));
  assert.equal(readCorrectionReflection(ids, { local: throwing, session: throwing }), null, 'asked again');
  local.setItem(correctionReflectionKey(ids), JSON.stringify({ choice: 'step' }));
  assert.equal(readCorrectionReflection(ids, { local, session }), null, 'only a finished reflection counts');
  local.setItem(correctionReflectionKey(ids), '{not json');
  assert.equal(readCorrectionReflection(ids, { local, session }), null);
});

test('the screen asks first, then shows the question; a reflected skill goes straight to it with the plan shown', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const previous = globalThis.window;
  try {
    const { TestCycleCorrections } = await server.ssrLoadModule('/src/components/student/TestCycleCorrections.jsx');
    const corrections = { planId: 'corrections|A1|S1|bp', targets: [{ ...NAMED, label: 'Domain and range', requiredCorrectResponses: 1, correctResponses: 0 }] };
    const render = () => renderToStaticMarkup(React.createElement(TestCycleCorrections, { assignmentId: 'A1', corrections }));

    const first = render();
    assert.match(first, /data-corrections-reflection=""/);
    assert.match(first, /Before you start: what went wrong\?/);
    assert.match(first, /The mistake named above/);
    assert.match(first, /type="radio"/);
    assert.match(first, /Skip for now/);
    assert.doesNotMatch(first, /aria-label="Corrections question"/, 'the question waits behind the reflection');
    assert.match(first, /data-corrections-pattern=""/, 'the named pattern is on the same screen');

    // A skill already under way is not asked again (another device, say).
    const underWay = renderToStaticMarkup(React.createElement(TestCycleCorrections, {
      assignmentId: 'A1', corrections: { ...corrections, targets: [{ ...corrections.targets[0], requiredCorrectResponses: 2, correctResponses: 1 }] },
    }));
    assert.doesNotMatch(underWay, /data-corrections-reflection=""/);
    assert.match(underWay, /aria-label="Corrections question"/);

    const local = memoryStorage();
    const session = memoryStorage();
    saveCorrectionReflection({ planId: corrections.planId, correctionId: NAMED.correctionId }, { choice: 'pattern', sentence: 'Next time, I will check for that mistake by testing a point.' }, { local, session });
    globalThis.window = { localStorage: local, sessionStorage: session };
    const after = render();
    assert.doesNotMatch(after, /data-corrections-reflection=""/);
    assert.match(after, /aria-label="Corrections question"/);
    assert.match(after, /<strong>Your plan:<\/strong> Next time, I will check for that mistake by testing a point\./);
  } finally {
    globalThis.window = previous;
    await server.close();
  }
});

test('the reflection step offers Help me say it with the frame, and nothing about it leaves the device', () => {
  const screen = componentSource('src/components/student/TestCycleCorrections.jsx');
  assert.match(screen, /^import CorrectionReflectionStep from '\.\/CorrectionReflectionStep\.jsx';$/m);
  const step = region(componentSource('src/components/student/CorrectionReflectionStep.jsx'), 'export const CorrectionReflectionStep = (', '\n};\n', 'reflection step');
  assert.match(step, /const chosenFrame = correctionReflectionFrame\(choice\);/);
  assert.match(step, />💬 Help me say it<\/button>/);
  assert.match(step, /\{chosenFrame\.en\}/);
  assert.match(step, /lang="es"[^>]*>\{chosenFrame\.es\}/);
  assert.match(step, /if \(!sentence\.trim\(\) && chosenFrame\) setSentence\(chosenFrame\.en\);/);
  assert.match(step, /disabled=\{!choice\} onClick=\{\(\) => onDone\(\{ choice, sentence \}\)\}/);
  // Saved through the device store only; the callables never carry it.
  const finish = region(screen, 'const finishReflection = (answer) => {', '};', 'finish reflection');
  assert.match(finish, /saveCorrectionReflection\(\{ planId, correctionId: activeTarget\.correctionId \}, answer\)/);
  assert.match(finish, /document\.querySelector\('\[data-test-cycle-corrections="working"\] \[data-corrections-heading\]'\)\?\.focus\(\)/, 'focus is not dropped when the step closes');
  const submit = region(screen, 'await submitTestCycleCorrectionResponse({', '});', 'corrections submit payload');
  assert.doesNotMatch(submit, /reflection|sentence|choice/);
  const model = executableSource(readFileSync(new URL('../../src/platform/student/correctionReflection.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(model, /firebase|firestore|httpsCallable|services\//, 'the reflection model has no server path');
});

/*
 * A DEADLINE NEVER SUBMITS A QUESTION THE STUDENT ONLY OPENED.
 *
 * Every server-gradable surface is now checkpoint-eligible, and many open
 * with every graded input already holding a value (a pre-selected radio, a
 * starting line, default selects), so their opening state can read as
 * "complete". QuestionEngine therefore checkpoints only a response the
 * student changed after interacting with the question in this session; a
 * draft restored from an earlier session was checkpointed when it was made.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { responseSignature, studentChangedResponse } from '../../src/platform/performance/responseCheckpoint.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

const toolState = (value, isComplete = true) => ({
  isComplete,
  responseKey: value,
  toolResponse: { kind: 'tool', toolId: 'dataModelingLab', value },
});

test('the opening response — defaults or a restored draft — is never a change', () => {
  const opening = toolState('{"modelChoice":"linear"}');
  const openingSignature = responseSignature(opening);
  assert.equal(studentChangedResponse({ interacted: false, openingSignature, answerState: opening }), false);
  // Tapping, scrolling or enlarging is an interaction, but not a change.
  assert.equal(studentChangedResponse({ interacted: true, openingSignature, answerState: opening }), false);
  // A change the student did not make (no interaction) does not count either.
  assert.equal(studentChangedResponse({ interacted: false, openingSignature, answerState: toolState('{"modelChoice":"quadratic"}') }), false);
  // The student touched it and it changed.
  assert.equal(studentChangedResponse({ interacted: true, openingSignature, answerState: toolState('{"modelChoice":"quadratic"}') }), true);
});

test('the signature sees every part of the response a checkpoint carries', () => {
  const base = { isComplete: true, responseKey: '7', toolResponse: null };
  const signature = responseSignature(base);
  assert.notEqual(responseSignature({ ...base, isComplete: false }), signature);
  assert.notEqual(responseSignature({ ...base, responseKey: '8' }), signature);
  assert.notEqual(responseSignature({ ...base, toolResponse: { value: '{}' } }), signature);
  // Grading output is not part of it: re-grading the same work changes nothing.
  assert.equal(responseSignature({ ...base, isCorrect: true, partialCreditPercent: 100 }), signature);
});

test('QuestionEngine checkpoints only after the student changes the response', () => {
  const source = componentSource('src/QuestionEngine.jsx');
  const block = region(source, 'const checkpointAllowed = Boolean(onResponseCheckpoint)', 'checkpointPendingRef.current = { eligible: checkpointPending');
  // The opening signature follows the screen only until the first interaction.
  assert.match(block, /if \(!studentInteractedRef\.current\) openingResponseSignatureRef\.current = responseSignature\(answerState\);/);
  // A new question starts uninteracted, decided during render.
  assert.match(block, /if \(checkpointIdentityRef\.current !== checkpointIdentity\) \{[\s\S]*?studentInteractedRef\.current = false;/);
  // The first checkpoint needs a complete response the student changed; once
  // one is written, every revision (including a cleared answer) follows.
  assert.match(block, /Boolean\(answerState\.isComplete && answerState\.responseKey\) && studentChangedResponse\(\{[\s\S]*?interacted: studentInteractedRef\.current,[\s\S]*?openingSignature: openingResponseSignatureRef\.current,[\s\S]*?\}\)\)\s*\|\| checkpointWrittenRef\.current/);

  // Every way a student works a question marks the interaction, on the
  // question's root (React delivers portal events — Work View — here too).
  const root = region(source, 'ref={questionEngineRef}', 'const multipart = isComposed');
  assert.match(root, /onPointerDownCapture=\{markStudentInteraction\}/);
  assert.match(root, /onInputCapture=\{markStudentInteraction\}/);
  assert.match(root, /onChangeCapture=\{markStudentInteraction\}/);
  assert.match(root, /onKeyDownCapture=\{\(event\) => \{\s*markStudentInteraction\(\);/);
  assert.match(source, /const markStudentInteraction = useCallback\(\(\) => \{\s*studentInteractedRef\.current = true;\s*\}, \[\]\);/);
});

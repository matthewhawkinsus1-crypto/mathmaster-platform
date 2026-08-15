import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStudentSupportToQuestion,
  getStudentSupportPresentation,
} from '../../src/studentSupport.js';

test('the algebra Apply shortcut is off by default and is not granted by unrelated accommodations', () => {
  assert.equal(getStudentSupportPresentation({}).algebraAutoApply, false);
  assert.equal(getStudentSupportPresentation({ accommodations: ['large-text', 'extra-time'] }).algebraAutoApply, false);
});

test('the algebra Apply shortcut requires its explicit accommodation', () => {
  assert.equal(getStudentSupportPresentation({ accommodations: ['algebra-auto-apply'] }).algebraAutoApply, true);
  const spoofed = applyStudentSupportToQuestion(
    { type: 'stepAlgebra', supportPresentation: { algebraAutoApply: true } },
    {},
  ).question;
  assert.equal(spoofed.supportPresentation.algebraAutoApply, false, 'authoring JSON cannot self-grant the shortcut');
});

test('author JSON cannot self-grant prefilled algebra steps', () => {
  const rawQuestion = { type: 'stepAlgebra', equation: 'd=r*t', solveFor: 't', prefillFirstStep: true, supportEntitlements: { prefillFirstStep: true } };
  const unsupported = applyStudentSupportToQuestion(rawQuestion, { accommodations: ['large-text'] }).question;
  assert.equal(Boolean(unsupported.supportEntitlements?.prefillFirstStep), false);

  const supported = applyStudentSupportToQuestion(rawQuestion, { modifications: ['prefill-first-step'] }).question;
  assert.equal(supported.supportEntitlements?.prefillFirstStep, true);
});

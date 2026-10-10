// WHICH EXAM TOOLS A SECURE ITEM OFFERS (src/platform/assessment/secureExamTools.js).
//
// The reference sheet is a promise only the Digital SAT makes; the graphing
// calculator follows the same calculator rule every secure item already uses
// (resolveExamCalculatorPolicy). These tests hold the resolver to both — and
// to the one trap in the policy table: getExamPolicy falls back to the SAT for
// an exam type it does not know, which once put the SAT's tools on a course
// test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_SHEETS, isKnownExamType, referenceSheetForExam, resolveSecureExamTools } from '../../src/platform/assessment/secureExamTools.js';
import { COURSE_TEST_EXAM_TYPE, EXAM_POLICIES, getExamPolicy, resolveExamCalculatorPolicy } from '../../src/platform/policies/examPolicyResolver.js';
import { CALCULATOR_MODES } from '../../src/platform/policies/calculatorPolicy.js';

const item = (fields = {}) => ({ questionInstanceId: 'q1', prompt: 'p', calculatorPolicy: 'inherit', examCalculatorMode: null, ...fields });

test('the Digital SAT gets its reference sheet and the graphing calculator on every item', () => {
  for (const question of [item(), item({ calculatorPolicy: 'none' }), null]) {
    const tools = resolveSecureExamTools({ examType: 'digitalSAT', sessionCalculatorMode: 'graphing', question });
    assert.equal(tools.referenceSheet, true);
    assert.equal(tools.referenceSheetId, REFERENCE_SHEETS.SAT_MATH);
    assert.equal(tools.graphingCalculator, true, 'the SAT allows a calculator on all math questions');
  }
});

test('only an exam whose policy promises a formula sheet gets one — the ACT, TSIA2, ASVAB and a course test do not', () => {
  for (const [examType, policy] of Object.entries(EXAM_POLICIES)) {
    assert.equal(
      resolveSecureExamTools({ examType, question: item() }).referenceSheet,
      policy.formulaSheet === REFERENCE_SHEETS.SAT_MATH,
      `${examType} formulaSheet is ${policy.formulaSheet}`,
    );
  }
  assert.equal(referenceSheetForExam('act'), null);
  assert.equal(referenceSheetForExam(COURSE_TEST_EXAM_TYPE), null);
  assert.equal(resolveSecureExamTools({ examType: COURSE_TEST_EXAM_TYPE, sessionCalculatorMode: 'graphing', question: item() }).referenceSheet, false);
});

test('an exam type the policy table does not name gets no tools, not the SAT fallback', () => {
  // getExamPolicy would answer with the SAT policy here — the old course-test bug.
  assert.equal(getExamPolicy('sat').examType, 'digitalSAT');
  for (const examType of ['sat', 'digitalSat', '', null, undefined, 'courseTests', 42]) {
    const tools = resolveSecureExamTools({ examType, sessionCalculatorMode: 'graphing', question: item({ calculatorPolicy: 'graphing' }) });
    assert.deepEqual(
      { referenceSheet: tools.referenceSheet, graphingCalculator: tools.graphingCalculator },
      { referenceSheet: false, graphingCalculator: false },
      `${String(examType)} must not be treated as the SAT`,
    );
    assert.equal(isKnownExamType(examType), false);
  }
});

test('no calculator on an item means no graphing calculator on it', () => {
  // TSIA2: item-level calculator; none unless the item names one.
  assert.equal(resolveSecureExamTools({ examType: 'tsia2', question: item() }).graphingCalculator, false);
  assert.equal(resolveSecureExamTools({ examType: 'tsia2', question: item({ examCalculatorMode: 'basic' }) }).graphingCalculator, false, 'a basic calculator is not a graphing one');
  assert.equal(resolveSecureExamTools({ examType: 'tsia2', question: item({ examCalculatorMode: 'graphing' }) }).graphingCalculator, true);
  // ASVAB: no calculator, and a support-plan calculator needs a proctor's confirmation.
  assert.equal(resolveSecureExamTools({ examType: 'asvab', question: item() }).graphingCalculator, false);
  const graphingPlan = { accommodations: ['calculator-graphing'] };
  assert.equal(resolveSecureExamTools({ examType: 'asvab', question: item(), studentSupportProfile: graphingPlan }).graphingCalculator, false);
  assert.equal(resolveSecureExamTools({ examType: 'asvab', question: item(), studentSupportProfile: graphingPlan, accommodationConfirmed: true }).graphingCalculator, true);
  // Course test: the blueprint's session setting wins; questionSpecific defers to the item.
  assert.equal(resolveSecureExamTools({ examType: COURSE_TEST_EXAM_TYPE, sessionCalculatorMode: 'questionSpecific', question: item({ calculatorPolicy: 'none' }) }).graphingCalculator, false);
  assert.equal(resolveSecureExamTools({ examType: COURSE_TEST_EXAM_TYPE, sessionCalculatorMode: 'questionSpecific', question: item({ calculatorPolicy: 'graphing' }) }).graphingCalculator, true);
  assert.equal(resolveSecureExamTools({ examType: COURSE_TEST_EXAM_TYPE, sessionCalculatorMode: 'scientific', question: item({ calculatorPolicy: 'graphing' }) }).graphingCalculator, false, 'a scientific test gets the scientific calculator only');
  assert.equal(resolveSecureExamTools({ examType: COURSE_TEST_EXAM_TYPE, sessionCalculatorMode: 'none', question: item({ calculatorPolicy: 'graphing' }) }).graphingCalculator, false);
  // The ACT's policy is a graphing calculator for the math section.
  assert.equal(resolveSecureExamTools({ examType: 'act', question: item() }).graphingCalculator, true);
});

test('the graphing decision is exactly resolveExamCalculatorPolicy\'s — available AND graphing — across every exam and setting', () => {
  const examTypes = [...Object.keys(EXAM_POLICIES), COURSE_TEST_EXAM_TYPE];
  const sessionModes = [null, 'questionSpecific', ...Object.values(CALCULATOR_MODES)];
  const itemModes = [null, 'inherit', 'none', 'basic', 'scientific', 'graphing', 'squareRoot'];
  const profiles = [null, { accommodations: ['calculator'] }, { accommodations: ['calculator-graphing'] }];
  let compared = 0;
  for (const examType of examTypes) {
    for (const sessionCalculatorMode of sessionModes) {
      for (const mode of itemModes) {
        for (const studentSupportProfile of profiles) {
          for (const accommodationConfirmed of [false, true]) {
            const question = item({ calculatorPolicy: mode, examCalculatorMode: mode });
            const expected = resolveExamCalculatorPolicy({ examType, questionSpec: { ...question, sessionCalculatorMode }, studentSupportProfile, accommodationConfirmed, isComputationSkill: false });
            const tools = resolveSecureExamTools({ examType, sessionCalculatorMode, question, studentSupportProfile, accommodationConfirmed });
            assert.equal(tools.graphingCalculator, expected.available === true && expected.mode === CALCULATOR_MODES.GRAPHING, `${examType}/${sessionCalculatorMode}/${mode}`);
            assert.deepEqual(tools.calculatorPolicy, expected);
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared > 500);
});

test('a calculator policy the runtime already resolved is used as is, so the two can never disagree', () => {
  const resolved = { available: false, mode: 'none', source: 'courseTestPolicy' };
  const tools = resolveSecureExamTools({ examType: 'digitalSAT', question: item(), calculatorPolicy: resolved });
  assert.equal(tools.graphingCalculator, false);
  assert.equal(tools.calculatorPolicy, resolved);
  assert.equal(tools.referenceSheet, true, 'the sheet is the exam\'s, whatever the item\'s calculator');
  // A policy that names the graphing mode but is not available (a support-plan
  // calculator still waiting for the proctor) offers nothing.
  const pending = { available: false, mode: CALCULATOR_MODES.GRAPHING, source: 'accommodationPending' };
  assert.equal(resolveSecureExamTools({ examType: 'asvab', question: item(), calculatorPolicy: pending }).graphingCalculator, false);
});

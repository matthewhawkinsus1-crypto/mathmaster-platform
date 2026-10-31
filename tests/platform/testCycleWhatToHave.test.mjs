/*
 * TC16: WHAT A STUDENT NEEDS FOR THE TEST, SAID ONCE.
 *
 * Neither the Test Cycle card nor Tests & Exams said anything about what to
 * have for a Test (C2-142), and the card carried its own copy of the sentence
 * about its length (C2-147). One helper now words both lines
 * (assignedTestCyclesModel.js) and both screens print it.
 *
 * What is claimed is only what the platform knows: the calculator rule from the
 * Test's own setting, in the start screen's words, and that the device should be
 * charged. Nothing about paper: no setting says what a class allows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import {
  TEST_CYCLE_DEVICE_LINE,
  assignedTestCycleRow,
  sessionBringText,
  testCycleBringText,
  testCycleDeliveryText,
} from '../../src/platform/student/assignedTestCyclesModel.js';
import { calculatorRule, startScreenRules } from '../../src/platform/assessment/secureExamNavigationModel.js';

const card = componentSource('src/components/student/TestCycleCard.jsx');
const dashboard = componentSource('src/components/assessment/StudentSecureExamDashboard.jsx');

const withMode = (calculatorMode) => ({ stage: 'test', delivery: { timed: false, questionCount: 12, ...(calculatorMode === undefined ? {} : { calculatorMode }) } });

test('the line is a charged device and the Test\'s own calculator rule, in the start screen\'s words', () => {
  assert.equal(testCycleBringText(withMode('none')), `${TEST_CYCLE_DEVICE_LINE} There is no calculator on this test.`);
  assert.equal(testCycleBringText(withMode('questionSpecific')), `${TEST_CYCLE_DEVICE_LINE} A calculator appears only on questions where your teacher allows one.`);
  assert.equal(testCycleBringText(withMode('graphing')), `${TEST_CYCLE_DEVICE_LINE} A graphing calculator is available on this test.`);
  assert.equal(TEST_CYCLE_DEVICE_LINE, 'Have your device charged.');
  // A Test whose setting says nothing is the default, which is "only where the teacher allows one".
  assert.equal(testCycleBringText(withMode(undefined)), testCycleBringText(withMode('questionSpecific')));
});

test('a setting\'s own spelling is never shown to a student', () => {
  assert.equal(testCycleBringText(withMode('squareRoot')), `${TEST_CYCLE_DEVICE_LINE} A square root calculator is available on this test.`);
  for (const mode of ['none', 'questionSpecific', 'basic', 'squareRoot', 'scientific', 'graphing']) {
    assert.doesNotMatch(testCycleBringText(withMode(mode)), /[a-z][A-Z]/, `${mode}: no camelCase word`);
  }
});

test('the card and the start screen say the calculator rule in the same words', () => {
  // One sentence per mode, authored in calculatorRule: the start screen prints it too.
  for (const mode of ['none', 'questionSpecific', 'scientific', 'squareRoot']) {
    assert.ok(testCycleBringText(withMode(mode)).endsWith(calculatorRule(mode)), mode);
    assert.ok(startScreenRules({ courseTest: true, calculatorMode: mode }).includes(calculatorRule(mode)), `${mode}: on the start screen`);
  }
});

test('no delivery facts, nothing said (a look that returned none)', () => {
  assert.equal(testCycleBringText({ stage: 'test' }), null);
  assert.equal(testCycleBringText({}), null);
  assert.equal(testCycleBringText(), null);
});

test('the Tests & Exams row carries the same line as the card, from the same card', () => {
  const previewCard = {
    hasSecureSession: false,
    assignmentId: 'u3',
    title: 'Unit 3 Test',
    stage: 'test',
    delivery: { timed: false, questionCount: 12, calculatorMode: 'none' },
    schedule: null,
  };
  const row = assignedTestCycleRow({ card: previewCard, now: Date.parse('2026-10-16T12:00:00Z') });
  assert.equal(row.bring, testCycleBringText(previewCard));
  assert.equal(row.bring, 'Have your device charged. There is no calculator on this test.');
  // ...next to, not instead of, how long it is.
  assert.equal(row.delivery, 'Test is not timed. 12 questions.');
  // No delivery facts: no line, and the row is still a row.
  const bare = assignedTestCycleRow({ card: { ...previewCard, delivery: null }, now: Date.parse('2026-10-16T12:00:00Z') });
  assert.equal(bare.bring, null);
  assert.equal(bare.delivery, null);
});

test('a listed course-Test session says it from its own calculator mode, and says nothing when it recorded none', () => {
  assert.equal(sessionBringText({ calculatorMode: 'none' }), 'Have your device charged. There is no calculator on this test.');
  assert.equal(sessionBringText({ calculatorMode: 'scientific' }), 'Have your device charged. A scientific calculator is available on this test.');
  assert.equal(sessionBringText({}), null);
  assert.equal(sessionBringText(null), null);
});

test('the card\'s sentence about the sitting is the helper\'s, so the card and the row cannot say different things', () => {
  // Same card in, same words out: the card prints testCycleDeliveryText and the row prints it too.
  const shared = { stage: 'retestReady', delivery: { timed: true, timeLimitMinutes: 40, extendedTimeMultiplier: 1.5, questionCount: 10 } };
  assert.equal(testCycleDeliveryText(shared), 'Retest is timed: 40 minutes once you start, including your extended time.');
  assert.equal(assignedTestCycleRow({ card: { ...shared, hasSecureSession: false, assignmentId: 'u3' } }).delivery, testCycleDeliveryText(shared));
});

test('the screens print the line only where a sitting is ahead, and the row never offers a way into a session', () => {
  const facts = region(card, '{/* The facts a student would otherwise have to ask about. */}', '</div>', 'facts');
  // Beside the delivery sentence, under the same rule: not in Corrections, after a submit, or once the cycle is done.
  assert.match(card, /const bringText = testCycleBringText\(card\);/);
  assert.match(facts, /\{bringText && sittingAhead && \(\s*<p data-test-cycle-bring="" style=\{factStyle\}>\{bringText\}<\/p>\s*\)\}/);
  // Tests & Exams: the assigned row prints the row's own line; a listed session only while it is not finished.
  const assigned = region(dashboard, '{group.assigned.map((row) => (', '</article>', 'assigned row');
  assert.match(assigned, /\{row\.bring && <div data-test-cycle-bring=""/);
  assert.match(dashboard, /const bring = isCourseTest\(session\) && !done \? sessionBringText\(session\) : null;/);
  assert.match(dashboard, /\{bring && <div data-test-cycle-bring=""/);
  assert.doesNotMatch(executableSource(assigned), /startSecureExam|setActive/, 'a line of words is not a way into the Test');
});

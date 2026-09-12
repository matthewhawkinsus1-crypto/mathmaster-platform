import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MIN_TOUCH_TARGET_PX } from '../../src/platform/mobile/mobileInteractionFoundation.js';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const findings = JSON.parse(read('./fixtures/gradeCenterMobileFindings.json'));

const gradeCenter = read('../../src/components/student/StudentGradeCenter.jsx');
const result = read('../../src/components/student/StudentAssignmentResult.jsx');
const breakdown = read('../../src/components/student/GradeSectionBreakdown.jsx');

/*
 * A GRADE SCREEN IS A PHONE SCREEN.
 *
 * "Check my grade" happens on a phone, between classes, one-handed. The
 * measured half of this is recorded by tests/browser/gradeCenterMobile.mjs
 * driving the real components in a real browser at 390px; CI cannot launch a
 * browser, so the fixture it writes is asserted here alongside a static
 * contract that fails when the layout rules are removed from the source.
 */

test('the Grade Center and Assignment Result measured clean on a 390px phone', () => {
  // Recorded by tests/browser/gradeCenterMobile.mjs: no sideways page scroll,
  // no element past the screen edge, no tap target under 44px, and the exits
  // (Home, View All Grades, Practice) present and on screen.
  assert.deepEqual(
    findings.findings,
    [],
    `phone layout problems:\n${JSON.stringify(findings.findings, null, 2)}`,
  );
  assert.equal(findings.viewport.width, 390);
  assert.equal(findings.minTapTargetPx, MIN_TOUCH_TARGET_PX);
});

test('every grade control is sized from the shared minimum tap target', () => {
  // Binding to the constant rather than to the number means a change to the
  // platform's touch-target policy reaches these screens automatically, and a
  // hand-typed 32 here would not silently pass.
  for (const [name, source] of [['StudentGradeCenter', gradeCenter], ['StudentAssignmentResult', result]]) {
    assert.match(source, /MIN_TOUCH_TARGET_PX/, `${name} must size its controls from MIN_TOUCH_TARGET_PX`);
    assert.match(
      source,
      /minHeight: MIN_TOUCH_TARGET_PX/,
      `${name} must apply the minimum tap height to its controls`,
    );
  }
});

test('nothing on a grade screen can force the page wider than the phone', () => {
  // Two rules do all the work at 390px, and both are easy to delete by
  // accident: grids that collapse to one column, and text that is allowed to
  // break rather than pushing its container open.
  for (const [name, source] of [
    ['StudentGradeCenter', gradeCenter],
    ['StudentAssignmentResult', result],
    ['GradeSectionBreakdown', breakdown],
  ]) {
    assert.match(source, /overflowWrap: 'anywhere'/, `${name} must let long titles/scores wrap`);
  }
  assert.match(
    breakdown,
    /repeat\(auto-fit, minmax\(min\(100%, \d+px\), 1fr\)\)/,
    'the section breakdown must collapse to one column rather than holding a fixed track width',
  );
  // A fixed pixel width wider than a phone is the other way this breaks. Only
  // max-width and min-width:0 are legitimate here.
  const layoutSource = executableSource(`${gradeCenter}\n${result}\n${breakdown}`);
  const fixedWidths = [...layoutSource.matchAll(/(?<!max|min)[wW]idth: (\d+)(?![%\w])/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 390);
  assert.deepEqual(fixedWidths, [], 'no grade surface may hard-code a width wider than a 390px phone');
});

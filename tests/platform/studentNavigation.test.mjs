// Back means one logical level up. Not Home.
//
// Every exit in the student app resolved to the assignments list, which is
// correct exactly once — from that list's own children — and wrong everywhere
// else. A student inside a Path session who pressed exit landed two levels away
// from the work they were doing.
//
// Nothing about that ERRORS, which is why it survives: the student simply does
// more work than they should to get back to where they were, and the app feels
// like it forgets them.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVEL, LEVEL_LABEL, breadcrumb, depthOf, parentOf, resolveBack, resolveErrorExit,
} from '../../src/platform/student/navigationModel.js';

// --- The rule -------------------------------------------------------------------

test('the brief\'s assignments trail walks back one level at a time', () => {
  // Question → Assignment → Assignments → Home
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_QUESTION).level, LEVEL.ASSIGNMENT);
  assert.equal(resolveBack(LEVEL.ASSIGNMENT).level, LEVEL.ASSIGNMENTS);
  assert.equal(resolveBack(LEVEL.ASSIGNMENTS).level, LEVEL.HOME);
});

test('the brief\'s Path trail walks back one level at a time', () => {
  // Question → Path Session → My Math Path → Home
  assert.equal(resolveBack(LEVEL.PATH_QUESTION).level, LEVEL.PATH_SESSION);
  assert.equal(resolveBack(LEVEL.PATH_SESSION).level, LEVEL.MATH_PATH);
  assert.equal(resolveBack(LEVEL.MATH_PATH).level, LEVEL.HOME);
});

test('the brief\'s CCMR trail walks back one level at a time', () => {
  assert.equal(resolveBack(LEVEL.CCMR_SESSION).level, LEVEL.CCMR_PATHWAY);
  assert.equal(resolveBack(LEVEL.CCMR_PATHWAY).level, LEVEL.CCMR);
  assert.equal(resolveBack(LEVEL.CCMR).level, LEVEL.HOME);
});

test('Back is never a shortcut to Home from a deep screen', () => {
  // The specific defect. Anything more than one level down must land on its own
  // parent, never on Home.
  const deep = [
    LEVEL.ASSIGNMENT_QUESTION, LEVEL.ASSIGNMENT,
    LEVEL.PATH_QUESTION, LEVEL.PATH_SESSION, LEVEL.PATH_SKILL,
    LEVEL.CCMR_SESSION, LEVEL.CCMR_PATHWAY,
    LEVEL.PRACTICE_HISTORY,
  ];
  deep.forEach((level) => {
    assert.notEqual(resolveBack(level).level, LEVEL.HOME,
      `${level} jumped straight to Home instead of going up one level`);
  });
});

test('Home has no Back, and says so rather than offering a dead button', () => {
  assert.equal(resolveBack(LEVEL.HOME), null);
  assert.equal(parentOf(LEVEL.HOME), null);
});

test('every level except Home has a parent, so no screen can strand a student', () => {
  Object.values(LEVEL).forEach((level) => {
    if (level === LEVEL.HOME) return;
    assert.ok(parentOf(level), `${level} has no parent — a student there has nowhere to go`);
  });
});

test('a Back button names its destination, not its direction', () => {
  // "Back" alone tells a student nothing. They should know where it goes before
  // they press it.
  const back = resolveBack(LEVEL.PATH_SESSION);
  assert.equal(back.label, 'Back to My Math Path');
  assert.ok(!/^Back$/.test(back.label));
});

test('no level is labelled with its internal name', () => {
  Object.entries(LEVEL_LABEL).forEach(([level, label]) => {
    assert.ok(label && label.length > 0, `${level} has no student-facing label`);
    assert.notEqual(label, level, `${level} shows its internal name to a student`);
  });
});

// --- Where am I? -----------------------------------------------------------------

test('a breadcrumb answers "where am I" without pressing anything', () => {
  assert.deepEqual(breadcrumb(LEVEL.PATH_QUESTION), [
    LEVEL.HOME, LEVEL.MATH_PATH, LEVEL.PATH_SESSION, LEVEL.PATH_QUESTION,
  ]);
});

test('every trail is rooted at Home', () => {
  Object.values(LEVEL).forEach((level) => {
    assert.equal(breadcrumb(level)[0], LEVEL.HOME, `${level} is not reachable from Home`);
  });
});

test('a breadcrumb terminates even if the map is ever made circular', () => {
  // Cheap insurance. A cycle here would hang the render, not throw.
  Object.values(LEVEL).forEach((level) => {
    const trail = breadcrumb(level);
    assert.equal(new Set(trail).size, trail.length, `${level} produced a repeating trail`);
  });
});

test('shallow screens do not earn a breadcrumb', () => {
  assert.equal(depthOf(LEVEL.HOME), 0);
  assert.equal(depthOf(LEVEL.MATH_PATH), 1);
  assert.ok(depthOf(LEVEL.PATH_QUESTION) >= 3, 'deep screens do');
});

// --- No Retry-only dead ends -------------------------------------------------------

test('an error state always offers a way out that is not Retry', () => {
  Object.values(LEVEL).forEach((level) => {
    const exit = resolveErrorExit(level);
    assert.ok(exit.level, `${level} has no exit from its error state`);
    assert.ok(exit.label, `${level} has no label on its exit`);
  });
});

test('Retry stops being offered once it has clearly not worked', () => {
  const first = resolveErrorExit(LEVEL.PATH_SESSION, { retryCount: 0 });
  const third = resolveErrorExit(LEVEL.PATH_SESSION, { retryCount: 2 });
  assert.equal(first.offerRetry, true);
  assert.equal(third.offerRetry, false,
    'the same button producing the same error is not a choice');
});

test('a student who has hit a wall is told it is not their fault', () => {
  const exhausted = resolveErrorExit(LEVEL.PATH_SESSION, { retryCount: 3 });
  assert.ok(exhausted.exhaustedMessage);
  assert.match(exhausted.exhaustedMessage, /not something you did/i);
  assert.match(exhausted.exhaustedMessage, /teacher/i, 'and told who can actually fix it');
});

test('an error at Home still has somewhere to send the student', () => {
  const exit = resolveErrorExit(LEVEL.HOME);
  assert.ok(exit.level, 'even the root must not be a dead end');
  assert.ok(exit.label);
});

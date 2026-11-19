/*
 * APPLY CORRECTED GRADE RAISES A SCORE, AND NEVER LOWERS ONE (the owner,
 * 2026-11-19, option A).
 *
 * The Response Inspector's "Apply Corrected Grade" set the question's score to
 * the replay of the student's last response. That could be lower than the
 * score the student stood on, which counts their best attempt or a teacher's
 * override: a best attempt of 50% and a last of 0% went to 0%. Now a replay
 * applies only when it raises the standing score; otherwise nothing is
 * written, and the teacher is told why. A teacher who means to lower a score
 * still can, with Set Score. The real callables are exercised on the emulator
 * in tests/integration/callableBoundaries/responseInspectorBoundaries.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  automaticQuestionScore, correctedGradeFromReplay, effectiveQuestionScore,
} from '../../functions/shared/responseInspector.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('a replay that raises the standing score applies; one that would lower it or change nothing does not', () => {
  assert.deepEqual(correctedGradeFromReplay({ replayScore: 100, standingScore: 50 }), { apply: true, score: 100 });
  assert.deepEqual(correctedGradeFromReplay({ replayScore: 75, standingScore: 0 }), { apply: true, score: 75 });
  const lower = correctedGradeFromReplay({ replayScore: 0, standingScore: 50 });
  assert.equal(lower.apply, false);
  assert.equal(lower.reason, "The corrected grade (0%) is lower than the student's current score (50%), and Apply Corrected Grade never lowers a score. To lower it, enter the score and press Set Score.");
  assert.deepEqual(correctedGradeFromReplay({ replayScore: 50, standingScore: 50 }), {
    apply: false, reason: "The corrected grade is the student's current score (50%), so there is nothing to change.",
  });
  for (const replayScore of [null, undefined, Number.NaN, 'none']) {
    assert.deepEqual(correctedGradeFromReplay({ replayScore, standingScore: 0 }), { apply: false, reason: 'The replay has no score to apply.' }, String(replayScore));
  }
});

test('the handoff\'s case: best attempt 50%, last attempt 0%, stays at 50%', () => {
  // The record's credit is the student's best attempt (a percentage); the
  // replay grades the last, which earned nothing.
  const record = { status: 'attempted', totalAttempts: 2, attemptCount: 2, bestPartialCredit: 50, partialCredit: 0, variantIndex: 0, lastAttemptAt: '2026-11-18T15:00:00.000Z' };
  assert.equal(automaticQuestionScore(record), 50);
  const standingScore = effectiveQuestionScore(record, null);
  assert.equal(correctedGradeFromReplay({ replayScore: 0, standingScore }).apply, false);
  // A teacher's override is what the student stands on while it applies.
  const override = { active: true, score: 90, totalAttempts: 2, variantIndex: 0, lastAttemptAt: record.lastAttemptAt };
  assert.equal(effectiveQuestionScore(record, override), 90);
  assert.equal(correctedGradeFromReplay({ replayScore: 80, standingScore: effectiveQuestionScore(record, override) }).apply, false);
  assert.deepEqual(correctedGradeFromReplay({ replayScore: 100, standingScore: effectiveQuestionScore(record, override) }), { apply: true, score: 100 });
});

test('the callable applies a replay only through that rule, against the score the student stands on', () => {
  const callable = executableSource(read('functions/gradingFunctions.js'));
  const replay = region(callable, 'if (action === "applyReplay") {', 'correction = inspector.buildGradeOverride({', 'applyReplay');
  assert.match(replay, /const corrected = inspector\.correctedGradeFromReplay\(\{\s*replayScore: replay\.currentScore,\s*standingScore: inspector\.effectiveQuestionScore\(record, previousOverride\),\s*\}\);\s*if \(!corrected\.apply\) throw new Error\(corrected\.reason\);\s*score = corrected\.score;/);
  assert.doesNotMatch(replay, /score = replay\.currentScore;/);
});

test('the Inspector says why before the button is pressed, and the button waits', () => {
  const inspector = executableSource(read('functions/shared/responseInspector.mjs'));
  assert.match(inspector, /correctedGrade: replay\?\.available\s*\? correctedGradeFromReplay\(\{ replayScore: replay\.currentScore, standingScore: effectiveQuestionScore\(record, override\) \}\)\s*: null,/);
  const screen = read('src/components/teacher/StudentResponseInspector.jsx');
  assert.match(screen, /\{model\.correctedGrade && !model\.correctedGrade\.apply \? <p id="inspector-corrected-grade-held" data-corrected-grade-held="">\{model\.correctedGrade\.reason\}<\/p> : null\}/);
  assert.match(screen, /disabled=\{busy \|\| model\.correctedGrade\?\.apply === false\} aria-describedby=\{model\.correctedGrade && !model\.correctedGrade\.apply \? 'inspector-corrected-grade-held' : undefined\} onClick=\{\(\) => act\('applyReplay'\)\}>Apply Corrected Grade<\/button>/);
  // A model from a server before this change has no correctedGrade: the button works as it did.
  assert.match(screen, /model\.correctedGrade\?\.apply === false/);
});

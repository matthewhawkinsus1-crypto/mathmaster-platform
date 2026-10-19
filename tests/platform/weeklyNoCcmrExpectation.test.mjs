// A class whose teacher expects no CCMR work — the default for every
// non-Honors class — must still get a full weekly Path when a student has a
// CCMR transfer gap.
//
// THE DEFECT. A transfer gap (course mastery strong, exam-format proficiency
// behind it) made resolvePurpose label every eligible skill as transfer work.
// With transfer off, optimizeWeeklySet drops every transfer candidate — so a
// student who tried SAT-style practice in the CCMR hub and found the format
// hard watched their weekly Path shrink, down to an empty week the server then
// refuses to freeze. The skills are now what they are in the course.

import test from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';
import { PURPOSE, buildWeeklyRecommendations } from '../../src/platform/path/recommendationV2.js';

const NOW = Date.parse('2026-10-07T17:00:00Z');
const CODES = ['A.5A', 'A.3A', 'A.9A', 'A.2C', 'A.6A', 'A.7A'];
const rows = CODES.map((code, index) => ({
  skillId: code, teksCode: code, score: 0.9 - index * 0.05, strand: code, representation: 'symbolic',
}));
const profile = (ccmrTransfer) => ({
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand: 3 },
  dokProfile: {},
  courseMastery: 0.9,
  ccmrTransfer,
  foundationGapDepth: 0,
});
const SAT_GAP = { digitalSAT: { proficiency: 0.5, provisional: false } };

test('a transfer gap in a class with no CCMR expectation leaves a full week of course work', () => {
  for (const honors of [false, true]) {
    const withGap = buildWeeklyRecommendations({ rows, profile: profile(SAT_GAP), sessions: 4, honors, allowTransfer: false, now: NOW });
    const withoutGap = buildWeeklyRecommendations({ rows, profile: profile({}), sessions: 4, honors, allowTransfer: false, now: NOW });
    assert.equal(withGap.sessions.length, 4, `honors=${honors}: the week is full`);
    assert.equal(withGap.sessions.length, withoutGap.sessions.length);
    withGap.sessions.forEach((session) => {
      assert.notEqual(session.purpose, PURPOSE.TRANSFER);
      assert.equal(session.context, 'course');
    });
    assert.equal(withGap.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER).length, 0);
  }
});

test('with CCMR work expected, the same gap still produces transfer work', () => {
  const result = buildWeeklyRecommendations({ rows, profile: profile(SAT_GAP), sessions: 4, honors: true, allowTransfer: true, now: NOW });
  assert.ok(result.sessions.some((session) => session.purpose === PURPOSE.TRANSFER));
});

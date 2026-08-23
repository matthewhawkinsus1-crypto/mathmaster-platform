// The bridge from the roster's synchronous evidence rows to the profile's
// evidence events. Mostly about what it must REFUSE to invent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { evidenceRowToEvent, evidenceRowsToEvents } from '../../src/platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile, isClassifyingEvidence } from '../../src/platform/profile/studentLearningProfile.js';

const row = (overrides = {}) => ({
  teks: 'A.5A',
  dok: 2,
  generatorBand: 3,
  totalAttempts: 1,
  eventuallyCorrect: true,
  modified: false,
  activityRole: 'practice',
  questionType: 'algebra',
  lastAttemptAt: '2026-09-14T10:00:00Z',
  ...overrides,
});

test('an unattempted question is not converted into a wrong answer', () => {
  // The single most damaging thing this adapter could do: make a student who
  // did not do the work look like a student who could not do it.
  assert.equal(evidenceRowToEvent(row({ totalAttempts: 0, eventuallyCorrect: false })), null);
});

test('a row with no standard cannot classify anything', () => {
  assert.equal(evidenceRowToEvent(row({ teks: null })), null);
});

test('a converted row is evidence the profile will actually count', () => {
  const event = evidenceRowToEvent(row());
  assert.equal(isClassifyingEvidence(event), true);
  assert.equal(event.performance.isCorrect, true);
  assert.equal(event.questionSnapshot.dok, 2);
  assert.equal(event.questionSnapshot.difficultyBand, 3);
  assert.deepEqual(event.alignmentKeys, ['texas:A.5A']);
});

test('a genuine wrong answer survives as a wrong answer', () => {
  const event = evidenceRowToEvent(row({ eventuallyCorrect: false }));
  assert.equal(isClassifyingEvidence(event), true, 'a real miss IS evidence');
  assert.equal(event.performance.isCorrect, false);
});

test('modified work is carried through so the profile can exclude it', () => {
  const event = evidenceRowToEvent(row({ modified: true }));
  assert.equal(event.supportUsage.modified, true);
  assert.equal(isClassifyingEvidence(event), false,
    'modified work measures a different construct and must not classify the student');
});

test('an out-of-range DOK or band falls back rather than corrupting the axes', () => {
  const event = evidenceRowToEvent(row({ dok: 9, generatorBand: 42 }));
  assert.equal(event.questionSnapshot.dok, 2);
  assert.equal(event.questionSnapshot.difficultyBand, 3);
});

test('an undated row still converts, and is reported as undated', () => {
  // A missing timestamp must not silently become 1970 and expire every cooldown.
  const { events, coverage } = evidenceRowsToEvents([row({ lastAttemptAt: null })]);
  assert.equal(events.length, 1);
  assert.equal(events[0].recordedAt, null);
  assert.equal(coverage.datedEvents, 0);
});

test('the conversion never claims a CCMR framework it does not have', () => {
  // Legacy rows record no framework. Reporting "no transfer gaps" from that
  // absence would present ignorance as a measurement.
  const { events, coverage } = evidenceRowsToEvents([row(), row({ teks: 'A.3A' })]);
  assert.equal(coverage.transferComplete, false);
  events.forEach((event) => assert.equal(event.source.assessmentFramework, undefined));
});

test('coverage reports what was dropped', () => {
  const { coverage } = evidenceRowsToEvents([row(), row({ totalAttempts: 0 }), row({ teks: null })]);
  assert.equal(coverage.rows, 3);
  assert.equal(coverage.converted, 1);
});

test('rubbish in does not throw', () => {
  assert.deepEqual(evidenceRowsToEvents(null).events, []);
  assert.equal(evidenceRowToEvent(null), null);
  assert.equal(evidenceRowToEvent('nope'), null);
});

// --- End to end: does the roster actually get a usable profile? --------------------

test('enough legacy rows produce a real, established profile', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => row({ teks: 'A.5A', dok: 1, generatorBand: 3, activityRole: 'practice' })),
    ...Array.from({ length: 5 }, () => row({ teks: 'A.3A', dok: 2, generatorBand: 3, activityRole: 'dol' })),
    ...Array.from({ length: 4 }, (_, i) => row({ teks: 'A.9A', dok: 3, generatorBand: 4, activityRole: 'quiz', eventuallyCorrect: i === 0 })),
  ];
  const { events } = evidenceRowsToEvents(rows);
  const profile = buildStudentLearningProfile({ evidenceEvents: events });

  assert.equal(profile.baseline.established, true, 'the roster can build a real profile with no extra reads');
  assert.ok(profile.dokProfile['1']?.attempts >= 6);
  assert.ok(profile.dokProfile['3']?.attempts >= 4);
  assert.notEqual(profile.instructionalBandLabel, 'Establishing Baseline');
});

test('a thin record still refuses to classify', () => {
  const { events } = evidenceRowsToEvents([row(), row({ teks: 'A.3A' })]);
  const profile = buildStudentLearningProfile({ evidenceEvents: events });
  assert.equal(profile.baseline.established, false,
    'two questions is not a judgement about a child');
});

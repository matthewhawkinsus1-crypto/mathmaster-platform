// EVERY FIELD A TEACHER MODULE READS MUST ACTUALLY EXIST ON A PROFILE.
//
// This file exists because of one bug, and the bug is worth describing exactly
// because it is the most expensive shape a defect can take here.
//
// The needs-attention queue has a rule for "previously mastered skills are
// slipping". It read `profile.retentionScheduleCount`, fell back to
// `profile.retentionSchedules`, and the real profile exposed NEITHER. So the
// count was always zero, the threshold was never met, and the alert could not
// fire for any student in any school.
//
// It had a passing unit test the whole time. The fixture supplied the field the
// real profile did not, which is the trap: a rule that passes its test and
// cannot fire against real data is worse than no rule, because it looks like
// coverage. Nobody goes looking for the alert that never appeared.
//
// So this test reads the SOURCE of every teacher module, extracts every
// `profile.x` it touches, and checks each against a genuinely built profile.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { buildStudentLearningProfile } from '../../src/platform/profile/studentLearningProfile.js';
// Comments are stripped before the sweep. The first run of this test failed on
// the comment that DOCUMENTS the very bug it exists to catch, which is exactly
// the wrong incentive — see the note in the helper.
import { stripComments } from './helpers/stripComments.mjs';

const MODULES = [
  ...readdirSync('src/platform/teacher').map((name) => join('src/platform/teacher', name)),
  'src/platform/rigor/courseRigor.js',
  'src/platform/assignments/adaptivePreview.js',
].filter((path) => path.endsWith('.js'));

// Fields read through a differently-named local binding, or on an object that
// is not a Student Learning Profile at all. Listed explicitly so the exclusion
// is a decision on the record rather than a silent gap in the sweep.
const NOT_PROFILE_FIELDS = new Set([
  // `resolveAdaptivePolicy` returns a policy object, not a profile.
  'enabled', 'assignedDok', 'assignedBand', 'mode', 'roleGroup', 'activityRole',
  // Legacy per-period course profiles.
  'course', 'courseLevel', 'courseLabel', 'classPeriod',
]);

const fieldsReadIn = (source) => {
  const found = new Set();
  // `profile.x`, `profile?.x`, and the common `entry.profile.x` shapes.
  [...source.matchAll(/\bprofile\??\.([a-zA-Z][a-zA-Z0-9_]*)/g)].forEach(([, field]) => {
    if (!NOT_PROFILE_FIELDS.has(field)) found.add(field);
  });
  return found;
};

// A profile built the way the product builds one, with every optional input
// supplied — so a field that only appears under some condition still appears.
const REAL_PROFILE = buildStudentLearningProfile({
  courseId: 'algebra1',
  evidenceEvents: Array.from({ length: 14 }, (unused, index) => ({
    eventKey: `e${index}`,
    occurredAt: 1_770_000_000_000 + (index * 60_000),
    alignmentKeys: [`A.${index % 4}A`],
    questionSnapshot: { dok: (index % 3) + 1, difficultyBand: (index % 4) + 1, questionInstanceId: `q${index}` },
    performance: { status: 'finalized', isCorrect: index % 3 !== 0, score: index % 3 !== 0 ? 1 : 0 },
    source: { kind: 'path', activityRole: index % 2 ? 'practice' : 'dol', assessmentFramework: index % 5 === 0 ? 'digitalSAT' : null },
  })),
  masteryProfilesByTeks: {
    'A.0A': { mastery: { estimate: 80, confidence: 'High' }, dimensions: { eligibleGradeLevelEvents: 6 } },
  },
  retentionSchedules: { 'A.0A': { status: 'retained' }, 'A.1A': { status: 'lapsed' } },
  foundationGapDepth: 1,
  completion: { assigned: 10, completed: 7 },
});

test('the sweep actually covers the teacher modules', () => {
  // Without this, a broken path expression would make every assertion below
  // pass by finding nothing.
  assert.ok(MODULES.length >= 6, `only ${MODULES.length} modules found`);
  const total = MODULES.reduce((sum, path) => sum + fieldsReadIn(stripComments(readFileSync(path, 'utf8'))).size, 0);
  assert.ok(total >= 8, `only ${total} profile fields found across the modules`);
});

test('no teacher module reads a profile field that does not exist', () => {
  const missing = [];
  MODULES.forEach((path) => {
    fieldsReadIn(stripComments(readFileSync(path, 'utf8'))).forEach((field) => {
      if (!(field in REAL_PROFILE)) missing.push(`${path}: profile.${field}`);
    });
  });
  assert.deepEqual(missing, [], `Fields read but never produced:\n${missing.join('\n')}`);
});

test('the retention count specifically is on the profile, with its denominator', () => {
  // The original bug, pinned by name. A fraction with no denominator cannot be
  // reasoned about: 0.5 from two schedules and 0.5 from twenty are different
  // findings, and a caller wanting enough evidence has no way to ask without it.
  assert.equal(REAL_PROFILE.retentionScheduleCount, 2);
  assert.ok(Number.isFinite(REAL_PROFILE.retentionStrength));
});

test('a profile built from nothing still exposes every field, at null', () => {
  // Callers read these unconditionally. A key that only appears once a student
  // has done work would crash a roster on its first day of school.
  const empty = buildStudentLearningProfile({ courseId: 'algebra1', evidenceEvents: [] });
  Object.keys(REAL_PROFILE).forEach((key) => {
    assert.ok(key in empty, `${key} disappears on an empty profile`);
  });
});

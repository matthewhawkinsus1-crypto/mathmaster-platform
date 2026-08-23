// "DO NOT HIDE THE ENGINE BEHIND GENERIC LABELS SUCH AS: AI RECOMMENDED. SHOW
//  USEFUL HUMAN-READABLE REASONS."
//
// This is the phase with no screen of its own, which makes it the easiest one
// to declare done and the easiest one to lose later. So it is tested as a
// property of the codebase rather than of any component: a sweep for the
// labels that mean nothing, and a check that each surface which shows a
// decision also shows why.
//
// The failure this guards against is not that someone writes "AI recommended"
// on purpose. It is that a hurried edit replaces a sentence with a chip.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Comments are stripped before scanning: the first run of this sweep failed on
// two files that were quoting the forbidden phrase in order to explain why they
// avoid it. See the note in the helper.
import { stripComments } from './helpers/stripComments.mjs';

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const path = join(dir, entry);
  if (statSync(path).isDirectory()) return walk(path);
  return /\.(js|jsx|mjs)$/.test(path) ? [path] : [];
});

const SOURCES = [...walk('src/platform'), ...walk('src/components')];

// Phrases that assert a decision was made without saying anything about it.
// Each is a real label seen in real products, and each is unusable to a teacher
// who wants to disagree with the recommendation.
const EMPTY_LABELS = [
  /\bAI[- ]recommended\b/i,
  /\brecommended by AI\b/i,
  /\bsmart\s+recommendation\b/i,
  /\balgorithm(ically)?\s+(selected|chosen|determined)\b/i,
  /\bautomatically\s+determined\b/i,
  /\bpersonali[sz]ed\s+for\s+you\b/i,
  /\bour\s+(AI|algorithm)\s+(thinks|suggests|believes)\b/i,
];

test('no teacher- or student-facing string hides a decision behind a generic label', () => {
  const offences = [];
  SOURCES.forEach((path) => {
    const source = stripComments(readFileSync(path, 'utf8'));
    EMPTY_LABELS.forEach((pattern) => {
      const match = source.match(pattern);
      if (match) offences.push(`${path}: ${match[0]}`);
    });
  });
  assert.deepEqual(offences, [], `Generic labels found:\n${offences.join('\n')}`);
});

test('the comment stripper still catches an offence in real code', () => {
  // Without this, a stripper that removed too much would make the test above
  // pass silently forever.
  const sample = `
    // A comment saying AI recommended, which is fine.
    const label = 'AI recommended';
  `;
  const stripped = stripComments(sample);
  assert.ok(!/comment saying/.test(stripped), 'the comment survived');
  assert.ok(EMPTY_LABELS.some((pattern) => pattern.test(stripped)), 'the real string was lost');
});

test('the adaptation engine states both axes and the direction, not a verdict', async () => {
  const { describeAdaptation } = await import('../../src/platform/assignments/assignmentAdaptation.js');
  const described = describeAdaptation({
    adapted: true, assignedDok: 2, assignedBand: 3, dok: 3, difficultyBand: 4,
    reason: 'holding_above_course_band',
  });
  assert.match(described, /Assigned DOK 2/);
  assert.match(described, /Band 3/);
  assert.match(described, /received DOK 3/);
  assert.match(described, /Band 4/);
  // A teacher reading this can check it against the student's work. "Adapted"
  // alone cannot be checked against anything.
  assert.ok(described.length > 40);
});

test('an unadapted delivery explains itself too, rather than saying nothing', async () => {
  const { describeAdaptation } = await import('../../src/platform/assignments/assignmentAdaptation.js');
  const described = describeAdaptation({
    adapted: false, assignedDok: 2, assignedBand: 3, dok: 2, difficultyBand: 3,
    reason: 'assessment_rigor_is_the_same_for_every_student',
  });
  assert.ok(described.length > 10);
  assert.ok(!/^\s*$/.test(described));
});

test('every needs-attention rule produces a detail a teacher can act on', async () => {
  const { academicFindingsFor, completionFindingsFor, systemFindings } = await import('../../src/platform/teacher/needsAttention.js');

  const cases = [
    academicFindingsFor({
      studentId: 's1', studentName: 'A',
      profile: { baseline: { established: true, events: 14 }, foundationGapDepth: 3, instructionalBand: 'below', dokProfile: {}, skillsWithEvidence: 5 },
    }),
    academicFindingsFor({
      studentId: 's1', studentName: 'A',
      profile: {
        baseline: { established: true, events: 14 }, foundationGapDepth: 0, instructionalBand: 'on', skillsWithEvidence: 5,
        dokProfile: { 1: { attempts: 10, accuracy: 0.9, confident: true }, 2: { attempts: 8, accuracy: 0.3, confident: true } },
      },
    }),
    academicFindingsFor({
      studentId: 's1', studentName: 'A',
      profile: { baseline: { established: true, events: 14 }, instructionalBand: 'on', dokProfile: {}, retentionStrength: 0.2, retentionScheduleCount: 9, skillsWithEvidence: 5 },
    }),
    completionFindingsFor({
      studentId: 's1', studentName: 'A', profile: { engagement: 'needsFollowUp' },
      weekly: { goal: 4, complete: 0, overdue: true }, weekFraction: 1,
    }),
    systemFindings({ unplaceable: [{ id: 's9', displayName: 'B' }], classCount: 1, weeklyProgressTruncated: true }),
  ].flat();

  assert.ok(cases.length >= 6, 'the sweep must actually cover the rules');
  cases.forEach((finding) => {
    assert.ok(finding.detail && finding.detail.length > 50, `${finding.rule} has no usable reason`);
    // A reason that merely restates the headline explains nothing.
    assert.notEqual(finding.detail, finding.headline);
  });
});

test('every instructional group placement explains itself', async () => {
  const { groupForStudent } = await import('../../src/platform/teacher/instructionalGroups.js');
  const profiles = [
    { baseline: { established: false, events: 3, requirement: { events: 12 } } },
    { baseline: { established: true, events: 14 }, foundationGapDepth: 3, instructionalBand: 'below', dokProfile: {}, skillsWithEvidence: 4 },
    { baseline: { established: true, events: 14 }, foundationGapDepth: 0, instructionalBand: 'above', dokProfile: {}, skillsWithEvidence: 8 },
    { baseline: { established: true, events: 14 }, foundationGapDepth: 0, instructionalBand: 'on', dokProfile: {}, skillsWithEvidence: 8 },
  ];
  profiles.forEach((profile) => {
    const placement = groupForStudent({ studentId: 's', studentName: 'A', profile });
    assert.ok(placement.reason && placement.reason.length > 25, `${placement.group} is a label, not a decision`);
  });
});

test('every live coaching suggestion names the two signals it combined', async () => {
  const { suggestMove } = await import('../../src/platform/teacher/liveCoaching.js');
  const { LIVE_FLAGS } = await import('../../src/livePresence.js');
  [LIVE_FLAGS.NOT_STARTED, LIVE_FLAGS.STUCK, LIVE_FLAGS.STRUGGLING, LIVE_FLAGS.IDLE, LIVE_FLAGS.BEHIND_PACE]
    .forEach((flag) => {
      const suggestion = suggestMove({
        row: { id: 's1', flags: [flag] },
        profile: { baseline: { established: true, events: 14 }, instructionalBand: 'on', dokProfile: {} },
      });
      if (!suggestion) return;
      assert.ok(suggestion.why.length > 40, `${flag} suggestion has no reasoning`);
    });
});

test('a teacher action proposal is never offered without its consequences spelled out', async () => {
  const { actionsForAlert } = await import('../../src/platform/teacher/teacherActions.js');
  const proposals = actionsForAlert({
    alert: {
      id: 'a', rule: 'belowLevel', kind: 'academic', urgency: 'thisWeek', classId: 'c-1',
      students: [{ studentId: 's1', studentName: 'A' }],
      headline: 'x', detail: 'y',
    },
    classId: 'c-1',
  });
  proposals.forEach((proposal) => {
    assert.ok(proposal.reversal, `${proposal.action} does not say how to undo it`);
    if (proposal.changesPlans) {
      assert.ok(proposal.description && proposal.description.length > 40, `${proposal.action} does not say what changes`);
    }
  });
});

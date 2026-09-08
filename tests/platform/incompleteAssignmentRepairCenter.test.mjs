import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyIncompleteDraftRepairCommit } from '../../src/platform/preflight/incompleteAssignmentDraft.js';

const question = (questionId, prompt, role, answer = '3') => ({
  questionId,
  type: 'algebra',
  prompt,
  answer,
  activityRole: role,
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
});

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'assignment-repair-center',
    title: 'Repair Center fixture',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  variantPolicy: {
    mode: 'personalized',
    sectionModes: { classwork: 'shared', practice: 'personalized', dol: 'shared' },
  },
  sections: [
    {
      id: 'cw',
      role: 'classwork',
      title: 'Classwork',
      questions: [question('q-cw-1', 'Solve x + 2 = 5.', 'classwork')],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [question('q-pr-1', 'Solve x + 4 = 7.', 'practice')],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [question('q-dol-1', 'Solve x + 1 = 4.', 'dol')],
    },
  ],
};

test('saved draft repair commits persist the candidate assignment, teacher review context, and incremented revision together', () => {
  const original = structuredClone(assignmentV5);
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one algebra step.';

  const draft = {
    id: 'draft-1',
    schemaVersion: 5,
    title: original.assignment.title,
    assignmentRevision: 12,
    teacherReviewContext: {
      flags: [{
        id: 'flag-1',
        scope: 'question',
        targetId: 'q-cw-1',
        category: 'directions',
        severity: 'needsEditing',
        note: 'Keep this short.',
        status: 'open',
      }],
    },
    authoringReview: { state: 'incomplete', ownerUid: 'teacher-1' },
    authoringDraft: { canonicalJson: JSON.stringify(original), sourceSchemaVersion: 5 },
  };

  const nextTeacherReviewContext = {
    flags: [{
      ...draft.teacherReviewContext.flags[0],
      potentiallyAddressedByRevision: 13,
      status: 'open',
    }],
  };

  const next = applyIncompleteDraftRepairCommit(draft, {
    assignmentV5: repaired,
    teacherReviewContext: nextTeacherReviewContext,
    committedRevision: 13,
  }, { nowIso: '2026-09-07T16:00:00.000Z' });

  assert.equal(next.assignmentRevision, 13);
  assert.deepEqual(next.teacherReviewContext, nextTeacherReviewContext);
  assert.equal(JSON.parse(next.authoringDraft.canonicalJson).sections[0].questions[0].prompt, 'Solve x + 2 = 5. Show one algebra step.');
  assert.equal(next.teacherReviewContext.flags[0].status, 'open', 'repair import must not resolve a teacher flag');
  assert.equal(next.teacherReviewContext.flags[0].potentiallyAddressedByRevision, 13);
  assert.equal(next.updatedAt, '2026-09-07T16:00:00.000Z');
});

test('Incomplete Assignments exposes the staged repair center instead of immediately replacing pasted AI output', () => {
  const intakeSource = readFileSync(new URL('../../src/AssignmentIntake.jsx', import.meta.url), 'utf8');
  const repairCenterSource = readFileSync(new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url), 'utf8');

  assert.match(intakeSource, /IncompleteAssignmentRepairCenter/);
  assert.match(intakeSource, /Open Repair Center/);

  assert.match(repairCenterSource, /stageSingleQuestionRepairImport/);
  assert.match(repairCenterSource, /stageBatchQuestionRepairImport/);
  assert.match(repairCenterSource, /commitStagedQuestionRepairImport/);
  assert.match(repairCenterSource, /parseSingleQuestionRepairJson/);
  assert.match(repairCenterSource, /parseQuestionBatchRepairResponse/);
  assert.match(repairCenterSource, /Paste repaired question JSON/);
  assert.match(repairCenterSource, /Paste batch repair JSON/);
  assert.match(repairCenterSource, /Before \/ after changes/);
  assert.match(repairCenterSource, /Revalidation/);
  assert.match(repairCenterSource, /Apply staged repair/);
  assert.match(repairCenterSource, /Teacher verification required/);
  assert.match(repairCenterSource, /Verify fixed/);
  assert.match(repairCenterSource, /questionId/);
});

test('parseable incomplete V5 opens Preflight for student preview while publication remains blocked', () => {
  const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const start = appSource.indexOf('const handleAssignmentJsonReady');
  const end = appSource.indexOf('const handleCreateAssignment', start);
  const intakeRegion = appSource.slice(start, end);

  assert.notEqual(start, -1, 'handleAssignmentJsonReady was not found');
  assert.match(intakeRegion, /canSalvageV5IntakeResult/);
  assert.match(intakeRegion, /buildAssignmentV5PreflightModel\(result\.parsed\.assignmentV5/);
  assert.match(intakeRegion, /openAssignmentPreflight/);
  assert.match(intakeRegion, /previewOpened:\s*true/);
});

test('Repair Center offers exact individual-safe subsets and explains preview versus publication', () => {
  const repairCenterSource = readFileSync(new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url), 'utf8');
  const intakeSource = readFileSync(new URL('../../src/AssignmentIntake.jsx', import.meta.url), 'utf8');

  assert.match(repairCenterSource, /Select questions needing repair/);
  assert.match(repairCenterSource, /Select teacher-flagged/);
  assert.match(repairCenterSource, /Select this section/);
  assert.match(repairCenterSource, /Student preview available/i);
  assert.match(repairCenterSource, /prevent Library publication/i);
  assert.match(repairCenterSource, /currentDraft\?\.id/);
  assert.match(repairCenterSource, /validSelectedQuestionIds\.length/);
  assert.match(intakeSource, /Open Student Preview \/ Review/);
});

console.log('incompleteAssignmentRepairCenter.test.mjs: all assertions passed');
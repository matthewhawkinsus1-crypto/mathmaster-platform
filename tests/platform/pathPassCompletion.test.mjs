import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  coursePathLevelName,
  describeCoursePathPass,
  normalizeCoursePathPassProgress,
  summarizeCoursePathPasses,
} from '../../src/platform/path/pathPassPresentation.js';

test('first completed course Path pass is visibly distinct from mastery', () => {
  const view = describeCoursePathPass({ passesCompleted: 1 }, { mastered: false });
  assert.equal(view.hasCompletedPass, true);
  assert.equal(view.completedLabel, '✓ Path Pass 1 complete');
  assert.equal(view.levelLabel, 'Level 2 · Deeper practice');
  assert.equal(view.buttonLabel, 'Start Level 2');
});

test('second pass announces a Level 3 mastery challenge', () => {
  const view = describeCoursePathPass({ passesCompleted: 2 }, { mastered: false });
  assert.equal(view.completedLabel, '✓ Path Pass 2 complete');
  assert.equal(view.nextLabel, 'Next: Level 3 · Mastery challenge');
  assert.equal(view.buttonLabel, 'Start Level 3');
});

test('mastered remains a stronger, separate state after a completed Path pass', () => {
  const view = describeCoursePathPass({ passesCompleted: 1 }, { mastered: true });
  assert.equal(view.completedLabel, '✓ Path Pass 1 complete');
  assert.equal(view.nextLabel, 'Mastered · review anytime');
  assert.equal(view.buttonLabel, 'Review skill');
});

test('advanced repeat practice stays available without pretending it is new mastery', () => {
  const view = describeCoursePathPass({ passesCompleted: 4 }, { mastered: false });
  assert.equal(view.hasCompletedPass, true);
  assert.equal(view.completedLabel, '✓ 4 Path passes complete');
  assert.equal(view.buttonLabel, 'Continue advanced practice');
  assert.match(view.nextLabel, /mastery evidence still building/i);
});

test('Path pass summary counts completed sessions separately from mastered skills', () => {
  assert.deepEqual(
    summarizeCoursePathPasses({
      'A2.2B': { passesCompleted: 1 },
      'A2.2C': { passesCompleted: 2 },
      'A2.3A': { passesCompleted: 0 },
    }),
    { completedSkillCount: 2, totalCompletedPasses: 3 },
  );
});

test('pass normalization is bounded for level presentation but preserves completion count', () => {
  const normalized = normalizeCoursePathPassProgress({ passesCompleted: 7, highestRecordedLevel: 9 });
  assert.equal(normalized.passesCompleted, 7);
  assert.equal(normalized.nextLevel, 3);
  assert.equal(normalized.advancedLoop, true);
  assert.equal(coursePathLevelName(99), 'Mastery challenge');
});

test('student Path map receives server-owned pass progress and renders completion/next-level language', () => {
  const app = readFileSync('src/components/student/MyMathPathApp.jsx', 'utf8');
  const path = readFileSync('src/components/student/StudentLearningPath.jsx', 'utf8');
  const presentation = readFileSync('src/platform/path/pathPassPresentation.js', 'utf8');

  assert.match(app, /fetchMyMathPathSkillProgress/);
  assert.match(app, /skillProgressByTEKS=\{skillProgressByTEKS\}/);
  assert.match(presentation, /Path Pass 1 complete/);
  assert.match(presentation, /Level 2 · Deeper practice/);
  assert.match(path, /Mastery is tracked separately/);
  assert.match(path, /passSummary\.totalCompletedPasses/);
});

test('server records course pass level and asks later passes for harder work', () => {
  const source = readFileSync('functions/index.js', 'utf8');
  assert.match(source, /const COURSE_PATH_MAX_LEVEL = 3/);
  assert.match(source, /exports\.getMyMathPathSkillProgress/);
  assert.match(source, /coursePassLevel: assessmentFramework \|\| sessionKind === "retentionProbe" \? null : coursePassLevel/);
  assert.match(source, /if \(coursePassLevel >= 2\)/);
  assert.match(source, /if \(coursePassLevel >= 3\)/);
});

test('one broken higher-level family no longer strands the entire skill', () => {
  const source = readFileSync('functions/index.js', 'utf8');
  assert.match(source, /while \(remainingCandidates\.length\)/);
  assert.match(source, /Skipping Path family after runtime preparation failure/);
  assert.match(source, /all-candidate-preparations-failed/);
  assert.match(source, /Your completed work is safe/);
});

test('student error screen distinguishes unavailable next level from lost completion', () => {
  const source = readFileSync('src/components/student/MyMathPathProductionContainer.jsx', 'utf8');
  assert.match(source, /Next level is temporarily unavailable/);
  assert.match(source, /Your earlier Path pass is still complete/);
  assert.match(source, /This Path pass is already complete/);
  assert.match(source, /Level \$\{coursePassLevel\} complete/);
});

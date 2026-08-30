import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  describeCoursePathPass,
  normalizeCoursePathPassProgress,
} from '../../src/platform/path/pathPassPresentation.js';

const app = readFileSync('src/components/student/MyMathPathApp.jsx', 'utf8');
const dashboard = readFileSync('src/components/student/MyMathPathDashboard.jsx', 'utf8');
const wheel = readFileSync('src/components/student/MyMathPathWheel.jsx', 'utf8');
const modal = readFileSync('src/components/student/SkillDetailCardModal.jsx', 'utf8');
const player = readFileSync('src/components/student/PathSessionPlayer.jsx', 'utf8');
const badge = readFileSync('src/components/common/StandardBadge.jsx', 'utf8');

test('dashboard receives the same server-owned Path pass progress as the full Path tab', () => {
  assert.match(
    app,
    /<MyMathPathDashboard[^>]*skillProgressByTEKS=\{skillProgressByTEKS\}/s,
    'MyMathPathApp must not load pass progress and then drop it before the dashboard',
  );
  assert.match(dashboard, /skillProgressByTEKS = \{\}/);
  assert.match(
    dashboard,
    /<MyMathPathWheel[^>]*skillProgressByTEKS=\{skillProgressByTEKS\}/s,
  );
  assert.match(
    dashboard,
    /pathPassProgress=\{skillProgressByTEKS\[selectedTeks\] \|\| null\}/,
  );
});

test('skills wheel keeps pass completion visible independently of mastery status', () => {
  assert.match(wheel, /normalizeCoursePathPassProgress/);
  assert.match(wheel, /passProgress:/);
  assert.match(wheel, /Path Pass \$\{Math\.min\(passCount, 3\)\} complete/);
  assert.match(wheel, /stroke=\{passCount \? passColor : '#fff'\}/);
  assert.match(dashboard, /completed Path pass/);
  assert.match(dashboard, /Mastery-challenge pass/);
});

test('skill modal uses the canonical Path pass presentation instead of a generic practice button', () => {
  assert.match(modal, /describeCoursePathPass/);
  assert.match(modal, /pass\.completedLabel \|\| pass\.levelLabel/);
  assert.match(modal, /pass\.nextLabel/);
  assert.match(modal, /\{pass\.buttonLabel\} · 5 questions/);

  const first = describeCoursePathPass({ passesCompleted: 1 });
  assert.equal(first.completedLabel, '✓ Path Pass 1 complete');
  assert.equal(first.nextLabel, 'Next: Level 2 · Deeper practice');
  assert.equal(first.buttonLabel, 'Start Level 2');

  const second = describeCoursePathPass({ passesCompleted: 2 });
  assert.equal(second.completedLabel, '✓ Path Pass 2 complete');
  assert.equal(second.nextLabel, 'Next: Level 3 · Mastery challenge');
  assert.equal(second.buttonLabel, 'Start Level 3');

  const normalized = normalizeCoursePathPassProgress({ passesCompleted: 8 });
  assert.equal(normalized.advancedLoop, true);
  assert.equal(normalized.nextLevel, 3);
});

test('active course sessions translate rigor into student-facing Path levels', () => {
  assert.match(player, /coursePathLevelName/);
  assert.match(player, /MY MATH PATH · Level \{coursePassLevel\} · \{coursePathLevelName\(coursePassLevel\)\}/);
  assert.match(player, /coursePassLevel >= 3 \? '#f3ecfd'/);

  // Internal adaptive metadata remains teacher/engine information. Students see
  // Foundation / Deeper practice / Mastery challenge instead.
  assert.doesNotMatch(player, />DOK \{/);
  assert.doesNotMatch(player, />Band \{/);
});

test('TEKS and CCMR alignment remains clickable rather than becoming decorative text', () => {
  assert.match(player, /<StandardBadge code=\{questionCode\}/);
  assert.match(badge, /onClick=\{\(\) => openDetails\('skill'\)\}/);
  assert.match(badge, />TEKS \{info\.displayCode\}/);
  assert.match(badge, /onClick=\{\(\) => openDetails\('ccmr'\)\}/);
  assert.match(badge, /CCMR connections/);
});

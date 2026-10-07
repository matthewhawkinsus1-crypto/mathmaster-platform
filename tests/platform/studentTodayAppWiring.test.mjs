import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * App.jsx WIRING FOR THE ONE "TODAY" RULE.
 *
 * Nothing imports App.jsx, so a call with no import passes every gate and
 * throws for every student at runtime. Each call below is asserted beside its
 * import (AGENTS.md, "Two things the whole gate misses").
 */
const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('Recovery for every assignment is built and fed to the dashboard, with its import', () => {
  assert.match(app, /import\s*\{[^}]*\bbuildRecoverySummariesByAssignment\b[^}]*\}\s*from\s*'\.\/platform\/student\/recoveryStates\.js'/);
  assert.match(app, /import\s*\{[^}]*\brecoveryStatesFromSummaries\b[^}]*\}\s*from\s*'\.\/platform\/student\/recoveryStates\.js'/);
  assert.match(app, /useMemo\(\(\)\s*=>\s*\(user\?\.role === 'student'[\s\S]{0,40}buildRecoverySummariesByAssignment\(/);
});

test('the dashboard model receives the student, their Recovery states and the teacher section lock', () => {
  const call = region(app, 'buildStudentDashboardModel({', 'matchesSmartView: (assignment', 'the dashboard model call');
  assert.match(call, /studentId:\s*user\.id/);
  assert.match(call, /recoveryStateByAssignment:\s*recoveryStatesFromSummaries\(studentRecoverySummariesByAssignment\)/);
  assert.match(call, /\bgetSectionAccessState,/);
  assert.match(app, /import\s*\{[^}]*\bgetSectionAccessState\b/);
});

test('Start/Continue lands on the first unfinished open question, and never on a dead end', () => {
  const start = region(app, 'const startAssignment = (', 'const openStudentDashboardMode', 'startAssignment');
  const entry = region(start, 'resolveStudentAssignmentEntry({', 'safeQuestionIndex = actionableIndex', 'entry resolution');
  assert.match(entry, /isFinished:\s*options\?\.returnToResult\s*\?\s*null/);
  assert.match(entry, /\['correct', 'expired'\]\.includes\(normalizeQuestionRecord\(tracker\?\.\[assignmentId\]\?\.\[index\]\)\.status\)/);
  // With nothing open for a whole-assignment start, the student is taken to
  // the result page (what opens when), not left on a toast.
  assert.match(entry, /if \(actionableIndex === null && user\?\.role === 'student' && !scopedSectionKey\) \{\s*openStudentAssignmentResult\(assignmentId/);
});

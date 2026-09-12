import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertCapability, region } from './helpers/sourceContract.mjs';

const source = fs.readFileSync(
  new URL('../../src/App.jsx', import.meta.url),
  'utf8',
);

test('App consumes canonical section grade and Classroom launch helpers', () => {
  assert.match(source, /splitGradesBySection/);
  assert.match(source, /parseClassroomLaunchSearch/);
  assert.match(source, /classroomLaunchTarget/);
});

test('teacher gradebook exposes Overall, Warm-Up, Classwork, Practice, and DOL academic scores', () => {
  for (const label of ['Overall', 'Warm-Up', 'Classwork', 'Practice', 'DOL']) {
    assert.match(source, new RegExp(`>${label}<`));
  }
  assert.match(source, /splitGradesBySection\(\{\s*tracker:\s*grades,\s*assignment:\s*selectedAssignment\s*\}\)/);
});

test('student workspace shows the active section score instead of only the whole-assignment score', () => {
  assert.match(source, /currentSectionGrade/);
  assert.match(source, /currentSectionOfficialGrade/);
  assert.match(source, /currentSectionMeta\.label/);
  assert.match(source, /section score/i);
});

test('Classroom split launch preserves exact section and closed links stop on frozen report first', () => {
  assert.match(source, /pendingClassroomLaunch/);
  assert.match(source, /assignmentResultRoute/);

  // The behaviour: a closed Classroom link must stop on the recorded result
  // instead of opening the work screen, and it must carry the exact section it
  // posted with it. The frozen report itself moved out of App.jsx into
  // StudentAssignmentResult.jsx, so the words on its practice button are that
  // component's business now — what App.jsx still owns is the routing decision.
  const launchEffect = region(
    source,
    'const target = classroomLaunchTarget({',
    'setPendingClassroomLaunch(null)',
    'Classroom launch effect',
  );
  assert.match(launchEffect, /showFrozenReportFirst/);
  assert.match(launchEffect, /setActiveView\('assignmentResult'\)/);
  assert.match(launchEffect, /setActiveClassroomSectionKey\(target\.sectionKey\)/);
  assert.match(launchEffect, /setAssignmentResultRoute\(target\)/);
  // The open-assignment path is unchanged: still straight into the workspace.
  assert.match(launchEffect, /startAssignment\(target\.assignmentId/);

  // Section-only practice survived the move: the result screen offers practice
  // scoped to the section the Classroom post covered.
  const result = fs.readFileSync(
    new URL('../../src/components/student/StudentAssignmentResult.jsx', import.meta.url),
    'utf8',
  );
  assertCapability(
    result,
    [/Practice \{sectionLabel\}/, /Practice this section/, /`Practice \$\{sectionLabel\}`/],
    'The Assignment Result screen must offer practice scoped to the Classroom section it was opened from.',
  );
  const appResult = region(
    source,
    '<StudentAssignmentResult',
    '/>',
    'Assignment Result render',
  );
  assert.match(appResult, /sectionKey: resultSectionLabel \? assignmentResultRoute\.sectionKey : null/);
});

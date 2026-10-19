import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';

// Class reward requests across the student lifecycle. The behaviour is
// exercised against the emulator in tests/integration/classRewardsLifecycle.test.mjs;
// these contracts pin the wiring that suite cannot reach (functions/index.js
// is not loaded by the emulator suites).

const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../../functions/lib/classRewardStore.js', import.meta.url), 'utf8');

test('a teacher handover re-points the student\'s class reward requests with the wallet', () => {
  // Without this the new teacher's pending panel never lists the request and
  // the old teacher can no longer resolve it, so the points stay locked.
  const body = executableSource(region(
    functionsSource,
    'async function reauthorizeStudentRecords(',
    '\n}\n',
    'reauthorizeStudentRecords',
  ));
  const classPointsBlock = region(body, 'if (classRecord?.classId) {', '\n  } else {', 'same-class Class Points block');
  assert.match(classPointsBlock, /\.reauthorizeClassRewardRequests\(db, studentId, classRecord\)/);
  assert.match(classPointsBlock, /counts\.classRewardRequests = await require\("\.\/lib\/classRewardStore"\)\s*\.reauthorizeClassRewardRequests/);
});

test('the request re-point uses the Class Points helper, scoped to the same student and class', () => {
  const helper = executableSource(region(storeSource, 'async function reauthorizeClassRewardRequests(', '\n}\n', 'reauthorizeClassRewardRequests'));
  assert.match(helper, /where\("studentId", "==", String\(studentId\)\)/);
  assert.match(helper, /where\("classId", "==", String\(classRecord\.classId\)\)/);
  assert.match(helper, /reauthorizeClassPointsRecord\(/);
});

// The server half of the CCMR plan: one callable writes studentCcmrPlans, and
// the student's other lifecycles (class move, account erasure, pre-production
// reset) know the collection exists.
//
// functions/index.js cannot be imported here (it boots firebase-admin), so the
// callable is read as source, bound to its own region. The rules themselves are
// proven in the emulator (tests/rules/ccmrPlanRules.test.mjs); the plan's
// validation and record shape are behaviour-tested in ccmrPlan.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const admin = require('../../functions/lib/admin.js');
const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const callable = executableSource(region(index, 'exports.setMyCcmrPlan = onCall(', '\n}));', 'setMyCcmrPlan'));

test('setMyCcmrPlan is a student-only callable that validates with the shared rule before reading anything', () => {
  const requireAt = callable.indexOf('requireStudent(request)');
  const validateAt = callable.indexOf('validateCcmrPlanInput(request.data');
  const readAt = callable.indexOf('db.collection("grades")');
  assert.ok(requireAt > -1, 'only a signed-in student may save a plan');
  assert.ok(validateAt > requireAt, 'validated with functions/shared/ccmrPlan.mjs');
  assert.ok(readAt > validateAt, 'nothing is read for a request that fails validation');
  assert.match(callable, /import\("\.\/shared\/ccmrPlan\.mjs"\)/);
  assert.match(callable, /if \(!validated\.ok\) throw new HttpsError\("invalid-argument", validated\.message\)/);
});

test('the plan is written to the caller\'s own document, never one named in the request', () => {
  assert.match(callable, /const \{ studentId \} = requireStudent\(request\)/);
  assert.match(callable, /db\.collection\(ccmrPlan\.CCMR_PLAN_COLLECTION\)\.doc\(studentId\)/);
  assert.doesNotMatch(callable, /request\.data\??\.studentId/);
  assert.doesNotMatch(callable, /\.doc\(request\.data/);
});

test('the write happens in a transaction, carries the roster authorization, and is skipped when nothing changed', () => {
  const transaction = region(callable, 'db.runTransaction(', '\n  });', 'plan transaction');
  assert.match(transaction, /transaction\.get\(ref\)/);
  assert.match(transaction, /buildCcmrPlanRecord\(\{[\s\S]*student, classRecord/);
  const skipAt = transaction.indexOf('if (unchanged) return');
  const setAt = transaction.indexOf('transaction.set(ref, record)');
  assert.ok(skipAt > -1 && setAt > skipAt, 'an unchanged plan returns before the write');
  assert.match(callable, /loadStudentClass\(db, student\)/);
  assert.match(callable, /return \{ success: true, plan: ccmrPlan\.publicCcmrPlan\(saved\) \}/,
    'the reply is the plan, not the access list');
});

test('a class move re-authorizes the plan with the other per-student documents', () => {
  const reauthorize = executableSource(region(index, 'async function reauthorizeStudentRecords(', '\nasync function loadClasses', 'reauthorizeStudentRecords'));
  // The loop that re-authorizes single documents keyed by the student id —
  // not the earlier loop over collections queried by studentId.
  const loops = [...reauthorize.matchAll(/for \(const collectionName of \[([^\]]*)\]\) \{([\s\S]*?)\n {2}\}/g)];
  const documentLoop = loops.find((entry) => /\.collection\(collectionName\)\.doc\(studentId\)/.test(entry[2]));
  assert.ok(documentLoop, 'the per-student document loop is still there');
  assert.match(documentLoop[1], /"studentCcmrPlans"/);
  assert.match(documentLoop[2], /auth\.reauthorizeContext\(snapshot\.data\(\) \|\| \{\}, \{ classRecord \}\)/);
});

test('erasing a student erases their plan, and a pre-production reset clears plans', () => {
  assert.ok(admin.STUDENT_DIRECT_COLLECTIONS.includes('studentCcmrPlans'));
  assert.ok(admin.PREPRODUCTION_RESET_COLLECTIONS.includes('studentCcmrPlans'));
  assert.ok(!admin.PREPRODUCTION_PRESERVED_COLLECTIONS.includes('studentCcmrPlans'));
});

test('the rules let no browser write a plan', () => {
  const block = executableSource(region(rules, 'match /studentCcmrPlans/{studentId} {', '\n    }', 'studentCcmrPlans rule'));
  assert.match(block, /allow create, update, delete: if false;/);
  assert.match(block, /allow read: if rootAdmin\(\) \|\| ownsStudent\(studentId\) \|\| authorizedTeacher\(\) \|\| teachesPresenceStudent\(studentId\);/);
  assert.doesNotMatch(block, /allow write/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('admin account creation captures structured names and chooses a class', () => {
  const source = read('src/SignInAccess.jsx');
  assert.match(source, /firstName/);
  assert.match(source, /lastName/);
  assert.match(source, /classId/);
  assert.match(source, /teacherAdmin\.setStudentClass/);
});

test('teacher roster and gradebook use the shared last-name sorter', () => {
  const app = read('src/App.jsx');
  const roster = read('src/components/teacher/StudentsRoster.jsx');
  assert.match(app, /sort\(compareStudentsByName\)/);
  assert.match(app, /formatStudentName\(student\)/);
  assert.match(roster, /useState\('name'\)/);
  assert.match(roster, /compareStudentsByName/);
});

test('server creation is atomic and stores structured names', () => {
  const source = read('functions/index.js');
  assert.match(source, /MathMaster structured student names \/ class-centric account creation v1/);
  assert.match(source, /firstName: firstName \|\| null/);
  assert.match(source, /lastName: lastName \|\| null/);
  assert.match(source, /await batch\.commit\(\)/);
  assert.match(source, /student_account_created/);
});


test('new student accounts require a numeric district SIS id before sign-in setup', () => {
  const ui = read('src/SignInAccess.jsx');
  const server = read('functions/index.js');
  assert.match(ui, /District\/SIS Student ID/);
  assert.match(ui, /inputMode="numeric"/);
  assert.match(ui, /replace\(\/\\D\/g, ''\)/);
  assert.match(server, /New student accounts must use the district SIS student ID \(digits only\)/);
  assert.match(server, /sisStudentId: studentId/);
});

test('first-time student sign-in and Google linking cannot create an arbitrary roster identity', () => {
  const server = read('functions/index.js');
  assert.match(server, /That student ID is not on the MathMaster roster yet/);
  assert.match(server, /before first sign-in/);
  assert.match(server, /before linking Google/);
});

test('SIS identity fields are server-owned and cannot be changed by a client grade write', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function sisIdentityUnchanged\(\)/);
  assert.match(rules, /function sisIdentityAbsentOnClientCreate\(\)/);
  assert.match(rules, /&& sisIdentityUnchanged\(\)/);
  assert.match(rules, /&& sisIdentityAbsentOnClientCreate\(\)/);
});

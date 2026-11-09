// THE SIGN-IN PATH TAKES THE STUDENT-NAME CHECK FROM THE SHARED RESOLVER
// (PF01, the sign-in path).
//
// AuthProvider.jsx builds a student's session name with acceptStudentName: a
// name, or nothing, never the student's id. It imported it from
// src/platform/studentName.js, the layer every screen formats, sorts and
// searches names with, and so that module (0.9 KB gzip) loaded before every
// sign-in screen for the one function it re-exports. AuthProvider imports it
// from the resolver itself now (functions/shared/studentIdentity.mjs): the same
// function, so no session name changes.
//
// The resolver and classModel.mjs under it stay on the path (2.8 KB): leaving
// them needs a functions/shared split, or a lazy load that would add a failure
// path to signing in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chainTo, repo, signInGraph } from './helpers/firstLoadGraph.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import * as resolver from '../../functions/shared/studentIdentity.mjs';
import * as screens from '../../src/platform/studentName.js';

const file = (name) => path.join(repo, name);
const signIn = signInGraph();

test('the walker reaches AuthProvider and the shared name resolver on the sign-in path', () => {
  for (const name of ['src/auth/AuthProvider.jsx', 'functions/shared/studentIdentity.mjs']) {
    assert.ok(signIn.has(file(name)), `${name} is not on the sign-in path: the walk or the wiring changed, so the absence below proves nothing`);
  }
});

test('studentName.js is not on the sign-in path', () => {
  const key = file('src/platform/studentName.js');
  assert.ok(existsSync(key), 'src/platform/studentName.js no longer exists: point this test at the module that took its place');
  assert.ok(!signIn.has(key), `studentName.js is on the sign-in path: ${signIn.has(key) ? chainTo(signIn, key) : ''}. Import what the sign-in path needs from functions/shared/studentIdentity.mjs.`);
});

test('the session reads a name with the check every screen uses', () => {
  const provider = executableSource(readFileSync(file('src/auth/AuthProvider.jsx'), 'utf8'));
  assert.match(provider, /^import \{ acceptStudentName \} from '\.\.\/\.\.\/functions\/shared\/studentIdentity\.mjs';$/m);
  // studentName.js re-exports the resolver's own function, so the session and
  // every screen judge a name the same way.
  assert.equal(screens.acceptStudentName, resolver.acceptStudentName);
  // What the session keeps: a name, never the student's id or a placeholder.
  assert.equal(resolver.acceptStudentName('Jordan Williams', { studentId: '910002' }), 'Jordan Williams');
  assert.equal(resolver.acceptStudentName('910002', { studentId: '910002' }), '');
  assert.equal(resolver.acceptStudentName('Student', { studentId: '910002' }), '');
});

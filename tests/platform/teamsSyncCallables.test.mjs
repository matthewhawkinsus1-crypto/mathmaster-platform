// #613: the TEAMS sync callables only authorize, load and store; every rule
// lives in the pure shared modules (teamsSyncServer.mjs, teamsSyncEngine.mjs),
// which tests/platform/teamsSyncServer.test.mjs proves. These contracts pin
// what the pure modules cannot: that each callable checks the teacher of
// record before reading or writing, that a step's read-modify-write is one
// transaction, and that the three collections stay server-only.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { functionsDeclaration } from './helpers/functionsBackendSource.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const CALLABLES = ['setTeamsSyncSections', 'publishTeamsSyncTargets', 'teamsSyncStep', 'getTeamsSyncState'];
const body = (name) => executableSource(functionsDeclaration(name));

test('every TEAMS sync callable checks the teacher of record before it touches a collection', () => {
  for (const name of CALLABLES) {
    const source = body(name);
    const teacher = source.indexOf('await requireTeacher(request)');
    const authority = source.indexOf('await gradeTransferClassAuthority(db, request, request.data?.classId)');
    const firstCollection = source.indexOf('.collection("teamsSync');
    assert.ok(teacher >= 0, `${name} requires a teacher`);
    assert.ok(authority > teacher, `${name} checks the teacher of record`);
    assert.ok(firstCollection > authority, `${name} reads or writes TEAMS sync state only after the authority check`);
    // The class id used afterwards is the one the authority check returned.
    const afterCheck = source.slice(authority + 'await gradeTransferClassAuthority(db, request, request.data?.classId)'.length);
    assert.doesNotMatch(afterCheck, /request\.data\??\.classId/, `${name} uses only the class id the authority check returned`);
  }
});

test('a sync step reads, plans and writes inside one transaction', () => {
  const source = body('teamsSyncStep');
  const transaction = source.indexOf('db.runTransaction(async (transaction) =>');
  assert.ok(transaction > 0);
  const inside = source.slice(transaction);
  assert.match(inside, /transaction\.get\(classRef\)/, 'the lease is read inside the transaction');
  assert.match(inside, /transaction\.getAll\(\.\.\.refs\)/, 'the ledger is read inside the transaction');
  assert.match(inside, /module\.teamsSyncStep\(/, 'the pure step decides');
  assert.match(inside, /module\.changedTeamsLedgerKeys\(ledger, result\.ledger\)/, 'only changed entries are written');
  assert.match(inside, /if \(!result\.changed\) return result\.response;/, 'a dry run or a busy answer writes nothing');
  assert.doesNotMatch(inside, /\bbatch\(\)/, 'no write outside the transaction');
});

test('published grades are checked against the class roster on the server', () => {
  const source = body('publishTeamsSyncTargets');
  assert.match(source, /collection\("grades"\)\.where\("classId", "==", authority\.classId\)/);
  assert.match(source, /module\.teamsRosterIndex\(/);
  assert.match(source, /module\.normalizeTeamsTargets\(\{[\s\S]*roster,/);
});

test('the TEAMS sync collections are server-only in the rules', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  for (const collection of ['teamsSyncClasses', 'teamsSyncTargets', 'teamsSyncLedger']) {
    assert.match(rules, new RegExp(`match /${collection}/\\{[A-Za-z]+\\} \\{ allow read, write: if false; \\}`), collection);
  }
});

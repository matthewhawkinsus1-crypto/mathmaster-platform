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

const CALLABLES = ['setTeamsSyncSections', 'publishTeamsSyncTargets', 'teamsSyncStep', 'getTeamsSyncState', 'setTeamsSyncRemoval'];
const body = (name) => executableSource(functionsDeclaration(name));

test('every TEAMS sync callable checks the teacher of record before it touches a collection', () => {
  for (const name of CALLABLES) {
    const source = body(name);
    const teacher = source.indexOf('await requireTeacher(request)');
    const authority = source.indexOf('await gradeTransferClassAuthority(db, request, request.data?.classId)');
    // A callable touches TEAMS sync state itself, or through the one shared
    // write (writeTeamsSyncTargets); either way only after the check.
    const firstCollection = [source.indexOf('.collection("teamsSync'), source.indexOf('writeTeamsSyncTargets(')]
      .filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? -1;
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

test('published grades are checked against the class roster on the server, by the button and the schedule alike', () => {
  const write = body('writeTeamsSyncTargets');
  assert.match(write, /collection\("grades"\)\.where\("classId", "==", classId\)/);
  // ...and against every student the teacher holds: a district ID two of
  // them carry is left out of the index, so no grade is stored under it.
  assert.match(write, /collection\("grades"\)\.where\("assignedTeacherEmail", "==", rosterEmail\)\.select\("sisStudentId"\)/);
  assert.match(write, /module\.teamsRosterIndex\(recordsOf\(members\), \{ sharedWith: recordsOf\(teacherRoster\) \}\)/);
  assert.match(write, /module\.normalizeTeamsTargets\(\{[\s\S]*roster,/);
  // Only changed targets are rewritten.
  assert.match(write, /const changed = targets\.filter\(\(target\) => stored\.get\(teamsSyncDocId\(classId, target\.key\)\) !== JSON\.stringify\(teamsSyncPlain\(target\)\)\);/);
  assert.match(write, /\.\.\.changed\.map\(\(target\) => \(batch\) => batch\.set\(/);
  // The button passes the class the authority check returned.
  assert.match(body('publishTeamsSyncTargets'), /writeTeamsSyncTargets\(\{\s*db, module, classId: authority\.classId, email: authority\.email, teacherOfRecord: authority\.classData\.teacherOfRecord,/);
  // The schedule writes through the same function, never its own.
  const schedule = body('publishTeamsSyncTargetsOnSchedule');
  assert.match(schedule, /publish: \(\{ classId, email, targetsInput, publishedBy \}\) => writeTeamsSyncTargets\(\{ db, module, classId, email, targetsInput, publishedBy \}\)/);
  assert.doesNotMatch(schedule, /collection\("teamsSync/, 'no write of its own');
});

test('the TEAMS sync collections are server-only in the rules', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  for (const collection of ['teamsSyncClasses', 'teamsSyncTargets', 'teamsSyncLedger']) {
    assert.match(rules, new RegExp(`match /${collection}/\\{[A-Za-z]+\\} \\{ allow read, write: if false; \\}`), collection);
  }
});

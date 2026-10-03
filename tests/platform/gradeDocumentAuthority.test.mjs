/*
 * THE GRADE DOCUMENT'S WRITE AUTHORITY, AS THE CODE STATES IT.
 *
 * The emulator proves the boundary (tests/rules/gradeAuthorityRules.test.mjs,
 * tests/integration/gradeAuthorityEndToEnd.test.mjs). This file keeps the
 * three places that STATE it in agreement, and runs in the platform suite on
 * every PR:
 *
 *   functions/shared/gradeDocumentAuthority.mjs  — the list, with reasons
 *   firestore.rules                              — the enforcement
 *   src/App.jsx + the ingestion courier          — the student's writers
 *
 * and it pins the one new server path the boundary needed: elapsed time on a
 * question (`questionProgress`) is applied by the server, can raise
 * `timeSpent`, and can change nothing else on a canonical record.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE,
  SERVER_ONLY_GRADE_FIELDS,
  SERVER_OWNED_GRADE_FIELDS,
  STUDENT_CLIENT_OWNED_GRADE_FIELDS,
  STUDENT_CREATE_FIELDS,
} from '../../functions/shared/gradeDocumentAuthority.mjs';
import {
  INGESTIBLE_KINDS,
  MAX_QUESTION_TIME_SECONDS,
  PROGRESS_KINDS,
  SUBMISSION_DISPOSITION,
  buildProgressEnvelope,
  decideQuestionProgress,
  normalizeIngestionEnvelope,
  normalizeProgressEnvelope,
  normalizeSubmissionEnvelope,
  questionProgressRecord,
} from '../../functions/shared/submissionIngestion.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const rules = read('firestore.rules');
const app = read('src/App.jsx');
const courier = read('src/services/submissionIngestionService.js');

const quotedNames = (text) => [...String(text).matchAll(/'([^']+)'/g)].map((match) => match[1]);
const rulesFunctionBody = (name) => region(rules, `function ${name}()`, '\n    }\n', `firestore.rules ${name}()`);
const gradesMatch = region(rules, 'match /grades/{studentId} {', 'match /supportProfileRevisions/', 'grades/{studentId} rules');
const allowStatement = (verb) => region(gradesMatch, `allow ${verb}:`, ';', `grades ${verb} rule`);

/* ==========================================================================
 * THE RULES SAY WHAT THE AUTHORITY MODULE SAYS.
 * ======================================================================== */

test('the student allow-list in firestore.rules is exactly the client-owned fields, and owns no grade', () => {
  const allowList = quotedNames(region(rulesFunctionBody('studentClientOwnedGradeFields'), 'return [', ']', 'allow-list'));
  assert.deepEqual(allowList, [...STUDENT_CLIENT_OWNED_GRADE_FIELDS]);
  for (const field of [...SERVER_OWNED_GRADE_FIELDS, ...SERVER_ONLY_GRADE_FIELDS]) {
    assert.equal(allowList.includes(field), false, `${field} is authoritative grade state and must never be on the student allow-list`);
  }
});

test("a student's update is held to the allow-list by a field diff, not by a list of pinned fields", () => {
  const helper = executableSource(rulesFunctionBody('studentChangesOnlyClientOwnedFields'));
  assert.match(helper, /request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasOnly\(studentClientOwnedGradeFields\(\)\)/);
  // Bound to the owner's branch of the update statement itself.
  const update = executableSource(allowStatement('update'));
  assert.match(update, /ownsStudent\(studentId\)\s*&&[^|]*studentChangesOnlyClientOwnedFields\(\)/);
  // The teacher and root-administrator branches are not narrowed by it.
  assert.match(update, /rootAdmin\(\)\s*\|\|\s*teachesStudent\(\)\s*\|\|/);
  // Every client stays under the pins that predate this boundary.
  for (const pin of ['rosterAuthorizationUnchanged', 'sisIdentityUnchanged', 'studentIdentityUnchanged',
    'testCycleGradesUnchanged', 'teacherGradeOverridesUnchanged', 'serverRecoveryFieldsUnchanged']) {
    assert.match(update, new RegExp(`&&\\s*${pin}\\(\\)`), `${pin} must still apply to every client`);
  }
});

test("a student's create is an allow-list too, and may not carry any grade state the authority module names", () => {
  const create = executableSource(allowStatement('create'));
  assert.match(create, /ownsStudent\(studentId\)\s*&&[^|]*serverOwnedGradeStateAbsentOnStudentCreate\(\)/);
  const helper = executableSource(rulesFunctionBody('serverOwnedGradeStateAbsentOnStudentCreate'));
  assert.match(helper, /return request\.resource\.data\.keys\(\)\.hasOnly\(studentCreateFields\(\)\)\s*&&/);
  const createFields = quotedNames(region(rulesFunctionBody('studentCreateFields'), 'return [', ']', 'create allow-list'));
  assert.deepEqual([...createFields].sort(), [...STUDENT_CREATE_FIELDS].sort());
  const emptied = [...helper.matchAll(/get\('([^']+)', \{\}\) == \{\}/g)].map((match) => match[1]);
  // The four server-only maps have their own create checks, for every creator.
  const serverOnlyCreateChecks = executableSource(create);
  for (const field of GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE) {
    const coveredHere = emptied.includes(field);
    const coveredForEveryone = SERVER_ONLY_GRADE_FIELDS.includes(field)
      && /testCycleGradesAbsentOnCreate\(\)[\s\S]*teacherGradeOverridesAbsentOnCreate\(\)[\s\S]*serverRecoveryFieldsAbsentOnCreate\(\)/
        .test(serverOnlyCreateChecks);
    assert.ok(coveredHere || coveredForEveryone, `${field} must be refused on a student's create`);
  }
});

test('the authority lists do not overlap and name every grade field the server writes by path', () => {
  const clientOwned = new Set(STUDENT_CLIENT_OWNED_GRADE_FIELDS);
  for (const field of [...SERVER_OWNED_GRADE_FIELDS, ...SERVER_ONLY_GRADE_FIELDS]) {
    assert.equal(clientOwned.has(field), false, `${field} cannot be both server-owned and client-owned`);
  }
  /*
   * Every top-level field a Cloud Function addresses with a FieldPath is
   * either an assignment-document field or a grade-document field the
   * authority module classifies. A new server-written grade field is already
   * refused to students by the allow-list; this keeps the documented list
   * honest about what is on the document.
   */
  const ASSIGNMENT_DOCUMENT_FIELDS = new Set(['studentOverrides', 'lessonResources', 'dol']);
  const functionsSources = [
    'functions/index.js', 'functions/classroomSectionEntry.js', 'functions/classroomSectionForceEntry.js',
    ...readdirSync(new URL('../../functions/lib/', import.meta.url)).filter((name) => name.endsWith('.js')).map((name) => `functions/lib/${name}`),
  ];
  const classified = new Set([...SERVER_OWNED_GRADE_FIELDS, ...SERVER_ONLY_GRADE_FIELDS, ...STUDENT_CLIENT_OWNED_GRADE_FIELDS]);
  const unclassified = new Set();
  for (const path of functionsSources) {
    for (const match of executableSource(read(path)).matchAll(/new FieldPath\(\s*"([A-Za-z]+)"/g)) {
      if (!ASSIGNMENT_DOCUMENT_FIELDS.has(match[1]) && !classified.has(match[1])) unclassified.add(`${path}: ${match[1]}`);
    }
  }
  assert.deepEqual([...unclassified], [], 'classify every grade-document field in functions/shared/gradeDocumentAuthority.mjs');
});

/* ==========================================================================
 * THE STUDENT'S OWN CLIENT WRITES NO GRADE STATE.
 * ======================================================================== */

test('the student app addresses no server-owned grade field by path', () => {
  const paths = [...executableSource(app).matchAll(/new FieldPath\(\s*'([A-Za-z]+)'/g)].map((match) => match[1]);
  // Teacher-side seat allocation on an assignment, and the student's
  // engagement time. Nothing on the grade document a student does not own.
  assert.deepEqual([...new Set(paths)].sort(), ['assignmentActivity', 'generationSeats']);
  for (const field of [...SERVER_OWNED_GRADE_FIELDS, ...SERVER_ONLY_GRADE_FIELDS]) {
    assert.equal(paths.includes(field), false, `the app must not write ${field} by path`);
  }
});

test('the only direct student transaction writes a response checkpoint, never a canonical record', () => {
  const direct = executableSource(region(
    app, 'const reconcileThroughClientTransaction', 'const reconcileDurableStudentAction', 'direct checkpoint path',
  ));
  assert.match(direct, /if \(INGESTIBLE_KINDS\.includes\(action\.kind\)\) \{\s*throw new Error\(/);
  assert.match(direct, /if \(action\.kind !== 'responseCheckpoint'\) \{\s*throw new Error\(/);
  assert.match(direct, /transaction\.set\(doc\(db, 'studentResponseCheckpoints'/);
  assert.doesNotMatch(direct, /transaction\.update\(/);
  assert.doesNotMatch(direct, /gradesByAssignment/);
});

test('elapsed-time progress is delivered to server ingestion, through an imported builder', () => {
  const dispatcher = executableSource(region(
    app, 'const reconcileDurableStudentAction', 'const drainStudentOutbox', 'durable dispatcher',
  ));
  assert.match(dispatcher, /const elapsedTime = PROGRESS_KINDS\.includes\(action\.kind\)/);
  assert.match(dispatcher, /if \(INGESTIBLE_KINDS\.includes\(action\.kind\) \|\| elapsedTime\)/);
  assert.match(dispatcher, /elapsedTime\s*\?\s*await ingestOneSubmission\(buildProgressEnvelopeForAction\(action\)\)\s*:\s*await ingestOneSubmission\(buildSubmissionEnvelopeForAction\(action\)\)/);
  // Whatever reaches the direct path after that is a checkpoint, or nothing.
  assert.match(dispatcher, /return reconcileThroughClientTransaction\(action\);\s*\};?\s*$/);
  // App.jsx is .jsx: nothing imports it, so a call with no import would be a
  // runtime ReferenceError that passes every other check (AGENTS.md).
  assert.match(app, /import \{[^}]*\bPROGRESS_KINDS\b[^}]*\bbuildProgressEnvelopeForAction\b[^}]*\} from '\.\/services\/submissionIngestionService\.js'/);
  // And the courier forwards progress envelopes instead of dropping them.
  assert.match(courier, /\.map\(normalizeIngestionEnvelope\)/);
  assert.match(courier, /export const buildProgressEnvelopeForAction = \(action\) => buildProgressEnvelope\(/);
});

test('signing in shows the canonical record and writes nothing back to it', () => {
  const hydration = executableSource(region(
    app, "const studentSnapshot = await getDoc(doc(db, 'grades', studentId));", 'setTeacherGradeOverridesByAssignment(studentData', 'student hydration',
  ));
  assert.match(hydration, /setTracker\(studentData\.gradesByAssignment \|\| \{\}\)/);
  assert.doesNotMatch(hydration, /updateDoc\(|setDoc\(|repairGradesByAssignmentWithCurrentGrader\(/);
  // The one-time current-grader correction keeps its teacher-authorized writer.
  const teacherRepair = region(app, 'const persistCurrentGraderCreditRepairs', 'const repairedById', 'teacher grader repair');
  assert.match(teacherRepair, /batch\.update\(doc\(db, 'grades', student\.id\), \{ gradesByAssignment \}\)/);
});

test('closing a DOL on the student screen writes no projection to the grade document', () => {
  const close = executableSource(region(
    app, 'CLIENT DOL CLOSE IS IMMEDIATE FEEDBACK', '}, [now, user, assignments, classSchedule, gradeDisplayTracker, dolGradesByAssignment]);', 'DOL close effect',
  ));
  assert.doesNotMatch(close, /runTransaction\(|updateDoc\(|setDoc\(|transaction\.|FieldPath\(/);
  // Immediate local feedback stays, and never replaces what the server finalized.
  assert.match(close, /setDolGradesByAssignment\(\(current\) => \{\s*if \(current\?\.\[assignmentId\]\?\.\[dateKey\]\?\.finalized === true\) return current;/);
});

/* ==========================================================================
 * ELAPSED TIME: THE SERVER RAISES `timeSpent` AND TOUCHES NOTHING ELSE.
 * ======================================================================== */

const graded = () => ({
  status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40,
  partGrades: [{ id: 'p1', isCorrect: true, isComplete: true }], lastSubmissionId: 'srv-3', gradedBy: 'server',
  familyDelivery: { familyId: 'f', index: 2 }, timeSpent: 100,
});

test('a progress reading raises timeSpent and leaves every other field of the record byte-for-byte', () => {
  const record = questionProgressRecord({ canonicalRecord: graded(), timeSpentSeconds: 250 });
  assert.deepEqual(record, { ...graded(), timeSpent: 250 });
});

test('a smaller, equal or replayed reading writes nothing; an absurd one is bounded', () => {
  assert.equal(questionProgressRecord({ canonicalRecord: graded(), timeSpentSeconds: 100 }), null);
  assert.equal(questionProgressRecord({ canonicalRecord: graded(), timeSpentSeconds: 12 }), null);
  assert.equal(questionProgressRecord({ canonicalRecord: graded(), timeSpentSeconds: Number.NaN }), null);
  assert.equal(questionProgressRecord({ canonicalRecord: graded(), timeSpentSeconds: 1e12 }).timeSpent, MAX_QUESTION_TIME_SECONDS);
});

test('a viewed question with no record becomes an unattempted record, never an attempt', () => {
  const record = questionProgressRecord({ canonicalRecord: null, timeSpentSeconds: 40 });
  assert.equal(record.status, 'unattempted');
  assert.equal(record.attemptCount, 0);
  assert.equal(record.totalAttempts, 0);
  assert.equal(record.partialCredit, 0);
  assert.equal(record.timeSpent, 40);
  // A legacy string record keeps exactly the meaning it had.
  const legacy = questionProgressRecord({ canonicalRecord: 'attempted', timeSpentSeconds: 40 });
  assert.equal(legacy.status, 'attempted');
  assert.equal(legacy.attemptCount, 1);
});

test('a progress envelope off the wire keeps identity and a time, and nothing that could become a verdict', () => {
  const wire = {
    kind: 'questionProgress', actionId: 'p-1', assignmentId: 'A1', questionIndex: 3, timeSpentSeconds: 75,
    studentId: 'SOMEONE_ELSE', record: { status: 'correct', partialCredit: 100 }, status: 'correct', isCorrect: true,
    partialCredit: 100, attemptCount: 0, totalAttempts: 0, lastSubmissionId: 'forged', response: { value: 'x' },
    // Secureness is read from the assignment by the server, never from the
    // envelope: the flag is dropped like every other riding field, so a
    // flagged envelope is still judged (and retired) by decideQuestionProgress.
    secure: true,
  };
  const envelope = normalizeProgressEnvelope(wire);
  assert.deepEqual(Object.keys(envelope).sort(), [
    'actionId', 'activityRole', 'assignmentId', 'capturedAt', 'kind', 'questionIndex', 'schemaVersion', 'timeSpentSeconds',
  ]);
  assert.equal(envelope.timeSpentSeconds, 75);
  // The verdict the forged envelope carried cannot reach the record.
  const record = questionProgressRecord({ canonicalRecord: graded(), timeSpentSeconds: envelope.timeSpentSeconds });
  assert.equal(record, null, 'nothing to raise, so nothing is written');
});

test('progress and graded work never cross: neither normalizer reads the other kind', () => {
  assert.deepEqual([...PROGRESS_KINDS], ['questionProgress']);
  for (const kind of PROGRESS_KINDS) assert.equal(INGESTIBLE_KINDS.includes(kind), false);
  const progress = { kind: 'questionProgress', actionId: 'p', assignmentId: 'A', questionIndex: 0, timeSpentSeconds: 5 };
  const graded = { kind: 'ordinarySubmission', actionId: 'g', assignmentId: 'A', questionIndex: 0 };
  assert.equal(normalizeSubmissionEnvelope(progress), null, 'elapsed time is never graded work');
  assert.equal(normalizeProgressEnvelope(graded), null, 'graded work is never mere elapsed time');
  assert.equal(normalizeIngestionEnvelope(progress).kind, 'questionProgress');
  assert.equal(normalizeIngestionEnvelope(graded).kind, 'ordinarySubmission');
  assert.throws(() => buildProgressEnvelope({ actionId: 'x', kind: 'ordinarySubmission', studentId: 's', assignmentId: 'A', questionIndex: 0 }));
  assert.throws(() => buildProgressEnvelope({ actionId: '', studentId: 's', assignmentId: 'A', questionIndex: 0 }));
});

test('progress is recorded only for a question on an assignment the roster says is this student\'s', () => {
  const envelope = normalizeProgressEnvelope({ kind: 'questionProgress', actionId: 'p', assignmentId: 'A', questionIndex: 0, timeSpentSeconds: 30 });
  const context = {
    envelope, assignmentExists: true, gradeRecordExists: true, secureAssignment: false,
    authorizedForClass: true, question: { type: 'literal' }, canonicalRecord: null,
  };
  const accepted = decideQuestionProgress(context);
  assert.equal(accepted.disposition, SUBMISSION_DISPOSITION.ACCEPTED);
  assert.equal(accepted.record.timeSpent, 30);

  const refused = (patch, disposition, reason) => {
    const decision = decideQuestionProgress({ ...context, ...patch });
    assert.equal(decision.disposition, disposition, reason);
    assert.equal(decision.reason, reason);
    assert.equal(decision.record, null, `${reason} writes nothing`);
  };
  // The roster row has not been written yet: worth waiting for.
  refused({ gradeRecordExists: false }, SUBMISSION_DISPOSITION.RETRYABLE, 'grade-record-missing');
  // Proven never recordable: elapsed time is not evidence, so the row retires.
  refused({ assignmentExists: false }, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'assignment-missing');
  refused({ secureAssignment: true }, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'secure-assignment-excluded');
  refused({ authorizedForClass: false }, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'assignment-not-assigned-to-class');
  refused({ authorizedForClass: null }, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'assignment-not-assigned-to-class');
  refused({ question: null }, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'question-index-not-found');
  refused({ envelope: { ...envelope, kind: 'ordinarySubmission' } }, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'unreadable-envelope');

  const unchanged = decideQuestionProgress({ ...context, canonicalRecord: graded(), envelope: { ...envelope, timeSpentSeconds: 50 } });
  assert.equal(unchanged.disposition, SUBMISSION_DISPOSITION.ACCEPTED);
  assert.equal(unchanged.reason, 'time-already-recorded');
  assert.equal(unchanged.record, null);
});

test('the ingestion callable routes progress to its own writer, with the caller\'s identity', () => {
  const functionsSource = read('functions/index.js');
  const callable = executableSource(region(
    functionsSource, 'exports.ingestStudentSubmissions = onCall', 'PRACTICE-BASED RECOVERY — THE ONLY WRITER', 'ingestion callable',
  ));
  assert.match(callable, /const progress = ingestion\.normalizeProgressEnvelope\(raw\);\s*if \(progress\) \{\s*progress\.studentId = studentId;[\s\S]*?recordOneQuestionProgress\(\{ db, studentId, envelope: progress \}\)[\s\S]*?continue;/);
  const writer = executableSource(region(
    functionsSource, 'async function recordOneQuestionProgress', '// Ingestion stops starting new envelopes', 'progress writer',
  ));
  assert.match(writer, /db\.collection\("grades"\)\.doc\(studentId\)/);
  assert.match(writer, /studentMatchesAssignmentAudience\(\{ assignment, classId: authoritativeStudentClassId\(gradeData\) \}\)/);
  assert.match(writer, /if \(decision\.record\) \{\s*transaction\.update\(\s*gradeRef,\s*new FieldPath\("gradesByAssignment", envelope\.assignmentId, questionKey\),\s*decision\.record,/);
  // No receipt, no evidence, no projection: time is not academic evidence.
  assert.doesNotMatch(writer, /studentSubmissionReceipts|SUBMISSION_RECEIPT_COLLECTION|evidenceEvents|classworkGradesByAssignment|dolGradesByAssignment/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS,
  linkedIncidentIds,
  migratedIncidentId,
  planIntegrityOverrideNoteMigration,
  splitIntegrityConsequence,
} from '../../functions/shared/integrityOverridePrivacy.mjs';
import {
  assertPlanKeepsGrades,
  parseMigrationArgs,
  runIntegrityOverrideNoteMigration,
} from '../../scripts/migrate-integrity-override-notes.mjs';
import { ASSIGNMENT_ZERO_REASON_LABELS, teacherGradeReasonLabel } from '../../src/platform/student/studentGradeCenterModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// An integrity zero lives on grades/{studentId}, which the student reads. Its
// teacher-only details (the free-text note, who acted, the participant role)
// belong on the teacher-only incident. These tests prove the split for new
// zeros, the callable's use of it, and the one-off migration for old ones.

const ACTOR = { uid: 'uid-teacher', email: 'Teacher@Example.test', name: 'Ms. Teacher' };
const NOTE = 'Copied from Jordan B. during the quiz.';
const NOW = '2026-10-10T12:00:00.000Z';

const teacherOnlyKeysIn = (value) => {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    Object.entries(node).forEach(([key, child]) => {
      if (INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS.includes(key)) found.push(key);
      visit(child);
    });
  };
  visit(value);
  return found;
};

test('a new integrity zero puts only the consequence and its fixed reason on the grade doc', () => {
  for (const scope of ['assignment', 'section']) {
    const { studentOverride, incidentDetails } = splitIntegrityConsequence({
      scope, reasonCode: 'academicDishonesty', reasonLabel: ASSIGNMENT_ZERO_REASON_LABELS.academicDishonesty,
      sectionRole: scope === 'section' ? 'classwork' : null, participantRole: 'supplied', note: NOTE, actor: ACTOR,
      incidentId: 'inc-1', at: NOW,
    });
    assert.deepEqual(teacherOnlyKeysIn(studentOverride), [], `${scope}: no teacher-only field on the grade doc`);
    assert.equal(JSON.stringify(studentOverride).includes('Jordan'), false);
    assert.equal(JSON.stringify(studentOverride).includes('example.test'), false);
    assert.equal(studentOverride.active, true);
    assert.equal(studentOverride.score, 0);
    assert.equal(studentOverride.incidentId, 'inc-1');
    // The student still sees why: the fixed code and its fixed label.
    assert.equal(teacherGradeReasonLabel(studentOverride), 'Unauthorized assistance / cheating');
    assert.deepEqual(incidentDetails, {
      note: NOTE,
      actor: { uid: 'uid-teacher', email: 'teacher@example.test', name: 'Ms. Teacher' },
      participantRole: 'supplied',
    });
  }
  const section = splitIntegrityConsequence({ scope: 'section', reasonCode: 'cellPhoneUse', reasonLabel: 'x', sectionRole: 'dol', incidentId: 'i', at: NOW }).studentOverride;
  assert.equal(section.persistent, true, 'a section zero survives later attempts');
  assert.equal(section.source, 'teacher-section-zero');
  assert.equal(section.sectionRole, 'dol');
});

test('overrideStudentAssignmentGrade writes the split: grade entries from studentOverride, details on the incident', () => {
  const functions = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const callable = region(functions, 'exports.overrideStudentAssignmentGrade = onCall', '// Class Points:', 'integrity callable');
  const gradeWrites = executableSource(region(callable, 'if (scope === "section") {', 'transaction.update(gradeRef,', 'integrity grade-doc entries'));
  // Every entry the grade doc receives is built from the student-readable half.
  assert.match(gradeWrites, /assignmentOverrides\[String\(index\)\] = \{ \.\.\.studentOverride \}/);
  assert.match(gradeWrites, /nextOverride = action === "issueZero" \? studentOverride : null/);
  assert.doesNotMatch(gradeWrites, /\bnote\b|\bactor\b|participantRole/, 'no teacher-only field is written onto the grade doc');
  assert.match(callable, /integrityPrivacy\.splitIntegrityConsequence\(\{[\s\S]*?participantRole, note, actor,/);
  const incident = region(callable, 'kind: "academicIntegrityIncident"', 'transaction.set(parentFollowUpRef', 'incident write');
  assert.match(incident, /note: incidentDetails\.note/);
  assert.match(incident, /actor: incidentDetails\.actor/);
  assert.match(incident, /participantRole: incidentDetails\.participantRole/);
});

const legacyAssignmentZero = (extra = {}) => ({
  active: true, score: 0, reasonCode: 'academicDishonesty', reason: 'Unauthorized assistance / cheating',
  note: NOTE, source: 'teacher-assignment-zero', participantRole: 'received', incidentId: 'inc-a', actor: ACTOR, at: NOW, ...extra,
});
const legacySectionEntry = (extra = {}) => ({
  active: true, score: 0, persistent: true, source: 'teacher-section-zero', incidentId: 'inc-s',
  sectionRole: 'classwork', reasonCode: 'cellPhoneUse', reason: 'Prohibited cellphone use', participantRole: 'individual',
  note: NOTE, actor: ACTOR, at: NOW, ...extra,
});
const questionCorrection = { active: true, score: 80, source: 'grantPartCredit', updatedAt: NOW, totalAttempts: 2, variantIndex: 0 };
const incidentAsWritten = (extra = {}) => ({
  kind: 'academicIntegrityIncident', authorizedTeacherEmails: ['teacher@example.test'], note: NOTE,
  evidence: { scope: 'assignment', incidentReason: 'academicDishonesty', participantRole: 'received' }, ...extra,
});

const applyPlan = (gradeData, plan) => {
  const next = structuredClone(gradeData);
  plan.assignments.forEach(({ assignmentId, nextOverrides }) => { next.teacherGradeOverridesByAssignment[assignmentId] = nextOverrides; });
  return next;
};
const applyIncidentWrites = (incidents, plan) => {
  const next = structuredClone(incidents);
  plan.incidentWrites.forEach(({ incidentId, op, data }) => {
    next[incidentId] = op === 'create' ? structuredClone(data) : {
      ...next[incidentId], ...data, evidence: { ...next[incidentId]?.evidence, ...data.evidence },
    };
  });
  return next;
};

test('migration strips an old assignment zero, adds only what the incident lacks, keeps the grade, and is idempotent', () => {
  const gradeData = {
    assignedTeacherEmail: 'teacher@example.test',
    teacherGradeOverridesByAssignment: {
      A1: { __assignment: legacyAssignmentZero(), 2: questionCorrection },
      A2: { 0: questionCorrection },
    },
  };
  const incidents = { 'inc-a': incidentAsWritten() };
  assert.deepEqual(linkedIncidentIds(gradeData), ['inc-a']);
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: incidents, nowIso: NOW });

  assert.deepEqual(plan.assignments.map((entry) => entry.assignmentId), ['A1'], 'an assignment with nothing to strip is not rewritten');
  const next = plan.assignments[0].nextOverrides;
  assert.deepEqual(teacherOnlyKeysIn(next), []);
  assert.deepEqual(next.__assignment, {
    active: true, score: 0, reasonCode: 'academicDishonesty', reason: 'Unauthorized assistance / cheating',
    source: 'teacher-assignment-zero', incidentId: 'inc-a', at: NOW,
  });
  assert.deepEqual(next[2], questionCorrection, 'a per-question correction is untouched');
  // The incident already held the note and the role; only the actor moves.
  assert.equal(plan.incidentWrites.length, 1);
  assert.equal(plan.incidentWrites[0].op, 'fill');
  assert.deepEqual(plan.incidentWrites[0].data.actor, { uid: 'uid-teacher', email: 'teacher@example.test', name: 'Ms. Teacher' });
  assert.equal('note' in plan.incidentWrites[0].data, false, 'a field the incident holds is never rewritten');
  assert.equal('evidence' in plan.incidentWrites[0].data, false);
  assertPlanKeepsGrades(gradeData, plan);

  const migrated = applyPlan(gradeData, plan);
  const again = planIntegrityOverrideNoteMigration({
    studentId: 'S1', gradeData: migrated, incidentsById: applyIncidentWrites(incidents, plan), nowIso: NOW,
  });
  assert.deepEqual(again.assignments, [], 'a second run changes nothing');
  assert.deepEqual(again.incidentWrites, []);
});

test('migration of a section zero writes one incident fill; the corrections a lift puts back stay exactly as they were', () => {
  const prior = { active: true, score: 50, source: 'teacher-override', note: 'CORRECTION NOTE', actor: { uid: 'uid-teacher', email: 'teacher@example.test' }, updatedAt: NOW };
  const gradeData = {
    teacherGradeOverridesByAssignment: {
      A1: {
        0: legacySectionEntry(),
        1: legacySectionEntry(),
        __sectionIntegrity_classwork: { active: true, incidentId: 'inc-s', sectionRole: 'classwork', previousOverridesByQuestion: { 0: prior, 1: null } },
      },
    },
  };
  const incidents = { 'inc-s': { kind: 'academicIntegrityIncident', note: '', evidence: { scope: 'section' } } };
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: incidents, nowIso: NOW });
  const next = plan.assignments[0].nextOverrides;
  assert.deepEqual(teacherOnlyKeysIn({ 0: next[0], 1: next[1] }), [], 'the section-zero copies hold no note');
  assert.equal(next[0].score, 0);
  assert.equal(next[0].persistent, true);
  // Review M4 follow-up: the saved correction is put back verbatim by a lift,
  // note and actor included, so the migration leaves it untouched...
  assert.deepEqual(next.__sectionIntegrity_classwork.previousOverridesByQuestion, { 0: prior, 1: null });
  assert.ok(plan.unresolved.some((entry) => entry.key === '__sectionIntegrity_classwork.0' && entry.reason === 'saved-previous-override'));
  // ...and never fills the incident's note, nor lands there as a grade copy.
  assert.equal(plan.incidentWrites.length, 1, 'two entries of one incident make one write');
  const fill = plan.incidentWrites[0].data;
  assert.equal(fill.note, NOTE);
  assert.notEqual(fill.note, 'CORRECTION NOTE');
  assert.equal(fill.evidence.participantRole, 'individual');
  assert.deepEqual(Object.keys(fill.integrityOverrideMigration?.gradeCopies || {}), []);
  assert.equal(JSON.stringify(plan.incidentWrites).includes('CORRECTION NOTE'), false);
  assertPlanKeepsGrades(gradeData, plan);
});

test('a note that differs from the incident is kept beside it, never overwriting it', () => {
  const gradeData = { teacherGradeOverridesByAssignment: { A1: { __assignment: legacyAssignmentZero({ note: 'A different note' }) } } };
  const plan = planIntegrityOverrideNoteMigration({
    studentId: 'S1', gradeData, incidentsById: { 'inc-a': incidentAsWritten({ actor: ACTOR }) }, nowIso: NOW,
  });
  const fill = plan.incidentWrites[0].data;
  assert.equal('note' in fill, false);
  assert.equal(fill.integrityOverrideMigration.gradeCopies['A1:__assignment'].note, 'A different note');
});

test('an override whose incident is missing gets a teacher-only incident created and linked', () => {
  const gradeData = {
    classId: 'class-1',
    teacherGradeOverridesByAssignment: { A1: { __assignment: legacyAssignmentZero({ incidentId: undefined }) } },
  };
  delete gradeData.teacherGradeOverridesByAssignment.A1.__assignment.incidentId;
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: {}, nowIso: NOW });
  const id = migratedIncidentId({ studentId: 'S1', assignmentId: 'A1', groupKey: 'assignment' });
  assert.equal(plan.incidentWrites.length, 1);
  const created = plan.incidentWrites[0];
  assert.equal(created.op, 'create');
  assert.equal(created.incidentId, id);
  assert.deepEqual(created.data.authorizedTeacherEmails, ['teacher@example.test'], 'only the teacher who acted may read it');
  assert.equal(created.data.studentId, 'S1');
  assert.equal(created.data.note, NOTE);
  assert.equal(created.data.evidence.participantRole, 'received');
  assert.equal(plan.assignments[0].nextOverrides.__assignment.incidentId, id, 'the grade doc links the new incident');
  assertPlanKeepsGrades(gradeData, plan);

  // Re-run once that incident exists: it is reused, nothing is created twice.
  const again = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: { [id]: created.data }, nowIso: NOW });
  assert.deepEqual(again.incidentWrites, []);
  assert.equal(again.assignments.length, 1);
});

test('details with nowhere safe to go are left on the grade doc and reported', () => {
  const zero = legacyAssignmentZero({ actor: { uid: 'u' } });
  delete zero.incidentId;
  const gradeData = { teacherGradeOverridesByAssignment: { A1: { __assignment: zero } } };
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: {}, nowIso: NOW });
  assert.deepEqual(plan.assignments, []);
  assert.deepEqual(plan.incidentWrites, []);
  assert.deepEqual(plan.unresolved, [{ assignmentId: 'A1', key: '__assignment', reason: 'no-incident-and-no-teacher-email' }]);
});

// Review finding M4: the planner treated ANY entry with a note/actor as an
// integrity zero. On the emulator a per-question teacher correction (score 50,
// note, actor) was stripped and a teacherConfirmed academicIntegrityIncident
// was created for it. A per-question correction is not an integrity zero.
test('a per-question teacher correction with a note and actor is reported, untouched, and gets no incident', async () => {
  const correction = { active: true, score: 50, source: 'teacher-override', note: 'Gave partial credit for setup.', actor: ACTOR, at: NOW };
  const gradeData = {
    assignedTeacherEmail: 'teacher@example.test',
    classId: 'class-1',
    teacherGradeOverridesByAssignment: { A1: { 3: correction } },
  };
  assert.deepEqual(linkedIncidentIds({ teacherGradeOverridesByAssignment: { A1: { 3: { ...correction, incidentId: 'x' } } } }), [],
    'a correction never makes the migration read an incident');
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: {}, nowIso: NOW });
  assert.deepEqual(plan.assignments, [], 'the grade doc is not rewritten');
  assert.deepEqual(plan.incidentWrites, [], 'no incident is created for it');
  assert.equal(plan.counts.strippedEntries, 0);
  assert.deepEqual(plan.unresolved, [{ assignmentId: 'A1', key: '3', reason: 'not-an-integrity-override' }]);
  assert.equal(JSON.stringify(plan).includes('partial credit'), false, 'the report never carries the note');

  // End to end through the script: --execute writes nothing for this doc.
  const docs = { 'grades/S1': gradeData };
  const live = fakeDb(docs);
  const report = await runIntegrityOverrideNoteMigration({ db: live, FieldPath: FakeFieldPath, mode: 'execute', actor: 'ops@example.test', listIds: true, now: () => NOW });
  assert.equal(report.counts.gradeDocsToChange, 0);
  assert.equal(report.counts.incidentsCreated, 0);
  assert.equal(report.counts.unresolved, 1);
  assert.deepEqual(report.ids.unresolved, [{ studentId: 'S1', assignmentId: 'A1', key: '3', reason: 'not-an-integrity-override' }]);
  assert.equal(live.writes.length, 0, 'no grade or incident write');
  assert.deepEqual(live.store['grades/S1'], docs['grades/S1']);
});

test('real integrity zeros beside a per-question correction are still migrated; the correction is not', () => {
  const correction = { active: true, score: 50, source: 'teacher-override', note: 'Setup credit.', actor: ACTOR, at: NOW };
  const gradeData = {
    assignedTeacherEmail: 'teacher@example.test',
    teacherGradeOverridesByAssignment: {
      A1: { __assignment: legacyAssignmentZero(), 4: correction },
      A2: {
        0: legacySectionEntry(),
        1: legacySectionEntry(),
        5: correction,
        __sectionIntegrity_classwork: { active: true, incidentId: 'inc-s', sectionRole: 'classwork', previousOverridesByQuestion: { 0: null, 1: null } },
      },
    },
  };
  const incidents = {
    'inc-a': incidentAsWritten(),
    'inc-s': { kind: 'academicIntegrityIncident', note: '', evidence: { scope: 'section' } },
  };
  assert.deepEqual(linkedIncidentIds(gradeData), ['inc-a', 'inc-s']);
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: incidents, nowIso: NOW });
  const byId = Object.fromEntries(plan.assignments.map(({ assignmentId, nextOverrides }) => [assignmentId, nextOverrides]));
  assert.deepEqual(Object.keys(byId), ['A1', 'A2']);
  assert.deepEqual(teacherOnlyKeysIn(byId.A1.__assignment), [], 'the assignment zero is stripped');
  assert.deepEqual(teacherOnlyKeysIn(byId.A2[0]), [], 'the section-zero copy is stripped');
  assert.deepEqual(teacherOnlyKeysIn(byId.A2[1]), []);
  assert.equal(byId.A2[0].score, 0);
  assert.strictEqual(byId.A1[4], correction, 'the correction beside the assignment zero is the same object');
  assert.strictEqual(byId.A2[5], correction, 'the correction beside the section zero is the same object');
  assert.equal(plan.counts.strippedEntries, 3);
  assert.equal(plan.counts.incidentsCreated, 0, 'only the two real incidents are filled');
  assert.deepEqual(plan.incidentWrites.map((write) => write.incidentId).sort(), ['inc-a', 'inc-s']);
  assert.deepEqual(plan.unresolved.map(({ assignmentId, key, reason }) => `${assignmentId}:${key}:${reason}`).sort(),
    ['A1:4:not-an-integrity-override', 'A2:5:not-an-integrity-override']);
  assertPlanKeepsGrades(gradeData, plan);
});

test('the grade-value guard refuses a plan that would change a score', () => {
  const gradeData = { teacherGradeOverridesByAssignment: { A1: { __assignment: legacyAssignmentZero() } } };
  const plan = planIntegrityOverrideNoteMigration({ studentId: 'S1', gradeData, incidentsById: { 'inc-a': incidentAsWritten() }, nowIso: NOW });
  assertPlanKeepsGrades(gradeData, plan);
  const tampered = structuredClone(plan);
  tampered.assignments[0].nextOverrides.__assignment.score = 100;
  assert.throws(() => assertPlanKeepsGrades(gradeData, tampered), /would change a grade value/);
  const relinked = structuredClone(plan);
  relinked.assignments[0].nextOverrides.__assignment.incidentId = 'someone-else';
  assert.throws(() => assertPlanKeepsGrades(gradeData, relinked), /would change a grade value/);
});

test('the migration command is a dry run by default and needs an explicit project', () => {
  assert.throws(() => parseMigrationArgs([]), /--project <id> is required/);
  assert.equal(parseMigrationArgs(['--project', 'p']).mode, 'dry-run');
  assert.throws(() => parseMigrationArgs(['--project', 'p', '--execute']), /--actor/);
  assert.equal(parseMigrationArgs(['--project=p', '--execute', '--actor', 'a@b.test']).mode, 'execute');
  assert.throws(() => parseMigrationArgs(['--project', 'p', '--force']), /Unknown option/);
});

// A tiny in-memory Firestore: enough of the Admin API the script uses.
const fakeDb = (docs) => {
  const store = structuredClone(docs);
  const writes = [];
  const snap = (path) => {
    const [, id] = path.split('/');
    return { id, exists: path in store, data: () => structuredClone(store[path]) };
  };
  const ref = (collection, id) => ({ path: `${collection}/${id}`, id });
  const db = {
    store,
    writes,
    collection: (name) => ({
      doc: (id) => ref(name, id),
      select: () => ({
        get: async () => {
          const found = Object.keys(store).filter((path) => path.startsWith(`${name}/`)).map(snap);
          return { size: found.length, docs: found };
        },
      }),
      add: async (data) => { writes.push({ op: 'add', collection: name, data }); },
    }),
    getAll: async (...refs) => refs.map((entry) => snap(entry.path)),
    runTransaction: async (fn) => fn({
      getAll: async (...refs) => refs.filter((entry) => entry?.path).map((entry) => snap(entry.path)),
      create: (entry, data) => { writes.push({ op: 'create', path: entry.path }); store[entry.path] = data; },
      set: (entry, data) => { writes.push({ op: 'set', path: entry.path }); store[entry.path] = { ...store[entry.path], ...data }; },
      update: (entry, ...pairs) => {
        writes.push({ op: 'update', path: entry.path });
        for (let index = 0; index < pairs.length; index += 2) {
          const [, assignmentId] = pairs[index].segments;
          store[entry.path].teacherGradeOverridesByAssignment[assignmentId] = pairs[index + 1];
        }
      },
    }),
  };
  return db;
};
class FakeFieldPath { constructor(...segments) { this.segments = segments; } }

test('a dry run writes nothing; --execute strips the grade doc and fills the incident; a re-run is a no-op', async () => {
  const docs = {
    'grades/S1': { teacherGradeOverridesByAssignment: { A1: { __assignment: legacyAssignmentZero() } } },
    'grades/S2': { teacherGradeOverridesByAssignment: { A1: { 0: questionCorrection } } },
    'studentSupportEvents/inc-a': incidentAsWritten(),
  };
  const dry = fakeDb(docs);
  const report = await runIntegrityOverrideNoteMigration({ db: dry, FieldPath: FakeFieldPath, mode: 'dry-run', now: () => NOW });
  assert.equal(dry.writes.length, 0, 'the default mode never writes');
  assert.equal(report.counts.gradeDocsScanned, 2);
  assert.equal(report.counts.gradeDocsToChange, 1);
  assert.equal(report.counts.incidentsFilled, 1);
  assert.equal(JSON.stringify(report).includes('Jordan'), false, 'the report never carries a note');

  const live = fakeDb(docs);
  const executed = await runIntegrityOverrideNoteMigration({ db: live, FieldPath: FakeFieldPath, mode: 'execute', actor: 'ops@example.test', now: () => NOW });
  assert.deepEqual(executed.execution, { applied: 1, unchanged: 0, missing: 0, refused: 0 });
  assert.deepEqual(teacherOnlyKeysIn(live.store['grades/S1']), []);
  assert.equal(live.store['grades/S1'].teacherGradeOverridesByAssignment.A1.__assignment.score, 0);
  assert.deepEqual(live.store['studentSupportEvents/inc-a'].actor, { uid: 'uid-teacher', email: 'teacher@example.test', name: 'Ms. Teacher' });
  assert.ok(live.writes.some((write) => write.op === 'add' && write.collection === 'adminAuditLog'));

  const writesBefore = live.writes.length;
  const rerun = await runIntegrityOverrideNoteMigration({ db: live, FieldPath: FakeFieldPath, mode: 'execute', actor: 'ops@example.test', now: () => NOW });
  assert.equal(rerun.counts.gradeDocsToChange, 0);
  assert.equal(live.writes.length, writesBefore, 'nothing is written the second time');
});

test('one malformed grade doc is reported and skipped; every other student is still migrated', async () => {
  // Verify lane, integrity: a numeric incidentId made the grade guard throw
  // and stopped the whole run.
  const docs = {
    'grades/S1': { teacherGradeOverridesByAssignment: { A1: { __assignment: legacyAssignmentZero() } } },
    'grades/S0': { assignedTeacherEmail: 'teacher@example.test', teacherGradeOverridesByAssignment: { A1: { __assignment: { active: true, score: 0, note: 'n', incidentId: 123 } } } },
    'studentSupportEvents/inc-a': incidentAsWritten(),
  };
  const live = fakeDb(docs);
  const executed = await runIntegrityOverrideNoteMigration({ db: live, FieldPath: FakeFieldPath, mode: 'execute', actor: 'ops@example.test', listIds: true, now: () => NOW });
  assert.equal(executed.execution.applied, 1);
  assert.deepEqual(teacherOnlyKeysIn(live.store['grades/S1']), []);
  assert.deepEqual(live.store['grades/S0'], docs['grades/S0'], 'the malformed doc is untouched');
  assert.ok(executed.ids.unresolved.some((entry) => entry.studentId === 'S0' && entry.reason === 'plan-refused'));
});

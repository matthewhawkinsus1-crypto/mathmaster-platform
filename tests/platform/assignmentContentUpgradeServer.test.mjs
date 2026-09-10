import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildContentUpgradePlan,
  buildUpgradedAssignment,
} = require('../../functions/lib/assignmentContentVersion.js');
const {
  migrateTrackerForContentUpgrade,
} = require('../../functions/lib/assignmentContentTrackerMigration.js');

const liveAssignment = {
  id: 'live-1',
  schemaVersion: 5,
  assignmentRevision: 4,
  assignedClassIds: ['class-1'],
  dueAt: '2026-09-11T23:59:00.000Z',
  classroomPackage: { publicationId: 'keep-me' },
  contentLineage: { familyId: 'fam', version: 1, releaseStatus: 'superseded' },
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [
      { questionId: 'q1', type: 'choice', prompt: 'Same', answer: 'A', options: ['A','B'] },
      { questionId: 'q2', type: 'multiAnswer', prompt: 'Kind?', answerFields: [{ id:'kind', answer:'interpolation', inputProfile:'text' }] },
      { questionId: 'q3', type: 'dataModelingLab', mode:'lineFit', prompt:'Exact fit', points:[[0,0],[10,100]] },
      { questionId: 'q4', type:'relationshipModel', prompt:'Identify x, y, and association.', correctIndependentId:'x', correctDependentId:'y' },
      { questionId: 'q5', type:'dataModelingLab', mode:'full', prompt:'Do an impossible workflow.' },
    ],
  }],
};

const targetAssignment = {
  id: 'library-v2',
  schemaVersion: 5,
  assignmentRevision: 1,
  assignedClassIds: [],
  contentLineage: { familyId: 'fam', version: 2, releaseStatus: 'current' },
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [
      liveAssignment.sections[0].questions[0],
      { questionId: 'q2', type: 'multiAnswer', prompt:'Kind?', answerFields: [{ id:'kind', answer:'interpolation', inputProfile:'choice', type:'choice', options:['interpolation','extrapolation'] }] },
      { ...liveAssignment.sections[0].questions[2], prompt:'Reasonable visual fit', slopeTolerance: 2, interceptTolerance: 5 },
      { ...liveAssignment.sections[0].questions[3], prompt:'Identify the independent and dependent quantities.' },
      { questionId: 'q5', type:'multiAnswer', prompt:'Corrected task', answerFields:[{id:'sseA',answer:0.7},{id:'sseB',answer:1.64}] },
    ],
  }],
};

test('preview classifies all live V1 to V2 change kinds', async () => {
  const plan = await buildContentUpgradePlan({ liveAssignment, targetAssignment });
  assert.deepEqual(plan.counts, {
    unchanged: 1,
    safeResponseControl: 1,
    gradingExpansion: 1,
    clarificationOnly: 1,
    fundamental: 1,
  });
  assert.equal(plan.fromVersion, 1);
  assert.equal(plan.toVersion, 2);
  assert.equal(plan.requiresFundamentalChoice, true);
  assert.ok(plan.planHash);
});

test('fundamental replacement never shifts a historical tracker index', async () => {
  const plan = await buildContentUpgradePlan({ liveAssignment, targetAssignment });
  const result = buildUpgradedAssignment({
    liveAssignment,
    targetAssignment,
    plan,
    fundamentalChoices: { q5: 'retire-and-replace' },
    replacementId: () => 'q5-v2-live',
  });
  const flat = result.assignment.sections.flatMap((section) => section.questions);
  assert.deepEqual(flat.slice(0, 5).map((q) => q.questionId), ['q1','q2','q3','q4','q5']);
  assert.equal(flat[4].teacherExcluded, true);
  assert.equal(flat.at(-1).questionId, 'q5-v2-live');
  assert.equal(flat.at(-1).supersedesQuestionId, 'q5');
  assert.equal(result.assignment.id, 'live-1');
  assert.deepEqual(result.assignment.assignedClassIds, ['class-1']);
  assert.equal(result.assignment.dueAt, '2026-09-11T23:59:00.000Z');
  assert.deepEqual(result.assignment.classroomPackage, { publicationId:'keep-me' });
});

test('wider regression tolerance can upgrade saved real work without lowering credit', async () => {
  const plan = await buildContentUpgradePlan({ liveAssignment, targetAssignment });
  const tracker = {
    2: {
      status:'expired',
      attemptCount:3,
      totalAttempts:3,
      partialCredit:0,
      bestPartialCredit:0,
      lastResponseKey:JSON.stringify({m:9,b:4}),
      partGrades:[],
    },
  };
  const result = migrateTrackerForContentUpgrade({
    tracker,
    plan,
    liveQuestions: liveAssignment.sections[0].questions,
    nextQuestions: targetAssignment.sections[0].questions,
    correctedAt:'2026-09-10T21:30:00.000Z',
  });
  assert.equal(result.tracker[2].status, 'correct');
  assert.equal(result.tracker[2].bestPartialCredit, 100);
  assert.equal(result.tracker[2].totalAttempts, 3);
});

test('unprovable grading expansion preserves prior credit exactly', async () => {
  const plan = await buildContentUpgradePlan({ liveAssignment, targetAssignment });
  const tracker = {
    2: { status:'expired', attemptCount:3, totalAttempts:3, partialCredit:40, bestPartialCredit:60, lastResponseKey:'not-json', partGrades:[] },
  };
  const result = migrateTrackerForContentUpgrade({
    tracker,
    plan,
    liveQuestions: liveAssignment.sections[0].questions,
    nextQuestions: targetAssignment.sections[0].questions,
  });
  assert.equal(result.tracker[2].bestPartialCredit, 60);
  assert.equal(result.tracker[2].partialCredit, 40);
  assert.equal(result.tracker[2].totalAttempts, 3);
});


test('preview callable is server-side and client only calls it through Functions', async () => {
  const { readFile } = await import('node:fs/promises');
  const [indexSource, authSource] = await Promise.all([
    readFile('functions/index.js', 'utf8'),
    readFile('src/auth/authService.js', 'utf8'),
  ]);
  assert.match(indexSource, /exports\.previewAssignmentContentUpgrade\s*=\s*onCall/);
  assert.match(indexSource, /buildContentUpgradePlan/);
  assert.match(authSource, /previewAssignmentContentUpgrade/);
});


test('commit callable revalidates the preview and writes no replacement Classroom post', async () => {
  const { readFile } = await import('node:fs/promises');
  const [indexSource, authSource] = await Promise.all([
    readFile('functions/index.js', 'utf8'),
    readFile('src/auth/authService.js', 'utf8'),
  ]);
  assert.match(indexSource, /exports\.commitAssignmentContentUpgrade\s*=\s*onCall/);
  assert.match(indexSource, /expectedPlanHash/);
  assert.match(indexSource, /assignmentVersionEvents/);
  assert.match(indexSource, /reason: "section-grade-reconcile"/);
  assert.match(indexSource, /source: "assignment-content-version"/);
  assert.doesNotMatch(indexSource.match(/exports\.commitAssignmentContentUpgrade[\s\S]*?(?=\n\/\*\*|\nexports\.|$)/)?.[0] || '', /createCourseWork|publishAssignment/);
  assert.match(authSource, /commitAssignmentContentUpgrade/);
});

test('live upgrade authority is class ownership, never designated repair authority', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const start = indexSource.indexOf('function contentUpgradeAudience');
  const end = indexSource.indexOf('async function loadSavedAssignmentTrackers', start);
  const authority = indexSource.slice(start, end);
  assert.match(authority, /assignedClassIds/);
  assert.match(authority, /every\(\(snapshot\)/);
  assert.match(authority, /teacherOfRecord/);
  assert.match(authority, /isRootAdminEmail/);
  assert.doesNotMatch(authority, /requireRepairAuthority|designated/i);
});

test('live upgrade writes an allow-list and cannot reset the assignment or publication metadata', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const start = indexSource.indexOf('exports.commitAssignmentContentUpgrade = onCall');
  const end = indexSource.indexOf('/**\n * Create the next human-facing', start);
  const commit = indexSource.slice(start, end);
  const liveUpdateStart = commit.indexOf('transaction.update(liveRef');
  const liveUpdateEnd = commit.indexOf('migratedRows.forEach', liveUpdateStart);
  const liveUpdate = commit.slice(liveUpdateStart, liveUpdateEnd);
  assert.match(liveUpdate, /sections: upgraded\.assignment\.sections/);
  assert.match(liveUpdate, /assignmentRevision:/);
  assert.match(liveUpdate, /contentLineage:/);
  assert.match(liveUpdate, /contentUpgrade:/);
  assert.doesNotMatch(liveUpdate, /assignedClassIds|dueAt|classroomPackage|accommodation|CourseWork/i);
  assert.doesNotMatch(commit, /resetAssignment|delete\(|createCourseWork|publishAssignment/);
});


test('live upgrade authority supports legacy period-only live assignments and verified root email', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const start = indexSource.indexOf('function contentUpgradeAudience');
  const end = indexSource.indexOf('async function loadSavedAssignmentTrackers', start);
  const authority = indexSource.slice(start, end);
  assert.match(authority, /assignedClassPeriods/);
  assert.match(authority, /loadClasses\(db\)/);
  assert.match(authority, /period/i);
  assert.match(authority, /isRootAdminEmail\(email\)/);
  assert.doesNotMatch(authority, /isRootAdminEmail\(email\)\s*&&\s*request\.auth\?\.token\?\.rootAdmin/);
});

test('preview wraps the full server path and logs unexpected failures instead of leaking bare internal', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const start = indexSource.indexOf('exports.previewAssignmentContentUpgrade = onCall');
  const end = indexSource.indexOf('exports.commitAssignmentContentUpgrade = onCall', start);
  const preview = indexSource.slice(start, end);
  const tryIndex = preview.indexOf('try {');
  const firstFirestoreRead = preview.indexOf('db.collection("assignments")');
  assert.ok(tryIndex >= 0 && firstFirestoreRead > tryIndex, 'preview should enter try/catch before Firestore reads');
  assert.match(preview, /logger\.error\("Content V2 upgrade preview failed"/);
  assert.match(preview, /MathMaster could not preview this Content V2 upgrade/);
});


test('content upgrade tracker reads stay scoped to the assignment audience', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const helperStart = indexSource.indexOf('function contentUpgradeGradeQueries');
  const previewStart = indexSource.indexOf('exports.previewAssignmentContentUpgrade = onCall');
  const commitStart = indexSource.indexOf('exports.commitAssignmentContentUpgrade = onCall');
  assert.ok(helperStart >= 0, 'content upgrade should define audience-scoped grade queries');
  const helper = indexSource.slice(helperStart, previewStart);
  assert.match(helper, /where\("classId",\s*"=="/);
  assert.match(helper, /where\("classPeriod",\s*"=="/);
  assert.doesNotMatch(helper, /collection\("grades"\)\.select/);
  const commit = indexSource.slice(commitStart, indexSource.indexOf('/**\n * Create the next human-facing', commitStart));
  assert.doesNotMatch(commit, /collection\("grades"\)\.select/);
});

test('repeat Content V2 commit is idempotent after an earlier successful save', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const start = indexSource.indexOf('exports.commitAssignmentContentUpgrade = onCall');
  const end = indexSource.indexOf('/**\n * Create the next human-facing', start);
  const commit = indexSource.slice(start, end);
  assert.match(commit, /alreadyUpgraded/);
  assert.match(commit, /contentLineage\?\.familyId/);
  assert.match(commit, /contentLineage\?\.version/);
});

test('preview recognizes an already-current live assignment instead of treating it as an error', async () => {
  const { readFile } = await import('node:fs/promises');
  const indexSource = await readFile('functions/index.js', 'utf8');
  const start = indexSource.indexOf('exports.previewAssignmentContentUpgrade = onCall');
  const end = indexSource.indexOf('exports.commitAssignmentContentUpgrade = onCall', start);
  const preview = indexSource.slice(start, end);
  assert.match(preview, /alreadyCurrent/);
  assert.match(preview, /Content V\$\{liveVersion\} is already applied/);
});

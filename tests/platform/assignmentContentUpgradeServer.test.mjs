import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildContentUpgradePlan,
  buildUpgradedAssignment,
} = require('../../functions/lib/assignmentContentVersion.js');
const {
  dataModelingFitIsCorrect,
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
    // Presentation-only graph viewport repairs are their own classification, so
    // reframing a graph is never counted as a response-control correction. This
    // fixture contains none of them.
    graphViewportRepair: 0,
    systemsWorkspaceUpgrade: 0,
    gradingExpansion: 1,
    clarificationOnly: 1,
    // Recovery V2: a static Warm-Up/DOL question whose release is a Question
    // Family slot keeps its live question and gains Recovery beside it. None
    // here (see the test below).
    recoveryCapability: 0,
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

test('a wider fit tolerance never credits a wrong prediction: prediction modes are not provable from the fit alone', () => {
  // The audit's probe: a near-perfect fit with a wildly wrong prediction was
  // migrated to correct at 100%.
  const points = [[0, 0], [1, 2], [2, 4], [3, 6.1]];
  const response = { m: 1.99, b: 0.05, predictionY: -999 };
  assert.equal(dataModelingFitIsCorrect({ type: 'dataModelingLab', mode: 'linearFitPrediction', points, predictionX: 10 }, response), null);
  assert.equal(dataModelingFitIsCorrect({ type: 'dataModelingLab', mode: 'lineFit', points, predictionX: 10 }, response), null);
  // A fit-only question is still regraded on its fit.
  assert.equal(dataModelingFitIsCorrect({ type: 'dataModelingLab', mode: 'lineFit', points }, response), true);
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
  const helperStart = indexSource.indexOf('function contentUpgradeAlreadyCurrent');
  const previewStart = indexSource.indexOf('exports.previewAssignmentContentUpgrade = onCall', helperStart);
  const helper = indexSource.slice(helperStart, previewStart);
  const commitStart = indexSource.indexOf('exports.commitAssignmentContentUpgrade = onCall');
  const commitEnd = indexSource.indexOf('/**\n * Create the next human-facing', commitStart);
  const commit = indexSource.slice(commitStart, commitEnd);
  assert.match(helper, /contentLineage\?\.familyId/);
  assert.match(helper, /contentLineage\?\.version/);
  assert.match(commit, /contentUpgradeAlreadyCurrent\(liveAssignment, targetAssignment\)/);
  assert.match(commit, /alreadyUpgraded: true/);
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


test('Content V2 can restore a live legacy system in place and return one exhausted attempt without lowering credit', async () => {
  const live = {
    id: 'live-systems',
    schemaVersion: 5,
    assignmentRevision: 1,
    assignedClassIds: ['class-1'],
    contentLineage: { familyId: 'systems-family', version: 1, releaseStatus: 'superseded' },
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        questionId: 'systems-q',
        type: 'system',
        prompt: 'Use elimination to solve the system 2x + 3y = 11 and x + 5y = 9.',
        studentActions: ['solveSystem'],
        equationsLatex: ['2x + 3y = 11', 'x + 5y = 9'],
        standard: 'A2.3A',
      }],
    }],
  };
  const target = {
    id: 'library-systems-v2',
    schemaVersion: 5,
    assignmentRevision: 1,
    assignedClassIds: [],
    contentLineage: { familyId: 'systems-family', version: 2, releaseStatus: 'current' },
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        ...live.sections[0].questions[0],
        type: 'systemsWorkspace',
        toolId: 'systemsWorkspace',
        mode: 'algebraic',
        method: 'elimination',
        equations: ['2x + 3y = 11', 'x + 5y = 9'],
        variables: ['x', 'y'],
        requireVerification: true,
      }],
    }],
  };

  const plan = await buildContentUpgradePlan({ liveAssignment: live, targetAssignment: target });
  assert.equal(plan.counts.systemsWorkspaceUpgrade, 1);
  assert.equal(plan.requiresFundamentalChoice, false);

  const upgraded = buildUpgradedAssignment({
    liveAssignment: live,
    targetAssignment: target,
    plan,
  });
  const upgradedQuestion = upgraded.assignment.sections[0].questions[0];
  assert.equal(upgradedQuestion.questionId, 'systems-q');
  assert.equal(upgradedQuestion.type, 'systemsWorkspace');
  assert.equal(upgradedQuestion.mode, 'algebraic');

  const correctTracker = {
    0: {
      status: 'correct',
      attemptCount: 2,
      totalAttempts: 2,
      partialCredit: 100,
      bestPartialCredit: 100,
      partGrades: [],
    },
  };
  const correctResult = migrateTrackerForContentUpgrade({
    tracker: correctTracker,
    plan,
    correctedAt: '2026-09-23T15:00:00.000Z',
  });
  assert.strictEqual(correctResult.tracker, correctTracker);

  const exhaustedTracker = {
    0: {
      status: 'expired',
      attemptCount: 3,
      totalAttempts: 3,
      partialCredit: 40,
      bestPartialCredit: 60,
      partGrades: [{ id: 'legacy-solution', isComplete: true, isCorrect: false, response: '(1,2)' }],
    },
  };
  const exhaustedResult = migrateTrackerForContentUpgrade({
    tracker: exhaustedTracker,
    plan,
    correctedAt: '2026-09-23T15:00:00.000Z',
  });
  assert.equal(exhaustedResult.tracker[0].status, 'attempted');
  assert.equal(exhaustedResult.tracker[0].attemptCount, 2);
  assert.equal(exhaustedResult.tracker[0].totalAttempts, 3);
  assert.equal(exhaustedResult.tracker[0].bestPartialCredit, 60);
  assert.deepEqual(exhaustedResult.tracker[0].partGrades, exhaustedTracker[0].partGrades);
  assert.equal(exhaustedResult.tracker[0].contentVersionRegradeHistory.at(-1).kind, 'systems-workspace-upgrade');
  assert.equal(exhaustedResult.tracker[0].contentVersionRegradeHistory.at(-1).grantedRepairRetry, true);
});

test('a repair gives back an attempt, never an attempt number: the redone work is new evidence (GR20)', async () => {
  const { recordQuestionAttempt } = await import('../../functions/shared/attemptPolicy.mjs');
  const { buildAttemptEvidenceEvent } = await import('../../functions/shared/attemptEvidenceEvent.mjs');
  const eventKeyOf = (record) => buildAttemptEvidenceEvent({
    studentId: 'S1', assignment: { id: 'A1' }, question: { questionId: 'systems-q' }, questionIndex: 0,
    activityRole: 'practice', attemptRecord: record, attemptResult: { isCorrect: record.status === 'correct' },
  }).eventKey;
  // A record from before totalAttempts existed: three attempts, all spent;
  // the third wrote this evidence event.
  const legacy = { status: 'expired', attemptCount: 3, partialCredit: 0, bestPartialCredit: 0, partGrades: [] };
  const lastEventKey = eventKeyOf(legacy);
  const plans = {
    systemsWorkspaceUpgrade: { flatIndex: 0, classification: 'systemsWorkspaceUpgrade', questionId: 'systems-q' },
    safeResponseControl: { flatIndex: 0, classification: 'safeResponseControl', questionId: 'systems-q', affectedFieldIds: ['x'] },
    gradingExpansion: { flatIndex: 0, classification: 'gradingExpansion', questionId: 'systems-q',
      afterQuestion: { type: 'dataModelingLab', mode: 'lineFit', points: [[0, 0], [1, 1], [2, 2]] } },
  };
  const records = {
    systemsWorkspaceUpgrade: legacy,
    safeResponseControl: { ...legacy, partGrades: [{ id: 'x', isComplete: true, isCorrect: false }, { id: 'y', isComplete: true, isCorrect: false }] },
    gradingExpansion: { ...legacy, lastResponseKey: JSON.stringify({ m: 5, b: 5 }) },
  };
  for (const [kind, change] of Object.entries(plans)) {
    const repaired = migrateTrackerForContentUpgrade({
      tracker: { 0: records[kind] }, plan: { changes: [change] }, correctedAt: '2026-10-24T15:00:00.000Z',
    }).tracker[0];
    assert.equal(repaired.status, 'attempted', kind);
    assert.equal(repaired.attemptCount, 2, `${kind}: one attempt back`);
    assert.equal(repaired.totalAttempts, 3, `${kind}: the three attempts made still happened`);
    // The student's next attempt is their fourth, so its evidence is a new
    // document (the create trigger scores it), not an overwrite of the third.
    const { record: redone } = recordQuestionAttempt({ record: repaired, isCorrect: true });
    assert.equal(redone.totalAttempts, 4, kind);
    assert.notEqual(eventKeyOf(redone), lastEventKey, kind);
  }
  // A record that kept its own count is unchanged in that count.
  const modern = migrateTrackerForContentUpgrade({
    tracker: { 0: { ...legacy, totalAttempts: 5 } }, plan: { changes: [plans.systemsWorkspaceUpgrade] },
  }).tracker[0];
  assert.equal(modern.totalAttempts, 5);
});

/*
 * RECOVERY V2 THROUGH CONTENT V2: a release that turns a static Warm-Up or DOL
 * question into a Question Family slot does not replace the question students
 * answered. It is classified "recoveryCapability": the live question is kept
 * byte for byte, and the release's family becomes that question's Recovery
 * (stored beside it as recoveryContent, after the server certifies it).
 */
test('a release that makes a live static Warm-Up question a family slot keeps the question and only adds its Recovery', async () => {
  const policy = await import('../../functions/shared/assignmentContentUpgradePolicy.mjs');
  const { certifyRecoveryProposals } = await import('../../functions/shared/recoveryContentUpgrade.mjs');
  const { serverRecoveryKeyCheck } = await import('../../functions/shared/recoveryCertificationGrading.mjs');
  const staticQuestion = {
    questionId: 'wu-graph', type: 'graphing2', mode: 'slopeIntercept', activityRole: 'warmup',
    prompt: 'Graph g(x) = 3x − 8.', line: { m: 3, b: -8 }, graphBounds: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    dok: 1, difficultyBand: 1, standard: 'A.3C', alignments: [{ framework: 'teks', code: 'A.3C', role: 'primary' }],
  };
  const familySlot = { ...staticQuestion, questionFamily: { id: 'linear.graphFromSlopeIntercept', version: 1, constraints: { slope: 'integer' } } };
  const live = {
    ...liveAssignment,
    sections: [{ id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [staticQuestion] }, ...liveAssignment.sections],
  };
  const target = {
    ...targetAssignment,
    sections: [{ id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [familySlot] }, ...targetAssignment.sections],
  };

  // Without the opt-in the same change is fundamental: Recovery is never a
  // reason to accept any other change.
  assert.equal(policy.classifyContentQuestionChange(staticQuestion, familySlot).classification, 'fundamental');
  assert.equal(policy.classifyContentQuestionChange(staticQuestion, familySlot, { recoveryCapability: true }).classification, 'recoveryCapability');
  // A family that does not recognize the question cannot add Recovery to it.
  const wrongFamily = { ...staticQuestion, questionFamily: { id: 'linear.keyCharacteristics', version: 1 } };
  assert.equal(policy.classifyContentQuestionChange(staticQuestion, wrongFamily, { recoveryCapability: true }).classification, 'fundamental');

  const plan = await buildContentUpgradePlan({ liveAssignment: live, targetAssignment: target });
  assert.equal(plan.counts.recoveryCapability, 1);
  assert.deepEqual(Object.keys(plan.recoveryProposals), ['wu-graph']);
  assert.equal(plan.recoveryProposals['wu-graph'].questionFamily.id, 'linear.graphFromSlopeIntercept');
  const upgraded = buildUpgradedAssignment({ liveAssignment: live, targetAssignment: target, plan, fundamentalChoices: { q5: 'retire-only' } });
  const kept = upgraded.assignment.sections.flatMap((section) => section.questions).find((question) => question.questionId === 'wu-graph');
  assert.deepEqual(kept, staticQuestion, 'the question students answered is kept byte for byte');
  assert.deepEqual(Object.keys(upgraded.recoveryProposals), ['wu-graph']);

  // The server certifies the proposal before it stores a binding.
  const certified = certifyRecoveryProposals({ assignment: { ...upgraded.assignment, id: 'live-1' }, proposals: upgraded.recoveryProposals, gradeSample: serverRecoveryKeyCheck });
  assert.equal(certified.results[0].ok, true, JSON.stringify(certified.results[0].issues));
  assert.equal(certified.bindings['wu-graph'].questionFamily.id, 'linear.graphFromSlopeIntercept');
});

test('an upgrade that edits a question with Recovery certifies its Recovery again, so it never goes stale', async () => {
  const policy = await import('../../functions/shared/assignmentContentUpgradePolicy.mjs');
  const { certifyRecoveryProposals } = await import('../../functions/shared/recoveryContentUpgrade.mjs');
  const { serverRecoveryKeyCheck } = await import('../../functions/shared/recoveryCertificationGrading.mjs');
  const { applyRecoveryBindings, resolveRecoverySource, recoverySourceSignature, RECOVERY_SOURCE_KIND } = await import('../../functions/shared/recoveryContent.mjs');
  const staticQuestion = {
    questionId: 'wu-graph', type: 'graphing2', mode: 'slopeIntercept', activityRole: 'warmup',
    prompt: 'Graph g(x) = 3x − 8.', line: { m: 3, b: -8 }, graphBounds: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    dok: 1, difficultyBand: 1, standard: 'A.3C', alignments: [{ framework: 'teks', code: 'A.3C', role: 'primary' }],
  };
  const family = { id: 'linear.graphFromSlopeIntercept', version: 1, constraints: { slope: 'integer' } };
  const withWarmUp = (assignment, question) => ({
    ...assignment,
    sections: [{ id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [question] }, ...assignment.sections],
  });
  // The live assignment's Warm-Up question already has a certified binding.
  const bare = withWarmUp(liveAssignment, staticQuestion);
  const prepared = certifyRecoveryProposals({ assignment: bare, proposals: { 'wu-graph': { questionFamily: family } }, gradeSample: serverRecoveryKeyCheck });
  assert.equal(prepared.results[0].ok, true, JSON.stringify(prepared.results[0].issues));
  const live = { ...bare, recoveryContent: applyRecoveryBindings({ bindings: prepared.bindings, at: '2026-10-20T00:00:00.000Z', actorUid: 't1' }).content };

  // The release rewords the prompt: an in-place clarification, so the
  // binding's question changes.
  const reworded = { ...staticQuestion, prompt: 'Graph the line g(x) = 3x − 8.' };
  assert.equal(policy.classifyContentQuestionChange(staticQuestion, reworded, { recoveryCapability: true }).classification, 'clarificationOnly');
  const plan = await buildContentUpgradePlan({ liveAssignment: live, targetAssignment: withWarmUp(targetAssignment, reworded) });
  assert.deepEqual(Object.keys(plan.recoveryProposals), ['wu-graph'], 'the edited question\'s Recovery is proposed again');
  assert.deepEqual(plan.recoveryProposals['wu-graph'].questionFamily, live.recoveryContent.bindings['wu-graph'].questionFamily, 'in the family it already had');

  // Committed: certified against the reworded question, it replaces the old
  // binding, and Recovery for the question is current, not stale.
  const upgraded = buildUpgradedAssignment({ liveAssignment: live, targetAssignment: withWarmUp(targetAssignment, reworded), plan, fundamentalChoices: { q5: 'retire-only' } });
  const certified = certifyRecoveryProposals({ assignment: { ...upgraded.assignment, id: 'live-1' }, proposals: upgraded.recoveryProposals, gradeSample: serverRecoveryKeyCheck });
  assert.equal(certified.results[0].ok, true, JSON.stringify(certified.results[0].issues));
  const applied = applyRecoveryBindings({ content: live.recoveryContent, bindings: certified.bindings, at: '2026-10-24T00:00:00.000Z', actorUid: 't1' });
  assert.deepEqual(applied.replaced, ['wu-graph']);
  const kept = upgraded.assignment.sections.flatMap((section) => section.questions).find((question) => question.questionId === 'wu-graph');
  assert.equal(applied.content.bindings['wu-graph'].sourceSignature, recoverySourceSignature(kept));
  assert.equal(resolveRecoverySource({ question: kept, content: applied.content }).kind, RECOVERY_SOURCE_KIND.BINDING);
  // Before this, the old binding stayed and Recovery went stale.
  assert.equal(resolveRecoverySource({ question: kept, content: live.recoveryContent }).kind, RECOVERY_SOURCE_KIND.STALE);

  // A bound question the release leaves as it is proposes nothing: its plan
  // (and plan hash) is exactly what it was.
  const same = await buildContentUpgradePlan({ liveAssignment: live, targetAssignment: withWarmUp(targetAssignment, staticQuestion) });
  assert.deepEqual(same.recoveryProposals, {});
});

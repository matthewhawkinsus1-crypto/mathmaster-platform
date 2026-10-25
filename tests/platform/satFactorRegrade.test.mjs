/*
 * GR23 (H-102, decision D22): the two Digital SAT factor templates that, until
 * 08964f1c, could offer a true factor as a "wrong" option.
 *
 * Proven here:
 *   - the decision (scripts/lib/satFactorRegradePlan.mjs) over EVERY parameter
 *     combination of both templates as they were before the fix: an option is
 *     right exactly when it is a factor, the key always is, and the defective
 *     draws are exactly the ones the content handoff named (4 cubic, 8
 *     quartic); on today's production draws only the key is a factor;
 *   - a My Math Path recap entry, stored as the submit path stores it;
 *   - a classroom attempt on a bank-placed copy made before the fix, rebuilt
 *     from its delivery pin: the platform's replay still marks the true factor
 *     wrong, the factor judge marks it right, and the D8 upward step
 *     (scripts/lib/upwardRegrade.mjs) raises it for a GR23 row only, never
 *     past a teacher's decision;
 *   - the read-only report (scripts/report-sat-factor-regrade.mjs) against a
 *     database that refuses every write, and that it has no write mode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateExpression, generatePathInstanceWithRetries, substitutePlaceholders } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPathRecapEntry, parsePathRecapEntry, serializePathRecapEntry } from '../../functions/shared/pathSessionRecap.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  FACTOR_CLASS, FACTOR_REASON, SAT_FACTOR_TEMPLATES, classifyFactorAnswer, classifyPathRecapEntry,
  judgeClassroomFactorAttempt, linearFactorZero, polynomialOfPrompt, satFactorTemplateOfQuestion, servesDefectiveDraws,
} from '../../scripts/lib/satFactorRegradePlan.mjs';
import { SAT_FACTOR_REGRADE_NOTE, SKIP, candidatesFromReports, planUpwardRegrade, upwardRegradeWrites } from '../../scripts/lib/upwardRegrade.mjs';
import { REPORT_DIR, TOOL, parseReportArgs, reportFilePath, runSatFactorRegradeReport } from '../../scripts/report-sat-factor-regrade.mjs';
import { runUpwardRegrade } from '../../scripts/apply-upward-regrade.mjs';
import { storedAttempt } from './helpers/classroomRegradeFixtures.mjs';
import { readOnlyStore } from './helpers/readOnlyFirestore.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { bankDocumentToV5Intent } = require('../../functions/lib/ccmrAssignmentBank.js');
const mathPath = require('../../functions/lib/mathPath.js');

const CUBIC = 'mm_sat_A2_7D_factor_from_roots_cubic_v21';
const QUARTIC = 'mm_sat_A2_7D_challenge_quartic_factor_structure_v21';
const KEYED = { [CUBIC]: 'choice-b', [QUARTIC]: 'choice-c' };
const bank = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json'), 'utf8')).documents;
const current = (id) => bank.find((item) => item.id === id);
// The template as it was before 08964f1c: the same, without the constraint the fix added.
const preFix = (id) => {
  const template = current(id);
  const fix = SAT_FACTOR_TEMPLATES[id].fixConstraint;
  assert.ok(template.generator.constraints.includes(fix), `${id} carries the fix`);
  return { ...template, generator: { ...template.generator, constraints: template.generator.constraints.filter((constraint) => constraint !== fix) } };
};

// Every parameter combination a template's generator allows, with its derived values.
const everyDraw = (template) => {
  const { parameters, derived = {}, constraints = [] } = template.generator;
  let scopes = [{}];
  for (const [name, spec] of Object.entries(parameters)) {
    const values = [];
    for (let value = spec.min; value <= spec.max; value += 1) if (!(spec.exclude || []).includes(value)) values.push(value);
    scopes = scopes.flatMap((scope) => values.map((value) => ({ ...scope, [name]: value })));
  }
  return scopes.map((scope) => {
    const full = { ...scope };
    Object.entries(derived).forEach(([name, expression]) => { full[name] = evaluateExpression(expression, full); });
    return full;
  }).filter((scope) => constraints.every((constraint) => evaluateExpression(constraint, scope)));
};
// The zero of each option, from the parameters (not from any text).
const OPTION_ZEROS = {
  [CUBIC]: (s) => ({ 'choice-b': s.r1, 'choice-c': -s.r1, 'choice-d': s.r1 + 1, 'choice-a': -s.r2 }),
  [QUARTIC]: (s) => ({ 'choice-c': s.a, 'choice-d': s.a * s.a, 'choice-a': -(s.a + 1), 'choice-b': s.a + 1 }),
};
const isZero = {
  [CUBIC]: (s, k) => [s.r1, s.r2, s.r3].includes(k),
  [QUARTIC]: (s, k) => (k * k - s.a * s.a) * (k * k + s.b * k + s.c) === 0,
};

test('over every pre-fix draw of both templates, an option is right exactly when it is a factor; the defective draws are the named ones', () => {
  const defective = { [CUBIC]: [], [QUARTIC]: [] };
  for (const id of [CUBIC, QUARTIC]) {
    const template = preFix(id);
    const draws = everyDraw(template);
    assert.equal(draws.length, id === CUBIC ? 64 : 8 * 7 * 9);
    for (const scope of draws) {
      const shown = substitutePlaceholders({ prompt: template.prompt, choices: template.choices }, scope);
      const zeros = OPTION_ZEROS[id](scope);
      for (const choice of shown.choices) {
        const truth = isZero[id](scope, zeros[choice.id]);
        assert.equal(linearFactorZero(choice.label), zeros[choice.id], `${choice.label} reads as x − ${zeros[choice.id]}`);
        const decided = classifyFactorAnswer({ prompt: shown.prompt, chosen: choice.label, recordedCorrect: false }).classification;
        assert.equal(decided, truth ? FACTOR_CLASS.WOULD_BE_CORRECT : FACTOR_CLASS.STILL_WRONG, `${shown.prompt} ${choice.label}`);
        if (choice.id === KEYED[id]) assert.equal(truth, true, 'the key is always a factor');
        else if (truth) defective[id].push({ ...scope, choice: choice.id });
      }
    }
  }
  assert.deepEqual(defective[CUBIC].map(({ r1, r2, r3, choice }) => [r1, r2, r3, choice]), [9, 10, 11, 12].map((r3) => [4, 5, r3, 'choice-d']));
  assert.deepEqual(defective[QUARTIC].map(({ a, b, c, choice }) => [a, b, c, choice]), [
    [2, 4, 3, 'choice-a'], [2, 5, 6, 'choice-a'], [2, 6, 9, 'choice-a'], [3, 5, 4, 'choice-a'], [3, 6, 8, 'choice-a'], [4, 6, 5, 'choice-a'], [5, 7, 6, 'choice-a'], [6, 8, 7, 'choice-a'],
  ]);
  // The fix's constraint removes exactly those draws.
  assert.equal(everyDraw(current(CUBIC)).length, 64 - 4);
  assert.equal(everyDraw(current(QUARTIC)).length, 8 * 7 * 9 - 8);
});

test('on today\'s production draws only the keyed option is a factor', () => {
  for (const id of [CUBIC, QUARTIC]) {
    for (let draw = 0; draw < 40; draw += 1) {
      const question = generatePathInstanceWithRetries(current(id), `gr23-${draw}`, 4).question;
      const factors = question.choices.filter((choice) => classifyFactorAnswer({ prompt: question.prompt, chosen: choice.label, recordedCorrect: false }).classification === FACTOR_CLASS.WOULD_BE_CORRECT);
      assert.deepEqual(factors.map((choice) => choice.id), [KEYED[id]], question.prompt);
    }
  }
  assert.equal(polynomialOfPrompt('Which expression is a factor of x^2 - 9?'), null, 'another prompt is not read');
  assert.equal(classifyFactorAnswer({ prompt: 'A polynomial has zeros $4$, $5$, and $9$.', chosen: '$x-5$', recordedCorrect: true }).classification, FACTOR_CLASS.ALREADY_CORRECT);
  assert.deepEqual(classifyFactorAnswer({ prompt: 'A polynomial has zeros $4$, $5$, and $9$.', chosen: '', recordedCorrect: false }), { classification: FACTOR_CLASS.UNDETERMINABLE, reason: FACTOR_REASON.CHOICE_NOT_RECORDED, zero: null });
  assert.equal(classifyFactorAnswer({ prompt: 'A polynomial has zeros $4$, $5$, and $9$.', chosen: 'five', recordedCorrect: false }).reason, FACTOR_REASON.CHOICE_NOT_READ);
});

// One defective draw, as each surface stores it.
const DEFECTIVE_CUBIC = { r1: 4, r2: 5, r3: 10, r1p: 5, r2p: 6, r3p: 11 };
const shownCubic = (scope = DEFECTIVE_CUBIC) => substitutePlaceholders(current(CUBIC), scope);

const recapJsonFor = ({ question, choiceId, isCorrect, sessionId = 'sess-1', questionInstanceId = 'qi-1', attemptNumber = 2 }) => serializePathRecapEntry(buildPathRecapEntry({
  sessionId,
  questionInstanceId,
  publicQuestion: question,
  answerKeyQuestion: question,
  responsePayload: { responses: { answer: choiceId } },
  grading: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber, attemptsAllowed: 2 },
  templateId: question.id,
}));

test('a My Math Path recap: the option chosen, read off the entry the submit path stores', () => {
  const question = shownCubic();
  const read = (choiceId, isCorrect = false) => classifyPathRecapEntry(parsePathRecapEntry(recapJsonFor({ question, choiceId, isCorrect })));
  assert.deepEqual(read('choice-d'), { classification: FACTOR_CLASS.WOULD_BE_CORRECT, reason: null, zero: 5, chosen: '$x-5$' });
  assert.equal(read('choice-c').classification, FACTOR_CLASS.STILL_WRONG);
  assert.equal(read('choice-b', true).classification, FACTOR_CLASS.ALREADY_CORRECT);
  assert.equal(read('choice_unknown').classification, FACTOR_CLASS.UNDETERMINABLE, 'an id that matched no option was not recorded');
});

// --- classroom ------------------------------------------------------------------

const ASSIGNMENT_ID = 'gr23-assignment';
const placed = (template) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'GR23', courseId: 'algebra2', instructionalPurpose: 'review', gradingPurpose: 'practice' },
  sections: [{ role: 'practice', title: 'Practice', questions: [{ ...bankDocumentToV5Intent(template), questionFamily: { scope: 'assignment' } }] }],
}).package.sections[0].questions[0];
const STORED_PRE_FIX = placed(preFix(CUBIC));
const ASSIGNMENT = { schemaVersion: 5, title: 'GR23', sections: [{ id: 'p', role: 'practice', title: 'Practice', questions: [STORED_PRE_FIX] }] };
// The first seat whose instance is the defective draw (zeros 4 and 5).
const DEFECTIVE_SEAT = (() => {
  for (let seat = 0; seat < 200; seat += 1) {
    const dealt = resolveFamilyQuestionInstance({ question: STORED_PRE_FIX, assignmentId: ASSIGNMENT_ID, storageIndex: 0, allocation: { seat, variant: 0, basis: 'provisional' } });
    if (/zeros \$4\$, \$5\$/.test(dealt.question?.prompt || '')) return { seat, dealt };
  }
  throw new Error('no defective seat');
})();

/** A classroom attempt as ingestion stores it: the record (with its delivery pin) and its evidence. */
const classroomAttempt = (chosen, { submissionId = 'sub-1' } = {}) => {
  const instance = DEFECTIVE_SEAT.dealt.question;
  const response = { kind: 'fields', fields: [{ id: instance.answerFields[0].id, value: chosen }] };
  const grading = gradeServerResponse({ question: instance, response });
  const stored = storedAttempt({ assignmentId: ASSIGNMENT_ID, questionIndex: 0, question: instance, response, grading, submissionId, at: Date.parse('2026-10-10T15:00:00Z') });
  return { ...stored, record: { ...stored.record, variantIndex: 0, familyDelivery: DEFECTIVE_SEAT.dealt.delivery }, grading };
};

test('a bank copy placed before the fix still serves the defective draw, and the stored key marks the true factor wrong', () => {
  assert.equal(satFactorTemplateOfQuestion(STORED_PRE_FIX), CUBIC);
  assert.equal(servesDefectiveDraws(STORED_PRE_FIX), true);
  assert.equal(servesDefectiveDraws(placed(current(CUBIC))), false, 'a copy placed since the fix carries its constraint');
  assert.equal(servesDefectiveDraws(placed(preFix(QUARTIC))), true);
  assert.match(DEFECTIVE_SEAT.dealt.question.prompt, /zeros \$4\$, \$5\$/);
  assert.equal(classroomAttempt('$x-5$').grading.isCorrect, false, 'the platform grader still says wrong');
  assert.equal(classroomAttempt('$x-4$').grading.isCorrect, true);
});

const judge = (chosen) => {
  const { record, evidenceDocument } = classroomAttempt(chosen);
  return judgeClassroomFactorAttempt({ question: STORED_PRE_FIX, record, gradingEvidence: evidenceDocument.evidence, assignment: { id: ASSIGNMENT_ID, ...ASSIGNMENT }, questionIndex: 0, studentId: 's1', classId: 'c1' });
};

test('the classroom judge reads the instance its delivery pin rebuilds: a factor is right, anything else is not', () => {
  assert.deepEqual({ ...judge('$x-5$'), originalScore: undefined }, {
    available: true, adapter: 'sat-factor-theorem', questionSource: 'family-delivery-pin', originalScore: undefined,
    currentResult: { isCorrect: true, chosen: '$x-5$', zero: 5 }, currentScore: 100,
  });
  assert.equal(judge('$x+4$').currentResult.isCorrect, false);
  assert.equal(judge('$x+5$').currentResult.isCorrect, false);
  const { record } = classroomAttempt('$x-5$');
  assert.equal(judgeClassroomFactorAttempt({ question: STORED_PRE_FIX, record: { ...record, familyDelivery: null }, gradingEvidence: classroomAttempt('$x-5$').evidenceDocument.evidence, assignment: { id: ASSIGNMENT_ID, ...ASSIGNMENT }, questionIndex: 0 }).reason, 'served-instance-not-rebuilt');
  assert.equal(judgeClassroomFactorAttempt({ question: { prompt: 'x?' }, record }).reason, 'not-a-sat-factor-question');
});

const planFor = (chosen, { from = TOOL, override = null } = {}) => {
  const { record, evidenceDocument } = classroomAttempt(chosen);
  return planUpwardRegrade({
    studentId: 's1',
    assignmentId: ASSIGNMENT_ID,
    questionIndex: 0,
    from,
    assignment: ASSIGNMENT,
    gradeData: {
      classId: 'c1',
      gradesByAssignment: { [ASSIGNMENT_ID]: { 0: record } },
      ...(override ? { teacherGradeOverridesByAssignment: { [ASSIGNMENT_ID]: { 0: { ...override, totalAttempts: record.totalAttempts, variantIndex: 0, submissionId: record.lastSubmissionId } } } } : {}),
    },
    evidenceDocument,
  });
};

test('the upward step raises a GR23 row to 100 by the factor judge, and nothing the replay or a teacher decides otherwise', async () => {
  const raised = planFor('$x-5$');
  assert.equal(raised.outcome, 'raise');
  assert.equal(raised.newScore, 100);
  assert.equal(planFor('$x-5$', { from: 'report-classroom-regrade-candidates' }).outcome, SKIP.NOT_RIGHT_NOW, 'the replay alone still marks it wrong');
  assert.equal(planFor('$x+4$').outcome, SKIP.NOT_RIGHT_NOW);
  assert.equal(planFor('$x-4$').outcome, SKIP.ALREADY_RIGHT);
  assert.equal(planFor('$x-5$', { override: { active: true, score: 0 } }).outcome, SKIP.TEACHER_DECIDED);
  const writes = await upwardRegradeWrites({ plan: raised, assignment: ASSIGNMENT, gradeData: { classId: 'c1', gradesByAssignment: { [ASSIGNMENT_ID]: { 0: raised.record } } }, actor: { email: 'owner@example.com' }, nowIso: '2026-10-25T12:00:00.000Z' });
  assert.equal(writes.audit.decision, 'D22');
  assert.equal(writes.audit.note, SAT_FACTOR_REGRADE_NOTE, 'the note stays in the server-only audit');
  assert.deepEqual(writes.updates[0][0], ['teacherGradeOverridesByAssignment', ASSIGNMENT_ID, '0']);
  assert.equal(writes.updates[0][1].score, 100);
});

test('the upward step takes a GR23 report\'s classroom would-be-correct rows only', () => {
  const report = {
    tool: TOOL,
    path: { rows: [{ classification: 'would-be-correct', studentId: 'p1' }] },
    classroom: {
      attempts: [
        { classification: 'would-be-correct', studentId: 's1', assignmentId: 'A', questionIndex: 0 },
        { classification: 'still-wrong', studentId: 's2', assignmentId: 'A', questionIndex: 0 },
        { classification: 'undeterminable', studentId: 's3', assignmentId: 'A', questionIndex: 0 },
      ],
    },
  };
  assert.deepEqual(candidatesFromReports([report]), {
    candidates: [{ studentId: 's1', assignmentId: 'A', questionIndex: 0, from: TOOL }],
    ignored: { 'surface:path': 1, 'classification:still-wrong': 1, 'classification:undeterminable': 1 },
  });
});

// --- the read-only report -----------------------------------------------------------

const evidenceKeyOf = (sessionId, questionInstanceId, attemptNumber) => mathPath.opaqueId('ev', sessionId, questionInstanceId, attemptNumber);
const seeded = () => {
  const docs = new Map();
  const quartic = substitutePlaceholders(current(QUARTIC), { a: 3, b: 2, c: 1, a2: 9, ap: 4 });
  const submissions = [
    ['sub-defective', 's1', 'sess-1', 'qi-1', recapJsonFor({ question: shownCubic(), choiceId: 'choice-d', isCorrect: false, sessionId: 'sess-1', questionInstanceId: 'qi-1' }), CUBIC],
    ['sub-quartic-wrong', 's2', 'sess-2', 'qi-2', recapJsonFor({ question: quartic, choiceId: 'choice-a', isCorrect: false, sessionId: 'sess-2', questionInstanceId: 'qi-2' }), QUARTIC],
    ['sub-other-template', 's3', 'sess-3', 'qi-3', recapJsonFor({ question: shownCubic(), choiceId: 'choice-d', isCorrect: false, sessionId: 'sess-3', questionInstanceId: 'qi-3' }), 'mm_sat_some_other_template'],
    ['sub-right', 's4', 'sess-4', 'qi-4', recapJsonFor({ question: shownCubic(), choiceId: 'choice-b', isCorrect: true, sessionId: 'sess-4', questionInstanceId: 'qi-4' }), null],
    ['sub-before-recap', 's5', 'sess-5', 'qi-5', null, null],
  ];
  submissions.forEach(([id, studentId, sessionId, questionInstanceId, recapJson, template]) => {
    docs.set(`pathSubmissions/${id}`, { studentId, sessionId, submissionId: id, createdAt: Date.parse('2026-10-12T15:00:00Z'), result: { success: true }, ...(recapJson ? { recapJson } : {}) });
    if (template) {
      docs.set(`grades/${studentId}/evidenceEvents/${evidenceKeyOf(sessionId, questionInstanceId, 2)}`, { questionSnapshot: { questionId: template }, performance: { isCorrect: false, attemptNumber: 2 }, occurredAt: 1 });
    }
  });
  // A classroom attempt that chose the true factor, and one that chose another option.
  docs.set(`assignments/${ASSIGNMENT_ID}`, ASSIGNMENT);
  docs.set('assignments/gr23-since-fix', { schemaVersion: 5, title: 'Placed since the fix', sections: [{ id: 'p', role: 'practice', questions: [placed(current(QUARTIC))] }] });
  [['c-right', '$x-5$'], ['c-wrong', '$x+4$']].forEach(([studentId, chosen]) => {
    const { record, evidenceDocumentId, evidenceDocument } = classroomAttempt(chosen, { submissionId: `${studentId}-sub` });
    docs.set(`grades/${studentId}`, { classId: 'c1', displayName: 'never read', gradesByAssignment: { [ASSIGNMENT_ID]: { 0: record } } });
    docs.set(`grades/${studentId}/responseInspectionEvidence/${evidenceDocumentId}`, evidenceDocument);
  });
  docs.set('users/c-right', { displayName: 'never read' });
  return readOnlyStore(docs);
};

test('the report: Path recaps and classroom attempts, by the factor theorem; reads only what it says; never a write', async () => {
  const { db, attempts, reads, masks } = seeded();
  const report = await runSatFactorRegradeReport({ db, pageSize: 2, now: () => Date.UTC(2026, 9, 25, 12) });
  assert.deepEqual(attempts, []);
  assert.deepEqual([...new Set(reads)].sort(), ['assignments', 'getAll', 'grades', 'pathSubmissions']);
  assert.ok(masks.some(([label, fields]) => label === 'pathSubmissions' && fields.join() === 'studentId,sessionId,createdAt,recapJson'), 'submissions are projected');
  assert.ok(masks.every(([label, fields]) => label !== 'grades' || !fields.includes('displayName')), 'no name is read');
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.counts.path, {
    submissionsRead: 5,
    recapsOfTheseShapes: 4,
    byClass: { 'would-be-correct': 1, 'still-wrong': 1, 'already-correct': 1, undeterminable: 0 },
    otherTemplate: 1,
    evidenceNotFound: 0,
  });
  assert.deepEqual(report.path.rows.map((row) => [row.studentId, row.classification, row.template, row.chosen]), [
    ['s1', 'would-be-correct', CUBIC, '$x-5$'],
    ['s2', 'still-wrong', QUARTIC, '$x+4$'],
  ]);
  assert.deepEqual(report.path.rows[0].polynomial, { shape: 'cubic', zeros: [4, 5, 10] });
  assert.equal(report.path.rows[0].evidenceKey, evidenceKeyOf('sess-1', 'qi-1', 2));
  assert.deepEqual(report.classroom.questions, [
    { assignmentId: ASSIGNMENT_ID, questionIndex: 0, template: CUBIC, servesDefectiveDraws: true },
    { assignmentId: 'gr23-since-fix', questionIndex: 0, template: QUARTIC, servesDefectiveDraws: false },
  ]);
  assert.deepEqual(report.classroom.attempts.map((row) => [row.studentId, row.classification, row.chosen, row.teacherDecided]), [
    ['c-right', 'would-be-correct', '$x-5$', false],
    ['c-wrong', 'still-wrong', '$x+4$', false],
  ]);
  assert.equal(report.counts.classroom.questionsServingDefectiveDraws, 1);
  // What the upward step would take from it.
  assert.deepEqual(candidatesFromReports([report]).candidates, [{ studentId: 'c-right', assignmentId: ASSIGNMENT_ID, questionIndex: 0, from: TOOL }]);
  // And the operator's dry run plans it as a raise, on the same records, writing nothing.
  const dryRun = await runUpwardRegrade({ db, FieldPath: class {}, candidates: candidatesFromReports([report]).candidates, mode: 'dry-run', now: () => '2026-10-25T12:00:00.000Z' });
  assert.deepEqual(dryRun.attempts.map((row) => [row.studentId, row.outcome, row.newScore]), [['c-right', 'raise', 100]]);
  assert.deepEqual(attempts, []);
  // A window leaves the submissions outside it unread for recaps.
  const windowed = await runSatFactorRegradeReport({ db, since: Date.parse('2026-10-13T00:00:00Z') });
  assert.equal(windowed.counts.path.recapsOfTheseShapes, 0);
});

test('the script has no write mode, no Firestore write call, and writes only under release-reports/ (gitignored)', () => {
  const source = executableSource(readFileSync(path.join(repo, 'scripts/report-sat-factor-regrade.mjs'), 'utf8'))
    // Not Firestore: app.delete() closes the Admin SDK's channels.
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply|--out\b/);
  assert.equal((source.match(/writeFileSync\(/g) || []).length, 1, 'one local file write');
  assert.match(source, /writeFileSync\(reportPath, /);
  assert.equal(path.relative(path.join(repo, REPORT_DIR), reportFilePath('2026-10-25T12:00:00.000Z')), 'report-sat-factor-regrade-2026-10-25T12-00-00-000Z.json');
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--since', '2026-10-01']), /--project is required/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--since', '2026-10-15', '--until', '2026-10-01']), /--since must be before --until/);
  assert.deepEqual(parseReportArgs(['--project', 'p', '--until', '2026-10-16']), { help: false, project: 'p', since: null, until: Date.parse('2026-10-16T00:00:00Z'), pageSize: 200 });
});

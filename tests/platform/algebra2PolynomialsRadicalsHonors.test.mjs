/*
 * ALGEBRA II · POLYNOMIALS AND RADICALS — THE HONORS VERSIONS, READY FOR AN
 * HONORS CLASS AS WRITTEN.
 *
 *   Factoring Polynomials — Honors         Polynomials, Lesson 1   A2.7E (A2.7D)
 *   Remainder & Factor Theorems — Honors   Polynomials, Lesson 2   A2.7D (A2.7C, A2.7E)
 *   Radical Expressions — Honors           Radicals, Lesson 2      A2.7G
 *   Rational Exponents — Honors            Radicals, Lesson 3      A2.7G
 *   Solving Radical Equations — Honors     Radicals, Lesson 4      A2.7H (A2.4F, A2.4G, A2.6B)
 *
 * Each is its own teacher-import file, the Honors counterpart of the regular
 * lesson (algebra2PolynomialsRadicalsLessons.test.mjs): the same four
 * sections with a Recovery-ready Warm-Up and DOL, far more DOK 3–4 work, and
 * two audited SAT items in Practice taken from MathMaster's CCMR bank. Honors
 * placement still comes from the destination class — Pre-Flight builds the
 * Honors version of whatever is imported (canonicalCcmrHydration.js) — and
 * for these files it has nothing to add: the audited Practice is already
 * there, so an Honors class gets each file exactly as written.
 *
 * As in the regular test, keys are re-derived with plain arithmetic
 * (./helpers/plainMathReader.mjs), never with a grader's own reader, and every
 * template is checked at each of the first 32 versions a class meets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { creationRecoveryContent } from '../../src/platform/recovery/recoveryContentAuthoring.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { PLATFORM_OWNED_FIELDS } from '../../src/platform/contract/platformOwnedFields.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { planAssignmentRecoveryContent } from '../../functions/shared/recoveryContentPlan.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { getEffectiveActivityPolicy } from '../../functions/shared/activityPolicies.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { buildTemplateFamily } from '../../functions/shared/questionFamilyTemplate.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { allocationIndexFor } from '../../functions/shared/questionGenerationIdentity.mjs';
// Also registers the factoredForm and simplestRadicalForm comparators, as the server does.
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { serverResponseGradingSupport } from '../../functions/shared/serverGrading/gradingSupport.mjs';
import { polynomialLongDivide } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { radicalSolveKey, validRadicalCandidates } from '../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import { close, evaluator, read, sameValue, segmentsOf, sidesOf } from './helpers/plainMathReader.mjs';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const HONORS_DIR = path.resolve(here, '../../teacher-import-jsons/algebra2-polynomials-radicals-honors');
const REGULAR_DIR = path.resolve(here, '../../teacher-import-jsons/algebra2-polynomials-radicals');
const clone = (value) => JSON.parse(JSON.stringify(value));

const LESSONS = [
  { title: 'Factoring Polynomials', file: '1_Factoring_Polynomials', unit: 'Polynomials', number: 1, teks: ['A2.7E', 'A2.7D'] },
  { title: 'Remainder & Factor Theorems', file: '2_Remainder_and_Factor_Theorems', unit: 'Polynomials', number: 2, teks: ['A2.7D', 'A2.7C'] },
  { title: 'Radical Expressions', file: '3_Radical_Expressions', unit: 'Radicals', number: 2, teks: ['A2.7G'] },
  { title: 'Rational Exponents', file: '4_Rational_Exponents', unit: 'Radicals', number: 3, teks: ['A2.7G'] },
  { title: 'Solving Radical Equations', file: '5_Solving_Radical_Equations', unit: 'Radicals', number: 4, teks: ['A2.4G', 'A2.6B'] },
].map((lesson) => {
  const text = fs.readFileSync(path.join(HONORS_DIR, `${lesson.file}_Honors.json`), 'utf8');
  const regular = compileTeacherImport(fs.readFileSync(path.join(REGULAR_DIR, `${lesson.file}.json`), 'utf8'));
  return { ...lesson, text, raw: JSON.parse(text), regular, ...compileTeacherImport(text) };
});

const bankDocuments = new Map();
for (const framework of ['digitalSAT', 'act', 'tsia2']) {
  const seed = JSON.parse(fs.readFileSync(path.resolve(here, `../../functions/seeds/pathQuestionBank/${framework}_pathQuestionBank_seed.json`), 'utf8'));
  for (const document of seed.items || seed.documents || []) bankDocuments.set(document.id, document);
}

const isTemplate = (question) => Boolean(question.generator && question.questionFamily);
const versionsOf = (question, count = 32) => {
  if (!isTemplate(question)) return [question];
  const family = buildTemplateFamily(question, { slotKey: question.questionId });
  const sequence = cachedFamilyInstanceSequence(family, {}, `honors|${question.questionId}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    versions.push(buildFamilyQuestion({ family, instance, constraintValues: {}, authored: question, tool: family.defaultTool }));
  }
  return versions;
};
const MET = LESSONS.flatMap((lesson) => lesson.questions.flatMap((question) => versionsOf(question)));
const met = (id) => MET.filter((question) => question.questionId === id);
const metAll = (predicate) => MET.filter(predicate);
const keyOf = (question) => JSON.stringify({ id: question.questionId, prompt: question.prompt, fields: (question.answerFields || []).map((field) => [field.id, field.label, field.answer]) });

/** The lesson as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
const reviewed = (lesson) => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(lesson.text).assignmentV5, {}));
/** What Pre-Flight builds for an Honors destination: the server's plan, through JSON as it travels. */
const honorsCandidate = (lesson) => {
  const base = reviewed(lesson).assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return { base, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null }) };
};
const auditedOf = (raw) => raw.sections.flatMap((section) => section.questions.map((question) => ({ section, question })))
  .filter(({ question }) => question.ccmrSource);
const teksOf = (question) => (question.alignments || []).filter((alignment) => alignment.framework === 'teks').map((alignment) => alignment.code);
// Every key, at any depth of the file.
const keysOf = (value, keys = new Set()) => {
  if (Array.isArray(value)) value.forEach((entry) => keysOf(entry, keys));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => { keys.add(key); keysOf(entry, keys); });
  return keys;
};

/* ------------------------------------------- one assignment per lesson */

for (const lesson of LESSONS) {
  const name = `${lesson.title} — Honors`;

  test(`${name}: passes the teacher import's Pre-Flight with no errors and no warnings`, () => {
    assert.deepEqual(lesson.model.errors, []);
    assert.deepEqual(lesson.model.warnings || [], []);
    assert.equal(lesson.model.isValid, true);
    assert.deepEqual(lesson.semantic.errors, []);
    assert.deepEqual(lesson.semantic.warnings, []);
    assert.deepEqual(lesson.model.hiddenHints.warnings, []);
    // Every worked solution has steps and names the usual mistake ("Watch out:").
    assert.deepEqual(lesson.model.solutionReviews.warnings, []);
  });

  test(`${name}: its Warm-Up and DOL are templates, so Recovery can issue fresh versions of both`, () => {
    const notes = lesson.model.questionGeneration?.notes || [];
    assert.ok(notes.some((note) => note.startsWith('Warm-Up Recovery ready')), JSON.stringify(notes));
    assert.ok(notes.some((note) => note.startsWith('DOL Recovery ready')), JSON.stringify(notes));
    for (const section of lesson.raw.sections.filter((candidate) => ['warmup', 'dol'].includes(candidate.role))) {
      for (const question of section.questions) {
        assert.ok(question.generator, `${question.questionId} is a template`);
        assert.equal(question.questionFamily?.scope, 'assignment', `${question.questionId} is assignment-local`);
      }
    }
    for (const question of lesson.questions.filter((candidate) => candidate.sectionId === 'dol')) {
      const prompts = new Set(versionsOf(question).map((version) => version.prompt));
      assert.equal(prompts.size, 32, `${question.questionId}: a different DOL for each of 32 students`);
    }
  });

  test(`${name}: one assignment in the four sections, simply named, paced, Practice the largest; no Honors flag is authored`, () => {
    const { assignment, sections } = lesson.raw;
    assert.equal(assignment.title, name);
    assert.equal(lesson.regular.model.assignmentV5.assignment.title, lesson.title, 'the regular lesson of the same name');
    assert.match(assignment.teacherNotes, new RegExp(`^Honors version of Bluebonnet Algebra II — ${lesson.unit}, Lesson ${lesson.number} \\(`));
    assert.match(assignment.folder, /^Algebra II Honors\//);
    // Honors placement comes from the destination class (authoringContract.js).
    const keys = keysOf(lesson.raw);
    ['honors', 'isHonors', 'courseLevel', 'rigorVariant'].forEach((key) => assert.equal(keys.has(key), false, `authors ${key}`));
    assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
    const minutes = sections.map((section) => section.recommendedMinutes);
    assert.ok(minutes[0] <= 10 && minutes[3] <= 10, `${minutes}`);
    const total = minutes.reduce((sum, value) => sum + value, 0);
    assert.ok(total >= 100 && total <= 120, `${total} minutes`);
    const counts = sections.map((section) => section.questions.length);
    assert.ok(counts[2] >= 13 && counts[2] >= counts[1], `Practice gives the most work: ${counts}`);
    assert.equal(lesson.questions.length, counts.reduce((sum, value) => sum + value, 0), 'every question survives the import');
    for (const question of sections.slice(0, 3).flatMap((section) => section.questions)) {
      assert.ok((question.hints || question.supportHints)?.length >= 1, `${question.questionId} offers a hint`);
    }
    // After a miss, each typed item before the DOL — the audited ones too —
    // backs up to a simpler question of its own; neither choice is an answer.
    let rightFirst = 0;
    let steps = 0;
    for (const question of sections.slice(0, 3).flatMap((section) => section.questions).filter((candidate) => candidate.responses || candidate.answerFields)) {
      const { scaffold } = question;
      assert.ok(scaffold?.prompt?.startsWith('Let’s back up. '), `${question.questionId}: a back-up step`);
      assert.equal(scaffold.options.length, 2, question.questionId);
      assert.ok(scaffold.options.includes(scaffold.correct), question.questionId);
      const answers = (question.responses || question.answerFields).map((field) => String(field.answer).trim().toLowerCase());
      scaffold.options.forEach((option) => assert.ok(!answers.includes(option.trim().toLowerCase()), `${question.questionId}: "${option}" is an answer`));
      steps += 1;
      if (scaffold.options[0] === scaffold.correct) rightFirst += 1;
    }
    assert.ok(steps >= 10 && rightFirst > 0 && rightFirst < steps, `the right choice is first on ${rightFirst} of ${steps}`);
    for (const question of sections[3].questions) {
      assert.equal(question.hints, undefined, `${question.questionId}: no hints on the DOL`);
      assert.equal(question.guidedNotes, undefined, `${question.questionId}: no guided notes on the DOL`);
      assert.equal(question.scaffold, undefined, `${question.questionId}: no scaffold on the DOL`);
    }
    const policyFields = PLATFORM_OWNED_FIELDS.filter((field) => /attempt|hint|feedback|replacement|mastery/i.test(field));
    for (const owner of [...sections, ...sections.flatMap((section) => section.questions)]) {
      for (const field of policyFields) assert.equal(Object.hasOwn(owner, field), false, `${owner.questionId || owner.id} authors ${field}`);
    }
    const dol = getEffectiveActivityPolicy('dol');
    assert.deepEqual([dol.attempts, dol.hintsAllowed, dol.feedback], [1, false, 'afterAssignmentSubmit']);
  });

  test(`${name}: deeper than the regular lesson — far more DOK 3–4 work, every kind of Honors depth, a table or graph to reason from`, () => {
    const deep = (compiled) => compiled.questions.filter((question) => ['classwork', 'practice'].includes(question.sectionId) && Number(question.dok) >= 3).length;
    const honors = deep(lesson);
    const regular = deep(lesson.regular);
    assert.ok(honors >= 10 && honors >= 2 * regular + 4, `${honors} DOK 3–4 items against the regular lesson's ${regular}`);
    const report = inspectHonorsRigor(lesson.model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired: true });
    assert.deepEqual(report.missing, []);
    assert.equal(report.depthCount, 4, JSON.stringify(report.checks));
    assert.equal(report.fullContractReady, true);
    const shown = lesson.raw.sections.slice(1, 3).flatMap((section) => section.questions).filter((question) => question.table || question.graph);
    assert.ok(shown.length >= 1, 'a table or a graph to reason from');
  });

  test(`${name}: every typed and chosen key is accepted by the shared grader, and a wrong answer is not`, () => {
    const questions = MET.filter((question) => question.type === 'multiAnswer' && lesson.questions.some((own) => own.questionId === question.questionId));
    const templateIds = new Set(lesson.questions.filter(isTemplate).map((question) => question.questionId));
    assert.ok(questions.length > 0);
    for (const question of questions) {
      const fields = question.answerFields;
      const right = Object.fromEntries(fields.map((field) => [field.id, String(field.answer)]));
      const graded = gradeMultiAnswerResponse(question, right);
      assert.equal(graded.isCorrect, true, `${question.questionId}: its own key (${JSON.stringify(graded.parts.filter((part) => !part.isCorrect))})`);
      for (const field of fields) {
        const wrong = field.type === 'choice' ? field.options.find((option) => option !== field.answer) : '999';
        assert.equal(gradeMultiAnswerResponse(question, { ...right, [field.id]: wrong }).isCorrect, false, `${question.questionId}.${field.id}: "${wrong}" is wrong`);
      }
      for (const field of fields.filter((candidate) => candidate.type === 'choice')) {
        assert.ok(field.options.length >= 3, `${question.questionId}.${field.id}: a real distractor, not a coin flip`);
      }
      // No version of a template asks for the same answer twice (a root to
      // the power 1 made "the root" and "the value" one number).
      if (templateIds.has(question.questionId)) {
        const answers = fields.map((field) => String(field.answer).replace(/\s/g, ''));
        assert.equal(new Set(answers).size, answers.length, `${question.questionId}: two boxes take ${answers.join(', ')}`);
      }
    }
  });

  test(`${name}: every tool question has a worked solution the shared grader accepts`, () => {
    for (const question of lesson.questions.filter((candidate) => !['multiAnswer', 'openSortBoard'].includes(candidate.type))) {
      for (const version of versionsOf(question)) {
        assert.ok(buildToolSolutionReviewModel({ ...version, toolId: version.type })?.steps?.length, `${version.questionId}: ${version.prompt}`);
      }
    }
  });

  test(`${name}: an Honors class gets the file exactly as written — READY, the full Honors contract, nothing sourced or skipped`, () => {
    const { base, candidate } = honorsCandidate(lesson);
    assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
    assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
    assert.deepEqual(candidate.model.warnings || [], []);
    assert.equal(candidate.honorsReport.isHonorsReady, true, candidate.honorsReport.missing.join(', '));
    assert.equal(candidate.honorsReport.fullContractReady, true);
    assert.equal(candidate.honorsReport.checks.ccmrEnrichment, true);
    assert.equal(candidate.honorsReport.depthCount, 4);
    assert.equal(candidate.targetCount, 2, 'about 15% of Practice');
    assert.equal(candidate.sourcedCount, 2, 'met by the file\'s own audited items');
    assert.deepEqual(candidate.sourced, [], 'Pre-Flight replaces nothing');
    assert.deepEqual(candidate.skipped, []);
    assert.deepEqual(candidate.keptAuthoredClaims, []);
    const questionsOf = (assignment) => assignment.sections.flatMap((section) => section.questions.map(keyOf));
    assert.deepEqual(questionsOf(candidate.assignmentV5), questionsOf(base), 'the Honors version is the file, question for question');
  });

  test(`${name}: its two audited SAT items are the bank's own, in Practice, on a TEKS the lesson teaches — with its own back-up step and a plain-text worked solution`, () => {
    const audited = auditedOf(lesson.raw);
    assert.equal(audited.length, 2);
    assert.equal(new Set(audited.map(({ question }) => question.ccmrSource.documentId)).size, 2, 'two different items');
    const lessonTeks = new Set(lesson.raw.sections.flatMap((section) => section.questions).filter((question) => !question.ccmrSource).flatMap(teksOf));
    for (const { section, question } of audited) {
      assert.equal(section.role, 'practice');
      const document = bankDocuments.get(question.ccmrSource.documentId);
      assert.ok(document, `${question.ccmrSource.documentId} is in the bank`);
      assert.notEqual(document.active, false, 'an active document');
      const intent = bank.bankDocumentToV5Intent(document, { activityRole: 'practice' });
      // What the bank audited is unchanged… A choice field also carries the
      // lesson's reason for each option (FB05), a support like the back-up
      // step; the rest of the field is the bank's.
      const bankPart = (key, value) => (key === 'answerFields' ? value.map(({ optionRationales: _reasons, ...field }) => field) : value);
      ['prompt', 'generator', 'answerFields', 'alignments', 'assessmentContext', 'assessmentItemFormat', 'ccmrSource', 'ccmrAuthenticLanguage',
        'familyId', 'familyVersion', 'standard', 'studentActions', 'dok', 'difficultyBand', 'calculatorPolicy', 'taskType', 'representation',
        'ccmrChallengeTier', 'ccmrFamilyRole', 'supportHints', 'attemptFeedback'].forEach((key) => {
        assert.deepEqual(bankPart(key, question[key]), intent[key], `${question.questionId}.${key} is the bank's`);
      });
      assert.equal(question.ccmrSource.source, 'auditedBank');
      assert.equal(question.ccmrSource.releaseTarget, 'ccmr-fidelity-v2.1-authentic-language');
      assert.ok(teksOf(question).some((code) => lessonTeks.has(code)), `${question.questionId}: ${teksOf(question)} is taught in the lesson`);
      assert.ok(lesson.teks.some((code) => teksOf(question).includes(code)), `${question.questionId}: ${teksOf(question)}`);
      // …and the lesson adds only its own id, a back-up step, a worked
      // solution in plain math text, and the server's grading.
      const added = Object.keys(question).filter((key) => !Object.hasOwn(intent, key)).sort();
      assert.deepEqual(added, ['questionFamily', 'scaffold'], `${question.questionId} adds ${added}`);
      assert.equal(question.questionFamily.scope, 'assignment');
      assert.match(question.questionId, /^[a-z]{3}-p-\d+$/);
      const review = JSON.stringify(question.solutionReview);
      assert.ok(question.solutionReview.reasoning.length >= 2 && !/[$\\]/.test(review), `${question.questionId}: ${review}`);
      // The answer's choices never carry LaTeX (Read aloud says them as written).
      question.answerFields.forEach((field) => (field.options || []).forEach((option) => assert.ok(!/[$\\]/.test(option), option)));
    }
  });

  test(`${name}: Pre-Flight says the Honors version can be created, Create accepts exactly what it previewed, and Recovery is ready for it`, () => {
    const { base, candidate } = honorsCandidate(lesson);
    const readiness = summarizePreflightReadiness({
      blockers: collectReviewBlockers({
        draft: { title: 'Lesson', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
        honorsSelected: true,
        honorsReport: candidate.honorsReport,
        honorsCcmr: { status: candidate.status, errors: candidate.errors },
      }),
      validationErrors: [],
      bundleIsValid: true,
    });
    assert.equal(readiness.canCreate, true);
    const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: base, honorsEnrichmentQuestion: null });
    assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
    const payload = {
      ...clone(candidate.assignmentV5),
      id: `${lesson.file}-honors`,
      title: candidate.assignmentV5.assignment.title,
      courseProfile: { course: 'algebra2', courseLevel: 'honors' },
      rigorVariant: 'honors',
      assignedClassIds: ['class-honors'],
    };
    // The Warm-Up and DOL are templates, so Recovery issues fresh versions of
    // the lesson's own questions: creation has no static question to pair with
    // a certified family, and stores nothing.
    assert.equal(creationRecoveryContent(payload, { at: '2026-10-23T12:00:00Z', actorUid: 'teacher-uid' }), null);
    const plan = planAssignmentRecoveryContent({ assignment: payload, gradeSample: serverRecoveryKeyCheck });
    assert.equal(plan.fullyReady, true, 'both sections ready on the server\'s full key check');
    for (const role of ['warmup', 'dol']) {
      const section = plan.sections[role];
      assert.equal(section.status, 'ready', role);
      const ids = lesson.raw.sections.find((candidate) => candidate.role === role).questions.map((question) => question.questionId);
      assert.deepEqual(section.rows.map((row) => row.questionId), ids, role);
      for (const row of section.rows) {
        assert.equal(row.status, 'family', `${row.questionId}: its own family`);
        assert.equal(row.familyId, `local:${payload.id}_${row.questionId}`, row.questionId);
        assert.deepEqual(row.issues, [], row.questionId);
      }
    }
  });
}

/* --------------------------------------------- the server marks them */

test('every Question Family slot — the audited items too — is rebuilt by the server from the student\'s own version and graded there', () => {
  let graded = 0;
  let tools = 0;
  let audited = 0;
  for (const lesson of LESSONS) {
    const { assignmentV5 } = parseAssignmentBlueprintText(lesson.text);
    const assignment = { ...assignmentV5, id: `honors-${lesson.file}` };
    const questions = assignmentV5.sections.flatMap((section) => section.questions.map((question) => ({ question, role: section.role })));
    questions.forEach(({ question, role }, index) => {
      // Nothing is generated on the student's device: every generated question is a family slot.
      if (question.generator) assert.ok(isTemplate(question), `${question.questionId} is generated but is not a Question Family slot`);
      if (!isTemplate(question)) return;
      for (const seat of [0, 7, 19]) {
        const shared = ['warmup', 'classwork'].includes(role);
        const allocation = shared
          ? { seat: 0, variant: 0, stride: 1, index: allocationIndexFor({ seat: 0, variant: 0, stride: 1 }), basis: 'shared' }
          : { seat, variant: 0, stride: 32, index: allocationIndexFor({ seat, variant: 0, stride: 32 }), basis: 'provisional' };
        const delivered = resolveFamilyQuestionInstance({ question, assignmentId: assignment.id, storageIndex: index, allocation });
        assert.ok(delivered.question && !delivered.error, `${question.questionId}: delivered`);
        const resolved = resolveServerGradingQuestion({ assignment, question, questionIndex: index, variantIndex: 0, claimedDelivery: delivered.delivery, studentId: `student-${seat}` });
        assert.equal(resolved.familyBacked, true, question.questionId);
        assert.ok(resolved.question, `${question.questionId}: ${resolved.reason}`);
        assert.equal(resolved.question.prompt, delivered.question.prompt, `${question.questionId}: the version the student saw`);
        assert.equal(serverResponseGradingSupport(resolved.question).supported, true, `${question.questionId}: server-graded`);
        if (resolved.question.type !== 'multiAnswer') {
          tools += 1;
          continue;
        }
        const right = resolved.question.answerFields.map((field) => ({ id: field.id, value: String(field.answer) }));
        const wrong = right.map((entry, position) => (position === right.length - 1 ? { ...entry, value: entry.value === '999' ? '998' : '999' } : entry));
        const rightVerdict = gradeServerResponse({ question: resolved.question, response: { kind: 'fields', fields: right } });
        const wrongVerdict = gradeServerResponse({ question: resolved.question, response: { kind: 'fields', fields: wrong } });
        assert.deepEqual([rightVerdict.graded, rightVerdict.isCorrect], [true, true], `${question.questionId} at seat ${seat}: the key`);
        assert.deepEqual([wrongVerdict.graded, wrongVerdict.isCorrect], [true, false], `${question.questionId} at seat ${seat}: a changed answer`);
        graded += 1;
        if (question.ccmrSource) audited += 1;
      }
    });
  }
  assert.ok(graded >= 150 && tools >= 20, `${graded} answer-field versions and ${tools} tool versions`);
  assert.equal(audited, LESSONS.length * 2 * 3, 'both audited items in every lesson, at every seat');
});

/* --------------------------------- what the platform writes, in Spanish */

test('every hint and back-up step the platform writes for these lessons reads in Spanish', async () => {
  // The lessons' own text is translated when a student asks; the platform's
  // hints and back-up steps (here, long division's) come from the Spanish pack.
  const pack = await loadLanguagePack('es');
  let checked = 0;
  for (const lesson of LESSONS) {
    for (const question of compileAuthoringIntentV5(lesson.raw).package.sections.flatMap((section) => section.questions)) {
      const step = backUpStepFor(question);
      const texts = [
        ...buildQuestionHints(question).filter((hint) => hint.source !== 'authored').map((hint) => hint.text),
        ...(step.source === 'authored' ? [] : [[step.prompt, ...step.options.map((option) => `${option}.`)].join('\n')]),
      ];
      for (const text of texts) {
        assert.equal(translateWithPack(text, pack).coverage, TRANSLATION_COVERAGE.FULL, `${question.questionId}: ${text}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 45, `${checked} platform texts`);
});

/* ------------------------------------------- the keys, re-derived */

const FORM_GRADED = ['factoredForm', 'simplestRadicalForm'];
// The expressions a field's label states: "With u = x²: u² − 13u + 36 =" → "u² − 13u + 36".
const labelSides = (label) => String(label).split(':').flatMap((part) => part.split('=')).map((side) => side.trim()).filter(Boolean);
// Where neither the prompt nor the label writes the expression a key equals,
// it is written here, by hand from the prompt (from the version, for a template).
const answerOf = (question, id) => String(question.answerFields.find((field) => field.id === id).answer);
const STATED = {
  // x² + bx + c with the version's own b.
  'fph-wu-3': { factored: (question) => sidesOf(question.prompt).find((side) => /bx/.test(side)).replace(/b(?=x)/, `(${answerOf(question, 'b')})`) },
  'rfh-cw-9': { factored: 'x^3+2x^2+3x-6' },
  'rfh-p-6': { factored: '2x^3-x^2-7x+6' },
  'rxh-cw-4': { numerator: '(√5+√3)^2' },
  'rxh-cw-10': { sq: '((1+√5)/2)^2', recip: '2/(1+√5)' },
  'rxh-p-13': { area: 'sqrt(9*4*3*2)' },
  'reh-p-7': { num: '(x^(1/2)*y^(-2/3))^6' },
  'reh-p-11': { trinomial: '(x-27)/(x^(1/3)-3)' },
};
// Keys checked another way below: from a table, as a zero, or from the zeros a prompt names.
const CHECKED_ELSEWHERE = {
  'rfh-cw-3': ['factored'], 'rfh-p-7': ['factored'], 'rfh-cw-11': ['factored'],
  'rxh-cw-6': ['other'], 'rxh-p-9': ['other'], 'rfh-cw-10': ['big', 'small'], 'rfh-p-9': ['big', 'small'],
};

test('every form-graded key is, in value, an expression its prompt or its label states', () => {
  let matched = 0;
  for (const question of metAll((candidate) => candidate.type === 'multiAnswer')) {
    for (const field of question.answerFields.filter((candidate) => FORM_GRADED.includes(candidate.gradingMode))) {
      if (CHECKED_ELSEWHERE[question.questionId]?.includes(field.id)) continue;
      const written = STATED[question.questionId]?.[field.id];
      const stated = typeof written === 'function' ? written(question) : written;
      const candidates = [...sidesOf(question.prompt), ...labelSides(field.label), ...(stated ? [stated] : [])];
      assert.ok(candidates.some((candidate) => sameValue(candidate, field.answer)), `${question.questionId}.${field.id}: ${field.answer} is none of ${JSON.stringify(candidates)}`);
      matched += 1;
    }
  }
  assert.ok(matched > 450, `${matched} keys matched`);
  // The two-condition polynomials written above meet their prompts' conditions.
  const cw9 = read(STATED['rfh-cw-9'].factored);
  assert.ok(close(cw9({ x: 1 }), 0) && close(cw9({ x: -2 }), -12));
  const p6 = read(STATED['rfh-p-6'].factored);
  assert.ok(close(p6({ x: 1 }), 0) && close(p6({ x: -1 }), 10) && close(p6({ x: 0 }), 6));
  // …and each perfect-square b is the one the trinomial needs: b² = 4c, b > 0.
  for (const version of met('fph-wu-3')) {
    const c = Number(/bx \+ (\d+)/.exec(version.prompt)[1]);
    assert.equal(Number(answerOf(version, 'b')), 2 * Math.sqrt(c), version.prompt);
  }
});

test('each table item\'s polynomial reproduces its table, and its zeros are the table\'s zeros', () => {
  const tables = { 'fph-cw-3': 'fx', 'rfh-cw-3': 'px', 'rfh-p-7': 'px' };
  for (const [id, column] of Object.entries(tables)) {
    const [question] = met(id);
    const polynomial = read(question.answerFields.find((field) => field.id === 'factored').answer);
    for (const row of question.table.rows) {
      assert.ok(close(polynomial({ x: Number(row.x) }), Number(row[column])), `${id}: P(${row.x})`);
    }
    const zeros = question.table.rows.filter((row) => Number(row[column]) === 0).map((row) => Number(row.x));
    const listed = question.answerFields.find((field) => ['zeros', 'three'].includes(field.id));
    assert.deepEqual(listOf(listed.answer).sort((a, b) => a - b), zeros, `${id}: the table's zeros`);
  }
  // The fourth zero c comes from the table's P(0) = (2)(1)(−1)(−c), and the remainder from P(4).
  const [p7] = met('rfh-p-7');
  const p0 = Number(p7.table.rows.find((row) => Number(row.x) === 0).px);
  assert.equal(Number(answerOf(p7, 'fourth')), p0 / ((0 + 2) * (0 + 1) * (0 - 1) * -1));
  const [cw3] = met('rfh-cw-3');
  assert.equal(Number(cw3.answerFields.find((field) => field.id === 'rem').answer), Number(cw3.table.rows.find((row) => Number(row.x) === 4).px));
});

test('every zero a key names is a zero of its prompt\'s polynomial, and a built polynomial has the zeros and point it was built from', () => {
  // The fields naming zeros of the polynomial the prompt writes (its first expression with a power of x).
  const ZEROS = {
    'rfh-cw-4': ['zeros'], 'rfh-cw-6': ['zeros'], 'rfh-cw-10': ['big', 'small'], 'rfh-p-5': ['zeros'],
    'rfh-p-9': ['rational', 'big', 'small'], 'rxh-cw-6': ['other'], 'rxh-p-9': ['other'],
  };
  let checked = 0;
  for (const [id, fields] of Object.entries(ZEROS)) {
    const [question] = met(id);
    const side = sidesOf(question.prompt).find((candidate) => /x\s*\^/.test(candidate));
    const polynomial = evaluator(side);
    assert.ok(polynomial, `${id}: a polynomial in the prompt`);
    for (const fieldId of fields) {
      const field = question.answerFields.find((candidate) => candidate.id === fieldId);
      const values = field.inputProfile === 'set' ? listOf(field.answer) : [read(field.answer)({})];
      values.forEach((value) => {
        assert.ok(close(polynomial({ x: value }), 0), `${id}.${fieldId}: P(${value}) for ${side}`);
        checked += 1;
      });
    }
    // A full list of zeros has one zero for each degree.
    const listed = question.answerFields.find((candidate) => candidate.id === 'zeros');
    const degree = Math.max(...[...side.matchAll(/x\s*\^\s*\{?\s*(\d+)/g)].map((match) => Number(match[1])));
    if (listed) assert.equal(new Set(listOf(listed.answer)).size, degree, `${id}: ${listed.answer}`);
  }
  assert.ok(checked >= 18, `${checked} zeros`);
  // The quadratic (and cubic) left after dividing out rational zeros still has the irrational zeros.
  for (const id of ['rfh-cw-10', 'rfh-p-9']) {
    const [question] = met(id);
    const quadratic = read(answerOf(question, 'quadratic'));
    ['big', 'small'].forEach((fieldId) => assert.ok(close(quadratic({ x: read(answerOf(question, fieldId))({}) }), 0), `${id}.${fieldId}`));
  }
  const cubic = read(answerOf(met('rfh-cw-10')[0], 'cubic'));
  assert.ok(close(cubic({ x: 1 + Math.sqrt(3) }), 0) && close(cubic({ x: -2 }), 0));
  // "Write the cubic with zeros −2, 1 and 4 through (0, 16)."
  const [built] = met('rfh-cw-11');
  const f = read(answerOf(built, 'factored'));
  [[-2, 0], [1, 0], [4, 0], [0, 16]].forEach(([x, y]) => assert.ok(close(f({ x }), y), `f(${x})`));
  assert.ok(close(f({ x: 2 }), Number(answerOf(built, 'f2'))));
  // The box: V(x) = 60 at the x the key gives, and the dimensions are positive there.
  const [box] = met('rfh-p-11');
  const x = Number(answerOf(box, 'x'));
  assert.ok(close(read('x^3+4x^2+x-6')({ x }), 60));
  assert.ok(Math.min(x - 1, x + 2, x + 3) > 0);
  assert.equal(Number(answerOf(box, 'shortest')), Math.min(x - 1, x + 2, x + 3));
});

// '{±1, ±2, ±1/3}' → [1, -1, 2, -2, 1/3, -1/3]
const listOf = (text) => String(text).replace(/[{}\s]/g, '').replace(/−/g, '-').split(',').flatMap((entry) => {
  const [numerator, denominator = '1'] = entry.replace(/^±/, '').split('/');
  const value = Number(numerator) / Number(denominator);
  return entry.startsWith('±') ? [value, -value] : [value];
});
const sameSet = (left, right) => left.length === right.length
  && left.every((value) => right.some((other) => close(value, other)))
  && right.every((value) => left.some((other) => close(value, other)));
const divisors = (n) => Array.from({ length: Math.abs(n) }, (_, index) => index + 1).filter((d) => n % d === 0);
const rationalCandidates = (constant, leading) => {
  const values = [];
  divisors(constant).forEach((p) => divisors(leading).forEach((q) => [p / q, -p / q].forEach((value) => {
    if (!values.some((other) => close(other, value))) values.push(value);
  })));
  return values;
};

test('the Rational Zero Theorem lists are built from the prompt\'s constant term and leading coefficient', () => {
  const lists = { 'rfh-cw-4': [6, 2], 'rfh-cw-10': [4, 1], 'rfh-p-5': [6, 2] };
  for (const [id, [constant, leading]] of Object.entries(lists)) {
    const [question] = met(id);
    assert.ok(sameSet(listOf(question.answerFields.find((field) => field.id === 'candidates').answer), rationalCandidates(constant, leading)), id);
  }
  // Parameters read from factor pairs and perfect squares.
  const [parameters] = met('fph-cw-9');
  const pairs = divisors(12).flatMap((d) => [[d, -12 / d], [-d, 12 / d]]);
  assert.ok(sameSet(listOf(parameters.answerFields.find((field) => field.id === 'k').answer), [...new Set(pairs.map(([m, n]) => m + n))]));
  assert.ok(sameSet(listOf(parameters.answerFields.find((field) => field.id === 'b').answer), [12, -12]));
  const [positive] = met('fph-p-10');
  const cs = [1, 2, 3, 4, 5, 6].map((m) => m * (7 - m)).filter((c) => c > 0);
  assert.ok(sameSet(listOf(positive.answerFields.find((field) => field.id === 'c').answer), [...new Set(cs)]));
});

// Numbers asked along the way, worked here by hand from each prompt.
const NUMBERS = {
  'fph-cw-8': { orig: 8 + 27, jordan: (2 + 3) * (4 + 12 + 9) },
  'fph-cw-11': { vol: 2 * (12 - 4) * (8 - 4) },
  'fph-p-10': { k: 12 / 4 },
  'fph-p-11': { height: 5 - 2, volume: 125 + 75 - 20 - 12 },
  'fph-p-13': { check: 125 - 5 },
  'rfh-cw-2': { rem: 27 - 36 + 6 },
  'rfh-cw-4': { test: 2 * 27 - 3 * 9 - 11 * 3 + 6 },
  'rfh-cw-8': { k: (15 - 3) / 4, pm1: -1 + 3 + 4 + 3 },
  'rfh-cw-9': { eq1: 5, eq2: 1, a: 2, b: 3, real: 1 },
  'rfh-cw-11': { a: 16 / ((0 + 2) * (0 - 1) * (0 - 4)) },
  'rfh-p-6': { a: -1, b: -7 },
  'rfh-p-13': { rem: (-1) ** 100 + 1 },
  'rxh-cw-4': { den: 5 - 3 },
  'rxh-cw-6': { value: 0 },
  'rxh-cw-7': { a: 2, b: 3 },
  'rxh-cw-8': { one: Math.sqrt(9 + 16), two: 3 + 4 },
  'rxh-cw-9': { a: 9 * 5, b: 4 * 11, c: 8 * 3, d: 27 * 2 },
  'rxh-p-9': { value: 0 },
  'rxh-p-10': { a: 3, b: 2 },
  'rxh-p-11': { a: 16 * 3, b: 9 * 5, c: 4 * 11 },
  'rxh-p-13': { s: (5 + 6 + 7) / 2, prod: 9 * 4 * 3 * 2 },
  'rxh-p-14': { check: 6 - 2 },
  'reh-cw-3': { v: Math.cbrt(Math.sqrt(64)) },
  'reh-cw-5': { a6: 2 ** 3, b6: 3 ** 2, c6: 5 ** 3, d6: 11 ** 2 },
  'reh-cw-6': { value: Math.cbrt(-8) ** 2 },
  'reh-cw-8': { a8: Math.cbrt(8) ** 2, t9: Math.sqrt(9) ** 3, mars: Math.round(100 * 1.52 ** 1.5) / 100, jup: Math.round(10 * 5.2 ** 1.5) / 10 },
  'reh-cw-9': { x8: Math.cbrt(8) ** 2, x27: Math.cbrt(27) ** 2, v16: Math.sqrt(16) ** 3 },
  'reh-p-5': { a: 2 ** 3, b: 3 ** 2, c: 6 },
  'reh-p-6': { lhs: Math.sqrt(16 + 9), rhs: Math.sqrt(16) + 3 },
  'reh-p-9': { saturn: Math.round(10 * 29.5 ** (2 / 3)) / 10, t16: Math.sqrt(16) ** 3 },
  'reh-p-10': { r16: 16 ** 0.75, m2: Math.round(100 * 2 ** (4 / 3)) / 100 },
  'srh-cw-3': { check: Math.sqrt(-2 + 6) },
  'srh-cw-5': { inner: Math.cbrt(8) ** 2, x: 1 + Math.cbrt(8) ** 2 },
  'srh-cw-6': { checkm1: Math.sqrt(2 * -1 + 3) - Math.sqrt(-1 + 1) },
  'srh-cw-7': { x: 4 + 1 },
  'srh-cw-8': { sq: 3 + (-2) ** 2 },
  'srh-p-5': { iso: 162 / 2 },
  'srh-p-6': { rootx: (7 - 1) / 2, x: 9, check: Math.sqrt(16) - Math.sqrt(9) },
  'srh-p-9': { h9: 81 / 1.5, x9: Math.sqrt(9), d2: 2 ** 2 },
  'srh-p-10': { x2: 0 },
  'srh-p-11': { a: Math.cbrt(8) ** 4 },
};

test('every number asked along the way is the number its prompt gives', () => {
  let checked = 0;
  for (const [id, fields] of Object.entries(NUMBERS)) {
    const [question] = met(id);
    assert.ok(question, id);
    for (const [fieldId, value] of Object.entries(fields)) {
      const field = question.answerFields.find((candidate) => candidate.id === fieldId);
      assert.ok(field, `${id}.${fieldId}`);
      assert.ok(close(Number(read(String(field.answer))({})), value), `${id}.${fieldId}: ${field.answer} is not ${value}`);
      checked += 1;
    }
  }
  // The worked two-condition answers satisfy both conditions.
  const P = ({ a, b }) => (x) => x ** 3 + a * x ** 2 + b * x - 6;
  assert.ok(close(P({ a: 2, b: 3 })(1), 0) && close(P({ a: 2, b: 3 })(-2), -12));
  const Q = (x) => 2 * x ** 3 - x ** 2 - 7 * x + 6;
  assert.ok(close(Q(1), 0) && close(Q(-1), 10));
  assert.ok(close((2 + Math.sqrt(3)) ** 2, 7 + 4 * Math.sqrt(3)) && close((3 + Math.sqrt(2)) ** 2, 11 + 6 * Math.sqrt(2)));
  assert.ok(checked >= 70, `${checked} numbers`);
});

test('retyping the question is never the answer: no expression in a prompt is accepted for a form-graded key', () => {
  let refused = 0;
  for (const question of metAll((candidate) => candidate.type === 'multiAnswer')) {
    for (const field of question.answerFields.filter((candidate) => FORM_GRADED.includes(candidate.gradingMode))) {
      for (const side of sidesOf(question.prompt).filter((candidate) => sameValue(candidate, field.answer))) {
        if (String(side).replace(/\s/g, '') === String(field.answer).replace(/\s/g, '')) continue;
        assert.equal(matchesFieldAnswer(side, field), false, `${question.questionId}.${field.id}: "${side}" retyped is taken for ${field.answer}`);
        refused += 1;
      }
    }
  }
  assert.ok(refused > 300, `${refused} retypings refused`);
});

test('a calculator\'s display is never the exact answer, however many digits it shows', () => {
  let refused = 0;
  for (const question of metAll((candidate) => candidate.type === 'multiAnswer')) {
    for (const field of question.answerFields.filter((candidate) => candidate.gradingMode === 'simplestRadicalForm')) {
      const key = String(field.answer).replace(/\s/g, '');
      if (/[a-z]/i.test(key.replace(/sqrt|cbrt|root/g, '')) || /^-?\d+$/.test(key)) continue;
      const fraction = /^-?\d+\/(\d+)$/.exec(key);
      let denominator = Number(fraction?.[1] || 0);
      [2, 5].forEach((prime) => { while (denominator && denominator % prime === 0) denominator /= prime; });
      if (fraction && denominator === 1) continue;
      const value = read(key)({});
      assert.equal(matchesFieldAnswer(String(value), field), false, `${question.questionId}.${field.id}: ${value} for ${field.answer}`);
      refused += 1;
    }
  }
  assert.ok(refused > 60, `${refused} displays refused`);
});

/* ------------------------------------------ the Polynomial Workshop */

const num = (value) => String(Number(Number(value).toFixed(6)) + 0);
const polynomialText = (coefficients, variable = 'x') => coefficients.map((value, index) => {
  const degree = coefficients.length - 1 - index;
  if (Math.abs(value) < 1e-12) return '';
  const size = Math.abs(value);
  const number = degree > 0 && Math.abs(size - 1) < 1e-12 ? '' : num(size);
  return `${value < 0 ? '-' : '+'}${number}${degree === 0 ? '' : degree === 1 ? variable : `${variable}^${degree}`}`;
}).join('').replace(/^\+/, '') || '0';
const horner = (coefficients, root) => {
  const middle = [];
  const bottom = [coefficients[0]];
  for (let index = 1; index < coefficients.length; index += 1) {
    middle.push(root * bottom[index - 1]);
    bottom.push(coefficients[index] + middle[index - 1]);
  }
  return { middle, bottom };
};

test('each Polynomial Workshop item divides the prompt\'s own polynomial by the prompt\'s own divisor', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'polynomialWorkshop')) {
    const shows = (coefficients) => sidesOf(version.prompt).some((side) => sameValue(side, polynomialText(coefficients)));
    assert.ok(shows(version.dividend), `${version.questionId}: ${polynomialText(version.dividend)} in ${version.prompt}`);
    if (version.mode === 'synthetic') {
      assert.ok(shows([1, -Number(version.candidateRoot)]) || segmentsOf(version.prompt).some((segment) => new RegExp(`P\\(\\s*${version.candidateRoot}\\s*\\)`).test(segment)), `${version.questionId}: x − ${version.candidateRoot}`);
    } else {
      assert.equal(version.mode, 'division', version.questionId);
      assert.ok(shows(version.divisor), `${version.questionId}: ${polynomialText(version.divisor)} in ${version.prompt}`);
    }
    checked += 1;
  }
  assert.ok(checked > 60, `${checked} workshop versions`);
});

test('where a prompt says x − r IS a factor, it is, in every version', () => {
  let checked = 0;
  const claim = /^\$x\s*([+-])\s*(\d+)\$ is a factor of \$(?:P\(x\)\s*=\s*)?([^$]+)\$/;
  for (const version of metAll((question) => claim.test(question.prompt))) {
    const [, sign, size, polynomial] = claim.exec(version.prompt);
    const r = sign === '-' ? Number(size) : -Number(size);
    assert.ok(close(read(polynomial)({ x: r }), 0), `${version.questionId}: ${version.prompt}`);
    checked += 1;
  }
  assert.ok(checked >= 64, `${checked} claims`);
});

test('synthetic division: the whole table earns full credit; the answers without the table do not', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'polynomialWorkshop' && question.mode === 'synthetic')) {
    const r = Number(version.candidateRoot);
    const { middle, bottom } = horner(version.dividend, r);
    const remainder = bottom.at(-1);
    const answers = { value: num(remainder), quotient: polynomialText(bottom.slice(0, -1)), factorChoice: remainder === 0 ? 'yes' : 'no' };
    const table = { root: num(r), top: version.dividend.map(num), middle: middle.map(num), bottom: bottom.map(num) };
    const full = gradeToolWork({ toolId: 'polynomialWorkshop', question: version, work: { ...table, ...answers } });
    assert.equal(full.isCorrect, true, `${version.questionId}: ${JSON.stringify(full.parts?.filter((part) => !part.isCorrect))}`);
    const shortcut = gradeToolWork({ toolId: 'polynomialWorkshop', question: version, work: answers });
    assert.equal(shortcut.isCorrect, false, `${version.questionId}: the answers alone`);
    checked += 1;
  }
  assert.ok(checked >= 60, `${checked} synthetic divisions`);
});

test('long division: the quotient and remainder rebuild the dividend, earn full credit, and a slipped coefficient does not', () => {
  let checked = 0;
  const multiply = (left, right) => {
    const product = Array(left.length + right.length - 1).fill(0);
    left.forEach((a, i) => right.forEach((b, j) => { product[i + j] += a * b; }));
    return product;
  };
  for (const version of metAll((question) => question.type === 'polynomialWorkshop' && question.mode === 'division')) {
    const { quotient, remainder } = polynomialLongDivide(version.dividend, version.divisor);
    assert.ok(remainder.length < version.divisor.length || remainder.every((value) => value === 0), `${version.questionId}: the remainder's degree is below the divisor's`);
    // dividend = divisor · quotient + remainder, worked here by hand.
    const rebuilt = multiply(version.divisor, quotient);
    const padded = [...Array(rebuilt.length - remainder.length).fill(0), ...remainder];
    assert.deepEqual(rebuilt.map((value, index) => value + padded[index]), version.dividend, version.questionId);
    const work = { quotient: quotient.map(num).join(', '), remainder: remainder.map(num).join(', ') };
    assert.equal(gradeToolWork({ toolId: 'polynomialWorkshop', question: version, work }).isCorrect, true, version.questionId);
    const slipped = { ...work, quotient: [quotient[0] + 1, ...quotient.slice(1)].map(num).join(', ') };
    assert.equal(gradeToolWork({ toolId: 'polynomialWorkshop', question: version, work: slipped }).isCorrect, false, version.questionId);
    checked += 1;
  }
  assert.ok(checked >= 30, `${checked} long divisions`);
});

/* ---------------------------------------------- radical equations */

const statedEquation = (prompt, variable, solutions, extraneous) => segmentsOf(prompt)
  .filter((segment) => segment.split('=').length === 2 && segment.includes(variable))
  .map((segment) => segment.split('=').map(evaluator))
  .find(([left, right]) => left && right
    && solutions.every((value) => close(left({ [variable]: value }), right({ [variable]: value })))
    && extraneous.every((value) => !close(left({ [variable]: value }), right({ [variable]: value }))));

test('each radical equation\'s solutions solve the equation its prompt states, and its extraneous candidates do not', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'signSolutionAnalyzer')) {
    const spec = version.radicalEquation;
    const variable = spec.variable || 'x';
    const { candidates, solutions } = version.mode === 'radicalCheck'
      ? { candidates: version.candidates, solutions: validRadicalCandidates(spec, version.candidates) }
      : radicalSolveKey(spec);
    assert.ok(candidates.length >= 1, `${version.questionId}: something to check`);
    const extraneous = candidates.filter((value) => !solutions.some((solution) => close(solution, value)));
    assert.ok(statedEquation(version.prompt, variable, solutions, extraneous), `${version.questionId}: ${version.prompt} → ${solutions} (extraneous ${extraneous})`);
    checked += 1;
  }
  assert.ok(checked >= 100, `${checked} equations`);
  // Every Practice and DOL version of the one-radical, variable-on-both-sides
  // template has exactly one extraneous candidate to catch.
  for (const version of [...met('srh-p-1'), ...met('srh-dol-1')]) {
    const key = radicalSolveKey(version.radicalEquation);
    assert.deepEqual([key.candidates.length, key.solutions.length], [2, 1], version.prompt);
  }
  // The answer-box equations (x + h)^(2/3) = c², from their prompts: two
  // solutions, since for a negative x + h the power is (∛(x + h))² too.
  for (const version of [...met('srh-p-14'), ...met('srh-dol-2')]) {
    const [left, right] = segmentsOf(version.prompt)[0].split('=');
    const base = read(left.replace(/\^\{\\frac\{2\}\{3\}\}/, ''));
    const values = version.answerFields.map((field) => Number(field.answer));
    assert.equal(new Set(values).size, 2, version.prompt);
    values.forEach((value) => assert.ok(close(Math.cbrt(base({ x: value })) ** 2, read(right)({})), `${version.questionId}: x = ${value}`));
  }
});

test('the staged solver: full work earns full credit; a calculator\'s final answer alone does not', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'signSolutionAnalyzer' && question.mode === 'radicalSolve')) {
    const key = radicalSolveKey(version.radicalEquation);
    const { variable } = key.equation;
    const list = (values) => values.map((value) => `${variable} = ${num(value)}`).join(', ');
    const extraneous = key.candidates.filter((value) => !key.solutions.some((solution) => close(solution, value)));
    const equation = statedEquation(version.prompt, variable, key.solutions, extraneous);
    const rows = key.candidates.map((value) => {
      const [left, right] = equation.map((side) => side({ [variable]: value }));
      return { left: Number.isFinite(left) ? num(left) : 'not real', right: num(right), decision: close(left, right) ? 'solution' : 'extraneous' };
    });
    const final = key.solutions.length ? { finalAnswer: list(key.solutions), noRealSolution: false } : { finalAnswer: '', noRealSolution: true };
    const work = {
      isolated: polynomialText([key.isolated.m, key.isolated.b], variable),
      raised: polynomialText(key.raised, variable),
      candidates: key.candidates.length ? list(key.candidates) : 'none',
      rows,
      ...final,
    };
    const full = gradeToolWork({ toolId: 'signSolutionAnalyzer', question: version, work });
    assert.equal(full.isCorrect, true, `${version.questionId}: ${JSON.stringify(full.parts?.filter((part) => !part.isCorrect))}`);
    const alone = gradeToolWork({ toolId: 'signSolutionAnalyzer', question: version, work: final });
    assert.equal(alone.isCorrect, false, `${version.questionId}: the final answer alone`);
    assert.ok(alone.score <= 0.2 + 1e-9, `${version.questionId}: ${alone.score}`);
    checked += 1;
  }
  assert.ok(checked >= 100, `${checked} staged solves`);
});

/* -------------------------------------------------------- the sorts */

test('each sort board grades its key right, and the key with one card moved wrong', () => {
  const sorts = LESSONS.flatMap((lesson) => lesson.questions).filter((question) => question.type === 'openSortBoard');
  assert.equal(sorts.length, 4);
  for (const question of sorts) {
    const [scheme] = question.validSchemes;
    const groups = question.categories.map((category) => ({
      id: String(category.id),
      name: String(category.label),
      rationale: '',
      itemIds: scheme.groups.find((group) => group.id === category.id)?.itemIds || [],
    }));
    const placed = groups.flatMap((group) => group.itemIds);
    assert.deepEqual([...placed].sort(), question.items.map((item) => item.id).sort(), `${question.questionId}: every card placed once`);
    assert.equal(gradeToolWork({ toolId: 'openSortBoard', question, work: { groups } }).isCorrect, true, question.questionId);
    const moved = groups.map((group) => ({ ...group, itemIds: [...group.itemIds] }));
    moved[1].itemIds.push(moved[0].itemIds.shift());
    assert.equal(gradeToolWork({ toolId: 'openSortBoard', question, work: { groups: moved } }).isCorrect, false, `${question.questionId}: one card moved`);
  }
  // The "same value" boards: every card is its group's value.
  const valueOf = { a: 2 * Math.sqrt(6), b: 6 * Math.sqrt(2), c: 3 * Math.sqrt(2) };
  const cards = { i1: Math.sqrt(24), i2: Math.sqrt(96) / 2, i3: Math.sqrt(12) * Math.sqrt(2), i4: 12 / Math.sqrt(6), i5: Math.sqrt(72), i6: 3 * Math.sqrt(8), i7: Math.sqrt(288) / 2, i8: Math.sqrt(18), i9: 6 / Math.sqrt(2), i10: 2 * Math.sqrt(9 / 2) };
  const [radicalSort] = sorts.filter((question) => question.questionId === 'rxh-cw-11');
  radicalSort.validSchemes[0].groups.forEach((group) => group.itemIds.forEach((id) => assert.ok(close(cards[id], valueOf[group.id]), id)));
  const powers = { half: 0.5, twothirds: 2 / 3, threehalves: 1.5 };
  const exponent = { i1: 1 / 2, i2: 2 / 4, i3: 2 / 4, i4: 2 / 3, i5: 2 / 3, i6: 4 / 6, i7: 1 + 1 / 2, i8: 3 / 2, i9: 2 - 1 / 2, i10: 9 / 6 };
  const [powerSort] = sorts.filter((question) => question.questionId === 'reh-cw-10');
  powerSort.validSchemes[0].groups.forEach((group) => group.itemIds.forEach((id) => assert.ok(close(exponent[id], powers[group.id]), id)));
});

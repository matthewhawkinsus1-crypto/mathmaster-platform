/*
 * ALGEBRA I · MODULE 2 · TOPIC 2 · LESSON 3 — THE HONORS FILE (TT18).
 *
 * Assigning the Regular file to an Honors class has always built the Honors
 * version (tests/platform/algebra1L3RegularAndHonors.test.mjs), but a teacher
 * could not hold that version as a file: the one Pre-Flight builds is the stored
 * form, and it does not import back (the lesson's matching and sorting
 * questions are stored in a shape the importer does not read). The Honors file
 * (scripts/content/build-algebra1-l3-honors.mjs) is the same version in the
 * importer's own form: the Regular lesson with its Practice 9 and Practice 12
 * swapped for the two audited Digital SAT items Pre-Flight chooses for them,
 * each with this lesson's supports.
 *
 * What this holds:
 *   - the committed file is exactly what the builder makes from the Regular file,
 *     so the two cannot drift apart;
 *   - it imports: valid, no errors or warnings, no hint hidden, and no hint that
 *     states an answer beyond the one the Regular lesson already has;
 *   - everything but those two Practice places is the Regular file's, so one set
 *     of Recovery families serves both;
 *   - the two places and the two items are the ones Pre-Flight picks for the
 *     Regular file, so the file IS what an Honors class gets;
 *   - for an Honors class, Pre-Flight changes nothing with this file: READY, Create
 *     accepts it, fully Recovery-ready, Recovery stored at creation;
 *   - the audited items are the bank's mathematics, untouched, with the lesson's
 *     supports added;
 *   - on every version the key is the one right option, and the reason written for
 *     each option says what is true of that option, checked from the numbers the
 *     student reads; no support states an answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fraction from 'fraction.js';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import {
  HONORS_CCMR_DOCUMENTS,
  HONORS_FILE,
  HONORS_TITLE,
  REGULAR_FILE,
  honorsFileText,
} from '../../scripts/content/build-algebra1-l3-honors.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  CCMR_RELEASE_TARGET,
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { creationRecoveryContent } from '../../src/platform/recovery/recoveryContentAuthoring.js';
import { assignmentRecoveryContent } from '../../functions/shared/recoveryContent.mjs';
import { planAssignmentRecoveryContent } from '../../functions/shared/recoveryContentPlan.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { buildQuestionHints, questionAnswerValues } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor, backUpStepWritten } from '../../src/platform/supports/feedback/backUpStep.js';
import { optionRationaleProblems } from '../../src/platform/supports/feedback/oneTryChoice.js';
import { hasAuthoredCommonError, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const clone = (value) => JSON.parse(JSON.stringify(value));
const REGULAR_TEXT = readFileSync(REGULAR_FILE, 'utf8');
const REGULAR = JSON.parse(REGULAR_TEXT);
const TEXT = readFileSync(HONORS_FILE, 'utf8');
const RAW = JSON.parse(TEXT);
const HONORS = compileTeacherImport(TEXT);
const REGULAR_COMPILED = compileTeacherImport(REGULAR_TEXT);
const practiceOf = (file) => file.sections.find((section) => section.role === 'practice');

// The two places in the Regular lesson's Practice that Pre-Flight swaps for audited
// items, written out here (counting from 0) from the lesson itself: Practice 9 is
// the sort of lines, Practice 12 is "Priya says". Not read from the builder.
const REPLACED_PLACES = [8, 11];

const reviewedOf = (text) => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(text).assignmentV5, {}));
const honorsCandidateOf = (text) => {
  const base = reviewedOf(text).assignmentV5;
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return { base, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null }) };
};
const flat = (assignment) => assignment.sections.flatMap((section) => section.questions);
const keyOf = (question) => JSON.stringify({ id: question.questionId, prompt: question.prompt, type: question.type });
const bankDocument = ({ framework, documentId }) => {
  const payload = JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${bank.FRAMEWORK_FILES[framework]}`, import.meta.url), 'utf8'));
  return (payload.items || payload.documents).find((document) => document.id === documentId);
};
const stringsOf = (value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(stringsOf) : value && typeof value === 'object' ? Object.values(value).flatMap(stringsOf) : []);

/* ------------------------------------------------------------ the file -- */

test('the committed Honors file is exactly what the builder makes from the Regular file', () => {
  assert.equal(TEXT, honorsFileText(REGULAR), 'rebuild it: node scripts/content/build-algebra1-l3-honors.mjs');
  assert.equal(RAW.assignment.title, HONORS_TITLE);
  assert.notEqual(RAW.assignment.title, REGULAR.assignment.title, 'a teacher can tell the two files apart in their library');
});

test('it imports: valid, no errors or warnings, no hint hidden, and no hint stating an answer that the Regular lesson did not already have', () => {
  assert.equal(HONORS.model.isValid, true);
  assert.deepEqual(HONORS.model.errors, []);
  assert.deepEqual(HONORS.model.warnings || [], []);
  assert.deepEqual(HONORS.semantic.errors, []);
  assert.deepEqual(HONORS.model.hiddenHints?.warnings || [], []);
  // The Regular lesson has advice about hints that quote its answers or its figures (Question 4's
  // slope; the sort in Practice 9, which the Honors file replaces). The Honors file adds none.
  const regularAdvice = REGULAR_COMPILED.model.hintAnswers?.warnings || [];
  assert.ok(regularAdvice.length >= 1, 'the Regular lesson has advice of its own, so this is checking something');
  (HONORS.model.hintAnswers?.warnings || []).forEach((warning) => assert.ok(regularAdvice.includes(warning), `new advice: ${warning}`));
  assert.equal(HONORS.questions.length, REGULAR_COMPILED.questions.length, 'every question survives the import');
});

test('everything but two Practice places is the Regular file\'s: the Warm-Up, Classwork and DOL, and the other ten Practice questions', () => {
  assert.deepEqual(RAW.sections.map((section) => section.role), REGULAR.sections.map((section) => section.role));
  RAW.sections.forEach((section, index) => {
    if (section.role === 'practice') return;
    assert.deepEqual(section, REGULAR.sections[index], `${section.role} is untouched in the Honors file`);
  });
  const honors = practiceOf(RAW);
  const regular = practiceOf(REGULAR);
  const { questions: _honorsQuestions, ...honorsPolicy } = honors;
  const { questions: _regularQuestions, ...regularPolicy } = regular;
  assert.deepEqual(honorsPolicy, regularPolicy, 'the Practice section is configured as the Regular one is');
  assert.equal(honors.questions.length, regular.questions.length, 'swapped, not added');
  honors.questions.forEach((question, index) => {
    if (REPLACED_PLACES.includes(index)) assert.notDeepEqual(question, regular.questions[index], `Practice ${index + 1} is swapped`);
    else assert.deepEqual(question, regular.questions[index], `Practice ${index + 1} is the Regular lesson's`);
  });
  // The variant policy is the Regular lesson's too: Practice is shared, as in an Honors class's own build.
  assert.deepEqual(RAW.variantPolicy, REGULAR.variantPolicy);
});

/* ------------------------------------------------- what Pre-Flight picks -- */

test('the two places and the two audited items are the ones Pre-Flight picks for the Regular file, so this file is what an Honors class gets', () => {
  const { candidate } = honorsCandidateOf(REGULAR_TEXT);
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  const chosen = candidate.sourced
    .map((item) => ({ section: candidate.assignmentV5.sections[item.sectionIndex].role, index: item.questionIndex, documentId: item.documentId }))
    .sort((a, b) => a.index - b.index);
  assert.deepEqual(chosen.map((item) => item.section), ['practice', 'practice']);
  assert.deepEqual(chosen.map((item) => item.index), REPLACED_PLACES, 'the places the lesson\'s own numbering gives');

  const written = practiceOf(RAW).questions
    .map((question, index) => ({ index, documentId: question.ccmrSource?.documentId }))
    .filter((entry) => entry.documentId);
  assert.deepEqual(written, chosen.map(({ index, documentId }) => ({ index, documentId })), 'the same item in the same place');
  assert.deepEqual(HONORS_CCMR_DOCUMENTS.map((entry) => entry.documentId), chosen.map((item) => item.documentId));
});

test('for an Honors class Pre-Flight changes nothing with this file: READY, the Honors contract met, no question swapped, and Create accepts what it previewed', () => {
  const { base, candidate } = honorsCandidateOf(TEXT);
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.deepEqual(candidate.model.warnings || [], []);
  assert.equal(candidate.honorsReport.isHonorsReady, true, candidate.honorsReport.missing.join(', '));
  assert.ok(candidate.honorsReport.checks.higherOrderReasoning && candidate.honorsReport.checks.ccmrEnrichment);
  assert.ok(candidate.honorsReport.depthCount >= 3, 'DOK 3 reasoning plus at least two other depth signals');
  // The same verdict the Regular file gets for an Honors class.
  const fromClass = honorsCandidateOf(REGULAR_TEXT).candidate.honorsReport;
  assert.deepEqual(candidate.honorsReport, fromClass, 'this file meets the Honors contract exactly as the class build does');
  // 12 Practice questions: round(12 × 0.15) = 2, met by the two audited items already there.
  assert.equal(candidate.targetCount, 2);
  assert.equal(candidate.sourcedCount, 2);
  assert.deepEqual(candidate.sourced || [], [], 'nothing was swapped for another item');
  assert.deepEqual(flat(candidate.assignmentV5).map(keyOf), flat(base).map(keyOf), 'the Honors class gets exactly this file');

  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: HONORS_TITLE, assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
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
});

test('the Honors file is fully Recovery-ready, and creation stores Recovery for it from the same six Warm-Up and DOL bindings as the Regular file', () => {
  const generation = reviewedOf(TEXT).questionGeneration;
  assert.equal(generation.recoveryReadiness.fullyReady, true);
  assert.equal(generation.recovery.warmup.status, 'ready');
  assert.equal(generation.recovery.dol.status, 'ready');
  assert.equal(generation.warnings.filter((warning) => /Recovery/.test(warning)).length, 0);

  const { assignmentV5 } = reviewedOf(TEXT);
  const payload = { ...clone(assignmentV5), id: 'l3-honors', title: assignmentV5.assignment.title, courseProfile: { course: 'algebra1', courseLevel: 'honors' }, rigorVariant: 'honors', assignedClassIds: ['class-honors'] };
  const content = creationRecoveryContent(payload, { at: '2026-10-22T12:00:00Z', actorUid: 'teacher-uid' });
  assert.ok(content, 'Recovery is stored at creation');
  assert.deepEqual(Object.keys(content.bindings).sort(), ['l3-dol-1', 'l3-dol-2', 'l3-dol-3', 'l3-wu-1', 'l3-wu-2', 'l3-wu-3']);
  const stored = { ...payload, recoveryContent: content };
  assert.equal(assignmentRecoveryContent(stored).version, 1);
  const plan = planAssignmentRecoveryContent({ assignment: stored, gradeSample: serverRecoveryKeyCheck });
  assert.equal(plan.fullyReady, true, 'both sections ready on the server\'s full key check');
});

/* ------------------------------------------------------ the audited items -- */

test('the audited items are the bank\'s mathematics, untouched, with this lesson\'s supports added', () => {
  const audited = HONORS.questions.filter((question) => question.ccmrSource?.source === 'auditedBank');
  assert.equal(audited.length, HONORS_CCMR_DOCUMENTS.length);
  const lessonTeks = new Set(REGULAR_COMPILED.questions.flatMap((question) => question.alignments.filter((alignment) => alignment.role === 'primary').map((alignment) => alignment.code)));
  audited.forEach((question, order) => {
    const reference = HONORS_CCMR_DOCUMENTS[order];
    const label = reference.documentId;
    assert.equal(question.questionId, reference.questionId);
    assert.equal(question.ccmrSource.releaseTarget, CCMR_RELEASE_TARGET);
    assert.equal(question.ccmrSource.documentId, reference.documentId);
    assert.equal(question.assessmentContext.framework, reference.framework);
    assert.ok(bank.questionTeksCodes(question).includes(reference.teks), `${label} is on ${reference.teks}`);
    assert.ok(lessonTeks.has(reference.teks), 'a TEKS this lesson teaches');

    // The bank's mathematics, untouched: prompt, answer, generator, alignments, provenance. A
    // choice field also carries this lesson's reason for each option, a support like the back-up step.
    const converted = clone(bank.bankDocumentToV5Intent(bankDocument(reference), { activityRole: 'practice' }));
    const written = practiceOf(RAW).questions.find((entry) => entry.questionId === reference.questionId);
    const bankPart = (key, value) => (key === 'answerFields' ? value.map(({ optionRationales: _reasons, ...field }) => field) : value);
    Object.keys(converted).filter((key) => !['activityRole', 'questionId', 'solutionReview'].includes(key)).forEach((key) => (
      assert.deepEqual(bankPart(key, written[key]), converted[key], `${label}: ${key} is the bank's`)
    ));
    // The worked solution is the bank's with the $…$ markup unwrapped; the usual mistake is named.
    Object.entries(converted.solutionReview || {}).forEach(([key, value]) => {
      const plain = (text) => text.replace(/\$/g, '');
      assert.deepEqual(written.solutionReview[key], Array.isArray(value) ? value.map(plain) : plain(value), `${label}: solution ${key}`);
    });
    stringsOf(written.solutionReview).forEach((text) => assert.doesNotMatch(text, /[$\\]/, `${label}: plain text`));
    assert.ok(hasAuthoredCommonError(question), `${label} names the usual mistake`);
    assert.equal(workedSolutionDepth(question), 'steps');
    // Added for this lesson, as for every question in it.
    const step = backUpStepFor(question);
    assert.ok(backUpStepWritten(step) && step.source === 'authored', `${label}: a back-up step written for it`);
    assert.equal(step.options.length, 2);
    assert.ok(step.options.includes(step.correct));
    assert.deepEqual(optionRationaleProblems(question), [], `${label}: a reason for every option, that Pre-Flight can show`);
    assert.deepEqual(written.questionFamily, { scope: 'assignment' }, `${label}: its own numbers, from the lesson's own generator`);
  });
});

/* ------------------------------------------------------ every version -- */

const VERSIONS = 60;
const slotOf = (questionId) => HONORS.questions.find((question) => question.questionId === questionId);
const versionsOf = (questionId) => {
  const slot = slotOf(questionId);
  return Array.from({ length: VERSIONS }, (_, index) => {
    const preview = resolveFamilyPreviewInstance(slot, { index });
    assert.equal(preview.error, null, `${questionId} version ${index}`);
    return preview.question;
  });
};
const unwrap = (text) => String(text).replace(/^\$|\$$/g, '');
const slopeOf = (a, b) => new Fraction(-a, b);
const ONE = new Fraction(1);

// What each kind of option means for the line, and what its reason must say of it (every
// phrase, so a reason that names the other kind, or half of this one, is caught). Written out here.
const REASON_PHRASES = {
  perpendicular: [/negative reciprocal of the given line’s slope/, /pass through the point/],
  parallel: [/same slope/, /parallel, not perpendicular/],
  reciprocalSameSign: [/flipped over/, /sign unchanged/, /multiply to 1, not −1/],
  oppositeNotFlipped: [/opposite of the given slope/, /not flipped over/, /do not multiply to −1/],
};
const saysAll = (reason, kind) => REASON_PHRASES[kind].every((phrase) => phrase.test(reason));

test('on every version of the standard-form item (Practice 12), the key is the one perpendicular line through the point, and each option\'s reason says what is true of it', () => {
  const PROMPT = /^Line \$\\ell\$ is represented by \$(\d+)x\+(\d+)y=(-?\d+)\$\. Which equation represents a line perpendicular to \$\\ell\$ that passes through \$\((-?\d+),(-?\d+)\)\$\?$/;
  const LINE = /^\$(-?\d+)x([+-])(\d+)y=(-?\d+)\$$/;
  const versions = versionsOf('l3-honors-pr-12');
  assert.equal(new Set(versions.map((version) => version.prompt)).size, VERSIONS, 'a different version each time');
  versions.forEach((version, index) => {
    const where = `version ${index}`;
    const [A, B, , x1, y1] = PROMPT.exec(version.prompt).slice(1).map(Number);
    const given = slopeOf(A, B);
    const [field] = version.answerFields;
    const kinds = new Set();
    field.options.forEach((option) => {
      const [, a, sign, b, c] = LINE.exec(option);
      const slope = slopeOf(Number(a), sign === '-' ? -Number(b) : Number(b));
      const product = given.mul(slope);
      let kind;
      if (product.equals(-1)) kind = 'perpendicular';
      else if (slope.equals(given)) kind = 'parallel';
      else if (product.equals(ONE)) kind = 'reciprocalSameSign';
      else if (slope.equals(given.neg())) kind = 'oppositeNotFlipped';
      assert.ok(kind, `${where}: ${option} is one of the four kinds`);
      kinds.add(kind);
      const reason = field.optionRationales[option];
      assert.ok(saysAll(reason, kind), `${where}: the reason for ${option} says what is true of it (${kind}): ${reason}`);
      // And it does not say what is true of another kind.
      Object.keys(REASON_PHRASES).filter((other) => other !== kind).forEach((other) => (
        assert.ok(!saysAll(reason, other), `${where}: the reason for a ${kind} line does not say ${other}`)
      ));
      if (kind === 'perpendicular') {
        assert.equal(option, field.answer, `${where}: the key is the perpendicular line`);
        assert.equal(Number(a) * x1 + (sign === '-' ? -Number(b) : Number(b)) * y1, Number(c), `${where}: and it passes through (${x1}, ${y1})`);
      } else {
        assert.notEqual(option, field.answer, `${where}: ${option} is not the key`);
      }
    });
    assert.equal(kinds.size, 4, `${where}: four different kinds of option`);
    assert.equal(new Set(field.options).size, 4, `${where}: four different options`);
  });
});

test('on every version of the parameter item (Practice 9), the key makes the slopes multiply to −1, and each option\'s reason says what is true of it', () => {
  const PROMPT = /^The lines \$(\d+)x\+(\d+)y=(-?\d+)\$ and \$px ([+-]) (\d+)y=(-?\d+)\$ are perpendicular, where \$p\$ is a constant\. What is the value of \$p\$\?$/;
  const versions = versionsOf('l3-honors-pr-9');
  assert.equal(new Set(versions.map((version) => version.prompt)).size, VERSIONS, 'a different version each time');
  const PHRASE = {
    key: /multiply to −1, so the lines are perpendicular/,
    wrongSign: /right size but the wrong sign: with it the two slopes multiply to 1, not −1/,
    slopeOne: /second line has slope 1, and 1 times the first slope is not −1/,
    slopeMinusOne: /second line has slope −1, and the two slopes multiply to a positive number, not −1/,
  };
  versions.forEach((version, index) => {
    const where = `version ${index}`;
    const [A, B, , sign, q] = PROMPT.exec(version.prompt).slice(1);
    const first = slopeOf(Number(A), Number(B));
    const y = sign === '-' ? -Number(q) : Number(q);
    const [field] = version.answerFields;
    const kinds = new Set();
    field.options.forEach((option) => {
      const p = Number(unwrap(option));
      const second = new Fraction(-p, y);
      const product = first.mul(second);
      let kind;
      if (product.equals(-1)) kind = 'key';
      else if (product.equals(ONE)) kind = 'wrongSign';
      else if (second.equals(ONE)) kind = 'slopeOne';
      else if (second.equals(-1)) kind = 'slopeMinusOne';
      assert.ok(kind, `${where}: ${option} is one of the four kinds`);
      kinds.add(kind);
      const reason = field.optionRationales[option];
      assert.match(reason, PHRASE[kind], `${where}: the reason for ${option} says what is true of it (${kind})`);
      Object.entries(PHRASE).filter(([other]) => other !== kind).forEach(([other, phrase]) => (
        assert.doesNotMatch(reason, phrase, `${where}: the reason for a ${kind} option does not say ${other}`)
      ));
      if (kind === 'key') assert.equal(option, field.answer, `${where}: the key is the p that makes them perpendicular`);
      else assert.notEqual(option, field.answer);
    });
    assert.equal(kinds.size, 4, `${where}: four different kinds of option`);
    assert.equal(new Set(field.options).size, 4, `${where}: four different options`);
  });
});

test('no hint, back-up step, usual mistake or option reason states the answer, on any version of either item', () => {
  ['l3-honors-pr-9', 'l3-honors-pr-12'].forEach((questionId) => {
    const slot = slotOf(questionId);
    const step = backUpStepFor(slot);
    versionsOf(questionId).forEach((version, index) => {
      // The key as the bank writes it ("$-16$") and as a student reads it ("-16").
      const answers = questionAnswerValues(version).flatMap((value) => [value, unwrap(value)]);
      assert.ok(answers.length > 0, `${questionId} version ${index}: there is an answer to guard`);
      const shown = buildQuestionHints(version).map((hint) => hint.text);
      assert.ok(shown.length >= 1, `${questionId} version ${index}: its hint is shown`);
      const supports = [
        ...shown,
        step.prompt, ...step.options,
        version.solutionReview.commonError,
        ...Object.values(version.answerFields[0].optionRationales),
      ];
      supports.forEach((text) => assert.equal(hintRevealsAnswer(text, answers), false, `${questionId} version ${index}: "${text}" states an answer`));
    });
  });
});

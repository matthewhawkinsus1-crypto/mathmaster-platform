/*
 * WHAT A GENERATED LESSON FILE IS HELD TO (scripts/content/ builders).
 *
 * A lesson module writes a teacher-import Assignment V5 file. These checks run
 * the file the way the platform does — the teacher import, Pre-Flight, the
 * Question Family engine, the graders, the tools' own worked solutions — and
 * report every problem as a sentence, so a failing test says which question
 * and why. They hold behaviour, not wording: a key is checked by grading it,
 * a graph by comparing the inequality a student reads with the one they are
 * graded on, a "Break it down" list by asking the chunker what it shows.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileTeacherImport } from '../../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../../functions/shared/ordinaryResponseGrading.mjs';
import '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../../functions/shared/questionFamilyEngine.mjs';
import { resolveQuestionFamilyDefinition } from '../../../functions/shared/questionFamilyInstance.mjs';
import { sameLinearInequality } from '../../../functions/shared/linearInequalityEquivalence.mjs';
import { buildToolSolutionReviewModel } from '../../../src/tools/shared/toolSolutionReview.js';
import { chunkDirections } from '../../../src/platform/language/directionChunks.js';
import { parseAssignmentBlueprintText } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { buildHonorsCcmrCandidate } from '../../../src/platform/assignments/canonicalCcmrHydration.js';

const require = createRequire(import.meta.url);
export const bank = require('../../../functions/lib/ccmrAssignmentBank.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const readRepoFile = (relativePath) => readFileSync(path.join(ROOT, relativePath), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

/** A class of 32: every personalized question should reach that many versions. */
export const VERSIONS = 32;

/** The questions as the teacher import compiles them, with Pre-Flight's own findings. */
export const compiled = (text) => compileTeacherImport(text);

/** Everything Pre-Flight would show a teacher about the file: errors, warnings, dropped hints, worked-solution notes. */
export const preflightFindings = (text) => {
  const { model, semantic } = compiled(text);
  return [
    ...model.errors,
    ...(model.warnings || []),
    ...semantic.errors,
    ...semantic.warnings,
    ...(model.hiddenHints?.warnings || []),
    ...(model.solutionReviews?.warnings || []),
  ];
};

/** The lesson as Assignment Review holds it: imported, reviewed, Pre-Flight model built. */
export const reviewedModel = (text) => buildAssignmentV5PreflightModel(
  buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(text).assignmentV5, {}),
);

/** The Honors version Pre-Flight builds from the file (canonicalCcmrHydration.js). */
export const honorsCandidateOf = (base) => {
  const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
  return buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null });
};

/** Up to `count` versions of a question as students receive them; a static question is its own only version. */
export const versionsOf = (question, count = VERSIONS) => {
  if (!question.questionFamily) return [question];
  const definition = resolveQuestionFamilyDefinition(question, { slotKey: question.questionId });
  if (definition.error) throw new Error(`${question.questionId}: its Question Family does not resolve (${JSON.stringify(definition.error)})`);
  const { family, constraintValues, tool } = definition;
  const sequence = cachedFamilyInstanceSequence(family, constraintValues, `lesson-file-checks|${question.questionId}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    versions.push(buildFamilyQuestion({ family, instance, constraintValues, authored: question, tool }));
  }
  return versions;
};

const FLIPPED = { '<=': '>=', '>=': '<=', '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
// A wrong answer that a grader with the right idea must refuse: another
// option, the inequality with its relation reversed, the number moved past
// its field's tolerance ("nearest whole number" items accept ±1 for a
// calculator's intermediate rounding, so one more is still right there).
const wrongAnswerFor = (field) => {
  if (field.type === 'choice') return field.options.find((option) => option !== field.answer);
  const answer = String(field.answer);
  if (field.inputProfile === 'inequality') return answer.replace(/<=|>=|≤|≥|<|>/, (relation) => FLIPPED[relation]);
  const value = Number(answer);
  const tolerance = Math.max(0, Number(field.numericTolerance) || 0);
  if (field.inputProfile === 'number' && Number.isFinite(value)) return String(value + 2 * tolerance + 1);
  return '999';
};

/**
 * Every multiAnswer key, in every version: the key itself is accepted, a
 * wrong answer in any one field is refused, and no two fields of a version
 * share an answer (a student could copy one into the other).
 */
export const keyFindings = (questions) => {
  const problems = [];
  let versionsChecked = 0;
  questions.filter((question) => question.type === 'multiAnswer').forEach((question) => {
    versionsOf(question).forEach((version) => {
      versionsChecked += 1;
      const fields = version.answerFields || [];
      const key = Object.fromEntries(fields.map((field) => [field.id, String(field.answer)]));
      if (!gradeMultiAnswerResponse(version, key).isCorrect) problems.push(`${version.questionId}: its own key is refused (${JSON.stringify(key)})`);
      fields.forEach((field) => {
        const wrong = wrongAnswerFor(field);
        if (gradeMultiAnswerResponse(version, { ...key, [field.id]: wrong }).isCorrect) {
          problems.push(`${version.questionId} ${field.id}: the wrong answer "${wrong}" is accepted`);
        }
      });
      const answers = fields.map((field) => String(field.answer).replace(/\s/g, ''));
      if (new Set(answers).size !== answers.length) problems.push(`${version.questionId}: two fields share an answer (${answers.join(' | ')})`);
    });
  });
  return { problems, versionsChecked };
};

const relationText = (relation) => ({ '≤': '<=', '≥': '>=' }[relation] || relation);
const constraintText = (constraint = {}) => {
  if (constraint.orientation === 'vertical') return `x ${relationText(constraint.relation)} ${constraint.x}`;
  if (constraint.orientation === 'horizontal') return `y ${relationText(constraint.relation)} ${constraint.y}`;
  if ('m' in constraint) return `y ${relationText(constraint.relation)} (${constraint.m})*x + (${constraint.b})`;
  return `(${constraint.A})*x + (${constraint.B})*y + (${constraint.C}) ${relationText(constraint.relation)} 0`;
};
const onBoundary = (constraint, point) => {
  const x = Number(point.x);
  const y = Number(point.y);
  if (constraint.orientation === 'vertical') return Math.abs(x - Number(constraint.x)) < 1e-9;
  if (constraint.orientation === 'horizontal') return Math.abs(y - Number(constraint.y)) < 1e-9;
  if ('m' in constraint) return Math.abs(y - (Number(constraint.m) * x + Number(constraint.b))) < 1e-9;
  return Math.abs(Number(constraint.A) * x + Number(constraint.B) * y + Number(constraint.C)) < 1e-9;
};

// An Open Sort Board writes no tool review; its worked solution is the
// author's reasoning (closedQuestionReview.js falls back to it).
const AUTHORED_REVIEW_TOOLS = new Set(['openSortBoard']);

/**
 * Every rich-tool question, in every version: no placeholder is left, it has
 * a worked solution, and in the Systems Workspace each inequality a student
 * reads is the half-plane they are graded on (Pre-Flight does not compare
 * them), with a marked test point off every boundary unless the item asks
 * about the boundary there.
 */
export const toolFindings = (questions) => {
  const problems = [];
  questions.filter((question) => question.type !== 'multiAnswer').forEach((question) => {
    versionsOf(question).forEach((version) => {
      if (/\{\{/.test(JSON.stringify(version))) problems.push(`${version.questionId}: a {{placeholder}} is left in a version`);
      const review = buildToolSolutionReviewModel({ ...version, toolId: version.type });
      const authoredReasoning = Array.isArray(version.solutionReview?.reasoning) && version.solutionReview.reasoning.length > 0;
      if (!(review?.steps?.length) && !(AUTHORED_REVIEW_TOOLS.has(version.type) && authoredReasoning)) {
        problems.push(`${version.questionId} (${version.type}): no worked solution`);
      }
      if (version.type !== 'systemsWorkspace') return;
      const constraints = version.expectedConstraints || version.modeling?.expectedConstraints || [];
      (version.sourceConstraints || []).forEach((source, index) => {
        if (!sameLinearInequality(String(source), constraintText(constraints[index]))) {
          problems.push(`${version.questionId}: a student reads "${source}" but is graded on ${constraintText(constraints[index])}`);
        }
      });
      if (version.testPoint && !version.reasoning?.boundaryProbe && constraints.some((constraint) => onBoundary(constraint, version.testPoint))) {
        problems.push(`${version.questionId}: the marked test point ${JSON.stringify(version.testPoint)} is on a boundary`);
      }
    });
  });
  return problems;
};

/**
 * "Break it down" (a plan's chunked directions): every question but an
 * audited bank item — which keeps the bank's own words — carries the
 * author's steps, and the chunker shows those steps, not its own split.
 */
export const directionFindings = (questions) => {
  const problems = [];
  questions.filter((question) => !question.ccmrSource).forEach((question) => {
    const [version] = versionsOf(question, 1);
    if (!Array.isArray(version.directionSteps) || !version.directionSteps.length) {
      problems.push(`${question.questionId}: no directionSteps`);
      return;
    }
    const chunks = chunkDirections(version.prompt, { authoredSteps: version.directionSteps });
    if (chunks?.source !== 'authored') problems.push(`${question.questionId}: Break it down shows "${chunks?.source}", not the authored steps`);
  });
  return problems;
};

/** The Exit Ticket is one try with no hints: it authors none of the supports Classwork and Practice carry. */
export const dolSupportFindings = (lesson) => lesson.sections
  .filter((section) => section.role === 'dol')
  .flatMap((section) => section.questions)
  .flatMap((question) => ['hints', 'guidedNotes', 'scaffold']
    .filter((key) => question[key] != null)
    .map((key) => `${question.questionId}: an Exit Ticket question authors ${key}`));

/** Every question but the Exit Ticket's has hints, a "Let's back up" step and a common error to show. */
export const supportFindings = (lesson) => lesson.sections
  .filter((section) => section.role !== 'dol')
  .flatMap((section) => section.questions)
  .flatMap((question) => [
    ...(question.ccmrSource ? [] : [Array.isArray(question.hints) && question.hints.length ? null : `${question.questionId}: no hints`]),
    question.scaffold?.prompt?.startsWith('Let’s back up.') && question.scaffold.options?.length === 2 ? null : `${question.questionId}: no "Let’s back up" step with two options`,
    question.solutionReview?.commonError ? null : `${question.questionId}: no common error in its worked solution`,
  ].filter(Boolean));

const bankDocuments = new Map();
const bankDocument = (framework, documentId) => {
  if (!bankDocuments.has(framework)) {
    const payload = JSON.parse(readRepoFile(`functions/seeds/pathQuestionBank/${bank.FRAMEWORK_FILES[framework]}`));
    bankDocuments.set(framework, Array.isArray(payload?.items) ? payload.items : payload?.documents || []);
  }
  return bankDocuments.get(framework).find((entry) => entry?.id === documentId) || null;
};

/**
 * An audited CCMR item placed in a lesson is the bank's item: its prompt,
 * answer fields, generator, alignments and provenance exactly as the bank
 * converts them (lessonKit.auditedCcmrQuestion adds only supports).
 */
export const auditedItemFindings = (lesson) => lesson.sections.flatMap((section) => section.questions
  .filter((question) => question.ccmrSource)
  .flatMap((question) => {
    const { framework, documentId } = question.ccmrSource;
    const document = bankDocument(framework, documentId);
    if (!document) return [`${question.questionId}: ${documentId} is not in the audited ${framework} bank`];
    const intent = bank.bankDocumentToV5Intent(document, { activityRole: 'practice' });
    return ['prompt', 'answerFields', 'generator', 'alignments', 'ccmrSource', 'standard']
      .filter((key) => JSON.stringify(question[key]) !== JSON.stringify(intent[key]))
      .map((key) => `${question.questionId}: its ${key} is not the bank's (${documentId})`)
      .concat(section.role === 'practice' ? [] : [`${question.questionId}: an audited item outside Practice`]);
  }));

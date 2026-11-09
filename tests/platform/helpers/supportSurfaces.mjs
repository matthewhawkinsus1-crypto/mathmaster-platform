/*
 * WHAT AN ITEM'S SUPPORT SURFACES SAY, AS PLAIN DATA: the hint ladder (and
 * every hint the leak guard drops), the "Let's back up" step, and the worked
 * solution of the closed question — the three surfaces a question family
 * speaks to besides "Try a similar one" (familyFor in questionHints.js,
 * backUpStep.js and closedQuestionReview.js).
 *
 *   supportSurfacesOf(file) → [{ section, questionId, instance, hints, audit, backUp, review }]
 *
 * Every item of a lesson, as compiled for import. An item drawn from a
 * question family is read as the template and as one seeded instance, the
 * question a student is dealt. tests/platform/fixtures/module2SupportSurfaces.json
 * holds these for Algebra II Honors module 2, the matrices lesson and the
 * District DOL #2 review as they were before "Practise one like this" reached
 * them (practiceLikeThisPolynomials.test.mjs compares them).
 */
import { readFileSync } from 'node:fs';

import { compileAuthoringIntentV5 } from '../../../src/platform/contract/authoringIntentV5.js';
import { buildQuestionHints, questionHintAudit } from '../../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../../src/platform/supports/feedback/backUpStep.js';
import { buildClosedQuestionReview } from '../../../src/platform/supports/review/closedQuestionReview.js';
import { TOOL_CATALOG } from '../../../src/tools/toolCatalog.js';
import { generateQuestion } from '../../../src/problemGenerator.js';

const ROOT = new URL('../../../', import.meta.url);

// QuestionEngine's isToolQuestion: the registry knows the toolId, or else the type.
const isToolQuestion = (question) => [question?.toolId, question?.type].some((id) => id && Object.hasOwn(TOOL_CATALOG, id));

const surfacesOf = (question) => {
  const review = buildClosedQuestionReview({ question, isToolQuestion: isToolQuestion(question), wasCorrect: false });
  const { headline = null, reasoning = [], commonError = null, connection = null, answerSummary = null } = review?.authored || {};
  return {
    // The ladder a student climbs, and any hint the leak guard holds back.
    hints: buildQuestionHints(question).map((hint) => `${hint.source}: ${hint.text}`),
    dropped: questionHintAudit(question).filter((hint) => !hint.shown).map((hint) => `${hint.source}: ${hint.text} (${hint.reason})`),
    backUp: (({ prompt, options, correct, source }) => ({ prompt, options, correct, source }))(backUpStepFor(question)),
    review: review && {
      headline,
      reasoning,
      commonError,
      connection,
      answerSummary,
      tool: review.tool ? { steps: review.tool.steps || [], items: (review.tool.items || []).map((item) => `${item.label}: ${item.value}`), why: review.tool.why || null } : null,
      fromFamily: review.fromFamily,
      fromBuilder: review.fromBuilder,
      hasSteps: review.hasSteps,
      intro: review.intro,
    },
  };
};

const drawnFromFamily = (question) => Boolean(question?.generator || question?.familyDelivery || question?.questionFamily);

export const supportSurfacesOf = (file) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(new URL(file, ROOT), 'utf8')));
  return compiled.package.sections.flatMap((section) => section.questions.flatMap((question) => {
    const rows = [{ section: section.role, questionId: question.questionId, instance: 'template', ...surfacesOf(question) }];
    if (drawnFromFamily(question)) {
      const dealt = generateQuestion(question, `support-surfaces|${question.questionId}|variant:0`);
      if (dealt) rows.push({ section: section.role, questionId: question.questionId, instance: 'dealt', ...surfacesOf(dealt) });
    }
    return rows;
  }));
};

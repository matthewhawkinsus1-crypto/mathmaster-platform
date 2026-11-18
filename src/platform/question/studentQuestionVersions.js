/*
 * EVERY VERSION OF A QUESTION A STUDENT CAN BE GIVEN, AS QUESTIONENGINE IS HANDED IT.
 *
 *   studentQuestionVersions(question) → { versions: [{ question, which }], error }
 *
 * The student player repairs every stored question for the current runtime before anything else, whatever the
 * grading mode (App.jsx, prepareAssignmentForRuntime), and Pre-Flight judges that same view; QuestionEngine's own
 * repair runs on the stored question too, before generation, so a version is never repaired on its own. Generation
 * then gives each student one version (problemGenerator.js, generateQuestion):
 *
 *   a question with authored `variants`  one of them spread over the question (selectVariant);
 *   a variant family                     one of its versions: an assignment-local family of two or more authored
 *                                        variants deals each one over the question, keeping that variant's own
 *                                        type and toolId (questionFamilyTemplate.mjs). Every authored variant is
 *                                        built here by the engine's own builder. Two variants the engine deals as
 *                                        one version share a fingerprint, which keeps type, toolId, workflow and
 *                                        recipe, so they are drawn alike;
 *   any other family slot                one of its instances, which the family's one tool builds alike: its
 *                                        preview stands for them all;
 *   any other question                   the question itself.
 *
 * `which` names the version for a message: '' for the question itself, ' in its generated version' for a family's
 * preview, ' in its variant 3 of 4' for variants[2]. `error` is the preview of a family slot that cannot generate.
 *
 * Pure: no React.
 */
import { repairQuestionForCurrentRuntime } from '../assignments/assignmentRuntimeRepair.js';
import {
  familySlotKey,
  isFamilyBackedQuestion,
  resolveFamilyPreviewInstance,
  resolveQuestionFamilyDefinition,
} from '../../../functions/shared/questionFamilyInstance.mjs';
import { buildFamilyQuestion, evaluateFamilyCandidate } from '../../../functions/shared/questionFamilyEngine.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ofVariant = (index, count) => ` in its variant ${index + 1} of ${count}`;

/** The stored question as the student player gives it to QuestionEngine. */
export const runtimeRepairedQuestion = (question) => {
  if (!isObject(question)) return question;
  const repaired = repairQuestionForCurrentRuntime(question, { source: 'assignmentValidator' }).question;
  return isObject(repaired) ? repaired : question;
};

const variantFamilyVersions = (question) => {
  const variants = Array.isArray(question.variants) ? question.variants : [];
  if (variants.length < 2) return null;
  const definition = resolveQuestionFamilyDefinition(question, { slotKey: familySlotKey({ question }) });
  if (definition.error || definition.reference?.scope !== 'assignment') return null;
  const { family, constraintValues, tool } = definition;
  return variants.flatMap((_, variant) => {
    const candidate = evaluateFamilyCandidate(family, constraintValues, { variant });
    // A version the family refuses is never dealt.
    if (!candidate.valid) return [];
    const built = buildFamilyQuestion({ family, instance: candidate.instance, constraintValues, authored: question, tool });
    return [{ question: built, which: ofVariant(variant, variants.length) }];
  });
};

export const studentQuestionVersions = (stored) => {
  const question = runtimeRepairedQuestion(stored);
  if (!isObject(question)) return { versions: [{ question, which: '' }], error: null };
  if (isFamilyBackedQuestion(question)) {
    const versions = variantFamilyVersions(question);
    // None dealt: the preview below says why the slot cannot generate.
    if (versions?.length) return { versions, error: null };
    const preview = resolveFamilyPreviewInstance(question);
    if (preview.error) return { versions: [], error: preview };
    return { versions: [{ question: preview.question, which: ' in its generated version' }], error: null };
  }
  if (!Array.isArray(question.variants) || question.variants.length === 0) return { versions: [{ question, which: '' }], error: null };
  const { variants, ...base } = question;
  return {
    versions: variants.map((variant, index) => ({ question: { ...base, ...variant }, which: ofVariant(index, variants.length) })),
    error: null,
  };
};

export default studentQuestionVersions;

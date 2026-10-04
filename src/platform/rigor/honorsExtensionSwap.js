/*
 * SWAP HONORS EXTENSION — WITHOUT EVER REWRITING A QUESTION STUDENTS SAW.
 *
 * A teacher can swap a no-AI Honors extension MathMaster built (a current
 * recipe extension) for another vetted one, and repair a LEGACY one (contract
 * v1, the generic graphStory generator) with "Replace with Current Honors
 * Extension". Both run through `planHonorsExtensionSwap`, which returns a
 * CANDIDATE question list for the Assignment Question Editor to validate and
 * save — it never writes anything itself.
 *
 *   No student history   the extension is replaced in place: same position,
 *                        same section, a new question id (it is a different
 *                        question), `honorsEnrichment.replacesQuestionId`
 *                        recording what it replaced.
 *
 *   Live / has history   the historical question is NEVER rewritten. It stays
 *                        at its storage index with its id and every field
 *                        untouched except `teacherExcluded: true`, so the
 *                        responses students gave stay attached to the question
 *                        they answered. The replacement gets a NEW id, is
 *                        appended in a new trailing section (never inserted:
 *                        no later storage index shifts), and carries
 *                        `supersedesQuestionId`, so the current-content
 *                        projection delivers it where the retired one was.
 *                        This mirrors the server's teacher-repair strategy
 *                        (functions/lib/teacherQuestionRepair.js).
 *
 * The replacement comes only from the recipe registry, checked against the
 * assignment's own concept and course. No recipe → "unavailable", no
 * candidate, nothing changed.
 *
 * Pure: no Firestore, no clock. Question ids come from the caller.
 */
import { carryQuestionValue, keepExplicitQuestionValue } from '../../../functions/shared/questionValue.mjs';
import {
  HONORS_RECIPE_REGISTRY,
  HONORS_RECIPE_STATUS,
  HONORS_RECIPE_UNAVAILABLE,
  buildDeterministicHonorsExtension,
  describeHonorsExtension,
  selectHonorsExtensionRecipe,
} from './honorsExtensionRecipes.js';

export const HONORS_SWAP_MODE = Object.freeze({
  REPLACE: 'replace',
  RETIRE_AND_APPEND: 'retireAndAppend',
});

export const HONORS_SWAP_UNAVAILABLE = Object.freeze({
  NOT_FOUND: 'question-not-found',
  NOT_DETERMINISTIC: 'not-deterministic-honors-extension',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const ROLE_LABELS = Object.freeze({
  warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', quiz: 'Quiz', test: 'Test',
});
const roleOf = (question = {}) => clean(question?.activityRole).toLowerCase() || 'classwork';

const unavailable = (code, teacherMessage) => ({ status: HONORS_RECIPE_STATUS.UNAVAILABLE, code, teacherMessage });

// Why a recipe could not be chosen, in a clause that fits an editor card.
const reasonPhrase = (selection) => {
  switch (selection.code) {
    case HONORS_RECIPE_UNAVAILABLE.NO_VETTED_RECIPE:
      return `no vetted recipe covers ${selection.anchorFamilyId || 'its core concept'} yet`;
    case HONORS_RECIPE_UNAVAILABLE.NO_ANCHOR:
      return 'MathMaster could not identify its core concept';
    case HONORS_RECIPE_UNAVAILABLE.COURSE_CONFLICT:
      return 'its course setting and its TEKS disagree';
    case HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED:
      return 'the vetted recipe for its concept is written for a different course';
    default:
      return 'MathMaster could not confirm its course';
  }
};

/**
 * The repair action an Assignment Question Editor card offers for a question.
 *
 *   { kind: 'swap' }           a current deterministic extension
 *   { kind: 'replaceLegacy' }  a legacy deterministic one, with a current recipe
 *   { kind: 'unavailable' }    a deterministic one with no recipe for this
 *                              assignment — `explanation` says what to do
 *   { kind: null }             not a deterministic Honors extension
 */
export const honorsExtensionActionFor = ({
  question = null,
  questions = [],
  assignmentCourseId = null,
  registry = HONORS_RECIPE_REGISTRY,
} = {}) => {
  const described = describeHonorsExtension(question, { registry });
  if (!described.isDeterministic) return { kind: null, available: false, legacy: false, label: null, explanation: '' };
  const legacyNote = described.isLegacy
    ? `This Honors extension was made by an earlier no-AI generator${described.contractVersion === 1 ? ' (contract v1), which wrote a free-response task that MathMaster cannot grade' : ''}. `
    : '';
  const selection = selectHonorsExtensionRecipe({
    questions: (Array.isArray(questions) ? questions : []).filter((entry) => entry !== question),
    assignmentCourseId,
    registry,
  });
  if (selection.status !== HONORS_RECIPE_STATUS.READY) {
    return {
      kind: 'unavailable',
      available: false,
      legacy: described.isLegacy,
      label: null,
      code: selection.code,
      explanation: `${legacyNote}A vetted no-AI Honors replacement is not yet available for this assignment: ${reasonPhrase(selection)}. To stop delivering it, use Exclude — or Throw Out Safely on a live assignment; student responses stay attached to it.`,
    };
  }
  if (described.isLegacy) {
    return {
      kind: 'replaceLegacy',
      available: true,
      legacy: true,
      label: 'Replace with Current Honors Extension',
      explanation: `${legacyNote}Replace it with the current self-graded Honors extension for ${selection.anchorFamilyId}.`,
    };
  }
  return {
    kind: 'swap',
    available: true,
    legacy: false,
    label: 'Swap Honors Extension',
    explanation: 'Replace this Honors extension with a different vetted version of the same self-graded task.',
  };
};

/**
 * A candidate question list with the extension swapped, or why not.
 *
 * `questions` is the editor's flat list (each question carries its sectionId);
 * `protectHistory` is true whenever the assignment is live or has student
 * records and this question was already saved. `mintQuestionId` supplies the
 * new id. Returns { status: 'ready', mode, questions, appendedSections,
 * replacement, retiredQuestionId, replacedQuestionId, teacherMessage, notes }.
 */
export const planHonorsExtensionSwap = ({
  questions = [],
  questionId = null,
  assignmentCourseId = null,
  protectHistory = true,
  mintQuestionId = null,
  registry = HONORS_RECIPE_REGISTRY,
} = {}) => {
  const list = Array.isArray(questions) ? questions : [];
  const index = list.findIndex((entry) => clean(entry?.questionId) && clean(entry.questionId) === clean(questionId));
  if (index < 0) {
    return unavailable(HONORS_SWAP_UNAVAILABLE.NOT_FOUND, 'MathMaster could not find that question in this assignment. Nothing was changed.');
  }
  const current = list[index];
  const described = describeHonorsExtension(current, { registry });
  if (!described.isDeterministic) {
    return unavailable(
      HONORS_SWAP_UNAVAILABLE.NOT_DETERMINISTIC,
      'Only an Honors extension MathMaster built without AI can be swapped here. Nothing was changed.',
    );
  }
  if (typeof mintQuestionId !== 'function') throw new Error('planHonorsExtensionSwap needs mintQuestionId to give the replacement a new question id.');
  const newQuestionId = clean(mintQuestionId(current.questionId));
  if (!newQuestionId || list.some((entry) => clean(entry?.questionId) === newQuestionId)) {
    throw new Error('planHonorsExtensionSwap needs a new question id that is not already in the assignment.');
  }

  const built = buildDeterministicHonorsExtension({
    questions: list.filter((_, position) => position !== index),
    assignmentCourseId,
    avoidStoryIds: described.storyId ? [described.storyId] : [],
    questionId: newQuestionId,
    registry,
  });
  if (built.status !== HONORS_RECIPE_STATUS.READY) {
    return unavailable(built.code, `${built.teacherMessage.replace(/MathMaster did not add a substitute question, and the assignment was left unchanged\./, '').trim()} Nothing was changed; Exclude or Throw Out Safely still retires this question.`);
  }

  const replacedQuestionId = clean(current.questionId);
  const honorsEnrichment = { ...built.question.honorsEnrichment, replacesQuestionId: replacedQuestionId };

  if (!protectHistory) {
    const replacement = keepExplicitQuestionValue(current, {
      ...built.question,
      questionId: newQuestionId,
      activityRole: roleOf(current),
      ...(clean(current.sectionId) ? { sectionId: current.sectionId } : {}),
      ...(clean(current.sectionTitle) ? { sectionTitle: current.sectionTitle } : {}),
      // A replacement that itself replaced a historical question keeps that link.
      ...(clean(current.supersedesQuestionId) ? { supersedesQuestionId: current.supersedesQuestionId } : {}),
      teacherExcluded: false,
      honorsEnrichment,
    });
    return {
      status: HONORS_RECIPE_STATUS.READY,
      mode: HONORS_SWAP_MODE.REPLACE,
      questions: list.map((entry, position) => (position === index ? replacement : entry)),
      appendedSections: [],
      replacement,
      retiredQuestionId: null,
      replacedQuestionId,
      notes: built.notes,
      teacherMessage: 'No student has worked on this extension, so it was replaced in place with a different vetted Honors extension. Save Assignment Questions to keep it.',
    };
  }

  const role = roleOf(current);
  const section = {
    id: `honors-swap-${newQuestionId.replace(/[^A-Za-z0-9_-]+/g, '-')}`,
    role,
    title: `${ROLE_LABELS[role] || 'Section'} · Honors Extension Replacement`,
  };
  // The historical question: untouched except that it is no longer delivered.
  const retired = { ...current, teacherExcluded: true };
  // The replacement takes the retired question's place in the grade, so it is
  // worth what that question was worth: a swap never re-weights live grades.
  const replacement = carryQuestionValue(current, {
    ...built.question,
    questionId: newQuestionId,
    activityRole: role,
    sectionId: section.id,
    sectionTitle: section.title,
    teacherExcluded: false,
    // Always the ORIGINAL historical question, so a second swap still lands
    // where the first retired question was.
    supersedesQuestionId: clean(current.supersedesQuestionId) || replacedQuestionId,
    honorsEnrichment,
  });
  return {
    status: HONORS_RECIPE_STATUS.READY,
    mode: HONORS_SWAP_MODE.RETIRE_AND_APPEND,
    questions: [...list.map((entry, position) => (position === index ? retired : entry)), replacement],
    appendedSections: [section],
    replacement,
    retiredQuestionId: replacedQuestionId,
    replacedQuestionId,
    notes: built.notes,
    teacherMessage: 'Students have history on this assignment, so the original extension was kept (excluded, with every response still attached) and a new self-graded Honors extension with its own question id takes its place for future work. Save Assignment Questions to keep it.',
  };
};

/**
 * The stored assignment the editor's save rebuilds sections from, with the
 * (empty) sections a swap appended added after every existing section, once.
 * rebuildV5SectionsFromQuestions then places each replacement in its own
 * section by id, so nothing already stored moves.
 */
export const withAppendedQuestionSections = (assignment = {}, appendedSections = []) => {
  const additions = (Array.isArray(appendedSections) ? appendedSections : []).filter((section) => isObject(section) && clean(section.id));
  if (!additions.length || !isObject(assignment)) return assignment;
  const existing = Array.isArray(assignment.sections) ? assignment.sections : [];
  const seen = new Set(existing.map((section) => clean(section?.id)));
  const sections = [...existing];
  additions.forEach((section) => {
    if (seen.has(clean(section.id))) return;
    seen.add(clean(section.id));
    sections.push({ id: clean(section.id), role: section.role, title: section.title, questions: [] });
  });
  return sections.length === existing.length ? assignment : { ...assignment, sections };
};

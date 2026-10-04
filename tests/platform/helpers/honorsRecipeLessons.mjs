/*
 * A LESSON ANCHORED ON ONE QUESTION FAMILY, IN ONE COURSE.
 *
 * Recipe selection reads the assignment's core concept (its most-used family
 * across Classwork, Practice and the DOL) and checks the assignment's course
 * against the TEKS those anchor questions are aligned to. So a lesson "about"
 * a family in a course is: a few family-backed core slots of that family,
 * aligned to TEKS of that course, behind a Warm-Up of something else (a
 * Warm-Up never decides the concept).
 *
 * linear.multipleRepresentations uses the certified lesson itself, through
 * the real import + Pre-Flight chain, so the production case stays the case
 * that is tested. Every other family gets a synthetic lesson whose slots are
 * exactly what an author writes: the family's default tool, its own TEKS, and
 * no constraints (the family's defaults ARE its ordinary lesson).
 */
import { getPlatformQuestionFamily } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { publishLmrLesson } from './honorsExtensionFixtures.mjs';

// A TEKS code of each course an author would align each family's lesson to.
// Algebra I uses the family's own declared Algebra I code; Algebra II uses
// the Algebra II standard that lesson would be taught under (the family's
// own code when it is already Algebra II).
const ALGEBRA_II_CODE = Object.freeze({
  'linear.twoStepEquation': 'A2.2A',
  'linear.multiStepEquation': 'A2.2A',
  'linear.slopeFromPoints': 'A2.2A',
  'functions.identifyIntercepts': 'A2.2A',
  'linear.multipleRepresentations': 'A2.2A',
  'linear.representationSort': 'A2.2A',
  'systems.elimination': 'A2.3B',
  'systems.substitution': 'A2.3B',
  'quadratics.identifyVertex': 'A2.4D',
  'functions.identifyZeros': 'A2.4F',
  'absoluteValue.solveEquation': 'A2.6E',
});

export const lessonTeksFor = (familyId, courseId) => {
  const family = getPlatformQuestionFamily(familyId);
  if (!family) throw new Error(`no registered family ${familyId}`);
  if (courseId === 'algebra2') return ALGEBRA_II_CODE[familyId] || 'A2.2A';
  const algebra1 = family.skill.alignments.find((code) => code.startsWith('A.'));
  // A family whose only TEKS are Algebra II (absolute value) has no Algebra I
  // lesson; an "Algebra I" label on it is exactly the conflict selection refuses.
  return algebra1 || family.skill.alignments[0];
};

const slot = (familyId, questionId, activityRole, code) => {
  const family = getPlatformQuestionFamily(familyId);
  return {
    questionId,
    type: family.defaultTool,
    activityRole,
    standard: code,
    alignments: [{ framework: 'teks', code, role: 'primary' }],
    dok: family.difficulty.dok,
    difficultyBand: family.difficulty.band,
    prompt: family.title,
    questionFamily: { id: family.id, version: family.version },
  };
};

const SECTION_ORDER = Object.freeze(['warmup', 'classwork', 'practice', 'dol']);

/**
 * The same lesson as an Assignment V5 candidate, sections in teaching order —
 * what Pre-Flight judges. The certified lesson is its own published V5.
 */
export const anchorLessonV5For = (familyId, courseId = 'algebra1') => {
  if (familyId === 'linear.multipleRepresentations' && courseId === 'algebra1') return publishLmrLesson().assignmentV5;
  const questions = anchorLessonFor(familyId, courseId);
  return {
    schemaVersion: 5,
    assignment: { title: `${getPlatformQuestionFamily(familyId).title} lesson`, courseId },
    sections: SECTION_ORDER
      .map((role) => ({ id: role, role, title: role, questions: questions.filter((question) => question.activityRole === role) }))
      .filter((section) => section.questions.length),
  };
};

/** The question list of a lesson anchored on `familyId`, aligned to `courseId`. */
export const anchorLessonFor = (familyId, courseId = 'algebra1') => {
  if (familyId === 'linear.multipleRepresentations' && courseId === 'algebra1') return publishLmrLesson().questions;
  const code = lessonTeksFor(familyId, courseId);
  const warmupFamily = familyId === 'linear.twoStepEquation' ? 'linear.multiStepEquation' : 'linear.twoStepEquation';
  return [
    { ...slot(warmupFamily, `${familyId}-wu-1`, 'warmup', courseId === 'algebra2' ? 'A2.2A' : 'A.5A') },
    slot(familyId, `${familyId}-cw-1`, 'classwork', code),
    slot(familyId, `${familyId}-cw-2`, 'classwork', code),
    slot(familyId, `${familyId}-pr-1`, 'practice', code),
    slot(familyId, `${familyId}-dol-1`, 'dol', code),
  ];
};

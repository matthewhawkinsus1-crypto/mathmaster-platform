import { buildStudentLearningProfile } from '../profile/studentLearningProfile.js';
import {
  describeAdaptation, resolveAdaptedTarget, resolveAdaptivePolicy,
} from './assignmentAdaptation.js';
import { getSectionVariantMode } from '../../assignmentLifecycle.js';

/*
 * "THE PREVIEW MUST USE THE REAL ADAPTATION ENGINE. DO NOT HARD-CODE A
 *  DEMONSTRATION."
 *
 * That instruction is in the brief because the hard-coded version is so easy and
 * so tempting. A preview that says "a developing student would see an easier
 * question" is three lines of code, always looks right, and is a lie the moment
 * the engine changes — and it is a lie in the worst possible direction, because
 * a teacher who has seen the preview publishes the assignment believing they
 * know what will happen.
 *
 * So there is exactly one engine call in this file, `resolveAdaptedTarget`, and
 * it is the same function the runtime calls when a real student opens the
 * assignment. Not a copy of it, not a simplified model of it. If adaptation is
 * broken, this preview shows it broken. If someone changes the policy, this
 * preview changes with it and nobody has to remember to update it.
 *
 * THE STUDENTS ARE SIMULATED; THE ENGINE IS NOT.
 *
 * The three profiles below are built by `buildStudentLearningProfile` from
 * synthesised evidence, not hand-written objects, so they are subject to every
 * rule a real profile is — including the baseline requirement. A profile that
 * could not exist in the product cannot appear in a preview of it.
 */

const EVIDENCE_AT = 1_770_000_000_000;

/**
 * Evidence that produces a particular kind of student, through the real profile
 * builder rather than around it.
 */
const evidence = ({ correct, dok, band, count, teks, role }) => (
  Array.from({ length: count }, (unused, index) => ({
    eventKey: `preview-${teks}-${role}-${dok}-${band}-${index}`,
    occurredAt: EVIDENCE_AT + (index * 60_000),
    alignmentKeys: [teks],
    questionSnapshot: { dok, difficultyBand: band, questionInstanceId: `preview-q-${teks}-${role}-${index}` },
    performance: { status: 'finalized', isCorrect: correct, score: correct ? 1 : 0 },
    source: { kind: 'path', activityRole: role },
  }))
);

export const PREVIEW_STUDENTS = Object.freeze([
  Object.freeze({
    id: 'preview-developing',
    label: 'Developing',
    note: 'Plenty of attempts, nothing holding at the course band.',
    events: [
      ...evidence({ correct: false, dok: 2, band: 3, count: 5, teks: 'A.5C', role: 'practice' }),
      ...evidence({ correct: false, dok: 2, band: 2, count: 5, teks: 'A.2C', role: 'dol' }),
      ...evidence({ correct: false, dok: 1, band: 2, count: 5, teks: 'A.3B', role: 'practice' }),
      ...evidence({ correct: true, dok: 1, band: 1, count: 2, teks: 'A.7A', role: 'dol' }),
    ],
  }),
  Object.freeze({
    id: 'preview-onLevel',
    label: 'On level',
    note: 'Band 3 holds; band 4 does not yet.',
    events: [
      ...evidence({ correct: true, dok: 2, band: 3, count: 5, teks: 'A.5C', role: 'practice' }),
      ...evidence({ correct: true, dok: 2, band: 3, count: 5, teks: 'A.2C', role: 'dol' }),
      ...evidence({ correct: true, dok: 2, band: 3, count: 4, teks: 'A.3B', role: 'practice' }),
      ...evidence({ correct: false, dok: 3, band: 4, count: 4, teks: 'A.7A', role: 'dol' }),
    ],
  }),
  Object.freeze({
    id: 'preview-advanced',
    label: 'Above level',
    note: 'Band 4 holds, with reasoning evidence behind it.',
    events: [
      ...evidence({ correct: true, dok: 3, band: 4, count: 6, teks: 'A.5C', role: 'practice' }),
      ...evidence({ correct: true, dok: 3, band: 4, count: 6, teks: 'A.2C', role: 'dol' }),
      ...evidence({ correct: true, dok: 3, band: 4, count: 6, teks: 'A.3B', role: 'practice' }),
      ...evidence({ correct: true, dok: 2, band: 3, count: 6, teks: 'A.7A', role: 'dol' }),
    ],
  }),
]);

/** The three simulated profiles, built the same way every real profile is. */
export const previewProfiles = ({ courseId = 'algebra1' } = {}) => PREVIEW_STUDENTS.map((student) => ({
  ...student,
  profile: buildStudentLearningProfile({ courseId, evidenceEvents: student.events }),
}));

/**
 * What each simulated student would actually receive, question by question.
 *
 * One `resolveAdaptedTarget` call per question per student — the same call the
 * runtime makes. Everything else here is presentation.
 */
export const buildAdaptivePreview = ({
  assignment = null, questions = [], courseId = 'algebra1', honors = false,
} = {}) => {
  const students = previewProfiles({ courseId });
  const rows = (Array.isArray(questions) ? questions : [])
    .filter((question) => question?.teacherExcluded !== true)
    .map((question, index) => {
      const activityRole = String(question?.activityRole || question?.role || 'practice').toLowerCase();
      const variationMode = assignment
        ? getSectionVariantMode(assignment, activityRole)
        : 'adaptive';
      const policy = resolveAdaptivePolicy({ question, activityRole, variationMode, honors });

      const deliveries = students.map((student) => {
        const target = resolveAdaptedTarget({
          question,
          profile: student.profile,
          activityRole,
          variationMode,
          honors,
        });
        return {
          studentId: student.id,
          label: student.label,
          dok: target.dok,
          difficultyBand: target.difficultyBand,
          adapted: target.adapted,
          // The engine's own words. Nothing is written here.
          reason: describeAdaptation(target),
        };
      });

      const bands = new Set(deliveries.map((entry) => entry.difficultyBand));
      const doks = new Set(deliveries.map((entry) => entry.dok));

      return {
        index,
        questionId: String(question?.questionId || question?.id || `question-${index + 1}`),
        prompt: String(question?.prompt || question?.title || '').slice(0, 160),
        activityRole,
        variationMode,
        assignedDok: policy.assignedDok,
        assignedBand: policy.assignedBand,
        adaptationEnabled: policy.enabled,
        // Whether this question would actually differ between these three
        // students. A question can sit in an adaptive section and still be
        // identical for everyone — because it is an assessment item, because
        // the policy is disabled on it, or because all three land in the same
        // place. The teacher needs to know which.
        varies: bands.size > 1 || doks.size > 1,
        deliveries,
      };
    });

  const varying = rows.filter((row) => row.varies).length;

  return {
    students,
    rows,
    summary: {
      questions: rows.length,
      varying,
      // Stated plainly rather than left for the teacher to infer from a table of
      // identical numbers.
      headline: rows.length === 0
        ? 'No questions to preview yet.'
        : varying === 0
          ? 'Every student would receive identical questions. Nothing in this assignment adapts.'
          : `${varying} of ${rows.length} question${rows.length === 1 ? '' : 's'} would differ between these three students. The assigned standard is preserved on all of them.`,
    },
  };
};

export default buildAdaptivePreview;

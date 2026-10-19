// A real student document from real attempts, for tests that need the
// assignment record main's Path engine read (src/masteryEngine.js), not a
// hand-written mastery number.
//
// `triesByCode` maps a TEKS code to one entry per question: the attempt on
// which the student got it right (1 = first try), or 0 for never right.
import { recordQuestionAttempt } from '../../../src/attemptPolicy.js';

export const studentWithAssignmentWork = (triesByCode = {}, { studentId = 's', assignmentId = 'a1' } = {}) => {
  const questions = [];
  const grades = {};
  Object.entries(triesByCode).forEach(([code, entries]) => entries.forEach((tries) => {
    const index = questions.length;
    questions.push({
      type: 'algebra',
      alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }],
      dok: index % 3 === 0 ? 3 : 2,
    });
    let record = null;
    if (!(tries > 0)) {
      for (let attempt = 0; attempt < 3; attempt += 1) record = recordQuestionAttempt({ record, isCorrect: false }).record;
    } else {
      for (let attempt = 1; attempt < tries; attempt += 1) record = recordQuestionAttempt({ record, isCorrect: false }).record;
      record = recordQuestionAttempt({ record, isCorrect: true }).record;
    }
    grades[index] = record;
  }));
  return {
    student: { id: studentId, gradesByAssignment: { [assignmentId]: grades } },
    assignments: [{ id: assignmentId, title: 'Lesson', questions }],
  };
};

import { buildWorkloadReceipt } from '../../../functions/shared/workloadReceipt.mjs';
import { studentRequiredQuestions } from '../../assignmentLifecycle.js';

export const workloadReceiptForStudent = ({ student, assignment, hasPracticePass = false, nowValue } = {}) => {
  const tracker = student?.gradesByAssignment?.[assignment?.id] || null;
  const projected = studentRequiredQuestions({ assignment, profile: student?.profile, tracker, hasPracticePass, nowValue });
  return buildWorkloadReceipt({ assignment, profile: student?.profile, tracker, baseIndices: projected.baseIndices, practiceWaived: projected.practiceWaived, nowValue });
};

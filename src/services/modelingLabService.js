import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { EXECUTION_MODES, getExecutionMode } from '../config/executionMode.js';
import { generateRuntimeUUID } from '../utils/idUtils.js';

const submitLabCallable = httpsCallable(functions, 'submitModelingLab');

const countWords = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

const mockEvaluation = ({ labDefinition, studentHypothesis, trialHistory, studentJustification }) => {
  const rubric = labDefinition?.rubric || {};
  const processScore = Math.min(1, (trialHistory?.length || 0) / Math.max(1, Number(rubric.minimumTrials) || 3));
  const hypothesisScore = Math.min(1, countWords(studentHypothesis) / Math.max(1, Number(rubric.minimumHypothesisWords) || 8));
  const justificationScore = Math.min(1, countWords(studentJustification) / Math.max(1, Number(rubric.minimumJustificationWords) || 30));
  const compositeScore = Math.round((0.5 * processScore + 0.2 * hypothesisScore + 0.3 * justificationScore) * 100) / 100;
  return {
    compositeScore,
    isMastered: compositeScore >= Number(rubric.masteryThreshold || 0.85),
    rubricBreakdown: {
      modelAccuracy: Math.round(processScore * 100),
      hypothesisCompleteness: Math.round(hypothesisScore * 100),
      writtenJustificationCompleteness: Math.round(justificationScore * 100),
    },
    constraintViolations: [],
    trialCount: trialHistory?.length || 0,
    provisional: true,
    feedback: 'Local sandbox evaluation only. Production modeling labs are graded by the server.',
  };
};

export const submitModelingLab = async ({ assignmentId, labDefinition, submission, submissionId = null, executionScope = 'student' }) => {
  const activeSubmissionId = submissionId || `labsub_${generateRuntimeUUID()}`;
  if (executionScope === 'teacherPreview' || getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    return { success: true, submissionId: activeSubmissionId, evaluation: mockEvaluation({ labDefinition, ...submission }), preview: true };
  }
  if (!assignmentId || !labDefinition?.labId) throw new Error('Production modeling labs require assignmentId and labId.');
  const response = await submitLabCallable({
    assignmentId,
    labId: labDefinition.labId,
    submissionId: activeSubmissionId,
    submission,
  });
  return response.data;
};


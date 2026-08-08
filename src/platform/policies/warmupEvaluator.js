const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const evaluateWarmupSubmission = (questionResponses = []) => {
  const responses = Array.isArray(questionResponses) ? questionResponses : [];
  const totalQuestions = responses.length;
  let attemptedCount = 0;
  let correctCount = 0;

  responses.forEach((response) => {
    if (response?.hasAttempted === true) {
      attemptedCount += 1;
      if (response?.isCorrect === true) correctCount += 1;
    }
  });

  const completionRatio = totalQuestions > 0 ? attemptedCount / totalQuestions : 0;
  const accuracyRatio = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  let engagementScore = 0;
  if (completionRatio >= 1) engagementScore = 5;
  else if (completionRatio >= 0.8) engagementScore = 4;
  else if (completionRatio >= 0.5) engagementScore = 3;
  else if (completionRatio > 0) engagementScore = 2;

  let diagnosticStatus = 'Secure';
  if (accuracyRatio < 0.4) diagnosticStatus = 'Significant Prerequisite Gap';
  else if (accuracyRatio < 0.7) diagnosticStatus = 'Needs Quick Review';

  return {
    engagementGrade: {
      earned: engagementScore,
      possible: 5,
      percentage: Math.round((engagementScore / 5) * 100),
      isEngagementOnly: true,
    },
    diagnosticData: {
      completionPercentage: Math.round(clamp(completionRatio, 0, 1) * 100),
      accuracyPercentage: Math.round(clamp(accuracyRatio, 0, 1) * 100),
      status: diagnosticStatus,
      attemptedCount,
      correctCount,
      totalQuestions,
    },
  };
};

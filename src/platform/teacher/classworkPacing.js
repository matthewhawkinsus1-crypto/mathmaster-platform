export const MAX_CLASSWORK_PLANNED_SECONDS = 20 * 60;

const numericSeconds = (value) => {
  if (value == null || value === '') return { supplied: false, value: 0, valid: true };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return { supplied: true, value: 0, valid: false };
  return { supplied: true, value: Math.round(number), valid: true };
};

const classworkQuestionsFrom = (assignment = {}) => {
  if (Array.isArray(assignment?.sections)) {
    return assignment.sections
      .filter((section) => String(section?.role || '').toLowerCase() === 'classwork')
      .flatMap((section) => Array.isArray(section?.questions) ? section.questions : []);
  }
  if (Array.isArray(assignment?.questions)) {
    return assignment.questions.filter((question) => (
      String(question?.activityRole || question?.role || '').toLowerCase() === 'classwork'
    ));
  }
  return [];
};

export const analyzeClassworkPlannedTime = (assignment = {}) => {
  const questions = classworkQuestionsFrom(assignment);
  let totalSeconds = 0;
  let hasAuthoredTiming = false;
  const errors = [];
  const questionTimings = questions.map((question, index) => {
    const parsed = numericSeconds(question?.suggestedWorkSeconds);
    hasAuthoredTiming ||= parsed.supplied;
    if (!parsed.valid) {
      errors.push(`Classwork question ${index + 1} suggestedWorkSeconds must be a non-negative number.`);
    }
    if (parsed.valid && parsed.value > MAX_CLASSWORK_PLANNED_SECONDS) {
      errors.push(`Classwork question ${index + 1} schedules ${parsed.value} seconds, which exceeds the 20-minute / 1200-second maximum for one authored Classwork question.`);
    }
    totalSeconds += parsed.valid ? parsed.value : 0;
    return {
      index,
      supplied: parsed.supplied,
      valid: parsed.valid,
      seconds: parsed.value,
    };
  });

  if (totalSeconds > MAX_CLASSWORK_PLANNED_SECONDS) {
    errors.push(`Classwork planned time is ${totalSeconds} seconds, which exceeds the 20-minute / 1200-second lesson budget.`);
  }

  return {
    totalSeconds,
    maxSeconds: MAX_CLASSWORK_PLANNED_SECONDS,
    remainingSeconds: Math.max(0, MAX_CLASSWORK_PLANNED_SECONDS - totalSeconds),
    hasAuthoredTiming,
    questionTimings,
    errors,
    isWithinBudget: errors.length === 0,
  };
};

export const formatPlannedTime = (seconds = 0) => {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

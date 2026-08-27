const clean = (value) => String(value ?? '').trim();

export const questionIndexFromPreflightMessage = (message, questionCount = Infinity) => {
  const match = clean(message).match(/\bQuestion\s+(\d+)\b/i);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= questionCount) return null;
  return index;
};

export const groupQuestionPreflightIssues = (errors = [], questions = []) => {
  const groups = new Map();
  (Array.isArray(errors) ? errors : []).forEach((message) => {
    const questionIndex = questionIndexFromPreflightMessage(message, questions.length);
    if (questionIndex == null) return;
    if (!groups.has(questionIndex)) {
      groups.set(questionIndex, {
        questionIndex,
        questionNumber: questionIndex + 1,
        question: questions[questionIndex] || null,
        errors: [],
      });
    }
    groups.get(questionIndex).errors.push(String(message));
  });
  return [...groups.values()].map((group) => ({
    ...group,
    errors: [...new Set(group.errors)],
  })).sort((a, b) => a.questionIndex - b.questionIndex);
};

export const globalPreflightIssues = (errors = [], questions = []) => (
  (Array.isArray(errors) ? errors : []).filter((message) => (
    questionIndexFromPreflightMessage(message, questions.length) == null
  ))
);

export const replaceQuestionAtFlatIndex = (assignmentV5 = {}, flatIndex, replacement = {}) => {
  if (!Number.isInteger(flatIndex) || flatIndex < 0) throw new Error('A valid question index is required.');
  let cursor = 0;
  let replaced = false;
  const sections = (Array.isArray(assignmentV5.sections) ? assignmentV5.sections : []).map((section) => ({
    ...section,
    questions: (Array.isArray(section?.questions) ? section.questions : []).map((question) => {
      const current = cursor;
      cursor += 1;
      if (current !== flatIndex) return question;
      replaced = true;
      return {
        ...replacement,
        questionId: question?.questionId || replacement?.questionId || null,
        teacherExcluded: question?.teacherExcluded === true,
        activityRole: question?.activityRole || section?.role || replacement?.activityRole,
        sectionId: question?.sectionId || section?.id || replacement?.sectionId,
        sectionTitle: question?.sectionTitle || section?.title || replacement?.sectionTitle,
      };
    }),
  }));
  if (!replaced) throw new Error(`Question ${flatIndex + 1} was not found in the assignment.`);
  return { ...assignmentV5, sections };
};

export const newlyIntroducedPreflightErrors = (before = [], after = []) => {
  const existing = new Set((Array.isArray(before) ? before : []).map(String));
  return [...new Set((Array.isArray(after) ? after : []).map(String).filter((message) => !existing.has(message)))];
};

export default groupQuestionPreflightIssues;

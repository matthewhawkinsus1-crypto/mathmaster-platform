const cleanDisplayText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const comparableText = (value) => cleanDisplayText(value).toLocaleLowerCase();

/**
 * Keep the assignment-level task anchor separate from the workflow cursor.
 * This is pure so question changes, restored stages, and duplicate suppression
 * all use the same rule on desktop and mobile.
 */
export const resolveTaskContextPresentation = ({
  originalTaskPrompt,
  currentStagePrompt,
  composed = false,
} = {}) => {
  const original = cleanDisplayText(originalTaskPrompt) || 'Complete the math task.';
  const stage = composed ? cleanDisplayText(currentStagePrompt) : '';
  return {
    originalTaskPrompt: original,
    currentStagePrompt: stage && comparableText(stage) !== comparableText(original) ? stage : '',
  };
};

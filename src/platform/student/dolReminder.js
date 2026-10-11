/*
 * WHEN THE "DOL IS OPEN — START NOW" REMINDER MAY SHOW.
 *
 * The App repeats a DOL reminder every two minutes until the student submits
 * once. It used to fire while the student was already on that DOL's questions
 * (release-candidate QA m13): the reminder told them to open what they had
 * open. It is not shown while the student is working in that assignment's
 * DOL; anywhere else (Home, another assignment, another section of this one)
 * it is.
 *
 * Pure. App.jsx passes its own view state (activeView, activeAssignmentId,
 * currentQuestionIndex) and the DOL state it already computed.
 */
export const studentIsInThisDol = ({ assignmentId, dolQuestionIndices = [], activeView, activeAssignmentId, currentQuestionIndex } = {}) => {
  if (activeView !== 'assignment' || !assignmentId || String(activeAssignmentId ?? '') !== String(assignmentId)) return false;
  const indices = (Array.isArray(dolQuestionIndices) ? dolQuestionIndices : []).filter((index) => Number.isInteger(index) && index >= 0);
  return indices.includes(Number(currentQuestionIndex));
};

export const shouldShowDolOpenReminder = (args = {}) => !studentIsInThisDol(args);

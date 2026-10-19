/*
 * WHAT THE REGRESSION CALCULATOR SAYS AFTER A SUBMIT (student pass 3, TOOL-5).
 *
 * One sentence, from the shared grader's own parts (first failing stage
 * first), that says what is true and what to change. It said "A correlation
 * value has not been produced." whenever the correlation stage failed —
 * including when r was on screen but came from an earlier table — and
 * "Regression setup is incomplete or invalid." for both "never run" and "run on
 * another table". Each stage's `isComplete` tells those apart.
 *
 * Shown only where the activity shows outcome feedback: the tool's `feedback`
 * is null otherwise (useToolSubmission), and this is read from it.
 */

export const REGRESSION_FEEDBACK = Object.freeze({
  tableIncomplete: 'Your table does not have every data point yet. Make a table (+, then table) with each point in its own row: x in x₁, y in y₁.',
  tableWrong: 'Your table does not match the data. Check each row against the data (x in x₁, y in y₁) and remove any extra row.',
  runMissing: 'Your table matches the data, but no regression has been run on it yet. Press Add Regression beside the table, or ↵ on the regression row.',
  runStale: 'Your table matches the data, but the regression was run on a different table. Press ↵ on the regression row to run it on this one.',
  rMissing: 'The regression ran, but it shows no r value. Press ↵ on the regression row to run it again.',
  rStale: 'An r value is shown, but it is not the regression of the table you have now. Press ↵ on the regression row to run it again.',
  interpretationIncomplete: 'Choose both a direction and a strength for the correlation.',
  interpretationWrong: 'The regression is right, but the direction or strength does not match r. The sign of r gives the direction; its size gives the strength.',
  complete: 'Regression complete.',
});

/** The sentence for these graded parts, or '' when there are none. */
export const regressionFeedbackText = (parts) => {
  const list = Array.isArray(parts) ? parts.filter((part) => part && typeof part === 'object') : [];
  if (!list.length) return '';
  const byId = (id) => list.find((part) => part.id === id) || null;
  // The table stage is the first part ('data-entry' or 'graph-to-table').
  const table = list[0];
  if (table.isCorrect !== true) return table.isComplete === false ? REGRESSION_FEEDBACK.tableIncomplete : REGRESSION_FEEDBACK.tableWrong;
  const run = byId('linear-regression');
  if (run?.isCorrect !== true) return run?.isComplete === true ? REGRESSION_FEEDBACK.runStale : REGRESSION_FEEDBACK.runMissing;
  const correlation = byId('correlation-produced');
  if (correlation?.isCorrect !== true) return correlation?.isComplete === true ? REGRESSION_FEEDBACK.rStale : REGRESSION_FEEDBACK.rMissing;
  // Not a part at all when the question does not ask for an interpretation.
  const interpretation = byId('interpretation');
  if (interpretation && interpretation.isCorrect !== true) {
    return interpretation.isComplete === true ? REGRESSION_FEEDBACK.interpretationWrong : REGRESSION_FEEDBACK.interpretationIncomplete;
  }
  return REGRESSION_FEEDBACK.complete;
};

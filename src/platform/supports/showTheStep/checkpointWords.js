/*
 * SHOW THE STEP: THE WORDS (SP-4). What a step asks, what is off, and what the
 * student did, as sentences. None of them states a part's answer, or the value
 * a wrong entry should have had: a student is told what to look at again.
 * Import-free; the facts come from checkpointEngine.js. (A teacher's name for
 * a step's row is the server's: functions/shared/showTheStepFields.mjs.)
 */
const KIND = Object.freeze({ PICK_POINTS: 'pickPoints', STEP_MOVES: 'stepMoves', FACTOR_PAIR: 'factorPair', TABLE_ROW: 'tableRow' });

const plural = (count, one, many) => (count === 1 ? one : many);
const pointText = ([x, y]) => `(${x}, ${y})`;
const listed = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** What the step asks of the student, before anything is done. */
export const stepInstruction = (source) => {
  if (!source?.ok) return '';
  if (source.kind === KIND.PICK_POINTS) {
    const graph = source.relation.straight ? 'line' : 'graph';
    const named = source.relation.through ? `through ${source.of}` : source.of;
    const riseRun = source.relation.kind === 'function' && source.relation.straight && source.count === 2
      ? ' Then count the rise and the run from your first point to your second.' : '';
    return `Pick ${source.count} ${plural(source.count, 'point', 'points')} on the ${graph} ${named}. Choose ${plural(source.count, 'a point', 'points')} where the ${graph} crosses the grid lines.${riseRun}`;
  }
  if (source.kind === KIND.STEP_MOVES) return `Solve ${source.of} one move at a time. Your moves are saved with your answer.`;
  if (source.kind === KIND.FACTOR_PAIR) return 'Enter the pair of numbers you will use to factor this trinomial.';
  if (source.kind === KIND.TABLE_ROW) {
    return `Fill in ${source.count} ${plural(source.count, 'row', 'rows')} of the table for this rule. Choose ${plural(source.count, 'a value', 'a different value each time')} for ${source.rule.input}.`;
  }
  return '';
};

/** What is off, for a finished step the engine does not accept. */
export const stepProblemText = (source, check) => {
  const problem = check?.problem;
  if (!problem) return '';
  if (problem.kind === 'offGraph') {
    const points = (problem.points || []).map(pointText);
    return `${listed(points)} ${plural(points.length, 'is', 'are')} not on the ${source.relation?.straight ? 'line' : 'graph'}. Pick ${plural(points.length, 'a point', 'points')} the ${source.relation?.straight ? 'line' : 'graph'} passes through.`;
  }
  if (problem.kind === 'riseRun') {
    const [from, to] = check.facts.points;
    return `Your rise and run do not match your points. Count again from ${pointText(from)} to ${pointText(to)}: how far up or down, then how far across.`;
  }
  if (problem.kind === 'pair') {
    const [first, second] = check.facts.pair;
    return `Your pair multiplies to ${first * second} and adds to ${first + second}. Compare both with the trinomial and choose again.`;
  }
  if (problem.kind === 'rows') {
    return `${plural(problem.rows.length, 'A row does', 'Some rows do')} not fit the rule. Put each ${source.rule?.input || 'input'} into the rule again.`;
  }
  if (problem.kind === 'repeatedInput') return `Use a different value of ${source.rule?.input || 'the input'} in each row.`;
  if (problem.kind === 'lineDoesNotFollow') return 'One of your lines does not follow from the line before it.';
  if (problem.kind === 'otherEquation') return 'These moves start from a different equation.';
  if (problem.kind === 'notTheSolution') return 'The last line is not a solution of the equation.';
  return 'This step is not right yet.';
};

/** What the student did, once the engine accepts it. */
export const stepSummary = (source, check) => {
  if (!source?.ok) return '';
  const facts = check?.facts || {};
  if (source.kind === KIND.PICK_POINTS) {
    const points = listed((facts.points || []).map(pointText));
    return facts.asksRiseRun
      ? `Your points ${points} are on the line, and your rise and run match them.`
      : `Your points ${points} are on the ${source.relation.straight ? 'line' : 'graph'}.`;
  }
  if (source.kind === KIND.STEP_MOVES) return `Your ${facts.moves} ${plural(facts.moves, 'move solves', 'moves solve')} the equation.`;
  if (source.kind === KIND.FACTOR_PAIR) return 'Your pair fits the trinomial.';
  if (source.kind === KIND.TABLE_ROW) return `Your ${plural(source.count, 'row fits', 'rows fit')} the rule.`;
  return '';
};

/** The engine's reading of a recorded step, for a teacher. */
export const stepVerdictText = (source, check) => {
  if (!source?.ok) return 'This step could not be read.';
  if (check?.skipped) return 'Skipped: the student chose to answer without this step, after it was refused twice.';
  if (!check?.done) return 'Not finished.';
  if (check.ok) return `Checked: ${stepSummary(source, check)}`;
  return `Not accepted: ${stepProblemText(source, check)}`;
};

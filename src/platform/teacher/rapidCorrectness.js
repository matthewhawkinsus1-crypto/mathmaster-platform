// The live rapid-correct summary a student's device sends with its Live
// Classroom status (App's live status writer).
//
// Its own module because a student's device runs only this; importing it from
// ./studentSupportSignals.js put every teacher signal there in each student's
// first load (scripts/check-first-load-budget.mjs). studentSupportSignals.js
// re-exports it unchanged.

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isIndependentRecord = (record = {}) => (
  record?.supportUsage?.isMathematicallyIndependent !== false
  && record?.supportUsage?.teacherAssisted !== true
  && record?.supportUsage?.hintUsed !== true
  && record?.supportUsage?.scaffoldUsed !== true
  && record?.supportUsage?.workedExampleUsed !== true
  && record?.supportUsage?.remediationUsed !== true
);

const questionDemand = (question = {}) => {
  const dok = Math.max(1, num(question.dok ?? question.cognitiveDemand?.dok, 1));
  const difficulty = Math.max(1, num(
    question.difficultyBand
      ?? question.difficulty
      ?? question.cognitiveDemand?.difficultyBand,
    1,
  ));
  const type = clean(question.type || question.toolId).toLowerCase();
  const constructed = [
    'functiongraph', 'modelinglab', 'relationshipmodel', 'equationinput',
    'stepalgebra2', 'systemsworkspace', 'sequenceexplorer', 'transformationslab',
  ].some((token) => type.includes(token));
  return { dok, difficulty, constructed };
};

/**
 * "Fast" is contextual, not one magic number. A DOK-1 recognition item and a
 * multi-step graphing/modeling task should never share the same threshold.
 *
 * These thresholds are deliberately conservative because they are only one
 * ingredient in an Integrity Review signal; speed alone never produces one.
 */
export const rapidCorrectThresholdSeconds = (question = {}) => {
  const { dok, difficulty, constructed } = questionDemand(question);
  if (constructed || dok >= 3 || difficulty >= 4) return 12;
  if (dok >= 2 || difficulty >= 3) return 8;
  return 5;
};

/**
 * Compact live response-timing summary. No response text, answer key, or raw
 * keystroke history leaves the student device.
 */
export const summarizeRapidCorrectness = ({
  questions = [],
  tracker = {},
  includedIndices = null,
} = {}) => {
  const indices = Array.isArray(includedIndices)
    ? includedIndices
    : list(questions).map((unused, index) => index);

  let answered = 0;
  let correct = 0;
  let rapidCorrect = 0;
  let rapidDeepCorrect = 0;
  let timedIndependentCorrect = 0;

  indices.forEach((index) => {
    const record = tracker?.[index] || {};
    const status = clean(record.status);
    if (!['correct', 'expired', 'incorrect'].includes(status)) return;
    answered += 1;
    if (status !== 'correct') return;
    correct += 1;

    const seconds = num(record.timeSpent, 0);
    if (seconds <= 0 || !isIndependentRecord(record)) return;
    timedIndependentCorrect += 1;

    const question = questions[index] || {};
    const threshold = rapidCorrectThresholdSeconds(question);
    if (seconds > threshold) return;

    rapidCorrect += 1;
    const demand = questionDemand(question);
    if (demand.dok >= 2 || demand.difficulty >= 3 || demand.constructed) {
      rapidDeepCorrect += 1;
    }
  });

  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    timedIndependentCorrect,
    rapidCorrect,
    rapidDeepCorrect,
    rapidShare: timedIndependentCorrect
      ? rapidCorrect / timedIndependentCorrect
      : 0,
  };
};

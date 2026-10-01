/*
 * A CORRECT RELATION PLOT IS MARKED CORRECT.
 *
 * relationRepresentations keys its `plot` stage `{ pairs }`, the same key as the
 * mapping diagram. But a plot does not answer with a list of pairs: the
 * coordinate-plot stage answers with the graph workspace's artifact, and
 * `gradePairs` ran `list()` over that object, got [], and marked every plot
 * wrong — credit 0, "The arrows do not match the relation…" — however it was
 * drawn. A relation question that asked for a plot could never be full credit.
 *
 * The grader now marks a graph artifact by the points it holds (its saved
 * placements, else its point parts, else its own verdict), compared with the
 * relation as a set. The recipe still keys the plot with the relation's pairs:
 * the grader can know them, so it should use them, rather than trusting the
 * plotting surface's own point-by-point verdict (which ties P1 to the first
 * pair and so marks a correctly plotted non-function wrong).
 *
 * Re-marking a stored record (liveQuestionCorrection) can only raise it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPE_NAMES, expandRecipe, getRecipe } from '../../src/platform/workflow/questionRecipes.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import {
  PLOTTED_POINT_TOLERANCE,
  gradePlottedPairs,
  gradeStage,
  gradeWorkflow,
  graphArtifactPoints,
  summarizeWorkflowParts,
} from '../../src/platform/workflow/workflowGrading.js';
import { repairQuestionRecordForGranularWorkflowCredit } from '../../src/platform/assignment/liveQuestionCorrection.js';

const PAIRS = [[-2, 3], [1, 2], [3, -1], [-4, -3]];
const RELATION = {
  questionId: 'relation-plot',
  type: 'relationMapping',
  prompt: 'Represent this relation.',
  pairs: PAIRS,
  recipe: { name: 'relationRepresentations', ask: ['plot', 'domain', 'range', 'isFunction'] },
};
const CORRECT_REST = { domain: '{-4, -2, 1, 3}', range: '{-3, -1, 2, 3}', isFunction: 'Yes' };

// Exactly what WorkflowRunner's graphArtifact() keeps of what the plotting
// surface (InteractiveGraphWorkspace) reports: one point task per pair, in the
// pairs' order, x locked; each part judged against ITS OWN task's pair.
const plotArtifact = (placed, { key = PAIRS, isComplete = true, responseKey = true, parts = true } = {}) => {
  const placements = Object.fromEntries(placed.map((point, index) => [`point-${index + 1}`, point]));
  const taskCorrect = placed.map((point, index) => Boolean(key[index]) && Math.hypot(point[0] - key[index][0], point[1] - key[index][1]) <= 0.22);
  return {
    __mathmasterWorkflowArtifact: 'graph',
    isComplete,
    isCorrect: isComplete && taskCorrect.every(Boolean),
    responseKey: responseKey ? JSON.stringify({
      construction: { placements, chosenXValues: {}, pointsValidated: true, strokes: [], snapped: false, markerPlacements: {} },
      analysis: { selections: {}, answers: {}, typedPoints: {}, noneSelections: {}, inversePointsValidated: false, inverseStrokes: [], inverseSnapped: false },
    }) : '',
    parts: parts ? placed.map((point, index) => ({
      id: `point-${index + 1}`,
      label: `Point placement: P${index + 1}`,
      isComplete,
      isCorrect: isComplete && taskCorrect[index],
      response: `(${point[0]}, ${point[1]})`,
    })) : [],
  };
};

const composed = (question = RELATION) => readComposedQuestion(question);
const markQuestion = (plot, question = RELATION, rest = CORRECT_REST) => {
  const { workflow, grading } = composed(question);
  return gradeWorkflow({ stages: workflow, responses: { plot, ...rest }, grading });
};
const markPlot = (plot, question = RELATION) => markQuestion(plot, question).parts.find((part) => part.id === 'plot');

// ---------------------------------------------------------------- the defect
test('the recipe keys the plot with the relation\'s pairs, and the plot stage answers with a graph artifact', () => {
  const { workflow, grading } = composed();
  assert.equal(workflow.find((stage) => stage.id === 'plot').kind, 'coordinatePlot');
  assert.deepEqual(grading.plot, { pairs: PAIRS });
  assert.deepEqual(expandRecipe(RELATION).grading.plot, { pairs: PAIRS });
});

test('a complete, correct relation plot is marked correct — and the whole question can reach full credit', () => {
  const plot = markPlot(plotArtifact(PAIRS));
  assert.equal(plot.isCorrect, true, plot.detail);
  assert.equal(plot.credit, 1);
  assert.doesNotMatch(plot.detail, /arrow/i, 'a plot is not described as a mapping diagram');
  const whole = markQuestion(plotArtifact(PAIRS));
  assert.equal(whole.isCorrect, true);
  assert.equal(whole.partialCreditPercent, 100);
});

test('a plot with one pair misplaced earns partial credit and a plot-specific message', () => {
  const plot = markPlot(plotArtifact([[-2, 3], [1, 3], [3, -1], [-4, -3]]));
  assert.equal(plot.isCorrect, false);
  assert.equal(plot.credit, 3 / 4);
  assert.match(plot.detail, /3 of 4 ordered pairs are plotted/);
  assert.doesNotMatch(plot.detail, /arrow/i);
  assert.equal(markQuestion(plotArtifact([[-2, 3], [1, 3], [3, -1], [-4, -3]])).isCorrect, false);
});

test('a relation is a set: a non-function plotted with its two same-x points the other way round is correct', () => {
  const key = [[1, 2], [1, 5], [3, 4]];
  const question = { ...RELATION, pairs: key };
  // P1 and P2 are both locked to x = 1; the student gives P1 the 5 and P2 the 2.
  const swapped = plotArtifact([[1, 5], [1, 2], [3, 4]], { key });
  assert.equal(swapped.isCorrect, false, 'the plotting surface\'s own per-task verdict calls this wrong');
  const plot = markQuestion(swapped, question, { domain: '{1, 3}', range: '{2, 4, 5}', isFunction: 'No' }).parts.find((part) => part.id === 'plot');
  assert.equal(plot.isCorrect, true, 'the same set of ordered pairs is the same relation');
  assert.equal(plot.credit, 1);
});

test('one point cannot stand for two pairs, and a point outside the relation costs credit', () => {
  const twice = markPlot(plotArtifact([[-2, 3], [-2, 3], [3, -1], [-4, -3]]));
  assert.equal(twice.isCorrect, false);
  assert.equal(twice.credit, 3 / 4);
  const stray = gradePlottedPairs(plotArtifact([[-2, 3], [1, 2], [3, -1], [-4, -3], [5, 5]]), { pairs: PAIRS });
  assert.equal(stray.isCorrect, false);
  assert.equal(stray.credit, 4 / 5);
  assert.match(stray.detail, /1 point that is not in the relation/);
  // A pair listed twice in the key is one pair.
  assert.equal(gradePlottedPairs(plotArtifact([[1, 2], [1, 2]]), { pairs: [[1, 2], [1, 2]] }).isCorrect, true);
  // Pairs closer together than the tolerance: (0, 0.1) is the nearest point to
  // BOTH, so once it has been claimed the second pair must take (0, 0.4).
  const close = { pairs: [[0, 0], [0, 0.2]] };
  assert.equal(gradePlottedPairs(plotArtifact([[0, 0.1], [0, 0.4]]), close).isCorrect, true, 'a one-to-one matching is found');
  assert.equal(gradePlottedPairs(plotArtifact([[0, 0.1]]), close).isCorrect, false, 'one point is not two pairs');
});

test('the marks add up by one rule, shared by gradeWorkflow and by re-marking a stored record', () => {
  const part = (overrides) => ({ graded: true, isComplete: true, isCorrect: true, credit: 1, weight: 1, ...overrides });
  assert.deepEqual(summarizeWorkflowParts([part(), part()]), { isComplete: true, isCorrect: true, partialCreditPercent: 100, gradedCount: 2 });
  // Partial work never impersonates a complete correct task: capped at 90.
  const nearly = summarizeWorkflowParts([...Array.from({ length: 19 }, () => part()), part({ isCorrect: false, credit: 0 })]);
  assert.equal(nearly.isCorrect, false);
  assert.equal(nearly.partialCreditPercent, 90);
  assert.equal(summarizeWorkflowParts([part({ isCorrect: false, credit: 0.5 }), part()]).partialCreditPercent, 75);
  assert.equal(summarizeWorkflowParts([part({ weight: 3, isCorrect: false, credit: 0 }), part()]).partialCreditPercent, 25, 'weights count');
  // An ungraded part neither earns nor costs credit, but an unfinished one blocks "correct".
  assert.deepEqual(summarizeWorkflowParts([part(), part({ graded: false, isCorrect: false, credit: 0 })]).partialCreditPercent, 100);
  assert.equal(summarizeWorkflowParts([part(), part({ graded: false, isComplete: false, isCorrect: false, credit: 0 })]).isCorrect, false);
  assert.equal(summarizeWorkflowParts([]).partialCreditPercent, null);
  // gradeWorkflow reports exactly this summary.
  const graded = markQuestion(plotArtifact([[-2, 3], [1, 3], [3, -1], [-4, -3]]));
  const { isComplete, isCorrect, partialCreditPercent, gradedCount } = graded;
  assert.deepEqual({ isComplete, isCorrect, partialCreditPercent, gradedCount }, summarizeWorkflowParts(graded.parts));
});

test('a placement counts at the plotting surface\'s own floor tolerance, and an author may tighten it', () => {
  assert.equal(PLOTTED_POINT_TOLERANCE, 0.22);
  const key = { pairs: [[0.3, 1.5]] };
  assert.equal(gradePlottedPairs(plotArtifact([[0.1 * 3, 1.5]]), key).isCorrect, true, 'float noise from snapping is the same point');
  assert.equal(gradePlottedPairs(plotArtifact([[0.3, 1.7]]), key).isCorrect, true, 'within 0.22 the surface itself accepts it');
  assert.equal(gradePlottedPairs(plotArtifact([[0.3, 1.75]]), key).isCorrect, false, 'one quarter-step away is a different point');
  assert.equal(gradePlottedPairs(plotArtifact([[0.3, 1.7]]), { ...key, tolerance: 0.05 }).isCorrect, false);
});

test('the points come from the saved placements, else the point parts; with neither, the workspace\'s own verdict', () => {
  const placed = [[-2, 3], [1, 2]];
  assert.deepEqual(graphArtifactPoints(plotArtifact(placed)), placed);
  assert.deepEqual(graphArtifactPoints(plotArtifact(placed, { responseKey: false })), placed, 'parts when the placements cannot be read');
  assert.deepEqual(graphArtifactPoints({ ...plotArtifact(placed), responseKey: '{not json' }), placed);
  assert.deepEqual(graphArtifactPoints([[1, 2]]), [], 'a list is not a graph artifact');

  const verdictOnly = (isCorrect) => ({ __mathmasterWorkflowArtifact: 'graph', isComplete: true, isCorrect, responseKey: '', parts: [] });
  assert.deepEqual(
    [gradePlottedPairs(verdictOnly(true), { pairs: PAIRS }).isCorrect, gradePlottedPairs(verdictOnly(true), { pairs: PAIRS }).credit],
    [true, 1],
  );
  assert.deepEqual(
    [gradePlottedPairs(verdictOnly(false), { pairs: PAIRS }).isCorrect, gradePlottedPairs(verdictOnly(false), { pairs: PAIRS }).credit],
    [false, 0],
  );
});

test('an unfinished plot is still unanswered, and a list of pairs is still marked as arrows', () => {
  const unfinished = markPlot(plotArtifact([[-2, 3]], { isComplete: false }));
  assert.equal(unfinished.isComplete, false);
  assert.equal(unfinished.detail, 'Not answered.');
  // A list answering the same key goes through the mapping-diagram rule, unchanged.
  const stage = composed().workflow.find((entry) => entry.id === 'plot');
  const asList = gradeStage({ stage, rule: { pairs: PAIRS }, responses: { plot: [[1, 2], [-2, 3], [-4, -3], [3, -1]] } });
  assert.equal(asList.isCorrect, true);
  assert.match(gradeStage({ stage, rule: { pairs: PAIRS }, responses: { plot: [[1, 2]] } }).detail, /arrows/);
});

// --------------------------------------------- every rule a graph artifact meets
const RECIPE_QUESTIONS = {
  functionModeling: {
    type: 'relationshipModel',
    prompt: 'Model the situation.',
    scenario: 'A shower head releases 1.8 gallons per minute.',
    quantities: [{ id: 'time', label: 'Minutes' }, { id: 'volume', label: 'Gallons' }],
    correctIndependentId: 'time',
    correctDependentId: 'volume',
    correctEquation: 'f(x)=1.8x',
    continuity: 'continuous',
    tableXValues: [0, 1, 2],
  },
  relationRepresentations: { type: 'relationMapping', prompt: 'Represent this relation.', pairs: PAIRS },
  functionCharacteristics: {
    type: 'graphAnalysis',
    prompt: 'Analyze the function.',
    pairs: [[-1, 1], [0, 0], [1, 1], [2, 4]],
    functionFamily: 'Quadratic',
  },
};

test('no recipe can mark a correct plot or graph wrong: every graph-artifact stage is graded by what the artifact holds', () => {
  assert.deepEqual(Object.keys(RECIPE_QUESTIONS).sort(), [...RECIPE_NAMES].sort(), 'every recipe is covered');
  let graphStages = 0;
  RECIPE_NAMES.forEach((name) => {
    const question = { ...RECIPE_QUESTIONS[name], recipe: { name, ask: Object.keys(getRecipe(name).stages) } };
    const { workflow, grading } = readComposedQuestion(question);
    workflow
      .filter((stage) => ['coordinatePlot', 'functionGraph'].includes(stage.kind) && grading?.[stage.id] != null)
      .forEach((stage) => {
        graphStages += 1;
        const pairs = Array.isArray(stage.pairs) && stage.pairs.length ? stage.pairs : [[0, 0], [1, 1.8]];
        const right = gradeStage({ stage, rule: grading[stage.id], responses: { [stage.id]: plotArtifact(pairs, { key: pairs }) }, stages: workflow });
        assert.equal(right.isCorrect, true, `${name}/${stage.id} (${JSON.stringify(grading[stage.id])}): ${right.detail}`);
        assert.equal(right.credit, 1);
        const misplaced = pairs.map((pair, index) => (index === 0 ? [pair[0], pair[1] + 3] : pair));
        const wrong = gradeStage({ stage, rule: grading[stage.id], responses: { [stage.id]: plotArtifact(misplaced, { key: pairs }) }, stages: workflow });
        assert.equal(wrong.isCorrect, false, `${name}/${stage.id}: a misplaced point is not marked correct`);
      });
  });
  assert.equal(graphStages, 3, 'functionModeling graph, relationRepresentations plot, functionCharacteristics plot');
});

// ---------------------------------------------------------------- stored records
const storedRecord = (plot, overrides = {}) => {
  const graded = markQuestion(plotArtifact(PAIRS));
  // What the record held when the plot was always marked wrong.
  const partGrades = graded.parts.map((part) => (part.id === 'plot'
    ? { ...part, isCorrect: false, credit: 0, response: 'plotted' }
    : { ...part, response: String(part.id) }));
  return {
    status: 'expired',
    attemptCount: 1,
    totalAttempts: 1,
    partialCredit: 75,
    bestPartialCredit: 75,
    lastResponseKey: JSON.stringify({ plot, ...CORRECT_REST }),
    partGrades,
    ...overrides,
  };
};

test('re-marking a stored DOL record whose correct plot was marked wrong raises it to full credit', () => {
  const before = storedRecord(plotArtifact(PAIRS));
  const after = repairQuestionRecordForGranularWorkflowCredit({ record: before, question: RELATION, correctedAt: '2026-10-01T00:00:00.000Z' });
  assert.equal(after.status, 'correct');
  assert.equal(after.partialCredit, 100);
  assert.equal(after.bestPartialCredit, 100);
  assert.equal(after.totalAttempts, before.totalAttempts, 'attempt history is preserved');
  assert.equal(after.partGrades.find((part) => part.id === 'plot').isCorrect, true);
  assert.equal(after.partialCreditRegradeHistory.at(-1).previousBestPartialCredit, 75);
});

test('re-marking never lowers a record: a better stored grade is left exactly as it was', () => {
  const wrongPlot = plotArtifact([[-2, 3], [1, 3], [3, -1], [-4, -3]]);
  const better = storedRecord(wrongPlot, { partialCredit: 90, bestPartialCredit: 90 });
  assert.equal(repairQuestionRecordForGranularWorkflowCredit({ record: better, question: RELATION }), better);
  const correct = storedRecord(plotArtifact(PAIRS), { status: 'correct', partialCredit: 100, bestPartialCredit: 100 });
  assert.equal(repairQuestionRecordForGranularWorkflowCredit({ record: correct, question: RELATION }), correct);
});

test('re-marking keeps every part the stored record credits, even where today\'s grader would not', () => {
  // The domain was credited by a live correction; the stored response for it is
  // one today's grader marks wrong. The plot was marked wrong by the old bug.
  const record = storedRecord(plotArtifact(PAIRS), {
    lastResponseKey: JSON.stringify({ plot: plotArtifact(PAIRS), ...CORRECT_REST, domain: '{-4, -2, 1}' }),
  });
  record.partGrades = record.partGrades.map((part) => (part.id === 'domain'
    ? { ...part, isCorrect: true, credit: 1, liveCorrectionCredit: true }
    : part));
  const after = repairQuestionRecordForGranularWorkflowCredit({ record, question: RELATION });
  const domain = after.partGrades.find((part) => part.id === 'domain');
  assert.equal(domain.isCorrect, true, 'a credited part is never turned back to wrong');
  assert.equal(domain.credit, 1);
  assert.equal(after.partGrades.find((part) => part.id === 'plot').isCorrect, true);
  assert.equal(after.status, 'correct', 'every part is now credited, so the question is');
  assert.equal(after.bestPartialCredit, 100);
});

test('re-marking is monotonic for every stored record: no credit, status or credited part is ever lost', () => {
  const plots = [
    plotArtifact(PAIRS),
    plotArtifact([[-2, 3], [1, 3], [3, -1], [-4, -3]]),
    plotArtifact([[0, 0], [1, 1], [2, 2], [3, 3]]),
    plotArtifact([[-2, 3]], { isComplete: false }),
  ];
  const rests = [CORRECT_REST, { ...CORRECT_REST, range: '{2, 3}' }, { domain: '', range: '', isFunction: 'No' }];
  const statuses = ['attempted', 'expired', 'correct'];
  let checked = 0;
  plots.forEach((plot) => rests.forEach((rest) => statuses.forEach((status) => [0, 40, 75, 90].forEach((best) => {
    const graded = markQuestion(plot, RELATION, rest);
    const partGrades = graded.parts.map((part, index) => ({
      ...part,
      // Some stored parts credited beyond what today's grader gives.
      ...(index % 2 === 1 ? { isCorrect: true, credit: 1, isComplete: true } : {}),
    }));
    const record = {
      status, attemptCount: 1, totalAttempts: 1,
      partialCredit: status === 'correct' ? 100 : best,
      bestPartialCredit: status === 'correct' ? 100 : best,
      lastResponseKey: JSON.stringify({ plot, ...rest }),
      partGrades,
    };
    const after = repairQuestionRecordForGranularWorkflowCredit({ record, question: RELATION });
    checked += 1;
    assert.ok(after.partialCredit >= record.partialCredit);
    assert.ok(after.bestPartialCredit >= record.bestPartialCredit);
    // The only status change re-marking may make is to "correct".
    assert.ok(after.status === record.status || after.status === 'correct', `${record.status} -> ${after.status}`);
    assert.equal(after.totalAttempts, record.totalAttempts);
    assert.equal(after.attemptCount, record.attemptCount);
    if (after !== record) {
      record.partGrades.forEach((stored) => {
        const now = after.partGrades.find((part) => part.id === stored.id);
        if (stored.isCorrect) assert.equal(now?.isCorrect, true, `${stored.id} stays credited`);
        assert.ok((now?.credit ?? 0) >= (Number(stored.credit) || 0), `${stored.id} keeps its credit`);
      });
    }
  }))));
  assert.equal(checked, 4 * 3 * 3 * 4);
});

import { normalizeQuestionWeight, suggestedQuestionWeight } from './questionWeights.js';

const clean = (value) => String(value ?? '').trim();
const clone = (value) => JSON.parse(JSON.stringify(value));

const stripFence = (text) => {
  const trimmed = clean(text);
  const fenced = trimmed.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const hashText = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const reviewIdentityQuestion = (question = {}, index = 0) => {
  const content = clone(question || {});
  delete content.questionWeight;
  return { index, content };
};

export const assignmentWeightReviewFingerprint = ({
  assignment = {},
  questions = [],
} = {}) => {
  const identity = {
    assignmentId: clean(assignment.id || assignment.assignment?.id),
    title: clean(assignment.title || assignment.assignment?.title),
    courseId: clean(assignment.courseId || assignment.assignment?.courseId),
    questions: (Array.isArray(questions) ? questions : []).map(reviewIdentityQuestion),
  };
  return `wgt-${hashText(JSON.stringify(identity))}`;
};

const compactQuestionForReview = (question = {}, index = 0) => ({
  questionNumber: index + 1,
  questionId: clean(question.questionId),
  section: {
    id: clean(question.sectionId),
    title: clean(question.sectionTitle),
    role: clean(question.activityRole),
  },
  type: clean(question.type),
  prompt: clean(question.prompt),
  scenario: clean(question.scenario),
  currentWeight: normalizeQuestionWeight(question),
  MathMasterWorkloadSuggestion: suggestedQuestionWeight(question),
  dok: Number(question?.complexity?.level ?? question?.dok) || null,
  difficultyBand: Number(question?.difficulty?.generatorBand ?? question?.difficultyBand) || null,
  workflow: Array.isArray(question.workflow)
    ? question.workflow.map((stage) => ({
        id: clean(stage?.id),
        kind: clean(stage?.kind),
        prompt: clean(stage?.prompt),
        scoreWeight: Number(stage?.scoreWeight) || null,
      }))
    : [],
  answerFields: Array.isArray(question.answerFields)
    ? question.answerFields.map((field) => ({
        id: clean(field?.id),
        label: clean(field?.label),
        type: clean(field?.type || field?.inputProfile),
        scoreWeight: Number(field?.scoreWeight) || null,
      }))
    : [],
  studentActions: Array.isArray(question.studentActions)
    ? question.studentActions.map((item) => clean(item)).filter(Boolean)
    : [],
  workloadSignals: {
    workflowStages: Array.isArray(question.workflow) ? question.workflow.length : 0,
    answerFields: Array.isArray(question.answerFields) ? question.answerFields.length : 0,
    recipeRequests: Array.isArray(question?.recipe?.ask)
      ? question.recipe.ask.length
      : (Array.isArray(question?.ask) ? question.ask.length : 0),
    tableRows: Array.isArray(question?.table?.rows)
      ? question.table.rows.length
      : (Array.isArray(question?.rows) ? question.rows.length : 0),
    tableColumns: Array.isArray(question?.table?.columns)
      ? question.table.columns.length
      : (Array.isArray(question?.columns) ? question.columns.length : 0),
    choiceCount: Array.isArray(question?.choices) ? question.choices.length : 0,
    quantityCount: Array.isArray(question?.quantities) ? question.quantities.length : 0,
    hasGraph: Boolean(question?.graph || question?.functionSpec || question?.graphConfig),
  },
});

export const buildAssignmentWeightReviewRequest = ({
  assignment = {},
  questions = [],
} = {}) => {
  const included = (Array.isArray(questions) ? questions : [])
    .filter((question) => question?.teacherExcluded !== true);
  if (!included.length) throw new Error('This assignment has no included questions to review.');
  if (included.some((question) => !clean(question?.questionId))) {
    throw new Error('Every included question needs a stable questionId before AI weight review.');
  }

  const fingerprint = assignmentWeightReviewFingerprint({ assignment, questions });
  const assignmentId = clean(assignment.id || assignment.assignment?.id);
  const title = clean(assignment.title || assignment.assignment?.title) || 'Untitled assignment';
  const courseId = clean(assignment.courseId || assignment.assignment?.courseId) || 'unknown course';

  const expectedShape = {
    kind: 'mathmasterWeightReviewPack',
    version: 1,
    assignmentId,
    assignmentFingerprint: fingerprint,
    weights: included.map((question) => ({
      questionId: question.questionId,
      weight: normalizeQuestionWeight(question),
      reason: 'Brief workload-based explanation.',
    })),
  };

  return [
    '# MathMaster Assignment Weight Review',
    '',
    `Assignment: ${title}`,
    `Course: ${courseId}`,
    `Assignment ID: ${assignmentId || '(none)'}`,
    `Protected fingerprint: ${fingerprint}`,
    '',
    'Review the RELATIVE student workload and mathematical responsibility of every included question.',
    'Your job is to recommend how much each question should contribute to the WHOLE assignment grade.',
    '',
    '## Weighting rules',
    '- A normal single-step question should be weight 1.',
    '- Short or low-burden questions may be 0.5 or 0.75.',
    '- Moderately involved questions may be 1.25, 1.5, or 2.',
    '- Substantial multipart construction/modeling questions may be 2.5, 3, or 4.',
    '- Use increments of 0.25.',
    '- Usual range is 0.5 through 4. Never exceed 8 in an AI recommendation.',
    '- Weight required student work, not prompt length. A verbose one-step question is still about weight 1.',
    '- Consider number of independently graded parts, required representations, equation/table/graph construction, interpretation, and dependency between stages.',
    '- Do not increase a weight merely because DOK or difficulty is high; the question must actually carry more graded work/responsibility.',
    '- Do not change or rewrite any question.',
    '- Do not include student information, grades, attempts, or accommodations.',
    '- Return EVERY included question exactly once. Do not add or omit question IDs.',
    '- Keep assignmentId and assignmentFingerprint EXACTLY as supplied.',
    '',
    '## Required response',
    'Return ONLY one valid JSON object. No markdown fence and no explanation outside the JSON.',
    'Use this exact shape:',
    JSON.stringify(expectedShape, null, 2),
    '',
    '## Questions to review',
    JSON.stringify(included.map((question) => compactQuestionForReview(
      question,
      questions.indexOf(question),
    )), null, 2),
  ].join('\n');
};

export const parseAssignmentWeightReviewPack = (rawText) => {
  let text = stripFence(rawText);
  if (!text) throw new Error('The clipboard is empty. Copy the AI weight-review JSON first.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) {
      throw new Error('MathMaster could not find one Weight Review JSON object in the clipboard.');
    }
    try {
      parsed = JSON.parse(text.slice(first, last + 1));
    } catch (error) {
      throw new Error(`The AI weight review is not valid JSON: ${error.message}`);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The AI weight review must be one JSON object.');
  }
  if (parsed.kind !== 'mathmasterWeightReviewPack' || Number(parsed.version) !== 1) {
    throw new Error('This JSON is not a MathMaster Weight Review Pack version 1.');
  }
  if (!Array.isArray(parsed.weights) || parsed.weights.length === 0) {
    throw new Error('This Weight Review Pack contains no question weights.');
  }
  return parsed;
};

export const prepareAssignmentWeightReviewPack = ({
  pack,
  assignment = {},
  questions = [],
} = {}) => {
  const parsed = typeof pack === 'string' ? parseAssignmentWeightReviewPack(pack) : pack;
  const currentQuestions = Array.isArray(questions) ? questions : [];
  const included = currentQuestions.filter((question) => question?.teacherExcluded !== true);
  const assignmentId = clean(assignment.id || assignment.assignment?.id);
  const currentFingerprint = assignmentWeightReviewFingerprint({ assignment, questions: currentQuestions });

  if (clean(parsed.assignmentId) !== assignmentId) {
    throw new Error('This Weight Review Pack belongs to a different assignment ID.');
  }
  if (clean(parsed.assignmentFingerprint) !== currentFingerprint) {
    throw new Error('This assignment changed after the AI review was prepared. Copy a fresh AI Weight Review request and try again.');
  }

  const currentById = new Map();
  included.forEach((question, index) => {
    const id = clean(question?.questionId);
    if (!id) throw new Error(`Included Question ${index + 1} is missing a stable questionId.`);
    if (currentById.has(id)) throw new Error(`This assignment repeats question ID ${id}; weights were not applied.`);
    currentById.set(id, question);
  });

  const seen = new Set();
  const proposed = new Map();
  parsed.weights.forEach((entry, index) => {
    const id = clean(entry?.questionId);
    if (!id) throw new Error(`Weight entry ${index + 1} is missing questionId.`);
    if (seen.has(id)) throw new Error(`The AI repeated question ID ${id}; the entire Weight Review Pack was rejected.`);
    seen.add(id);
    if (!currentById.has(id)) {
      throw new Error(`The AI returned unknown or excluded question ID ${id}; the entire Weight Review Pack was rejected.`);
    }

    const weight = Number(entry?.weight);
    if (!Number.isFinite(weight) || weight < 0.25 || weight > 8) {
      throw new Error(`Question ${id} has AI weight ${String(entry?.weight)}. Imported AI weights must be between 0.25 and 8.`);
    }
    const quarterSteps = Math.round(weight * 4);
    if (Math.abs(weight - quarterSteps / 4) > 1e-9) {
      throw new Error(`Question ${id} weight must use 0.25 increments.`);
    }

    proposed.set(id, {
      weight,
      reason: clean(entry?.reason).slice(0, 280),
    });
  });

  if (seen.size !== currentById.size) {
    const missing = [...currentById.keys()].filter((id) => !seen.has(id));
    throw new Error(`The AI omitted ${missing.length} included question${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`);
  }

  const nextQuestions = currentQuestions.map((question) => {
    if (question?.teacherExcluded === true) return clone(question);
    const proposal = proposed.get(clean(question.questionId));
    return {
      ...clone(question),
      questionWeight: proposal.weight,
    };
  });

  const changes = included.map((question) => {
    const proposal = proposed.get(clean(question.questionId));
    return {
      questionId: question.questionId,
      beforeWeight: normalizeQuestionWeight(question),
      afterWeight: proposal.weight,
      reason: proposal.reason,
    };
  }).filter((entry) => Math.abs(entry.beforeWeight - entry.afterWeight) > 1e-9);

  return {
    questions: nextQuestions,
    changes,
    changedCount: changes.length,
    reviewedCount: included.length,
    totalWeight: nextQuestions
      .filter((question) => question?.teacherExcluded !== true)
      .reduce((total, question) => total + normalizeQuestionWeight(question), 0),
  };
};

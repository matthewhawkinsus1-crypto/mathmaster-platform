import { analyzeResponseEntryRepair } from './liveQuestionCorrection.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const parseSafeLiveRepairPack = (input) => {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This file is not a MathMaster Safe Live Repair Pack.');
  }
  if (value.kind !== 'mathmasterSafeLiveRepairPack') {
    throw new Error('This JSON is not marked as a MathMaster Safe Live Repair Pack.');
  }
  if (!Array.isArray(value.replacementQuestions) || value.replacementQuestions.length === 0) {
    throw new Error('This repair pack does not contain any replacement questions.');
  }
  return value;
};

export const prepareSafeLiveRepairPack = ({
  pack,
  currentQuestions = [],
  historicalQuestions = [],
} = {}) => {
  const parsed = parseSafeLiveRepairPack(pack);
  const historicalById = new Map();
  historicalQuestions.forEach((question, index) => {
    const id = String(question?.questionId || '');
    if (!id) return;
    if (historicalById.has(id)) {
      throw new Error(`The live assignment contains duplicate question ID ${id}; the pack was not applied.`);
    }
    historicalById.set(id, { question, index });
  });

  const currentById = new Map();
  currentQuestions.forEach((question, index) => {
    const id = String(question?.questionId || '');
    if (!id) return;
    if (currentById.has(id)) {
      throw new Error(`The current editor contains duplicate question ID ${id}; the pack was not applied.`);
    }
    currentById.set(id, { question, index });
  });

  const seen = new Set();
  const nextQuestions = currentQuestions.map(clone);
  const liveRepairs = [];

  parsed.replacementQuestions.forEach((entry, entryIndex) => {
    const wrappedId = String(entry?.questionId || '');
    const replacement = entry?.question;
    if (!wrappedId || !replacement || typeof replacement !== 'object' || Array.isArray(replacement)) {
      throw new Error(`Repair pack entry ${entryIndex + 1} is missing its question ID or replacement question.`);
    }
    if (seen.has(wrappedId)) {
      throw new Error(`Repair pack repeats question ID ${wrappedId}; the entire pack was rejected.`);
    }
    seen.add(wrappedId);

    if (String(replacement.questionId || '') !== wrappedId) {
      throw new Error(`Repair pack entry ${entryIndex + 1} has mismatched question IDs; the entire pack was rejected.`);
    }

    const historical = historicalById.get(wrappedId);
    const current = currentById.get(wrappedId);
    if (!historical || !current) {
      throw new Error(`Question ${wrappedId} is not present in this assignment. This pack may belong to a different or newer assignment version.`);
    }
    if (historical.index !== current.index) {
      throw new Error(`Question ${wrappedId} moved from its protected index. The entire pack was rejected to protect student history.`);
    }

    const nextQuestion = {
      ...clone(replacement),
      questionId: wrappedId,
      teacherExcluded: current.question?.teacherExcluded === true,
    };
    const analysis = analyzeResponseEntryRepair(historical.question, nextQuestion);
    if (!analysis.safe) {
      throw new Error(`Question ${wrappedId} failed safe-live validation: ${analysis.reason}`);
    }

    nextQuestions[current.index] = nextQuestion;
    liveRepairs.push({
      questionId: wrappedId,
      questionIndex: current.index,
      affectedFieldIds: analysis.affectedFieldIds,
      beforeFingerprint: analysis.beforeFingerprint,
    });
  });

  return {
    questions: nextQuestions,
    liveRepairs,
    replacementCount: liveRepairs.length,
    questionIds: liveRepairs.map((repair) => repair.questionId),
  };
};

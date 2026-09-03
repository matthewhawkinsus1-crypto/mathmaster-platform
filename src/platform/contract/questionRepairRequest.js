import { CONTRACT_SLICES, PLATFORM_OWNED_FIELDS, buildContractSlice } from './authoringContract.js';

const clean = (value) => String(value ?? '').trim();

const stripFence = (text) => {
  const trimmed = clean(text);
  const fenced = trimmed.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

export const buildQuestionRepairRequest = ({
  assignment = {},
  question = {},
  instruction = '',
  questionNumber = null,
} = {}) => {
  const request = clean(instruction);
  if (!request) throw new Error('Describe what you want the AI to fix or rewrite first.');

  const title = clean(assignment.title || assignment.assignment?.title) || 'Untitled assignment';
  const courseId = clean(
    assignment.courseId
    || assignment.assignment?.courseId
    || assignment.courseProfile?.course,
  ) || 'unknown course';

  // The rules for THIS question's type, cut from the same contract the full
  // authoring request uses. Without them an outside AI has no way to know which
  // type values are legal, what the grader can read, or which fields the
  // platform owns and will strip — which is why repairs came back unusable.
  const rules = buildContractSlice({
    sections: CONTRACT_SLICES.questionRepair,
    questionTypes: [clean(question.type)],
    courseId: courseId === 'unknown course' ? null : courseId,
  });

  return [
    '# MathMaster question repair',
    '',
    'You are repairing ONE existing MathMaster math question.',
    `Assignment: ${title}`,
    `Course: ${courseId}`,
    ...(questionNumber == null ? [] : [`Question: ${questionNumber}`]),
    ...(clean(question.type) ? [`Question type: ${clean(question.type)} (keep this type unless the teacher asks to change it)`] : []),
    '',
    '## Teacher request',
    request,
    '',
    '## Required behavior',
    '- Return exactly ONE complete replacement question JSON object and nothing else.',
    '- Make the minimum changes needed to satisfy the teacher request.',
    '- Preserve the same learning target, primary standards, assessment context, section role, representation, difficulty intent, and DOK unless the teacher explicitly asks to change one of them.',
    '- Preserve mathematically correct grading data. If you change any number, expression, equation, graph, table, interval, choice, or scenario that affects the answer, update the expected answer/solution from the same changed mathematics.',
    '- Never add student IDs, accommodations, IEP/504/EB information, class placement, grades, attempts, due dates, or other student-specific state.',
    '- Do not solve a mobile-input problem by deleting required mathematical notation. Keep the mathematics correct; MathMaster owns keypad/rendering support.',
    '- Do not pad accepted answers with formatting variants that mathematical equivalence already handles.',
    '- This repair packet contains one CANONICAL V5 runtime question. Preserve its existing renderer/type fields unless the teacher request or listed blocker specifically requires changing the interaction. Do not invent extra renderer plumbing.',
    '- Reference information is part of the student task anchor. Preserve source facts, but do not duplicate prompt/scenario givens into referenceInfo and never put a conclusion the student must determine in referenceInfo.',
    '- For Algebra I domain/range, use inequality/set/verbal representations appropriate to the lesson; do not regress the question to interval notation unless the teacher/source explicitly requests interval notation.',
    '- If the question asks students to identify independent/dependent quantities, it must provide at least two selectable quantities with unique ids plus valid correctIndependentId/correctDependentId values. If there is no meaningful dependent quantity, remove that step rather than inventing one.',
    '- Preserve graph-analysis versus graph-construction intent. readGraph means technology/displayed-graph analysis; constructGraph means the student actually builds the graph.',
    '- Keep student-facing math typographically correct. Do not leave raw caret exponent prose such as x^2 or 2^x when a math expression can be delimited/rendered.',
    '- Keep the existing questionId if present. MathMaster will preserve it again when importing the repair.',
    '',
    '## Fields MathMaster owns',
    'Never include these; MathMaster sets them and the importer strips them:',
    PLATFORM_OWNED_FIELDS.join(', '),
    '',
    '## Existing question',
    '```json',
    JSON.stringify(question, null, 2),
    '```',
    ...(rules ? ['', rules] : []),
    '',
    '## What to return',
    'Exactly one JSON object: the replacement question. No prose, no code fence commentary,',
    'no alternatives, and nothing outside the object.',
  ].join('\n');
};

export const parseQuestionRepairResponse = (rawText) => {
  let text = stripFence(rawText);
  if (!text) throw new Error('The clipboard is empty. Copy the AI replacement question first.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) {
      throw new Error('MathMaster could not find one replacement question object in the clipboard.');
    }
    text = text.slice(first, last + 1);
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`The AI replacement is not valid JSON: ${error.message}`);
    }
  }

  const question = parsed?.replacementQuestion && typeof parsed.replacementQuestion === 'object'
    ? parsed.replacementQuestion
    : parsed;
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw new Error('The AI replacement must be one question object.');
  }
  if (!clean(question.type)) {
    throw new Error('The AI replacement is missing the question type.');
  }
  return question;
};

export default buildQuestionRepairRequest;

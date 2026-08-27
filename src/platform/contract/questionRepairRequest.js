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

  return [
    '# MathMaster question repair',
    '',
    'You are repairing ONE existing MathMaster math question.',
    `Assignment: ${title}`,
    `Course: ${courseId}`,
    ...(questionNumber == null ? [] : [`Question: ${questionNumber}`]),
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
    '- Keep the existing questionId if present. MathMaster will preserve it again when importing the repair.',
    '',
    '## Existing question',
    '```json',
    JSON.stringify(question, null, 2),
    '```',
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

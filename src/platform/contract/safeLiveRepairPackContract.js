const clean = (value) => String(value ?? '').trim();

const assignmentTitle = (assignment = {}) => (
  clean(assignment.title || assignment.assignment?.title) || 'Untitled assignment'
);

const assignmentCourse = (assignment = {}) => (
  clean(
    assignment.courseId
    || assignment.assignment?.courseId
    || assignment.courseProfile?.course,
  ) || 'unknown course'
);

export const SAFE_LIVE_REPAIR_PACK_KIND = 'mathmasterSafeLiveRepairPack';

export const buildSafeLiveRepairPackRequest = ({
  assignment = {},
  questions = [],
  instruction = '',
} = {}) => {
  const liveQuestions = Array.isArray(questions) ? questions : [];
  if (!liveQuestions.length) {
    throw new Error('MathMaster needs the protected live questions before it can build a Safe Live Repair Pack request.');
  }

  const teacherRequest = clean(instruction)
    || 'Repair only flawed plain-language/free-response entry controls that can be safely converted to finite choices. Do not rewrite the mathematical task.';

  return [
    '# MathMaster Safe Live Repair Pack',
    '',
    'You are repairing an EXISTING LIVE MathMaster assignment that already has student history.',
    `Assignment: ${assignmentTitle(assignment)}`,
    `Course: ${assignmentCourse(assignment)}`,
    '',
    '## Teacher request',
    teacherRequest,
    '',
    '## Output contract — REQUIRED',
    '- Return exactly ONE JSON object and nothing else.',
    `- The root object MUST contain: "kind": "${SAFE_LIVE_REPAIR_PACK_KIND}".`,
    '- The root object MUST contain a non-empty "replacementQuestions" array.',
    '- Do NOT return a normal Assignment V5 object, schemaVersion, sections, or a raw question array.',
    '- Include ONLY questions that actually need an eligible live repair. Do not include unchanged questions.',
    '- Every replacementQuestions entry must contain "questionId", an optional short "purpose", and a complete replacement "question" object.',
    '- The wrapper questionId and replacement question.questionId must be identical and must exactly match the existing live question ID.',
    '- Never invent, regenerate, renumber, remove, reorder, or duplicate question IDs.',
    '',
    '## Safe-live boundary',
    '- Make the MINIMUM possible response-entry change.',
    '- Prompt/scenario wording must stay exactly unchanged unless MathMaster explicitly exposes a separate safe workflow conversion for that field.',
    '- Keep mathematical meaning, standard/TEKS, section role, question type/tool, graph, table, quantities, equations, constraints, grading intent, and question order unchanged.',
    '- Do not change questionWeight, teacherExcluded, attempts, existing grades, student responses, due dates, accommodations, or any student-specific state.',
    '- Do not add, remove, or reorder answerFields on a live question.',
    '- Keep every existing answer-field id in the same position.',
    '',
    '## Plain-language free response → finite choice',
    '- A prose/plain-language response field may be converted to a finite choice only when the previously keyed response is already plain language.',
    '- Keep the field id and all non-response meaning unchanged.',
    '- Replace only response-entry plumbing such as acceptedAnswers/answer, options, type, inputProfile/inputMode, answerFormat, requiredSymbols, inputContract, notation, placeholder, presentation, or toolProfile as needed.',
    '- The repaired field needs at least two choices.',
    '- The keyed answer MUST be one of the previously accepted correct wordings.',
    '- Exactly ONE previously accepted correct wording may appear among the new options.',
    '- Distractors must be clearly incorrect without changing the underlying mathematics.',
    '',
    '## relationshipModel / functionModeling word-stage exception',
    '- For an existing domainWords stage, add only domainWordsChoices. Leave every other question field unchanged.',
    '- For an existing rangeWords stage, add only rangeWordsChoices. Leave every other question field unchanged.',
    '- The corresponding recipe.ask/top-level ask must already contain domainWords or rangeWords.',
    '- The existing correctDomainWords/correctRangeWords must already contain plain-language accepted candidates.',
    '- The new choice list must contain exactly one of those previously accepted correct candidates.',
    '- Do not rewrite the scenario/prompt merely to remove the phrase "in words"; MathMaster protects the live task wording.',
    '',
    '## Required pack shape',
    '```json',
    '{',
    `  "kind": "${SAFE_LIVE_REPAIR_PACK_KIND}",`,
    '  "replacementQuestions": [',
    '    {',
    '      "questionId": "EXISTING-LIVE-QUESTION-ID",',
    '      "purpose": "Short description of the response-control repair.",',
    '      "question": {',
    '        "questionId": "EXISTING-LIVE-QUESTION-ID",',
    '        "...": "Complete replacement question with only eligible safe-live response-entry changes"',
    '      }',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    '## Protected live questions',
    'Use these exact records as the before-state. A replacement must be derived from its matching record and may not silently normalize or clean unrelated fields.',
    '```json',
    JSON.stringify(liveQuestions, null, 2),
    '```',
  ].join('\n');
};

export default buildSafeLiveRepairPackRequest;

import { validateQuestionContract } from './assignmentTypeContract.js';

const normalizeString = (value) => String(value ?? '').trim();

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const stripJsonFence = (text) => {
  const trimmed = normalizeString(text);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeAutomatedFinding = (finding = {}) => ({
  code: normalizeString(finding.code),
  severity: normalizeString(finding.severity),
  message: normalizeString(finding.message),
  repairRequirement: normalizeString(finding.repairRequirement),
  fieldPath: normalizeString(finding.fieldPath),
  issueKind: normalizeString(finding.issueKind),
  componentId: finding.componentId == null ? null : normalizeString(finding.componentId),
});

const normalizeTeacherConstraint = (constraint = {}) => ({
  category: normalizeString(constraint.category),
  severity: normalizeString(constraint.severity),
  note: normalizeString(constraint.note),
  hardConstraint: constraint.hardConstraint !== false,
});

const ensureV5Assignment = (assignmentV5) => {
  if (!isPlainObject(assignmentV5) || Number(assignmentV5.schemaVersion) !== 5) {
    throw new Error('Batch repair packets require a schemaVersion 5 assignment.');
  }
  if (!Array.isArray(assignmentV5.sections)) {
    throw new Error('Batch repair packets require assignment sections.');
  }
};

const normalizeSelectedQuestionIds = (selectedQuestionIds) => {
  if (!Array.isArray(selectedQuestionIds) || selectedQuestionIds.length === 0) {
    throw new Error('Select at least one question for repair.');
  }

  const normalized = selectedQuestionIds.map(normalizeString);
  if (normalized.some((questionId) => !questionId)) {
    throw new Error('Selected questions must have stable questionId values.');
  }

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error('Duplicate selected questionId values are not allowed.');
  }

  return normalized;
};

const buildRepairCenterQuestionMap = (repairCenterModel) => {
  const rows = Array.isArray(repairCenterModel?.questions) ? repairCenterModel.questions : [];
  const map = new Map();

  rows.forEach((row) => {
    const questionId = normalizeString(row?.questionId || row?.question?.questionId);
    if (questionId) map.set(questionId, row);
  });

  return map;
};

export const buildQuestionBatchRepairPacket = ({
  assignmentV5,
  repairCenterModel,
  selectedQuestionIds,
  assignmentId,
  baseRevision,
} = {}) => {
  ensureV5Assignment(assignmentV5);
  const selectedIds = normalizeSelectedQuestionIds(selectedQuestionIds);
  const questionMap = buildRepairCenterQuestionMap(repairCenterModel);

  const questions = selectedIds.map((questionId) => {
    const row = questionMap.get(questionId);
    if (!row || !isPlainObject(row.question)) {
      throw new Error(`Question ${questionId} is not available in the Assignment Repair Center.`);
    }

    return {
      questionId,
      sectionId: normalizeString(row.sectionId),
      sectionRole: normalizeString(row.sectionRole),
      questionNumber: Number(row.questionNumber) || null,
      automatedFindings: (Array.isArray(row.automatedFindings) ? row.automatedFindings : [])
        .map(normalizeAutomatedFinding),
      teacherConstraints: (Array.isArray(row.teacherConstraints) ? row.teacherConstraints : [])
        .map(normalizeTeacherConstraint),
      question: cloneJson(row.question),
    };
  });

  return {
    repairPacketVersion: 1,
    assignmentContext: {
      assignmentId: normalizeString(assignmentId || assignmentV5.assignment?.assignmentId),
      baseRevision,
      schemaVersion: 5,
      title: normalizeString(assignmentV5.assignment?.title),
      courseId: normalizeString(assignmentV5.assignment?.courseId),
    },
    questions,
  };
};

export const buildQuestionBatchRepairRequest = (args = {}) => {
  const packet = buildQuestionBatchRepairPacket(args);

  const instructions = [
    'Repair only the supplied MathMaster V5 questions.',
    'First classify each concern as assignmentIssue, platformIssue, or unclear.',
    'For assignmentIssue items, make the smallest assignment JSON change needed and place the complete corrected question object in replacements.',
    'For platformIssue items, do not rewrite or distort the question to work around a MathMaster tool/rendering/grading problem. Report the issue in platformIssues instead.',
    'For unclear items, do not guess or mutate the question. Report what needs investigation in unclearIssues.',
    'Treat every teacherConstraints entry as a hard requirement. Do not satisfy a validator finding by violating a teacher constraint.',
    'Preserve each questionId, standards/alignment, mathematical identity, and instructional intent unless the supplied issue specifically requires a change.',
    'Do not regenerate or return the full assignment. Do not change questions that are not supplied in this packet.',
    'Return exactly one JSON object with no markdown and no explanation.',
    'Use this output shape:',
    '{"repairPacketVersion":1,"assignmentId":"...","baseRevision":0,"replacements":[{"questionId":"...","question":{}}],"platformIssues":[{"questionId":"...","classification":"platformIssue","reason":"...","suspectedComponent":"..."}],"unclearIssues":[{"questionId":"...","classification":"unclear","reason":"..."}]}',
    'Repair packet:',
    JSON.stringify(packet, null, 2),
  ];

  return instructions.join('\n');
};

const validateAllowedQuestionId = (questionId, allowedSet) => {
  if (allowedSet && !allowedSet.has(questionId)) {
    throw new Error(`Question ${questionId} was not part of this repair request.`);
  }
};

const normalizeIssueEntries = (entries, allowedSet, expectedClassification) => {
  if (entries == null) return [];
  if (!Array.isArray(entries)) {
    throw new Error(`${expectedClassification} entries must be an array.`);
  }

  return entries.map((entry) => {
    if (!isPlainObject(entry)) {
      throw new Error(`${expectedClassification} entries must be JSON objects.`);
    }
    const questionId = normalizeString(entry.questionId);
    if (!questionId) {
      throw new Error(`${expectedClassification} entries require questionId.`);
    }
    validateAllowedQuestionId(questionId, allowedSet);

    return {
      ...entry,
      questionId,
      classification: expectedClassification,
      reason: normalizeString(entry.reason),
    };
  });
};

export const parseQuestionBatchRepairResponse = (rawText, {
  expectedAssignmentId,
  expectedBaseRevision,
  allowedQuestionIds,
} = {}) => {
  let payload;
  try {
    payload = JSON.parse(stripJsonFence(rawText));
  } catch (error) {
    throw new Error(`Repair response is not valid JSON: ${error.message}`);
  }

  if (!isPlainObject(payload)) {
    throw new Error('Repair response must be one JSON object.');
  }
  if (Number(payload.repairPacketVersion) !== 1) {
    throw new Error('Repair response must use repairPacketVersion 1.');
  }

  const assignmentId = normalizeString(payload.assignmentId);
  if (expectedAssignmentId != null && assignmentId !== normalizeString(expectedAssignmentId)) {
    throw new Error(`Repair response is for assignment ${assignmentId || '(missing)'}, not the current assignment.`);
  }

  if (expectedBaseRevision != null && payload.baseRevision !== expectedBaseRevision) {
    throw new Error(`Repair response revision ${String(payload.baseRevision)} does not match the current revision ${String(expectedBaseRevision)}.`);
  }

  const allowedSet = Array.isArray(allowedQuestionIds)
    ? new Set(allowedQuestionIds.map(normalizeString))
    : null;
  const replacementEntries = payload.replacements == null ? [] : payload.replacements;
  if (!Array.isArray(replacementEntries)) {
    throw new Error('Repair response replacements must be an array.');
  }

  const seenReplacementIds = new Set();
  const replacements = replacementEntries.map((entry) => {
    if (!isPlainObject(entry)) {
      throw new Error('Every replacement must be a JSON object.');
    }

    const questionId = normalizeString(entry.questionId);
    if (!questionId) throw new Error('Every replacement requires questionId.');
    validateAllowedQuestionId(questionId, allowedSet);
    if (seenReplacementIds.has(questionId)) {
      throw new Error(`Duplicate replacement for questionId ${questionId}.`);
    }
    seenReplacementIds.add(questionId);

    if (!isPlainObject(entry.question)) {
      throw new Error(`Replacement ${questionId} requires a complete question object.`);
    }
    const innerQuestionId = normalizeString(entry.question.questionId);
    if (innerQuestionId !== questionId) {
      throw new Error(`Replacement questionId mismatch: outer ${questionId}, inner ${innerQuestionId || '(missing)'}.`);
    }

    const contractResult = validateQuestionContract(entry.question);
    if (!contractResult?.ok) {
      const reason = Array.isArray(contractResult?.errors)
        ? contractResult.errors.join('; ')
        : normalizeString(contractResult?.error || contractResult?.message || 'question contract failed');
      throw new Error(`Replacement ${questionId} is not a valid MathMaster question: ${reason}`);
    }

    return {
      questionId,
      question: cloneJson(entry.question),
    };
  });

  return {
    repairPacketVersion: 1,
    assignmentId,
    baseRevision: payload.baseRevision,
    replacements,
    platformIssues: normalizeIssueEntries(payload.platformIssues, allowedSet, 'platformIssue'),
    unclearIssues: normalizeIssueEntries(payload.unclearIssues, allowedSet, 'unclear'),
  };
};

export const applyQuestionBatchRepairReplacements = (assignmentV5, parsedBatch) => {
  ensureV5Assignment(assignmentV5);
  const replacements = Array.isArray(parsedBatch?.replacements) ? parsedBatch.replacements : [];
  if (replacements.length === 0) return assignmentV5;

  const replacementMap = new Map(replacements.map((entry) => [normalizeString(entry.questionId), entry.question]));
  const foundIds = new Set();
  let assignmentChanged = false;

  const sections = assignmentV5.sections.map((section) => {
    if (!Array.isArray(section?.questions)) return section;
    let sectionChanged = false;

    const questions = section.questions.map((existingQuestion) => {
      const questionId = normalizeString(existingQuestion?.questionId);
      if (!replacementMap.has(questionId)) return existingQuestion;

      foundIds.add(questionId);
      sectionChanged = true;
      assignmentChanged = true;
      return cloneJson(replacementMap.get(questionId));
    });

    return sectionChanged ? { ...section, questions } : section;
  });

  const missingIds = [...replacementMap.keys()].filter((questionId) => !foundIds.has(questionId));
  if (missingIds.length > 0) {
    throw new Error(`Could not find questionId replacement target(s): ${missingIds.join(', ')}.`);
  }

  return assignmentChanged ? { ...assignmentV5, sections } : assignmentV5;
};

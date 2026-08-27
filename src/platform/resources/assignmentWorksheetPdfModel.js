const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const safeChoice = (choice, index) => {
  if (choice == null) return null;
  if (['string', 'number'].includes(typeof choice)) {
    return { label: String.fromCharCode(65 + index), text: String(choice) };
  }
  if (typeof choice !== 'object') return null;
  const text = clean(choice.text ?? choice.labelText ?? choice.display ?? choice.latex ?? choice.content);
  if (!text) return null;
  return {
    label: clean(choice.label) || String.fromCharCode(65 + index),
    text,
  };
};

const visibleChoices = (question = {}) => {
  const candidates = question.choices ?? question.options ?? question.answerChoices ?? [];
  return asArray(candidates).map(safeChoice).filter(Boolean);
};

const scenarioText = (question = {}) => {
  const scenario = question?.context?.scenario ?? question?.scenario ?? question?.stimulus?.text ?? '';
  if (typeof scenario === 'string' || typeof scenario === 'number') return clean(scenario);
  if (scenario && typeof scenario === 'object') {
    return clean(scenario.text ?? scenario.prompt ?? scenario.description);
  }
  return '';
};

const directionsText = (question = {}) => clean(
  question.directions ?? question.instructions ?? question.taskDirections ?? '',
);


export const PRINT_OUTPUT_MODES = Object.freeze({
  STUDENT: 'student',
  TEACHER: 'teacher',
  ANSWER_KEY: 'answerKey',
});

const OUTPUT_MODE_LABELS = Object.freeze({
  student: 'Printable Assignment',
  teacher: 'Teacher Copy',
  answerKey: 'Answer Key',
});

const formatAnswerValue = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((entry) => ['number', 'string'].includes(typeof entry))) {
      return `(${value[0]}, ${value[1]})`;
    }
    return value.map(formatAnswerValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if ('x' in value && 'y' in value) return `(${formatAnswerValue(value.x)}, ${formatAnswerValue(value.y)})`;
    if ('re' in value && 'im' in value) {
      const re = Number(value.re);
      const im = Number(value.im);
      if (Number.isFinite(re) && Number.isFinite(im)) {
        const sign = im < 0 ? '−' : '+';
        return `${re} ${sign} ${Math.abs(im)}i`;
      }
    }
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const firstAnswerValue = (source = {}) => {
  const candidates = [
    source.expected,
    source.expectedAnswer,
    source.correctAnswer,
    source.answer,
    source.value,
  ];
  for (const value of candidates) {
    const formatted = formatAnswerValue(value);
    if (formatted) return formatted;
  }
  if (Array.isArray(source.acceptedAnswers) && source.acceptedAnswers.length) {
    return formatAnswerValue(source.acceptedAnswers[0]);
  }
  return '';
};

const labelledAnswerLines = (items = []) => asArray(items).flatMap((entry, index) => {
  if (!entry || typeof entry !== 'object') return [];
  const value = firstAnswerValue(entry);
  if (!value) return [];
  const label = clean(entry.label ?? entry.title ?? entry.prompt ?? entry.kind ?? entry.id) || `Part ${index + 1}`;
  return [`${label}: ${value}`];
});

const gradingAnswerLines = (grading = {}) => {
  if (!grading || typeof grading !== 'object' || Array.isArray(grading)) return [];
  const lines = [];
  const push = (label, value) => {
    const formatted = formatAnswerValue(value);
    if (formatted && !lines.some((line) => line === `${label}: ${formatted}`)) lines.push(`${label}: ${formatted}`);
  };

  [
    ['Answer', grading.answer],
    ['Expected', grading.expected],
    ['Equation', grading.equation],
    ['Domain', grading.domain],
    ['Range', grading.range],
    ['Continuity', grading.continuity],
    ['Classification', grading.classification],
    ['Point', grading.point],
    ['Solution', grading.solution],
    ['Is a function', grading.isFunction],
  ].forEach(([label, value]) => push(label, value));

  const tableValues = grading.table?.values;
  if (tableValues && typeof tableValues === 'object' && !Array.isArray(tableValues)) {
    Object.entries(tableValues).slice(0, 12).forEach(([key, value]) => push(`Table ${key}`, value));
  }
  return lines;
};

export const answerLinesFromResolvedQuestion = (question = {}) => {
  const lines = [];
  const add = (line) => {
    const text = clean(line);
    if (text && !lines.includes(text)) lines.push(text);
  };
  const direct = firstAnswerValue(question);
  if (direct) add(`Answer: ${direct}`);

  labelledAnswerLines(question.responseFields).forEach(add);
  labelledAnswerLines(question.responses).forEach(add);
  labelledAnswerLines(question.analysisRequests).forEach(add);

  if (question.tableAnswers && typeof question.tableAnswers === 'object' && !Array.isArray(question.tableAnswers)) {
    Object.entries(question.tableAnswers).slice(0, 12).forEach(([key, value]) => add(`Table ${key}: ${formatAnswerValue(value)}`));
  }
  gradingAnswerLines(question.grading).forEach(add);
  gradingAnswerLines(question.recipe?.grading).forEach(add);

  if (question.correctMatches && typeof question.correctMatches === 'object' && !Array.isArray(question.correctMatches)) {
    Object.entries(question.correctMatches).forEach(([key, value]) => add(`Match ${key}: ${formatAnswerValue(value)}`));
  }
  if (question.correctIndependentId) add(`Independent quantity: ${question.correctIndependentId}`);
  if (question.correctDependentId) add(`Dependent quantity: ${question.correctDependentId}`);

  return lines.slice(0, 18);
};

export const solutionLinesFromResolvedQuestion = (question = {}) => {
  const out = [];
  const append = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => append(
        entry && typeof entry === 'object'
          ? entry.explanation ?? entry.text ?? entry.label ?? entry.result
          : entry,
      ));
      return;
    }
    const text = clean(value);
    if (text && !out.includes(text)) out.push(text);
  };

  append(question.workedSolution);
  append(question.solutionExplanation);
  append(question.explanation);
  append(question.solutionSteps);
  append(question.solution?.steps);
  if (typeof question.solution === 'string' || Array.isArray(question.solution)) append(question.solution);
  else if (question.solution && typeof question.solution === 'object') {
    append(question.solution.explanation ?? question.solution.text ?? question.solution.summary);
  }
  return out.slice(0, 12);
};

export const printableQuestionFromResolved = (question = {}, {
  sourceIndex = 0,
  number = 1,
  sectionRole = 'practice',
  sectionLabel = 'Practice',
  includeAnswers = false,
  includeSolutions = false,
} = {}) => ({
  sourceIndex,
  number,
  sectionRole: clean(sectionRole) || 'practice',
  sectionLabel: clean(sectionLabel) || 'Practice',
  type: clean(question.type) || 'question',
  prompt: clean(question.prompt ?? question.question ?? question.stem),
  directions: directionsText(question),
  scenario: scenarioText(question),
  choices: visibleChoices(question),
  workspace: clean(question.printWorkspace ?? question.workspaceHint ?? ''),
  ...(includeAnswers ? { answerLines: answerLinesFromResolvedQuestion(question) } : {}),
  ...(includeSolutions ? { solutionLines: solutionLinesFromResolvedQuestion(question) } : {}),
});

export const buildAssignmentWorksheetModel = ({
  assignment = {},
  student = {},
  entries = [],
  outputMode = PRINT_OUTPUT_MODES.STUDENT,
} = {}) => {
  const mode = Object.values(PRINT_OUTPUT_MODES).includes(outputMode) ? outputMode : PRINT_OUTPUT_MODES.STUDENT;
  const includeAnswers = mode !== PRINT_OUTPUT_MODES.STUDENT;
  const includeSolutions = mode === PRINT_OUTPUT_MODES.TEACHER;
  const sections = [];
  const byKey = new Map();
  asArray(entries).forEach((entry) => {
    if (!entry?.question || entry.available === false) return;
    const role = clean(entry.sectionRole) || 'practice';
    const label = clean(entry.sectionLabel) || 'Practice';
    const key = `${role}::${label}`;
    if (!byKey.has(key)) {
      const section = { role, label, questions: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    const section = byKey.get(key);
    section.questions.push(printableQuestionFromResolved(entry.question, {
      sourceIndex: Number(entry.sourceIndex) || 0,
      number: section.questions.length + 1,
      sectionRole: role,
      sectionLabel: label,
      includeAnswers,
      includeSolutions,
    }));
  });

  return {
    assignmentId: clean(assignment.id),
    title: clean(assignment.title) || 'MathMaster Assignment',
    dueAt: assignment.dueAt || assignment.dueDate || null,
    studentName: clean(student.displayName ?? student.name),
    classPeriod: clean(student.classPeriod),
    outputMode: mode,
    documentLabel: OUTPUT_MODE_LABELS[mode],
    includeAnswers,
    includeSolutions,
    sections,
  };
};

const filePart = (value, fallback) => {
  const cleaned = clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return cleaned || fallback;
};

export const worksheetFileName = ({ assignmentTitle = '', studentName = '', outputMode = PRINT_OUTPUT_MODES.STUDENT } = {}) => {
  const studentPart = clean(studentName) ? `-${filePart(studentName, 'Student')}` : '';
  const modePart = outputMode === PRINT_OUTPUT_MODES.TEACHER
    ? `Teacher_Copy${studentPart}`
    : outputMode === PRINT_OUTPUT_MODES.ANSWER_KEY ? `Answer_Key${studentPart}` : filePart(studentName, 'Printable');
  return `${filePart(assignmentTitle, 'MathMaster_Assignment')}-${modePart}.pdf`;
};

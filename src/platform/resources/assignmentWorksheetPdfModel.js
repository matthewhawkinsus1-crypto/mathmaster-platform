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

export const printableQuestionFromResolved = (question = {}, {
  sourceIndex = 0,
  number = 1,
  sectionRole = 'practice',
  sectionLabel = 'Practice',
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
});

export const buildAssignmentWorksheetModel = ({
  assignment = {},
  student = {},
  entries = [],
} = {}) => {
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
    }));
  });

  return {
    assignmentId: clean(assignment.id),
    title: clean(assignment.title) || 'MathMaster Assignment',
    dueAt: assignment.dueAt || assignment.dueDate || null,
    studentName: clean(student.displayName ?? student.name),
    classPeriod: clean(student.classPeriod),
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

export const worksheetFileName = ({ assignmentTitle = '', studentName = '' } = {}) => (
  `${filePart(assignmentTitle, 'MathMaster_Assignment')}-${filePart(studentName, 'Printable')}.pdf`
);

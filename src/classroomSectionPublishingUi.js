import { getEffectiveActivityPolicy } from './platform/policies/activityPolicies.js';

export const CLASSROOM_SECTION_OPTIONS = Object.freeze([
  { key: 'whole', label: 'Whole assignment' },
  { key: 'warmup', label: 'Warm-Up' },
  { key: 'classwork', label: 'Classwork' },
  { key: 'practice', label: 'Practice' },
  { key: 'dol', label: 'DOL' },
]);

const SPECIFIC_SECTION_KEYS = Object.freeze(['warmup', 'classwork', 'practice', 'dol']);
const KNOWN_SECTION_KEYS = new Set(CLASSROOM_SECTION_OPTIONS.map((option) => option.key));

const normalizeSectionKey = (value) => String(value ?? '').trim().toLowerCase();

export function classroomSectionLabel(value) {
  const key = normalizeSectionKey(value);
  return CLASSROOM_SECTION_OPTIONS.find((option) => option.key === key)?.label || 'Whole assignment';
}

export function availableClassroomSectionKeys(assignment = {}) {
  const present = new Set();
  if (Number(assignment?.schemaVersion) === 5) {
    for (const section of Array.isArray(assignment.sections) ? assignment.sections : []) {
      for (const question of Array.isArray(section?.questions) ? section.questions : []) {
        if (question?.teacherExcluded === true) continue;
        const role = normalizeSectionKey(question?.activityRole || section?.role || 'classwork');
        if (SPECIFIC_SECTION_KEYS.includes(role)) present.add(role);
      }
    }
  }
  return ['whole', ...SPECIFIC_SECTION_KEYS.filter((key) => present.has(key))];
}

export function nextClassroomSectionSelection(current = ['whole'], toggledKey = 'whole') {
  const key = normalizeSectionKey(toggledKey);
  const normalizedCurrent = [...new Set(
    (Array.isArray(current) ? current : [])
      .map(normalizeSectionKey)
      .filter((item) => KNOWN_SECTION_KEYS.has(item))
  )];

  if (key === 'whole') return ['whole'];
  if (!SPECIFIC_SECTION_KEYS.includes(key)) {
    return normalizedCurrent.length ? normalizedCurrent : ['whole'];
  }

  const selected = new Set(
    normalizedCurrent.filter((item) => item !== 'whole' && SPECIFIC_SECTION_KEYS.includes(item))
  );
  if (selected.has(key)) selected.delete(key);
  else selected.add(key);

  const ordered = SPECIFIC_SECTION_KEYS.filter((item) => selected.has(item));
  return ordered.length ? ordered : ['whole'];
}

const includedQuestionRecords = (assignment = {}) => {
  const records = [];
  for (const section of Array.isArray(assignment?.sections) ? assignment.sections : []) {
    if (!section || typeof section !== 'object') continue;
    const sectionRole = normalizeSectionKey(section.role || 'classwork');
    for (const question of Array.isArray(section.questions) ? section.questions : []) {
      if (!question || question.teacherExcluded === true) continue;
      records.push({
        question,
        section,
        role: normalizeSectionKey(question.activityRole || sectionRole || 'classwork'),
      });
    }
  }
  return records;
};

export function classroomSectionPostPreviews({
  assignment = {},
  selectedKeys = ['whole'],
  classroomTitle = '',
  instructions = '',
} = {}) {
  const available = new Set(availableClassroomSectionKeys(assignment));
  const normalized = [...new Set(
    (Array.isArray(selectedKeys) ? selectedKeys : ['whole'])
      .map(normalizeSectionKey)
      .filter((key) => available.has(key))
  )];
  const keys = normalized.length ? normalized : ['whole'];
  const baseTitle = String(classroomTitle || assignment?.title || 'MathMaster Assignment').trim() || 'MathMaster Assignment';
  const wholeInstructions = String(instructions || '').trim() || `Complete "${baseTitle}" in MathMaster.`;
  const dueAt = assignment?.dueAt || assignment?.dueDate || null;
  const records = includedQuestionRecords(assignment);
  const wholePoints = Number(assignment?.classroomPackage?.assignmentPost?.maxPoints);

  return keys.map((sectionKey) => {
    const isWhole = sectionKey === 'whole';
    const label = classroomSectionLabel(sectionKey);
    const matching = isWhole ? records : records.filter((record) => record.role === sectionKey);
    const policy = isWhole ? null : getEffectiveActivityPolicy(sectionKey);
    const sectionTitles = [...new Set(
      matching.map(({ section }) => String(section?.title || '').trim()).filter(Boolean)
    )];

    return {
      sectionKey,
      sectionLabel: label,
      title: isWhole ? baseTitle : `${label} — ${baseTitle}`,
      instructions: isWhole ? wholeInstructions : `Complete the ${label} in MathMaster.`,
      dueAt,
      points: isWhole
        ? (Number.isFinite(wholePoints) && wholePoints > 0 ? wholePoints : 100)
        : (policy?.grading?.pointsPossible ?? 100),
      gradingMode: isWhole ? 'composite' : (policy?.grading?.mode || 'accuracy'),
      questionCount: matching.length,
      includedSectionTitles: sectionTitles,
    };
  });
}

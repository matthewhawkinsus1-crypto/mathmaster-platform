import { getTexasStandard, normalizeTeksCode } from './texasStandards.js';

export const DOK_LEVELS = [
  { level: 1, label: 'DOK 1 — Recall & Reproduction' },
  { level: 2, label: 'DOK 2 — Skills & Concepts' },
  { level: 3, label: 'DOK 3 — Strategic Thinking' },
  { level: 4, label: 'DOK 4 — Extended Thinking' },
];

export const INSTRUCTIONAL_LEVELS = [
  { key: 'prerequisite', band: 1, label: 'Prerequisite' },
  { key: 'developing', band: 2, label: 'Developing' },
  { key: 'gradeLevel', band: 3, label: 'Grade Level' },
  { key: 'advanced', band: 4, label: 'Advanced' },
  { key: 'extension', band: 5, label: 'Extension' },
];

export const QUESTION_PURPOSES = [
  { key: 'prerequisite', label: 'Prerequisite check', defaultWeight: 0.6 },
  { key: 'instruction', label: 'Instruction / modeled example', defaultWeight: 0.25 },
  { key: 'guidedPractice', label: 'Guided practice', defaultWeight: 0.4 },
  { key: 'independentPractice', label: 'Independent practice', defaultWeight: 0.75 },
  { key: 'formative', label: 'Formative check', defaultWeight: 0.9 },
  { key: 'dol', label: 'DOL / exit ticket', defaultWeight: 1.0 },
  { key: 'assessment', label: 'Assessment', defaultWeight: 1.25 },
  { key: 'intervention', label: 'Intervention', defaultWeight: 0.5 },
  { key: 'extension', label: 'Extension', defaultWeight: 0.75 },
];

export const TEKS_EVIDENCE_LEVELS = [
  { key: 'introduced', label: 'Introduced' },
  { key: 'practiced', label: 'Practiced' },
  { key: 'assessed', label: 'Assessed' },
  { key: 'masteryEvidence', label: 'Mastery evidence' },
];

const unique = (values) => [...new Set(values.filter(Boolean))];

const normalizeStandardEntry = (value, fallbackLevel) => {
  if (typeof value === 'string' || typeof value === 'number') {
    const code = normalizeTeksCode(value);
    const resolved = getTexasStandard(code);
    return code ? { code, courseId: resolved?.courseId || null, level: fallbackLevel } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const code = normalizeTeksCode(value.code || value.teks || value.standard);
  if (!code) return null;
  const resolved = getTexasStandard(code);
  return {
    ...value,
    code,
    courseId: value.courseId || resolved?.courseId || null,
    level: value.level || value.coverage || value.evidenceLevel || fallbackLevel,
  };
};

const normalizeStandardList = (values, fallbackLevel) => {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  const seen = new Set();
  return list.map((value) => normalizeStandardEntry(value, fallbackLevel)).filter((entry) => {
    if (!entry || seen.has(entry.code)) return false;
    seen.add(entry.code);
    return true;
  });
};

export const normalizeQuestionStandards = (questionOrStandards = {}) => {
  const question = questionOrStandards && typeof questionOrStandards === 'object' && !Array.isArray(questionOrStandards)
    ? questionOrStandards
    : {};
  // V4 authoring emits a framework-neutral `alignments` list instead of the
  // TEKS-shaped `standards` object. Without this branch every V4 question is
  // invisible to the mastery engine: it renders and grades, but contributes no
  // evidence, so mastery never moves and adaptive routing never fires.
  // Secure My Math Path bank records carry canonical `alignmentKeys` such as
  // `texas:A.5A` instead of the classroom-authoring `alignments` array. The
  // Teacher Path Simulator reads those bank records directly, so they must be
  // first-class evidence metadata rather than looking unaligned.
  if (!question.standards && !question.teks && !Array.isArray(question.alignments) && Array.isArray(question.alignmentKeys)) {
    const primary = normalizeStandardList(
      question.alignmentKeys
        .map((key) => String(key || '').replace(/^texas:/i, ''))
        .filter(Boolean),
      'assessed',
    );
    return { primary, secondary: [], prerequisite: [] };
  }

  if (!question.standards && !question.teks && Array.isArray(question.alignments)) {
    const byRole = (role, level) => normalizeStandardList(
      question.alignments
        .filter((entry) => entry
          && String(entry.framework || 'teks') === 'teks'
          && String(entry.role || 'primary') === role
          && entry.code)
        .map((entry) => entry.code),
      level,
    );
    return {
      primary: byRole('primary', 'assessed'),
      secondary: byRole('secondary', 'practiced'),
      prerequisite: byRole('prerequisite', 'prerequisite'),
    };
  }

  const raw = question.standards ?? question;

  if (Array.isArray(raw)) {
    return {
      primary: normalizeStandardList(raw, 'assessed'),
      secondary: [],
      prerequisite: [],
    };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { primary: [], secondary: [], prerequisite: [] };
  }

  // Legacy shorthand { teks: ["A.2A"] } is treated as primary alignment.
  const primarySource = raw.primary ?? raw.primaryTEKS ?? raw.teks ?? raw.codes ?? [];
  const secondarySource = raw.secondary ?? raw.secondaryTEKS ?? raw.process ?? [];
  const prerequisiteSource = raw.prerequisite ?? raw.prerequisiteTEKS ?? [];

  return {
    primary: normalizeStandardList(primarySource, 'assessed'),
    secondary: normalizeStandardList(secondarySource, 'practiced'),
    prerequisite: normalizeStandardList(prerequisiteSource, 'prerequisite'),
  };
};

export const normalizeQuestionComplexity = (question = {}) => {
  const rawLevel = question?.complexity?.level ?? question?.complexity?.dok ?? question?.standards?.dok ?? question?.dok;
  const level = Number(rawLevel);
  return {
    framework: 'DOK',
    level: Number.isInteger(level) && level >= 1 && level <= 4 ? level : null,
  };
};

export const normalizeQuestionDifficulty = (question = {}) => {
  const raw = question?.difficulty && typeof question.difficulty === 'object' && !Array.isArray(question.difficulty)
    ? question.difficulty
    : {};
  const levelToken = String(raw.instructionalLevel || raw.level || question.instructionalLevel || '').trim();
  const levelEntry = INSTRUCTIONAL_LEVELS.find((entry) => entry.key === levelToken);
  const numericBand = Number(raw.generatorBand ?? raw.band ?? question.difficultyBand ?? question.generatorBand);
  const band = Number.isInteger(numericBand) && numericBand >= 1 && numericBand <= 5
    ? numericBand
    : levelEntry?.band ?? 3;
  const bandEntry = INSTRUCTIONAL_LEVELS.find((entry) => entry.band === band) || INSTRUCTIONAL_LEVELS[2];
  return {
    instructionalLevel: levelEntry?.key || bandEntry.key,
    generatorBand: band,
  };
};

export const getDefaultPurposeForAssignment = (assignment = {}) => {
  if (assignment?.dol?.enabled && assignment.assignmentType === 'practice') return 'independentPractice';
  if (assignment?.assignmentType === 'notesClasswork') return 'guidedPractice';
  return 'independentPractice';
};

export const getPurposeDefinition = (purpose) => QUESTION_PURPOSES.find((item) => item.key === purpose) || QUESTION_PURPOSES.find((item) => item.key === 'independentPractice');

export const normalizeQuestionInstructionalMetadata = (question = {}, assignment = {}) => {
  const standards = normalizeQuestionStandards(question);
  const complexity = normalizeQuestionComplexity(question);
  const difficulty = normalizeQuestionDifficulty(question);
  const purpose = String(question.purpose || getDefaultPurposeForAssignment(assignment));
  const purposeDefinition = getPurposeDefinition(purpose);
  const rawWeight = Number(question.evidenceWeight);
  const evidenceWeight = Number.isFinite(rawWeight) && rawWeight >= 0
    ? Math.min(2, rawWeight)
    : purposeDefinition.defaultWeight;
  const differentiationMode = ['off', 'recommend', 'auto'].includes(question?.differentiation?.mode)
    ? question.differentiation.mode
    : 'recommend';

  return {
    standards,
    complexity,
    difficulty,
    purpose,
    evidenceWeight,
    differentiation: {
      mode: differentiationMode,
      bandProfiles: question?.differentiation?.bandProfiles && typeof question.differentiation.bandProfiles === 'object'
        ? question.differentiation.bandProfiles
        : null,
    },
  };
};

export const getQuestionPrimaryTeksCodes = (question = {}) => normalizeQuestionStandards(question).primary.map((entry) => entry.code);

export const getQuestionMetadataIssues = (question = {}) => {
  const metadata = normalizeQuestionInstructionalMetadata(question);
  const issues = [];
  if (!metadata.standards.primary.length) issues.push('No primary TEKS');
  if (!metadata.complexity.level) issues.push('No DOK level');
  metadata.standards.primary.forEach((entry) => {
    if (!getTexasStandard(entry.code)) issues.push(`TEKS ${entry.code} is not in a loaded Texas Math registry`);
  });
  return unique(issues);
};

export const getQuestionMetadataSummary = (question = {}) => {
  const metadata = normalizeQuestionInstructionalMetadata(question);
  const primary = metadata.standards.primary.map((entry) => entry.code);
  const difficulty = INSTRUCTIONAL_LEVELS.find((entry) => entry.band === metadata.difficulty.generatorBand);
  return {
    primary,
    dok: metadata.complexity.level,
    difficultyLabel: difficulty?.label || 'Grade Level',
    purpose: getPurposeDefinition(metadata.purpose)?.label || metadata.purpose,
    evidenceWeight: metadata.evidenceWeight,
    differentiationMode: metadata.differentiation.mode,
    issues: getQuestionMetadataIssues(question),
  };
};

export const buildCanonicalQuestionMetadataPatch = ({
  question,
  primaryCodes,
  primaryLevel = 'assessed',
  secondaryCodes,
  prerequisiteCodes,
  dok,
  instructionalLevel,
  generatorBand,
  purpose,
  evidenceWeight,
  differentiationMode,
}) => {
  const existing = question || {};
  const buildEntries = (codes, level) => unique((Array.isArray(codes) ? codes : []).map(normalizeTeksCode))
    .map((code) => ({ code, courseId: getTexasStandard(code)?.courseId || null, level }));
  const normalizedBand = Math.max(1, Math.min(5, Number(generatorBand) || 3));
  const levelEntry = INSTRUCTIONAL_LEVELS.find((entry) => entry.key === instructionalLevel)
    || INSTRUCTIONAL_LEVELS.find((entry) => entry.band === normalizedBand)
    || INSTRUCTIONAL_LEVELS[2];

  return {
    ...existing,
    standards: {
      ...(existing.standards && typeof existing.standards === 'object' && !Array.isArray(existing.standards) ? existing.standards : {}),
      primary: buildEntries(primaryCodes, primaryLevel),
      secondary: buildEntries(secondaryCodes, 'practiced'),
      prerequisite: buildEntries(prerequisiteCodes, 'prerequisite'),
    },
    complexity: {
      ...(existing.complexity || {}),
      framework: 'DOK',
      level: Math.max(1, Math.min(4, Number(dok) || 2)),
    },
    difficulty: {
      ...(existing.difficulty || {}),
      instructionalLevel: levelEntry.key,
      generatorBand: levelEntry.band,
    },
    purpose,
    evidenceWeight: Math.max(0, Math.min(2, Number.isFinite(Number(evidenceWeight)) ? Number(evidenceWeight) : getPurposeDefinition(purpose).defaultWeight)),
    differentiation: {
      ...(existing.differentiation || {}),
      mode: ['off', 'recommend', 'auto'].includes(differentiationMode) ? differentiationMode : 'recommend',
    },
  };
};

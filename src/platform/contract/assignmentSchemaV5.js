export const ASSIGNMENT_SCHEMA_VERSION = 5;
export const ASSIGNMENT_SCHEMA_NAME = 'MathMaster Assignment V5';

export const V5_SECTION_ROLES = Object.freeze([
  'warmup',
  'classwork',
  'practice',
  'dol',
  'quiz',
  'test',
]);

export const V5_VARIANT_MODES = Object.freeze([
  'shared',
  'personalized',
  'adaptive',
]);

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

const defaultOutputProfiles = () => ({
  digital: { enabled: true },
  studentWorksheetPdf: { enabled: true, includeAnswers: false, includeWorkspace: true },
  teacherWorksheetPdf: { enabled: false, includeAnswers: true, includeSolutions: true },
  answerKeyPdf: { enabled: false },
  lessonNotesPdf: { enabled: true, targetPages: 2 },
});

const normalizeSection = (section, index) => {
  const source = isObject(section) ? section : {};
  const role = V5_SECTION_ROLES.includes(clean(source.role).toLowerCase())
    ? clean(source.role).toLowerCase()
    : 'classwork';
  return {
    ...source,
    id: clean(source.id) || `section-${index + 1}`,
    role,
    title: clean(source.title) || ({
      warmup: 'Warm-Up',
      classwork: 'Classwork',
      practice: 'Practice',
      dol: 'DOL',
      quiz: 'Quiz',
      test: 'Test',
    }[role] || 'Activity'),
    questions: Array.isArray(source.questions) ? source.questions : [],
  };
};

const normalizeVariantPolicy = (raw = {}) => {
  const source = isObject(raw) ? raw : {};
  const requestedMode = clean(source.mode).toLowerCase();
  const mode = V5_VARIANT_MODES.includes(requestedMode) ? requestedMode : 'personalized';
  const sectionModes = isObject(source.sectionModes)
    ? Object.fromEntries(Object.entries(source.sectionModes)
      .map(([role, value]) => [clean(role).toLowerCase(), clean(value).toLowerCase()])
      .filter(([role, value]) => V5_SECTION_ROLES.includes(role) && V5_VARIANT_MODES.includes(value)))
    : {};
  return {
    mode,
    sectionModes,
    avoidRecentTemplates: source.avoidRecentTemplates !== false,
    avoidDuplicateParameters: source.avoidDuplicateParameters !== false,
  };
};

export const normalizeAssignmentV5 = (input = {}) => {
  if (!isObject(input)) throw new Error('MathMaster Assignment V5 must be a JSON object.');
  const assignmentSource = isObject(input.assignment) ? input.assignment : {};
  const outputSource = isObject(input.outputProfiles) ? input.outputProfiles : {};
  const defaults = defaultOutputProfiles();

  return {
    ...input,
    schemaVersion: ASSIGNMENT_SCHEMA_VERSION,
    assignment: {
      ...assignmentSource,
      title: clean(assignmentSource.title),
      courseId: clean(assignmentSource.courseId),
      folder: clean(assignmentSource.folder) || null,
      instructionalPurpose: clean(assignmentSource.instructionalPurpose) || 'lesson',
      gradingPurpose: clean(assignmentSource.gradingPurpose) || null,
    },
    sections: (Array.isArray(input.sections) ? input.sections : []).map(normalizeSection),
    variantPolicy: normalizeVariantPolicy(input.variantPolicy),
    differentiationPolicy: {
      mode: 'bounded',
      allowStandardChange: false,
      preserveAssessmentFidelity: true,
      ...(isObject(input.differentiationPolicy) ? input.differentiationPolicy : {}),
      honors: {
        mode: 'inheritDestinationClass',
        ccmrPracticeTargetShare: 0.15,
        shortSectionExemptionMaxQuestions: 3,
        ...(isObject(input.differentiationPolicy?.honors) ? input.differentiationPolicy.honors : {}),
      },
    },
    supportPolicy: {
      mode: 'inheritStudentProfile',
      modificationsAllowed: false,
      ...(isObject(input.supportPolicy) ? input.supportPolicy : {}),
    },
    toolPolicy: {
      calculator: 'inherit',
      keyboard: 'auto',
      ...(isObject(input.toolPolicy) ? input.toolPolicy : {}),
    },
    deliveryPolicy: {
      sectionGating: 'rolePolicy',
      ...(isObject(input.deliveryPolicy) ? input.deliveryPolicy : {}),
    },
    gradingPolicy: {
      attemptPolicy: 'rolePolicy',
      scoring: 'platformDefault',
      ...(isObject(input.gradingPolicy) ? input.gradingPolicy : {}),
    },
    evidencePolicy: {
      gradeEligible: true,
      masteryEligible: true,
      recommendationEligible: true,
      analyticsEligible: true,
      ...(isObject(input.evidencePolicy) ? input.evidencePolicy : {}),
    },
    outputProfiles: {
      ...defaults,
      ...outputSource,
      digital: { ...defaults.digital, ...(isObject(outputSource.digital) ? outputSource.digital : {}) },
      studentWorksheetPdf: { ...defaults.studentWorksheetPdf, ...(isObject(outputSource.studentWorksheetPdf) ? outputSource.studentWorksheetPdf : {}) },
      teacherWorksheetPdf: { ...defaults.teacherWorksheetPdf, ...(isObject(outputSource.teacherWorksheetPdf) ? outputSource.teacherWorksheetPdf : {}) },
      answerKeyPdf: { ...defaults.answerKeyPdf, ...(isObject(outputSource.answerKeyPdf) ? outputSource.answerKeyPdf : {}) },
      lessonNotesPdf: { ...defaults.lessonNotesPdf, ...(isObject(outputSource.lessonNotesPdf) ? outputSource.lessonNotesPdf : {}) },
    },
    classroomIntegration: isObject(input.classroomIntegration) ? input.classroomIntegration : {},
    provenance: {
      contentRelease: null,
      templateVersion: null,
      generatorVersion: null,
      graderVersion: null,
      ...(isObject(input.provenance) ? input.provenance : {}),
    },
    preflight: {
      required: true,
      ...(isObject(input.preflight) ? input.preflight : {}),
    },
  };
};

export const validateAssignmentV5 = (input = {}, { requireQuestions = true } = {}) => {
  const errors = [];
  const warnings = [];

  if (!isObject(input)) {
    return { errors: ['MathMaster Assignment V5 must be a JSON object.'], warnings };
  }
  if (Number(input.schemaVersion) !== ASSIGNMENT_SCHEMA_VERSION) {
    errors.push(`Only schemaVersion ${ASSIGNMENT_SCHEMA_VERSION} is accepted. V4 and earlier assignments are intentionally unsupported.`);
  }
  if (!isObject(input.assignment)) {
    errors.push('V5 requires an assignment object.');
  } else {
    if (!clean(input.assignment.title)) errors.push('assignment.title is required.');
    if (!clean(input.assignment.courseId)) errors.push('assignment.courseId is required.');
  }
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    errors.push('V5 requires a non-empty sections array.');
  } else {
    const ids = new Set();
    let questionCount = 0;
    input.sections.forEach((section, index) => {
      if (!isObject(section)) {
        errors.push(`Section ${index + 1} must be an object.`);
        return;
      }
      const id = clean(section.id) || `section-${index + 1}`;
      if (ids.has(id)) errors.push(`Section id "${id}" is duplicated.`);
      ids.add(id);
      const role = clean(section.role).toLowerCase();
      if (!V5_SECTION_ROLES.includes(role)) {
        errors.push(`Section ${index + 1} has invalid role "${section.role}".`);
      }
      if (!Array.isArray(section.questions)) {
        errors.push(`Section ${index + 1} is missing a questions array.`);
      } else {
        questionCount += section.questions.length;
      }
    });
    if (requireQuestions && questionCount === 0) errors.push('V5 contains no questions.');
  }

  const variantMode = clean(input.variantPolicy?.mode).toLowerCase();
  if (variantMode && !V5_VARIANT_MODES.includes(variantMode)) {
    errors.push(`variantPolicy.mode must be one of: ${V5_VARIANT_MODES.join(', ')}.`);
  }

  if (input.supportPolicy?.modificationsAllowed === true) {
    warnings.push('supportPolicy.modificationsAllowed is true. Preflight should make the instructional-target change explicit to the teacher.');
  }
  if (input.outputProfiles?.teacherWorksheetPdf?.enabled === true) {
    warnings.push('teacherWorksheetPdf is declared but the current renderer does not yet print worked solutions; keep this disabled until the teacher-key renderer is completed.');
  }
  if (input.outputProfiles?.answerKeyPdf?.enabled === true) {
    warnings.push('answerKeyPdf is declared but the dedicated answer-key renderer is not yet completed.');
  }

  return { errors, warnings };
};

export const flattenV5Sections = (input = {}) => (
  (Array.isArray(input.sections) ? input.sections : []).flatMap((section) => (
    (Array.isArray(section?.questions) ? section.questions : []).map((question) => ({
      ...question,
      activityRole: question?.activityRole || section.role || 'classwork',
      sectionId: section.id,
      sectionTitle: section.title,
    }))
  ))
);


export const rebuildV5SectionsFromQuestions = (source = {}, questions = []) => {
  const sourceSections = Array.isArray(source?.sections) ? source.sections : [];
  const remaining = [...(Array.isArray(questions) ? questions : [])];
  const takeMatching = (section) => {
    const matches = [];
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const question = remaining[index];
      const sameId = clean(question?.sectionId) && clean(question.sectionId) === clean(section.id);
      const sameRole = !clean(question?.sectionId)
        && clean(question?.activityRole).toLowerCase() === clean(section.role).toLowerCase();
      if (sameId || sameRole) {
        matches.unshift(question);
        remaining.splice(index, 1);
      }
    }
    return matches;
  };

  const sections = sourceSections.map((section, index) => {
    const normalized = normalizeSection(section, index);
    return { ...normalized, questions: takeMatching(normalized) };
  });

  remaining.forEach((question) => {
    const role = V5_SECTION_ROLES.includes(clean(question?.activityRole).toLowerCase())
      ? clean(question.activityRole).toLowerCase()
      : 'practice';
    let section = sections.find((entry) => entry.role === role);
    if (!section) {
      section = normalizeSection({ role, title: {
        warmup: 'Warm-Up',
        classwork: 'Classwork',
        practice: 'Practice',
        dol: 'DOL',
        quiz: 'Quiz',
        test: 'Test',
      }[role], questions: [] }, sections.length);
      sections.push(section);
    }
    section.questions.push(question);
  });

  return sections;
};

export const ASSIGNMENT_SCHEMA_VERSION = 5;
export const ASSIGNMENT_SCHEMA_NAME = 'MathMaster Assignment V5';

export const V5_SECTION_ROLES = Object.freeze([
  'warmup',
  'classwork',
  'practice',
  'review',
  'dol',
  'quiz',
  'test',
  'retest',
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
  // Library creation is a digital-content action. Printable artifacts are
  // opt-in so a question that is excellent digitally is not blocked from the
  // Library merely because it has not yet passed page-fit/print-fidelity rules.
  // Teachers can enable any PDF later from Assignment Setup/Preflight.
  studentWorksheetPdf: { enabled: false, includeAnswers: false, includeWorkspace: true },
  teacherWorksheetPdf: { enabled: false, includeAnswers: true, includeSolutions: true, includeWorkspace: true },
  answerKeyPdf: { enabled: false, includeAnswers: true, includeSolutions: false, includeWorkspace: false },
  lessonNotesPdf: { enabled: false, targetPages: 2 },
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
      review: 'Review',
      dol: 'DOL',
      quiz: 'Quiz',
      test: 'Test',
      retest: 'Retest',
    }[role] || 'Activity'),
    questions: Array.isArray(source.questions) ? source.questions : [],
  };
};

const questionIdPart = (value, fallback) => (
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  || fallback
);

/**
 * questionId is MathMaster-owned identity, not authoring content.
 *
 * Repair Center selection, teacher flags, revision history, and outside-AI
 * repair packets all join on this value. Letting a missing id reach those
 * systems makes several questions share the same empty key. The canonical V5
 * boundary therefore gives every question a deterministic identity before any
 * review workflow sees it. Existing unique ids are immutable; only missing or
 * duplicate ids are synthesized.
 */
const normalizeQuestionIds = (sections = []) => {
  const reserved = new Set(
    sections.flatMap((section) => (
      Array.isArray(section?.questions) ? section.questions : []
    )).map((question) => clean(question?.questionId)).filter(Boolean),
  );
  const claimed = new Set();

  return sections.map((section, sectionIndex) => ({
    ...section,
    questions: (Array.isArray(section?.questions) ? section.questions : []).map((question, questionIndex) => {
      const sourceQuestion = isObject(question) ? question : {};
      const existing = clean(sourceQuestion.questionId);
      if (existing && !claimed.has(existing)) {
        claimed.add(existing);
        return { ...sourceQuestion, questionId: existing };
      }

      const sectionPart = questionIdPart(section?.id || section?.role, `section-${sectionIndex + 1}`);
      const base = `q_${sectionPart}_${sectionIndex + 1}_${questionIndex + 1}`;
      let candidate = base;
      let suffix = 2;
      while (reserved.has(candidate) || claimed.has(candidate)) {
        candidate = `${base}_${suffix}`;
        suffix += 1;
      }
      claimed.add(candidate);
      return { ...sourceQuestion, questionId: candidate };
    }),
  }));
};

/**
 * Upgrade identity on an already-shaped V5 assignment without changing any
 * other authoring fields. This is used when an older saved Incomplete draft is
 * reopened: it needs modern immutable ids, but reopening must not silently add
 * unrelated defaults or rewrite the teacher's saved JSON.
 */
export const ensureAssignmentV5QuestionIds = (input = {}) => {
  if (!isObject(input)) throw new Error('MathMaster Assignment V5 must be a JSON object.');
  return {
    ...input,
    sections: normalizeQuestionIds(Array.isArray(input.sections) ? input.sections : []),
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

const normalizeAssessmentPolicy = (raw = null) => {
  if (!isObject(raw) || clean(raw.mode) !== 'testCycle') return null;
  const passingScore = Number(raw.passingScore);
  return {
    ...raw,
    mode: 'testCycle',
    passingScore: Number.isFinite(passingScore) ? Math.max(0, Math.min(100, passingScore)) : 70,
    review: {
      required: raw?.review?.required !== false,
      ...(isObject(raw.review) ? raw.review : {}),
    },
    test: {
      ...(isObject(raw.test) ? raw.test : {}),
      feedback: 'teacherRelease',
    },
    retest: {
      strategy: clean(raw?.retest?.strategy) || 'shortForm',
      scorePolicy: clean(raw?.retest?.scorePolicy) || 'replaceIfHigher',
      ...(isObject(raw.retest) ? raw.retest : {}),
    },
  };
};

export const normalizeAssignmentV5 = (input = {}) => {
  if (!isObject(input)) throw new Error('MathMaster Assignment V5 must be a JSON object.');
  const assignmentSource = isObject(input.assignment) ? input.assignment : {};
  const outputSource = isObject(input.outputProfiles) ? input.outputProfiles : {};
  const defaults = defaultOutputProfiles();
  const normalizedSections = (Array.isArray(input.sections) ? input.sections : []).map(normalizeSection);

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
    sections: normalizeQuestionIds(normalizedSections),
    assessmentPolicy: normalizeAssessmentPolicy(input.assessmentPolicy),
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
        section.questions.forEach((question, questionIndex) => {
          if (question?.questionWeight === undefined || question?.questionWeight === null || question?.questionWeight === '') return;
          const weight = Number(question.questionWeight);
          if (!Number.isFinite(weight) || weight < 0.25 || weight > 20) {
            errors.push(`Section ${index + 1} Question ${questionIndex + 1} questionWeight must be between 0.25 and 20.`);
          }
        });
      }
    });
    if (requireQuestions && questionCount === 0) errors.push('V5 contains no questions.');

  if (clean(input?.assessmentPolicy?.mode) === 'testCycle') {
    const roles = new Set((Array.isArray(input.sections) ? input.sections : [])
      .map((section) => clean(section?.role).toLowerCase()));
    if (!roles.has('review')) errors.push('Test Cycle assignments require a review section.');
    if (!roles.has('test')) errors.push('Test Cycle assignments require a test section.');
    if (!roles.has('retest')) errors.push('Test Cycle assignments require a retest section.');
  }
  }

  const variantMode = clean(input.variantPolicy?.mode).toLowerCase();
  if (variantMode && !V5_VARIANT_MODES.includes(variantMode)) {
    errors.push(`variantPolicy.mode must be one of: ${V5_VARIANT_MODES.join(', ')}.`);
  }

  if (input.supportPolicy?.modificationsAllowed === true) {
    warnings.push('supportPolicy.modificationsAllowed is true. Preflight should make the instructional-target change explicit to the teacher.');
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
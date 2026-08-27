const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const REQUIRED_V5_POLICY_FIELDS = Object.freeze([
  'variantPolicy',
  'differentiationPolicy',
  'supportPolicy',
  'toolPolicy',
  'deliveryPolicy',
  'gradingPolicy',
  'evidencePolicy',
  'outputProfiles',
]);

const questionAlignmentCodes = (question = {}) => {
  const out = [];
  asArray(question.alignments).forEach((alignment) => {
    if (!isObject(alignment)) return;
    const framework = clean(alignment.framework).toLowerCase();
    if (!framework || framework === 'teks') out.push(clean(alignment.code));
  });
  [
    question.primaryTEKS,
    question.teks,
    question.standard,
    question.primaryStandard,
    ...asArray(question.standards),
  ].forEach((value) => {
    if (typeof value === 'string' || typeof value === 'number') out.push(clean(value));
  });
  return out.filter(Boolean);
};

export const inferAssignmentCourseIdForHealth = (assignment = {}) => {
  const direct = clean(
    assignment.courseId
    || assignment.assignment?.courseId
    || assignment.courseProfile?.course
    || assignment.course,
  );
  if (direct) {
    return { courseId: direct, source: 'stored-course', confidence: 'exact' };
  }

  const questions = [
    ...asArray(assignment.questions),
    ...asArray(assignment.sections).flatMap((section) => asArray(section?.questions)),
  ];
  const codes = [
    ...asArray(assignment.standards).map(clean),
    ...questions.flatMap(questionAlignmentCodes),
  ].map((value) => value.toUpperCase()).filter(Boolean);

  if (codes.some((code) => /^(?:A2|2A)[.\s:-]/.test(code))) {
    return { courseId: 'algebra2', source: 'teks', confidence: 'exact' };
  }
  if (codes.some((code) => /^A[.\s:-]/.test(code))) {
    return { courseId: 'algebra1', source: 'teks', confidence: 'exact' };
  }
  return { courseId: null, source: null, confidence: 'unknown' };
};

const contentCounts = (assignment = {}) => {
  const sections = asArray(assignment.sections).filter(isObject);
  const sectionQuestions = sections.reduce((sum, section) => sum + asArray(section.questions).length, 0);
  const flatQuestions = asArray(assignment.questions).length;
  return {
    sections: sections.length,
    sectionQuestions,
    flatQuestions,
    questions: Math.max(sectionQuestions, flatQuestions),
  };
};

export const inspectAssignmentV5Health = (assignment = {}, { id = null } = {}) => {
  const schemaVersion = Number(assignment.schemaVersion);
  const counts = contentCounts(assignment);
  const course = inferAssignmentCourseIdForHealth(assignment);
  const missingPolicies = REQUIRED_V5_POLICY_FIELDS.filter((field) => !isObject(assignment[field]));
  const safePatch = {};
  const safeFixes = [];
  const reviewReasons = [];

  if (schemaVersion !== 5) {
    reviewReasons.push({
      code: 'legacy-schema',
      message: `Uses schemaVersion ${Number.isFinite(schemaVersion) ? schemaVersion : 'unknown'}; content conversion requires Assignment Review.`,
    });
  }
  if (counts.sections === 0 || counts.sectionQuestions === 0) {
    reviewReasons.push({
      code: 'missing-canonical-sections',
      message: 'Does not contain populated canonical sections[].',
    });
  }
  if (counts.questions === 0) {
    reviewReasons.push({
      code: 'no-questions',
      message: 'Contains no questions.',
    });
  }
  if (!course.courseId) {
    reviewReasons.push({
      code: 'course-unknown',
      message: 'Course cannot be proven from stored course metadata or TEKS.',
    });
  }
  if (schemaVersion === 5 && missingPolicies.length) {
    reviewReasons.push({
      code: 'missing-policy-groups',
      message: `Missing policy groups: ${missingPolicies.join(', ')}. These are not auto-authored during migration.`,
    });
  }

  // Safe automatic repair is deliberately metadata-only. It never changes
  // questions, answers, standards, sections, rigor, support policy, or grading.
  if (schemaVersion === 5 && counts.sections > 0 && counts.sectionQuestions > 0) {
    if (!clean(assignment.courseId) && course.courseId) {
      safePatch.courseId = course.courseId;
      safeFixes.push(`Set courseId to ${course.courseId} from ${course.source}.`);
    }
    if (Number(assignment.runtimeProjectionVersion) !== 1) {
      safePatch.runtimeProjectionVersion = 1;
      safeFixes.push('Set runtimeProjectionVersion to 1.');
    }
  }

  const needsReview = reviewReasons.length > 0;
  const hasSafeFix = Object.keys(safePatch).length > 0;
  const status = needsReview ? 'needs-review' : hasSafeFix ? 'safe-fix' : 'healthy';

  return {
    id: clean(id || assignment.id) || null,
    title: clean(assignment.title || assignment.assignment?.title) || 'Untitled assignment',
    schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : null,
    courseId: course.courseId,
    courseSource: course.source,
    counts,
    missingPolicies,
    status,
    safePatch,
    safeFixes,
    reviewReasons,
  };
};

export const summarizeAssignmentV5Health = (records = []) => {
  const items = asArray(records).map((entry) => (
    entry?.health || inspectAssignmentV5Health(entry?.assignment || entry, { id: entry?.id })
  ));
  const byStatus = {
    healthy: items.filter((item) => item.status === 'healthy').length,
    safeFix: items.filter((item) => item.status === 'safe-fix').length,
    needsReview: items.filter((item) => item.status === 'needs-review').length,
  };
  return {
    total: items.length,
    ...byStatus,
    safePatchCount: items.filter((item) => Object.keys(item.safePatch || {}).length > 0).length,
    items,
  };
};

export default inspectAssignmentV5Health;

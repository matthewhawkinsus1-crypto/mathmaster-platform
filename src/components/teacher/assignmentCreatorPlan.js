import { buildAuthoringContract } from '../../platform/contract/authoringContract.js';

export const CREATOR_SECTION_DEFAULTS = Object.freeze({
  warmup: Object.freeze({ enabled: true, count: 3, mode: 'shared', label: 'Warm-Up' }),
  classwork: Object.freeze({ enabled: true, count: 6, mode: 'shared', label: 'Classwork' }),
  practice: Object.freeze({ enabled: true, count: 8, mode: 'personalized', label: 'Practice' }),
  dol: Object.freeze({ enabled: true, count: 2, mode: 'shared', label: 'DOL' }),
  quiz: Object.freeze({ enabled: false, count: 8, mode: 'shared', label: 'Quiz' }),
  test: Object.freeze({ enabled: false, count: 15, mode: 'shared', label: 'Test' }),
});

const clean = (value) => String(value ?? '').trim();

export const CREATOR_RIGOR_PRESETS = Object.freeze({
  balanced: Object.freeze({
    label: 'Grade-level balanced',
    summary: 'Keep the lesson at its intended course level with a purposeful mix of recall, application, and reasoning.',
  }),
  supportive: Object.freeze({
    label: 'More support, same standard',
    summary: 'Use friendlier numbers, clearer chunking, and stronger Classwork scaffolds without lowering the assessed standard.',
  }),
  challenge: Object.freeze({
    label: 'More challenge / transfer',
    summary: 'Increase reasoning, representation changes, and transfer while staying inside the lesson and course standard.',
  }),
});

const clampCount = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(30, Math.round(n)));
};

export const defaultAssignmentCreatorPlan = (courseId = 'algebra1') => ({
  courseId,
  title: '',
  topic: '',
  instructionalPurpose: 'lesson',
  gradingPurpose: 'classwork',
  overallVariantMode: 'personalized',
  adaptivePractice: false,
  rigorPreset: 'balanced',
  supportMode: 'inheritStudentProfile',
  modificationsAllowed: false,
  sections: Object.fromEntries(Object.entries(CREATOR_SECTION_DEFAULTS).map(([role, config]) => [
    role,
    { ...config },
  ])),
  outputs: {
    studentWorksheetPdf: true,
    teacherWorksheetPdf: true,
    answerKeyPdf: true,
    lessonNotesPdf: true,
  },
  teacherNotes: '',
});

export const normalizeAssignmentCreatorPlan = (input = {}) => {
  const base = defaultAssignmentCreatorPlan(clean(input.courseId) || 'algebra1');
  const rawSections = input.sections && typeof input.sections === 'object' && !Array.isArray(input.sections)
    ? input.sections
    : {};

  const sections = Object.fromEntries(Object.entries(base.sections).map(([role, defaults]) => {
    const source = rawSections[role] && typeof rawSections[role] === 'object' ? rawSections[role] : {};
    let mode = clean(source.mode) || defaults.mode;
    if (!['shared', 'personalized', 'adaptive'].includes(mode)) mode = defaults.mode;
    if (role === 'practice' && input.adaptivePractice === true) mode = 'adaptive';
    return [role, {
      ...defaults,
      ...source,
      enabled: source.enabled == null ? defaults.enabled : source.enabled !== false,
      count: clampCount(source.count, defaults.count),
      mode,
    }];
  }));

  return {
    ...base,
    ...input,
    courseId: clean(input.courseId) || base.courseId,
    title: clean(input.title),
    topic: clean(input.topic),
    instructionalPurpose: clean(input.instructionalPurpose) || base.instructionalPurpose,
    gradingPurpose: clean(input.gradingPurpose) || base.gradingPurpose,
    overallVariantMode: ['shared', 'personalized', 'adaptive'].includes(clean(input.overallVariantMode))
      ? clean(input.overallVariantMode)
      : base.overallVariantMode,
    adaptivePractice: input.adaptivePractice === true,
    rigorPreset: Object.prototype.hasOwnProperty.call(CREATOR_RIGOR_PRESETS, clean(input.rigorPreset))
      ? clean(input.rigorPreset)
      : base.rigorPreset,
    // These are intentionally normalized back to the platform-safe values.
    // A teacher assignment may describe pedagogy, but it must never embed or
    // override a student's IEP/504/EB entitlement record.
    supportMode: 'inheritStudentProfile',
    modificationsAllowed: false,
    sections,
    outputs: {
      studentWorksheetPdf: input.outputs?.studentWorksheetPdf !== false,
      teacherWorksheetPdf: input.outputs?.teacherWorksheetPdf !== false,
      answerKeyPdf: input.outputs?.answerKeyPdf !== false,
      lessonNotesPdf: input.outputs?.lessonNotesPdf !== false,
    },
    teacherNotes: clean(input.teacherNotes),
  };
};

const sectionInstruction = ([role, section]) => (
  section.enabled
    ? `- ${section.label || role}: approximately ${section.count} question${section.count === 1 ? '' : 's'}; delivery mode ${section.mode}.`
    : null
);

export const buildAssignmentCreatorRequest = (input = {}, { generatedAt = new Date() } = {}) => {
  const plan = normalizeAssignmentCreatorPlan(input);
  const contract = buildAuthoringContract({ courseId: plan.courseId, generatedAt });
  const enabledSections = Object.entries(plan.sections).filter(([, section]) => section.enabled);
  const rigor = CREATOR_RIGOR_PRESETS[plan.rigorPreset] || CREATOR_RIGOR_PRESETS.balanced;

  if (!clean(plan.topic)) {
    throw new Error('Describe the lesson/topic before copying the AI build request.');
  }
  if (!enabledSections.length) {
    throw new Error('Turn on at least one assignment section.');
  }

  const outputNotes = [
    `- Student worksheet PDF: ${plan.outputs.studentWorksheetPdf ? 'enabled' : 'disabled'}.`,
    `- Teacher copy PDF with answers/available solutions: ${plan.outputs.teacherWorksheetPdf ? 'enabled' : 'disabled'}.`,
    `- Compact answer-key PDF: ${plan.outputs.answerKeyPdf ? 'enabled' : 'disabled'}.`,
    `- Separate lesson-notes PDF: ${plan.outputs.lessonNotesPdf ? 'enabled' : 'disabled'}.`,
  ];

  return [
    contract,
    '',
    '# Teacher build request',
    '',
    `Course: ${plan.courseId}`,
    `Assignment title: ${plan.title || 'Choose a clear title from the topic'}`,
    `Instructional purpose: ${plan.instructionalPurpose}`,
    `Grading purpose: ${plan.gradingPurpose}`,
    `Overall variation: ${plan.overallVariantMode}`,
    `Rigor emphasis: ${rigor.label}`,
    `Rigor guidance: ${rigor.summary}`,
    'Student supports: inherit each student\'s server-resolved plan at delivery; do not embed accommodations in assignment JSON.',
    'Curriculum modifications: not allowed in this standard assignment creator.',
    '',
    '## Lesson/topic',
    plan.topic,
    '',
    '## Sections to author',
    ...enabledSections.map(sectionInstruction).filter(Boolean),
    '',
    '## Output choices',
    ...outputNotes,
    '',
    '## Required quality decisions',
    '- Treat the section counts as targets, not a reason to split one rich composed task into artificial fragments.',
    '- Classwork should support instruction; Practice should preserve lesson rigor with less scaffolding.',
    '- Use the source-appropriate representation (graph/table/mapping/number line/modeling workspace) rather than flattening rich tasks into generic text entry.',
    '- DOK and difficulty are separate. Include a purposeful spread appropriate to the lesson rather than mechanically increasing both together.',
    `- Apply this teacher-selected rigor emphasis: ${rigor.summary}`,
    '- Supportive does NOT mean a different standard or modified curriculum. It means access/scaffolding and friendlier complexity while preserving the assigned course target.',
    '- Challenge does NOT authorize later-unit or later-course mathematics. Increase reasoning/transfer only inside the lesson ceiling.',
    '- If this assignment is later sent to an Honors class, MathMaster will inherit Honors placement in Preflight. Author enough depth/transfer to support that route without changing the course standard.',
    '- For Honors-ready Practice, preserve the MathMaster CCMR policy: authentic exam-style transfer should be roughly 15% over the recent sequence, using only legitimate TEKS-to-assessment overlap.',
    '- Never make a generated expected answer independent of the generator parameters that create its prompt.',
    '- Make every required symbol/notation enterable by the declared interaction; MathMaster owns the keyboard/renderer implementation.',
    ...(plan.teacherNotes ? ['', '## Additional teacher directions', plan.teacherNotes] : []),
    '',
    'Return exactly one complete MathMaster Assignment V5 JSON object and no commentary.',
  ].join('\n');
};

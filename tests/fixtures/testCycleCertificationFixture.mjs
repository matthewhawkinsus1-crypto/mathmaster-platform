/*
 * THE TEST CYCLE CERTIFICATION FIXTURE.
 *
 * One small Algebra course Test Cycle, shaped so an end-to-end run can hit
 * EXACT scores rather than approximate ones. Issue #224 asks for a failing Test
 * of 52 and a raw Retest of 84, and "roughly 52" would not prove the cap.
 *
 * HOW THE EXACT SCORES ARE POSSIBLE.
 *
 * Every slot carries weight 1 and the Test is 25 questions, so 13 correct is
 * 52% on the nose. The retest is pinned to 25 questions by policy, so 21
 * correct is 84%. Nothing here rounds.
 *
 * HOW THE HARNESS KNOWS THE ANSWER WITHOUT READING THE KEY.
 *
 * It does not read the key — that is the whole security model, and a fixture
 * that needed `privateGrading` to drive a student would be proving the wrong
 * thing. Instead each family asks a question whose answer is visible in the
 * PROMPT the student receives: "compute 7 + 12". The harness reads the
 * sanitized prompt exactly as a student's browser would, and decides to answer
 * correctly or wrongly. Correctness is still graded server-side against a key
 * the harness never sees.
 *
 * TEST-ONLY. Nothing here is seeded into production. The emulator harness
 * writes these families into the emulator's own `pathQuestionBank` and deletes
 * them afterwards; the ids are prefixed `cert_` so a stray document is
 * identifiable at a glance.
 */

export const CERT_PREFIX = 'cert_';
export const CERT_COURSE_ID = 'algebra1';
export const CERT_CLASS_ID = 'cert-class-alg1';
export const CERT_OTHER_CLASS_ID = 'cert-class-other';
export const CERT_ASSIGNMENT_ID = 'cert-test-cycle-assignment';

/*
 * Five targets, five questions each: 25 secure questions.
 *
 * Two are anchors, which is what a retest needs in order to carry anchor
 * coverage from the rest of the blueprint. DOK, difficulty band and
 * representation deliberately differ per target so "blueprint equivalence is
 * preserved across students" is a claim with something to compare.
 */
export const CERT_TARGETS = Object.freeze([
  { targetId: 'tA', alignmentKey: 'texas:A.5A', label: 'Solving linear equations', dok: 2, difficultyBand: 3, representation: 'symbolic', anchor: true, questionCount: 5 },
  { targetId: 'tB', alignmentKey: 'texas:A.7C', label: 'Quadratic key features', dok: 3, difficultyBand: 4, representation: 'graph', anchor: true, questionCount: 5 },
  { targetId: 'tC', alignmentKey: 'texas:A.9B', label: 'Exponential growth', dok: 2, difficultyBand: 2, representation: 'table', anchor: false, questionCount: 5 },
  { targetId: 'tD', alignmentKey: 'texas:A.3C', label: 'Slope from two points', dok: 1, difficultyBand: 2, representation: 'numeric', anchor: false, questionCount: 5 },
  { targetId: 'tE', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, representation: 'verbal', anchor: false, questionCount: 5 },
]);

// Six families per target: enough to fill five Test slots from distinct
// families AND leave one the student has not met for the Retest to prefer.
const FAMILIES_PER_TARGET = 6;

export const CERT_TOTAL_QUESTIONS = CERT_TARGETS.reduce((sum, target) => sum + target.questionCount, 0);

/** The prompt a student sees. The harness reads the two operands back out. */
const promptFor = (slug) => `Certification item ${slug}: compute {{a}} + {{b}}.`;

export const CERT_PROMPT_PATTERN = /compute\s+(\d+)\s*\+\s*(\d+)/;

/**
 * The correct answer to an issued certification question, read from its prompt.
 *
 * Returns null for anything that is not a certification item, so a harness that
 * accidentally meets a real bank question fails loudly instead of guessing.
 */
export const certAnswerFromPrompt = (prompt) => {
  const match = CERT_PROMPT_PATTERN.exec(String(prompt ?? ''));
  if (!match) return null;
  return String(Number(match[1]) + Number(match[2]));
};

/** A deliberately wrong answer, far enough from any sum to never collide. */
export const CERT_WRONG_ANSWER = '-999999';

/**
 * One approved, validated, generator-backed family.
 *
 * `generator.parameters` is what makes it parallel-capable — the issuance
 * planner treats a family with no generator as unable to mint a fresh variant,
 * and a retest built on those would hand a student the same item back.
 */
const buildFamily = (target, index) => {
  const slug = `${target.targetId}-${index + 1}`;
  return {
    id: `${CERT_PREFIX}${slug}`,
    active: true,
    validated: true,
    courseId: CERT_COURSE_ID,
    alignmentKeys: [target.alignmentKey],
    familyId: `${CERT_PREFIX}family:${slug}`,
    familyVersion: 1,
    questionType: 'response',
    activityRole: 'practice',
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    calculatorPolicy: 'inherit',
    assessedConstruct: target.alignmentKey,
    taskType: 'procedural',
    prompt: promptFor(slug),
    responseFields: [
      { id: 'answer', label: 'Sum', inputProfile: 'number', expected: '{{sum}}' },
    ],
    supportHints: [`Add the two numbers shown in item ${slug}.`],
    attemptFeedback: ['Add the two whole numbers exactly as written.'],
    solutionReview: {
      headline: 'Add the two operands.',
      reasoning: ['Both operands are positive whole numbers, so the sum is their total.'],
      answerSummary: '${{sum}}$',
    },
    // Both operands stay positive so no sign-collapsing rewrite can change the
    // prompt the harness parses. The ranges are wide enough that two students
    // drawing the same family still draw different numbers.
    generator: {
      parameters: {
        a: { type: 'int', min: 11, max: 89 },
        b: { type: 'int', min: 11, max: 89 },
      },
      derived: { sum: 'a+b' },
    },
  };
};

/** Every family the fixture installs, across every target. */
export const certFamilies = () => CERT_TARGETS.flatMap((target) => (
  Array.from({ length: FAMILIES_PER_TARGET }, (unused, index) => buildFamily(target, index))
));

export const certFamilyIdsForTarget = (targetId) => (
  Array.from({ length: FAMILIES_PER_TARGET }, (unused, index) => `${CERT_PREFIX}${targetId}-${index + 1}`)
);

/** The approved secure test blueprint. */
export const certBlueprint = () => ({
  blueprintId: `${CERT_PREFIX}blueprint-unit3`,
  version: 1,
  title: 'Certification Unit 3 Test',
  courseId: CERT_COURSE_ID,
  timeLimitSeconds: 45 * 60,
  calculatorMode: 'questionSpecific',
  targets: CERT_TARGETS.map((target) => ({
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    anchor: target.anchor,
    weight: 1,
    questionCount: target.questionCount,
    familyIds: certFamilyIdsForTarget(target.targetId),
  })),
});

/*
 * The assessment policy, with every default #220 specifies made explicit so the
 * certification is asserting the policy it claims to assert.
 *
 * `retest.questionCount` is the one deliberate departure from defaults: pinning
 * the retest to the Test's own length is what makes a raw 84 exact. The default
 * shorter form is certified separately, by asserting the default resolves to a
 * shorter test.
 */
export const certAssessmentPolicy = () => ({
  mode: 'testCycle',
  passingScore: 70,
  review: { required: true },
  test: { secure: true },
  corrections: { requiredForRetest: true, strategy: 'performanceTargeted' },
  retest: {
    secure: true,
    strategy: 'performanceTargetedParallel',
    maxRecordedGrade: 70,
    targetedWeakShare: 0.7,
    anchorShare: 0.3,
    questionCount: CERT_TOTAL_QUESTIONS,
  },
});

/** The Assignment V5 document a teacher would publish. */
export const certAssignment = ({ classIds = [CERT_CLASS_ID] } = {}) => ({
  id: CERT_ASSIGNMENT_ID,
  schemaVersion: 5,
  title: 'Certification Unit 3 Test Cycle',
  courseId: CERT_COURSE_ID,
  assignedClassIds: [...classIds],
  dueAt: '2099-01-01T00:00:00.000Z',
  lateDueAt: '2099-01-08T00:00:00.000Z',
  assignment: { title: 'Certification Unit 3 Test Cycle', courseId: CERT_COURSE_ID },
  assessmentPolicy: certAssessmentPolicy(),
  testBlueprint: certBlueprint(),
  // Review and Corrections are ordinary instructional V5 content. There is
  // deliberately no `test` or `retest` section: those run in the secure exam
  // runtime, and authoring them here would ship their keys to the browser.
  sections: [
    {
      id: 'review',
      role: 'review',
      title: 'Review',
      questions: [
        { questionId: 'cert_review_1', type: 'response', prompt: 'Review warm-up 1' },
        { questionId: 'cert_review_2', type: 'response', prompt: 'Review warm-up 2' },
      ],
    },
    {
      id: 'corrections',
      role: 'corrections',
      title: 'Corrections',
      questions: [
        { questionId: 'cert_corrections_1', type: 'response', prompt: 'Corrections workspace' },
      ],
    },
  ],
});

/* The exact scores #224 asks the certification to produce. */
export const CERT_TEST_CORRECT = 13;           // 13 / 25 = 52%
export const CERT_TEST_SCORE = 52;
export const CERT_RETEST_CORRECT = 21;         // 21 / 25 = 84%
export const CERT_RETEST_RAW_SCORE = 84;
export const CERT_RETEST_CAPPED = 70;
export const CERT_RECORDED_AFTER_RETEST = 70;
// Student B passes outright. 80 is deliberately not 84: a passing score that
// collided with the retest raw score would let a mixed-up assertion still pass.
export const CERT_PASSING_CORRECT = 20;        // 20 / 25 = 80%
export const CERT_PASSING_SCORE = 80;

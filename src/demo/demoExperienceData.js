import demoAssignmentBank from './demoAssignmentBank.json' with { type: 'json' };

export const DEMO_STORAGE_KEY = 'mathmaster:demoData/showcase:v2';

export const DEMO_TEACHER = Object.freeze({
  id: 'demo-teacher-avery-daniels',
  name: 'Avery Daniels',
  email: 'avery.daniels@demo.mathmaster.local',
  role: 'teacher',
  purpose: 'Synthetic teacher account for the full MathMaster demo',
});

export const DEMO_CLASSES = Object.freeze([
  Object.freeze({ id: 'demo-a1-standard', name: 'Algebra I – Standard', course: 'algebra1', courseLevel: 'standard', teacherId: DEMO_TEACHER.id }),
  Object.freeze({ id: 'demo-a1-honors', name: 'Algebra I – Honors', course: 'algebra1', courseLevel: 'honors', teacherId: DEMO_TEACHER.id }),
  Object.freeze({ id: 'demo-a2-standard', name: 'Algebra II – Standard', course: 'algebra2', courseLevel: 'standard', teacherId: DEMO_TEACHER.id }),
  Object.freeze({ id: 'demo-a2-honors', name: 'Algebra II – Honors', course: 'algebra2', courseLevel: 'honors', teacherId: DEMO_TEACHER.id }),
]);

const assignmentState = (score, status = 'Completed') => ({ status, score });

const STUDENT_PROFILES = Object.freeze([
  Object.freeze({
    id: 'alex', name: 'Alex Rivera', classId: 'demo-a1-standard', purpose: 'On grade level', supportLabel: '—', overallMastery: 72,
    domainReadiness: { 'Linear Functions': 'onTrack', Systems: 'onTrack', Exponents: 'developing' },
    mathPath: { current: 'Systems of Equations', next: 'Elimination', recommendation: 'Build independent accuracy with elimination.', history: ['Linear equations · Secure', 'Slope and rate of change · Secure', 'Systems graphing · Developing'] },
    readiness: { sat: 66, act: 64, tsia2: 72, confidence: 'Medium' },
    assignments: { 'linear-warmup': assignmentState(80), 'equations-classwork': assignmentState(80), 'systems-dol': assignmentState(60), 'exponents-adaptive': assignmentState(60, 'In Progress'), 'phone-modeling-lab': assignmentState(80), 'systems-quiz': assignmentState(80, 'Feedback Released'), 'retention-check': assignmentState(null, 'Needs Retention'), 'college-readiness': assignmentState(60), 'ccmr-practice': assignmentState(60) },
  }),
  Object.freeze({
    id: 'jordan', name: 'Jordan Lee', classId: 'demo-a1-standard', purpose: 'Foundations / remediation', supportLabel: 'Targeted prerequisite repair', overallMastery: 49,
    domainReadiness: { 'Linear Functions': 'developing', Systems: 'developing', Exponents: 'developing' },
    mathPath: { current: 'Solving Multi-Step Equations', next: 'Equation verification', recommendation: 'Repair prerequisite equation fluency before returning to systems.', history: ['Integer operations · Rebuilt', 'Two-step equations · Developing', 'Multi-step equations · Active'] },
    readiness: { sat: 42, act: 44, tsia2: 48, confidence: 'Medium' },
    assignments: { 'linear-warmup': assignmentState(60), 'equations-classwork': assignmentState(40), 'systems-dol': assignmentState(40), 'exponents-adaptive': assignmentState(20, 'In Progress'), 'phone-modeling-lab': assignmentState(60), 'systems-quiz': assignmentState(40, 'Feedback Released'), 'retention-check': assignmentState(null, 'Needs Retention'), 'college-readiness': assignmentState(40) },
  }),
  Object.freeze({
    id: 'sam', name: 'Sam Garcia', classId: 'demo-a1-standard', purpose: 'Language / access supports', supportLabel: 'EB · authored Spanish support', overallMastery: 67,
    domainReadiness: { 'Linear Functions': 'onTrack', Systems: 'developing', Exponents: 'onTrack' },
    mathPath: { current: 'Systems Context Interpretation', next: 'Context-to-equation translation', recommendation: 'Continue grade-level systems work with language/context scaffolds.', history: ['Slope · Secure', 'Linear models · Secure', 'Systems vocabulary · Active'] },
    readiness: { sat: 61, act: 63, tsia2: 68, confidence: 'Medium' },
    assignments: { 'linear-warmup': assignmentState(80), 'equations-classwork': assignmentState(80), 'systems-dol': assignmentState(60), 'exponents-adaptive': assignmentState(80), 'phone-modeling-lab': assignmentState(80), 'systems-quiz': assignmentState(60, 'Feedback Released'), 'retention-check': assignmentState(80), 'college-readiness': assignmentState(60) },
  }),
  Object.freeze({
    id: 'morgan', name: 'Morgan Brooks', classId: 'demo-a1-standard', purpose: 'Advanced readiness in Standard', supportLabel: '—', overallMastery: 91,
    domainReadiness: { 'Linear Functions': 'advanced', Systems: 'advanced', Exponents: 'onTrack' },
    mathPath: { current: 'Multi-Representation Modeling', next: 'College-readiness linear modeling', recommendation: 'Individual CCMR enrichment; course placement remains Standard.', history: ['Linear functions · Advanced', 'Systems · Advanced', 'Nonroutine modeling · Active'] },
    readiness: { sat: 88, act: 86, tsia2: 92, confidence: 'High' },
    assignments: { 'linear-warmup': assignmentState(100), 'equations-classwork': assignmentState(100), 'systems-dol': assignmentState(100), 'exponents-adaptive': assignmentState(80), 'phone-modeling-lab': assignmentState(100), 'systems-quiz': assignmentState(100, 'Feedback Released'), 'retention-check': assignmentState(100), 'college-readiness': assignmentState(80), 'ccmr-practice': assignmentState(100) },
  }),
  Object.freeze({
    id: 'taylor', name: 'Taylor Nguyen', classId: 'demo-a1-honors', purpose: 'Honors / strong mastery', supportLabel: '—', overallMastery: 87,
    domainReadiness: { 'Linear Functions': 'advanced', Systems: 'onTrack', Exponents: 'advanced' },
    mathPath: { current: 'Nonlinear Modeling / CCMR', next: 'Algebra II connection', recommendation: 'Preserve Honors target and extend with nonroutine modeling.', history: ['Linear functions · Advanced', 'Systems · Secure', 'CCMR modeling · Active'] },
    readiness: { sat: 85, act: 84, tsia2: 90, confidence: 'High' },
    assignments: { 'linear-warmup': assignmentState(100), 'equations-classwork': assignmentState(80), 'systems-dol': assignmentState(80), 'exponents-adaptive': assignmentState(100), 'phone-modeling-lab': assignmentState(100), 'systems-quiz': assignmentState(80, 'Feedback Released'), 'retention-check': assignmentState(100), 'college-readiness': assignmentState(80), 'honors-modeling': assignmentState(null, 'Assigned'), 'ccmr-practice': assignmentState(80) },
  }),
  Object.freeze({
    id: 'riley', name: 'Riley Johnson', classId: 'demo-a1-honors', purpose: 'Honors / one struggling domain', supportLabel: '504 · extra time', overallMastery: 74,
    domainReadiness: { 'Linear Functions': 'onTrack', Systems: 'developing', Exponents: 'onTrack' },
    mathPath: { current: 'Systems Prerequisite Repair', next: 'Guided elimination → Honors systems modeling', recommendation: 'Repair the weak systems prerequisite while preserving the Honors destination target.', history: ['Linear functions · Secure', 'Systems DOL · Needs attention', 'Elimination repair · Active'] },
    readiness: { sat: 70, act: 68, tsia2: 74, confidence: 'Medium' },
    assignments: { 'linear-warmup': assignmentState(80), 'equations-classwork': assignmentState(80), 'systems-dol': assignmentState(40), 'exponents-adaptive': assignmentState(80), 'phone-modeling-lab': assignmentState(80), 'systems-quiz': assignmentState(60, 'Feedback Released'), 'retention-check': assignmentState(null, 'Needs Retention'), 'college-readiness': assignmentState(80), 'honors-modeling': assignmentState(null, 'Assigned'), 'ccmr-practice': assignmentState(60) },
  }),
  Object.freeze({
    id: 'casey', name: 'Casey Williams', classId: 'demo-a2-standard', purpose: 'Algebra II / on track', supportLabel: '—', overallMastery: 79,
    domainReadiness: { 'Functions & Inverses': 'onTrack', 'Systems & Models': 'onTrack', 'Exponential / Logarithmic': 'developing' },
    mathPath: { current: 'Exponential & Logarithmic Models', next: 'Logarithmic equation verification', recommendation: 'Continue Algebra II modeling with targeted exponential/log connections.', history: ['Inverse functions · Secure', 'Linear–quadratic systems · Secure', 'Exponential/log models · Active'] },
    readiness: { sat: 78, act: 76, tsia2: 84, confidence: 'Medium' },
    assignments: { 'a2-inverse-functions': assignmentState(80), 'a2-linear-quadratic': assignmentState(80), 'a2-exponential-log': assignmentState(60, 'In Progress'), 'college-readiness': assignmentState(80), 'ccmr-practice': assignmentState(80) },
  }),
  Object.freeze({
    id: 'drew', name: 'Drew Carter', classId: 'demo-a2-honors', purpose: 'Algebra II Honors / advanced modeling', supportLabel: '—', overallMastery: 90,
    domainReadiness: { 'Functions & Inverses': 'advanced', 'Systems & Models': 'advanced', 'Data Modeling': 'advanced' },
    mathPath: { current: 'Model Selection & Critical Judgment', next: 'Honors CCMR data-model extension', recommendation: 'Extend strong Algebra II evidence through multi-model comparison and college-readiness reasoning.', history: ['Inverse functions · Advanced', 'Linear–quadratic systems · Advanced', 'Regression/model selection · Active'] },
    readiness: { sat: 91, act: 89, tsia2: 94, confidence: 'High' },
    assignments: { 'a2-inverse-functions': assignmentState(100), 'a2-linear-quadratic': assignmentState(100), 'a2-exponential-log': assignmentState(80), 'a2-honors-ccmr': assignmentState(null, 'Assigned'), 'ccmr-practice': assignmentState(100) },
  }),
  Object.freeze({
    id: 'fresh', name: 'New Student (Blank)', classId: 'demo-a1-standard', purpose: 'Fresh account / first-day student experience', supportLabel: '—', overallMastery: null, isFreshAccount: true,
    domainReadiness: {},
    mathPath: { current: 'Starting Diagnostic', next: 'Personalized path after evidence', recommendation: 'Complete the first diagnostic questions so MathMaster can begin a path.', history: [] },
    readiness: { sat: '—', act: '—', tsia2: '—', confidence: 'No evidence yet' },
    assignments: { 'equations-classwork': assignmentState(null, 'Assigned') },
  }),
]);

const addDays = (base, days, endOfDay = false) => {
  const date = new Date(base);
  date.setDate(date.getDate() + Number(days || 0));
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(8, 0, 0, 0);
  return date.toISOString();
};

const resolveAssignmentDates = (assignment, nowValue) => ({
  ...assignment,
  releaseAt: addDays(nowValue, Math.min(-20, Number(assignment.timeline?.dueOffsetDays || 0) - 14)),
  dueAt: addDays(nowValue, assignment.timeline?.dueOffsetDays || 0, true),
  dueDate: addDays(nowValue, assignment.timeline?.dueOffsetDays || 0, true),
  lateDueAt: addDays(nowValue, assignment.timeline?.lateOffsetDays ?? assignment.timeline?.dueOffsetDays ?? 0, true),
  lateDueDate: addDays(nowValue, assignment.timeline?.lateOffsetDays ?? assignment.timeline?.dueOffsetDays ?? 0, true),
  questions: assignment.questions.map((question) => ({ ...question })),
});

export const getDemoCorrectResponse = (question) => {
  if (question?.type === 'algebra') return String((Number(question.c) - Number(question.b)) / Number(question.a));
  if (Array.isArray(question?.acceptedAnswers) && question.acceptedAnswers.length) return String(question.acceptedAnswers[0]);
  return '';
};

const incorrectResponseFor = (question) => {
  const correct = getDemoCorrectResponse(question);
  const numeric = Number(correct);
  return Number.isFinite(numeric) ? String(numeric + 1) : `${correct || 'answer'}?`;
};

const stableStudentOffset = (studentId, questionCount) => String(studentId || '').split('').reduce((total, char) => total + char.charCodeAt(0), 0) % Math.max(1, questionCount);

export const buildSeededAssignmentResult = ({ studentId, assignment, requestedScore, status }) => {
  const questions = assignment?.questions || [];
  if (requestedScore === null || requestedScore === undefined || !questions.length) {
    return { status: status || 'Assigned', score: null, historicalResponses: {} };
  }
  const correctCount = Math.max(0, Math.min(questions.length, Math.round((Number(requestedScore) / 100) * questions.length)));
  const offset = stableStudentOffset(studentId, questions.length);
  const correctIndexes = new Set(Array.from({ length: correctCount }, (_, index) => (index + offset) % questions.length));
  const historicalResponses = Object.fromEntries(questions.map((question, index) => {
    const isCorrect = correctIndexes.has(index);
    return [question.questionId || String(index), {
      isCorrect,
      response: isCorrect ? getDemoCorrectResponse(question) : incorrectResponseFor(question),
      questionIndex: index,
      recordedAt: 'synthetic-history',
    }];
  }));
  const derivedScore = Math.round((correctCount / questions.length) * 100);
  return { status: status || 'Completed', score: derivedScore, historicalResponses };
};

const pathQuestionSet = (student) => {
  const skill = student.mathPath.current;
  const lower = skill.toLowerCase();
  if (lower.includes('exponential') || lower.includes('nonlinear')) {
    return [
      ['2^x = 32. Find x.', '5'], ['3^x = 81. Find x.', '4'], ['10^x = 1000. Find x.', '3'], ['log base 2 of 64 equals x. Find x.', '6'], ['5^x = 125. Find x.', '3'],
    ];
  }
  if (lower.includes('system')) {
    return [
      ['y = x + 2 and y = 3x - 4. Find the intersection x-value.', '3'], ['y = 2x + 1 and y = -x + 10. Find x.', '3'], ['x + y = 12 and y = x - 2. Find x.', '7'], ['y = 4x - 7 and y = x + 2. Find x.', '3'], ['3x + y = 14 and y = 2. Find x.', '4'],
    ];
  }
  if (lower.includes('model')) {
    return [
      ['A plan is C = 20 + 5g. If C = 50, find g.', '6'], ['A model is y = 3x + 7. If y = 28, find x.', '7'], ['A = 12 + 4x and B = 30 + x. Find the break-even x.', '6'], ['d = 60t and d = 180. Find t.', '3'], ['P = 22 + 6n and Q = 10 + 8n. Find the break-even n.', '6'],
    ];
  }
  return [
    ['Solve 3x + 4 = 40.', '12'], ['Solve 5x - 3 = 32.', '7'], ['Solve 4x + 9 = 45.', '9'], ['Solve 7x - 6 = 29.', '5'], ['Solve 6x + 1 = 31.', '5'],
  ];
};

export const buildDemoPathQuestions = (student) => pathQuestionSet(student).map(([prompt, answerKey], index) => ({
  questionInstanceId: `demo-path-${student.id}-${index + 1}`,
  familyId: `demo-${student.id}-path`,
  activityRole: 'practice',
  difficultyBand: student.isFreshAccount ? 2 : Object.values(student.domainReadiness || {}).includes('advanced') ? 4 : Object.values(student.domainReadiness || {}).includes('developing') ? 2 : 3,
  dok: index >= 3 ? 2 : 1,
  prompt,
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }],
  attemptsAllowed: 3,
  attemptsUsed: 0,
  answerKey,
  adaptiveRigor: { mode: student.classId.includes('honors') ? (Object.values(student.domainReadiness || {}).includes('developing') ? 'honorsRepair' : 'honors') : Object.values(student.domainReadiness || {}).includes('advanced') ? 'individualEnrichment' : Object.values(student.domainReadiness || {}).includes('developing') ? 'repair' : 'standard' },
}));

export const createDemoSeed = (nowValue = Date.now()) => {
  const assignments = demoAssignmentBank.map((assignment) => resolveAssignmentDates(assignment, nowValue));
  const assignmentById = Object.fromEntries(assignments.map((assignment) => [assignment.id, assignment]));
  const students = STUDENT_PROFILES.map((student) => ({
    ...student,
    domainReadiness: { ...student.domainReadiness },
    mathPath: { ...student.mathPath, history: [...student.mathPath.history], questions: buildDemoPathQuestions(student) },
    readiness: { ...student.readiness },
    assignments: Object.fromEntries(Object.entries(student.assignments).map(([assignmentId, state]) => [
      assignmentId,
      buildSeededAssignmentResult({ studentId: student.id, assignment: assignmentById[assignmentId], requestedScore: state.score, status: state.status }),
    ])),
  }));
  return {
    version: 2,
    generatedAt: new Date(nowValue).toISOString(),
    teacher: { ...DEMO_TEACHER },
    classes: DEMO_CLASSES.map((item) => ({ ...item })),
    assignments,
    students,
    localOnly: true,
  };
};

export const loadDemoSeed = () => {
  if (typeof window === 'undefined') return createDemoSeed();
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!stored) return createDemoSeed();
    const parsed = JSON.parse(stored);
    return parsed?.version === 2 && parsed?.localOnly === true ? parsed : createDemoSeed();
  } catch {
    return createDemoSeed();
  }
};

export const saveDemoSeed = (state) => {
  const safeState = { ...state, version: 2, localOnly: true };
  if (typeof window !== 'undefined') window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(safeState));
  return safeState;
};

export const resetDemoSeed = () => saveDemoSeed(createDemoSeed());

export const DEMO_ASSIGNMENTS = demoAssignmentBank;
export const DEMO_STUDENTS = STUDENT_PROFILES;

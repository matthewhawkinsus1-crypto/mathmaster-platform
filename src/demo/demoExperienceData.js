export const DEMO_STORAGE_KEY = 'mathmaster:demoData/showcase:v1';

const completed = (score, status = 'Completed') => ({ status, score });

export const DEMO_CLASSES = Object.freeze([
  Object.freeze({ id: 'demo-a1-standard', name: 'Algebra I – Standard', course: 'algebra1', courseLevel: 'standard' }),
  Object.freeze({ id: 'demo-a1-honors', name: 'Algebra I – Honors', course: 'algebra1', courseLevel: 'honors' }),
  Object.freeze({ id: 'demo-a2-standard', name: 'Algebra II – Standard', course: 'algebra2', courseLevel: 'standard' }),
  Object.freeze({ id: 'demo-a2-honors', name: 'Algebra II – Honors', course: 'algebra2', courseLevel: 'honors' }),
]);

export const DEMO_ASSIGNMENTS = Object.freeze([
  Object.freeze({ id: 'linear-warmup', title: 'Linear Relationships Warm-Up', type: 'Warm-Up', status: 'Graded', teks: 'A.3B' }),
  Object.freeze({ id: 'equations-classwork', title: 'Solving Equations Classwork', type: 'Classwork', status: 'Graded', teks: 'A.5A' }),
  Object.freeze({ id: 'systems-dol', title: 'Systems of Equations DOL', type: 'DOL', status: 'Graded', teks: 'A.5C' }),
  Object.freeze({ id: 'exponents-adaptive', title: 'Exponents Adaptive Practice', type: 'Practice', status: 'In Progress', teks: 'A.11B' }),
  Object.freeze({ id: 'phone-modeling-lab', title: 'Cell Phone Plan Modeling Lab', type: 'Modeling Lab', status: 'Graded', teks: 'A.3C', dok: 4 }),
  Object.freeze({ id: 'systems-quiz', title: 'Systems Quiz', type: 'Quiz', status: 'Feedback Released', teks: 'A.5C' }),
  Object.freeze({ id: 'retention-check', title: 'Retention Quick Check', type: 'Retention', status: 'Needs Retention', teks: 'A.5A' }),
  Object.freeze({ id: 'college-readiness', title: 'College Readiness Quick Check', type: 'CCMR', status: 'Graded', teks: 'A.3B', ccmr: true }),
  Object.freeze({ id: 'honors-modeling', title: 'Honors Modeling & Justification Extension', type: 'Honors', status: 'Assigned', teks: 'A.5C', honorsOnly: true, ccmr: true, dok: 3 }),
  Object.freeze({ id: 'ccmr-practice', title: 'SAT / ACT / TSIA2-Style CCMR Practice', type: 'CCMR', status: 'Graded', teks: 'A.3B', ccmr: true }),
  Object.freeze({ id: 'a2-inverse-functions', title: 'Algebra II Inverse Functions Investigation', type: 'Classwork', status: 'Graded', teks: 'A2.2C', algebra2Only: true }),
  Object.freeze({ id: 'a2-linear-quadratic', title: 'Linear–Quadratic Systems Lab', type: 'Modeling Lab', status: 'Graded', teks: 'A2.3C', algebra2Only: true, dok: 3 }),
  Object.freeze({ id: 'a2-exponential-log', title: 'Exponential & Logarithmic Models', type: 'Practice', status: 'In Progress', teks: 'A2.5B', algebra2Only: true }),
  Object.freeze({ id: 'a2-honors-ccmr', title: 'Algebra II Honors CCMR Extension', type: 'Honors', status: 'Assigned', teks: 'A2.8C', algebra2Only: true, honorsOnly: true, ccmr: true, dok: 4 }),
]);

export const DEMO_STUDENTS = Object.freeze([
  Object.freeze({
    id: 'alex', name: 'Alex Rivera', classId: 'demo-a1-standard', purpose: 'On grade level', supportLabel: '—', overallMastery: 72,
    domainReadiness: { 'Linear Functions': 'onTrack', Systems: 'onTrack', Exponents: 'developing' },
    mathPath: { current: 'Systems of Equations', next: 'Elimination', recommendation: 'Build independent accuracy with elimination.', history: ['Linear equations · Secure', 'Slope and rate of change · Secure', 'Systems graphing · Developing'] },
    readiness: { sat: 66, act: 64, tsia2: 72, confidence: 'Medium' },
    assignments: { 'linear-warmup': completed(80), 'equations-classwork': completed(76), 'systems-dol': completed(70), 'exponents-adaptive': completed(58, 'In Progress'), 'phone-modeling-lab': completed(82), 'systems-quiz': completed(74, 'Feedback Released'), 'retention-check': completed(null, 'Needs Retention'), 'college-readiness': completed(68), 'ccmr-practice': completed(64) },
  }),
  Object.freeze({
    id: 'jordan', name: 'Jordan Lee', classId: 'demo-a1-standard', purpose: 'Foundations / remediation', supportLabel: 'Targeted prerequisite repair', overallMastery: 49,
    domainReadiness: { 'Linear Functions': 'developing', Systems: 'developing', Exponents: 'developing' },
    mathPath: { current: 'Solving Multi-Step Equations', next: 'Equation verification', recommendation: 'Repair prerequisite equation fluency before returning to systems.', history: ['Integer operations · Rebuilt', 'Two-step equations · Developing', 'Multi-step equations · Active'] },
    readiness: { sat: 42, act: 44, tsia2: 48, confidence: 'Medium' },
    assignments: { 'linear-warmup': completed(55), 'equations-classwork': completed(48), 'systems-dol': completed(35), 'exponents-adaptive': completed(32, 'In Progress'), 'phone-modeling-lab': completed(61), 'systems-quiz': completed(43, 'Feedback Released'), 'retention-check': completed(null, 'Needs Retention'), 'college-readiness': completed(38) },
  }),
  Object.freeze({
    id: 'sam', name: 'Sam Garcia', classId: 'demo-a1-standard', purpose: 'Language / access supports', supportLabel: 'EB · authored Spanish support', overallMastery: 67,
    domainReadiness: { 'Linear Functions': 'onTrack', Systems: 'developing', Exponents: 'onTrack' },
    mathPath: { current: 'Systems of Equations', next: 'Context interpretation', recommendation: 'Continue grade-level systems work with language/context scaffolds.', history: ['Slope · Secure', 'Linear models · Secure', 'Systems vocabulary · Active'] },
    readiness: { sat: 61, act: 63, tsia2: 68, confidence: 'Medium' },
    assignments: { 'linear-warmup': completed(78), 'equations-classwork': completed(71), 'systems-dol': completed(62), 'exponents-adaptive': completed(74), 'phone-modeling-lab': completed(76), 'systems-quiz': completed(65, 'Feedback Released'), 'retention-check': completed(75), 'college-readiness': completed(62) },
  }),
  Object.freeze({
    id: 'morgan', name: 'Morgan Brooks', classId: 'demo-a1-standard', purpose: 'Advanced readiness in Standard', supportLabel: '—', overallMastery: 91,
    domainReadiness: { 'Linear Functions': 'advanced', Systems: 'advanced', Exponents: 'onTrack' },
    mathPath: { current: 'Multi-Representation Modeling', next: 'College-readiness linear modeling', recommendation: 'Individual CCMR enrichment; course placement remains Standard.', history: ['Linear functions · Advanced', 'Systems · Advanced', 'Nonroutine modeling · Active'] },
    readiness: { sat: 88, act: 86, tsia2: 92, confidence: 'High' },
    assignments: { 'linear-warmup': completed(100), 'equations-classwork': completed(94), 'systems-dol': completed(96), 'exponents-adaptive': completed(88), 'phone-modeling-lab': completed(93), 'systems-quiz': completed(92, 'Feedback Released'), 'retention-check': completed(95), 'college-readiness': completed(89), 'ccmr-practice': completed(90) },
  }),
  Object.freeze({
    id: 'taylor', name: 'Taylor Nguyen', classId: 'demo-a1-honors', purpose: 'Honors / strong mastery', supportLabel: '—', overallMastery: 87,
    domainReadiness: { 'Linear Functions': 'advanced', Systems: 'onTrack', Exponents: 'advanced' },
    mathPath: { current: 'Nonlinear Modeling / CCMR', next: 'Algebra II connection', recommendation: 'Preserve Honors target and extend with nonroutine modeling.', history: ['Linear functions · Advanced', 'Systems · Secure', 'CCMR modeling · Active'] },
    readiness: { sat: 85, act: 84, tsia2: 90, confidence: 'High' },
    assignments: { 'linear-warmup': completed(96), 'equations-classwork': completed(91), 'systems-dol': completed(84), 'exponents-adaptive': completed(92), 'phone-modeling-lab': completed(95), 'systems-quiz': completed(88, 'Feedback Released'), 'retention-check': completed(91), 'college-readiness': completed(87), 'honors-modeling': completed(null, 'Assigned'), 'ccmr-practice': completed(86) },
  }),
  Object.freeze({
    id: 'riley', name: 'Riley Johnson', classId: 'demo-a1-honors', purpose: 'Honors / one struggling domain', supportLabel: '504 · extra time', overallMastery: 74,
    domainReadiness: { 'Linear Functions': 'onTrack', Systems: 'developing', Exponents: 'onTrack' },
    mathPath: { current: 'Systems Prerequisite Repair', next: 'Guided elimination → Honors systems modeling', recommendation: 'Repair the weak systems prerequisite while preserving the Honors destination target.', history: ['Linear functions · Secure', 'Systems DOL · Needs attention', 'Elimination repair · Active'] },
    readiness: { sat: 70, act: 68, tsia2: 74, confidence: 'Medium' },
    assignments: { 'linear-warmup': completed(90), 'equations-classwork': completed(81), 'systems-dol': completed(48), 'exponents-adaptive': completed(79), 'phone-modeling-lab': completed(83), 'systems-quiz': completed(58, 'Feedback Released'), 'retention-check': completed(null, 'Needs Retention'), 'college-readiness': completed(71), 'honors-modeling': completed(null, 'Assigned'), 'ccmr-practice': completed(69) },
  }),
  Object.freeze({
    id: 'casey', name: 'Casey Williams', classId: 'demo-a2-standard', purpose: 'Algebra II / on track', supportLabel: '—', overallMastery: 79,
    domainReadiness: { 'Functions & Inverses': 'onTrack', 'Systems & Models': 'onTrack', 'Exponential / Logarithmic': 'developing' },
    mathPath: { current: 'Exponential & Logarithmic Models', next: 'Logarithmic equation verification', recommendation: 'Continue Algebra II modeling with targeted exponential/log connections.', history: ['Inverse functions · Secure', 'Linear–quadratic systems · Secure', 'Exponential/log models · Active'] },
    readiness: { sat: 78, act: 76, tsia2: 84, confidence: 'Medium' },
    assignments: { 'a2-inverse-functions': completed(82), 'a2-linear-quadratic': completed(78), 'a2-exponential-log': completed(69, 'In Progress'), 'college-readiness': completed(77) },
  }),
  Object.freeze({
    id: 'drew', name: 'Drew Carter', classId: 'demo-a2-honors', purpose: 'Algebra II Honors / advanced modeling', supportLabel: '—', overallMastery: 90,
    domainReadiness: { 'Functions & Inverses': 'advanced', 'Systems & Models': 'advanced', 'Data Modeling': 'advanced' },
    mathPath: { current: 'Model Selection & Critical Judgment', next: 'Honors CCMR data-model extension', recommendation: 'Extend strong Algebra II evidence through multi-model comparison and college-readiness reasoning.', history: ['Inverse functions · Advanced', 'Linear–quadratic systems · Advanced', 'Regression/model selection · Active'] },
    readiness: { sat: 91, act: 89, tsia2: 94, confidence: 'High' },
    assignments: { 'a2-inverse-functions': completed(94), 'a2-linear-quadratic': completed(92), 'a2-exponential-log': completed(88), 'a2-honors-ccmr': completed(null, 'Assigned'), 'ccmr-practice': completed(91) },
  }),
]);

export const createDemoSeed = () => ({
  version: 1,
  generatedAt: 'synthetic-seed',
  classes: DEMO_CLASSES.map((item) => ({ ...item })),
  assignments: DEMO_ASSIGNMENTS.map((item) => ({ ...item })),
  students: DEMO_STUDENTS.map((student) => ({
    ...student,
    domainReadiness: { ...student.domainReadiness },
    mathPath: { ...student.mathPath, history: [...student.mathPath.history] },
    readiness: { ...student.readiness },
    assignments: Object.fromEntries(Object.entries(student.assignments).map(([id, state]) => [id, { ...state }])),
  })),
});

export const loadDemoSeed = () => {
  if (typeof window === 'undefined') return createDemoSeed();
  try {
    const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!stored) return createDemoSeed();
    const parsed = JSON.parse(stored);
    return parsed?.version === 1 ? parsed : createDemoSeed();
  } catch {
    return createDemoSeed();
  }
};

export const saveDemoSeed = (state) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  return state;
};

export const resetDemoSeed = () => saveDemoSeed(createDemoSeed());

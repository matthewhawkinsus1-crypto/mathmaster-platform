import { getStrandForTEKS } from '../mastery/strandConfig.js';

export const COURSE_LEVELS = Object.freeze({
  STANDARD: 'standard',
  HONORS: 'honors',
});

export const COURSE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'algebra1', label: 'Algebra I' }),
  Object.freeze({ id: 'algebra2', label: 'Algebra II' }),
]);

const COURSE_LABELS = Object.freeze(Object.fromEntries(COURSE_OPTIONS.map((course) => [course.id, course.label])));

export const normalizeCourseLevel = (value) => (
  String(value || '').trim().toLowerCase() === COURSE_LEVELS.HONORS
    ? COURSE_LEVELS.HONORS
    : COURSE_LEVELS.STANDARD
);

export const normalizeCourseId = (value) => {
  const token = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['algebra2', 'alg2', 'a2'].includes(token)) return 'algebra2';
  return 'algebra1';
};

export const defaultCourseProfiles = (classPeriods = []) => Object.fromEntries(
  classPeriods.map((period) => [period, {
    classPeriod: period,
    course: 'algebra1',
    courseLabel: 'Algebra I',
    courseLevel: COURSE_LEVELS.STANDARD,
  }]),
);

export const normalizeCourseProfiles = (rawProfiles = {}, classPeriods = []) => {
  const defaults = defaultCourseProfiles(classPeriods);
  return Object.fromEntries(classPeriods.map((period) => {
    const source = rawProfiles?.[period] || {};
    const course = normalizeCourseId(source.course || source.courseId);
    return [period, {
      ...defaults[period],
      ...source,
      classPeriod: period,
      course,
      courseLabel: COURSE_LABELS[course],
      courseLevel: normalizeCourseLevel(source.courseLevel || source.level),
    }];
  }));
};

export const splitClassPeriodsByRigor = (classPeriods = [], courseProfiles = {}) => (
  classPeriods.reduce((result, period) => {
    const level = normalizeCourseLevel(courseProfiles?.[period]?.courseLevel);
    result[level].push(period);
    return result;
  }, { standard: [], honors: [] })
);

const questionTeks = (question = {}) => {
  const raw = question.teks
    || question.teksAlignments
    || question.standards?.primary
    || question.metadata?.teks
    || [];
  return (Array.isArray(raw) ? raw : [raw])
    .map((entry) => typeof entry === 'string' ? entry : entry?.code || entry?.teks || '')
    .map((value) => String(value || '').trim())
    .filter(Boolean);
};

const questionDok = (question = {}) => Number(
  question.dok
  ?? question.dokLevel
  ?? question.complexity?.dok
  ?? question.complexity?.level
  ?? 0,
);

const searchableQuestionText = (question = {}) => [
  question.prompt,
  question.title,
  question.purpose,
  ...(Array.isArray(question.tags) ? question.tags : []),
].filter(Boolean).join(' ').toLowerCase();

const hasAnyToken = (value, tokens) => tokens.some((token) => value.includes(token));

export const isNarrowHonorsCheckpoint = (questions = []) => {
  const included = (Array.isArray(questions) ? questions : []).filter((question) => question?.teacherExcluded !== true);
  return included.length > 0 && included.length <= 3 && included.every((question) => (
    ['warmup', 'dol'].includes(String(question.activityRole || question.role || '').trim().toLowerCase())
  ));
};

export const inspectHonorsRigor = (questions = [], { allowNarrowCheckpoint = false } = {}) => {
  const included = (Array.isArray(questions) ? questions : []).filter((question) => question?.teacherExcluded !== true);
  const checks = {
    coreTeks: included.some((question) => questionTeks(question).length > 0),
    higherOrderReasoning: included.some((question) => questionDok(question) >= 3),
    multipleRepresentations: included.some((question) => (
      ['relationshipModel', 'graphComparison', 'graphStory', 'functionInvestigation', 'functionInvestigation2'].includes(question.type || question.toolId)
      || (Array.isArray(question.representations) && question.representations.length >= 2)
    )),
    justification: included.some((question) => (
      ['graphStory', 'dataModelingLab', 'modelingLab'].includes(question.type || question.toolId)
      || hasAnyToken(searchableQuestionText(question), ['justify', 'explain', 'reason', 'error analysis', 'compare strategies', 'defend'])
    )),
    modelingApplication: included.some((question) => (
      ['modelingLab', 'dataModelingLab', 'relationshipModel', 'graphStory', 'contextInterpretation'].includes(question.type || question.toolId)
      || hasAnyToken(searchableQuestionText(question), ['model', 'real-world', 'scenario', 'application'])
    )),
    ccmrEnrichment: included.some((question) => (
      question.ccmr === true
      || question.collegeCareerReadiness === true
      || Boolean(question.examAlignment)
      || hasAnyToken(searchableQuestionText(question), ['ccmr', 'sat', 'act', 'tsia2', 'college readiness', 'college-readiness'])
    )),
  };
  const depthCount = [
    checks.higherOrderReasoning,
    checks.multipleRepresentations,
    checks.justification,
    checks.modelingApplication,
  ].filter(Boolean).length;
  const narrowCheckpoint = allowNarrowCheckpoint && isNarrowHonorsCheckpoint(included);
  const fullContractReady = checks.coreTeks && checks.higherOrderReasoning && depthCount >= 3 && checks.ccmrEnrichment;
  return {
    checks,
    depthCount,
    scope: narrowCheckpoint ? 'narrowCheckpoint' : 'full',
    isNarrowCheckpoint: narrowCheckpoint,
    isHonorsReady: narrowCheckpoint ? checks.coreTeks : fullContractReady,
    fullContractReady,
    missing: Object.entries(checks).filter(([, present]) => !present).map(([key]) => key),
  };
};

const isCcmrQuestion = (question = {}) => (
  question.ccmr === true
  || question.collegeCareerReadiness === true
  || Boolean(question.examAlignment)
  || hasAnyToken(searchableQuestionText(question), ['ccmr', 'sat', 'act', 'tsia2', 'college readiness', 'college-readiness'])
);

const isPrerequisiteQuestion = (question = {}) => (
  question.prerequisite === true
  || question.isPrerequisite === true
  || (Array.isArray(question.standards?.prerequisite) && question.standards.prerequisite.length > 0)
  || hasAnyToken(searchableQuestionText(question), ['prerequisite', 'foundation', 'repair', 'scaffold'])
);

export const summarizeRigorSequence = (assignments = [], classPeriod, { limit = 10 } = {}) => {
  const recent = (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => {
      const periods = assignment?.assignedClassPeriods || assignment?.classPeriods || [];
      return Array.isArray(periods) && periods.includes(classPeriod);
    })
    .sort((left, right) => new Date(right?.dueAt || right?.dueDate || right?.createdAt || 0).getTime() - new Date(left?.dueAt || left?.dueDate || left?.createdAt || 0).getTime())
    .slice(0, Math.max(1, Number(limit) || 10));

  const included = recent.flatMap((assignment) => (
    (Array.isArray(assignment?.questions) ? assignment.questions : []).filter((question) => question?.teacherExcluded !== true)
  ));
  const counts = included.reduce((result, question) => {
    if (isCcmrQuestion(question)) result.ccmr += 1;
    else if (isPrerequisiteQuestion(question)) result.prerequisite += 1;
    else result.core += 1;
    return result;
  }, { core: 0, prerequisite: 0, ccmr: 0 });
  const totalQuestions = included.length;
  const percentage = (count) => totalQuestions ? Math.round((count / totalQuestions) * 100) : 0;
  return {
    assignmentCount: recent.length,
    totalQuestions,
    counts,
    percentages: {
      core: percentage(counts.core),
      prerequisite: percentage(counts.prerequisite),
      ccmr: percentage(counts.ccmr),
    },
    target: { core: 75, prerequisite: 10, ccmr: 15 },
  };
};

export const buildHonorsEnrichmentQuestion = ({ questions = [], course = 'algebra1' } = {}) => {
  const firstTeks = questions.flatMap(questionTeks)[0] || null;
  const courseId = normalizeCourseId(course);
  const courseLabel = COURSE_LABELS[courseId];
  const basePrompt = `${courseLabel} Honors extension: Create a realistic situation connected to ${firstTeks ? `TEKS ${firstTeks}` : 'the mathematics in this assignment'}. Define the quantities, represent their relationship with a graph, and justify why the graph is reasonable. Then explain one feature of the model that a SAT, ACT, or TSIA2-style question could ask you to interpret.`;
  return {
    type: 'graphStory',
    familyId: `honors-ccmr-modeling-${courseId}`,
    activityRole: 'classwork',
    dok: 3,
    difficultyBand: 4,
    teks: firstTeks ? [firstTeks] : [],
    ccmr: true,
    collegeCareerReadiness: true,
    tags: ['honors', 'ccmr', 'modeling', 'multiple-representations', 'justification'],
    honorsEnrichment: {
      generatedBy: 'MathMaster',
      contractVersion: 1,
      source: 'deterministic-policy',
    },
    prompt: basePrompt,
    variants: [
      { prompt: basePrompt },
      { prompt: `${courseLabel} Honors extension: Design a different real-world model connected to ${firstTeks ? `TEKS ${firstTeks}` : 'this assignment'}. Identify the independent and dependent quantities, sketch and label a graph, justify its important features, and write one college-readiness interpretation question that could be answered from your representation.` },
    ],
    minimumScenarioCharacters: 35,
    minimumExplanationCharacters: 45,
  };
};

const performanceFromTeksSummary = (summary = {}) => {
  const score = Number(summary.score ?? summary.mastery?.estimate ?? 0);
  const confidence = summary.confidence || summary.mastery?.confidence || 'Low';
  const status = summary.performance?.key || summary.mastery?.status || '';
  const advanced = status === 'masters'
    || status === 'Mastered'
    || (score >= 88 && confidence !== 'Low' && Number(summary.itemCount ?? summary.dimensions?.eligibleGradeLevelEvents ?? 0) >= 4);
  const developing = ['didNotMeet', 'approaches', 'Developing', 'Needs Attention'].includes(status) || (score > 0 && score < 70);
  return {
    score,
    confidence,
    status,
    readiness: advanced ? 'advanced' : developing ? 'developing' : 'onTrack',
  };
};

export const deriveDomainReadiness = (masteryProfile = {}) => {
  const source = masteryProfile.teks || masteryProfile.profiles || {};
  const groups = new Map();
  Object.entries(source).forEach(([code, summary]) => {
    const courseId = summary?.courseId || (/^A\./i.test(code) ? 'algebra1' : null);
    const strand = courseId === 'algebra1' ? getStrandForTEKS(code) : null;
    const key = strand?.id || `${courseId || 'math'}:rc${summary?.reportingCategory || 'other'}`;
    const title = strand?.title || `${summary?.course || COURSE_LABELS[courseId] || 'Mathematics'}${summary?.reportingCategory ? ` · Reporting Category ${summary.reportingCategory}` : ''}`;
    if (!groups.has(key)) groups.set(key, { id: key, title, rows: [] });
    groups.get(key).rows.push(performanceFromTeksSummary(summary));
  });

  return [...groups.values()].map((group) => {
    const scored = group.rows.filter((row) => row.score > 0);
    const score = scored.length ? Math.round(scored.reduce((sum, row) => sum + row.score, 0) / scored.length) : 0;
    const advancedCount = group.rows.filter((row) => row.readiness === 'advanced').length;
    const developingCount = group.rows.filter((row) => row.readiness === 'developing').length;
    const readiness = advancedCount > 0 && advancedCount >= Math.ceil(group.rows.length / 2)
      ? 'advanced'
      : developingCount > 0
        ? 'developing'
        : 'onTrack';
    return { id: group.id, title: group.title, score, readiness, evidenceAreas: group.rows.length };
  });
};

export const resolveAdaptiveRigor = ({ courseLevel = 'standard', readiness = 'onTrack' } = {}) => {
  const level = normalizeCourseLevel(courseLevel);
  if (level === 'honors' && readiness === 'developing') return { mode: 'honorsRepair', label: 'Support + Honors target' };
  if (level === 'honors' && readiness === 'advanced') return { mode: 'honorsExtension', label: 'Honors + deeper enrichment' };
  if (level === 'honors') return { mode: 'honors', label: 'Honors rigor' };
  if (readiness === 'advanced') return { mode: 'individualEnrichment', label: 'Enrichment / CCMR' };
  if (readiness === 'developing') return { mode: 'repair', label: 'Scaffold / repair' };
  return { mode: 'standard', label: 'On track' };
};

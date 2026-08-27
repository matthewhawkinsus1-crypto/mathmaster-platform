const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();

const PLAIN_TYPES = new Set(['multiAnswer', 'multipleChoice', 'numeric', 'text', 'shortAnswer']);

const INTERACTION_FAMILIES = Object.freeze({
  relationMapping: 'relations/functions',
  graphAnalysis: 'graph analysis',
  graphComparison: 'graph comparison',
  representationMatch: 'multiple representations',
  relationshipModel: 'context modeling',
  modelingLab: 'modeling',
  functionGraph: 'graph construction',
  graphing2: 'graph construction',
  constraintFunctionBuilder: 'open construction',
  openSortBoard: 'classification/sorting',
  sequenceExplorer: 'sequences',
  systemsWorkspace: 'systems',
  stepAlgebra2: 'algebraic solving',
  dataModelingLab: 'data/modeling',
  functionInvestigation2: 'function analysis',
});

const standardKey = (question = {}) => {
  const direct = question.standard || question.primaryStandard || question.teks;
  if (typeof direct === 'string') return clean(direct);
  if (Array.isArray(direct)) {
    const first = direct.find(Boolean);
    if (typeof first === 'string') return clean(first);
    if (first && typeof first === 'object') return clean(first.code || first.standard || first.id);
  }
  const alignments = asArray(question.alignments);
  const primary = alignments.find((entry) => lower(entry?.role) === 'primary') || alignments[0];
  return clean(primary?.code || primary?.standard || primary?.id);
};

const questionFamily = (question = {}) => {
  const construct = clean(question.assessedConstruct);
  if (construct) return construct;
  const type = clean(question.type || question.toolId);
  return INTERACTION_FAMILIES[type] || type || 'general response';
};

const hasGuidance = (question = {}) => {
  const authoredSteps = asArray(question.guidedNotes?.steps || question.guidedSteps);
  const hints = asArray(question.hints);
  return authoredSteps.length > 0 || hints.length > 1;
};

const richnessWeight = (question = {}) => {
  const type = clean(question.type || question.toolId);
  let weight = PLAIN_TYPES.has(type) ? 1 : 1.25;
  if (['relationshipModel', 'modelingLab', 'constraintFunctionBuilder', 'openSortBoard', 'representationMatch'].includes(type)) weight += 0.35;
  if (Array.isArray(question.stages) && question.stages.length > 1) weight += Math.min(0.75, (question.stages.length - 1) * 0.15);
  if (Array.isArray(question.analysisRequests) && question.analysisRequests.length > 2) weight += Math.min(0.5, (question.analysisRequests.length - 2) * 0.1);
  return Number(weight.toFixed(2));
};

const sectionQuestions = (source = {}, role) => {
  const sections = Array.isArray(source.sections) ? source.sections : asArray(source.activities);
  return sections
    .filter((section) => lower(section?.role) === role)
    .flatMap((section) => asArray(section?.questions));
};

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percent = (numerator, denominator) => denominator > 0 ? numerator / denominator : 1;

const summarizeSection = (questions = []) => {
  const doks = questions.map((q) => Number(q?.dok)).filter((value) => Number.isFinite(value));
  const standards = [...new Set(questions.map(standardKey).filter(Boolean))];
  const families = [...new Set(questions.map(questionFamily).filter(Boolean))];
  const richCount = questions.filter((q) => !PLAIN_TYPES.has(clean(q?.type || q?.toolId))).length;
  const guidedCount = questions.filter(hasGuidance).length;
  const opportunityUnits = questions.reduce((sum, q) => sum + richnessWeight(q), 0);
  return {
    count: questions.length,
    opportunityUnits: Number(opportunityUnits.toFixed(1)),
    standards,
    families,
    averageDok: Number(mean(doks).toFixed(2)),
    maxDok: doks.length ? Math.max(...doks) : 0,
    dok1Share: Number(percent(doks.filter((value) => value <= 1).length, doks.length).toFixed(2)),
    richShare: Number(percent(richCount, questions.length).toFixed(2)),
    guidedShare: Number(percent(guidedCount, questions.length).toFixed(2)),
  };
};

const overlapShare = (wanted = [], actual = []) => {
  if (!wanted.length) return 1;
  const have = new Set(actual);
  return wanted.filter((value) => have.has(value)).length / wanted.length;
};

const targetCountsForBundle = (bundle = {}) => {
  const authoredLessons = bundle?.assignment?.curriculum?.lessons
    ?? bundle?.assignment?.lessonMetadata?.lessons
    ?? bundle?.lessonMetadata?.lessons;
  const lessonCount = Math.max(1, asArray(authoredLessons).length || 1);
  if (lessonCount >= 2) return { classwork: [6, 8], practice: [8, 12] };
  return { classwork: [4, 6], practice: [5, 8] };
};

const issue = (id, severity, title, message) => ({ id, severity, title, message });

/**
 * Advisory quality audit for bundled assignments. This intentionally does not
 * replace curriculum scope validation. It tells the teacher/author when
 * Practice looks thinner, easier, or less representative than Classwork.
 */
export const analyzeSectionBalanceRigor = (bundle = {}) => {
  const classworkQuestions = sectionQuestions(bundle, 'classwork');
  const practiceQuestions = sectionQuestions(bundle, 'practice');
  const classwork = summarizeSection(classworkQuestions);
  const practice = summarizeSection(practiceQuestions);
  const targets = targetCountsForBundle(bundle);
  const issues = [];

  if (!classwork.count || !practice.count) {
    if (classwork.count && !practice.count) {
      issues.push(issue('missing-practice', 'warning', 'No independent Practice section', 'Classwork teaches new content, but this bundle contains no Practice questions for independent application.'));
    }
    return { classwork, practice, targets, issues, status: issues.length ? 'warning' : 'not-applicable' };
  }

  const standardCoverage = overlapShare(classwork.standards, practice.standards);
  const familyCoverage = overlapShare(classwork.families, practice.families);
  const practiceCountRatio = practice.count / classwork.count;
  const opportunityRatio = classwork.opportunityUnits > 0 ? practice.opportunityUnits / classwork.opportunityUnits : 1;

  if (practiceCountRatio < 0.8 && opportunityRatio < 0.85) {
    issues.push(issue(
      'practice-volume',
      'warning',
      'Practice is too small compared with Classwork',
      `Practice has ${practice.count} questions (${practice.opportunityUnits} opportunity units) versus ${classwork.count} Classwork questions (${classwork.opportunityUnits} units). For a bundled lesson, Practice should normally provide at least comparable independent volume.`,
    ));
  } else if (practice.count < classwork.count) {
    issues.push(issue(
      'practice-volume-soft',
      'suggestion',
      'Practice is smaller than Classwork',
      `Practice has ${practice.count} questions and Classwork has ${classwork.count}. This can be appropriate when Practice questions are substantially richer, but the normal MathMaster target is Practice at least as broad as Classwork.`,
    ));
  }

  if (standardCoverage < 0.85) {
    const missing = classwork.standards.filter((standard) => !practice.standards.includes(standard));
    issues.push(issue(
      'objective-coverage',
      'warning',
      'Practice does not revisit every major Classwork standard',
      `Independent Practice is missing ${missing.join(', ') || 'one or more Classwork standards'}. Major objectives taught with support should normally reappear independently.`,
    ));
  }

  if (familyCoverage < 0.65 && classwork.families.length >= 2) {
    const missingFamilies = classwork.families.filter((family) => !practice.families.includes(family));
    issues.push(issue(
      'interaction-coverage',
      'warning',
      'Practice loses too much of the Classwork experience',
      `Practice does not independently revisit these Classwork experience types: ${missingFamilies.join(', ')}. Do not reduce rich graph/mapping/modeling work to mostly simple response questions.`,
    ));
  }

  if (practice.averageDok + 0.45 < classwork.averageDok || (classwork.maxDok >= 3 && practice.maxDok <= 1)) {
    issues.push(issue(
      'rigor-drop',
      'warning',
      'Practice cognitive demand drops below Classwork',
      `Average DOK is ${classwork.averageDok || 'n/a'} in Classwork and ${practice.averageDok || 'n/a'} in Practice. Practice should reduce scaffolding, not reduce the mathematics.`,
    ));
  }

  if (classwork.richShare >= 0.5 && practice.richShare + 0.25 < classwork.richShare) {
    issues.push(issue(
      'interaction-richness',
      'warning',
      'Practice relies too heavily on simpler response formats',
      `${Math.round(classwork.richShare * 100)}% of Classwork uses rich interactive tools versus ${Math.round(practice.richShare * 100)}% of Practice. Preserve graph, mapping, table, modeling, and representation work when students practice independently.`,
    ));
  }

  if (practice.guidedShare > Math.max(0.5, classwork.guidedShare + 0.15)) {
    issues.push(issue(
      'scaffolding',
      'suggestion',
      'Practice may be over-scaffolded',
      `${Math.round(practice.guidedShare * 100)}% of Practice questions carry authored guidance/hints. Practice should normally keep the same rigor while reducing instructional scaffolds.`,
    ));
  }

  const [classMin, classMax] = targets.classwork;
  const [practiceMin, practiceMax] = targets.practice;
  if (classwork.count > classMax && practice.count < practiceMin) {
    issues.push(issue(
      'authoring-balance',
      'warning',
      'Rebalance teaching questions into independent Practice',
      `This bundle has ${classwork.count} Classwork and ${practice.count} Practice questions. A typical ${asArray(bundle?.lessonMetadata?.lessons).length >= 2 ? 'two-lesson' : 'single-lesson'} target is about ${classMin}–${classMax} Classwork and ${practiceMin}–${practiceMax} Practice questions. Keep the richest teaching examples in Classwork and move/rewrite additional applications into Practice.`,
    ));
  }

  return {
    classwork,
    practice,
    targets,
    metrics: {
      standardCoverage: Number(standardCoverage.toFixed(2)),
      familyCoverage: Number(familyCoverage.toFixed(2)),
      practiceCountRatio: Number(practiceCountRatio.toFixed(2)),
      opportunityRatio: Number(opportunityRatio.toFixed(2)),
    },
    issues,
    status: issues.some((entry) => entry.severity === 'warning') ? 'warning' : issues.length ? 'suggestion' : 'pass',
  };
};

export const formatSectionBalanceWarnings = (bundle = {}) => analyzeSectionBalanceRigor(bundle).issues
  .map((entry) => `[Section balance] ${entry.title}: ${entry.message}`);

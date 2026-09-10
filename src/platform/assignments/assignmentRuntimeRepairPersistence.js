import {
  ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  RUNTIME_REPAIR_KEYS,
} from './assignmentRuntimeRepair.js';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const asArray = (value) => (Array.isArray(value) ? value : []);
const sameJson = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const diagnostic = (code, message, questionId = null) => ({
  issueKind: 'platformIssue',
  source: 'runtimeCompatibilityPersistence',
  code: `runtimeRepair.persistence.${code}`,
  severity: 'warning',
  questionId: clean(questionId) || null,
  message,
});

const sectionIdentity = (section, index) => clean(section?.id) || `section-${index + 1}`;
const questionIdentity = (question) => clean(question?.questionId);

const withoutKeys = (source, keys) => {
  const out = isObject(source) ? { ...source } : {};
  keys.forEach((key) => { delete out[key]; });
  return out;
};

const orderedQuestionIds = (assignment = {}) => asArray(assignment.sections).flatMap((section) => (
  asArray(section?.questions).map(questionIdentity)
));

const manifestByQuestion = (repairManifest = []) => {
  const map = new Map();
  asArray(repairManifest).forEach((entry) => {
    const questionId = clean(entry?.questionId);
    if (!questionId) return;
    if (!map.has(questionId)) map.set(questionId, []);
    map.get(questionId).push(entry);
  });
  return map;
};

const validateQuestionRepair = ({ before, after, manifestEntries }) => {
  const questionId = questionIdentity(before);
  if (!questionId || questionIdentity(after) !== questionId) {
    return diagnostic('identityChanged', 'MathMaster refused to persist a runtime repair because question identity or order changed.', questionId || questionIdentity(after));
  }

  if (!sameJson(withoutKeys(before, ['workflow']), withoutKeys(after, ['workflow']))) {
    return diagnostic(
      'protectedContentChanged',
      'MathMaster refused to persist this runtime repair because a protected question field changed. Automatic compatibility repair may change only the proven generated workflow defect — never prompt, mathematics, grading, standards, authored evidence, difficulty, or student actions.',
      questionId,
    );
  }

  const beforeWorkflow = asArray(before?.workflow);
  const afterWorkflow = asArray(after?.workflow);
  const removed = beforeWorkflow.filter((stage) => !afterWorkflow.some((candidate) => sameJson(candidate, stage)));
  const added = afterWorkflow.filter((stage) => !beforeWorkflow.some((candidate) => sameJson(candidate, stage)));
  const exactKnownRemoval = removed.length > 0
    && added.length === 0
    && removed.every((stage) => clean(stage?.kind).toLowerCase() === 'graphconstruction');

  const matchingManifest = asArray(manifestEntries).some((entry) => (
    entry?.changed === true
    && entry?.safeToPersist === true
    && clean(entry?.repairKey) === RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH
  ));

  if (!exactKnownRemoval || !matchingManifest) {
    return diagnostic(
      'unprovenChange',
      'MathMaster refused to persist this runtime repair because the changed workflow does not exactly match a proven deterministic generated-workflow repair.',
      questionId,
    );
  }

  return null;
};

/**
 * Build the only persistence patch permitted for Assignment Runtime Self-Healing.
 *
 * The runtime repair engine is intentionally pure. This verifier independently
 * proves that the candidate changed only a known platform-generated workflow
 * defect before a teacher-side caller may write anything back to Firestore.
 */
export const buildRuntimeRepairPersistencePatch = ({
  storedAssignment = {},
  repairResult = {},
  nowIso = new Date().toISOString(),
} = {}) => {
  const diagnostics = [];
  const repairedAssignment = repairResult?.assignment;

  if (!isObject(storedAssignment) || Number(storedAssignment.schemaVersion) !== 5 || !isObject(repairedAssignment)) {
    diagnostics.push(diagnostic('invalidAssignment', 'Runtime repair persistence requires a stored Assignment V5 record and a repaired Assignment V5 candidate.'));
    return { patch: null, diagnostics };
  }

  if (repairResult.changed !== true) {
    return { patch: null, diagnostics };
  }
  if (repairResult.safeToPersist !== true) {
    diagnostics.push(diagnostic('notSafeToPersist', 'The runtime repair was useful in memory but was not certified safe for persistence. No assignment content was written.'));
    return { patch: null, diagnostics };
  }

  if (!sameJson(
    withoutKeys(storedAssignment, ['sections', 'runtimeCompatibility']),
    withoutKeys(repairedAssignment, ['sections', 'runtimeCompatibility']),
  )) {
    diagnostics.push(diagnostic('protectedAssignmentChanged', 'MathMaster refused to persist a runtime repair because assignment-level protected content changed.'));
    return { patch: null, diagnostics };
  }

  const beforeSections = asArray(storedAssignment.sections);
  const afterSections = asArray(repairedAssignment.sections);
  if (beforeSections.length !== afterSections.length) {
    diagnostics.push(diagnostic('sectionOrderChanged', 'MathMaster refused to persist a runtime repair because section identity or order changed.'));
    return { patch: null, diagnostics };
  }

  if (!sameJson(orderedQuestionIds(storedAssignment), orderedQuestionIds(repairedAssignment))) {
    diagnostics.push(diagnostic('questionOrderChanged', 'MathMaster refused to persist a runtime repair because question identity or order changed.'));
    return { patch: null, diagnostics };
  }

  const manifest = manifestByQuestion(repairResult.repairManifest);
  let changedQuestionCount = 0;

  for (let sectionIndex = 0; sectionIndex < beforeSections.length; sectionIndex += 1) {
    const beforeSection = beforeSections[sectionIndex];
    const afterSection = afterSections[sectionIndex];
    if (sectionIdentity(beforeSection, sectionIndex) !== sectionIdentity(afterSection, sectionIndex)
      || !sameJson(withoutKeys(beforeSection, ['questions']), withoutKeys(afterSection, ['questions']))) {
      diagnostics.push(diagnostic('sectionContentChanged', 'MathMaster refused to persist a runtime repair because section identity, order, or metadata changed.'));
      return { patch: null, diagnostics };
    }

    const beforeQuestions = asArray(beforeSection?.questions);
    const afterQuestions = asArray(afterSection?.questions);
    if (beforeQuestions.length !== afterQuestions.length) {
      diagnostics.push(diagnostic('questionOrderChanged', 'MathMaster refused to persist a runtime repair because question identity or order changed.'));
      return { patch: null, diagnostics };
    }

    for (let questionIndex = 0; questionIndex < beforeQuestions.length; questionIndex += 1) {
      const beforeQuestion = beforeQuestions[questionIndex];
      const afterQuestion = afterQuestions[questionIndex];
      if (sameJson(beforeQuestion, afterQuestion)) continue;
      changedQuestionCount += 1;
      const finding = validateQuestionRepair({
        before: beforeQuestion,
        after: afterQuestion,
        manifestEntries: manifest.get(questionIdentity(beforeQuestion)),
      });
      if (finding) {
        diagnostics.push(finding);
        return { patch: null, diagnostics };
      }
    }
  }

  if (changedQuestionCount === 0) {
    return { patch: null, diagnostics };
  }

  const repairKeys = [...new Set(asArray(repairResult.repairManifest)
    .filter((entry) => entry?.changed === true && entry?.safeToPersist === true)
    .map((entry) => clean(entry?.repairKey))
    .filter(Boolean))];

  if (!repairKeys.length) {
    diagnostics.push(diagnostic('missingRepairKey', 'MathMaster refused to persist the repair because no exact certified runtime repair key accompanied the content change.'));
    return { patch: null, diagnostics };
  }

  return {
    patch: {
      sections: repairedAssignment.sections,
      runtimeCompatibility: {
        repairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION,
        repairedAt: String(nowIso || new Date().toISOString()),
        repairKeys,
      },
    },
    diagnostics,
  };
};

export default buildRuntimeRepairPersistencePatch;

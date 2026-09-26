"use strict";

const fs = require("fs");
const path = require("path");

const RELEASE_TARGET = "ccmr-fidelity-v2.1-authentic-language";
const FRAMEWORK_FILES = Object.freeze({
  digitalSAT: "digitalSAT_pathQuestionBank_seed.json",
  act: "act_pathQuestionBank_seed.json",
  tsia2: "tsia2_pathQuestionBank_seed.json",
  asvab: "asvab_pathQuestionBank_seed.json",
});
const SUPPORTED_FRAMEWORKS = new Set(Object.keys(FRAMEWORK_FILES));
const bankCache = new Map();

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeTeks(value) {
  return clean(value).replace(/^texas:/i, "").toUpperCase();
}

function documentTeksCodes(document = {}) {
  const fromAlignments = (Array.isArray(document.alignments) ? document.alignments : [])
    .filter((entry) => clean(entry?.framework || "teks") === "teks" && entry?.code)
    .map((entry) => normalizeTeks(entry.code));
  const fromKeys = (Array.isArray(document.alignmentKeys) ? document.alignmentKeys : [])
    .map(normalizeTeks)
    .filter((code) => /^[A-Z0-9]+(?:\.[A-Z0-9]+)+$/.test(code));
  return [...new Set([...fromAlignments, ...fromKeys].filter(Boolean))];
}

function questionTeksCodes(question = {}) {
  const fromAlignments = (Array.isArray(question.alignments) ? question.alignments : [])
    .filter((entry) => clean(entry?.framework || "teks") === "teks" && entry?.code)
    .map((entry) => normalizeTeks(entry.code));
  const fromStandard = [question.standard, question.primaryStandard]
    .map(normalizeTeks)
    .filter(Boolean);
  const rawPrimary = question?.standards?.primary;
  const fromStandards = (Array.isArray(rawPrimary) ? rawPrimary : rawPrimary ? [rawPrimary] : [])
    .map((entry) => normalizeTeks(typeof entry === "string" ? entry : entry?.code || entry?.teks))
    .filter(Boolean);
  const fromTeks = (Array.isArray(question?.teks) ? question.teks : question?.teks ? [question.teks] : [])
    .map((entry) => normalizeTeks(typeof entry === "string" ? entry : entry?.code || entry?.teks))
    .filter(Boolean);
  return [...new Set([...fromAlignments, ...fromStandard, ...fromStandards, ...fromTeks])];
}

function examDomain(document = {}, framework = "") {
  const alignment = (Array.isArray(document.alignments) ? document.alignments : [])
    .find((entry) => clean(entry?.framework) === framework && clean(entry?.domainId));
  return clean(alignment?.domainId || document?.assessmentContext?.domainId);
}

function loadFrameworkBank(framework) {
  if (!SUPPORTED_FRAMEWORKS.has(framework)) return [];
  if (bankCache.has(framework)) return bankCache.get(framework);
  const filename = FRAMEWORK_FILES[framework];
  const file = path.join(__dirname, "..", "seeds", "pathQuestionBank", filename);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const sourceItems = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.documents)
      ? payload.documents
      : [];
  const documents = sourceItems.filter((document) => (
    document?.active !== false
    && document?.assessmentContext?.examStyle === true
    && clean(document?.assessmentContext?.framework) === framework
    && document?.ccmrAuthenticLanguage?.authored === true
  ));
  bankCache.set(framework, documents);
  return documents;
}

/*
 * SEMANTIC-FIT GATE (#359).
 *
 * Same-TEKS is necessary but not sufficient: a TEKS code such as A2.3B is
 * carried by every "native" ACT/TSIA2 algebra item in the audited bank
 * (single-equation solves, radical equations, quadratic equations — none of
 * them a system), and A2.3A covers both a 3-variable linear system lesson
 * AND an unrelated 2-variable linear-quadratic system. Ranking those
 * candidates by DOK/difficulty alone can silently swap a 3×3 elimination
 * Practice question for a linear-quadratic break-even item that happens to
 * share the TEKS code. Before ranking, reject any candidate whose own
 * taskType metadata contradicts the source question's mathematical family —
 * system vs. single equation, and linear-quadratic vs. pure linear system.
 * `sourceQuestion` is optional: omitting it (nothing to compare against)
 * skips the gate rather than rejecting everything.
 */
const SYSTEM_TASK_TYPE_PATTERN = /system/i;
const QUADRATIC_TASK_TYPE_PATTERN = /quadratic/i;
// No bank document carries an explicit variable count, so a 3-variable
// system is recognized the same way a person skimming the item would: the
// task type/family id names three/3x3 (taskType is camelCase, e.g.
// "solveThreeVariableSystem", so this intentionally does not require a word
// boundary before "three"), or the prompt itself uses the third variable
// letter (z) the way a 2-variable "system" item never does.
const THREE_VARIABLE_SIGNAL_PATTERN = /three[-\s]?(?:variable|equation)|3\s?[x×]\s?3|\bz\b/i;

function deriveSourceSemanticProfile(question = {}) {
  const equations = Array.isArray(question.equations) ? question.equations : null;
  const variables = Array.isArray(question.variables) ? question.variables : null;
  const dimension = equations?.length || variables?.length || null;
  const actions = (Array.isArray(question.studentActions) ? question.studentActions : []).map(clean);
  const isSystem = Boolean(
    actions.includes("solveSystem")
    || actions.includes("graphSystem")
    || actions.includes("solveInequalitySystem")
    || (actions.includes("connectRepresentations") && equations)
    || clean(question.type) === "systemsWorkspace"
    || (equations && equations.length >= 2),
  );
  const isLinearQuadratic = Boolean(question.linearQuadratic) || clean(question.mode).toLowerCase() === "linearquadratic";
  return {
    dimension,
    isSystem,
    isLinearQuadratic,
    method: clean(question.method),
    taskType: clean(question.taskType),
    representation: clean(question.representation),
  };
}

function documentSemanticProfile(document = {}) {
  const taskType = clean(document.taskType);
  const dimensionHaystack = [taskType, document.familyId, document.assessedConstruct, document.prompt].map(clean).join(" ");
  return {
    taskType,
    representation: clean(document.representation),
    isSystemTaskType: SYSTEM_TASK_TYPE_PATTERN.test(taskType),
    isQuadraticTaskType: QUADRATIC_TASK_TYPE_PATTERN.test(taskType),
    hasThreeVariableSignal: THREE_VARIABLE_SIGNAL_PATTERN.test(dimensionHaystack),
  };
}

/**
 * Does this candidate's own taskType contradict the source question's
 * mathematical family? Absence of metadata is never treated as a mismatch —
 * only a stated contradiction rejects a candidate, so sparsely-tagged bank
 * content is not needlessly excluded.
 */
function isSemanticallyCompatible(sourceProfile, document) {
  if (!sourceProfile || !sourceProfile.isSystem) return true;
  const docProfile = documentSemanticProfile(document);
  // A system (2+ equations) source must be matched by a bank item that is
  // itself a system task, not a single-equation solve carrying the same
  // broad TEKS alignment.
  if (docProfile.taskType && !docProfile.isSystemTaskType) return false;
  // Same TEKS, different construct family: a pure linear system is never
  // interchangeable with a linear-quadratic system, in either direction.
  if (!sourceProfile.isLinearQuadratic && docProfile.isQuadraticTaskType) return false;
  if (sourceProfile.isLinearQuadratic && docProfile.taskType && !docProfile.isQuadraticTaskType) return false;
  // System dimension: a 3-variable linear system must not be satisfied by a
  // system item with no signal that it is anything but the far more common
  // 2-variable case (#359 — "system dimension / number of variables").
  if (sourceProfile.dimension === 3 && !sourceProfile.isLinearQuadratic && docProfile.isSystemTaskType && !docProfile.hasThreeVariableSignal) return false;
  return true;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sameTeksCandidates({ framework, domainId, teksCodes = [], excludeDocumentIds = [] } = {}) {
  const normalizedCodes = new Set((teksCodes || []).map(normalizeTeks).filter(Boolean));
  if (!SUPPORTED_FRAMEWORKS.has(framework) || !normalizedCodes.size) return [];
  const excluded = new Set((excludeDocumentIds || []).map(clean).filter(Boolean));
  return loadFrameworkBank(framework).filter((document) => {
    if (excluded.has(clean(document?.id))) return false;
    if (domainId && examDomain(document, framework) !== domainId) return false;
    return documentTeksCodes(document).some((code) => normalizedCodes.has(code));
  });
}

function rankCandidates(candidates, { dok, difficultyBand, seed }) {
  const desiredDok = Number(dok);
  const desiredDifficulty = Number(difficultyBand);
  const ranked = candidates
    .map((document) => {
      const directPenalty = document?.ccmrFamilyRole === "direct" || Number(document?.ccmrChallengeTier) === 1 ? 0 : 20;
      const dokPenalty = Number.isFinite(desiredDok)
        ? Math.abs((Number(document?.dok) || desiredDok) - desiredDok) * 3
        : 0;
      const difficultyPenalty = Number.isFinite(desiredDifficulty)
        ? Math.abs((Number(document?.difficultyBand) || desiredDifficulty) - desiredDifficulty) * 2
        : 0;
      return { document, score: directPenalty + dokPenalty + difficultyPenalty };
    })
    .sort((left, right) => left.score - right.score || clean(left.document.id).localeCompare(clean(right.document.id)));
  if (!ranked.length) return null;
  const bestScore = ranked[0].score;
  const best = ranked.filter((entry) => entry.score === bestScore);
  return best[stableHash(seed) % best.length]?.document || best[0]?.document || null;
}

/**
 * `sourceQuestion` is the teacher's authored Practice question this bank item
 * would replace. When supplied, a candidate is ranked only after surviving
 * the semantic-fit gate (#359): same TEKS is necessary but not sufficient —
 * see `isSemanticallyCompatible`. Omitting `sourceQuestion` keeps the older
 * TEKS/DOK/difficulty-only behavior for callers that have no source question
 * to compare against.
 */
function chooseAuditedBankDocument({
  framework,
  domainId,
  teksCodes = [],
  dok = null,
  difficultyBand = null,
  seed = "",
  excludeDocumentIds = [],
  sourceQuestion = null,
} = {}) {
  const candidates = sameTeksCandidates({ framework, domainId, teksCodes, excludeDocumentIds });
  if (!candidates.length) return null;
  const sourceProfile = sourceQuestion ? deriveSourceSemanticProfile(sourceQuestion) : null;
  const compatible = sourceProfile
    ? candidates.filter((document) => isSemanticallyCompatible(sourceProfile, document))
    : candidates;
  if (!compatible.length) return null;
  return rankCandidates(compatible, { dok, difficultyBand, seed });
}

function chooseAuditedBankDocumentAnyFramework({
  teksCodes = [],
  dok = null,
  difficultyBand = null,
  seed = "",
  excludeDocumentIds = [],
  sourceQuestion = null,
} = {}) {
  const frameworks = Object.keys(FRAMEWORK_FILES);
  if (!frameworks.length) return null;
  const start = stableHash(seed) % frameworks.length;
  const ordered = frameworks.map((unused, index) => frameworks[(start + index) % frameworks.length]);
  for (const framework of ordered) {
    const document = chooseAuditedBankDocument({
      framework,
      teksCodes,
      dok,
      difficultyBand,
      seed: `${seed}|${framework}`,
      excludeDocumentIds,
      sourceQuestion,
    });
    if (document) return document;
  }
  return null;
}

/**
 * Diagnostics for a source question's CCMR match — how many same-TEKS
 * candidates existed across every supported framework, how many survived the
 * semantic-fit gate, and which one (if any) was actually chosen. This is
 * what a teacher-facing Preflight message and `ccmrSource.matchProvenance`
 * are built from (#359): "surface a clear message that no compatible
 * audited CCMR item is available" needs to be distinguishable from "no
 * same-TEKS item exists at all".
 */
function explainAuditedBankMatch(sourceQuestion = {}, { teksCodes, dok, difficultyBand, seed = "", excludeDocumentIds = [] } = {}) {
  const codes = teksCodes && teksCodes.length ? teksCodes : questionTeksCodes(sourceQuestion);
  const sourceProfile = deriveSourceSemanticProfile(sourceQuestion);
  const frameworks = Object.keys(FRAMEWORK_FILES);
  let sameTeksCount = 0;
  let semanticallyCompatibleCount = 0;
  const perFramework = {};
  for (const framework of frameworks) {
    const candidates = sameTeksCandidates({ framework, teksCodes: codes, excludeDocumentIds });
    const compatible = candidates.filter((document) => isSemanticallyCompatible(sourceProfile, document));
    sameTeksCount += candidates.length;
    semanticallyCompatibleCount += compatible.length;
    perFramework[framework] = { sameTeksCount: candidates.length, semanticallyCompatibleCount: compatible.length };
  }
  const chosen = chooseAuditedBankDocumentAnyFramework({ teksCodes: codes, dok, difficultyBand, seed, excludeDocumentIds, sourceQuestion });
  return {
    teksCodes: codes,
    sourceConstructSignals: {
      isSystem: sourceProfile.isSystem,
      isLinearQuadratic: sourceProfile.isLinearQuadratic,
      dimension: sourceProfile.dimension,
      method: sourceProfile.method || null,
    },
    sameTeksCount,
    semanticallyCompatibleCount,
    rejectedForConstructMismatch: sameTeksCount - semanticallyCompatibleCount,
    perFramework,
    chosenDocumentId: chosen ? clean(chosen.id) : null,
    reason: chosen
      ? "matched"
      : sameTeksCount === 0
        ? "no_same_teks_audited_item"
        : "no_semantically_compatible_audited_item",
  };
}

function isAuditedBankQuestion(question = {}) {
  return question?.ccmrSource?.source === "auditedBank"
    && clean(question?.ccmrSource?.releaseTarget) === RELEASE_TARGET;
}

function choiceAnswerField(field = {}, choices = []) {
  const expectedId = clean(field.expected ?? field.answer);
  const options = (Array.isArray(choices) ? choices : [])
    .map((choice) => clean(choice?.label ?? choice))
    .filter(Boolean);
  const correct = (Array.isArray(choices) ? choices : [])
    .find((choice) => clean(choice?.id) === expectedId);
  const answer = clean(correct?.label) || expectedId;
  return {
    id: clean(field.id) || "answer",
    label: clean(field.label) || "Choose the correct answer",
    type: "choice",
    inputProfile: "choice",
    options,
    answer,
  };
}

function responseFieldToIntent(field = {}, document = {}) {
  const inputProfile = clean(field.inputProfile).toLowerCase();
  if (inputProfile === "choice") return choiceAnswerField(field, document.choices);
  const type = ["text", "set", "inequality", "interval"].includes(inputProfile)
    ? inputProfile
    : undefined;
  const out = {
    id: clean(field.id) || "answer",
    label: clean(field.label) || "Answer",
    inputProfile: inputProfile || undefined,
    answer: field.expected ?? field.answer,
  };
  if (type) out.type = type;
  Object.keys(out).forEach((key) => out[key] === undefined && delete out[key]);
  return out;
}

function bankDocumentToV5Intent(document = {}, { activityRole = "practice", matchProvenance = null } = {}) {
  const teksCodes = documentTeksCodes(document);
  const framework = clean(document?.assessmentContext?.framework);
  const domainId = examDomain(document, framework);
  const answerFields = (Array.isArray(document.responseFields) ? document.responseFields : [])
    .map((field) => responseFieldToIntent(field, document));

  return {
    questionId: clean(document.id) || undefined,
    familyId: clean(document.familyId) || undefined,
    familyVersion: document.familyVersion ?? undefined,
    standard: teksCodes[0] || undefined,
    prompt: document.prompt,
    studentActions: ["multipleResponses"],
    activityRole,
    dok: document.dok,
    difficultyBand: document.difficultyBand,
    calculatorPolicy: document.calculatorPolicy,
    examCalculatorMode: document.examCalculatorMode,
    assessedConstruct: document.assessedConstruct,
    taskType: document.taskType,
    representation: document.representation,
    generator: document.generator,
    answerFields,
    alignments: Array.isArray(document.alignments) ? document.alignments : [],
    assessmentContext: document.assessmentContext,
    assessmentItemFormat: document.assessmentItemFormat,
    ccmrChallengeTier: document.ccmrChallengeTier,
    ccmrFamilyRole: document.ccmrFamilyRole,
    ccmrAuthenticLanguage: document.ccmrAuthenticLanguage,
    solutionReview: document.solutionReview,
    attemptFeedback: document.attemptFeedback,
    supportHints: document.supportHints,
    ccmrSource: {
      source: "auditedBank",
      releaseTarget: RELEASE_TARGET,
      framework,
      domainId,
      documentId: clean(document.id),
      familyId: clean(document.familyId),
      familyVersion: document.familyVersion ?? null,
      // #359: so a teacher can see which exact item was inserted and why it
      // matched — TEKS codes considered, how many same-TEKS candidates were
      // semantically compatible, and this item's own taskType/representation.
      ...(matchProvenance ? {
        matchProvenance: {
          teksCodes: matchProvenance.teksCodes || teksCodes,
          sameTeksCount: matchProvenance.sameTeksCount ?? null,
          semanticallyCompatibleCount: matchProvenance.semanticallyCompatibleCount ?? null,
          documentTaskType: clean(document.taskType) || null,
          documentRepresentation: clean(document.representation) || null,
        },
      } : {}),
    },
  };
}

function directCcmrClaim(question = {}) {
  const context = question?.assessmentContext;
  const framework = clean(context?.framework);
  if (context?.examStyle !== true || !SUPPORTED_FRAMEWORKS.has(framework)) return null;
  const examAlignment = (Array.isArray(question.alignments) ? question.alignments : [])
    .find((entry) => clean(entry?.framework) === framework && clean(entry?.domainId));
  const teksCodes = questionTeksCodes(question);
  if (!examAlignment || !teksCodes.length) return null;
  return {
    framework,
    domainId: clean(examAlignment.domainId),
    teksCodes,
    dok: question.dok,
    difficultyBand: question.difficultyBand,
    sourceQuestion: question,
  };
}

function ensureAuditedCcmrPractice(assignment = {}, audit = null) {
  const resultAudit = audit || {
    releaseTarget: RELEASE_TARGET,
    replaced: 0,
    autoSourced: 0,
    targetCount: 0,
    misses: [],
  };
  if (!assignment || typeof assignment !== "object" || !Array.isArray(assignment.sections)) {
    return { assignment, audit: resultAudit };
  }

  const positions = [];
  assignment.sections.forEach((section, sectionIndex) => {
    const role = clean(section?.role).toLowerCase();
    if (role !== "practice" || !Array.isArray(section?.questions)) return;
    section.questions.forEach((question, questionIndex) => {
      positions.push({ sectionIndex, questionIndex, question });
    });
  });

  // Short checkpoints should not be forced to carry CCMR. On a full Practice
  // section, source roughly 15% from the audited V2.1 bank while keeping the
  // teacher's question count unchanged.
  if (positions.length < 5) {
    resultAudit.targetCount = 0;
    return { assignment, audit: resultAudit };
  }

  const targetCount = Math.max(1, Math.round(positions.length * 0.15));
  resultAudit.targetCount = targetCount;
  const existing = positions.filter(({ question }) => isAuditedBankQuestion(question));
  if (existing.length >= targetCount) {
    return { assignment, audit: resultAudit };
  }

  const usedDocumentIds = new Set(
    existing.map(({ question }) => clean(question?.ccmrSource?.documentId)).filter(Boolean),
  );
  let needed = targetCount - existing.length;
  const mutableSections = assignment.sections.map((section) => ({
    ...section,
    questions: Array.isArray(section?.questions) ? [...section.questions] : section?.questions,
  }));

  // Work from the end of Practice first so the lesson's opening independent
  // questions stay close to the authored instructional sequence. Preserve
  // higher-order Practice whenever ordinary DOK 1/2 work can carry the CCMR
  // target instead. Otherwise an auto-sourced bank item can accidentally replace
  // the assignment's only DOK 3 Honors-depth question and make final publishing
  // fail even though Preflight already approved the lesson.
  //
  // Higher-order items remain a fallback when no lower-DOK same-TEKS candidate
  // can be bank-sourced, so CCMR enrichment still has a path on genuinely
  // advanced Practice sets.
  const questionDok = (question = {}) => Number(
    question?.dok
    ?? question?.dokLevel
    ?? question?.complexity?.dok
    ?? question?.complexity?.level
    ?? 0
  );
  const candidates = [...positions]
    .reverse()
    .sort((left, right) => (
      Number(questionDok(left.question) >= 3) - Number(questionDok(right.question) >= 3)
    ));
  const compatibilityMisses = [];
  for (const position of candidates) {
    if (needed <= 0) break;
    const sourceQuestion = mutableSections[position.sectionIndex]?.questions?.[position.questionIndex];
    if (!sourceQuestion || isAuditedBankQuestion(sourceQuestion)) continue;
    const teksCodes = questionTeksCodes(sourceQuestion);
    if (!teksCodes.length) continue;

    const seed = [
      assignment?.assignment?.title,
      mutableSections[position.sectionIndex]?.id || position.sectionIndex,
      sourceQuestion?.questionId || sourceQuestion?.familyId || sourceQuestion?.prompt || position.questionIndex,
      teksCodes.join(","),
    ].join("|");
    const bankDocument = chooseAuditedBankDocumentAnyFramework({
      teksCodes,
      dok: sourceQuestion.dok,
      difficultyBand: sourceQuestion.difficultyBand,
      seed,
      excludeDocumentIds: [...usedDocumentIds],
      sourceQuestion,
    });
    if (!bankDocument) {
      // #359: keep the teacher's original question and record WHY nothing
      // was inserted — a same-TEKS item existed but failed the
      // semantic-fit gate, versus no same-TEKS item existing at all — so
      // Preflight can surface a specific, honest message instead of
      // inserting an unrelated question merely to hit the 15% target.
      const diagnostics = explainAuditedBankMatch(sourceQuestion, { teksCodes, dok: sourceQuestion.dok, difficultyBand: sourceQuestion.difficultyBand, seed, excludeDocumentIds: [...usedDocumentIds] });
      if (diagnostics.reason !== "no_same_teks_audited_item") {
        compatibilityMisses.push({
          sectionIndex: position.sectionIndex,
          questionIndex: position.questionIndex,
          questionId: sourceQuestion.questionId || null,
          teksCodes,
          reason: diagnostics.reason,
          sameTeksCount: diagnostics.sameTeksCount,
          semanticallyCompatibleCount: diagnostics.semanticallyCompatibleCount,
        });
      }
      continue;
    }

    const replacementCodes = new Set(documentTeksCodes(bankDocument));
    if (!teksCodes.some((code) => replacementCodes.has(code))) continue;

    const matchProvenance = explainAuditedBankMatch(sourceQuestion, { teksCodes, dok: sourceQuestion.dok, difficultyBand: sourceQuestion.difficultyBand, seed, excludeDocumentIds: [...usedDocumentIds] });
    mutableSections[position.sectionIndex].questions[position.questionIndex] = bankDocumentToV5Intent(bankDocument, {
      activityRole: clean(sourceQuestion.activityRole) || "practice",
      matchProvenance,
    });
    usedDocumentIds.add(clean(bankDocument.id));
    resultAudit.autoSourced = Number(resultAudit.autoSourced || 0) + 1;
    needed -= 1;
  }

  if (needed > 0) {
    resultAudit.misses.push({
      reason: "insufficient_same_teks_audited_families",
      requested: targetCount,
      sourced: targetCount - needed,
      details: compatibilityMisses,
    });
  }

  return {
    assignment: { ...assignment, sections: mutableSections },
    audit: resultAudit,
  };
}

function replaceDirectCcmrQuestionsWithAuditedBank(assignment = {}, { ensurePracticeTarget = false } = {}) {
  const audit = {
    releaseTarget: RELEASE_TARGET,
    replaced: 0,
    autoSourced: 0,
    targetCount: 0,
    misses: [],
  };
  if (!assignment || typeof assignment !== "object" || !Array.isArray(assignment.sections)) {
    return { assignment, audit };
  }

  const sections = assignment.sections.map((section, sectionIndex) => {
    const role = clean(section?.role).toLowerCase();
    if (role !== "practice" || !Array.isArray(section?.questions)) return section;
    const questions = section.questions.map((question, questionIndex) => {
      const claim = directCcmrClaim(question);
      if (!claim || isAuditedBankQuestion(question)) return question;
      const bankDocument = chooseAuditedBankDocument({
        ...claim,
        seed: [
          assignment?.assignment?.title,
          section?.id || sectionIndex,
          question?.questionId || question?.familyId || question?.prompt || questionIndex,
          claim.framework,
          claim.domainId,
          claim.teksCodes.join(","),
        ].join("|"),
      });
      if (!bankDocument) {
        // #359: distinguish "no same-TEKS item" from "a same-TEKS item
        // exists but is a different mathematical construct" so Preflight can
        // tell the teacher which one happened, instead of silently forcing
        // in an unrelated question or staying silent about the gap.
        const diagnostics = explainAuditedBankMatch(question, {
          teksCodes: claim.teksCodes,
          dok: claim.dok,
          difficultyBand: claim.difficultyBand,
        });
        audit.misses.push({
          sectionIndex,
          questionIndex,
          framework: claim.framework,
          domainId: claim.domainId,
          teksCodes: claim.teksCodes,
          reason: diagnostics.reason,
          sameTeksCount: diagnostics.sameTeksCount,
          semanticallyCompatibleCount: diagnostics.semanticallyCompatibleCount,
        });
        return question;
      }
      audit.replaced += 1;
      const matchProvenance = explainAuditedBankMatch(question, {
        teksCodes: claim.teksCodes,
        dok: claim.dok,
        difficultyBand: claim.difficultyBand,
      });
      return bankDocumentToV5Intent(bankDocument, {
        activityRole: clean(question.activityRole) || role || "practice",
        matchProvenance,
      });
    });
    return { ...section, questions };
  });

  const replacedAssignment = { ...assignment, sections };
  return ensurePracticeTarget
    ? ensureAuditedCcmrPractice(replacedAssignment, audit)
    : { assignment: replacedAssignment, audit };
}

module.exports = {
  RELEASE_TARGET,
  FRAMEWORK_FILES,
  documentTeksCodes,
  questionTeksCodes,
  chooseAuditedBankDocument,
  chooseAuditedBankDocumentAnyFramework,
  bankDocumentToV5Intent,
  isAuditedBankQuestion,
  ensureAuditedCcmrPractice,
  replaceDirectCcmrQuestionsWithAuditedBank,
  deriveSourceSemanticProfile,
  isSemanticallyCompatible,
  explainAuditedBankMatch,
};

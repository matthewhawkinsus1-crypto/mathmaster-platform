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

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseAuditedBankDocument({
  framework,
  domainId,
  teksCodes = [],
  dok = null,
  difficultyBand = null,
  seed = "",
  excludeDocumentIds = [],
} = {}) {
  const normalizedCodes = new Set((teksCodes || []).map(normalizeTeks).filter(Boolean));
  if (!SUPPORTED_FRAMEWORKS.has(framework) || !normalizedCodes.size) return null;

  const excluded = new Set((excludeDocumentIds || []).map(clean).filter(Boolean));
  const candidates = loadFrameworkBank(framework).filter((document) => {
    if (excluded.has(clean(document?.id))) return false;
    if (domainId && examDomain(document, framework) !== domainId) return false;
    return documentTeksCodes(document).some((code) => normalizedCodes.has(code));
  });
  if (!candidates.length) return null;

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

  const bestScore = ranked[0].score;
  const best = ranked.filter((entry) => entry.score === bestScore);
  return best[stableHash(seed) % best.length]?.document || best[0]?.document || null;
}

function chooseAuditedBankDocumentAnyFramework({
  teksCodes = [],
  dok = null,
  difficultyBand = null,
  seed = "",
  excludeDocumentIds = [],
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
    });
    if (document) return document;
  }
  return null;
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

function bankDocumentToV5Intent(document = {}, { activityRole = "practice" } = {}) {
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
  // questions stay close to the authored instructional sequence. A replacement
  // is only allowed when the audited item assesses the SAME TEKS as the item it
  // replaces; MathMaster never trades course coverage for a CCMR label.
  const candidates = [...positions].reverse();
  for (const position of candidates) {
    if (needed <= 0) break;
    const sourceQuestion = mutableSections[position.sectionIndex]?.questions?.[position.questionIndex];
    if (!sourceQuestion || isAuditedBankQuestion(sourceQuestion)) continue;
    const teksCodes = questionTeksCodes(sourceQuestion);
    if (!teksCodes.length) continue;

    const bankDocument = chooseAuditedBankDocumentAnyFramework({
      teksCodes,
      dok: sourceQuestion.dok,
      difficultyBand: sourceQuestion.difficultyBand,
      seed: [
        assignment?.assignment?.title,
        mutableSections[position.sectionIndex]?.id || position.sectionIndex,
        sourceQuestion?.questionId || sourceQuestion?.familyId || sourceQuestion?.prompt || position.questionIndex,
        teksCodes.join(","),
      ].join("|"),
      excludeDocumentIds: [...usedDocumentIds],
    });
    if (!bankDocument) continue;

    const replacementCodes = new Set(documentTeksCodes(bankDocument));
    if (!teksCodes.some((code) => replacementCodes.has(code))) continue;

    mutableSections[position.sectionIndex].questions[position.questionIndex] = bankDocumentToV5Intent(bankDocument, {
      activityRole: clean(sourceQuestion.activityRole) || "practice",
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
        audit.misses.push({
          sectionIndex,
          questionIndex,
          framework: claim.framework,
          domainId: claim.domainId,
          teksCodes: claim.teksCodes,
        });
        return question;
      }
      audit.replaced += 1;
      return bankDocumentToV5Intent(bankDocument, {
        activityRole: clean(question.activityRole) || role || "practice",
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
};

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
  return [...new Set([...fromAlignments, ...fromStandard])];
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
  const documents = (Array.isArray(payload?.documents) ? payload.documents : []).filter((document) => (
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
} = {}) {
  const normalizedCodes = new Set((teksCodes || []).map(normalizeTeks).filter(Boolean));
  if (!SUPPORTED_FRAMEWORKS.has(framework) || !normalizedCodes.size) return null;

  const candidates = loadFrameworkBank(framework).filter((document) => {
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

function replaceDirectCcmrQuestionsWithAuditedBank(assignment = {}) {
  const audit = { releaseTarget: RELEASE_TARGET, replaced: 0, misses: [] };
  if (!assignment || typeof assignment !== "object" || !Array.isArray(assignment.sections)) {
    return { assignment, audit };
  }

  const sections = assignment.sections.map((section, sectionIndex) => {
    const role = clean(section?.role).toLowerCase();
    if (role !== "practice" || !Array.isArray(section?.questions)) return section;
    const questions = section.questions.map((question, questionIndex) => {
      const claim = directCcmrClaim(question);
      if (!claim) return question;
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

  return {
    assignment: { ...assignment, sections },
    audit,
  };
}

module.exports = {
  RELEASE_TARGET,
  FRAMEWORK_FILES,
  documentTeksCodes,
  questionTeksCodes,
  chooseAuditedBankDocument,
  bankDocumentToV5Intent,
  replaceDirectCcmrQuestionsWithAuditedBank,
};

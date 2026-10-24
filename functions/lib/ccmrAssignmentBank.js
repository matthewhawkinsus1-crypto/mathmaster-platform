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
  // A graphing2 standard-form question's `standard` is its {A, B, C} line,
  // not a code (courseRigor's questionTeks reads it the same way).
  const fromStandard = [question.standard, question.primaryStandard]
    .filter((value) => typeof value === "string")
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

/*
 * TASK TYPE, NOT ONLY TEKS (TT15).
 *
 * A shared TEKS code says nothing about a crosswalked item. Every ACT and
 * TSIA2 "native" item (and the Digital SAT native ones) is crosswalked onto
 * every TEKS its skill touches: the ACT polynomial-evaluation item lists 151.
 * On TEKS alone that item replaced a recursive-sequence question (A.12C), an
 * ACT linear equation a(x − b) = c replaced a Matrix Lab question on DOL #2,
 * and a quadratic-zero item replaced a matrix-inverse check. A Digital SAT
 * item is different: its one TEKS alignment is an assessment
 * (`evidenceLevel: "assessed"`), so that TEKS is what it practises.
 *
 * So when the matcher can see what the source question asks, a crosswalked
 * candidate must name that same task in its own taskType; one that does not
 * is off-topic however many TEKS it shares, and when no candidate of the
 * right task type exists the place keeps the teacher's question (#359's
 * "no_semantically_compatible_audited_item"). What the matcher can see: the
 * tool's student actions below, the tool itself (a sequence workspace, the
 * Matrix Lab), a sequence or matrices the question carries, or a plain
 * question's prompt naming a sequence, a matrix, an inverse or composite
 * function, or a complex number. A question that shows none of these (a
 * generic solve, a sort, a plain multi-part question) keeps the TEKS match.
 *
 * Each row: the task, the V5 student actions that ask for it, and how a bank
 * taskType that practises it reads.
 */
const TASK_KINDS = Object.freeze([
  ["sequence", ["analyzeSequence", "findSequenceTerm", "findMissingTerm", "writeRecursive", "writeExplicit", "compareSequences", "partialSum", "buildSequenceTable", "plotSequence"], /sequence|recursive/i],
  ["matrix", ["locateMatrixElements", "operateOnMatrices", "checkInverseMatrices", "writeMatrixEquation", "solveMatrixEquation", "completeSingularSystem", "rowReduce"], /matri/i],
  ["composition", ["composeFunctions"], /composition/i],
  ["inverseFunction", ["findInverse"], /inverseFunction|inverse[-\s]?(?:function|linear)/i],
  ["relation", ["buildMapping", "plotRelation", "classifyFunction"], /relation(?!ship)|mapping/i],
  ["domainRange", ["analyzeDomain", "analyzeRange", "stateDomain", "stateRange"], /domain/i],
  ["functionFeatures", ["findVertex", "findXIntercepts", "findYIntercept", "findZeros", "findMaximum", "findMinimum", "findAxisOfSymmetry", "analyzeIncreasing", "analyzeDecreasing", "analyzeConstant", "analyzePositive", "analyzeNegative"], /zero|intercept|vertex|axisOfSymmetry|symmetricInput/i],
  ["transformation", ["analyzeTransformations"], /^function(?:Translation|Transformation)/i],
  ["inequality", ["solveInequality", "chooseNumberLine", "constructInterval", "writeInterval"], /inequalit/i],
  ["polynomial", ["factorPolynomial", "dividePolynomial", "longDivision", "syntheticDivision", "multiplyPolynomials", "addSubtractPolynomials"], /polynomial|binomial|^factor(?:Monic|Difference|Polynomial)/i],
  ["radicalEquation", ["solveRadicalEquation"], /radicalEquation|solveRadical|cubeRoot/i],
  ["exponentialLog", ["exponentialLogBridge", "solveExponential", "solveLogarithmic"], /exponential|logarithm/i],
  ["complexNumber", ["complexOperations", "analyzeComplex"], /complex/i],
  ["parabolaGeometry", ["analyzeParabolaGeometry"], /parabola|focus|directrix/i],
  ["literalEquation", ["solveLiteral"], /literal|rearrange/i],
  ["dataModel", ["analyzeData", "fitDataModel", "predictFromModel", "calculateCorrelation"], /fit|residual|correlat|predict|trend|regression|scatter|bivariate/i],
]);
const TASK_KIND_BY_ACTION = new Map(TASK_KINDS.flatMap(([kind, actions]) => actions.map((action) => [action, kind])));
// A plain question shows its task only in its words, and only these name an
// object few tasks use. "Sequence" needs a term with it, so a "sequence of
// transformations" is not a sequence task.
const PROMPT_TASK_KINDS = Object.freeze([
  ["sequence", /\b(?:arithmetic|geometric)\s+sequences?\b|\brecursive(?:ly)?\b|\bnth term\b|\bsequences?\b[^.?!]*\bterms?\b|\bterms?\b[^.?!]*\bsequences?\b/i],
  ["matrix", /\bmatri(?:x|ces)\b/i],
  ["inverseFunction", /\binverse\b(?!\s+(?:operations?|variation|propert))/i],
  ["composition", /\bcomposition\b(?!\s+of\s+(?:transformations?|rigid|reflections?|rotations?|translations?))|\bcomposite functions?\b|\b[a-z]\s*\(\s*[a-z]\s*\(\s*x\s*\)\s*\)/i],
  ["complexNumber", /\bcomplex numbers?\b|\bimaginary\b/i],
]);

function sourceTaskKinds(question = {}) {
  const kinds = new Set();
  (Array.isArray(question.studentActions) ? question.studentActions : []).forEach((action) => {
    const kind = TASK_KIND_BY_ACTION.get(clean(action));
    if (kind) kinds.add(kind);
  });
  const type = clean(question.type);
  if (/sequence/i.test(type) || (question.sequence && typeof question.sequence === "object")) kinds.add("sequence");
  if (/matrix/i.test(type) || (question.matrices && typeof question.matrices === "object")) kinds.add("matrix");
  if (!kinds.size) {
    const prompt = clean(question.prompt);
    PROMPT_TASK_KINDS.forEach(([kind, pattern]) => {
      if (pattern.test(prompt)) kinds.add(kind);
    });
    // A matrix's inverse is a matrix task, not an inverse function.
    if (kinds.has("matrix")) kinds.delete("inverseFunction");
  }
  return [...kinds];
}

function documentTaskKinds(document = {}) {
  const taskType = clean(document.taskType);
  return taskType ? TASK_KINDS.filter(([, , pattern]) => pattern.test(taskType)).map(([kind]) => kind) : [];
}

// The item assesses one of these TEKS (a Digital SAT item) rather than being
// crosswalked onto it.
function assessesTeks(document = {}, teksCodes = []) {
  const codes = new Set((teksCodes || []).map(normalizeTeks));
  return (Array.isArray(document.alignments) ? document.alignments : []).some((entry) => (
    clean(entry?.framework || "teks") === "teks"
    && clean(entry?.evidenceLevel).toLowerCase() === "assessed"
    && codes.has(normalizeTeks(entry?.code))
  ));
}

function isTaskKindCompatible(sourceProfile, document) {
  const kinds = Array.isArray(sourceProfile?.taskKinds) ? sourceProfile.taskKinds : [];
  if (!kinds.length) return true;
  if (assessesTeks(document, sourceProfile.teksCodes)) return true;
  return documentTaskKinds(document).some((kind) => kinds.includes(kind));
}

function deriveSourceSemanticProfile(question = {}, { teksCodes = null } = {}) {
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
    taskKinds: sourceTaskKinds(question),
    teksCodes: (Array.isArray(teksCodes) && teksCodes.length ? teksCodes : questionTeksCodes(question)).map(normalizeTeks),
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
 * Does this candidate practise what the source question asks? First the task
 * type (TT15): when the source's task shows, a crosswalked candidate must name
 * it. Then, for a system source, does its own taskType contradict the
 * system's family (#359)? There, absence of metadata is not a mismatch — only
 * a stated contradiction rejects a candidate.
 */
function isSemanticallyCompatible(sourceProfile, document) {
  if (!sourceProfile) return true;
  if (!isTaskKindCompatible(sourceProfile, document)) return false;
  if (!sourceProfile.isSystem) return true;
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

/*
 * BREADTH OF A SAME-TEKS MATCH.
 *
 * A Digital SAT item names the one TEKS it assesses. An ACT or TSIA2 "native"
 * item is crosswalked onto every TEKS its skill touches: the ACT
 * translated-point item lists 152, from Grade 6 through Algebra II. It shares
 * a TEKS with nearly every lesson, which is how a point-translation item was
 * put in the place of an inverse-functions Practice question. A candidate
 * whose alignment is that broad is still a fallback, but never ahead of one
 * aligned narrowly enough to say what it assesses.
 */
const BROAD_TEKS_ALIGNMENT = 6;
const teksBreadthTier = (document) => (documentTeksCodes(document).length >= BROAD_TEKS_ALIGNMENT ? 1 : 0);

function candidateScore(document, { dok, difficultyBand }) {
  const desiredDok = Number(dok);
  const desiredDifficulty = Number(difficultyBand);
  const directPenalty = document?.ccmrFamilyRole === "direct" || Number(document?.ccmrChallengeTier) === 1 ? 0 : 20;
  const dokPenalty = Number.isFinite(desiredDok)
    ? Math.abs((Number(document?.dok) || desiredDok) - desiredDok) * 3
    : 0;
  const difficultyPenalty = Number.isFinite(desiredDifficulty)
    ? Math.abs((Number(document?.difficultyBand) || desiredDifficulty) - desiredDifficulty) * 2
    : 0;
  return directPenalty + dokPenalty + difficultyPenalty;
}

// One framework's candidates, best first. The first entry is the document the
// single-choice ranking always returned (a seeded pick among the equally best),
// so asking for one candidate is unchanged; the rest follow in score order.
function rankCandidates(candidates, { dok, difficultyBand, seed }) {
  const ranked = candidates
    .map((document) => ({ document, score: candidateScore(document, { dok, difficultyBand }) }))
    .sort((left, right) => left.score - right.score || clean(left.document.id).localeCompare(clean(right.document.id)));
  if (!ranked.length) return [];
  const best = ranked.filter((entry) => entry.score === ranked[0].score);
  const first = best[stableHash(seed) % best.length] || best[0];
  return [first, ...ranked.filter((entry) => entry !== first)].map((entry) => entry.document);
}

function compatibleCandidates({ framework, domainId, teksCodes, excludeDocumentIds, sourceQuestion }) {
  const candidates = sameTeksCandidates({ framework, domainId, teksCodes, excludeDocumentIds });
  const sourceProfile = sourceQuestion ? deriveSourceSemanticProfile(sourceQuestion, { teksCodes }) : null;
  return sourceProfile
    ? candidates.filter((document) => isSemanticallyCompatible(sourceProfile, document))
    : candidates;
}

// The TEKS a source question names as primary — what the lesson is teaching
// with it — as opposed to a secondary code it also touches. A transformations
// question tagged A.3E (primary) and A.3C (secondary) is better served by an
// A.3E item than by an intercepts item that shares only A.3C.
function primaryTeksCodes(question = {}) {
  const declared = (Array.isArray(question?.alignments) ? question.alignments : [])
    .filter((entry) => clean(entry?.framework || "teks") === "teks" && entry?.code && clean(entry?.role).toLowerCase() === "primary")
    .map((entry) => normalizeTeks(entry.code));
  if (declared.length) return declared;
  const standard = typeof question?.standard === "string" ? question.standard : question?.primaryStandard;
  return standard ? [normalizeTeks(standard)] : [];
}

// Narrow alignments first, and among those the ones on the source's primary
// TEKS; within a group, the framework order and ranking the single choice has
// always used.
function rankWithinBreadth(rankedByFramework, sourceQuestion) {
  const primary = new Set(sourceQuestion ? primaryTeksCodes(sourceQuestion) : []);
  const primaryTier = (document) => (primary.size && !documentTeksCodes(document).some((code) => primary.has(code)) ? 1 : 0);
  return [[0, 0], [0, 1], [1, 0], [1, 1]].flatMap(([breadth, emphasis]) => rankedByFramework.flatMap((documents) => (
    documents.filter((document) => teksBreadthTier(document) === breadth && primaryTier(document) === emphasis)
  )));
}

/**
 * Every compatible audited document for one place, best first, so a caller
 * that finds the first one unusable has the next one ready (validated
 * alternatives, canonicalCcmrHydration.js). `framework` restricts the search
 * to one framework (a direct exam-style claim); without it every framework is
 * searched in the seeded rotation the single choice uses.
 */
function rankAuditedBankDocuments({
  framework = null,
  domainId = null,
  teksCodes = [],
  dok = null,
  difficultyBand = null,
  seed = "",
  excludeDocumentIds = [],
  sourceQuestion = null,
  limit = Infinity,
} = {}) {
  let frameworks;
  if (framework) {
    frameworks = [framework];
  } else {
    const all = Object.keys(FRAMEWORK_FILES);
    const start = stableHash(seed) % all.length;
    frameworks = all.map((unused, index) => all[(start + index) % all.length]);
  }
  const rankedByFramework = frameworks.map((entry) => rankCandidates(
    compatibleCandidates({ framework: entry, domainId, teksCodes, excludeDocumentIds, sourceQuestion }),
    { dok, difficultyBand, seed: framework ? seed : `${seed}|${entry}` },
  ));
  return rankWithinBreadth(rankedByFramework, sourceQuestion).slice(0, Math.max(0, limit));
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
  if (!framework) return null;
  return rankAuditedBankDocuments({
    framework, domainId, teksCodes, dok, difficultyBand, seed, excludeDocumentIds, sourceQuestion, limit: 1,
  })[0] || null;
}

function chooseAuditedBankDocumentAnyFramework({
  teksCodes = [],
  dok = null,
  difficultyBand = null,
  seed = "",
  excludeDocumentIds = [],
  sourceQuestion = null,
} = {}) {
  return rankAuditedBankDocuments({
    teksCodes, dok, difficultyBand, seed, excludeDocumentIds, sourceQuestion, limit: 1,
  })[0] || null;
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
  const sourceProfile = deriveSourceSemanticProfile(sourceQuestion, { teksCodes: codes });
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
      taskKinds: sourceProfile.taskKinds,
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
  // Job P: a Digital SAT number box also takes the decimal the SAT accepts
  // (functions/shared/answerUtils.mjs reads numberRules).
  if (clean(document?.assessmentContext?.framework) === "digitalSAT" && ["number", "numeric"].includes(inputProfile)) {
    out.numberRules = "digitalSAT";
  }
  // GR01: a number box that takes a calculation keeps saying so.
  if (field.allowArithmetic === true) out.allowArithmetic = true;
  if (type) out.type = type;
  Object.keys(out).forEach((key) => out[key] === undefined && delete out[key]);
  return out;
}

/*
 * THE TABLE A BANK ITEM SHOWS IS DATA, NOT DECORATION.
 *
 * The audited bank carries no structured visuals. A Digital SAT table item
 * writes its table into the prompt as a LaTeX array; a model-selection item
 * says "The table shows four observations:" and then lists them. Converted
 * as plain prompt text, both reach MathMaster's own check as a prompt that
 * promises a table and a question that contains none — the same blocker
 * (semanticValidation.js, "refers to a table in its prompt") that stopped
 * publishing, only for tables. So the conversion carries the table across as
 * a `table` the multiAnswer renderer draws (QuestionVisual), with the same
 * rows in the same order. Cells keep their {{placeholders}}; the generator
 * fills them per student exactly as it fills the prompt. Nothing is invented:
 * a table is built only from values the item itself states, and a layout this
 * code does not recognise is left as written (and the item is then judged,
 * and if necessary skipped, by the client's validation).
 *
 * Graphs are deliberately NOT drawn here. Every graph an audited item names
 * is given in words or by its equation ("the graph of $y=mx+b$"); drawing it
 * would let a student read off what the item asks them to work out.
 */
const TABLE_PROMISE = /\b(the|this|each|following)\s+table\b|\btable\s+(below|above|shown)\b/i;
// One math span holding only arrays (side by side, separated by spacing).
const LATEX_ARRAY_SPAN = /\$\s*((?:\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\}(?:\s|\\q?quad|\\[,;:!])*)+)\$/;
const LATEX_ARRAY = /\\begin\{array\}\{([^}]*)\}([\s\S]*?)\\end\{array\}/g;
const TABLE_LABEL = /^[A-Za-z][A-Za-z0-9()'_+\-\s]{0,15}$/;
const TABLE_CELL = /^(?:\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*(?:\|\s*[A-Za-z]+\s*)?\}\}|-?\d+(?:\.\d+)?)$/;
const ORDERED_PAIR = /\$\s*\(\s*([^,()$]+?)\s*,\s*([^,()$]+?)\s*\)\s*\$/g;
const FUNCTION_VALUE = /\$\s*([A-Za-z])\(\s*([^()$]+?)\s*\)\s*=\s*([^$]+?)\s*\$/g;

function tableColumns(labels) {
  const used = new Set();
  return labels.map((label, index) => {
    const base = clean(label).toLowerCase().replace(/[^a-z0-9]+/g, "") || `c${index}`;
    let key = base;
    for (let suffix = 2; used.has(key); suffix += 1) key = `${base}${suffix}`;
    used.add(key);
    return { key, label: clean(label) };
  });
}

function tableFromColumns(labels, columnValues) {
  if (labels.length < 2 || !labels.every((label) => TABLE_LABEL.test(clean(label)))) return null;
  const length = columnValues[0]?.length || 0;
  if (length < 1 || columnValues.some((values) => values.length !== length)) return null;
  if (!columnValues.every((values) => values.every((value) => TABLE_CELL.test(clean(value))))) return null;
  const columns = tableColumns(labels);
  const rows = Array.from({ length }, (unused, rowIndex) => Object.fromEntries(
    columns.map((column, columnIndex) => [column.key, clean(columnValues[columnIndex][rowIndex])]),
  ));
  return { columns, rows };
}

// One array as columns: { labels, columns }. "x & 1 & 3 \\ \hline f(x) & 5 & 9"
// with a rule after the first column is a table whose first column names each
// row: the SAT's horizontal x/f(x) table. A header row (a rule under the first
// row) is the vertical layout already.
function latexArrayColumns(spec, body) {
  const rows = body.split(/\\\\/).map((row) => row.trim()).filter(Boolean);
  const ruledFirstRow = /\\hline/.test(rows[1] || "") && !/\\hline/.test(rows[0] || "");
  const cells = rows.map((row) => row.replace(/\\hline/g, "").split("&").map(clean));
  if (cells.length < 2 || cells.some((row) => row.length < 2 || row.length !== cells[0].length)) return null;
  if (/^[lcr]\|/.test(spec.replace(/\s+/g, ""))) {
    return { labels: cells.map((row) => row[0]), columns: cells.map((row) => row.slice(1)) };
  }
  if (ruledFirstRow) {
    const [header, ...rest] = cells;
    return { labels: header, columns: header.map((unused, index) => rest.map((row) => row[index])) };
  }
  return null;
}

// Stored the way MathMaster draws tables, one column per quantity, which also
// keeps it inside a phone's width. Tables set side by side over the same
// inputs (f and g at the same x) are one table with a column for each.
function latexArrayTable(prompt) {
  const span = LATEX_ARRAY_SPAN.exec(String(prompt || ""));
  if (!span) return null;
  const arrays = [...span[1].matchAll(LATEX_ARRAY)].map((match) => latexArrayColumns(match[1], match[2]));
  if (!arrays.length || arrays.some((entry) => !entry)) return null;
  const [first, ...others] = arrays;
  const sameInputs = others.every((entry) => (
    entry.labels[0] === first.labels[0]
    && JSON.stringify(entry.columns[0]) === JSON.stringify(first.columns[0])
  ));
  if (!sameInputs) return null;
  const table = tableFromColumns(
    [...first.labels, ...others.flatMap((entry) => entry.labels.slice(1))],
    [...first.columns, ...others.flatMap((entry) => entry.columns.slice(1))],
  );
  if (!table) return null;
  const remaining = String(prompt).replace(span[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { prompt: remaining, table, source: "latexArray" };
}

// "The table shows four observations: $(1,2)$, $(3,5)$, …" — the table the
// prompt names is exactly the pairs it lists.
function listedPairsTable(prompt) {
  const pairs = [...String(prompt || "").matchAll(ORDERED_PAIR)].map((match) => [match[1], match[2]]);
  if (pairs.length < 2) return null;
  const table = tableFromColumns(["x", "y"], [pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1])]);
  return table ? { prompt, table, source: "listedPairs" } : null;
}

// "The table gives values of an exponential function: $f(0)=A$, $f(1)=B$ …"
function listedFunctionValuesTable(prompt) {
  const values = [...String(prompt || "").matchAll(FUNCTION_VALUE)];
  if (values.length < 2 || new Set(values.map((match) => match[1])).size !== 1) return null;
  const name = values[0][1];
  const table = tableFromColumns(["x", `${name}(x)`], [values.map((match) => match[2]), values.map((match) => match[3])]);
  return table ? { prompt, table, source: "listedFunctionValues" } : null;
}

function preservedPromptTable(prompt) {
  const text = String(prompt || "");
  if (text.includes("\\begin{array}")) return latexArrayTable(text);
  if (!TABLE_PROMISE.test(text)) return null;
  return listedPairsTable(text) || listedFunctionValuesTable(text);
}

function bankDocumentToV5Intent(document = {}, { activityRole = "practice", matchProvenance = null } = {}) {
  const teksCodes = documentTeksCodes(document);
  const framework = clean(document?.assessmentContext?.framework);
  const domainId = examDomain(document, framework);
  const answerFields = (Array.isArray(document.responseFields) ? document.responseFields : [])
    .map((field) => responseFieldToIntent(field, document));
  const preservedTable = preservedPromptTable(document.prompt);

  return {
    questionId: clean(document.id) || undefined,
    familyId: clean(document.familyId) || undefined,
    familyVersion: document.familyVersion ?? undefined,
    standard: teksCodes[0] || undefined,
    prompt: preservedTable ? preservedTable.prompt : document.prompt,
    ...(preservedTable ? { table: preservedTable.table } : {}),
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
      // The item's words are the audited words; only where its table is drawn
      // changed. Recorded so the provenance says exactly that.
      ...(preservedTable ? { tableFrom: preservedTable.source } : {}),
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

/*
 * A PLAN OF VALIDATED ALTERNATIVES, NOT ONE GUESS PER PLACE.
 *
 * The server cannot run MathMaster's assignment checks (they live in the
 * client's Pre-Flight), so a single chosen document per Practice place was
 * only ever a guess — and when the guess failed those checks, it failed at
 * Create Assignment, after Pre-Flight had said the lesson was ready. With
 * `includeCandidates`, hydration also returns `audit.plan`: for every place
 * the audited target may use, the ranked compatible candidates, already
 * converted. The client validates them in order and keeps the first that
 * passes (canonicalCcmrHydration.js). The `assignment` returned is unchanged:
 * the first choice, as before, for callers that do not validate.
 */
const PLAN_VERSION = 1;
const PLAN_CANDIDATES_PER_PLACE = 5;
const PLAN_CANDIDATE_BUDGET = 40;

function newPlan(options = {}) {
  if (options.includeCandidates !== true) return null;
  return {
    version: PLAN_VERSION,
    releaseTarget: RELEASE_TARGET,
    targetCount: 0,
    slots: [],
    budget: Math.max(0, Number(options.candidateBudget ?? PLAN_CANDIDATE_BUDGET)),
    offered: new Set(),
  };
}

function finishPlan(plan) {
  if (!plan) return undefined;
  const finished = { ...plan };
  delete finished.budget;
  delete finished.offered;
  return finished;
}

// Distinct places get distinct items first. The client never uses an item
// twice and drops one that fails anywhere, so offering every place the same
// top five left a lesson whose places share TEKS with five items in all, when
// the bank held dozens. An item already offered elsewhere only fills out a
// place with too few of its own (a narrow construct, a small pool).
function planCandidates(plan, rankOptions, intentOptions) {
  const remaining = Number(plan?.budget);
  if (!(remaining > 0)) return [];
  const limit = Math.min(PLAN_CANDIDATES_PER_PLACE, remaining);
  const excluded = cleanIdList(rankOptions.excludeDocumentIds);
  const fresh = rankAuditedBankDocuments({
    ...rankOptions,
    excludeDocumentIds: [...excluded, ...plan.offered],
    limit,
  });
  const repeats = fresh.length < limit
    ? rankAuditedBankDocuments({ ...rankOptions, excludeDocumentIds: excluded, limit: limit + fresh.length })
      .filter((document) => plan.offered.has(clean(document.id)))
      .slice(0, limit - fresh.length)
    : [];
  fresh.forEach((document) => plan.offered.add(clean(document.id)));
  const documents = [...fresh, ...repeats];
  plan.budget -= documents.length;
  return documents.map((document) => bankDocumentToV5Intent(document, intentOptions));
}

const cleanIdList = (values) => [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];

function ensureAuditedCcmrPractice(assignment = {}, audit = null, options = {}) {
  const resultAudit = audit || {
    releaseTarget: RELEASE_TARGET,
    replaced: 0,
    autoSourced: 0,
    targetCount: 0,
    misses: [],
  };
  const plan = resultAudit.plan || newPlan(options);
  const finish = (result) => {
    if (plan) resultAudit.plan = finishPlan(plan);
    return result;
  };
  const excludedByCaller = cleanIdList(options.excludeDocumentIds);
  if (!assignment || typeof assignment !== "object" || !Array.isArray(assignment.sections)) {
    return finish({ assignment, audit: resultAudit });
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
    if (plan) plan.targetCount = 0;
    return finish({ assignment, audit: resultAudit });
  }

  const targetCount = Math.max(1, Math.round(positions.length * 0.15));
  resultAudit.targetCount = targetCount;
  if (plan) plan.targetCount = targetCount;
  const existing = positions.filter(({ question }) => isAuditedBankQuestion(question));
  // A plan is still built when the target is already met: a place the client
  // finds it must keep authored (a direct claim no audited item can pass for)
  // needs somewhere else to put the target.
  if (existing.length >= targetCount && !plan) {
    return { assignment, audit: resultAudit };
  }

  const existingDocumentIds = existing.map(({ question }) => clean(question?.ccmrSource?.documentId)).filter(Boolean);
  const usedDocumentIds = new Set([...existingDocumentIds, ...excludedByCaller]);
  let needed = Math.max(0, targetCount - existing.length);
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
  // TT15: an audited item counts as Honors CCMR transfer only on a TEKS that
  // an ordinary question elsewhere in the lesson also teaches (courseRigor's
  // ccmrEnrichment). An off-topic item crosswalked onto 151 TEKS always looked
  // like transfer; an on-topic item on the place's own TEKS is transfer only
  // when another question teaches that TEKS. So, after the DOK 3 rule, places
  // whose TEKS the lesson teaches again come first, and a standard the lesson
  // teaches once keeps its authored question.
  const ordinary = assignment.sections.flatMap((section, sectionIndex) => (
    (Array.isArray(section?.questions) ? section.questions : [])
      .map((question, questionIndex) => ({ question, sectionIndex, questionIndex }))
  )).filter(({ question }) => (
    question && question.teacherExcluded !== true && !isAuditedBankQuestion(question) && !directCcmrClaim(question)
  ));
  const taughtOnlyHere = new Set(positions.filter((position) => {
    const codes = questionTeksCodes(position.question);
    return !ordinary.some((entry) => (
      (entry.sectionIndex !== position.sectionIndex || entry.questionIndex !== position.questionIndex)
      && questionTeksCodes(entry.question).some((code) => codes.includes(code))
    ));
  }));
  const candidates = [...positions]
    .reverse()
    .sort((left, right) => (
      Number(questionDok(left.question) >= 3) - Number(questionDok(right.question) >= 3)
      || Number(taughtOnlyHere.has(left)) - Number(taughtOnlyHere.has(right))
    ));
  const compatibilityMisses = [];
  for (const position of candidates) {
    if (needed <= 0 && !plan) break;
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
    const rankOptions = {
      teksCodes,
      dok: sourceQuestion.dok,
      difficultyBand: sourceQuestion.difficultyBand,
      seed,
      sourceQuestion,
    };
    const activityRole = clean(sourceQuestion.activityRole) || "practice";

    if (plan) {
      // Every place's alternatives exclude only what the assignment already
      // holds and what the teacher set aside: which place keeps which
      // candidate is the client's decision, after validation.
      const planExclusions = [...existingDocumentIds, ...excludedByCaller];
      const diagnostics = explainAuditedBankMatch(sourceQuestion, { ...rankOptions, excludeDocumentIds: planExclusions });
      plan.slots.push({
        kind: "practiceTarget",
        sectionIndex: position.sectionIndex,
        questionIndex: position.questionIndex,
        questionId: clean(sourceQuestion.questionId) || null,
        teksCodes,
        dok: Number.isFinite(Number(sourceQuestion.dok)) ? Number(sourceQuestion.dok) : null,
        reason: diagnostics.reason,
        sameTeksCount: diagnostics.sameTeksCount,
        semanticallyCompatibleCount: diagnostics.semanticallyCompatibleCount,
        candidates: planCandidates(
          plan,
          { ...rankOptions, excludeDocumentIds: planExclusions },
          { activityRole, matchProvenance: diagnostics },
        ),
      });
    }
    if (needed <= 0) continue;

    const bankDocument = chooseAuditedBankDocumentAnyFramework({
      ...rankOptions,
      excludeDocumentIds: [...usedDocumentIds],
    });
    if (!bankDocument) {
      // #359: keep the teacher's original question and record WHY nothing
      // was inserted — a same-TEKS item existed but failed the
      // semantic-fit gate, versus no same-TEKS item existing at all — so
      // Preflight can surface a specific, honest message instead of
      // inserting an unrelated question merely to hit the 15% target.
      const diagnostics = explainAuditedBankMatch(sourceQuestion, { ...rankOptions, excludeDocumentIds: [...usedDocumentIds] });
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

    const matchProvenance = explainAuditedBankMatch(sourceQuestion, { ...rankOptions, excludeDocumentIds: [...usedDocumentIds] });
    mutableSections[position.sectionIndex].questions[position.questionIndex] = bankDocumentToV5Intent(bankDocument, {
      activityRole,
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

  return finish({
    assignment: { ...assignment, sections: mutableSections },
    audit: resultAudit,
  });
}

function replaceDirectCcmrQuestionsWithAuditedBank(assignment = {}, options = {}) {
  const { ensurePracticeTarget = false } = options || {};
  const audit = {
    releaseTarget: RELEASE_TARGET,
    replaced: 0,
    autoSourced: 0,
    targetCount: 0,
    misses: [],
  };
  const plan = newPlan(options);
  if (plan) audit.plan = plan;
  const excludedByCaller = cleanIdList(options?.excludeDocumentIds);
  if (!assignment || typeof assignment !== "object" || !Array.isArray(assignment.sections)) {
    if (plan) audit.plan = finishPlan(plan);
    return { assignment, audit };
  }

  const sections = assignment.sections.map((section, sectionIndex) => {
    const role = clean(section?.role).toLowerCase();
    if (role !== "practice" || !Array.isArray(section?.questions)) return section;
    const questions = section.questions.map((question, questionIndex) => {
      const claim = directCcmrClaim(question);
      if (!claim || isAuditedBankQuestion(question)) return question;
      const rankOptions = {
        ...claim,
        seed: [
          assignment?.assignment?.title,
          section?.id || sectionIndex,
          question?.questionId || question?.familyId || question?.prompt || questionIndex,
          claim.framework,
          claim.domainId,
          claim.teksCodes.join(","),
        ].join("|"),
        excludeDocumentIds: excludedByCaller,
      };
      const activityRole = clean(question.activityRole) || role || "practice";
      const matchProvenance = explainAuditedBankMatch(question, {
        teksCodes: claim.teksCodes,
        dok: claim.dok,
        difficultyBand: claim.difficultyBand,
      });
      if (plan) {
        // The place keeps the teacher's question until the client finds a
        // candidate that passes; the claim names its own framework and domain.
        plan.slots.push({
          kind: "directClaim",
          sectionIndex,
          questionIndex,
          questionId: clean(question.questionId) || null,
          framework: claim.framework,
          domainId: claim.domainId,
          teksCodes: claim.teksCodes,
          dok: Number.isFinite(Number(claim.dok)) ? Number(claim.dok) : null,
          reason: matchProvenance.reason,
          sameTeksCount: matchProvenance.sameTeksCount,
          semanticallyCompatibleCount: matchProvenance.semanticallyCompatibleCount,
          candidates: planCandidates(plan, rankOptions, { activityRole, matchProvenance }),
        });
      }
      const bankDocument = chooseAuditedBankDocument(rankOptions);
      if (!bankDocument) {
        // #359: distinguish "no same-TEKS item" from "a same-TEKS item
        // exists but is a different mathematical construct" so Preflight can
        // tell the teacher which one happened, instead of silently forcing
        // in an unrelated question or staying silent about the gap.
        audit.misses.push({
          sectionIndex,
          questionIndex,
          framework: claim.framework,
          domainId: claim.domainId,
          teksCodes: claim.teksCodes,
          reason: matchProvenance.reason,
          sameTeksCount: matchProvenance.sameTeksCount,
          semanticallyCompatibleCount: matchProvenance.semanticallyCompatibleCount,
        });
        return question;
      }
      audit.replaced += 1;
      return bankDocumentToV5Intent(bankDocument, {
        activityRole,
        matchProvenance,
      });
    });
    return { ...section, questions };
  });

  const replacedAssignment = { ...assignment, sections };
  if (ensurePracticeTarget) return ensureAuditedCcmrPractice(replacedAssignment, audit, options);
  if (plan) audit.plan = finishPlan(plan);
  return { assignment: replacedAssignment, audit };
}

module.exports = {
  RELEASE_TARGET,
  FRAMEWORK_FILES,
  documentTeksCodes,
  questionTeksCodes,
  chooseAuditedBankDocument,
  chooseAuditedBankDocumentAnyFramework,
  rankAuditedBankDocuments,
  bankDocumentToV5Intent,
  isAuditedBankQuestion,
  ensureAuditedCcmrPractice,
  replaceDirectCcmrQuestionsWithAuditedBank,
  deriveSourceSemanticProfile,
  isSemanticallyCompatible,
  explainAuditedBankMatch,
};

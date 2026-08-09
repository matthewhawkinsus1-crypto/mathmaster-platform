import { getTexasStandard, normalizeTeksCode } from '../../texasStandards.js';
import { EXAM_DOMAIN_REGISTRY, EXAM_TYPES, mapTEKSToExamDomains } from '../assessment/examDomainRegistry.js';

// The canonical alignment model. The older shape was TEKS-shaped
// (`standards.primary[]`), which cannot express "this item also lives in SAT
// Algebra" without pretending an SAT domain is a TEKS code. `alignments` is a
// flat list where every entry names its own framework, so TEKS and the four
// exam frameworks are peers.

export const ALIGNMENT_FRAMEWORKS = Object.freeze({
  TEKS: 'teks',
  DIGITAL_SAT: EXAM_TYPES.DIGITAL_SAT,
  ACT: EXAM_TYPES.ACT,
  TSIA2: EXAM_TYPES.TSIA2,
  ASVAB: EXAM_TYPES.ASVAB,
});

export const ALIGNMENT_FRAMEWORK_IDS = Object.freeze(Object.values(ALIGNMENT_FRAMEWORKS));

// A framework that addresses standards by code (TEKS) versus one that addresses
// broad reporting domains (the exams). Validation differs.
export const CODE_FRAMEWORKS = Object.freeze([ALIGNMENT_FRAMEWORKS.TEKS]);
export const DOMAIN_FRAMEWORKS = Object.freeze([
  ALIGNMENT_FRAMEWORKS.DIGITAL_SAT,
  ALIGNMENT_FRAMEWORKS.ACT,
  ALIGNMENT_FRAMEWORKS.TSIA2,
  ALIGNMENT_FRAMEWORKS.ASVAB,
]);

export const ALIGNMENT_ROLES = Object.freeze(['primary', 'secondary', 'prerequisite']);

// How strongly an alignment counts as evidence.
//  - assessed / practiced / introduced: the item genuinely measures this
//    standard, and mastery may move.
//  - crosswalk: the mathematics overlaps this exam domain, but the item was not
//    authored as an item of that exam. Informational only.
export const EVIDENCE_LEVELS = Object.freeze(['assessed', 'practiced', 'introduced', 'prerequisite']);
export const EVIDENCE_MODES = Object.freeze(['direct', 'crosswalk']);

// What the item was deliberately written to be. `course` means ordinary
// coursework; the exam values mean the item was authored in that exam's style
// and may carry that exam's readiness weight.
export const ASSESSMENT_FRAMEWORKS = Object.freeze(['course', ...DOMAIN_FRAMEWORKS]);

const asArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

const validDomainId = (framework, domainId) =>
  (EXAM_DOMAIN_REGISTRY[framework] || []).some((entry) => entry.id === domainId);

export const getFrameworkDomains = (framework) => EXAM_DOMAIN_REGISTRY[framework] || [];

export const alignmentKeyFor = (entry) => (
  entry.framework === ALIGNMENT_FRAMEWORKS.TEKS
    ? `${entry.framework}:${entry.code}`
    : `${entry.framework}:${entry.domainId}`
);

// A single entry, from any of the shapes we accept.
const normalizeAlignmentEntry = (raw, fallbackRole = 'primary') => {
  if (raw == null) return null;

  // Bare string: assumed to be a TEKS code, which is what legacy JSON used.
  if (typeof raw === 'string' || typeof raw === 'number') {
    const code = normalizeTeksCode(raw);
    if (!code) return null;
    return {
      framework: ALIGNMENT_FRAMEWORKS.TEKS,
      code,
      role: fallbackRole,
      evidenceLevel: fallbackRole === 'prerequisite' ? 'prerequisite' : 'assessed',
      evidenceMode: 'direct',
      courseId: getTexasStandard(code)?.courseId || null,
    };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const framework = String(raw.framework || ALIGNMENT_FRAMEWORKS.TEKS);
  if (!ALIGNMENT_FRAMEWORK_IDS.includes(framework)) return null;

  const role = ALIGNMENT_ROLES.includes(raw.role) ? raw.role : fallbackRole;

  if (framework === ALIGNMENT_FRAMEWORKS.TEKS) {
    const code = normalizeTeksCode(raw.code || raw.teks || raw.standard);
    if (!code) return null;
    const evidenceLevel = EVIDENCE_LEVELS.includes(raw.evidenceLevel)
      ? raw.evidenceLevel
      : role === 'prerequisite' ? 'prerequisite' : 'assessed';
    return {
      framework,
      code,
      role,
      evidenceLevel,
      // A TEKS alignment authored on the item is always direct evidence; only
      // machine-derived exam entries are crosswalks.
      evidenceMode: 'direct',
      courseId: raw.courseId || getTexasStandard(code)?.courseId || null,
    };
  }

  const domainId = String(raw.domainId || raw.domain || '');
  if (!validDomainId(framework, domainId)) return null;
  return {
    framework,
    domainId,
    role,
    evidenceLevel: EVIDENCE_LEVELS.includes(raw.evidenceLevel) ? raw.evidenceLevel : 'practiced',
    evidenceMode: EVIDENCE_MODES.includes(raw.evidenceMode) ? raw.evidenceMode : 'direct',
  };
};

export const normalizeAssessmentContext = (raw) => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const framework = ASSESSMENT_FRAMEWORKS.includes(source.framework) ? source.framework : 'course';
  return {
    framework,
    // examStyle only means anything away from plain coursework.
    examStyle: framework !== 'course' && source.examStyle !== false,
  };
};

/**
 * Canonical alignments for a question.
 *
 * Accepts the V4 `alignments` array, the legacy `standards` object, or a bare
 * `teks` list, and returns one deduplicated list. Exam crosswalks derived from
 * an item's TEKS are appended automatically and marked `evidenceMode:
 * 'crosswalk'`, so an ordinary Algebra I question never masquerades as SAT
 * performance evidence — that requires the author to declare the exam
 * framework explicitly, or to set assessmentContext.framework to that exam.
 */
export const normalizeQuestionAlignments = (question = {}, { includeCrosswalks = true } = {}) => {
  const source = question && typeof question === 'object' ? question : {};
  const declared = [];

  asArray(source.alignments).forEach((entry) => {
    const normalized = normalizeAlignmentEntry(entry, 'primary');
    if (normalized) declared.push(normalized);
  });

  // Legacy shapes, only consulted when the item has no `alignments`.
  if (!declared.length) {
    const legacy = source.standards ?? source;
    if (Array.isArray(legacy)) {
      asArray(legacy).forEach((entry) => {
        const normalized = normalizeAlignmentEntry(entry, 'primary');
        if (normalized) declared.push(normalized);
      });
    } else if (legacy && typeof legacy === 'object') {
      [
        ['primary', legacy.primary ?? legacy.primaryTEKS ?? legacy.teks ?? legacy.codes],
        ['secondary', legacy.secondary ?? legacy.secondaryTEKS ?? legacy.process],
        ['prerequisite', legacy.prerequisite ?? legacy.prerequisiteTEKS],
      ].forEach(([role, values]) => {
        asArray(values).forEach((entry) => {
          const normalized = normalizeAlignmentEntry(entry, role);
          if (normalized) declared.push(normalized);
        });
      });
    }
  }

  const context = normalizeAssessmentContext(source.assessmentContext);
  const seen = new Set();
  const result = [];
  declared.forEach((entry) => {
    const key = alignmentKeyFor(entry);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(entry);
  });

  if (!includeCrosswalks) return result;

  // Derive exam-domain crosswalks from every TEKS code on the item. These are
  // informational: they say the mathematics overlaps that domain, not that the
  // student produced exam evidence.
  result
    .filter((entry) => entry.framework === ALIGNMENT_FRAMEWORKS.TEKS && entry.role !== 'prerequisite')
    .forEach((teksEntry) => {
      const mapped = mapTEKSToExamDomains(teksEntry.code);
      Object.entries(mapped).forEach(([framework, mapping]) => {
        if (!mapping?.domainId) return;
        const key = `${framework}:${mapping.domainId}`;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({
          framework,
          domainId: mapping.domainId,
          role: 'secondary',
          evidenceLevel: 'practiced',
          // Promoted to direct only when the item declares itself an item of
          // that exam.
          evidenceMode: context.framework === framework && context.examStyle ? 'direct' : 'crosswalk',
          derivedFrom: teksEntry.code,
        });
      });
    });

  return result;
};

export const getAlignmentsByFramework = (question, framework) =>
  normalizeQuestionAlignments(question).filter((entry) => entry.framework === framework);

export const getPrimaryTeksCodes = (question) =>
  normalizeQuestionAlignments(question, { includeCrosswalks: false })
    .filter((entry) => entry.framework === ALIGNMENT_FRAMEWORKS.TEKS && entry.role === 'primary')
    .map((entry) => entry.code);

// Only alignments that genuinely measure the framework should move readiness.
export const getDirectEvidenceAlignments = (question) =>
  normalizeQuestionAlignments(question).filter((entry) => entry.evidenceMode === 'direct');

/**
 * Validation for authored alignment data. Returns errors that block an import
 * and warnings that are worth showing but not fatal.
 */
export const validateAlignments = (question = {}, { label = 'question' } = {}) => {
  const errors = [];
  const warnings = [];
  const raw = asArray(question?.alignments);

  raw.forEach((entry, index) => {
    const where = `${label} alignment ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    const framework = String(entry.framework || '');
    if (!ALIGNMENT_FRAMEWORK_IDS.includes(framework)) {
      errors.push(`${where} has unknown framework "${entry.framework}". Use one of: ${ALIGNMENT_FRAMEWORK_IDS.join(', ')}.`);
      return;
    }
    if (entry.role != null && !ALIGNMENT_ROLES.includes(entry.role)) {
      errors.push(`${where} has invalid role "${entry.role}". Use one of: ${ALIGNMENT_ROLES.join(', ')}.`);
    }
    if (entry.evidenceLevel != null && !EVIDENCE_LEVELS.includes(entry.evidenceLevel)) {
      errors.push(`${where} has invalid evidenceLevel "${entry.evidenceLevel}". Use one of: ${EVIDENCE_LEVELS.join(', ')}.`);
    }
    if (entry.evidenceMode != null && !EVIDENCE_MODES.includes(entry.evidenceMode)) {
      errors.push(`${where} has invalid evidenceMode "${entry.evidenceMode}". Use one of: ${EVIDENCE_MODES.join(', ')}.`);
    }
    if (framework === ALIGNMENT_FRAMEWORKS.TEKS) {
      const code = normalizeTeksCode(entry.code);
      if (!code) errors.push(`${where} is a TEKS alignment and needs a "code" such as "A.2A".`);
      else if (!getTexasStandard(code)) warnings.push(`${where} uses TEKS code ${code}, which is not in the active catalogue.`);
      if (entry.domainId) warnings.push(`${where} sets domainId on a TEKS alignment; TEKS alignments use "code".`);
    } else {
      if (!entry.domainId) {
        errors.push(`${where} is a ${framework} alignment and needs a "domainId". Valid ids: ${getFrameworkDomains(framework).map((d) => d.id).join(', ')}.`);
      } else if (!validDomainId(framework, entry.domainId)) {
        errors.push(`${where} has unknown ${framework} domainId "${entry.domainId}". Valid ids: ${getFrameworkDomains(framework).map((d) => d.id).join(', ')}.`);
      }
      if (entry.code) warnings.push(`${where} sets code on an exam alignment; exam alignments use "domainId".`);
    }
  });

  const context = question?.assessmentContext;
  if (context != null) {
    if (typeof context !== 'object' || Array.isArray(context)) {
      errors.push(`${label} assessmentContext must be an object.`);
    } else if (context.framework != null && !ASSESSMENT_FRAMEWORKS.includes(context.framework)) {
      errors.push(`${label} assessmentContext.framework "${context.framework}" is invalid. Use one of: ${ASSESSMENT_FRAMEWORKS.join(', ')}.`);
    }
  }

  const normalized = normalizeQuestionAlignments(question, { includeCrosswalks: false });
  if (!normalized.some((entry) => entry.role === 'primary')) {
    warnings.push(`${label} has no primary alignment, so it will not produce mastery evidence.`);
  }

  return { errors, warnings };
};

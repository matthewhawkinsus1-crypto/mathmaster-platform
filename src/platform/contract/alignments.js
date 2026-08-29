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
        ['primary', legacy.primary ?? legacy.primaryTEKS ?? legacy.teks ?? legacy.codes ?? legacy.primaryStandard ?? legacy.standard],
        ['secondary', legacy.secondary ?? legacy.secondaryTEKS ?? legacy.process ?? legacy.secondaryStandards],
        ['prerequisite', legacy.prerequisite ?? legacy.prerequisiteTEKS ?? legacy.prerequisiteStandards],
      ].forEach(([role, values]) => {
        asArray(values).forEach((entry) => {
          const normalized = normalizeAlignmentEntry(entry, role);
          if (normalized) declared.push(normalized);
        });
      });
    }
  }

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
          // A derived crosswalk is informational only. Direct exam evidence
          // requires an explicit exam-domain alignment on the authored item;
          // assessmentContext alone cannot promote a course item.
          evidenceMode: 'crosswalk',
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
// TEKS authored on the item is direct course evidence. Exam evidence additionally
// requires an explicit matching examStyle context; a stray domain alignment is
// not enough to move SAT/ACT/TSIA2/ASVAB readiness.
export const getDirectEvidenceAlignments = (question = {}) => {
  const context = question?.assessmentContext;
  const examFramework = context?.examStyle === true && DOMAIN_FRAMEWORKS.includes(context?.framework)
    ? context.framework
    : null;
  return normalizeQuestionAlignments(question).filter((entry) => (
    entry.evidenceMode === 'direct'
    && (entry.framework === ALIGNMENT_FRAMEWORKS.TEKS || entry.framework === examFramework)
  ));
};

/**
 * Validation for authored alignment data. Returns errors that block an import
 * and warnings that are worth showing but not fatal.
 */
/**
 * Does this assignment look like one TEKS was stamped on every question?
 *
 * Alignment is a property of a QUESTION, not of a lesson. A set that evaluates
 * a function from a table, decides whether a relation is a function, and graphs
 * an inequality on a number line is assessing three different standards even
 * though a teacher would happily call it one lesson. An AI author given only an
 * assignment-level TEKS will copy it onto every item, and the result reads as
 * mastery evidence for a standard the question never assessed.
 *
 * This cannot be an error: a focused practice set genuinely can be one
 * standard. It is a warning, and it fires only on the pattern that is almost
 * always wrong — one single TEKS shared by questions that use several
 * different tools, which is the signature of a lesson-level tag.
 */
export const auditAlignmentSpecificity = (questions = [], { minimumDistinctTypes = 3 } = {}) => {
  const items = asArray(questions);
  if (items.length < minimumDistinctTypes) return { warnings: [] };

  const codes = new Set();
  const types = new Set();
  items.forEach((question) => {
    getPrimaryTeksCodes(question).forEach((code) => codes.add(String(code).toUpperCase()));
    const type = String(question?.toolId || question?.type || '').trim();
    if (type) types.add(type);
  });

  if (codes.size !== 1 || types.size < minimumDistinctTypes) return { warnings: [] };
  const [code] = [...codes];
  return {
    warnings: [
      `Every question in this assignment is aligned to ${code}, but the assignment uses ${types.size} different question types (${[...types].sort().join(', ')}). Alignment is per question — check each item and give it the standard it actually assesses, including a prerequisite standard where that is what the question measures.`,
    ],
  };
};

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

  const directExamClaims = raw.filter((entry) => (
    entry && typeof entry === 'object' && !Array.isArray(entry)
    && DOMAIN_FRAMEWORKS.includes(String(entry.framework || ''))
    && String(entry.evidenceMode || 'direct') === 'direct'
  ));
  const context = question?.assessmentContext;
  directExamClaims.forEach((entry) => {
    if (!context || typeof context !== 'object' || Array.isArray(context)
      || context.examStyle !== true || context.framework !== entry.framework) {
      errors.push(`${label} direct ${entry.framework} alignment requires matching assessmentContext with examStyle:true.`);
    }
  });
  if (context != null) {
    if (typeof context !== 'object' || Array.isArray(context)) {
      errors.push(`${label} assessmentContext must be an object.`);
    } else if (context.framework != null && !ASSESSMENT_FRAMEWORKS.includes(context.framework)) {
      errors.push(`${label} assessmentContext.framework "${context.framework}" is invalid. Use one of: ${ASSESSMENT_FRAMEWORKS.join(', ')}.`);
    }
  }

  // If an item claims authentic exam style, its direct exam domain must be one
  // the authored TEKS actually maps to. This prevents an AI from satisfying an
  // Honors/CCMR rule by attaching a valid-but-unrelated domain id.
  const examFramework = context && typeof context === 'object' && !Array.isArray(context)
    && context.examStyle === true && DOMAIN_FRAMEWORKS.includes(context.framework)
    ? context.framework
    : null;
  if (examFramework) {
    const teksCodes = raw
      .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && String(entry.framework || 'teks') === 'teks')
      .map((entry) => normalizeTeksCode(entry.code))
      .filter(Boolean);
    const directExamEntries = raw.filter((entry) => (
      entry && typeof entry === 'object' && !Array.isArray(entry)
      && String(entry.framework || '') === examFramework
      && Boolean(String(entry.domainId || '').trim())
    ));
    if (!directExamEntries.length) {
      errors.push(`${label} declares ${examFramework} examStyle but has no explicit ${examFramework} domain alignment.`);
    } else if (teksCodes.length) {
      directExamEntries.forEach((entry) => {
        const supported = teksCodes.some((code) => {
          const mapping = mapTEKSToExamDomains(code)?.[examFramework];
          const domains = mapping?.domainIds || (mapping?.domainId ? [mapping.domainId] : []);
          return domains.includes(entry.domainId);
        });
        if (!supported) {
          errors.push(`${label} declares ${examFramework}:${entry.domainId}, but none of its TEKS alignments crosswalk to that domain.`);
        }
      });
    }
  }

  const normalized = normalizeQuestionAlignments(question, { includeCrosswalks: false });
  if (!normalized.some((entry) => entry.role === 'primary')) {
    warnings.push(`${label} has no primary alignment, so it will not produce mastery evidence.`);
  }

  return { errors, warnings };
};

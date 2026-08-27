import { SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';
import {
  resolveAdaptivePolicy,
  roleGroupFor,
  ROLE_GROUP,
} from '../assignments/assignmentAdaptation.js';
import { normalizeQuestionComplexity, normalizeQuestionDifficulty } from '../../questionMetadata.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const KNOWN_SUPPORTS = Object.freeze(Object.values(SUPPORT));
const SUPPORT_POLICY_MODES = Object.freeze(['inheritStudentProfile', 'none', 'disabled']);
const DIFFERENTIATION_POLICY_MODES = Object.freeze(['bounded', 'off']);

const IDENTITY_FIELDS = Object.freeze([
  'type',
  'toolId',
  'studentActions',
  'activityRole',
  'sectionId',
  'sectionTitle',
  'assessedConstruct',
  'assessmentContext',
  'alignments',
  'alignmentKeys',
  'standard',
  'standards',
  'primaryStandard',
  'primaryTEKS',
  'teks',
  'secondaryStandards',
  'prerequisiteStandards',
  'supportPolicy',
  'accommodations',
  'supports',
  'studentProfile',
  'supportProfile',
  'calculator',
]);

const STUDENT_SPECIFIC_POLICY_FIELDS = Object.freeze([
  'studentId',
  'studentIds',
  'profile',
  'studentProfile',
  'supportProfile',
  'accommodations',
  'modification',
  'programEligibility',
]);

const rangeValue = (raw, min, max) => {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const low = Number(raw[0]);
  const high = Number(raw[1]);
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < min || high > max || low > high) return null;
  return [low, high];
};

const readAllowedRanges = (policy = {}) => {
  const source = isObject(policy.allowedRange) ? policy.allowedRange : {};
  return {
    difficultyBand: rangeValue(source.difficultyBand, 1, 5),
    dok: rangeValue(source.dok, 1, 4),
  };
};

const overrideDok = (override = {}) => {
  const value = override.dok ?? override.complexity?.level ?? override.complexity?.dok;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const overrideBand = (override = {}) => {
  const value = override.difficultyBand
    ?? override.generatorBand
    ?? override.difficulty?.generatorBand
    ?? override.difficulty?.band;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const sameJson = (left, right) => {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return left === right; }
};

const authoredIdentityViolations = (baseQuestion, override) => IDENTITY_FIELDS.filter((field) => (
  Object.prototype.hasOwnProperty.call(override || {}, field)
  && !sameJson(override?.[field], baseQuestion?.[field])
));

const auditBandProfiles = ({
  question,
  index,
  variationMode,
  assignmentPolicy,
  errors,
  warnings,
}) => {
  const profiles = question?.differentiation?.bandProfiles;
  if (!isObject(profiles)) return;

  const label = `Question ${index + 1}`;
  const role = question.activityRole || question.purpose || 'practice';
  const policy = resolveAdaptivePolicy({
    question,
    activityRole: role,
    variationMode,
    honors: false,
  });
  const assignmentRanges = readAllowedRanges(assignmentPolicy);

  Object.entries(profiles).forEach(([key, override]) => {
    const band = Number(key);
    const profileLabel = `${label} differentiation.bandProfiles[${JSON.stringify(key)}]`;
    if (!Number.isInteger(band) || band < 1 || band > 5) {
      errors.push(`${profileLabel} must use an integer band key from 1 through 5.`);
      return;
    }
    if (!isObject(override)) {
      errors.push(`${profileLabel} must be an object.`);
      return;
    }

    const identityChanges = authoredIdentityViolations(question, override);
    if (identityChanges.length) {
      errors.push(
        `${profileLabel} attempts to change instructional identity field(s): ${identityChanges.join(', ')}. Adaptive differentiation may change difficulty/context/numbers, but never the assigned standard, tool/task identity, assessed construct, section role, supports, or assessment fidelity.`,
      );
    }

    const explicitBand = overrideBand(override);
    if (explicitBand != null && (explicitBand < 1 || explicitBand > 5)) {
      errors.push(`${profileLabel} has invalid difficulty band ${explicitBand}; bands must be 1–5.`);
    }
    if (explicitBand != null && explicitBand !== band) {
      errors.push(
        `${profileLabel} is stored under Band ${band} but declares Band ${explicitBand}. Delivery/evidence would disagree about the rigor actually served.`,
      );
    }

    const dok = overrideDok(override);
    if (dok != null && (dok < 1 || dok > 4)) {
      errors.push(`${profileLabel} has invalid DOK ${dok}; DOK must be 1–4.`);
    }

    if (assignmentRanges.difficultyBand && (band < assignmentRanges.difficultyBand[0] || band > assignmentRanges.difficultyBand[1])) {
      errors.push(
        `${profileLabel} (Band ${band}) sits outside differentiationPolicy.allowedRange.difficultyBand [${assignmentRanges.difficultyBand.join(', ')}].`,
      );
    }
    if (assignmentRanges.dok && dok != null && (dok < assignmentRanges.dok[0] || dok > assignmentRanges.dok[1])) {
      errors.push(
        `${profileLabel} DOK ${dok} sits outside differentiationPolicy.allowedRange.dok [${assignmentRanges.dok.join(', ')}].`,
      );
    }

    if (policy.enabled) {
      if (band < policy.difficultyRange[0] || band > policy.difficultyRange[1]) {
        errors.push(
          `${profileLabel} (Band ${band}) sits outside the live ${role} adaptation envelope [${policy.difficultyRange.join(', ')}] around assigned Band ${policy.assignedBand}.`,
        );
      }
      if (dok != null && (dok < policy.dokRange[0] || dok > policy.dokRange[1])) {
        errors.push(
          `${profileLabel} DOK ${dok} sits outside the live ${role} adaptation envelope [${policy.dokRange.join(', ')}] around assigned DOK ${policy.assignedDok}.`,
        );
      }
    }

    if (roleGroupFor(role) === ROLE_GROUP.ASSESSMENT && (band !== policy.assignedBand || (dok != null && dok !== policy.assignedDok))) {
      warnings.push(
        `${profileLabel} varies assessment rigor. Standard DOL/quiz/test delivery keeps assigned rigor unless a teacher explicitly enables differentiated assessment, so this profile is normally unreachable.`,
      );
    }
  });
};

const auditSupportPolicy = (assignmentV5, errors, warnings) => {
  const policy = isObject(assignmentV5?.supportPolicy) ? assignmentV5.supportPolicy : {};
  const mode = clean(policy.mode || 'inheritStudentProfile');
  if (!SUPPORT_POLICY_MODES.includes(mode)) {
    errors.push(`supportPolicy.mode must be one of: ${SUPPORT_POLICY_MODES.join(', ')}.`);
  }

  const embedded = STUDENT_SPECIFIC_POLICY_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(policy, field));
  if (embedded.length) {
    errors.push(
      `supportPolicy contains student-specific data (${embedded.join(', ')}). Assignments must inherit server-resolved student entitlements; never embed an IEP/504/EB profile in assignment JSON.`,
    );
  }

  if (policy.modificationsAllowed === true) {
    errors.push(
      'supportPolicy.modificationsAllowed cannot be true in a standard Assignment V5. A modification changes what the student is expected to learn and requires the separate modified-curriculum evidence/reporting path.',
    );
  }

  if (policy.allowedSupports != null) {
    if (!Array.isArray(policy.allowedSupports)) {
      errors.push('supportPolicy.allowedSupports must be an array of canonical support ids.');
    } else {
      const unknown = policy.allowedSupports.map(clean).filter(Boolean).filter((support) => !KNOWN_SUPPORTS.includes(support));
      if (unknown.length) errors.push(`supportPolicy.allowedSupports contains unknown support id(s): ${[...new Set(unknown)].join(', ')}.`);
      if (new Set(policy.allowedSupports.map(clean).filter(Boolean)).size < policy.allowedSupports.filter(Boolean).length) {
        warnings.push('supportPolicy.allowedSupports contains duplicate entries.');
      }
    }
  }
};

const auditDifferentiationPolicy = (assignmentV5, errors, warnings) => {
  const policy = isObject(assignmentV5?.differentiationPolicy) ? assignmentV5.differentiationPolicy : {};
  const mode = clean(policy.mode || 'bounded');
  if (!DIFFERENTIATION_POLICY_MODES.includes(mode)) {
    errors.push(`differentiationPolicy.mode must be one of: ${DIFFERENTIATION_POLICY_MODES.join(', ')}.`);
  }
  if (policy.allowStandardChange === true) {
    errors.push('differentiationPolicy.allowStandardChange must remain false. Assignment adaptation may pitch the assigned standard differently; it may never substitute another standard.');
  }
  if (policy.preserveAssessmentFidelity === false) {
    errors.push('differentiationPolicy.preserveAssessmentFidelity must remain true so SAT/ACT/TSIA2/ASVAB transfer items cannot mutate into non-authentic variants.');
  }

  const rawAllowed = policy.allowedRange;
  if (rawAllowed != null && !isObject(rawAllowed)) {
    errors.push('differentiationPolicy.allowedRange must be an object when provided.');
  } else if (isObject(rawAllowed)) {
    if (rawAllowed.difficultyBand != null && !rangeValue(rawAllowed.difficultyBand, 1, 5)) {
      errors.push('differentiationPolicy.allowedRange.difficultyBand must be [low, high] with integer bands 1–5.');
    }
    if (rawAllowed.dok != null && !rangeValue(rawAllowed.dok, 1, 4)) {
      errors.push('differentiationPolicy.allowedRange.dok must be [low, high] with integer DOK values 1–4.');
    }
  }

  const honors = isObject(policy.honors) ? policy.honors : {};
  if (honors.mode && honors.mode !== 'inheritDestinationClass') {
    errors.push('differentiationPolicy.honors.mode must be "inheritDestinationClass". Assignment JSON must not manually label individual students/classes as Honors.');
  }
  if (honors.ccmrPracticeTargetShare != null) {
    const share = Number(honors.ccmrPracticeTargetShare);
    if (!Number.isFinite(share) || share < 0 || share > 0.5) {
      errors.push('differentiationPolicy.honors.ccmrPracticeTargetShare must be a decimal from 0 through 0.5.');
    }
  }

  if (mode === 'off' && assignmentV5?.variantPolicy?.mode === 'adaptive') {
    warnings.push('variantPolicy.mode is adaptive while differentiationPolicy.mode is off. The assignment will retain variant generation but should not change rigor.');
  }
};

const auditQuestionPolicyLeaks = (question, index, errors) => {
  if (!isObject(question)) return;
  const leaked = ['accommodations','supportPolicy','studentProfile','supportProfile','modification']
    .filter((field) => Object.prototype.hasOwnProperty.call(question, field));
  if (leaked.length) {
    errors.push(
      `Question ${index + 1} contains student/support policy fields (${leaked.join(', ')}). Supports are resolved server-side from the student's profile, not authored into questions.`,
    );
  }
};

export const auditAssignmentSupportDifferentiation = (assignmentV5 = {}, questions = []) => {
  const errors = [];
  const warnings = [];

  auditSupportPolicy(assignmentV5, errors, warnings);
  auditDifferentiationPolicy(assignmentV5, errors, warnings);

  const assignmentPolicy = assignmentV5?.differentiationPolicy || {};
  const defaultVariation = assignmentV5?.variantPolicy?.mode || 'personalized';
  const sectionModes = assignmentV5?.variantPolicy?.sectionModes || {};

  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    auditQuestionPolicyLeaks(question, index, errors);
    const role = clean(question.activityRole || question.purpose || 'practice').toLowerCase();
    const variationMode = sectionModes[role] || defaultVariation;
    auditBandProfiles({
      question,
      index,
      variationMode,
      assignmentPolicy,
      errors,
      warnings,
    });

    const baseDok = normalizeQuestionComplexity(question).level;
    const baseBand = normalizeQuestionDifficulty(question).generatorBand;
    if (baseDok == null) warnings.push(`Question ${index + 1} has no explicit DOK, so adaptation falls back to the runtime default instead of a teacher-visible assigned value.`);
    if (!Number.isInteger(baseBand) || baseBand < 1 || baseBand > 5) {
      errors.push(`Question ${index + 1} has an invalid assigned difficulty band.`);
    }
  });

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export default auditAssignmentSupportDifferentiation;

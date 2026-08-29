const clean = (value) => String(value ?? '').trim();

const validMode = (value, fallback = 'personalized') => {
  const mode = clean(value).toLowerCase();
  if (mode === 'variant') return 'personalized';
  return ['shared', 'personalized', 'adaptive'].includes(mode) ? mode : fallback;
};

const sectionRoles = (assignmentV5 = {}) => [
  ...new Set((Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [])
    .map((section) => clean(section?.role).toLowerCase())
    .filter(Boolean)),
];

export const resolveReviewedSectionModes = (assignmentV5 = {}, draft = {}) => {
  const sourcePolicy = assignmentV5?.variantPolicy || {};
  const sourceModes = sourcePolicy.sectionModes || {};
  const draftModes = draft?.sectionVariantModes || {};
  const fallback = validMode(
    draft?.variantMode
      || draft?.variantPolicy?.mode
      || sourcePolicy.mode,
    'personalized',
  );

  return Object.fromEntries(sectionRoles(assignmentV5).map((role) => [
    role,
    validMode(draftModes[role] ?? draft?.variantPolicy?.sectionModes?.[role] ?? sourceModes[role], fallback),
  ]));
};

export const aggregateReviewedVariantMode = (sectionModes = {}, fallback = 'personalized') => {
  const modes = Object.values(sectionModes).map((mode) => validMode(mode, fallback));
  if (!modes.length) return validMode(fallback);
  if (modes.every((mode) => mode === 'shared')) return 'shared';
  if (modes.some((mode) => mode === 'adaptive')) return 'adaptive';
  return 'personalized';
};

const mergeOutputProfiles = (source = {}, review = {}) => {
  const keys = new Set([...Object.keys(source || {}), ...Object.keys(review || {})]);
  return Object.fromEntries([...keys].map((key) => {
    const sourceValue = source?.[key];
    const reviewValue = review?.[key];
    if (
      sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
      || reviewValue && typeof reviewValue === 'object' && !Array.isArray(reviewValue)
    ) {
      return [key, {
        ...(sourceValue && typeof sourceValue === 'object' ? sourceValue : {}),
        ...(reviewValue && typeof reviewValue === 'object' ? reviewValue : {}),
      }];
    }
    return [key, reviewValue ?? sourceValue];
  }));
};

export const buildPreflightReviewedAssignmentV5 = (assignmentV5 = {}, draft = {}) => {
  const sectionModes = resolveReviewedSectionModes(assignmentV5, draft);
  const mode = aggregateReviewedVariantMode(
    sectionModes,
    draft?.variantMode || draft?.variantPolicy?.mode || assignmentV5?.variantPolicy?.mode,
  );

  return {
    ...assignmentV5,
    assignment: {
      ...(assignmentV5.assignment || {}),
      ...(clean(draft.title) ? { title: clean(draft.title) } : {}),
      ...(draft.folder != null ? { folder: clean(draft.folder) || null } : {}),
      ...(draft.instructionalPurpose ? { instructionalPurpose: clean(draft.instructionalPurpose) } : {}),
      ...(draft.gradingPurpose ? { gradingPurpose: clean(draft.gradingPurpose) } : {}),
    },
    variantPolicy: {
      ...(assignmentV5.variantPolicy || {}),
      ...(draft.variantPolicy || {}),
      mode,
      sectionModes,
    },
    differentiationPolicy: {
      ...(assignmentV5.differentiationPolicy || {}),
      ...(draft.differentiationPolicy || {}),
    },
    supportPolicy: {
      ...(assignmentV5.supportPolicy || {}),
      ...(draft.supportPolicy || {}),
    },
    toolPolicy: {
      ...(assignmentV5.toolPolicy || {}),
      ...(draft.toolPolicy || {}),
    },
    deliveryPolicy: {
      ...(assignmentV5.deliveryPolicy || {}),
      ...(draft.deliveryPolicy || {}),
    },
    gradingPolicy: {
      ...(assignmentV5.gradingPolicy || {}),
      ...(draft.gradingPolicy || {}),
    },
    evidencePolicy: {
      ...(assignmentV5.evidencePolicy || {}),
      ...(draft.evidencePolicy || {}),
    },
    outputProfiles: mergeOutputProfiles(
      assignmentV5.outputProfiles || {},
      draft.outputProfiles || {},
    ),
    classroomIntegration: {
      ...(assignmentV5.classroomIntegration || {}),
      ...(draft.classroomIntegration || {}),
    },
    provenance: {
      ...(assignmentV5.provenance || {}),
      ...(draft.provenance || {}),
    },
    preflight: {
      ...(assignmentV5.preflight || {}),
      ...(draft.preflight || {}),
      required: true,
    },
  };
};

export default buildPreflightReviewedAssignmentV5;

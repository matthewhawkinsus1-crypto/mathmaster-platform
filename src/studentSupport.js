import { flatSupportIds, resolveEffectiveSupportPlan } from '../functions/shared/supportProfileModel.mjs';
import { studentFacingLabel } from '../functions/shared/supportCatalog.mjs';

const unique = (values) => [...new Set((Array.isArray(values) ? values : []).map(String))];

const hasSupportPlan = (profile) => Array.isArray(profile?.supportPlan?.windows) && profile.supportPlan.windows.length > 0;

/**
 * The flat support view every runtime reader uses.
 *
 * A versioned profile (`supportPlan`, functions/shared/supportProfileModel.mjs)
 * is resolved to the revision in effect today, so a future-dated revision
 * switches on by itself and an inactive one switches supports off. The plan
 * itself is passed through untouched: individualized deadlines are governed by
 * the revision in effect on each assignment's due date, not today's.
 *
 * This is a READ view. Never write it back to Firestore — the profile is
 * saved only as a new revision plus its projection
 * (src/platform/supportEvidence/supportEvidenceStore.js).
 */
export const normalizeStudentProfile = (profile = {}, { nowValue = Date.now() } = {}) => {
  const safeProfile = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile
    : {};

  if (hasSupportPlan(safeProfile)) {
    const plan = resolveEffectiveSupportPlan(safeProfile, { nowValue });
    const ids = flatSupportIds(plan);
    return {
      inclusionStatus: plan.inclusionStatus === true,
      accommodations: unique(ids.accommodations),
      modifications: unique(ids.modifications),
      translationLanguage: String(plan.translationLanguage || '').trim().toLowerCase() || null,
      supportPlan: safeProfile.supportPlan,
      supportRevisionId: plan.revisionId || null,
    };
  }

  return {
    inclusionStatus: Boolean(safeProfile.inclusionStatus),
    accommodations: unique(safeProfile.accommodations),
    modifications: unique(safeProfile.modifications),
    translationLanguage: String(safeProfile.translationLanguage || '').trim().toLowerCase() || null,
  };
};

export const studentHasSupport = (profile, value) => {
  const normalized = normalizeStudentProfile(profile);
  return normalized.accommodations.includes(value) || normalized.modifications.includes(value);
};

export const getStudentSupportPresentation = (profile) => {
  const normalized = normalizeStudentProfile(profile);
  const inclusion = normalized.inclusionStatus;
  return {
    inclusion,
    disableIdleTimer: inclusion || normalized.accommodations.includes('disable-idle-timer') || normalized.accommodations.includes('extra-time'),
    hideCountdowns: inclusion || normalized.accommodations.includes('no-countdown'),
    visualChunking: inclusion || normalized.accommodations.includes('visual-chunking'),
    highContrast: inclusion || normalized.accommodations.includes('high-contrast'),
    largeText: inclusion || normalized.accommodations.includes('large-text'),
    declutter: inclusion || normalized.accommodations.includes('declutter-ui'),
    textToSpeech: normalized.accommodations.includes('text-to-speech'),
    // Algebra operation shortcuts are an explicit accommodation, not a
    // difficulty-level feature. A student with large text, extra time, etc.
    // should not silently receive an operation-application shortcut they were
    // never assigned.
    algebraAutoApply: normalized.accommodations.includes('algebra-auto-apply'),
    // Supplemental aid: the scratchpad opens on graph paper.
    graphPaper: normalized.accommodations.includes('graph-paper'),
    translationLanguage: normalized.translationLanguage,
  };
};

/**
 * What the student's neutral "Support tools" panel offers, from the plan in
 * effect today. Only student-facing tools appear, each under its neutral
 * student label (functions/shared/supportCatalog.mjs studentLabel) — never a
 * program, a classification or a teacher label.
 */
export const studentSupportTools = (profile, { nowValue = Date.now() } = {}) => {
  const plan = resolveEffectiveSupportPlan(profile || {}, { nowValue });
  if (!plan.active) return { tools: [], resources: [], any: false };
  const tools = [];
  const resources = [];
  plan.accommodations.forEach((entry) => {
    const label = studentFacingLabel(entry.id);
    if (!label) return;
    if (Array.isArray(entry?.params?.resources) && entry.params.resources.length) {
      entry.params.resources
        // Re-checked here: the editor accepts only https links, but a link
        // reaches a student's screen, so nothing else is rendered.
        .filter((resource) => /^https:\/\/[^\s]+$/i.test(String(resource?.url || '')))
        .forEach((resource) => resources.push({ supportId: entry.id, group: label, label: resource.label, url: resource.url }));
    } else if (!['reteach-resources', 'study-sheet'].includes(entry.id)) {
      tools.push({ supportId: entry.id, label });
    }
  });
  return { tools, resources, any: tools.length > 0 || resources.length > 0 };
};

/*
 * Which configured modifications actually CHANGE this item — kept next to the
 * transformation below so the two cannot drift. `reduce-complexity` rewrites
 * the fraction / one-step / literal generators and trims multiple choice;
 * `prefill-first-step` is honoured only by the step-algebra tool. A
 * modification that changed nothing leaves the item — and the student's work
 * on it — at grade level, and must not mark the work Modified.
 */
const COMPLEXITY_REDUCED_GENERATORS = new Set(['fraction', 'stepLinearEquation', 'literalLinear']);
export const modificationsAppliedToQuestion = (question = {}, configured = []) => {
  const set = new Set(Array.isArray(configured) ? configured : []);
  const applied = [];
  if (set.has('reduce-complexity')) {
    const generatorChanged = COMPLEXITY_REDUCED_GENERATORS.has(question?.generator?.kind);
    const choicesTrimmed = Array.isArray(question?.choices) && question.choices.length > 2;
    if (generatorChanged || choicesTrimmed) applied.push('reduce-complexity');
  }
  if (set.has('prefill-first-step') && question?.type === 'stepAlgebra') applied.push('prefill-first-step');
  return applied;
};

export const applyStudentSupportToQuestion = (question, profile) => {
  const normalized = normalizeStudentProfile(profile);
  // Support-only capabilities are trusted profile data, never authoring data.
  // Always overwrite these fields so assignment JSON cannot self-grant an
  // accommodation shortcut (or a prefilled algebra step) to the whole class.
  const trustedQuestion = {
    ...question,
    supportPresentation: getStudentSupportPresentation(normalized),
    supportEntitlements: {},
  };
  if (!normalized.inclusionStatus && !normalized.accommodations.length && !normalized.modifications.length && !normalized.translationLanguage) {
    return { question: trustedQuestion, usage: { modified: false, accommodations: [], modifications: [], modificationsConfigured: [] } };
  }
  const next = {
    ...trustedQuestion,
    generator: question?.generator ? { ...question.generator } : question?.generator,
  };
  const translation = normalized.translationLanguage && normalized.translationLanguage !== 'en'
    ? question?.translations?.[normalized.translationLanguage]
    : null;
  if (translation && typeof translation === 'object' && !Array.isArray(translation)) {
    // The authored prompt is kept beside the translation: a grader that reads
    // the wording (a legacy constraint rewrite, for one) must judge the
    // question as authored, exactly as the server does, never the translation.
    // Always a string, so `authoredPrompt ?? prompt` can never fall through to
    // the translation when the authored question has no prompt.
    if (typeof translation.prompt === 'string' && next.authoredPrompt === undefined) {
      next.authoredPrompt = typeof question?.prompt === 'string' ? question.prompt : '';
    }
    if (typeof translation.prompt === 'string') next.prompt = translation.prompt;
    if (typeof translation.title === 'string') next.title = translation.title;
    if (typeof translation.scenario === 'string' && next.context && typeof next.context === 'object') {
      next.context = { ...next.context, scenario: translation.scenario };
    }
  }
  // `accommodations` keeps its long-standing meaning — configured for this
  // student and presented with the item — which attempt evidence records as
  // stage "presented". It is NOT a record of use; the support evidence system
  // records use separately (grades/{id}/supportEvidence).
  const usedAccommodations = [...normalized.accommodations];
  const appliedModifications = modificationsAppliedToQuestion(question, normalized.modifications);

  if (normalized.modifications.includes('reduce-complexity')) {
    if (next.generator?.kind === 'fraction') {
      next.generator.denominators = [2, 4, 5, 10];
    }
    if (next.generator?.kind === 'stepLinearEquation') {
      next.generator.modifiedOneStep = true;
      next.generator.coefficientRange = [1, 6];
      next.generator.constantRange = [-8, 8];
    }
    if (next.generator?.kind === 'literalLinear') {
      next.generator.coefficientRange = [1, 6];
      next.generator.constantRange = [-8, 8];
      next.generator.modifiedLiteral = true;
    }
    if (Array.isArray(next.choices) && next.choices.length > 2) next.choices = next.choices.slice(0, 2);
  }

  if (normalized.modifications.includes('prefill-first-step')) {
    next.prefillFirstStep = true;
    next.supportEntitlements = {
      ...(next.supportEntitlements || {}),
      prefillFirstStep: true,
    };
  }

  if (getStudentSupportPresentation(normalized).visualChunking) next.visualChunking = true;
  if (!next.formulaAnchor && next.formulaLatex) next.formulaAnchor = next.formulaLatex;

  return {
    question: next,
    usage: {
      // Modified only where a modification changed this item (see above).
      modified: appliedModifications.length > 0,
      accommodations: usedAccommodations,
      modifications: appliedModifications,
      modificationsConfigured: [...normalized.modifications],
    },
  };
};

export const buildSupportUsage = (profile, question) => {
  const result = applyStudentSupportToQuestion(question, profile);
  return result.usage;
};

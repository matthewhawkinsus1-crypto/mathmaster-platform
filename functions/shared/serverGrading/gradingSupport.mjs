/*
 * CAN THE SERVER MARK THIS QUESTION?  — the light half of the dispatch.
 *
 * Answered from the grading MANIFEST alone (gradingManifest.mjs), with no
 * grader code loaded, so the student app's main bundle, Pre-Flight and the
 * checkpoint writer can all ask the same question the server asks without
 * pulling every tool's mathematics into the first page load.
 *
 * serverResponseGrading.mjs (the heavy half) re-exports these and adds the
 * graders themselves.
 *
 * Pure.
 */
import { serverGradingSupport as ordinaryServerGradingSupport } from '../ordinaryResponseGrading.mjs';
import { isFamilyBackedQuestion } from '../questionFamilyInstance.mjs';
import { GRADING_AUTHORITY } from './gradingAuthority.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from './gradingManifest.mjs';
import { toolModeSupport } from './toolGraderDefinition.mjs';

const text = (value) => String(value ?? '');
const list = (value) => (Array.isArray(value) ? value : []);

/*
 * The exclusions that apply to EVERY surface.
 *
 * The server grades the question it holds. These are the cases where that is
 * not the question the student saw: generated per student from a seed the
 * server does not re-run, a variant pool, an adaptive band profile that may
 * replace the answer key, or a Question Family TEMPLATE (whose instance is
 * rebuilt from its delivery pin by questionFamilyGrading.mjs before it gets
 * here). Identical to the ordinary contract's exclusions, so no surface widens
 * what "the stored question is the delivered question" means.
 */
export const commonServerGradingExclusion = (question) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return 'missing-question';
  if (question.secure === true) return 'secure-question';
  if (question.teacherExcluded === true) return 'teacher-excluded';
  if (question.generator && typeof question.generator === 'object') return 'generated-question';
  if (isFamilyBackedQuestion(question)) return 'family-template';
  if (list(question.variants).length > 0) return 'variant-selection';
  if (text(question?.differentiation?.mode) === 'auto') return 'adaptive-band-profile';
  return null;
};

/** The manifest declaration that owns this question, or null. */
export const gradingDeclarationFor = (question) => {
  const surfaceId = question && typeof question === 'object' ? resolveGradingSurfaceId(question) : null;
  return { surfaceId, declaration: surfaceId ? GRADING_MANIFEST[surfaceId] || null : null };
};

/**
 * Can the server mark a response to this question, judged from the
 * declaration only (no exclusions)? The browser asks this of the instance it
 * is showing; the server asks it after the exclusions below.
 */
export const declaredGradingSupport = (question) => {
  const { surfaceId, declaration } = gradingDeclarationFor(question);
  if (!declaration) {
    return { supported: false, reason: `unsupported-type:${text(question?.type) || 'unknown'}`, surfaceId, authority: null, mode: null };
  }
  if (declaration.kind !== 'tool' && declaration.authority !== GRADING_AUTHORITY.SHARED_SERVER) {
    return {
      supported: false,
      reason: `${declaration.authority === GRADING_AUTHORITY.NON_GRADED ? 'non-graded' : 'not-server-gradable'}:${surfaceId}`,
      surfaceId,
      authority: declaration.authority,
      mode: null,
      blocker: declaration.blocker || null,
    };
  }
  if (declaration.kind === 'ordinary') {
    const ordinary = ordinaryServerGradingSupport({ ...question, type: declaration.ordinaryType || question.type });
    return { supported: ordinary.supported, reason: ordinary.reason, surfaceId, authority: declaration.authority, mode: null };
  }
  if (declaration.kind === 'question') {
    let check;
    try {
      check = declaration.supports(question) || {};
    } catch {
      check = { supported: false, reason: 'unsupported-question' };
    }
    return {
      supported: check.supported === true,
      reason: check.supported === true ? null : text(check.reason) || 'unsupported-question',
      surfaceId,
      authority: check.supported === true ? declaration.authority : (check.authority || GRADING_AUTHORITY.CLIENT_GRADED),
      mode: check.mode || null,
      ...(check.blocker ? { blocker: check.blocker } : {}),
    };
  }
  const check = toolModeSupport(declaration, question);
  return {
    supported: check.supported === true,
    reason: check.supported ? null : check.reason,
    surfaceId,
    authority: check.authority,
    mode: check.mode || null,
    ...(check.blocker ? { blocker: check.blocker } : {}),
  };
};

/**
 * Can the SERVER mark a response to this authoritative question?
 *
 *   { supported, reason, surfaceId, authority, mode, blocker? }
 */
export const serverResponseGradingSupport = (question) => {
  const excluded = commonServerGradingExclusion(question);
  if (excluded) {
    const surfaceId = question && typeof question === 'object' && !Array.isArray(question) ? resolveGradingSurfaceId(question) : null;
    return { supported: false, reason: excluded, surfaceId, authority: null, mode: null };
  }
  return declaredGradingSupport(question);
};

/** Is this question answered through a registry tool's structured response? */
export const usesToolResponse = (question) => gradingDeclarationFor(question).declaration?.kind === 'tool';

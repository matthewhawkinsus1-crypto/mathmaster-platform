/*
 * HOW A RICH TOOL DECLARES ITS GRADING — AND HOW ITS GRADER IS BOUND TO IT.
 *
 * Two halves, deliberately in two files:
 *
 *   1. The DECLARATION lives in gradingManifest.mjs (light, React-free, safe to
 *      put in the main bundle). It says, for every mode, who is authoritative,
 *      and for any mode that is not server graded, exactly why:
 *
 *        complexPlaneLab: declareTool({
 *          contractVersion: 1,            // the tool's WORK shape
 *          defaultMode: 'features',
 *          modes: {
 *            features: SHARED,
 *            freehand: clientGraded('Strokes are judged by a sampler the server ...'),
 *          },
 *        }),
 *
 *   2. The GRADER lives in serverGrading/tools/<toolId>.mjs (heavier — it may
 *      import the tool's math). It supplies one pure function per SHARED mode:
 *
 *        export default bindToolGrader(GRADING_MANIFEST.complexPlaneLab, 'complexPlaneLab', {
 *          features: (question, work) => gradedResult({ parts: [...] }),
 *        });
 *
 * `bindToolGrader` refuses a grader that is missing a SHARED mode or grades a
 * mode the manifest does not declare, so the declaration and the code cannot
 * drift apart.
 *
 * A grader is a pure function of (authoritative question, normalized raw
 * work). It never reads React, the DOM, Firestore, the clock, the network or
 * any verdict the browser computed. The browser tool calls the SAME function to
 * decide what to show the student, so "the browser and the server agree" is a
 * property of the code rather than a hope.
 */
import { GRADING_AUTHORITY } from './gradingAuthority.mjs';
import { gradedResult, ungradedResult } from './gradingResult.mjs';

const text = (value) => String(value ?? '');

/** A mode graded by the shared server grader. */
export const SHARED = Object.freeze({ authority: GRADING_AUTHORITY.SHARED_SERVER });

/** A mode still graded on the device, with the specific technical blocker. */
export const clientGraded = (blocker) => Object.freeze({ authority: GRADING_AUTHORITY.CLIENT_GRADED, blocker: text(blocker).trim() });

/** A mode that produces no academic result. */
export const nonGraded = (reason) => Object.freeze({ authority: GRADING_AUTHORITY.NON_GRADED, blocker: text(reason).trim() });

/**
 * Declare a registry tool's grading surface (used by gradingManifest.mjs).
 *
 *   resolveMode(question) -> the mode the TOOL renders for this question
 *   supports(question, mode) -> { supported, reason } extra per-question gate
 */
export const declareTool = (spec = {}) => {
  const modes = spec.modes && typeof spec.modes === 'object' ? spec.modes : {};
  const names = Object.keys(modes);
  if (!names.length) throw new Error('A tool declaration needs at least one mode.');
  const defaultMode = text(spec.defaultMode || names[0]);
  if (!modes[defaultMode]) throw new Error(`defaultMode "${defaultMode}" is not a declared mode.`);
  const normalized = Object.fromEntries(names.map((name) => {
    const entry = modes[name] || {};
    const authority = entry.authority || GRADING_AUTHORITY.SHARED_SERVER;
    if (authority !== GRADING_AUTHORITY.SHARED_SERVER && !text(entry.blocker).trim()) {
      throw new Error(`Mode "${name}" is ${authority} without a documented blocker.`);
    }
    return [name, Object.freeze({ authority, blocker: text(entry.blocker).trim() || null })];
  }));
  const authorities = new Set(Object.values(normalized).map((entry) => entry.authority));
  return Object.freeze({
    kind: 'tool',
    // A tool is shared-server when any mode is; each mode still answers for
    // itself through `toolModeSupport`.
    authority: authorities.has(GRADING_AUTHORITY.SHARED_SERVER)
      ? GRADING_AUTHORITY.SHARED_SERVER
      : [...authorities][0],
    contractVersion: Math.max(1, Math.floor(Number(spec.contractVersion) || 1)),
    defaultMode,
    modes: Object.freeze(normalized),
    resolveMode: typeof spec.resolveMode === 'function' ? spec.resolveMode : null,
    supports: typeof spec.supports === 'function' ? spec.supports : null,
    note: text(spec.note).trim() || null,
  });
};

/** The mode the tool renders for this question (declaration-level). */
export const resolveToolMode = (declaration, question = {}) => {
  const requested = text(declaration.resolveMode ? declaration.resolveMode(question) : question?.mode).trim();
  if (requested && declaration.modes[requested]) return requested;
  // Every registry tool falls back to its default view for a missing or
  // unknown mode, so the grader does too — grading anything else would grade
  // a screen the student never saw.
  return declaration.defaultMode;
};

/** Mode-level support for one question, from the declaration alone. */
export const toolModeSupport = (declaration, question = {}) => {
  const mode = resolveToolMode(declaration, question);
  const entry = declaration.modes[mode];
  if (entry.authority !== GRADING_AUTHORITY.SHARED_SERVER) {
    return { supported: false, reason: `mode-not-server-gradable:${mode}`, mode, authority: entry.authority, blocker: entry.blocker };
  }
  if (declaration.supports) {
    let extra;
    try {
      extra = declaration.supports(question, mode);
    } catch {
      extra = { supported: false, reason: 'unsupported-question' };
    }
    if (extra && extra.supported === false) {
      return { supported: false, reason: text(extra.reason) || 'unsupported-question', mode, authority: entry.authority };
    }
  }
  return { supported: true, reason: null, mode, authority: entry.authority };
};

/**
 * Bind per-mode grade functions to a tool declaration.
 */
export const bindToolGrader = (declaration, toolId, modeGraders = {}) => {
  if (!declaration || declaration.kind !== 'tool') throw new Error(`bindToolGrader(${toolId}): not a tool declaration.`);
  /*
   * DRIFT FAILS CLOSED FOR THIS ONE TOOL — IT DOES NOT THROW.
   *
   * A declaration that promises a shared grader the code does not supply (or
   * the reverse) must never ship: tests/platform/serverGradingCoverageGate
   * fails on any `problems` here. But if one ever did, throwing at import
   * would take down the whole registry — every ordinary question's server
   * grading with it. Instead the drifted tool refuses to grade
   * ('grader-declaration-drift') and its submissions keep the bounded legacy
   * path, while every other surface is unaffected.
   */
  const problems = [];
  Object.entries(declaration.modes).forEach(([mode, entry]) => {
    const hasGrader = typeof modeGraders[mode] === 'function';
    if (entry.authority === GRADING_AUTHORITY.SHARED_SERVER && !hasGrader) {
      problems.push(`Tool grader ${toolId}: mode "${mode}" is declared shared-server but has no grade function.`);
    }
    if (entry.authority !== GRADING_AUTHORITY.SHARED_SERVER && hasGrader) {
      problems.push(`Tool grader ${toolId}: mode "${mode}" is ${entry.authority} but supplies a grade function.`);
    }
  });
  Object.keys(modeGraders).forEach((mode) => {
    if (!declaration.modes[mode]) problems.push(`Tool grader ${toolId}: grades undeclared mode "${mode}".`);
  });

  const grade = (question = {}, work = null) => {
    if (problems.length) return ungradedResult('grader-declaration-drift', { detail: problems.join(' ') });
    const check = toolModeSupport(declaration, question);
    if (!check.supported) return ungradedResult(check.reason, { mode: check.mode });
    if (work === null || work === undefined || typeof work !== 'object' || Array.isArray(work)) {
      return ungradedResult('empty-response', { mode: check.mode });
    }
    let result;
    try {
      result = modeGraders[check.mode](question, work);
    } catch (error) {
      // A malformed or tampered response must never crash ingestion. It is
      // simply not gradable, and the reason says which tool refused it.
      return ungradedResult('malformed-response', { mode: check.mode, detail: text(error?.message).slice(0, 200) });
    }
    if (!result || typeof result !== 'object') return ungradedResult('grader-returned-nothing', { mode: check.mode });
    if (result.graded === false) return { ...ungradedResult(result.reason || 'ungraded'), ...result, mode: check.mode };
    const normalized = result.graded === true && Array.isArray(result.parts) ? result : gradedResult(result);
    return { ...normalized, graded: true, reason: null, mode: check.mode };
  };

  return Object.freeze({
    toolId,
    contractVersion: declaration.contractVersion,
    declaration,
    modeGraders: Object.freeze({ ...modeGraders }),
    problems: Object.freeze(problems),
    support: (question) => (problems.length
      ? { supported: false, reason: 'grader-declaration-drift', mode: null }
      : toolModeSupport(declaration, question)),
    grade,
  });
};

// Which tools can actually honour which supports.
//
// WHY THIS IS DERIVED RATHER THAN DECLARED. `src/tools/toolCapabilities.js`
// already declares eight `supports*` booleans per tool. An audit of every
// consumer found that NONE of them is read by behavioural code: the only two
// consumers flatten them into a Markdown line for an AI prompt and a JSON dump
// on a developer bench. Worse, they are wrong — all nineteen tools declare
// `supportsSolutionReview: true`, but `buildToolSolutionReviewModel` returns a
// review for exactly six and `null` for the rest.
//
// A metadata boolean nobody enforces is not a capability, it is a wish. So this
// file computes compatibility from things that cannot lie:
//
//   - does a secure Path grading contract exist for this tool?
//   - does the solution-review builder actually produce a review for it?
//   - is there a non-pointer route through the interaction?
//
// and states the rest honestly as needing work rather than asserting it.

import { PATH_TOOL_IDS } from '../../../functions/shared/pathToolContracts.mjs';
import { SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';

/** How well a tool honours a support. Deliberately more than yes/no. */
export const COMPAT = Object.freeze({
  /** The tool implements it itself. */
  TOOL: 'toolSpecific',
  /** The surrounding QuestionEngine/Path player provides it, and it reaches the tool. */
  ENGINE: 'engineLevel',
  /** The support has no meaning for this interaction. */
  NOT_APPLICABLE: 'notApplicable',
  /** Authorized students would expect it here and would not get it. */
  NEEDS_WORK: 'needsWork',
  /** Delivering it here would damage the mathematics or the security model. */
  UNSAFE: 'unsafe',
});

export const COMPAT_LABEL = Object.freeze({
  [COMPAT.TOOL]: 'Supported in the tool',
  [COMPAT.ENGINE]: 'Supported around the tool',
  [COMPAT.NOT_APPLICABLE]: 'Not applicable',
  [COMPAT.NEEDS_WORK]: 'Needs work',
  [COMPAT.UNSAFE]: 'Unsafe here',
});

/** Tools whose solution review the builder can genuinely produce. */
export const TOOLS_WITH_REAL_SOLUTION_REVIEW = Object.freeze([
  'sequenceExplorer', 'representationMatch', 'functionInvestigation2',
  'relationMapping', 'openSortBoard', 'constraintFunctionBuilder',
]);

/**
 * Interactions with a genuine non-pointer route, verified by the accessibility
 * tests rather than asserted here. Everything absent from this list is treated
 * as needing work, which is the safe direction: claiming keyboard access a
 * student does not have is worse than admitting the gap.
 */
export const KEYBOARD_OPERABLE = Object.freeze([
  'intervalNumberLine', 'relationMapping', 'openSortBoard', 'graphing2',
  'systemsWorkspace', 'sequenceExplorer', 'representationMatch',
  'dataModelingLab', 'inverseCompositionLab', 'parabolaGeometryLab',
  'polynomialWorkshop', 'signSolutionAnalyzer', 'complexPlaneLab',
  'exponentialLogBridge', 'transformationsLab', 'functionInvestigation2',
  'stepAlgebra2', 'constraintFunctionBuilder',
  // Both gained a keyboard route: an arrow-key cursor plus exact coordinate
  // entry on the plane, and select-then-place on the balance.
  'functionInvestigation', 'stepAlgebra',
  // Typed-response graders. Nothing to point at in the first place.
  'multiAnswer', 'algebra', 'system',
]);

/** Tools that draw their own mathematics and need their own contrast handling. */
const CANVAS_TOOLS = Object.freeze([
  'functionInvestigation', 'graphing2', 'intervalNumberLine',
  'systemsWorkspace', 'relationMapping', 'transformationsLab',
  'parabolaGeometryLab', 'complexPlaneLab',
]);

/** Tools where the computation IS the assessed construct often enough to matter. */
const COMPUTATION_TOOLS = Object.freeze(['stepAlgebra', 'stepAlgebra2', 'polynomialWorkshop', 'complexPlaneLab']);

const has = (list, id) => list.includes(id);

/**
 * The compatibility row for one tool.
 *
 * `toolId` may be a registry id or a Path contract id — they overlap, and the
 * caller should not have to know which family a tool belongs to.
 */
export const toolSupportRow = (toolId) => {
  const id = String(toolId || '');
  const pathContracted = PATH_TOOL_IDS.includes(id) || id === 'functionGraph';
  const keyboard = has(KEYBOARD_OPERABLE, id);
  const canvas = has(CANVAS_TOOLS, id);

  return {
    toolId: id,
    pathContracted,
    hasSolutionReview: has(TOOLS_WITH_REAL_SOLUTION_REVIEW, id),
    keyboardOperable: keyboard,
    supports: {
      // The Path support bar reads the prompt, the context and the choices. It
      // sits outside the tool, so it works for every tool — but on a canvas
      // tool it cannot read what is DRAWN, and saying otherwise would be a lie
      // to a blind student.
      [SUPPORT.TEXT_TO_SPEECH]: canvas ? COMPAT.NEEDS_WORK : COMPAT.ENGINE,
      // Translation reaches authored language. A tool with its own hardcoded
      // English button labels needs its own pass.
      [SUPPORT.TRANSLATION]: COMPAT.NEEDS_WORK,
      [SUPPORT.GLOSSARY]: COMPAT.NEEDS_WORK,
      // Contrast and text size are applied to the card. A tool that paints its
      // own SVG has to honour them itself.
      [SUPPORT.HIGH_CONTRAST]: canvas ? COMPAT.NEEDS_WORK : COMPAT.ENGINE,
      [SUPPORT.LARGE_TEXT]: canvas ? COMPAT.NEEDS_WORK : COMPAT.ENGINE,
      [SUPPORT.DECLUTTER]: COMPAT.ENGINE,
      [SUPPORT.VISUAL_CHUNKING]: COMPAT.ENGINE,
      [SUPPORT.GRAPHIC_ORGANIZER]: COMPAT.NEEDS_WORK,
      // Extra time and extra attempts are session-level and never touch a tool.
      [SUPPORT.EXTENDED_TIME]: COMPAT.NOT_APPLICABLE,
      [SUPPORT.EXTRA_ATTEMPTS]: pathContracted ? COMPAT.ENGINE : COMPAT.NOT_APPLICABLE,
      // A calculator on a tool whose whole point is the computation would
      // replace the construct rather than provide access to it.
      [SUPPORT.CALCULATOR]: has(COMPUTATION_TOOLS, id) ? COMPAT.UNSAFE : COMPAT.ENGINE,
      // Trimming options only means anything where there are options.
      [SUPPORT.REDUCED_CHOICES]: ['representationMatch', 'openSortBoard'].includes(id)
        ? COMPAT.NEEDS_WORK
        : COMPAT.NOT_APPLICABLE,
    },
    // Keyboard is not one of the formal accommodations, but it is the one that
    // decides whether a student can answer at all.
    keyboard: keyboard ? COMPAT.TOOL : COMPAT.NEEDS_WORK,
  };
};

/**
 * The whole matrix, plus the two lists an administrator actually acts on.
 *
 * `blockers` are tools a student could meet today and be unable to use.
 * `gaps` are authorized supports that would silently not arrive.
 */
export const buildToolSupportMatrix = (toolIds = []) => {
  const rows = [...new Set(toolIds.map(String))].filter(Boolean).map(toolSupportRow);
  const blockers = rows.filter((row) => row.keyboard === COMPAT.NEEDS_WORK);
  const gaps = rows.flatMap((row) => Object.entries(row.supports)
    .filter(([, state]) => state === COMPAT.NEEDS_WORK)
    .map(([supportId]) => ({ toolId: row.toolId, supportId })));
  const unsafe = rows.flatMap((row) => Object.entries(row.supports)
    .filter(([, state]) => state === COMPAT.UNSAFE)
    .map(([supportId]) => ({ toolId: row.toolId, supportId })));

  return {
    rows,
    blockers,
    gaps,
    unsafe,
    summary: {
      tools: rows.length,
      pathContracted: rows.filter((row) => row.pathContracted).length,
      keyboardOperable: rows.filter((row) => row.keyboardOperable).length,
      withSolutionReview: rows.filter((row) => row.hasSolutionReview).length,
    },
  };
};

/**
 * Supports a student is authorized for that this tool cannot deliver.
 *
 * The question an administrator needs answered before a student meets the
 * question, rather than after a parent phones.
 */
export const undeliverableSupports = (toolId, entitlements) => {
  const row = toolSupportRow(toolId);
  return (entitlements?.authorized || []).filter((supportId) => (
    row.supports[supportId] === COMPAT.NEEDS_WORK || row.supports[supportId] === COMPAT.UNSAFE
  ));
};

export default buildToolSupportMatrix;

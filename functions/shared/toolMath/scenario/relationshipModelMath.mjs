/*
 * WHAT A STANDALONE relationshipModel QUESTION ASKS FOR.
 *
 * Extracted from src/RelationshipModel.jsx so the screen and the shared grader
 * (functions/shared/serverGrading/tools/relationshipModel.mjs) derive the same
 * sections, the same origin response mode and the same origin config from the
 * question. The screen uses them to decide what to render; the grader uses them
 * to decide what to mark. They cannot disagree because there is one copy.
 *
 * A relationshipModel with a `recipe` or `workflow` is a composed workflow and
 * never reaches this module (QuestionEngine and the grading manifest both route
 * it to the workflow runner first).
 *
 * Pure.
 */

const ORIGIN_MODES = ['builder', 'guided', 'open'];

const axisSetupOf = (question) => (question?.axisSetup && typeof question.axisSetup === 'object' ? question.axisSetup : {});

/** Which sections the question asks for — and therefore renders and grades. */
export const relationshipModelRequirements = (question = {}) => {
  const axisSetup = axisSetupOf(question);
  return {
    quantities: question.requireQuantityRoles !== false,
    continuity: Boolean(question.relationshipType || question.requireRelationshipType),
    axes: Boolean(axisSetup.required),
    scale: Boolean(axisSetup.requireScale),
    origin: Boolean(question.origin?.required),
  };
};

/** How the starting point is interpreted: open text unless builder/guided is named. */
export const relationshipOriginMode = (question = {}) => (
  ORIGIN_MODES.includes(question.origin?.responseMode) ? question.origin.responseMode : 'open'
);

/** Axis setup input: drag cards onto the graph, or type. */
export const relationshipAxisInputMode = (question = {}) => (axisSetupOf(question).inputMode === 'drag' ? 'drag' : 'type');

/*
 * The point-meaning config for the origin builder/guided response.
 *
 * The authored `origin.target` / `origin.quantities` win; otherwise the target
 * is the origin's `coordinates` (or `point`) and the quantities are the
 * question's own correct independent/dependent quantities, with the axis
 * setup's accepted units.
 *
 * ACCEPTED UNITS. With no `axisSetup.acceptedX/YUnits` the screen used to set
 * `acceptedUnits: []`. An empty array is truthy, so normalizeInterpretationConfig
 * never fell back to the quantity's own `unit`, and the origin x-unit / y-unit
 * parts could never be marked correct — even though the screen asks for the
 * unit and the quantity names it. Now, when no accepted units are authored,
 * `acceptedUnits` is left out and the quantity's unit is the key (a quantity
 * with no unit still has no key). Authored accepted units are used exactly as
 * before. Only the grade reads `acceptedUnits`; nothing on screen changes.
 *
 * `quantities` is read only when it is an array — the screen used to call
 * `.find` on whatever was authored and crash on a non-array.
 */
export const relationshipOriginConfig = (question = {}) => {
  if (!relationshipModelRequirements(question).origin) return null;
  const axisSetup = axisSetupOf(question);
  const quantityList = Array.isArray(question.quantities) ? question.quantities : [];
  const quantityFor = (id) => quantityList.find((item) => item?.id === id);
  return {
    ...question.origin,
    responseMode: relationshipOriginMode(question),
    target: question.origin?.target || {
      kind: 'startingPoint',
      coordinates: question.origin?.point || question.origin?.coordinates || [],
    },
    quantities: question.origin?.quantities || {
      x: {
        id: question.correctIndependentId,
        name: quantityFor(question.correctIndependentId)?.label || '',
        unit: quantityFor(question.correctIndependentId)?.unit || '',
        ...(axisSetup.acceptedXUnits ? { acceptedUnits: axisSetup.acceptedXUnits } : {}),
      },
      y: {
        id: question.correctDependentId,
        name: quantityFor(question.correctDependentId)?.label || '',
        unit: quantityFor(question.correctDependentId)?.unit || '',
        ...(axisSetup.acceptedYUnits ? { acceptedUnits: axisSetup.acceptedYUnits } : {}),
      },
    },
    applyResponseToGraph: question.origin?.applyResponseToGraph !== false,
    quantityChoices: question.quantities || [],
  };
};

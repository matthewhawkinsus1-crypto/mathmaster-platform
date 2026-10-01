/*
 * Shared grader for the STANDALONE `relationshipModel` structured question
 * surface (src/RelationshipModel.jsx) — run by the screen for the verdict it
 * reports, and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from RelationshipModel.jsx. The sections come from
 * relationshipModelRequirements and the origin config from
 * relationshipOriginConfig — the same helpers the screen renders from:
 *
 *   quantities   independent / dependent id === correctIndependentId / ...Id
 *   continuity   relationshipType === question.relationshipType
 *   axes         x/y label and unit match acceptedX/YLabels, acceptedX/YUnits
 *                (default: the correct quantity's label / unit) as text
 *   scale        x/y step is one of acceptedX/YSteps, or any positive number
 *                when none are authored
 *   origin       open: originMeaning contains the required concept groups;
 *                builder/guided: buildContextInterpretationParts (prefix
 *                'origin') over the origin config
 *
 * The work is complete when there is at least one part and every part is
 * complete; correct when also every part is correct. A part is correct only
 * when it is complete (creditCompleteParts): on their own, a blank origin value
 * "matches" an expected 0 (`Number('')` is 0) and a blank unit "matches" a
 * quantity with no unit.
 *
 * KNOWN CONTENT DEFECTS, KEPT AT PARITY (Pre-Flight's to catch, not a reason
 * to invent a key): `requireRelationshipType` with no `relationshipType`
 * compares the choice with `undefined`, and a correct quantity with no `unit`
 * (and no accepted units) accepts only a unit that normalizes to nothing —
 * both parts are effectively unwinnable, here exactly as on the old screen.
 *
 * FIXED (see relationshipOriginConfig): a derived origin config no longer
 * blocks the fallback to the quantity's own unit, so the origin unit parts
 * have the key the screen asks for instead of none.
 */
import declaration from '../declarations/relationshipModel.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { matchesAcceptedText, matchesConceptGroups } from '../../toolMath/scenario/scenarioResponseUtils.mjs';
import { buildContextInterpretationParts } from '../../toolMath/scenario/contextInterpretationUtils.mjs';
import {
  relationshipModelRequirements,
  relationshipOriginConfig,
  relationshipOriginMode,
} from '../../toolMath/scenario/relationshipModelMath.mjs';
import { creditCompleteParts, readRelationshipModelWork } from '../../toolMath/scenario/scenarioWork.mjs';

/* `(axisSetup.acceptedXSteps || []).map(String)`: every falsy value is no list.
   A lone truthy non-array value (which used to crash the screen with
   ".map is not a function") is read as a one-item list. */
const stepList = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
};

const standalone = (question, work) => {
  const values = readRelationshipModelWork(work);
  const requirements = relationshipModelRequirements(question);
  const axisSetup = question.axisSetup && typeof question.axisSetup === 'object' ? question.axisSetup : {};
  const quantities = Array.isArray(question.quantities) ? question.quantities.filter((item) => item?.id) : [];
  const quantityById = Object.fromEntries(quantities.map((item) => [item.id, item]));
  const acceptedXLabels = axisSetup.acceptedXLabels || [quantityById[question.correctIndependentId]?.label];
  const acceptedYLabels = axisSetup.acceptedYLabels || [quantityById[question.correctDependentId]?.label];
  const acceptedXUnits = axisSetup.acceptedXUnits || [quantityById[question.correctIndependentId]?.unit];
  const acceptedYUnits = axisSetup.acceptedYUnits || [quantityById[question.correctDependentId]?.unit];
  const acceptedXSteps = stepList(axisSetup.acceptedXSteps);
  const acceptedYSteps = stepList(axisSetup.acceptedYSteps);

  const parts = [];
  if (requirements.quantities) {
    parts.push({
      id: 'independent',
      label: 'Independent quantity',
      isComplete: Boolean(values.independentId),
      isCorrect: values.independentId === question.correctIndependentId,
      response: quantityById[values.independentId]?.label || '',
    });
    parts.push({
      id: 'dependent',
      label: 'Dependent quantity',
      isComplete: Boolean(values.dependentId),
      isCorrect: values.dependentId === question.correctDependentId,
      response: quantityById[values.dependentId]?.label || '',
    });
  }
  if (requirements.continuity) {
    parts.push({
      id: 'relationship-type',
      label: 'Discrete or continuous relationship',
      isComplete: Boolean(values.relationshipType),
      isCorrect: values.relationshipType === question.relationshipType,
      response: values.relationshipType,
    });
  }
  if (requirements.axes) {
    parts.push({ id: 'x-label', label: 'X-axis quantity', isComplete: Boolean(values.xLabel.trim()), isCorrect: matchesAcceptedText(values.xLabel, acceptedXLabels), response: values.xLabel });
    parts.push({ id: 'x-unit', label: 'X-axis unit', isComplete: Boolean(values.xUnit.trim()), isCorrect: matchesAcceptedText(values.xUnit, acceptedXUnits), response: values.xUnit });
    parts.push({ id: 'y-label', label: 'Y-axis quantity', isComplete: Boolean(values.yLabel.trim()), isCorrect: matchesAcceptedText(values.yLabel, acceptedYLabels), response: values.yLabel });
    parts.push({ id: 'y-unit', label: 'Y-axis unit', isComplete: Boolean(values.yUnit.trim()), isCorrect: matchesAcceptedText(values.yUnit, acceptedYUnits), response: values.yUnit });
  }
  if (requirements.scale) {
    parts.push({
      id: 'x-step',
      label: 'Reasonable x-axis scale',
      isComplete: Boolean(values.xStep.trim()),
      isCorrect: acceptedXSteps.length ? acceptedXSteps.includes(values.xStep.trim()) : Number(values.xStep) > 0,
      response: values.xStep,
    });
    parts.push({
      id: 'y-step',
      label: 'Reasonable y-axis scale',
      isComplete: Boolean(values.yStep.trim()),
      isCorrect: acceptedYSteps.length ? acceptedYSteps.includes(values.yStep.trim()) : Number(values.yStep) > 0,
      response: values.yStep,
    });
  }
  if (requirements.origin) {
    if (relationshipOriginMode(question) === 'open') {
      parts.push({
        id: 'origin',
        label: 'Meaning of the starting point',
        isComplete: Boolean(values.originMeaning.trim()),
        isCorrect: matchesConceptGroups(values.originMeaning, question.origin?.requiredConcepts || []),
        response: values.originMeaning,
      });
    } else {
      parts.push(...buildContextInterpretationParts(values.pointMeaning, relationshipOriginConfig(question), { prefix: 'origin' }));
    }
  }

  return gradedResult({
    isComplete: parts.length > 0 && parts.every((part) => part.isComplete),
    parts: creditCompleteParts(parts),
  });
};

export default bindToolGrader(declaration, 'relationshipModel', {
  standalone,
});

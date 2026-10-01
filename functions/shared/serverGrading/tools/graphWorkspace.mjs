/*
 * Shared grader for the interactive graph workspace (`functionGraph`,
 * `functionInvestigation`, `graphAnalysis`). See ../toolGraderDefinition.mjs
 * for the contract and ../declarations/graphWorkspace.mjs for the modes.
 *
 * Extracted check-for-check from src/InteractiveGraphWorkspace.jsx, which now
 * reports the result of THIS function (through gradeToolCheck) as its answer
 * state. The parts, in order:
 *
 *   construction (any mode but analysis)
 *     one part per point task       gradePointPlacements at max(0.22, 0.48·snap),
 *                                   credited only once the placements are
 *                                   committed and all of them pass (below)
 *     'graph-curve'                 the freehand sketch snaps (not pointOnly)
 *     '<end>-placement' / '-type'   each graph-end marker: dropped within
 *                                   max(0.55, 1.8·snap) of the end, and the
 *                                   right symbol (not pointOnly)
 *   analysis (when the question asks, or in analysis mode)
 *     one part per analysis request gradeAnalysisPart at max(0.28, 0.58·snap)
 *     'inverse-line-sketch'         the inverse sketch snaps (when required)
 *
 * THE POINT PARTS COUNT ONLY ONCE COMMITTED, AS THEY ALWAYS DID. The
 * workspace counted a placement only after "Check Point Placements" accepted
 * every one of them (its `pointsValidated` flag): before that every point part
 * was incomplete and incorrect; after it each part was marked by
 * gradePointPlacements, and the placements could no longer move. Here that is
 * `pointsLocked` (the student's commit, carried in the work) AND the grader's
 * own re-check that the button really did accept these placements (below). The
 * flag can only withhold credit; it never grants any.
 *
 * A POINTS-ONLY PLOT CAN BE GRADED AS PLACED. When the activity withholds
 * outcomes (a DOL, quiz or test) a plot of points with nothing drawn through
 * them has no check: the workspace counts every point once all of them are
 * placed, each marked where it sits, and they stay movable until submit. The
 * work carries that as `pointsGradedAsPlaced`; the grader honours it only for
 * a point-only construction with every task placed, and still marks each
 * point itself. The flag moves when the points are graded, never the marks,
 * so forging it in practice only gives up the check — it earns nothing.
 *
 * ONE EDIT SURVIVES THE COMMIT. A student-chosen x-value box stays open until
 * the sketch snaps, and retyping it clears that task's placement (which can no
 * longer be re-placed). The workspace kept the commit and marked the cleared
 * part incomplete and incorrect while the rest kept their marks, and the
 * construction could still be finished and submitted. So the re-check accepts
 * a committed set when every placement still sits where the button accepted it
 * and the only missing ones are student-chosen tasks; anything else (a wrong
 * placement, a fixed task missing) is a set the button never accepted, and no
 * point is credited.
 *
 * THE SKETCHES COUNT ONLY ONCE COMMITTED, TOO. The workspace snapped a sketch
 * (`snapped`, `inverseSnapped`) only at the moment a stroke ended and the
 * check passed; Undo after a snap took back the snap but kept the strokes, and
 * the screen then showed the sketch as not snapped. The work carries that
 * commit (`sketchLocked`, `inverseSketchLocked`) and the grader credits a
 * sketch only when it is committed AND the strokes pass the check here.
 *
 * Complete = the points committed (as above) and, unless point-only, the
 * sketch committed and passing and every end marked; every analysis part
 * answered and any required inverse sketch committed and passing. Correct =
 * complete and every part correct. The score is the share of correct parts —
 * the arithmetic the attempt record applied to the browser's parts.
 *
 * What the browser computed from flags it set itself, this recomputes from the
 * work: a marker's location from the point it was dropped at (never from
 * `locationCorrect` or a bare symbol), the sketches from their strokes and
 * camera (the commit only withholds), and the point parts from the placements
 * (the commit only withholds).
 */
import declaration, { resolveGraphWorkspaceMode } from '../declarations/graphWorkspace.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import {
  constructionSketchMatches,
  gradeAnalysisPart,
  graphWorkspaceModelFor,
  inverseSketchMatches,
  normalizeGraphWorkspaceWork,
} from '../../toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { gradePointPlacements, pointDistance, resolveTaskExpected } from '../../toolMath/graphWorkspace/interactiveGraphEngine.mjs';

const pointLabel = ([x, y]) => `(${x}, ${y})`;
const own = (map, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);

/*
 * Is a committed placement still the one "Check Point Placements" accepted?
 *
 * The button accepted the whole set (placementsMatchTasks); once committed a
 * placement cannot move, so each one still placed must still pass its own
 * task's check (gradePointPlacements' per-task rule, at the same tolerance —
 * the cross-task spread rule is re-applied to the parts themselves, as the
 * workspace did). A task may be unplaced only if it has a chosen-x box, the one
 * control that clears a committed placement.
 */
const committedPlacementHolds = (model, task, placement, chosenXValues) => {
  if (placement === undefined) return Boolean(task.studentChoosesX);
  const expected = resolveTaskExpected(task, model.functionSpec, chosenXValues);
  if (task.studentChoosesX && expected === 'undefined') return false;
  if (expected === 'undefined') return placement === 'undefined';
  return Array.isArray(expected) && Array.isArray(placement) && pointDistance(placement, expected) <= model.pointTolerance;
};

/** The graph-end marker parts: where each symbol was dropped, and which symbol. */
const markerParts = (model, markerPlacements) => model.endpointRequirements.flatMap((requirement, index) => {
  const placement = own(markerPlacements, requirement.id);
  const placed = Boolean(placement);
  const point = placed ? placement.point : null;
  const locationCorrect = placed && Boolean(point) && pointDistance(point, requirement.point) <= model.markerTolerance;
  return [
    { id: `${requirement.id}-placement`, label: `Graph end ${index + 1}: symbol placement`, isComplete: placed, isCorrect: locationCorrect, response: point ? pointLabel(point) : placed ? 'snapped to endpoint' : '' },
    { id: `${requirement.id}-type`, label: `Graph end ${index + 1}: symbol type`, isComplete: placed, isCorrect: placed && placement.marker === requirement.marker, response: placed ? placement.marker : '' },
  ];
});

/**
 * Grade a graph workspace response. `rawWork` is anything; it is read through
 * normalizeGraphWorkspaceWork, so a field of the wrong type is simply absent.
 */
export const gradeGraphWorkspace = (question, rawWork) => {
  const model = graphWorkspaceModelFor(question, { analysisMode: resolveGraphWorkspaceMode(question) === 'analysis' });
  const { construction, analysis } = normalizeGraphWorkspaceWork(rawWork);

  const placementGrades = model.constructionEnabled
    ? gradePointPlacements(model.tasks, construction.placements, model.functionSpec, construction.chosenXValues, model.pointTolerance)
    : [];
  // Committed with "Check Point Placements", and still the set it accepted —
  // or a points-only plot submitted as placed, once every point is placed.
  const pointsCommitted = construction.pointsLocked
    && model.tasks.every((task) => committedPlacementHolds(model, task, own(construction.placements, task.id), construction.chosenXValues));
  const pointsSubmittedAsPlaced = model.pointOnly
    && construction.pointsGradedAsPlaced
    && placementGrades.every((part) => part.isComplete);
  const pointsAccepted = model.constructionEnabled && (pointsCommitted || pointsSubmittedAsPlaced);
  const pointParts = placementGrades.map((part) => ({
    ...part,
    label: `Point placement: ${part.label}`,
    isComplete: pointsAccepted && part.isComplete,
    isCorrect: pointsAccepted && part.isCorrect,
  }));
  const curveSnapped = model.constructionEnabled && !model.pointOnly && construction.sketchLocked && constructionSketchMatches(model, {
    strokes: construction.strokes,
    camera: construction.sketchView,
    chosenXValues: construction.chosenXValues,
  });
  const constructionParts = model.constructionEnabled ? [
    ...pointParts,
    ...(model.pointOnly ? [] : [{ id: 'graph-curve', label: 'Freehand curve and snap', isComplete: curveSnapped, isCorrect: curveSnapped, response: curveSnapped ? 'snapped' : 'not snapped' }]),
    ...(model.pointOnly ? [] : markerParts(model, construction.markerPlacements)),
  ] : [];

  const analysisParts = model.analysisParts.map((part) => gradeAnalysisPart(part, analysis, model.analysisTolerance));
  const inverseSnapped = model.inverseSketchRequired && analysis.inverseSketchLocked && inverseSketchMatches(model, {
    strokes: analysis.inverseStrokes,
    camera: analysis.inverseSketchView,
  });
  const inverseSketchPart = model.inverseSketchRequired
    ? [{ id: 'inverse-line-sketch', label: 'Draw the inverse through the reflected points', isComplete: inverseSnapped, isCorrect: inverseSnapped, response: inverseSnapped ? 'snapped' : 'not complete' }]
    : [];

  const parts = [...constructionParts, ...(model.analysisEnabled ? [...analysisParts, ...inverseSketchPart] : [])];
  const allMarkersPlaced = model.endpointRequirements.every((requirement) => Boolean(own(construction.markerPlacements, requirement.id)));
  const constructionComplete = !model.constructionEnabled
    || (pointsAccepted && (model.pointOnly || (curveSnapped && allMarkersPlaced)));
  const analysisComplete = !model.analysisEnabled
    || (analysisParts.length > 0 && analysisParts.every((part) => part.isComplete) && (!model.inverseSketchRequired || inverseSnapped));
  const isComplete = constructionComplete && analysisComplete;
  return gradedResult({ parts, isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect) });
};

export default bindToolGrader(declaration, 'graphWorkspace', {
  construct: gradeGraphWorkspace,
  pointOnly: gradeGraphWorkspace,
  inverseReflection: gradeGraphWorkspace,
  analysis: gradeGraphWorkspace,
});

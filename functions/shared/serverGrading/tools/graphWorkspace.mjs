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
 * WHERE OUTCOMES ARE WITHHELD THE WORK IS GRADED AS PLACED. When the activity
 * withholds outcomes (a DOL, quiz or test) nothing is checked while the
 * student builds (PQ-036): the workspace counts every point once all of them
 * are placed, each marked where it sits, and they stay movable until submit or
 * until a curve is drawn through them. A curve is drawn through the student's
 * OWN points and counts as drawn (complete) once it passes through them; it is
 * correct only when it is also the graph of the function — the practice
 * snap's own check, judged in the question's authored window whatever the zoom
 * — and every point it was drawn through is right. The inverse follows the
 * same rule through the student's own reflected points. The work carries that
 * as `pointsGradedAsPlaced`; the grader honours it only with every task placed,
 * and still marks each point and each sketch itself. The flag moves when the
 * work is graded, never the marks, so forging it in practice only gives up the
 * checks — it earns nothing a correct construction would not.
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
  constructionSketchFollowsFunction,
  constructionSketchMatches,
  constructionSketchThroughOwnPoints,
  gradeAnalysisPart,
  graphWorkspaceModelFor,
  inverseSketchFollowsInverse,
  inverseSketchMatches,
  inverseSketchThroughOwnPoints,
  normalizeGraphWorkspaceWork,
} from '../../toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { gradePointPlacements, pointDistance, resolveTaskExpected, taskStatesX } from '../../toolMath/graphWorkspace/interactiveGraphEngine.mjs';

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
const committedPlacementHolds = (model, task, placement, chosenXValues, grade) => {
  if (placement === undefined) return Boolean(task.studentChoosesX);
  const expected = resolveTaskExpected(task, model.functionSpec, chosenXValues);
  if (task.studentChoosesX && expected === 'undefined') return false;
  if (expected === 'undefined') return placement === 'undefined';
  // Cards that state the same x are matched to their points as a set
  // (gradePointPlacements), as the check that accepted them matched them: a
  // relation with two outputs at x = 2 is plotted whichever card holds which.
  if (taskStatesX(task) && grade) return Array.isArray(placement) && grade.isCorrect === true;
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
  // or, where outcomes are withheld, graded as placed once every point is placed.
  const pointsCommitted = construction.pointsLocked
    && model.tasks.every((task, index) => committedPlacementHolds(model, task, own(construction.placements, task.id), construction.chosenXValues, placementGrades[index]));
  const gradedAsPlaced = model.constructionEnabled && construction.pointsGradedAsPlaced;
  const pointsSubmittedAsPlaced = gradedAsPlaced && placementGrades.every((part) => part.isComplete);
  const pointsAccepted = model.constructionEnabled && (pointsCommitted || pointsSubmittedAsPlaced);
  const pointParts = placementGrades.map((part) => ({
    ...part,
    label: `Point placement: ${part.label}`,
    isComplete: pointsAccepted && part.isComplete,
    isCorrect: pointsAccepted && part.isCorrect,
  }));
  // The curve counts once committed: snapped to the function where outcomes
  // are shown, drawn through the student's own placed points where they are
  // withheld. There it is right only if it is also the graph of the function
  // and every point it was drawn through is right — what practice requires
  // before its snap, decided here instead of on screen.
  const sketch = { strokes: construction.strokes, camera: construction.sketchView, chosenXValues: construction.chosenXValues };
  const curveDrawn = model.constructionEnabled && !model.pointOnly && construction.sketchLocked && (gradedAsPlaced
    ? pointsSubmittedAsPlaced && constructionSketchThroughOwnPoints(model, { ...sketch, placements: construction.placements })
    : constructionSketchMatches(model, sketch));
  const curveCorrect = curveDrawn && (!gradedAsPlaced
    || (constructionSketchFollowsFunction(model, sketch) && pointParts.every((part) => part.isCorrect)));
  const curveResponse = curveDrawn ? (gradedAsPlaced ? 'drawn through the student\'s points' : 'snapped') : 'not snapped';
  const constructionParts = model.constructionEnabled ? [
    ...pointParts,
    ...(model.pointOnly ? [] : [{ id: 'graph-curve', label: 'Freehand curve and snap', isComplete: curveDrawn, isCorrect: curveCorrect, response: curveResponse }]),
    ...(model.pointOnly ? [] : markerParts(model, construction.markerPlacements)),
  ] : [];

  const analysisParts = model.analysisParts.map((part) => gradeAnalysisPart(part, analysis, model.analysisTolerance));
  // The inverse sketch, by the same two rules, through the reflected points.
  const inverseSketch = { strokes: analysis.inverseStrokes, camera: analysis.inverseSketchView };
  const reflectedPointsCorrect = model.analysisParts
    .map((part, index) => (part.kind === 'inversePoint' ? analysisParts[index] : null))
    .filter(Boolean)
    .every((part) => part.isCorrect);
  const inverseDrawn = model.inverseSketchRequired && analysis.inverseSketchLocked && (gradedAsPlaced
    ? inverseSketchThroughOwnPoints(model, { ...inverseSketch, selections: analysis.selections })
    : inverseSketchMatches(model, inverseSketch));
  const inverseCorrect = inverseDrawn && (!gradedAsPlaced
    || (inverseSketchFollowsInverse(model, inverseSketch) && reflectedPointsCorrect));
  const inverseSketchPart = model.inverseSketchRequired
    ? [{ id: 'inverse-line-sketch', label: 'Draw the inverse through the reflected points', isComplete: inverseDrawn, isCorrect: inverseCorrect, response: inverseDrawn ? (gradedAsPlaced ? 'drawn through the student\'s points' : 'snapped') : 'not complete' }]
    : [];

  const parts = [...constructionParts, ...(model.analysisEnabled ? [...analysisParts, ...inverseSketchPart] : [])];
  const allMarkersPlaced = model.endpointRequirements.every((requirement) => Boolean(own(construction.markerPlacements, requirement.id)));
  const constructionComplete = !model.constructionEnabled
    || (pointsAccepted && (model.pointOnly || (curveDrawn && allMarkersPlaced)));
  const analysisComplete = !model.analysisEnabled
    || (analysisParts.length > 0 && analysisParts.every((part) => part.isComplete) && (!model.inverseSketchRequired || inverseDrawn));
  const isComplete = constructionComplete && analysisComplete;
  return gradedResult({ parts, isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect) });
};

export default bindToolGrader(declaration, 'graphWorkspace', {
  construct: gradeGraphWorkspace,
  pointOnly: gradeGraphWorkspace,
  inverseReflection: gradeGraphWorkspace,
  analysis: gradeGraphWorkspace,
});

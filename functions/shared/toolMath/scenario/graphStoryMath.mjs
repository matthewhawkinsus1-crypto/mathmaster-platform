/*
 * GRAPH STORY: WHAT IT ASKS FOR, AND THE SKETCH EVIDENCE ITS WORK CARRIES.
 *
 * A graph story is completion credit: every required part present. The one
 * part that is not text is the freehand sketch, which counts when SOME stroke
 * has at least three points.
 *
 * The screen holds every pointer sample of every stroke — hundreds of floats
 * per stroke — which does not fit a bounded response. The old response key
 * kept every fourth point of each stroke, which turned a 3-to-11 point stroke
 * into 1 to 3 points: the very rule the sketch is graded by could not be read
 * back from what was stored. `compactSketchStrokes` bounds the sketch while
 * preserving that rule exactly:
 *
 *   - a stroke keeps all of its points up to SKETCH_LIMITS.maxPointsPerStroke,
 *     and a longer one keeps that many evenly spaced points including both
 *     ends — so a stroke has >= 3 points after compaction iff it had >= 3
 *     before (the cap is >= 3);
 *   - at most SKETCH_LIMITS.maxStrokes strokes are kept, strokes that satisfy
 *     the rule first, then the rest, in drawing order — so the work has a
 *     qualifying stroke iff the student drew one;
 *   - points are whole viewBox units ([x, y] pairs), which is all the
 *     teacher-review drawing needs.
 *
 * Pure.
 */
import { readWorkFields, writeWorkFields } from './scenarioWork.mjs';

export const SKETCH_LIMITS = Object.freeze({
  maxStrokes: 40,
  maxPointsPerStroke: 24,
  // The rule the sketch part is graded by.
  minPointsPerStroke: 3,
});

/** The question supplies a graph to read (otherwise the student sketches one). */
export const graphStoryHasSourceGraph = (question = {}) => Boolean(question?.graph && typeof question.graph === 'object');

/** The sketch plane is shown, and the sketch is a required part. */
export const graphStoryRequiresSketch = (question = {}) => question?.requireSketch === true || !graphStoryHasSourceGraph(question);

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** A pointer sample as a whole-unit [x, y] pair, or null. Accepts {x, y} or [x, y]. */
const samplePoint = (point) => {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  return finiteNumber(x) && finiteNumber(y) ? [Math.round(x), Math.round(y)] : null;
};

/** Evenly spaced indices 0..length-1 including both ends. */
const spacedIndices = (length, count) => (
  length <= count
    ? Array.from({ length }, (_, index) => index)
    : Array.from({ length: count }, (_, index) => Math.round((index * (length - 1)) / (count - 1)))
);

const compactStroke = (stroke) => {
  const points = (Array.isArray(stroke) ? stroke : []).map(samplePoint).filter(Boolean);
  return spacedIndices(points.length, SKETCH_LIMITS.maxPointsPerStroke).map((index) => points[index]);
};

/** A stroke the sketch rule counts: at least three valid points. */
export const isQualifyingStroke = (stroke) => (
  Array.isArray(stroke)
  && stroke.filter((point) => Array.isArray(point) && finiteNumber(point[0]) && finiteNumber(point[1])).length >= SKETCH_LIMITS.minPointsPerStroke
);

/** The bounded sketch the work carries: [[[x, y], ...], ...]. */
export const compactSketchStrokes = (strokes) => {
  const compacted = (Array.isArray(strokes) ? strokes : []).map(compactStroke);
  if (compacted.length <= SKETCH_LIMITS.maxStrokes) return compacted;
  const qualifying = compacted.map((stroke, index) => (isQualifyingStroke(stroke) ? index : -1)).filter((index) => index >= 0);
  const others = compacted.map((stroke, index) => (isQualifyingStroke(stroke) ? -1 : index)).filter((index) => index >= 0);
  const keep = new Set([...qualifying, ...others].slice(0, SKETCH_LIMITS.maxStrokes));
  return compacted.filter((_, index) => keep.has(index));
};

export const GRAPH_STORY_TEXT_FIELDS = Object.freeze([
  'scenario', 'independent', 'dependent', 'xLabel', 'xUnit', 'yLabel', 'yUnit', 'explanation',
]);
// The two textareas, graded by their trimmed length — which an author may set
// above the contract's per-string limit — travel whole (scenarioWork.mjs
// freeTextWork).
const GRAPH_STORY_FREE_TEXT = Object.freeze(['scenario', 'explanation']);

/** The work a graph story submits: its eight texts and the bounded sketch. */
export const graphStoryWork = (values) => ({
  ...writeWorkFields(values, GRAPH_STORY_TEXT_FIELDS, GRAPH_STORY_FREE_TEXT),
  strokes: compactSketchStrokes(values?.strokes),
});

/** The eight texts read back from work (free text joined). */
export const readGraphStoryText = (work) => readWorkFields(work, GRAPH_STORY_TEXT_FIELDS, GRAPH_STORY_FREE_TEXT);

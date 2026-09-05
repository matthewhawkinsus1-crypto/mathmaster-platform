import { useMemo } from 'react';
import CoordinatePlane from '../../tools/shared/CoordinatePlane';
import { evaluateModelAt } from './modelExpression';

/*
 * MARKING A NAMED FEATURE ON A GRAPH.
 *
 * The student is shown a graph and asked where something is — the x-intercept,
 * the y-intercept, the maximum — and answers by pointing at it rather than by
 * typing coordinates. Two decisions shape the whole component:
 *
 * 1. THE PLANE NEVER PRINTS WHAT THEY ARE POINTING AT. A question that asks a
 *    student to mark the x-intercept and then, a step later, to WRITE it as an
 *    ordered pair is assessing whether they can read the plane. A chip showing
 *    "(4, 0)" the moment they touch it answers the second half for them, so
 *    `revealCoordinates={false}` is not configurable here — it is the point.
 *
 *    The gridlines and axis numbers stay. Counting gridlines IS the skill;
 *    hiding the grid would not make the question harder, only unanswerable.
 *
 * 2. "THERE ISN'T ONE" IS AN ANSWER. An exponential has no x-intercept and a
 *    line has no maximum. Without a way to say so, the tool forces a wrong
 *    click out of a student who is exactly right, so `allowNone` puts it on
 *    screen as a button of equal standing rather than as a way out.
 */

export const FEATURE_SELECTION_ARTIFACT = 'featureSelection';

const FEATURE_LABELS = {
  xIntercept: 'x-intercept',
  yIntercept: 'y-intercept',
  maximum: 'maximum',
  minimum: 'minimum',
  extremum: 'maximum or minimum',
  vertex: 'vertex',
};

export const featureLabel = (feature) => FEATURE_LABELS[feature] || 'feature';

const noneButtonLabel = (stage) => stage?.noneLabel
  || `This graph has no ${featureLabel(stage?.feature)}`;

const normalizePoint = (point) => {
  const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x);
  const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

export const readFeatureSelection = (value) => {
  if (!value || typeof value !== 'object') return { selections: [], none: false };
  return {
    selections: (Array.isArray(value.selections) ? value.selections : []).map(normalizePoint).filter(Boolean),
    none: value.none === true,
  };
};

const button = {
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 8,
  border: '1px solid #b7bec8',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

export default function GraphFeatureSelectStage({ stage, sourceGraph, value, onChange, disabled = false }) {
  const { selections, none } = readFeatureSelection(value);
  const selectionCount = Math.max(1, Number(stage?.selectionCount) || 1);
  const allowNone = stage?.allowNone !== false;
  const graph = sourceGraph && typeof sourceGraph === 'object' ? sourceGraph : {};

  const viewWindow = {
    xMin: Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10,
    xMax: Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10,
    yMin: Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10,
    yMax: Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10,
  };

  // The curve the student is reading. A model expression is sampled; a bare
  // list of points is drawn as points, which is correct for a discrete relation.
  const model = typeof graph.model === 'string' ? graph.model.trim() : '';
  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    // An unevaluable model must not render as a flat line at zero.
    return Number.isFinite(evaluate(viewWindow.xMin)) || Number.isFinite(evaluate(0)) ? [evaluate] : [];
  }, [model, viewWindow.xMin]);

  const curvePoints = useMemo(
    () => (Array.isArray(graph.points) ? graph.points : []).map(normalizePoint).filter(Boolean),
    [graph.points],
  );

  const emit = (next) => {
    const complete = next.none === true || next.selections.length >= selectionCount;
    onChange({
      __mathmasterWorkflowArtifact: FEATURE_SELECTION_ARTIFACT,
      feature: stage?.feature || null,
      selections: next.selections,
      none: next.none === true,
      isComplete: complete,
    });
  };

  const plot = (point) => {
    const normalized = normalizePoint(point);
    if (!normalized) return;
    // Marking past the allowance replaces the oldest, so a student who
    // miscounts is never stuck behind a full board with no way to undo.
    const next = [...selections, normalized].slice(-selectionCount);
    emit({ selections: next, none: false });
  };

  const movePoint = (index, point) => {
    const normalized = normalizePoint(point);
    if (!normalized) return;
    emit({ selections: selections.map((entry, at) => (at === index ? normalized : entry)), none: false });
  };

  const clear = () => emit({ selections: [], none: false });
  const toggleNone = () => emit({ selections: [], none: !none });

  const marks = none ? [] : selections.map(([x, y]) => ({ x, y, fill: '#d93025', r: 7 }));

  return (
    <div>
      <CoordinatePlane
        {...viewWindow}
        // The graph the student is reading is drawn in blue; what they mark is
        // drawn in red, so a mark never reads as part of the figure.
        points={[...curvePoints.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5 })), ...marks]}
        functions={functions}
        {...(!model && curvePoints.length > 1 && graph.connect !== false
          ? { polylines: [curvePoints] }
          : {})}
        onPlot={disabled ? null : plot}
        onMovePoint={disabled ? null : movePoint}
        // See the file header: this is the whole reason the stage exists.
        revealCoordinates={false}
        cursorLabel={featureLabel(stage?.feature)}
        ariaLabel={`Graph. Mark the ${featureLabel(stage?.feature)}.`}
        snapStep={Number(graph.snapStep) > 0 ? Number(graph.snapStep) : 1}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" onClick={clear} disabled={disabled || (!selections.length && !none)} style={button}>
          Clear my marks
        </button>
        {allowNone ? (
          <button
            type="button"
            onClick={toggleNone}
            disabled={disabled}
            aria-pressed={none}
            style={{
              ...button,
              background: none ? '#174ea6' : '#fff',
              color: none ? '#fff' : '#3c4043',
              border: none ? 0 : button.border,
            }}
          >
            {noneButtonLabel(stage)}
          </button>
        ) : null}
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#5f6b7a' }} aria-live="polite">
        {none
          ? noneButtonLabel(stage)
          : `${selections.length} of ${selectionCount} marked.`}
      </p>
    </div>
  );
}

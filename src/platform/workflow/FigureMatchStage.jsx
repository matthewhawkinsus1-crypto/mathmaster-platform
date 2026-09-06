import { useMemo } from 'react';
import CoordinatePlane from '../../tools/shared/CoordinatePlane';
import MathDisplay from '../../MathDisplay';
import { evaluateModelAt } from './modelExpression';
import {
  buildFigureMatchResponse,
  figureLabel,
  matchCategories,
  matchItems,
  readFigureMatch,
} from './figureMatch';

/*
 * MATCHING FIGURES TO CATEGORIES — the renderer.
 *
 * Three decisions:
 *
 * 1. THE FIGURE'S NAME COMES FROM ITS POSITION, NOT FROM THE AUTHOR. The
 *    heading over each card is `figureLabel(index)` and there is no code path
 *    that renders `item.label` or `item.id`. See figureMatch.js for why.
 *
 * 2. EVERY FIGURE OFFERS EVERY CATEGORY, IN ONE ORDER. If the chips under a
 *    graph varied — three under one figure, four under another, or the same
 *    four in a different order — the variation itself would carry information.
 *    They are built once, from the stage, and reused under every card.
 *
 * 3. THE PLANE DOES NOT REVEAL COORDINATES AND CANNOT BE PLOTTED ON. Here the
 *    graph is the question, not the workspace; a student answers with a chip.
 */

const card = {
  border: '1px solid #d5dae1',
  borderRadius: 12,
  padding: 12,
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const heading = {
  margin: 0,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#4a5261',
};

const chip = (selected) => ({
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 999,
  border: selected ? '2px solid #1a4fd6' : '1px solid #b7bec8',
  background: selected ? '#e8efff' : '#fff',
  color: selected ? '#123a9e' : '#22262d',
  fontWeight: 800,
  fontSize: 14,
  cursor: 'pointer',
});

const normalizePoint = (point) => {
  const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x);
  const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

function FigureGraph({ graph, label }) {
  const spec = graph && typeof graph === 'object' ? graph : {};
  const viewWindow = {
    xMin: Number.isFinite(Number(spec.xMin)) ? Number(spec.xMin) : -10,
    xMax: Number.isFinite(Number(spec.xMax)) ? Number(spec.xMax) : 10,
    yMin: Number.isFinite(Number(spec.yMin)) ? Number(spec.yMin) : -10,
    yMax: Number.isFinite(Number(spec.yMax)) ? Number(spec.yMax) : 10,
  };
  const model = typeof spec.model === 'string' ? spec.model.trim() : '';

  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    // An unevaluable model must not draw as a flat line at zero — that would be
    // a fourth graph the student is asked to classify and cannot.
    return Number.isFinite(evaluate(viewWindow.xMin)) || Number.isFinite(evaluate(0)) ? [evaluate] : [];
  }, [model, viewWindow.xMin]);

  const points = useMemo(
    () => (Array.isArray(spec.points) ? spec.points : []).map(normalizePoint).filter(Boolean),
    [spec.points],
  );

  return (
    <CoordinatePlane
      {...viewWindow}
      points={points.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5 }))}
      functions={functions}
      {...(!model && points.length > 1 && spec.connect !== false ? { polylines: [points] } : {})}
      revealCoordinates={false}
      ariaLabel={`${label}. Decide which category it belongs to.`}
    />
  );
}

export default function FigureMatchStage({ stage, value, onChange, disabled = false }) {
  const items = matchItems(stage);
  const categories = matchCategories(stage);
  const assignments = readFigureMatch(value);

  const assign = (itemId, categoryId) => {
    const next = { ...assignments };
    // Pressing the chip already chosen clears it. Without that, a student who
    // answers by accident on a phone can change the answer but never unsay it.
    if (next[itemId] === categoryId) delete next[itemId];
    else next[itemId] = categoryId;
    onChange(buildFigureMatchResponse(stage, next));
  };

  const answered = items.filter((item) => assignments[String(item.id ?? '').trim()]).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          // One column on a phone; the cards only sit side by side once there
          // is room for a readable plane in each.
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {items.map((item, index) => {
          const itemId = String(item.id ?? '').trim();
          const label = figureLabel(index);
          const chosen = assignments[itemId] || '';
          return (
            <div key={itemId || index} style={card}>
              <p style={heading}>{label}</p>
              {item.graph ? <FigureGraph graph={item.graph} label={label} /> : null}
              {item.math ? (
                <div style={{ fontSize: 18, padding: '10px 0' }}>
                  <MathDisplay value={String(item.math)} />
                </div>
              ) : null}
              {item.text ? <p style={{ margin: 0, fontSize: 15 }}>{String(item.text)}</p> : null}
              <div
                role="radiogroup"
                aria-label={`Category for ${label}`}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
              >
                {categories.map((category) => {
                  const categoryId = String(category.id ?? '').trim();
                  const selected = chosen === categoryId;
                  return (
                    <button
                      key={categoryId}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => assign(itemId, categoryId)}
                      style={chip(selected)}
                    >
                      {String(category.label ?? '')}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#4a5261' }}>
        {answered} of {items.length} figures matched.
      </p>
    </div>
  );
}

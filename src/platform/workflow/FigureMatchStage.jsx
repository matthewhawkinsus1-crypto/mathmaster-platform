import { useMemo } from 'react';
import { ChoiceMark, useChoiceGroup } from '../interaction/choiceGroup.js';
import CoordinatePlane from '../../tools/shared/CoordinatePlane';
import MathDisplay from '../../MathDisplay';
import { evaluateModelAt } from './modelExpression';
import { workflowEndpointMarkers } from './workflowGraphVisuals.js';
import {
  buildFigureMatchResponse,
  figureEquationLines,
  figureLabel,
  figureNoun,
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
  border: '1px solid var(--mm-border)',
  borderRadius: 12,
  padding: 12,
  background: 'var(--mm-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const heading = {
  margin: 0,
  fontSize: 'calc(13 * var(--mm-px))',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--mm-text-muted)',
};

const chip = (selected) => ({
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 999,
  border: selected ? '2px solid #1a4fd6' : '1px solid var(--mm-border)',
  background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: selected ? 'var(--mm-primary-text)' : 'var(--mm-text-strong)',
  fontWeight: 800,
  fontSize: 'calc(14 * var(--mm-px))',
  cursor: 'pointer',
});

// One figure's categories: a radio group (choiceGroup.js) — one tab stop,
// arrows move and select, and the chosen chip carries a ✓.
function CategoryChoices({ label, categories, value, disabled, onSelect }) {
  const ids = categories.map((category) => String(category.id ?? '').trim());
  const optionProps = useChoiceGroup({ ids, value, onSelect, disabled });
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {categories.map((category, index) => {
        const selected = value === ids[index];
        return (
          <button
            key={ids[index]}
            type="button"
            {...optionProps(index)}
            disabled={disabled}
            onClick={() => onSelect(ids[index])}
            style={chip(selected)}
          >
            <ChoiceMark selected={selected} />
            {String(category.label ?? '')}
          </button>
        );
      })}
    </div>
  );
}

const normalizePoint = (point) => {
  const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x);
  const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

function FigureGraph({ graph, label }) {
  const spec = graph && typeof graph === 'object' ? graph : {};
  const xMin = Number.isFinite(Number(spec.xMin)) ? Number(spec.xMin) : -10;
  const xMax = Number.isFinite(Number(spec.xMax)) ? Number(spec.xMax) : 10;
  const yMin = Number.isFinite(Number(spec.yMin)) ? Number(spec.yMin) : -10;
  const yMax = Number.isFinite(Number(spec.yMax)) ? Number(spec.yMax) : 10;
  // One object per window rather than per render, so the endpoint markers can
  // depend on the window itself and still recompute only when it moves.
  const viewWindow = useMemo(() => ({ xMin, xMax, yMin, yMax }), [xMin, xMax, yMin, yMax]);
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
  const endpointMarkers = useMemo(
    () => (functions.length ? workflowEndpointMarkers({ evaluate: functions[0], viewWindow }) : []),
    [functions, viewWindow],
  );

  return (
    <CoordinatePlane
      {...viewWindow}
      points={[
        ...points.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5, movable: false })),
        ...endpointMarkers,
      ]}
      functions={functions}
      {...(!model && points.length > 1 && spec.connect !== false ? { polylines: [points] } : {})}
      revealCoordinates={false}
      ariaLabel={`${label}. Decide which category it belongs to.`}
    />
  );
}

// "Figure 3", "Figures 3 and 5", "Figures 1, 3 and 5" (or "Card 3", … in a sort of words).
const figureList = (indexes, noun = 'Figure') => {
  const numbers = indexes.map((index) => String(index + 1));
  const joined = numbers.length <= 1 ? numbers.join('') : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
  return `${numbers.length === 1 ? noun : `${noun}s`} ${joined}`;
};

// `wrongItems`: positions of the figures the checked step placed wrongly, from
// WorkflowRunner while this step shows its verdict (P2-4). Empty otherwise.
export default function FigureMatchStage({ stage, value, onChange, disabled = false, wrongItems = [] }) {
  const items = matchItems(stage);
  const categories = matchCategories(stage);
  const assignments = readFigureMatch(value);
  const wrong = new Set(wrongItems);
  const noun = figureNoun(stage);

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
      {wrong.size ? (
        <p data-figure-match-wrong="" style={{ margin: 0, fontWeight: 700, color: 'var(--mm-danger)' }}>
          {`${figureList([...wrong].sort((a, b) => a - b), noun)} ${wrong.size === 1 ? 'is' : 'are'} not in the right category yet.`}
        </p>
      ) : null}
      <div
        style={{
          display: 'grid',
          // One column on a phone; the cards only sit side by side once there
          // is room for a readable plane in each.
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
          gap: 12,
        }}
      >
        {items.map((item, index) => {
          const itemId = String(item.id ?? '').trim();
          const label = figureLabel(index, noun);
          const chosen = assignments[itemId] || '';
          return (
            <div key={itemId || index} style={wrong.has(index) ? { ...card, border: '2px solid var(--mm-error-border)' } : card} data-figure-wrong={wrong.has(index) ? '' : undefined}>
              <p style={heading}>{label}{wrong.has(index) ? <span style={{ marginLeft: 8, color: 'var(--mm-danger)', textTransform: 'none', letterSpacing: 0 }}>· not in the right category yet</span> : null}</p>
              {item.graph ? <FigureGraph graph={item.graph} label={label} /> : null}
              {item.math ? (
                <div style={{ fontSize: 'calc(18 * var(--mm-px))', padding: '10px 0', display: 'grid', gap: 4 }}>
                  {figureEquationLines(item.math).map((line, lineIndex) => <MathDisplay key={lineIndex} value={line} />)}
                </div>
              ) : null}
              {item.text ? <p style={{ margin: 0, fontSize: 'calc(15 * var(--mm-px))' }}>{String(item.text)}</p> : null}
              <CategoryChoices
                label={`Category for ${label}`}
                categories={categories}
                value={chosen}
                disabled={disabled}
                onSelect={(categoryId) => assign(itemId, categoryId)}
              />
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
        {answered} of {items.length} {noun === 'Card' ? 'cards' : 'figures'} matched.
      </p>
    </div>
  );
}

import React, { useId } from 'react';
import CoordinatePlane from '../../shared/CoordinatePlane';
import MathDisplay from '../../../MathDisplay.jsx';
import MathText from '../../../components/common/MathText.jsx';
import { ChoiceChips, Latex, ProcessField, muted, pointLatex, touchButton } from './processUi.jsx';
import { establishedPoints, factDisplay, readExactNumber } from '../lmrProcessMath.js';

/*
 * HOW A STUDENT DOES EACH PROCESS — the methods that need no algebra engine.
 *
 * Every method writes only what the student did into `ev` (the in-progress
 * evidence the board keeps in its draft): the numbers they typed, the rows
 * they chose, the points they picked. Nothing here decides whether that work
 * is right; the workspace asks the shared marking (lmrProcessVerify.mjs) — the
 * function the server grades with — when the student presses Check.
 */

const asNumber = (value) => {
  if (value && typeof value === 'object' && Number.isFinite(value.n)) return value.n / value.d;
  return Number(value);
};

/** The GIVEN (or the student's own equation) a reading works from, compactly. */
export function SourceReminder({ description, ownEquationLatex = null, factsEquationLatex = null }) {
  if (ownEquationLatex) {
    return <p style={{ ...muted, color: '#24324a' }}>Your equation: <Latex value={ownEquationLatex} /></p>;
  }
  if (factsEquationLatex) {
    return <p style={{ ...muted, color: '#24324a' }}>With your slope and y-intercept: <Latex value={factsEquationLatex} /></p>;
  }
  if (!description) return null;
  if (description.kind === 'equation') {
    return <p style={{ ...muted, color: '#24324a' }}>GIVEN: <MathDisplay value={description.latex} inline /></p>;
  }
  if (description.kind === 'scenario') {
    return (
      <MathText as="p" style={{ ...muted, color: '#24324a', maxWidth: '68ch' }}>
        {description.text}
      </MathText>
    );
  }
  return null;
}

// The fields each reading asks for, in the classroom's own notation.
const READ_FIELDS = Object.freeze({
  readSlopeIntercept: [
    { field: 'm', labelLatex: 'm =', profile: 'number', placeholder: 'slope' },
    { field: 'b', labelLatex: 'b =', profile: 'number', placeholder: 'y-intercept' },
  ],
  readPointSlope: [
    { field: 'm', labelLatex: 'm =', profile: 'number', placeholder: 'slope' },
    { field: 'point', labelLatex: '(x_1, y_1) =', profile: 'orderedPair', placeholder: '(x, y)' },
  ],
  readScenario: [
    { field: 'rate', label: 'Rate of change', profile: 'number', placeholder: 'per step of x' },
    { field: 'start', label: 'Initial value', profile: 'number', placeholder: 'when x = 0' },
  ],
  evaluateAtX: [
    { field: 'x', labelLatex: 'x =', profile: 'number', placeholder: 'your choice' },
    { field: 'y', labelLatex: 'y =', profile: 'number', placeholder: 'y at that x' },
  ],
});

/** Read values where the GIVEN shows them, or compute a point from an equation. */
export function FieldsMethod({ option, ev, setEv, fieldStatus, disabled, description, ownEquationLatex, factsEquationLatex }) {
  const fields = READ_FIELDS[option.strategy] || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SourceReminder
        description={option.source === 'given' ? description : null}
        ownEquationLatex={option.source === 'siEquation' ? ownEquationLatex : null}
        factsEquationLatex={option.source === 'facts' ? factsEquationLatex : null}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
        {fields.map(({ field, label, labelLatex, profile, placeholder }) => (
          <ProcessField
            key={field}
            field={field}
            label={label || field}
            labelLatex={labelLatex}
            profile={profile}
            placeholder={placeholder}
            value={ev?.[field] ?? ''}
            status={fieldStatus(field)}
            disabled={disabled}
            onChange={(next) => setEv((current) => ({ ...current, [field]: next }))}
          />
        ))}
      </div>
    </div>
  );
}

const pointChoice = (record) => ({
  value: record.fact === 'point' ? `point:${record.key}` : record.fact,
  label: <Latex value={pointLatex(record.point)} />,
  point: record.point,
});

/** b from y₁ = m·x₁ + b, with the student's own slope and one of their points. */
export function SolveForBMethod({ process, ev, setEv, fieldStatus, disabled }) {
  const choices = establishedPoints(process).filter((record) => record.fact !== 'yIntercept').map(pointChoice);
  const chosen = choices.find((choice) => choice.value === ev?.pt) || null;
  const slope = process?.facts?.slope || null;
  const slots = [
    { field: 'y1', labelLatex: 'y_1 =' },
    { field: 'm', labelLatex: 'm =' },
    { field: 'x1', labelLatex: 'x_1 =' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...muted, color: '#24324a' }}>Choose a point you know, then substitute it and your slope into <Latex value="y = mx + b" />.</p>
      <ChoiceChips label="Point to use" name="point" options={choices} value={ev?.pt || null} disabled={disabled} onChange={(value) => setEv((current) => ({ ...current, pt: value }))} />
      {chosen ? (
        <>
          <p style={{ ...muted, color: '#24324a' }}>
            <Latex value="y_1 = m \cdot x_1 + b" /> with your point <Latex value={pointLatex(chosen.point)} />
            {slope ? <> and your slope <Latex value={factDisplay(slope)} /></> : null}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
            {slots.map(({ field, labelLatex }) => (
              <ProcessField key={field} field={field} label={field} labelLatex={labelLatex} value={ev?.[field] ?? ''} status={fieldStatus('sub')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, [field]: next }))} width={90} />
            ))}
          </div>
          <ProcessField field="b" label="b" labelLatex="b =" value={ev?.b ?? ''} status={fieldStatus('b')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, b: next }))} />
        </>
      ) : null}
    </div>
  );
}

// m = (y₂ − y₁)/(x₂ − x₁), substituted by the student.
function FormulaSlots({ ev, setEv, fieldStatus, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ ...muted, color: '#24324a' }}>
        <Latex value="m = \dfrac{y_2 - y_1}{x_2 - x_1}" />
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 8 }}>
        {[['y2', 'y_2 ='], ['y1', 'y_1 ='], ['x2', 'x_2 ='], ['x1', 'x_1 =']].map(([field, labelLatex]) => (
          <ProcessField key={field} field={field} label={field} labelLatex={labelLatex} value={ev?.[field] ?? ''} status={fieldStatus('sub')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, [field]: next }))} width={80} />
        ))}
      </div>
      <ProcessField field="m" label="m" labelLatex="m =" value={ev?.m ?? ''} status={fieldStatus('m')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, m: next }))} />
    </div>
  );
}

/** The slope formula from two GIVEN points or two the student established. */
export function TwoPointFormulaMethod({ option, env, process, ev, setEv, fieldStatus, disabled }) {
  const given = option.source === 'given' && env?.kind === 'twoPoints';
  const choices = given
    ? env.givenPoints.map((point, index) => ({ value: `g${index}`, label: <Latex value={pointLatex(point)} />, point }))
    : establishedPoints(process).map(pointChoice);
  const first = choices.find((choice) => choice.value === ev?.p1) || null;
  const second = choices.find((choice) => choice.value === ev?.p2) || null;
  const choose = (value) => setEv((current) => {
    if (current?.p1 === value) return { ...current, p1: current.p2 || null, p2: null };
    if (current?.p2 === value) return { ...current, p2: null };
    if (!current?.p1) return { ...current, p1: value };
    return { ...current, p2: value };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...muted, color: '#24324a' }}>Choose point 1, then point 2.</p>
      <div role="group" aria-label="Points for the slope formula" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {choices.map((choice) => {
          const role = choice.value === ev?.p1 ? '1' : choice.value === ev?.p2 ? '2' : null;
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={Boolean(role)}
              data-process-point={choice.value}
              disabled={disabled}
              onClick={() => choose(choice.value)}
              style={{ ...touchButton, border: role ? '2px solid #174ea6' : touchButton.border, background: role ? '#e8f0fe' : touchButton.background }}
            >
              {role ? <strong style={{ marginRight: 6 }}>{`Point ${role}`}</strong> : null}
              {choice.label}
            </button>
          );
        })}
      </div>
      {first && second ? (
        <>
          <p style={{ ...muted, color: '#24324a' }}>
            Point 1 <Latex value={pointLatex(first.point)} /> · Point 2 <Latex value={pointLatex(second.point)} />
          </p>
          <FormulaSlots ev={ev} setEv={setEv} fieldStatus={fieldStatus} disabled={disabled} />
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- tables */

function GivenTableChooser({ description, selected = [], onChoose, disabled, captionText }) {
  const captionId = useId();
  return (
    <table aria-describedby={captionId} style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 320, fontSize: 17 }}>
      <caption id={captionId} style={{ ...muted, textAlign: 'left', captionSide: 'top', paddingBottom: 6 }}>{captionText}</caption>
      <thead>
        <tr>
          <th scope="col" style={{ padding: '4px 8px', fontStyle: 'italic', fontFamily: 'serif', color: '#1a4fb4' }}>x</th>
          <th scope="col" style={{ padding: '4px 8px', fontStyle: 'italic', fontFamily: 'serif', color: '#1a4fb4' }}>y</th>
          <th scope="col"><span className="mm-sr-only">Choose</span></th>
        </tr>
      </thead>
      <tbody>
        {(description?.rows || []).map((row, index) => {
          const position = selected.indexOf(index);
          return (
            // eslint-disable-next-line react/no-array-index-key -- authored rows are positional
            <tr key={index} style={{ background: position >= 0 ? '#e8f0fe' : undefined }}>
              <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #dbe3ef' }}><MathDisplay value={row.xLatex} inline /></td>
              <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #dbe3ef' }}><MathDisplay value={row.yLatex} inline /></td>
              <td style={{ padding: 4, textAlign: 'center', borderBottom: '1px solid #dbe3ef' }}>
                <button
                  type="button"
                  aria-pressed={position >= 0}
                  data-process-row={index}
                  disabled={disabled}
                  onClick={() => onChoose(index)}
                  style={{ ...touchButton, minWidth: 92, padding: '6px 10px', fontSize: 13 }}
                  aria-label={`Row ${index + 1}${position >= 0 ? `, chosen${selected.length > 1 ? ` as row ${position + 1}` : ''}` : ''}`}
                >
                  {position >= 0 ? (selected.length > 1 || position > 0 ? `Row ${position + 1} ✓` : 'Chosen ✓') : 'Choose'}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Δy/Δx between two rows of the GIVEN table. */
export function TableDeltaMethod({ description, ev, setEv, fieldStatus, disabled }) {
  const selected = [ev?.r1, ev?.r2].filter((value) => Number.isInteger(value));
  const choose = (index) => setEv((current) => {
    if (current?.r1 === index) return { ...current, r1: Number.isInteger(current?.r2) ? current.r2 : null, r2: null };
    if (current?.r2 === index) return { ...current, r2: null };
    if (!Number.isInteger(current?.r1)) return { ...current, r1: index };
    return { ...current, r2: index };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <GivenTableChooser description={description} selected={selected} onChoose={choose} disabled={disabled} captionText="Choose two rows: row 1, then row 2." />
      {selected.length === 2 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
          <ProcessField field="dy" label="Change in y" labelLatex="\Delta y =" value={ev?.dy ?? ''} status={fieldStatus('dy')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, dy: next }))} width={90} />
          <ProcessField field="dx" label="Change in x" labelLatex="\Delta x =" value={ev?.dx ?? ''} status={fieldStatus('dx')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, dx: next }))} width={90} />
          <ProcessField field="m" label="m" labelLatex="m = \dfrac{\Delta y}{\Delta x} =" value={ev?.m ?? ''} status={fieldStatus('m')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, m: next }))} width={90} />
        </div>
      ) : null}
    </div>
  );
}

/** One row of the GIVEN table: read an intercept, or take it as a point. */
export function TableRowMethod({ option, target, description, ev, setEv, disabled }) {
  const caption = option.strategy === 'tableRead'
    ? (target === 'xIntercept' ? 'Choose the row where the line meets the x-axis.' : 'Choose the row where the line meets the y-axis.')
    : 'Choose a row to use as a point on the line.';
  return (
    <GivenTableChooser
      description={description}
      selected={Number.isInteger(ev?.row) ? [ev.row] : []}
      onChoose={(index) => setEv((current) => ({ ...current, row: current?.row === index ? null : index }))}
      disabled={disabled}
      captionText={caption}
    />
  );
}

/** New rows that continue the GIVEN table's pattern until it reaches an axis. */
export function ExtendTableMethod({ target, description, ev, setEv, fieldStatus, disabled }) {
  const rows = Array.isArray(ev?.rows) && ev.rows.length ? ev.rows : [{ x: '', y: '' }];
  const setRow = (index, field, value) => setEv((current) => {
    const list = Array.isArray(current?.rows) && current.rows.length ? current.rows : [{ x: '', y: '' }];
    return { ...current, rows: list.map((row, i) => (i === index ? { ...row, [field]: value } : row)) };
  });
  const status = fieldStatus('rows');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...muted, color: '#24324a' }}>
        {target === 'xIntercept'
          ? 'Continue the table\'s pattern — the same change in y for each equal change in x — until y = 0.'
          : 'Continue the table\'s pattern — the same change in y for each equal change in x — until x = 0.'}
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 360, fontSize: 17 }}>
        <thead>
          <tr>
            <th scope="col" style={{ padding: '4px 8px', fontStyle: 'italic', fontFamily: 'serif', color: '#1a4fb4' }}>x</th>
            <th scope="col" style={{ padding: '4px 8px', fontStyle: 'italic', fontFamily: 'serif', color: '#1a4fb4' }}>y</th>
          </tr>
        </thead>
        <tbody>
          {(description?.rows || []).map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- authored rows are positional
            <tr key={`given-${index}`} style={{ color: '#5f6b7a' }}>
              <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #e6ecf5' }}><MathDisplay value={row.xLatex} inline /></td>
              <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #e6ecf5' }}><MathDisplay value={row.yLatex} inline /></td>
            </tr>
          ))}
          {rows.map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key -- new rows are positional
            <tr key={`new-${index}`}>
              {['x', 'y'].map((field) => (
                <td key={field} style={{ padding: 4 }}>
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={row?.[field] ?? ''}
                    disabled={disabled}
                    aria-label={`New row ${index + 1} ${field}`}
                    data-process-extend={`${index}:${field}`}
                    onChange={(event) => setRow(index, field, event.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '8px 10px', fontSize: 17, textAlign: 'center',
                      border: `1px solid ${status === 'incorrect' ? '#d93025' : status === 'correct' ? '#34a853' : '#b8c7de'}`, borderRadius: 8, background: 'var(--mm-surface)',
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled || rows.length >= 12} onClick={() => setEv((current) => ({ ...current, rows: [...rows, { x: '', y: '' }] }))} style={touchButton}>+ Add row</button>
        {rows.length > 1 ? (
          <button type="button" disabled={disabled} onClick={() => setEv((current) => ({ ...current, rows: rows.slice(0, -1) }))} style={touchButton}>Remove last row</button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- graphs */

// A plane whose grid squares are square, so a slope of 1 looks like 45°.
const planeSize = (bounds, width) => {
  const pad = 84;
  const xSpan = Math.max(1e-9, bounds.xMax - bounds.xMin);
  const ySpan = Math.max(1e-9, bounds.yMax - bounds.yMin);
  const height = Math.round(pad + (width - pad) * (ySpan / xSpan));
  return { width, height: Math.max(Math.round(width * 0.62), Math.min(Math.round(width * 1.25), height)) };
};

const GRAPH_TASKS = Object.freeze({
  graphCrossing: (target) => (target === 'xIntercept' ? 'Tap where the line crosses the x-axis.' : 'Tap where the line crosses the y-axis.'),
  graphPoint: () => 'Tap a point the line passes through exactly, then write its coordinates.',
  riseRun: () => 'Tap two points the line passes through exactly: A, then B. Then count from A to B.',
  twoPointFormula: () => 'Tap two points the line passes through exactly: point 1, then point 2.',
});

const PICK_FIELDS = Object.freeze({ graphCrossing: ['pick'], graphPoint: ['pick'], riseRun: ['p1', 'p2'], twoPointFormula: ['p1', 'p2'] });
const PICK_LABELS = Object.freeze({ riseRun: ['A', 'B'], twoPointFormula: ['1', '2'] });

/**
 * Processes on the GIVEN graph: find a crossing, read a point, rise over run,
 * the slope formula. The plane reads like the GIVEN graph — no coordinate
 * readout, because reading the plane is the work — and every pick lands on
 * the grid that holds the line's crossings and GIVEN points.
 */
export function GraphMethod({ option, target, description, bounds, snapStep, ev, setEv, fieldStatus, disabled, enlarged = false }) {
  const fields = PICK_FIELDS[option.strategy] || ['pick'];
  const labels = PICK_LABELS[option.strategy] || [''];
  const picks = fields.map((field) => (Array.isArray(ev?.[field]) ? ev[field] : null));
  const givenPoints = Array.isArray(description?.points) ? description.points : [];
  const width = enlarged ? 640 : 440;
  const size = planeSize(bounds, width);
  const plot = (point) => setEv((current) => {
    if (fields.length === 1) return { ...current, pick: point };
    if (!Array.isArray(current?.p1)) return { ...current, p1: point };
    // A third tap moves the newest pick instead of wiping the work.
    return { ...current, p2: point };
  });
  const move = (index, point) => {
    const pickIndex = index - givenPoints.length;
    if (pickIndex < 0 || pickIndex >= fields.length) return;
    setEv((current) => ({ ...current, [fields[pickIndex]]: point }));
  };
  const run = option.strategy === 'riseRun' ? readExactNumber(ev?.run) : null;
  const rise = option.strategy === 'riseRun' ? readExactNumber(ev?.rise) : null;
  const legs = [];
  const legLabels = [];
  if (picks[0] && run?.ok) {
    const [ax, ay] = picks[0];
    const corner = [ax + asNumber(run.value), ay];
    legs.push({ points: [[ax, ay], corner], stroke: '#b25a00', dash: '7 5', strokeWidth: 3 });
    legLabels.push({ at: [(ax + corner[0]) / 2, ay], text: `run ${ev.run}`.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2'), color: '#8a4200', below: true });
    if (rise?.ok) {
      const end = [corner[0], ay + asNumber(rise.value)];
      legs.push({ points: [corner, end], stroke: '#188038', dash: '7 5', strokeWidth: 3 });
      legLabels.push({ at: [corner[0], (ay + end[1]) / 2], text: `rise ${ev.rise}`.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2'), color: '#0d652d', below: false });
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...muted, color: '#24324a' }}>{GRAPH_TASKS[option.strategy]?.(target)}</p>
      <div
        data-process-plane={option.strategy}
        data-bounds={[bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].join(',')}
        data-snap={snapStep}
        style={{ width: '100%', maxWidth: width, margin: '0 auto' }}
      >
        <CoordinatePlane
          xMin={bounds.xMin}
          xMax={bounds.xMax}
          yMin={bounds.yMin}
          yMax={bounds.yMax}
          width={size.width}
          height={size.height}
          snapStep={snapStep}
          points={[
            ...givenPoints.map((point) => ({ x: point[0], y: point[1], fill: '#7b8ba3', movable: false })),
            ...picks.map((point, index) => (point ? { x: point[0], y: point[1], fill: index === 0 ? '#b25a00' : '#188038', label: labels[index] } : null)).filter(Boolean),
          ]}
          lines={description?.line ? [{ ...description.line, stroke: '#1a4fb4' }] : []}
          polylines={legs}
          onPlot={disabled ? null : plot}
          onMovePoint={disabled ? null : move}
          revealCoordinates={false}
          pointHoverEnabled={false}
          enlargeable={false}
          panZoom={false}
          showPlotHelp={false}
          ariaLabel={`Graph of the GIVEN line. ${GRAPH_TASKS[option.strategy]?.(target) || ''}`}
        >
          {({ sx, sy }) => legLabels.map((label) => (
            <text
              key={label.text}
              x={sx(label.at[0]) + (label.below ? 0 : 8)}
              y={sy(label.at[1]) + (label.below ? 20 : 4)}
              textAnchor={label.below ? 'middle' : 'start'}
              fontSize="13"
              fontWeight="800"
              fill={label.color}
              pointerEvents="none"
            >
              {label.text}
            </text>
          ))}
        </CoordinatePlane>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={muted}>
          {picks.every(Boolean)
            ? (fields.length > 1 ? 'Tap the grid to move your second point, or drag either point.' : 'Tap again or drag to move it.')
            : (picks[0] ? 'Now tap the second point.' : 'Tap the grid to place a point (keyboard: arrow keys, then Enter).')}
        </span>
        <button type="button" disabled={disabled || !picks.some(Boolean)} onClick={() => setEv((current) => ({ ...current, ...Object.fromEntries(fields.map((field) => [field, null])) }))} style={touchButton}>
          Start over
        </button>
      </div>
      {option.strategy === 'graphPoint' && picks[0] ? (
        <ProcessField field="point" label="Its coordinates" profile="orderedPair" placeholder="(x, y)" value={ev?.point ?? ''} status={fieldStatus('point')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, point: next }))} />
      ) : null}
      {option.strategy === 'riseRun' && picks.every(Boolean) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px' }}>
          <ProcessField field="run" label="Run (A to B: right is +)" value={ev?.run ?? ''} status={fieldStatus('run')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, run: next }))} width={80} />
          <ProcessField field="rise" label="Rise (A to B: up is +)" value={ev?.rise ?? ''} status={fieldStatus('rise')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, rise: next }))} width={80} />
          <ProcessField field="m" label="m" labelLatex="m = \dfrac{\text{rise}}{\text{run}} =" value={ev?.m ?? ''} status={fieldStatus('m')} disabled={disabled} onChange={(next) => setEv((current) => ({ ...current, m: next }))} width={80} />
        </div>
      ) : null}
      {option.strategy === 'twoPointFormula' && picks.every(Boolean) ? (
        <FormulaSlots ev={ev} setEv={setEv} fieldStatus={fieldStatus} disabled={disabled} />
      ) : null}
    </div>
  );
}

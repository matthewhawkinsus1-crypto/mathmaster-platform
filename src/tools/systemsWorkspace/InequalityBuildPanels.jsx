import React from 'react';
import { UNANSWERED } from '../shared/judgmentChoices.js';
import { boundaryWithChosenSide, feasibleRegionPolygon, lineSegmentForBounds, sideOfBoundaryLine } from './inequalityBuilderAdapter';
import { formatPoint } from './inequalityFormat.js';
import { EyeIcon, LineStyleIcon, StepFeedback, YesNoQuestion } from './InequalityControls.jsx';
import { constraintColor } from './constraintPalette.js';

/*
 * WHAT THE STUDENT-BUILD STEPS LOOK LIKE (StudentBuildInequalityMode.jsx owns
 * what they do). Presentational only: no state, no grading, no answer.
 */

export const CONSTRUCTION_METHODS = [
  { id: 'points', label: 'Two points' },
  { id: 'slopeIntercept', label: 'Slope & y-intercept' },
  { id: 'vertical', label: 'Vertical line (x = c)' },
  { id: 'horizontal', label: 'Horizontal line (y = c)' },
];

export const CLASSIFICATION_OPTIONS = [
  { value: 'bounded', label: 'Bounded region' },
  { value: 'unbounded', label: 'Unbounded region' },
  { value: 'empty', label: 'No solution' },
];

export const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid', icon: <LineStyleIcon /> },
  { value: 'dashed', label: 'Dashed', icon: <LineStyleIcon dashed /> },
];

// What the student is asked to do at each step, in one sentence. The boundary
// sentence depends on the method they chose; none of them names the line.
export const boundaryInstruction = (method) => ({
  slopeIntercept: 'Enter the slope and y-intercept you found, then plot the y-intercept and use the slope to plot a second point.',
  vertical: 'Enter the constant c for the boundary line x = c.',
  horizontal: 'Enter the constant c for the boundary line y = c.',
}[method] || 'Tap the grid to plot two points on the boundary line.');

export const STEP_INSTRUCTIONS = {
  lineStyle: 'Is the boundary line solid or dashed?',
  shading: 'Tap the graph on the side of your boundary line that should be shaded.',
};

/** The heading of the step being worked on; focused when a Check opens it. */
export const StepHeading = ({ label, count = null }) => (
  <h3 className="mm-ineq-step-heading" tabIndex={-1} data-step-heading="current">
    {count ? <span className="mm-ineq-step-count">{count}</span> : null}
    {label}
  </h3>
);

/** The boundary points a constraint's step shows, as chips: plotted, or waiting for a tap. */
export function BoundaryPointChips({ entry, color, method, onRemove }) {
  const slots = [1, 2].map((which) => {
    const plotted = Boolean(entry[`point${which}Plotted`]);
    const name = method === 'slopeIntercept' ? (which === 1 ? 'y-intercept' : 'Second point') : `Point ${which}`;
    return { which, plotted, name, x: entry[`x${which}`], y: entry[`y${which}`] };
  });
  const nextSlot = slots.find((slot) => !slot.plotted)?.which ?? null;
  return (
    <div className="mm-ineq-points" role="list" aria-label="Your boundary points">
      {slots.map((slot) => (slot.plotted ? (
        <span key={slot.which} role="listitem" className="mm-ineq-chip" data-boundary-point={slot.which}>
          <span className="mm-ineq-chip-dot" style={{ background: color }} aria-hidden="true" />
          {slot.name} {formatPoint(slot.x, slot.y)}
          <button type="button" className="mm-ineq-chip-remove" onClick={() => onRemove(slot.which)} aria-label={`Remove ${slot.name.toLowerCase()} ${formatPoint(slot.x, slot.y)}`}>×</button>
        </span>
      ) : (
        <span key={slot.which} role="listitem" className="mm-ineq-chip" data-empty="true" data-next={nextSlot === slot.which ? 'true' : undefined} data-boundary-point={slot.which}>
          {slot.name}: {nextSlot === slot.which ? 'tap the graph' : 'next'}
        </span>
      )))}
    </div>
  );
}

/*
 * HOW THE BOUNDARY IS BUILT. The plotted coordinates are never typed: they
 * exist only where the student tapped (studentBoundaryLineFromEntry requires
 * both points plotted), so they show as chips, not boxes. Slope and intercept
 * are typed — they are the student's plan, checked against their own points.
 */
export function BoundaryStepFields({ entry, index, onPatch, onRemovePoint }) {
  const method = entry.method || 'points';
  return (
    <>
      <p className="mm-ineq-instruction">{boundaryInstruction(method)}</p>
      <label className="mm-ineq-field">
        Build it with
        <select className="mm-ineq-select" value={method} onChange={(e) => onPatch({ method: e.target.value })}>
          {CONSTRUCTION_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      {method === 'slopeIntercept' ? (
        <div className="mm-ineq-field-row">
          <label className="mm-ineq-field">Slope (m)<input className="mm-ineq-input" type="text" inputMode="text" placeholder="e.g. -2/3" value={entry.slope} onChange={(e) => onPatch({ slope: e.target.value })} /></label>
          <label className="mm-ineq-field">y-intercept (b)<input className="mm-ineq-input" type="number" inputMode="decimal" value={entry.intercept} onChange={(e) => onPatch({ intercept: e.target.value })} /></label>
        </div>
      ) : null}
      {method === 'vertical' || method === 'horizontal' ? (
        <label className="mm-ineq-field">
          {method === 'vertical' ? 'x =' : 'y ='}
          <input className="mm-ineq-input" data-size="narrow" type="number" inputMode="decimal" value={entry.constant} onChange={(e) => onPatch({ constant: e.target.value })} />
        </label>
      ) : (
        <BoundaryPointChips entry={entry} color={constraintColor(index)} method={method} onRemove={onRemovePoint} />
      )}
    </>
  );
}

/** A constraint: its colour, its inequality, its progress, its eye — and, open, its steps. */
export function ConstraintCard({
  index, label, expanded, state, progress, statusText, statusTone, visible, disabled = false,
  onToggle, onToggleVisible, children,
}) {
  return (
    <section className="mm-ineq-card" data-active={expanded ? 'true' : 'false'} data-state={state} data-constraint-index={index}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button type="button" className="mm-ineq-card-header" aria-expanded={expanded} disabled={disabled} onClick={onToggle}>
          <span className="mm-ineq-swatch" style={{ background: constraintColor(index) }} aria-hidden="true" />
          <span className="mm-ineq-card-title">
            <span className="mm-ineq-card-name">Constraint {index + 1}</span>
            <span className="mm-ineq-math">{label}</span>
          </span>
          <span className="mm-ineq-card-status" data-tone={statusTone || undefined}>
            {progress.length ? (
              <span className="mm-ineq-progress" aria-hidden="true">
                {progress.map((segment) => <span key={segment.step} data-state={segment.state || undefined} />)}
              </span>
            ) : null}
            <span className="mm-ineq-card-status-text">{statusText}</span>
          </span>
        </button>
        <button
          type="button"
          className="mm-ineq-visibility"
          aria-pressed={visible}
          aria-label={`${visible ? 'Hide' : 'Show'} constraint ${index + 1} on the graph`}
          title={visible ? 'Hide on the graph' : 'Show on the graph'}
          onClick={onToggleVisible}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {children}
    </section>
  );
}

/** A step of the open constraint that is not the one being worked on: done, open or locked. */
export function StepRow({ step, label, order, state, summary, doneMark, doneTone, verdictsShown, constraintNumber, onOpen }) {
  return (
    <li className="mm-ineq-step-row" data-build-step={step} data-step-state={state}>
      <span className="mm-ineq-step-mark" data-tone={state === 'done' ? doneTone : undefined} aria-hidden="true">
        {state === 'done' ? doneMark : order}
      </span>
      <span className="mm-ineq-step-name">{label}</span>
      <span className="mm-ineq-step-summary">
        {summary}
        <span className="mm-ineq-visually-hidden">{state === 'done' ? (verdictsShown ? ' — checked' : ' — recorded') : state === 'locked' ? ' — opens after the step before it' : ''}</span>
      </span>
      {state === 'done' || state === 'open' ? (
        <button type="button" className="mm-ineq-link" onClick={onOpen}>
          {state === 'done' ? 'Change' : 'Open'}
          <span className="mm-ineq-visually-hidden"> {label.toLowerCase()} for constraint {constraintNumber}</span>
        </button>
      ) : null}
    </li>
  );
}

/** Combine, or a reasoning step: one row until it is the step being worked on. */
export function PhaseCard({ phase, title, state, summary = '', doneMark, doneTone, onOpen, children }) {
  const expanded = state === 'current';
  return (
    <section className="mm-ineq-card" data-active={expanded ? 'true' : 'false'} data-state={state} data-phase={phase}>
      {expanded ? (
        <div className="mm-ineq-step-body" style={{ border: 0, background: 'transparent' }} data-step-body={phase}>
          <StepHeading label={title} />
          {children}
        </div>
      ) : (
        <div className="mm-ineq-card-row">
          <span className="mm-ineq-step-mark" data-tone={state === 'done' ? doneTone : undefined} aria-hidden="true">{state === 'done' ? doneMark : state === 'locked' ? '·' : '›'}</span>
          <span className="mm-ineq-card-title">
            <span className="mm-ineq-step-name" style={{ color: state === 'locked' ? 'var(--mm-text-subtle)' : 'var(--mm-text-strong)' }}>{title}</span>
            {summary ? <span className="mm-ineq-step-summary">{summary}</span> : null}
          </span>
          {state !== 'locked' ? (
            <button type="button" className="mm-ineq-link" onClick={onOpen}>
              {state === 'done' ? 'Change' : 'Open'}<span className="mm-ineq-visually-hidden"> {title.toLowerCase()}</span>
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** The questions about one test point: each inequality, the system, and (on a boundary) inclusion. */
export function TestPointQuestions({ point, response, setResponse, count, inequalityLabels, showBoundaryProbe }) {
  return (
    <div style={{ display: 'grid', gap: 8 }} data-test-point={formatPoint(point[0], point[1])}>
      {Array.from({ length: count }).map((_, index) => (
        <YesNoQuestion
          key={index}
          name={`inequality-${index + 1}`}
          legend={<>Does the point satisfy inequality {index + 1}? <span className="mm-ineq-math" style={{ fontSize: 'inherit' }}>{inequalityLabels[index] || ''}</span></>}
          value={response.perInequality[index] || ''}
          onChange={(value) => setResponse((current) => ({ ...current, perInequality: current.perInequality.map((entry, i) => (i === index ? value : entry)) }))}
        />
      ))}
      <YesNoQuestion
        name="system"
        legend="Is the point a solution to the entire system?"
        value={response.overall}
        onChange={(value) => setResponse((current) => ({ ...current, overall: value }))}
      />
      {showBoundaryProbe ? (
        <>
          <YesNoQuestion
            name="on-boundary"
            legend="Does this point lie exactly on one of the boundary lines?"
            value={response.onBoundary}
            onChange={(value) => setResponse((current) => ({ ...current, onBoundary: value }))}
          />
          <YesNoQuestion
            name="boundary-included"
            legend="Since it is on that boundary, is it included in the solution region?"
            yesLabel="Yes — the boundary is solid there"
            noLabel="No — the boundary is dashed there"
            value={response.boundaryIncluded}
            onChange={(value) => setResponse((current) => ({ ...current, boundaryIncluded: value }))}
          />
        </>
      ) : null}
    </div>
  );
}

/** The corners the student marked, each with its inclusion question and the line its last Check left. */
export function VertexList({ vertices, reports, onAnswer, onRemove }) {
  return vertices.map((vertex, index) => {
    const letter = String.fromCharCode(65 + index);
    return (
      <div key={index} className="mm-ineq-vertex" data-vertex={index}>
        <div className="mm-ineq-vertex-head">
          <span>Vertex {letter} = {formatPoint(Number(Number(vertex.x).toFixed(3)), Number(Number(vertex.y).toFixed(3)))}</span>
          <button type="button" className="mm-ineq-chip-remove" aria-label={`Remove vertex ${letter}`} onClick={() => onRemove(index)}>×</button>
        </div>
        <YesNoQuestion
          name={`vertex-${index}`}
          legend="Is this vertex included in the solution set?"
          value={vertex.includedAnswer}
          onChange={(value) => onAnswer(index, value)}
        />
        {reports[index] ? <StepFeedback tone={reports[index].tone}>{reports[index].text}</StepFeedback> : null}
      </div>
    );
  });
}

/** One constraint written as the student writes it: a·x + b·y (relation) c. */
export function ModelingFields({ entries, variables, onChange }) {
  return entries.map((entry, index) => (
    <fieldset key={index} className="mm-ineq-choices" style={{ display: 'grid', gap: 6 }}>
      <legend>Constraint {index + 1}</legend>
      <div className="mm-ineq-modeling-row">
        <input className="mm-ineq-input" type="number" inputMode="decimal" aria-label={`Constraint ${index + 1}: coefficient of ${variables[0].symbol}`} value={entry.coeffA} onChange={(e) => onChange(index, 'coeffA', e.target.value)} />
        <span>{variables[0].symbol} +</span>
        <input className="mm-ineq-input" type="number" inputMode="decimal" aria-label={`Constraint ${index + 1}: coefficient of ${variables[1].symbol}`} value={entry.coeffB} onChange={(e) => onChange(index, 'coeffB', e.target.value)} />
        <span>{variables[1].symbol}</span>
        <select className="mm-ineq-select" aria-label={`Constraint ${index + 1}: relation`} value={entry.relation} onChange={(e) => onChange(index, 'relation', e.target.value)}>
          <option value={UNANSWERED}>Choose…</option>
          <option value=">=">≥</option><option value=">">&gt;</option><option value="<=">≤</option><option value="<">&lt;</option>
        </select>
        <input className="mm-ineq-input" type="number" inputMode="decimal" aria-label={`Constraint ${index + 1}: constant`} value={entry.constant} onChange={(e) => onChange(index, 'constant', e.target.value)} />
      </div>
    </fieldset>
  ));
}

/*
 * EVERYTHING THE STUDENT BUILT, DRAWN ON THE PLANE.
 *
 * Each constraint's shaded half-plane and its line in its own colour — the
 * one being built at full strength, the others quieter — and, once combined,
 * the overlap the student's own constraints make, hatched in the theme's ink
 * (never green: on a DOL a green region read as "correct"). It has no outline:
 * its edges are the student's own boundaries, drawn solid or dashed as built,
 * and an outline showed through the gaps of a dashed edge as a solid line. The
 * labels of points use the theme's graph-label colour: the plane's own point
 * labels are a fixed dark ink that disappears on the dark graph.
 */
export function InequalityGraphLayers({
  sx, sy, plotClip, build, effectiveLines, buildConfig, workingConstraints, bounds,
  combined, studentPolygon, emphasised, hatchId, graphPoints, graphPointRoles,
}) {
  return (
    <>
      <g clipPath={plotClip}>
        {build.map((entry, index) => {
          if (!buildConfig.shading || entry.visible === false || !entry.shadePoint) return null;
          const line = effectiveLines[index];
          if (!line) return null;
          const side = sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]);
          if (side === 0) return null;
          const shaded = feasibleRegionPolygon([boundaryWithChosenSide(line, side, false)], bounds);
          if (shaded.length < 3) return null;
          return (
            <polygon key={`shade${index}`} points={shaded.map(([px, py]) => `${sx(px)},${sy(py)}`).join(' ')}
              fill={constraintColor(index)} fillOpacity={emphasised(index) ? 0.16 : 0.08} stroke="none" />
          );
        })}
        {combined && studentPolygon.length >= 3 ? (
          <>
            <defs>
              <pattern id={hatchId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="9" style={{ stroke: 'var(--mm-text-strong)' }} strokeWidth="2.2" strokeOpacity="0.42" />
              </pattern>
            </defs>
            <polygon data-overlap="true" points={studentPolygon.map(([px, py]) => `${sx(px)},${sy(py)}`).join(' ')} fill={`url(#${hatchId})`} stroke="none" />
          </>
        ) : null}
        {build.map((entry, index) => {
          if (entry.visible === false) return null;
          const line = effectiveLines[index];
          if (!line) return null;
          const [p1, p2] = lineSegmentForBounds(line, bounds);
          const renderedStyle = buildConfig.lineStyle
            ? entry.style
            : (String(workingConstraints[index]?.relation || '>=').includes('=') ? 'solid' : 'dashed');
          return (
            <line key={`line${index}`} data-constraint-line={index} x1={sx(p1[0])} y1={sy(p1[1])} x2={sx(p2[0])} y2={sy(p2[1])}
              stroke={constraintColor(index)} strokeWidth={emphasised(index) ? 3.5 : 2.5}
              strokeDasharray={renderedStyle === 'dashed' ? '10 6' : renderedStyle === 'solid' ? undefined : '3 5'}
              strokeOpacity={renderedStyle ? (emphasised(index) ? 1 : 0.6) : 0.55}
            />
          );
        })}
      </g>
      {graphPoints.map((point, index) => {
        const role = graphPointRoles[index];
        if (!role?.label) return null;
        return (
          <text key={`label${index}`} x={sx(point.x) + 10} y={sy(point.y) - 10} fontSize="12" fontWeight="800"
            style={{ fill: 'var(--mm-graph-label)', paintOrder: 'stroke', stroke: 'var(--mm-graph-bg)', strokeWidth: 3 }} pointerEvents="none">
            {role.label}
          </text>
        );
      })}
    </>
  );
}

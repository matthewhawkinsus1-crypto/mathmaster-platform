import MathDisplay from './MathDisplay';
import { equationToLatex } from './algebraAstEngine';
import { SR_ONLY_STYLE } from './ui/srOnly.js';

/*
 * A student's committed Step Algebra steps as they would appear on a board:
 * what the move was ("Factored 15 from the right side"), then the equation
 * before → after, typeset from the stored expressions by the same classroom
 * LaTeX the workspace uses. Never MathJS text, never a decimal for a fraction.
 *
 * A screen reader hears the same: the move, then "Before:" and "After:" with
 * each equation spoken by MathDisplay from its own value. The equations used to
 * carry the description as their label, so a student heard "Before: Subtracted
 * 3 from both sides → After: Subtracted 3 from both sides" and never the math
 * (pass 3, A11Y-5).
 */
const equationLatex = (equation) => {
  try { return equationToLatex(equation); } catch { return `${equation?.left ?? ''} = ${equation?.right ?? ''}`; }
};

export function WorkStepDescription({ step }) {
  const parts = Array.isArray(step?.parts) && step.parts.length ? step.parts : [step?.description || ''];
  return (
    <strong className="algebra-work-step-description">
      {parts.map((part, index) => (
        typeof part === 'string'
          ? <span key={index}>{part}</span>
          : <MathDisplay key={index} value={part.latex} format="latex" inline style={{ fontSize: 'inherit' }} />
      ))}
    </strong>
  );
}

export default function AlgebraWorkSteps({ steps = [], compact = false }) {
  if (!steps.length) return null;
  return (
    <ol className={`algebra-work-steps${compact ? ' is-compact' : ''}`} style={{ margin: 0, paddingLeft: 20 }}>
      {steps.map((step, index) => (
        <li key={`${index}-${step.kind}`} style={{ padding: '8px 0', borderBottom: index === steps.length - 1 ? 'none' : '1px solid var(--mm-tint-border)' }}>
          <WorkStepDescription step={step} />
          <div style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginTop: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span style={SR_ONLY_STYLE}>Before: </span>
            <MathDisplay value={equationLatex(step.before)} format="latex" inline style={{ fontSize: 'calc(14 * var(--mm-px))' }} />
            <span aria-hidden="true">→</span>
            <span style={SR_ONLY_STYLE}>After: </span>
            <MathDisplay value={equationLatex(step.after)} format="latex" inline style={{ fontSize: 'calc(14 * var(--mm-px))' }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

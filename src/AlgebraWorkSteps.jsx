import MathDisplay from './MathDisplay';
import { equationToLatex } from './algebraAstEngine';

/*
 * A student's committed Step Algebra steps as they would appear on a board:
 * what the move was ("Factored 15 from the right side"), then the equation
 * before → after, typeset from the stored expressions by the same classroom
 * LaTeX the workspace uses. Never MathJS text, never a decimal for a fraction.
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
          : <MathDisplay key={index} value={part.latex} format="latex" inline style={{ fontSize: 'inherit' }} ariaLabel={step?.description} />
      ))}
    </strong>
  );
}

export default function AlgebraWorkSteps({ steps = [], compact = false }) {
  if (!steps.length) return null;
  return (
    <ol className={`algebra-work-steps${compact ? ' is-compact' : ''}`} style={{ margin: 0, paddingLeft: 20 }}>
      {steps.map((step, index) => (
        <li key={`${index}-${step.kind}`} style={{ padding: '8px 0', borderBottom: index === steps.length - 1 ? 'none' : '1px solid #edf1f6' }}>
          <WorkStepDescription step={step} />
          <div style={{ color: '#5f6b7a', fontSize: 13, marginTop: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <MathDisplay value={equationLatex(step.before)} format="latex" inline ariaLabel={`Before: ${step.description}`} style={{ fontSize: 14 }} />
            <span aria-hidden="true">→</span>
            <MathDisplay value={equationLatex(step.after)} format="latex" inline ariaLabel={`After: ${step.description}`} style={{ fontSize: 14 }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

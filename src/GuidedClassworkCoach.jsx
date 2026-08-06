import { useMemo } from 'react';
import useLocalDraftState from './useLocalDraftState';

const defaultSteps = (question) => {
  if (question?.type === 'functionInvestigation' || question?.type === 'functionGraph') {
    return [
      'Read the equation and identify the center, vertex, or key point.',
      'Choose appropriate x-values and place the five required graph locations.',
      'Check the plotted points, then draw and connect the function.',
      'Place the correct end-behavior symbol at every graph end.',
      'Complete each requested intercept, extrema, domain, range, and interval response.',
    ];
  }
  if (question?.type === 'stepAlgebra') {
    return [
      'Identify the term that prevents the target variable from being isolated.',
      'Choose the inverse operation and apply it to both sides.',
      'Mark only the zero pair or identity pair that actually cancels.',
      'Simplify the opposite side in the response field.',
      'Continue until the requested variable or form is isolated.',
    ];
  }
  if (question?.type === 'table') return ['Read the function rule.', 'Substitute each x-value.', 'Enter and check every missing table value.'];
  return ['Read the prompt and identify what must be entered.', 'Complete the current response field.', 'Check the response and revise any named incorrect part.'];
};

export default function GuidedClassworkCoach({ question, draftKey, enabled = false, oneStepReveal = false, disabled = false }) {
  const steps = useMemo(() => (Array.isArray(question?.guidedSteps) && question.guidedSteps.length ? question.guidedSteps : defaultSteps(question)), [question]);
  const [stepIndex, setStepIndex] = useLocalDraftState(draftKey ? `${draftKey}:guided-step` : null, 0);
  if (!enabled || !steps.length) return null;
  const safeIndex = Math.max(0, Math.min(steps.length - 1, Number(stepIndex) || 0));
  const visibleSteps = oneStepReveal ? [steps[safeIndex]] : steps.slice(0, safeIndex + 1);
  return (
    <aside style={{ maxWidth: '860px', margin: '0 auto 18px', padding: '15px 17px', borderRadius: '12px', border: '2px solid #8ab4f8', background: '#f8fbff', textAlign: 'left' }}>
      <div style={{ color: '#174ea6', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '12px' }}>Guided notes / classwork</div>
      <h3 style={{ margin: '6px 0 9px', color: '#202124' }}>Step {safeIndex + 1} of {steps.length}</h3>
      <ol style={{ margin: '0 0 12px', paddingLeft: '23px', lineHeight: 1.55 }}>
        {visibleSteps.map((step, index) => <li key={`${index}-${step}`} style={{ marginBottom: '5px' }}>{step}</li>)}
      </ol>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled || safeIndex === 0} onClick={() => setStepIndex(Math.max(0, safeIndex - 1))} style={{ padding: '8px 12px', border: '1px solid #aac3e8', borderRadius: '8px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>Previous instruction</button>
        <button type="button" disabled={disabled || safeIndex >= steps.length - 1} onClick={() => setStepIndex(Math.min(steps.length - 1, safeIndex + 1))} style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', background: safeIndex >= steps.length - 1 ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 'bold' }}>{safeIndex >= steps.length - 1 ? 'All instructions revealed' : 'I completed this step'}</button>
      </div>
    </aside>
  );
}

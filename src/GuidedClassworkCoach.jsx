import { useEffect, useMemo } from 'react';
import useLocalDraftState from './useLocalDraftState';
import { resolveGuidedNotes } from './guidedNotes';

export default function GuidedClassworkCoach({
  question,
  draftKey,
  enabled = false,
  mode = 'automatic',
  activeStageId = null,
  workflowProgress = null,
  disabled = false,
}) {
  const steps = useMemo(() => resolveGuidedNotes(question, { mode }), [question, mode]);
  const [manualStepIndex, setManualStepIndex] = useLocalDraftState(draftKey ? `${draftKey}:guided-step` : null, 0);
  const [collapsed, setCollapsed] = useLocalDraftState(draftKey ? `${draftKey}:guided-collapsed` : null, true);

  const synchronizedIndex = activeStageId
    ? steps.findIndex((step) => step.stageId === activeStageId)
    : -1;
  const safeManualIndex = Math.max(0, Math.min(steps.length - 1, Number(manualStepIndex) || 0));
  const safeIndex = synchronizedIndex >= 0 ? synchronizedIndex : safeManualIndex;
  const currentStep = steps[safeIndex] || null;
  const workflowComplete = Boolean(workflowProgress?.complete);

  useEffect(() => {
    if (workflowComplete) setCollapsed(true);
  }, [workflowComplete, setCollapsed]);

  if (!enabled || !steps.length || !currentStep) return null;

  const synchronized = synchronizedIndex >= 0;
  const headerLabel = workflowComplete
    ? '✓ Guided Notes complete'
    : `Need help? Guided Notes · Step ${safeIndex + 1} of ${steps.length}`;

  return (
    <aside
      className={`mathmaster-guided-notes ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
      style={{ maxWidth: '860px', margin: '0 auto 12px', borderRadius: '11px', border: '1px solid #8ab4f8', background: '#f8fbff', textAlign: 'left', overflow: 'hidden' }}
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        style={{ width: '100%', minHeight: '46px', padding: '10px 13px', border: 0, background: workflowComplete ? '#e6f4ea' : '#f8fbff', color: workflowComplete ? '#137333' : '#174ea6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', cursor: 'pointer', textAlign: 'left', fontWeight: 900 }}
      >
        <span>
          <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{headerLabel}</span>
          <span style={{ display: 'block', marginTop: '2px', color: '#202124', fontSize: '14px' }}>{currentStep.title}</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: '18px' }}>{collapsed ? '▾' : '▴'}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: '12px 14px 13px' }}>
          <p style={{ margin: 0, color: '#3c4043', lineHeight: 1.55, fontSize: '14px' }}>{currentStep.instruction}</p>
          {synchronized ? (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 8px', borderRadius: 999, background: '#e8f0fe', color: '#174ea6', fontSize: '11px', fontWeight: 900 }}>Follows your current math step</span>
              {workflowProgress && <span style={{ color: '#5f6368', fontSize: '11px' }}>{workflowProgress.answered || 0} of {workflowProgress.total || steps.length} workflow steps complete</span>}
            </div>
          ) : steps.length > 1 ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '11px' }}>
              <button type="button" disabled={disabled || safeIndex === 0} onClick={() => setManualStepIndex(Math.max(0, safeIndex - 1))} style={{ padding: '7px 11px', border: '1px solid #aac3e8', borderRadius: '8px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>Previous note</button>
              <button type="button" disabled={disabled || safeIndex >= steps.length - 1} onClick={() => setManualStepIndex(Math.min(steps.length - 1, safeIndex + 1))} style={{ padding: '7px 11px', border: 'none', borderRadius: '8px', background: safeIndex >= steps.length - 1 ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 'bold' }}>{safeIndex >= steps.length - 1 ? 'All guidance viewed' : 'Next note'}</button>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}

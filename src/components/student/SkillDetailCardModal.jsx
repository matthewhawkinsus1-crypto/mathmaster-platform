import React from 'react';
import { getStrandForTEKS, MASTERY_STATUS_COLORS } from '../../platform/mastery/strandConfig.js';
import { teksSkillId } from '../../platform/path/skillGraph.js';
import PracticeAsMenu from './PracticeAsMenu.jsx';

export const SkillDetailCardModal = ({
  teksCode,
  masteryProfile,
  onClose,
  onStartPractice,
  // Present only where the CCMR context has been loaded. The menu shows
  // nothing at all where no legitimate assessment alignment exists, so a
  // skill the SAT does not test simply has no extra buttons.
  pathOptions = null,
  assessmentContext = null,
  onPracticeAs = null,
}) => {
  if (!teksCode) return null;
  const strand = getStrandForTEKS(teksCode);
  const mastery = masteryProfile?.mastery || { estimate: null, status: 'Not Enough Evidence', confidence: 'Low' };
  const signals = masteryProfile?.signals || { retention: 'stable', breadth: 'developing' };
  const dimensions = masteryProfile?.dimensions || { eligibleGradeLevelEvents: 0, dokRepresented: [], familiesRepresented: [] };
  const statusColor = MASTERY_STATUS_COLORS[mastery.status] || '#5f6368';

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(0,0,0,.5)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="skill-detail-title" style={{ width: 'min(480px, 100%)', padding: '24px', borderRadius: '13px', background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,.28)', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start' }}>
          <div><div style={{ color: strand.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{strand.title}</div><h2 id="skill-detail-title" style={{ margin: '4px 0 0' }}>TEKS {teksCode}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close skill details" style={{ border: 0, background: 'transparent', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        {signals.retention === 'concern' && <div style={{ marginTop: '16px', padding: '11px 13px', borderRadius: '7px', background: '#fce8e6', color: '#a50e0e' }}><strong>Retention check recommended.</strong> Recent evidence suggests this skill should be verified again.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '18px' }}>
          <div style={{ padding: '13px', borderRadius: '8px', background: '#f8f9fa' }}><div style={{ fontSize: '11px', color: '#5f6368' }}>Mastery estimate</div><div style={{ fontSize: '21px', fontWeight: 900, color: statusColor }}>{mastery.estimate == null ? '—' : `${mastery.estimate}%`}</div><div style={{ fontSize: '11px', color: '#5f6368' }}>{mastery.status}</div></div>
          <div style={{ padding: '13px', borderRadius: '8px', background: '#f8f9fa' }}><div style={{ fontSize: '11px', color: '#5f6368' }}>Observed accuracy</div><div style={{ fontSize: '21px', fontWeight: 900 }}>{mastery.observedPerformance == null ? '—' : `${mastery.observedPerformance}%`}</div><div style={{ fontSize: '11px', color: '#5f6368' }}>{dimensions.eligibleGradeLevelEvents || 0} evidence event(s)</div></div>
        </div>
        <div style={{ margin: '18px 0', color: '#3c4043', fontSize: '13px', lineHeight: 1.7 }}>
          <div><strong>DOK demonstrated:</strong> {dimensions.dokRepresented?.length ? dimensions.dokRepresented.join(', ') : 'Not enough evidence'}</div>
          <div><strong>Question families:</strong> {dimensions.familiesRepresented?.length || 0}</div>
          <div><strong>Confidence:</strong> {mastery.confidence || 'Low'}</div>
        </div>
        <button type="button" onClick={() => onStartPractice?.(teksCode, { sessionKind: 'practice', requiredQuestions: 5 })} style={{ width: '100%', padding: '12px 16px', border: 0, borderRadius: '8px', background: '#1a73e8', color: '#fff', fontSize: '15px', fontWeight: 900, cursor: 'pointer' }}>Start Quick Practice · 5 questions</button>
        {assessmentContext && onPracticeAs && (
          <PracticeAsMenu
            skillId={teksSkillId(teksCode)}
            pathOptions={pathOptions}
            assessmentEvidence={assessmentContext.assessmentEvidence}
            directIndex={assessmentContext.directIndex}
            goals={assessmentContext.goals}
            teacherPriorities={assessmentContext.teacherPriorities}
            onChoose={(choice) => { onClose?.(); onPracticeAs(choice); }}
          />
        )}
      </section>
    </div>
  );
};

export default SkillDetailCardModal;

import React from 'react';
import { getStrandForTEKS, MASTERY_STATUS_COLORS } from '../../platform/mastery/strandConfig.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { teksSkillId } from '../../platform/path/skillGraph.js';
import { statusForSkill } from '../../platform/path/pathMap.js';
import { STATUS } from '../../platform/path/recommendationEngine.js';
import PracticeAsMenu from './PracticeAsMenu.jsx';
import { describeCoursePathPass } from '../../platform/path/pathPassPresentation.js';
import StandardBadge from '../common/StandardBadge.jsx';

export const SkillDetailCardModal = ({
  teksCode,
  masteryProfile,
  pathPassProgress = null,
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
  // The wheel makes every segment clickable, which is right — a student should
  // be able to look at any skill. But looking is not the same as starting, and
  // this modal used to offer "Start Quick Practice" on a skill the engine had
  // LOCKED behind a prerequisite. The map's own verdict decides the button.
  const pathStatus = pathOptions ? statusForSkill(pathOptions, teksSkillId(teksCode)) : null;
  const blocked = [STATUS.LOCKED, STATUS.FUTURE].includes(pathStatus) ? pathStatus : null;
  const strand = getStrandForTEKS(teksCode);
  const mastery = masteryProfile?.mastery || { estimate: null, status: 'Not Enough Evidence', confidence: 'Low' };
  const signals = masteryProfile?.signals || { retention: 'stable', breadth: 'developing' };
  const dimensions = masteryProfile?.dimensions || { eligibleGradeLevelEvents: 0, dokRepresented: [], familiesRepresented: [] };
  const statusColor = MASTERY_STATUS_COLORS[mastery.status] || '#5f6368';
  const pass = describeCoursePathPass(pathPassProgress || {}, { mastered: String(mastery.status || '').toLowerCase() === 'mastered' });

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(0,0,0,.5)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="skill-detail-title" style={{ width: 'min(480px, 100%)', padding: '24px', borderRadius: '13px', background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,.28)', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: strand.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{strand.title}</div>
            <h2 id="skill-detail-title" style={{ margin: '4px 0 0', fontSize: '20px' }}>{studentLabelForTeks(teksCode)}</h2>
            <StandardBadge code={teksCode} showName={false} style={{ marginTop: 8 }} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close skill details" style={{ border: 0, background: 'transparent', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>
        {signals.retention === 'concern' && <div style={{ marginTop: '16px', padding: '11px 13px', borderRadius: '7px', background: '#fce8e6', color: '#a50e0e' }}><strong>Retention check recommended.</strong> Recent evidence suggests this skill should be verified again.</div>}
        <div
          role="status"
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: '9px',
            border: `2px solid ${pass.tone}`,
            background: pass.background,
            color: pass.tone,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.045em' }}>
            {pass.completedLabel || pass.levelLabel}
          </div>
          <div style={{ marginTop: '3px', fontSize: '13px', fontWeight: 900 }}>
            {pass.nextLabel}
          </div>
          {pass.hasCompletedPass && String(mastery.status || '').toLowerCase() !== 'mastered' && (
            <div style={{ marginTop: '4px', color: '#3c4043', fontSize: '11.5px', lineHeight: 1.45 }}>
              This Path pass is complete. Mastery is a stronger claim and can require broader or higher-level evidence.
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '18px' }}>
          <div style={{ padding: '13px', borderRadius: '8px', background: '#f8f9fa' }}><div style={{ fontSize: '11px', color: '#5f6368' }}>Mastery estimate</div><div style={{ fontSize: '21px', fontWeight: 900, color: statusColor }}>{mastery.estimate == null ? '—' : `${mastery.estimate}%`}</div><div style={{ fontSize: '11px', color: '#5f6368' }}>{mastery.status}</div></div>
          <div style={{ padding: '13px', borderRadius: '8px', background: '#f8f9fa' }}><div style={{ fontSize: '11px', color: '#5f6368' }}>Observed accuracy</div><div style={{ fontSize: '21px', fontWeight: 900 }}>{mastery.observedPerformance == null ? '—' : `${mastery.observedPerformance}%`}</div><div style={{ fontSize: '11px', color: '#5f6368' }}>{dimensions.eligibleGradeLevelEvents || 0} evidence event(s)</div></div>
        </div>
        <div style={{ margin: '18px 0', color: '#3c4043', fontSize: '13px', lineHeight: 1.7 }}>
          {/* DOK levels and family counts describe how the platform indexes a
              question, not what the student has shown. What a student can act
              on is the RANGE of the evidence and how independent it was. */}
          <div>
            <strong>Range of work:</strong>{' '}
            {dimensions.dokRepresented?.length >= 3 ? 'You have shown this several different ways.'
              : dimensions.dokRepresented?.length === 2 ? 'You have shown this two different ways.'
                : dimensions.dokRepresented?.length === 1 ? 'So far all your evidence is one kind of question.'
                  : 'Not enough evidence yet.'}
          </div>
          <div><strong>Confidence:</strong> {mastery.confidence || 'Low'}</div>
        </div>
        {blocked ? (
          <div style={{ padding: '13px 15px', borderRadius: '8px', background: blocked === STATUS.FUTURE ? '#f6f9fe' : '#fef7e0', border: `1px ${blocked === STATUS.FUTURE ? 'dashed #a8c7fa' : 'solid #f0d78c'}`, color: blocked === STATUS.FUTURE ? '#174ea6' : '#7a4f00', fontSize: '13px', lineHeight: 1.6 }}>
            {blocked === STATUS.FUTURE
              ? 'Your class reaches this later in the course, so it is not open yet. Nothing is wrong — have a look at your path for what is open now.'
              : 'This one builds on an earlier skill. Your path shows which skill to strengthen first, and starting there is what opens this.'}
          </div>
        ) : (
          <button type="button" onClick={() => onStartPractice?.(teksCode, { sessionKind: 'practice', requiredQuestions: 5 })} style={{ width: '100%', padding: '12px 16px', border: 0, borderRadius: '8px', background: '#1a73e8', color: '#fff', fontSize: '15px', fontWeight: 900, cursor: 'pointer' }}>{pass.buttonLabel} · 5 questions</button>
        )}
        {!blocked && assessmentContext && onPracticeAs && (
          <PracticeAsMenu
            skillId={teksSkillId(teksCode)}
            pathOptions={pathOptions}
            assessmentEvidence={assessmentContext.assessmentEvidence}
            directIndex={assessmentContext.directIndex}
            coverage={assessmentContext.coverage}
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

import React from 'react';
import { getStrandForTEKS, MASTERY_STATUS_COLORS } from '../../platform/mastery/strandConfig.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { teksSkillId } from '../../platform/path/skillGraph.js';
import { statusForSkill } from '../../platform/path/pathMap.js';
import { STATUS } from '../../platform/path/recommendationEngine.js';
import PracticeAsMenu from './PracticeAsMenu.jsx';
import { describeCoursePathPass } from '../../platform/path/pathPassPresentation.js';
import StandardBadge from '../common/StandardBadge.jsx';
import Dialog from '../../ui/Dialog.jsx';
import { toneTextColor } from '../../theme/themeColorRoles.js';
import { masteryChecklist } from '../../../functions/shared/masteryRule.mjs';

const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 };

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
  const statusColor = MASTERY_STATUS_COLORS[mastery.status] || 'var(--mm-text-muted)';
  // The shared rule the server trigger uses — the same verdict as the wheel,
  // the Path map and Recommended, and the checklist of what is still missing.
  const checklist = masteryChecklist(masteryProfile || {});
  const pass = describeCoursePathPass(pathPassProgress || {}, { mastered: checklist.mastered });

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(0,0,0,.5)' }}>
      <Dialog as="section" onClose={onClose} aria-labelledby="skill-detail-title" style={{ width: 'min(480px, 100%)', padding: '24px', borderRadius: '13px', background: 'var(--mm-surface)', boxShadow: '0 20px 60px rgba(0,0,0,.28)', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: strand.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{strand.title}</div>
            <h2 id="skill-detail-title" style={{ margin: '4px 0 0', fontSize: '20px' }}>{studentLabelForTeks(teksCode)}</h2>
            <StandardBadge code={teksCode} showName={false} style={{ marginTop: 8 }} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close skill details" style={{ border: 0, background: 'transparent', fontSize: '20px', cursor: 'pointer', minWidth: 44, minHeight: 44, flexShrink: 0 }}>✕</button>
        </div>
        {signals.retention === 'concern' && <div style={{ marginTop: '16px', padding: '11px 13px', borderRadius: '7px', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }}><strong>Retention check recommended.</strong> Recent evidence suggests this skill should be verified again.</div>}
        <div
          role="status"
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: '9px',
            border: `2px solid ${pass.tone}`,
            background: pass.background,
            color: toneTextColor(pass.tone),
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.045em' }}>
            {pass.completedLabel || pass.levelLabel}
          </div>
          <div style={{ marginTop: '3px', fontSize: '13px', fontWeight: 900 }}>
            {pass.nextLabel}
          </div>
          {pass.hasCompletedPass && !checklist.mastered && (
            <div style={{ marginTop: '4px', color: 'var(--mm-text)', fontSize: '11.5px', lineHeight: 1.45 }}>
              Levels are how deep your practice goes. Mastered is earned separately, from your answers — see what is left below.
            </div>
          )}
        </div>
        {/* ONE number. "Mastery estimate" and "Observed accuracy" were the same
            value under two names (the server writes both from one estimate). */}
        <div style={{ marginTop: '18px', padding: '13px', borderRadius: '8px', background: 'var(--mm-surface-sunken)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--mm-text-muted)' }}>Your score on this skill</div>
            <div style={{ fontSize: '21px', fontWeight: 900, color: statusColor }}>{mastery.estimate == null ? '—' : `${Math.round(Number(mastery.estimate))}%`}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div data-mastery-status style={{ fontSize: '14px', fontWeight: 900, color: statusColor }}>{checklist.status}</div>
            <div style={{ fontSize: '11px', color: 'var(--mm-text-muted)' }}>{dimensions.eligibleGradeLevelEvents || 0} question{Number(dimensions.eligibleGradeLevelEvents) === 1 ? '' : 's'} counted · confidence {mastery.confidence || 'Low'}</div>
          </div>
        </div>
        <section aria-labelledby="skill-detail-left" style={{ margin: '16px 0 18px' }}>
          <h3 id="skill-detail-left" style={{ margin: '0 0 8px', fontSize: '14px', color: 'var(--mm-text-strong)' }}>
            {checklist.mastered ? 'You have mastered this skill' : "What's left to master this"}
          </h3>
          <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {checklist.items.map((item) => (
              <li key={item.key} data-mastery-check={item.key} data-met={item.met ? 'true' : 'false'} style={{ listStyle: 'none', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '13px', lineHeight: 1.45, color: item.met ? 'var(--mm-success-text)' : 'var(--mm-text)' }}>
                <span aria-hidden="true" style={{ fontWeight: 900, minWidth: 16 }}>{item.met ? '✓' : '○'}</span>
                <span><span style={{ fontWeight: item.met ? 700 : 800 }}>{item.label}</span> <span style={{ color: 'var(--mm-text-muted)' }}>· {item.progress}</span><span style={VISUALLY_HIDDEN}>{item.met ? ' (done)' : ' (not yet)'}</span></span>
              </li>
            ))}
          </ul>
        </section>
        {blocked ? (
          <div style={{ padding: '13px 15px', borderRadius: '8px', background: blocked === STATUS.FUTURE ? 'var(--mm-surface-tint)' : 'var(--mm-warning-bg)', border: `1px ${blocked === STATUS.FUTURE ? 'dashed var(--mm-primary-border)' : 'solid var(--mm-warning-border-soft)'}`, color: blocked === STATUS.FUTURE ? 'var(--mm-primary-text)' : 'var(--mm-warning-text)', fontSize: '13px', lineHeight: 1.6 }}>
            {blocked === STATUS.FUTURE
              ? 'Your class reaches this later in the course, so it is not open yet. Nothing is wrong — have a look at your path for what is open now.'
              : 'This one builds on an earlier skill. Your path shows which skill to strengthen first, and starting there is what opens this.'}
          </div>
        ) : (
          <button type="button" onClick={() => onStartPractice?.(teksCode, { sessionKind: 'practice', requiredQuestions: 5 })} style={{ width: '100%', minHeight: 44, padding: '12px 16px', border: 0, borderRadius: '8px', background: '#1a73e8', color: '#fff', fontSize: '15px', fontWeight: 900, cursor: 'pointer' }}>{pass.buttonLabel} · 5 questions</button>
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
      </Dialog>
    </div>
  );
};

export default SkillDetailCardModal;

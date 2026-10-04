import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildQuestionAlignmentInfo } from '../../platform/student/questionAlignmentInfo.js';
import { getAssessmentProfile } from '../../platform/ccmr/assessmentProfiles.js';
import CcmrReferenceList from './CcmrReferenceList.jsx';

const CHIP = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
  borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: '.02em',
  lineHeight: 1.55, cursor: 'pointer',
};
const STANDARD_CHIP = { ...CHIP, background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-tint-border)' };
const CCMR_CHIP = { ...CHIP, background: 'var(--mm-accent-subtle)', color: 'var(--mm-accent-text)', border: '1px solid var(--mm-accent-border)' };
const ACTIVE_CHIP = { ...CHIP, background: '#5b21b6', color: '#fff', border: '1px solid #5b21b6' };
const buttonReset = (style) => ({ appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit', ...style });

const TAB = (active) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  border: 0, borderBottom: `3px solid ${active ? '#1a73e8' : 'transparent'}`,
  background: 'transparent', color: active ? 'var(--mm-primary-text)' : 'var(--mm-text-muted)',
  padding: '9px 4px 8px', fontWeight: 900, cursor: 'pointer',
});

const coverageText = (connection) => (
  connection.coverage === 'partial'
    ? 'Only part of this skill is tested in this assessment. The overlap is listed below.'
    : 'This skill is directly represented in this assessment domain.'
);

const calculatorSummary = (profile) => {
  if (!profile) return '';
  if (profile.calculatorAvailability === 'prohibited') return 'No calculator';
  if (profile.calculatorAvailability === 'itemLevelPopup') return 'Calculator only on selected items';
  if (profile.calculatorAvailability === 'allMath') return 'Calculator available throughout math';
  if (profile.calculatorAvailability === 'mathSection') return 'Calculator permitted in the math section';
  return '';
};

const timingSummary = (profile) => {
  if (!profile) return '';
  return profile.pacingMode === 'untimed' ? 'Untimed' : 'Timed';
};

const formulaSummary = (profile) => {
  if (!profile) return '';
  return profile.formulaSheet && profile.formulaSheet !== 'none'
    ? 'Reference sheet provided'
    : 'No formula sheet';
};

function SkillDetails({ info, onShowConnections }) {
  return (
    <>
      <div style={{ marginTop: 16, padding: '15px 16px', borderRadius: 12, background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>The skill to remember</div>
        <div style={{ marginTop: 4, color: 'var(--mm-text-strong)', fontSize: 18, fontWeight: 900 }}>{info.studentLabel || info.description}</div>
        <div style={{ marginTop: 5, color: 'var(--mm-text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
          TEKS {info.displayCode} is the teacher/reporting code for this skill. The mathematics above is what you are actually building.
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>Texas learning target</div>
        <p style={{ margin: '6px 0 0', color: 'var(--mm-text)', lineHeight: 1.65, fontSize: 14.5 }}>{info.description}</p>
      </div>

      {(info.course || info.strandLabel) && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {info.course && <span style={{ padding: '5px 8px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 11.5, fontWeight: 800 }}>{info.course}</span>}
          {info.strandLabel && <span style={{ padding: '5px 8px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 11.5, fontWeight: 800 }}>{info.strandLabel}</span>}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--mm-surface)', border: '1px solid var(--mm-border-soft)', color: 'var(--mm-text)', fontSize: 13, lineHeight: 1.55 }}>
        <strong>Why this appears here:</strong> this question is aligned to this exact skill, so the code is not just a label pasted onto the problem. It tells you what mathematics the question is asking you to strengthen.
      </div>

      {info.connections.length > 0 && (
        <button
          type="button"
          onClick={onShowConnections}
          style={buttonReset({ marginTop: 14, width: '100%', minHeight: 42, borderRadius: 9, border: '1px solid var(--mm-accent-border)', background: 'var(--mm-accent-subtle)', color: 'var(--mm-accent-text)', fontWeight: 900, cursor: 'pointer' })}
        >
          See where this math appears after this course ({info.connections.length})
        </button>
      )}
    </>
  );
}

function CcmrDetails({ info }) {
  return (
    <>
      <div style={{ marginTop: 16, padding: '13px 14px', borderRadius: 11, background: info.isExamStyle ? 'var(--mm-accent-soft)' : 'var(--mm-surface-tint)', color: 'var(--mm-text)', border: `1px solid ${info.isExamStyle ? 'var(--mm-accent-border)' : 'var(--mm-tint-border)'}`, lineHeight: 1.55, fontSize: 13 }}>
        {info.isExamStyle ? (
          <><strong>You are practicing this in {info.activeFrameworkLabel} format right now.</strong> This question was selected from that assessment pathway, not merely tagged because the math overlaps.</>
        ) : (
          <><strong>This is still a course-practice question.</strong> The same mathematics appears on the assessments below. To earn direct exam-format practice, choose that assessment format from My Math Path.</>
        )}
      </div>

      {info.connections.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--mm-text-muted)', marginBottom: 8 }}>College, career &amp; military connections</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {info.connections.map((connection) => {
              const profile = getAssessmentProfile(connection.framework);
              const facts = [calculatorSummary(profile), timingSummary(profile), formulaSummary(profile)].filter(Boolean);
              return (
                <div key={connection.framework} style={{ padding: '13px 14px', borderRadius: 11, border: `1px solid ${connection.active ? 'var(--mm-accent-border)' : 'var(--mm-border-soft)'}`, background: connection.active ? 'var(--mm-accent-subtle)' : 'var(--mm-surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ color: connection.active ? 'var(--mm-accent-text)' : 'var(--mm-text-strong)', fontSize: 14 }}>{connection.label}</strong>
                    {connection.domainTitle && <span style={{ color: 'var(--mm-text-muted)', fontSize: 12, fontWeight: 700 }}>{connection.domainTitle}</span>}
                  </div>
                  <div style={{ marginTop: 5, color: 'var(--mm-text)', fontSize: 12.5, lineHeight: 1.5 }}>{coverageText(connection)}</div>
                  {connection.coverage === 'partial' && connection.allowedAspects.length > 0 && (
                    <div style={{ marginTop: 6, color: 'var(--mm-text)', fontSize: 12.5, lineHeight: 1.5 }}><strong>What overlaps:</strong> {connection.allowedAspects.join('; ')}</div>
                  )}
                  {facts.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                      {facts.map((fact) => <span key={fact} style={{ padding: '4px 7px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 10.5, fontWeight: 800 }}>{fact}</span>)}
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <CcmrReferenceList references={connection.references || []} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.55 }}>
          This skill does not currently have a direct Digital SAT, ACT, TSIA2, or ASVAB crosswalk. That is useful information too: MathMaster will not pretend an assessment connection exists when it does not.
        </div>
      )}
    </>
  );
}

function AlignmentDetailsDialog({ info, onClose, titleId, initialView = 'skill' }) {
  const [view, setView] = useState(initialView === 'ccmr' ? 'ccmr' : 'skill');

  useEffect(() => {
    setView(initialView === 'ccmr' ? 'ccmr' : 'skill');
  }, [initialView]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }} style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(20,28,42,.48)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width: 'min(660px,100%)', maxHeight: 'min(84vh,760px)', overflowY: 'auto', padding: 22, borderRadius: 16, background: 'var(--mm-surface)', textAlign: 'left', boxShadow: '0 24px 70px rgba(0,0,0,.28)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase', color: view === 'ccmr' ? 'var(--mm-accent-text)' : 'var(--mm-primary-text)' }}>{view === 'ccmr' ? 'Where this math shows up' : 'What you are learning'}</div>
            <h2 id={titleId} style={{ margin: '5px 0 0', color: 'var(--mm-text-strong)', fontSize: 21 }}>{info.studentLabel || `TEKS ${info.displayCode}`}</h2>
          </div>
          <button type="button" autoFocus aria-label="Close standards details" onClick={onClose} style={buttonReset({ border: 0, background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--mm-text-muted)' })}>✕</button>
        </div>

        <div role="tablist" aria-label="Skill and assessment details" style={{ display: 'flex', gap: 18, marginTop: 12, borderBottom: '1px solid var(--mm-border-soft)' }}>
          <button type="button" role="tab" aria-selected={view === 'skill'} onClick={() => setView('skill')} style={TAB(view === 'skill')}>Skill</button>
          <button type="button" role="tab" aria-selected={view === 'ccmr'} onClick={() => setView('ccmr')} style={TAB(view === 'ccmr')}>CCMR connections{info.connections.length ? ` (${info.connections.length})` : ''}</button>
        </div>

        {view === 'skill'
          ? <SkillDetails info={info} onShowConnections={() => setView('ccmr')} />
          : <CcmrDetails info={info} />}

        <button type="button" onClick={onClose} style={buttonReset({ marginTop: 18, width: '100%', minHeight: 44, borderRadius: 9, border: 0, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' })}>Back to the question</button>
      </section>
    </div>
  );
}

/*
 * WHO IS READING THE CHIP.
 *
 * `audience="student"` is the assignment question a student works in. There
 * the row under the task said "TEKS A.3B ›" and "CCMR connection · 4
 * assessments ›" — two reporting codes a student cannot act on, wrapping onto
 * a second line of a 390px phone's task panel (student UX pass, R-10). The
 * student sees ONE chip in their own words, "Learning goal", which opens the
 * same dialog: the skill in plain language, the TEKS code named as the
 * teacher's reporting code, and — one button away — where this math appears
 * on the SAT, ACT, TSIA2 or ASVAB. Nothing is removed; it is translated and
 * folded. An exam-format practice chip ("SAT practice") stays, because it tells
 * the student what format they are in.
 *
 * The default audience keeps the codes on the surfaces built around them: the
 * teacher's views, My Math Path's skill cards (which are organised by CCMR
 * readiness), secure exam review.
 */
export default function StandardBadge({ code, framework = null, domainId = null, examStyle = false, assessmentSkillLabel = '', showName = false, audience = 'teacher', style = {} }) {
  const [open, setOpen] = useState(false);
  const [initialView, setInitialView] = useState('skill');
  const triggerRef = useRef(null);
  const titleId = useId();
  const info = useMemo(
    () => buildQuestionAlignmentInfo({ code, framework, domainId, examStyle, assessmentSkillLabel }),
    [code, framework, domainId, examStyle, assessmentSkillLabel],
  );
  if (!info) return null;

  const studentView = audience === 'student';
  const connectionCount = info.connections.length;
  const activeConnection = info.connections.find((entry) => entry.active);
  const activeReference = activeConnection?.references?.[0] || null;
  const otherConnectionCount = info.connections.filter((entry) => !entry.active).length;
  const openDetails = (view) => {
    setInitialView(view);
    setOpen(true);
  };
  const closeDetails = () => {
    setOpen(false);
    if (typeof window !== 'undefined') window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      {/* Named so the Work View mobile rule can stand this row down. A TEKS
          chip beside a full-window workspace on a 390px phone is assignment
          chrome over the tool, and it opens a modal of its own if a thumb
          finds it mid-drag. */}
      <div className="mathmaster-question-alignment" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...style }}>
        {studentView ? (
          <button ref={triggerRef} type="button" onClick={() => openDetails('skill')} aria-label="Open the learning goal for this question" title={info.studentLabel || info.description || undefined} style={buttonReset(STANDARD_CHIP)}>Learning goal <span aria-hidden="true">›</span></button>
        ) : (
          <button ref={triggerRef} type="button" onClick={() => openDetails('skill')} aria-label={`Open learning target for TEKS ${info.displayCode}`} style={buttonReset(STANDARD_CHIP)}>TEKS {info.displayCode} <span aria-hidden="true">›</span></button>
        )}
        {showName && info.studentLabel && <span style={{ fontSize: 12, color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>{info.studentLabel}</span>}
        {info.activeFramework && (
          <button type="button" onClick={() => openDetails('ccmr')} aria-label={`Open ${info.activeFrameworkLabel} alignment details`} style={buttonReset(ACTIVE_CHIP)}>
            {info.activeFrameworkLabel} practice{info.activeSkillLabel ? ` · ${info.activeSkillLabel}` : activeReference ? ` · ${activeReference.officialCode || activeReference.title}` : activeConnection?.domainTitle ? ` · ${activeConnection.domainTitle}` : ''} <span aria-hidden="true">›</span>
          </button>
        )}
        {!studentView && !info.activeFramework && connectionCount > 0 && (
          <button type="button" onClick={() => openDetails('ccmr')} aria-label={`Open CCMR connections for TEKS ${info.displayCode}`} style={buttonReset(CCMR_CHIP)}>
            CCMR connection · {connectionCount} {connectionCount === 1 ? 'assessment' : 'assessments'} <span aria-hidden="true">›</span>
          </button>
        )}
        {!studentView && info.activeFramework && otherConnectionCount > 0 && (
          <button type="button" onClick={() => openDetails('ccmr')} aria-label={`Open other CCMR connections for TEKS ${info.displayCode}`} style={buttonReset(CCMR_CHIP)}>Also connects to {otherConnectionCount} <span aria-hidden="true">›</span></button>
        )}
      </div>
      {open && <AlignmentDetailsDialog info={info} onClose={closeDetails} titleId={titleId} initialView={initialView} />}
    </>
  );
}

export const standardIsCcmrAligned = (code) => Boolean(buildQuestionAlignmentInfo({ code })?.connections?.length);

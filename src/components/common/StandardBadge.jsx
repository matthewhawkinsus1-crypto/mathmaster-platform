import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildQuestionAlignmentInfo } from '../../platform/student/questionAlignmentInfo.js';
import { getAssessmentProfile } from '../../platform/ccmr/assessmentProfiles.js';
import CcmrReferenceList from './CcmrReferenceList.jsx';

const CHIP = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
  borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: '.02em',
  lineHeight: 1.55, cursor: 'pointer',
};
const STANDARD_CHIP = { ...CHIP, background: '#eef3fb', color: '#174ea6', border: '1px solid #c9daf8' };
const CCMR_CHIP = { ...CHIP, background: '#f7f2fd', color: '#5b21b6', border: '1px solid #ddcff3' };
const ACTIVE_CHIP = { ...CHIP, background: '#5b21b6', color: '#fff', border: '1px solid #5b21b6' };
const buttonReset = (style) => ({ appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit', ...style });

const TAB = (active) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  border: 0, borderBottom: `3px solid ${active ? '#1a73e8' : 'transparent'}`,
  background: 'transparent', color: active ? '#174ea6' : '#5f6368',
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
      <div style={{ marginTop: 16, padding: '15px 16px', borderRadius: 12, background: '#f8fbff', border: '1px solid #d9e2f1' }}>
        <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: '#174ea6' }}>The skill to remember</div>
        <div style={{ marginTop: 4, color: '#202124', fontSize: 18, fontWeight: 900 }}>{info.studentLabel || info.description}</div>
        <div style={{ marginTop: 5, color: '#5f6368', fontSize: 12.5, lineHeight: 1.5 }}>
          TEKS {info.displayCode} is the teacher/reporting code for this skill. The mathematics above is what you are actually building.
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: '#5f6368' }}>Texas learning target</div>
        <p style={{ margin: '6px 0 0', color: '#30343b', lineHeight: 1.65, fontSize: 14.5 }}>{info.description}</p>
      </div>

      {(info.course || info.strandLabel) && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {info.course && <span style={{ padding: '5px 8px', borderRadius: 999, background: '#f1f3f4', color: '#3c4043', fontSize: 11.5, fontWeight: 800 }}>{info.course}</span>}
          {info.strandLabel && <span style={{ padding: '5px 8px', borderRadius: 999, background: '#f1f3f4', color: '#3c4043', fontSize: 11.5, fontWeight: 800 }}>{info.strandLabel}</span>}
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1px solid #e0e4ea', color: '#3c4043', fontSize: 13, lineHeight: 1.55 }}>
        <strong>Why this appears here:</strong> this question is aligned to this exact skill, so the code is not just a label pasted onto the problem. It tells you what mathematics the question is asking you to strengthen.
      </div>

      {info.connections.length > 0 && (
        <button
          type="button"
          onClick={onShowConnections}
          style={buttonReset({ marginTop: 14, width: '100%', minHeight: 42, borderRadius: 9, border: '1px solid #c9b5ec', background: '#faf7ff', color: '#5b21b6', fontWeight: 900, cursor: 'pointer' })}
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
      <div style={{ marginTop: 16, padding: '13px 14px', borderRadius: 11, background: info.isExamStyle ? '#f3ecfd' : '#f8fbff', color: '#3c4043', border: `1px solid ${info.isExamStyle ? '#d9c9f7' : '#d9e2f1'}`, lineHeight: 1.55, fontSize: 13 }}>
        {info.isExamStyle ? (
          <><strong>You are practicing this in {info.activeFrameworkLabel} format right now.</strong> This question was selected from that assessment pathway, not merely tagged because the math overlaps.</>
        ) : (
          <><strong>This is still a course-practice question.</strong> The same mathematics appears on the assessments below. To earn direct exam-format practice, choose that assessment format from My Math Path.</>
        )}
      </div>

      {info.connections.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: '#5f6368', marginBottom: 8 }}>College, career &amp; military connections</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {info.connections.map((connection) => {
              const profile = getAssessmentProfile(connection.framework);
              const facts = [calculatorSummary(profile), timingSummary(profile), formulaSummary(profile)].filter(Boolean);
              return (
                <div key={connection.framework} style={{ padding: '13px 14px', borderRadius: 11, border: `1px solid ${connection.active ? '#c5a7ea' : '#e0e4ea'}`, background: connection.active ? '#faf7ff' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ color: connection.active ? '#5b21b6' : '#202124', fontSize: 14 }}>{connection.label}</strong>
                    {connection.domainTitle && <span style={{ color: '#5f6368', fontSize: 12, fontWeight: 700 }}>{connection.domainTitle}</span>}
                  </div>
                  <div style={{ marginTop: 5, color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}>{coverageText(connection)}</div>
                  {connection.coverage === 'partial' && connection.allowedAspects.length > 0 && (
                    <div style={{ marginTop: 6, color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}><strong>What overlaps:</strong> {connection.allowedAspects.join('; ')}</div>
                  )}
                  {facts.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                      {facts.map((fact) => <span key={fact} style={{ padding: '4px 7px', borderRadius: 999, background: '#f1f3f4', color: '#3c4043', fontSize: 10.5, fontWeight: 800 }}>{fact}</span>)}
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
        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#f8f9fa', border: '1px solid #e0e4ea', color: '#5f6368', fontSize: 13, lineHeight: 1.55 }}>
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
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width: 'min(660px,100%)', maxHeight: 'min(84vh,760px)', overflowY: 'auto', padding: 22, borderRadius: 16, background: '#fff', textAlign: 'left', boxShadow: '0 24px 70px rgba(0,0,0,.28)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase', color: view === 'ccmr' ? '#5b21b6' : '#174ea6' }}>{view === 'ccmr' ? 'Where this math shows up' : 'What you are learning'}</div>
            <h2 id={titleId} style={{ margin: '5px 0 0', color: '#202124', fontSize: 21 }}>{info.studentLabel || `TEKS ${info.displayCode}`}</h2>
          </div>
          <button type="button" autoFocus aria-label="Close standards details" onClick={onClose} style={buttonReset({ border: 0, background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#5f6368' })}>✕</button>
        </div>

        <div role="tablist" aria-label="Skill and assessment details" style={{ display: 'flex', gap: 18, marginTop: 12, borderBottom: '1px solid #e0e4ea' }}>
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

export default function StandardBadge({ code, framework = null, domainId = null, examStyle = false, assessmentSkillLabel = '', showName = false, style = {} }) {
  const [open, setOpen] = useState(false);
  const [initialView, setInitialView] = useState('skill');
  const triggerRef = useRef(null);
  const titleId = useId();
  const info = useMemo(
    () => buildQuestionAlignmentInfo({ code, framework, domainId, examStyle, assessmentSkillLabel }),
    [code, framework, domainId, examStyle, assessmentSkillLabel],
  );
  if (!info) return null;

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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...style }}>
        <button ref={triggerRef} type="button" onClick={() => openDetails('skill')} aria-label={`Open learning target for TEKS ${info.displayCode}`} style={buttonReset(STANDARD_CHIP)}>TEKS {info.displayCode} <span aria-hidden="true">›</span></button>
        {showName && info.studentLabel && <span style={{ fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>{info.studentLabel}</span>}
        {info.activeFramework && (
          <button type="button" onClick={() => openDetails('ccmr')} aria-label={`Open ${info.activeFrameworkLabel} alignment details`} style={buttonReset(ACTIVE_CHIP)}>
            {info.activeFrameworkLabel} practice{info.activeSkillLabel ? ` · ${info.activeSkillLabel}` : activeReference ? ` · ${activeReference.officialCode || activeReference.title}` : activeConnection?.domainTitle ? ` · ${activeConnection.domainTitle}` : ''} <span aria-hidden="true">›</span>
          </button>
        )}
        {!info.activeFramework && connectionCount > 0 && (
          <button type="button" onClick={() => openDetails('ccmr')} aria-label={`Open CCMR connections for TEKS ${info.displayCode}`} style={buttonReset(CCMR_CHIP)}>
            CCMR connection · {connectionCount} {connectionCount === 1 ? 'assessment' : 'assessments'} <span aria-hidden="true">›</span>
          </button>
        )}
        {info.activeFramework && otherConnectionCount > 0 && (
          <button type="button" onClick={() => openDetails('ccmr')} aria-label={`Open other CCMR connections for TEKS ${info.displayCode}`} style={buttonReset(CCMR_CHIP)}>Also connects to {otherConnectionCount} <span aria-hidden="true">›</span></button>
        )}
      </div>
      {open && <AlignmentDetailsDialog info={info} onClose={closeDetails} titleId={titleId} initialView={initialView} />}
    </>
  );
}

export const standardIsCcmrAligned = (code) => Boolean(buildQuestionAlignmentInfo({ code })?.connections?.length);

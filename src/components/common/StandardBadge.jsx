import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildQuestionAlignmentInfo } from '../../platform/student/questionAlignmentInfo.js';

const CHIP = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
  borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: '.02em',
  lineHeight: 1.55, cursor: 'pointer',
};
const STANDARD_CHIP = { ...CHIP, background: '#eef3fb', color: '#174ea6', border: '1px solid #c9daf8' };
const CCMR_CHIP = { ...CHIP, background: '#f7f2fd', color: '#5b21b6', border: '1px solid #ddcff3' };
const ACTIVE_CHIP = { ...CHIP, background: '#5b21b6', color: '#fff', border: '1px solid #5b21b6' };
const buttonReset = (style) => ({ appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit', ...style });

const coverageText = (connection) => (
  connection.coverage === 'partial'
    ? 'This TEKS is broader than this assessment. Only the overlapping part is tested there.'
    : 'The mathematics in this TEKS is directly represented in this assessment domain.'
);

function AlignmentDetailsDialog({ info, onClose, titleId }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }} style={{ position: 'fixed', inset: 0, zIndex: 10050, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(20,28,42,.48)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width: 'min(620px,100%)', maxHeight: 'min(82vh,720px)', overflowY: 'auto', padding: 22, borderRadius: 16, background: '#fff', textAlign: 'left', boxShadow: '0 24px 70px rgba(0,0,0,.28)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase', color: '#174ea6' }}>What this question is building</div>
            <h2 id={titleId} style={{ margin: '5px 0 0', color: '#202124', fontSize: 21 }}>TEKS {info.displayCode}</h2>
          </div>
          <button type="button" autoFocus aria-label="Close standards details" onClick={onClose} style={buttonReset({ border: 0, background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#5f6368' })}>✕</button>
        </div>
        {info.strandLabel && <div style={{ marginTop: 12, color: '#5f6368', fontSize: 12, fontWeight: 800 }}>{info.course}{info.course && info.strandLabel ? ' · ' : ''}{info.strandLabel}</div>}
        <p style={{ margin: '8px 0 0', color: '#30343b', lineHeight: 1.65, fontSize: 14.5 }}>{info.description}</p>

        {info.isExamStyle ? (
          <div style={{ marginTop: 16, padding: '11px 13px', borderRadius: 10, background: '#f3ecfd', color: '#5b21b6', border: '1px solid #d9c9f7', lineHeight: 1.55, fontSize: 13 }}>
            <strong>This is {info.activeFrameworkLabel}-style practice.</strong> The question is deliberately written in that assessment&apos;s format, not merely tagged because the mathematics overlaps.
          </div>
        ) : info.connections.length ? (
          <div style={{ marginTop: 16, padding: '11px 13px', borderRadius: 10, background: '#f8fbff', color: '#3c4043', border: '1px solid #d9e2f1', lineHeight: 1.55, fontSize: 13 }}>
            <strong>This is a course question.</strong> It builds mathematics that also appears on the assessments below. That connection is useful preparation, but this question is not counted as direct exam-format practice.
          </div>
        ) : null}

        {info.connections.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: '#5f6368', marginBottom: 8 }}>College, career &amp; military connections</div>
            <div style={{ display: 'grid', gap: 9 }}>
              {info.connections.map((connection) => (
                <div key={connection.framework} style={{ padding: '11px 13px', borderRadius: 10, border: `1px solid ${connection.active ? '#c5a7ea' : '#e0e4ea'}`, background: connection.active ? '#faf7ff' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ color: connection.active ? '#5b21b6' : '#202124', fontSize: 13.5 }}>{connection.label}</strong>
                    {connection.domainTitle && <span style={{ color: '#5f6368', fontSize: 12 }}>{connection.domainTitle}</span>}
                  </div>
                  <div style={{ marginTop: 4, color: '#5f6368', fontSize: 12.5, lineHeight: 1.5 }}>{coverageText(connection)}</div>
                  {connection.coverage === 'partial' && connection.allowedAspects.length > 0 && <div style={{ marginTop: 5, color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}><strong>Overlap:</strong> {connection.allowedAspects.join('; ')}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <button type="button" onClick={onClose} style={buttonReset({ marginTop: 18, width: '100%', minHeight: 44, borderRadius: 9, border: 0, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' })}>Back to the question</button>
      </section>
    </div>
  );
}

export default function StandardBadge({ code, framework = null, domainId = null, examStyle = false, showName = false, style = {} }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const titleId = useId();
  const info = useMemo(() => buildQuestionAlignmentInfo({ code, framework, domainId, examStyle }), [code, framework, domainId, examStyle]);
  if (!info) return null;

  const connectionCount = info.connections.length;
  const activeConnection = info.connections.find((entry) => entry.active);
  const otherConnectionCount = info.connections.filter((entry) => !entry.active).length;
  const closeDetails = () => {
    setOpen(false);
    if (typeof window !== 'undefined') window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...style }}>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label={`Open details for TEKS ${info.displayCode}`} style={buttonReset(STANDARD_CHIP)}>TEKS {info.displayCode} <span aria-hidden="true">›</span></button>
        {showName && info.description && <span style={{ fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>{info.description}</span>}
        {info.activeFramework && (
          <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${info.activeFrameworkLabel} alignment details`} style={buttonReset(ACTIVE_CHIP)}>
            {info.activeFrameworkLabel} practice{activeConnection?.domainTitle ? ` · ${activeConnection.domainTitle}` : ''} <span aria-hidden="true">›</span>
          </button>
        )}
        {!info.activeFramework && connectionCount > 0 && (
          <button type="button" onClick={() => setOpen(true)} aria-label={`Open CCMR connections for TEKS ${info.displayCode}`} style={buttonReset(CCMR_CHIP)}>
            CCMR connection · {connectionCount} {connectionCount === 1 ? 'assessment' : 'assessments'} <span aria-hidden="true">›</span>
          </button>
        )}
        {info.activeFramework && otherConnectionCount > 0 && (
          <button type="button" onClick={() => setOpen(true)} aria-label={`Open other CCMR connections for TEKS ${info.displayCode}`} style={buttonReset(CCMR_CHIP)}>Also connects to {otherConnectionCount} <span aria-hidden="true">›</span></button>
        )}
      </div>
      {open && <AlignmentDetailsDialog info={info} onClose={closeDetails} titleId={titleId} />}
    </>
  );
}

export const standardIsCcmrAligned = (code) => Boolean(buildQuestionAlignmentInfo({ code })?.connections?.length);

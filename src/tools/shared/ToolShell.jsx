import React, { useState } from 'react';
import { getTexasStandard } from '../../texasStandards';
import { normalizeQuestionStandards } from '../../questionMetadata';
import MathText from '../../components/common/MathText.jsx';

export default function ToolShell({ title, subtitle, badge, children, footer }) {
  return (
    <section className="mathmaster-tool-shell" style={{
      // Takes the room it is given, up to a limit generous enough for a
      // coordinate plane beside its controls. The old fixed 980px capped a
      // graph well below the width available on a school Chromebook.
      width: 'min(100%, 1180px)',
      margin: '0 auto',
      border: '1px solid #d9e2f1',
      borderRadius: 18,
      background: '#fff',
      boxShadow: '0 16px 44px rgba(15, 23, 42, 0.08)',
      overflow: 'hidden',
    }}>
      <header className="mathmaster-tool-shell-header" style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', background: 'linear-gradient(135deg,#f8fbff,#eef4ff)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, color: '#172033' }}>{title}</h2>
            {subtitle ? <p style={{ margin: '6px 0 0', color: '#5f6b7a', lineHeight: 1.45 }}>{subtitle}</p> : null}
          </div>
          {badge ? <span style={{ borderRadius: 999, background: '#e8f0fe', color: '#174ea6', padding: '7px 11px', fontWeight: 800, fontSize: 12 }}>{badge}</span> : null}
        </div>
      </header>
      <div className="mathmaster-tool-shell-body" style={{ padding: 24 }}>{children}</div>
      {footer ? <footer style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', background: '#fafafa', color: '#5f6b7a', fontSize: 13 }}>{footer}</footer> : null}
    </section>
  );
}

export const ToolGrid = ({ children, min = 260 }) => (
  <div className="mathmaster-tool-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 18 }}>{children}</div>
);

// For tools where a graph is the workspace and the rest is controls: the plane
// gets the wider column instead of an even split with a panel of text.
export const ToolSplit = ({ children }) => (
  <div className="mathmaster-tool-split">{children}</div>
);

export const Panel = ({ title, children }) => (
  <div className="mathmaster-tool-panel" style={{ border: '1px solid #dde5f0', borderRadius: 14, padding: 16, background: '#fbfdff' }}>
    {title ? <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#24324a' }}>{title}</h3> : null}
    {children}
  </div>
);

export const ResultPill = ({ ok, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '7px 11px', fontWeight: 800, background: ok ? '#e6f4ea' : '#fce8e6', color: ok ? '#137333' : '#c5221f' }}>
    {ok ? '✓' : '•'} {children}
  </span>
);

// Every tool leads with the same thing: one sentence naming the task, then the
// concrete steps. Previously each tool buried its directions in a paragraph
// under the workspace, where a student reads them only after guessing wrong.
//
// EVERY AUTHORED STRING HERE GOES THROUGH MathText. This is the card at the top
// of every single tool, so a prompt written as "Solve $-3x + 4 > 13$" — which is
// how the whole Path bank is written — was showing a student the dollar signs
// and the backslashes. One component, every tool, every question.
export const TaskCard = ({ task, steps = [], note = null, question = null }) => {
  const authoredPrompt = String(question?.prompt || '').trim();
  const taskText = String(task || '').trim();
  const promptDiffers = Boolean(authoredPrompt && authoredPrompt !== taskText);

  // Standards are helpful as a student-facing skill description, but the raw
  // TEKS identifier is teacher/programming metadata.  Keep the code available
  // elsewhere in MathMaster and show students only the actual skill language.
  const standards = question ? normalizeQuestionStandards(question).primary : [];
  const aligned = standards
    .map((entry) => ({ code: entry.code, description: getTexasStandard(entry.code)?.description }))
    .filter((entry) => entry.description)
    .slice(0, 2);

  return (
    <div style={{
      border: '1px solid #9bb8e8', borderLeft: '6px solid #1a73e8', borderRadius: 12,
      background: '#f4f8ff', padding: '14px 18px', marginBottom: 18,
    }}>
      {authoredPrompt ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#174ea6' }}>{promptDiffers ? 'Problem' : 'Your task'}</div>
          <MathText as="p" style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#172033', lineHeight: 1.4 }}>{authoredPrompt}</MathText>
        </>
      ) : null}
      {taskText && (!authoredPrompt || promptDiffers) ? (
        <>
          <div style={{ marginTop: authoredPrompt ? 12 : 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#174ea6' }}>{authoredPrompt ? 'What to do' : 'Your task'}</div>
          <MathText as="p" style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700, color: '#172033', lineHeight: 1.4 }}>{taskText}</MathText>
        </>
      ) : null}
      {steps.length ? (
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, color: '#3c4756', lineHeight: 1.6 }}>
          {steps.map((step, index) => <li key={index}><MathText>{step}</MathText></li>)}
        </ol>
      ) : null}
      {note ? <MathText as="p" style={{ margin: '10px 0 0', fontSize: 13, color: '#5f6b7a' }}>{note}</MathText> : null}
      {aligned.length ? (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #d5e2f7' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5f6b7a' }}>Skill focus</div>
          {aligned.map((entry) => (
            <MathText as="p" key={entry.code} style={{ margin: '4px 0 0', fontSize: 13, color: '#3c4756', lineHeight: 1.5 }}>
              {entry.description}
            </MathText>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// Progressive hints: a nudge, then the strategy, then the worked step. Each
// reveal is reported so attempt scoring can discount mathematical help the same
// way it does everywhere else in the platform.
export const HintPanel = ({ hints = [], onHintUsed }) => {
  const [revealed, setRevealed] = useState(0);
  if (!hints.length) return null;
  const revealNext = () => {
    setRevealed((current) => {
      const next = Math.min(hints.length, current + 1);
      if (next > current) onHintUsed?.(next);
      return next;
    });
  };
  return (
    <div style={{ marginTop: 16, border: '1px solid #f0d9a8', borderRadius: 12, background: '#fffaf0', padding: '12px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: '#7a4f01', fontSize: 14 }}>Stuck? Hints</strong>
        <button
          type="button"
          onClick={revealNext}
          disabled={revealed >= hints.length}
          style={{
            padding: '7px 13px', borderRadius: 999, border: '1px solid #e0a800',
            background: revealed >= hints.length ? '#f1f1f1' : '#fff', color: '#7a4f01',
            fontWeight: 800, fontSize: 13, cursor: revealed >= hints.length ? 'default' : 'pointer',
          }}
        >
          {revealed === 0 ? 'Show a hint' : revealed >= hints.length ? 'All hints shown' : `Show hint ${revealed + 1} of ${hints.length}`}
        </button>
      </div>
      {revealed > 0 ? (
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, color: '#5f4400', lineHeight: 1.6 }}>
          {hints.slice(0, revealed).map((hint, index) => <li key={index} style={{ marginBottom: 4 }}><MathText>{hint}</MathText></li>)}
        </ol>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#7a6027' }}>
          Try it on your own first. Hints get more specific as you go, and using one is recorded for your teacher.
        </p>
      )}
    </div>
  );
};

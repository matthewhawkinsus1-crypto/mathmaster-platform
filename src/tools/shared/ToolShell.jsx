import React, { useEffect, useRef, useState } from 'react';
import MathText from '../../components/common/MathText.jsx';
import { focusFirstAnswerControl, isSingleLineAnswerTarget } from '../../platform/interaction/answerEntryUx.js';
import QuietDisclosure from '../../components/common/QuietDisclosure.jsx';

// A stable key for "this exact block of text", so a student's decision to fold
// the steps away is remembered per tool without every one of the eighteen tools
// having to be given an id by hand.
//
// Keying on the CONTENT rather than on the tool is deliberate: when the steps
// are rewritten the key changes and the panel opens again, which is what should
// happen when the instructions are no longer the ones the student read.
const contentKey = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

export default function ToolShell({ title, subtitle, badge, children, footer, shellKey = null }) {
  const shellRef = useRef(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => focusFirstAnswerControl(shellRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleAnswerEnter = (event) => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!isSingleLineAnswerTarget(event.target)) return;

    const findPrimary = (root) => {
      if (!root?.querySelectorAll) return null;
      const explicit = root.querySelector('button[data-primary-answer-action="true"]:not([disabled])');
      if (explicit) return explicit;
      return [...root.querySelectorAll('button:not([disabled])')].find((button) => (
        /^(check|submit|verify|evaluate|lock in|record answer|apply)\b/i.test(String(button.textContent || '').trim())
      )) || null;
    };

    const panel = event.target?.closest?.('.mathmaster-tool-panel');
    const primary = findPrimary(panel) || findPrimary(shellRef.current);
    if (!primary) return;
    event.preventDefault();
    primary.click();
  };

  return (
    <section ref={shellRef} onKeyDown={handleAnswerEnter} className="mathmaster-tool-shell" style={{
      // Takes the room it is given, up to a limit generous enough for a
      // coordinate plane beside its controls. The old fixed 980px capped a
      // graph well below the width available on a school Chromebook.
      width: 'min(100%, 1180px)',
      margin: '0 auto',
      border: '1px solid #d9e2f1',
      borderRadius: 18,
      background: '#fff',
      boxShadow: '0 16px 44px rgba(15, 23, 42, 0.08)',
      // `clip`, not `hidden`. Both keep the corners rounded, but `hidden`
      // creates a scroll container, and a `position: sticky` descendant sticks
      // to its nearest scroll container — one that never scrolls, so the task
      // card silently did not stick. `clip` does not create one.
      overflow: 'clip',
    }}>
      {/* ONE LINE, NOT THREE.
          This header was a 24px heading, a full sentence describing the tool,
          and a badge, stacked above every question — and the question's own
          "Your task" panel sits directly above it saying what to do. The name
          still orients a student arriving at an unfamiliar tool, so it stays,
          at the size of a label rather than a headline.

          The subtitle describes what the TOOL is. That is worth reading once
          and is not worth a paragraph on every question, so it folds. */}
      <header className="mathmaster-tool-shell-header" style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: 'linear-gradient(135deg,#f8fbff,#eef4ff)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#172033' }}>{title}</h2>
          {badge ? <span style={{ borderRadius: 999, background: '#e8f0fe', color: '#174ea6', padding: '5px 10px', fontWeight: 800, fontSize: 11 }}>{badge}</span> : null}
        </div>
        {subtitle ? (
          <QuietDisclosure
            summary="About this tool"
            storageKey={`mm.tool.about.${shellKey || contentKey(`${title}|${subtitle}`)}`}
            defaultOpen={false}
            style={{ margin: '8px 0 0' }}
          >
            <p style={{ margin: 0, color: '#5f6b7a', lineHeight: 1.45, fontSize: 14 }}>{subtitle}</p>
          </QuietDisclosure>
        ) : null}
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

/**
 * A panel a student can fold away.
 *
 * `collapsible` is opt-in and the bar for setting it is deliberately high,
 * because two kinds of panel must never fold and they are most of them.
 *
 *   A PANEL HOLDING A CONTROL. Hiding a field behind a disclosure is worse than
 *   a long page: a student who cannot find the input does not know to look for
 *   it, and reads the question as broken.
 *
 *   A PANEL HOLDING THIS QUESTION'S DATA. The given ordered pairs, the target
 *   polynomial, the sequence with the gap. Folding is remembered, so a student
 *   who folded one question's givens would arrive at the next question with the
 *   thing it asks about already hidden.
 *
 * What is left is general teaching reference — text that is identical on every
 * question of that tool. Across the whole tool set that is two panels, which is
 * the honest size of this category rather than a disappointing one.
 *
 * It opens by default in every case. The student decides what to put away.
 */
export const Panel = ({ title, children, collapsible = false, defaultOpen = true }) => {
  const body = (
    <div className="mathmaster-tool-panel" style={{ border: '1px solid #dde5f0', borderRadius: 14, padding: 16, background: '#fbfdff' }}>
      {title ? <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#24324a' }}>{title}</h3> : null}
      {children}
    </div>
  );

  if (!collapsible || !title) return body;

  return (
    <QuietDisclosure
      summary={String(title)}
      storageKey={`mm.tool.panel.${contentKey(String(title))}`}
      defaultOpen={defaultOpen}
      tone="strong"
      style={{ margin: 0 }}
    >
      {body}
    </QuietDisclosure>
  );
};

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
export const TaskCard = ({ task, steps = [], note = null, question = null, stepsKey = null }) => {
  const authoredPrompt = String(question?.prompt || '').trim();
  const taskText = String(task || '').trim();
  const promptDiffers = Boolean(authoredPrompt && authoredPrompt !== taskText);



  return (
    <div className="mathmaster-tool-task-card" style={{
      border: '1px solid #9bb8e8', borderLeft: '6px solid #1a73e8', borderRadius: 12,
      background: '#f4f8ff', padding: '12px 16px', marginBottom: 12,
    }}>
      {authoredPrompt ? (
        <div className="mathmaster-tool-task-prompt">
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#174ea6' }}>{promptDiffers ? 'Problem' : 'Your task'}</div>
          <MathText as="p" style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#172033', lineHeight: 1.4 }}>{authoredPrompt}</MathText>
        </div>
      ) : null}
      {taskText && (!authoredPrompt || promptDiffers) ? (
        <div className="mathmaster-tool-task-directions">
          <div style={{ marginTop: authoredPrompt ? 12 : 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#174ea6' }}>{authoredPrompt ? 'What to do' : 'Your task'}</div>
          <MathText as="p" style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700, color: '#172033', lineHeight: 1.4 }}>{taskText}</MathText>
        </div>
      ) : null}
      {/* THE STEPS START FOLDED. They are the same for every question in a
          section, so by the fourth one a student has read them three times and
          is scrolling past them to reach the graph. Opening folded puts the tool
          on screen and ready for input instead; the summary line still names
          what is inside and how many steps there are, and a student's choice to
          open them is remembered for that block of text.

          What does NOT fold is the problem itself and the one-line task — those
          are the question, not the directions about it. */}
      {steps.length ? (
        <QuietDisclosure
          summary={`How to do this (${steps.length} step${steps.length === 1 ? '' : 's'})`}
          storageKey={`mm.tool.steps.${stepsKey || contentKey(steps.join('|'))}`}
          defaultOpen={false}
          style={{ margin: '10px 0 0' }}
        >
          <ol style={{ margin: 0, paddingLeft: 20, color: '#3c4756', lineHeight: 1.6 }}>
            {steps.map((step, index) => <li key={index}><MathText>{step}</MathText></li>)}
          </ol>
          {note ? <MathText as="p" style={{ margin: '10px 0 0', fontSize: 13, color: '#5f6b7a' }}>{note}</MathText> : null}
        </QuietDisclosure>
      ) : note ? (
        <MathText as="p" style={{ margin: '10px 0 0', fontSize: 13, color: '#5f6b7a' }}>{note}</MathText>
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
  // AN UNUSED HINT BLOCK TAKES ONE ROW.
  //
  // This was a bordered box carrying a heading, a button, and two lines telling
  // the student to try it themselves first — on every question, of every tool
  // that has hints, whether or not they wanted one. The nudge was the bulk. The
  // one fact in it a student needs before deciding is that their teacher sees
  // this, and that belongs beside the button they are about to press.
  const used = revealed > 0;

  return (
    <div style={{ marginTop: 16, ...(used ? { border: '1px solid #f0d9a8', borderRadius: 12, background: '#fffaf0', padding: '12px 15px' } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {used && <strong style={{ color: '#7a4f01', fontSize: 14 }}>Hints</strong>}
        <button
          type="button"
          onClick={revealNext}
          disabled={revealed >= hints.length}
          title="Using a hint is recorded for your teacher."
          style={{
            minHeight: 44, padding: '7px 13px', borderRadius: 999, border: '1px solid #e0a800',
            background: revealed >= hints.length ? '#f1f1f1' : '#fffaf0', color: '#7a4f01',
            fontWeight: 800, fontSize: 13, cursor: revealed >= hints.length ? 'default' : 'pointer',
          }}
        >
          {revealed === 0 ? 'Stuck? Show a hint' : revealed >= hints.length ? 'All hints shown' : `Show hint ${revealed + 1} of ${hints.length}`}
        </button>
        {!used && <span style={{ fontSize: 12, color: '#7a6027' }}>Recorded for your teacher</span>}
      </div>
      {used ? (
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, color: '#5f4400', lineHeight: 1.6 }}>
          {hints.slice(0, revealed).map((hint, index) => <li key={index} style={{ marginBottom: 4 }}><MathText>{hint}</MathText></li>)}
        </ol>
      ) : null}
    </div>
  );
};

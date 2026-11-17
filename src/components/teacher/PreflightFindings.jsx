import { memo, useId, useState, useSyncExternalStore } from 'react';
import { preflightFindingsCountText } from '../../platform/preflight/questionPreflightFindings.js';

/*
 * WHAT PRE-FLIGHT SAYS ABOUT ONE QUESTION, IN ONE CALM REGION.
 *
 * The Question Editor draws this under each question Pre-Flight has something
 * to say about (and once above the questions for what names none), from
 * questionPreflightFindings.js, through the store useQuestionPreflightFindings
 * keeps: each region subscribes to its own question's findings. A labelled region; a heading with the count;
 * a list a screen reader moves through item by item, each item saying in
 * words whether it is a warning or a note, in full. Warnings are open from
 * the start; notes alone wait behind Show, so a lesson whose every question
 * has a note stays quiet. Nothing here takes focus, announces itself or
 * stops a save, and it changes only when the findings do.
 */
const regionStyle = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 9,
  border: '1px solid var(--mm-border)',
  background: 'var(--mm-surface-muted)',
  color: 'var(--mm-text)',
  // The editor's cards inherit centred text; a list of sentences reads from the start.
  textAlign: 'start',
  minWidth: 0,
};
const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' };
const headingStyle = { margin: 0, fontSize: 'calc(13.5 * var(--mm-px))', lineHeight: 1.35, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' };
const toggleStyle = {
  minHeight: 44,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};
const listStyle = { margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, overflowWrap: 'anywhere' };
const KIND_STYLE = Object.freeze({
  warning: { color: 'var(--mm-warning-text)' },
  note: { color: 'var(--mm-info-text)' },
});

function PreflightFindings({ findings, subject }) {
  const id = useId();
  const warnings = Array.isArray(findings?.warnings) ? findings.warnings : [];
  const notes = Array.isArray(findings?.notes) ? findings.notes : [];
  const [open, setOpen] = useState(warnings.length > 0);
  if (!warnings.length && !notes.length) return null;
  const headingId = `${id}-heading`;
  const listId = `${id}-list`;
  return (
    <section aria-labelledby={headingId} data-preflight-findings={subject} style={regionStyle}>
      <div style={headerStyle}>
        {/* Read as "Pre-Flight for Question 23: 1 warning, 2 notes", drawn as
            "Pre-Flight: 1 warning, 2 notes". The colon read is inside the
            hidden words: after a box drawn out of the flow, a colon of its own
            is read with a space before it. */}
        <h3 id={headingId} style={headingStyle}>
          Pre-Flight<span className="mm-visually-hidden"> for {subject}:</span><span aria-hidden="true">:</span> {preflightFindingsCountText({ warnings, notes })}
        </h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${open ? 'Hide' : 'Show'} Pre-Flight's findings for ${subject}`}
          onClick={() => setOpen((current) => !current)}
          style={toggleStyle}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {/* `hidden` alone would lose to the list's own display. */}
      <ul id={listId} hidden={!open} style={{ ...listStyle, display: open ? 'grid' : 'none' }}>
        {warnings.map((text) => (
          <li key={`warning:${text}`} data-preflight-finding="warning">
            <strong style={KIND_STYLE.warning}>Warning: </strong>{text}
          </li>
        ))}
        {notes.map((text) => (
          <li key={`note:${text}`} data-preflight-finding="note">
            <strong style={KIND_STYLE.note}>Note: </strong>{text}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Re-drawn only when its findings change, never for a keystroke elsewhere in
// the editor.
const PreflightFindingsRegion = memo(PreflightFindings);
export default PreflightFindingsRegion;

/**
 * One question's region (questionId null: the whole assignment's), drawn from
 * the store: nothing until Pre-Flight has something to say about it.
 */
export const QuestionPreflightFindings = memo(function QuestionPreflightFindings({ store, questionId = null, subject }) {
  const findings = useSyncExternalStore(store.subscribe, () => {
    const all = store.snapshot().findings;
    if (!all) return null;
    return questionId == null ? all.assignment : (all.byQuestionId.get(String(questionId)) || null);
  });
  return findings ? <PreflightFindingsRegion findings={findings} subject={subject} /> : null;
});

/**
 * Whether the findings on screen are those of the questions as they are now
 * (data-preflight-findings-state: "current" or "checking"). A box of its own
 * would take a row of the editor's list, so it has none.
 */
export function PreflightFindingsState({ store, source, questions, classSize = null, children }) {
  const basis = useSyncExternalStore(store.subscribe, () => store.snapshot().basis);
  const current = Boolean(basis) && basis.source === source && basis.questions === questions && basis.classSize === classSize;
  return <div data-preflight-findings-state={current ? 'current' : 'checking'} style={{ display: 'contents' }}>{children}</div>;
}

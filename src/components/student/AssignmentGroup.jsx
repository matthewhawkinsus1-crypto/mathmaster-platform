import React, { useState } from 'react';

// One collapsible group of assignments.
//
// "Do not solve scale with a giant scrolling list." A student with four
// assignments is fine with a list; a student with twenty-two — active,
// completed, overdue, upcoming, warm-ups, classwork, practices, DOLs, quizzes,
// tests — is not, and that is a normal amount of work by November.
//
// The groups a student must ACT on open by default; the rest are collapsed with
// their count showing. That is the whole of the progressive disclosure: the
// count is enough to answer "is there anything in there?", and opening it is
// one press when the answer matters.
//
// An empty group renders nothing at all. A screen listing six headings with
// "0 items" under each looks like a system with nothing to offer.

const TONE = {
  inProgress: { accent: 'var(--mm-primary-text)', chip: 'var(--mm-primary-subtle)' },
  pastDue: { accent: 'var(--mm-warning-text)', chip: 'var(--mm-warning-subtle)' },
  doNow: { accent: 'var(--mm-primary-text)', chip: 'var(--mm-primary-subtle)' },
  comingUp: { accent: 'var(--mm-text-muted)', chip: 'var(--mm-surface-control)' },
  practice: { accent: 'var(--mm-accent-text)', chip: 'var(--mm-primary-subtle)' },
  completed: { accent: 'var(--mm-success-text)', chip: 'var(--mm-success-subtle)' },
};

export default function AssignmentGroup({
  bucket,
  label,
  entries = [],
  defaultOpen = true,
  renderEntry,
  hint = null,
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!entries.length) return null;

  const tone = TONE[bucket] || TONE.comingUp;
  const headingId = `group-${bucket}`;

  return (
    <section aria-labelledby={headingId} style={{ marginBottom: 20 }}>
      {/* The disclosure pattern: the heading CONTAINS the button, never the
          other way round. A heading inside a <button> is invalid content (a
          button's children are presentational), so the group lost its
          heading and the button's name ran the two together. The h2 is
          unstyled; the label span carries the look and the id the section is
          named by, so the section is "Finished", the button "Finished 3". */}
      <h2 style={{ margin: 0, font: 'inherit' }}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={`${headingId}-body`}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            minHeight: 44, padding: '8px 2px', border: 0, background: 'transparent',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block', color: tone.accent, fontSize: 13,
              transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease',
            }}
          >
            ▶
          </span>
          <span id={headingId} style={{ fontSize: 16.5, color: 'var(--mm-text-strong)', fontWeight: 900 }}>
            {label}
          </span>
          <span
            style={{
              padding: '2px 9px', borderRadius: 999, background: tone.chip,
              color: tone.accent, fontSize: 12, fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {entries.length}
          </span>
        </button>
      </h2>

      {hint && open && (
        <p style={{ margin: '0 0 10px 23px', color: 'var(--mm-text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}

      {open && (
        <div id={`${headingId}-body`} style={{ display: 'grid', gap: 13 }}>
          {entries.map((entry) => renderEntry(entry))}
        </div>
      )}
    </section>
  );
}

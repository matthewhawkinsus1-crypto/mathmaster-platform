import React from 'react';
import { SECTION_GRADE_KEYS } from '../../platform/teacher/gradeEvidence.js';

// The four lesson-section grades, wrapped so they stack on a phone.
//
// Shared by the Grade Center row and the Assignment Result screen rather than
// written twice, because two copies of a grade display drift into two different
// answers to "what did I get on the DOL?".
//
// The numbers come from splitGradesBySection() and are never recomputed here.
// A section with no questions renders nothing: an empty Warm-Up shown as 0%
// would be a grade the student never had the chance to earn.

const SECTION_LABEL = {
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: 'DOL',
};

// `shares` (optional) is the Grade Center entry's sectionShares: each section's
// share of the assignment's points, read through gradeWeightTotals() and only
// present when the shares add up to the assignment's own grade. Absent, the
// breakdown shows the section grades alone, exactly as before.
export default function GradeSectionBreakdown({ sections = {}, shares = null, hidden = false, compact = false }) {
  const present = SECTION_GRADE_KEYS
    .map((key) => ({ key, split: sections?.[key] || null }))
    .filter(({ split }) => Number(split?.total) > 0);

  if (!present.length) return null;

  return (
    <ul
      aria-label="Section grades"
      style={{
        listStyle: 'none', margin: compact ? '10px 0 0' : '14px 0 0', padding: 0,
        display: 'grid',
        // minmax(0, …) is what keeps a long label from forcing the grid wider
        // than a 390px screen; auto-fit collapses it to one column there.
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 116px), 1fr))',
        gap: 8,
      }}
    >
      {present.map(({ key, split }) => {
        // Attempted nothing is not zero percent. The section says so in words.
        const noEvidence = Number(split.attempted) === 0;
        // A Practice Pass waiver is not a completion and not "not attempted" --
        // it is an excusal, and the label must never read like a correct
        // answer or a 100%. See functions/shared/classPointRewards.mjs.
        const excused = split.excused === true;
        return (
          <li
            key={key}
            style={{
              padding: '8px 10px', borderRadius: 10, background: excused ? 'var(--mm-accent-soft)' : 'var(--mm-surface-sunken)',
              border: excused ? '1px solid var(--mm-accent-border)' : '1px solid var(--mm-border-soft)', minWidth: 0,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>
              {SECTION_LABEL[key]}
            </div>
            <div style={{ marginTop: 2, fontSize: excused || noEvidence || hidden ? 13 : 18, fontWeight: 900, color: excused ? 'var(--mm-accent-text)' : noEvidence ? 'var(--mm-text-muted)' : 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
              {hidden ? '••' : excused ? '✓ Excused (Practice Pass)' : noEvidence ? 'Not attempted' : `${split.score}%`}
            </div>
            {!excused && Number.isFinite(Number(shares?.[key]?.sharePercent)) && Number(shares?.[key]?.possibleWeight) > 0 && (
              <div data-section-share={key} style={{ marginTop: 2, fontSize: 11, color: 'var(--mm-text-muted)', overflowWrap: 'anywhere' }}>
                {shares[key].sharePercent}% of this grade
              </div>
            )}
            {!hidden && !noEvidence && !excused && Number(split.unanswered) > 0 && (
              <div style={{ marginTop: 2, fontSize: 11, color: 'var(--mm-text-muted)' }}>
                {split.attempted} of {split.total} answered
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

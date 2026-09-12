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

export default function GradeSectionBreakdown({ sections = {}, hidden = false, compact = false }) {
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
        return (
          <li
            key={key}
            style={{
              padding: '8px 10px', borderRadius: 10, background: '#f8f9fa',
              border: '1px solid #e4e7ec', minWidth: 0,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.04em', textTransform: 'uppercase', color: '#5f6368' }}>
              {SECTION_LABEL[key]}
            </div>
            <div style={{ marginTop: 2, fontSize: noEvidence || hidden ? 13 : 18, fontWeight: 900, color: noEvidence ? '#5f6368' : '#202124', overflowWrap: 'anywhere' }}>
              {hidden ? '••' : noEvidence ? 'Not attempted' : `${split.score}%`}
            </div>
            {!hidden && !noEvidence && Number(split.unanswered) > 0 && (
              <div style={{ marginTop: 2, fontSize: 11, color: '#5f6368' }}>
                {split.attempted} of {split.total} answered
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

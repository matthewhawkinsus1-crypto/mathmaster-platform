import { useMemo } from 'react';
import {
  CONFIDENCE, CONFIDENCE_LABEL,
  classDemandProfile, classDifficultyProfile, demandFindings,
} from '../../platform/teacher/cognitiveDemand.js';

/*
 * THE TWO AXES, SIDE BY SIDE, NEVER MULTIPLIED TOGETHER.
 *
 * Difficulty is how much machinery a question has. Cognitive demand is what
 * kind of thinking it asks for. They are independent, and the whole value of
 * this screen is in keeping them that way: a class failing at band 4 needs
 * something completely different from a class failing at DOK 3, and a single
 * "rigor" number would hide which one a teacher is looking at.
 *
 * Confidence is rendered as TEXT, not as opacity or a lighter shade. A faded
 * cell still reads as a result; a cell that says "too little to diagnose" does
 * not. This is the difference between exposing evidence confidence and
 * gesturing at it.
 */

const CONFIDENCE_TONE = {
  [CONFIDENCE.NONE]: { bg: '#f8f9fa', fg: '#80868b', border: '#e8eaed' },
  [CONFIDENCE.THIN]: { bg: '#fffaf0', fg: '#8a5a00', border: '#f0e0b4' },
  [CONFIDENCE.ADEQUATE]: { bg: '#fff', fg: '#202124', border: '#d8dde6' },
};

const accuracyColor = (accuracy, confidence) => {
  if (confidence !== CONFIDENCE.ADEQUATE || accuracy == null) return '#5f6368';
  if (accuracy >= 0.8) return '#12633a';
  if (accuracy >= 0.55) return '#174ea6';
  return '#9a3412';
};

function Cell({ label, sublabel, cell }) {
  const tone = CONFIDENCE_TONE[cell.confidence];
  return (
    <div style={{ padding: '13px 14px', border: `1px solid ${tone.border}`, borderRadius: 10, background: tone.bg, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368' }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: '#80868b', marginTop: 1 }}>{sublabel}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: accuracyColor(cell.accuracy, cell.confidence), fontVariantNumeric: 'tabular-nums' }}>
        {cell.accuracy == null ? '—' : `${Math.round(cell.accuracy * 100)}%`}
      </div>
      {/*
        The evidence, always, in the same place. A percentage without the
        attempts behind it is the thing this screen exists not to show.
      */}
      <div style={{ marginTop: 5, fontSize: 11.5, color: tone.fg, lineHeight: 1.4 }}>
        {cell.attempts === 0
          ? 'Never asked of this class'
          : `${cell.attempts} attempt${cell.attempts === 1 ? '' : 's'} · ${cell.students} student${cell.students === 1 ? '' : 's'}`}
      </div>
      {cell.confidence !== CONFIDENCE.ADEQUATE && (
        <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 900, letterSpacing: '.04em', textTransform: 'uppercase', color: tone.fg }}>
          {CONFIDENCE_LABEL[cell.confidence]}
        </div>
      )}
    </div>
  );
}

const DOK_SUBLABEL = {
  1: 'Recall and procedure',
  2: 'Apply and explain',
  3: 'Reason and justify',
};

const BAND_SUBLABEL = {
  1: 'Single step',
  2: 'Routine',
  3: 'Course expectation',
  4: 'Extended',
};

export default function CognitiveDemandView({
  students = [],
  profilesByStudentId = {},
  className = 'this class',
}) {
  const demand = useMemo(
    () => classDemandProfile({ students, profilesByStudentId }),
    [students, profilesByStudentId],
  );
  const difficulty = useMemo(
    () => classDifficultyProfile({ students, profilesByStudentId }),
    [students, profilesByStudentId],
  );
  const findings = useMemo(() => demandFindings({ demand, difficulty }), [demand, difficulty]);

  return (
    <section style={{ marginBottom: 26 }}>
      <h3 style={{ margin: '0 0 4px' }}>Cognitive demand and complexity</h3>
      <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: 13.5, maxWidth: '70ch', lineHeight: 1.5 }}>
        Two independent measures of {className}. <strong>Complexity</strong> is how much machinery a question has;
        <strong> demand</strong> is what kind of thinking it asks for. A class failing at band 4 needs something
        completely different from a class failing at DOK 3, so these are never combined into one number.
      </p>

      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f6368' }}>
        Cognitive demand
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 11, marginBottom: 20 }}>
        {demand.map((cell) => (
          <Cell key={cell.key} label={`DOK ${cell.dok}`} sublabel={DOK_SUBLABEL[cell.dok]} cell={cell} />
        ))}
      </div>

      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f6368' }}>
        Structural complexity
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 11, marginBottom: 20 }}>
        {difficulty.map((cell) => (
          <Cell key={cell.key} label={`Band ${cell.band}`} sublabel={BAND_SUBLABEL[cell.band]} cell={cell} />
        ))}
      </div>

      {findings.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {findings.map((finding) => {
            const tone = CONFIDENCE_TONE[finding.confidence];
            return (
              <div key={finding.kind} style={{ padding: '12px 14px', border: `1px solid ${tone.border}`, borderLeft: `3px solid ${tone.fg}`, borderRadius: 9, background: tone.bg }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{finding.headline}</div>
                <p style={{ margin: '4px 0 0', color: '#4d5b58', fontSize: 13, lineHeight: 1.5, maxWidth: '70ch' }}>
                  {finding.detail}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

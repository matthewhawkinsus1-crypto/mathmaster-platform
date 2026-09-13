import React from 'react';
import { testCycleGradeBreakdown } from '../../platform/assessment/testCycle.js';

/*
 * THE TEST CYCLE GRADE, EXPLAINED WHERE THE GRADE IS SHOWN.
 *
 *   Original Test    58%
 *   Corrections      Complete
 *   Retest           82% raw
 *   Retest policy    capped at 70%
 *   Recorded grade   70%
 *
 * A student who retested well and sees 70% will ask why. Answering it beside
 * the number — rather than in a help article nobody opens — is the difference
 * between a policy and an apparent mistake. The raw 82% stays visible because
 * they earned it; the cap is named because it is the reason.
 *
 * WHEN NOTHING RETESTED, THIS SHOWS NOTHING. A student who passed the first
 * time sees their test score and no paragraph about a cap that never applied.
 *
 * Renders `testCycleGradeBreakdown`, which is a view of the ONE canonical
 * grade rule. No arithmetic happens in this component.
 */
export const TestCycleGradeBreakdown = ({ entry, hidden = false, compact = false }) => {
  if (!entry?.isTestCycle) return null;
  const breakdown = testCycleGradeBreakdown(
    {
      assignmentId: entry.assignmentId,
      test: entry.testCycle?.originalTestGrade === null
        ? {}
        : { state: 'released', rawScore: entry.testCycle.originalTestGrade },
      retest: entry.testCycle?.rawRetestGrade === null
        ? {}
        : { state: 'released', rawScore: entry.testCycle.rawRetestGrade },
    },
    entry.assignment?.assessmentPolicy,
  );
  if (!breakdown.rows.length) return null;
  // A cycle that never needed a retest is just a test score, and the row above
  // already shows it.
  if (breakdown.simple && compact) return null;

  return (
    <dl
      aria-label="Test Cycle grade detail"
      style={{
        display: 'grid', gap: 6, margin: compact ? '10px 0 0' : '14px 0 0',
        padding: '11px 13px', background: '#f8f9fa', borderRadius: 10, border: '1px solid #e3e6ea',
      }}
    >
      {breakdown.rows.map((row) => (
        <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <dt style={{ color: '#5f6368', fontSize: 12 }}>{row.label}</dt>
          <dd style={{ margin: 0, fontSize: 12, fontWeight: row.key === 'recordedGrade' ? 900 : 700, color: '#202124' }}>
            {hidden ? '••' : row.value}
          </dd>
        </div>
      ))}
      {!hidden && breakdown.retestCapApplied && (
        <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.5, color: '#5f6368' }}>
          Your raw retest score is kept exactly as you earned it. District policy is that the highest
          grade a retest can record is {breakdown.maxRecordedGrade}%.
        </p>
      )}
    </dl>
  );
};

export default TestCycleGradeBreakdown;

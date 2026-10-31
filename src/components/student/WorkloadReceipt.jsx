import { familyWorkloadSummary } from '../../../functions/shared/workloadReceipt.mjs';

export default function WorkloadReceipt({ receipt, assignment = null, family = false, showGrade = false }) {
  if (!receipt) return null;
  return (
    <section aria-label="Your required questions" data-workload-receipt style={{ marginTop: 10, overflowWrap: 'anywhere', fontSize: 'calc(14 * var(--mm-px))' }}>
      <p style={{ margin: '4px 0' }}>{receipt.text}</p>
      <p style={{ margin: '4px 0' }}>{receipt.progressText}.</p>
      {receipt.kind === 'retroactive-grade-correction' && <p>Retroactive grade correction. These totals were approved later; they do not describe what was assigned on the original date.</p>}
      {(showGrade || family) && receipt.gradeCorrection && <p>Approved grade: {receipt.gradeCorrection.approvedGrade === null ? 'No grade recorded' : `${receipt.gradeCorrection.approvedGrade}%`}.</p>}
      {receipt.reasons.length > 0 && <details><summary>Why the number of required questions differs</summary><ul>{receipt.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
      {family && <details><summary>Family workload summary</summary><p>This summary is for this student’s family. Share it through your school’s approved private channel.</p><textarea aria-label="Family workload summary" readOnly rows={7} value={familyWorkloadSummary({ assignment, receipt })} style={{ width: '100%', boxSizing: 'border-box' }} /></details>}
    </section>
  );
}

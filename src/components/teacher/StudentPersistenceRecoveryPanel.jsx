import { useState } from 'react';
import {
  applyWorkspaceDraftRecovery,
  getStudentPersistenceRecoveryReport,
  sweepAllStudentResponseCheckpoints,
} from '../../services/persistenceRecoveryService.js';

/*
 * "THE CLASS WAS WORKING AND THE GRADEBOOK IS EMPTY."
 *
 * This panel exists to answer that sentence. For one assignment and one class
 * it puts three numbers next to each other per student:
 *
 *   ATTEMPTED    questions the canonical grade record can prove.
 *   WORKED       questions the student's own live session said they answered.
 *   UNACCOUNTED  the gap. Work that happened and was not recorded.
 *
 * Presence is never evidence of correctness and never becomes a grade. It is
 * evidence that somebody was working, which is exactly what turns a missing
 * record from an absence into a discrepancy a teacher can act on.
 *
 * Underneath, the row says where the missing work still is — server-held
 * checkpoints, workspace drafts, or a queue on a Chromebook that has not
 * reconnected — and what is blocking each one. Nothing here deletes anything,
 * and the only action that writes a grade is the explicit draft recovery, which
 * is a dry run until a teacher commits it.
 */

const CARD = { border: '1px solid #dadce0', borderRadius: 12, padding: 16, background: '#fff' };
const BUTTON = { minHeight: 40, padding: '8px 14px', border: 0, borderRadius: 8, fontWeight: 800, cursor: 'pointer' };
const CELL = { padding: '8px 10px', borderBottom: '1px solid #f1f3f4', fontSize: 13, textAlign: 'left' };

const clock = (value) => (Number(value) ? new Date(Number(value)).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—');

/*
 * WHAT ONE DEVICE IS HOLDING FOR *THIS* ASSIGNMENT.
 *
 * A device on the release before the per-assignment breakdown existed sent one
 * aggregate across every assignment. Showing that number in an assignment
 * report is a misattribution, not an approximation: a Chromebook with three
 * pending submissions for a different assignment would read as three
 * outstanding here. So the aggregate is labelled as an aggregate and the
 * assignment's own count is reported as unknown.
 */
const describeDeviceQueue = (queue) => {
  const when = clock(queue.reportedAt);
  if (!queue.assignmentQueueKnown) {
    return `assignment queue unknown · ${queue.deviceWideQueuedGradeBearing} queued device-wide (${when})`;
  }
  return `${queue.queuedGradeBearingForAssignment} (${when})`;
};

const countList = (counts = {}) => Object.entries(counts)
  .filter(([, count]) => Number(count) > 0)
  .map(([label, count]) => `${label} ${count}`)
  .join(' · ') || '—';

export default function StudentPersistenceRecoveryPanel({ assignmentId, classId, assignmentTitle = '', className = '' }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [proposals, setProposals] = useState(null);

  const ready = Boolean(assignmentId && classId);

  const run = async (label, work) => {
    setBusy(label);
    setError(null);
    try {
      return await work();
    } catch (caught) {
      setError(caught?.message || 'That request could not be completed.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const loadReport = () => run('report', async () => {
    const next = await getStudentPersistenceRecoveryReport({ assignmentId, classId });
    setReport(next);
    setNotice(null);
    return next;
  });

  const sweepCheckpoints = () => run('sweep', async () => {
    const result = await sweepAllStudentResponseCheckpoints({ assignmentId, classId });
    // NEVER REPORT A PARTIAL SWEEP AS A FINISHED ONE. A teacher acting on
    // "examined 200" as though it were the whole assignment is how the rest of
    // the class's work stays lost.
    setNotice(result.complete
      ? `Examined all ${result.examined} outstanding checkpoint${result.examined === 1 ? '' : 's'}: ${countList(result.outcomes)}.`
      : `Examined ${result.examined} checkpoint${result.examined === 1 ? '' : 's'} so far: ${countList(result.outcomes)}. `
        + `${result.remaining || 'More'} still outstanding — this assignment is NOT fully swept. Run it again to continue.`);
    await loadReport();
    return result;
  });

  const previewDrafts = () => run('preview', async () => {
    const result = await applyWorkspaceDraftRecovery({ assignmentId, classId, commit: false });
    setProposals(result);
    setNotice(result.proposalCount
      ? `${result.proposalCount} draft response${result.proposalCount === 1 ? '' : 's'} can be recovered as attempts. Nothing has been written.`
      : 'No workspace draft meets all five recovery proofs. Every draft is preserved and listed as needing review.');
    return result;
  });

  const commitDrafts = () => run('commit', async () => {
    const result = await applyWorkspaceDraftRecovery({ assignmentId, classId, commit: true });
    const accepted = (result.applied || []).filter((entry) => entry.disposition === 'accepted').length;
    setNotice(`Recovered ${accepted} attempt${accepted === 1 ? '' : 's'} from workspace drafts.`);
    setProposals(null);
    await loadReport();
    return result;
  });

  return (
    <section style={{ ...CARD, marginTop: 16 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Submission recovery</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5f6368' }}>
            {assignmentTitle || 'This assignment'}
            {className ? ` · ${className}` : ''}
            {' · '}
            Canonical attempts compared with what students&rsquo; own sessions say they did.
          </p>
        </div>
        <button type="button" style={{ ...BUTTON, background: '#1a73e8', color: '#fff' }} disabled={!ready || Boolean(busy)} onClick={loadReport}>
          {busy === 'report' ? 'Loading…' : report ? 'Refresh' : 'Run report'}
        </button>
      </header>

      {!ready && (
        <p style={{ marginTop: 12, fontSize: 13, color: '#5f6368' }}>
          Choose an assignment and a class to review its submission records.
        </p>
      )}
      {error && <p role="alert" style={{ marginTop: 12, fontSize: 13, color: '#b3261e' }}>{error}</p>}
      {notice && <p role="status" style={{ marginTop: 12, fontSize: 13, color: '#137333' }}>{notice}</p>}

      {report && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14, fontSize: 13 }}>
            <span><strong>{report.totals.canonicalAttempted}</strong> canonical attempts</span>
            <span><strong>{report.totals.unaccountedForQuestions}</strong> unaccounted-for questions</span>
            <span><strong>{report.totals.queuedOnDevices}</strong> still queued on reporting devices for this assignment</span>
            {report.totals.devicesWithoutAssignmentBreakdown > 0 && (
              <span>
                <strong>{report.totals.devicesWithoutAssignmentBreakdown}</strong> device
                {report.totals.devicesWithoutAssignmentBreakdown === 1 ? '' : 's'} on an older release report only a
                device-wide total
              </span>
            )}
            <span><strong>{report.totals.recoverableDrafts}</strong> recoverable drafts</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button type="button" style={{ ...BUTTON, background: '#e8f0fe', color: '#1967d2' }} disabled={Boolean(busy)} onClick={sweepCheckpoints}>
              {busy === 'sweep' ? 'Finalizing…' : 'Finalize outstanding checkpoints'}
            </button>
            <button type="button" style={{ ...BUTTON, background: '#e8f0fe', color: '#1967d2' }} disabled={Boolean(busy)} onClick={previewDrafts}>
              {busy === 'preview' ? 'Checking…' : 'Preview draft recovery'}
            </button>
            {proposals?.proposalCount > 0 && (
              <button type="button" style={{ ...BUTTON, background: '#137333', color: '#fff' }} disabled={Boolean(busy)} onClick={commitDrafts}>
                {busy === 'commit' ? 'Recovering…' : `Recover ${proposals.proposalCount} draft response${proposals.proposalCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  {['Student', 'Attempted', 'Worked', 'Unaccounted', 'Checkpoints', 'Draft saved', 'On devices', 'Recovered', 'Blocked by'].map((heading) => (
                    <th key={heading} style={{ ...CELL, fontWeight: 900, borderBottom: '2px solid #dadce0' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.students.map((student) => (
                  <tr key={student.studentId} style={student.unaccountedForQuestions > 0 ? { background: '#fef7e0' } : undefined}>
                    <td style={CELL}>{student.studentName}</td>
                    <td style={CELL}>{student.canonicalAttempted} / {student.expectedQuestionCount}</td>
                    <td style={CELL}>{student.presence.answered || '—'}</td>
                    <td style={{ ...CELL, fontWeight: student.unaccountedForQuestions ? 900 : 400 }}>{student.unaccountedForQuestions || '—'}</td>
                    <td style={CELL}>{countList(student.checkpoints.byStatus)}</td>
                    <td style={CELL}>{student.workspaceDraft.present ? clock(student.workspaceDraft.savedAt) : '—'}</td>
                    <td style={CELL}>
                      {student.deviceQueues.length
                        ? student.deviceQueues.map(describeDeviceQueue).join(', ')
                        : 'not reported'}
                    </td>
                    <td style={CELL}>{student.recoveredAttempts || '—'}</td>
                    <td style={CELL}>{countList(Object.fromEntries(student.needsReview.map((item) => [`${item.source}:${item.reason}`, item.count])))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A device that has not reconnected reports nothing, and "nothing
              reported" is not "nothing queued". Saying so is the difference
              between a report a teacher can trust and one that quietly
              understates the incident. */}
          <p style={{ marginTop: 10, fontSize: 12, color: '#5f6368' }}>
            A Chromebook can only report its own queue after it reconnects and the student signs in.
            <strong> not reported</strong> means no device has said anything yet — never that nothing is waiting.
            <strong> assignment queue unknown</strong> means that device is on an older release and could only send a
            total across every assignment; its number is not this assignment&rsquo;s.
          </p>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import {
  applyWorkspaceDraftRecovery,
  getStudentPersistenceRecoveryReport,
  resolveStudentPersistenceHold,
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
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [commitSummary, setCommitSummary] = useState(null);
  // The one student whose unrecoverable discrepancy is being acknowledged, and
  // the reason the teacher typed. Null whenever no confirmation is open.
  const [resolutionTarget, setResolutionTarget] = useState(null);
  const [resolutionReason, setResolutionReason] = useState('');

  const ready = Boolean(assignmentId && classId);

  /*
   * STATE BELONGS TO A TARGET, NOT TO THE COMPONENT.
   *
   * Changing the assignment dropdown swaps these props without remounting, so
   * a preview run against assignment A would otherwise still be sitting here
   * when assignment B is selected: A's proposal count enables the button, and
   * the commit sends B's ids. A teacher could write recovered grades for an
   * assignment they never previewed. The mount site keys this component by both
   * ids so it remounts; this clears the state anyway, so the component is
   * correct wherever it is mounted.
   */
  useEffect(() => {
    setReport(null);
    setProposals(null);
    setNotice(null);
    setError(null);
    setConfirmationOpen(false);
    setCommitSummary(null);
    setResolutionTarget(null);
    setResolutionReason('');
  }, [assignmentId, classId]);

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
    /*
     * THE WRITE PATH CHECKS THE TARGET ITSELF.
     *
     * Clearing state on a prop change is the tidy fix; this is the one that
     * makes it impossible. Recovery writes canonical grades, so it happens only
     * against the exact assignment and class the proposals were computed for —
     * which the server named in its own dry-run response.
     */
    if (proposals?.assignmentId !== assignmentId || proposals?.classId !== classId) {
      setError('Preview this assignment before recovering it — the proposals on screen were computed for a different one.');
      return null;
    }
    const previewTokens = proposals.proposals.map((proposal) => proposal.previewToken);
    const result = await applyWorkspaceDraftRecovery({ assignmentId, classId, commit: true, previewTokens });
    const appliedByAction = new Map((result.applied || []).map((entry) => [entry.actionId, entry]));
    const summary = (result.applied || []).reduce((counts, entry) => {
      const disposition = ['accepted', 'duplicate', 'superseded', 'needs-review', 'retryable'].includes(entry.disposition)
        ? entry.disposition : 'retryable';
      counts[disposition] += 1;
      return counts;
    }, { accepted: 0, duplicate: 0, superseded: 0, 'needs-review': 0, retryable: 0 });
    setCommitSummary(summary);
    setNotice(`Recovery finished for ${result.applied?.length || 0} proposed response${result.applied?.length === 1 ? '' : 's'}.`);
    const unresolved = proposals.proposals
      .map((proposal) => {
        const rawOutcome = appliedByAction.get(proposal.actionId) || { disposition: 'retryable', reason: 'no-result-returned' };
        const knownDisposition = ['accepted', 'duplicate', 'superseded', 'needs-review', 'retryable'].includes(rawOutcome.disposition);
        const disposition = knownDisposition ? rawOutcome.disposition : 'retryable';
        return {
          ...proposal,
          outcome: {
            ...rawOutcome,
            disposition,
            reason: rawOutcome.reason || (!knownDisposition ? `unexpected-disposition:${rawOutcome.disposition || 'missing'}` : null),
          },
        };
      })
      // accepted/duplicate/superseded are terminal. The refreshed report owns
      // their new canonical state; only rows that still need human/retry action stay here.
      .filter((proposal) => ['needs-review', 'retryable'].includes(proposal.outcome.disposition));
    setProposals({ ...proposals, proposalCount: 0, proposals: unresolved });
    setConfirmationOpen(false);
    await loadReport();
    return result;
  });

  /*
   * THE ONLY HOLD A HUMAN MAY CLOSE, AND ONLY AFTER SEEING IT.
   *
   * `session-summary-gap` is the one reason that can be permanently true with
   * nothing left to recover. Every other reason names a concrete artifact that
   * still exists — a queued submission, a checkpoint, a recoverable draft — so
   * the action is offered only when the gap is the ONLY thing blocking, and the
   * server refuses it otherwise.
   *
   * The two numbers the teacher was shown go back with the call. If the
   * evidence has changed since this row was rendered, the server refuses rather
   * than closing an incident nobody looked at.
   */
  const resolvableHold = (student) => Boolean(
    student.persistencePending
    && (student.persistencePendingReasons || []).length === 1
    && (student.persistencePendingReasons || [])[0] === 'session-summary-gap',
  );

  const resolveHold = () => run('resolve', async () => {
    const target = resolutionTarget;
    if (!target) return null;
    const reason = resolutionReason.trim();
    if (!reason) {
      setError('Record why this discrepancy is unrecoverable before resolving it.');
      return null;
    }
    const result = await resolveStudentPersistenceHold({
      studentId: target.studentId,
      assignmentId,
      classId,
      reason,
      acknowledgedWorked: target.presence.answered,
      acknowledgedCanonicalAttempted: target.canonicalAttempted,
    });
    setResolutionTarget(null);
    setResolutionReason('');
    setNotice(
      `Technical persistence hold resolved for ${target.studentName}. No grade, attempt or score was created; `
      + 'finalization now proceeds on the canonical evidence that exists.',
    );
    await loadReport();
    return result;
  });

  const affectedStudents = new Set(proposals?.proposals?.map((proposal) => proposal.studentId) || []).size;

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
          {busy === 'report' ? 'Loading…' : report ? 'Refresh report' : 'Run recovery report'}
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
          <div role="status" style={{ ...CARD, marginTop: 12, background: '#f8fafd', fontSize: 13 }}>
            <strong>Persistence health:</strong>{' '}
            ingestion {report.persistenceHealth?.ingestionService || 'unknown'} · device reporting {report.persistenceHealth?.deviceReportingService || 'unknown'} ·{' '}
            {report.persistenceHealth?.queuedGradeBearing || 0} grade-bearing item(s) queued
            {report.persistenceHealth?.oldestQueuedActionAt ? ` · oldest ${clock(report.persistenceHealth.oldestQueuedActionAt)}` : ''}
          </div>
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
            <div>
              <button type="button" style={{ ...BUTTON, background: '#e8f0fe', color: '#1967d2' }} disabled={Boolean(busy)} onClick={sweepCheckpoints}>
                {busy === 'sweep' ? 'Finalizing…' : 'Finalize outstanding checkpoints'}
              </button>
              <div style={{ maxWidth: 480, marginTop: 4, fontSize: 11, color: '#5f6368' }}>Checks server-held responses that may be safely finalized under the original assignment deadline and grading rules.</div>
            </div>
            <button type="button" style={{ ...BUTTON, background: '#e8f0fe', color: '#1967d2' }} disabled={Boolean(busy)} onClick={previewDrafts}>
              {busy === 'preview' ? 'Checking…' : 'Preview draft recovery'}
            </button>
            {proposals?.proposalCount > 0 && (
              <button type="button" style={{ ...BUTTON, background: '#137333', color: '#fff' }} disabled={Boolean(busy)} onClick={() => setConfirmationOpen(true)}>
                {busy === 'commit' ? 'Recovering…' : `Recover ${proposals.proposalCount} draft response${proposals.proposalCount === 1 ? '' : 's'}`}
              </button>
            )}
          </div>

          {commitSummary && (
            <div role="status" style={{ marginTop: 14, padding: 12, borderRadius: 8, background: '#e6f4ea', fontSize: 13 }}>
              <strong>Recovery result:</strong> Accepted {commitSummary.accepted} · Duplicate {commitSummary.duplicate} · Superseded {commitSummary.superseded} · Needs review {commitSummary['needs-review']} · Failed/retryable {commitSummary.retryable}
            </div>
          )}

          {proposals?.proposals?.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <h4 style={{ margin: '0 0 8px' }}>{proposals.proposalCount > 0 ? 'Draft responses proposed for recovery' : 'Responses that were not recovered'}</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead><tr>{['Student', 'Student ID', 'Question', 'Question ID', 'Section / role', 'Draft saved', 'Academic time recorded', 'Why eligible', 'Current canonical status', 'Proposed result', 'Outcome'].map((heading) => <th key={heading} style={{ ...CELL, fontWeight: 900, borderBottom: '2px solid #dadce0' }}>{heading}</th>)}</tr></thead>
                <tbody>{proposals.proposals.map((proposal) => (
                  <tr key={proposal.actionId}>
                    <td style={CELL}>{proposal.studentName}</td><td style={CELL}>{proposal.studentId}</td>
                    <td style={CELL}>{proposal.questionNumber}</td><td style={CELL}>{proposal.questionId || '—'}</td>
                    <td style={CELL}>{proposal.activityRole}</td><td style={CELL}>{clock(proposal.savedAt)}</td>
                    <td style={CELL}>{clock(proposal.academicOccurredAt)}</td><td style={CELL}>{proposal.qualificationReason}</td>
                    <td style={CELL}>{proposal.canonicalStatus}</td><td style={CELL}>{proposal.proposedResult}</td>
                    <td style={CELL}>{proposal.outcome ? `${proposal.outcome.disposition}: ${proposal.outcome.reason || 'not accepted'}` : 'Pending teacher approval'}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p style={{ fontSize: 12, color: '#5f6368' }}>Nothing in this preview writes a grade. Answers and answer keys are not shown.</p>
            </div>
          )}

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>
                  {['Student', 'Attempted', 'Worked', 'Unaccounted', 'Checkpoints', 'Draft saved', 'On devices', 'Recovered', 'Blocked by', 'Resolution'].map((heading) => (
                    <th key={heading} style={{ ...CELL, fontWeight: 900, borderBottom: '2px solid #dadce0' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.students.map((student) => (
                  <tr key={student.studentId} style={student.persistencePending ? { background: '#fef7e0' } : undefined}>
                    <td style={CELL}>
                      {student.studentName}
                      {/* Name the DISCREPANCY, not just the state. A teacher
                          deciding whether work is unrecoverable needs to see
                          which evidence disagrees with the gradebook before
                          they are offered a way to accept it. */}
                      {student.persistencePending && resolvableHold(student) ? (
                        <><br /><strong>Sync pending — session evidence exceeds recorded attempts</strong></>
                      ) : null}
                      {student.persistencePending && !resolvableHold(student) ? (
                        <><br /><strong>Sync pending</strong></>
                      ) : null}
                    </td>
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
                    <td style={CELL}>{countList(Object.fromEntries([
                      ...student.needsReview.map((item) => [`${item.source}:${item.reason}`, item.count]),
                      ...(student.persistencePendingReasons || []).map((reason) => [`pending:${reason}`, 1]),
                    ]))}</td>
                    <td style={CELL}>
                      {resolvableHold(student) ? (
                        <button
                          type="button"
                          style={{ ...BUTTON, background: '#fce8e6', color: '#b3261e', minHeight: 32, padding: '6px 10px', fontSize: 12 }}
                          disabled={Boolean(busy)}
                          onClick={() => { setResolutionTarget(student); setResolutionReason(''); }}
                        >
                          Resolve technical persistence hold
                        </button>
                      ) : null}
                      {/* A resolution is a closed incident, not a cleared one:
                          the discrepancy is still shown above, and this says
                          who accepted it and when. */}
                      {student.persistenceResolution && !student.persistenceResolution.supersededByNewEvidence ? (
                        <span style={{ fontSize: 11, color: '#5f6368' }}>
                          Resolved by {student.persistenceResolution.resolvedByEmail || 'a teacher of record'}
                          {' · '}{clock(student.persistenceResolution.resolvedAt)}
                        </span>
                      ) : null}
                      {student.persistenceResolution?.supersededByNewEvidence ? (
                        <span style={{ fontSize: 11, color: '#b3261e' }}>
                          Earlier resolution no longer applies — new evidence appeared.
                        </span>
                      ) : null}
                      {!resolvableHold(student) && !student.persistenceResolution ? '—' : null}
                    </td>
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
            A Chromebook can only report work stored on that device after the student signs back in using the same browser profile.
            <strong> Do not clear browser data on affected student Chromebooks until recovery is complete.</strong>
            <strong> not reported</strong> means no device has said anything yet — never that nothing is waiting.
            <strong> assignment queue unknown</strong> means that device is on an older release and could only send a
            total across every assignment; its number is not this assignment&rsquo;s.
            <strong> 0 queued for this assignment</strong> means a reporting device supplied an assignment-specific count of zero.
          </p>
        </>
      )}

      {confirmationOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="recovery-confirm-title" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(32,33,36,.55)' }}>
          <div style={{ ...CARD, width: 'min(520px, 100%)', boxShadow: '0 12px 40px rgba(0,0,0,.28)' }}>
            <h3 id="recovery-confirm-title" style={{ marginTop: 0 }}>Recover these saved responses as graded attempts?</h3>
            <p>MathMaster will grade each response on the server using the original assignment question and attempt rules. Existing newer attempts will not be overwritten.</p>
            <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 6, fontSize: 13 }}>
              <dt>Class</dt><dd style={{ margin: 0, fontWeight: 800 }}>{className || classId}</dd>
              <dt>Assignment</dt><dd style={{ margin: 0, fontWeight: 800 }}>{assignmentTitle || assignmentId}</dd>
              <dt>Responses</dt><dd style={{ margin: 0, fontWeight: 800 }}>{proposals?.proposalCount || 0}</dd>
              <dt>Students affected</dt><dd style={{ margin: 0, fontWeight: 800 }}>{affectedStudents}</dd>
            </dl>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" style={{ ...BUTTON, background: '#f1f3f4' }} onClick={() => setConfirmationOpen(false)}>Cancel</button>
              <button type="button" style={{ ...BUTTON, background: '#137333', color: '#fff' }} disabled={Boolean(busy)} onClick={commitDrafts}>Recover responses</button>
            </div>
          </div>
        </div>
      )}

      {resolutionTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="resolve-hold-title" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(32,33,36,.55)' }}>
          <div style={{ ...CARD, width: 'min(560px, 100%)', boxShadow: '0 12px 40px rgba(0,0,0,.28)' }}>
            <h3 id="resolve-hold-title" style={{ marginTop: 0 }}>Resolve technical persistence hold?</h3>
            {/* THE EXACT MEANING OF THE ACTION, IN THE DIALOG THAT TAKES IT. */}
            <p style={{ fontWeight: 800 }}>
              I acknowledge the unrecoverable discrepancy and permit normal finalization using the canonical
              evidence that exists.
            </p>
            <p style={{ fontSize: 13 }}>
              This creates <strong>no grade, no attempt and no zero</strong>. Nothing in {resolutionTarget.studentName}&rsquo;s
              record changes. Only the safety hold on the final Google Classroom passback is released, and only for the
              discrepancy shown here.
            </p>
            <dl style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 6, fontSize: 13 }}>
              <dt>Student</dt><dd style={{ margin: 0, fontWeight: 800 }}>{resolutionTarget.studentName}</dd>
              <dt>Assignment</dt><dd style={{ margin: 0, fontWeight: 800 }}>{assignmentTitle || assignmentId}</dd>
              <dt>Session says worked</dt><dd style={{ margin: 0, fontWeight: 800 }}>{resolutionTarget.presence.answered}</dd>
              <dt>Canonical attempts</dt><dd style={{ margin: 0, fontWeight: 800 }}>{resolutionTarget.canonicalAttempted}</dd>
              <dt>Unaccounted for</dt><dd style={{ margin: 0, fontWeight: 900 }}>{resolutionTarget.unaccountedForQuestions}</dd>
            </dl>
            <label htmlFor="resolve-hold-reason" style={{ display: 'block', marginTop: 14, fontSize: 13, fontWeight: 800 }}>
              Why is this discrepancy unrecoverable?
            </label>
            <textarea
              id="resolve-hold-reason"
              rows={3}
              value={resolutionReason}
              onChange={(event) => setResolutionReason(event.target.value.slice(0, 500))}
              style={{ width: '100%', marginTop: 6, padding: 8, borderRadius: 8, border: '1px solid #dadce0', fontSize: 13 }}
              placeholder="e.g. Chromebook was reimaged by IT on the 16th; the queued responses are gone."
            />
            <p style={{ fontSize: 12, color: '#5f6368' }}>
              Recorded with your name and the time. If concrete recoverable evidence appears later — a Chromebook
              reconnects and reports queued work — the hold becomes active again.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" style={{ ...BUTTON, background: '#f1f3f4' }} onClick={() => { setResolutionTarget(null); setResolutionReason(''); }}>Cancel</button>
              <button
                type="button"
                style={{ ...BUTTON, background: '#b3261e', color: '#fff' }}
                disabled={Boolean(busy) || !resolutionReason.trim()}
                onClick={resolveHold}
              >
                {busy === 'resolve' ? 'Resolving…' : 'Acknowledge and resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

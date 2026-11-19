import { useEffect, useState } from 'react';
import { inspectStudentResponse, overrideStudentResponseGrade } from '../../services/responseInspectorService.js';
import Dialog from '../../ui/Dialog.jsx';
import { STUDENT_NAME_UNAVAILABLE, resolveRosterStudentName, studentIdLabel } from '../../platform/studentName.js';
import ResponseInspectorReasons from './ResponseInspectorReasons.jsx';
import ResponseInspectorFieldView from './ResponseInspectorFieldView.jsx';

/*
 * The teacher's Response Inspector & Grade Override (#249): one attempt, read
 * from the inspectStudentResponse callable, which decides who may see it. The
 * same screen is opened from the gradebook, a Case Review and Live View.
 *
 * Laid out for a phone too: the dialog's padding narrows with the screen, the
 * header and the controls wrap, and the field comparison scrolls sideways in
 * its own named region instead of widening the page.
 */
const show = (value) => value === null || value === undefined ? 'Unavailable' : typeof value === 'string' ? value || 'Unavailable' : JSON.stringify(value);
// A saved time is milliseconds: shown as the teacher's own date and time.
const when = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString() : show(value));
const reasons = ['Correct response was incorrectly graded', 'Equivalent answer accepted by teacher', 'Partial credit awarded', 'Platform/grader issue', 'Other'];
const statusLabel = (status) => (status === 'correct' ? 'Correct' : status === 'partial' ? 'Partial credit' : 'Incorrect');

export default function StudentResponseInspector({ studentId, assignmentId, questionIndex, onClose, onChanged, studentIdentityIndex = null }) {
  const [model, setModel] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(reasons[0]); const [note, setNote] = useState(''); const [manualScore, setManualScore] = useState('');
  const load = async () => { setBusy(true); setError(''); try { setModel(await inspectStudentResponse({ studentId, assignmentId, questionIndex })); } catch (cause) { setError(cause?.message || 'Response inspection failed.'); } finally { setBusy(false); } };
  useEffect(() => { load(); }, [studentId, assignmentId, questionIndex]);
  const act = async (action, extra = {}) => { setBusy(true); setError(''); try { await overrideStudentResponseGrade({ studentId, assignmentId, questionIndex, action, reason, note, ...extra }); await load(); onChanged?.(); } catch (cause) { setError(cause?.message || 'The grade could not be changed.'); setBusy(false); } };
  const parts = model?.automaticResult?.parts || [];
  // The roster name by id first, then the report's copy if it is really a
  // name; with neither, "Name unavailable" and the id labelled as an id.
  const inspectedStudentId = String(model?.student?.id || studentId || '');
  const inspectedStudentName = resolveRosterStudentName({
    studentId: inspectedStudentId, index: studentIdentityIndex instanceof Map ? studentIdentityIndex : null,
    historicalName: model?.student?.name, lastFirst: false,
  });
  return <Dialog closeOnEscape={false} onClose={onClose} aria-label="Student Response Inspector" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(32,33,36,.62)', overflowY: 'auto', padding: 'clamp(8px, 3vw, 24px)' }}>
    <div data-response-inspector="" style={{ maxWidth: 1180, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 14, padding: 'clamp(12px, 3vw, 24px)', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere', textAlign: 'left' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}><h2 style={{ margin: 0, minWidth: 0 }}>Student Response Inspector &amp; Grade Override</h2><button type="button" className="tw-btn tw-btn--sm" onClick={onClose}>Close</button></div>
      {error && <p role="alert" style={{ color: 'var(--mm-error-text)', fontWeight: 700 }}>{error}</p>}
      {busy && !model ? <p role="status">Loading response evidence…</p> : model && <>
        <section aria-labelledby="inspector-summary"><h3 id="inspector-summary">Response Summary</h3><p><strong>{inspectedStudentName}</strong>{inspectedStudentName === STUDENT_NAME_UNAVAILABLE && inspectedStudentId ? <span style={{ color: 'var(--mm-text-muted)' }}> · {studentIdLabel(inspectedStudentId)}</span> : null} · {model.assignment.title} ({show(model.assignment.id)})</p><p>{model.section.title} · {model.section.role} · Question {show(model.question.id)} · Attempt {show(model.attemptNumber)}</p><p>{model.question.prompt}</p><p><strong>Automatic result:</strong> {model.automaticResult?.isCorrect ? 'Correct' : 'Incorrect'} / {model.automaticScore}% · <strong>Teacher-assigned result:</strong> {statusLabel(model.effectiveStatus.status)} / {model.assignedScore}% {model.override ? '· Override active' : ''}</p></section>
        <section aria-labelledby="inspector-fields"><h3 id="inspector-fields">Field Comparison</h3><p style={{ color: 'var(--mm-text-muted)' }}>Saved Workspace is the latest server-backed graded-session workspace. Submitted Snapshot is immutable when available. Legacy values are historical grader-recorded fields and are not claimed as exact snapshots.</p>
          <ResponseInspectorFieldView model={model} />
          <p><strong>Workspace timing:</strong> {model.states.workspace?.available ? `${model.states.workspace.relationToSubmission} relative to submission · variant ${model.states.workspace.variantIndex} · saved ${when(model.timestamps.workspaceSavedAt)}` : model.states.workspace?.reason || 'Unavailable'}</p>
        </section>
        <section aria-labelledby="inspector-why"><h3 id="inspector-why">Why was this marked wrong?</h3><ResponseInspectorReasons diagnosis={model.diagnosis} /><details><summary style={{ padding: '6px 0', cursor: 'pointer' }}>Underlying values and technical details</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ states: model.states, expected: model.expected, expectedAvailable: model.expectedAvailable, expectedUnavailableReason: model.expectedUnavailableReason, result: model.automaticResult, timestamps: model.timestamps, versions: model.versions }, null, 2)}</pre></details></section>
        <section aria-labelledby="inspector-replay"><h3 id="inspector-replay">Replay Grading</h3>{model.replay.available ? <><p>Adapter: {model.replay.adapter} · Original: {show(model.replay.originalScore)}% · Current replay: {model.replay.currentScore}%</p>{model.replay.discrepancy ? <p style={{ color: 'var(--mm-error-text)', fontWeight: 900 }}>Grading discrepancy detected</p> : <p>No grading discrepancy detected.</p>}{model.correctedGrade && !model.correctedGrade.apply ? <p id="inspector-corrected-grade-held" data-corrected-grade-held="">{model.correctedGrade.reason}</p> : null}<button type="button" className="tw-btn tw-btn--sm" disabled={busy || model.correctedGrade?.apply === false} aria-describedby={model.correctedGrade && !model.correctedGrade.apply ? 'inspector-corrected-grade-held' : undefined} onClick={() => act('applyReplay')}>Apply Corrected Grade</button></> : <p>{model.replay.reason}</p>}</section>
        <section aria-labelledby="inspector-actions"><h3 id="inspector-actions">Grading Actions</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center' }}><label>Required reason <select className="tw-select" value={reason} onChange={(event) => setReason(event.target.value)} style={{ maxWidth: '100%' }}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label><label>Optional note <input className="tw-input" value={note} onChange={(event) => setNote(event.target.value)} style={{ maxWidth: '100%' }} /></label></div><div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}><button type="button" className="tw-btn tw-btn--sm" disabled={busy} onClick={() => act('grantFullCredit')}>Grant Full Credit</button>{parts.filter((part) => part.graded !== false).map((part) => <button type="button" className="tw-btn tw-btn--sm" key={part.id} disabled={busy} onClick={() => act('grantPartCredit', { fieldId: part.id, score: 100 })}>Grant Credit for {part.label || part.id}</button>)}<input className="tw-input" aria-label="Manual score" type="number" min="0" max="100" value={manualScore} onChange={(event) => setManualScore(event.target.value)} style={{ maxWidth: '100%', width: 90 }} /><button type="button" className="tw-btn tw-btn--sm" disabled={busy || manualScore === '' || !Number.isFinite(Number(manualScore)) || Number(manualScore) < 0 || Number(manualScore) > 100} onClick={() => act('setScore', { score: Number(manualScore) })}>Set Score</button><button type="button" className="tw-btn tw-btn--sm" disabled={busy || !model.override} onClick={() => act('restoreAutomatic')}>Restore Automatic Score</button></div></section>
        <section aria-labelledby="inspector-audit"><h3 id="inspector-audit">Audit History</h3>{model.auditHistory.length ? <ol>{model.auditHistory.map((event, index) => <li key={`${event.at}-${index}`}>{show(event.at)} · {event.actor?.name || event.actor?.email || event.actor?.uid || 'Unavailable'} · {event.previousScore}% → {event.newScore}% · {event.reason}{event.note ? ` — ${event.note}` : ''}</li>)}</ol> : <p>Unavailable</p>}</section>
      </>}
    </div>
  </Dialog>;
}

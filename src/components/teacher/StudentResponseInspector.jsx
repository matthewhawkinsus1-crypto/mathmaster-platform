import { useEffect, useState } from 'react';
import { inspectStudentResponse, overrideStudentResponseGrade } from '../../services/responseInspectorService.js';

const show = (value) => value === null || value === undefined ? 'Unavailable' : typeof value === 'string' ? value || 'Unavailable' : JSON.stringify(value);
const reasons = ['Correct response was incorrectly graded', 'Equivalent answer accepted by teacher', 'Partial credit awarded', 'Platform/grader issue', 'Other'];
const fieldMap = (state) => state?.kind === 'fields' ? Object.fromEntries((state.fields || []).map((field) => [field.id, field.value])) : state?.value ?? state;
const workspaceValue = (workspace, fieldId) => {
  if (!workspace?.available) return null;
  for (const entry of workspace.entries || []) {
    if (entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value) && Object.prototype.hasOwnProperty.call(entry.value, fieldId)) return entry.value[fieldId];
  }
  return workspace.entries?.length === 1 ? workspace.entries[0].value : workspace.entries?.map((entry) => ({ scope: entry.scope, value: entry.value }));
};

export default function StudentResponseInspector({ studentId, assignmentId, questionIndex, onClose, onChanged }) {
  const [model, setModel] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(reasons[0]); const [note, setNote] = useState(''); const [manualScore, setManualScore] = useState('');
  const load = async () => { setBusy(true); setError(''); try { setModel(await inspectStudentResponse({ studentId, assignmentId, questionIndex })); } catch (cause) { setError(cause?.message || 'Response inspection failed.'); } finally { setBusy(false); } };
  useEffect(() => { load(); }, [studentId, assignmentId, questionIndex]);
  const act = async (action, extra = {}) => { setBusy(true); setError(''); try { await overrideStudentResponseGrade({ studentId, assignmentId, questionIndex, action, reason, note, ...extra }); await load(); onChanged?.(); } catch (cause) { setError(cause?.message || 'The grade could not be changed.'); setBusy(false); } };
  const parts = model?.automaticResult?.parts || [];
  const submitted = fieldMap(model?.states?.submitted); const legacy = fieldMap(model?.states?.legacyRecorded);
  const traces = new Map((model?.states?.gradingTrace?.fields || []).map((field) => [String(field.id), field]));
  return <div role="dialog" aria-modal="true" aria-label="Student Response Inspector" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(32,33,36,.62)', overflowY: 'auto', padding: 24 }}>
    <main style={{ maxWidth: 1180, margin: '0 auto', background: '#fff', borderRadius: 14, padding: 24, color: '#202124' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h2 style={{ margin: 0 }}>Student Response Inspector &amp; Grade Override</h2><button onClick={onClose}>Close</button></div>
      {error && <p role="alert" style={{ color: '#b3261e', fontWeight: 700 }}>{error}</p>}
      {busy && !model ? <p>Loading response evidence…</p> : model && <>
        <section><h3>Response Summary</h3><p><strong>{model.student.name}</strong> · {model.assignment.title} ({show(model.assignment.id)})</p><p>{model.section.title} · {model.section.role} · Question {show(model.question.id)} · Attempt {show(model.attemptNumber)}</p><p>{model.question.prompt}</p><p><strong>Automatic result:</strong> {model.automaticResult?.isCorrect ? 'Correct' : 'Incorrect'} / {model.automaticScore}% · <strong>Teacher-assigned result:</strong> {model.effectiveStatus.status === 'correct' ? 'Correct' : model.effectiveStatus.status === 'partial' ? 'Partial credit' : 'Incorrect'} / {model.assignedScore}% {model.override ? '· Override active' : ''}</p></section>
        <section><h3>Field Comparison</h3><p style={{ color: '#5f6368' }}>Saved Workspace is the latest server-backed graded-session workspace. Submitted Snapshot is immutable when available. Legacy values are historical grader-recorded fields and are not claimed as exact snapshots.</p>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th>Part</th><th>Saved Workspace</th><th>Submitted Snapshot</th><th>Recorded grader response (legacy)</th><th>Normalized/comparison trace</th><th>Expected</th><th>Automatic Result</th></tr></thead><tbody>{(parts.length ? parts : [{ id: 'response' }]).map((part) => { const trace = traces.get(String(part.id)); return <tr key={part.id} style={{ borderTop: '1px solid #dadce0' }}><td>{part.label || part.id}</td><td>{show(workspaceValue(model.states.workspace, part.id))}</td><td>{show(submitted?.[part.id] ?? submitted)}</td><td>{show(legacy?.[part.id] ?? legacy)}</td><td>{trace?.normalizedAvailable ? show(trace.normalized) : trace?.normalizedUnavailableReason || 'Unavailable — grader does not expose normalized representation'}</td><td>{show(model.expectedAvailable === false ? model.expectedUnavailableReason : (trace?.expected ?? model.expected?.[part.id] ?? model.expected))}</td><td>{part.isCorrect ? 'Correct' : 'Incorrect'} · {part.credit ?? (part.isCorrect ? 1 : 0)}</td></tr>; })}</tbody></table></div>
          <p><strong>Workspace timing:</strong> {model.states.workspace?.available ? `${model.states.workspace.relationToSubmission} relative to submission · variant ${model.states.workspace.variantIndex} · saved ${show(model.timestamps.workspaceSavedAt)}` : model.states.workspace?.reason || 'Unavailable'}</p>
        </section>
        <section><h3>Why was this marked wrong?</h3><p>{model.diagnosis.explanation}</p><details><summary>Underlying values and technical details</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ states: model.states, expected: model.expected, expectedAvailable: model.expectedAvailable, expectedUnavailableReason: model.expectedUnavailableReason, result: model.automaticResult, timestamps: model.timestamps, versions: model.versions }, null, 2)}</pre></details></section>
        <section><h3>Replay Grading</h3>{model.replay.available ? <><p>Adapter: {model.replay.adapter} · Original: {show(model.replay.originalScore)}% · Current replay: {model.replay.currentScore}%</p>{model.replay.discrepancy ? <p style={{ color: '#b3261e', fontWeight: 900 }}>Grading discrepancy detected</p> : <p>No grading discrepancy detected.</p>}<button disabled={busy} onClick={() => act('applyReplay')}>Apply Corrected Grade</button></> : <p>{model.replay.reason}</p>}</section>
        <section><h3>Grading Actions</h3><label>Required reason <select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label><label style={{ marginLeft: 12 }}>Optional note <input value={note} onChange={(event) => setNote(event.target.value)} /></label><div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}><button disabled={busy} onClick={() => act('grantFullCredit')}>Grant Full Credit</button>{parts.filter((part) => part.graded !== false).map((part) => <button key={part.id} disabled={busy} onClick={() => act('grantPartCredit', { fieldId: part.id, score: 100 })}>Grant Credit for {part.label || part.id}</button>)}<input aria-label="Manual score" type="number" min="0" max="100" value={manualScore} onChange={(event) => setManualScore(event.target.value)} /><button disabled={busy} onClick={() => act('setScore', { score: Number(manualScore) })}>Set Score</button><button disabled={busy} onClick={() => act('restoreAutomatic')}>Restore Automatic Score</button></div></section>
        <section><h3>Audit History</h3>{model.auditHistory.length ? <ol>{model.auditHistory.map((event, index) => <li key={`${event.at}-${index}`}>{show(event.at)} · {event.actor?.name || event.actor?.email || event.actor?.uid || 'Unavailable'} · {event.previousScore}% → {event.newScore}% · {event.reason}{event.note ? ` — ${event.note}` : ''}</li>)}</ol> : <p>Unavailable</p>}</section>
      </>}
    </main>
  </div>;
}

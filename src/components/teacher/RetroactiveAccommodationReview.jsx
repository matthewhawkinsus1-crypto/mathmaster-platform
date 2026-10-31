import { useState } from 'react';
import { reviewRetroactiveAccommodation } from '../../platform/teacher/retroactiveAccommodationService.js';
import { WORKLOAD_VARIANCE_LABEL, formatPercentTenths } from '../../../functions/shared/reducedWorkload.mjs';

const roles = ['warmup', 'classwork', 'practice', 'dol', 'quiz', 'test'];
const grade = (value) => value === null || value === undefined ? 'No grade recorded' : `${value}%`;

/** Separate from saving a profile; every write requires a fresh, selected row. */
export default function RetroactiveAccommodationReview({ student, assignments = [], service = reviewRetroactiveAccommodation, onChanged = null }) {
  const [input, setInput] = useState({ percent: 20, sourceDescriptor: '', effectiveDate: '', fromDate: '', toDate: '', appliesTo: [] });
  const [rows, setRows] = useState([]);
  const [authority, setAuthority] = useState(false);
  const [selected, setSelected] = useState({});
  const [second, setSecond] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState({});
  const field = (key, value) => { setInput((current) => ({ ...current, [key]: value })); setRows([]); setSelected({}); setSecond({}); };
  const request = (action, data = {}) => service({ action, studentId: student.id, input, ...data });
  const run = async (work) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (e) { setError(e?.message || 'Review could not be completed. Preview again.'); }
    finally { setBusy(false); }
  };
  const preview = (event) => {
    event.preventDefault();
    run(async () => {
      const ids = assignments.map((a) => a.id);
      if (!ids.length) throw new Error('No assignments are available for this student.');
      const loaded = [];
      for (let start = 0; start < ids.length; start += 50) {
        const result = await request('preview', { assignmentIds: ids.slice(start, start + 50) });
        loaded.push(...result.rows);
      }
      setRows(loaded.filter((row) => row.status !== 'out-of-range'));
      setSelected({}); setSecond({});
      setMessage('Preview only. No grades, attempts or support history have changed.');
    });
  };
  const updateRow = (assignmentId, next) => setRows((old) => old.map((row) => row.assignmentId === assignmentId ? { ...row, ...next } : row));
  const loadHistory = async (assignmentId) => {
    const result = await request('history', { assignmentId });
    setHistory((old) => ({ ...old, [assignmentId]: result.rows[0] }));
  };
  const apply = (row) => run(async () => {
    const action = row.reversing ? 'reverse' : 'approve';
    const result = await request(action, { assignmentId: row.assignmentId, previewToken: row.previewToken,
      requestId: crypto.randomUUID(), confirmAuthority: authority, confirmSelected: selected[row.assignmentId] === true, confirmDecrease: second[row.assignmentId] === true });
    updateRow(row.assignmentId, { status: 'applied', correctionEventId: result.eventId, syncStatus: 'not-requested', reversing: false, appliedGrade: result.grade });
    setSelected((old) => ({ ...old, [row.assignmentId]: false }));
    await loadHistory(row.assignmentId);
    setMessage('Correction saved with a new audit event. Google Classroom sync has not been requested.');
    onChanged?.();
  });
  const reverse = (row) => run(async () => {
    const result = await request('previewReversal', { assignmentId: row.assignmentId });
    updateRow(row.assignmentId, { ...result.rows[0], reversing: true });
    setSelected((old) => ({ ...old, [row.assignmentId]: false }));
    setSecond((old) => ({ ...old, [row.assignmentId]: false }));
  });

  return (
    <details className="tw-disclosure" data-retroactive-review>
      <summary>Retroactive Accommodation Review</summary>
      <div className="tw-disclosure__body se-stack">
        <p>Correct a documented historical workload through an explicit grade correction. Saving a support profile does not change already-due work. Original attempts and support records stay intact.</p>
        <p>Use a short source reference only. Do not paste confidential documents or plan details.</p>
        <form className="se-stack" onSubmit={preview} aria-label="Preview historical workload corrections">
          <label>Documented reduction (%) <input type="number" min="10" max="50" step="1" required value={input.percent} onChange={(e) => field('percent', Number(e.target.value))} /></label>
          <label>Source descriptor <input required maxLength={120} value={input.sourceDescriptor} onChange={(e) => field('sourceDescriptor', e.target.value)} /></label>
          <label>Documented effective date <input type="date" required value={input.effectiveDate} onChange={(e) => field('effectiveDate', e.target.value)} /></label>
          <label>Historical range from <input type="date" required value={input.fromDate} onChange={(e) => field('fromDate', e.target.value)} /></label>
          <label>Historical range through <input type="date" required value={input.toDate} onChange={(e) => field('toDate', e.target.value)} /></label>
          <fieldset><legend>Applicable activities (none selected means all eligible activities)</legend>{roles.map((role) => <label key={role} style={{ display: 'block', minHeight: 44 }}><input type="checkbox" checked={input.appliesTo.includes(role)} onChange={(e) => field('appliesTo', e.target.checked ? [...input.appliesTo, role] : input.appliesTo.filter((r) => r !== role))} /> {role === 'dol' ? 'Exit ticket (DOL)' : role}</label>)}</fieldset>
          <button className="tw-btn" type="submit" disabled={busy}>Preview historical assignments</button>
        </form>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {rows.length > 0 && <label style={{ minHeight: 44 }}><input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} /> I confirm my authority and the documented policy for this student.</label>}
        {rows.map((row) => (
          <section key={row.assignmentId} className="tw-card se-stack" aria-label={`Review ${row.title}`}>
            <h4 style={{ margin: 0 }}>{row.title}</h4>
            <p>Original due date: {row.dueDate}. Previously {row.previousRequiredCount} of {row.originalCount} required; proposed {row.proposedRequiredCount} of {row.originalCount} ({formatPercentTenths(row.actualPercentTenths)} fewer).</p>
            <p>Previous grade: {row.status === 'manual-review' ? 'Manual review needed' : grade(row.previousGrade)}. Proposed grade: {row.status === 'manual-review' ? 'Manual review needed' : grade(row.proposedGrade)}. Required progress: {row.answeredCount} of {row.proposedRequiredCount} answered.</p>
            <details><summary>Original and proposed required question sets</summary><p>Before: {row.previousRequiredIndices.map((i) => i + 1).join(', ') || 'None'}</p><p>Proposed: {row.proposedRequiredIndices.map((i) => i + 1).join(', ') || 'None'}</p></details>
            {row.variance?.length > 0 && <ul>{row.variance.map((code) => <li key={code}>{WORKLOAD_VARIANCE_LABEL[code] || 'Manual review needed.'}</li>)}</ul>}
            {row.status === 'manual-review' && <p role="note">Manual review needed: {row.reasons.join(' ')}</p>}
            {row.status === 'eligible' && <>
              <label style={{ minHeight: 44 }}><input type="checkbox" checked={selected[row.assignmentId] === true} onChange={(e) => setSelected((old) => ({ ...old, [row.assignmentId]: e.target.checked }))} /> Approve this assignment’s {row.reversing ? 'reversal' : 'correction'} after reviewing the counts and grade.</label>
              {row.requiresSecondConfirmation && <label style={{ minHeight: 44 }}><input type="checkbox" checked={second[row.assignmentId] === true} onChange={(e) => setSecond((old) => ({ ...old, [row.assignmentId]: e.target.checked }))} /> Second confirmation: I approve this grade decrease or policy discrepancy.</label>}
              <button type="button" className="tw-btn" disabled={busy || !authority || !selected[row.assignmentId] || (row.requiresSecondConfirmation && !second[row.assignmentId])} onClick={() => apply(row)}>{row.reversing ? 'Approve reversal' : 'Approve correction'}</button>
            </>}
            {(row.correctionEventId || row.status === 'applied') && <>
              <p>Classroom sync: {row.syncStatus || 'not-requested'}. A request is not confirmation of delivery.</p>
              <button type="button" className="tw-btn" disabled={busy} onClick={() => reverse(row)}>Preview reversal</button>
              <button type="button" className="tw-btn" disabled={busy || !row.correctionEventId} onClick={() => run(async () => { await request('requestSync', { assignmentId: row.assignmentId, eventId: row.correctionEventId, requestId: crypto.randomUUID() }); updateRow(row.assignmentId, { syncStatus: 'requested' }); await loadHistory(row.assignmentId); setMessage('Classroom sync requested. Check delivery status before retrying.'); })}>Request Google Classroom sync</button>
            </>}
            <button type="button" className="tw-btn" disabled={busy} onClick={() => run(() => loadHistory(row.assignmentId))}>View correction audit history</button>
            {history[row.assignmentId] && <div role="group" aria-label="Correction audit history">
              {history[row.assignmentId].incomplete && <p role="note">This view reached its record limit. History and delivery results may be incomplete; an absent entry does not prove no event occurred.</p>}
              <p>Classroom delivery: {history[row.assignmentId].deliveryStatus || 'No delivery status recorded'}</p>
              <ol>{history[row.assignmentId].events.map((event) => <li key={event.id}>{event.action} · {event.at} · {event.sourceDescriptor || 'Explicit export request'} · {grade(event.previousGrade)} → {grade(event.appliedGrade)} · Event {event.id}</li>)}</ol>
            </div>}
          </section>
        ))}
      </div>
    </details>
  );
}

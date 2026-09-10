import { useMemo, useRef, useState } from 'react';
import { teacherAdmin } from '../../auth/authService.js';
import {
  buildFullAssignmentRepairRequest,
  parseFullAssignmentRepairResponse,
  summarizeFullAssignmentAudit,
} from '../../platform/contract/fullAssignmentRepairPacket.js';

const clean = (value) => String(value ?? '').trim();

export default function FullAssignmentAudit({ assignmentV5, repairCenterModel, assignmentId, baseRevision, authorized, activityStatus = 'unavailable' }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('idle');
  const [response, setResponse] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('All');
  const [message, setMessage] = useState('');
  const questionIds = useMemo(() => (assignmentV5?.sections || []).flatMap((section) => section.questions || []).map((question) => clean(question.questionId)), [assignmentV5]);
  if (!authorized) return null;

  const copyPackage = async () => {
    try {
      const request = buildFullAssignmentRepairRequest({ assignmentV5, repairCenterModel, assignmentId, baseRevision });
      await navigator.clipboard.writeText(request);
      setStep('handoff'); setMessage(`Full audit package copied for all ${questionIds.length} questions.`);
    } catch (error) { setMessage(error.message); }
  };
  const importResult = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseFullAssignmentRepairResponse(await file.text(), { expectedAssignmentId: assignmentId, expectedBaseRevision: baseRevision, currentQuestionIds: questionIds });
      setResponse(parsed); setSelected(new Set(parsed.replacements.map((entry) => entry.questionId))); setStep('review'); setMessage('Audit imported. Review and select repairs; nothing has changed.');
    } catch (error) { setMessage(error.message); }
  };
  const summary = response ? summarizeFullAssignmentAudit(response) : null;
  const rows = (response?.auditResults || []).filter((result) => filter === 'All'
    || (filter === 'Proposed Repairs' && result.classification === 'assignmentIssue')
    || (filter === 'Platform Issues' && result.classification === 'platformIssue')
    || (filter === 'Unclear' && result.classification === 'unclear')
    || (filter === 'Passed' && result.classification === 'passed'));
  const commit = async () => {
    try {
      const result = await teacherAdmin.commitFullAssignmentRepair({ ...response, selectedQuestionIds: [...selected] });
      setStep('complete'); setMessage(`Committed ${result.changedQuestionIds.length} selected repairs in revision ${result.revision}.`);
    } catch (error) { setStep('review'); setMessage(error.message); }
  };

  return <section aria-label="Full Assignment Audit" style={{ marginTop: 14, padding: 14, border: '2px solid #7b1fa2', borderRadius: 12, background: '#fff' }}>
    <h3 style={{ margin: 0, color: '#6a1b9a' }}>Full Assignment Audit · elevated maintenance</h3>
    {step === 'idle' && <button type="button" onClick={() => setStep('warning1')} style={{ marginTop: 10 }}>Full Assignment Audit</button>}
    {step === 'warning1' && <div role="alertdialog" aria-label="Full Assignment Repair warning"><h4>Full Assignment Repair</h4><p>This tool can inspect and propose changes to every question in this assignment, including questions that have not been flagged by a teacher.</p><p>You are operating as an Administrator or Designated Repairer. Changes may affect an assignment used by other teachers and classes.</p><p>The audit will not automatically modify the assignment. You will review proposed changes before they can be committed.</p><button type="button" onClick={copyPackage}>Continue to Full Audit</button> <button type="button" onClick={() => setStep('idle')}>Cancel</button></div>}
    {['handoff', 'review'].includes(step) && <><button type="button" onClick={copyPackage}>Copy Full Assignment Audit Package</button> <button type="button" onClick={() => fileRef.current?.click()}>Import Full Audit JSON</button><input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={importResult} /></>}
    {step === 'review' && response && <section aria-label="Full audit response review" style={{ marginTop: 12 }}>
      {activityStatus === 'present' ? <div role="alert" style={{ padding: 12, background: '#fce8e6', border: '2px solid #d93025', fontWeight: 800 }}>Students have already worked on this assignment.<br /><span style={{ fontWeight: 500 }}>Repairs preserve question identity. Changes affect future behavior and must not reinterpret historical answers.</span></div> : activityStatus === 'unavailable' && <div role="alert" style={{ padding: 10, background: '#fef7e0' }}>Student activity status unavailable — proceed cautiously.</div>}
      <p><strong>{summary.total}</strong> audited · {summary.passed} passed · {summary.assignmentIssue} assignment issues · {summary.platformIssue} platform issues · {summary.unclear} unclear · {summary.proposedReplacements} proposed replacements · {summary.globalFindings} global findings</p>
      <div>{['All', 'Proposed Repairs', 'Platform Issues', 'Unclear', 'Passed'].map((label) => <button type="button" aria-pressed={filter === label} onClick={() => setFilter(label)} key={label}>{label}</button>)}</div>
      <p><button type="button" onClick={() => setSelected(new Set(response.replacements.map((entry) => entry.questionId)))}>Select all proposed assignment repairs</button> <button type="button" onClick={() => setSelected(new Set())}>Select none</button></p>
      {rows.map((result) => { const replacement = response.replacements.find((entry) => entry.questionId === result.questionId); const before = questionIds.includes(result.questionId) && (assignmentV5.sections || []).flatMap((section) => section.questions || []).find((question) => question.questionId === result.questionId); return <article key={result.questionId} style={{ borderTop: '1px solid #ddd', padding: 8 }}>
        {result.classification === 'assignmentIssue' && <input aria-label={`Select repair ${result.questionId}`} type="checkbox" checked={selected.has(result.questionId)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(result.questionId); else next.delete(result.questionId); return next; })} />}
        <strong>{result.questionId} · {result.classification}</strong><p>{result.reason}</p>{result.classification === 'platformIssue' && <p><strong>Platform issue — question left unchanged</strong></p>}{replacement && <details><summary>Before / proposed repair</summary><pre>{JSON.stringify({ before, after: replacement.question }, null, 2)}</pre></details>}
      </article>; })}
      {(response.globalFindings || []).length > 0 && <details><summary>Global findings</summary><pre>{JSON.stringify(response.globalFindings, null, 2)}</pre></details>}
      <button type="button" disabled={!selected.size} onClick={() => setStep('warning2')}>Review commit warning</button>
    </section>}
    {step === 'warning2' && <div role="alertdialog" aria-label="Apply Repairs warning"><h4>Apply Repairs to Shared Library Assignment?</h4><p>You are about to change the shared MathMaster Library version of this assignment.</p><ul><li>Only assignment issues change authored questions.</li><li>Platform issues remain unchanged and are sent to Platform Issues.</li><li>Existing student work and historical grades are not rewritten.</li><li>A new assignment revision and question-level repair history will be created.</li><li>Other teachers may receive the corrected version under existing update rules.</li></ul><button type="button" onClick={commit}>Apply Selected Repairs</button> <button type="button" onClick={() => setStep('review')}>Cancel and Review</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}

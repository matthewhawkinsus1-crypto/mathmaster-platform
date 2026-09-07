import React, { useMemo, useState } from 'react';
import { buildQuestionBatchRepairRequest, parseQuestionBatchRepairResponse } from '../../platform/contract/questionBatchRepairPacket.js';
import { buildAssignmentRepairCenterModel } from '../../platform/preflight/assignmentRepairCenterModel.js';
import { buildAssignmentV5PreflightModel } from '../../platform/preflight/assignmentV5PreflightModel.js';
import { teacherFlagNeedsReview } from '../../platform/preflight/assignmentAuthoringState.js';
import {
  commitStagedQuestionRepairImport,
  parseSingleQuestionRepairJson,
  stageBatchQuestionRepairImport,
  stageSingleQuestionRepairImport,
} from '../../platform/preflight/questionRepairImport.js';
import {
  addTeacherReviewFlag,
  resolveTeacherReviewFlag,
} from '../../platform/preflight/teacherReviewContext.js';
import {
  commitIncompleteAssignmentDraftRepair,
  restoreIncompleteAssignmentV5,
  saveIncompleteAssignmentTeacherReviewContext,
} from '../../platform/preflight/incompleteAssignmentDraftStore.js';

const button = {
  minHeight: 40,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #b7c7de',
  background: '#fff',
  color: '#174ea6',
  fontWeight: 900,
  cursor: 'pointer',
};

const textarea = {
  display: 'block',
  width: '100%',
  minHeight: 120,
  boxSizing: 'border-box',
  padding: 10,
  border: '1px solid #bdc7d6',
  borderRadius: 8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.45,
};

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const revisionOf = (draft) => {
  const revision = Number(draft?.assignmentRevision);
  return Number.isFinite(revision) && revision >= 1 ? revision : 1;
};

const brief = (value) => {
  if (value === undefined) return 'undefined';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return String(text ?? 'null').length > 220 ? `${String(text).slice(0, 217)}…` : String(text ?? 'null');
};

const allQuestionIds = (model) => list(model?.questions).map((row) => clean(row?.questionId)).filter(Boolean);

export default function IncompleteAssignmentRepairCenter({
  draft,
  onSaved,
  onClose,
  toastSuccess,
  toastError,
}) {
  const [currentDraft, setCurrentDraft] = useState(() => draft);
  const [assignmentV5, setAssignmentV5] = useState(() => restoreIncompleteAssignmentV5(draft));
  const [teacherReviewContext, setTeacherReviewContext] = useState(() => draft?.teacherReviewContext || { flags: [] });
  const [focusedQuestionId, setFocusedQuestionId] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [teacherNote, setTeacherNote] = useState('');
  const [singleJson, setSingleJson] = useState('');
  const [batchJson, setBatchJson] = useState('');
  const [stagedImport, setStagedImport] = useState(null);
  const [verificationFlagIds, setVerificationFlagIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const revision = revisionOf(currentDraft);
  const preflightModel = useMemo(
    () => buildAssignmentV5PreflightModel(assignmentV5),
    [assignmentV5],
  );
  const repairCenterModel = useMemo(
    () => buildAssignmentRepairCenterModel({
      assignmentV5: preflightModel.assignmentV5,
      diagnostics: preflightModel.diagnostics,
      teacherReviewContext,
    }),
    [preflightModel, teacherReviewContext],
  );
  const questionIds = useMemo(() => allQuestionIds(repairCenterModel), [repairCenterModel]);
  const focusedRow = repairCenterModel.questions.find((row) => row.questionId === focusedQuestionId)
    || repairCenterModel.questions.find((row) => row.status !== 'passed')
    || repairCenterModel.questions[0]
    || null;
  const actualFocusedQuestionId = focusedRow?.questionId || '';

  const pendingVerificationFlags = useMemo(() => {
    const explicit = new Set(verificationFlagIds);
    return list(teacherReviewContext?.flags).filter((flag) => (
      teacherFlagNeedsReview(flag)
      && (
        explicit.has(clean(flag?.id))
        || Number(flag?.potentiallyAddressedByRevision) === revision
      )
    ));
  }, [teacherReviewContext, verificationFlagIds, revision]);

  const updateSavedDraft = (nextDraft) => {
    setCurrentDraft(nextDraft);
    onSaved?.(nextDraft);
  };

  const persistTeacherContext = async (nextContext) => {
    const saved = await saveIncompleteAssignmentTeacherReviewContext(currentDraft, nextContext);
    setTeacherReviewContext(saved.teacherReviewContext || nextContext);
    updateSavedDraft(saved);
    return saved;
  };

  const toggleSelected = (questionId) => {
    setSelectedQuestionIds((current) => (
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
    ));
  };

  const addQuestionFlag = async () => {
    if (!actualFocusedQuestionId) return;
    if (!clean(teacherNote)) {
      setMessage('Write the teacher note first. That note becomes a hard repair constraint for this question.');
      return;
    }
    setBusy(true);
    try {
      const nextContext = addTeacherReviewFlag(teacherReviewContext, {
        scope: 'question',
        targetId: actualFocusedQuestionId,
        category: 'teacherReview',
        severity: 'needsEditing',
        note: clean(teacherNote),
      }, { assignmentRevision: revision });
      await persistTeacherContext(nextContext);
      setTeacherNote('');
      setMessage('Teacher flag saved. Any AI repair packet for this question now carries that note as a hard constraint.');
    } catch (error) {
      setMessage(error.message);
      toastError?.('Could not save teacher flag', error.message);
    } finally {
      setBusy(false);
    }
  };

  const copyQuestionJson = async () => {
    if (!focusedRow?.question) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard copy is unavailable in this browser.');
      await navigator.clipboard.writeText(JSON.stringify(focusedRow.question, null, 2));
      setMessage(`Question ${focusedRow.questionNumber} JSON copied. Its questionId must stay exactly "${focusedRow.questionId}" in the repair.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const copySelectedRepairRequest = async () => {
    if (!selectedQuestionIds.length) {
      setMessage('Select at least one question before building a batch repair request.');
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard copy is unavailable in this browser.');
      const request = buildQuestionBatchRepairRequest({
        assignmentV5,
        repairCenterModel,
        selectedQuestionIds,
        assignmentId: assignmentV5?.assignment?.assignmentId,
        baseRevision: revision,
      });
      await navigator.clipboard.writeText(request);
      setMessage(`${selectedQuestionIds.length} selected question${selectedQuestionIds.length === 1 ? '' : 's'} copied as a compact repair request. The rest of the assignment was not included.`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const stageSingle = () => {
    if (!actualFocusedQuestionId) return;
    try {
      const replacementQuestion = parseSingleQuestionRepairJson(singleJson, {
        expectedQuestionId: actualFocusedQuestionId,
      });
      const staged = stageSingleQuestionRepairImport({
        assignmentV5,
        questionId: actualFocusedQuestionId,
        replacementQuestion,
        baseRevision: revision,
        currentRevision: revision,
        teacherReviewContext,
      });
      setStagedImport(staged);
      setMessage(staged.canCommit
        ? 'Single-question repair staged. Review the exact diff and revalidation below before applying it.'
        : 'Single-question repair staged, but MathMaster found a new blocking issue. Nothing can be applied until that is corrected.');
    } catch (error) {
      setStagedImport(null);
      setMessage(error.message);
    }
  };

  const stageBatch = () => {
    if (!selectedQuestionIds.length) {
      setMessage('Select the questions this batch reply is allowed to replace before pasting it.');
      return;
    }
    try {
      const parsedResponse = parseQuestionBatchRepairResponse(batchJson, {
        expectedAssignmentId: assignmentV5?.assignment?.assignmentId || null,
        expectedBaseRevision: revision,
        allowedQuestionIds: selectedQuestionIds,
      });
      const staged = stageBatchQuestionRepairImport({
        assignmentV5,
        parsedResponse,
        baseRevision: revision,
        currentRevision: revision,
        teacherReviewContext,
      });
      setStagedImport(staged);
      setMessage(staged.canCommit
        ? `Batch repair staged for ${staged.questionResults.length} question${staged.questionResults.length === 1 ? '' : 's'}. Review the diff before applying the atomic batch.`
        : 'Batch repair is not safe to apply. At least one replacement introduced a new blocker, so MathMaster will apply none of them.');
    } catch (error) {
      setStagedImport(null);
      setMessage(error.message);
    }
  };

  const applyStaged = async () => {
    if (!stagedImport) return;
    setBusy(true);
    try {
      const committed = commitStagedQuestionRepairImport({
        stagedImport,
        teacherReviewContext,
        currentRevision: revision,
        nextRevision: revision + 1,
      });
      const saved = await commitIncompleteAssignmentDraftRepair(currentDraft, committed);
      setAssignmentV5(committed.assignmentV5);
      setTeacherReviewContext(committed.teacherReviewContext);
      setVerificationFlagIds(committed.pendingTeacherFlagIds || []);
      setStagedImport(null);
      setSingleJson('');
      setBatchJson('');
      updateSavedDraft(saved);
      setMessage(committed.requiresTeacherVerification
        ? `Repair applied as revision ${committed.committedRevision}. Teacher verification required before the flagged concerns are closed.`
        : `Repair applied as revision ${committed.committedRevision}. MathMaster revalidated the changed question${stagedImport.kind === 'batchQuestionRepairImport' ? 's' : ''}.`);
      toastSuccess?.('Repair applied', `Saved draft revision ${committed.committedRevision}.`);
    } catch (error) {
      setMessage(error.message);
      toastError?.('Could not apply repair', error.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyFlagFixed = async (flagId) => {
    setBusy(true);
    try {
      const nextContext = resolveTeacherReviewFlag(teacherReviewContext, flagId, { status: 'resolved' });
      await persistTeacherContext(nextContext);
      setVerificationFlagIds((current) => current.filter((id) => id !== flagId));
      setMessage('Teacher verification saved. That flag is now resolved by the teacher, not by the AI import.');
    } catch (error) {
      setMessage(error.message);
      toastError?.('Could not verify repair', error.message);
    } finally {
      setBusy(false);
    }
  };

  const stagedDiff = stagedImport?.kind === 'batchQuestionRepairImport'
    ? stagedImport.questionResults.flatMap((result) => list(result.diff).map((change) => ({ ...change, questionId: result.questionId })))
    : list(stagedImport?.diff).map((change) => ({ ...change, questionId: stagedImport?.questionId }));
  const stagedValidation = stagedImport?.validation || null;

  return (
    <section aria-label="Incomplete Assignment Repair Center" style={{ marginTop: 12, padding: 14, border: '1px solid #b7c7de', borderRadius: 10, background: '#f8fbff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, color: '#174ea6', fontSize: 17 }}>Repair Center</h4>
          <div style={{ marginTop: 4, color: '#5f6368', fontSize: 12 }}>
            Revision {revision} · {repairCenterModel.summary.totalQuestions} questions · {repairCenterModel.summary.needsRepair} need repair · {repairCenterModel.summary.teacherFlagged} teacher flagged
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={busy} style={button}>Close Repair Center</button>
      </div>

      <p style={{ margin: '10px 0', color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}>
        Fix one question or a selected batch without replacing the assignment. Pasted AI output is staged first; MathMaster verifies the immutable questionId, shows the before/after changes, reruns Preflight, and only then enables Apply.
      </p>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {repairCenterModel.questions.map((row) => {
          const focused = row.questionId === actualFocusedQuestionId;
          const selected = selectedQuestionIds.includes(row.questionId);
          return (
            <article key={row.questionId || row.questionIndex} style={{ padding: 10, border: focused ? '2px solid #1a73e8' : '1px solid #d9e2f1', borderRadius: 8, background: '#fff' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={selected} onChange={() => toggleSelected(row.questionId)} aria-label={`Select question ${row.questionNumber} for batch repair`} />
                <button type="button" onClick={() => setFocusedQuestionId(row.questionId)} style={{ flex: 1, textAlign: 'left', border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}>
                  <strong>Question {row.questionNumber} · {row.sectionTitle || row.sectionRole || row.sectionId}</strong>
                  <div style={{ marginTop: 2, color: '#5f6368', fontSize: 11 }}>Stable ID: <code>{row.questionId}</code> · status: {row.status}</div>
                  <div style={{ marginTop: 5, color: '#3c4043', fontSize: 12.5 }}>{clean(row.question?.prompt || row.question?.scenario || row.question?.title).replace(/\s+/g, ' ').slice(0, 220) || 'Question content'}</div>
                </button>
              </div>
              {row.automatedFindings.length > 0 && (
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {row.automatedFindings.map((finding, index) => (
                    <div key={`${finding.code || 'finding'}-${index}`} style={{ padding: 7, borderRadius: 7, background: '#fff4f3', color: '#8a1c13', fontSize: 11.5, lineHeight: 1.45 }}>
                      <strong>{finding.severity || 'finding'} · {finding.code || 'diagnostic'}</strong>
                      {finding.source ? ` · ${finding.source}` : ''}
                      {finding.fieldPath ? ` · ${finding.fieldPath}` : ''}
                      <div>{finding.requirement || finding.message}</div>
                    </div>
                  ))}
                </div>
              )}
              {row.teacherFlags.filter(teacherFlagNeedsReview).map((flag) => (
                <div key={flag.id} style={{ marginTop: 7, padding: 7, borderRadius: 7, background: '#fff8e1', color: '#7a4f00', fontSize: 11.5 }}>
                  <strong>Teacher note:</strong> {flag.note || 'Review requested'}
                </div>
              ))}
            </article>
          );
        })}
      </div>

      {focusedRow && (
        <fieldset style={{ marginTop: 14, padding: 12, border: '1px solid #d8dde6', borderRadius: 9 }}>
          <legend style={{ fontWeight: 900 }}>Teacher review · Question {focusedRow.questionNumber}</legend>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800 }}>
            Flag this question and save a repair note
            <textarea value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} placeholder="Example: Keep the graph, but remove the text that gives away the answer." style={{ ...textarea, minHeight: 72, marginTop: 6, fontFamily: 'inherit', fontSize: 13 }} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" onClick={addQuestionFlag} disabled={busy} style={button}>Save teacher flag</button>
            <button type="button" onClick={copyQuestionJson} disabled={busy} style={button}>Copy Question JSON</button>
          </div>
        </fieldset>
      )}

      <fieldset style={{ marginTop: 14, padding: 12, border: '1px solid #d8dde6', borderRadius: 9 }}>
        <legend style={{ fontWeight: 900 }}>Outside-AI repair handoff</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
          <button type="button" onClick={() => setSelectedQuestionIds(questionIds)} disabled={busy || !questionIds.length} style={button}>Select all questions</button>
          <button type="button" onClick={() => setSelectedQuestionIds([])} disabled={busy} style={button}>Clear selection</button>
          <button type="button" onClick={copySelectedRepairRequest} disabled={busy || !selectedQuestionIds.length} style={button}>Copy selected AI repair request</button>
        </div>
        <div style={{ color: '#5f6368', fontSize: 11.5, marginBottom: 10 }}>
          {selectedQuestionIds.length} selected. The request includes only those questions, their diagnostics, and teacher constraints—not the full assignment.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 900 }}>
            Paste repaired question JSON
            <textarea value={singleJson} onChange={(event) => setSingleJson(event.target.value)} placeholder="Paste one repaired question object here. Keep questionId unchanged." style={{ ...textarea, marginTop: 6 }} />
            <button type="button" onClick={stageSingle} disabled={busy || !actualFocusedQuestionId || !clean(singleJson)} style={{ ...button, marginTop: 8 }}>Stage single-question repair</button>
          </label>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 900 }}>
            Paste batch repair JSON
            <textarea value={batchJson} onChange={(event) => setBatchJson(event.target.value)} placeholder="Paste the batch response for the selected questions here." style={{ ...textarea, marginTop: 6 }} />
            <button type="button" onClick={stageBatch} disabled={busy || !selectedQuestionIds.length || !clean(batchJson)} style={{ ...button, marginTop: 8 }}>Stage batch repair</button>
          </label>
        </div>
      </fieldset>

      {stagedImport && (
        <section style={{ marginTop: 14, padding: 12, border: `2px solid ${stagedImport.canCommit ? '#81c995' : '#f1a5a0'}`, borderRadius: 9, background: stagedImport.canCommit ? '#f6fff8' : '#fff8f7' }}>
          <h5 style={{ margin: 0, fontSize: 15 }}>Before / after changes</h5>
          {stagedDiff.length === 0 ? (
            <p style={{ color: '#5f6368', fontSize: 12 }}>The staged replacement is identical to the saved question.</p>
          ) : (
            <div style={{ display: 'grid', gap: 7, marginTop: 9 }}>
              {stagedDiff.slice(0, 80).map((change, index) => (
                <div key={`${change.questionId}-${change.path}-${index}`} style={{ padding: 8, border: '1px solid #dfe5ee', borderRadius: 7, background: '#fff', fontSize: 11.5 }}>
                  <strong>{change.questionId} · {change.path || '(question)'}</strong>
                  <div style={{ marginTop: 4 }}><span style={{ color: '#a50e0e', fontWeight: 800 }}>Before:</span> {brief(change.before)}</div>
                  <div style={{ marginTop: 2 }}><span style={{ color: '#137333', fontWeight: 800 }}>After:</span> {brief(change.after)}</div>
                </div>
              ))}
            </div>
          )}

          <h5 style={{ margin: '14px 0 0', fontSize: 15 }}>Revalidation</h5>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7, fontSize: 12 }}>
            <span>Blocking before: <strong>{stagedValidation?.before?.blocking ?? 0}</strong></span>
            <span>Blocking after: <strong>{stagedValidation?.after?.blocking ?? 0}</strong></span>
            <span>Resolved: <strong>{stagedValidation?.resolvedBlockingDiagnostics?.length ?? 0}</strong></span>
            <span>New blockers: <strong>{stagedValidation?.newBlockingDiagnostics?.length ?? 0}</strong></span>
          </div>
          {list(stagedValidation?.newBlockingDiagnostics).length > 0 && (
            <ul style={{ color: '#a50e0e', fontSize: 12 }}>
              {stagedValidation.newBlockingDiagnostics.map((finding, index) => <li key={`${finding.code}-${index}`}>{finding.message}</li>)}
            </ul>
          )}
          {stagedImport.kind === 'batchQuestionRepairImport' && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {stagedImport.questionResults.map((result) => (
                <div key={result.questionId}>{result.canCommit ? '✓' : '✕'} {result.questionId} · {result.canCommit ? 'safe to apply' : 'blocked'}</div>
              ))}
            </div>
          )}
          {list(stagedImport.platformIssues).length > 0 && (
            <div style={{ marginTop: 9, padding: 8, borderRadius: 7, background: '#e8f0fe', color: '#174ea6', fontSize: 12 }}>
              <strong>Platform issues reported — questions were not rewritten:</strong> {stagedImport.platformIssues.map((issue) => issue.suspectedComponent || issue.reason || issue.questionId).join('; ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
            <button type="button" onClick={applyStaged} disabled={busy || !stagedImport.canCommit} style={{ ...button, background: stagedImport.canCommit ? '#188038' : '#dadce0', borderColor: stagedImport.canCommit ? '#188038' : '#dadce0', color: '#fff', cursor: stagedImport.canCommit ? 'pointer' : 'not-allowed' }}>Apply staged repair</button>
            <button type="button" onClick={() => setStagedImport(null)} disabled={busy} style={button}>Discard staged repair</button>
          </div>
        </section>
      )}

      {pendingVerificationFlags.length > 0 && (
        <section style={{ marginTop: 14, padding: 12, border: '2px solid #f0c36d', borderRadius: 9, background: '#fff8e1' }}>
          <h5 style={{ margin: 0, color: '#7a4f00', fontSize: 15 }}>Teacher verification required</h5>
          <p style={{ margin: '5px 0 9px', color: '#5f4b20', fontSize: 12.5 }}>The repair may have addressed these teacher-raised concerns, but MathMaster will not close them for you.</p>
          {pendingVerificationFlags.map((flag) => (
            <div key={flag.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: 8, marginTop: 7, borderRadius: 7, background: '#fff' }}>
              <div style={{ fontSize: 12.5 }}><strong>{flag.note || 'Teacher review flag'}</strong><div style={{ color: '#5f6368', fontSize: 11 }}>Flag {flag.id} · potentially addressed by revision {flag.potentiallyAddressedByRevision || revision}</div></div>
              <button type="button" onClick={() => verifyFlagFixed(flag.id)} disabled={busy} style={{ ...button, color: '#137333', borderColor: '#81c995' }}>Verify fixed</button>
            </div>
          ))}
        </section>
      )}

      {message && (
        <div role="status" style={{ marginTop: 12, padding: 9, borderRadius: 7, background: '#fff', border: '1px solid #d9e2f1', color: '#3c4043', fontSize: 12.5, lineHeight: 1.45 }}>{message}</div>
      )}
    </section>
  );
}

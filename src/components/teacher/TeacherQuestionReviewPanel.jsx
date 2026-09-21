import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { teacherAdmin } from '../../auth/authService.js';
import QuestionEngine from '../../QuestionEngine.jsx';
import { getStoredAssignmentQuestions, storedAssignmentToV5 } from '../../platform/contract/storedAssignmentV5.js';
import { buildQuestionRepairRequest } from '../../platform/contract/questionRepairRequest.js';
import {
  addTeacherReviewFlag,
  resolveTeacherReviewFlag,
} from '../../platform/preflight/teacherReviewContext.js';
import { teacherFlagNeedsReview } from '../../platform/preflight/assignmentAuthoringState.js';
import {
  loadAssignmentTeacherReviewContext,
  saveAssignmentTeacherReviewContext,
} from '../../platform/preflight/assignmentQuestionReviewStore.js';
import {
  buildAllOpenTeacherFlagRepairRequest,
  getOpenFlaggedQuestionIds,
  parseUnifiedRepairUpload,
} from '../../platform/preflight/libraryAssignmentRepairWorkspace.js';
import { stageBatchQuestionRepairImport } from '../../platform/preflight/questionRepairImport.js';
import {
  attachScreenshotToFlag,
  detachScreenshotFromFlag,
} from '../../platform/preflight/teacherReviewScreenshot.js';
import {
  deleteTeacherReviewScreenshot,
  saveTeacherReviewScreenshot,
} from '../../platform/preflight/teacherReviewScreenshotStore.js';
import {
  prepareScreenshotDataUrl,
  screenshotFileFromPaste,
} from '../../platform/preflight/teacherReviewScreenshotCapture.js';

const panelStyle = {
  width: 'min(1040px, calc(100vw - 24px))',
  maxHeight: 'min(88vh, 900px)',
  overflow: 'auto',
  padding: '12px 14px',
  border: '2px solid #1a73e8',
  borderRadius: 12,
  background: '#f8fbff',
  textAlign: 'left',
  color: '#202124',
  boxShadow: '0 12px 34px rgba(0,0,0,.24)',
};

const buttonStyle = {
  minHeight: 38,
  padding: '8px 12px',
  border: '1px solid #aecbfa',
  borderRadius: 8,
  background: '#fff',
  color: '#174ea6',
  fontWeight: 900,
  cursor: 'pointer',
};

const clean = (value) => String(value ?? '').trim();

const writeClipboardText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand?.('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('Clipboard copy is unavailable in this browser.');
};

/**
 * The correction is exercised by the same canonical renderer as View as
 * Student, but with every persistence seam disconnected. A null draftKey also
 * keeps registry-tool state inside this mounted preview rather than local or
 * remote student storage.
 */
export function TeacherRepairCandidateSandbox({ question, assignmentId, resetKey }) {
  const testGrade = async (isCorrect, questionDetails, parts) => ({
    isCorrect,
    status: isCorrect ? 'correct' : 'attempted',
    attemptCount: 1,
    remainingAttempts: 99,
    expired: false,
    incorrectParts: (parts || []).filter((part) => part?.graded !== false && !part?.isCorrect).map((part) => part?.label),
    questionDetails,
  });
  return (
    <div data-teacher-repair-sandbox="true" style={{ border: '1px solid #81c995', borderRadius: 10, background: '#fff', padding: 8 }}>
      <QuestionEngine
        key={resetKey}
        question={question}
        generationKey={`teacher-repair-preview|${assignmentId}|${resetKey}`}
        questionRecord={null}
        draftKey={null}
        studentProfile={null}
        executionScope="teacherRepairPreview"
        attemptsDoNotExpire
        onGrade={testGrade}
        onStepGrade={testGrade}
        onRequestNewQuestion={() => {}}
        onLoadScratchpad={async () => null}
        onSaveScratchpad={async () => null}
        onResponseCheckpoint={null}
        onSpotlightFrame={null}
      />
    </div>
  );
}

export default function TeacherQuestionReviewPanel({
  assignmentId,
  questionId: questionIdProp = '',
  question: questionProp = null,
  questionIndex = null,
  onAssignmentRefresh = null,
}) {
  const repairUploadInputRef = useRef(null);
  const [context, setContext] = useState({ flags: [] });
  const [assignmentRecord, setAssignmentRecord] = useState(null);
  const [resolvedQuestion, setResolvedQuestion] = useState(questionProp);
  const [category, setCategory] = useState('content');
  const [severity, setSeverity] = useState('needsEditing');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [pendingShot, setPendingShot] = useState(null);
  const [repairJson, setRepairJson] = useState('');
  const [stagedRepair, setStagedRepair] = useState(null);
  const [serverPreview, setServerPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!assignmentId) return undefined;

    Promise.all([
      loadAssignmentTeacherReviewContext(assignmentId),
      getDoc(doc(db, 'assignments', assignmentId)),
    ])
      .then(([nextContext, assignmentSnapshot]) => {
        if (cancelled) return;
        setContext(nextContext || { flags: [] });
        if (assignmentSnapshot?.exists?.()) {
          const record = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
          setAssignmentRecord(record);
          if (questionProp) setResolvedQuestion(questionProp);
          else {
            const questions = getStoredAssignmentQuestions(record);
            const byId = clean(questionIdProp)
              ? questions.find((item) => clean(item?.questionId) === clean(questionIdProp))
              : null;
            setResolvedQuestion(byId || (Number.isInteger(Number(questionIndex)) ? questions[Number(questionIndex)] : null) || null);
          }
        } else {
          setAssignmentRecord(null);
          if (questionProp) setResolvedQuestion(questionProp);
        }
        setMessage('');
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message || 'Could not load teacher review notes.');
      });
    return () => { cancelled = true; };
  }, [assignmentId, questionIdProp, questionIndex, questionProp]);

  const assignmentV5 = useMemo(() => {
    if (!assignmentRecord) return null;
    try {
      const rebuilt = storedAssignmentToV5(assignmentRecord);
      return {
        ...rebuilt,
        assignment: {
          ...rebuilt.assignment,
          assignmentId: clean(assignmentId) || rebuilt.assignment?.assignmentId || null,
        },
      };
    } catch {
      return null;
    }
  }, [assignmentRecord, assignmentId]);

  const baseRevision = useMemo(() => {
    const candidates = [
      Number(assignmentRecord?.assignmentRevision),
      Number(context?.repairRevision),
    ].filter((value) => Number.isFinite(value) && value >= 1);
    return candidates.length ? Math.max(...candidates) : 1;
  }, [assignmentRecord, context]);

  const questionId = clean(questionIdProp || resolvedQuestion?.questionId);
  const questionFlags = useMemo(() => (
    (Array.isArray(context?.flags) ? context.flags : []).filter((flag) => (
      flag?.scope === 'question' && clean(flag?.targetId) === questionId
    ))
  ), [context, questionId]);
  const openFlags = questionFlags.filter(teacherFlagNeedsReview);
  const allFlaggedQuestionIds = useMemo(() => (
    assignmentV5 ? getOpenFlaggedQuestionIds({ assignmentV5, teacherReviewContext: context }) : []
  ), [assignmentV5, context]);

  const replacements = useMemo(() => (
    stagedRepair?.questionResults?.map((result) => ({
      questionId: result.questionId,
      question: result.replacementQuestion,
    })) || []
  ), [stagedRepair]);
  const proposedQuestion = replacements.find((entry) => clean(entry.questionId) === questionId)?.question || null;

  const reloadAssignment = async () => {
    const snapshot = await getDoc(doc(db, 'assignments', assignmentId));
    if (snapshot?.exists?.()) {
      const record = { id: snapshot.id, ...snapshot.data() };
      setAssignmentRecord(record);
      const questions = getStoredAssignmentQuestions(record);
      setResolvedQuestion(questions.find((item) => clean(item?.questionId) === questionId) || null);
    }
    await onAssignmentRefresh?.();
  };

  const persist = async (nextContext, successMessage) => {
    setBusy(true);
    setMessage('Saving…');
    try {
      const saved = await saveAssignmentTeacherReviewContext(assignmentId, nextContext);
      setContext(saved);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error.message || 'Could not save teacher review notes.');
    } finally {
      setBusy(false);
    }
  };

  const saveFlag = async () => {
    const trimmed = clean(note);
    if (!questionId) {
      setMessage('This saved question is missing its stable questionId, so MathMaster will not attach a repair note to the wrong question.');
      return;
    }
    if (!trimmed) {
      setMessage('Write the repair note before saving the flag.');
      return;
    }
    setBusy(true);
    setMessage('Saving…');
    try {
      let screenshotId = null;
      if (pendingShot) {
        const stored = await saveTeacherReviewScreenshot({
          dataUrl: pendingShot,
          assignmentId,
          questionId,
        });
        screenshotId = stored.id;
      }

      const next = addTeacherReviewFlag(context, {
        scope: 'question',
        targetId: questionId,
        category,
        severity,
        note: trimmed,
        screenshotId,
      }, { assignmentRevision: baseRevision });
      const saved = await saveAssignmentTeacherReviewContext(assignmentId, next);
      setContext(saved);
      setNote('');
      setPendingShot(null);
      setMessage(screenshotId
        ? 'Teacher flag saved with a screenshot. Both are visible in Repair Center and stay open until you verify the fix.'
        : 'Teacher flag saved. It will remain open until you verify the fix.');
    } catch (error) {
      setMessage(error.message || 'Could not save the teacher flag.');
    } finally {
      setBusy(false);
    }
  };

  const handleScreenshotPaste = (event) => {
    const file = screenshotFileFromPaste(event);
    if (!file) return;
    event.preventDefault();
    attachScreenshot(file);
  };

  const attachScreenshot = async (source) => {
    if (!source) return;
    setMessage('Preparing screenshot…');
    try {
      setPendingShot(await prepareScreenshotDataUrl(source));
      setMessage('Screenshot ready. Write the note that says what is wrong, then save the flag.');
    } catch (error) {
      setMessage(error.message || 'Could not read that screenshot.');
    }
  };

  const removeSavedScreenshot = async (flag) => {
    setBusy(true);
    try {
      const next = detachScreenshotFromFlag(context, flag.id);
      const saved = await saveAssignmentTeacherReviewContext(assignmentId, next);
      setContext(saved);
      await deleteTeacherReviewScreenshot(flag.screenshotId);
      setMessage('Screenshot removed. Your written note is unchanged.');
    } catch (error) {
      setMessage(error.message || 'Could not remove that screenshot.');
    } finally {
      setBusy(false);
    }
  };

  const replaceSavedScreenshot = async (flag, source) => {
    if (!source) return;
    setBusy(true);
    setMessage('Preparing screenshot…');
    try {
      const dataUrl = await prepareScreenshotDataUrl(source);
      const stored = await saveTeacherReviewScreenshot({ dataUrl, assignmentId, questionId, flagId: flag.id });
      const next = attachScreenshotToFlag(context, flag.id, stored.id);
      const saved = await saveAssignmentTeacherReviewContext(assignmentId, next);
      setContext(saved);
      if (flag.screenshotId) await deleteTeacherReviewScreenshot(flag.screenshotId);
      setMessage('Screenshot replaced. Your written note is unchanged.');
    } catch (error) {
      setMessage(error.message || 'Could not replace that screenshot.');
    } finally {
      setBusy(false);
    }
  };

  const verifyFixed = async (flagId) => {
    const next = resolveTeacherReviewFlag(context, flagId, { status: 'resolved' });
    await persist(next, 'Verified fixed. The teacher flag is resolved.');
  };

  const copyRepairRequest = async () => {
    const instructions = openFlags
      .map((flag) => clean(flag?.note))
      .filter(Boolean);
    if (!instructions.length || !resolvedQuestion) {
      setMessage('Save a teacher flag/note first so the repair request contains the exact issue and question to fix.');
      return;
    }
    try {
      const request = buildQuestionRepairRequest({
        assignment: { title: assignmentRecord?.title || `Assignment ${assignmentId}` },
        question: resolvedQuestion,
        instruction: instructions.map((value, index) => `${index + 1}. ${value}`).join('\n'),
        questionNumber: Number.isInteger(Number(questionIndex)) ? Number(questionIndex) + 1 : null,
      });
      await writeClipboardText(request);
      setMessage('This-question repair request copied. It includes this question and its open teacher notes, not the whole assignment.');
    } catch (error) {
      setMessage(error.message || 'Could not copy the repair request.');
    }
  };

  const copyAllFlaggedRepairRequest = async () => {
    if (!assignmentV5) {
      setMessage('MathMaster could not reconstruct the saved assignment yet, so it will not build a batch repair package from partial data.');
      return;
    }
    setBusy(true);
    try {
      const built = buildAllOpenTeacherFlagRepairRequest({
        assignmentV5,
        teacherReviewContext: context,
        assignmentId,
        baseRevision,
      });
      await writeClipboardText(built.request);
      setMessage(`All-flag AI Fix Package copied for ${built.questionIds.length} question${built.questionIds.length === 1 ? '' : 's'}. It contains only the flagged questions plus the teacher constraints that apply to them.`);
    } catch (error) {
      setMessage(error.message || 'Could not copy the all-flag AI Fix Package.');
    } finally {
      setBusy(false);
    }
  };

  const stageRepairText = async (rawText) => {
    if (!assignmentV5 || !allFlaggedQuestionIds.length) {
      setMessage('Save at least one teacher flag before staging a repair response.');
      return;
    }

    setBusy(true);
    setMessage('Validating and running Assignment V5 Preflight…');
    setStagedRepair(null);
    setServerPreview(null);
    try {
      const parsed = parseUnifiedRepairUpload(rawText, {
        assignmentId,
        baseRevision,
        allowedQuestionIds: allFlaggedQuestionIds,
      });
      const staged = stageBatchQuestionRepairImport({
        assignmentV5,
        parsedResponse: parsed,
        baseRevision,
        currentRevision: baseRevision,
        teacherReviewContext: context,
      });
      setStagedRepair(staged);

      if (staged.responseKind === 'reportOnly') {
        const nextContext = {
          ...context,
          platformIssues: [...(context.platformIssues || []), ...(staged.platformIssues || [])],
          unclearIssues: [...(context.unclearIssues || []), ...(staged.unclearIssues || [])],
        };
        const saved = await saveAssignmentTeacherReviewContext(assignmentId, nextContext);
        setContext(saved);
        setMessage('The AI reported a platform issue or an unclear request. It was preserved for review; no question was rewritten.');
        return;
      }
      if (!staged.canCommit) {
        setMessage('The proposed correction introduces a new Assignment V5 Preflight blocker. Review the findings below; Apply is disabled.');
        return;
      }
      const nextReplacements = staged.questionResults.map((result) => ({ questionId: result.questionId, question: result.replacementQuestion }));
      const preview = await teacherAdmin.previewTeacherQuestionRepair({ assignmentId, baseRevision, replacements: nextReplacements });
      setServerPreview(preview);
      setMessage('Correction staged. Test the actual student question below, review the server classification, then apply it here.');
    } catch (error) {
      setMessage(error.message || 'MathMaster refused this repair JSON. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const uploadRepairFromTeacherReview = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const rawText = await file.text();
    setRepairJson(rawText);
    await stageRepairText(rawText);
  };

  const applyCorrectedQuestion = async () => {
    if (!stagedRepair?.canCommit || !serverPreview?.planHash || !replacements.length) return;
    setBusy(true);
    setMessage('Applying corrected question…');
    try {
      await teacherAdmin.commitTeacherQuestionRepair({
        assignmentId,
        baseRevision,
        expectedPlanHash: serverPreview.planHash,
        replacements,
      });
      await reloadAssignment();
      setRepairJson('');
      setStagedRepair(null);
      setServerPreview(null);
      setMessage('Corrected question saved. Existing student work was preserved.');
    } catch (error) {
      setMessage(error.message || 'MathMaster could not save this correction. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  if (!assignmentId || typeof document === 'undefined') return null;

  return createPortal(
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 15000, display: 'grid', justifyItems: 'end', gap: 8 }}>
      {expanded && (
        <aside aria-label="Teacher question review" style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#174ea6' }}>Teacher review · student preview</strong>
              <div style={{ marginTop: 2, color: '#5f6368', fontSize: 11 }}>
                Private teacher notes{questionId ? <> · Question ID <code>{questionId}</code></> : ' · loading question identity…'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" onClick={copyRepairRequest} disabled={busy || !openFlags.length || !resolvedQuestion} style={{ ...buttonStyle, opacity: busy || !openFlags.length || !resolvedQuestion ? 0.55 : 1 }}>
                Copy AI Repair Prompt
              </button>
              <button type="button" onClick={copyAllFlaggedRepairRequest} disabled={busy || !assignmentV5 || !allFlaggedQuestionIds.length} style={{ ...buttonStyle, background: '#174ea6', borderColor: '#174ea6', color: '#fff', opacity: busy || !assignmentV5 || !allFlaggedQuestionIds.length ? 0.55 : 1 }}>
                Copy All Flagged AI Fix Package ({allFlaggedQuestionIds.length})
              </button>
              <input
                ref={repairUploadInputRef}
                type="file"
                accept=".json,application/json"
                onChange={uploadRepairFromTeacherReview}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => repairUploadInputRef.current?.click()}
                disabled={busy || !assignmentV5 || !allFlaggedQuestionIds.length}
                style={{ ...buttonStyle, background: '#188038', borderColor: '#188038', color: '#fff', opacity: busy || !assignmentV5 || !allFlaggedQuestionIds.length ? 0.55 : 1 }}
              >
                Upload Repair JSON
              </button>
            </div>
          </div>

          <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: '#e8f0fe', color: '#174ea6', fontSize: 11.5, lineHeight: 1.4 }}>
            Batch copy includes every question covered by an open teacher flag. Paste and upload share one guarded parser, staging, and Preflight path. Nothing changes until the server classifies the correction and you choose Apply Corrected Question.
          </div>

          <section aria-label="Stage AI repair JSON" style={{ marginTop: 10, padding: 10, border: '1px solid #aecbfa', borderRadius: 9, background: '#fff' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 900 }}>
              Paste Repair JSON
              <textarea
                value={repairJson}
                onChange={(event) => setRepairJson(event.target.value)}
                placeholder="Paste the AI repair response here, then stage it."
                style={{ display: 'block', width: '100%', minHeight: 92, boxSizing: 'border-box', marginTop: 5, padding: 8, border: '1px solid #bdc7d6', borderRadius: 7, fontFamily: 'monospace', fontSize: 11.5 }}
              />
            </label>
            <button type="button" onClick={() => stageRepairText(repairJson)} disabled={busy || !clean(repairJson) || !allFlaggedQuestionIds.length} style={{ ...buttonStyle, marginTop: 7, background: '#174ea6', color: '#fff', opacity: busy || !clean(repairJson) || !allFlaggedQuestionIds.length ? 0.55 : 1 }}>
              Stage Pasted Repair
            </button>
          </section>

          {stagedRepair && (
            <section aria-label="Staged teacher correction" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {(stagedRepair.platformIssues || []).map((issue, index) => (
                <div key={`platform-${index}`} role="status" style={{ padding: 10, borderRadius: 8, background: '#fce8e6', color: '#8c1d18' }}>
                  <strong>Platform issue — question unchanged</strong><div>{issue.reason || issue.message || JSON.stringify(issue)}</div>
                </div>
              ))}
              {(stagedRepair.unclearIssues || []).map((issue, index) => (
                <div key={`unclear-${index}`} role="status" style={{ padding: 10, borderRadius: 8, background: '#fff4ce', color: '#6b5200' }}>
                  <strong>Needs clarification — question unchanged</strong><div>{issue.reason || issue.message || JSON.stringify(issue)}</div>
                </div>
              ))}
              {stagedRepair.validation?.newBlockingDiagnostics?.length > 0 && (
                <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fce8e6', color: '#8c1d18' }}>
                  <strong>Assignment V5 Preflight blocker</strong>
                  {stagedRepair.validation.newBlockingDiagnostics.map((finding, index) => <div key={index}>{finding.message || finding.code || 'Blocking validation issue'}</div>)}
                </div>
              )}
              {proposedQuestion && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <section aria-label="Current Question" style={{ padding: 10, border: '1px solid #dadce0', borderRadius: 9, background: '#f8f9fa' }}>
                    <strong>Current Question</strong>
                    <TeacherRepairCandidateSandbox question={resolvedQuestion} assignmentId={assignmentId} resetKey={`${baseRevision}:${questionId}:current`} />
                  </section>
                  <section aria-label="Proposed Correction">
                    <strong style={{ color: '#137333' }}>Proposed Correction · interactive student renderer</strong>
                    <TeacherRepairCandidateSandbox question={proposedQuestion} assignmentId={assignmentId} resetKey={`${baseRevision}:${questionId}:${serverPreview?.planHash || 'staged'}`} />
                  </section>
                </div>
              )}
              {serverPreview && (
                <section aria-label="Authoritative repair classification" style={{ padding: 10, border: '1px solid #81c995', borderRadius: 9, background: '#e6f4ea' }}>
                  <strong>Server change classification</strong>
                  <div style={{ marginTop: 4, fontSize: 12 }}>Affected students: {Number(serverPreview.affectedStudentCount) || 0}</div>
                  {(serverPreview.changes || []).map((change) => (
                    <div key={change.questionId} style={{ marginTop: 7 }}>
                      <code>{change.questionId}</code> · <strong>{change.classification}</strong> · {change.commitBehavior}
                      {change.reason && <div>{change.reason}</div>}
                      {change.commitBehavior === 'retireAndReplace' && (
                        <div style={{ marginTop: 5, fontWeight: 800 }}>This correction changes the mathematical task. MathMaster will preserve the historical question and student work, retire that flawed version, and introduce the corrected question as fresh work.</div>
                      )}
                    </div>
                  ))}
                </section>
              )}
              <button type="button" onClick={applyCorrectedQuestion} disabled={busy || !stagedRepair.canCommit || !serverPreview?.planHash || !replacements.length} style={{ ...buttonStyle, background: '#188038', borderColor: '#188038', color: '#fff', fontSize: 14, opacity: busy || !stagedRepair.canCommit || !serverPreview?.planHash || !replacements.length ? 0.55 : 1 }}>
                Apply Corrected Question
              </button>
            </section>
          )}

          {questionFlags.length > 0 && (
            <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
              {questionFlags.map((flag) => (
                <div key={flag.id} style={{ padding: 9, border: '1px solid #d9e2f1', borderRadius: 8, background: flag.status === 'resolved' ? '#f1f3f4' : '#fff8e1' }}>
                  <div style={{ fontSize: 12, fontWeight: 900 }}>{flag.status === 'resolved' ? 'Resolved' : 'Needs editing'} · {flag.category || 'review'}</div>
                  <div style={{ marginTop: 3, fontSize: 12.5 }}>{flag.note || 'Teacher review requested'}</div>
                  {flag.screenshotId && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: '#5f6368' }}>📎 Screenshot attached · visible in Repair Center</span>
                      <label style={{ ...buttonStyle, padding: '5px 9px', minHeight: 0, fontSize: 11.5, cursor: busy ? 'default' : 'pointer' }}>
                        Replace
                        <input
                          type="file"
                          accept="image/*"
                          disabled={busy}
                          onChange={(event) => replaceSavedScreenshot(flag, event.target.files?.[0])}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <button type="button" onClick={() => removeSavedScreenshot(flag)} disabled={busy} style={{ ...buttonStyle, padding: '5px 9px', minHeight: 0, fontSize: 11.5, color: '#a50e0e', borderColor: '#f1b6b2' }}>
                        Remove
                      </button>
                    </div>
                  )}
                  {teacherFlagNeedsReview(flag) && (
                    <button type="button" onClick={() => verifyFixed(flag.id)} disabled={busy} style={{ ...buttonStyle, marginTop: 7, color: '#137333', borderColor: '#81c995' }}>
                      Verify fixed
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 800 }}>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 4, border: '1px solid #bdc7d6', borderRadius: 7, background: '#fff' }}>
                <option value="content">Content/math</option>
                <option value="directions">Directions</option>
                <option value="answerKey">Answer/grading</option>
                <option value="toolBehavior">Tool behavior</option>
                <option value="accessibility">Accessibility</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 800 }}>
              Severity
              <select value={severity} onChange={(event) => setSeverity(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 4, border: '1px solid #bdc7d6', borderRadius: 7, background: '#fff' }}>
                <option value="needsEditing">Needs editing</option>
                <option value="blocksStudentUse">Blocks student use</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 8, fontSize: 12, fontWeight: 800 }}>
            Repair note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onPaste={handleScreenshotPaste}
              placeholder="Describe exactly what needs to change on this question. Paste a screenshot here (Ctrl-V) to attach it."
              style={{ display: 'block', width: '100%', minHeight: 72, boxSizing: 'border-box', marginTop: 4, padding: 8, border: '1px solid #bdc7d6', borderRadius: 7, fontFamily: 'inherit' }}
            />
          </label>
          <div
            onPaste={handleScreenshotPaste}
            style={{ marginTop: 8, padding: 8, border: '1px dashed #aecbfa', borderRadius: 8, background: '#fff' }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ ...buttonStyle, minHeight: 0, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                📷 Attach screenshot
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => attachScreenshot(event.target.files?.[0])}
                  style={{ display: 'none' }}
                />
              </label>
              <span style={{ fontSize: 11.5, color: '#5f6368' }}>
                {pendingShot ? 'Screenshot ready — save the flag to attach it.' : 'Or paste one straight into the note above. Optional; the note is what the AI receives.'}
              </span>
              {pendingShot && (
                <button type="button" onClick={() => setPendingShot(null)} style={{ ...buttonStyle, minHeight: 0, padding: '5px 9px', fontSize: 11.5, color: '#a50e0e', borderColor: '#f1b6b2' }}>
                  Discard
                </button>
              )}
            </div>
            {pendingShot && (
              <img src={pendingShot} alt="Screenshot to attach to this teacher note" style={{ marginTop: 8, maxWidth: '100%', maxHeight: 180, borderRadius: 6, border: '1px solid #d9e2f1' }} />
            )}
          </div>
          <button type="button" onClick={saveFlag} disabled={busy || !clean(note) || !questionId} style={{ ...buttonStyle, marginTop: 8, background: '#1a73e8', borderColor: '#1a73e8', color: '#fff', opacity: busy || !clean(note) || !questionId ? 0.55 : 1 }}>
            Save teacher flag
          </button>
          {message && <div role="status" style={{ marginTop: 8, color: '#5f6368', fontSize: 12, lineHeight: 1.45 }}>{message}</div>}
        </aside>
      )}
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} style={{ ...buttonStyle, minHeight: 44, background: '#174ea6', borderColor: '#174ea6', color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,.22)' }}>
        {expanded ? 'Close teacher review' : `Teacher review${openFlags.length ? ` · ${openFlags.length} open` : ''}`}
      </button>
    </div>,
    document.body,
  );
}

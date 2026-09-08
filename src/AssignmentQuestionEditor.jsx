import { useEffect, useMemo, useRef, useState } from 'react';
import AssignmentQuestionEditorBase from './AssignmentQuestionEditorBase.jsx';
import { getStoredAssignmentQuestions, storedAssignmentToV5 } from './platform/contract/storedAssignmentV5.js';
import { flattenV5Sections } from './platform/contract/assignmentSchemaV5.js';
import { analyzeResponseEntryRepair } from './platform/assignment/liveQuestionCorrection.js';
import {
  loadAssignmentTeacherReviewContext,
  saveAssignmentTeacherReviewContext,
} from './platform/preflight/assignmentQuestionReviewStore.js';
import {
  commitStagedQuestionRepairImport,
  stageBatchQuestionRepairImport,
} from './platform/preflight/questionRepairImport.js';
import {
  buildAllOpenTeacherFlagRepairRequest,
  getOpenFlaggedQuestionIds,
  parseUnifiedRepairUpload,
} from './platform/preflight/libraryAssignmentRepairWorkspace.js';
import { screenshotIdsInContext } from './platform/preflight/teacherReviewScreenshot.js';
import { loadTeacherReviewScreenshot } from './platform/preflight/teacherReviewScreenshotStore.js';
import { teacherFlagNeedsReview } from './platform/preflight/assignmentAuthoringState.js';

const buttonStyle = {
  minHeight: 42,
  padding: '9px 13px',
  border: '1px solid #aecbfa',
  borderRadius: 9,
  background: '#fff',
  color: '#174ea6',
  fontWeight: 900,
  cursor: 'pointer',
};

const clean = (value) => String(value ?? '').trim();
const revisionOf = (assignment) => {
  const revision = Number(assignment?.assignmentRevision);
  return Number.isFinite(revision) && revision >= 1 ? revision : 1;
};

const assignmentIdOf = (assignment) => clean(
  assignment?.id
  || assignment?.assignment?.id
  || assignment?.assignment?.assignmentId,
);

const clipboardWrite = async (text) => {
  if (!navigator.clipboard?.writeText) {
    throw new Error('This browser cannot copy the AI Fix Package automatically. Allow clipboard access or use the installed app.');
  }
  await navigator.clipboard.writeText(text);
};

/**
 * Repair Center wrapper around the existing Question Editor.
 *
 * The base editor remains unchanged and continues to own manual edits and the
 * existing Safe Live Repair Pack. This wrapper adds the teacher-flag-driven,
 * one-click outside-AI workflow and deliberately lands through the same onSave
 * boundary as every other question edit.
 */
export default function AssignmentQuestionEditor(props) {
  const {
    assignment,
    hasLiveProtection = false,
    onSave,
  } = props;
  const assignmentId = assignmentIdOf(assignment);
  const baseRevision = revisionOf(assignment);
  const uploadInputRef = useRef(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [teacherReviewContext, setTeacherReviewContext] = useState({ flags: [] });
  // Images are fetched only when the Repair Center is actually open. They live
  // in their own documents precisely so that reading a teacher's notes does not
  // drag megabytes of base64 along with it.
  const [screenshotsById, setScreenshotsById] = useState({});
  const [reviewLoading, setReviewLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pastedRepair, setPastedRepair] = useState('');
  const [stagedRepair, setStagedRepair] = useState(null);

  const assignmentV5 = useMemo(() => {
    const rebuilt = storedAssignmentToV5(assignment);
    return {
      ...rebuilt,
      assignment: {
        ...rebuilt.assignment,
        assignmentId: assignmentId || rebuilt.assignment?.assignmentId || null,
      },
    };
  }, [assignment, assignmentId]);

  useEffect(() => {
    let cancelled = false;
    if (!assignmentId) {
      setReviewLoading(false);
      setMessage('This assignment needs a saved assignment ID before teacher repair notes can be loaded.');
      return undefined;
    }

    setReviewLoading(true);
    loadAssignmentTeacherReviewContext(assignmentId)
      .then((context) => {
        if (cancelled) return;
        setTeacherReviewContext(context || { flags: [] });
        setMessage('');
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message || 'MathMaster could not load the teacher repair notes.');
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [assignmentId]);

  const openTeacherFlags = useMemo(() => (
    (Array.isArray(teacherReviewContext?.flags) ? teacherReviewContext.flags : []).filter(teacherFlagNeedsReview)
  ), [teacherReviewContext]);

  useEffect(() => {
    if (!repairOpen) return undefined;
    let cancelled = false;
    const wanted = screenshotIdsInContext(teacherReviewContext).filter((id) => !screenshotsById[id]);
    if (!wanted.length) return undefined;
    Promise.all(wanted.map((id) => loadTeacherReviewScreenshot(id).catch(() => null)))
      .then((records) => {
        if (cancelled) return;
        const next = {};
        records.filter(Boolean).forEach((record) => { next[record.id] = record; });
        if (Object.keys(next).length) setScreenshotsById((current) => ({ ...current, ...next }));
      });
    return () => { cancelled = true; };
  }, [repairOpen, teacherReviewContext, screenshotsById]);

  const openFlaggedQuestionIds = useMemo(() => (
    getOpenFlaggedQuestionIds({ assignmentV5, teacherReviewContext })
  ), [assignmentV5, teacherReviewContext]);

  const copyAiFixPackage = async () => {
    setBusy(true);
    setMessage('');
    try {
      const built = buildAllOpenTeacherFlagRepairRequest({
        assignmentV5,
        teacherReviewContext,
        assignmentId,
        baseRevision,
      });
      await clipboardWrite(built.request);
      setMessage(`AI Fix Package copied for ${built.questionIds.length} flagged question${built.questionIds.length === 1 ? '' : 's'}. Paste it into ChatGPT, Claude, Gemini, or another AI, then upload the JSON response here.`);
    } catch (error) {
      setMessage(error.message || 'MathMaster could not build the AI Fix Package.');
    } finally {
      setBusy(false);
    }
  };

  const stageRepairText = async (rawText) => {
    setBusy(true);
    setMessage('');
    setStagedRepair(null);
    try {
      if (!openFlaggedQuestionIds.length) {
        throw new Error('There are no open teacher flags. Flag the questions that need editing before importing an AI repair.');
      }
      const parsedResponse = parseUnifiedRepairUpload(rawText, {
        assignmentId,
        baseRevision,
        allowedQuestionIds: openFlaggedQuestionIds,
      });
      const staged = stageBatchQuestionRepairImport({
        assignmentV5,
        parsedResponse,
        baseRevision,
        currentRevision: baseRevision,
        teacherReviewContext,
      });
      setStagedRepair(staged);
      setMessage(staged.canCommit
        ? `${staged.questionResults.length} repaired question${staged.questionResults.length === 1 ? '' : 's'} staged. Review the changes below, then choose Apply Repairs.`
        : 'The uploaded repair introduced a new blocking validation issue. Nothing has been applied.');
    } catch (error) {
      setMessage(error.message || 'MathMaster could not stage this AI repair JSON.');
    } finally {
      setBusy(false);
    }
  };

  const uploadAiRepairs = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    await stageRepairText(await file.text());
  };

  const buildLiveRepairMetadata = (candidateQuestions, questionResults) => {
    if (!hasLiveProtection) return [];
    const historicalQuestions = getStoredAssignmentQuestions(assignment);
    const historicalById = new Map(historicalQuestions.map((question, index) => [
      clean(question?.questionId),
      { question, index },
    ]));
    const candidateById = new Map(candidateQuestions.map((question) => [clean(question?.questionId), question]));

    return questionResults.map((result) => {
      const questionId = clean(result?.questionId);
      const historical = historicalById.get(questionId);
      const replacement = candidateById.get(questionId);
      if (!historical || !replacement) {
        throw new Error(`MathMaster could not match live question "${questionId}" to its protected student history.`);
      }
      const analysis = analyzeResponseEntryRepair(historical.question, replacement);
      if (!analysis.safe) {
        throw new Error(`MathMaster blocked the live rewrite for question "${questionId}": ${analysis.reason}`);
      }
      return {
        questionId: analysis.questionId,
        questionIndex: historical.index,
        affectedFieldIds: analysis.affectedFieldIds,
        beforeFingerprint: analysis.beforeFingerprint,
      };
    });
  };

  const applyRepairs = async () => {
    if (!stagedRepair?.canCommit) return;
    setBusy(true);
    setMessage('');
    try {
      const candidateQuestions = flattenV5Sections(stagedRepair.candidateAssignmentV5);
      const liveRepairs = buildLiveRepairMetadata(candidateQuestions, stagedRepair.questionResults);
      const committed = commitStagedQuestionRepairImport({
        stagedImport: stagedRepair,
        teacherReviewContext,
        currentRevision: baseRevision,
        nextRevision: baseRevision + 1,
      });

      await onSave({
        title: clean(assignment?.title || assignmentV5?.assignment?.title),
        questions: candidateQuestions,
        liveRepairs,
      });
      const savedContext = await saveAssignmentTeacherReviewContext(
        assignmentId,
        committed.teacherReviewContext,
      );
      setTeacherReviewContext(savedContext);
      setStagedRepair(null);
      setPastedRepair('');
      setMessage(`Repairs applied to ${stagedRepair.questionResults.length} question${stagedRepair.questionResults.length === 1 ? '' : 's'}. Teacher flags remain open until you verify the corrected questions in View as Student.`);
    } catch (error) {
      setMessage(error.message || 'MathMaster could not apply these repairs. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AssignmentQuestionEditorBase {...props} />

      <div style={{ position: 'fixed', left: 22, top: 22, zIndex: 16020, display: 'grid', gap: 8 }}>
        <button
          type="button"
          onClick={() => setRepairOpen((current) => !current)}
          style={{ ...buttonStyle, background: '#174ea6', borderColor: '#174ea6', color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.28)' }}
          aria-expanded={repairOpen}
        >
          {repairOpen ? 'Close Repair Center' : `Repair Center${openFlaggedQuestionIds.length ? ` · ${openFlaggedQuestionIds.length} flagged` : ''}`}
        </button>
      </div>

      {repairOpen && (
        <aside
          aria-label="Assignment Repair Center"
          style={{
            position: 'fixed',
            left: 22,
            top: 76,
            zIndex: 16021,
            width: 'min(620px, calc(100vw - 44px))',
            maxHeight: 'calc(100vh - 98px)',
            overflow: 'auto',
            boxSizing: 'border-box',
            padding: 18,
            border: '2px solid #1a73e8',
            borderRadius: 14,
            background: '#f8fbff',
            color: '#202124',
            boxShadow: '0 18px 48px rgba(0,0,0,.34)',
          }}
        >
          <h2 style={{ margin: 0, color: '#174ea6' }}>Assignment Repair Center</h2>
          <p style={{ margin: '6px 0 14px', color: '#5f6368', lineHeight: 1.45 }}>
            {reviewLoading
              ? 'Loading private teacher flags…'
              : `${openFlaggedQuestionIds.length} question${openFlaggedQuestionIds.length === 1 ? '' : 's'} currently covered by open teacher flags. Notes stay private and are included automatically.`}
          </p>

          {/*
            * The teacher's own evidence, shown where the repair happens.
            *
            * A note says what is wrong; the screenshot beside it shows the
            * thing being described. Both are private to this teacher and both
            * stay out of the assignment document students can read. The image
            * is displayed here and deliberately never travels in the AI Fix
            * Package: it cannot help a text repair, and one screenshot can
            * dwarf the question JSON it belongs to.
            */}
          {openTeacherFlags.length > 0 && (
            <div style={{ display: 'grid', gap: 8, margin: '0 0 14px' }}>
              {openTeacherFlags.map((flag) => {
                const shot = flag.screenshotId ? screenshotsById[flag.screenshotId] : null;
                return (
                  <div key={flag.id} style={{ padding: 10, border: '1px solid #d9e2f1', borderRadius: 9, background: '#fff' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 900, color: '#7a4f01' }}>
                      {flag.scope === 'question' ? `Question ${flag.targetId}` : `${flag.scope} note`} · {flag.category || 'review'}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45 }}>{flag.note || 'Teacher review requested'}</div>
                    {flag.screenshotId && (
                      shot
                        ? (
                          <a href={shot.dataUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                            <img
                              src={shot.dataUrl}
                              alt={`Teacher screenshot for ${flag.targetId || 'this assignment'}`}
                              style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 7, border: '1px solid #d9e2f1' }}
                            />
                          </a>
                        )
                        : <div style={{ marginTop: 6, fontSize: 11.5, color: '#5f6368' }}>Loading screenshot…</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={copyAiFixPackage}
              disabled={busy || reviewLoading || !openFlaggedQuestionIds.length}
              style={{ ...buttonStyle, background: '#174ea6', borderColor: '#174ea6', color: '#fff', opacity: busy || reviewLoading || !openFlaggedQuestionIds.length ? 0.55 : 1 }}
            >
              Copy AI Fix Package
            </button>

            <input
              ref={uploadInputRef}
              type="file"
              accept=".json,application/json"
              onChange={uploadAiRepairs}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={busy || reviewLoading || !openFlaggedQuestionIds.length}
              style={{ ...buttonStyle, background: '#188038', borderColor: '#188038', color: '#fff', opacity: busy || reviewLoading || !openFlaggedQuestionIds.length ? 0.55 : 1 }}
            >
              Upload AI Repairs
            </button>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 900, color: '#174ea6' }}>Paste JSON instead</summary>
            <textarea
              value={pastedRepair}
              onChange={(event) => setPastedRepair(event.target.value)}
              placeholder="Paste one repaired question JSON or the batch repair response here."
              style={{ width: '100%', minHeight: 120, boxSizing: 'border-box', marginTop: 8, padding: 9, border: '1px solid #bdc7d6', borderRadius: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
            />
            <button
              type="button"
              onClick={() => stageRepairText(pastedRepair)}
              disabled={busy || !clean(pastedRepair)}
              style={{ ...buttonStyle, marginTop: 8 }}
            >
              Stage pasted AI repairs
            </button>
          </details>

          {stagedRepair && (
            <section style={{ marginTop: 15, padding: 12, border: `1px solid ${stagedRepair.canCommit ? '#81c995' : '#f28b82'}`, borderRadius: 10, background: '#fff' }}>
              <strong>{stagedRepair.canCommit ? 'Ready for teacher review' : 'Repair blocked by validation'}</strong>
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                {stagedRepair.questionResults.map((result) => (
                  <div key={result.questionId} style={{ padding: 8, borderRadius: 8, background: '#f8f9fa' }}>
                    <div style={{ fontWeight: 900 }}>Question ID {result.questionId}</div>
                    <div style={{ marginTop: 3, color: '#5f6368', fontSize: 12 }}>
                      {result.diff.length} changed field{result.diff.length === 1 ? '' : 's'}
                      {result.diff.length ? ` · ${result.diff.slice(0, 5).map((change) => change.path || '(root)').join(' · ')}${result.diff.length > 5 ? ' · …' : ''}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              {stagedRepair.validation?.newBlockingDiagnostics?.length > 0 && (
                <div style={{ marginTop: 8, color: '#a50e0e', fontSize: 12 }}>
                  {stagedRepair.validation.newBlockingDiagnostics.map((item) => item.message || item.code).filter(Boolean).join(' · ')}
                </div>
              )}
              <button
                type="button"
                onClick={applyRepairs}
                disabled={busy || !stagedRepair.canCommit}
                style={{ ...buttonStyle, marginTop: 10, width: '100%', background: '#188038', borderColor: '#188038', color: '#fff', opacity: busy || !stagedRepair.canCommit ? 0.55 : 1 }}
              >
                Apply Repairs
              </button>
              <div style={{ marginTop: 7, color: '#5f6368', fontSize: 11, lineHeight: 1.4 }}>
                Applying does not resolve teacher flags. Verify the corrected questions in View as Student before closing the flags.
                {hasLiveProtection ? ' Because student history exists, MathMaster will also refuse any uploaded rewrite that changes the protected mathematical task.' : ''}
              </div>
            </section>
          )}

          {message && <div role="status" style={{ marginTop: 12, padding: 9, borderRadius: 8, background: '#fff', color: '#3c4043', fontSize: 12.5, lineHeight: 1.45 }}>{message}</div>}
        </aside>
      )}
    </>
  );
}

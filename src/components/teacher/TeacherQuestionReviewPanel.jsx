import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
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
  width: 'min(720px, calc(100vw - 24px))',
  maxHeight: 'min(72vh, 680px)',
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

export default function TeacherQuestionReviewPanel({
  assignmentId,
  questionId: questionIdProp = '',
  question: questionProp = null,
  questionIndex = null,
}) {
  const [context, setContext] = useState({ flags: [] });
  const [resolvedQuestion, setResolvedQuestion] = useState(questionProp);
  const [category, setCategory] = useState('content');
  const [severity, setSeverity] = useState('needsEditing');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Held until the flag is saved, so the note and its evidence land together
  // and a teacher never ends up with a picture attached to nothing.
  const [pendingShot, setPendingShot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!assignmentId) return undefined;
    Promise.all([
      loadAssignmentTeacherReviewContext(assignmentId),
      questionProp || questionIdProp || !Number.isInteger(Number(questionIndex))
        ? Promise.resolve(null)
        : getDoc(doc(db, 'assignments', assignmentId)),
    ])
      .then(([nextContext, assignmentSnapshot]) => {
        if (cancelled) return;
        setContext(nextContext || { flags: [] });
        if (questionProp) setResolvedQuestion(questionProp);
        else if (assignmentSnapshot?.exists?.()) {
          const questions = getStoredAssignmentQuestions({ id: assignmentSnapshot.id, ...assignmentSnapshot.data() });
          setResolvedQuestion(questions[Number(questionIndex)] || null);
        }
        setMessage('');
      })
      .catch((error) => {
        if (!cancelled) setMessage(error.message || 'Could not load teacher review notes.');
      });
    return () => { cancelled = true; };
  }, [assignmentId, questionIdProp, questionIndex, questionProp]);

  const questionId = String(questionIdProp || resolvedQuestion?.questionId || '').trim();
  const questionFlags = useMemo(() => (
    (Array.isArray(context?.flags) ? context.flags : []).filter((flag) => (
      flag?.scope === 'question' && String(flag?.targetId || '') === questionId
    ))
  ), [context, questionId]);
  const openFlags = questionFlags.filter(teacherFlagNeedsReview);

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
    const trimmed = String(note || '').trim();
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
      // The screenshot is written first so the flag can point at a row that
      // exists. If this fails the flag is not saved either, and the teacher
      // still has their typed note on screen to retry with.
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
      });
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

  /*
   * Ctrl-V is the gesture teachers actually use: take the screenshot, click
   * into the note, paste. So the note field itself accepts the image, not just
   * the drop area beside it — a paste target the teacher has to find first is a
   * paste target that does not get used.
   *
   * preventDefault only when an image is actually on the clipboard, so pasting
   * text into the note keeps working normally.
   */
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
      // Only after the reference is gone, so a failure here leaves an unused
      // row rather than a flag pointing at a screenshot that no longer exists.
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
      .map((flag) => String(flag?.note || '').trim())
      .filter(Boolean);
    if (!instructions.length || !resolvedQuestion) {
      setMessage('Save a teacher flag/note first so the repair request contains the exact issue and question to fix.');
      return;
    }
    try {
      const request = buildQuestionRepairRequest({
        assignment: { title: `Assignment ${assignmentId}` },
        question: resolvedQuestion,
        instruction: instructions.map((value, index) => `${index + 1}. ${value}`).join('\n'),
        questionNumber: Number.isInteger(Number(questionIndex)) ? Number(questionIndex) + 1 : null,
      });
      await writeClipboardText(request);
      setMessage('Question-only repair request copied. It includes this question and your open teacher notes, not the whole assignment.');
    } catch (error) {
      setMessage(error.message || 'Could not copy the repair request.');
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
            <button type="button" onClick={copyRepairRequest} disabled={busy || !openFlags.length || !resolvedQuestion} style={{ ...buttonStyle, opacity: busy || !openFlags.length || !resolvedQuestion ? 0.55 : 1 }}>
              Copy repair request
            </button>
          </div>

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
          {/*
            * Evidence, beside the words rather than instead of them. A picture
            * of a collided graph label is instant to take and near-impossible
            * to describe, but a screenshot alone gives a repairing AI nothing
            * to act on — the note is what becomes the repair constraint, so the
            * save button stays disabled until it is written.
            */}
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
          <button type="button" onClick={saveFlag} disabled={busy || !String(note || '').trim() || !questionId} style={{ ...buttonStyle, marginTop: 8, background: '#1a73e8', borderColor: '#1a73e8', color: '#fff', opacity: busy || !String(note || '').trim() || !questionId ? 0.55 : 1 }}>
            Save teacher flag
          </button>
          {message && <div role="status" style={{ marginTop: 8, color: '#5f6368', fontSize: 12 }}>{message}</div>}
        </aside>
      )}
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} style={{ ...buttonStyle, minHeight: 44, background: '#174ea6', borderColor: '#174ea6', color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,.22)' }}>
        {expanded ? 'Close teacher review' : `Teacher review${openFlags.length ? ` · ${openFlags.length} open` : ''}`}
      </button>
    </div>,
    document.body,
  );
}

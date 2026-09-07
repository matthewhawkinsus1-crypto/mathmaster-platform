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
    const next = addTeacherReviewFlag(context, {
      scope: 'question',
      targetId: questionId,
      category,
      severity,
      note: trimmed,
    });
    await persist(next, 'Teacher flag saved. It will remain open until you verify the fix.');
    setNote('');
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
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe exactly what needs to change on this question." style={{ display: 'block', width: '100%', minHeight: 72, boxSizing: 'border-box', marginTop: 4, padding: 8, border: '1px solid #bdc7d6', borderRadius: 7, fontFamily: 'inherit' }} />
          </label>
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

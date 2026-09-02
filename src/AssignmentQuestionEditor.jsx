import { useMemo, useRef, useState } from 'react';
import QuestionStandardsEditor from './QuestionStandardsEditor';
import { getQuestionMetadataSummary } from './questionMetadata.js';
import { useToast } from './ui/Toast';
import { buildQuestionRepairRequest, parseQuestionRepairResponse } from './platform/contract/questionRepairRequest.js';
import { getStoredAssignmentQuestions, storedAssignmentToV5 } from './platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';
import { analyzeResponseEntryRepair } from './platform/assignment/liveQuestionCorrection.js';
import { parseSafeLiveRepairPack, prepareSafeLiveRepairPack } from './platform/assignment/liveRepairPack.js';
import { normalizeQuestionWeight, suggestedQuestionWeight } from './platform/grading/questionWeights.js';
import {
  buildAssignmentWeightReviewRequest,
  parseAssignmentWeightReviewPack,
  prepareAssignmentWeightReviewPack,
} from './platform/grading/weightReviewPack.js';

const newQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const cloneQuestion = (question) => JSON.parse(JSON.stringify(question));
const ensureQuestionIds = (questions = []) => questions.map((question, index) => ({
  ...cloneQuestion(question),
  questionId: question.questionId || `legacy_${index + 1}_${newQuestionId()}`,
}));

const promptSummary = (question) => String(
  question.prompt || question.scenario || question.title || question.mathDisplay?.value || 'No prompt supplied',
).replace(/\s+/g, ' ').trim();

export default function AssignmentQuestionEditor({ assignment, hasLiveProtection, onSave, onClose }) {
  const { confirm: confirmAction, toastSuccess } = useToast();
  const [title, setTitle] = useState(assignment.title || '');
  const originalQuestions = useMemo(
    () => ensureQuestionIds(getStoredAssignmentQuestions(assignment)),
    [assignment],
  );
  const originalQuestionById = useMemo(
    () => new Map(originalQuestions.map((question) => [question.questionId, question])),
    [originalQuestions],
  );
  const [questions, setQuestions] = useState(() => originalQuestions.map(cloneQuestion));
  const [liveRepairs, setLiveRepairs] = useState([]);
  const [repairIndex, setRepairIndex] = useState(null);
  const [metadataEditingIndex, setMetadataEditingIndex] = useState(null);
  const [repairInstruction, setRepairInstruction] = useState('');
  const [repairBusy, setRepairBusy] = useState(false);
  const [weightReviewBusy, setWeightReviewBusy] = useState(false);
  const [weightReviewReasons, setWeightReviewReasons] = useState({});
  const repairPackInputRef = useRef(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const includedCount = useMemo(() => questions.filter((question) => question.teacherExcluded !== true).length, [questions]);
  const totalGradeWeight = useMemo(
    () => questions
      .filter((question) => question.teacherExcluded !== true)
      .reduce((total, question) => total + normalizeQuestionWeight(question), 0),
    [questions],
  );

  const copyAiWeightReview = async () => {
    setWeightReviewBusy(true);
    setError('');
    try {
      const request = buildAssignmentWeightReviewRequest({
        assignment,
        questions,
      });
      if (!navigator.clipboard?.writeText) {
        throw new Error('This browser cannot copy the AI Weight Review automatically. Use a browser with clipboard permission.');
      }
      await navigator.clipboard.writeText(request);
      toastSuccess?.(
        'AI Weight Review copied',
        'Paste it into ChatGPT, Claude, Gemini, or another AI. Copy only the JSON it returns, then come back and choose Paste AI Weight Review.',
      );
    } catch (reviewError) {
      setError(reviewError.message || 'MathMaster could not build the AI Weight Review.');
    } finally {
      setWeightReviewBusy(false);
    }
  };

  const pasteAiWeightReview = async () => {
    setWeightReviewBusy(true);
    setError('');
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('This browser cannot read the clipboard automatically. Allow clipboard access, then try again.');
      }
      const raw = await navigator.clipboard.readText();
      const pack = parseAssignmentWeightReviewPack(raw);
      const prepared = prepareAssignmentWeightReviewPack({
        pack,
        assignment,
        questions,
      });
      if (prepared.changedCount === 0) {
        toastSuccess?.(
          'AI Weight Review checked',
          `The AI reviewed all ${prepared.reviewedCount} included questions and recommended the weights already shown.`,
        );
        return;
      }

      const biggest = [...prepared.changes]
        .sort((left, right) => Math.abs(right.afterWeight - right.beforeWeight) - Math.abs(left.afterWeight - left.beforeWeight))
        .slice(0, 4)
        .map((change) => `${change.questionId}: ×${change.beforeWeight} → ×${change.afterWeight}`)
        .join(' · ');
      const proceed = await confirmAction({
        title: `Load ${prepared.changedCount} AI weight recommendation${prepared.changedCount === 1 ? '' : 's'}?`,
        message: `MathMaster verified this JSON belongs to this exact assignment and contains every included question exactly once. Only grade weights will change in the editor; nothing is saved yet. ${biggest}${prepared.changedCount > 4 ? ' · …' : ''}`,
        confirmLabel: 'Load AI Weights',
      });
      if (!proceed) return;

      setQuestions(prepared.questions);
      setWeightReviewReasons(Object.fromEntries(
        prepared.changes.map((change) => [String(change.questionId), change.reason]),
      ));
      toastSuccess?.(
        'AI weights loaded for review',
        `${prepared.changedCount} weight${prepared.changedCount === 1 ? '' : 's'} changed across ${prepared.reviewedCount} questions. Review the percentages, adjust anything you want, then save once.`,
      );
    } catch (reviewError) {
      setError(reviewError.message || 'MathMaster could not import the AI Weight Review.');
    } finally {
      setWeightReviewBusy(false);
    }
  };

  const setQuestionWeight = (index, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const nextWeight = Math.max(0.25, Math.min(20, parsed));
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, questionWeight: nextWeight } : question
    )));
  };

  const toggleExcluded = (index) => {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, teacherExcluded: question.teacherExcluded !== true } : question));
  };

  const removeQuestion = async (index) => {
    const question = questions[index];
    if (hasLiveProtection) {
      const proceed = await confirmAction({
        title: 'Throw this question out safely?',
        message: 'Student records already exist, so the question stays at its original index and is only hidden from students and excluded from grading. That keeps existing responses lined up with the right questions.',
        confirmLabel: 'Throw Out Safely',
      });
      if (!proceed) return;
      setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, teacherExcluded: true } : item));
      return;
    }
    const proceed = await confirmAction({
      title: `Permanently remove Question ${index + 1}?`,
      message: promptSummary(question).slice(0, 160),
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!proceed) return;
    setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const duplicateQuestion = (index) => {
    const duplicate = {
      ...cloneQuestion(questions[index]),
      questionId: newQuestionId(),
      teacherExcluded: false,
    };
    setQuestions((current) => {
      if (hasLiveProtection) return [...current, duplicate];
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)];
    });
  };

  const moveQuestion = (index, direction) => {
    if (hasLiveProtection) return;
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const beginRepair = async (index) => {
    const question = questions[index];
    const historicalQuestion = originalQuestionById.get(question?.questionId);
    if (hasLiveProtection && historicalQuestion) {
      const proceed = await confirmAction({
        title: 'Start a safe live repair?',
        message: 'Students have already worked on this assignment. MathMaster will allow only a response-entry repair that keeps this exact question, ID, prompt, mathematics, graph/table, standards, and answer-field IDs unchanged. Converting a flawed written-response field to finite choices is allowed; a real rewrite will be rejected. Existing attempts and credit will be protected when you save.',
        confirmLabel: 'Start Safe Repair',
      });
      if (!proceed) return;
    }
    setMetadataEditingIndex(null);
    setRepairIndex(index);
    setRepairInstruction(
      hasLiveProtection && historicalQuestion
        ? 'Convert only the flawed plain-language free-response field(s) to finite choice selections. Keep the question ID, prompt, mathematical task, graph/table, standards, field IDs, and correct meaning exactly the same. Use exactly one previously accepted correct wording as the keyed choice.'
        : '',
    );
    setError('');
  };

  const copyRepairRequest = async () => {
    if (repairIndex == null) return;
    try {
      const request = buildQuestionRepairRequest({
        assignment,
        question: questions[repairIndex],
        instruction: repairInstruction,
        questionNumber: repairIndex + 1,
      });
      if (!navigator.clipboard?.writeText) {
        throw new Error('This browser cannot copy the repair request automatically. Use a browser with clipboard permission or open MathMaster in the installed app.');
      }
      await navigator.clipboard.writeText(request);
      toastSuccess?.(
        'AI repair request copied',
        'Paste it into ChatGPT, Claude, or Gemini. Copy the replacement question it returns, then come back and choose Paste AI Replacement.',
      );
    } catch (repairError) {
      setError(repairError.message);
    }
  };

  const pasteAiReplacement = async () => {
    if (repairIndex == null) return;
    setRepairBusy(true);
    setError('');
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('This browser cannot read the clipboard automatically. Allow clipboard access, then try again.');
      }
      const text = await navigator.clipboard.readText();
      const replacement = parseQuestionRepairResponse(text);
      const existing = questions[repairIndex];
      const nextQuestion = {
        ...replacement,
        questionId: existing.questionId || replacement.questionId || newQuestionId(),
        teacherExcluded: existing.teacherExcluded === true,
      };
      const historicalQuestion = originalQuestionById.get(existing.questionId);
      let liveRepair = null;
      if (hasLiveProtection && historicalQuestion) {
        liveRepair = analyzeResponseEntryRepair(historicalQuestion, nextQuestion);
        if (!liveRepair.safe) {
          throw new Error(`MathMaster blocked this live rewrite: ${liveRepair.reason}`);
        }
      }

      const candidateQuestions = questions.map((question, index) => (
        index === repairIndex ? nextQuestion : question
      ));
      const candidateV5 = storedAssignmentToV5(assignment, {
        titleOverride: title.trim() || assignment.title,
        questions: candidateQuestions,
      });
      const model = buildAssignmentV5PreflightModel(candidateV5);
      if (!model.isValid) {
        throw new Error(`MathMaster rejected the AI replacement:\n${model.errors.join('\n')}`);
      }
      setQuestions(candidateQuestions);
      if (liveRepair?.safe) {
        setLiveRepairs((current) => [
          ...current.filter((item) => item.questionId !== liveRepair.questionId),
          {
            questionId: liveRepair.questionId,
            questionIndex: repairIndex,
            affectedFieldIds: liveRepair.affectedFieldIds,
            beforeFingerprint: liveRepair.beforeFingerprint,
          },
        ]);
      }
      setRepairIndex(null);
      setRepairInstruction('');
      toastSuccess?.(
        liveRepair?.safe ? 'Safe live repair accepted' : 'Question replacement accepted',
        liveRepair?.safe
          ? 'MathMaster verified that only response-entry mechanics changed. Existing student credit and attempts will be protected when you save.'
          : 'MathMaster checked the repaired question. Save Assignment Questions when you are ready.',
      );
    } catch (repairError) {
      setError(repairError.message);
    } finally {
      setRepairBusy(false);
    }
  };

  const importSafeRepairPack = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    setRepairBusy(true);
    setError('');
    try {
      const pack = parseSafeLiveRepairPack(await file.text());
      const prepared = prepareSafeLiveRepairPack({
        pack,
        currentQuestions: questions,
        historicalQuestions: originalQuestions,
      });
      const candidateV5 = storedAssignmentToV5(assignment, {
        titleOverride: title.trim() || assignment.title,
        questions: prepared.questions,
      });
      const model = buildAssignmentV5PreflightModel(candidateV5);
      if (!model.isValid) {
        throw new Error(`MathMaster rejected this repair pack:\n${model.errors.join('\n')}`);
      }

      const proceed = await confirmAction({
        title: `Apply ${prepared.replacementCount} safe live repair${prepared.replacementCount === 1 ? '' : 's'}?`,
        message: `MathMaster matched every replacement by protected question ID, verified that only eligible response-entry controls change, and passed the whole assignment preflight. This will save all ${prepared.replacementCount} repairs together now. Existing student attempts and grade history will be protected by the live-correction transaction.`,
        confirmLabel: `Apply ${prepared.replacementCount} Repair${prepared.replacementCount === 1 ? '' : 's'}`,
      });
      if (!proceed) return;

      setQuestions(prepared.questions);
      setLiveRepairs(prepared.liveRepairs);
      setSaving(true);
      await onSave({
        title: title.trim(),
        questions: prepared.questions,
        liveRepairs: prepared.liveRepairs,
      });
    } catch (packError) {
      setError(packError.message || 'MathMaster could not import this Safe Live Repair Pack.');
    } finally {
      setRepairBusy(false);
      setSaving(false);
    }
  };

  const applyMetadataEdit = async (index, nextQuestion) => {
    if (hasLiveProtection) {
      const proceed = await confirmAction({
        title: 'Recalculate existing mastery reports?',
        message: 'Student records already exist. Changing TEKS, DOK, difficulty, purpose, or evidence weight will recalculate standards and mastery reports for responses students have already submitted.',
        confirmLabel: 'Apply changes',
      });
      if (!proceed) return;
    }
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? nextQuestion : question));
    setMetadataEditingIndex(null);
    setError('');
  };

  const save = async () => {
    if (!title.trim()) {
      setError('Enter an assignment title.');
      return;
    }
    if (!questions.length || includedCount === 0) {
      setError('At least one included question is required.');
      return;
    }

    const changedWeights = questions.filter((question) => {
      const historical = originalQuestionById.get(question.questionId);
      return historical && Math.abs(normalizeQuestionWeight(historical) - normalizeQuestionWeight(question)) > 1e-9;
    });
    if (hasLiveProtection && changedWeights.length > 0) {
      const proceed = await confirmAction({
        title: `Recalculate live grades using ${changedWeights.length} new question weight${changedWeights.length === 1 ? '' : 's'}?`,
        message: 'Student answers, attempts, and partial-credit history will stay exactly as recorded. Their current assignment percentages will be recalculated from those same records using the new weights, and MathMaster will queue Google Classroom to reconcile its grade.',
        confirmLabel: 'Recalculate Grades',
      });
      if (!proceed) return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({ title: title.trim(), questions, liveRepairs });
    } catch (saveError) {
      setError(saveError.message || 'The assignment could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 15000, background: 'rgba(32,33,36,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px' }}>
      <section role="dialog" aria-modal="true" aria-label="Edit assignment questions" style={{ width: 'min(1080px, 97vw)', maxHeight: '94vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '16px', boxShadow: '0 28px 80px rgba(0,0,0,.4)' }}>
        <header style={{ padding: '20px 24px', borderBottom: '1px solid #e1e5ea', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
          <div><h2 style={{ margin: 0 }}>Assignment Question Editor</h2><p style={{ margin: '5px 0 0', color: '#5f6368' }}>{hasLiveProtection ? 'This assignment is live or has student history. Existing question IDs and indexes are protected. Safe live response-entry repairs are allowed; real rewrites are still blocked.' : 'No student records exist. Questions may be removed and reordered permanently.'}</p></div>
          <button type="button" onClick={onClose} style={{ padding: '9px 13px', borderRadius: '8px', border: '1px solid #cbd1da', background: '#fff', fontWeight: 800 }}>Close</button>
        </header>
        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          <label style={{ display: 'block', fontWeight: 800, marginBottom: '18px' }}>Assignment title
            <input value={title} onChange={(event) => setTitle(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px', marginTop: '7px', border: '1px solid #bdc7d6', borderRadius: '8px', fontSize: '17px' }} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
            <strong>{includedCount} included · {questions.length - includedCount} excluded · {questions.length} stored · {Number(totalGradeWeight.toFixed(2))} total grade-weight units</strong>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={copyAiWeightReview}
                disabled={weightReviewBusy || saving}
                style={{ padding: '8px 12px', border: '1px solid #8ab4f8', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 900 }}
                title="Copy a protected whole-assignment review prompt for ChatGPT, Claude, Gemini, or another AI."
              >
                Copy AI Weight Review
              </button>
              <button
                type="button"
                onClick={pasteAiWeightReview}
                disabled={weightReviewBusy || saving}
                style={{ padding: '8px 12px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900 }}
                title="Paste the MathMaster Weight Review JSON returned by an AI. Only question weights can be imported."
              >
                {weightReviewBusy ? 'Checking AI Weights…' : 'Paste AI Weight Review'}
              </button>
              {hasLiveProtection && (
                <>
                  <input
                    ref={repairPackInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={importSafeRepairPack}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => repairPackInputRef.current?.click()}
                    disabled={repairBusy || saving}
                    style={{ padding: '8px 12px', border: 0, borderRadius: 8, background: '#188038', color: '#fff', fontWeight: 900 }}
                    title="Import a MathMaster Safe Live Repair Pack, validate every protected question, and save all approved repairs together."
                  >
                    {repairBusy ? 'Checking Repair Pack…' : 'Import Safe Repair Pack'}
                  </button>
                </>
              )}
              <span style={{ color: '#5f6368', fontSize: '13px' }}>Duplicated questions are added safely. Reordering is disabled after student activity begins.</span>
            </div>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {questions.map((question, index) => {
              const excluded = question.teacherExcluded === true;
              const metadataSummary = getQuestionMetadataSummary(question);
              return (
                <article key={question.questionId || index} style={{ padding: '15px', borderRadius: '11px', border: `2px solid ${excluded ? '#c7cbd1' : '#c6d8f1'}`, background: excluded ? '#f1f3f4' : '#fbfcff', opacity: excluded ? 0.78 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 430px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}><strong style={{ fontSize: '16px' }}>Question {index + 1}</strong><span style={{ padding: '3px 7px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontSize: '11px', fontWeight: 900 }}>{question.type}</span>{excluded && <span style={{ padding: '3px 7px', borderRadius: '999px', background: '#5f6368', color: '#fff', fontSize: '11px', fontWeight: 900 }}>EXCLUDED</span>}</div>
                      <p style={{ margin: '8px 0 0', color: '#3c4043', lineHeight: 1.45 }}>{promptSummary(question).slice(0, 240)}</p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '9px' }}>
                        {metadataSummary.primary.map((code) => <span key={code} style={{ padding: '3px 7px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontSize: '10px', fontWeight: 900 }}>TEKS {code}</span>)}
                        {metadataSummary.dok && <span style={{ padding: '3px 7px', borderRadius: '999px', background: '#fff3e0', color: '#8a4f00', fontSize: '10px', fontWeight: 900 }}>DOK {metadataSummary.dok}</span>}
                        <span style={{ padding: '3px 7px', borderRadius: '999px', background: '#f3e8fd', color: '#7b1fa2', fontSize: '10px', fontWeight: 900 }}>{metadataSummary.difficultyLabel}</span>
                        <span style={{ padding: '3px 7px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontSize: '10px', fontWeight: 900 }}>
                          GRADE ×{normalizeQuestionWeight(question)}
                          {excluded || totalGradeWeight <= 0 ? '' : ` · ${((normalizeQuestionWeight(question) / totalGradeWeight) * 100).toFixed(1)}%`}
                        </span>
                        {weightReviewReasons[String(question.questionId)] && (
                          <span
                            title={weightReviewReasons[String(question.questionId)]}
                            style={{ padding: '3px 7px', borderRadius: '999px', background: '#fef7e0', color: '#7a4f00', fontSize: '10px', fontWeight: 900 }}
                          >
                            AI rationale
                          </span>
                        )}
                        {metadataSummary.issues.length > 0 && <span title={metadataSummary.issues.join(' · ')} style={{ padding: '3px 7px', borderRadius: '999px', background: '#fce8e6', color: '#a50e0e', fontSize: '10px', fontWeight: 900 }}>Metadata incomplete</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 7px', border: '1px solid #cbd1da', borderRadius: 7, background: '#fff', fontSize: 11, fontWeight: 900, color: '#3c4043' }}>
                        Grade weight
                        <input
                          aria-label={`Grade weight for Question ${index + 1}`}
                          type="number"
                          min="0.25"
                          max="20"
                          step="0.25"
                          value={normalizeQuestionWeight(question)}
                          onChange={(event) => setQuestionWeight(index, event.target.value)}
                          style={{ width: 58, padding: '4px 5px', border: '1px solid #bdc7d6', borderRadius: 5 }}
                        />
                      </label>
                      {suggestedQuestionWeight(question) !== normalizeQuestionWeight(question) && (
                        <button
                          type="button"
                          onClick={() => setQuestionWeight(index, suggestedQuestionWeight(question))}
                          title="Use MathMaster's workload-based suggestion. You can still change it."
                          style={{ color: '#174ea6' }}
                        >
                          Suggest ×{suggestedQuestionWeight(question)}
                        </button>
                      )}
                      <button type="button" onClick={() => moveQuestion(index, -1)} disabled={hasLiveProtection || index === 0} title={hasLiveProtection ? 'Reordering is disabled because student data exists.' : 'Move up'}>↑</button>
                      <button type="button" onClick={() => moveQuestion(index, 1)} disabled={hasLiveProtection || index === questions.length - 1} title={hasLiveProtection ? 'Reordering is disabled because student data exists.' : 'Move down'}>↓</button>
                      <button type="button" onClick={() => duplicateQuestion(index)}>Duplicate</button>
                      <button
                        type="button"
                        onClick={() => beginRepair(index)}
                        title={hasLiveProtection && originalQuestionById.has(question.questionId)
                          ? 'Safe live repair: only response-entry mechanics may change; prior student credit and attempts are protected.'
                          : 'Describe the problem in plain English and use AI to return a checked replacement.'}
                      >{hasLiveProtection && originalQuestionById.has(question.questionId) ? 'Safe Live Repair' : 'Repair / Rewrite with AI'}</button>
                      <button type="button" onClick={() => { setRepairIndex(null); setMetadataEditingIndex(metadataEditingIndex === index ? null : index); setError(''); }} style={{ color: '#174ea6' }}>Standards & Difficulty</button>
                      <button type="button" onClick={() => toggleExcluded(index)} style={{ color: excluded ? '#137333' : '#8a5a00' }}>{excluded ? 'Include' : 'Exclude'}</button>
                      <button type="button" onClick={() => removeQuestion(index)} style={{ color: '#d93025' }}>{hasLiveProtection ? 'Throw Out Safely' : 'Remove'}</button>
                    </div>
                  </div>
                  {repairIndex === index && (
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #d9dfe7' }}>
                      <div style={{ padding: '12px 13px', borderRadius: '9px', background: '#f8fbff', border: '1px solid #c6d8f1' }}>
                        <strong style={{ color: '#174ea6' }}>{hasLiveProtection && originalQuestionById.has(question.questionId) ? 'Safe live response-entry repair' : 'Repair or rewrite this question with AI'}</strong>
                        <p style={{ margin: '6px 0 10px', color: '#5f6368', fontSize: '13px', lineHeight: 1.5 }}>
                          {hasLiveProtection && originalQuestionById.has(question.questionId)
                            ? 'Students already have history on this question. MathMaster will accept only a conversion of flawed plain-language response fields to finite choices while keeping the exact task and IDs unchanged. On save, previously submitted affected fields are credited and an exhausted student gets one repair retry if another part is still wrong.'
                            : 'Describe the issue in normal language. MathMaster copies the full question and repair rules for the AI, then checks the replacement before accepting it here.'}
                        </p>
                        <label style={{ display: 'block', fontWeight: 800, fontSize: '13px' }}>
                          What should change?
                          <textarea
                            value={repairInstruction}
                            onChange={(event) => setRepairInstruction(event.target.value)}
                            placeholder="Example: This mathematically equivalent answer is being marked wrong. Keep the same TEKS and difficulty, but repair the grading so equivalent forms are accepted."
                            style={{ display: 'block', width: '100%', minHeight: '105px', marginTop: 7, padding: 11, boxSizing: 'border-box', borderRadius: 8, border: '1px solid #aeb8c6', fontFamily: 'inherit', fontSize: 15, lineHeight: 1.45 }}
                          />
                        </label>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button type="button" onClick={copyRepairRequest} disabled={repairBusy} style={{ padding: '9px 13px', border: 0, borderRadius: 7, background: '#1a73e8', color: '#fff', fontWeight: 800 }}>
                            Copy AI Repair Request
                          </button>
                          <button type="button" onClick={pasteAiReplacement} disabled={repairBusy} style={{ padding: '9px 13px', border: 0, borderRadius: 7, background: '#188038', color: '#fff', fontWeight: 800 }}>
                            {repairBusy ? 'Checking…' : 'Paste AI Replacement'}
                          </button>
                          <button type="button" onClick={() => { setRepairIndex(null); setRepairInstruction(''); setError(''); }} disabled={repairBusy} style={{ padding: '9px 13px', border: '1px solid #cbd1da', borderRadius: 7, background: '#fff', fontWeight: 800 }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {metadataEditingIndex === index && (
                    <QuestionStandardsEditor
                      question={question}
                      onApply={(nextQuestion) => applyMetadataEdit(index, nextQuestion)}
                      onCancel={() => setMetadataEditingIndex(null)}
                    />
                  )}
                </article>
              );
            })}
          </div>
          {error && <div style={{ marginTop: '15px', padding: '12px', borderRadius: '8px', background: '#fce8e6', color: '#a50e0e', fontWeight: 800 }}>{error}</div>}
        </div>
        <footer style={{ padding: '16px 24px', borderTop: '1px solid #e1e5ea', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}><button type="button" onClick={onClose} style={{ padding: '10px 16px', border: '1px solid #cbd1da', borderRadius: '8px', background: '#fff', fontWeight: 800 }}>Cancel</button><button type="button" onClick={save} disabled={saving} style={{ padding: '10px 18px', border: 0, borderRadius: '8px', background: saving ? '#9aa0a6' : '#1a73e8', color: '#fff', fontWeight: 900 }}>{saving ? 'Saving…' : 'Save Assignment Questions'}</button></footer>
      </section>
    </div>
  );
}

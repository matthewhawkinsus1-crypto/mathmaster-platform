import { useMemo, useState } from 'react';
import QuestionStandardsEditor from './QuestionStandardsEditor';
import { getQuestionMetadataSummary } from './questionMetadata.js';

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

export default function AssignmentQuestionEditor({ assignment, hasStudentData, onSave, onClose }) {
  const [title, setTitle] = useState(assignment.title || '');
  const [questions, setQuestions] = useState(() => ensureQuestionIds(assignment.questions || []));
  const [editingIndex, setEditingIndex] = useState(null);
  const [metadataEditingIndex, setMetadataEditingIndex] = useState(null);
  const [questionJson, setQuestionJson] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const includedCount = useMemo(() => questions.filter((question) => question.teacherExcluded !== true).length, [questions]);

  const toggleExcluded = (index) => {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, teacherExcluded: question.teacherExcluded !== true } : question));
  };

  const removeQuestion = (index) => {
    const question = questions[index];
    if (hasStudentData) {
      if (!window.confirm('Student records already exist. This question will be excluded from student access and grading, but retained at its original index so existing data is not misaligned. Continue?')) return;
      setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, teacherExcluded: true } : item));
      return;
    }
    if (!window.confirm(`Permanently remove Question ${index + 1}: ${promptSummary(question).slice(0, 80)}?`)) return;
    setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const duplicateQuestion = (index) => {
    const duplicate = {
      ...cloneQuestion(questions[index]),
      questionId: newQuestionId(),
      teacherExcluded: false,
    };
    setQuestions((current) => {
      if (hasStudentData) return [...current, duplicate];
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)];
    });
  };

  const moveQuestion = (index, direction) => {
    if (hasStudentData) return;
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const beginJsonEdit = (index) => {
    setMetadataEditingIndex(null);
    setEditingIndex(index);
    setQuestionJson(JSON.stringify(questions[index], null, 2));
    setError('');
  };

  const applyJsonEdit = () => {
    try {
      const parsed = JSON.parse(questionJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Question JSON must be one object.');
      if (!parsed.type) throw new Error('The question is missing a type.');
      const existing = questions[editingIndex];
      const next = {
        ...parsed,
        questionId: existing.questionId || parsed.questionId || newQuestionId(),
        teacherExcluded: existing.teacherExcluded === true || parsed.teacherExcluded === true,
      };
      setQuestions((current) => current.map((question, index) => index === editingIndex ? next : question));
      setEditingIndex(null);
      setQuestionJson('');
      setError('');
    } catch (jsonError) {
      setError(jsonError.message);
    }
  };

  const applyMetadataEdit = (index, nextQuestion) => {
    if (hasStudentData && !window.confirm('Student records already exist. Changing TEKS, DOK, difficulty, purpose, or evidence weight will recalculate standards/mastery reports for existing responses. Continue?')) return;
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
    setSaving(true);
    setError('');
    try {
      await onSave({ title: title.trim(), questions });
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
          <div><h2 style={{ margin: 0 }}>Assignment Question Editor</h2><p style={{ margin: '5px 0 0', color: '#5f6368' }}>{hasStudentData ? 'Student records exist. Existing questions stay at their original indexes; use Exclude to throw out a question safely.' : 'No student records exist. Questions may be removed and reordered permanently.'}</p></div>
          <button type="button" onClick={onClose} style={{ padding: '9px 13px', borderRadius: '8px', border: '1px solid #cbd1da', background: '#fff', fontWeight: 800 }}>Close</button>
        </header>
        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          <label style={{ display: 'block', fontWeight: 800, marginBottom: '18px' }}>Assignment title
            <input value={title} onChange={(event) => setTitle(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '11px', marginTop: '7px', border: '1px solid #bdc7d6', borderRadius: '8px', fontSize: '17px' }} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}><strong>{includedCount} included · {questions.length - includedCount} excluded · {questions.length} stored</strong><span style={{ color: '#5f6368', fontSize: '13px' }}>Duplicated questions are added safely. Reordering is disabled after student activity begins.</span></div>
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
                        {metadataSummary.issues.length > 0 && <span title={metadataSummary.issues.join(' · ')} style={{ padding: '3px 7px', borderRadius: '999px', background: '#fce8e6', color: '#a50e0e', fontSize: '10px', fontWeight: 900 }}>Metadata incomplete</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => moveQuestion(index, -1)} disabled={hasStudentData || index === 0} title={hasStudentData ? 'Reordering is disabled because student data exists.' : 'Move up'}>↑</button>
                      <button type="button" onClick={() => moveQuestion(index, 1)} disabled={hasStudentData || index === questions.length - 1} title={hasStudentData ? 'Reordering is disabled because student data exists.' : 'Move down'}>↓</button>
                      <button type="button" onClick={() => duplicateQuestion(index)}>Duplicate</button>
                      <button type="button" onClick={() => beginJsonEdit(index)}>Edit JSON</button>
                      <button type="button" onClick={() => { setEditingIndex(null); setMetadataEditingIndex(metadataEditingIndex === index ? null : index); setError(''); }} style={{ color: '#174ea6' }}>Standards & Difficulty</button>
                      <button type="button" onClick={() => toggleExcluded(index)} style={{ color: excluded ? '#137333' : '#8a5a00' }}>{excluded ? 'Include' : 'Exclude'}</button>
                      <button type="button" onClick={() => removeQuestion(index)} style={{ color: '#d93025' }}>{hasStudentData ? 'Throw Out Safely' : 'Remove'}</button>
                    </div>
                  </div>
                  {editingIndex === index && (
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #d9dfe7' }}>
                      <textarea value={questionJson} onChange={(event) => setQuestionJson(event.target.value)} style={{ width: '100%', minHeight: '250px', padding: '12px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #aeb8c6', fontFamily: 'monospace', fontSize: '13px' }} />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '9px' }}><button type="button" onClick={applyJsonEdit} style={{ padding: '9px 13px', border: 0, borderRadius: '7px', background: '#188038', color: '#fff', fontWeight: 800 }}>Apply Question JSON</button><button type="button" onClick={() => { setEditingIndex(null); setError(''); }} style={{ padding: '9px 13px', border: '1px solid #cbd1da', borderRadius: '7px', background: '#fff', fontWeight: 800 }}>Cancel</button></div>
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

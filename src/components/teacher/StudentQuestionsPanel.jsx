import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase.js';
import MathText from '../common/MathText.jsx';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { ANSWER_TEXT_MAX, TEACHER_QUESTIONS_SHOWN, cleanQuestionText, sortQuestions, teacherQuestionPlace } from '../../platform/supports/askTeacher.js';
import { answerTeacherQuestion, openTeacherQuestionsQuery, watchQuestions } from '../../platform/supports/askTeacherStore.js';
import { STUDENT_NAME_UNAVAILABLE, resolveRosterStudentName, studentIdLabel, studentIdentityIndexFor } from '../../platform/studentName.js';

/*
 * QUESTIONS STUDENTS LEFT FOR YOU (student pass 3, HELP-5, decision D6).
 *
 * Outside class time a student's "Ask my teacher" becomes a short question
 * about one question of an assignment. They arrive here, on Teacher Home —
 * the page a teacher opens first and already watches for raised hands (the
 * live monitor below) — rather than on a new screen: one folded panel that
 * says how many are waiting, and an answer box under each. The answer goes
 * back to the student on that question and in Review My Work.
 *
 * Folded by default and never on the projector's tiles: these are a
 * student's own words, so they show only when the teacher opens them.
 */
const button = { padding: '7px 12px', border: '1px solid var(--mm-border)', borderRadius: 7, background: 'var(--mm-surface)', fontWeight: 800, cursor: 'pointer' };
const wrap = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };

const askedAt = (value) => {
  const ms = typeof value?.toMillis === 'function' ? value.toMillis() : Number(value);
  return Number.isFinite(ms) && ms > 0
    ? new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
};

function QuestionRow({ question, place, studentName, studentIdText, prompt, teacherEmail, onOpenStudent, onAnswered }) {
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const fieldId = `student-question-answer-${question.id}`;
  const words = cleanQuestionText(answer, ANSWER_TEXT_MAX);

  const send = async (event) => {
    event.preventDefault();
    if (!words || sending) return;
    setSending(true);
    setFailed(false);
    try {
      await answerTeacherQuestion(db, { questionId: question.id, answer: words, teacherEmail });
      onAnswered(studentName);
    } catch {
      setFailed(true);
      setSending(false);
    }
  };

  return (
    <li data-student-question="" style={{ listStyle: 'none', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ color: 'var(--mm-text-strong)' }}>
          {studentName}
          {studentIdText ? <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}> · {studentIdText}</span> : null}
        </strong>
        <span className="tw-small tw-muted">{askedAt(question.createdAt)}</span>
      </div>
      <div className="tw-small tw-muted">
        {place.title} · {place.label}
      </div>
      {prompt ? (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--mm-primary-text)' }}>The question</summary>
          <MathText as="p" style={{ margin: '6px 0 0', overflowWrap: 'anywhere' }}>{prompt}</MathText>
        </details>
      ) : null}
      <p style={{ ...wrap, color: 'var(--mm-text-strong)' }}>{question.text}</p>
      <form onSubmit={send} style={{ display: 'grid', gap: 6 }}>
        <label htmlFor={fieldId} style={{ fontWeight: 800 }}>Your answer</label>
        <textarea
          id={fieldId}
          value={answer}
          maxLength={ANSWER_TEXT_MAX}
          rows={3}
          onChange={(event) => setAnswer(event.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--mm-border)', font: 'inherit', background: 'var(--mm-surface)', color: 'var(--mm-text)' }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="submit" style={{ ...button, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', borderColor: 'var(--mm-primary-border)' }} disabled={!words || sending}>
            {sending ? 'Sending…' : 'Send answer'}
          </button>
          {onOpenStudent ? <button type="button" style={button} onClick={() => onOpenStudent(question.studentId)}>Open student</button> : null}
          {failed ? <span role="alert" style={{ color: 'var(--mm-danger)', fontWeight: 700 }}>The answer was not sent. Try again.</span> : null}
        </div>
      </form>
    </li>
  );
}

export default function StudentQuestionsPanel({ teacherEmail = '', students = [], assignments = [], onOpenStudent = null }) {
  const [questions, setQuestions] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [sentNotice, setSentNotice] = useState('');

  useEffect(() => {
    setQuestions([]);
    setUnavailable(false);
    if (!teacherEmail) return undefined;
    return watchQuestions(openTeacherQuestionsQuery(db, { teacherEmail }), setQuestions, () => setUnavailable(true));
  }, [teacherEmail]);

  const identityIndex = useMemo(() => studentIdentityIndexFor(students), [students]);
  const assignmentById = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment])), [assignments]);
  const waiting = sortQuestions(questions);
  // The list loads at most TEACHER_QUESTIONS_SHOWN; answering lets more in.
  const more = questions.length >= TEACHER_QUESTIONS_SHOWN;

  if (!waiting.length && !unavailable && !sentNotice) return null;
  return (
    <details className="tw-disclosure" data-student-questions="" style={{ marginBottom: 16 }}>
      <summary>
        Questions from students{' '}
        <span className="tw-pill" data-tone={waiting.length ? 'warning' : 'neutral'}>{more ? `${TEACHER_QUESTIONS_SHOWN}+` : waiting.length}</span>{' '}
        <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>asked outside class · your answer appears on their question and in Review My Work</span>
      </summary>
      <div className="tw-disclosure__body">
        {sentNotice ? <p role="status" style={{ margin: '0 0 10px', color: 'var(--mm-success-text)', fontWeight: 700 }}>{sentNotice}</p> : null}
        {unavailable ? <p role="alert" style={{ margin: '0 0 10px', color: 'var(--mm-danger)' }}>Students’ questions could not be loaded right now.</p> : null}
        {more ? <p style={{ margin: '0 0 10px' }}>Showing {TEACHER_QUESTIONS_SHOWN} waiting questions. Answer these to see the rest.</p> : null}
        {waiting.length ? (
          <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {waiting.map((question) => {
              const name = resolveRosterStudentName({ studentId: question.studentId, index: identityIndex });
              const assignment = assignmentById.get(question.assignmentId) || null;
              const prompt = getStoredAssignmentQuestions(assignment || {})[question.questionIndex]?.prompt || '';
              return (
                <QuestionRow
                  key={question.id}
                  question={question}
                  place={teacherQuestionPlace({ assignment, questionLabel: question.questionLabel, questionIndex: question.questionIndex })}
                  studentName={name}
                  studentIdText={name === STUDENT_NAME_UNAVAILABLE ? studentIdLabel(String(question.studentId)) : ''}
                  prompt={typeof prompt === 'string' ? prompt : ''}
                  teacherEmail={teacherEmail}
                  onOpenStudent={onOpenStudent}
                  onAnswered={(studentName) => setSentNotice(`Answer sent to ${studentName}.`)}
                />
              );
            })}
          </ul>
        ) : !unavailable ? <p style={{ margin: 0 }}>No questions are waiting.</p> : null}
      </div>
    </details>
  );
}

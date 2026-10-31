import { QUESTION_STATUS, hasFollowUp, sortQuestions } from '../../platform/supports/askTeacher.js';

/*
 * THE STUDENT'S QUESTIONS FOR THEIR TEACHER, AND THE ANSWERS (student pass 3,
 * HELP-5, D6).
 *
 * Draws the questions it is handed: each one's place in the assignment, what
 * the student asked, and the teacher's answer or that the answer is still to
 * come. It draws nothing when there is nothing to show.
 *
 *   compact  in the assignment workspace (App.jsx): answered questions only
 *            (and one whose follow-up is waiting, so its first answer stays
 *            one click away), folded under "Your teacher answered…", so a
 *            question that has since closed still has its answer one click
 *            away.
 *   default  in Review My Work (TeacherAnswers.jsx): every question on this
 *            assignment.
 */
const cardStyle = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-border-soft, var(--mm-border))', background: 'var(--mm-surface)', display: 'grid', gap: 4, minWidth: 0 };
const wrap = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };

function QuestionCard({ question }) {
  const answered = question.status === QUESTION_STATUS.ANSWERED;
  const followedUp = hasFollowUp(question);
  return (
    <li style={{ listStyle: 'none', ...cardStyle }} data-teacher-question={answered ? 'answered' : 'waiting'} {...(followedUp ? { 'data-teacher-follow-up': '' } : {})}>
      <strong style={{ color: 'var(--mm-text-strong)' }}>{question.questionLabel || `Question ${Number(question.questionIndex) + 1}`}</strong>
      {followedUp ? (
        <>
          <p style={{ ...wrap, color: 'var(--mm-text-muted)' }}>You asked: {question.earlierText}</p>
          <p style={{ ...wrap, color: 'var(--mm-text-strong)' }}><span style={{ fontWeight: 800 }}>Your teacher: </span>{question.earlierAnswer}</p>
          <p style={{ ...wrap, color: 'var(--mm-text-muted)' }}>Then you asked: {question.text}</p>
        </>
      ) : (
        <p style={{ ...wrap, color: 'var(--mm-text-muted)' }}>You asked: {question.text}</p>
      )}
      {answered ? (
        <p style={{ ...wrap, color: 'var(--mm-text-strong)' }}><span style={{ fontWeight: 800 }}>Your teacher: </span>{question.answer}</p>
      ) : (
        <p style={{ ...wrap, color: 'var(--mm-primary-text)', fontWeight: 700 }}>Waiting for your teacher’s answer.</p>
      )}
    </li>
  );
}

export function TeacherAnswersList({ questions = [], compact = false }) {
  const shown = sortQuestions(questions).filter((question) => !compact || question.status === QUESTION_STATUS.ANSWERED || hasFollowUp(question));
  if (!shown.length) return null;
  const list = (
    <ul style={{ margin: '8px 0 0', padding: 0, display: 'grid', gap: 8 }}>
      {shown.map((question) => <QuestionCard key={question.id || `${question.assignmentId}-${question.questionIndex}`} question={question} />)}
    </ul>
  );
  if (compact) {
    return (
      <details data-teacher-answers="compact" style={{ margin: '6px 8px', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--mm-success-border, var(--mm-tint-border))', background: 'var(--mm-success-bg, var(--mm-surface-tint))', textAlign: 'left' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--mm-text-strong)', minHeight: 32 }}>
          {shown.length === 1 ? 'Your teacher answered your question' : `Your teacher answered ${shown.length} of your questions`}
        </summary>
        {list}
      </details>
    );
  }
  return (
    <section aria-label="Your questions for your teacher" data-teacher-answers="review" style={{ margin: '12px 0', textAlign: 'left', minWidth: 0 }}>
      <h3 style={{ margin: 0, fontSize: 'calc(16 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>Your questions for your teacher</h3>
      {list}
    </section>
  );
}

export default TeacherAnswersList;

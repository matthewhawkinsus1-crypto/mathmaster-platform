import React from 'react';
import MathText from '../common/MathText.jsx';
import QuestionPrompt from '../../QuestionPrompt.jsx';
import PathQuestionStimulus from './PathQuestionStimulus.jsx';
import PathSolutionReview from './PathSolutionReview.jsx';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';

// "Review what you missed" — the end-of-session recap.
//
// Each question the student missed or got partly right, as they saw it, with
// their answer, the correct answer and the worked solution. The data comes
// from getMyPathSessionRecap (or the simulator's runtime), which releases it
// only for a COMPLETED session: this component cannot show anything early
// because it is never handed anything early.

const SECTION = {
  width: '100%',
  maxWidth: 650,
  margin: '0 auto 36px',
  boxSizing: 'border-box',
  textAlign: 'left',
};

const ITEM = {
  padding: '16px 16px 18px',
  border: '1px solid var(--mm-border)',
  borderRadius: 14,
  background: 'var(--mm-surface)',
  minWidth: 0,
};

const ANSWER_BOX = {
  padding: '10px 12px',
  borderRadius: 10,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const LABEL = {
  display: 'block',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  marginBottom: 4,
};

/** One answer value, drawn the way it was entered. */
export const RecapValue = ({ entry }) => {
  if (!entry?.value) return null;
  if (entry.format === 'math') return <MathText>{`$${entry.value}$`}</MathText>;
  if (entry.format === 'rich') return <MathText>{entry.value}</MathText>;
  return <span>{entry.value}</span>;
};

const AnswerList = ({ entries }) => (
  <div style={{ display: 'grid', gap: 4, fontSize: 15.5, lineHeight: 1.5, color: 'var(--mm-text-strong)' }}>
    {entries.map((entry, index) => (
      <div key={`${entry.label}-${index}`}>
        {entries.length > 1 && <span style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}><MathText>{entry.label}</MathText>: </span>}
        <RecapValue entry={entry} />
      </div>
    ))}
  </div>
);

function RecapItem({ item }) {
  const skill = item.skillCode ? (studentLabelForTeks(item.skillCode) || item.skillCode) : null;
  // A question that comes back in practice keeps its answer and steps out of
  // the recap (functions/shared/pathRecapWithheld.mjs).
  const withheld = item.answerWithheld === true;
  const review = withheld ? null : (item.solutionReview || null);
  const answer = item.response?.entries || [];
  // The authored review leads with its own answer line; the key is shown only
  // where the author did not write one, so the answer is never said twice.
  const correct = withheld || review?.answerSummary ? [] : (item.correctAnswer || []);
  const partial = item.outcome === 'partial';

  return (
    <li style={{ listStyle: 'none', minWidth: 0 }}>
      <article style={ITEM} aria-label={item.questionNumber ? `Question ${item.questionNumber} review` : 'Question review'}>
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ color: 'var(--mm-text-strong)', fontSize: 15 }}>
            {item.questionNumber ? `Question ${item.questionNumber}` : 'Question'}
          </strong>
          {skill && <span style={{ color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 700 }}>{skill}</span>}
          <span style={{
            padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 900,
            background: partial ? 'var(--mm-warning-soft)' : 'var(--mm-surface-control)',
            color: partial ? 'var(--mm-warning-text)' : 'var(--mm-text)',
          }}>
            {partial ? 'Partly right' : 'Missed'}
          </span>
        </header>

        {item.question?.scenario && (
          <MathText as="p" style={{ margin: '0 0 10px', color: 'var(--mm-text)', fontSize: 14.5, lineHeight: 1.6 }}>
            {item.question.scenario}
          </MathText>
        )}
        {item.question?.prompt && <QuestionPrompt variant="task">{item.question.prompt}</QuestionPrompt>}
        {item.question?.formulaLatex && (
          <MathText as="div" style={{ margin: '0 0 12px', fontSize: 18, textAlign: 'center' }}>
            {`$${item.question.formulaLatex}$`}
          </MathText>
        )}
        {/* A completed session's recap asks nothing: its graphs get the full
            description (features, data table), not the answerable-item one. */}
        <PathQuestionStimulus stimulus={item.question?.stimulus || null} describeFeatures />
        {item.question?.stimulusOmitted && (
          <p style={{ margin: '0 0 10px', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
            This question&apos;s graph or table is too large to show again here.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 10, marginTop: 4 }}>
          <div style={{ ...ANSWER_BOX, background: 'var(--mm-warning-soft)', border: '1px solid var(--mm-warning-border-soft)' }}>
            <span style={{ ...LABEL, color: 'var(--mm-warning-text)' }}>Your answer</span>
            {answer.length
              ? <AnswerList entries={answer} />
              : (
                <span style={{ color: 'var(--mm-text-muted)', fontSize: 14, lineHeight: 1.5 }}>
                  {item.response?.kind === 'tool' ? 'You built your answer in the question’s tool.' : 'No answer was recorded.'}
                </span>
              )}
          </div>
          {correct.length > 0 && (
            <div style={{ ...ANSWER_BOX, background: 'var(--mm-success-bg)', border: '1px solid var(--mm-success-border)' }}>
              <span style={{ ...LABEL, color: 'var(--mm-success-text)' }}>Correct answer</span>
              <AnswerList entries={correct} />
            </div>
          )}
        </div>

        {withheld
          ? (
            <p data-recap-withheld style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)', fontSize: 13.5, lineHeight: 1.55 }}>
              This question comes back in practice, so its answer and steps stay out of your review. Your teacher can go over it with you.
            </p>
          )
          : review
            ? <PathSolutionReview review={review} wasCorrect={false} />
            : correct.length === 0 && (
              <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)', fontSize: 13.5, lineHeight: 1.55 }}>
                This question does not have a worked solution yet. Your teacher can go over it with you.
              </p>
            )}
      </article>
    </li>
  );
}

/**
 * @param recap    { status: 'loading'|'ready'|'error', data?, message? }
 * @param onRetry  reload after an error
 */
export default function MyMathPathSessionRecap({ recap = null, onRetry = null }) {
  if (!recap || recap.status === 'idle') return null;

  if (recap.status === 'loading') {
    return (
      <section style={SECTION} aria-label="Review what you missed">
        <p role="status" style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 14, textAlign: 'center' }}>Loading your review…</p>
      </section>
    );
  }

  if (recap.status === 'error') {
    return (
      <section style={SECTION} aria-label="Review what you missed">
        <div role="alert" style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', lineHeight: 1.55 }}>
          Your review of this session could not load. Your work is saved.
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{ display: 'block', marginTop: 10, minHeight: 44, padding: '0 16px', border: '1px solid var(--mm-warning-border-soft)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 850, cursor: 'pointer' }}
            >
              Try loading the review again
            </button>
          )}
        </div>
      </section>
    );
  }

  const data = recap.data || {};
  if (data.available === false) return null;
  const items = Array.isArray(data.items) ? data.items : [];

  if (!items.length) {
    const message = data.allCorrect
      ? 'You got every question in this session right — there is nothing to review.'
      : data.missingQuestions > 0
        ? 'A question-by-question review is not available for this session.'
        : null;
    return message ? (
      <section style={SECTION} aria-label="Review what you missed">
        <p style={{ margin: 0, padding: '12px 14px', borderRadius: 10, background: data.allCorrect ? 'var(--mm-success-bg)' : 'var(--mm-surface-tint)', color: data.allCorrect ? 'var(--mm-success-text)' : 'var(--mm-text)', fontSize: 14.5, lineHeight: 1.55, textAlign: 'center' }}>
          {message}
        </p>
      </section>
    ) : null;
  }

  return (
    <section style={SECTION} aria-labelledby="mm-path-recap-heading">
      <h2 id="mm-path-recap-heading" style={{ margin: '0 0 4px', fontSize: 19, color: 'var(--mm-text-strong)' }}>
        Review what you missed
      </h2>
      <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 13.5, lineHeight: 1.55 }}>
        {items.length === 1 ? 'One question' : `${items.length} questions`} to look at again, with the worked solution.
        {data.missingQuestions > 0 ? ' Some earlier questions in this session cannot be reviewed here.' : ''}
      </p>
      <ol style={{ margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {items.map((item) => <RecapItem key={item.questionInstanceId} item={item} />)}
      </ol>
    </section>
  );
}

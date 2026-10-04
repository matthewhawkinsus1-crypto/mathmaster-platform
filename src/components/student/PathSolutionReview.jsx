import React from 'react';
import MathText from '../common/MathText.jsx';

// What the student reads once a question is closed.
//
// It arrives from the server, and only after the question is finalized — this
// component cannot show a review early because it is never given one early.
// See functions/shared/pathSolutionSupport.mjs for the release rule.
//
// What it is NOT: "Correct answer: B." A student who ran out of attempts needs
// the reasoning, not the letter; a student who got it right needs to know WHY
// the method worked so the next question is not a fresh guess. So the shape is
// reasoning first, the answer as a summary line, the common error where the
// author identified one, and the connection back to the representation.

const card = {
  marginTop: 18,
  padding: '16px 18px',
  border: '1px solid var(--mm-tint-border)',
  borderRadius: 12,
  background: 'var(--mm-surface-tint)',
  textAlign: 'left',
};

const heading = {
  margin: '0 0 4px',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--mm-primary-text)',
};

export const PathSolutionReview = ({ review, wasCorrect = false }) => {
  if (!review) return null;
  const hasBody = Boolean(
    review.headline || review.reasoning?.length || review.answerSummary || review.commonError || review.connection,
  );
  if (!hasBody) return null;

  return (
    <section style={card} aria-label="How this question works">
      <h2 style={heading}>{wasCorrect ? 'Why that works' : 'How this one works'}</h2>
      {review.headline && (
        <MathText as="p" style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: 'var(--mm-text-strong)', lineHeight: 1.5 }}>
          {review.headline}
        </MathText>
      )}

      {review.reasoning?.length > 0 && (
        <ol style={{ margin: '0 0 10px', paddingLeft: 20, display: 'grid', gap: 7 }}>
          {review.reasoning.map((line, index) => (
            <li key={`r-${index}`} style={{ fontSize: 15, color: 'var(--mm-text)', lineHeight: 1.6 }}>
              <MathText>{line}</MathText>
            </li>
          ))}
        </ol>
      )}

      {review.answerSummary && (
        <p style={{ margin: '0 0 10px', padding: '9px 12px', borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', fontSize: 15, lineHeight: 1.5 }}>
          <MathText>{review.answerSummary}</MathText>
        </p>
      )}

      {review.commonError && (
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--mm-warning-text)', lineHeight: 1.6 }}>
          <strong>Watch out: </strong><MathText>{review.commonError}</MathText>
        </p>
      )}

      {review.connection && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--mm-text-muted)', lineHeight: 1.6 }}>
          <MathText>{review.connection}</MathText>
        </p>
      )}
    </section>
  );
};

export default PathSolutionReview;

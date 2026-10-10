import { MathText } from '../common/MathText.jsx';
import { SOLUTION_STATE, solutionStateMessage } from '../../platform/liveChallenge/challengeSolutionModel.js';
import { normalizeSolutionReview } from '../../platform/liveChallenge/challengeRecapModel.js';

/*
 * A ROUND'S WORKED SOLUTION ON A STUDENT'S SCREEN.
 *
 * Shown only for a round nobody can answer any more: the server publishes a
 * solution after its round closes (and after any Second Chance replay of the
 * question), and the screens that use these parts ask for one only once the
 * room lists the round as revealed (challengeSolutionModel.js). These parts
 * draw what they are given; they decide nothing about timing.
 *
 * Every line goes through MathText, so an authored `$\frac{2}{3}x$` is drawn
 * as mathematics, never as dollar signs and backslashes.
 */

const panel = {
  padding: 16,
  borderRadius: 14,
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  border: '1px solid var(--mm-border)',
  textAlign: 'left',
  lineHeight: 1.5,
};
const label = { display: 'block', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mm-text-muted)' };

/** One worked solution: headline, the steps, the common slip, the answer. */
export function RoundSolutionCard({ review, prompt = null, title = 'Worked solution', compact = false }) {
  const solution = normalizeSolutionReview(review);
  if (!solution) return null;
  return (
    <section data-mm-round-solution="ready" aria-label={title} style={{ ...panel, padding: compact ? 12 : 16 }}>
      <span style={label}>{title}</span>
      {prompt && <MathText as="p" style={{ margin: '6px 0 0', color: 'var(--mm-text-muted)' }}>{prompt}</MathText>}
      {solution.headline && <MathText as="p" style={{ margin: '8px 0 0', fontWeight: 900, fontSize: compact ? 16 : 18 }}>{solution.headline}</MathText>}
      {solution.reasoning.length > 0 && (
        <ol style={{ margin: '8px 0 0', paddingLeft: 22, display: 'grid', gap: 4 }}>
          {solution.reasoning.map((step, index) => (
            // Authored steps in a fixed order: the index is their identity.
            <li key={index}><MathText>{step}</MathText></li>
          ))}
        </ol>
      )}
      {solution.commonError && (
        <p style={{ margin: '10px 0 0' }}>
          <strong>Watch out: </strong><MathText>{solution.commonError}</MathText>
        </p>
      )}
      {solution.answerSummary && (
        <p style={{ margin: '10px 0 0', padding: '8px 12px', borderRadius: 10, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', fontWeight: 800 }}>
          <MathText>{solution.answerSummary}</MathText>
        </p>
      )}
    </section>
  );
}

/**
 * The solution area of a closed round: the card when it is ready, a plain
 * sentence while it is held (a Second Chance may bring the question back),
 * loading, or has no worked solution; nothing at all for a round without a
 * shared question (a Graph Feature Rush round).
 */
export function RoundSolutionPanel({ state, solution = null }) {
  if (state === SOLUTION_STATE.READY) {
    return <RoundSolutionCard review={solution?.solutionReview} prompt={solution?.prompt || null} />;
  }
  const message = solutionStateMessage(state);
  if (!message) return null;
  return (
    <p data-mm-round-solution={state} aria-live="polite" style={{ margin: 0, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#c3d2ea', textAlign: 'left' }}>
      {message}
    </p>
  );
}

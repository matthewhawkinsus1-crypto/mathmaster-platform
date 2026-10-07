import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';

/*
 * THE PLATFORM HINT PANEL — opened from the work bar's Hint control (and the
 * Work View Help drawer) on every question type.
 *
 * Shows only what the student asked for: hints already revealed, a button for
 * the next one when its release rule allows (questionHints.js hintRelease),
 * "Try a similar one" (a worked sibling problem, similarProblem.js) and
 * "Ask my teacher". Revealing a hint or opening the worked example is
 * recorded by the caller (QuestionEngine) as hintUsed / workedExampleUsed.
 * Rendered only where hints are allowed and the question is still open.
 */
const button = {
  minHeight: 40,
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-primary-soft)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};

export default function HintPanel({
  hints = [],
  revealed = 0,
  release = { canRevealNext: false, waitingForAttempt: false },
  onReveal = null,
  similar = null,
  similarOpen = false,
  onOpenSimilar = null,
  askTeacher = null,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
}) {
  const shown = hints.slice(0, revealed);
  return (
    <section aria-label="Hints" data-hint-panel="" style={{ textAlign: 'left', color: 'var(--mm-text)', display: 'grid', gap: 12 }}>
      {shown.length ? (
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
          {shown.map((hint, index) => (
            <li key={`hint-${index}`} data-hint-source={hint.source} style={{ lineHeight: 1.55 }}>
              <MathText>{hint.text}</MathText>
              <SupportedTextActions text={hint.text} readAloud={readAloud} translation={translation} label={`hint ${index + 1}`} onEvidence={onSupportEvidence} />
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>A hint points you at the next move without giving the answer. Using one is noted with your attempt.</p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {release.canRevealNext && (
          <button type="button" style={button} onClick={onReveal}>
            {revealed ? 'Show the next hint' : 'Show a hint'}
          </button>
        )}
        {release.waitingForAttempt && (
          <span role="status" style={{ color: 'var(--mm-text-muted)', fontWeight: 700 }}>Try again with that hint — the next one opens after your next attempt.</span>
        )}
        {similar && !similarOpen && (
          <button type="button" style={button} onClick={onOpenSimilar}>Try a similar one</button>
        )}
        {askTeacher && (
          <button
            type="button"
            style={{ ...button, background: askTeacher.requested ? 'var(--mm-warning-bg)' : 'var(--mm-surface)', borderColor: askTeacher.requested ? 'var(--mm-warning-border, #f9ab00)' : 'var(--mm-tint-border)' }}
            aria-pressed={askTeacher.requested}
            onClick={askTeacher.onToggle}
          >
            {askTeacher.requested ? 'Cancel my help request' : '✋ Ask my teacher'}
          </button>
        )}
      </div>
      {askTeacher?.requested && (
        <p role="status" style={{ margin: 0, color: 'var(--mm-warning-text)', fontWeight: 700 }}>Your teacher can see that you asked for help on this question. Keep working while you wait.</p>
      )}
      {similar && similarOpen && (
        <section aria-label="A similar problem, worked" data-similar-example="" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)' }}>
          <strong style={{ display: 'block', marginBottom: 6, color: 'var(--mm-primary-text)' }}>A similar problem, worked out</strong>
          <MathText as="p" style={{ margin: '0 0 8px', fontWeight: 700 }}>{similar.prompt}</MathText>
          <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
            {similar.steps.map((step, index) => <li key={`ex-${index}`} style={{ lineHeight: 1.55 }}><MathText>{step}</MathText></li>)}
          </ol>
          <p style={{ margin: '8px 0 0', fontWeight: 800 }}>Answer: <MathText>{similar.answer}</MathText></p>
          <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)' }}>Your question uses different numbers — use the same steps on it.</p>
          <SupportedTextActions text={[similar.prompt, ...similar.steps, `Answer: ${similar.answer}`].join(' ')} readAloud={readAloud} translation={translation} label="the worked example" onEvidence={onSupportEvidence} />
        </section>
      )}
    </section>
  );
}

import { useState } from 'react';
import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';
import { useAskTeacherControl } from '../AskTeacherControl.jsx';
import { hintCostSentence } from './hintCopy.js';

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
 *
 * WHAT IT COSTS, SAID ONCE (HELP-17): "Hints never lower your score. Your
 * teacher can see you used one." — or the host's own sentence where a hint
 * does cost something (`costNote`: Recovery practice, HELP-4).
 *
 * "WHAT MIGHT HAVE GONE WRONG?" (HELP-2, D2): after a miss, the diagnosis the
 * box below holds back while the question is open, as a rung the student asks
 * for (`diagnosis`: { onShow, shown }). The caller records it like a hint and
 * offers it only where hints are allowed (questionHints.js diagnosisHint).
 */
const summaryStyle = { cursor: 'pointer', fontWeight: 800, color: 'var(--mm-primary-text)', minHeight: 32 };

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
  costNote = null,
  diagnosis = null,
}) {
  const shown = hints.slice(0, revealed);
  // "Ask my teacher": a raised hand in class, a question left for the teacher
  // outside it (AskTeacherControl.jsx).
  const ask = useAskTeacherControl(askTeacher, button);
  // On a DOL (no hints) the panel holds only "Ask my teacher", and says
  // nothing about hints (PR #462 review m9).
  const askOnly = !hints.length && !similar;
  const diagnosisShown = diagnosis?.shown?.text ? diagnosis.shown : null;
  const diagnosisOffered = !diagnosisShown && typeof diagnosis?.onShow === 'function';
  /*
   * ONE THING AT A TIME (student pass 3, HELP-21). A hint and then the worked
   * example pushed the answer box to y≈916 on a 768px Chromebook. Once the
   * example is open, the hints read before it fold to one line (a hint
   * revealed after that is new, and shows), and the example itself folds
   * away when the student has read it.
   */
  const exampleOpen = Boolean(similar && similarOpen);
  const [fold, setFold] = useState(() => ({ exampleOpen, before: exampleOpen ? revealed : 0 }));
  if (fold.exampleOpen !== exampleOpen) setFold({ exampleOpen, before: exampleOpen ? revealed : 0 });
  const folded = exampleOpen ? shown.slice(0, fold.before) : [];
  const fresh = shown.slice(folded.length);
  const hintList = (list, start) => (
    <ol start={start + 1} style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
      {list.map((hint, offset) => {
        const index = start + offset;
        return (
          <li key={`hint-${index}`} data-hint-source={hint.source} style={{ lineHeight: 1.55 }}>
            <MathText>{hint.text}</MathText>
            <SupportedTextActions text={hint.text} readAloud={readAloud} translation={translation} label={`hint ${index + 1}`} onEvidence={onSupportEvidence} />
          </li>
        );
      })}
    </ol>
  );
  return (
    <section aria-label="Hints" data-hint-panel="" data-hint-sources={hints.map((hint) => hint.source || '').join(' ')} style={{ textAlign: 'left', color: 'var(--mm-text)', display: 'grid', gap: 12 }}>
      {shown.length ? (
        <>
          {folded.length ? (
            <details data-hints-folded="">
              <summary style={summaryStyle}>{folded.length === 1 ? 'The hint you read' : `The ${folded.length} hints you read`}</summary>
              <div style={{ marginTop: 8 }}>{hintList(folded, 0)}</div>
            </details>
          ) : null}
          {fresh.length ? hintList(fresh, folded.length) : null}
        </>
      ) : askOnly ? (
        <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>Stuck? Ask your teacher to come over. Asking does not change your score.</p>
      ) : (
        <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>A hint points you at the next move without giving the answer.</p>
      )}
      {diagnosisShown ? (
        <div data-miss-diagnosis-hint={diagnosisShown.source || ''} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)', lineHeight: 1.55 }}>
          <strong style={{ display: 'block', marginBottom: 4, color: 'var(--mm-primary-text)' }}>What might have gone wrong</strong>
          <MathText>{diagnosisShown.text}</MathText>
          <SupportedTextActions text={diagnosisShown.text} readAloud={readAloud} translation={translation} label="what might have gone wrong" onEvidence={onSupportEvidence} />
        </div>
      ) : null}
      {askOnly ? null : (
        <p data-hint-cost-note="" style={{ margin: 0, color: 'var(--mm-text-muted)', fontWeight: 700 }}>{hintCostSentence(costNote)}</p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {release.canRevealNext && (
          <button type="button" style={button} onClick={onReveal}>
            {revealed ? 'Show the next hint' : 'Show a hint'}
          </button>
        )}
        {diagnosisOffered && (
          <button type="button" data-miss-diagnosis-offer="" style={button} onClick={diagnosis.onShow}>What might have gone wrong?</button>
        )}
        {release.waitingForAttempt && (
          <span role="status" style={{ color: 'var(--mm-text-muted)', fontWeight: 700 }}>Try again with that hint — the next one opens after your next try.</span>
        )}
        {similar && !similarOpen && (
          <button type="button" style={button} onClick={onOpenSimilar}>Try a similar one</button>
        )}
        {ask.button}
      </div>
      {ask.status}
      {similar && similarOpen && (
        <details open data-similar-example="" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)' }}>
          <summary style={{ ...summaryStyle, marginBottom: 6 }}>A similar problem, worked out</summary>
          <MathText as="p" style={{ margin: '0 0 8px', fontWeight: 700 }}>{similar.prompt}</MathText>
          <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
            {similar.steps.map((step, index) => <li key={`ex-${index}`} style={{ lineHeight: 1.55 }}><MathText>{step}</MathText></li>)}
          </ol>
          <p style={{ margin: '8px 0 0', fontWeight: 800 }}>Answer: <MathText>{similar.answer}</MathText></p>
          <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)' }}>Your question uses different numbers — use the same steps on it.</p>
          <SupportedTextActions text={[similar.prompt, ...similar.steps, `Answer: ${similar.answer}`].join(' ')} readAloud={readAloud} translation={translation} label="the worked example" onEvidence={onSupportEvidence} />
        </details>
      )}
    </section>
  );
}

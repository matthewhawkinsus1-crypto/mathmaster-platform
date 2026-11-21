import { Suspense, lazy, useEffect, useState } from 'react';
import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';
import { useAskTeacherControl } from '../AskTeacherControl.jsx';
import { authoredLineFor } from '../../language/authoredSupportText.js';
import { EXAMPLE_COULD_NOT_LOAD_TEXT, EXAMPLE_USE_THE_STEPS_TEXT, PENDING_RUNG_TEXT, hintCostSentence } from './hintCopy.js';
import QuestionSupplementBoundary from '../../../QuestionSupplementBoundary.jsx';

// The step-through player, loaded when an example is opened: a page that
// shows none (Home, a DOL, a quiz, a test) never fetches it.
const WorkedExamplePlayer = lazy(() => import('../workedExample/WorkedExamplePlayer.jsx'));

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
 * THE WORKED EXAMPLE IS A STEP-THROUGH (WE-A, WORKED_EXAMPLES.md). Once
 * opened it plays one slide at a time in WorkedExamplePlayer (Next, Back, a
 * why, "Your turn"). `similar` is the example to play ({ prompt, steps,
 * answer }; examplePlayer.js workedExampleFor), or null wherever the section
 * shows none: the caller decides, and with null nothing of it is drawn.
 * `onYourTurn` hands the student their own question; `similarOpenedByItself`
 * says Classwork opened it before the first question on a new skill.
 *
 * WHAT IT COSTS, SAID ONCE (HELP-17): "Hints never lower your grade. Your
 * teacher can see you used one." — or the host's own sentence where a hint
 * does cost something (`costNote`: Recovery practice, HELP-4).
 *
 * "WHAT MIGHT HAVE GONE WRONG?" (HELP-2, D2): after a miss, the diagnosis the
 * box below holds back while the question is open, as a rung the student asks
 * for (`diagnosis`: { onShow, shown }). The caller records it like a hint and
 * offers it only where hints are allowed (questionHints.js diagnosisHint).
 *
 * WHERE NOTHING FITS (HELP-23). When every rung is a fallback (source
 * 'generic': no teacher, family or tool hint is left), the hints are about
 * the kind of question, not this one, and the panel says so and points to the
 * teacher — only where the teacher can be asked (Ask is wired), so the
 * sentence never points at a button that is not there, and not while the hand
 * is up (the button below is then "Cancel my help request").
 *
 * WHILE THE TOOL'S RUNGS ARE ON THEIR WAY (hint-ladder timing). A rung the
 * student asked for before the tool on screen had published its own is
 * `pending` (questionHints.js hintLadderView): in its place the panel says the
 * hint is loading, and shows the rung once the tool's are here — never the
 * fallback it may not be. A tool that takes longer than PENDING_RUNG_WAIT_MS
 * shows the rung the ladder has by then (read again once the tool is there),
 * so nobody waits on a load that does not come. Until the rungs are here
 * (`rungsPending`) the ladder is not known to be only fallbacks, so the
 * pointer above is not shown either.
 */
const summaryStyle = { cursor: 'pointer', fontWeight: 800, color: 'var(--mm-primary-text)', minHeight: 32 };
export const PENDING_RUNG_WAIT_MS = 4000;

// The teacher's own words for this hint in the student's language, or null.
const teachersWords = (hint, translation) => {
  const line = authoredLineFor(hint?.translations, translation?.language);
  return line ? { text: line } : null;
};

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

// The example as one list, for when the step-through player cannot load.
const stepText = (step) => (step && typeof step === 'object' ? [step.show, step.why].filter(Boolean).join(' ') : String(step ?? ''));
function WholeExample({ example, readAloud, translation, onSupportEvidence }) {
  const steps = (Array.isArray(example?.steps) ? example.steps : []).map(stepText).filter(Boolean);
  const answer = example?.source === 'authored' ? '' : String(example?.answer ?? '');
  return (
    <div data-example-whole="" style={{ display: 'grid', gap: 8 }}>
      <p role="status" style={{ margin: 0, color: 'var(--mm-text-muted)' }}>{EXAMPLE_COULD_NOT_LOAD_TEXT}</p>
      <MathText as="p" style={{ margin: 0, fontWeight: 700 }}>{example?.prompt}</MathText>
      <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
        {steps.map((step, index) => <li key={`ex-${index}`} style={{ lineHeight: 1.55 }}><MathText>{step}</MathText></li>)}
      </ol>
      {answer ? <p style={{ margin: 0, fontWeight: 800 }}>Answer: <MathText>{answer}</MathText></p> : null}
      <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>{EXAMPLE_USE_THE_STEPS_TEXT}</p>
      <SupportedTextActions text={[example?.prompt, ...steps, answer ? `Answer: ${answer}` : ''].filter(Boolean).join(' ')} readAloud={readAloud} translation={translation} label="the worked example" onEvidence={onSupportEvidence} />
    </div>
  );
}

export default function HintPanel({
  hints = [],
  revealed = 0,
  release = { canRevealNext: false, waitingForAttempt: false },
  onReveal = null,
  similar = null,
  similarOpen = false,
  onOpenSimilar = null,
  onYourTurn = null,
  similarOpenedByItself = false,
  // { context, draftKey, resetKey } for the record of a player that could not
  // load (QuestionSupplementBoundary); the question goes on either way.
  exampleFailure = null,
  askTeacher = null,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
  costNote = null,
  diagnosis = null,
  rungsPending = false,
}) {
  const shown = hints.slice(0, revealed);
  const awaiting = shown.some((hint) => hint?.pending === true);
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    if (!awaiting || waitedOut) return undefined;
    const timer = setTimeout(() => setWaitedOut(true), PENDING_RUNG_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaiting, waitedOut]);
  const loading = (hint) => hint?.pending === true && !waitedOut;
  // "Ask my teacher": a raised hand in class, a question left for the teacher
  // outside it (AskTeacherControl.jsx).
  const ask = useAskTeacherControl(askTeacher, button);
  // On a DOL (no hints) the panel holds only "Ask my teacher", and says
  // nothing about hints (PR #462 review m9).
  const askOnly = !hints.length && !similar;
  const fallbackOnly = !rungsPending && hints.length > 0 && hints.every((hint) => hint.source === 'generic');
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
        if (loading(hint)) {
          return (
            <li key={`hint-${index}`} data-hint-source="pending" style={{ lineHeight: 1.55, color: 'var(--mm-text-muted)' }}>
              <span role="status">{PENDING_RUNG_TEXT}</span>
            </li>
          );
        }
        // Focus comes here when a press reveals it (hintPanelFocusTarget): the
        // button pressed is usually gone. Not a live region, so read once.
        return (
          <li key={`hint-${index}`} data-hint-source={hint.source} tabIndex={-1} style={{ lineHeight: 1.55 }}>
            <MathText>{hint.text}</MathText>
            {/* A hint the teacher wrote carries their own words for a language
                they translated it into (authoredSupportText.js); Translate shows
                them, if they keep the hint's mathematics. */}
            <SupportedTextActions text={hint.text} readAloud={readAloud} translation={translation} label={`hint ${index + 1}`} onEvidence={onSupportEvidence} authored={teachersWords(hint, translation)} />
          </li>
        );
      })}
    </ol>
  );
  return (
    <section aria-label="Hints" data-hint-panel="" data-hint-sources={hints.map((hint) => hint.source || '').join(' ')} tabIndex={-1} style={{ textAlign: 'left', color: 'var(--mm-text)', display: 'grid', gap: 12 }}>
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
      {/* Focus comes here once it is asked for (hintPanelFocusTarget): its
          button goes. Not a live region, so read once. */}
      {diagnosisShown ? (
        <div data-miss-diagnosis-hint={diagnosisShown.source || ''} tabIndex={-1} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)', lineHeight: 1.55 }}>
          <strong style={{ display: 'block', marginBottom: 4, color: 'var(--mm-primary-text)' }}>What might have gone wrong</strong>
          <MathText>{diagnosisShown.text}</MathText>
          <SupportedTextActions text={diagnosisShown.text} readAloud={readAloud} translation={translation} label="what might have gone wrong" onEvidence={onSupportEvidence} />
        </div>
      ) : null}
      {fallbackOnly && ask.button && !askTeacher?.requested ? (
        <p data-hint-fallback-ask="" style={{ margin: 0, color: 'var(--mm-text-muted)' }}>These hints are general, not written for this question. For help with this one, ask your teacher with the button below.</p>
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
        {release.waitingForAttempt && !shown.some(loading) && (
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
          {/* The player is a chunk of its own. If it cannot be fetched, or
              cannot render, only it is replaced: the whole example as a list,
              and the question stays as it is. */}
          <QuestionSupplementBoundary
            stage="worked-example"
            context={exampleFailure?.context}
            draftKey={exampleFailure?.draftKey}
            resetKey={exampleFailure?.resetKey}
            fallback={<WholeExample example={similar} readAloud={readAloud} translation={translation} onSupportEvidence={onSupportEvidence} />}
          >
            <Suspense fallback={<p role="status" style={{ margin: 0, color: 'var(--mm-text-muted)' }}>Loading the example…</p>}>
              <WorkedExamplePlayer
                MathText={MathText}
                SupportedTextActions={SupportedTextActions}
                example={similar}
                readAloud={readAloud}
                translation={translation}
                onSupportEvidence={onSupportEvidence}
                onYourTurn={onYourTurn}
                openedByItself={similarOpenedByItself}
              />
            </Suspense>
          </QuestionSupplementBoundary>
        </details>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import MathInput from '../../../MathInput.jsx';
import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';
import { PRACTICE_VERDICT, buildPracticeLikeThis, checkPracticeAnswers, practiceCheckMessage } from './practiceLikeThis.js';

/*
 * "PRACTISE ONE LIKE THIS (NO SCORE)" — the unscored sibling after the last
 * miss (HELP-1 / D3, HELP-9), and on a wrong row of Review My Work (HELP-12).
 * The rules are in practiceLikeThis.js; this is only the screen.
 *
 * NOTHING LEAVES THIS COMPONENT. The boxes are its own state: no onChange to
 * the question, no grader, no attempt, no grade, no evidence (Read aloud and
 * Translate here are not reported either — they are about this sibling, not
 * the item). Closing the item's screen forgets it.
 *
 * It owns its Enter (data-mm-enter-owner): Enter in a box checks the
 * practice, never the question around it.
 */
const button = {
  minHeight: 44,
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid var(--mm-primary-border, var(--mm-tint-border))',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};

const MARK = {
  [PRACTICE_VERDICT.CORRECT]: { symbol: '✓', label: 'matches', color: 'var(--mm-success-text)' },
  [PRACTICE_VERDICT.INCORRECT]: { symbol: '✗', label: 'does not match yet', color: 'var(--mm-error-text)' },
  [PRACTICE_VERDICT.COMPARE]: { symbol: '?', label: 'compare it with the worked solution', color: 'var(--mm-text-muted)' },
};

export default function PracticeLikeThis({
  question,
  seed = 0,
  avoidPrompts = [],
  readAloud = null,
  translation = null,
  startOpen = false,
  label = 'Practise one like this',
}) {
  const [open, setOpen] = useState(Boolean(startOpen));
  const [done, setDone] = useState([]);
  const [responses, setResponses] = useState({});
  const [result, setResult] = useState(null);
  const [solutionShown, setSolutionShown] = useState(false);

  const practice = useMemo(
    () => buildPracticeLikeThis(question, { seed, avoidPrompts: [...avoidPrompts, ...done] }),
    // avoidPrompts is read once per sibling: a parent re-render must not swap the problem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, seed, done],
  );
  // An item without a sibling shows nothing new.
  if (!practice && !done.length) return null;

  const checkableParts = practice ? practice.parts.filter((part) => part.checkable) : [];
  const check = () => {
    if (!practice) return;
    setResult(checkPracticeAnswers(practice, responses));
  };
  const another = () => {
    if (practice) setDone((previous) => [...previous, practice.prompt]);
    setResponses({});
    setResult(null);
    setSolutionShown(false);
  };
  const verdictOf = (id) => result?.parts.find((part) => part.id === id)?.verdict || null;
  const solutionText = practice ? [...practice.steps, `Answer: ${practice.answer}`].join(' ') : '';

  return (
    <section
      className="mathmaster-practice-like-this"
      data-practice-like-this={open ? 'open' : 'closed'}
      data-mm-enter-owner="practice"
      aria-label={`${label} (no score)`}
      style={{ margin: '14px 0 0', padding: '12px 14px', borderRadius: 10, border: '1px dashed var(--mm-border-strong, var(--mm-tint-border))', background: 'var(--mm-surface-tint)', textAlign: 'left', color: 'var(--mm-text)' }}
    >
      {!open ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
          <button type="button" style={button} onClick={() => setOpen(true)} aria-expanded="false">{label} (no score)</button>
          <span style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}>A new problem with different numbers. It is not scored or saved.</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h4 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 'calc(16 * var(--mm-px))' }}>{label}</h4>
            <span style={{ padding: '2px 9px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>No score · not saved</span>
          </div>
          {!practice ? (
            <p role="status" style={{ margin: '10px 0 0', color: 'var(--mm-text-muted)' }}>There is no other problem like this one to practise right now.</p>
          ) : (
            <>
              <MathText as="p" style={{ margin: '10px 0 0', lineHeight: 1.55, color: 'var(--mm-text-strong)', fontWeight: 600 }}>{practice.prompt}</MathText>
              <SupportedTextActions text={practice.prompt} readAloud={readAloud} translation={translation} label="the practice problem" />

              {checkableParts.length > 0 ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  {checkableParts.map((part, position) => {
                    const verdict = verdictOf(part.id);
                    const mark = MARK[verdict] || null;
                    const name = part.label || (checkableParts.length === 1 ? 'Your answer' : `Answer ${position + 1}`);
                    return (
                      <div key={part.id} data-practice-part={part.id} data-practice-verdict={verdict || ''} style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 800, color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}><MathText>{name}</MathText></span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <MathInput
                              value={responses[part.id] || ''}
                              onChange={(value) => {
                                setResponses((previous) => ({ ...previous, [part.id]: value }));
                              }}
                              ariaLabel={`${name} (practice, no score)`}
                              compact
                              maxWidth={420}
                              onSubmit={check}
                              inputStatus={verdict === PRACTICE_VERDICT.CORRECT ? 'correct' : verdict === PRACTICE_VERDICT.INCORRECT ? 'incorrect' : 'neutral'}
                            />
                          </div>
                          {mark && <span aria-label={mark.label} title={mark.label} style={{ color: mark.color, fontWeight: 900, fontSize: 'calc(18 * var(--mm-px))' }}>{mark.symbol}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {practice.wordsOnly.length > 0 && (
                    <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))' }}>
                      Part of this answer is said in words. Decide it, then compare it with the worked solution.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" style={{ ...button, background: 'var(--mm-primary-soft, var(--mm-surface))' }} onClick={check}>Check my practice answer</button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>Work it out on paper or in your scratchpad, then compare with the worked solution.</p>
              )}

              <p role="status" data-practice-message="" style={{ margin: result ? '10px 0 0' : 0, fontWeight: 700, color: result?.allCorrect ? 'var(--mm-success-text)' : 'var(--mm-text)' }}>
                {result ? practiceCheckMessage(result) : ''}
              </p>

              {(result || checkableParts.length === 0 || solutionShown) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <button type="button" style={button} aria-expanded={solutionShown} onClick={() => setSolutionShown((shown) => !shown)}>
                    {solutionShown ? 'Hide the worked solution' : 'Show the worked solution'}
                  </button>
                  <button type="button" style={button} onClick={another}>Another one like this</button>
                </div>
              )}

              {solutionShown && (
                <div data-practice-solution="" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)' }}>
                  <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
                    {practice.steps.map((step, index) => <li key={`step-${index}`} style={{ lineHeight: 1.55 }}><MathText>{step}</MathText></li>)}
                  </ol>
                  <p style={{ margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }}>
                    <strong>Answer: </strong><MathText>{practice.answer}</MathText>
                  </p>
                  <SupportedTextActions text={solutionText} readAloud={readAloud} translation={translation} label="the practice solution" />
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

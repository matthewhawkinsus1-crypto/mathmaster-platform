import { useMemo, useState } from 'react';
import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';
import {
  EXAMPLE_OPENED_BY_ITSELF_TEXT,
  EXAMPLE_SLIDE,
  EXAMPLE_YOUR_TURN_LABEL,
  EXAMPLE_YOUR_TURN_TEXT,
  exampleSlideAt,
  exampleSlides,
  slideReadingText,
  slideTranslationText,
} from './examplePlayer.js';

/*
 * THE WORKED-EXAMPLE PLAYER (WE-A; docs/platform/WORKED_EXAMPLES.md section 4
 * and 10). One slide at a time: the problem, each step with its why, the
 * answer. Next and Back are buttons, so the keyboard reaches them like any
 * other; the last slide's button is "Your turn", which hands the student their
 * own question (the caller closes the example and puts the cursor in the
 * work). What plays, and where, is decided in examplePlayer.js; opening it is
 * recorded by the caller (QuestionEngine) as workedExampleUsed.
 *
 * ACCESSIBILITY. The slide is a polite live region read whole, so a screen
 * reader hears each move and its why as it arrives. Back stays in the page on
 * the first slide (aria-disabled), and Next becomes "Your turn" in place, so
 * focus never falls off a button that went away. Nothing animates: a slide
 * replaces the last. The step, its why and the place in the example are
 * words, never colour alone; borders carry every edge, so forced colours draw
 * them. The row of buttons wraps, for a phone and for 200% text. Read aloud
 * and Translate take the slide through the pipeline Solution Review uses
 * (SupportedTextActions).
 *
 * Loaded on demand (HintPanel.jsx): nothing here is in a page that shows no
 * example.
 */
const button = {
  minHeight: 44,
  minWidth: 88,
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-primary-soft)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};
const primaryButton = { ...button, border: '2px solid var(--mm-primary-text)' };
const muted = { margin: 0, color: 'var(--mm-text-muted)' };

export default function WorkedExamplePlayer({
  example = null,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
  onYourTurn = null,
  openedByItself = false,
}) {
  const slides = useMemo(() => exampleSlides(example), [example]);
  const [position, setPosition] = useState(0);
  if (!slides.length) return null;
  const at = exampleSlideAt(slides, position);
  const slide = slides[at];
  const first = at === 0;
  const back = () => { if (!first) setPosition(at - 1); };
  const next = () => {
    if (slide.last) onYourTurn?.();
    else setPosition(at + 1);
  };
  return (
    <div
      role="group"
      aria-label="Worked example"
      data-worked-example-player=""
      data-example-source={example?.source || ''}
      data-example-slide-number={at + 1}
      data-example-slide-count={slides.length}
      data-example-slide-kind={slide.kind}
      style={{ display: 'grid', gap: 10, minWidth: 0 }}
    >
      {openedByItself ? <p data-example-opened-by-itself="" style={{ ...muted, fontWeight: 700 }}>{EXAMPLE_OPENED_BY_ITSELF_TEXT}</p> : null}
      {/* The problem stays in sight while its steps play. */}
      {slide.kind !== EXAMPLE_SLIDE.PROBLEM ? (
        <p data-example-problem="" style={{ ...muted, overflowWrap: 'anywhere' }}><MathText>{example.prompt}</MathText></p>
      ) : null}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-example-slide=""
        style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', minWidth: 0, overflowWrap: 'anywhere' }}
      >
        <p data-example-slide-label="" style={{ margin: 0, fontWeight: 800, color: 'var(--mm-primary-text)' }}>{slide.label}</p>
        <p data-example-show="" style={{ margin: 0, fontWeight: 700, lineHeight: 1.55 }}>
          {slide.kind === EXAMPLE_SLIDE.ANSWER ? 'Answer: ' : null}<MathText>{slide.show}</MathText>
        </p>
        {slide.why ? (
          <p data-example-why="" style={{ margin: 0, lineHeight: 1.55 }}><strong>Why: </strong><MathText>{slide.why}</MathText></p>
        ) : null}
        {slide.note ? <p data-example-note="" style={muted}>{slide.note}</p> : null}
        {slide.last ? <p data-example-your-turn-note="" style={muted}>{EXAMPLE_YOUR_TURN_TEXT}</p> : null}
      </div>
      {/* Keyed by slide: a translation shown for one step is not the next step's. */}
      <SupportedTextActions
        key={at}
        text={slideReadingText(slide)}
        translationText={slideTranslationText(slide)}
        readAloud={readAloud}
        translation={translation}
        label={`the worked example, ${slide.label.toLowerCase()}`}
        onEvidence={onSupportEvidence}
      />
      <div data-example-controls="" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          data-example-back=""
          aria-disabled={first ? 'true' : undefined}
          onClick={back}
          style={first ? { ...button, opacity: 0.55, cursor: 'not-allowed', borderStyle: 'dashed' } : button}
        >
          Back
        </button>
        <span data-example-progress="" style={{ ...muted, fontWeight: 700 }}>{at + 1} of {slides.length}</span>
        <button type="button" data-example-next="" data-example-your-turn={slide.last ? '' : undefined} onClick={next} style={primaryButton}>
          {slide.last ? EXAMPLE_YOUR_TURN_LABEL : 'Next'}
        </button>
      </div>
    </div>
  );
}

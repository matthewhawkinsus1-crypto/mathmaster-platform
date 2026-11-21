import { useEffect, useState } from 'react';
import MathText from '../../../components/common/MathText.jsx';
import { SupportedTextActions } from '../SupportedText.jsx';
import { EXAMPLE_PLAYER_COPY, exampleSlides, slideLabel, slideReadingText, stepSlide } from './lessonExample.js';

/*
 * THE WORKED-EXAMPLE PLAYER (WE-A; WORKED_EXAMPLES.md sections 4 and 10).
 *
 * One slide per step of a sibling problem, with its "why" under it, Next and
 * Back, and a last slide, "Your turn", whose button returns the student to
 * their own question. It plays what lessonExample.js resolved: an authored
 * step card, or the built-in sibling. Drawn inside the Hint panel
 * (HintPanel.jsx), which is drawn only where help is allowed and the question
 * is open, so it never reaches a DOL, quiz or test.
 *
 * ACCESSIBILITY
 *   - Next, Back and the last button are ordinary buttons, in that order, and
 *     stay in place from slide to slide, so keyboard focus is never lost
 *     (Back on the first slide is aria-disabled, not removed).
 *   - The slide is a polite live region read whole: its place ("Step 2 of
 *     4"), the move and its why are announced when the slide changes.
 *   - The mathematics is drawn by MathText, as a Solution Review step is, and
 *     Read aloud and Translate come from the same SupportedTextActions.
 *   - Slides change with no animation, so there is nothing to reduce.
 *   - Nothing is said by colour alone: the place, "Why" and "Your turn" are
 *     words. Colours and borders are the theme's, so dark mode and forced
 *     colours follow; the buttons wrap on a phone and at 200% text.
 */
const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

const button = {
  minHeight: 44,
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-primary-soft)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};
const primaryButton = { ...button, border: '2px solid var(--mm-primary-text)' };
const slideBox = {
  display: 'grid',
  gap: 8,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

export default function WorkedExamplePlayer({
  example,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
  onYourTurn = null,
  openedByItself = false,
}) {
  // A faded example stops early; the student may ask for the rest.
  const [showAll, setShowAll] = useState(false);
  const [index, setIndex] = useState(0);
  // Said once, after the player is on the page: a region that arrives with
  // its words already in it is not announced.
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (openedByItself) setNotice(EXAMPLE_PLAYER_COPY.openedByItself);
  }, [openedByItself]);

  const slides = exampleSlides(example, { showAll });
  if (!slides.length) return null;
  const at = stepSlide(index, 0, slides.length);
  const slide = slides[at];
  const first = at === 0;
  const last = at === slides.length - 1;
  const label = slideLabel(slide);
  const go = (by) => setIndex(stepSlide(at, by, slides.length));

  return (
    <div data-worked-example-player="" data-example-kind={example.kind || ''} data-example-slide={slide.kind === 'step' ? String(slide.number) : 'your-turn'} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <p role="status" style={VISUALLY_HIDDEN}>{notice}</p>
      <MathText as="p" style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}>{example.prompt}</MathText>
      <div role="group" aria-roledescription="slide" aria-label={label} aria-live="polite" aria-atomic="true" data-example-slide-body="" style={slideBox}>
        <p data-example-step-label="" style={{ margin: 0, color: 'var(--mm-text-muted)', fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</p>
        {slide.kind === 'step' ? (
          <>
            <MathText as="p" style={{ margin: 0, fontSize: 'calc(17 * var(--mm-px))', fontWeight: 700, lineHeight: 1.6, color: 'var(--mm-text-strong)' }}>{slide.show}</MathText>
            {slide.why ? (
              <p data-example-why="" style={{ margin: 0, paddingTop: 8, borderTop: '1px dashed var(--mm-border-strong)', lineHeight: 1.55 }}>
                <strong>{EXAMPLE_PLAYER_COPY.why}: </strong><MathText>{slide.why}</MathText>
              </p>
            ) : null}
          </>
        ) : (
          <>
            {slide.answer ? <p style={{ margin: 0, fontWeight: 800, lineHeight: 1.6 }}>Answer: <MathText>{slide.answer}</MathText></p> : null}
            <p style={{ margin: 0, lineHeight: 1.55 }}>{slide.handedOver ? EXAMPLE_PLAYER_COPY.handOverLine : EXAMPLE_PLAYER_COPY.yourTurnLine}</p>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          data-example-back=""
          aria-disabled={first}
          onClick={() => { if (!first) go(-1); }}
          style={first ? { ...button, opacity: 0.55, cursor: 'default' } : button}
        >
          {EXAMPLE_PLAYER_COPY.back}
        </button>
        <button
          type="button"
          data-example-next=""
          data-example-your-turn={last ? '' : undefined}
          onClick={() => { if (last) onYourTurn?.(); else go(1); }}
          style={primaryButton}
        >
          {last ? EXAMPLE_PLAYER_COPY.goToQuestion : EXAMPLE_PLAYER_COPY.next}
        </button>
        {slide.kind === 'yourTurn' && slide.handedOver ? (
          <button type="button" data-example-show-rest="" onClick={() => setShowAll(true)} style={button}>{EXAMPLE_PLAYER_COPY.showRest}</button>
        ) : null}
      </div>
      {/* Read aloud and Translate for the slide on screen, under Next and
          Back so those stay beside the step on a phone. */}
      <SupportedTextActions key={`read-${at}-${showAll ? 'all' : 'cut'}`} text={slideReadingText(slide)} readAloud={readAloud} translation={translation} label={`the worked example, ${label.toLowerCase()}`} onEvidence={onSupportEvidence} />
    </div>
  );
}

import MathDisplay from './MathDisplay';
import { spokenMathLabel } from './platform/language/mathSpeechLabel.js';

// A substituted group is stored as the unit product 1(…) so it stays one term,
// and is drawn as (…). It is read the way it is drawn: "the quantity …", never
// "1 times the quantity …".
const spokenTermText = (text) => String(text ?? '').replace(/^([+-]?\s*)1 \* (\(.*\))$/, '$1$2');

// Renders a side's terms (from algebraAstEngine's splitAdditiveTerms) as
// individually addressable spans so the parent can measure real bounding
// rects for drag-slot targeting and cancellation-strike positioning. Purely
// presentational: it never computes or judges correctness itself.
export default function AlgebraTermRow({
  terms,
  side,
  registerTermRef,
  crossedIndices = [],
  justInsertedIndex = null,
  selectedIndices = [],
  // The cancellation sequence, in order: the terms a stroke passed through are
  // highlighted, and then the pair that cancels collapses out of the row.
  highlightIndices = [],
  collapsingIndices = [],
  // Terms a structure tool can act on (the fraction to split, the fraction to
  // reduce): a quiet dashed outline, never the red cancellation flash.
  candidateIndices = [],
  onTermClick,
  // Only these terms take a tap (null: every term). Simplify makes only its
  // highlighted parts tappable; the rest of the row is plain mathematics.
  interactiveIndices = null,
  // A row whose keyboard route lives elsewhere (Simplify's parts toolbar)
  // passes -1, so the same choice is not two tab stops.
  termTabIndex = 0,
  interactionLabel = 'select to cancel',
  cancelIndexOffset = 0,
  // Where a staged + / − will land: { termIndex, kind: before|after|under|end,
  // state: hover|staged }. Drawn as a caret or underline BESIDE the term by
  // CSS pseudo-elements — never as the operand inside the expression, because
  // the equation must not show the move before both sides are placed (#341).
  placementCue = null,
  // Cancellation boxes are narrow on tablets and in the systems workspace.
  // There a long side wraps onto a second line instead of running off the
  // box's edge, where a leading term such as -9x was clipped (live QA).
  allowWrap = false,
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: allowWrap ? 'wrap' : 'nowrap',
        maxWidth: allowWrap ? '100%' : undefined,
        rowGap: allowWrap ? '6px' : undefined,
        alignItems: 'center',
        justifyContent: allowWrap ? 'center' : side === 'left' ? 'flex-end' : 'flex-start',
      }}
    >
      {terms.map((term, index) => {
        const crossed = crossedIndices.includes(index);
        const selected = selectedIndices.includes(index);
        const highlighted = highlightIndices.includes(index);
        const collapsing = collapsingIndices.includes(index);
        const cued = placementCue?.termIndex === index;
        const candidate = candidateIndices.includes(index);
        const clickable = Boolean(onTermClick) && (!Array.isArray(interactiveIndices) || interactiveIndices.includes(index));
        const effect = [
          index === justInsertedIndex ? 'algebra-term-pop' : '',
          highlighted ? 'algebra-term-highlight' : '',
          candidate ? 'algebra-term-candidate' : '',
          collapsing ? 'algebra-term-collapse' : '',
          cued ? `algebra-term-placement-cue is-${placementCue.kind === 'end' ? 'after' : placementCue.kind} is-${placementCue.state || 'hover'}` : '',
        ].filter(Boolean).join(' ');
        return (
          <span
            key={index}
            data-term-index={index}
            data-cancel-index={cancelIndexOffset + index}
            ref={(el) => registerTermRef?.(index, el)}
            className={effect}
            onClick={clickable ? () => onTermClick(index) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? termTabIndex : undefined}
            onKeyDown={clickable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTermClick(index); } } : undefined}
            aria-label={clickable ? `${spokenMathLabel(spokenTermText(term.text))}, ${interactionLabel}` : undefined}
            // The term's source text, for code (tests, drivers) that must find a term
            // without depending on how it is spoken.
            data-term-text={term.text}
            aria-pressed={clickable ? selected : undefined}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              // Never squeeze a term. Its math is a scroll container, so a
              // shrinking flex item collapsed to ~17px and showed only the
              // sign with a tiny scrollbar (cancellation mode, live QA). A long
              // row scrolls as a whole in the equation box instead.
              flexShrink: 0,
              marginLeft: index === 0 ? 0 : '10px',
              opacity: crossed ? 0.4 : 1,
              transition: 'opacity 0.25s ease 0.2s, outline-color 0.15s ease, background 0.15s ease',
              cursor: clickable ? 'pointer' : undefined,
              // Unselected: no inline outline, so the keyboard focus ring shows.
              outline: selected ? '2px solid #1a73e8' : undefined,
              outlineOffset: '2px',
              background: selected ? 'rgba(26,115,232,0.12)' : 'transparent',
              borderRadius: clickable ? '8px' : 0,
              padding: clickable ? '7px 9px' : 0,
              minHeight: clickable ? '44px' : undefined,
              minWidth: clickable ? '32px' : undefined,
            }}
          >
            <MathDisplay value={term.latex} format="latex" inline style={{ fontSize: 'inherit' }} ariaLabel={spokenTermText(term.text)} />
            {crossed && (
              <span
                aria-hidden="true"
                className="algebra-cancel-fade"
                style={{
                  position: 'absolute',
                  left: '-6%',
                  right: '-6%',
                  top: '52%',
                  height: '3px',
                  borderRadius: '999px',
                  background: '#c5221f',
                  transform: 'rotate(-6deg)',
                  boxShadow: '0 0 0 2px rgba(255,255,255,0.85)',
                }}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}

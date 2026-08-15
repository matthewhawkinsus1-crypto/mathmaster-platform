import MathDisplay from './MathDisplay';

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
  onTermClick,
  cancelIndexOffset = 0,
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        justifyContent: side === 'left' ? 'flex-end' : 'flex-start',
      }}
    >
      {terms.map((term, index) => {
        const crossed = crossedIndices.includes(index);
        const selected = selectedIndices.includes(index);
        const highlighted = highlightIndices.includes(index);
        const collapsing = collapsingIndices.includes(index);
        const effect = [
          index === justInsertedIndex ? 'algebra-term-pop' : '',
          highlighted ? 'algebra-term-highlight' : '',
          collapsing ? 'algebra-term-collapse' : '',
        ].filter(Boolean).join(' ');
        return (
          <span
            key={index}
            data-term-index={index}
            data-cancel-index={cancelIndexOffset + index}
            ref={(el) => registerTermRef?.(index, el)}
            className={effect}
            onClick={onTermClick ? () => onTermClick(index) : undefined}
            role={onTermClick ? 'button' : undefined}
            tabIndex={onTermClick ? 0 : undefined}
            onKeyDown={onTermClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTermClick(index); } } : undefined}
            aria-label={onTermClick ? `${term.text}, select to cancel` : undefined}
            aria-pressed={onTermClick ? selected : undefined}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: index === 0 ? 0 : '10px',
              opacity: crossed ? 0.4 : 1,
              transition: 'opacity 0.25s ease 0.2s, outline-color 0.15s ease, background 0.15s ease',
              cursor: onTermClick ? 'pointer' : undefined,
              outline: selected ? '2px solid #1a73e8' : 'none',
              outlineOffset: '2px',
              background: selected ? 'rgba(26,115,232,0.12)' : 'transparent',
              borderRadius: onTermClick ? '8px' : 0,
              padding: onTermClick ? '7px 9px' : 0,
              minHeight: onTermClick ? '44px' : undefined,
              minWidth: onTermClick ? '32px' : undefined,
            }}
          >
            <MathDisplay value={term.latex} format="latex" inline style={{ fontSize: 'inherit' }} ariaLabel={term.text} />
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

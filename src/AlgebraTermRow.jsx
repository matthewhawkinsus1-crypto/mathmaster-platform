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
  onTermClick,
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
        return (
          <span
            key={index}
            ref={(el) => registerTermRef?.(index, el)}
            className={index === justInsertedIndex ? 'algebra-term-pop' : ''}
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
              borderRadius: selected ? '6px' : 0,
              padding: selected ? '1px 4px' : 0,
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

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
        return (
          <span
            key={index}
            ref={(el) => registerTermRef?.(index, el)}
            className={index === justInsertedIndex ? 'algebra-term-pop' : ''}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              marginLeft: index === 0 ? 0 : '10px',
              opacity: crossed ? 0.4 : 1,
              transition: 'opacity 0.25s ease 0.2s',
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

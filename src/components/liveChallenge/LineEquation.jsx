import { EQUATION_TOKEN_KIND } from '../../platform/liveChallenge/lineGraphModel.js';

/*
 * AN EQUATION AS A STUDENT READS IT ON PAPER.
 *
 * Drawn from the equation's tokens (lineGraphForms.presentEquation) — stacked
 * fractions, a real minus sign, italic variables — without MathLive, which
 * the game's chunk does not load. A screen reader hears the equation's
 * speech ("y plus 3 equals negative 2 times the quantity x minus 4"), never
 * the pieces.
 */

const fraction = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  verticalAlign: 'middle',
  textAlign: 'center',
  fontSize: '.74em',
  lineHeight: 1.08,
  margin: '0 .1em',
};
const numerator = { borderBottom: '.09em solid currentColor', padding: '0 .14em .04em' };
const denominator = { padding: '.04em .14em 0' };
const operator = { margin: '0 .26em' };

const renderToken = (token, index) => {
  switch (token?.kind) {
    case EQUATION_TOKEN_KIND.VAR:
      return <i key={index} style={{ fontFamily: 'Georgia, "Times New Roman", serif', padding: '0 .03em' }}>{token.value}</i>;
    case EQUATION_TOKEN_KIND.NUM:
      return <span key={index}>{token.value}</span>;
    case EQUATION_TOKEN_KIND.FRAC:
      return (
        <span key={index} style={fraction}>
          <span style={numerator}>{token.num}</span>
          <span style={denominator}>{token.den}</span>
        </span>
      );
    case EQUATION_TOKEN_KIND.OP:
      return <span key={index} style={operator}>{token.value}</span>;
    case EQUATION_TOKEN_KIND.NEG:
      return <span key={index}>−</span>;
    case EQUATION_TOKEN_KIND.OPEN:
      return <span key={index}>(</span>;
    case EQUATION_TOKEN_KIND.CLOSE:
      return <span key={index}>)</span>;
    default:
      return null;
  }
};

/** `equation` is { tokens, text, speech } (presentEquation). Nothing without tokens. */
export default function LineEquation({ equation, className = '', style = null }) {
  const tokens = Array.isArray(equation?.tokens) ? equation.tokens : [];
  if (!tokens.length) return null;
  return (
    <span
      className={className || undefined}
      role="math"
      aria-label={equation.speech || equation.text || ''}
      style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {/* The order is the equation's: the index is each token's identity. */}
      <span aria-hidden="true">{tokens.map(renderToken)}</span>
    </span>
  );
}

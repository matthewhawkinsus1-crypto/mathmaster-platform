import MathDisplay from './MathDisplay';

const MATH_DELIMITER_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

// Preserve author-entered values, but never show raw calculator-style inverse
// notation in prose. This is display-only typography; grading data is not
// changed.
const normalizePlainMathTypography = (value) => String(value ?? '')
  .replace(/([A-Za-z])\^-1/g, '$1⁻¹');

const getDelimitedMath = (segment) => {
  if (segment.startsWith('$$')) {
    return { value: segment.slice(2, -2), inline: false };
  }
  if (segment.startsWith('\\[')) {
    return { value: segment.slice(2, -2), inline: false };
  }
  if (segment.startsWith('\\(')) {
    return { value: segment.slice(2, -2), inline: true };
  }
  return { value: segment.slice(1, -1), inline: true };
};

/**
 * Displays ordinary directions plus optional math delimited with:
 * $...$, \\(...\\), $$...$$, or \\[...\\].
 */
export default function QuestionPrompt({
  children,
  style = {},
  mathFormat = 'auto',
}) {
  const text = String(children ?? '');
  const segments = text.split(MATH_DELIMITER_PATTERN).filter(Boolean);

  return (
    <div
      className="mathmaster-question-prompt"
      style={{
        fontSize: '18px',
        color: '#5f6368',
        lineHeight: 1.65,
        margin: '0 auto 18px',
        maxWidth: '820px',
        ...style,
      }}
    >
      {segments.map((segment, index) => {
        const isMath = MATH_DELIMITER_PATTERN.test(segment);
        MATH_DELIMITER_PATTERN.lastIndex = 0;

        if (!isMath) {
          return <span key={`${index}-${segment}`}>{normalizePlainMathTypography(segment)}</span>;
        }

        const math = getDelimitedMath(segment);
        if (!math.inline) {
          return (
            <MathDisplay
              key={`${index}-${segment}`}
              value={math.value}
              format={mathFormat}
              style={{ margin: '12px auto' }}
            />
          );
        }

        return (
          <MathDisplay
            key={`${index}-${segment}`}
            value={math.value}
            format={mathFormat}
            inline
            style={{ margin: '0 0.16em' }}
          />
        );
      })}
    </div>
  );
}

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
  variant = 'question',
}) {
  const text = String(children ?? '');
  const segments = text.split(MATH_DELIMITER_PATTERN).filter(Boolean);

  const isProminent = variant !== 'plain';

  return (
    <div
      className={`mathmaster-question-prompt ${isProminent ? 'mathmaster-question-prompt-prominent' : 'mathmaster-question-prompt-plain'}`}
      style={{
        fontSize: isProminent ? '20px' : '18px',
        color: isProminent ? '#202124' : '#5f6368',
        fontWeight: isProminent ? 760 : 400,
        lineHeight: isProminent ? 1.5 : 1.65,
        margin: '0 auto 18px',
        maxWidth: isProminent ? '860px' : '820px',
        padding: isProminent ? '16px 18px 17px' : 0,
        borderRadius: isProminent ? '12px' : 0,
        border: isProminent ? '2px solid #c7d8f4' : 0,
        borderLeft: isProminent ? '7px solid #1a73e8' : 0,
        background: isProminent ? '#f8fbff' : 'transparent',
        boxShadow: isProminent ? '0 4px 12px rgba(26,115,232,0.08)' : 'none',
        textAlign: isProminent ? 'left' : undefined,
        ...style,
      }}
    >
      {isProminent && (
        <div style={{ marginBottom: '7px', color: '#174ea6', fontSize: '11px', fontWeight: 950, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
          Your question
        </div>
      )}
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

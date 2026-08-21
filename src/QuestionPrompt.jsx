import MathDisplay from './MathDisplay';
import { isMathSegment, splitMathSegments, unwrapMathSegment } from './components/common/mathSegments.js';

// Preserve author-entered values, but never show raw calculator-style inverse
// notation in prose. This is display-only typography; grading data is not
// changed.
const normalizePlainMathTypography = (value) => String(value ?? '')
  .replace(/([A-Za-z])\^-1/g, '$1⁻¹');

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
  const segments = splitMathSegments(text);

  const isPlain = variant === 'plain';
  const isTask = variant === 'task';
  const isProminent = !isPlain;

  return (
    <div
      className={`mathmaster-question-prompt ${isProminent ? 'mathmaster-question-prompt-prominent' : 'mathmaster-question-prompt-plain'}`}
      style={{
        fontSize: isTask ? '17px' : isProminent ? '20px' : '18px',
        color: isProminent ? '#202124' : '#5f6368',
        fontWeight: isTask ? 720 : isProminent ? 760 : 400,
        lineHeight: isTask ? 1.45 : isProminent ? 1.5 : 1.65,
        margin: isTask ? '0 auto 10px' : '0 auto 18px',
        maxWidth: isProminent ? '860px' : '820px',
        padding: isTask ? '11px 15px 12px' : isProminent ? '16px 18px 17px' : 0,
        borderRadius: isProminent ? '12px' : 0,
        border: isTask ? '1px solid #c7d8f4' : isProminent ? '2px solid #c7d8f4' : 0,
        borderLeft: isTask ? '5px solid #5f8fd8' : isProminent ? '7px solid #1a73e8' : 0,
        background: isTask ? '#fbfdff' : isProminent ? '#f8fbff' : 'transparent',
        boxShadow: isTask ? 'none' : isProminent ? '0 4px 12px rgba(26,115,232,0.08)' : 'none',
        textAlign: isProminent ? 'left' : undefined,
        ...style,
      }}
    >
      {isProminent && (
        <div style={{ marginBottom: '7px', color: '#174ea6', fontSize: '11px', fontWeight: 950, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
          {isTask ? 'Your task' : 'Your question'}
        </div>
      )}
      {segments.map((segment, index) => {
        if (!isMathSegment(segment)) {
          return <span key={`${index}-${segment}`}>{normalizePlainMathTypography(segment)}</span>;
        }

        const math = unwrapMathSegment(segment);
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

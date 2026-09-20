import MathDisplay from './MathDisplay';
import { splitProseFractionRuns } from './components/common/mathSegments.js';

const INLINE_MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

const renderStatement = (statement, index) => {
  const text = String(statement?.text ?? '');
  const segments = text.split(INLINE_MATH_PATTERN).filter(Boolean);
  return (
    <div key={`${index}-${text}`} className={`mathmaster-reference-statement ${statement?.emphasis ? 'is-emphasis' : ''}`}>
      {statement?.label && <span className="mathmaster-reference-statement-label">{statement.label}</span>}
      <span>
        {segments.map((segment, segmentIndex) => {
          const isMath = INLINE_MATH_PATTERN.test(segment);
          INLINE_MATH_PATTERN.lastIndex = 0;
          if (!isMath) {
            // A raw mathematical fraction can appear in non-delimited prose
            // here too ("The formula uses 1/2 base times height."). Stack it
            // instead of leaving a slash on the screen.
            const fractionRuns = splitProseFractionRuns(segment);
            return (
              <span key={`${segmentIndex}-${segment}`}>
                {fractionRuns.map((run, runIndex) => (run.isFraction
                  ? <MathDisplay key={`${segmentIndex}-f-${runIndex}`} value={run.text} format="latex" inline />
                  : <span key={`${segmentIndex}-p-${runIndex}`}>{run.text}</span>))}
              </span>
            );
          }
          if (segment.startsWith('$$')) return <MathDisplay key={`${segmentIndex}-${segment}`} value={segment.slice(2, -2)} format="auto" />;
          if (segment.startsWith('\\[')) return <MathDisplay key={`${segmentIndex}-${segment}`} value={segment.slice(2, -2)} format="auto" />;
          if (segment.startsWith('\\(')) return <MathDisplay key={`${segmentIndex}-${segment}`} value={segment.slice(2, -2)} format="auto" inline />;
          return <MathDisplay key={`${segmentIndex}-${segment}`} value={segment.slice(1, -1)} format="auto" inline />;
        })}
      </span>
    </div>
  );
};

export default function ReferenceInfoCard({ referenceInfo }) {
  if (!referenceInfo?.statements?.length) return null;
  return (
    <aside className="mathmaster-reference-info-card" aria-label="Information you need for this question">
      <div className="mathmaster-reference-info-kicker">Information you need</div>
      {referenceInfo.title && referenceInfo.title.toLowerCase() !== 'information you need' && (
        <div className="mathmaster-reference-info-title">{referenceInfo.title}</div>
      )}
      <div className="mathmaster-reference-info-statements">
        {referenceInfo.statements.map(renderStatement)}
      </div>
    </aside>
  );
}

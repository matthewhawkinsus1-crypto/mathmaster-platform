import MathDisplay from './MathDisplay';

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
          if (!isMath) return <span key={`${segmentIndex}-${segment}`}>{segment}</span>;
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

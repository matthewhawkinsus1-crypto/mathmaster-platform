import { CASE_PROVENANCE_LABEL, CASE_PROVENANCE_LEGEND } from '../../../platform/caseReview/caseProvenance.js';

/*
 * Small shared pieces of the Student Case Review screens: provenance badges,
 * facts that open to their sources, tiles, dates. Presentation only — every
 * number comes from the model (src/platform/caseReview/studentCaseReview.js).
 */

const SCHOOL_TIME_ZONE = 'America/Chicago';

export const when = (ms) => (Number.isFinite(ms)
  ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE })
  : '—');
export const day = (ms) => (Number.isFinite(ms)
  ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: SCHOOL_TIME_ZONE })
  : '—');
export const pct = (value) => (Number.isFinite(value) ? `${value}%` : '—');

const legendMeaning = (level) => CASE_PROVENANCE_LEGEND.find((entry) => entry.level === level)?.meaning || '';

/** How a fact is known. The title carries the legend's definition. */
export function Prov({ level }) {
  if (!level) return null;
  return <span className="cr-prov" data-level={level} title={legendMeaning(level)}>{CASE_PROVENANCE_LABEL[level] || level}</span>;
}

export function Tile({ value, label, prov = null }) {
  return (
    <div className="cr-tile">
      <strong>{value}</strong>
      <span>{label}</span>
      {prov ? <span><Prov level={prov} /></span> : null}
    </div>
  );
}

/** A fact with its provenance, expandable to the records it came from. */
export function FactItem({ fact, onCopy = null }) {
  return (
    <li className="cr-fact" data-fact-key={fact.key}>
      <div className="cr-fact__row">
        <span className="cr-fact__text">{fact.text}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Prov level={fact.provenance} />
          {onCopy && <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" data-screen-only onClick={() => onCopy(fact.text)}>Copy</button>}
        </span>
      </div>
      {(fact.sources?.length > 0 || fact.limitation) && (
        <details>
          <summary>Where this comes from</summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {fact.sources.map((source, index) => (
              <li key={`${source.label}-${index}`}>
                <strong>{source.label}</strong>
                {source.path ? <> · <code>{source.path}</code></> : null}
                {source.detail ? ` · ${source.detail}` : ''}
                {source.ids?.length ? ` · ${source.ids.length} record${source.ids.length === 1 ? '' : 's'}${source.idsTruncated ? '+' : ''}` : ''}
              </li>
            ))}
            {fact.limitation ? <li><em>Limitation:</em> {fact.limitation}</li> : null}
          </ul>
        </details>
      )}
    </li>
  );
}

export function EmptyNote({ children }) {
  return <p className="cr-note" style={{ fontStyle: 'italic' }}>{children}</p>;
}

/** Attempt chips: 1 ✓, 2 ✗ … with the provenance of each attempt in its title. */
export function AttemptChips({ attempts = [] }) {
  if (!attempts.length) return <span className="cr-note">—</span>;
  const glyph = { correct: '✓', partial: '½', incorrect: '✗', 'not-correct': '·' };
  return (
    <span className="cr-attempts">
      {attempts.map((attempt) => (
        <span
          key={attempt.number}
          className="cr-attempt"
          data-result={attempt.result}
          title={`Attempt ${attempt.number}: ${attempt.result === 'not-correct' ? 'not correct (derived from the record; partial credit not stored)' : attempt.result}${Number.isFinite(attempt.atMs) ? ` · ${when(attempt.atMs)}` : ''} · ${CASE_PROVENANCE_LABEL[attempt.provenance] || ''}`}
        >
          {attempt.number}{glyph[attempt.result] || ''}
        </span>
      ))}
    </span>
  );
}

export function ConditionTag({ value }) {
  return value === 'modified'
    ? <span className="cr-tag" data-kind="modified">MOD</span>
    : <span className="cr-tag">Standard</span>;
}

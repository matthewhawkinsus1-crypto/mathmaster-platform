import { useMemo, useState } from 'react';
import { EmptyNote, Prov, day, when } from './CaseReviewParts.jsx';

/*
 * TIMELINE — meaningful recorded events, grouped by school day, newest last.
 * Work is grouped per assignment per day (never one row per attempt); each
 * entry opens to its details.
 */

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'academic', label: 'Academic' },
  { key: 'support', label: 'Support records' },
];

export default function CaseTimelineTab({ model }) {
  const [filter, setFilter] = useState('all');
  const entries = useMemo(
    () => model.timeline.entries.filter((entry) => filter === 'all' || entry.group === filter),
    [model.timeline.entries, filter],
  );
  const days = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      if (!map.has(entry.dateKey)) map.set(entry.dateKey, []);
      map.get(entry.dateKey).push(entry);
    });
    return [...map.entries()];
  }, [entries]);
  return (
    <section className="cr-section" aria-labelledby="cr-timeline">
      <h2 id="cr-timeline">Timeline ({model.timeline.total} events on {model.timeline.days} days)</h2>
      <div className="tw-row" style={{ gap: 6 }} role="group" aria-label="Timeline filter">
        {FILTERS.map((entry) => (
          <button key={entry.key} type="button" className="tw-chip" aria-pressed={filter === entry.key} onClick={() => setFilter(entry.key)}>{entry.label}</button>
        ))}
      </div>
      {model.timeline.truncated && <p className="cr-note">Only the most recent events are shown; the JSON export has them all.</p>}
      {days.length ? days.map(([dateKey, dayEntries]) => (
        <details key={dateKey} className="tw-disclosure" open={days.length <= 12 || undefined}>
          <summary>{day(dayEntries[0].atMs)} <span className="cr-note">· {dayEntries.length} event{dayEntries.length === 1 ? '' : 's'}</span></summary>
          <div className="tw-disclosure__body">
            <ul className="cr-facts">
              {dayEntries.map((entry, index) => (
                <li key={`${entry.atMs}-${index}`} style={entry.withdrawn ? { opacity: 0.65 } : undefined} data-timeline-kind={entry.kind}>
                  <div className="cr-fact__row">
                    <span className="cr-fact__text">{when(entry.atMs)} — {entry.label}</span>
                    <Prov level={entry.provenance} />
                  </div>
                  {entry.detail && <div className="cr-note">{entry.detail}</div>}
                  {entry.details?.length > 0 && (
                    <details>
                      <summary>Details ({entry.details.length})</summary>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{entry.details.map((detail, detailIndex) => <li key={detailIndex}>{detail.label}: {detail.value}</li>)}</ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )) : <EmptyNote>No recorded events in this selection.</EmptyNote>}
    </section>
  );
}

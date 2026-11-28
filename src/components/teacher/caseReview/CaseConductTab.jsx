import { CASE_PROVENANCE } from '../../../platform/caseReview/caseProvenance.js';
import { EmptyNote, Prov, Tile, when } from './CaseReviewParts.jsx';

/*
 * CONDUCT & FAMILY CONTACT — what the teacher recorded in the Discipline
 * Tracker and the family contacts logged in Parent Contacts, over the case's
 * window (platform/caseReview/conductRecords.js). Staff-documented records,
 * counted as they were recorded; the teacher's own words are labelled as
 * theirs. Nothing on this tab changes a grade or a record.
 */

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function FollowUp({ row }) {
  if (!row.followUpDate) return <span className="cr-note">—</span>;
  return <>{row.followUpDate} <span className="cr-note">({row.followUpCompleted ? 'completed' : 'open'})</span></>;
}

export default function CaseConductTab({ model }) {
  const conduct = model.conduct;
  if (!conduct?.loaded) {
    return (
      <section className="cr-section" aria-labelledby="cr-conduct">
        <h2 id="cr-conduct">Conduct &amp; family contact</h2>
        <EmptyNote>
          The student&apos;s conduct records and family contacts could not be loaded for this case review{conduct?.error ? ` (${conduct.error})` : ''}.
          {' '}That is a missing read, not an absence of records.
        </EmptyNote>
      </section>
    );
  }
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-conduct" data-case-conduct>
        <h2 id="cr-conduct">Conduct &amp; family contact</h2>
        <ul className="cr-lines" data-case-conduct-lines>{conduct.lines.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="cr-note">{conduct.note}</p>
        {conduct.byType.length > 0 && (
          <div className="cr-tiles" data-case-conduct-types>
            {conduct.byType.map((entry) => (
              <Tile key={entry.type} value={entry.count} label={`${entry.label} · ${plural(entry.days, 'school day')}`} prov={CASE_PROVENANCE.STAFF} />
            ))}
          </div>
        )}
        {conduct.byType.some((entry) => entry.details.length) && (
          <ul className="cr-lines">
            {conduct.byType.filter((entry) => entry.details.length).map((entry) => (
              <li key={entry.type}><strong>{entry.label}:</strong> {entry.details.map((detail) => `${detail.label} ${detail.count}`).join(' · ')}</li>
            ))}
          </ul>
        )}
      </section>

      {conduct.incidents.length > 0 && (
        <section className="cr-section" aria-labelledby="cr-conduct-records">
          <h2 id="cr-conduct-records">Conduct records ({conduct.total})</h2>
          {conduct.truncated.incidents && <p className="cr-note">More records exist for this student than were loaded; this list may be incomplete.</p>}
          <div className="cr-scroll-x" role="region" aria-label="Conduct records, scrollable" tabIndex={0}>
            <table className="cr-table" aria-label="Conduct records" data-case-conduct-records>
              <thead><tr><th>Recorded</th><th>What</th><th>Class</th><th>District form</th><th>How known</th></tr></thead>
              <tbody>
                {conduct.incidents.map((row) => (
                  <tr key={row.id || row.atMs} data-conduct-record={row.id}>
                    <td>{when(row.atMs)}</td>
                    <td>{row.label}</td>
                    <td>{row.classLabel || '—'}</td>
                    <td>{row.formLabel}</td>
                    <td><Prov level={row.provenance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="cr-section" aria-labelledby="cr-family-contacts">
        <h2 id="cr-family-contacts">Family contacts ({conduct.contacts.length})</h2>
        {conduct.truncated.contacts && <p className="cr-note">More family contacts exist for this student than were loaded; this list may be incomplete.</p>}
        {conduct.contacts.length ? (
          <>
            <p className="cr-note">Outcome and notes are the teacher&apos;s own words, as logged in Parent Contacts.</p>
            <div className="cr-scroll-x" role="region" aria-label="Family contacts, scrollable" tabIndex={0}>
              <table className="cr-table" aria-label="Family contacts" data-case-family-contacts>
                <thead><tr><th>When</th><th>Method</th><th>Reason</th><th>Outcome (teacher-written)</th><th>Follow-up</th><th>Notes (teacher-written)</th></tr></thead>
                <tbody>
                  {conduct.contacts.map((row) => (
                    <tr key={row.id || row.atMs} data-family-contact={row.id}>
                      <td>{when(row.atMs)}</td>
                      <td>{row.methodLabel}</td>
                      <td>{row.categoryLabel}</td>
                      <td>{row.outcome || '—'}</td>
                      <td><FollowUp row={row} /></td>
                      <td>{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyNote>No family contact is logged in Parent Contacts for this window.</EmptyNote>
        )}
      </section>
    </>
  );
}

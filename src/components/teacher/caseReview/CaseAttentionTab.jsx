import { EmptyNote, day, pct } from './CaseReviewParts.jsx';

/*
 * WHAT NEEDS ATTENTION? — the teacher's short list, each list ordered by the
 * fixed rule printed under it (attentionSummary.js). "Address first" ranks
 * standards by recorded results; it is not a diagnosis of the student.
 */

const RECOVERABLE_LABEL = {
  'open-until': 'Still open for this student',
  'attempts-remain': 'Attempts remain on incorrect questions',
  'recovery-in-progress': 'Recovery in progress',
};

function Rule({ children }) {
  return <p className="cr-note"><em>Order:</em> {children}</p>;
}

export default function CaseAttentionTab({ model, onOpenAssignment, onOpenQuestion }) {
  const attention = model.attention;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-attn-first" data-case-attention>
        <h2 id="cr-attn-first">What to address first</h2>
        <p className="cr-note">{attention.note}</p>
        {attention.addressFirst.length ? (
          <ol className="cr-lines">
            {attention.addressFirst.map((entry) => (
              <li key={entry.code}>
                <strong>{entry.code}</strong>{entry.description ? ` — ${entry.description}` : ''}
                <div className="cr-note">{entry.basis}</div>
              </li>
            ))}
          </ol>
        ) : <EmptyNote>No grade-level standard meets the rules for this list in the selection.</EmptyNote>}
        <Rule>{attention.rules.addressFirst}</Rule>
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-incomplete">
        <h2 id="cr-attn-incomplete">Incomplete or missing assignments ({attention.incomplete.length})</h2>
        {attention.incomplete.length ? (
          <div className="cr-scroll-x">
            <table className="cr-table">
              <thead><tr><th>Assignment</th><th>Status</th><th>Answered</th><th>Final cutoff for this student</th></tr></thead>
              <tbody>
                {attention.incomplete.map((entry) => (
                  <tr key={entry.assignmentId}>
                    <td><button type="button" className="cr-linkish" onClick={() => onOpenAssignment(entry.assignmentId)}>{entry.title}</button></td>
                    <td>{entry.statusLabel}{entry.stillOpen ? ' · still open' : ''}</td>
                    <td className="cr-num">{entry.answered} of {entry.total}</td>
                    <td>{day(entry.finalAtMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote>Every assignment in the selection is completed or excused.</EmptyNote>}
        <Rule>{attention.rules.incomplete}</Rule>
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-skills">
        <h2 id="cr-attn-skills">Skills that repeatedly break down</h2>
        {attention.skillsBreakingDown.length ? (
          <ul className="cr-lines">
            {attention.skillsBreakingDown.map((entry) => <li key={entry.code}><strong>{entry.code}</strong>{entry.description ? ` — ${entry.description}` : ''} <span className="cr-note">· {entry.reason}</span></li>)}
          </ul>
        ) : <EmptyNote>No grade-level skill meets the breakdown rules (at least 3 scored questions).</EmptyNote>}
        <Rule>{attention.rules.skills}</Rule>
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-dols">
        <h2 id="cr-attn-dols">Lowest DOLs</h2>
        {attention.lowestDols.length ? (
          <ul className="cr-lines">
            {attention.lowestDols.map((entry) => (
              <li key={entry.assignmentId}>
                <button type="button" className="cr-linkish" onClick={() => onOpenAssignment(entry.assignmentId)}>{entry.title}</button>: DOL {pct(entry.score)} <span className="cr-note">({entry.answered} of {entry.total} answered)</span>
              </li>
            ))}
          </ul>
        ) : <EmptyNote>No DOL grade is recorded in this selection.</EmptyNote>}
        <Rule>{attention.rules.lowestDols}</Rule>
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-exhausted">
        <h2 id="cr-attn-exhausted">Questions not correct after all available attempts ({attention.exhaustedTotal})</h2>
        {attention.exhaustedQuestions.length ? (
          <div className="cr-scroll-x">
            <table className="cr-table">
              <thead><tr><th>Assignment</th><th>Question</th><th>Standards</th><th>Attempts</th></tr></thead>
              <tbody>
                {attention.exhaustedQuestions.map((entry) => (
                  <tr key={`${entry.assignmentId}-${entry.storageIndex}`}>
                    <td>{entry.title}</td>
                    <td><button type="button" className="cr-linkish" onClick={() => onOpenQuestion(entry.assignmentId, entry.storageIndex)}>{entry.section} {entry.number}</button></td>
                    <td>{entry.standards.join(', ') || '—'}</td>
                    <td className="cr-num">{entry.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote>No question in this selection used all of its attempts without a correct answer.</EmptyNote>}
        {attention.exhaustedTotal > attention.exhaustedQuestions.length && <p className="cr-note">The first {attention.exhaustedQuestions.length} are listed; the questions CSV has all {attention.exhaustedTotal}.</p>}
        <Rule>{attention.rules.exhausted}</Rule>
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-recover">
        <h2 id="cr-attn-recover">What can still be corrected or recovered</h2>
        {attention.recoverable.length ? (
          <ul className="cr-lines">
            {attention.recoverable.map((entry, index) => (
              <li key={`${entry.assignmentId}-${entry.reason}-${index}`}>
                <button type="button" className="cr-linkish" onClick={() => onOpenAssignment(entry.assignmentId)}>{entry.title}</button>: {RECOVERABLE_LABEL[entry.reason] || entry.reason}
                {entry.questions ? ` (${entry.questions} question${entry.questions === 1 ? '' : 's'})` : ''}
                {entry.section ? ` (${entry.section})` : ''}
                {Number.isFinite(entry.untilMs) ? <span className="cr-note"> · until {day(entry.untilMs)}</span> : null}
              </li>
            ))}
          </ul>
        ) : <EmptyNote>No work in this selection is still open for this student.</EmptyNote>}
        <Rule>{attention.rules.recoverable}</Rule>
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-support">
        <h2 id="cr-attn-support">Support evidence that exists</h2>
        {attention.supportEvidencePresent.length ? (
          <ul className="cr-lines">
            {attention.supportEvidencePresent.map((entry) => (
              <li key={entry.supportId}>
                <strong>{entry.label}</strong>
                <span className="cr-note"> · available on {entry.available || 0} · provided on {entry.provided || 0} · {entry.uses || 0} recorded use{entry.uses === 1 ? '' : 's'} · {entry.staffRecords || 0} staff record{entry.staffRecords === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyNote>MathMaster contains no support record for this selection.</EmptyNote>}
      </section>

      <section className="cr-section" aria-labelledby="cr-attn-missing">
        <h2 id="cr-attn-missing">Evidence that is missing</h2>
        {attention.evidenceMissing.length ? (
          <ul className="cr-lines">{attention.evidenceMissing.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        ) : <EmptyNote>No evidence gap was found for this selection.</EmptyNote>}
        <p className="cr-note">A missing record is a gap in what MathMaster holds, not a finding about the student or the staff.</p>
      </section>
    </>
  );
}

import { CASE_PROVENANCE } from '../../../platform/caseReview/caseProvenance.js';
import { Prov, Tile, day, when } from './CaseReviewParts.jsx';

/*
 * COMPLETION & ENGAGEMENT — what was recorded, labelled by how. Four kinds of
 * time stay apart: active (server ledger, else browser seconds, else Not
 * recorded), elapsed, the assignment window, and Practice Mode time (never
 * recorded). "No open record" is never "never opened".
 */

const yes = (value) => (value === null || value === undefined ? 'Not determinable' : (value ? 'Yes' : 'No'));

export default function CaseCompletionTab({ model }) {
  const summary = model.completion.summary;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-completion">
        <h2 id="cr-completion">Completion and work pattern</h2>
        <div className="cr-tiles">
          <Tile value={summary.assigned} label="assigned" />
          <Tile value={summary.openedRecorded} label="with a record of being opened" />
          <Tile value={summary.noOpenRecord} label="no open record (not the same as never opened)" prov={CASE_PROVENANCE.NOT_RECORDED} />
          <Tile value={summary.started} label="started" />
          <Tile value={summary.completed} label="completed" />
          <Tile value={summary.incomplete} label="incomplete" />
          <Tile value={summary.missing} label="missing" />
          <Tile value={summary.completedLate} label="completed after the due date" />
          <Tile value={`${summary.resumed} of ${summary.resumedDeterminable}`} label="resumed on another day (where dated)" />
          <Tile value={summary.reopened} label="reopened (extension or Recovery)" />
          <Tile value={summary.practiceModeLoaded ? summary.practiceModeAssignments : '—'} label={summary.practiceModeLoaded ? 'with Practice Mode activity' : 'Practice Mode records not loaded'} />
          <Tile value={summary.workSessions} label="server-timed work sessions" prov={CASE_PROVENANCE.DERIVED} />
        </div>
        <p className="cr-note">
          First recorded activity: {when(summary.firstActivityMs)} · last recorded activity: {when(summary.lastActivityMs)}.
          Active time: {summary.activeMinutesServer} server-timed minutes{summary.activeMinutesBrowser ? `, ${summary.activeMinutesBrowser} browser-counted minutes (earlier method)` : ''};
          not recorded for {summary.timeNotRecorded} assignment{summary.timeNotRecorded === 1 ? '' : 's'} with work. Practice Mode time is not recorded by MathMaster.
          {summary.notCountedAfterClose ? ` ${summary.notCountedAfterClose} answer${summary.notCountedAfterClose === 1 ? '' : 's'} arrived after a final cutoff and were not counted.` : ''}
        </p>
        <p className="cr-note">
          Work sessions are runs of server-timed active minutes with no gap over 20 minutes. Elapsed time runs from the first to the last active minute;
          the assignment window runs from release to the student&apos;s own final cutoff. These are different numbers and are never combined.
        </p>
      </section>
      <section className="cr-section" aria-labelledby="cr-completion-table">
        <h2 id="cr-completion-table">By assignment</h2>
        <div className="cr-scroll-x">
          <table className="cr-table">
            <thead>
              <tr>
                <th>Assignment</th><th>Opened</th><th>Status</th><th>Completed on</th><th>Late</th><th>Resumed</th><th>Reopened</th>
                <th>Active time</th><th>Elapsed</th><th>Window</th><th>Practice Mode</th><th>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {model.completion.assignments.map((row) => (
                <tr key={row.assignmentId}>
                  <td>{row.title}</td>
                  <td>{row.opened.recorded ? <>{row.opened.firstAtMs ? day(row.opened.firstAtMs) : 'Yes'} <Prov level={row.opened.provenance} /></> : <>No open record <Prov level={CASE_PROVENANCE.NOT_RECORDED} /></>}</td>
                  <td>{row.statusLabel}</td>
                  <td>{row.completedAt ? <>{when(row.completedAt.atMs)} <Prov level={row.completedAt.provenance} /></> : '—'}</td>
                  <td>{row.late ? 'Yes' : '—'}{row.afterDeadline.notCountedAfterClose ? ` · ${row.afterDeadline.notCountedAfterClose} not counted after close` : ''}</td>
                  <td>{yes(row.resumed)}{row.workDays.length > 1 ? ` (${row.workDays.length} days)` : ''}</td>
                  <td>{[row.reopened.attendanceExtension ? 'Attendance extension' : '', ...row.reopened.recoveries.map((recovery) => `${recovery.section === 'dol' ? 'DOL' : 'Warm-Up'} Recovery (${recovery.status})`)].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{row.time.activeMinutes !== null ? `${row.time.activeMinutes} min` : 'Not recorded'} <Prov level={row.time.activeProvenance} /></td>
                  <td>{row.time.elapsedMinutes !== null ? `${row.time.elapsedMinutes} min` : '—'}</td>
                  <td>{row.time.windowDays !== null ? `${row.time.windowDays} days` : '—'}</td>
                  <td>{row.practiceMode.loaded === false ? 'Not loaded' : row.practiceMode.recorded ? <>{row.practiceMode.questionsPracticed} q · {row.practiceMode.correct} correct <Prov level={CASE_PROVENANCE.LEGACY} /></> : 'None recorded'}</td>
                  <td>{row.sessions.ledger.length || (row.sessions.summaries.length ? `${row.sessions.summaries.length} browser` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {model.completion.assignments.some((row) => row.time.activeNote) && (
          <p className="cr-note">Active time: {[...new Set(model.completion.assignments.map((row) => row.time.activeNote).filter(Boolean))].join(' ')}</p>
        )}
      </section>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  CRASH_REPORT_LIMITS,
  WIDESPREAD_REPORTERS,
  summarizePlatformHealth,
  utcDayKey,
} from '../../../functions/shared/crashReport.mjs';
import {
  HEALTH_DAYS_SHOWN,
  purgeCrashReports,
  readCrashReportingStatus,
  readPlatformHealthDays,
  setCrashReportingMode,
} from '../../platform/admin/platformHealthStore.js';

/*
 * PLATFORM HEALTH: CRASHES AS THEY HAPPEN, WITHOUT A STUDENT IN THEM.
 *
 * A question that crashed on every reload kept students stuck for a class
 * period and was learned of from reports (PR #553). This view shows counts of
 * failures by build, question family, kind and screen, and says so plainly
 * when one is new or is hitting many accounts.
 *
 * Reporting is OFF until the root administrator turns it on here, and this
 * panel states exactly what each choice sends (functions/shared/
 * crashReport.mjs is the definition). Nothing here reads a student record.
 */

const panel = { border: '1px solid var(--mm-border)', borderRadius: 12, padding: '20px 22px', marginBottom: 18, background: 'var(--mm-surface)', textAlign: 'left' };
const muted = { color: 'var(--mm-text-muted)', fontSize: 'calc(13.5 * var(--mm-px))', lineHeight: 1.55 };
const quiet = { minHeight: 40, padding: '0 14px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 700, cursor: 'pointer' };
const primary = { ...quiet, border: 0, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 800 };
const danger = { ...quiet, color: 'var(--mm-danger-text)', borderColor: 'var(--mm-error-border-soft)', background: 'var(--mm-danger-soft)' };
const cell = { padding: '7px 12px 7px 0', verticalAlign: 'top', borderBottom: '1px solid var(--mm-border-soft)', fontSize: 'calc(13 * var(--mm-px))' };

const MODES = [
  ['off', 'Off', 'Nothing is sent. A failure stays on the device unless a person presses “Copy details for your teacher”.'],
  ['family', 'Counts by question family', 'A count per build, question family, question module, kind of failure, screen and error signature.'],
  ['question', 'Counts by question', 'The same, plus the assignment id and question id, so one broken question can be named.'],
];

const SIGNAL_LABEL = {
  widespread: `At least ${WIDESPREAD_REPORTERS} accounts today`,
  new: 'New today',
  rising: 'Rising',
};
const SIGNAL_TONE = {
  widespread: { background: 'var(--mm-danger-soft)', color: 'var(--mm-danger-text)', borderColor: 'var(--mm-error-border-soft)' },
  new: { background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', borderColor: 'var(--mm-warning)' },
  rising: { background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', borderColor: 'var(--mm-warning)' },
};

const messageOf = (error) => String(error?.message || error || '').replace(/^Firebase:\s*/i, '').trim() || 'That did not work.';

const where = (issue) => [
  issue.family !== 'none' ? `family ${issue.family}` : '',
  issue.questionType !== 'none' ? `module ${issue.questionType}` : '',
  issue.questionId ? `question ${issue.questionId}` : '',
  issue.assignmentId ? `assignment ${issue.assignmentId}` : '',
].filter(Boolean).join(' · ') || 'not in a question';

export default function PlatformHealth() {
  const [mode, setMode] = useState(null);
  const [choice, setChoice] = useState('off');
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmPurge, setConfirmPurge] = useState(false);

  const load = useCallback(async () => {
    setBusy('loading');
    setError('');
    try {
      const [status, loaded] = await Promise.all([readCrashReportingStatus(), readPlatformHealthDays()]);
      setMode(status.mode || 'off');
      setChoice(status.mode || 'off');
      setDays(loaded);
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = utcDayKey(Date.now());
  const summary = useMemo(() => summarizePlatformHealth({ days, today }), [days, today]);

  const save = async () => {
    setBusy('saving');
    setError('');
    setNotice('');
    try {
      const result = await setCrashReportingMode(choice);
      setMode(result.mode);
      setNotice(result.mode === 'off'
        ? 'Reporting is off. Devices stop sending within a day; anything sent before then is refused by the server now.'
        : 'Reporting is on. A device starts sending the next time it records a failure.');
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy('');
    }
  };

  const purge = async () => {
    setBusy('purging');
    setError('');
    setNotice('');
    try {
      const result = await purgeCrashReports();
      setMode(result.mode);
      setChoice(result.mode);
      setDays([]);
      setConfirmPurge(false);
      setNotice(result.removed?.complete === false
        ? 'Reporting is off, and nothing new is being collected. There was more to delete than one pass could finish: press “Turn off and delete collected counts” again.'
        : 'Reporting is off and every collected count has been deleted.');
    } catch (purgeError) {
      setError(messageOf(purgeError));
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <section style={panel} aria-labelledby="platform-health-today">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 id="platform-health-today" style={{ margin: 0, fontSize: 'calc(19 * var(--mm-px))' }}>Failures, last {HEALTH_DAYS_SHOWN} days</h2>
          <button type="button" style={quiet} onClick={load} disabled={busy !== ''}>{busy === 'loading' ? 'Loading…' : 'Refresh'}</button>
        </div>
        <p style={{ ...muted, margin: '6px 0 12px' }}>Days are UTC. Today is {today}.</p>

        {summary.alerts.length ? (
          <div role="alert" style={{ border: '1px solid var(--mm-error-border-soft)', background: 'var(--mm-danger-soft)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <strong style={{ color: 'var(--mm-danger-text)' }}>{summary.alerts.length === 1 ? '1 failure needs a look today' : `${summary.alerts.length} failures need a look today`}</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 'calc(13.5 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>
              {summary.alerts.slice(0, 5).map((issue) => (
                <li key={issue.key}>{issue.signals.map((signal) => SIGNAL_LABEL[signal]).join(', ')}: {issue.kind}, {where(issue)} ({issue.today} today)</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!summary.issues.length && busy === '' ? (
          <p style={muted}>{mode === 'off' ? 'Reporting is off, so there is nothing here.' : 'No failures have been reported.'}</p>
        ) : null}

        {summary.issues.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  {['Failure', 'Where', 'Today', 'Accounts today', `${HEALTH_DAYS_SHOWN} days`, 'Builds'].map((heading) => (
                    <th key={heading} scope="col" style={{ ...cell, textAlign: 'left', fontWeight: 800, color: 'var(--mm-text)' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.issues.slice(0, 60).map((issue) => (
                  <tr key={issue.key}>
                    <td style={cell}>
                      <strong>{issue.kind}</strong>
                      {issue.signals.map((signal) => (
                        <span key={signal} style={{ ...SIGNAL_TONE[signal], display: 'inline-block', marginLeft: 6, padding: '1px 8px', borderRadius: 999, border: '1px solid', fontSize: 'calc(11.5 * var(--mm-px))', fontWeight: 800 }}>{SIGNAL_LABEL[signal]}</span>
                      ))}
                      <div style={{ ...muted, fontFamily: 'ui-monospace, monospace', fontSize: 'calc(12 * var(--mm-px))' }}>{issue.signature}</div>
                    </td>
                    <td style={cell}>{where(issue)}<div style={muted}>{issue.screens.join(', ')} · {issue.roles.join(', ')}</div></td>
                    <td style={{ ...cell, fontWeight: 800 }}>{issue.today}</td>
                    <td style={cell}>{issue.reportersToday ? `at least ${issue.reportersToday}` : '—'}</td>
                    <td style={cell}>{issue.total}</td>
                    <td style={{ ...cell, fontFamily: 'ui-monospace, monospace', fontSize: 'calc(12 * var(--mm-px))' }}>{issue.builds.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {summary.totals.some((day) => day.overflow > 0) ? (
          <p style={{ ...muted, marginTop: 10 }}>Some days held more distinct failures than one day&rsquo;s record keeps ({CRASH_REPORT_LIMITS.bucketsPerDay}); the extra reports were counted but not itemised.</p>
        ) : null}
      </section>
      <section style={panel} aria-labelledby="platform-health-reporting">
        <h2 id="platform-health-reporting" style={{ margin: 0, fontSize: 'calc(19 * var(--mm-px))' }}>Crash reporting: {mode === null ? '…' : MODES.find(([id]) => id === mode)?.[1] || 'Off'}</h2>
        <p style={{ ...muted, margin: '6px 0 0' }}>
          When it is on, a device that records a failure sends a <em>count</em> of it. It never sends who the student is, their
          class, what they typed, the question&rsquo;s text, a stack trace or the time of day.
        </p>
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--mm-text)', minHeight: 32 }}>Change what devices send</summary>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 800, marginBottom: 6 }}>What devices send</legend>
          {MODES.map(([id, label, detail]) => (
            <label key={id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', cursor: 'pointer' }}>
              <input type="radio" name="crash-reporting-mode" value={id} checked={choice === id} onChange={() => setChoice(id)} disabled={busy !== ''} style={{ marginTop: 4 }} />
              <span><strong>{label}</strong><br /><span style={muted}>{detail}</span></span>
            </label>
          ))}
        </fieldset>
        <details style={{ ...muted, margin: '10px 0 0' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--mm-text)' }}>Exactly what is sent, who can read it, and how long it is kept</summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>The build (a short commit id), the kind of failure, which boundary caught it, and whether the account is a student or a teacher.</li>
            <li>The screen as a template: <code>/assignments/:id/:id/:id</code>. Ids in the address are replaced before sending.</li>
            <li>The question family id and module name. In &ldquo;Counts by question&rdquo;, also the assignment id and question id.</li>
            <li>An error signature rebuilt from a fixed list of technical words. Any other word becomes <code>_</code> and any number <code>#</code>, so a typed answer or a name cannot be in it.</li>
            <li>Stored as one document of counts per day, kept {CRASH_REPORT_LIMITS.dailyRetentionDays} days, readable only by the root administrator. Teachers and students cannot read it.</li>
            <li>To limit how often one account can report, the server keeps a per-day record named by a hash of the account. Nobody can read it and it is deleted after {CRASH_REPORT_LIMITS.reporterRetentionDays} days.</li>
            <li>Each account can send at most {CRASH_REPORT_LIMITS.callsPerReporterPerDay} reports a day. No student screen reads anything for this.</li>
          </ul>
        </details>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" style={primary} onClick={save} disabled={busy !== '' || mode === null || choice === mode}>{busy === 'saving' ? 'Saving…' : 'Save'}</button>
          {confirmPurge ? (
            <>
              <button type="button" style={danger} onClick={purge} disabled={busy !== ''}>{busy === 'purging' ? 'Deleting…' : 'Yes, turn off and delete everything'}</button>
              <button type="button" style={quiet} onClick={() => setConfirmPurge(false)} disabled={busy !== ''}>Cancel</button>
            </>
          ) : (
            <button type="button" style={danger} onClick={() => setConfirmPurge(true)} disabled={busy !== '' || mode === null}>Turn off and delete collected counts</button>
          )}
        </div>
        </details>
        {notice ? <p role="status" style={{ ...muted, margin: '10px 0 0', color: 'var(--mm-success-text)' }}>{notice}</p> : null}
        {error ? <p role="alert" style={{ ...muted, margin: '10px 0 0', color: 'var(--mm-error-text)' }}>{error}</p> : null}
      </section>

    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeAuthError, teacherAdmin } from '../../auth/authService';
import { getMathMasterBuildInfo } from '../../platform/runtime/buildInfo.js';
import {
  GATE_LABELS,
  describeMigrationStage,
  firstFullDistrictSchoolDay,
  stripReportRows,
} from '../../platform/admin/studentControlsMigration.js';
import {
  OVERRIDE_MIGRATION_STAGE,
  RESTORE_CONFIRMATION,
  RETIRE_CONFIRMATION,
  STRIP_CONFIRMATION,
} from '../../../functions/shared/overrideRetirementGate.mjs';

/*
 * STUDENTS' OWN ASSIGNMENT CONTROLS — THE STAGED MOVE, END TO END
 * (docs/architecture/student-assignment-overrides.md §11).
 *
 *   Mirrored → Backfill incomplete → waiting for the safety period
 *   → Ready to retire → Retired → strip (dry run, then the strip) → restore.
 *
 * Every step is its own deliberate action, and the server decides whether it
 * may happen (functions/shared/overrideRetirementGate.mjs,
 * studentAssignmentOverrideStore.mjs): this card never retires, strips or
 * restores on its own, and never combines a dry run with the real thing.
 * Retiring needs every gate passing, a typed confirmation and the
 * administrator's attestation of the one thing the server cannot see (a
 * holiday). A strip needs a typed confirmation and a finished dry run.
 */

const card = { border: '1px solid var(--mm-border)', borderRadius: 12, padding: '20px 22px', marginBottom: 20, textAlign: 'left', background: 'var(--mm-surface)' };
const section = { marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--mm-divider)' };
const primary = { minHeight: 42, padding: '0 16px', border: 0, borderRadius: 9, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 800, cursor: 'pointer' };
const quiet = { minHeight: 38, padding: '0 13px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 700, cursor: 'pointer' };
const danger = { ...quiet, color: 'var(--mm-danger-text)', borderColor: 'var(--mm-error-border-soft)', background: 'var(--mm-danger-soft)' };
const input = { minHeight: 40, padding: '0 12px', border: '1px solid var(--mm-control-border)', borderRadius: 8, fontSize: 14, background: 'var(--mm-input-bg)', color: 'var(--mm-input-text)', minWidth: 0, boxSizing: 'border-box' };
const muted = { color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.55 };
const dateTime = (ms) => (Number.isFinite(Number(ms)) && ms !== null ? new Date(Number(ms)).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const dateOnly = (key) => (key ? new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : '—');

const STEP_TONE = {
  done: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', borderColor: 'var(--mm-success-border)' },
  current: { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', borderColor: 'var(--mm-primary-border)' },
  upcoming: { background: 'var(--mm-surface)', color: 'var(--mm-text-muted)', borderColor: 'var(--mm-border)' },
};

const ReportTable = ({ rows, label }) => (
  <table aria-label={label} style={{ borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
    <tbody>
      {rows.map(([name, value]) => (
        <tr key={name}>
          <td style={{ padding: '3px 16px 3px 0', color: 'var(--mm-text)' }}>{name}</td>
          <td style={{ padding: '3px 0', fontWeight: 900, color: 'var(--mm-text-strong)' }}>{value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const Failures = ({ report }) => ((report?.failures || []).length ? (
  <ul style={{ margin: '6px 0 0', color: 'var(--mm-error-text)', fontSize: 13 }}>
    {report.failures.slice(0, 10).map((failure, index) => <li key={`${failure.assignmentId}-${index}`}>{failure.assignmentId} — {failure.reason}</li>)}
  </ul>
) : null);

const readServedBuild = async () => {
  try {
    const response = await fetch(`/mathmaster-build.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json();
    return { gitSha: manifest?.gitSha || null, builtAt: manifest?.builtAt || null };
  } catch {
    return null;
  }
};

export default function StudentControlsMigrationCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [backfillReport, setBackfillReport] = useState(null);
  const [stripReport, setStripReport] = useState(null);
  const [restoreReport, setRestoreReport] = useState(null);
  const [attestHosting, setAttestHosting] = useState(false);
  const [attestSchoolDay, setAttestSchoolDay] = useState(false);
  const [retireText, setRetireText] = useState('');
  const [stripText, setStripText] = useState('');
  const [restoreText, setRestoreText] = useState('');
  const [confirmMirror, setConfirmMirror] = useState(false);

  const run = async (key, action, describe) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (describe) setNotice(typeof describe === 'function' ? describe(result) : describe);
      return result;
    } catch (caught) {
      setError(describeAuthError(caught) || caught?.message || 'That did not work. Nothing was changed.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const refresh = useCallback(async () => {
    try {
      setStatus(await teacherAdmin.readAssignmentOverrideStorage());
    } catch (caught) {
      setError(describeAuthError(caught) || caught?.message || 'The migration status could not be read.');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const readiness = status?.readiness || null;
  const stage = useMemo(() => describeMigrationStage(readiness), [readiness]);
  const migration = status?.migration || {};
  const cutover = migration.cutover || null;
  const retired = status?.sharedRetired === true;
  const districtDay = firstFullDistrictSchoolDay(readiness?.confirmedAtMs);
  const gateFor = (id) => (readiness?.gates || []).find((gate) => gate.id === id) || null;
  const lastBackfill = migration.backfill?.lastCompletedPass || null;
  const lastDryStrip = migration.strip?.lastCompletedDryRunPass || null;
  const retiredAtMs = Number(migration.retirement?.retiredAtMs) || 0;
  const dryStripReady = Boolean(lastDryStrip && Number(lastDryStrip.failureCount) === 0 && (Number(lastDryStrip.completedAtMs) || 0) >= retiredAtMs);
  const hostingUnverified = readiness?.hosting?.state === 'unverified';

  const runPass = (key, { mode, dryRun, confirm = '' }, setReport, describe) => run(key, async () => {
    const report = await teacherAdmin.runStudentControlsMigration({ mode, dryRun, confirm, onPage: setReport });
    setReport(report);
    await refresh();
    return report;
  }, describe);

  return (
    <section data-student-controls-migration={stage.stage} style={card}>
      <h3 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>Students&apos; own assignment controls</h3>
      <p style={{ ...muted, margin: '8px 0 12px' }}>
        A student&apos;s extension, excusal, reopen and extra DOL attempts used to ride on the assignment itself, where every
        classmate&apos;s device received them. They now live in a private record only that student and their teacher can open.
        Each step below is separate, and MathMaster refuses a step whose conditions are not met.
      </p>

      <ol aria-label="Migration stages" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {stage.steps.map((step) => (
          <li key={step.id} data-migration-step={step.id} data-step-state={step.state} style={{ padding: '5px 10px', borderRadius: 999, border: '1px solid', fontSize: 12, fontWeight: 800, ...STEP_TONE[step.state] }}>
            {step.state === 'done' ? '✓ ' : ''}{step.label}
          </li>
        ))}
      </ol>
      <p style={{ ...muted, margin: '8px 0 0' }}>{stage.steps.find((step) => step.id === stage.stage)?.summary}</p>

      {error && <div role="alert" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '1px solid var(--mm-error-border-soft)' }}>{error}</div>}
      {notice && <div role="status" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', border: '1px solid var(--mm-success-border)' }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" style={quiet} disabled={busy === 'status'} onClick={() => run('status', refresh)}>{busy === 'status' ? 'Checking…' : 'Check status'}</button>
      </div>

      {/* 1. Backfill ---------------------------------------------------------- */}
      <div style={section}>
        <h4 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>1. Copy into private records (backfill)</h4>
        <p style={{ ...muted, margin: '6px 0 10px' }}>
          Safe to run again — a second run copies nothing — and a run that stops part-way picks up where it left off.
          Retiring needs one full pass, start to finish, with no failures.
        </p>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button type="button" style={quiet} disabled={Boolean(busy)} onClick={() => runPass('backfill-dry', { mode: 'backfill', dryRun: true }, setBackfillReport, (report) => `${report.assignmentsScanned || 0} assignments checked. Nothing was written.`)}>
            {busy === 'backfill-dry' ? 'Checking…' : 'Check without changing anything'}
          </button>
          <button type="button" style={primary} disabled={Boolean(busy) || retired} onClick={() => runPass('backfill', { mode: 'backfill', dryRun: false }, setBackfillReport, (report) => `${report.recordsCreated || 0} private records created · ${report.recordsUpdated || 0} brought up to date · ${(report.failures || []).length} could not finish.`)}>
            {busy === 'backfill' ? 'Copying…' : 'Copy into private records'}
          </button>
        </div>
        {backfillReport && (
          <>
            <ReportTable label="Backfill report" rows={[
              ['Assignments checked', backfillReport.assignmentsScanned || 0],
              ['With a student’s controls on them', `${backfillReport.assignmentsWithSharedStudentData || 0} (${backfillReport.sharedStudentEntries || 0} students)`],
              [backfillReport.dryRun ? 'Private records to create' : 'Private records created', backfillReport.recordsCreated || 0],
              [backfillReport.dryRun ? 'To bring up to date' : 'Brought up to date', backfillReport.recordsUpdated || 0],
              ['Already private', backfillReport.recordsUnchanged || 0],
              ['Could not finish', (backfillReport.failures || []).length],
            ]} />
            <Failures report={backfillReport} />
          </>
        )}
        <p style={{ ...muted, margin: '8px 0 0' }}>
          Last full pass: <strong>{lastBackfill ? `finished ${dateTime(lastBackfill.completedAtMs)} · ${lastBackfill.assignmentsScanned || 0} assignments · ${lastBackfill.failureCount || 0} failures` : 'none yet'}</strong>
        </p>
      </div>

      {/* 2. Client cutover ------------------------------------------------------ */}
      <div style={section}>
        <h4 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>2. Record the release that reads private records as live</h4>
        <p style={{ ...muted, margin: '6px 0 10px' }}>
          Do this right after this release&apos;s Hosting deploy finishes. The school-day clock starts when you record it — MathMaster
          stamps the time itself, so it cannot be back-dated.
        </p>
        <p style={{ ...muted, margin: '0 0 8px' }}>
          Recorded: <strong>{cutover ? `${dateTime(cutover.confirmedAtMs)} by ${cutover.confirmedByEmail || 'an administrator'}${cutover.hostingVerified ? ' · build verified by the server' : cutover.hostingAttested ? ' · deployment attested' : ''}` : 'not yet'}</strong>
        </p>
        {hostingUnverified && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--mm-text)', marginBottom: 8 }}>
            <input type="checkbox" checked={attestHosting} onChange={(event) => setAttestHosting(event.target.checked)} />
            <span>MathMaster could not read the live build ({readiness?.hosting?.reason || 'unknown'}). I confirm this release&apos;s Hosting is deployed and live for everyone.</span>
          </label>
        )}
        <button type="button" style={quiet} disabled={Boolean(busy) || retired || (hostingUnverified && !attestHosting)} onClick={() => run('cutover', async () => {
          const result = await teacherAdmin.confirmOverrideClientCutover({
            attestHostingDeployed: attestHosting,
            clientBuild: getMathMasterBuildInfo(),
            servedBuild: await readServedBuild(),
          });
          setStatus(result);
          return result;
        }, 'The release is recorded as live. The school-day clock has started.')}>
          {busy === 'cutover' ? 'Recording…' : cutover ? 'Record it again (restarts the clock)' : 'Record this release as live'}
        </button>
      </div>

      {/* 3. The retirement gate -------------------------------------------------- */}
      <div style={section}>
        <h4 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>3. Retire the shared copy</h4>
        <ul aria-label="Retirement conditions" style={{ margin: '8px 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
          {Object.entries(GATE_LABELS).map(([id, label]) => {
            const gate = gateFor(id);
            return (
              <li key={id} data-retirement-gate={id} data-gate-ok={gate?.ok === true ? 'true' : 'false'} style={{ fontSize: 13, color: 'var(--mm-text)' }}>
                <strong style={{ color: gate?.ok ? 'var(--mm-success-text)' : 'var(--mm-warning-text)' }}>{gate?.ok ? '✓' : '○'} {label}</strong>
                {gate?.detail && <div style={muted}>{gate.detail}</div>}
              </li>
            );
          })}
        </ul>
        {districtDay && !retired && (
          <p style={{ ...muted, margin: '0 0 8px' }}>
            By the district calendar, the first full school day after the release went live is <strong>{dateOnly(districtDay.dateKey)}</strong>; retire after it ends.
          </p>
        )}
        {retired ? (
          <p style={{ ...muted, margin: 0 }}>Retired {dateTime(migration.retirement?.retiredAtMs)}{migration.retirement?.retiredByEmail ? ` by ${migration.retirement.retiredByEmail}` : ''}. Shared writers are locked and the mirror is stopped.</p>
        ) : stage.stage !== OVERRIDE_MIGRATION_STAGE.READY_TO_RETIRE ? (
          <p data-retire-unavailable style={{ ...muted, margin: 0 }}>
            Retiring is not available yet: {stage.blocking.length ? stage.blocking.map((gate) => GATE_LABELS[gate.id]?.toLowerCase()).join('; ') : 'checking the conditions'}.
            Older screens read only the shared copy, and retiring stops keeping it in step.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--mm-text)' }}>
              <input type="checkbox" checked={attestSchoolDay} onChange={(event) => setAttestSchoolDay(event.target.checked)} />
              <span>Students used this release for a full school day{districtDay ? ` (${dateOnly(districtDay.dateKey)})` : ''}. MathMaster cannot see holidays or staff days.</span>
            </label>
            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--mm-text-muted)' }}>TYPE {RETIRE_CONFIRMATION}
              <input aria-label="Retirement confirmation" value={retireText} onChange={(event) => setRetireText(event.target.value)} style={{ ...input, display: 'block', width: '100%', maxWidth: 360, marginTop: 4 }} />
            </label>
            <div>
              <button type="button" style={danger} disabled={Boolean(busy) || !attestSchoolDay || retireText.trim() !== RETIRE_CONFIRMATION} onClick={() => run('retire', async () => {
                const result = await teacherAdmin.retireSharedStudentControls({ confirmation: retireText.trim(), attestFullSchoolDay: attestSchoolDay });
                setStatus(result);
                setRetireText('');
                return result;
              }, 'The shared copy is retired. Run the strip’s dry run next.')}>
                {busy === 'retire' ? 'Retiring…' : 'Retire the shared copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Strip ---------------------------------------------------------------- */}
      <div style={section}>
        <h4 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>4. Strip the shared copies</h4>
        <p style={{ ...muted, margin: '6px 0 10px' }}>
          Removes every student&apos;s controls from the shared assignments — only after checking, assignment by assignment, that each
          student&apos;s private record says exactly the same thing, and after archiving the removed data verbatim. First the dry run;
          then, separately, the strip.
        </p>
        {!retired && <p style={{ ...muted, margin: '0 0 8px' }}>Available once the shared copy is retired.</p>}
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button type="button" style={quiet} disabled={Boolean(busy) || !retired} onClick={() => runPass('strip-dry', { mode: 'strip', dryRun: true }, setStripReport, (report) => `Dry run: ${report.assignmentsWithSharedStudentData || 0} assignments would be stripped. Nothing was changed.`)}>
            {busy === 'strip-dry' ? 'Checking…' : 'Strip dry run'}
          </button>
        </div>
        {stripReport && (
          <>
            <ReportTable label={stripReport.dryRun === false ? 'Strip report' : 'Strip dry-run report'} rows={stripReportRows(stripReport)} />
            <Failures report={stripReport} />
          </>
        )}
        {retired && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {!dryStripReady && <p style={{ ...muted, margin: 0 }}>The strip unlocks after a full dry run (since retiring) finishes with no failures.</p>}
            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--mm-text-muted)' }}>TYPE {STRIP_CONFIRMATION}
              <input aria-label="Strip confirmation" value={stripText} onChange={(event) => setStripText(event.target.value)} disabled={!dryStripReady} style={{ ...input, display: 'block', width: '100%', maxWidth: 360, marginTop: 4 }} />
            </label>
            <div>
              <button type="button" style={danger} disabled={Boolean(busy) || !dryStripReady || stripText.trim() !== STRIP_CONFIRMATION} onClick={() => runPass('strip', { mode: 'strip', dryRun: false, confirm: stripText.trim() }, setStripReport, (report) => `${report.assignmentsStripped || 0} assignments stripped · ${report.archivesWritten || 0} archives written · ${(report.failures || []).length} to run again.`).then(() => setStripText(''))}>
                {busy === 'strip' ? 'Stripping…' : 'Strip shared copies'}
              </button>
            </div>
          </div>
        )}
        {readiness?.legacyIgnore && retired && <p style={{ ...muted, margin: '10px 0 0' }}>30-day condition: {readiness.legacyIgnore.detail}</p>}
      </div>

      {/* 5. Rollback -------------------------------------------------------------- */}
      <div style={section}>
        <h4 style={{ margin: 0, color: 'var(--mm-text-strong)' }}>Rollback: keep the shared copy in step again, and restore</h4>
        <p style={{ ...muted, margin: '6px 0 10px' }}>
          Turning retirement off makes every writer mirror again. Restore then writes each student&apos;s private record back onto the
          shared assignments, so an older screen reads the same controls. Private records stay the authority.
        </p>
        {retired && (
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--mm-text)' }}>
              <input type="checkbox" checked={confirmMirror} onChange={(event) => setConfirmMirror(event.target.checked)} />
              <span>Turn retirement off (rollback)</span>
            </label>
            <button type="button" style={quiet} disabled={Boolean(busy) || !confirmMirror} onClick={() => run('mirror', async () => {
              const result = await teacherAdmin.mirrorSharedStudentControls();
              setStatus(result);
              setConfirmMirror(false);
              return result;
            }, 'The shared copy is kept in step again. Run the restore to write it back.')}>
              {busy === 'mirror' ? 'Saving…' : 'Keep the shared copy in step again'}
            </button>
          </div>
        )}
        {!retired && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <button type="button" style={quiet} disabled={Boolean(busy)} onClick={() => runPass('restore-dry', { mode: 'restore', dryRun: true }, setRestoreReport, (report) => `Dry run: ${report.sharedWritesRestored || 0} shared fields would be written back. Nothing was changed.`)}>
                {busy === 'restore-dry' ? 'Checking…' : 'Restore dry run'}
              </button>
            </div>
            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--mm-text-muted)' }}>TYPE {RESTORE_CONFIRMATION}
              <input aria-label="Restore confirmation" value={restoreText} onChange={(event) => setRestoreText(event.target.value)} style={{ ...input, display: 'block', width: '100%', maxWidth: 360, marginTop: 4 }} />
            </label>
            <div>
              <button type="button" style={quiet} disabled={Boolean(busy) || restoreText.trim() !== RESTORE_CONFIRMATION} onClick={() => runPass('restore', { mode: 'restore', dryRun: false, confirm: restoreText.trim() }, setRestoreReport, (report) => `${report.assignmentsRestored || 0} assignments restored · ${report.sharedWritesRestored || 0} shared fields written back.`).then(() => setRestoreText(''))}>
                {busy === 'restore' ? 'Restoring…' : 'Restore shared copies'}
              </button>
            </div>
            {restoreReport && (
              <ReportTable label="Restore report" rows={[
                ['Assignments scanned', restoreReport.assignmentsScanned || 0],
                [restoreReport.dryRun ? 'Assignments that would be restored' : 'Assignments restored', restoreReport.assignmentsRestored || 0],
                [restoreReport.dryRun ? 'Shared fields that would be written' : 'Shared fields written', restoreReport.sharedWritesRestored || 0],
                ['Failures', (restoreReport.failures || []).length],
              ]} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

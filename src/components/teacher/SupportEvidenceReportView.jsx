import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase.js';
import { supportLabel } from '../../../functions/shared/supportCatalog.mjs';
import { PROVENANCE_LABEL } from '../../../functions/shared/supportEvidenceModel.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { normalizeGradingPeriodSettings } from '../../platform/student/gradingPeriods.js';
import { fetchStudentSupportHistory } from '../../platform/teacher/studentSupportStore.js';
import { loadTeacherGradeTransferState } from '../../platform/gradeTransfer/gradeTransferStore.js';
import { fetchStudentGradeRecord, loadStudentSupportRecords } from '../../platform/supportEvidence/supportEvidenceStore.js';
import {
  buildSupportEvidenceReport, selectReportAssignments, supportHeadline, supportReportCsv, supportReportFileName, supportReportJson,
} from '../../platform/supportEvidence/supportEvidenceReport.js';
import { SupportClassificationTag } from './SupportProfileEditor.jsx';
import { acceptStudentName, formatStudentName } from '../../platform/studentName.js';
import './teacherWorkspace.css';
import './supportEvidence.css';

/*
 * THE STUDENT SUPPORT EVIDENCE REPORT — one student, one class, one period.
 *
 * Summary first; every assignment, the timeline and the service log below it,
 * folded on screen and fully expanded when printed. Every fact shows how it is
 * known (recorded, documented, derived, configured, not recorded). The model
 * (supportEvidenceReport.js) does the work; this renders it and loads its
 * inputs through the same Firestore rules every teacher screen uses — the
 * report is authorized by the database, not by hiding a button.
 */

const SCHOOL_TIME_ZONE = 'America/Chicago';
const when = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const day = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const Prov = ({ level }) => <span className="se-prov" data-level={level}>{PROVENANCE_LABEL[level] || level}</span>;

const download = (text, fileName, type) => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function SupportCell({ support }) {
  const parts = [];
  if (support.configured) parts.push('configured');
  if (support.available) parts.push(`available (${support.available})`);
  if (support.provided) parts.push(`provided (${support.provided})`);
  if (support.used) parts.push(`used ${support.used}×`);
  if (support.documented) parts.push(`staff-documented ${support.documented}×`);
  if (support.notApplicable) parts.push('not applicable here');
  if (support.unavailable) parts.push('could not be provided (implementation gap)');
  const measurableUse = support.measurable.includes('used');
  const note = !support.used && !support.documented && !support.provided && !support.available && !support.notApplicable && !support.unavailable
    ? 'Not recorded'
    // Not using an on-demand support is the student's choice, not a gap.
    : (measurableUse && support.available && !support.used ? 'not used (optional)' : '');
  return <span>{parts.join(' · ') || '—'}{note ? <em className="tw-muted"> · {note}</em> : null}</span>;
}

function AssignmentCard({ row, expanded }) {
  return (
    <details className="se-report__card" open={expanded || undefined} data-report-assignment={row.assignmentId}>
      <summary>
        <strong>{row.title}</strong>
        {' · '}{row.statusLabel}{row.completedLate ? ' (after due)' : ''}
        {row.score !== null ? ` · ${row.score}%${row.status === 'completed' || row.status === 'excused' ? '' : ' so far'}` : ''}
        {' '}<span className="se-tag" data-kind={row.condition.value === 'modified' ? 'modification' : 'accommodation'}>{row.condition.value === 'modified' ? 'MOD' : 'Standard'}</span>
      </summary>
      <dl className="se-report__facts">
        <div><dt>Class due</dt><dd>{when(row.classDueAtMs)}</dd></div>
        <div><dt>Individualized due</dt><dd>{row.individualizedDue ? <>{when(row.individualizedDue.dueAtMs)} <Prov level="derived" /></> : 'None'}</dd></div>
        <div><dt>Final cutoff for this student</dt><dd>{when(row.effectiveFinalAtMs)}{row.attendanceFinalAtMs ? ' (attendance extension)' : ''}</dd></div>
        <div><dt>Last work</dt><dd>{Number.isFinite(row.attempts.lastAtMs) ? when(row.attempts.lastAtMs) : 'Time not recorded'} · {row.attempts.total} attempt{row.attempts.total === 1 ? '' : 's'}</dd></div>
        <div><dt>Active time</dt><dd>{row.engagement.activeMinutes !== null ? `${row.engagement.activeMinutes} min` : 'Not recorded'} <Prov level={row.engagement.provenance} /></dd></div>
        <div><dt>Condition</dt><dd>{row.condition.value === 'modified' ? `Modified: ${row.condition.modifications.map(supportLabel).join(', ') || 'recorded as modified'}` : 'Standard (grade-level)'} <Prov level={row.condition.provenance} /></dd></div>
        {row.workload && (
          <div data-report-workload>
            <dt>Fewer items, same rigor</dt>
            <dd>
              {row.workload.recorded?.eventType === 'unavailable'
                ? `Could not be applied${row.workload.recorded.reason ? ` (${row.workload.recorded.reason})` : ''}`
                : (() => {
                  const fact = row.workload.recorded || row.workload.current;
                  if (!fact) return 'Not recorded';
                  const actual = Number(fact.actualPercentTenths || 0) / 10;
                  return `${fact.assignedCount} of ${fact.originalCount} items assigned · ${Number.isInteger(actual) ? actual : actual.toFixed(1)}% fewer (target ${fact.targetPercent}%)`;
                })()}
              {' '}<Prov level={row.workload.provenance} />
              {row.workload.recorded && (row.workload.verified ? ' · matches MathMaster\'s projection' : ' · differs from today\'s projection (content or answers changed since)')}
            </dd>
          </div>
        )}
        <div><dt>Profile governing this work</dt><dd>{row.governing.revision !== null ? `Revision ${row.governing.revision}${row.governing.sourceLabel ? ` · ${row.governing.sourceLabel}` : ''}` : 'None recorded'} <Prov level={row.governing.provenance} /></dd></div>
        {!row.assignedToClass && <div><dt>Assignment</dt><dd>Work recorded under an earlier class</dd></div>}
      </dl>
      {row.condition.note && <p className="se-report__note">{row.condition.note}</p>}
      {row.workload?.varianceText?.length > 0 && <p className="se-report__note">{row.workload.varianceText.join(' ')}</p>}
      {row.engagement.note && <p className="se-report__note">{row.engagement.note}</p>}
      <div className="se-scroll-x" style={{ marginTop: 8 }}>
        <table className="se-table">
          <thead><tr><th>MathMaster grade contribution</th><th>Grade</th><th>Export status</th></tr></thead>
          <tbody>
            {row.gradeImpact.items.map((item) => (
              <tr key={item.key}><td>{item.label}</td><td>{item.excused ? 'Excused' : item.grade ?? '—'}</td><td>{item.exportStatus.label}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="se-report__note">{row.gradeImpact.weightNote}</p>
      </div>
      {row.supports.length > 0 && (
        <div className="se-scroll-x">
          <table className="se-table">
            <thead><tr><th>Support</th><th>Type</th><th>Record in MathMaster</th></tr></thead>
            <tbody>
              {row.supports.map((support) => (
                <tr key={support.supportId}>
                  <td>{support.label}{support.affectsIndependence ? ' (affects independence evidence)' : ''}</td>
                  <td><SupportClassificationTag supportId={support.supportId} classification={support.classification} /></td>
                  <td><SupportCell support={support} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {row.staffEvents.length > 0 && (
        <ul className="se-list" style={{ marginTop: 8 }}>
          {row.staffEvents.map((event) => (
            <li key={event.id}>
              <span className="se-list__title">{supportLabel(event.supportId)} — documented {when(event.occurredAtMs)}</span>
              <span className="se-list__meta">{event.actorEmail}{event.note ? ` · ${event.note}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {row.gaps.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="se-report__note">
          {row.gaps.map((gap) => <li key={`${gap.code}-${gap.supportId || ''}`}>{gap.message}</li>)}
        </ul>
      )}
    </details>
  );
}

export default function SupportEvidenceReportView({
  open = false,
  student = null,
  studentName = '',
  classRecord = null,
  assignments = [],
  gradingPeriodSettings = null,
  teacherEmail = '',
  onClose,
}) {
  const settings = useMemo(() => normalizeGradingPeriodSettings(gradingPeriodSettings || {}), [gradingPeriodSettings]);
  const [selection, setSelection] = useState({ gradingPeriodId: '', fromDateKey: '', toDateKey: '' });
  const [state, setState] = useState({ loading: false, error: '', report: null });
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    setSelection({ gradingPeriodId: settings.currentPeriodId || 'all', fromDateKey: '', toDateKey: '' });
    setState({ loading: false, error: '', report: null });
    closeRef.current?.focus();
  }, [open, student?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current?.(); } };
    document.addEventListener('keydown', onKey);
    const afterPrint = () => setExpanded(false);
    window.addEventListener('afterprint', afterPrint);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('afterprint', afterPrint); };
  }, [open]);

  if (!open || !student?.id) return null;

  const periodLabel = selection.gradingPeriodId === 'all'
    ? 'All marking periods'
    : settings.periods.find((period) => period.id === selection.gradingPeriodId)?.label || selection.gradingPeriodId;

  const generate = async () => {
    setState({ loading: true, error: '', report: null });
    try {
      const record = await fetchStudentGradeRecord({ db, studentId: student.id });
      const fullStudent = { ...record, ...student, profile: record?.profile || student.profile || {} };
      // Load the evidence window the chosen assignments could need.
      const { included } = selectReportAssignments({ assignments, student: fullStudent, gradingPeriodSettings, selection });
      const anchors = included.map(({ assignment }) => Date.parse(assignment.releaseAt || assignment.dueAt || assignment.dueDate || '')).filter(Number.isFinite);
      const fromMs = selection.fromDateKey ? Date.parse(`${selection.fromDateKey}T00:00:00Z`) - 86400000 : (anchors.length ? Math.min(...anchors) - 30 * 86400000 : Date.now() - 120 * 86400000);
      const toMs = selection.toDateKey ? Date.parse(`${selection.toDateKey}T23:59:59Z`) + 86400000 : Date.now();
      const [records, history, exportState] = await Promise.all([
        loadStudentSupportRecords({
          db, studentId: student.id, fromMs, toMs,
          fromDateKey: zonedDateKey(fromMs, SCHOOL_TIME_ZONE), toDateKey: zonedDateKey(toMs, SCHOOL_TIME_ZONE),
        }),
        fetchStudentSupportHistory({ db, teacherEmail, studentId: student.id, supportLimit: 300, sessionLimit: 1 }).catch(() => ({ events: [] })),
        fullStudent.classId
          ? loadTeacherGradeTransferState({ classIds: [fullStudent.classId] }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const report = buildSupportEvidenceReport({
        student: fullStudent,
        studentName,
        classRecord,
        assignments,
        gradingPeriodSettings,
        selection: { ...selection, gradingPeriodLabel: periodLabel },
        revisions: records.revisions,
        evidence: records.evidence,
        serviceLog: records.serviceLog,
        engagement: records.engagement,
        supportSignals: history.events || [],
        exportSnapshots: exportState ? exportState.snapshots : null,
        generatedByEmail: teacherEmail,
      });
      setState({ loading: false, error: '', report });
    } catch (error) {
      setState({ loading: false, error: error?.message || 'The report could not be generated.', report: null });
    }
  };

  const printReport = () => {
    setExpanded(true);
    setTimeout(() => window.print(), 150);
  };

  const { report } = state;
  return (
    <div className="se-report-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <article className="se-report" role="dialog" aria-modal="true" aria-labelledby="support-report-title" data-support-report={student.id}>
        <header className="tw-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 id="support-report-title">Student Support Evidence Report</h1>
            <div className="tw-small tw-muted">
              {acceptStudentName(studentName, student) || formatStudentName(student, { lastFirst: false })} · ID {student.id} · {classRecord?.name || classRecord?.period || 'No class'} · {report ? `${report.meta.gradingPeriodLabel} · ${report.meta.fromDateKey} to ${report.meta.toDateKey}` : periodLabel}
            </div>
            {report && <div className="tw-small tw-muted">Generated {when(report.meta.generatedAtMs)}{report.meta.generatedByEmail ? ` by ${report.meta.generatedByEmail}` : ''} · a factual summary of MathMaster records, not a compliance determination.</div>}
          </div>
          <button ref={closeRef} type="button" className="tw-btn tw-btn--sm" data-screen-only onClick={() => onClose?.()}>Close</button>
        </header>

        <div className="se-report__controls" data-screen-only>
          <label className="se-field">
            <span>Marking period</span>
            <select className="tw-select" value={selection.gradingPeriodId} onChange={(event) => setSelection((current) => ({ ...current, gradingPeriodId: event.target.value }))}>
              {settings.periods.map((period) => <option key={period.id} value={period.id}>{period.label}{period.id === settings.currentPeriodId ? ' (current)' : ''}</option>)}
              <option value="all">All marking periods</option>
            </select>
          </label>
          <label className="se-field">
            <span>From (optional)</span>
            <input className="tw-input" type="date" value={selection.fromDateKey} onChange={(event) => setSelection((current) => ({ ...current, fromDateKey: event.target.value }))} />
          </label>
          <label className="se-field">
            <span>To (optional)</span>
            <input className="tw-input" type="date" value={selection.toDateKey} onChange={(event) => setSelection((current) => ({ ...current, toDateKey: event.target.value }))} />
          </label>
          <button type="button" className="tw-btn tw-btn--primary" disabled={state.loading} onClick={generate}>{state.loading ? 'Generating…' : report ? 'Regenerate' : 'Generate report'}</button>
          {report && <button type="button" className="tw-btn" onClick={printReport}>Print / Save PDF</button>}
          {report && <button type="button" className="tw-btn" onClick={() => download(supportReportCsv(report), supportReportFileName(report, 'csv'), 'text/csv')}>CSV</button>}
          {report && <button type="button" className="tw-btn" onClick={() => download(supportReportJson(report), supportReportFileName(report, 'json'), 'application/json')}>JSON</button>}
        </div>
        {state.error && <div className="tw-notice" data-tone="danger" role="alert">{state.error}</div>}
        {!report && !state.loading && <div className="tw-notice">Choose the marking period (and dates, if needed), then generate the report.</div>}

        {report && (
          <>
            <section aria-labelledby="report-profile">
              <h2 id="report-profile">1. Student support profile</h2>
              {report.profile.current ? (
                <div className="se-stack" style={{ gap: 8 }}>
                  <div className="tw-small">
                    {report.profile.status === 'unversioned' ? 'Recorded before versioning (no dates or source)' : `Revision ${report.profile.current.revision} · effective ${report.profile.current.effectiveStart}${report.profile.current.effectiveEnd ? ` to ${report.profile.current.effectiveEnd}` : ''} · ${report.profile.current.sourceLabel || ''}`}
                    {report.profile.current.recordedAtMs ? ` · recorded ${day(report.profile.current.recordedAtMs)}${report.profile.current.recordedBy ? ` by ${report.profile.current.recordedBy}` : ''}` : ''}
                    {' '}<Prov level={report.profile.current.provenance} />
                  </div>
                  <div className="tw-small"><strong>Inclusion / support status:</strong> {report.profile.current.inclusionStatus ? 'Yes' : 'No'}</div>
                  <div className="tw-small"><strong>Accommodations:</strong> {report.profile.current.accommodations.map((entry) => `${entry.label}${entry.detail ? ` (${entry.detail})` : ''}`).join('; ') || 'None'}</div>
                  <div className="tw-small"><strong>Modifications:</strong> {report.profile.current.modifications.length ? report.profile.current.modifications.map((entry) => entry.label).join('; ') : 'None — grade-level expectations'}</div>
                  <div className="tw-small"><strong>Service expectations:</strong> {report.profile.current.serviceExpectations.map((row) => `${row.label}: ${row.minutesPerWeek} min/week`).join('; ') || 'None recorded'}</div>
                  {report.profile.revisionsInPeriod.length > 1 && (
                    <div className="tw-small"><strong>Revisions in effect during the period:</strong> {report.profile.revisionsInPeriod.map((revision) => `${revision.legacySnapshot ? 'pre-versioning snapshot' : `revision ${revision.revision}`} (from ${revision.effectiveStart || 'undated'})`).join(', ')}</div>
                  )}
                </div>
              ) : <div className="tw-small">No support profile is recorded in MathMaster for this period.</div>}
              {report.profile.warnings.map((warning) => <div key={`${warning.code}-${warning.message}`} className="tw-notice" data-tone="warning" style={{ marginTop: 6 }}>{warning.message}</div>)}
            </section>

            <section aria-labelledby="report-summary">
              <h2 id="report-summary">2. Executive evidence summary</h2>
              <div className="se-report__tiles">
                <div className="se-report__tile"><strong>{report.summary.assignmentsAssigned}</strong><span>assignments given</span></div>
                <div className="se-report__tile"><strong>{report.summary.completed}</strong><span>completed{report.summary.completedAfterDue ? ` (${report.summary.completedAfterDue} after due)` : ''}</span></div>
                <div className="se-report__tile"><strong>{report.summary.inProgress + report.summary.notStarted}</strong><span>in progress / not started</span></div>
                <div className="se-report__tile"><strong>{report.summary.missing + report.summary.closedIncomplete}</strong><span>missing / closed incomplete</span></div>
                <div className="se-report__tile"><strong>{report.summary.standardCount} / {report.summary.modifiedCount}</strong><span>Standard / Modified</span></div>
                <div className="se-report__tile"><strong>{report.summary.staffRecords}</strong><span>staff support records</span></div>
                <div className="se-report__tile"><strong>{report.summary.serviceMinutesRecorded} min</strong><span>service time recorded</span></div>
                <div className="se-report__tile"><strong>{report.summary.activeMinutesRecorded} min</strong><span>server-timed active time</span></div>
              </div>
              <p className="se-report__note" style={{ marginTop: 8 }}>
                Performance (MathMaster grade contributions, completed work):
                {' '}Standard {report.summary.performance.standard.average ?? '—'}{report.summary.performance.standard.average !== null ? '%' : ''} over {report.summary.performance.standard.count}
                {' · '}Modified {report.summary.performance.modified.average ?? '—'}{report.summary.performance.modified.average !== null ? '%' : ''} over {report.summary.performance.modified.count}.
                {' '}{report.summary.performance.note}
              </p>
              {report.summary.supports.length > 0 && (
                <div className="se-scroll-x">
                  <table className="se-table">
                    <thead><tr><th>Support</th><th>Type</th><th>Configured</th><th>Made available / provided</th><th>Used (optional)</th><th>Not applicable · could not be provided</th><th>Staff records</th></tr></thead>
                    <tbody>
                      {report.summary.supports.map((support) => (
                        <tr key={support.supportId} data-report-support={support.supportId}>
                          <td>{support.label}</td>
                          <td><SupportClassificationTag supportId={support.supportId} classification={support.classification} /></td>
                          <td>{support.configured ? 'Yes' : 'No'}</td>
                          <td>{supportHeadline(support)}</td>
                          <td>{support.tracksUse ? `${support.assignmentsUsed} assignment${support.assignmentsUsed === 1 ? '' : 's'} · ${support.uses} use${support.uses === 1 ? '' : 's'}` : 'n/a'}</td>
                          <td>{`${support.assignmentsNotApplicable || 0} · ${support.assignmentsUnavailable || 0}`}</td>
                          <td>{support.staffRecords}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {report.summary.gaps.length > 0 && (
                <>
                  <h3 style={{ marginTop: 10 }}>Evidence gaps (records, not findings)</h3>
                  <ul className="se-report__note" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{report.summary.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
                </>
              )}
            </section>

            <section aria-labelledby="report-assignments">
              <div className="tw-row" style={{ justifyContent: 'space-between' }}>
                <h2 id="report-assignments" style={{ flex: '1 1 auto' }}>3. Assignment evidence ({report.assignments.length})</h2>
                <button type="button" className="tw-btn tw-btn--sm" data-screen-only onClick={() => setExpanded((current) => !current)}>{expanded ? 'Collapse all' : 'Expand all'}</button>
              </div>
              <div className="se-stack" style={{ gap: 8 }}>
                {report.assignments.length ? report.assignments.map((row) => <AssignmentCard key={row.assignmentId} row={row} expanded={expanded} />)
                  : <div className="tw-small">No assignments were given to this student in this selection.</div>}
              </div>
            </section>

            <section aria-labelledby="report-timeline">
              <h2 id="report-timeline">4. Support timeline</h2>
              {report.timeline.length ? (
                <div className="se-scroll-x">
                  <table className="se-table">
                    <thead><tr><th>When</th><th>What</th><th>Details</th><th>How known</th></tr></thead>
                    <tbody>
                      {report.timeline.map((entry, index) => (
                        <tr key={`${entry.atMs}-${index}`} style={entry.withdrawn ? { opacity: 0.7 } : undefined}>
                          <td>{when(entry.atMs)}</td>
                          <td>{entry.label}</td>
                          <td>{entry.detail}</td>
                          <td><Prov level={entry.provenance} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="tw-small">No support records in this period.</div>}
              {report.timelineTruncated && <p className="se-report__note">Only the most recent entries are shown; the JSON export has the full list.</p>}
            </section>

            <section aria-labelledby="report-service">
              <h2 id="report-service">5. Service / support summary</h2>
              <p className="se-report__note">{report.service.disclaimer}</p>
              {report.service.weeks.length ? (
                <div className="se-scroll-x">
                  <table className="se-table">
                    <thead><tr><th>Week of</th><th>Recorded minutes</th><th>Entries</th>{report.service.expectations.map((row) => <th key={row.serviceType}>{supportLabel(row.serviceType)} · plan: {row.minutesPerWeek} min/week</th>)}</tr></thead>
                    <tbody>
                      {report.service.weeks.map((week) => (
                        <tr key={week.weekStart}>
                          <td>{week.weekStart}</td>
                          <td>{week.minutes}</td>
                          <td>{week.entries}</td>
                          {report.service.expectations.map((row) => <td key={row.serviceType}>{row.weeks.find((entry) => entry.weekStart === week.weekStart)?.recordedMinutes ?? 0} recorded</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="tw-small">No service or support minutes were recorded in MathMaster for this period.</div>}
            </section>

            <section aria-labelledby="report-legend">
              <h2 id="report-legend">6. Evidence legend</h2>
              <dl className="se-report__facts">
                {report.legend.map((entry) => <div key={entry.term}><dt>{entry.term}</dt><dd style={{ fontWeight: 400 }}>{entry.meaning}</dd></div>)}
              </dl>
            </section>

            <section aria-labelledby="report-limitations">
              <h2 id="report-limitations">7. Report limitations</h2>
              <ul className="se-report__note" style={{ margin: 0, paddingLeft: 18 }}>{report.limitations.map((line) => <li key={line}>{line}</li>)}</ul>
            </section>
          </>
        )}
      </article>
    </div>
  );
}

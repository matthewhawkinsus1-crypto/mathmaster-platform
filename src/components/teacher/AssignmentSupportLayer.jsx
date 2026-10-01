import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase.js';
import { supportShortLabel } from '../../../functions/shared/supportCatalog.mjs';
import { resolveEffectiveSupportPlan } from '../../../functions/shared/supportProfileModel.mjs';
import { parseInstant } from '../../../functions/shared/instructionalCalendar.mjs';
import { describeDueDateExtension, resolveStudentSupportDeadline } from '../../../functions/shared/supportDeadline.mjs';
import { PROVENANCE_LABEL } from '../../../functions/shared/supportEvidenceModel.mjs';
import { buildAssignmentEvidenceRow } from '../../platform/supportEvidence/evidenceAggregation.js';
import {
  fetchEngagementLedger, fetchStudentGradeRecord, fetchSupportEvidence, fetchSupportProfileRevisions,
} from '../../platform/supportEvidence/supportEvidenceStore.js';
import SupportQuickActions from './SupportQuickActions.jsx';
import { SupportClassificationTag } from './SupportProfileEditor.jsx';
import './teacherWorkspace.css';
import './supportEvidence.css';

/*
 * THE ASSIGNMENT HUB'S SUPPORTS LAYER.
 *
 * For one assignment in one class: which students have a support profile, what
 * it gives them on THIS assignment (an individualized due date, the supports
 * configured), and — on request, like "Show progress" — what the records show:
 * standing, Standard vs Modified, active time, tool use, staff records, gaps.
 * Every row offers the one-click classroom actions, filed under this
 * assignment. Individual deadlines of any kind (extra time or an attendance
 * extension) are listed together so a teacher closing a section can see who is
 * still working to their own date.
 *
 * It computes nothing of its own: rows come from evidenceAggregation.js, the
 * same builder the student drawer and the support evidence report use.
 */

const hasSupports = (profile) => {
  const plan = resolveEffectiveSupportPlan(profile || {});
  return plan.active && (plan.inclusionStatus || plan.accommodations.length > 0 || plan.modifications.length > 0);
};
const shortDate = (ms) => (Number.isFinite(ms)
  ? new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

export default function AssignmentSupportLayer({
  assignment,
  classContext = null,
  roster = [],
  gradeRecordsById = null,
  teacherEmail = '',
  nameOf = (student) => student?.displayName || student?.id,
  onOpenStudent = null,
  nowValue = Date.now(),
}) {
  const [loaded, setLoaded] = useState({ rows: {}, at: null, loading: false, error: '' });
  const [actionsFor, setActionsFor] = useState(null);

  // A different assignment or class starts clean.
  const scopeKey = `${assignment?.id || ''}|${classContext?.classId || ''}`;
  useEffect(() => { setLoaded({ rows: {}, at: null, loading: false, error: '' }); setActionsFor(null); }, [scopeKey]);

  const supported = useMemo(
    () => roster.filter((student) => hasSupports(student.profile)).sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b)))),
    [roster, nameOf],
  );
  const individualDeadlines = useMemo(() => roster
    .map((student) => {
      const support = resolveStudentSupportDeadline({ assignment, profile: student.profile });
      const attendanceFinal = parseInstant(assignment?.studentOverrides?.[student.id]?.lateDueAt || assignment?.studentOverrides?.[student.id]?.dueAt, { endOfDay: true });
      if (!support && attendanceFinal === null) return null;
      return {
        id: student.id,
        name: nameOf(student),
        support,
        attendanceFinal,
      };
    })
    .filter(Boolean), [roster, assignment, nameOf]);

  if (!assignment || !classContext) return null;

  const loadEvidence = async () => {
    setLoaded((current) => ({ ...current, loading: true, error: '' }));
    try {
      const entries = await Promise.all(supported.map(async (student) => {
        const [evidence, engagement, revisions, gradeRecord] = await Promise.all([
          fetchSupportEvidence({ db, studentId: student.id, assignmentId: assignment.id }),
          fetchEngagementLedger({ db, studentId: student.id, assignmentId: assignment.id }),
          fetchSupportProfileRevisions({ db, studentId: student.id }),
          gradeRecordsById?.[student.id] ? Promise.resolve(gradeRecordsById[student.id]) : fetchStudentGradeRecord({ db, studentId: student.id }),
        ]);
        const row = buildAssignmentEvidenceRow({
          assignment,
          student: { ...gradeRecord, ...student, profile: student.profile },
          revisions,
          evidence,
          engagement,
          nowValue,
        });
        return [student.id, row];
      }));
      setLoaded({ rows: Object.fromEntries(entries), at: Date.now(), loading: false, error: '' });
    } catch (error) {
      setLoaded((current) => ({ ...current, loading: false, error: error?.message || 'Could not load support evidence.' }));
    }
  };

  return (
    <section className="tw-stack" style={{ gap: 8 }} aria-labelledby="assignment-hub-supports" data-assignment-supports={assignment.id}>
      <h3 id="assignment-hub-supports" className="tw-card__title">
        Supports &amp; evidence
        <span className="tw-small tw-muted" style={{ fontWeight: 600 }}> · {supported.length} student{supported.length === 1 ? '' : 's'} with a support profile</span>
      </h3>

      {individualDeadlines.length > 0 && (
        <div className="tw-card tw-card--muted se-stack" style={{ gap: 4 }} data-individual-deadlines>
          <strong className="tw-small">Individual deadlines on this assignment ({individualDeadlines.length})</strong>
          {individualDeadlines.map((entry) => (
            <div key={entry.id} className="tw-small">
              {onOpenStudent ? <button type="button" className="tw-link" onClick={() => onOpenStudent(entry.id)}>{entry.name}</button> : entry.name}
              {entry.support && <> · due {shortDate(entry.support.supportDueAtMs)} (extra time: {describeDueDateExtension(entry.support.extension)})</>}
              {entry.attendanceFinal !== null && <> · attendance extension to {shortDate(entry.attendanceFinal)}</>}
            </div>
          ))}
        </div>
      )}

      {!supported.length ? (
        <div className="tw-small tw-muted">No student in this class has a support profile. Classroom supports can still be recorded from any student&apos;s drawer.</div>
      ) : (
        <>
          <div className="tw-row">
            <button type="button" className="tw-btn tw-btn--sm" disabled={loaded.loading} onClick={loadEvidence}>
              {loaded.loading ? 'Loading…' : loaded.at ? 'Refresh support evidence' : 'Show support evidence for this assignment'}
            </button>
            {loaded.at && <span className="tw-small tw-muted">as of {new Date(loaded.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
            {loaded.error && <span className="tw-small" role="alert">Could not load: {loaded.error}</span>}
          </div>
          <ul className="se-list">
            {supported.map((student) => {
              const plan = resolveEffectiveSupportPlan(student.profile || {});
              const deadline = resolveStudentSupportDeadline({ assignment, profile: student.profile });
              const row = loaded.rows[student.id] || null;
              return (
                <li key={student.id} data-support-student={student.id}>
                  <div className="se-list__head">
                    <span className="se-list__title">
                      {onOpenStudent ? <button type="button" className="tw-link" onClick={() => onOpenStudent(student.id)}>{nameOf(student)}</button> : nameOf(student)}
                      {' '}
                      {row
                        ? <span className="se-tag" data-kind={row.condition.value === 'modified' ? 'modification' : 'accommodation'}>{row.condition.value === 'modified' ? 'MOD' : 'Standard'}</span>
                        : plan.modifications.length > 0 && <span className="se-tag" data-kind="modification">MOD plan</span>}
                    </span>
                    <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" aria-expanded={actionsFor === student.id} onClick={() => setActionsFor(actionsFor === student.id ? null : student.id)}>
                      {actionsFor === student.id ? 'Close' : 'Record support'}
                    </button>
                  </div>
                  <div className="se-chips">
                    {plan.accommodations.slice(0, 6).map((entry) => <span key={entry.id} className="tw-pill" data-tone="neutral">{supportShortLabel(entry.id)}</span>)}
                    {plan.accommodations.length > 6 && <span className="tw-small tw-muted">+{plan.accommodations.length - 6} more</span>}
                    {plan.inclusionStatus && <span className="tw-pill" data-tone="neutral">Inclusion</span>}
                  </div>
                  {deadline && <div className="se-list__meta">Individualized due: {shortDate(deadline.supportDueAtMs)} · derived from the profile</div>}
                  {row && (
                    <div className="se-stack" style={{ gap: 4, marginTop: 4 }}>
                      <div className="se-list__meta">
                        {row.statusLabel}{row.completedLate ? ' · after the individualized due date' : ''}
                        {row.score !== null ? ` · ${row.score}%` : ''}
                        {' · active time: '}
                        {row.engagement.activeMinutes !== null ? `${row.engagement.activeMinutes} min` : PROVENANCE_LABEL['not-recorded']}
                        {row.staffEvents.length ? ` · ${row.staffEvents.length} staff record${row.staffEvents.length === 1 ? '' : 's'}` : ''}
                      </div>
                      <div className="se-chips">
                        {row.supports.filter((support) => support.used || support.available || support.provided || support.documented).map((support) => (
                          <span key={support.supportId} className="tw-pill" data-tone="primary" title={support.label}>
                            {supportShortLabel(support.supportId)}: {[support.used ? `used ${support.used}×` : null, support.available ? 'available' : null, support.provided ? 'provided' : null, support.documented ? `documented ${support.documented}×` : null].filter(Boolean).join(', ')}
                          </span>
                        ))}
                        {row.condition.modifications.map((id) => <SupportClassificationTag key={id} supportId={id} />)}
                      </div>
                      {row.gaps.slice(0, 3).map((gap) => <div key={`${gap.code}-${gap.supportId || ''}`} className="tw-small tw-muted">• {gap.message}</div>)}
                    </div>
                  )}
                  {actionsFor === student.id && (
                    <div style={{ marginTop: 6 }}>
                      <SupportQuickActions
                        student={{ id: student.id, classId: student.classId || classContext.classId, name: nameOf(student) }}
                        teacherEmail={teacherEmail}
                        assignmentId={assignment.id}
                        profileRevisionId={plan.revisionId}
                        compact
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

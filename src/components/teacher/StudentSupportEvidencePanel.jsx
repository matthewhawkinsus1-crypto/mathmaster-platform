import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase.js';
import {
  INCLUSION_IMPLIED_SUPPORT_IDS, supportById, supportShortLabel,
} from '../../../functions/shared/supportCatalog.mjs';
import {
  derivedSupportEntries, resolveEffectiveSupportPlan, revisionEffectiveOn, supportProfileWarnings,
} from '../../../functions/shared/supportProfileModel.mjs';
import { describeDueDateExtension } from '../../../functions/shared/supportDeadline.mjs';
import { ITEM_REDUCTION_MODE, normalizeItemReduction } from '../../../functions/shared/reducedWorkload.mjs';
import {
  EVIDENCE_EVENT_TYPE, PROVIDER_ROLE_LABEL, summarizeServiceMinutes, weekStartOf,
} from '../../../functions/shared/supportEvidenceModel.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { activeEvidence, isStaffEvent } from '../../platform/supportEvidence/evidenceAggregation.js';
import { fetchServiceLog, fetchSupportEvidence, fetchSupportProfileRevisions } from '../../platform/supportEvidence/supportEvidenceStore.js';
import { describeEvidenceDetails } from '../../platform/supportEvidence/supportEvidenceReport.js';
import SupportQuickActions from './SupportQuickActions.jsx';
import ServiceLogDialog from './ServiceLogDialog.jsx';
import SupportProfileEditor, { SupportClassificationTag } from './SupportProfileEditor.jsx';
import './teacherWorkspace.css';
import './supportEvidence.css';

/*
 * SUPPORTS & EVIDENCE IN THE STUDENT DRAWER.
 *
 * The drawer answers "who is this student" from anywhere (PR #400). This
 * section adds what their plan requires and what the records show, with the
 * classroom actions a teacher needs in the moment: record a support with one
 * click, log service time, open the support evidence report. Recording
 * evidence never changes the student's plan; the profile itself is changed
 * only by saving a new, dated revision.
 */

const SCHOOL_TIME_ZONE = 'America/Chicago';
const RECENT_DAYS = 90;
const EVENT_TYPE_LABEL = {
  available: 'Available',
  provided: 'Provided',
  activated: 'Activated',
  used: 'Used',
  'teacher-documented': 'Teacher documented',
  'provider-documented': 'Provider documented',
  declined: 'Declined',
  'not-applicable': 'Not applicable',
  unavailable: 'Could not be provided',
};
// The one parameter a teacher most needs to see at a glance on a chip.
const supportParamSuffix = (entry) => {
  if (entry?.id !== 'reduced-item-count-same-rigor') return '';
  const reduction = normalizeItemReduction(entry?.params?.itemReduction);
  return reduction.mode === ITEM_REDUCTION_MODE.PERCENT ? ` · ${reduction.value}% (automatic)` : ' · recorded by staff';
};
const whenText = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'time not recorded');

export default function StudentSupportEvidencePanel({
  student = null,
  assignments = [],
  teacherEmail = '',
  onOpenReport = null,
  onSupportProfileSaved = null,
  nowValue = null,
}) {
  const studentId = student?.id || null;
  const now = nowValue ?? Date.now();
  const [evidence, setEvidence] = useState([]);
  const [serviceLog, setServiceLog] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [loadState, setLoadState] = useState({ loading: false, error: '' });
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [contextAssignmentId, setContextAssignmentId] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    setLoadState({ loading: true, error: '' });
    const fromMs = Date.now() - RECENT_DAYS * 86400000;
    Promise.all([
      fetchSupportEvidence({ db, studentId, fromMs, max: 400 }),
      fetchServiceLog({ db, studentId, fromDateKey: zonedDateKey(fromMs, SCHOOL_TIME_ZONE) }),
      fetchSupportProfileRevisions({ db, studentId }),
    ])
      .then(([loadedEvidence, loadedService, loadedRevisions]) => {
        if (cancelled) return;
        setEvidence(loadedEvidence);
        setServiceLog(loadedService);
        setRevisions(loadedRevisions);
        setLoadState({ loading: false, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setLoadState({ loading: false, error: error?.message || 'Could not load support evidence.' });
      });
    return () => { cancelled = true; };
  }, [studentId, reloadKey]);

  // The editor is a layer above the drawer: Escape closes it, not the drawer
  // (the drawer ignores Escape while a later dialog is open).
  useEffect(() => {
    if (!editorOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); setEditorOpen(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editorOpen]);

  // The student's real assignment instances (their class), current first.
  const studentAssignments = useMemo(() => (student?.classId
    ? assignments
      .filter((assignment) => assignmentIsForStudent(assignment, { classId: student.classId }))
      // Most recent due first: the one-click "About" choice is almost always
      // today's or this week's lesson.
      .sort((a, b) => String(b.dueAt || b.dueDate || '').localeCompare(String(a.dueAt || a.dueDate || '')))
    : []), [assignments, student?.classId]);

  if (!student) return null;
  const plan = resolveEffectiveSupportPlan(student.profile || {}, { nowValue: now });
  const warnings = supportProfileWarnings(student.profile || {}, { nowValue: now });
  const hasProfile = plan.source !== 'none';
  const active = activeEvidence(evidence);
  const voided = new Set(evidence.map((event) => event.voidsEventId).filter(Boolean));
  const recent = [...evidence].sort((a, b) => (b.occurredAtMs || 0) - (a.occurredAtMs || 0)).slice(0, 12);
  const staffCount = active.filter(isStaffEvent).length;
  const usedCount = active.filter((event) => event.eventType === EVIDENCE_EVENT_TYPE.USED).length;
  const todayKey = zonedDateKey(now, SCHOOL_TIME_ZONE);
  const service = summarizeServiceMinutes(serviceLog, {});
  const thisWeek = service.weeks.find((week) => week.weekStart === weekStartOf(todayKey))?.minutes || 0;
  const extraTime = plan.accommodations.find((entry) => ['extra-time', 'extra-time-written-response'].includes(entry.id));
  const titleOf = (assignmentId) => assignments.find((assignment) => assignment.id === assignmentId)?.title || '';
  // Weekly service expectations are privileged profile data (revisions only).
  const expectations = revisionEffectiveOn(revisions, todayKey)?.serviceExpectations || [];

  return (
    <section className="se-stack" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--mm-divider, var(--mm-border-soft))' }} aria-labelledby={`supports-evidence-${studentId}`} data-student-support-evidence={studentId}>
      <div className="tw-row" style={{ justifyContent: 'space-between' }}>
        <h3 id={`supports-evidence-${studentId}`} style={{ margin: 0, fontSize: 16 }}>Supports &amp; evidence</h3>
        <div className="tw-row">
          {onOpenReport && <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" onClick={() => onOpenReport(studentId)}>Support evidence report</button>}
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => setEditorOpen(true)}>{hasProfile ? 'Edit support profile' : 'Add support profile'}</button>
        </div>
      </div>

      {warnings.filter((warning) => warning.code !== 'unversioned').map((warning) => (
        <div key={warning.code} className="tw-notice" data-tone="warning">{warning.message}</div>
      ))}

      {hasProfile ? (
        <div className="tw-card se-stack" style={{ gap: 6 }}>
          <div className="tw-small tw-muted">
            {plan.source === 'legacy'
              ? 'Profile recorded before versioning — no dates or source.'
              : `Revision ${plan.revision} · effective ${plan.effectiveStart}${plan.effectiveEnd ? ` to ${plan.effectiveEnd}` : ''}`}
            {plan.inclusionStatus ? ' · inclusion' : ''}
          </div>
          <div className="se-chips" aria-label="Accommodations in effect">
            {plan.accommodations.map((entry) => (
              <span key={entry.id} className="tw-pill" data-tone="primary">{supportShortLabel(entry.id)}{supportParamSuffix(entry)}</span>
            ))}
            {derivedSupportEntries(plan).map((entry) => (
              <span key={entry.id} className="tw-pill" data-tone="primary" title="From the profile language">{supportShortLabel(entry.id)} · {entry.params.language}</span>
            ))}
            {plan.inclusionStatus && INCLUSION_IMPLIED_SUPPORT_IDS.filter((id) => !plan.accommodations.some((entry) => entry.id === id)).map((id) => (
              <span key={id} className="tw-pill" data-tone="neutral" title="Implied by inclusion status">{supportShortLabel(id)}</span>
            ))}
            {!plan.accommodations.length && !plan.inclusionStatus && <span className="tw-small tw-muted">No accommodations.</span>}
          </div>
          {plan.modifications.length > 0 && (
            <div className="se-chips" aria-label="Modifications in effect">
              {plan.modifications.map((entry) => <span key={entry.id} className="se-tag" data-kind="modification">MOD · {supportShortLabel(entry.id)}</span>)}
            </div>
          )}
          {extraTime && (
            <div className="tw-small"><strong>Individualized due dates:</strong> {describeDueDateExtension(extraTime.params?.dueDateExtension)}.</div>
          )}
        </div>
      ) : (
        <div className="tw-notice">No support profile is recorded. Classroom supports can still be documented below.</div>
      )}

      <div className="se-stack" style={{ gap: 6 }}>
        <div className="tw-row" style={{ justifyContent: 'space-between' }}>
          <strong className="tw-small">Record classroom support — one click</strong>
          <label className="tw-row tw-small" style={{ gap: 6 }}>
            <span className="tw-muted">About</span>
            <select className="tw-select" value={contextAssignmentId} onChange={(event) => setContextAssignmentId(event.target.value)}>
              <option value="">No specific assignment</option>
              {studentAssignments.slice(0, 40).map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title || 'Untitled assignment'}</option>)}
            </select>
          </label>
        </div>
        <SupportQuickActions
          student={{ id: studentId, classId: student.classId || null, name: student.name }}
          teacherEmail={teacherEmail}
          assignmentId={contextAssignmentId || null}
          profileRevisionId={plan.revisionId}
          compact
          onRecorded={() => setReloadKey((key) => key + 1)}
        />
      </div>

      <div className="se-grid-2">
        <div className="tw-card">
          <div className="tw-small tw-muted">Last {RECENT_DAYS} days</div>
          <div className="tw-strong">{staffCount} staff record{staffCount === 1 ? '' : 's'} · {usedCount} tool use{usedCount === 1 ? '' : 's'}</div>
        </div>
        <div className="tw-card">
          <div className="tw-small tw-muted">Service time recorded this week</div>
          <div className="tw-row" style={{ justifyContent: 'space-between' }}>
            <span className="tw-strong">{thisWeek} min</span>
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => setServiceOpen(true)}>Log service time</button>
          </div>
        </div>
      </div>

      <details className="tw-disclosure">
        <summary>Recent support records <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{loadState.loading ? 'loading…' : `${recent.length} shown · append-only`}</span></summary>
        <div className="tw-disclosure__body">
          {loadState.error && <div className="tw-notice" data-tone="danger" role="alert">{loadState.error}</div>}
          {recent.length ? (
            <ul className="se-list">
              {recent.map((event) => {
                const entry = supportById(event.supportId);
                const withdrawn = voided.has(event.id);
                return (
                  <li key={event.id} style={withdrawn || event.voidsEventId ? { opacity: 0.7 } : undefined}>
                    <div className="se-list__head">
                      <span className="se-list__title">
                        {event.voidsEventId ? 'Correction — earlier record withdrawn' : `${EVENT_TYPE_LABEL[event.eventType] || event.eventType}: ${entry?.label || event.supportId}`}
                        {withdrawn ? ' (withdrawn)' : ''}
                      </span>
                      <span className="se-list__meta">{whenText(event.occurredAtMs)}</span>
                    </div>
                    <div className="se-list__meta">
                      <SupportClassificationTag supportId={event.supportId} classification={event.classification} />
                      {' '}{isStaffEvent(event) ? `by ${event.actorEmail || 'staff'}` : 'MathMaster'}
                      {event.providerRole ? ` · ${PROVIDER_ROLE_LABEL[event.providerRole] || event.providerRole}` : ''}
                      {event.assignmentId && titleOf(event.assignmentId) ? ` · ${titleOf(event.assignmentId)}` : ''}
                    </div>
                    {describeEvidenceDetails(event) && <div className="tw-small tw-muted" data-evidence-details>{describeEvidenceDetails(event)}</div>}
                    {event.note && <div className="tw-small">{event.note}</div>}
                  </li>
                );
              })}
            </ul>
          ) : !loadState.loading && <div className="tw-small tw-muted">No support records in the last {RECENT_DAYS} days.</div>}
        </div>
      </details>

      <ServiceLogDialog
        open={serviceOpen}
        student={{ id: studentId, classId: student.classId || null, name: student.name }}
        teacherEmail={teacherEmail}
        expectations={expectations}
        assignments={studentAssignments.slice(0, 40)}
        initialAssignmentId={contextAssignmentId || null}
        onClose={() => setServiceOpen(false)}
        onSaved={() => setReloadKey((key) => key + 1)}
      />

      {editorOpen && (
        <div className="tw-review" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <div className="tw-review__panel" role="dialog" aria-modal="true" aria-label={`Support profile for ${student.name}`} style={{ width: 'min(820px, 100%)' }}>
            <div className="tw-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="tw-btn tw-btn--sm" onClick={() => setEditorOpen(false)}>Close</button>
            </div>
            <SupportProfileEditor
              student={{ id: studentId, classId: student.classId || null, profile: student.profile || {} }}
              teacherEmail={teacherEmail}
              onSaved={(savedId, projection) => { onSupportProfileSaved?.(savedId, projection); setReloadKey((key) => key + 1); }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

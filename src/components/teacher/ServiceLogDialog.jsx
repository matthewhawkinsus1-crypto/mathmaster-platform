import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../firebase.js';
import { serviceTypes, supportLabel } from '../../../functions/shared/supportCatalog.mjs';
import {
  PROVIDER_ROLES, PROVIDER_ROLE_LABEL, summarizeServiceMinutes, weekStartOf,
} from '../../../functions/shared/supportEvidenceModel.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { fetchServiceLog, recordServiceLogEntry } from '../../platform/supportEvidence/supportEvidenceStore.js';
import './teacherWorkspace.css';
import './supportEvidence.css';

/*
 * A SERVICE / SUPPORT LOG — not the district's service-delivery system.
 *
 * Staff record that support happened: who (by role), which service, when, for
 * how long, about which assignment or topic. Minutes are summed by week and
 * shown beside the weekly expectation written in the student's profile, with
 * no verdict: MathMaster reports what was recorded in MathMaster. A mistake is
 * corrected with a new entry that voids the old one; nothing is edited.
 */

const SCHOOL_TIME_ZONE = 'America/Chicago';
const minutesText = (minutes) => `${minutes} min`;
const hhmm = (minuteOfDay) => (Number.isFinite(minuteOfDay)
  ? `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`
  : '');

export default function ServiceLogDialog({
  open = false,
  student = null,
  teacherEmail = '',
  expectations = [],
  assignments = [],
  initialAssignmentId = null,
  onClose,
  onSaved = null,
}) {
  const todayKey = zonedDateKey(Date.now(), SCHOOL_TIME_ZONE);
  const services = useMemo(() => serviceTypes(), []);
  const [form, setForm] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loadState, setLoadState] = useState({ loading: false, error: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (!open || !student?.id) return undefined;
    let cancelled = false;
    setForm({
      dateKey: todayKey,
      startTime: '',
      endTime: '',
      minutes: '',
      serviceType: expectations[0]?.serviceType || 'inclusion-support',
      providerRole: 'inclusion-teacher',
      providerLabel: '',
      assignmentId: initialAssignmentId || '',
      topic: '',
      note: '',
    });
    setErrors([]);
    setLoadState({ loading: true, error: '' });
    // Eight school weeks is enough context for "this week" and the trend.
    const from = zonedDateKey(Date.now() - 56 * 86400000, SCHOOL_TIME_ZONE);
    fetchServiceLog({ db, studentId: student.id, fromDateKey: from })
      .then((loaded) => { if (!cancelled) { setEntries(loaded); setLoadState({ loading: false, error: '' }); } })
      .catch((error) => { if (!cancelled) setLoadState({ loading: false, error: error?.message || 'Could not load the service log.' }); });
    return () => { cancelled = true; };
  }, [open, student?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    firstFieldRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose?.(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !student || !form) return null;

  const summary = summarizeServiceMinutes(entries, { expectations });
  const thisWeek = weekStartOf(todayKey);
  const thisWeekMinutes = summary.weeks.find((week) => week.weekStart === thisWeek)?.minutes || 0;
  const voided = new Set(entries.map((entry) => entry.voidsEntryId).filter(Boolean));

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      const saved = await recordServiceLogEntry({
        db,
        entry: {
          studentId: student.id,
          classId: student.classId || null,
          dateKey: form.dateKey,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          minutes: form.minutes === '' ? null : Number(form.minutes),
          serviceType: form.serviceType,
          providerRole: form.providerRole,
          providerLabel: form.providerLabel,
          assignmentId: form.assignmentId || null,
          topic: form.topic,
          note: form.note,
          createdByEmail: teacherEmail,
        },
      });
      setEntries((current) => [...current, saved]);
      set({ startTime: '', endTime: '', minutes: '', topic: '', note: '' });
      onSaved?.(saved);
    } catch (error) {
      setErrors(error?.errors?.length ? error.errors : [error?.message || 'The entry could not be saved.']);
    } finally {
      setSaving(false);
    }
  };

  const correct = async (entry) => {
    setSaving(true);
    try {
      const saved = await recordServiceLogEntry({
        db,
        entry: {
          studentId: student.id,
          classId: student.classId || null,
          dateKey: entry.dateKey,
          minutes: 0,
          serviceType: entry.serviceType,
          providerRole: entry.providerRole,
          note: 'Entered in error',
          voidsEntryId: entry.id,
          createdByEmail: teacherEmail,
        },
      });
      setEntries((current) => [...current, saved]);
      onSaved?.(saved);
    } catch (error) {
      setErrors([error?.message || 'The correction could not be saved.']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tw-review" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="tw-review__panel" role="dialog" aria-modal="true" aria-labelledby="service-log-title" data-service-log={student.id}>
        <div className="tw-row" style={{ justifyContent: 'space-between' }}>
          <h2 id="service-log-title" style={{ margin: 0, fontSize: 18 }}>Service / support log · {student.name}</h2>
          <button type="button" className="tw-btn tw-btn--sm" onClick={onClose}>Close</button>
        </div>
        <div className="tw-small tw-muted">
          Records support that staff provided, as entered in MathMaster. MathMaster does not independently measure services or determine compliance.
        </div>

        <div className="tw-card se-stack" style={{ gap: 6 }}>
          <strong>This week: {minutesText(thisWeekMinutes)} recorded</strong>
          {summary.expectations.map((row) => (
            <div key={row.serviceType} className="tw-small">
              {supportLabel(row.serviceType)} — profile expectation {row.minutesPerWeek} min/week; recorded this week {row.weeks.find((week) => week.weekStart === thisWeek)?.recordedMinutes || 0} min.
            </div>
          ))}
          {!summary.expectations.length && <div className="tw-small tw-muted">No weekly service expectation is recorded in this student's profile.</div>}
        </div>

        <form className="se-stack" onSubmit={save} aria-label="New service entry">
          <div className="se-grid-2">
            <label className="se-field">
              <span>Date</span>
              <input ref={firstFieldRef} className="tw-input" type="date" required value={form.dateKey} max={todayKey} onChange={(event) => set({ dateKey: event.target.value })} />
            </label>
            <label className="se-field">
              <span>Service</span>
              <select className="tw-select" value={form.serviceType} onChange={(event) => set({ serviceType: event.target.value })}>
                {services.map((service) => <option key={service.id} value={service.id}>{service.label}</option>)}
              </select>
            </label>
            <label className="se-field">
              <span>Start (optional)</span>
              <input className="tw-input" type="time" value={form.startTime} onChange={(event) => set({ startTime: event.target.value })} />
            </label>
            <label className="se-field">
              <span>End (optional)</span>
              <input className="tw-input" type="time" value={form.endTime} onChange={(event) => set({ endTime: event.target.value })} />
            </label>
            <label className="se-field">
              <span>Minutes {form.startTime && form.endTime ? '(from the times)' : ''}</span>
              <input className="tw-input" type="number" min={1} max={600} inputMode="numeric" value={form.minutes} disabled={Boolean(form.startTime && form.endTime)} onChange={(event) => set({ minutes: event.target.value })} />
            </label>
            <label className="se-field">
              <span>Provided by</span>
              <select className="tw-select" value={form.providerRole} onChange={(event) => set({ providerRole: event.target.value })}>
                {PROVIDER_ROLES.map((role) => <option key={role} value={role}>{PROVIDER_ROLE_LABEL[role]}</option>)}
              </select>
            </label>
            <label className="se-field">
              <span>Provider label (optional)</span>
              <input className="tw-input" maxLength={80} placeholder="e.g. Inclusion teacher, room 204" value={form.providerLabel} onChange={(event) => set({ providerLabel: event.target.value })} />
            </label>
            <label className="se-field">
              <span>Assignment (optional)</span>
              <select className="tw-select" value={form.assignmentId} onChange={(event) => set({ assignmentId: event.target.value })}>
                <option value="">No specific assignment</option>
                {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title || 'Untitled assignment'}</option>)}
              </select>
            </label>
          </div>
          <div className="se-grid-2">
            <label className="se-field">
              <span>Topic (optional)</span>
              <input className="tw-input" maxLength={120} value={form.topic} onChange={(event) => set({ topic: event.target.value })} />
            </label>
            <label className="se-field">
              <span>Note (optional)</span>
              <input className="tw-input" maxLength={280} value={form.note} onChange={(event) => set({ note: event.target.value })} />
            </label>
          </div>
          {errors.length > 0 && (
            <div className="tw-notice" data-tone="danger" role="alert">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((message) => <li key={message}>{message}</li>)}</ul>
            </div>
          )}
          <div className="tw-row">
            <button type="submit" className="tw-btn tw-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Record service time'}</button>
          </div>
        </form>

        <details className="tw-disclosure" open>
          <summary>Recent entries <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{loadState.loading ? 'loading…' : `last 8 weeks · ${minutesText(summary.totalMinutes)}`}</span></summary>
          <div className="tw-disclosure__body">
            {loadState.error && <div className="tw-notice" data-tone="danger" role="alert">{loadState.error}</div>}
            {entries.length ? (
              <ul className="se-list">
                {[...entries].sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)) || (b.createdAtMs || 0) - (a.createdAtMs || 0)).map((entry) => {
                  const isVoid = Boolean(entry.voidsEntryId);
                  const wasVoided = voided.has(entry.id);
                  return (
                    <li key={entry.id} style={wasVoided || isVoid ? { opacity: 0.7 } : undefined}>
                      <div className="se-list__head">
                        <span className="se-list__title">
                          {isVoid ? 'Correction — earlier entry withdrawn' : `${entry.dateKey} · ${minutesText(entry.minutes)} · ${supportLabel(entry.serviceType)}`}
                          {wasVoided ? ' (withdrawn)' : ''}
                        </span>
                        {!isVoid && !wasVoided && (
                          <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" disabled={saving} onClick={() => correct(entry)}>Entered in error</button>
                        )}
                      </div>
                      <div className="se-list__meta">
                        {PROVIDER_ROLE_LABEL[entry.providerRole] || entry.providerRole}
                        {entry.providerLabel ? ` · ${entry.providerLabel}` : ''}
                        {Number.isFinite(entry.startMinute) ? ` · ${hhmm(entry.startMinute)}–${hhmm(entry.endMinute)}` : ''}
                        {entry.topic ? ` · ${entry.topic}` : ''}
                        {entry.createdByEmail ? ` · recorded by ${entry.createdByEmail}` : ''}
                      </div>
                      {entry.note && <div className="tw-small">{entry.note}</div>}
                    </li>
                  );
                })}
              </ul>
            ) : !loadState.loading && <div className="tw-small tw-muted">No service time recorded in the last 8 weeks.</div>}
          </div>
        </details>
      </section>
    </div>
  );
}

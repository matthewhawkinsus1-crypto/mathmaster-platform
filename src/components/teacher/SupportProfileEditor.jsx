import { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase.js';
import {
  INCLUSION_IMPLIED_SUPPORT_IDS, SUPPORT_AUTOMATION, supportAutomationFor, supportById, supportLabel,
} from '../../../functions/shared/supportCatalog.mjs';
import {
  ITEM_REDUCTION_LIMITS, ITEM_REDUCTION_MODE, describeItemReduction,
} from '../../../functions/shared/reducedWorkload.mjs';
import {
  resolveEffectiveSupportPlan, supportProfileWarnings, sortRevisionTimeline,
} from '../../../functions/shared/supportProfileModel.mjs';
import { describeDueDateExtension } from '../../../functions/shared/supportDeadline.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import {
  DUE_DATE_EXTENSION_PRESETS, ITEM_REDUCTION_CHOICES, ITEM_REDUCTION_PRESETS, describeRevision, draftFromCurrent,
  draftItemReduction, editorGroups, extensionForPresetKey, inputFromDraft, LANGUAGE_CHOICES, languageCoverageNote,
  presetKeyForExtension, setDraftSupportParam, setDraftSupportRoles, toggleDraftSupport,
} from '../../platform/supportEvidence/supportProfileDraft.js';
import { fetchSupportProfileRevisions, saveSupportProfileRevision } from '../../platform/supportEvidence/supportEvidenceStore.js';
import './teacherWorkspace.css';
import './supportEvidence.css';

/*
 * THE VERSIONED STUDENT SUPPORT PROFILE EDITOR.
 *
 * Replaces the flat checkboxes in Students → Supports. A teacher never edits
 * what was recorded: they record a NEW revision with the date it takes effect
 * and the document it comes from. The old revision stays exactly as it was, so
 * the condition earlier work was done under is never rewritten.
 *
 * Modifications live in their own, visibly different section: they change what
 * the student is expected to learn, and must never read as one more
 * accommodation. The editor writes nothing but a revision and its
 * student-readable projection (supportEvidenceStore.saveSupportProfileRevision).
 */

const SCHOOL_TIME_ZONE = 'America/Chicago';
const ROLE_CHOICES = [['warmup', 'Warm-Up'], ['classwork', 'Classwork'], ['practice', 'Practice'], ['dol', 'DOL'], ['quiz', 'Quiz'], ['test', 'Test']];

const AUTOMATION_HINT = {
  [SUPPORT_AUTOMATION.AUTOMATIC]: 'Applied automatically',
  [SUPPORT_AUTOMATION.PLATFORM_AVAILABLE]: 'Offered to the student in Support tools',
  [SUPPORT_AUTOMATION.MANUAL]: 'Delivered by an adult — record it with one click',
};

const formatWhen = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'time not recorded');

export function SupportClassificationTag({ supportId, classification = null }) {
  const kind = classification || supportById(supportId)?.classification || 'unknown';
  const text = kind === 'modification' ? 'MOD' : kind === 'service' ? 'Service' : kind === 'accommodation' ? 'Accommodation' : 'Unrecognized';
  return <span className="se-tag" data-kind={kind}>{text}</span>;
}

function RoleChips({ value = [], onChange, label }) {
  const selected = new Set(value);
  return (
    <div className="se-chips" role="group" aria-label={label}>
      <button type="button" className="tw-chip" aria-pressed={selected.size === 0} onClick={() => onChange([])}>All activities</button>
      {ROLE_CHOICES.map(([role, text]) => (
        <button
          key={role}
          type="button"
          className="tw-chip"
          aria-pressed={selected.has(role)}
          onClick={() => {
            const next = new Set(selected);
            if (next.has(role)) next.delete(role); else next.add(role);
            onChange([...next]);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function ResourceRows({ resources = [], onChange, supportId }) {
  const rows = resources.length ? resources : [];
  return (
    <div className="se-stack" style={{ gap: 6 }}>
      {rows.map((resource, index) => (
        <div key={index} className="se-grid-2">
          <label className="se-field">
            <span>Link label</span>
            <input className="tw-input" value={resource.label || ''} maxLength={80} onChange={(event) => onChange(rows.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)))} />
          </label>
          <label className="se-field">
            <span>https:// link</span>
            <input className="tw-input" type="url" inputMode="url" value={resource.url || ''} maxLength={500} placeholder="https://" onChange={(event) => onChange(rows.map((row, i) => (i === index ? { ...row, url: event.target.value } : row)))} />
          </label>
        </div>
      ))}
      {rows.length < 5 && (
        <div>
          <button type="button" className="tw-btn tw-btn--sm" onClick={() => onChange([...rows, { label: '', url: '' }])} aria-label={`Add a link for ${supportLabel(supportId)}`}>
            + Add link
          </button>
        </div>
      )}
      <div className="se-hint">Students see the label and open the link from Support tools. Do not put student names in links or labels.</div>
    </div>
  );
}

/*
 * Reduced number of items: delivered by MathMaster (with the percentage) or
 * recorded by staff. The percentage is validated centrally
 * (functions/shared/reducedWorkload.mjs); an out-of-range number is shown as
 * an error here and refused on save, never silently changed.
 */
function ItemReductionControl({ supportId, params, onChange }) {
  const reduction = draftItemReduction(params);
  const automatic = reduction.mode === ITEM_REDUCTION_MODE.PERCENT;
  const inputId = `${supportId}-percent`;
  return (
    <div className="se-stack" style={{ gap: 6 }} data-item-reduction-control>
      <label className="se-field">
        <span>How it is delivered</span>
        <select
          className="tw-select"
          value={reduction.mode}
          onChange={(event) => onChange(event.target.value === ITEM_REDUCTION_MODE.PERCENT
            ? { mode: ITEM_REDUCTION_MODE.PERCENT, value: ITEM_REDUCTION_LIMITS.defaultPercent }
            : { mode: ITEM_REDUCTION_MODE.NONE, value: 0 })}
        >
          {ITEM_REDUCTION_CHOICES.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select>
      </label>
      {automatic && (
        <div className="se-field">
          <label htmlFor={inputId}><span>Fewer items by</span></label>
          <div className="tw-row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              id={inputId}
              className="tw-input"
              style={{ width: 80 }}
              type="number"
              inputMode="numeric"
              min={ITEM_REDUCTION_LIMITS.minPercent}
              max={ITEM_REDUCTION_LIMITS.maxPercent}
              step={1}
              aria-invalid={!reduction.valid || undefined}
              value={reduction.value ?? ''}
              onChange={(event) => onChange({ mode: ITEM_REDUCTION_MODE.PERCENT, value: event.target.value === '' ? '' : Number(event.target.value) })}
            />
            <span>%</span>
            {ITEM_REDUCTION_PRESETS.map((preset) => (
              <button key={preset} type="button" className="tw-chip" aria-pressed={Number(reduction.value) === preset} onClick={() => onChange({ mode: ITEM_REDUCTION_MODE.PERCENT, value: preset })}>
                {preset}%
              </button>
            ))}
          </div>
          {!reduction.valid && (
            <div className="tw-notice" data-tone="warning" role="alert">
              Choose a whole number from {ITEM_REDUCTION_LIMITS.minPercent} to {ITEM_REDUCTION_LIMITS.maxPercent}.
            </div>
          )}
        </div>
      )}
      <div className="se-hint">
        {automatic && reduction.valid
          ? `${describeItemReduction({ mode: ITEM_REDUCTION_MODE.PERCENT, value: Number(reduction.value) })}. Every TEKS in a section keeps at least one item, linked questions stay together, answered work is never removed, and a one-question DOL stays one question. Applies to assignments due on or after the effective date; the shared assignment is never changed.`
          : 'Staff deliver the shorter assignment and record it; MathMaster does not choose or remove items.'}
      </div>
    </div>
  );
}

function SupportOption({ entry, group, draft, setDraft }) {
  const state = draft[group]?.[entry.id];
  const checked = Boolean(state?.selected);
  const id = `support-${group}-${entry.id}`;
  return (
    <div className="se-option">
      <input id={id} type="checkbox" checked={checked} onChange={() => setDraft((current) => toggleDraftSupport(current, group, entry.id))} />
      <label htmlFor={id} className="se-option__label">
        {entry.label}
        {entry.affectsIndependence && <span className="tw-small tw-muted"> · affects independence evidence</span>}
      </label>
      <div className="se-option__meta">{AUTOMATION_HINT[supportAutomationFor(entry.id, state?.params) || entry.automation]}{entry.studentLabel ? ` · students see “${entry.studentLabel}”` : ''}</div>
      {checked && (entry.params.length > 0 || entry.automation !== SUPPORT_AUTOMATION.MANUAL) && (
        <div className="se-option__params">
          {entry.params.includes('dueDateExtension') && (
            <label className="se-field">
              <span>Individualized due date</span>
              <select
                className="tw-select"
                value={presetKeyForExtension(state?.params?.dueDateExtension)}
                onChange={(event) => setDraft((current) => setDraftSupportParam(current, group, entry.id, 'dueDateExtension', extensionForPresetKey(event.target.value)))}
              >
                {DUE_DATE_EXTENSION_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
              </select>
            </label>
          )}
          {entry.params.includes('resources') && (
            <ResourceRows
              supportId={entry.id}
              resources={state?.params?.resources || []}
              onChange={(resources) => setDraft((current) => setDraftSupportParam(current, group, entry.id, 'resources', resources))}
            />
          )}
          {entry.params.includes('teksCode') && (
            <label className="se-field">
              <span>Modified standard (TEKS code)</span>
              <input className="tw-input" maxLength={24} value={state?.params?.teksCode || ''} onChange={(event) => setDraft((current) => setDraftSupportParam(current, group, entry.id, 'teksCode', event.target.value))} />
            </label>
          )}
          {entry.params.includes('maxDok') && (
            <label className="se-field">
              <span>Highest depth of knowledge</span>
              <select className="tw-select" value={String(state?.params?.maxDok || '')} onChange={(event) => setDraft((current) => setDraftSupportParam(current, group, entry.id, 'maxDok', Number(event.target.value) || null))}>
                <option value="">Not set</option>
                <option value="1">DOK 1</option>
                <option value="2">DOK 2</option>
                <option value="3">DOK 3</option>
              </select>
            </label>
          )}
          {entry.params.includes('itemReduction') && (
            <ItemReductionControl
              supportId={entry.id}
              params={state?.params}
              onChange={(value) => setDraft((current) => setDraftSupportParam(current, group, entry.id, 'itemReduction', value))}
            />
          )}
          {supportAutomationFor(entry.id, state?.params) !== SUPPORT_AUTOMATION.MANUAL && (
            <div className="se-field">
              <span>Applies to</span>
              <RoleChips value={state?.appliesTo || []} label={`Activities ${entry.label} applies to`} onChange={(roles) => setDraft((current) => setDraftSupportRoles(current, group, entry.id, roles))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceRows({ rows = [], onChange, services }) {
  return (
    <div className="se-stack" style={{ gap: 8 }}>
      {rows.map((row, index) => (
        <div key={index} className="se-grid-2">
          <label className="se-field">
            <span>Service</span>
            <select className="tw-select" value={row.serviceType || ''} onChange={(event) => onChange(rows.map((entry, i) => (i === index ? { ...entry, serviceType: event.target.value } : entry)))}>
              <option value="">Choose…</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.label}</option>)}
            </select>
          </label>
          <label className="se-field">
            <span>Minutes per week (as written in the plan)</span>
            <input className="tw-input" type="number" min={1} max={3000} inputMode="numeric" value={row.minutesPerWeek} onChange={(event) => onChange(rows.map((entry, i) => (i === index ? { ...entry, minutesPerWeek: event.target.value } : entry)))} />
          </label>
          <label className="se-field">
            <span>Note (optional)</span>
            <input className="tw-input" maxLength={200} value={row.note || ''} onChange={(event) => onChange(rows.map((entry, i) => (i === index ? { ...entry, note: event.target.value } : entry)))} />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove</button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="tw-btn tw-btn--sm" onClick={() => onChange([...rows, { serviceType: '', minutesPerWeek: '', note: '' }])}>+ Add service expectation</button>
      </div>
    </div>
  );
}

function CurrentProfileSummary({ plan, revision }) {
  if (plan.source === 'none') {
    return <div className="tw-notice">No support profile is recorded for this student.</div>;
  }
  const accommodations = plan.accommodations || [];
  const modifications = plan.modifications || [];
  return (
    <div className="tw-card se-stack" style={{ gap: 8 }}>
      <div className="tw-row" style={{ justifyContent: 'space-between' }}>
        <strong>What applies today</strong>
        <span className="tw-small tw-muted">
          {plan.source === 'legacy'
            ? 'Recorded before versioning — no dates or source'
            : `Revision ${plan.revision ?? '—'} · effective ${plan.effectiveStart || '—'}${plan.effectiveEnd ? ` to ${plan.effectiveEnd}` : ''}${revision?.sourceLabel ? ` · ${revision.sourceLabel}` : ''}`}
        </span>
      </div>
      {!plan.active && <div className="tw-notice" data-tone="warning">Supports are turned off (inactive profile).</div>}
      {plan.inclusionStatus && (
        <div className="tw-small">
          <strong>Inclusion status on</strong> — also applies: {INCLUSION_IMPLIED_SUPPORT_IDS.map((id) => supportLabel(id).toLowerCase()).join(', ')}.
        </div>
      )}
      <div className="se-chips" aria-label="Accommodations">
        {accommodations.length ? accommodations.map((entry) => (
          <span key={entry.id} className="tw-pill" data-tone="primary" title={supportLabel(entry.id)}>
            {supportLabel(entry.id)}
            {entry?.params?.dueDateExtension ? ` · ${describeDueDateExtension(entry.params.dueDateExtension)}` : ''}
          </span>
        )) : <span className="tw-small tw-muted">No accommodations.</span>}
      </div>
      <div className="se-chips" aria-label="Modifications">
        {modifications.length ? modifications.map((entry) => (
          <span key={entry.id} className="se-tag" data-kind="modification">MOD · {supportLabel(entry.id)}</span>
        )) : <span className="tw-small tw-muted">No modifications — grade-level expectations.</span>}
      </div>
      {revision?.serviceExpectations?.length > 0 && (
        <div className="tw-small">
          Service expectations: {revision.serviceExpectations.map((row) => `${supportLabel(row.serviceType)} ${row.minutesPerWeek} min/week`).join(' · ')}
        </div>
      )}
    </div>
  );
}

export default function SupportProfileEditor({
  student = null,
  teacherEmail = '',
  onSaved = null,
  nowValue = null,
}) {
  const studentId = student?.id || null;
  const now = nowValue ?? Date.now();
  const todayKey = zonedDateKey(now, SCHOOL_TIME_ZONE);
  const [revisions, setRevisions] = useState([]);
  const [loadState, setLoadState] = useState({ loading: true, error: null });
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [savedNote, setSavedNote] = useState('');
  const groups = useMemo(() => editorGroups(), []);

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    setLoadState({ loading: true, error: null });
    setDraft(null);
    setErrors([]);
    setSavedNote('');
    fetchSupportProfileRevisions({ db, studentId })
      .then((loaded) => { if (!cancelled) { setRevisions(loaded); setLoadState({ loading: false, error: null }); } })
      .catch((error) => { if (!cancelled) setLoadState({ loading: false, error: error?.message || 'Could not load the profile history.' }); });
    return () => { cancelled = true; };
  }, [studentId]);

  if (!student) return null;
  const plan = resolveEffectiveSupportPlan(student.profile || {}, { dateKey: todayKey });
  const currentRevision = revisions.find((entry) => entry.id === plan.revisionId) || null;
  const warnings = supportProfileWarnings(student.profile || {}, { nowValue: now });
  const history = [...sortRevisionTimeline(revisions)].reverse();

  const startDraft = () => {
    setDraft(draftFromCurrent({ revisions, profile: student.profile, todayKey }));
    setErrors([]);
    setSavedNote('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setErrors([]);
    try {
      const result = await saveSupportProfileRevision({
        db,
        student: { id: studentId, classId: student.classId || null, profile: student.profile || {} },
        input: inputFromDraft(draft),
        teacherEmail,
        existingRevisions: revisions,
      });
      setRevisions(result.revisions);
      setDraft(null);
      setSavedNote(`Saved as a new revision, effective ${inputFromDraft(draft).effectiveStart}.`);
      onSaved?.(studentId, result.projection);
    } catch (error) {
      setErrors(error?.errors?.length ? error.errors : [error?.message || 'The profile could not be saved.']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="se-stack" aria-labelledby={`support-profile-${studentId}`} data-support-profile-editor={studentId}>
      <div className="tw-row" style={{ justifyContent: 'space-between' }}>
        <h3 id={`support-profile-${studentId}`} style={{ margin: 0 }}>Support profile</h3>
        {!draft && (
          <button type="button" className="tw-btn tw-btn--primary tw-btn--sm" onClick={startDraft} disabled={loadState.loading}>
            {plan.source === 'none' ? 'Record a support profile' : 'Record a change'}
          </button>
        )}
      </div>

      {warnings.map((warning) => (
        <div key={warning.code} className="tw-notice" data-tone={warning.code === 'expired' || warning.code === 'extra-time-unset' ? 'warning' : undefined}>{warning.message}</div>
      ))}
      {savedNote && <div className="tw-notice" data-tone="success" role="status">{savedNote}</div>}
      {loadState.error && <div className="tw-notice" data-tone="danger" role="alert">{loadState.error}</div>}

      <CurrentProfileSummary plan={plan} revision={currentRevision} />

      {draft && (
        <form className="tw-card se-stack" onSubmit={save} aria-label="New support profile revision">
          <div className="tw-small tw-muted">
            A new revision never changes an earlier one. Work done before its effective date keeps the supports that applied then.
          </div>
          <div className="se-grid-2">
            <label className="se-field">
              <span>Takes effect on</span>
              <input className="tw-input" type="date" required value={draft.effectiveStart} onChange={(event) => setDraft((current) => ({ ...current, effectiveStart: event.target.value }))} />
            </label>
            <label className="se-field">
              <span>Ends on (optional)</span>
              <input className="tw-input" type="date" value={draft.effectiveEnd} onChange={(event) => setDraft((current) => ({ ...current, effectiveEnd: event.target.value }))} />
            </label>
            <label className="se-field">
              <span>Source document</span>
              <input className="tw-input" required maxLength={120} placeholder="e.g. IEP — annual review, 504 plan, ARD amendment" value={draft.sourceLabel} onChange={(event) => setDraft((current) => ({ ...current, sourceLabel: event.target.value }))} />
            </label>
            <fieldset className="se-fieldset">
              <legend>Status</legend>
              <label className="tw-row" style={{ gap: 6 }}>
                <input type="radio" name={`status-${studentId}`} checked={draft.status !== 'inactive'} onChange={() => setDraft((current) => ({ ...current, status: 'active' }))} /> Supports on
              </label>
              <label className="tw-row" style={{ gap: 6 }}>
                <input type="radio" name={`status-${studentId}`} checked={draft.status === 'inactive'} onChange={() => setDraft((current) => ({ ...current, status: 'inactive' }))} /> End supports from this date
              </label>
            </fieldset>
          </div>
          <label className="se-field">
            <span>Staff-only note (optional)</span>
            <textarea maxLength={600} value={draft.sourceNote} onChange={(event) => setDraft((current) => ({ ...current, sourceNote: event.target.value }))} />
            <span className="se-hint">Students and families using MathMaster never see this note. Keep it factual and brief.</span>
          </label>

          <label className="se-option">
            <input type="checkbox" checked={draft.inclusionStatus} onChange={(event) => setDraft((current) => ({ ...current, inclusionStatus: event.target.checked }))} />
            <span className="se-option__label">Inclusion / support status</span>
            <span className="se-option__meta">Also applies automatically: {INCLUSION_IMPLIED_SUPPORT_IDS.map((id) => supportLabel(id).toLowerCase()).join(', ')}.</span>
          </label>

          <fieldset className="se-fieldset">
            <legend>Accommodations — the platform provides</legend>
            <div className="se-hint">Change how the student reaches grade-level work. Mastery expectations do not change.</div>
            {groups.platformAccommodations.map((group) => (
              <div key={group.label}>
                <div className="se-group-label">{group.label}</div>
                {group.items.map((entry) => <SupportOption key={entry.id} entry={entry} group="accommodations" draft={draft} setDraft={setDraft} />)}
              </div>
            ))}
          </fieldset>

          <fieldset className="se-fieldset">
            <legend>Accommodations — an adult delivers</legend>
            <div className="se-hint">MathMaster cannot observe these. Record them from the student drawer or the assignment with one click.</div>
            {groups.staffAccommodations.map((group) => (
              <div key={group.label}>
                <div className="se-group-label">{group.label}</div>
                {group.items.map((entry) => <SupportOption key={entry.id} entry={entry} group="accommodations" draft={draft} setDraft={setDraft} />)}
              </div>
            ))}
          </fieldset>

          <fieldset className="se-fieldset" data-kind="modification">
            <legend><span className="se-tag" data-kind="modification">MOD</span> Modifications — change what the student is expected to learn</legend>
            <div className="se-hint">Work done under a modification is reported as Modified and never averaged with grade-level work as if the conditions were the same.</div>
            {groups.modifications.map((entry) => <SupportOption key={entry.id} entry={entry} group="modifications" draft={draft} setDraft={setDraft} />)}
          </fieldset>

          <fieldset className="se-fieldset">
            <legend>Service expectations</legend>
            <div className="se-hint">What the plan says, for comparison with minutes staff record in MathMaster. MathMaster does not determine compliance.</div>
            <ServiceRows rows={draft.serviceExpectations} services={groups.services} onChange={(rows) => setDraft((current) => ({ ...current, serviceExpectations: rows }))} />
          </fieldset>

          <label className="se-field" style={{ maxWidth: 520 }}>
            <span>Language for translated content (optional)</span>
            <input className="tw-input" maxLength={12} placeholder="e.g. es" list="se-language-codes" data-language-input style={{ maxWidth: 160 }} value={draft.translationLanguage} onChange={(event) => setDraft((current) => ({ ...current, translationLanguage: event.target.value }))} />
            <datalist id="se-language-codes">
              {LANGUAGE_CHOICES.map((choice) => <option key={choice.code} value={choice.code}>{choice.label}</option>)}
            </datalist>
            <span className="se-hint" data-language-coverage>{languageCoverageNote(draft.translationLanguage)}</span>
          </label>

          {errors.length > 0 && (
            <div className="tw-notice" data-tone="danger" role="alert">
              <strong>Not saved.</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{errors.map((message) => <li key={message}>{message}</li>)}</ul>
            </div>
          )}
          <div className="tw-row">
            <button type="submit" className="tw-btn tw-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save as a new revision'}</button>
            <button type="button" className="tw-btn" disabled={saving} onClick={() => { setDraft(null); setErrors([]); }}>Cancel</button>
          </div>
        </form>
      )}

      <details className="tw-disclosure">
        <summary>History <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{loadState.loading ? 'loading…' : `${history.length} revision${history.length === 1 ? '' : 's'} · immutable`}</span></summary>
        <div className="tw-disclosure__body">
          {history.length ? (
            <ul className="se-list">
              {history.map((revision) => (
                <li key={revision.id}>
                  <div className="se-list__head">
                    <span className="se-list__title">
                      {revision.legacySnapshot ? 'Snapshot of the pre-versioning profile' : `Revision ${revision.revision}`}
                      {' · '}{revision.effectiveStart ? `effective ${revision.effectiveStart}${revision.effectiveEnd ? ` to ${revision.effectiveEnd}` : ''}` : 'dates not recorded'}
                    </span>
                    <span className="se-list__meta">recorded {formatWhen(revision.createdAtMs)}{revision.createdByEmail ? ` by ${revision.createdByEmail}` : ''}</span>
                  </div>
                  <div className="se-list__meta">{revision.sourceLabel} · {describeRevision(revision)}</div>
                  {revision.sourceNote && <div className="tw-small">{revision.sourceNote}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="tw-small tw-muted">{loadState.loading ? 'Loading…' : 'No revisions recorded yet.'}</div>
          )}
        </div>
      </details>
    </section>
  );
}

import { useState } from 'react';
import {
  DISTRICT_ID_COPY,
  describeStudentDistrictId,
  districtIdChangePreview,
  sanitizeDistrictIdDraft,
  validateDistrictIdDraft,
} from '../../platform/teacher/studentDistrictIdModel.js';

/*
 * ADD OR CORRECT ONE STUDENT'S DISTRICT ID.
 *
 * One form for both places a teacher can do it — Student Access (the
 * canonical place to manage a student's identity) and Grade Export's district
 * ID list — so the explanation is the same wherever it is read. It shows the
 * two numbers side by side, says what a change does and does not do, and
 * previews the change before it is saved. Saving is the caller's: it goes
 * through the setStudentSisId callable, never a browser database write.
 */

const box = {
  flex: '1 1 100%',
  display: 'grid',
  gap: 10,
  padding: '12px 14px',
  marginTop: 4,
  border: '1px solid var(--mm-border)',
  borderRadius: 10,
  background: 'var(--mm-surface-sunken, var(--mm-surface))',
  textAlign: 'left',
};
const facts = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 10 };
const fact = { margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--mm-text-muted)' };
const strong = { display: 'block', color: 'var(--mm-text)', fontSize: 14 };
const input = {
  display: 'block',
  width: '100%',
  maxWidth: 260,
  boxSizing: 'border-box',
  minHeight: 38,
  marginTop: 4,
  padding: '0 12px',
  border: '1px solid var(--mm-border)',
  borderRadius: 8,
  fontSize: 15,
  fontVariantNumeric: 'tabular-nums',
};
const button = (primary) => ({
  minHeight: 36,
  padding: '0 14px',
  border: primary ? 0 : '1px solid var(--mm-border)',
  borderRadius: 8,
  background: primary ? '#1a73e8' : 'var(--mm-surface)',
  color: primary ? '#fff' : 'var(--mm-text)',
  fontWeight: 800,
  cursor: 'pointer',
});

export default function DistrictIdEditor({
  student,
  // How the student is named in the form's accessible name and the
  // confirmation: "Last, First · ID 111111".
  studentLabel = '',
  saving = false,
  // A refusal from the server (a duplicate, permission), shown under the form.
  error = '',
  // (districtId) => void — called with a validated, digits-only ID.
  onSave,
  onCancel,
}) {
  const described = describeStudentDistrictId(student);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState('');
  const preview = districtIdChangePreview({ currentDistrictId: described.districtId, draft });
  const shownError = localError || error;

  const submit = (event) => {
    event.preventDefault();
    const checked = validateDistrictIdDraft(draft);
    if (!checked.ok) {
      setLocalError(checked.error);
      return;
    }
    setLocalError('');
    onSave?.(checked.value);
  };

  return (
    <form
      onSubmit={submit}
      aria-label={`${described.actionLabel} for ${studentLabel}`}
      data-district-id-editor={described.accountId}
      style={box}
    >
      <div style={facts}>
        <p style={fact}>
          <strong style={strong}>{DISTRICT_ID_COPY.accountIdLabel} {described.accountId}</strong>
          {DISTRICT_ID_COPY.accountIdHelp}
        </p>
        <p style={fact}>
          <strong style={strong}>{described.districtId ? `Current district ID ${described.districtId}` : 'No district ID on file'}</strong>
          {DISTRICT_ID_COPY.districtIdHelp}
        </p>
      </div>

      <label style={{ fontSize: 13, fontWeight: 900, color: 'var(--mm-text)' }}>
        {DISTRICT_ID_COPY.inputLabel}
        <input
          autoFocus
          value={draft}
          onChange={(event) => { setDraft(sanitizeDistrictIdDraft(event.target.value)); setLocalError(''); }}
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          placeholder="Digits only"
          aria-invalid={shownError ? 'true' : 'false'}
          style={input}
        />
      </label>
      {preview && <p aria-live="polite" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--mm-primary-text, var(--mm-text))' }}>{preview}</p>}

      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--mm-text-muted)' }}>
        <strong style={{ color: 'var(--mm-text)' }}>{DISTRICT_ID_COPY.effectsHeading}</strong>
        <ul style={{ margin: '3px 0 0', paddingLeft: 20 }}>
          {DISTRICT_ID_COPY.effects.map((effect) => <li key={effect}>{effect}</li>)}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving || !draft} style={{ ...button(true), opacity: saving || !draft ? 0.6 : 1 }}>
          {saving ? 'Saving…' : DISTRICT_ID_COPY.saveAction}
        </button>
        <button type="button" disabled={saving} onClick={() => onCancel?.()} style={button(false)}>Cancel</button>
      </div>
      {shownError && <p role="alert" style={{ margin: 0, color: 'var(--mm-error-text)', fontSize: 13, lineHeight: 1.45 }}>{shownError}</p>}
    </form>
  );
}

import { useEffect, useMemo, useState } from 'react';
import MathInput from '../../MathInput.jsx';
import MathText from '../common/MathText.jsx';
import { liveChallengeResponseReadiness } from '../../../functions/shared/liveChallenge.mjs';

const CHOICE_PROFILES = new Set([
  'choice', 'multiplechoice', 'multiple-choice', 'singlechoice', 'single-choice', 'select',
]);

const MATH_PROFILES = new Set([
  'basic', 'math', 'expression', 'equation', 'interval', 'inequality', 'set', 'function',
  'algebra-operation', 'basic+set', 'number', 'numeric', 'integer', 'decimal', 'fraction',
  'orderedpair', 'ordered-pair',
]);

const profileOf = (field = {}) => String(
  field?.inputProfile ?? field?.inputMode ?? field?.type ?? '',
).trim().toLowerCase();

const choicesFor = (question, field) => (
  Array.isArray(field?.choices) && field.choices.length
    ? field.choices
    : (Array.isArray(question?.choices) ? question.choices : [])
);

const mathToolProfile = (field = {}) => {
  const profile = profileOf(field);
  if (['number', 'numeric', 'integer', 'decimal', 'fraction'].includes(profile)) return 'number';
  if (['orderedpair', 'ordered-pair'].includes(profile)) return 'orderedPair';
  return profile || 'basic';
};

const hasMathContract = (field = {}) => (
  MATH_PROFILES.has(profileOf(field))
  || Boolean(field?.answerFormat)
  || Boolean(field?.inputContract?.format)
  || (Array.isArray(field?.requiredSymbols) && field.requiredSymbols.length > 0)
  || (Array.isArray(field?.inputContract?.requiredSymbols) && field.inputContract.requiredSymbols.length > 0)
);

function ResponseBadge({ readiness }) {
  const bad = !readiness?.eligible;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 26,
        padding: '3px 9px',
        borderRadius: 999,
        background: bad ? '#fce8e6' : '#e8f0fe',
        color: bad ? '#b3261e' : '#174ea6',
        border: `1px solid ${bad ? '#f4b8b2' : '#c6dafc'}`,
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {readiness?.label || 'Response'}
    </span>
  );
}

function ChoiceField({ question, field, value, disabled, onChange }) {
  const choices = choicesFor(question, field);
  return (
    <fieldset disabled={disabled} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
      <legend style={{ marginBottom: 8, fontWeight: 900 }}>
        <MathText as="span">{`${field.label || 'Choose an answer'}${field.unit ? ` (${field.unit})` : ''}`}</MathText>
      </legend>
      {field.responseHint && (
        <MathText as="div" style={{ margin: '-2px 0 9px', color: '#667085', fontSize: 13 }}>
          {field.responseHint}
        </MathText>
      )}
      <div role="radiogroup" aria-label={field.label || 'Choose an answer'} style={{ display: 'grid', gap: 9 }}>
        {choices.map((choice, index) => {
          const id = String(choice?.id ?? choice?.value ?? `choice-${index + 1}`);
          const label = String(choice?.label ?? choice?.text ?? choice?.value ?? choice ?? '');
          const selected = String(value ?? '') === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(id)}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '10px 13px',
                borderRadius: 10,
                border: selected ? '3px solid #1a73e8' : '2px solid #c7ccd1',
                background: selected ? '#e8f0fe' : '#fff',
                color: '#202124',
                textAlign: 'left',
                fontSize: 17,
                fontWeight: selected ? 900 : 700,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              <MathText as="span">{label}</MathText>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function MathField({ field, value, disabled, onChange, onSubmit }) {
  const requiredSymbols = Array.isArray(field?.requiredSymbols)
    ? field.requiredSymbols
    : (Array.isArray(field?.inputContract?.requiredSymbols) ? field.inputContract.requiredSymbols : []);
  return (
    <div style={{ display: 'grid', gap: 7, opacity: disabled ? 0.78 : 1 }} aria-disabled={disabled || undefined}>
      <div style={{ fontWeight: 900 }}>
        <MathText as="span">{`${field.label || 'Answer'}${field.unit ? ` (${field.unit})` : ''}`}</MathText>
      </div>
      {field.responseHint && (
        <MathText as="div" style={{ color: '#667085', fontSize: 13 }}>
          {field.responseHint}
        </MathText>
      )}
      <div style={disabled ? { pointerEvents: 'none' } : undefined}>
        <MathInput
          value={value ?? ''}
          onChange={(next) => { if (!disabled) onChange(next); }}
          onSubmit={() => { if (!disabled) onSubmit(); }}
          placeholder={field.placeholder || ''}
          ariaLabel={field.label || 'Answer'}
          showToolsInitially
          toolProfile={mathToolProfile(field)}
          answerFormat={field.answerFormat || field?.inputContract?.format || ''}
          requiredSymbols={requiredSymbols}
          compact
          maxWidth={820}
        />
      </div>
    </div>
  );
}

function TextField({ field, value, disabled, onChange, onSubmit, autoFocus }) {
  return (
    <label style={{ fontWeight: 800 }}>
      <MathText as="span">{`${field.label || 'Answer'}${field.unit ? ` (${field.unit})` : ''}`}</MathText>
      {field.responseHint && (
        <MathText as="div" style={{ marginTop: 5, color: '#667085', fontSize: 13, fontWeight: 500 }}>
          {field.responseHint}
        </MathText>
      )}
      <input
        autoFocus={autoFocus}
        type="text"
        value={value ?? ''}
        placeholder={field.placeholder || ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') onSubmit(); }}
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 12, border: '2px solid #c7ccd1', borderRadius: 8, fontSize: 18 }}
      />
    </label>
  );
}

/**
 * The field-graded Live Challenge renderer.
 *
 * It owns presentation only. The values below are the sanitized runtime values
 * from Path; correctness is still decided by the existing server callable.
 */
export default function LiveChallengeFieldQuestion({ question, disabled, onSubmit }) {
  const fields = question?.responseFields?.length ? question.responseFields : [];
  const readiness = useMemo(() => liveChallengeResponseReadiness(question), [question]);
  const [responses, setResponses] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => setResponses({}), [question?.questionInstanceId]);

  const complete = readiness.eligible
    && fields.length > 0
    && fields.every((field) => String(responses[field.id] ?? '').trim() !== '');

  const submit = async () => {
    if (!complete || disabled || busy) return;
    setBusy(true);
    try { await onSubmit({ responses }); }
    finally { setBusy(false); }
  };

  if (!readiness.eligible) {
    return (
      <section style={{ padding: 20, borderRadius: 14, background: '#fff', border: '2px solid #d93025', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ color: '#174ea6', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{question?.teksCode || 'Live Challenge'}</div>
          <ResponseBadge readiness={readiness} />
        </div>
        <MathText as="h2" style={{ margin: '8px 0 14px', whiteSpace: 'pre-wrap', lineHeight: 1.45, fontSize: 22 }}>
          {question?.prompt}
        </MathText>
        <div role="alert" style={{ padding: 13, borderRadius: 9, background: '#fce8e6', color: '#8c1d18', fontWeight: 900 }}>
          This question cannot be answered safely in Live Challenge. Replace this round before students play.
        </div>
      </section>
    );
  }

  return (
    <section className="mathmaster-question-container" style={{ padding: 20, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ color: '#174ea6', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{question?.teksCode || 'Live Challenge'}</div>
        <ResponseBadge readiness={readiness} />
      </div>
      <MathText as="h2" style={{ margin: '8px 0 18px', whiteSpace: 'pre-wrap', lineHeight: 1.45, fontSize: 22 }}>
        {question?.prompt}
      </MathText>
      <div style={{ display: 'grid', gap: 15 }}>
        {fields.map((field, fieldIndex) => {
          const profile = profileOf(field);
          const locked = disabled || busy;
          const setValue = (next) => setResponses((current) => ({ ...current, [field.id]: next }));
          if (CHOICE_PROFILES.has(profile)) {
            return (
              <ChoiceField
                key={field.id}
                question={question}
                field={field}
                value={responses[field.id]}
                disabled={locked}
                onChange={setValue}
              />
            );
          }
          if (hasMathContract(field)) {
            return (
              <MathField
                key={field.id}
                field={field}
                value={responses[field.id]}
                disabled={locked}
                onChange={setValue}
                onSubmit={submit}
              />
            );
          }
          return (
            <TextField
              key={field.id}
              field={field}
              value={responses[field.id]}
              disabled={locked}
              onChange={setValue}
              onSubmit={submit}
              autoFocus={fieldIndex === 0}
            />
          );
        })}
      </div>
      <button type="button" disabled={!complete || disabled || busy} onClick={submit} style={{ marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: !complete || disabled || busy ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900 }}>
        {busy ? 'Checking…' : 'Lock In Answer'}
      </button>
    </section>
  );
}

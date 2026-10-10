import { useEffect, useId, useMemo, useRef, useState } from 'react';
import MathInput from '../../MathInput.jsx';
import MathText from '../common/MathText.jsx';
import { liveChallengeResponseReadiness } from '../../../functions/shared/liveChallenge.mjs';
import { radioGroupKeyAction, radioTabStopIndex } from '../../platform/interaction/radioGroupKeys.js';

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
        background: bad ? 'var(--mm-error-bg)' : 'var(--mm-primary-soft)',
        color: bad ? 'var(--mm-error-text)' : 'var(--mm-primary-text)',
        border: `1px solid ${bad ? 'var(--mm-error-border-soft)' : 'var(--mm-tint-border)'}`,
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      {readiness?.label || 'Response'}
    </span>
  );
}

// A proper radio group (radioGroupKeys.js): one tab stop, arrows move focus
// AND select, Space selects. Nothing here locks an answer in — that stays the
// explicit Lock In Answer press below.
function ChoiceField({ question, field, value, disabled, onChange }) {
  const choices = choicesFor(question, field);
  const legendId = useId();
  const optionRefs = useRef([]);
  const options = choices.map((choice, index) => ({
    id: String(choice?.id ?? choice?.value ?? `choice-${index + 1}`),
    label: String(choice?.label ?? choice?.text ?? choice?.value ?? choice ?? ''),
  }));
  const tabStop = radioTabStopIndex(options.map((option) => option.id), value);
  const onKeyDown = (event, index) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = radioGroupKeyAction(event.key, index, options.length);
    if (!action) return;
    event.preventDefault();
    const target = options[action.index];
    if (!target) return;
    onChange(target.id);
    if (action.type === 'move') optionRefs.current[action.index]?.focus();
  };
  return (
    <fieldset disabled={disabled} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
      <legend id={legendId} style={{ marginBottom: 8, fontWeight: 900 }}>
        <MathText as="span">{`${field.label || 'Choose an answer'}${field.unit ? ` (${field.unit})` : ''}`}</MathText>
      </legend>
      {field.responseHint && (
        <MathText as="div" style={{ margin: '-2px 0 9px', color: 'var(--mm-text-muted)', fontSize: 13 }}>
          {field.responseHint}
        </MathText>
      )}
      <div role="radiogroup" aria-labelledby={legendId} aria-disabled={disabled || undefined} style={{ display: 'grid', gap: 9 }}>
        {options.map(({ id, label }, index) => {
          const selected = String(value ?? '') === id;
          return (
            <button
              key={id}
              ref={(node) => { optionRefs.current[index] = node; }}
              type="button"
              role="radio"
              aria-checked={selected}
              data-choice-id={id}
              tabIndex={index === tabStop ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              style={{
                width: '100%',
                minHeight: 48,
                padding: '10px 13px',
                borderRadius: 10,
                border: selected ? '3px solid #1a73e8' : '2px solid var(--mm-border)',
                background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
                color: 'var(--mm-text-strong)',
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
        <MathText as="div" style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>
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
        <MathText as="div" style={{ marginTop: 5, color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 500 }}>
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
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 12, border: '2px solid var(--mm-border)', borderRadius: 8, fontSize: 18 }}
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
function LiveChallengeFieldQuestionView({ question, disabled, onSubmit }) {
  const fields = question?.responseFields?.length ? question.responseFields : [];
  const readiness = useMemo(() => liveChallengeResponseReadiness(question), [question]);
  const [responses, setResponses] = useState({});
  const [busy, setBusy] = useState(false);
  // Set by THIS student's Lock In press. While the answer is locked (the round
  // disables the field), focus sits on the "locked in" note below, never on
  // <body>: the press disables every control the student was on.
  const [lockPressed, setLockPressed] = useState(false);
  const lockStatusRef = useRef(null);
  const lockButtonRef = useRef(null);
  const lockedByPress = lockPressed && (disabled || busy);

  useEffect(() => {
    setResponses({});
    setLockPressed(false);
  }, [question?.questionInstanceId]);

  useEffect(() => {
    if (!lockPressed) return;
    if (disabled || busy) {
      lockStatusRef.current?.focus();
      return;
    }
    // The round refused the press (nothing was locked): back to the button.
    setLockPressed(false);
    lockButtonRef.current?.focus();
  }, [lockPressed, disabled, busy]);

  const complete = readiness.eligible
    && fields.length > 0
    && fields.every((field) => String(responses[field.id] ?? '').trim() !== '');

  const submit = async () => {
    if (!complete || disabled || busy) return;
    setLockPressed(true);
    setBusy(true);
    try { await onSubmit({ responses }); }
    finally { setBusy(false); }
  };

  if (!readiness.eligible) {
    return (
      <section style={{ padding: 20, borderRadius: 14, background: 'var(--mm-surface)', border: '2px solid #d93025', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ color: 'var(--mm-primary-text)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{question?.teksCode || 'Live Challenge'}</div>
          <ResponseBadge readiness={readiness} />
        </div>
        <MathText as="h2" style={{ margin: '8px 0 14px', whiteSpace: 'pre-wrap', lineHeight: 1.45, fontSize: 22 }}>
          {question?.prompt}
        </MathText>
        <div role="alert" style={{ padding: 13, borderRadius: 9, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', fontWeight: 900 }}>
          This question cannot be answered safely in Live Challenge. Replace this round before students play.
        </div>
      </section>
    );
  }

  return (
    <section className="mathmaster-question-container" style={{ padding: 20, borderRadius: 14, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--mm-primary-text)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{question?.teksCode || 'Live Challenge'}</div>
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
      <button ref={lockButtonRef} type="button" disabled={!complete || disabled || busy} onClick={submit} style={{ marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: !complete || disabled || busy ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900 }}>
        {busy ? 'Checking…' : 'Lock In Answer'}
      </button>
      {lockedByPress && (
        <p ref={lockStatusRef} tabIndex={-1} data-mm-lock-status="1" style={{ margin: '12px 0 0', fontWeight: 900, color: 'var(--mm-text-strong)' }}>
          Your answer is locked in.
        </p>
      )}
    </section>
  );
}

/*
 * Re-rendered only when what it SHOWS changes — the question, or whether it is
 * locked. The round around it redraws its clock four times a second and its
 * board on every classmate's progress; none of that reaches the choices or the
 * math they render. `onSubmit` always reaches the round's latest submit
 * through a ref, so a skipped render can never hold an old one.
 */
export default function LiveChallengeFieldQuestion({ question, disabled, onSubmit }) {
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const stableSubmit = useMemo(() => (...args) => submitRef.current?.(...args), []);
  return useMemo(
    () => <LiveChallengeFieldQuestionView question={question} disabled={disabled} onSubmit={stableSubmit} />,
    [question, disabled, stableSubmit],
  );
}

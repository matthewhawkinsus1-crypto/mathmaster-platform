import React, { useMemo, useState } from 'react';
import CalculatorPanel from '../CalculatorPanel.jsx';
import MathText from '../common/MathText.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import PathQuestionStimulus from '../student/PathQuestionStimulus.jsx';
import { resolveExamCalculatorPolicy } from '../../platform/policies/examPolicyResolver.js';

const isNumericProfile = (profile) => ['number', 'numeric', 'decimal'].includes(String(profile || '').toLowerCase());

export const SecureExamQuestionPlayer = ({ examType, question, initialResponsePayload = null, studentSupportProfile, accommodationConfirmed = false, busy = false, onSubmit, onDraftChange }) => {
  const [responses, setResponses] = useState(() => initialResponsePayload?.responses || {});
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const fields = question?.responseFields?.length ? question.responseFields : [{ id: 'answer', label: 'Answer', inputProfile: 'text' }];
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  const calculatorPolicy = useMemo(() => resolveExamCalculatorPolicy({
    examType,
    questionSpec: question || {},
    studentSupportProfile,
    accommodationConfirmed,
    isComputationSkill: question?.assessedConstruct === 'computation',
  }), [examType, question, studentSupportProfile, accommodationConfirmed]);
  const complete = fields.every((field) => String(responses[field.id] ?? '').trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!complete || busy) return;
    await onSubmit?.({ responses }, { calculatorUsed, accommodations: studentSupportProfile?.accommodations || [], modifications: studentSupportProfile?.modifications || [] });
  };
  const updateResponse = (id, value) => {
    setResponses((current) => {
      const next = { ...current, [id]: value };
      onDraftChange?.({ responses: next }, { calculatorUsed, accommodations: studentSupportProfile?.accommodations || [], modifications: studentSupportProfile?.modifications || [] });
      return next;
    });
  };

  if (!question) return <div style={{ padding: 36, textAlign: 'center', color: '#5f6368' }}>Preparing the next secure item…</div>;
  return (
    <main style={{ width: 'min(820px, 100%)', margin: '0 auto', padding: '28px 18px 64px', boxSizing: 'border-box' }}>
      <section style={{ background: '#fff', border: '1px solid #dadce0', borderRadius: 14, padding: 'clamp(18px, 4vw, 30px)', boxShadow: '0 5px 22px rgba(0,0,0,.07)' }}>
        <div style={{ color: '#5f6368', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Secure exam question</div>
        {/* Secure mode deliberately hides TEKS/domain labels while answering,
            but the mathematics itself must still render exactly as authored. */}
        <MathText as="h1" style={{ color: '#202124', fontSize: 'clamp(20px, 4vw, 27px)', lineHeight: 1.45, margin: '10px 0 24px', fontWeight: 760 }}>{question.prompt}</MathText>
        {question.formulaLatex && <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 18, overflowX: 'auto' }}><MathDisplay value={question.formulaLatex} /></div>}
        <PathQuestionStimulus stimulus={question.stimulus} />
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: 15 }}>
            {fields.map((field, fieldIndex) => (
              <fieldset key={field.id} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 13, fontWeight: 900, color: '#3c4043', marginBottom: 7 }}>
                  <MathText>{field.label || `Response ${fieldIndex + 1}`}{field.unit ? ` (${field.unit})` : ''}</MathText>
                </legend>
                {choices.length && fields.length === 1 ? choices.map((choice) => {
                  const selected = responses[field.id] === choice.id;
                  return (
                    <label key={choice.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 13px', marginBottom: 8, border: selected ? '2px solid #1a73e8' : '1px solid #c7ccd1', borderRadius: 9, cursor: 'pointer', background: selected ? '#eef4ff' : '#fff', boxShadow: selected ? '0 0 0 1px rgba(26,115,232,.08)' : 'none' }}>
                      <input type="radio" name={field.id} value={choice.id} checked={selected} onChange={(event) => updateResponse(field.id, event.target.value)} style={{ marginTop: 3 }} />
                      <MathText style={{ lineHeight: 1.5 }}>{choice.label}</MathText>
                    </label>
                  );
                }) : (
                  <input
                    autoComplete="off"
                    // Keep this a text input even for numeric SPR items. HTML
                    // number inputs reject valid assessment responses such as
                    // 3/4; inputMode still gives a numeric-friendly keyboard.
                    type="text"
                    inputMode={isNumericProfile(field.inputProfile) ? 'decimal' : undefined}
                    value={responses[field.id] ?? ''}
                    onChange={(event) => updateResponse(field.id, event.target.value)}
                    aria-label={field.label || `Response ${fieldIndex + 1}`}
                    style={{ width: '100%', minHeight: 48, padding: '10px 12px', border: '2px solid #c7ccd1', borderRadius: 8, boxSizing: 'border-box', fontSize: 17 }}
                  />
                )}
              </fieldset>
            ))}
          </div>
          <button type="submit" disabled={!complete || busy} style={{ width: '100%', minHeight: 48, marginTop: 22, border: 0, borderRadius: 9, background: !complete || busy ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900, cursor: !complete || busy ? 'not-allowed' : 'pointer' }}>{busy ? 'Recording securely…' : 'Record answer & continue'}</button>
        </form>
      </section>
      <CalculatorPanel policy={calculatorPolicy} onCalculatorOpened={() => setCalculatorUsed(true)} />
    </main>
  );
};

export default SecureExamQuestionPlayer;

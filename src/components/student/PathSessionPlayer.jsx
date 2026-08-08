import React, { useMemo, useState } from 'react';
import CalculatorPanel from '../CalculatorPanel.jsx';
import ProblemUnderstandingPanel from '../ProblemUnderstandingPanel.jsx';
import { getEffectiveActivityPolicy } from '../../platform/policies/activityPolicies.js';
import { resolveCalculatorPolicy } from '../../platform/policies/calculatorPolicy.js';

export const PathSessionPlayer = ({ session, questionInstance, lastGradingResult, isSubmitting, studentProfile, onSubmitAnswer }) => {
  const [responses, setResponses] = useState({});
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const [contextScaffoldUsed, setContextScaffoldUsed] = useState(false);
  const activityRole = questionInstance?.activityRole || 'practice';
  const activityPolicy = getEffectiveActivityPolicy(activityRole);
  const calculatorPolicy = useMemo(() => resolveCalculatorPolicy({
    questionSpec: questionInstance || {},
    activityPolicy,
    studentSupportProfile: studentProfile,
  }), [questionInstance, activityPolicy, studentProfile]);

  if (!questionInstance) return <div style={{ padding: '50px', textAlign: 'center', color: '#5f6368' }}>Preparing the next question…</div>;
  const fields = questionInstance.responseFields?.length
    ? questionInstance.responseFields
    : [{ id: 'answer', label: 'Answer', inputProfile: 'text' }];
  const complete = fields.every((field) => String(responses[field.id] ?? '').trim() !== '');
  const attemptsUsed = Number(questionInstance.attemptsUsed ?? lastGradingResult?.attemptNumber) || 0;
  const attemptsAllowed = Number(questionInstance.attemptsAllowed) || activityPolicy.attempts;
  const rigorLabel = ({
    individualEnrichment: 'Individual enrichment',
    honorsRepair: 'Prerequisite repair → Honors target',
    honorsExtension: 'Honors extension',
    honors: 'Honors rigor',
    repair: 'Targeted prerequisite support',
    standard: 'On-track practice',
  })[questionInstance.adaptiveRigor?.mode] || null;

  const submit = async (event) => {
    event.preventDefault();
    if (!complete || isSubmitting) return;
    await onSubmitAnswer?.(
      { responses },
      {
        calculatorUsed,
        contextScaffoldUsed,
        hintUsed: false,
        teacherAssisted: false,
        scaffoldUsed: false,
        remediationUsed: false,
        workedExampleUsed: false,
        isMathematicallyIndependent: true,
      },
    );
  };

  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 18px 50px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', color: '#5f6368', fontSize: '12px' }}>
        <strong style={{ color: '#174ea6' }}>{session?.sessionKind === 'retentionProbe' ? 'Retention Quick Check' : 'My Math Path Practice'} · {session?.target?.alignmentKey}</strong>
        <span>{session?.summary?.completedQuestions || 0} of {session?.requiredQuestions || 5} complete · {Math.max(0, attemptsAllowed - attemptsUsed)} attempts remaining</span>
      </div>

      <section style={{ padding: '24px', border: '1px solid #dadce0', borderRadius: '13px', background: '#fff', textAlign: 'left', boxShadow: '0 4px 18px rgba(0,0,0,.06)' }}>
        {questionInstance.context?.scenario && (
          <ProblemUnderstandingPanel context={questionInstance.context} onScaffoldComplete={() => setContextScaffoldUsed(true)} />
        )}
        <div style={{ color: '#5f6368', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>DOK {questionInstance.dok || '—'} · Band {questionInstance.difficultyBand || '—'}{rigorLabel ? ` · ${rigorLabel}` : ''}</div>
        <h1 style={{ margin: '9px 0 22px', fontSize: '23px', color: '#202124', lineHeight: 1.45 }}>{questionInstance.prompt}</h1>

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: '14px' }}>
            {fields.map((field) => (
              <label key={field.id} style={{ fontSize: '13px', fontWeight: 800, color: '#3c4043' }}>
                {field.label || 'Answer'}{field.unit ? ` (${field.unit})` : ''}
                <input
                  type={field.inputProfile === 'number' || field.inputProfile === 'numeric' ? 'number' : 'text'}
                  inputMode={field.inputProfile === 'number' || field.inputProfile === 'numeric' ? 'decimal' : undefined}
                  value={responses[field.id] ?? ''}
                  onChange={(event) => setResponses((current) => ({ ...current, [field.id]: event.target.value }))}
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '6px', padding: '12px', border: '2px solid #c7ccd1', borderRadius: '8px', fontSize: '17px' }}
                />
              </label>
            ))}
          </div>

          {lastGradingResult && (
            <div aria-live="polite" style={{ marginTop: '16px', padding: '11px 13px', borderRadius: '8px', background: lastGradingResult.isCorrect ? '#e6f4ea' : '#fff4ce', color: lastGradingResult.isCorrect ? '#137333' : '#7a4f00' }}>
              <strong>{lastGradingResult.isCorrect ? 'Correct.' : lastGradingResult.questionFinalized ? 'Recorded. Moving forward.' : 'Not yet. Try again.'}</strong>
            </div>
          )}

          <button type="submit" disabled={!complete || isSubmitting} style={{ width: '100%', marginTop: '20px', padding: '12px 16px', border: 0, borderRadius: '8px', background: !complete || isSubmitting ? '#dadce0' : '#1a73e8', color: '#fff', fontSize: '15px', fontWeight: 900, cursor: !complete || isSubmitting ? 'not-allowed' : 'pointer' }}>{isSubmitting ? 'Checking securely…' : 'Submit answer'}</button>
        </form>
      </section>

      <CalculatorPanel policy={calculatorPolicy} onCalculatorOpened={() => setCalculatorUsed(true)} />
    </main>
  );
};

export default PathSessionPlayer;

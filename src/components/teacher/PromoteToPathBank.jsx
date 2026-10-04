import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { evaluatePromotion } from '../../../functions/shared/pathPromotion.mjs';
import { validateToolQuestion } from '../../tools/toolSchemas';
import { getToolDefinition } from '../../tools/toolRegistry';

// Adding a teacher's question to the secure Path bank.
//
// An assignment question is something written for one class this week. A Path
// bank question is content MathMaster will hand to any student as the basis of
// a mastery claim. Making the first is not consent to the second, so this is an
// explicit act with a visible gate — and the gate runs here, before the button
// is pressed, using the same function the server will use, so nothing is a
// surprise.

const card = { border: '1px solid var(--mm-border)', borderRadius: 12, padding: '18px 20px', marginBottom: 16, background: 'var(--mm-surface)', textAlign: 'left' };
const primary = { minHeight: 42, padding: '0 16px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const quiet = { minHeight: 38, padding: '0 13px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 700, cursor: 'pointer' };

const MARK = { true: '✓', false: '✕', null: '–' };
const MARK_COLOR = { true: 'var(--mm-success-text)', false: 'var(--mm-error-text)', null: 'var(--mm-warning-text)' };

// Run the tool's own schema check so the gate reports it rather than skipping
// it. Only the registry tools have one; for the older grader types the check is
// left unverified, which the gate shows as "–" rather than pretending it passed.
const schemaFor = (question) => {
  const toolId = question?.toolId || question?.type;
  if (!getToolDefinition(toolId)) return null;
  try {
    return validateToolQuestion(question);
  } catch {
    return null;
  }
};

export default function PromoteToPathBank({ assignment, onClose }) {
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});
  const [error, setError] = useState(null);

  const questions = useMemo(() => (assignment?.questions || []).map((question, index) => {
    const schemaResult = schemaFor(question);
    return { index, question, evaluation: evaluatePromotion(question, { schemaResult }), schemaResult };
  }), [assignment]);

  const promotable = questions.filter((entry) => entry.evaluation.canPromote);
  const standardsAdded = useMemo(
    () => [...new Set(promotable.flatMap((entry) => entry.evaluation.standards))].sort(),
    [promotable],
  );

  const promote = async (entry) => {
    setBusy(entry.index);
    setError(null);
    try {
      const call = httpsCallable(functions, 'promoteQuestionToPathBank');
      const result = await call({
        assignmentId: assignment.id,
        questionIndex: entry.index,
        schemaResult: entry.schemaResult,
      });
      setResults((current) => ({ ...current, [entry.index]: result.data }));
    } catch (caught) {
      setError(caught.message || 'Could not add that question to the Path bank.');
    } finally {
      setBusy(null);
    }
  };

  const promoteAll = async () => {
    for (const entry of promotable) {
      if (results[entry.index]) continue;
      // eslint-disable-next-line no-await-in-loop
      await promote(entry);
    }
  };

  return (
    <div role="dialog" aria-label="Add questions to the Path bank" style={{ position: 'fixed', inset: 0, background: 'rgba(32,33,36,.55)', zIndex: 60, overflowY: 'auto', padding: 20 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', background: 'var(--mm-surface-sunken)', borderRadius: 14, overflow: 'hidden' }}>
        <header style={{ padding: '20px 24px', background: 'var(--mm-surface)', borderBottom: '1px solid var(--mm-border-soft)' }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Add to My Math Path bank</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.6, maxWidth: 720 }}>
            Questions in the Path bank are given to any student as independent practice, and what a student does with them
            becomes mastery evidence. That is a stronger promise than an assignment makes, so each question is checked
            before it can be added — and adding one here does not change your assignment.
          </p>
        </header>

        <div style={{ padding: 20 }}>
          {error && <div role="alert" style={{ ...card, background: 'var(--mm-error-bg)', borderColor: 'var(--mm-error-border-soft)', color: 'var(--mm-error-text)' }}>{error}</div>}

          <section style={{ ...card, background: promotable.length ? 'var(--mm-primary-soft)' : 'var(--mm-warning-bg)' }}>
            <strong style={{ fontSize: 15 }}>
              {promotable.length} of {questions.length} question{questions.length === 1 ? '' : 's'} can be added.
            </strong>
            {standardsAdded.length > 0 && (
              <p style={{ margin: '8px 0 0', color: 'var(--mm-primary-text)', fontSize: 13, lineHeight: 1.55 }}>
                This would add Path content for: <strong>{standardsAdded.join(', ')}</strong>.
              </p>
            )}
            {promotable.length > 0 && (
              <button type="button" style={{ ...primary, marginTop: 12 }} onClick={promoteAll} disabled={busy !== null}>
                {busy !== null ? 'Adding…' : `Add all ${promotable.length}`}
              </button>
            )}
          </section>

          {questions.map((entry) => {
            const done = results[entry.index];
            return (
              <section key={entry.index} style={{ ...card, borderColor: entry.evaluation.canPromote ? 'var(--mm-success-border)' : 'var(--mm-error-border-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: '1 1 380px' }}>
                    <strong>Question {entry.index + 1}</strong>
                    <div style={{ color: 'var(--mm-text)', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{entry.question.prompt || '(no prompt)'}</div>
                    {entry.evaluation.standards.length > 0 && (
                      <div style={{ color: 'var(--mm-text-muted)', fontSize: 12, marginTop: 5 }}>Standard: {entry.evaluation.standards.join(', ')}</div>
                    )}
                  </div>
                  <div>
                    {done
                      ? <span style={{ color: 'var(--mm-success-text)', fontWeight: 900 }}>Added ✓</span>
                      : entry.evaluation.canPromote
                        ? <button type="button" style={primary} disabled={busy !== null} onClick={() => promote(entry)}>{busy === entry.index ? 'Adding…' : 'Add to Path bank'}</button>
                        : <span style={{ color: 'var(--mm-error-text)', fontWeight: 900 }}>Cannot be added</span>}
                  </div>
                </div>

                <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                  {entry.evaluation.checks.map((item) => (
                    <li key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                      <span aria-hidden="true" style={{ color: MARK_COLOR[String(item.passed)], fontWeight: 900, width: 14 }}>{MARK[String(item.passed)]}</span>
                      <span style={{ color: item.passed === false ? 'var(--mm-error-text)' : 'var(--mm-text)' }}>
                        {item.label}
                        {item.detail && <span style={{ color: 'var(--mm-text-muted)' }}> — {item.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
            <button type="button" style={quiet} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

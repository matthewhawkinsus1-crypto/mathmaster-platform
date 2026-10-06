import React, { useEffect, useState } from 'react';
import MathText from '../common/MathText.jsx';
import StandardBadge from '../common/StandardBadge.jsx';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/assessmentCrosswalk.js';
import { getStudentSecureExamReview } from '../../services/secureExamService.js';
import { describeToolWork, rawToolWorkOf, toolWorkLabel } from '../../platform/assessment/secureToolWorkSummary.js';

const firstTeks = (item) => (Array.isArray(item?.alignmentKeys) ? item.alignmentKeys.find((key) => String(key || '').toLowerCase().startsWith('texas:')) : null) || item?.questionSnapshot?.alignmentKey || '';

const responseRows = (item) => {
  // A Rich Tool answer is a construction, read back in the student's values.
  const toolId = item?.pathToolId || item?.questionSnapshot?.pathToolId || null;
  if (toolId) {
    const rows = describeToolWork(toolId, rawToolWorkOf(item?.responsePayload));
    return rows.length
      ? rows.map((row) => ({ id: row.id, label: row.label, value: row.value }))
      : [{ id: 'tool', label: 'Your response', value: `Your work in the ${toolWorkLabel(toolId)} was recorded.` }];
  }
  const responses = item?.responsePayload?.responses && typeof item.responsePayload.responses === 'object'
    ? item.responsePayload.responses
    : {};
  const fields = Array.isArray(item?.questionSnapshot?.responseFields) ? item.questionSnapshot.responseFields : [];
  const choices = Array.isArray(item?.questionSnapshot?.choices) ? item.questionSnapshot.choices : [];
  return Object.entries(responses).map(([fieldId, raw]) => {
    const field = fields.find((entry) => entry.id === fieldId);
    const choice = choices.find((entry) => entry.id === raw);
    return {
      id: fieldId,
      label: field?.label || 'Your response',
      value: choice?.label || String(raw ?? ''),
    };
  });
};

export default function SecureExamReview({ examSessionId, onBack }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getStudentSecureExamReview({ examSessionId })
      .then((result) => { if (active) { setReview(result.review || null); setError(''); } })
      .catch((loadError) => { if (active) setError(loadError.message || 'Feedback review could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [examSessionId]);

  if (loading) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', color: 'var(--mm-text-muted)' }}>Loading released feedback…</div>;
  if (error || !review) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20 }}><section style={{ width: 'min(620px,100%)', padding: 24, border: '1px solid var(--mm-border)', borderRadius: 12, background: 'var(--mm-surface)' }}><p role="alert" style={{ color: 'var(--mm-error-text)', marginTop: 0 }}>{error || 'Feedback is not available yet.'}</p><button type="button" onClick={onBack}>Back to secure exams</button></section></div>;

  const framework = review.session?.examType || null;
  const frameworkLabel = FRAMEWORK_LABELS[framework] || review.session?.title || 'assessment';
  const items = Array.isArray(review.items) ? review.items : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--mm-surface-control)', padding: '28px 16px 56px', boxSizing: 'border-box' }}>
      <main style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--mm-accent-text)', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.07em' }}>Released feedback</div>
              <h1 style={{ margin: '5px 0 4px', color: 'var(--mm-text-strong)', fontSize: 25 }}>{review.session?.title || `${frameworkLabel} review`}</h1>
              <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>The testing portion is over, so standards and CCMR connections are shown now for learning and review.</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Score</div>
              <div style={{ color: 'var(--mm-primary-text)', fontSize: 30, fontWeight: 950 }}>{review.scorePercent ?? 0}%</div>
              <div style={{ color: 'var(--mm-text-muted)', fontSize: 12 }}>{review.correctQuestions ?? 0} of {review.answeredQuestions ?? items.length} correct</div>
            </div>
          </div>
          <button type="button" onClick={onBack} style={{ marginTop: 16, minHeight: 40, padding: '8px 13px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer' }}>← Back to secure exams</button>
        </header>

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item, index) => {
            const code = firstTeks(item);
            const rows = responseRows(item);
            const correct = item.grading?.isCorrect === true;
            return (
              <article key={item.questionInstanceId || index} style={{ background: 'var(--mm-surface)', border: `1px solid ${correct ? 'var(--mm-success-border)' : 'var(--mm-error-border-soft)'}`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--mm-text-strong)' }}>Question {index + 1}</strong>
                  <span style={{ padding: '4px 9px', borderRadius: 999, background: correct ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)', color: correct ? 'var(--mm-success-text)' : 'var(--mm-error-text)', fontSize: 12, fontWeight: 900 }}>{correct ? '✓ Correct' : 'Review this one'}</span>
                </div>

                {item.questionSnapshot?.prompt ? (
                  <MathText as="div" style={{ marginTop: 12, color: 'var(--mm-text-strong)', fontSize: 17, lineHeight: 1.6, fontWeight: 650 }}>{item.questionSnapshot.prompt}</MathText>
                ) : (
                  <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>The original question text was not stored for this older session, but its standards and result are still available.</p>
                )}

                {rows.length > 0 && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)' }}>{rows.map((row) => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px,auto) 1fr', gap: 10, alignItems: 'baseline', marginTop: row === rows[0] ? 0 : 6 }}><strong style={{ color: 'var(--mm-text-muted)', fontSize: 12 }}>{row.label}</strong><MathText style={{ color: 'var(--mm-text-strong)', fontSize: 14 }}>{row.value}</MathText></div>)}</div>}

                {code && <StandardBadge code={code} framework={framework} domainId={item.assessmentDomainId || null} examStyle style={{ marginTop: 13 }} />}
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

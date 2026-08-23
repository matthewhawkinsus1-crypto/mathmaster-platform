import React, { useEffect, useState } from 'react';
import MathText from '../common/MathText.jsx';
import StandardBadge from '../common/StandardBadge.jsx';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/assessmentCrosswalk.js';
import { getStudentSecureExamReview } from '../../services/secureExamService.js';

const firstTeks = (item) => (Array.isArray(item?.alignmentKeys) ? item.alignmentKeys.find((key) => String(key || '').toLowerCase().startsWith('texas:')) : null) || item?.questionSnapshot?.alignmentKey || '';

const responseRows = (item) => {
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

  if (loading) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', color: '#5f6368' }}>Loading released feedback…</div>;
  if (error || !review) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20 }}><section style={{ width: 'min(620px,100%)', padding: 24, border: '1px solid #dadce0', borderRadius: 12, background: '#fff' }}><p role="alert" style={{ color: '#b3261e', marginTop: 0 }}>{error || 'Feedback is not available yet.'}</p><button type="button" onClick={onBack}>Back to secure exams</button></section></div>;

  const framework = review.session?.examType || null;
  const frameworkLabel = FRAMEWORK_LABELS[framework] || review.session?.title || 'assessment';
  const items = Array.isArray(review.items) ? review.items : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '28px 16px 56px', boxSizing: 'border-box' }}>
      <main style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ background: '#fff', border: '1px solid #dadce0', borderRadius: 14, padding: '20px 22px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#5b21b6', fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.07em' }}>Released feedback</div>
              <h1 style={{ margin: '5px 0 4px', color: '#202124', fontSize: 25 }}>{review.session?.title || `${frameworkLabel} review`}</h1>
              <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.55 }}>The testing portion is over, so standards and CCMR connections are shown now for learning and review.</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#5f6368', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>Score</div>
              <div style={{ color: '#174ea6', fontSize: 30, fontWeight: 950 }}>{review.scorePercent ?? 0}%</div>
              <div style={{ color: '#5f6368', fontSize: 12 }}>{review.correctQuestions ?? 0} of {review.answeredQuestions ?? items.length} correct</div>
            </div>
          </div>
          <button type="button" onClick={onBack} style={{ marginTop: 16, minHeight: 40, padding: '8px 13px', border: '1px solid #c9ced6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}>← Back to secure exams</button>
        </header>

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item, index) => {
            const code = firstTeks(item);
            const rows = responseRows(item);
            const correct = item.grading?.isCorrect === true;
            return (
              <article key={item.questionInstanceId || index} style={{ background: '#fff', border: `1px solid ${correct ? '#b7e0c4' : '#f0c2bf'}`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#202124' }}>Question {index + 1}</strong>
                  <span style={{ padding: '4px 9px', borderRadius: 999, background: correct ? '#e6f4ea' : '#fce8e6', color: correct ? '#137333' : '#a50e0e', fontSize: 12, fontWeight: 900 }}>{correct ? '✓ Correct' : 'Review this one'}</span>
                </div>

                {item.questionSnapshot?.prompt ? (
                  <MathText as="div" style={{ marginTop: 12, color: '#202124', fontSize: 17, lineHeight: 1.6, fontWeight: 650 }}>{item.questionSnapshot.prompt}</MathText>
                ) : (
                  <p style={{ margin: '12px 0 0', color: '#5f6368' }}>The original question text was not stored for this older session, but its standards and result are still available.</p>
                )}

                {rows.length > 0 && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: '#f8f9fa', border: '1px solid #e1e5ea' }}>{rows.map((row) => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px,auto) 1fr', gap: 10, alignItems: 'baseline', marginTop: row === rows[0] ? 0 : 6 }}><strong style={{ color: '#5f6368', fontSize: 12 }}>{row.label}</strong><MathText style={{ color: '#202124', fontSize: 14 }}>{row.value}</MathText></div>)}</div>}

                {code && <StandardBadge code={code} framework={framework} domainId={item.assessmentDomainId || null} examStyle style={{ marginTop: 13 }} />}
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

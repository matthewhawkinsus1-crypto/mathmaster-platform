import React from 'react';
import { buildToolSolutionReviewModel } from './toolSolutionReview.js';

export default function ToolSolutionReview({ question }) {
  const model = buildToolSolutionReviewModel(question);
  if (!model) return null;
  return (
    <section aria-label="Solution review" style={{ margin: '18px auto 0', maxWidth: '860px', padding: '20px', borderRadius: '12px', border: '2px solid #5f6368', background: '#f8f9fa', textAlign: 'left' }}>
      <h3 style={{ margin: '0 0 8px', color: '#202124' }}>{model.title || 'Solution review'}</h3>
      <p style={{ margin: '0 0 14px', color: '#5f6368', lineHeight: 1.5 }}>This problem version is closed. Compare your work with the correct mathematical result.</p>
      {model.items?.length ? (
        <div style={{ display: 'grid', gap: '8px' }}>
          {model.items.map((item, index) => (
            <div key={`${item.label}-${index}`} style={{ padding: '10px 12px', borderRadius: '8px', background: '#fff', border: '1px solid #d9e2f1' }}>
              <strong style={{ color: '#5f6368', marginRight: '8px' }}>{item.label}:</strong>
              <span style={{ color: '#202124' }}>{item.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {model.note ? <p style={{ margin: '12px 0 0', color: '#5f6368' }}>{model.note}</p> : null}
    </section>
  );
}

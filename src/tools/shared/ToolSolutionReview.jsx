import React from 'react';
import { buildToolSolutionReviewModel } from './toolSolutionReview.js';

// The model is text by contract (toolSolutionReview.js `textOnlyReview`); this
// keeps a future builder that breaks it from putting an object into the page.
const shownText = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

export default function ToolSolutionReview({ question }) {
  const model = buildToolSolutionReviewModel(question);
  if (!model) return null;
  return (
    <section aria-label="Solution review" style={{ margin: '18px auto 0', maxWidth: '860px', padding: '20px', borderRadius: '12px', border: '2px solid #5f6368', background: 'var(--mm-surface-sunken)', textAlign: 'left' }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--mm-text-strong)' }}>{shownText(model.title, 'Solution review') || 'Solution review'}</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>This problem version is closed. Compare your work with the correct mathematical result.</p>
      {model.items?.length ? (
        <div style={{ display: 'grid', gap: '8px' }}>
          {model.items.map((item, index) => (
            <div key={`${item.label}-${index}`} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)' }}>
              <strong style={{ color: 'var(--mm-text-muted)', marginRight: '8px' }}>{shownText(item.label, 'Answer')}:</strong>
              <span style={{ color: 'var(--mm-text-strong)' }}>{shownText(item.value, '—')}</span>
            </div>
          ))}
        </div>
      ) : null}
      {shownText(model.note) ? <p style={{ margin: '12px 0 0', color: 'var(--mm-text-muted)' }}>{shownText(model.note)}</p> : null}
    </section>
  );
}

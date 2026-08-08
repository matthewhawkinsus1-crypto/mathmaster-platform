import React from 'react';

export default function ToolShell({ title, subtitle, badge, children, footer }) {
  return (
    <section style={{
      width: 'min(100%, 980px)',
      margin: '0 auto',
      border: '1px solid #d9e2f1',
      borderRadius: 18,
      background: '#fff',
      boxShadow: '0 16px 44px rgba(15, 23, 42, 0.08)',
      overflow: 'hidden',
    }}>
      <header style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', background: 'linear-gradient(135deg,#f8fbff,#eef4ff)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, color: '#172033' }}>{title}</h2>
            {subtitle ? <p style={{ margin: '6px 0 0', color: '#5f6b7a', lineHeight: 1.45 }}>{subtitle}</p> : null}
          </div>
          {badge ? <span style={{ borderRadius: 999, background: '#e8f0fe', color: '#174ea6', padding: '7px 11px', fontWeight: 800, fontSize: 12 }}>{badge}</span> : null}
        </div>
      </header>
      <div style={{ padding: 24 }}>{children}</div>
      {footer ? <footer style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', background: '#fafafa', color: '#5f6b7a', fontSize: 13 }}>{footer}</footer> : null}
    </section>
  );
}

export const ToolGrid = ({ children, min = 260 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 18 }}>{children}</div>
);

export const Panel = ({ title, children }) => (
  <div style={{ border: '1px solid #dde5f0', borderRadius: 14, padding: 16, background: '#fbfdff' }}>
    {title ? <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#24324a' }}>{title}</h3> : null}
    {children}
  </div>
);

export const ResultPill = ({ ok, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '7px 11px', fontWeight: 800, background: ok ? '#e6f4ea' : '#fce8e6', color: ok ? '#137333' : '#c5221f' }}>
    {ok ? '✓' : '•'} {children}
  </span>
);

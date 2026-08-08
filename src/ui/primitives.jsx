import './uiKit.css';

/*
 * Small presentational building blocks shared by the teacher and student
 * screens. Each one existed already as copy-pasted inline styles in several
 * files; centralising them is what makes "search looks the same everywhere"
 * and "every empty list explains itself" true by construction.
 */

export function SearchField({ value, onChange, placeholder = 'Search…', label, style }) {
  return (
    <div className="mm-search" style={style}>
      <span className="mm-search__icon" aria-hidden="true">🔍</span>
      <input
        className="mm-search__input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        autoComplete="off"
      />
      {value && (
        <button type="button" className="mm-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          &times;
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className="mm-empty">
      <div className="mm-empty__icon" aria-hidden="true">{icon}</div>
      {title && <p className="mm-empty__title">{title}</p>}
      {message && <p className="mm-empty__message">{message}</p>}
      {action && <div className="mm-empty__action">{action}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, title }) {
  return <span className="mm-badge" data-tone={tone} title={title}>{children}</span>;
}

/**
 * `label` is required rather than optional: a bare bar is meaningless to a
 * screen reader, and "3 of 8 questions" is more useful on screen than a
 * percentage anyway.
 */
export function ProgressBar({ value, max = 100, tone, label }) {
  const safeMax = Number(max) > 0 ? Number(max) : 100;
  const clamped = Math.max(0, Math.min(safeMax, Number(value) || 0));
  const percent = Math.round((clamped / safeMax) * 100);
  const resolvedTone = tone || (percent >= 100 ? 'success' : percent > 0 ? 'primary' : 'neutral');

  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '5px', fontSize: '12px', color: 'var(--mm-ink-muted)', fontWeight: 700 }}>
          <span>{label}</span>
          <span>{percent}%</span>
        </div>
      )}
      <div
        className="mm-progress"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label || 'Progress'}
      >
        <div className="mm-progress__fill" data-tone={resolvedTone} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const STAT_TONES = {
  primary: { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-dark)' },
  success: { background: 'var(--mm-success-soft)', color: 'var(--mm-success-text)' },
  warning: { background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
  accent: { background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' },
  danger: { background: 'var(--mm-danger-soft)', color: 'var(--mm-danger-text)' },
  neutral: { background: 'var(--mm-surface-sunken)', color: 'var(--mm-ink-muted)' },
};

export function StatCard({ label, value, tone = 'neutral', hint, onClick }) {
  const palette = STAT_TONES[tone] || STAT_TONES.neutral;
  const content = (
    <>
      <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 900, marginTop: '2px' }}>{value}</div>
      {hint && <div style={{ fontSize: '11px', marginTop: '3px', opacity: 0.85 }}>{hint}</div>}
    </>
  );

  const baseStyle = {
    padding: '14px',
    borderRadius: 'var(--mm-radius)',
    textAlign: 'left',
    ...palette,
  };

  if (!onClick) return <div style={baseStyle}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...baseStyle, border: 'none', cursor: 'pointer', font: 'inherit', width: '100%' }}
    >
      {content}
    </button>
  );
}

/** A consistent heading + optional right-aligned controls for each panel. */
export function SectionHeader({ title, description, actions, level = 2 }) {
  const Heading = `h${level}`;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
      <div style={{ minWidth: 0 }}>
        <Heading style={{ margin: 0, color: 'var(--mm-ink)' }}>{title}</Heading>
        {description && <p style={{ margin: '5px 0 0', color: 'var(--mm-ink-muted)', fontSize: '13px', lineHeight: 1.5 }}>{description}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

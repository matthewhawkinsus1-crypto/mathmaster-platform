import { useEffect, useRef, useState } from 'react';

// A small "⋯" dropdown menu. Purely presentational: it owns only its own
// open/closed state and calls back into whatever handlers the caller
// supplies. `items` is an ordered array of
// { key, label, onClick, tone: 'default'|'danger', disabled }.
export default function AssignmentCardMenu({ items, ariaLabel = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          width: '38px',
          height: '38px',
          border: '1px solid #dadce0',
          borderRadius: '8px',
          background: open ? '#e8f0fe' : '#fff',
          color: '#3c4043',
          fontSize: '18px',
          fontWeight: 900,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        &#8942;
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            zIndex: 20,
            minWidth: '190px',
            background: '#fff',
            border: '1px solid #dadce0',
            borderRadius: '10px',
            boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
            padding: '6px',
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                border: 'none',
                borderRadius: '7px',
                background: 'transparent',
                color: item.disabled ? '#bdc1c6' : item.tone === 'danger' ? '#d93025' : '#3c4043',
                fontWeight: item.tone === 'danger' ? 'bold' : 600,
                fontSize: '13px',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => { if (!item.disabled) event.currentTarget.style.background = '#f1f3f4'; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

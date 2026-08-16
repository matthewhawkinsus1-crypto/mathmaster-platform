import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useMobileInteractionMode from './platform/mobile/useMobileInteractionMode.js';
import { getViewportSafePopoverLayout } from './platform/mobile/mobileInteractionFoundation.js';
import './platform/mobile/MobileInteractionFoundation.css';

// A small "⋯" action menu. On desktop it remains a compact popover. On a
// phone it becomes a bottom action sheet so a card near the left/right edge can
// never render its menu outside the visual viewport.
export default function AssignmentCardMenu({ items, ariaLabel = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(null);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const mobileInteraction = useMobileInteractionMode();

  useEffect(() => {
    if (!open) return undefined;

    const updateLayout = () => {
      const visual = window.visualViewport;
      const anchorRect = containerRef.current?.getBoundingClientRect?.() || null;
      setLayout(getViewportSafePopoverLayout({
        viewportWidth: Number(visual?.width || window.innerWidth || 1),
        viewportHeight: Number(visual?.height || window.innerHeight || 1),
        anchorRect,
        preferredWidth: 220,
        preferredHeight: Math.min(420, 54 + items.length * 48),
      }));
    };

    const handleClickOutside = (event) => {
      if (containerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    updateLayout();
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', updateLayout);
    window.visualViewport?.addEventListener('resize', updateLayout);
    window.visualViewport?.addEventListener('scroll', updateLayout);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('orientationchange', updateLayout);
      window.visualViewport?.removeEventListener('resize', updateLayout);
      window.visualViewport?.removeEventListener('scroll', updateLayout);
    };
  }, [open, items.length]);

  const menuItems = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className={layout?.mode === 'sheet' ? 'mathmaster-mobile-action-sheet' : 'mathmaster-viewport-safe-popover'}
      style={layout?.mode === 'popover' ? {
        width: `${layout.width}px`,
        left: `${layout.left}px`,
        top: `${layout.top}px`,
        maxHeight: `${layout.maxHeight}px`,
        padding: '6px',
      } : undefined}
    >
      {layout?.mode === 'sheet' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '5px 6px 8px', borderBottom: '1px solid #eef0f2', marginBottom: 4 }}>
          <strong style={{ color: '#3c4043' }}>Assignment actions</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close assignment actions" style={{ width: 44, height: 44, border: 0, borderRadius: 9, background: '#f1f3f4', fontWeight: 900 }}>×</button>
        </div>
      )}
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
            minHeight: mobileInteraction.isMobile ? 48 : 40,
            textAlign: 'left',
            padding: '9px 12px',
            border: 'none',
            borderRadius: '7px',
            background: 'transparent',
            color: item.disabled ? '#bdc1c6' : item.tone === 'danger' ? '#d93025' : '#3c4043',
            fontWeight: item.tone === 'danger' ? 'bold' : 600,
            fontSize: mobileInteraction.isMobile ? '15px' : '13px',
            cursor: item.disabled ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={(event) => { if (!item.disabled) event.currentTarget.style.background = '#f1f3f4'; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          width: '44px',
          height: '44px',
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
      {open && typeof document !== 'undefined' && createPortal(
        <>
          {layout?.mode === 'sheet' && <div className="mathmaster-mobile-action-sheet-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
          {menuItems}
        </>,
        document.body,
      )}
    </div>
  );
}

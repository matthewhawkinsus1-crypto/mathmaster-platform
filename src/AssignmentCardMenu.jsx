import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useMobileInteractionMode from './platform/mobile/useMobileInteractionMode.js';
import { getViewportSafePopoverLayout } from './platform/mobile/mobileInteractionFoundation.js';
import { usePopupMenu } from './platform/interaction/popupMenu.js';
import './platform/mobile/MobileInteractionFoundation.css';

// A small "⋯" action menu. On desktop it remains a compact popover. On a
// phone it becomes a bottom action sheet so a card near the left/right edge can
// never render its menu outside the visual viewport.
//
// Its keys are the WAI-ARIA Menu Button's (platform/interaction/popupMenu.js):
// the items are one Tab stop and the arrow keys move between them, Escape and
// choosing return focus to the ⋮ button, and a press outside closes it.
export default function AssignmentCardMenu({ items, ariaLabel = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState(null);
  const containerRef = useRef(null);
  const mobileInteraction = useMobileInteractionMode();
  const menu = usePopupMenu({ kind: 'menu', open, onOpenChange: setOpen });

  useEffect(() => {
    if (!open) return undefined;

    const updateLayout = () => {
      const visual = window.visualViewport;
      const anchorRect = containerRef.current?.getBoundingClientRect?.() || null;
      const viewportHeight = Number(visual?.height || window.innerHeight || 1);
      const preferredHeight = Math.min(420, 54 + items.length * 48);
      const next = getViewportSafePopoverLayout({
        viewportWidth: Number(visual?.width || window.innerWidth || 1),
        viewportHeight,
        anchorRect,
        preferredWidth: 220,
        preferredHeight,
      });
      const roomBelow = anchorRect ? viewportHeight - Number(anchorRect.bottom || 0) : viewportHeight;
      const roomAbove = anchorRect ? Number(anchorRect.top || 0) : 0;
      setLayout({
        ...next,
        // Desktop popovers stay in the same local coordinate system as their
        // three-dot button. Portaling a fixed-position popover to <body> can be
        // displaced by browser zoom / visualViewport panning, which is exactly
        // how a menu beside a card ended up hundreds of pixels away from it.
        openUp: next.mode === 'popover' && roomBelow < Math.min(preferredHeight, 260) && roomAbove > roomBelow,
      });
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', updateLayout);
    window.visualViewport?.addEventListener('resize', updateLayout);
    window.visualViewport?.addEventListener('scroll', updateLayout);
    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('orientationchange', updateLayout);
      window.visualViewport?.removeEventListener('resize', updateLayout);
      window.visualViewport?.removeEventListener('scroll', updateLayout);
    };
  }, [open, items.length]);

  // The outer element is the pop-up (it carries the keys and the press-outside
  // test); the menu role sits inside it, so the sheet's title and Close button
  // are not children of the menu.
  //
  // A popover taller than the room it has scrolls, and a scrolling region has to
  // be reachable by keyboard (axe scrollable-region-focusable, WCAG 2.1.1) -
  // while the items are arrow-key stops, not Tab stops. So the popover is itself
  // focusable. A keyboard teacher never lands on it (opening puts focus on an
  // item, and Tab leaves); a click on its padding does, and Escape still works
  // from there. The sheet has its Close button, a Tab stop, to be reachable by.
  const menuItems = (
    <div
      {...menu.popupProps}
      data-assignment-menu=""
      tabIndex={layout?.mode === 'popover' ? 0 : -1}
      className={layout?.mode === 'sheet' ? 'mathmaster-mobile-action-sheet' : 'mathmaster-viewport-safe-popover'}
      style={layout?.mode === 'popover' ? {
        position: 'absolute',
        width: `${layout.width}px`,
        right: 0,
        top: layout.openUp ? 'auto' : 'calc(100% + 4px)',
        bottom: layout.openUp ? 'calc(100% + 4px)' : 'auto',
        maxHeight: `${layout.maxHeight}px`,
        padding: '6px',
      } : undefined}
    >
      {layout?.mode === 'sheet' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '5px 6px 8px', borderBottom: '1px solid var(--mm-border-soft)', marginBottom: 4 }}>
          <strong style={{ color: 'var(--mm-text)' }}>Assignment actions</strong>
          <button type="button" onClick={() => menu.close()} aria-label="Close assignment actions" style={{ width: 44, height: 44, border: 0, borderRadius: 9, background: 'var(--mm-surface-control)', fontWeight: 900 }}>×</button>
        </div>
      )}
      <div role="menu" aria-label={ariaLabel}>
        {items.map((item) => {
          const label = item.key === 'edit-questions' ? 'Repair Center / Edit Questions' : item.label;
          return (
            <button
              key={item.key}
              type="button"
              {...menu.itemProps}
              disabled={item.disabled}
              onClick={() => menu.choose(item.onClick)}
              style={{
                display: 'block',
                width: '100%',
                minHeight: mobileInteraction.isMobile ? 48 : 40,
                textAlign: 'left',
                padding: '9px 12px',
                border: 'none',
                borderRadius: '7px',
                background: 'transparent',
                color: item.disabled ? '#bdc1c6' : item.tone === 'danger' ? 'var(--mm-danger)' : 'var(--mm-text)',
                fontWeight: item.tone === 'danger' ? 'bold' : 600,
                fontSize: mobileInteraction.isMobile ? 'calc(15 * var(--mm-px))' : 'calc(13 * var(--mm-px))',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => { if (!item.disabled) event.currentTarget.style.background = 'var(--mm-surface-hover)'; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        {...menu.triggerProps}
        aria-label={ariaLabel}
        style={{
          width: '44px',
          height: '44px',
          border: '1px solid var(--mm-border)',
          borderRadius: '8px',
          background: open ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
          color: 'var(--mm-text)',
          fontSize: 'calc(18 * var(--mm-px))',
          fontWeight: 900,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        &#8942;
      </button>
      {open && layout?.mode === 'popover' ? menuItems : null}
      {open && layout?.mode === 'sheet' && typeof document !== 'undefined' && createPortal(
        <>
          <div className="mathmaster-mobile-action-sheet-backdrop" aria-hidden="true" onClick={() => menu.close({ refocus: false })} />
          {menuItems}
        </>,
        document.body,
      )}
    </div>
  );
}

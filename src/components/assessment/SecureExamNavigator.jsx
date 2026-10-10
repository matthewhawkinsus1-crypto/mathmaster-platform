import React, { useEffect, useMemo, useRef } from 'react';
import { ITEM_STATUS, navigatorCells, reviewSummary } from '../../platform/assessment/secureExamNavigationModel.js';

/*
 * THE QUESTION LIST OF A SECURE TEST.
 *
 * One square per question, in the order the student meets them: which have an
 * answer, which have none yet, which are marked for review, which are not
 * opened yet, and where the student is. A square opens its question. A Digital
 * SAT practice test groups its squares by module, and a finished module's
 * squares stay visible but cannot be opened.
 *
 * WHAT IT NEVER SHOWS. Whether an answer is right. "Answered" is a filled
 * square in the primary colour — never green, never a tick — because the
 * only thing it knows is that the student wrote something.
 *
 * Every square carries its state in words for a screen reader (the model's
 * `label`), and its look does not depend on colour alone: an unanswered square
 * has a dashed border, an unopened one is greyed, a marked one has a star.
 */

const cellStyle = (cell) => {
  const base = {
    position: 'relative', minHeight: 48, minWidth: 48, padding: 0, borderRadius: 9,
    fontSize: 16, fontWeight: 900, boxSizing: 'border-box', cursor: cell.reachable ? 'pointer' : 'not-allowed',
  };
  const look = cell.status === ITEM_STATUS.ANSWERED
    ? { background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', border: '2px solid var(--mm-primary)' }
    : cell.status === ITEM_STATUS.UNANSWERED
      ? { background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', border: '2px dashed var(--mm-border-strong)' }
      : cell.status === ITEM_STATUS.RECORDED
        ? { background: 'var(--mm-surface-muted)', color: 'var(--mm-text-strong)', border: '2px solid var(--mm-border-strong)' }
        : { background: 'var(--mm-surface-sunken)', color: 'var(--mm-text-muted)', border: '1px solid var(--mm-border)' };
  return {
    ...base,
    ...look,
    opacity: cell.closed ? 0.55 : 1,
    ...(cell.current ? { boxShadow: '0 0 0 3px var(--mm-surface), 0 0 0 6px var(--mm-focus)' } : {}),
  };
};

const legendSwatch = (style) => ({ display: 'inline-block', width: 18, height: 18, borderRadius: 5, boxSizing: 'border-box', verticalAlign: 'middle', marginRight: 6, ...style });

const buttonStyle = {
  minHeight: 44, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, cursor: 'pointer',
};

/*
 * A PANEL ON THE PAGE, NOT A MODAL.
 *
 * The list opens in place, under the test's header, and the question stays
 * mounted below it — so nothing the student was building is torn down to look
 * at the list, and nothing behind it has to be made inert. It is a disclosure:
 * the header's question button says whether it is expanded and names it.
 * Focus starts on Close, Escape inside the list closes it, and focus returns
 * to whatever opened it. Tab stays on the page through the test screen's own
 * focus guards (SecureExamContainer), which is what keeps a keyboard user
 * from being recorded as leaving the test.
 */
export default function SecureExamNavigator({ navigation, current = null, busy = false, onJump, onReview, onClose, id = 'secure-question-list' }) {
  const cells = useMemo(() => navigatorCells(navigation, current), [navigation, current]);
  const summary = useMemo(() => reviewSummary(navigation), [navigation]);
  const closeRef = useRef(null);

  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (opener && typeof opener.focus === 'function' && document.contains(opener) && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  const groups = navigation.modules
    ? navigation.modules.map((module) => ({ key: `module-${module.number}`, title: `Module ${module.number}`, closed: module.closed, cells: cells.slice(module.start, module.end) }))
    : [{ key: 'all', title: null, closed: false, cells }];
  const flaggedCount = summary.flagged.length;
  const hasRecorded = cells.some((cell) => cell.status === ITEM_STATUS.RECORDED);

  return (
    <section
      id={id}
      aria-labelledby="secure-navigator-title"
      data-secure-navigator=""
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose?.(); } }}
      style={{ width: 'min(820px, calc(100% - 32px))', margin: '14px auto 0', boxSizing: 'border-box', background: 'var(--mm-surface)', color: 'var(--mm-text)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: '16px 16px 20px', boxShadow: 'var(--mm-shadow-sm)', textAlign: 'left' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 id="secure-navigator-title" style={{ margin: 0, fontSize: 20, color: 'var(--mm-text-strong)' }}>Questions</h2>
        <button ref={closeRef} type="button" onClick={onClose} style={buttonStyle}>Close</button>
      </div>
      <p style={{ margin: '6px 0 12px', color: 'var(--mm-text-muted)', fontWeight: 700 }}>
        {summary.answered} of {summary.total} answered{flaggedCount ? ` · ${flaggedCount} marked for review` : ''}
      </p>
      <ul aria-label="What the squares mean" style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 13, color: 'var(--mm-text)' }}>
        <li><span aria-hidden="true" style={legendSwatch({ background: 'var(--mm-primary)', border: '2px solid var(--mm-primary)' })} />Answered</li>
        <li><span aria-hidden="true" style={legendSwatch({ background: 'var(--mm-surface)', border: '2px dashed var(--mm-border-strong)' })} />No answer yet</li>
        <li><span aria-hidden="true" style={{ marginRight: 6, color: 'var(--mm-warning-text)', fontWeight: 900 }}>★</span>Marked for review</li>
        <li><span aria-hidden="true" style={legendSwatch({ background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border)' })} />Not opened yet</li>
        {hasRecorded && <li><span aria-hidden="true" style={{ marginRight: 6 }}>🔒</span>Recorded earlier</li>}
        <li><span aria-hidden="true" style={legendSwatch({ background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', boxShadow: '0 0 0 2px var(--mm-focus)' })} />You are here</li>
      </ul>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title || 'All questions'} style={{ marginBottom: 14 }}>
          {group.title && (
            <h3 style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--mm-text-strong)' }}>
              {group.title}{group.closed ? ' — finished' : ''}
            </h3>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 10 }}>
            {group.cells.map((cell) => (
              <button
                key={cell.position}
                type="button"
                aria-label={cell.label}
                aria-current={cell.current ? 'step' : undefined}
                data-question-status={cell.status}
                data-question-flagged={cell.flagged ? 'true' : undefined}
                disabled={busy || !cell.reachable}
                onClick={() => onJump?.(cell)}
                style={cellStyle(cell)}
              >
                {cell.number}
                {cell.status === ITEM_STATUS.RECORDED && <span aria-hidden="true" style={{ position: 'absolute', bottom: 1, right: 3, fontSize: 10 }}>🔒</span>}
                {cell.flagged && (
                  <span aria-hidden="true" style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 12, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)' }}>★</span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
      <button type="button" onClick={onReview} disabled={busy} style={{ ...buttonStyle, width: '100%', marginTop: 4, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', borderColor: 'var(--mm-primary-border)' }}>
        Review and submit
      </button>
    </section>
  );
}

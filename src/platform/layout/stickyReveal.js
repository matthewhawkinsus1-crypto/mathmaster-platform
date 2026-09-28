/*
 * BRING SOMETHING TO JUST BELOW THE STICKY CHROME, BY MEASURING IT.
 *
 * The desktop assignment page reserves room for its sticky stack twice: the
 * document carries `scroll-padding-top` (so a focused field is not typed
 * behind the task card) and several regions carry their own
 * `scroll-margin-top`. scrollIntoView adds the two together. Aimed at a
 * question stage that meant "142px + the whole sticky stack + 140px above
 * a point 440px down the page", which is negative, so every question opened
 * at scrollY 0 with its workspace below the fold (live QA, Algebra I DOL #2,
 * 1366×768) — the opposite of what the reveal was written to do.
 *
 * So these reveals compute the distance themselves: where the sticky element
 * ends once it is pinned, and how far the target sits from there.
 */
export const DESKTOP_STICKY_QUERY = '(min-width: 769px)';

export const isDesktopStickyLayout = (win = typeof window !== 'undefined' ? window : null) => (
  Boolean(win?.matchMedia?.(DESKTOP_STICKY_QUERY)?.matches)
);

const identityStackOffset = (win) => {
  const root = win?.document?.documentElement;
  const value = root ? win.getComputedStyle?.(root)?.getPropertyValue?.('--mm-student-identity-stack-offset') : '';
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Where a sticky element ends once it is stuck, in viewport pixels. An element
 * that is not pinned on this screen (a short landscape phone lets the navigator
 * and task scroll away) covers nothing, so only the identity bar remains.
 */
export const pinnedBottom = (sticky, win = typeof window !== 'undefined' ? window : null) => {
  if (!sticky?.getBoundingClientRect) return 0;
  const style = win?.getComputedStyle?.(sticky);
  if (style && style.position && !['sticky', 'fixed'].includes(style.position)) return identityStackOffset(win);
  const stickyTop = Number.parseFloat(style?.top);
  const height = sticky.getBoundingClientRect().height || 0;
  return (Number.isFinite(stickyTop) ? stickyTop : 0) + height;
};

/** Scroll the window so `target` starts `gap` px below the pinned `sticky`. */
export const revealBelowSticky = ({
  target,
  sticky = null,
  gap = 8,
  behavior = 'auto',
  win = typeof window !== 'undefined' ? window : null,
} = {}) => {
  if (!target?.getBoundingClientRect || !win?.scrollBy) return false;
  const delta = target.getBoundingClientRect().top - (pinnedBottom(sticky, win) + gap);
  if (Math.abs(delta) < 2) return false;
  win.scrollBy({ top: delta, left: 0, behavior });
  return true;
};

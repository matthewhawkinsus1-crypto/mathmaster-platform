/*
 * THE LIVE CHALLENGE SHELL'S STYLES, as a string a <style> tag carries (and
 * a node test can read: ChallengeShellParts.jsx renders it).
 *
 * Motion, once per screen. Everything here is decoration: with reduced motion
 * every animation is off and nothing is lost, because no number or state is
 * ever conveyed by animation alone.
 */
export const SHELL_CSS = `
.mm-shell-count { display: grid; place-items: center; text-align: center; gap: 6px; }
.mm-shell-count-number { font-weight: 1000; line-height: .9; font-variant-numeric: tabular-nums; animation: mmShellCountPop 420ms cubic-bezier(.2,.9,.3,1.3); }
.mm-shell-bump { animation: mmShellBump 700ms ease-out; border-radius: 6px; }
.mm-shell-confetti { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.mm-shell-confetti span { position: absolute; top: -12px; width: 10px; height: 14px; border-radius: 2px; opacity: .9; animation: mmShellFall linear forwards; }
.mm-shell-dialog-backdrop { position: fixed; inset: 0; z-index: 20000; display: grid; place-items: center; padding: 16px; background: rgba(8,12,24,.55); }
.mm-shell-dialog { width: min(460px, 100%); box-sizing: border-box; border-radius: 14px; padding: 20px; background: var(--mm-surface); color: var(--mm-text-strong); border: 1px solid var(--mm-border); box-shadow: 0 24px 60px rgba(0,0,0,.35); text-align: left; }
.mm-shell-button:focus-visible { outline: 3px solid var(--mm-focus); outline-offset: 2px; }
.mm-shell-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-weight: 900; font-size: 13px; white-space: nowrap; }
.mm-shell-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.mm-shell-pulse { animation: mmShellPulse 1.4s ease-in-out infinite; }
@keyframes mmShellCountPop { from { transform: scale(.55); opacity: .2; } to { transform: scale(1); opacity: 1; } }
@keyframes mmShellBump { 0% { background: rgba(253,214,99,.55); } 100% { background: transparent; } }
@keyframes mmShellFall { to { transform: translateY(105vh) rotate(540deg); opacity: .85; } }
@keyframes mmShellPulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) {
  .mm-shell-count-number, .mm-shell-bump, .mm-shell-pulse { animation: none !important; }
  .mm-shell-confetti { display: none; }
}
`;

export const MATHMASTER_THEMES = Object.freeze(['light', 'dark']);

const themeQuery = '(prefers-color-scheme: dark)';

export function resolveMathMasterTheme(preference = 'system', media = globalThis.matchMedia?.(themeQuery)) {
  if (preference === 'light' || preference === 'dark') return preference;
  return media?.matches ? 'dark' : 'light';
}

/**
 * Publishes one resolved theme for CSS, SVG and canvas renderers.  System is
 * intentionally the default; callers may persist a light/dark override later.
 */
export function installMathMasterTheme(root = globalThis.document?.documentElement) {
  if (!root) return () => {};
  const media = globalThis.matchMedia?.(themeQuery);
  const apply = () => {
    const preference = root.dataset.themePreference || 'system';
    const resolved = resolveMathMasterTheme(preference, media);
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    globalThis.dispatchEvent?.(new CustomEvent('mathmasterthemechange', { detail: { theme: resolved } }));
  };
  apply();
  media?.addEventListener?.('change', apply);
  return () => media?.removeEventListener?.('change', apply);
}

export function readMathMasterTheme(root = globalThis.document?.documentElement) {
  return root?.dataset.theme || resolveMathMasterTheme();
}

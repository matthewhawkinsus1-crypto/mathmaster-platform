export const MATHMASTER_THEMES = Object.freeze(['light', 'dark']);

const themeQuery = '(prefers-color-scheme: dark)';

/**
 * The browser/PWA chrome color per theme: --mm-page-bg in theme/tokens.css
 * (asserted equal by tests/platform/darkModeArchitecture.test.mjs). Safari 15–18
 * tints its bars from <meta name="theme-color">; Safari 26 uses it only for an
 * installed web app and otherwise samples the page background, which the
 * tokens also set. MathMaster only colors chrome a page is allowed to color.
 */
export const THEME_CHROME_COLOR = Object.freeze({ light: '#ffffff', dark: '#111318' });

const syncThemeColorMeta = (resolved) => {
  const meta = globalThis.document?.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_CHROME_COLOR[resolved] || THEME_CHROME_COLOR.light);
};

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
    syncThemeColorMeta(resolved);
    globalThis.dispatchEvent?.(new CustomEvent('mathmasterthemechange', { detail: { theme: resolved } }));
  };
  apply();
  media?.addEventListener?.('change', apply);
  return () => media?.removeEventListener?.('change', apply);
}

export function readMathMasterTheme(root = globalThis.document?.documentElement) {
  return root?.dataset.theme || resolveMathMasterTheme();
}

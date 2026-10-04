/*
 * WHICH SEMANTIC TOKEN A HARD-CODED COLOR WAS STANDING IN FOR.
 *
 * MathMaster's screens were written against a light palette, as literals:
 * #f8f9fa for an inset panel, #e8f0fe for a selected tab, #5f6368 for muted
 * text, #dadce0 for a card outline. Each of those is a ROLE, and each role is
 * now a token in src/theme/tokens.css whose light value IS that literal and
 * whose dark value was designed for it.
 *
 * Given the CSS role a literal plays (a background, text, a border) this
 * classifies it by hue family and lightness and returns the nearest token —
 * or null when the color is not a light-palette assumption at all: saturated
 * fills (#1a73e8 behind white text), white text, deliberately dark banners,
 * and anything mid-tone are left exactly as they are, because they read
 * correctly on both themes.
 *
 * Used at runtime by toneTextColor() below, by scripts/codemods/tokenize-theme-colors.mjs (the Dark Mode 2.0
 * migration) and by scripts/audit-theme-colors.mjs, which rejects a NEW
 * literal that has a token, and names the token to use.
 */

export const COLOR_ROLE = Object.freeze({ BACKGROUND: 'background', TEXT: 'text', BORDER: 'border' });

// [light anchor, token]. The anchor is the token's light value in tokens.css.
export const ROLE_ANCHORS = Object.freeze({
  background: {
    neutral: [['#ffffff', '--mm-surface'], ['#f8f9fa', '--mm-surface-sunken'], ['#f1f3f4', '--mm-surface-control'], ['#e1e3e6', '--mm-surface-control-strong']],
    blue: [['#f8fbff', '--mm-surface-tint'], ['#eef4ff', '--mm-primary-subtle'], ['#e8f0fe', '--mm-primary-soft']],
    green: [['#f4fbf5', '--mm-success-subtle'], ['#e6f4ea', '--mm-success-bg']],
    red: [['#fff8f7', '--mm-error-subtle'], ['#fce8e6', '--mm-error-bg']],
    yellow: [['#fffaf0', '--mm-warning-subtle'], ['#fef7e0', '--mm-warning-bg'], ['#fff4ce', '--mm-warning-soft']],
    purple: [['#faf5ff', '--mm-accent-subtle'], ['#f3e8fd', '--mm-accent-soft']],
  },
  text: {
    neutral: [['#202124', '--mm-text-strong'], ['#3c4043', '--mm-text'], ['#5f6368', '--mm-text-muted'], ['#80868b', '--mm-text-subtle']],
    // #80868b is the legacy literal this matches. Its token is the one deliberate
    // light-mode change: #80868b measured 3.7:1 on white, so --mm-text-subtle is
    // #65696e (>= 4.9:1). See LIGHT_VALUE_CHANGES in darkModeArchitecture.test.mjs.
    blue: [['#174ea6', '--mm-primary-text'], ['#1a73e8', '--mm-primary']],
    green: [['#137333', '--mm-success-text'], ['#188038', '--mm-success']],
    red: [['#a50e0e', '--mm-error-text'], ['#d93025', '--mm-danger']],
    yellow: [['#7a4f00', '--mm-warning-text']],
    purple: [['#681da8', '--mm-accent-text']],
  },
  border: {
    neutral: [['#e8eaed', '--mm-border-soft'], ['#dadce0', '--mm-border'], ['#9aa0a6', '--mm-border-strong']],
    blue: [['#d9e2f1', '--mm-tint-border'], ['#aecbfa', '--mm-primary-border']],
    green: [['#81c995', '--mm-success-border']],
    red: [['#f1a5a0', '--mm-error-border-soft']],
    yellow: [['#f0d489', '--mm-warning-border-soft']],
    purple: [['#caa8f2', '--mm-accent-border']],
  },
});

export const parseHexColor = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'white') return [255, 255, 255];
  const match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].split('').map((ch) => ch + ch).join('') : match[1];
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
};

export const relativeLuminance = ([r, g, b]) => {
  const channel = (value) => {
    const n = value / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const hsl = ([r, g, b]) => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l, chroma: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l, chroma: d * 255 };
};

export const hueFamily = (rgb) => {
  const { h, s, chroma } = hsl(rgb);
  if (chroma < 6 || s < 0.25) return 'neutral';
  if (h < 15 || h >= 320) return 'red';
  if (h < 65) return 'yellow';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  return 'purple';
};

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const nearest = (rgb, anchors) => anchors
  .map(([hex, token]) => ({ token, hex, d: distance(rgb, parseHexColor(hex)) }))
  .sort((a, b) => a.d - b.d)[0];

/**
 * The token a literal stands for in `role`, or null to leave it alone.
 * Returns { token, anchor, family }.
 */
export const classifyThemeColor = (value, role) => {
  const rgb = parseHexColor(value);
  if (!rgb || !ROLE_ANCHORS[role]) return null;
  let family = hueFamily(rgb);
  const { l } = hsl(rgb);
  const lum = relativeLuminance(rgb);
  if (role === COLOR_ROLE.BACKGROUND) {
    // Only light surfaces are light-palette assumptions; saturated and dark
    // fills already read on both themes.
    if (family === 'neutral' ? l < 0.88 : l < 0.85) return null;
  } else if (role === COLOR_ROLE.TEXT) {
    // Only dark text written for a light surface. Near-black navy/slate is
    // "strong text", whatever its tint.
    if (lum < 0.035) family = 'neutral';
    if (family === 'neutral' ? lum > 0.4 : lum > 0.25) return null;
  } else if (role === COLOR_ROLE.BORDER) {
    if (family === 'neutral' ? l < 0.55 : l < 0.7) return null;
  }
  const anchors = ROLE_ANCHORS[role][family];
  if (!anchors?.length) return null;
  const best = nearest(rgb, anchors);
  return { token: best.token, anchor: best.hex, family };
};

/** CSS property (kebab or camel case) or tone-map key -> role, or null. */
export const roleForProperty = (name) => {
  const key = String(name || '').replace(/['"]/g, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  if (['background', 'backgroundColor', 'bg', 'chip', 'surface'].includes(key)) return COLOR_ROLE.BACKGROUND;
  if (['color', 'fg', 'text', 'WebkitTextFillColor'].includes(key)) return COLOR_ROLE.TEXT;
  if (/^(border(Top|Bottom|Left|Right|Block|Inline)?(Start|End)?(Color)?|outline(Color)?|selfBorder)$/.test(key)) return COLOR_ROLE.BORDER;
  return null;
};

const TONE_TEXT_TOKEN = Object.freeze({
  neutral: '--mm-text-muted',
  blue: '--mm-primary-text',
  green: '--mm-success-text',
  red: '--mm-error-text',
  yellow: '--mm-warning-text',
  purple: '--mm-accent-text',
});

/**
 * The themed TEXT color for a saturated status tone.
 *
 * Several models hand a component one `tone` (#1967d2, #b06000, ...) and the
 * component uses it as a border, as a fill behind white text, AND as text on
 * the card. The first two read on both themes; the third does not on a dark
 * surface. Text goes through here: same hue family, the token designed for
 * text in each theme. Anything that is not a hex color passes through.
 */
export const toneTextColor = (tone) => {
  const rgb = parseHexColor(tone);
  if (!rgb) return tone;
  return `var(${TONE_TEXT_TOKEN[hueFamily(rgb)]})`;
};

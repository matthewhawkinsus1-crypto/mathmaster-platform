import { normalizeTeksCode } from '../texasStandards.js';

const HAS_NAMESPACE = /^[a-z][a-z0-9_-]*:/i;

export const toDisplayCode = (codeOrKey) => {
  const raw = String(codeOrKey ?? '').trim();
  if (!raw) return '';
  if (/^texas:/i.test(raw)) return normalizeTeksCode(raw.replace(/^texas:/i, ''));
  if (HAS_NAMESPACE.test(raw)) return raw;
  return normalizeTeksCode(raw);
};

export const toCanonicalKey = (codeOrKey) => {
  const raw = String(codeOrKey ?? '').trim();
  if (!raw) return '';
  if (/^texas:/i.test(raw)) return `texas:${normalizeTeksCode(raw.replace(/^texas:/i, ''))}`;
  if (HAS_NAMESPACE.test(raw)) return raw;
  return `texas:${normalizeTeksCode(raw)}`;
};

export const sameTeks = (left, right) => {
  const leftKey = toCanonicalKey(left);
  const rightKey = toCanonicalKey(right);
  return Boolean(leftKey && rightKey && leftKey.toLowerCase() === rightKey.toLowerCase());
};

export const uniqueDisplayTeks = (values = []) => [...new Set(
  (Array.isArray(values) ? values : [values]).map(toDisplayCode).filter(Boolean),
)];

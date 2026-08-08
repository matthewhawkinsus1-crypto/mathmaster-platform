const hash32 = (value, seed = 0x811c9dc5) => {
  let hash = seed >>> 0;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const hex32 = (value) => value.toString(16).padStart(8, '0');

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
};

export const stableStringify = (value) => JSON.stringify(canonicalize(value));

export const generateStableUUID = (seed = '') => {
  const source = String(seed || 'mathmaster');
  const chunks = [
    hash32(`${source}|0`),
    hash32(`${source}|1`, 0x9e3779b9),
    hash32(`${source}|2`, 0x85ebca6b),
    hash32(`${source}|3`, 0xc2b2ae35),
  ];
  const hex = chunks.map(hex32).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const generateRuntimeUUID = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const entropy = `${Date.now()}|${Math.random()}|${Math.random()}`;
  return generateStableUUID(entropy);
};

export const generateStableId = (prefix, ...parts) => {
  const safePrefix = String(prefix || 'id').replace(/[^a-z0-9_-]/gi, '_');
  return `${safePrefix}_${generateStableUUID(parts.map((part) => String(part ?? '')).join('|'))}`;
};

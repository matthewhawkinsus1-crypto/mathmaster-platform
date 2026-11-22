/*
 * FOLLOW-THROUGH PARTS: THE NAMES, THE LABEL AND THE LOADER (SP-3;
 * docs/platform/SHOWING_THE_PROCESS.md section 4).
 *
 * The light half of follow-through: no mathematics here. The rules that read
 * a student's value and build a key are in ./followThrough.mjs, which a
 * screen loads only for a question that has a followThrough part
 * (loadFollowThrough), and which the server and the teacher's simulation
 * import directly. A question with none never loads it.
 *
 * A placeholder is {name}: a part id in single braces, written as words write
 * it ("Using your slope of {slope}, …"). A brace group right after a letter,
 * digit, backslash, ^, _, $ or another brace belongs to mathematics or a
 * Question Family template (\sqrt{x}, \frac{a}{b}, x^{2}, {{k}}) and is not
 * one. The validator (src/platform/contract/lessonSupportsV5.js) reads names
 * with this same pattern.
 */
export const PLACEHOLDER = /(?<![A-Za-z0-9\\^_{}$])\{([A-Za-z][A-Za-z0-9_-]*)\}(?!\})/g;
export const followThroughPlaceholders = (text) => (
  typeof text === 'string' ? [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))] : []
);

const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const list = (value) => (Array.isArray(value) ? value : []);
export const fieldId = (field, index) => text(field?.id).trim() || `part-${index + 1}`;
export const partsById = (fields) => new Map(list(fields).map((field, index) => [fieldId(field, index), { field, index }]));

/** A part's followThrough as `{ from, answer }` (answer '' on a public copy), or null. */
export const followThroughOf = (field) => {
  const value = field?.followThrough;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const from = list(value.from).map((id) => text(id).trim()).filter(Boolean);
  return from.length ? { from, answer: typeof value.answer === 'string' ? value.answer : '' } : null;
};

export const hasFollowThrough = (fields) => list(fields).some((field) => followThroughOf(field) !== null);

/** What a public copy of a part may carry: the parts it names, never its answer (a key). */
export const publicFollowThrough = (field) => {
  const value = followThroughOf(field);
  return value ? { from: value.from } : null;
};

/*
 * THE LOADER. The rules for this question's fields, as a promise, or null
 * when no field has a followThrough: then nothing is imported. Loaded once;
 * a load that fails is tried again by the next caller.
 */
let loading = null;
let loaded = null;
export const loadedFollowThrough = () => loaded;
export const loadFollowThrough = (fields, load = () => import('./followThrough.mjs')) => {
  if (!hasFollowThrough(fields)) return null;
  if (loaded) return Promise.resolve(loaded);
  loading ||= load().then((rules) => { loaded = rules; return rules; }, (error) => { loading = null; throw error; });
  return loading;
};

/*
 * THE LABEL. Each {name} a follow-through part names is the student's value
 * for that earlier part, `$-3$` (bare in a label drawn as LaTeX), when
 * `value` (the rules' followThroughValue) reads one; otherwise "your " and
 * that part's own label ("your slope of the boundary line"). Never a raw
 * {name}, never the key. Without the rules every name is the phrase.
 */
const phraseOf = (label) => {
  const words = label.trim().replace(/[\s:?.=]+$/, '').replace(/^(?:the|a|an)\s+(?=\S)/i, '')
    .replace(/^[A-Z](?=[a-z])/, (first) => first.toLowerCase());
  return /^your\b/i.test(words) ? words : `your ${words}`;
};

export const followThroughLabel = (field, fields = [], responsesById = {}, { latex = false, value = null } = {}) => {
  const own = text(field?.label);
  if (!followThroughOf(field)) return own;
  const byId = partsById(fields);
  const phrase = (words) => (latex ? `\\text{${phraseOf(words).replace(/[{}\\$]/g, '')}}` : phraseOf(words));
  const resolve = (part, seen) => {
    const rule = followThroughOf(part);
    const label = text(part?.label);
    if (!rule || !label) return label;
    let at = list(fields).indexOf(part);
    if (at < 0) at = list(fields).findIndex((entry) => text(entry?.id) === text(part?.id));
    return label.replace(PLACEHOLDER, (match, name) => {
      const source = byId.get(name);
      if (!rule.from.includes(name) || !source || seen.has(name) || (at >= 0 && source.index >= at)) return match;
      const found = value?.(responsesById?.[name], source.field);
      if (found) return latex ? found.shown : `$${found.shown}$`;
      return phrase(resolve(source.field, new Set([...seen, name])) || name);
    });
  };
  // A {name} the validator would refuse is never left as braces, and no value is read for it.
  return resolve(field, new Set([text(field?.id)])).replace(PLACEHOLDER, (match, name) => phrase(name));
};

/** Every part with its label as the student reads it; the same array when no part has a followThrough. */
export const withFollowThroughLabels = (fields = [], responsesById = {}, { latexOf = () => false, value = null } = {}) => {
  if (!hasFollowThrough(fields)) return fields;
  return list(fields).map((field) => (followThroughOf(field)
    ? { ...field, label: followThroughLabel(field, fields, responsesById, { latex: latexOf(field) === true, value }) }
    : field));
};

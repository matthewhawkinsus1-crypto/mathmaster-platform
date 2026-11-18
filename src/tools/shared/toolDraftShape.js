/*
 * WHAT A SAVED DRAFT FIELD MAY COME BACK AS.
 *
 * A tool reads its draft the moment it mounts (usePersistentToolState.js), and
 * what is read back is whatever some build, on some device, saved: an older
 * build with another shape, another Chromebook through the server backup, or
 * plain damage. A shape the tool does not expect is not a wrong answer, it is
 * an exception on every load and every device until the draft is gone: the
 * Regression Calculator threw on a row with no type, Step Algebra 2 on a step
 * with no equation, the systems workspace on a back-substitution index that
 * was a string.
 *
 * These are the pieces a tool states the shape of its work with, once, as the
 * field's `normalize` (`draftNormalizer(shape)`), instead of writing its own
 * checks. Every piece follows the same rule:
 *
 *   - a value of the right shape comes back exactly as it was saved (the same
 *     object, when nothing in it changed), so a valid draft restores as before;
 *   - a part of the wrong shape is repaired when the repair keeps the
 *     student's work (an older build's number in a text box comes back as its
 *     digits, a blank cell stays a blank cell in its place), and dropped when
 *     it cannot be (a list entry that is not a row, a key that is not a card);
 *   - nothing here throws, and nothing here invents work the student did not
 *     do: what is dropped is gone from the screen, never replaced by an answer.
 *
 * Each repair is reported as an issue ("[].type unknown-choice": where in the
 * field, then what), which hydrateToolDraftField passes to the diagnostic.
 */
import { MAX_WORKSPACE_DRAFT_VALUE_BYTES } from '../../../functions/shared/workspaceDraftSchema.mjs';

/*
 * The longest text a restored box holds. The server backup refuses a whole
 * workspace larger than this, so a longer text has already outgrown every copy
 * but this device's; and the screens that read a typed value aloud take
 * seconds per box on text this long (100,000 characters took 20 s and more on
 * one render). Longer text is cut to this length, never dropped.
 */
export const MAX_DRAFT_TEXT_LENGTH = MAX_WORKSPACE_DRAFT_VALUE_BYTES;

// "This part cannot be kept." Never leaves this module: draftNormalizer turns
// it into `undefined`, which hydrateToolDraftField reads as "no draft".
const DROP = Symbol('draft-shape-drop');

const MAX_ISSUES = 12;
const isPlainRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
// A key that sets an object's prototype when written; never a student's.
const HOSTILE_KEY = '__proto__';

// A nested piece reports where it is: ".rows", "[]", then the code.
const within = (note, part) => (issue) => note(/^[.[]/.test(issue) ? `${part}${issue}` : `${part} ${issue}`);

// The blank a piece falls back to (`or`), or DROP.
const orElse = (options, note, code) => {
  note(code);
  return Object.prototype.hasOwnProperty.call(options, 'or') ? options.or : DROP;
};
const withBlank = (piece, options) => {
  if (Object.prototype.hasOwnProperty.call(options, 'or')) piece.blank = options.or;
  return piece;
};

/** Text, cut to `max`. A finite number an older build saved is kept as its digits. */
const text = (options = {}) => withBlank((value, note) => {
  const max = options.max ?? MAX_DRAFT_TEXT_LENGTH;
  if (typeof value === 'string') {
    if (value.length <= max) return value;
    note('text-too-long');
    return value.slice(0, max);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    note('number-as-text');
    return String(value);
  }
  return orElse(options, note, 'not-text');
}, options);

/**
 * A finite number (`integer`, `min`, `max` narrow it). `orText`: a number box
 * that also holds what was typed into it, kept as typed.
 */
const number = (options = {}) => withBlank((value, note) => {
  if (typeof value === 'number' && Number.isFinite(value)
    && (!options.integer || Number.isInteger(value))
    && (options.min === undefined || value >= options.min)
    && (options.max === undefined || value <= options.max)) return value;
  if (options.orText && typeof value === 'string') return text({ max: options.maxLength })(value, note);
  return orElse(options, note, 'not-a-number');
}, options);

const boolean = (options = {}) => withBlank((value, note) => (
  typeof value === 'boolean' ? value : orElse(options, note, 'not-a-boolean')
), options);

/** One of a fixed set of values (a choice, a mode, an operation). */
const oneOf = (choices, options = {}) => withBlank((value, note) => (
  choices.includes(value) ? value : orElse(options, note, 'unknown-choice')
), options);

/** null, or the piece. */
const nullable = (piece) => {
  const wrapped = (value, note) => (value === null ? null : piece(value, note));
  wrapped.blank = Object.prototype.hasOwnProperty.call(piece, 'blank') ? piece.blank : null;
  return wrapped;
};

/** A value kept as it is (its shape is the tool's own business). */
const any = () => (value) => (value === undefined ? DROP : value);

/** The first piece that keeps the value; only its repairs are reported. */
const either = (...pieces) => (value, note) => {
  for (const piece of pieces) {
    const seen = [];
    const result = piece(value, (issue) => seen.push(issue));
    if (result !== DROP) {
      seen.forEach(note);
      return result;
    }
  }
  note('no-shape-matched');
  return DROP;
};

/**
 * A list. An entry that cannot be kept is dropped, or, with `keepPositions`
 * (cells whose place is their meaning), replaced by the entry's blank, or,
 * with `untilInvalid` (a derivation, where each step follows from the one
 * before), ends the list there: the steps before it are kept.
 * `length`: a list sized by the question (padded with blanks or cut).
 * `min`: fewer entries left than this and the list is not kept.
 */
const list = (entry, options = {}) => withBlank((value, note) => {
  if (!Array.isArray(value)) return orElse(options, note, 'not-a-list');
  const inner = within(note, '[]');
  const keepPositions = options.keepPositions === true && Object.prototype.hasOwnProperty.call(entry, 'blank');
  let changed = false;
  const out = [];
  for (const item of value) {
    const kept = entry(item, inner);
    if (kept === DROP) {
      changed = true;
      if (options.untilInvalid) { inner('ended-at-invalid-step'); break; }
      if (keepPositions) { inner('blank-entry'); out.push(entry.blank); } else inner('dropped-entry');
      continue;
    }
    if (kept !== item) changed = true;
    out.push(kept);
  }
  if (Number.isInteger(options.length) && options.length >= 0 && out.length !== options.length && keepPositions) {
    note('resized-list');
    changed = true;
    out.length = Math.min(out.length, options.length);
    while (out.length < options.length) out.push(entry.blank);
  }
  if (Number.isInteger(options.max) && out.length > options.max) {
    note('list-too-long');
    changed = true;
    out.length = options.max;
  }
  if (Number.isInteger(options.min) && out.length < options.min) return orElse(options, note, 'too-few-entries');
  return changed ? out : value;
}, options);

/** A fixed-length list whose every place is required: [x, y]. */
const tuple = (entries, options = {}) => withBlank((value, note) => {
  if (!Array.isArray(value) || value.length !== entries.length) return orElse(options, note, 'not-a-tuple');
  let changed = false;
  const out = [];
  for (let index = 0; index < entries.length; index += 1) {
    const kept = entries[index](value[index], within(note, `[${index}]`));
    if (kept === DROP) return orElse(options, note, 'invalid-entry');
    if (kept !== value[index]) changed = true;
    out.push(kept);
  }
  return changed ? out : value;
}, options);

/** A key the record cannot do without (the tool reads it unconditionally). */
const required = (piece) => {
  const wrapped = (value, note) => piece(value, note);
  wrapped.required = true;
  if (Object.prototype.hasOwnProperty.call(piece, 'blank')) wrapped.blank = piece.blank;
  return wrapped;
};

/**
 * An object with known keys. An optional key that is missing stays missing; a
 * damaged one is removed. A required key that is missing or damaged takes its
 * piece's blank when it has one; otherwise the record is not kept. Keys the
 * shape does not name are kept as they are (a newer build's), except
 * `__proto__`.
 */
const record = (fields, options = {}) => withBlank((value, note) => {
  if (!isPlainRecord(value)) return orElse(options, note, 'not-a-record');
  let changed = false;
  const out = {};
  Object.keys(value).forEach((key) => {
    if (key === HOSTILE_KEY) { changed = true; note('hostile-key'); return; }
    out[key] = value[key];
  });
  for (const [key, piece] of Object.entries(fields)) {
    const inner = within(note, `.${key}`);
    if (!hasOwn(value, key) || value[key] === undefined) {
      if (!piece.required) continue;
      if (!Object.prototype.hasOwnProperty.call(piece, 'blank')) return orElse(options, inner, 'missing');
      inner('missing');
      out[key] = piece.blank;
      changed = true;
      continue;
    }
    const kept = piece(value[key], inner);
    if (kept === DROP) {
      changed = true;
      if (!piece.required) { delete out[key]; continue; }
      if (!Object.prototype.hasOwnProperty.call(piece, 'blank')) return orElse(options, note, 'invalid-record');
      out[key] = piece.blank;
      continue;
    }
    if (kept !== value[key]) { out[key] = kept; changed = true; }
  }
  return changed ? out : value;
}, options);

/**
 * An object used as a map: every value has the same shape. `keys` (a list or a
 * test) names the keys the question still has; another is dropped as stale.
 */
const map = (entry, options = {}) => withBlank((value, note) => {
  if (!isPlainRecord(value)) return orElse(options, note, 'not-a-map');
  const allowed = typeof options.keys === 'function'
    ? options.keys
    : Array.isArray(options.keys) ? ((key) => options.keys.includes(key)) : null;
  let changed = false;
  const out = {};
  Object.keys(value).forEach((key) => {
    if (key === HOSTILE_KEY) { changed = true; note('hostile-key'); return; }
    if (allowed && !allowed(key)) { changed = true; note('stale-key'); return; }
    const kept = entry(value[key], within(note, `.${key}`));
    if (kept === DROP) {
      changed = true;
      if (Object.prototype.hasOwnProperty.call(entry, 'blank')) out[key] = entry.blank;
      return;
    }
    if (kept !== value[key]) changed = true;
    out[key] = kept;
  });
  return changed ? out : value;
}, options);

/**
 * A check only the tool can make (an index into the question's equations):
 * `test(value)` true keeps the value.
 */
const where = (test, options = {}) => withBlank((value, note) => {
  let ok = false;
  try { ok = Boolean(test(value)); } catch { ok = false; }
  return ok ? value : orElse(options, note, options.code || 'invalid');
}, options);

// Structural equality of two JSON-like values.
const sameValue = (a, b, depth = 0) => {
  if (Object.is(a, b)) return true;
  if (depth > 40 || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => hasOwn(b, key) && sameValue(a[key], b[key], depth + 1));
};

/**
 * A record the tool already knows how to normalise (its own model function,
 * which accepts anything and returns a whole model). The saved record comes
 * back as it was when the function leaves it unchanged; anything that is not a
 * record is not kept.
 */
const via = (normalizeModel, options = {}) => withBlank((value, note) => {
  if (!isPlainRecord(value)) return orElse(options, note, 'not-a-record');
  let kept;
  try { kept = normalizeModel(value); } catch { return orElse(options, note, 'unreadable'); }
  if (kept === undefined) return orElse(options, note, 'unreadable');
  if (sameValue(kept, value)) return value;
  note('repaired');
  return kept;
}, options);

/** A piece, then a check of what it kept. */
const refine = (piece, test, options = {}) => withBlank((value, note) => {
  const kept = piece(value, note);
  if (kept === DROP) return Object.prototype.hasOwnProperty.call(options, 'or') ? options.or : DROP;
  return where(test, options)(kept, note);
}, options);

/** A typed cell: text, or a number the question or the tool put there. Kept as it is. */
const cell = (options = {}) => withBlank(either(number(), text(options)), options);

export const draftShape = Object.freeze({
  text, number, boolean, oneOf, nullable, any, either, list, tuple, required, record, map, where, refine, via,
  cell,
  /** [x, y] of finite numbers. */
  point: (options = {}) => tuple([number(), number()], options),
  /**
   * What an <input type="number"> holds: a number, or text that reads as one
   * (the browser gives the box nothing else), or nothing typed yet. Other
   * text is not kept: drawn into the screen's own arithmetic it reads NaN.
   */
  numberBox: (options = {}) => either(
    number(options),
    where((value) => typeof value === 'string' && value.length <= 64 && (value.trim() === '' || Number.isFinite(Number(value)))),
  ),
  /**
   * A grid of typed cells (a matrix), `rows` × `cols` when the question fixes
   * them: a cell that is not a value is a blank cell, and a row that is not a
   * list a blank row, each in its place.
   */
  grid: (rows, cols) => list(
    list(cell({ or: '' }), Number.isInteger(cols)
      ? { keepPositions: true, length: cols, or: Array.from({ length: cols }, () => '') }
      : { keepPositions: true, or: [] }),
    Number.isInteger(rows) ? { keepPositions: true, length: rows } : { keepPositions: true },
  ),
});

/**
 * The `normalize` option for usePersistentToolState: the value kept, and what
 * was repaired. `undefined` means nothing could be kept, and the field starts
 * from its initial value.
 */
export const draftNormalizer = (shape) => (value) => {
  const issues = [];
  const note = (issue) => { if (issues.length < MAX_ISSUES && !issues.includes(issue)) issues.push(issue); };
  let kept;
  try {
    kept = shape(value, note);
  } catch {
    return { value: undefined, issues: ['normalize-failed'] };
  }
  return { value: kept === DROP ? undefined : kept, issues };
};

/*
 * THE SHAPE EVERY FIELD HAS WITHOUT SAYING SO.
 *
 * What a field starts as tells its kind for good: no setter in src/tools
 * gives a field that starts as text anything but text, one that starts as
 * true / false anything but a boolean, or one that starts as a number anything
 * but a number or what was typed into its box (DataModelingLab's prediction).
 * hydrateToolDraftField checks every field this way after the field's own
 * normalize, as it checks a map stays a map and a list a list.
 */
export const SCALAR_DRAFT_SHAPES = Object.freeze({
  string: text(),
  boolean: boolean(),
  number: number({ orText: true }),
});

/**
 * The same value with no `__proto__` key at any depth: JSON keeps one as an
 * ordinary key, and writing it back into an object (Object.assign, a copy
 * loop) replaces that object's prototype. The same object when there is none.
 */
export const withoutPrototypeKeys = (value, note = () => {}, depth = 0) => {
  if (depth > 24 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((entry) => {
      const kept = withoutPrototypeKeys(entry, note, depth + 1);
      if (kept !== entry) changed = true;
      return kept;
    });
    return changed ? out : value;
  }
  let changed = false;
  const out = {};
  Object.keys(value).forEach((key) => {
    if (key === HOSTILE_KEY) { changed = true; note('hostile-key'); return; }
    const kept = withoutPrototypeKeys(value[key], note, depth + 1);
    if (kept !== value[key]) changed = true;
    out[key] = kept;
  });
  return changed ? out : value;
};

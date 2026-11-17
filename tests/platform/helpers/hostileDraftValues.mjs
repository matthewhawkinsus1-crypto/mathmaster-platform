/*
 * WHAT A DAMAGED DRAFT CAN HOLD WHERE A FIELD'S VALUE BELONGS.
 *
 * A saved draft is whatever some build, on some device, wrote, or damage left
 * (toolDraftShape.js). The draft-shape tests restore every field from these:
 *
 *   hostileValues()    every wrong kind: a scalar of the wrong type, a list of
 *                      nulls, words, numbers, records or nested lists, a map
 *                      of the same, keys such as __proto__ and constructor
 *                      (and a toString that is not a function), very long
 *                      text and a very long list;
 *   rawHostileValues() what JSON cannot carry (NaN, Infinity, undefined),
 *                      which reaches a tool only from the in-memory cache;
 *   damagedCopies(v)   a VALID value v with one part damaged at a time: each
 *                      key deleted or given a wrong kind (a record that cannot
 *                      be turned into text among them), each list's first and
 *                      last entry replaced, every entry of a list given the same
 *                      damage (a row with no type), keys merged into each map,
 *                      to MAX_DEPTH.
 *
 * Every value is built fresh, so a test may hand it to code that changes it.
 */
export const hostileKeys = () => JSON.parse('{"__proto__":{"polluted":1},"constructor":"x","toString":1,"valueOf":null,"hasOwnProperty":2,"length":5}');
export const LONG_TEXT_LENGTH = 100000;

export const hostileValues = ({ long = true } = {}) => [
  ['null', null],
  ['true', true],
  ['false', false],
  ['zero', 0],
  ['negative', -3],
  ['fraction', 2.5],
  ['huge number', 1e300],
  ['empty text', ''],
  ['text', 'abc'],
  ['numeric text', '12'],
  ['spaces', '   '],
  ['empty list', []],
  ['empty map', {}],
  ['list of null', [null]],
  ['list of text', ['abc']],
  ['list of number', [7]],
  ['list of boolean', [true]],
  ['list of record', [{}]],
  ['nested list', [[1, 2], [3, 4]]],
  ['deep list', [[[]]]],
  ['map of null', { a: null }],
  ['map of text', { a: 'x' }],
  ['map of list', { a: [1] }],
  ['map with numeric keys', { 0: 'x', 1: null }],
  ['hostile keys', hostileKeys()],
  ...(long ? [
    ['long text', 'a'.repeat(LONG_TEXT_LENGTH)],
    ['long expression', `${'x+'.repeat(2500)}1`],
    ['long list of null', Array.from({ length: 3000 }, () => null)],
  ] : []),
];

export const rawHostileValues = () => [
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['undefined', undefined],
];

export const UNPRINTABLE = 'unprintable record';
const LEAF_DAMAGE = ({ long = true } = {}) => [
  ['null', null],
  ['text', 'abc'],
  ['number', 12],
  ['boolean', true],
  ['list', []],
  ['map', {}],
  ['nested list', [[1]]],
  // Where a typed answer or a coordinate belongs, a record whose toString is
  // not a function: drawing it throws "Cannot convert object to primitive value".
  [UNPRINTABLE, hostileKeys()],
  ...(long ? [['long text', 'a'.repeat(50000)]] : []),
];
const ENTRY_DAMAGE = () => [['null', null], ['text', 'abc'], ['number', 7], ['map', {}], ['list', [[1, 2]]], ['hostile keys', hostileKeys()]];

const MAX_DEPTH = 4;
const copy = (value) => (value === undefined ? undefined : structuredClone(value));
const isMap = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const label = (path) => path.map((part) => (typeof part === 'number' ? `[${part}]` : `.${part}`)).join('') || '(value)';

// A copy of `root` with `edit` applied, in place, to the node at `path`.
const editAt = (root, path, edit) => {
  const out = copy(root);
  edit(path.reduce((node, part) => node[part], out));
  return out;
};

const positions = (value, path = [], out = []) => {
  if (path.length > MAX_DEPTH) return out;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { if (index === 0 || index === value.length - 1) positions(entry, [...path, index], out); });
  } else if (isMap(value)) {
    Object.entries(value).forEach(([key, entry]) => positions(entry, [...path, key], out));
  }
  if (path.length) out.push([path, value]);
  return out;
};

const listsIn = (value, path = [], out = []) => {
  if (path.length > MAX_DEPTH) return out;
  if (Array.isArray(value) && value.length) { out.push(path); listsIn(value[0], [...path, 0], out); }
  else if (isMap(value)) Object.entries(value).forEach(([key, entry]) => listsIn(entry, [...path, key], out));
  return out;
};
const mapsIn = (value, path = [], out = []) => {
  if (path.length > MAX_DEPTH) return out;
  if (isMap(value)) { out.push(path); Object.entries(value).forEach(([key, entry]) => mapsIn(entry, [...path, key], out)); }
  else if (Array.isArray(value) && value.length) mapsIn(value[0], [...path, 0], out);
  return out;
};

/** [name, damaged copy] pairs of a valid value, one damaged part each. */
export const damagedCopies = (valid, { long = true } = {}) => {
  if (valid === undefined) return [];
  const cases = new Map();
  const add = (name, value) => { if (!cases.has(name)) cases.set(name, value); };
  positions(valid).forEach(([path, value]) => {
    const parent = path.slice(0, -1);
    const last = path[path.length - 1];
    if (typeof last === 'string') add(`${label(path)} missing`, editAt(valid, parent, (node) => { delete node[last]; }));
    LEAF_DAMAGE({ long }).forEach(([kind, damage]) => {
      if (typeof damage === typeof value && JSON.stringify(damage) === JSON.stringify(value)) return;
      add(`${label(path)} = ${kind}`, editAt(valid, parent, (node) => { node[last] = copy(damage); }));
    });
  });
  listsIn(valid).forEach((path) => {
    const first = path.reduce((node, part) => node[part], valid)[0];
    if (isMap(first)) {
      Object.keys(first).forEach((key) => {
        LEAF_DAMAGE({ long: false }).slice(0, 6).forEach(([kind, damage]) => {
          add(`${label(path)}[*].${key} = ${kind}`, editAt(valid, path, (list) => { list.forEach((entry) => { if (isMap(entry)) entry[key] = copy(damage); }); }));
        });
        add(`${label(path)}[*].${key} missing`, editAt(valid, path, (list) => { list.forEach((entry) => { if (isMap(entry)) delete entry[key]; }); }));
      });
    }
    ENTRY_DAMAGE().forEach(([kind, damage]) => {
      add(`${label(path)}[*] = ${kind}`, editAt(valid, path, (list) => { list.forEach((_, index) => { list[index] = copy(damage); }); }));
      add(`${label(path)} + ${kind}`, editAt(valid, path, (list) => { list.push(copy(damage)); }));
    });
    if (long) {
      add(`${label(path)} × 3000`, editAt(valid, path, (list) => { const entry = list[0]; list.length = 0; for (let index = 0; index < 3000; index += 1) list.push(copy(entry)); }));
    }
  });
  mapsIn(valid).forEach((path) => {
    add(`${label(path)} + hostile keys`, editAt(valid, path, (target) => {
      const extra = hostileKeys();
      Object.keys(extra).forEach((key) => Object.defineProperty(target, key, { value: extra[key], enumerable: true, writable: true, configurable: true }));
    }));
  });
  return [...cases.entries()];
};

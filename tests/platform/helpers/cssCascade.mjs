/*
 * WHICH DECLARATION WINS, FOR TESTS ABOUT ORDER AND WEIGHT.
 *
 * Nothing in this suite lays a page out. Some rules, though, are about the
 * cascade itself: "on a touch screen this checkbox is 22px whichever of these
 * stylesheets loads last". This answers that the way a browser does, for one
 * element described by its ancestry, on one device, from stylesheets given in
 * the order they link: importance, then specificity, then order.
 *
 *   const sheets = [{ name: 'App.css', rules: parseCss(read('src/App.css')) }, …];
 *   const path = [{ tag: 'div', classes: ['mm-dashboard-content'] }, …, { tag: 'input', attrs: { type: 'checkbox' } }];
 *   winning({ sheets, path, property: 'width', device: { width: 1180, height: 820, pointer: 'coarse' } });
 *     // -> { value: '22px', important: false, sheet: 'App.css', selector: '…', specificity: [0, 3, 1] }, or null
 *
 * The element is the last entry of `path`, its ancestors before it (html
 * first). Each entry is { tag, id, classes, attrs, state }: `state` lists the
 * pseudo-classes that hold for it (`hover`, `focus-visible`, `first-child`…);
 * any other state pseudo-class does not. Sibling combinators (+, ~) and :has()
 * never match: a path has no siblings or children. Media queries read the
 * device ({ width, height, pointer, hover, print, colorScheme, reducedMotion });
 * a feature it does not know throws, so a new kind of rule cannot be skipped
 * in silence. Inline styles are not modelled: they beat every rule in any order.
 */

// Split at a separator that is not inside (), [] or a quoted string.
const splitTop = (text, separator) => {
  const parts = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quote) {
      if (ch === '\\') index += 1;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
};

const closing = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') { depth -= 1; if (depth === 0) return index; }
  }
  throw new Error(`cssCascade: unbalanced ( in ${text}`);
};

// A complex selector as compounds and the combinators between them.
const parseComplex = (selector) => {
  const steps = [];
  let current = '';
  let combinator = null;
  let depth = 0;
  let bracket = 0;
  const flush = () => {
    if (current.trim()) { steps.push({ combinator, compound: current.trim() }); combinator = null; }
    current = '';
  };
  for (const ch of selector.trim()) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === '[') bracket += 1;
    if (ch === ']') bracket -= 1;
    if (!depth && !bracket && (ch === '>' || ch === '+' || ch === '~')) { flush(); combinator = ch; continue; }
    if (!depth && !bracket && /\s/.test(ch)) { flush(); if (!combinator) combinator = ' '; continue; }
    current += ch;
  }
  flush();
  return steps.map((step, index) => ({ ...step, combinator: index === 0 ? null : (step.combinator || ' ') }));
};

// The simple selectors of one compound.
const parseCompound = (compound) => {
  const parts = [];
  let index = 0;
  const name = () => {
    const match = compound.slice(index).match(/^-?[\w-]+/);
    index += match ? match[0].length : 0;
    return match ? match[0] : '';
  };
  while (index < compound.length) {
    const ch = compound[index];
    if (ch === '*') { index += 1; parts.push({ kind: 'universal' }); continue; }
    if (ch === '.') { index += 1; parts.push({ kind: 'class', name: name() }); continue; }
    if (ch === '#') { index += 1; parts.push({ kind: 'id', name: name() }); continue; }
    if (ch === '[') {
      const end = compound.indexOf(']', index);
      const body = compound.slice(index + 1, end).trim();
      index = end + 1;
      const match = body.match(/^([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*(i)?$/);
      if (!match) throw new Error(`cssCascade: cannot read [${body}]`);
      parts.push({ kind: 'attr', name: match[1], op: match[2] || null, value: match[3] ?? match[4] ?? match[5] ?? null, insensitive: Boolean(match[6]) });
      continue;
    }
    if (ch === ':') {
      const element = compound[index + 1] === ':';
      index += element ? 2 : 1;
      const pseudo = name().toLowerCase();
      let argument = null;
      if (compound[index] === '(') {
        const end = closing(compound, index);
        argument = compound.slice(index + 1, end);
        index = end + 1;
      }
      const legacyElement = ['before', 'after', 'first-line', 'first-letter'].includes(pseudo);
      parts.push({ kind: element || legacyElement ? 'pseudo-element' : 'pseudo-class', name: pseudo, argument });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) { parts.push({ kind: 'type', name: name().toLowerCase() }); continue; }
    throw new Error(`cssCascade: cannot read "${compound}" at ${index}`);
  }
  return parts;
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const compareSpecificity = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
const most = (list) => list.reduce((best, item) => (compareSpecificity(item, best) > 0 ? item : best), [0, 0, 0]);

/** Specificity of one complex selector, as [ids, classes, types]. */
export const specificity = (selector) => parseComplex(selector).reduce((total, { compound }) => parseCompound(compound).reduce((sum, part) => {
  if (part.kind === 'id') return add(sum, [1, 0, 0]);
  if (part.kind === 'class' || part.kind === 'attr') return add(sum, [0, 1, 0]);
  if (part.kind === 'type' || part.kind === 'pseudo-element') return add(sum, [0, 0, 1]);
  if (part.kind === 'pseudo-class') {
    if (part.name === 'where') return sum;
    if (['is', 'not', 'has', 'matches'].includes(part.name)) return add(sum, most(splitTop(part.argument, ',').map(specificity)));
    if (/^nth-(last-)?child$/.test(part.name) && / of /.test(part.argument || '')) {
      return add(add(sum, [0, 1, 0]), most(splitTop(part.argument.split(/ of /)[1], ',').map(specificity)));
    }
    return add(sum, [0, 1, 0]);
  }
  return sum;
}, total), [0, 0, 0]);

const attrHolds = (element, part) => {
  const attrs = element.attrs || {};
  if (!(part.name in attrs)) return false;
  if (!part.op) return true;
  let have = String(attrs[part.name]);
  let want = String(part.value);
  if (part.insensitive) { have = have.toLowerCase(); want = want.toLowerCase(); }
  if (part.op === '=') return have === want;
  if (part.op === '~=') return have.split(/\s+/).includes(want);
  if (part.op === '^=') return have.startsWith(want);
  if (part.op === '$=') return have.endsWith(want);
  if (part.op === '*=') return have.includes(want);
  if (part.op === '|=') return have === want || have.startsWith(`${want}-`);
  return false;
};

const compoundHolds = (element, compound, position) => parseCompound(compound).every((part) => {
  if (part.kind === 'universal') return true;
  if (part.kind === 'type') return element.tag.toLowerCase() === part.name;
  if (part.kind === 'class') return (element.classes || []).includes(part.name);
  if (part.kind === 'id') return element.id === part.name;
  if (part.kind === 'attr') return attrHolds(element, part);
  if (part.kind === 'pseudo-element') return false;
  if (['is', 'where', 'matches'].includes(part.name)) return splitTop(part.argument, ',').some((inner) => matchesAt(inner, position));
  if (part.name === 'not') return !splitTop(part.argument, ',').some((inner) => matchesAt(inner, position));
  if (part.name === 'root') return element.tag.toLowerCase() === 'html';
  return (element.state || []).includes(part.name);
});

// Does the selector match the element at `position.index` of `position.path`?
function matchesAt(selector, position) {
  const steps = parseComplex(selector);
  const walk = (stepIndex, elementIndex) => {
    const step = steps[stepIndex];
    if (!compoundHolds(position.path[elementIndex], step.compound, { path: position.path, index: elementIndex })) return false;
    if (stepIndex === 0) return true;
    if (step.combinator === '>') return elementIndex > 0 && walk(stepIndex - 1, elementIndex - 1);
    if (step.combinator === ' ') {
      for (let ancestor = elementIndex - 1; ancestor >= 0; ancestor -= 1) if (walk(stepIndex - 1, ancestor)) return true;
      return false;
    }
    return false; // + and ~: a path has no siblings
  };
  return walk(steps.length - 1, position.index);
}

/** Does `selector` (one complex selector) match the last element of `path`? */
export const matchesPath = (path, selector) => matchesAt(selector, { path, index: path.length - 1 });

const featureHolds = (feature, device) => {
  const text = feature.replace(/\s+/g, ' ').trim();
  let match;
  if ((match = text.match(/^(min|max)-(width|height): ([\d.]+)px$/))) {
    const have = device[match[2]];
    return match[1] === 'min' ? have >= Number(match[3]) : have <= Number(match[3]);
  }
  if ((match = text.match(/^orientation: (portrait|landscape)$/))) return (device.height >= device.width ? 'portrait' : 'landscape') === match[1];
  if ((match = text.match(/^(any-)?pointer: (coarse|fine|none)$/))) return (device.pointer || 'fine') === match[2];
  if ((match = text.match(/^(any-)?hover: (hover|none)$/))) return (device.hover || ((device.pointer || 'fine') === 'fine' ? 'hover' : 'none')) === match[2];
  if ((match = text.match(/^prefers-color-scheme: (light|dark)$/))) return (device.colorScheme || 'light') === match[1];
  if ((match = text.match(/^prefers-reduced-motion: (reduce|no-preference)$/))) return (device.reducedMotion ? 'reduce' : 'no-preference') === match[1];
  if ((match = text.match(/^forced-colors: (active|none)$/))) return (device.forcedColors ? 'active' : 'none') === match[1];
  throw new Error(`cssCascade: the device cannot answer (${feature})`);
};

/** Does an at-rule prelude (`@media …`, `@supports …`) hold on the device? */
export const atRuleHolds = (prelude, device) => {
  if (/^@supports\b/i.test(prelude)) return true;
  if (!/^@media\b/i.test(prelude)) throw new Error(`cssCascade: cannot evaluate ${prelude}`);
  return splitTop(prelude.replace(/^@media\s*/i, ''), ',').some((query) => {
    let rest = query.trim().toLowerCase();
    let negate = false;
    if (rest.startsWith('not ')) { negate = true; rest = rest.slice(4).trim(); }
    if (rest.startsWith('only ')) rest = rest.slice(5).trim();
    const terms = rest.split(/\s+and\s+/);
    const holds = terms.every((term) => {
      if (term === 'all') return true;
      if (term === 'print') return Boolean(device.print);
      if (term === 'screen') return !device.print;
      const inner = term.match(/^\((.*)\)$/);
      if (!inner) throw new Error(`cssCascade: cannot read media query ${query}`);
      return featureHolds(inner[1], device);
    });
    return negate ? !holds : holds;
  });
};

// The value a declaration gives `property`, or undefined when it does not set it.
const valueFor = (declarations, property) => {
  if (property in declarations) return declarations[property];
  const box = property.match(/^(padding|margin)-(top|right|bottom|left)$/);
  if (box && declarations[box[1]]) {
    const { value, important } = declarations[box[1]];
    const values = splitTop(value, ' ');
    const [top, right = top, bottom = top, left = right] = values;
    return { value: { top, right, bottom, left }[box[2]], important };
  }
  if (property === 'font-size' && declarations.font) {
    const { value, important } = declarations.font;
    if (/^(inherit|initial|unset|revert)$/.test(value)) return { value, important };
    const size = value.match(/(?:^|\s)((?:calc|max|min|clamp)\(.*?\)|[\d.]+(?:px|rem|em|%)|(?:xx-|x-)?(?:small|large)|medium)(?:\/\S+)?\s/);
    if (size) return { value: size[1], important };
  }
  return undefined;
};

/**
 * The declaration of `property` that wins for the last element of `path` on
 * `device`, from `sheets` ([{ name, rules }] in link order, rules from
 * cssRules.parseCss): { value, important, sheet, selector, specificity }, or
 * null when no rule sets it.
 */
export const winning = ({ sheets, path, property, device }) => {
  let best = null;
  let order = 0;
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      order += 1;
      const declared = valueFor(rule.declarations, property);
      if (!declared) continue;
      if (!rule.atRules.every((prelude) => atRuleHolds(prelude, device))) continue;
      for (const selector of rule.selectors) {
        if (!matchesPath(path, selector)) continue;
        const candidate = { ...declared, sheet: sheet.name, selector, specificity: specificity(selector), order };
        if (!best
          || (candidate.important && !best.important)
          || (candidate.important === best.important && compareSpecificity(candidate.specificity, best.specificity) >= 0)) {
          best = candidate;
        }
      }
    }
  }
  if (!best) return null;
  const { order: _order, ...result } = best;
  return result;
};

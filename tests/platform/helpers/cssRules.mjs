/*
 * A STYLESHEET AS ITS RULES, FOR TESTS THAT ASK WHAT A SELECTOR DECLARES.
 *
 * Nothing in this suite lays a page out, so a layout rule is bound to its
 * stylesheet. Matching the text of a rule (`/flex-wrap:\s*nowrap/` somewhere in
 * a 600-line file) breaks on a reordered declaration and passes when the
 * declaration sits in the wrong rule. This reads the sheet as the cascade does:
 * each rule has its selectors, the at-rules it sits inside (`@media ...`) and
 * its declarations, so a test can say "under this media query, this selector
 * sets this property to this value" and mean exactly that.
 *
 *   const rules = parseCss(read('src/components/student/MathToolMobileLayout.css'));
 *   declared(rules, '.question-prompt-heading', 'flex-wrap', { media: '(max-width: 768px)' });
 *     // -> { value: 'wrap', important: false }, or null when nothing sets it
 *
 * Plain CSS only (this repository writes none with native nesting). Selectors
 * compare with their whitespace collapsed, so write them as the sheet does.
 */

const stripComments = (css) => String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

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
  return parts;
};

const closingBrace = (text, open) => {
  let depth = 0;
  let quote = '';
  for (let index = open; index < text.length; index += 1) {
    const ch = text[index];
    if (quote) {
      if (ch === '\\') index += 1;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('cssRules: a block is never closed');
};

const parseDeclarations = (body) => {
  const declarations = {};
  for (const piece of splitTop(body, ';')) {
    const colon = piece.indexOf(':');
    if (colon === -1) continue;
    const property = piece.slice(0, colon).trim().toLowerCase();
    let value = collapse(piece.slice(colon + 1));
    const important = /\s*!important$/i.test(value);
    if (important) value = value.replace(/\s*!important$/i, '');
    if (property) declarations[property] = { value, important };
  }
  return declarations;
};

const CONDITIONAL = /^@(media|supports|container|layer)\b/i;

export const parseCss = (css) => {
  const text = stripComments(css);
  const rules = [];
  const walk = (from, to, atRules) => {
    let index = from;
    let preludeStart = from;
    while (index < to) {
      const ch = text[index];
      if (ch === '{') {
        const close = closingBrace(text, index);
        const prelude = collapse(text.slice(preludeStart, index));
        if (CONDITIONAL.test(prelude)) walk(index + 1, close, [...atRules, prelude]);
        else if (!prelude.startsWith('@')) {
          rules.push({
            atRules,
            selectors: splitTop(prelude, ',').map(collapse).filter(Boolean),
            declarations: parseDeclarations(text.slice(index + 1, close)),
          });
        }
        index = close + 1;
        preludeStart = index;
      } else {
        index += 1;
        if (ch === ';') preludeStart = index;
      }
    }
  };
  walk(0, text.length, []);
  return rules;
};

// `media`: text one of the rule's at-rules must contain; null means the rule
// sits in no at-rule at all; undefined means any.
const inScope = (rule, media) => {
  if (media === undefined) return true;
  if (media === null) return rule.atRules.length === 0;
  return rule.atRules.some((atRule) => atRule.includes(media));
};

export const rulesFor = (rules, selector, { media } = {}) => {
  const wanted = collapse(selector);
  return rules.filter((rule) => rule.selectors.includes(wanted) && inScope(rule, media));
};

// What the sheet finally says for this selector's property: the last rule in
// source order that sets it, or null when none does.
export const declared = (rules, selector, property, options = {}) => {
  const hits = rulesFor(rules, selector, options).filter((rule) => property in rule.declarations);
  return hits.length ? hits[hits.length - 1].declarations[property] : null;
};

export default { parseCss, rulesFor, declared };

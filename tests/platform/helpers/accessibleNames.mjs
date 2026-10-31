/*
 * THE NAME A SCREEN READER GETS FOR A CONTROL, FROM SERVER-RENDERED MARKUP.
 *
 * Node cannot mount React in a browser, but the real components render to
 * markup through Vite (see choiceAccessibleLabel.test.mjs). This reads that
 * markup the way the accessible-name computation does for the cases the
 * student screens use: `aria-labelledby`, then `aria-label`, then the control's
 * content with everything hidden from assistive technology left out
 * (`aria-hidden`, `hidden`, `display: none`) and everything visually hidden but
 * still read (MathDisplay's spoken copy) kept in.
 *
 * It is a small model of a browser's rule, not the rule itself: the browser
 * drivers (tests/browser/*) read the real accessibility tree. This is for the
 * checks a platform test can make without one.
 */

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

const decode = (text) => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;|&apos;/g, "'")
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&');

const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const parseAttributes = (source) => {
  const attrs = {};
  for (const match of source.matchAll(ATTRIBUTE)) attrs[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
};

const TOKEN = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;

/** A tree of { tag, attrs, children } (children are nodes or strings). */
export const parseMarkup = (markup) => {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  for (const match of String(markup).matchAll(TOKEN)) {
    const [whole, closing, opening, attributes, selfClosing, text] = match;
    const parent = stack[stack.length - 1];
    if (whole.startsWith('<!--')) continue;
    if (text !== undefined) { parent.children.push(decode(text)); continue; }
    if (closing) {
      const at = stack.map((node) => node.tag).lastIndexOf(closing.toLowerCase());
      if (at > 0) stack.length = at;
      continue;
    }
    const node = { tag: opening.toLowerCase(), attrs: parseAttributes(attributes || ''), children: [] };
    parent.children.push(node);
    if (!selfClosing && !VOID_ELEMENTS.has(node.tag)) stack.push(node);
  }
  return root;
};

/** Every element under `root` (depth first) that `predicate` accepts. */
export const findAll = (root, predicate) => {
  const found = [];
  const walk = (node) => {
    node.children.forEach((child) => {
      if (typeof child === 'string') return;
      if (predicate(child)) found.push(child);
      walk(child);
    });
  };
  walk(root);
  return found;
};

const isHidden = (node) => node.attrs['aria-hidden'] === 'true'
  || 'hidden' in node.attrs
  || /display:\s*none/.test(node.attrs.style || '')
  || ['script', 'style'].includes(node.tag);

/** What a screen reader reads inside `node`: its text, minus what is hidden from it. */
export const readableText = (node) => (typeof node === 'string'
  ? node
  : (isHidden(node) ? '' : node.children.map((child) => `${readableText(child)}${typeof child === 'string' ? '' : ' '}`).join('')))
  .replace(/\s+/g, ' ')
  .trim();

/** The text of an element by id, in the tree under `root`. */
export const textOfId = (root, id) => {
  const [target] = findAll(root, (node) => node.attrs.id === id);
  return target ? readableText({ ...target, attrs: { ...target.attrs, 'aria-hidden': undefined } }) : '';
};

/** aria-labelledby, else aria-label, else content: the name of `node`. */
export const accessibleName = (node, root) => {
  const labelledBy = (node.attrs['aria-labelledby'] || '').split(/\s+/).filter(Boolean);
  if (labelledBy.length) return labelledBy.map((id) => textOfId(root, id)).join(' ').trim();
  if ((node.attrs['aria-label'] || '').trim()) return node.attrs['aria-label'].trim();
  return readableText(node);
};

/** The names of every element with `role`, in document order. */
export const namesOfRole = (markup, role) => {
  const root = parseMarkup(markup);
  return findAll(root, (node) => node.attrs.role === role).map((node) => accessibleName(node, root));
};

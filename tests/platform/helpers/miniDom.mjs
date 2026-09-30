/*
 * A VERY SMALL DOM, FOR TESTING CODE THAT WALKS ONE.
 *
 * Node cannot render React and this repository has no jsdom. Some platform
 * logic is nonetheless pure DOM-walking — "which button may Enter press from
 * this field?" — and is worth pinning without a browser. This builds element
 * trees that answer the handful of calls that logic makes: `closest`,
 * `querySelector(All)`, `contains`, `getAttribute`, plus `tagName`, `value`,
 * `disabled`, `hidden`, `type`, `textContent`, `focus` and `click`. String
 * children become text.
 *
 * Selectors: comma lists of compound selectors made of a tag, `.class`,
 * `[attr]`, `[attr="value"]` and `:not(<one of those>)`. No combinators.
 */

const parseCompound = (text) => {
  const parts = { tag: null, classes: [], attrs: [], nots: [] };
  let rest = text.trim();
  const tag = rest.match(/^[a-zA-Z][\w-]*/);
  if (tag) { parts.tag = tag[0].toLowerCase(); rest = rest.slice(tag[0].length); }
  while (rest.length) {
    let match;
    if ((match = rest.match(/^\.([\w-]+)/))) { parts.classes.push(match[1]); }
    else if ((match = rest.match(/^\[([\w-]+)(?:="([^"]*)")?\]/))) { parts.attrs.push({ name: match[1], value: match[2] ?? null }); }
    else if ((match = rest.match(/^:not\(([^)]*)\)/))) { parts.nots.push(parseCompound(match[1])); }
    else throw new Error(`miniDom cannot parse selector part: ${rest}`);
    rest = rest.slice(match[0].length);
  }
  return parts;
};

const matchesCompound = (element, parts) => {
  if (parts.tag && element.tagName.toLowerCase() !== parts.tag) return false;
  if (parts.classes.some((name) => !element.classList.includes(name))) return false;
  for (const attr of parts.attrs) {
    const value = element.getAttribute(attr.name);
    if (value === null) return false;
    if (attr.value !== null && value !== attr.value) return false;
  }
  if (parts.nots.some((not) => matchesCompound(element, not))) return false;
  return true;
};

const splitList = (selector) => selector.split(',').map((part) => part.trim()).filter(Boolean);

export const matches = (element, selector) => splitList(selector).some((part) => matchesCompound(element, parseCompound(part)));

/**
 * h('div', { class: 'mathmaster-tool-panel' }, h('input', { value: '' }), ...)
 * Attributes named `value`, `disabled` and `hidden` also become properties.
 */
export const h = (tag, attributes = {}, ...children) => {
  const attrs = { ...attributes };
  const element = {
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    parentElement: null,
    children: [],
    classList: String(attrs.class || '').split(/\s+/).filter(Boolean),
    value: attrs.value ?? '',
    disabled: attrs.disabled !== undefined && attrs.disabled !== false,
    hidden: Boolean(attrs.hidden),
    type: attrs.type || '',
    clicks: 0,
    focused: 0,
    getAttribute(name) {
      if (name === 'disabled') return this.disabled ? '' : null;
      if (name === 'class') return this.classList.join(' ') || null;
      if (name === 'value') return String(this.value);
      return Object.prototype.hasOwnProperty.call(attrs, name) && attrs[name] !== false && attrs[name] !== undefined ? String(attrs[name]) : null;
    },
    click() { this.clicks += 1; },
    focus() { this.focused += 1; },
    scrollIntoView() {},
    closest(selector) {
      let node = this;
      while (node) {
        if (matches(node, selector)) return node;
        node = node.parentElement;
      }
      return null;
    },
    contains(other) {
      let node = other;
      while (node) {
        if (node === this) return true;
        node = node.parentElement;
      }
      return false;
    },
    querySelectorAll(selector) {
      const found = [];
      const visit = (node) => node.children.forEach((child) => {
        if (matches(child, selector)) found.push(child);
        visit(child);
      });
      visit(this);
      return found;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  element.textContent = '';
  children.flat().filter((child) => child !== null && child !== undefined && child !== false).forEach((child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      element.textContent += String(child);
      return;
    }
    child.parentElement = element;
    element.children.push(child);
    element.textContent += child.textContent || '';
  });
  return element;
};

export default { h, matches };

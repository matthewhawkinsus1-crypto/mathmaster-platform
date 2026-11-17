/*
 * JUST ENOUGH OF A BROWSER FOR REACT TO MOUNT A REGISTRY TOOL IN NODE.
 *
 * The draft tests render a tool once, through Vite SSR, as a reload does
 * (toolDraftRender.mjs). An Undo needs more: the tool must mount, its effects
 * must run (that is where it registers with the platform Undo), and a press
 * must re-render it. react-dom/client does that against this document: nodes
 * that hold their children and attributes, and every browser API a tool
 * touches as it mounts, answered with nothing (no layout, no observers firing,
 * no focus events). Nothing here is drawn or measured; a test reads what the
 * tool rendered and what it reported, never a size.
 *
 * installMinimalDom() replaces the globals and returns restore(), which puts
 * back what was there.
 */
const ELEMENT = 1;
const TEXT = 3;
const COMMENT = 8;
const DOCUMENT = 9;
const FRAGMENT = 11;
const HTML = 'http://www.w3.org/1999/xhtml';

const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return this; } });

class Style {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  removeProperty(name) { this.values.delete(name); return ''; }
  getPropertyValue(name) { return this.values.get(name) ?? ''; }
}

class Node {
  constructor(document) {
    this.ownerDocument = document;
    this.parentNode = null;
    this.childNodes = [];
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling() { return this.parentNode ? this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null : null; }
  get previousSibling() { return this.parentNode ? this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) - 1] ?? null : null; }
  get parentElement() { return this.parentNode?.nodeType === ELEMENT ? this.parentNode : null; }
  get isConnected() { return Boolean(this.ownerDocument?.documentElement?.contains(this)); }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) {
    if (child.nodeType === FRAGMENT) { [...child.childNodes].forEach((node) => this.insertBefore(node, before)); return child; }
    child.parentNode?.removeChild(child);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  replaceChild(next, old) { this.insertBefore(next, old); return this.removeChild(old); }
  remove() { this.parentNode?.removeChild(this); }
  contains(node) {
    for (let cursor = node; cursor; cursor = cursor.parentNode) if (cursor === this) return true;
    return false;
  }
  getRootNode() { let cursor = this; while (cursor.parentNode) cursor = cursor.parentNode; return cursor; }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
  get textContent() { return this.childNodes.map((child) => child.textContent).join(''); }
  set textContent(value) {
    this.childNodes.forEach((child) => { child.parentNode = null; });
    this.childNodes = [];
    if (value !== '' && value != null) this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
}

class Text extends Node {
  constructor(document, value) { super(document); this.nodeType = TEXT; this.nodeName = '#text'; this.nodeValue = String(value); }
  get data() { return this.nodeValue; }
  set data(value) { this.nodeValue = String(value); }
  get textContent() { return this.nodeValue; }
  set textContent(value) { this.nodeValue = String(value); }
}

class Comment extends Node {
  constructor(document, value) { super(document); this.nodeType = COMMENT; this.nodeName = '#comment'; this.nodeValue = String(value); }
  get textContent() { return ''; }
}

class Element extends Node {
  constructor(document, tag, namespaceURI = HTML) {
    super(document);
    this.nodeType = ELEMENT;
    this.namespaceURI = namespaceURI;
    this.localName = String(tag).toLowerCase();
    this.tagName = namespaceURI === HTML ? String(tag).toUpperCase() : String(tag);
    this.nodeName = this.tagName;
    this.attributeValues = new Map();
    this.style = new Style();
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollLeft = 0;
    const classes = () => new Set((this.getAttribute('class') || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...names) => { const set = classes(); names.forEach((name) => set.add(name)); this.setAttribute('class', [...set].join(' ')); },
      remove: (...names) => { const set = classes(); names.forEach((name) => set.delete(name)); this.setAttribute('class', [...set].join(' ')); },
      contains: (name) => classes().has(name),
      toggle: (name, force) => { const on = force ?? !classes().has(name); this.classList[on ? 'add' : 'remove'](name); return on; },
    };
  }
  setAttribute(name, value) { this.attributeValues.set(String(name).toLowerCase(), String(value)); }
  setAttributeNS(namespace, name, value) { this.setAttribute(name, value); }
  getAttribute(name) { return this.attributeValues.get(String(name).toLowerCase()) ?? null; }
  hasAttribute(name) { return this.attributeValues.has(String(name).toLowerCase()); }
  removeAttribute(name) { this.attributeValues.delete(String(name).toLowerCase()); }
  removeAttributeNS(namespace, name) { this.removeAttribute(name); }
  get attributes() { return [...this.attributeValues].map(([name, value]) => ({ name, value })); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get children() { return this.childNodes.filter((node) => node.nodeType === ELEMENT); }
  get firstElementChild() { return this.children[0] ?? null; }
  get innerHTML() { return this.html ?? ''; }
  set innerHTML(value) { this.html = String(value); this.childNodes = []; }
  // A <select>'s options, and what an <option> or a box holds.
  get options() { return this.querySelectorAll('option'); }
  get value() { return this.typed ?? (this.localName === 'option' ? this.getAttribute('value') ?? this.textContent : ''); }
  set value(next) { this.typed = String(next); }
  get offsetWidth() { return 0; }
  get offsetHeight() { return 0; }
  get clientWidth() { return 0; }
  get clientHeight() { return 0; }
  get scrollWidth() { return 0; }
  get scrollHeight() { return 0; }
  get offsetParent() { return null; }
  getBoundingClientRect() { return emptyRect(); }
  getClientRects() { return []; }
  getBBox() { return emptyRect(); }
  getComputedTextLength() { return 0; }
  scrollIntoView() {}
  scrollTo() {}
  scrollBy() {}
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  click() {}
  select() {}
  setSelectionRange() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() { return false; }
  animate() { return { cancel() {}, finished: Promise.resolve(), addEventListener() {} }; }
  getAnimations() { return []; }
  attachShadow() { return new Element(this.ownerDocument, 'div'); }
  matches() { return false; }
  closest() { return null; }
  // By tag name only; a test reads text, not structure.
  querySelectorAll(selector) {
    const tag = /^[a-z][a-z0-9-]*$/i.test(String(selector)) ? String(selector).toLowerCase() : null;
    const found = [];
    const walk = (node) => node.childNodes.forEach((child) => {
      if (child.nodeType !== ELEMENT) return;
      if (tag && child.localName === tag) found.push(child);
      walk(child);
    });
    if (tag) walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getElementsByTagName(tag) { return this.querySelectorAll(tag); }
  getElementsByClassName() { return []; }
  cloneNode() { return new Element(this.ownerDocument, this.localName, this.namespaceURI); }
}

class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
class Event {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  preventDefault() {}
  stopPropagation() {}
}

const GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'ResizeObserver', 'IntersectionObserver',
  'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia', 'HTMLElement',
  'Element', 'Node', 'HTMLIFrameElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'SVGElement', 'CSS',
  'customElements', 'CustomEvent',
];

/** Install the document and window; returns restore(). */
export function installMinimalDom({ localStorage, sessionStorage }) {
  const document = new Node(null);
  Object.assign(document, { nodeType: DOCUMENT, nodeName: '#document', hidden: false, visibilityState: 'visible' });
  document.createElement = (tag) => new Element(document, tag);
  document.createElementNS = (namespace, tag) => new Element(document, tag, namespace);
  document.createTextNode = (value) => new Text(document, value);
  document.createComment = (value) => new Comment(document, value);
  document.createDocumentFragment = () => Object.assign(new Node(document), { nodeType: FRAGMENT, nodeName: '#document-fragment' });
  document.createRange = () => ({ setStart() {}, setEnd() {}, selectNodeContents() {}, collapse() {}, getBoundingClientRect: emptyRect, getClientRects: () => [] });
  document.documentElement = document.createElement('html');
  document.head = document.createElement('head');
  document.body = document.createElement('body');
  document.documentElement.appendChild(document.head);
  document.documentElement.appendChild(document.body);
  document.appendChild(document.documentElement);
  document.activeElement = document.body;
  document.fonts = { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} };
  document.getElementById = () => null;
  document.querySelector = (selector) => document.documentElement.querySelector(selector);
  document.querySelectorAll = (selector) => document.documentElement.querySelectorAll(selector);
  document.getSelection = () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {} });
  document.elementFromPoint = () => null;
  document.hasFocus = () => true;
  document.execCommand = () => false;
  const window = {
    document,
    localStorage,
    sessionStorage,
    navigator: { userAgent: 'node', language: 'en-US', languages: ['en-US'], maxTouchPoints: 0, platform: 'node' },
    location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '', host: 'localhost', hostname: 'localhost', protocol: 'http:' },
    history: { replaceState() {}, pushState() {}, state: null },
    innerWidth: 1366,
    innerHeight: 900,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    visualViewport: { width: 1366, height: 900, scale: 1, offsetTop: 0, offsetLeft: 0, addEventListener() {}, removeEventListener() {} },
    screen: { width: 1366, height: 900, orientation: { type: 'landscape-primary', addEventListener() {}, removeEventListener() {} } },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    matchMedia: (media) => ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => new Proxy({ getPropertyValue: () => '' }, { get: (target, key) => (key in target ? target[key] : '') }),
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (handle) => clearTimeout(handle),
    requestIdleCallback: (callback) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0),
    cancelIdleCallback: (handle) => clearTimeout(handle),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    scrollTo() {},
    scrollBy() {},
    focus() {},
    getSelection: () => document.getSelection(),
    ResizeObserver: Observer,
    IntersectionObserver: Observer,
    MutationObserver: Observer,
    HTMLElement: Element,
    Element,
    Node,
    HTMLIFrameElement: class HTMLIFrameElement {},
    HTMLInputElement: class HTMLInputElement {},
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    SVGElement: class SVGElement {},
    Event,
    CustomEvent: Event,
    CSS: { escape: (value) => String(value).replace(/["\\]/g, '\\$&'), supports: () => false },
    customElements: { get: () => undefined, define() {}, whenDefined: () => new Promise(() => {}) },
    performance: globalThis.performance,
  };
  Object.assign(window, { window, self: window, top: window, parent: window });
  document.defaultView = window;
  const saved = GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  GLOBALS.forEach((name) => {
    Object.defineProperty(globalThis, name, { value: name in window ? window[name] : undefined, configurable: true, writable: true });
  });
  return function restore() {
    saved.forEach(([name, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  };
}

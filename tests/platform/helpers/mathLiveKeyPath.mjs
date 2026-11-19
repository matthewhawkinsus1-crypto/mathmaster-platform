/*
 * A STAND-IN FOR MATHLIVE'S KEYBOARD PATH, for tests that replay a key into a
 * field (src/platform/math/mathLiveCompat.js pressKeyInMathField).
 *
 * Node has no KeyboardEvent, InputEvent or shadow DOM. This gives a field a
 * keyboard sink inside a "shadow root" that a key passes through on its way to
 * the sink, as the capture phase does in a browser, and a small MathLive on
 * the sink, enough to tell a key PRESSED in the field from a character
 * INSERTED into it, which is what the replay got wrong (tests/browser/
 * stepAlgebraFirstOperand.mjs `blind` and tests/browser/mathBoxFocus.mjs
 * measure the real thing):
 *
 *   - a keydown runs the keystroke handler: "(" opens a pair, "\left(\right)",
 *     with the caret inside it; Backspace deletes; a letter that ends "pi"
 *     after the keys before it is replaced by "\pi" (an inline shortcut); a
 *     key the page already handled is skipped when trusted, as MathLive does;
 *     anything else is left to text entry (not taken, so not prevented);
 *   - an `input` types its `data`;
 *   - `executeCommand(['typedText', c])` inserts the bare character, as
 *     MathLive's command does, and is recorded, so a test can say it was not
 *     used.
 */

class StandInEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
    this.isTrusted = false;
    this.defaultPrevented = false;
    this.propagationStopped = false;
  }

  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }

  stopPropagation() { this.propagationStopped = true; }

  stopImmediatePropagation() { this.propagationStopped = true; }
}

/** KeyboardEvent and InputEvent, where node has none (each test file runs in its own process). */
export const installKeyEvents = () => {
  if (typeof globalThis.KeyboardEvent !== 'function') globalThis.KeyboardEvent = class KeyboardEvent extends StandInEvent {};
  if (typeof globalThis.InputEvent !== 'function') globalThis.InputEvent = class InputEvent extends StandInEvent {};
};

const listenable = (node) => {
  node.listeners = [];
  node.addEventListener = (type, handler, options) => {
    node.listeners.push({ type, handler, capture: options === true || Boolean(options?.capture) });
  };
  node.removeEventListener = (type, handler, options) => {
    const capture = options === true || Boolean(options?.capture);
    const index = node.listeners.findIndex((entry) => entry.type === type && entry.handler === handler && entry.capture === capture);
    if (index >= 0) node.listeners.splice(index, 1);
  };
  return node;
};

/**
 * A field with a sink inside a shadow root (`field.shadowRoot`), and the small
 * MathLive above on that sink. `field.host` listeners, when given, run in the
 * capture phase before the shadow root's, as MathInput's do on the host.
 */
export const fieldWithKeyboardPath = ({ name = 'field', value = '', built = true, connected = true, hostCapture = [] } = {}) => {
  const root = listenable({});
  const sink = listenable({ name: `${name}-sink`, focusCalls: [] });
  root.activeElement = null;
  root.querySelector = (selector) => (built && /keyboard-sink/.test(selector) ? sink : null);
  sink.getRootNode = () => root;
  const field = {
    name,
    isConnected: connected,
    value,
    commands: [],
    keysSeen: [],
    shadowRoot: root,
    executeCommand(command) {
      this.commands.push(command);
      if (Array.isArray(command) && command[0] === 'typedText') this.value += command[1];
      return true;
    },
    sink,
  };
  // Through the host (MathInput's capture listeners), the shadow root, then the sink.
  sink.dispatchEvent = (event) => {
    const path = [{ listeners: hostCapture.map((handler) => ({ type: event.type, handler, capture: true })) }, root, sink];
    for (const node of path) {
      const atTarget = node === sink;
      // A copy: a listener may add or remove listeners as it runs.
      for (const entry of node.listeners.slice()) {
        if (entry.type !== event.type || (!atTarget && !entry.capture)) continue;
        entry.handler(event);
        if (event.propagationStopped) return !event.defaultPrevented;
      }
    }
    return !event.defaultPrevented;
  };
  sink.focus = (options) => {
    sink.focusCalls.push(options);
    root.activeElement = sink;
  };
  // MathLive's keystroke handler, on the sink in the capture phase.
  let typedSince = '';
  sink.addEventListener('keydown', (event) => {
    field.keysSeen.push(event.key);
    if (event.isTrusted && event.defaultPrevented) return;
    if (event.key === '(') {
      event.preventDefault();
      field.value += '\\left(\\right)';
      typedSince = '';
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      field.value = field.value.slice(0, -1);
      typedSince = '';
      return;
    }
    typedSince += event.key;
    if (typedSince.endsWith('pi') && field.value.endsWith('p')) {
      event.preventDefault();
      field.value = `${field.value.slice(0, -1)}\\pi`;
      typedSince = '';
    }
  }, { capture: true });
  // A character the handler left to the browser's text entry.
  sink.addEventListener('input', (event) => { field.value += event.data ?? ''; });
  return field;
};

/** A key as a browser reports it to a listener, with what a handler may do to it. */
export const keyAt = (key, extra = {}) => ({
  key,
  code: extra.code ?? '',
  location: 0,
  isComposing: false,
  isTrusted: true,
  repeat: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; this.defaultPrevented = true; },
  stopPropagation() { this.stopped = true; },
  stopImmediatePropagation() { this.stopped = true; },
  ...extra,
});

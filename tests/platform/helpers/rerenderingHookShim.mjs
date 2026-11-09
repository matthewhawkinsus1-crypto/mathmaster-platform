// A STAND-IN FOR REACT THAT KEEPS ONE COMPONENT'S HOOKS FROM RENDER TO RENDER.
//
// reactHookShim.mjs runs one render. Some costs show only on the renders after
// it: work a component repeats although nothing it reads has changed, or an
// effect that runs again with equal dependencies and hands its host something
// new. This keeps one instance's state, memos, refs and effects in hook order,
// as React does: a state update renders the component again, a memo or an
// effect runs only when a dependency changed (Object.is), and an effect's
// cleanup runs before it runs again. Children are not rendered: JSX makes
// plain { type, props } objects, and a test calls their handlers itself.
// Loaded in place of 'react' by helpers/rerenderingComponent.mjs. Only for
// counting what a component does per update, never for layout.
const noop = () => {};
let instance = null;

const changed = (previous, next) => !previous || !next || previous.length !== next.length
  || next.some((value, index) => !Object.is(value, previous[index]));
const slot = (create) => {
  if (!instance) throw new Error('a hook was called outside a component this shim is rendering');
  const index = instance.cursor;
  instance.cursor += 1;
  if (!(index in instance.slots)) instance.slots[index] = create();
  return instance.slots[index];
};

export const Fragment = Symbol.for('shim.fragment');
export const StrictMode = Fragment;
export const Suspense = Fragment;
export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
export const jsx = (type, props) => ({ type, props });
export const jsxs = jsx;
export const jsxDEV = jsx;

export const useState = (initial) => {
  const owner = instance;
  const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
  state.set ||= (next) => {
    const value = typeof next === 'function' ? next(state.value) : next;
    if (Object.is(value, state.value)) return;
    state.value = value;
    owner.dirty = true;
    if (!owner.rendering) owner.render();
  };
  return [state.value, state.set];
};
export const useReducer = (reducer, initialArg, init) => {
  const [value, setValue] = useState(() => (init ? init(initialArg) : initialArg));
  return [value, (action) => setValue((current) => reducer(current, action))];
};
export const useRef = (current) => slot(() => ({ current }));
export const useMemo = (factory, deps) => {
  const memo = slot(() => ({ computed: false }));
  if (!memo.computed || changed(memo.deps, deps)) {
    memo.value = factory();
    memo.deps = deps;
    memo.computed = true;
  }
  return memo.value;
};
export const useCallback = (callback, deps) => useMemo(() => callback, deps);
export const useEffect = (effect, deps) => {
  const owner = instance;
  const record = slot(() => ({ ran: false }));
  if (record.ran && !changed(record.deps, deps)) return;
  record.ran = true;
  record.deps = deps;
  owner.pending.push(() => {
    record.cleanup?.();
    const cleanup = effect();
    record.cleanup = typeof cleanup === 'function' ? cleanup : null;
  });
};
export const useLayoutEffect = useEffect;
export const useInsertionEffect = useEffect;
export const useId = () => 'shim-id';
export const useImperativeHandle = noop;
export const useDebugValue = noop;
export const useTransition = () => [false, (callback) => callback()];
export const startTransition = (callback) => callback();
export const useDeferredValue = (value) => value;
export const useSyncExternalStore = (subscribe, getSnapshot) => getSnapshot();
export const createContext = (defaultValue) => ({ _currentValue: defaultValue, Provider: Fragment, Consumer: Fragment });
export const useContext = (context) => context?._currentValue;
export const memo = (component) => component;
export const forwardRef = (render) => (props) => render(props, null);
export const lazy = (load) => load;
export const isValidElement = (value) => Boolean(value && typeof value === 'object' && 'type' in value && 'props' in value);
export const cloneElement = (element, props) => ({ ...element, props: { ...element.props, ...props } });
export const Children = { map: (children, fn) => [].concat(children ?? []).map(fn), toArray: (children) => [].concat(children ?? []), count: (children) => [].concat(children ?? []).length, forEach: (children, fn) => [].concat(children ?? []).forEach(fn), only: (child) => child };
export const createPortal = (child) => child;
export const flushSync = (callback) => callback();

/**
 * Render `Component` with `props` and keep it: `output` is what its latest
 * render returned, `renders` how many renders it has had. A state update from
 * a handler or an effect renders it again; effects run after each render.
 */
export const mount = (Component, props) => {
  const owner = { slots: [], cursor: 0, pending: [], dirty: false, rendering: false, renders: 0, output: null, props };
  owner.render = () => {
    owner.rendering = true;
    try {
      do {
        owner.dirty = false;
        owner.cursor = 0;
        owner.pending = [];
        const previous = instance;
        instance = owner;
        try {
          owner.output = Component(owner.props);
        } finally {
          instance = previous;
        }
        owner.renders += 1;
        owner.pending.forEach((run) => run());
      } while (owner.dirty);
    } finally {
      owner.rendering = false;
    }
  };
  owner.render();
  return {
    get output() { return owner.output; },
    get renders() { return owner.renders; },
  };
};

const React = {
  Fragment, StrictMode, Suspense, createElement, useState, useReducer, useEffect, useLayoutEffect, useInsertionEffect, useMemo,
  useCallback, useRef, useId, useImperativeHandle, useDebugValue, useTransition, startTransition, useDeferredValue,
  useSyncExternalStore, createContext, useContext, memo, forwardRef, lazy, isValidElement, cloneElement, Children, createPortal, flushSync,
};
export default React;

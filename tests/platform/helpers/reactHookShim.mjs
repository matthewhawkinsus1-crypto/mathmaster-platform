// A STAND-IN FOR REACT THAT RUNS ONE RENDER OF ONE COMPONENT, SYNCHRONOUSLY.
//
// Node cannot mount a component (no DOM here), and server rendering never runs
// an effect. Some screens publish what they know only from an effect — a
// grader's onStateChange, with the details text a student's Work View shows.
// Loaded in place of 'react' (and its JSX runtimes, and react-dom) by
// tests/platform/helpers/shallowComponent.mjs, this makes calling a component
// function run its hooks once, in order: state starts at its initial value, a
// memo is computed, an effect runs at once. Children are not rendered: JSX
// makes plain { type, props } objects. Only for reading what a component
// computes and publishes — never for asserting layout.
const noop = () => {};
export const Fragment = Symbol.for('shim.fragment');
export const StrictMode = Fragment;
export const Suspense = Fragment;
export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
export const jsx = (type, props) => ({ type, props });
export const jsxs = jsx;
export const jsxDEV = jsx;
export const useState = (initial) => [typeof initial === 'function' ? initial() : initial, noop];
export const useReducer = (reducer, initial, init) => [init ? init(initial) : initial, noop];
export const useEffect = (effect) => { effect(); };
export const useLayoutEffect = useEffect;
export const useInsertionEffect = useEffect;
export const useMemo = (factory) => factory();
export const useCallback = (callback) => callback;
export const useRef = (current) => ({ current });
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
const React = {
  Fragment, StrictMode, Suspense, createElement, useState, useReducer, useEffect, useLayoutEffect, useInsertionEffect, useMemo,
  useCallback, useRef, useId, useImperativeHandle, useDebugValue, useTransition, startTransition, useDeferredValue,
  useSyncExternalStore, createContext, useContext, memo, forwardRef, lazy, isValidElement, cloneElement, Children, createPortal, flushSync,
};
export default React;

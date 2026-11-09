import { useState } from 'react';
import { stableStringify } from '../../utils/idUtils.js';

/*
 * PROPS THAT CHANGE ONLY WHEN WHAT THEY MEAN CHANGES.
 *
 * App draws the question through a memoised QuestionEngine, which is drawn
 * again only when a prop changes. App renders seven to thirteen times on a
 * Submit or a Next, and every 30 seconds for its clock; a prop rebuilt on each
 * of those renders drew the whole question again, about 45 components each
 * time. Both helpers are made once per App and may be called anywhere in its
 * render, conditionally and inside its render functions (they are not hooks).
 *
 * stableCallbacks({ onGrade: handler, … })
 *   The same names, each one function for the life of the host. Each render
 *   writes its handlers into a map made once for the host (a ref, set during
 *   render); each function has no dependencies and reads the map when it is
 *   called, so a call always reaches the latest handler and nothing can run a
 *   stale closure. A handler that is null or absent gives null, never a
 *   function that does nothing: a question decides from it whether to offer
 *   the action at all. A handler whose identity means something to the child
 *   (an effect follows it) is handed as itself instead.
 *
 * renderMemo(name, inputs, compute, same)
 *   compute() again only when one of `inputs` is not Object.is the one before;
 *   otherwise the value from last time. With `same(previous, next)`, a value
 *   computed again that means the same keeps the previous identity. `inputs`
 *   null: computed on every call, for a value read from outside React (the
 *   device's storage), and kept while it means the same.
 *
 * sameStableValue(a, b): the same content, as QuestionEngine's own
 * deep-stable props compare it (stableStringify).
 */
export const createStableCallbacks = () => {
  const latest = new Map();
  const callers = new Map();
  const caller = (name) => {
    if (!callers.has(name)) callers.set(name, (...args) => latest.get(name)?.(...args));
    return callers.get(name);
  };
  return (handlers) => Object.fromEntries(Object.entries(handlers).map(([name, handler]) => {
    latest.set(name, typeof handler === 'function' ? handler : null);
    return [name, latest.get(name) && caller(name)];
  }));
};

export const createRenderMemo = () => {
  const slots = new Map();
  return (name, inputs, compute, same) => {
    const slot = slots.get(name);
    if (slot?.inputs && inputs?.length === slot.inputs.length && inputs.every((input, index) => Object.is(input, slot.inputs[index]))) return slot.value;
    const value = compute();
    slots.set(name, { inputs, value: slot && same?.(slot.value, value) ? slot.value : value });
    return slots.get(name).value;
  };
};

export const sameStableValue = (a, b) => a === b || stableStringify(a) === stableStringify(b);

// Made on the host's first render and kept for its life.
export const useRenderStability = () => useState(() => [createStableCallbacks(), createRenderMemo()])[0];

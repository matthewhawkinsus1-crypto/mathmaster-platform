import { useState } from 'react';
import { stableStringify } from '../../utils/idUtils.js';

/*
 * PROPS THAT CHANGE ONLY WHEN WHAT THEY MEAN CHANGES.
 *
 * App draws the question through a memoised QuestionEngine, which is drawn
 * again only when a prop changes. App renders seven to thirteen times on a
 * Submit or a Next, and every 30 seconds for its clock; a prop rebuilt on each
 * of those renders drew the whole question again, about 45 components each
 * time. These helpers are made once per App and may be called anywhere in its
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
 * renderFold(name, base, step)
 *   A value that follows what the host's renders show, as a state does that
 *   an effect sets after each render from what that render worked out, but
 *   without the render such an effect costs (the save line's subject took one
 *   after every change of the status: App.jsx). Each call starts from the
 *   value the last call worked out, or from `base` when `base` is not the one
 *   that call started from (the host's own state moved it: a reset, an event
 *   a handler folded in), and applies `step` until it hands back its argument
 *   (as the effect's renders did, one step each), at most FOLD_STEPS times.
 *   renderFold.from(name, current): what a state update made from `current`
 *   starts from, the value the last call worked out while `current` is still
 *   the base it started from.
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

export const FOLD_STEPS = 8;

export const createRenderFold = () => {
  const slots = new Map();
  const fold = (name, base, step) => {
    const slot = slots.get(name);
    let value = slot && Object.is(slot.base, base) ? slot.value : base;
    for (let steps = 0; steps < FOLD_STEPS; steps += 1) {
      const next = step(value);
      if (Object.is(next, value)) break;
      value = next;
    }
    slots.set(name, { base, value });
    return value;
  };
  fold.from = (name, current) => {
    const slot = slots.get(name);
    return slot && Object.is(slot.base, current) ? slot.value : current;
  };
  return fold;
};

export const sameStableValue = (a, b) => a === b || stableStringify(a) === stableStringify(b);

// Made on the host's first render and kept for its life.
export const useRenderStability = () => useState(() => [createStableCallbacks(), createRenderMemo(), createRenderFold()])[0];

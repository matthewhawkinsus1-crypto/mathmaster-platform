import { useState } from 'react';
import { placeCurveLabels } from './curveLabels.js';

/*
 * A PLANE'S CURVE NAMES, PLACED AGAIN ONLY WHEN WHAT THEY ARE PLACED AMONG
 * CHANGES.
 *
 * Placing the names (curveLabels.js) measures a hundred places against every
 * curve, point and word on the plane, and a plane renders far more often than
 * any of those change: the graph workspace on every pointer move over its
 * board (the readout follows the pointer), a system question's figure on
 * every key typed in its answer box, the Systems Workspace's plane as a
 * pointer aims. Each of those renders placed the names again: in the graph
 * workspace building an inverse about 10 ms a move, 40 at a Chromebook's
 * speed, half the work of each move.
 *
 * createCurveLabelPlacer() makes a plane its placer: given the placement's
 * inputs (placeCurveLabels's), it hands back the places it gave last time
 * while those inputs say the same, and places the names again only when one
 * of them changes: a point placed or dragged, a curve drawn, the window
 * zoomed, Work View's opener moved, the plane drawn at another size. `place`
 * is the placement itself, for a test to count.
 */

// The same inputs, by what they hold: each render builds its lists and records
// anew. Plain data only (numbers, words, lists, records), so not borrowed from
// performance/renderStability.js's sameData, which App loads first: shared with
// the planes' chunks it left App's for one of its own, 213 bytes more on a
// student's first load.
const sameInputs = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => sameInputs(item, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameInputs(a[key], b[key]));
};

export const createCurveLabelPlacer = (place = placeCurveLabels) => {
  let last = null;
  return (inputs) => {
    if (last && sameInputs(last.inputs, inputs)) return last.spots;
    last = { inputs, spots: place(inputs) };
    return last.spots;
  };
};

/** The placer of the plane that calls it: made on its first render and kept for its life. */
export const useCurveLabelPlacer = () => useState(() => createCurveLabelPlacer())[0];

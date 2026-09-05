// What KIND of thinking a step asks for — and the colour that says so.
//
// A composed question walks a student through several different mathematical
// acts, and until now every one of them looked the same: identical blue pills,
// identical white panel, whether they were plotting a curve, choosing between
// named categories, or writing a coordinate. Eleven steps of that reads as a
// long grey form.
//
// So colour is used as INFORMATION here, not decoration. Four families, because
// four is what the primitives actually fall into:
//
//   build   you make something          plot, graph, table, mapping, axes
//   locate  you find something          mark a feature on a graph
//   decide  you choose between named things
//   state   you say what is true        equations, coordinates, domain, range
//
// A student meets the same colour every time the same kind of thinking is
// wanted, which is worth more than a palette: by the third question the amber
// step reads as "this one is a decision" before they have read a word of it.
//
// COLOUR IS NEVER THE ONLY SIGNAL. Every pill still carries its number, its
// label and a tick when answered, so nothing here is load-bearing for a student
// who cannot separate violet from blue. It is a second channel, not the channel.
//
// Pure: no React, no DOM. The renderer asks for a family name and puts it in a
// data attribute; the stylesheet does the rest.

export const STAGE_FAMILIES = Object.freeze({
  build: Object.freeze({ id: 'build', label: 'Build it' }),
  locate: Object.freeze({ id: 'locate', label: 'Find it' }),
  decide: Object.freeze({ id: 'decide', label: 'Decide' }),
  state: Object.freeze({ id: 'state', label: 'State it' }),
});

export const STAGE_FAMILY_IDS = Object.freeze(Object.keys(STAGE_FAMILIES));

const FAMILY_OF_KIND = Object.freeze({
  // You make something that was not there before.
  axisSetup: 'build',
  tableInput: 'build',
  coordinatePlot: 'build',
  functionGraph: 'build',
  mappingDiagram: 'build',
  numberLine: 'build',

  // Something already exists and you have to find a named part of it.
  graphFeatureSelect: 'locate',

  // You pick between things somebody else named.
  quantityRoles: 'decide',
  classification: 'decide',
  multipleChoice: 'decide',

  // You say what is true, in mathematical notation or in words.
  equationInput: 'state',
  pointInput: 'state',
  domainInput: 'state',
  rangeInput: 'state',
  intervalInput: 'state',
  interpretation: 'state',
  shortResponse: 'state',
  algebraWorkspace: 'state',
});

/**
 * The family a stage kind belongs to.
 *
 * Falls back to `build` rather than throwing: an unknown kind is already caught
 * at Preflight, and a question that reached a student should not lose its
 * styling on top of whatever else is wrong with it.
 */
export const stageFamily = (kind) => FAMILY_OF_KIND[String(kind || '')] || 'build';

export const stageFamilyLabel = (kind) => STAGE_FAMILIES[stageFamily(kind)].label;

/** Every kind this module knows about, for the test that keeps it exhaustive. */
export const COLOURED_STAGE_KINDS = Object.freeze(Object.keys(FAMILY_OF_KIND));

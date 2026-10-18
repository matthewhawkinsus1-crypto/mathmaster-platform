import React, { createContext, useContext, useEffect, useMemo } from 'react';

export const WORK_VIEW_CAPABILITIES = Object.freeze([
  'undo', 'redo', 'fitView', 'panZoom', 'pointEditing', 'numericControls',
  'equationInput', 'tableData', 'instruction', 'task', 'help',
  'primaryActions', 'secondaryActions',
  // The student's Support tools (language tools), as a header drawer.
  'supports',
  // The Help drawer's other two parts (student pass 3, TOOL-3): the tool's
  // description and "How to do this" steps, which Work View hides with the
  // TaskCard, and a tool's own help kept below the platform's.
  'directions', 'toolHelp',
  // The question's "Information you need" card (student pass 3, TOOL-12),
  // which Work View hides with the task card around it.
  'reference',
]);

const WorkViewCapabilityContext = createContext(Object.freeze({}));

const actionList = (value) => {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean).map((action) => (
    typeof action === 'function' ? { label:'Action', onAction:action } : action
  ));
};

export function normalizeWorkViewCapabilities(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {};
  WORK_VIEW_CAPABILITIES.forEach((key) => {
    if (source[key] == null || source[key] === false) return;
    if (key === 'primaryActions' || key === 'secondaryActions') normalized[key] = actionList(source[key]);
    else normalized[key] = source[key] === true ? { available:true } : source[key];
  });
  return normalized;
}

// Two stages of one composed question each publish their TaskCard's
// directions (both are mounted below four stages): the drawer shows both, in
// publisher order, rather than whichever merged last.
const mergedDirections = (base, local) => {
  if (!base || !local) return local || base;
  return { content: React.createElement(React.Fragment, null, base.content || base.text, local.content || local.text) };
};

export function mergeWorkViewCapabilities(platform, tool) {
  const base = normalizeWorkViewCapabilities(platform);
  const local = normalizeWorkViewCapabilities(tool);
  // An authoritative platform Help that says the activity withholds the method
  // (a DOL, quiz or test: QuestionEngine sets `withholdsMethod`) keeps a
  // tool's own Help out of the drawer — Step Algebra's "Use inverse operations
  // in reverse order" is the method. Fail closed: only Help the tool marks
  // `controlsOnly` stays (student pass 3, R-10).
  const withholdsMethod = Boolean(base.help?.authoritative && base.help?.withholdsMethod);
  const shownToolHelp = (help) => (help && (!withholdsMethod || help.controlsOnly) ? help : undefined);
  return {
    ...base,
    ...local,
    // QuestionEngine marks the authored question task as authoritative because
    // nested tools often publish a shorter operational summary. Outside that
    // question shell, normal composition still applies and the more local task
    // may override a parent/descendant fallback.
    task: base.task?.authoritative ? base.task : (local.task || base.task),
    // THE PLATFORM'S HELP IS NEVER REPLACED (student pass 3, TOOL-3). It holds
    // the hint ladder and "Ask my teacher" — or, on a DOL, the Ask-only panel.
    // A tool's Help used to win here, so a registry tool's generic sentence
    // took Ask away. Under an authoritative platform Help the tool's own goes
    // to `toolHelp`, which the drawer shows after it.
    help: base.help?.authoritative ? base.help : (local.help || base.help),
    // The question's reference is the platform's: a tool never replaces it.
    reference: base.reference || local.reference,
    toolHelp: shownToolHelp(base.help?.authoritative ? (local.help || local.toolHelp || base.toolHelp) : (local.toolHelp || base.toolHelp)),
    directions: mergedDirections(base.directions, local.directions),
    primaryActions: [...(base.primaryActions || []), ...(local.primaryActions || [])],
    secondaryActions: [...(base.secondaryActions || []), ...(local.secondaryActions || [])],
  };
}

export function WorkViewCapabilityProvider({ capabilities, children }) {
  const parent = useContext(WorkViewCapabilityContext);
  const value = useMemo(() => mergeWorkViewCapabilities(parent, capabilities), [parent, capabilities]);
  return React.createElement(WorkViewCapabilityContext.Provider, { value }, children);
}

/*
 * CAPABILITIES ALSO TRAVEL UPWARDS, AND THEY HAVE TO.
 *
 * Fit View, pan/zoom and point editing belong to `CoordinatePlane` — it owns
 * the camera and converts every click. But a tool whose plane is interactive
 * wraps its WHOLE split in the Work View shell, so the plane no longer renders a
 * shell of its own to register with, and the one component that can actually
 * reset the camera has nothing to hand its reset function to.
 *
 * The alternative was making each tool re-declare the plane's controls, which
 * means a tool holding a stale copy of the plane's camera rules and a Fit button
 * wired to a function the plane no longer uses. So the shell opens a port
 * instead: a descendant publishes what it can do, the nearest enclosing shell
 * merges it, and the plane keeps being the only thing that knows how to fit.
 */
const WorkViewCapabilityPortContext = createContext(null);

export function WorkViewCapabilityPortProvider({ publish, children }) {
  return React.createElement(WorkViewCapabilityPortContext.Provider, { value: publish || null }, children);
}

export const useHasParentWorkView = () => Boolean(useContext(WorkViewCapabilityPortContext));

/**
 * Publish this component's capabilities to the nearest enclosing Work View.
 *
 * `capabilities` of null withdraws them, which is also what unmounting does —
 * a plane that stops being rendered must not leave a Fit View button behind
 * pointing at a camera that no longer exists.
 */
export function usePublishWorkViewCapabilities(id, capabilities) {
  const publish = useContext(WorkViewCapabilityPortContext);
  useEffect(() => {
    if (!publish || !id) return undefined;
    publish(id, capabilities || null);
    return () => publish(id, null);
  }, [publish, id, capabilities]);
}

export function useWorkViewCapabilities(localCapabilities = null, publishedCapabilities = null) {
  const platform = useContext(WorkViewCapabilityContext);
  return useMemo(
    // Published descriptors sit between the platform's and the tool's own: a
    // plane knows more about its camera than the platform does, and the tool
    // that declared a capability by hand meant that one.
    () => mergeWorkViewCapabilities(
      mergeWorkViewCapabilities(platform, publishedCapabilities),
      localCapabilities,
    ),
    [platform, publishedCapabilities, localCapabilities],
  );
}

/**
 * Fold every descendant's published capabilities into one descriptor set.
 *
 * Ordered by the key rather than by arrival so two planes inside one shell
 * produce the same merged result on every render, whatever order their effects
 * happened to run in.
 */
export function combinePublishedCapabilities(published) {
  const source = published && typeof published === 'object' ? published : {};
  return Object.keys(source).sort().reduce(
    (merged, key) => mergeWorkViewCapabilities(merged, source[key]),
    {},
  );
}

export function workViewCapabilitySummary(capabilities) {
  const normalized = normalizeWorkViewCapabilities(capabilities);
  return WORK_VIEW_CAPABILITIES.filter((key) => {
    const value = normalized[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

export function toggleWorkViewDrawer(current, requested) {
  return current === requested ? null : requested;
}

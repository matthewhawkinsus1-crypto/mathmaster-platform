import React, { createContext, useContext, useEffect, useMemo } from 'react';

export const WORK_VIEW_CAPABILITIES = Object.freeze([
  'undo', 'redo', 'fitView', 'panZoom', 'pointEditing', 'numericControls',
  'equationInput', 'tableData', 'instruction', 'task', 'help',
  'primaryActions', 'secondaryActions',
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

export function mergeWorkViewCapabilities(platform, tool) {
  const base = normalizeWorkViewCapabilities(platform);
  const local = normalizeWorkViewCapabilities(tool);
  return {
    ...base,
    ...local,
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

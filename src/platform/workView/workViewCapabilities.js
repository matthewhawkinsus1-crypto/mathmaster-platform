import React, { createContext, useContext, useMemo } from 'react';

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

export function useWorkViewCapabilities(localCapabilities = null) {
  const platform = useContext(WorkViewCapabilityContext);
  return useMemo(
    () => mergeWorkViewCapabilities(platform, localCapabilities),
    [platform, localCapabilities],
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

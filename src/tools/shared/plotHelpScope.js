import { createContext, createElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

/*
 * HOW TO PLOT, ONCE PER TOOL.
 *
 * Every interactive CoordinatePlane printed the same directions under itself.
 * One plane, that is useful. Three planes in one tool — three graphs of the
 * same line — is the same paragraph three times between the graphs (PR #397
 * QA), and the board had to opt out by hand. The shell now opens a scope and
 * the FIRST interactive plane in it shows the directions; the rest show none.
 *
 * Nothing is taken from a screen reader: every interactive plane still
 * announces its own keyboard instructions in its accessible name, and its
 * cursor position in its live region. What is deduplicated is visible text.
 */
const PlotHelpScopeContext = createContext(null);

export function PlotHelpScope({ children }) {
  const claimsRef = useRef([]);
  const [owner, setOwner] = useState(null);
  const claim = useCallback((id) => {
    if (!claimsRef.current.includes(id)) claimsRef.current = [...claimsRef.current, id];
    setOwner(claimsRef.current[0] ?? null);
    return () => {
      claimsRef.current = claimsRef.current.filter((entry) => entry !== id);
      setOwner(claimsRef.current[0] ?? null);
    };
  }, []);
  const value = useMemo(() => ({ owner, claim }), [owner, claim]);
  return createElement(PlotHelpScopeContext.Provider, { value }, children);
}

/** Should THIS plane show the plotting directions? Always, outside a scope. */
export const usePlotHelpSlot = (wantsHelp) => {
  const scope = useContext(PlotHelpScopeContext);
  const id = useId();
  const claim = scope?.claim;
  useEffect(() => {
    if (!claim || !wantsHelp) return undefined;
    return claim(id);
  }, [claim, wantsHelp, id]);
  if (!wantsHelp) return false;
  if (!scope) return true;
  return scope.owner === id;
};

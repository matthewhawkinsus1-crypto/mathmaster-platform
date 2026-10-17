import { lazy, Suspense } from 'react';

/*
 * A REVEALED LINE, LOADED ONLY WHEN THERE IS ONE.
 *
 * Every room's solution card, console and projector can show a Graph the Line
 * round's line (LineRevealGraph), but only a Classic line game ever has one —
 * so its grid and equation drawing load on first use, not with every Live
 * Challenge screen. The fallback holds the graph's height, so nothing jumps
 * when it arrives.
 */
const LineRevealGraph = lazy(() => import('./LineRevealGraph.jsx'));

export default function RevealedLine({ size = 240, ...props }) {
  return (
    <Suspense fallback={<div aria-hidden="true" style={{ minHeight: size }} />}>
      <LineRevealGraph size={size} {...props} />
    </Suspense>
  );
}

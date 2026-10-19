import { useEffect, useState } from 'react';
import { EXAM_TOOL_NARROW_QUERY, examToolRoom } from '../../platform/assessment/examToolLayout.js';

/*
 * TWO THINGS EVERY EXAM TOOL DRAWER NEEDS TO KNOW ABOUT THE SCREEN.
 *
 * The reference sheet and the graphing calculator render their panels in a
 * portal on the body, so no toolbar's stacking context can hold them under
 * Work View. A portal also leaves behind every CSS variable the exam set on
 * an ancestor of the toolbar — including --mm-exam-toolbar-offset, the
 * toolbar's height, below which a drawer opens and above which a phone sheet
 * never rises. So each drawer reads that variable where its launcher sits and
 * hands it to its panel.
 */

const readOffset = (anchor) => {
  try {
    const value = anchor ? window.getComputedStyle(anchor).getPropertyValue('--mm-exam-toolbar-offset').trim() : '';
    return value || '0px';
  } catch {
    return '0px';
  }
};

/**
 * The exam toolbar's height as the launcher inherits it: read when the panel
 * opens, and again whenever the window changes size while it is open (the
 * toolbar wraps onto more lines on a narrower screen).
 */
export const useExamToolbarOffset = (anchorRef, open) => {
  const [offset, setOffset] = useState('0px');
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const update = () => setOffset(readOffset(anchorRef.current));
    update();
    window.addEventListener('resize', update);
    // The exam may measure its toolbar a moment after the panel opens.
    const frame = window.requestAnimationFrame?.(update);
    return () => {
      window.removeEventListener('resize', update);
      if (frame) window.cancelAnimationFrame?.(frame);
    };
  }, [anchorRef, open]);
  return offset;
};

/** A phone-width screen, where a drawer becomes a bottom sheet. */
export const useNarrowScreen = () => {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(EXAM_TOOL_NARROW_QUERY).matches : false));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(EXAM_TOOL_NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return narrow;
};

/**
 * FOR THE EXAM CONTAINER: the padding that keeps the question clear of the
 * open tools. Put the ref on the element that holds the question column and
 * spread the result into its style; pass each tool's open state from its
 * onOpenChange. Re-measured when the window changes size.
 *
 *   const room = useExamToolRoom(columnRef, { referenceSheetOpen, graphingCalculatorOpen });
 *   <div ref={columnRef} style={{ paddingLeft: room.paddingLeft, paddingRight: room.paddingRight }}>…</div>
 */
export const useExamToolRoom = (columnRef, { referenceSheetOpen = false, graphingCalculatorOpen = false } = {}) => {
  const [edges, setEdges] = useState(null);
  const anyOpen = referenceSheetOpen || graphingCalculatorOpen;
  useEffect(() => {
    if (!anyOpen || typeof window === 'undefined') return undefined;
    // The element's border box does not move with its own padding, so
    // measuring it while padded is stable.
    const measure = () => {
      const rect = columnRef.current?.getBoundingClientRect?.();
      const layoutWidth = document.documentElement?.clientWidth || window.innerWidth;
      setEdges({ viewportWidth: window.innerWidth, layoutWidth, left: rect ? rect.left : 0, right: rect ? rect.right : layoutWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [columnRef, anyOpen]);
  if (!anyOpen || !edges) return { paddingLeft: 0, paddingRight: 0 };
  return examToolRoom({ ...edges, referenceSheetOpen, graphingCalculatorOpen });
};

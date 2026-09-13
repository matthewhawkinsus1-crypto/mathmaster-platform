import { useEffect, useRef } from 'react';
import { recordPerformanceSample } from './performanceTelemetry.js';

// Development/admin diagnostics only: count lifecycle events without serializing
// props, question content, answers, or component state.
export const useRenderPerformance = (source, identity = '') => {
  const renders = useRef(0);
  renders.current += 1;

  useEffect(() => {
    recordPerformanceSample('react_render_count', renders.current, { source, toolId: identity });
  });

  useEffect(() => {
    recordPerformanceSample('react_mount_count', 1, { source, toolId: identity });
    return () => recordPerformanceSample('react_unmount_count', 1, { source, toolId: identity });
  }, [source, identity]);
};

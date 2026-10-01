import { useEffect, useRef } from 'react';
import { useToolRuntimeContext } from './ToolRuntimeContext';
import { stableStringify } from '../../utils/idUtils';

/*
 * REPORT THIS TOOL'S LIVE RAW WORK TO THE PLATFORM.
 *
 * A registry tool holds its student's work in its own state, so before this
 * hook nothing outside the tool could see an unsubmitted answer — which meant
 * a deadline could never finalize a tool question the way it finalizes an
 * ordinary one. A tool calls this with the SAME work object its Check handler
 * submits; QuestionEngine turns it into a checkpointable response.
 *
 * Reported only when the work actually changes (by canonical value, not by
 * object identity), so a re-render does not queue a write.
 */
export default function useReportToolWork(work, { enabled = true } = {}) {
  const { reportWork } = useToolRuntimeContext();
  const latest = useRef(work);
  latest.current = work;
  let signature = '';
  try {
    signature = enabled ? stableStringify(work ?? null) : '';
  } catch {
    signature = '';
  }
  useEffect(() => {
    if (!enabled || !signature || typeof reportWork !== 'function') return;
    reportWork(latest.current);
  }, [signature, reportWork, enabled]);
}

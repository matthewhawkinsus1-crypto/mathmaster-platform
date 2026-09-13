import { startPerformanceSpan } from './performanceTelemetry.js';

const prefetched = new Set();

export const prefetchQuestionResources = (questions, currentIndex, { secure = false } = {}) => {
  if (secure || !Array.isArray(questions)) return [];
  const scheduled = [];
  for (const question of questions.slice(currentIndex + 1, currentIndex + 3)) {
    const toolId = String(question?.toolId || question?.type || '');
    if (!toolId || prefetched.has(toolId)) continue;
    prefetched.add(toolId);
    scheduled.push(toolId);
    const span = startPerformanceSpan('tool_prefetch_ms', { toolId });
    import('../../tools/toolRegistry.js')
      .then(({ prefetchTool }) => prefetchTool(toolId))
      .then(() => span.finish({ status: 'ready' }))
      .catch(() => span.finish({ status: 'failed' }));
  }
  return scheduled;
};

export const resetQuestionPrefetchForTests = () => prefetched.clear();

import { buildCoverageIndex } from '../../../functions/shared/pathCoverage.mjs';

export const buildSimulatorCoverageIndex = (records = [], { courseId = 'simulator' } = {}) => {
  const bankItems = (Array.isArray(records) ? records : [])
    .filter((record) => record?.active !== false && record?.id);

  const plans = Object.fromEntries(
    bankItems.map((record) => [record.id, { issuable: true }]),
  );

  return buildCoverageIndex({
    courseId,
    wheelTeks: [],
    bankItems,
    plans,
    generatedAt: Date.now(),
  });
};

export default buildSimulatorCoverageIndex;

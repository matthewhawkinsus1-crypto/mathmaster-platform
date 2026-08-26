import test from 'node:test';
import assert from 'node:assert/strict';

import { publishedTransferFrameworkFor } from '../../src/platform/path/recommendationV2.js';

const coverage = {
  schemaVersion: 2,
  frameworks: {
    digitalSAT: {
      skills: {
        'A.12C': { published: false },
        'A.12B': { published: true },
      },
      offWheel: {},
    },
  },
};

test('weekly assessment-transfer context is used only where that assessment is actually published', () => {
  assert.equal(publishedTransferFrameworkFor({
    coverage, teksCode: 'A.12C', framework: 'digitalSAT',
  }), null);
  assert.equal(publishedTransferFrameworkFor({
    coverage, teksCode: 'A.12B', framework: 'digitalSAT',
  }), 'digitalSAT');
});

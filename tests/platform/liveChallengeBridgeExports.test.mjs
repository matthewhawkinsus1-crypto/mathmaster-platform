// THE BRIDGE STANDS IN FOR THE WHOLE SERVICE.
//
// tests/browser/emulator/vite.bridge.config.mjs swaps the Live Challenge client
// service for liveChallengeBridgeService.js, which every whole-game browser
// journey runs on (the shell, Graph Feature Rush, Option B). A name the service
// exports and the bridge does not is a link error in the browser: the teacher
// console's chunk never loads, and every journey fails waiting for "Create a
// challenge" (readClassGameMemory, #531). This says so in the platform suite,
// by name, before a browser is started.
//
// liveChallengeServiceStub.js is not held to this: it stands in only for the
// student screens, and its harness never loads the teacher console.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const exportedNames = (relative) => {
  const source = readFileSync(path.join(repo, relative), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    match[1].split(',').map((entry) => entry.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((name) => names.add(name));
  }
  return names;
};

test('the bridge exports every name the Live Challenge service exports', () => {
  const service = exportedNames('src/platform/liveChallenge/liveChallengeService.js');
  const bridge = exportedNames('tests/browser/emulator/liveChallengeBridgeService.js');
  assert.ok(service.size > 30, `read ${service.size} service exports; the pattern no longer matches the file`);
  const missing = [...service].filter((name) => !bridge.has(name));
  assert.deepEqual(missing, [], `liveChallengeBridgeService.js is missing: ${missing.join(', ')}`);
});

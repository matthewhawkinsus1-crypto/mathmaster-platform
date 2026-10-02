/*
 * A browser gate's dev server, by hand — the same warm server its runner uses.
 *
 *   npm run gates:serve -- draft-persistence --port 5203
 *   AUDIT_ORIGIN=http://127.0.0.1:5203 node tests/browser/draftPersistence.mjs
 *
 * See scripts/lib/gateServer.mjs for what "warm" means and which gates exist.
 */
import { GATES, startGateServer } from './lib/gateServer.mjs';

const [name, ...flags] = process.argv.slice(2);
const option = (flag, fallback) => {
  const index = flags.indexOf(flag);
  return index === -1 ? fallback : flags[index + 1];
};

const gate = GATES[name];
if (!gate) {
  console.error(`usage: npm run gates:serve -- <${Object.keys(GATES).join('|')}> [--port 5300] [--host 127.0.0.1]`);
  process.exit(2);
}

try {
  const served = await startGateServer(gate, { port: Number(option('--port', 5300)), host: option('--host', '127.0.0.1') });
  console.log(served.summary);
  gate.harness.forEach((page) => console.log(`  ${served.origin}/${page}`));
  console.log('  Ctrl-C to stop.');
  process.on('SIGINT', () => { served.close().finally(() => process.exit(130)); });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

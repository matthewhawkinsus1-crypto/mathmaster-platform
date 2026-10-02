/*
 * Run the Chromebook durable-outbox certification end to end.
 *
 * Starts the harness dev server WARM (scripts/lib/gateServer.mjs), runs the
 * real-IndexedDB checks in Chromium, and shuts the server down again — so the
 * certification is one command rather than two terminals and a remembered
 * port.
 *
 * It needs Playwright and a Chromium build. When neither is available the run
 * SKIPS with a message and a zero exit code, because a persistence claim that
 * silently depended on a browser nobody had is exactly how September 14
 * happened. A skip has to look like a skip.
 */
import { spawn } from 'node:child_process';
import { GATES, startGateServer } from './lib/gateServer.mjs';

const PORT = Number(process.env.DURABLE_OUTBOX_PORT || 5199);

try {
  await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
} catch {
  console.log(
    'SKIPPED: the durable-outbox certification needs Playwright and Chromium.\n'
    + '  Install with `npm i -D playwright && npx playwright install chromium`, then re-run.\n'
    + '  This suite is the only coverage of real IndexedDB — a green unit suite does not replace it.',
  );
  process.exit(0);
}

let gate;
try {
  gate = await startGateServer(GATES['durable-outbox'], { port: PORT });
} catch (error) {
  console.error(`The harness dev server never became ready.\n${error.message}`);
  process.exit(1);
}
console.log(gate.summary);

const run = spawn(process.execPath, ['tests/browser/durableOutboxRecovery.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, AUDIT_ORIGIN: gate.origin },
});
process.on('exit', () => { if (run.exitCode === null) run.kill('SIGTERM'); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => run.kill(signal));

run.on('exit', async (code, signal) => {
  const late = gate.lateRebundles();
  if (late.length) {
    console.error(
      `\n[gate:durable-outbox] Vite re-bundled dependencies DURING the run, which reloads the page under a check:\n  ${late.join('\n  ')}\n`
      + '  Add the named package(s) to this gate\'s `include` in scripts/lib/gateServer.mjs.',
    );
  }
  if (code !== 0) console.error(`\n[gate:durable-outbox] server log (last lines):\n${gate.logTail(25)}`);
  await gate.close().catch(() => {});
  process.exit(code ?? (signal === 'SIGINT' ? 130 : 1));
});

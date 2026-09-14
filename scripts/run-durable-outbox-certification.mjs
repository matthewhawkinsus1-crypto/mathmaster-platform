/*
 * Run the Chromebook durable-outbox certification end to end.
 *
 * Starts the harness dev server, waits for it, runs the real-IndexedDB checks
 * in Chromium, and shuts the server down again — so the certification is one
 * command rather than two terminals and a remembered port.
 *
 * It needs Playwright and a Chromium build. When neither is available the run
 * SKIPS with a message and a zero exit code, because a persistence claim that
 * silently depended on a browser nobody had is exactly how September 14
 * happened. A skip has to look like a skip.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.DURABLE_OUTBOX_PORT || 5199);
const ORIGIN = `http://127.0.0.1:${PORT}`;

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

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--config', 'tests/browser/emulator/vite.config.mjs', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

const stop = () => { if (!server.killed) server.kill('SIGTERM'); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
};

if (!(await ready())) {
  console.error(`The harness dev server never came up on ${ORIGIN}.\n${serverLog}`);
  stop();
  process.exit(1);
}

const run = spawn(process.execPath, ['tests/browser/durableOutboxRecovery.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, AUDIT_ORIGIN: ORIGIN },
});
run.on('exit', (code) => { stop(); process.exit(code ?? 1); });

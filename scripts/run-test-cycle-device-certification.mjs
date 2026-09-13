/*
 * Run the Test Cycle device certification end to end.
 *
 * Starts the stubbed harness dev server, waits for it, runs the Chromebook and
 * 390px phone checks, and shuts the server down again — so the certification is
 * one command in CI and one command for a person, instead of two terminals and
 * a remembered port.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.TEST_CYCLE_DEVICE_PORT || 5202);
const ORIGIN = `http://localhost:${PORT}`;

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

const run = spawn(process.execPath, ['tests/browser/testCycleDevice.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, AUDIT_ORIGIN: ORIGIN },
});
run.on('exit', (code) => { stop(); process.exit(code ?? 1); });

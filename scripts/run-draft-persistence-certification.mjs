/*
 * Run the unfinished-work certification end to end.
 *
 * Starts the harness dev server WARM (scripts/lib/gateServer.mjs: the harness
 * page and everything it imports compiled before a browser opens), drives a
 * real Chromium through navigate / reload / close-and-reopen for every
 * certified family, and shuts the server down again.
 *
 * It needs Playwright and a Chromium build. When neither is available the run
 * SKIPS with a message and a zero exit code — a persistence claim that silently
 * depended on a browser nobody had is exactly the failure mode this suite
 * exists to prevent, so a skip has to look like a skip.
 */
import { spawn } from 'node:child_process';
import { GATES, startGateServer } from './lib/gateServer.mjs';

const PORT = Number(process.env.DRAFT_PERSISTENCE_PORT || 5203);

try {
  await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
} catch {
  try {
    await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    process.env.PLAYWRIGHT_MODULE = '/opt/node22/lib/node_modules/playwright/index.mjs';
  } catch {
    console.log(
      'SKIPPED: the draft-persistence certification needs Playwright and Chromium.\n'
      + '  Install with `npm i -D playwright && npx playwright install chromium`, then re-run.\n'
      + '  This suite is the only coverage of real navigation, reload and reopen — a green\n'
      + '  unit suite does not replace it.',
    );
    process.exit(0);
  }
}

let gate;
try {
  gate = await startGateServer(GATES['draft-persistence'], { port: PORT });
} catch (error) {
  console.error(`The harness dev server never became ready.\n${error.message}`);
  process.exit(1);
}
console.log(gate.summary);

const args = ['tests/browser/draftPersistence.mjs', ...process.argv.slice(2)];
const run = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env, AUDIT_ORIGIN: gate.origin },
});
process.on('exit', () => { if (run.exitCode === null) run.kill('SIGTERM'); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => run.kill(signal));

run.on('exit', async (code, signal) => {
  const late = gate.lateRebundles();
  if (late.length) {
    console.error(
      `\n[gate:draft-persistence] Vite re-bundled dependencies DURING the run, which reloads the page under a scene:\n  ${late.join('\n  ')}\n`
      + '  Add the named package(s) to this gate\'s `include` in scripts/lib/gateServer.mjs.',
    );
  }
  if (code !== 0) console.error(`\n[gate:draft-persistence] server log (last lines):\n${gate.logTail(25)}`);
  await gate.close().catch(() => {});
  process.exit(code ?? (signal === 'SIGINT' ? 130 : 1));
});

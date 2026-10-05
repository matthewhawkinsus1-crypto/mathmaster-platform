// LIVE CHALLENGE STANDINGS FAN-OUT ON REAL FIRESTORE: AN OPERATOR PROBE.
//
// The emulator suites answer almost everything about the bounded standings
// design (docs/handoffs/LIVE_CHALLENGE_STANDINGS_SCALE_2026-10-05.md): exact
// scores, placements and podiums, listeners, reconnects, and how many standings
// documents each screen receives. What the emulator cannot say is how the
// PRODUCTION backend delivers that fan-out: the emulator re-sends a whole
// query result on every change and shares one machine with the harness, so its
// delivery latency and bytes are not production's. This probe measures exactly
// that, on a real Firestore database, and nothing else.
//
// IT NEVER RUNS AGAINST PRODUCTION. It needs an isolated, non-production
// project, named twice (--project and --confirm-non-production), refuses the
// production project id outright, and refuses an emulator address unless asked
// for an emulator dry run. It deploys nothing, calls no Cloud Function, and
// touches no MathMaster collection: it writes only under
// `standingsFanoutProbe/{runId}` with the Admin SDK (so security rules are not
// involved) and deletes that tree when it finishes, even after a failure.
//
// Two patterns, the same class and the same answers:
//
//   legacy      every screen listens to every player row: the design before
//               the bounded projection (each answer reaches every screen)
//   projection  every screen listens to one snapshot document and its own
//               row; one publisher — standing in for the host console's pacer
//               and publishLiveChallengeStandings — reads every row in one
//               read-only transaction at most once a second while rows change,
//               and replaces the snapshot
//
// Each simulated screen is its own Admin SDK client (its own connection and
// listen stream), as each Chromebook is. Measured per round:
//
//   documents delivered per screen and in total (what listeners are billed)
//   delivery latency: each answer's commit -> each screen's first delivery
//     that reflects it (p50 / p95 / max), with the local clock's offset from
//     Firestore's measured and reported beside it
//   the publisher's reads and writes
//
// HOW TO RUN (an operator, with credentials for a NON-production project):
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/loadtest-service-account.json \
//   node scripts/probe-live-challenge-standings-fanout.mjs \
//     --project mathmaster-loadtest --confirm-non-production mathmaster-loadtest \
//     --students 64 --rounds 3
//
// Optional: --patterns legacy,projection  --spread-ms 6000  --out probe.json
// Cost at 64 students x 3 rounds is a few thousand document reads per pattern
// (printed before anything is written); see the runbook for the estimate.
//
// Emulator dry run (checks the probe itself; numbers are the emulator's):
//
//   npx firebase emulators:exec --only firestore --project demo-standings-probe \
//     --config tests/browser/emulator/firebase.json \
//     "node scripts/probe-live-challenge-standings-fanout.mjs --emulator --students 8 --rounds 2"

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_PROJECT_IDS = new Set(['mathmaster-aleks']);
const MAX_STUDENTS = 200;
const PROBE_COLLECTION = 'standingsFanoutProbe';
const PUBLISH_INTERVAL_MS = 1_000;
const COALESCE_MS = 150;

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repo, 'functions/package.json'));

/* ------------------------------- arguments ------------------------------- */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const fail = (message) => { console.error(`[probe] ${message}`); process.exit(2); };

const emulator = flag('emulator');
const projectId = emulator ? (process.env.GCLOUD_PROJECT || 'demo-standings-probe') : option('project');
const students = Number(option('students', '64'));
const rounds = Number(option('rounds', '3'));
const spreadMs = Number(option('spread-ms', '6000'));
const patterns = String(option('patterns', 'legacy,projection')).split(',').map((entry) => entry.trim()).filter(Boolean);
const outPath = option('out', path.join(os.tmpdir(), `standings-fanout-probe-${Date.now()}.json`));

// THE GUARDS. Every one of them runs before any client is created.
if (emulator) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) fail('--emulator needs FIRESTORE_EMULATOR_HOST (run it under firebase emulators:exec).');
} else {
  if (process.env.FIRESTORE_EMULATOR_HOST) fail('FIRESTORE_EMULATOR_HOST is set: this probe measures a real Firestore database. For the emulator, pass --emulator (a dry run) or use npm run profile:live-challenge-standings.');
  if (!projectId) fail('--project <non-production project id> is required.');
  if (option('confirm-non-production') !== projectId) fail(`Repeat the project id to confirm it is not production: --confirm-non-production ${projectId}`);
}
if (PRODUCTION_PROJECT_IDS.has(String(projectId).trim().toLowerCase())) fail(`${projectId} is the production project. This probe never runs against production.`);
if (!Number.isInteger(students) || students < 2 || students > MAX_STUDENTS) fail(`--students must be 2..${MAX_STUDENTS}.`);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) fail('--rounds must be 1..10.');
if (!Number.isFinite(spreadMs) || spreadMs < 0 || spreadMs > 60_000) fail('--spread-ms must be 0..60000.');
if (!patterns.length || patterns.some((pattern) => !['legacy', 'projection'].includes(pattern))) fail('--patterns is legacy and/or projection.');

/* ------------------------------ Firestore ------------------------------ */

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const apps = [];
const clientFor = (name) => {
  const app = admin.initializeApp({ projectId }, `standings-probe-${name}-${randomUUID().slice(0, 8)}`);
  apps.push(app);
  return app.firestore();
};

const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`;
const server = clientFor('server');
const runRef = server.collection(PROBE_COLLECTION).doc(runId);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });
const quantiles = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return { n: 0, p50: null, p95: null, max: null };
  const pick = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return { n: sorted.length, p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1) };
};
const mean = (values) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0);
const keyOf = (index) => `p${String(index).padStart(3, '0')}`;

// The local clock against Firestore's: latency is a local receive time minus
// a server commit time, so the offset is measured and reported beside it.
async function clockOffsetMs() {
  const samples = [];
  for (let index = 0; index < 5; index += 1) {
    const sentAt = Date.now();
    // eslint-disable-next-line no-await-in-loop
    const result = await runRef.collection('clock').doc(`s${index}`).set({ at: Timestamp.now() });
    const receivedAt = Date.now();
    samples.push({ offset: result.writeTime.toMillis() - (sentAt + receivedAt) / 2, rtt: receivedAt - sentAt });
  }
  samples.sort((left, right) => left.rtt - right.rtt);
  return { offsetMs: Math.round(samples[0].offset), rttMs: samples[0].rtt };
}

/* -------------------------------- a pattern -------------------------------- */

async function runPattern(pattern) {
  const roomRef = runRef.collection('rooms').doc(pattern);
  const playersRef = roomRef.collection('players');
  const snapshotRef = roomRef.collection('standings').doc('current');
  const keys = Array.from({ length: students }, (_, index) => keyOf(index));
  const batch = server.batch();
  keys.forEach((playerKey, slot) => batch.set(playersRef.doc(playerKey), { playerKey, slot, score: 0, answeredRound: -1 }));
  await batch.commit();

  // THE SCREENS. Each counts what it is delivered, by listener.
  const screens = keys.map((playerKey) => ({ playerKey, db: clientFor(`${pattern}-${playerKey}`), deliveries: [], stops: [] }));
  const ready = [];
  for (const screen of screens) {
    if (pattern === 'legacy') {
      ready.push(new Promise((resolve) => {
        let first = true;
        screen.stops.push(screen.db.collection(playersRef.path).onSnapshot((snapshot) => {
          const receivedAt = Date.now();
          const changes = snapshot.docChanges();
          screen.deliveries.push({ receivedAt, listener: 'players', docs: first ? snapshot.size : changes.length, rows: changes.map((change) => [change.doc.id, change.doc.get('answeredRound')]) });
          if (first) { first = false; resolve(); }
        }, (error) => console.error(`[probe] ${screen.playerKey} players: ${error.message}`)));
      }));
    } else {
      ready.push(new Promise((resolve) => {
        let waiting = 2;
        const once = () => { waiting -= 1; if (!waiting) resolve(); };
        let firstSnapshot = true;
        let firstSelf = true;
        screen.stops.push(screen.db.doc(snapshotRef.path).onSnapshot((snapshot) => {
          screen.deliveries.push({ receivedAt: Date.now(), listener: 'standings', docs: 1, sourceReadMs: snapshot.exists ? Number(snapshot.get('sourceReadMs')) || 0 : 0 });
          if (firstSnapshot) { firstSnapshot = false; once(); }
        }, (error) => console.error(`[probe] ${screen.playerKey} standings: ${error.message}`)));
        screen.stops.push(screen.db.doc(playersRef.doc(screen.playerKey).path).onSnapshot((snapshot) => {
          screen.deliveries.push({ receivedAt: Date.now(), listener: 'self', docs: 1, rows: [[snapshot.id, snapshot.get('answeredRound')]] });
          if (firstSelf) { firstSelf = false; once(); }
        }, (error) => console.error(`[probe] ${screen.playerKey} self: ${error.message}`)));
      }));
    }
  }
  await Promise.all(ready);
  await sleep(1_000);

  // THE PUBLISHER (projection): the host console's one listener on every row,
  // paced to one snapshot a second, read in one read-only transaction.
  const publisher = { reads: 0, writes: 0, publishes: [], stop: null, timer: null, dirty: false, lastAt: -Infinity, inFlight: false };
  if (pattern === 'projection') {
    const hostDb = clientFor(`${pattern}-host`);
    const publish = async () => {
      publisher.inFlight = true;
      publisher.dirty = false;
      publisher.lastAt = Date.now();
      try {
        const read = await server.runTransaction(async (transaction) => {
          const rows = await transaction.get(playersRef);
          return { rows: rows.docs.map((doc) => doc.data()), readTime: rows.readTime };
        }, { readOnly: true });
        publisher.reads += Math.max(1, read.rows.length);
        const ranked = [...read.rows].sort((left, right) => right.score - left.score);
        const ranks = Array.from({ length: students }, () => '');
        ranked.forEach((row, index) => { ranks[row.slot] = String(index + 1); });
        const sourceReadMs = read.readTime.toMillis();
        await snapshotRef.set({
          kind: 'live',
          count: ranked.length,
          top: ranked.slice(0, 5).map((row) => ({ playerKey: row.playerKey, score: row.score })),
          ranks: ranks.join(','),
          scores: read.rows.sort((left, right) => left.slot - right.slot).map((row) => row.score).join(','),
          sourceReadMs,
        });
        publisher.writes += 1;
        publisher.publishes.push({ at: Date.now(), sourceReadMs });
      } finally {
        publisher.inFlight = false;
        if (publisher.dirty) schedule();
      }
    };
    const schedule = () => {
      if (publisher.timer || publisher.inFlight) return;
      const at = Math.max(Date.now() + COALESCE_MS, publisher.lastAt + PUBLISH_INTERVAL_MS);
      publisher.timer = setTimeout(() => { publisher.timer = null; publish().catch((error) => console.error(`[probe] publish: ${error.message}`)); }, at - Date.now());
    };
    let first = true;
    publisher.stop = hostDb.collection(playersRef.path).onSnapshot(() => {
      if (first) { first = false; return; }
      publisher.dirty = true;
      schedule();
    });
  }

  // THE ROUNDS: every student answers once, spread over the round.
  const result = { pattern, students, rounds: [] };
  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const from = Date.now();
    const commits = await Promise.all(keys.map(async (playerKey, slot) => {
      await sleep(Math.random() * spreadMs);
      const write = await playersRef.doc(playerKey).update({ score: (roundIndex + 1) * 100 + ((slot * 37 + roundIndex * 11) % 97), answeredRound: roundIndex });
      return { playerKey, commitMs: write.writeTime.toMillis() };
    }));
    // Let the last answers (and the trailing publish) land everywhere.
    await sleep(PUBLISH_INTERVAL_MS * 3);
    const to = Date.now();
    const latencies = [];
    let missing = 0;
    for (const { playerKey, commitMs } of commits) {
      for (const screen of screens) {
        if (screen.playerKey === playerKey) continue;
        const shown = pattern === 'legacy'
          ? screen.deliveries.find((entry) => entry.receivedAt >= from && entry.rows?.some(([key, round]) => key === playerKey && round === roundIndex))
          : screen.deliveries.find((entry) => entry.listener === 'standings' && entry.receivedAt >= from && entry.sourceReadMs >= commitMs);
        if (shown) latencies.push(shown.receivedAt - commitMs); else missing += 1;
      }
    }
    const perScreen = screens.map((screen) => screen.deliveries.filter((entry) => entry.receivedAt >= from && entry.receivedAt <= to));
    const docsBy = (listener) => perScreen.map((entries) => entries.filter((entry) => entry.listener === listener).reduce((sum, entry) => sum + entry.docs, 0));
    const listeners = pattern === 'legacy' ? ['players'] : ['standings', 'self'];
    result.rounds.push({
      roundIndex,
      durationMs: to - from,
      docsPerScreen: Object.fromEntries(listeners.map((listener) => [listener, { mean: mean(docsBy(listener)), max: Math.max(...docsBy(listener)) }])),
      docsTotal: perScreen.reduce((sum, entries) => sum + entries.reduce((total, entry) => total + entry.docs, 0), 0),
      commitToShownMs: { ...quantiles(latencies), missing },
      publisher: pattern === 'projection' ? { reads: publisher.reads, writes: publisher.writes, publishes: publisher.publishes.filter((entry) => entry.at >= from && entry.at <= to).length } : null,
    });
    publisher.reads = 0;
    publisher.writes = 0;
    console.log(`[probe] ${pattern} round ${roundIndex + 1}: ${JSON.stringify(result.rounds.at(-1))}`);
  }

  publisher.stop?.();
  if (publisher.timer) clearTimeout(publisher.timer);
  screens.forEach((screen) => screen.stops.forEach((stop) => stop()));
  return result;
}

/* ---------------------------------- run ---------------------------------- */

const legacyReads = students * students * rounds;
const projectionReads = students * rounds * 12 + rounds * 10 * students;
console.log(`[probe] project ${projectId}${emulator ? ' (emulator dry run)' : ''}, ${students} students x ${rounds} rounds, patterns ${patterns.join(', ')}`);
console.log(`[probe] writes only under ${PROBE_COLLECTION}/${runId}, deleted at the end.`);
console.log(`[probe] estimated listener reads: legacy ~${legacyReads.toLocaleString()}, projection ~${projectionReads.toLocaleString()} (plus ${students * rounds} answer writes per pattern).`);

const report = { projectId, emulator, runId, students, rounds, spreadMs, startedAt: new Date().toISOString(), clock: null, patterns: [] };
let exitCode = 0;
try {
  report.clock = await clockOffsetMs();
  console.log(`[probe] local clock vs Firestore: offset ${report.clock.offsetMs} ms (rtt ${report.clock.rttMs} ms); latencies below include it.`);
  for (const pattern of patterns) {
    // eslint-disable-next-line no-await-in-loop
    report.patterns.push(await runPattern(pattern));
  }
} catch (error) {
  exitCode = 1;
  report.error = error?.stack || String(error);
  console.error(`[probe] failed: ${error?.message}`);
} finally {
  // Everything this run wrote, and nothing else.
  await server.recursiveDelete(runRef).catch((error) => { exitCode = 1; console.error(`[probe] cleanup of ${PROBE_COLLECTION}/${runId} failed: ${error.message}`); });
  await Promise.all(apps.map((app) => app.delete().catch(() => {})));
}
writeFileSync(outPath, JSON.stringify(report, null, 2));
const lines = ['', '| pattern | docs / screen / round | docs / round (class) | commit -> shown p50 / p95 / max ms | publisher reads / writes per round |', '|---|---|---|---|---|'];
for (const entry of report.patterns) {
  const avg = (pick) => mean(entry.rounds.map(pick));
  const perScreen = Object.entries(entry.rounds[0]?.docsPerScreen || {}).map(([listener]) => `${listener} ${avg((round) => round.docsPerScreen[listener].mean)}`).join(', ');
  lines.push(`| ${entry.pattern} | ${perScreen} | ${avg((round) => round.docsTotal)} | ${avg((round) => round.commitToShownMs.p50 ?? NaN)} / ${avg((round) => round.commitToShownMs.p95 ?? NaN)} / ${Math.max(...entry.rounds.map((round) => round.commitToShownMs.max ?? 0))} | ${entry.pattern === 'projection' ? `${avg((round) => round.publisher.reads)} / ${avg((round) => round.publisher.writes)}` : '—'} |`);
}
console.log(lines.join('\n'));
console.log(`[probe] report: ${outPath}`);
process.exit(exitCode);

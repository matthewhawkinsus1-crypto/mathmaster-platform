// The emulator's "Transaction is invalid or closed" is re-run the way the
// Firestore SDK re-runs production's "transaction has expired"
// (tests/integration/support/emulatorTransactions.mjs), for every integration
// suite and for nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMULATOR_CLOSED_TRANSACTION_ATTEMPTS,
  isEmulatorClosedTransaction,
  isRetryingEmulatorClosedTransactions,
  retryEmulatorClosedTransactions,
} from '../integration/support/emulatorTransactions.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const closed = () => Object.assign(new Error('3 INVALID_ARGUMENT: Transaction is invalid or closed.'), { code: 3 });
const noWait = { wait: async () => {} };

// A stand-in Firestore whose runTransaction fails with the given errors, in
// order, before it succeeds.
const fakeFirestore = (failures) => {
  const calls = [];
  class FakeFirestore {
    constructor() { this.name = 'db'; }
    async runTransaction(updateFunction, options) {
      calls.push({ self: this, updateFunction, options });
      const next = failures.shift();
      if (next) throw next;
      return updateFunction('tx');
    }
  }
  return { FakeFirestore, calls };
};

test('the emulator closing a transaction re-runs it as a fresh one, like an expired one in production', async () => {
  const { FakeFirestore, calls } = fakeFirestore([closed(), closed()]);
  assert.equal(retryEmulatorClosedTransactions(FakeFirestore, noWait), true);
  const db = new FakeFirestore();
  const update = async (tx) => `ran in ${tx}`;
  const options = { maxAttempts: 3 };
  assert.equal(await db.runTransaction(update, options), 'ran in tx');
  assert.equal(calls.length, 3, 'two closed transactions, then the one that commits');
  assert.ok(calls.every((call) => call.self === db && call.updateFunction === update && call.options === options),
    'the same instance, update function and options every time');
});

test('every other error is thrown at once, exactly as before', async () => {
  for (const error of [
    Object.assign(new Error('3 INVALID_ARGUMENT: Property name is invalid'), { code: 3 }),
    Object.assign(new Error('9 FAILED_PRECONDITION: missing index'), { code: 9 }),
    Object.assign(new Error('10 ABORTED: Too much contention'), { code: 10 }), // the SDK's own retries already ran
    new Error('Transaction is invalid or closed'), // the wording without the gRPC code is not the emulator's error
  ]) {
    const { FakeFirestore, calls } = fakeFirestore([error]);
    retryEmulatorClosedTransactions(FakeFirestore, noWait);
    await assert.rejects(new FakeFirestore().runTransaction(async () => 'never'), (thrown) => thrown === error);
    assert.equal(calls.length, 1, `${error.message} is not retried`);
  }
});

test('a transaction the emulator keeps closing still fails, after the attempt limit', async () => {
  const { FakeFirestore, calls } = fakeFirestore(Array.from({ length: 20 }, closed));
  retryEmulatorClosedTransactions(FakeFirestore, noWait);
  await assert.rejects(new FakeFirestore().runTransaction(async () => 'never'), (thrown) => isEmulatorClosedTransaction(thrown));
  assert.equal(calls.length, EMULATOR_CLOSED_TRANSACTION_ATTEMPTS);
});

test('the retry backs off between attempts', async () => {
  const waits = [];
  const { FakeFirestore } = fakeFirestore([closed(), closed()]);
  retryEmulatorClosedTransactions(FakeFirestore, { wait: async (ms) => { waits.push(ms); } });
  await new FakeFirestore().runTransaction(async () => 'ok');
  assert.equal(waits.length, 2);
  assert.ok(waits[1] > waits[0], `growing delays (${waits.join(', ')} ms)`);
});

test('wrapping twice changes nothing', async () => {
  const { FakeFirestore, calls } = fakeFirestore(Array.from({ length: 20 }, closed));
  assert.equal(retryEmulatorClosedTransactions(FakeFirestore, noWait), true);
  assert.equal(retryEmulatorClosedTransactions(FakeFirestore, noWait), false);
  assert.ok(isRetryingEmulatorClosedTransactions(FakeFirestore));
  await assert.rejects(new FakeFirestore().runTransaction(async () => 'never'));
  assert.equal(calls.length, EMULATOR_CLOSED_TRANSACTION_ATTEMPTS, 'not attempts × attempts');
});

test('the error is recognised by its gRPC code and the emulator\'s wording together', () => {
  assert.ok(isEmulatorClosedTransaction(closed()));
  assert.ok(!isEmulatorClosedTransaction(Object.assign(new Error('Transaction is invalid or closed'), { code: 10 })));
  assert.ok(!isEmulatorClosedTransaction(Object.assign(new Error('transaction has expired'), { code: 3 })), 'production wording is the SDK\'s own case');
  assert.ok(!isEmulatorClosedTransaction(null));
});

test('every npm script that runs the integration suites loads the retry', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const integration = Object.entries(scripts).filter(([, command]) => /node --[^"]*test[^"]* tests\/integration\//.test(command) || /node .*--test tests\/integration\//.test(command));
  assert.ok(integration.length >= 5, `found ${integration.length} integration scripts`);
  for (const [name, command] of integration) {
    assert.match(command, /node --import \.\/tests\/integration\/support\/emulatorTransactions\.mjs --test tests\/integration\//, `${name} loads the emulator transaction retry`);
  }
});

test('no integration suite resends commands around the closed-transaction error on its own', () => {
  const dir = path.join(repo, 'tests/integration');
  const files = readdirSync(dir, { recursive: true }).map(String).filter((file) => /\.m?js$/.test(file) && !file.startsWith('support'));
  for (const file of files) {
    // Code only: a comment may still explain the error's history.
    assert.doesNotMatch(executableSource(readFileSync(path.join(dir, file), 'utf8')), /Transaction is invalid or closed/, `${file} leaves the retry to support/emulatorTransactions.mjs`);
  }
});

test('outside the emulator nothing is patched', () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, undefined, 'this file runs without the emulator');
  const source = readFileSync(path.join(repo, 'tests/integration/support/emulatorTransactions.mjs'), 'utf8');
  assert.match(executableSource(source), /if \(process\.env\.FIRESTORE_EMULATOR_HOST\) \{\s*retryEmulatorClosedTransactions\(functionsFirestoreClass\(\)/);
});

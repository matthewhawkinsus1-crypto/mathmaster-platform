/*
 * THE EMULATOR'S EXPIRED TRANSACTION IS RETRIED THE WAY PRODUCTION'S IS.
 *
 * `runTransaction` (@google-cloud/firestore, transaction.js
 * `isRetryableTransactionError`) re-runs a transaction on transient errors and,
 * for INVALID_ARGUMENT, only when the message says "transaction has expired":
 * the production backend's wording for a transaction id it no longer holds.
 *
 * The Firestore emulator reports that same condition as INVALID_ARGUMENT
 * "Transaction is invalid or closed". Under the integration suites' parallel
 * load it can drop a transaction while one of its reads is retried with the
 * transaction's id. Production would quietly re-run the transaction; against
 * the emulator the whole command failed instead, having written nothing. That
 * was the recurring flake in the Live Challenge, rewards and other suites,
 * patched three times by resending commands from individual suites.
 *
 * This module closes that one gap and nothing else. It is loaded for every
 * integration suite through `node --import` (see package.json), and only when
 * FIRESTORE_EMULATOR_HOST is set. On that exact error, a transaction is re-run
 * as a fresh one, which `runTransaction` already guarantees is safe: its update
 * function must tolerate being run more than once. Any other error, and the
 * same error past the attempt limit, is thrown exactly as before. Production
 * code is untouched.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMULATOR_CLOSED_TRANSACTION_ATTEMPTS = 5;

export const isEmulatorClosedTransaction = (error) => error?.code === 3
  && /Transaction is invalid or closed/i.test(String(error?.message || ''));

const RETRY_MARK = Symbol.for('mathmaster.emulatorClosedTransactionRetry');

/**
 * Wrap `FirestoreClass.prototype.runTransaction` so the emulator's closed
 * transaction is re-run like production's expired one. Returns false when the
 * class is already wrapped, so loading the module twice changes nothing.
 */
export function retryEmulatorClosedTransactions(FirestoreClass, {
  attempts = EMULATOR_CLOSED_TRANSACTION_ATTEMPTS,
  delayMs = (attempt) => 25 * 2 ** attempt,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = null,
} = {}) {
  const proto = FirestoreClass?.prototype;
  if (!proto || typeof proto.runTransaction !== 'function') throw new Error('Not a Firestore class: no runTransaction to wrap.');
  if (proto.runTransaction[RETRY_MARK]) return false;
  const original = proto.runTransaction;
  async function runTransaction(updateFunction, transactionOptions) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await original.call(this, updateFunction, transactionOptions);
      } catch (error) {
        if (!isEmulatorClosedTransaction(error) || attempt >= attempts) throw error;
        onRetry?.(attempt);
        // eslint-disable-next-line no-await-in-loop
        await wait(delayMs(attempt));
      }
    }
  }
  runTransaction[RETRY_MARK] = true;
  proto.runTransaction = runTransaction;
  return true;
}

export const isRetryingEmulatorClosedTransactions = (FirestoreClass) => Boolean(FirestoreClass?.prototype?.runTransaction?.[RETRY_MARK]);

// The Firestore class the Cloud Functions code uses: firebase-admin in
// functions/ resolves @google-cloud/firestore from functions/node_modules.
export function functionsFirestoreClass() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const require = createRequire(path.join(repo, 'functions/package.json'));
  return require('@google-cloud/firestore').Firestore;
}

// One line per re-run, so a CI log shows how often the emulator does this.
if (process.env.FIRESTORE_EMULATOR_HOST) {
  retryEmulatorClosedTransactions(functionsFirestoreClass(), {
    onRetry: (attempt) => console.warn(`[emulator] re-ran a transaction the emulator closed (attempt ${attempt + 1} of ${EMULATOR_CLOSED_TRANSACTION_ATTEMPTS})`),
  });
}

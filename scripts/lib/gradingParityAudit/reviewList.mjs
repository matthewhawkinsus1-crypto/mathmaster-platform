/*
 * THE WRONG VERDICTS THE OWNER IS STILL TO RULE ON
 * (scripts/grading-parity-real-items-review.json).
 *
 * The real-item audit fails on a FIRM wrong verdict: a right answer the
 * independent reading confirmed marked wrong, or a wrong one marked right.
 * Some of those are a grading rule doing what it says, where whether the rule
 * is what the platform wants is the owner's call (a polynomial in simplest
 * form refuses brackets round the whole answer). Each such signature is
 * listed with what it is and why it is left, so the audit stays green on it
 * and goes red on anything new. The list only shrinks: an entry whose
 * signature no longer occurs is reported as stale by the platform test.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signatureOf } from './audit.mjs';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../grading-parity-real-items-review.json');

export const readReviewList = () => JSON.parse(readFileSync(FILE, 'utf8')).entries || [];

/** Firm wrong verdicts whose signature is not on the list. */
export const unlistedFirm = (rows, entries = readReviewList()) => {
  const listed = new Set(entries.map((entry) => entry.signature));
  return rows.filter((row) => row.firm && !listed.has(signatureOf(row)));
};

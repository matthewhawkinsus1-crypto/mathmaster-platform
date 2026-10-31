/*
 * BANKS FROM OUTSIDE THE REPOSITORY (GR25). The equivalence sweep
 * (scripts/sweep-equivalence-verdicts.mjs) and the answer-acceptance audit
 * (scripts/audit-correct-answer-acceptance.mjs) read the repository's seeds.
 * `--extra-bank <file>` (repeatable) adds the documents of another bank file:
 * a seed file, or the report scripts/report-live-path-bank-drift.mjs writes,
 * which holds the live bank's drifted and live-only families under
 * `documents`. Those are stored documents (already compiled), so a caller
 * draws them as they are. Read-only: it reads the named files only.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const EXTRA_BANK_FLAG = '--extra-bank';

/** The files named by --extra-bank, in order. */
export const extraBankPaths = (argv = process.argv) => argv.flatMap((arg, index) => {
  if (arg !== EXTRA_BANK_FLAG) return [];
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${EXTRA_BANK_FLAG} needs a file`);
  return [path.resolve(value)];
});

const documentsIn = (parsed) => (Array.isArray(parsed) ? parsed : (parsed?.documents || parsed?.items || parsed?.questions || []));

/** The bank documents one file holds: each an object with an id. */
export const extraBankDocuments = (file, read = (name) => readFileSync(name, 'utf8')) => {
  const documents = documentsIn(JSON.parse(read(file)));
  if (!Array.isArray(documents)) throw new Error(`${file} holds no bank documents`);
  return documents.filter((document) => document && typeof document === 'object' && String(document.id ?? '').trim() !== '');
};

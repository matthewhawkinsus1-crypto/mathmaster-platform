/*
 * WHAT THE FUZZ HARNESS REPORTS, AND WHAT IT LETS PASS.
 *
 * A finding is one property broken by one case:
 *
 *   target     which graders were asked (typedFields, toolWork, ...)
 *   property   what should have held ("never-throws", "device-server-parity")
 *   signature  the CLASS of the finding: target, property and what
 *              distinguishes one cause from another (the grader, the kind of
 *              input), never the case itself. Ten thousand cases with one
 *              cause have one signature.
 *   severity   'fail'    a property the platform promises; the run fails
 *              'report'  two graders that may differ by design; counted and
 *                        listed, never a failure
 *   repro      the whole case as JSON: `node scripts/fuzz-graders.mjs
 *              --replay <file>` runs it again with nothing else needed
 *
 * KNOWN FINDINGS. scripts/grader-fuzz-known-findings.json lists signatures
 * that are understood and not fixed yet, each with the reason and where it is
 * tracked. A 'fail' finding with a listed signature does not fail the run; a
 * new signature does. The list only shrinks: a full run that no longer meets a
 * listed signature says so, and the entry is deleted with the fix.
 *
 * Pure.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KNOWN_FINDINGS_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../grader-fuzz-known-findings.json');

export const readKnownFindings = (file = KNOWN_FINDINGS_PATH) => {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return parsed.findings && typeof parsed.findings === 'object' ? parsed.findings : {};
};

export const finding = ({ target, property, signature, message, repro, severity = 'fail' }) => ({
  target,
  property,
  severity,
  signature: [target, property, signature].filter((part) => part !== null && part !== undefined && part !== '').join('/'),
  message: String(message || ''),
  repro,
});

/** A thrown value as one short line a signature can hold. */
export const errorLine = (error) => String(error?.message ?? error)
  .split('\n')[0]
  // Not the value that broke it: one cause, one signature. A message that
  // quotes the value after a colon ("Unsupported relation: C = 2πr") keeps its head.
  .replace(/:\s.*$/, ': …')
  .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"')
  .replace(/\d+/g, 'N')
  .slice(0, 90);

/**
 * Findings folded by signature: how many cases met each, and the smallest
 * case that did (the shortest repro is the one a person reads).
 */
export const summarizeFindings = (findings, known = {}) => {
  const bySignature = new Map();
  for (const entry of findings) {
    const size = JSON.stringify(entry.repro ?? null).length;
    const seen = bySignature.get(entry.signature);
    if (!seen) bySignature.set(entry.signature, { ...entry, count: 1, size, known: Object.hasOwn(known, entry.signature) });
    else {
      seen.count += 1;
      if (size < seen.size) Object.assign(seen, { message: entry.message, repro: entry.repro, size });
    }
  }
  const all = [...bySignature.values()].sort((left, right) => left.signature.localeCompare(right.signature));
  return {
    all,
    /** New failures: what turns a run red. */
    failures: all.filter((entry) => entry.severity === 'fail' && !entry.known),
    known: all.filter((entry) => entry.severity === 'fail' && entry.known),
    reports: all.filter((entry) => entry.severity === 'report'),
    /** Listed signatures this run did not meet (only a full run can say they are gone). */
    unmet: Object.keys(known).filter((signature) => !bySignature.has(signature)).sort(),
  };
};

export const formatFinding = (entry) => [
  `${entry.signature}  (${entry.count} case${entry.count === 1 ? '' : 's'})`,
  `    ${entry.message}`,
  `    repro: ${JSON.stringify(entry.repro).slice(0, 1200)}`,
].join('\n');

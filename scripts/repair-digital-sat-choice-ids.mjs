#!/usr/bin/env node
// Replace the answer-naming Digital SAT choice ids with opaque ones.
//
// Every Digital SAT multiple-choice family keyed its correct option with the
// literal id `sat-correct` (five older items used bare `correct`), with the
// other three as `sat-d1..3`. Choice ORDER is shuffled at generation, but the
// id travels with the option, and `buildSanitizedQuestion` copies ids through
// to the browser verbatim — it strips `expected`, not `id`. A test taker with
// developer tools open therefore answered every Digital SAT multiple-choice
// question without doing any mathematics.
//
// The fix is the convention the ASVAB bank already uses: opaque `choice-a..d`.
// Renaming positionally would not be enough on its own, because the key is
// authored at index 0 in all 502 items — every key would simply become
// `choice-a`. So the letters are rotated by a hash of the family id: the
// mapping is stable and reproducible, but which letter carries the key varies
// from family to family, and nothing in the payload marks it.
//
//   node scripts/repair-digital-sat-choice-ids.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SOURCE = path.join(ROOT, 'drafts', 'ccmr-v2.1', 'digitalSAT');
const CHECK_ONLY = process.argv.includes('--check');

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const LEAKY = /^(sat-)?(correct|d\d+)$/;

const walkFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walkFiles(full);
  return full.endsWith('.json') ? [full] : [];
});

// A stable rotation per family, so the same draft always compiles to the same
// ids and a rebuild is a no-op rather than a diff.
const rotationFor = (key, size) => {
  const digest = createHash('sha256').update(String(key)).digest();
  return digest[0] % size;
};

let filesChanged = 0;
let itemsChanged = 0;
let keyLetters = {};

for (const file of walkFiles(SOURCE)) {
  const raw = readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    continue;
  }
  let touched = false;

  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const choices = node.choices;
    if (Array.isArray(choices) && choices.length > 1
      && choices.every((c) => c && typeof c === 'object' && LEAKY.test(String(c.id)))) {
      const anchor = String(node.familyId || node.id || choices.map((c) => c.label).join('|'));
      const offset = rotationFor(anchor, choices.length);
      const rename = new Map();
      choices.forEach((choice, index) => {
        const letter = LETTERS[(index + offset) % choices.length];
        rename.set(String(choice.id), `choice-${letter}`);
      });
      choices.forEach((choice) => {
        const next = rename.get(String(choice.id));
        if (next && next !== choice.id) {
          choice.id = next;
          touched = true;
        }
      });
      // `expected` names one of those ids and has to move with them. It is
      // stripped before the payload reaches the browser, but it is what the
      // server grades against, so getting this wrong would silently mark every
      // response incorrect.
      const fields = Array.isArray(node.responseFields) ? node.responseFields : [];
      for (const field of fields) {
        const next = rename.get(String(field.expected));
        if (next && next !== field.expected) {
          field.expected = next;
          touched = true;
        }
        if (Array.isArray(field.accepted)) {
          field.accepted = field.accepted.map((value) => rename.get(String(value)) || value);
        }
      }
      const keyed = fields.map((f) => f.expected).find(Boolean);
      if (keyed) keyLetters[keyed] = (keyLetters[keyed] || 0) + 1;
      itemsChanged += 1;
    }

    Object.values(node).forEach(visit);
  };

  visit(parsed);

  if (touched) {
    filesChanged += 1;
    if (!CHECK_ONLY) writeFileSync(file, `${JSON.stringify(parsed)}\n`);
  }
}

console.log(`${CHECK_ONLY ? 'would rewrite' : 'rewrote'} ${itemsChanged} items across ${filesChanged} files`);
console.log(`key letter distribution: ${JSON.stringify(keyLetters)}`);

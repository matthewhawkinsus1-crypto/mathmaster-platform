#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sourcePath = path.join(
  repoRoot,
  'drafts',
  'ccmr-v2.1',
  'act',
  'essentialSkills',
  'ACT_NATIVE_pythagoreanTheorem.v2.1.json',
);

const OLD_ID = 'mm_act_ies_pythagoreantheorem_1_scaled-3-4-5-hypotenuse_v21';
const OLD_PROMPT = 'A right triangle has legs of length {{a}} and {{b}} units. What is the length of the hypotenuse?';
const OLD_STEM = 'scaled-3-4-5-hypotenuse';

const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const documents = Array.isArray(parsed.documents) ? parsed.documents : [];
const index = documents.findIndex((doc) => doc?.id === OLD_ID);

if (index < 0) {
  throw new Error(`Task 6 repair refused: expected source family ${OLD_ID} was not found.`);
}

const current = documents[index];
if (current.prompt !== OLD_PROMPT || current.ccmrAuthenticLanguage?.stemProfile !== OLD_STEM) {
  throw new Error('Task 6 repair refused: the ACT source family no longer matches the reviewed pre-repair shape.');
}
if (current.generator?.derived?.a !== '3*k' || current.generator?.derived?.b !== '4*k' || current.generator?.derived?.ans !== '5*k') {
  throw new Error('Task 6 repair refused: the ACT 3-4-5 generator no longer matches the reviewed pre-repair shape.');
}

const replacement = {
  ...current,
  id: 'mm_act_ies_pythagoreantheorem_1_ramp-length-8-15-17_v21',
  assessmentContext: {
    ...current.assessmentContext,
    modeling: true,
  },
  familyId: 'mathmaster:act:native:pythagoreanTheorem:ramp-length-8-15-17',
  familyVersion: 2,
  difficultyBand: 2,
  dok: 2,
  taskType: 'rightTriangleContext',
  representation: 'ramp',
  ccmrAuthenticLanguage: {
    ...current.ccmrAuthenticLanguage,
    stemProfile: 'ramp-length-8-15-17',
  },
  prompt: 'A ramp rises {{rise}} feet while extending {{run}} feet horizontally. What is the length, in feet, of the ramp?',
  generator: {
    parameters: {
      k: { type: 'int', min: 1, max: 5 },
    },
    derived: {
      rise: '8*k',
      run: '15*k',
      ans: '17*k',
      d1: '23*k',
      d2: '15*k',
      d3: '16*k',
    },
  },
};

documents[index] = replacement;
fs.writeFileSync(sourcePath, `${JSON.stringify(parsed)}\n`);
console.log(`Replaced ${OLD_ID} with ${replacement.id}.`);

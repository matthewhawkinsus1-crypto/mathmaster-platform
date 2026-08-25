#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(here, '..'));
const file = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT', 'advancedMath', 'A2.3C.v2.1.json');
const parsed = JSON.parse(readFileSync(file, 'utf8'));
const id = 'mm_sat_A2_3C_challenge_parameter-tangent-line_v21';
const doc = parsed.documents?.find((item) => item.id === id);
if (!doc) throw new Error(`${id}: item not found`);
if (String(doc.assessmentItemFormat || '').toLowerCase() !== 'multiplechoice') {
  throw new Error(`${id}: expected response-ecology repair to convert item to MCQ first`);
}
if (doc.generator?.derived?.k !== '-(r*r)') {
  throw new Error(`${id}: expected tangent parameter k=-(r*r)`);
}
if (!doc.generator?.derived?.satDistractor1 || !doc.generator?.derived?.satDistractor2 || !doc.generator?.derived?.satDistractor3) {
  throw new Error(`${id}: expected three generated distractor fields before special-case repair`);
}

// Authentic misconception models for the tangent condition k=-r^2:
// 1) lose the negative sign, 2) double instead of square, 3) drop the square.
doc.generator.derived.satDistractor1 = 'r*r';
doc.generator.derived.satDistractor2 = '-2*r';
doc.generator.derived.satDistractor3 = '-r';
doc.ccmrAuthenticLanguage = {
  ...doc.ccmrAuthenticLanguage,
  distractorModel: 'tangent-parameter-sign-square-errors',
};
writeFileSync(file, `${JSON.stringify(parsed)}\n`);
console.log(JSON.stringify({ repaired: id, distractors: ['r*r', '-2*r', '-r'] }, null, 2));

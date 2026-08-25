#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(path.join(here, '..'));
const satRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'digitalSAT', 'advancedMath');

function loadUnit(fileName) {
  const file = path.join(satRoot, fileName);
  return { file, parsed: JSON.parse(readFileSync(file, 'utf8')) };
}

function findDoc(parsed, id) {
  const doc = parsed.documents?.find((item) => item.id === id);
  if (!doc) throw new Error(`${id}: item not found`);
  return doc;
}

const tangent = loadUnit('A2.3C.v2.1.json');
const tangentId = 'mm_sat_A2_3C_challenge_parameter-tangent-line_v21';
const tangentDoc = findDoc(tangent.parsed, tangentId);
if (String(tangentDoc.assessmentItemFormat || '').toLowerCase() !== 'multiplechoice') {
  throw new Error(`${tangentId}: expected response-ecology repair to convert item to MCQ first`);
}
if (tangentDoc.generator?.derived?.k !== '-(r*r)') {
  throw new Error(`${tangentId}: expected tangent parameter k=-(r*r)`);
}
if (!tangentDoc.generator?.derived?.satDistractor1 || !tangentDoc.generator?.derived?.satDistractor2 || !tangentDoc.generator?.derived?.satDistractor3) {
  throw new Error(`${tangentId}: expected three generated distractor fields before special-case repair`);
}

// Authentic misconception models for the tangent condition k=-r^2:
// 1) lose the negative sign, 2) double instead of square, 3) drop the square.
tangentDoc.generator.derived.satDistractor1 = 'r*r';
tangentDoc.generator.derived.satDistractor2 = '-2*r';
tangentDoc.generator.derived.satDistractor3 = '-r';
tangentDoc.ccmrAuthenticLanguage = {
  ...tangentDoc.ccmrAuthenticLanguage,
  distractorModel: 'tangent-parameter-sign-square-errors',
};
writeFileSync(tangent.file, `${JSON.stringify(tangent.parsed)}\n`);

const noIntersection = loadUnit('A2.3D.v2.1.json');
const noIntersectionId = 'mm_sat_A2_3D_no-intersection-horizontal-below_v21';
const noIntersectionDoc = findDoc(noIntersection.parsed, noIntersectionId);
if (String(noIntersectionDoc.assessmentItemFormat || '').toLowerCase() !== 'multiplechoice') {
  throw new Error(`${noIntersectionId}: expected MCQ item before structural repair`);
}

// Replace the horizontal-line mirror task with a genuinely different nonlinear-system
// structure. Let t=x-h. Intersections would require t^2 = 2t-2, so
// t^2-2t+2=0 has discriminant -4 and therefore no real solutions.
noIntersectionDoc.taskType = 'solutionCount';
noIntersectionDoc.representation = 'equations';
noIntersectionDoc.ccmrAuthenticLanguage = {
  ...noIntersectionDoc.ccmrAuthenticLanguage,
  stemProfile: 'no-intersection-oblique-line',
  structuralRepair: 'v2.1-oblique-line-negative-discriminant',
};
noIntersectionDoc.prompt = 'The graphs of $y=(x-{{h}})^2 {{v|signed}}$ and $y=2(x-{{h}}) {{vm2|signed}}$ are in the same coordinate plane. How many points do the graphs have in common?';
noIntersectionDoc.generator = {
  parameters: {
    h: { type: 'int', min: 1, max: 9 },
    v: { type: 'int', min: -4, max: 8 },
  },
  derived: { vm2: 'v-2' },
};
writeFileSync(noIntersection.file, `${JSON.stringify(noIntersection.parsed)}\n`);

console.log(JSON.stringify({
  repaired: [
    {
      id: tangentId,
      distractors: ['r*r', '-2*r', '-r'],
    },
    {
      id: noIntersectionId,
      structure: 'shifted parabola vs oblique line; discriminant -4',
    },
  ],
}, null, 2));

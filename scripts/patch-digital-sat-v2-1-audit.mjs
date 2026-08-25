#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'scripts', 'build-digital-sat-v2-1.mjs');
let source = readFileSync(target, 'utf8');

const grammarPattern = /function normalizeGrammar\(text\) \{[\s\S]*?\n\}\n(?=function tokenSet)/;
if (!grammarPattern.test(source)) throw new Error('normalizeGrammar block not found');
source = source.replace(grammarPattern, `function normalizeMath(math) {
  return String(math || '')
    .toLowerCase()
    .replace(/\\{\\{[^}]+\\}\\}/g, '<value>')
    .replace(/\\\\left|\\\\right/g, '')
    .replace(/\\\\cdot|\\\\times/g, '*')
    .replace(/\\\\div/g, '/')
    .replace(/\\\\leq?/g, '<=')
    .replace(/\\\\geq?/g, '>=')
    .replace(/\\\\neq/g, '!=')
    .replace(/\\\\sqrt\\s*\\{/g, 'sqrt{')
    .replace(/\\\\frac\\s*\\{/g, 'frac{')
    .replace(/-?\\d+(?:\\.\\d+)?/g, '<number>')
    .replace(/\\b[a-z]\\b/g, '<var>')
    .replace(/\\s+/g, ' ')
    .trim();
}
function normalizeGrammar(text) {
  const source = String(text || '').toLowerCase().replace(/\\{\\{[^}]+\\}\\}/g, '<value>');
  let out = '';
  let last = 0;
  for (const match of source.matchAll(/\\$([^$]+)\\$/g)) {
    out += source.slice(last, match.index);
    out += \` <math:\${normalizeMath(match[1])}> \`;
    last = match.index + match[0].length;
  }
  out += source.slice(last);
  return out
    .replace(/-?\\d+(?:\\.\\d+)?/g, '<number>')
    .replace(/[^a-z0-9<>!=+*/^{}:_\\s'().,-]/g, ' ')
    .replace(/\\b(a|an|the)\\b/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}
`);

const oldTaskSignature = "  const taskSignature = JSON.stringify([doc.taskType || '', doc.representation || '', formatOf(doc), generatorSignature(doc)]);";
const newTaskSignature = "  const taskSignature = JSON.stringify([doc.taskType || '', doc.representation || '', formatOf(doc), generatorSignature(doc), normalizeGrammar(promptOf(doc))]);";
if (!source.includes(oldTaskSignature)) throw new Error('underlying task signature anchor not found');
source = source.replace(oldTaskSignature, newTaskSignature);

writeFileSync(target, source);
console.log('Patched Digital SAT V2.1 anti-clone audit with structure-aware math grammar.');

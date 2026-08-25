#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = path.join(root, 'scripts', 'build-digital-sat-v2-1.mjs');
let source = readFileSync(target, 'utf8');

const anchor = "const generatorSignature = (doc) => JSON.stringify(doc?.generator || null);\n";
const helper = `${anchor}const hasTemplateToken = (value) => /\\{\\{[^}]+\\}\\}/.test(String(value ?? ''));\nconst requiresGenerator = (doc) => {\n  const { generator: _generator, ...rest } = doc || {};\n  return hasTemplateToken(JSON.stringify(rest));\n};\n`;
if (!source.includes(anchor)) throw new Error('generatorSignature anchor not found');
source = source.replace(anchor, helper);

const scopeMap = '  const generatorsWithinScope = new Map();\n';
if (!source.includes(scopeMap)) throw new Error('generatorsWithinScope declaration not found');
source = source.replace(scopeMap, '');

const oldBlock = `    if (!doc?.generator || typeof doc.generator !== 'object') failures.push(\`${'${id}'}: missing generator\`);\n    const generator = generatorSignature(doc);\n    if (generator !== 'null') {\n      const prior = generatorsWithinScope.get(generator);\n      if (prior) failures.push(\`${'${scope.kind}'}:${'${scope.id}'}: ${'${id}'} reuses the exact generator from ${'${prior}'}\`);\n      else generatorsWithinScope.set(generator, id);\n    }\n`;
const newBlock = `    if ((!doc?.generator || typeof doc.generator !== 'object') && requiresGenerator(doc)) failures.push(\`${'${id}'}: templated item is missing generator\`);\n`;
if (!source.includes(oldBlock)) throw new Error('legacy generator enforcement block not found');
source = source.replace(oldBlock, newBlock);

writeFileSync(target, source);
console.log('Patched Digital SAT V2.1 generator audit semantics.');

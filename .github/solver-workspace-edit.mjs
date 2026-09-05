import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/attemptPolicy.js';
let source = await readFile(path, 'utf8');
const bad = `.replace(/\\\\s+/g, '')`;
const good = `.replace(/\\s+/g, '')`;
if (!source.includes(bad)) {
  throw new Error('Could not locate literal-backslash whitespace normalization bug');
}
source = source.replace(bad, good);
await writeFile(path, source);

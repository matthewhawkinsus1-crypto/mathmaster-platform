#!/usr/bin/env node
// Development probe: where does the answer key land among the four choices,
// family by family? A family whose key sits at one rank every time is
// answerable by magnitude alone.
import { readFileSync } from 'node:fs';
import { samplePathInstances } from '../functions/shared/pathQuestionGeneration.mjs';
const file = process.argv[2] || 'drafts/asvab-ar.json';
const docs = JSON.parse(readFileSync(file, 'utf8')).documents || [];
const num = (s) => { const b = String(s).replace(/\\\$/g, '').replace(/\$|\\[a-zA-Z]+|[{},]/g, '').trim(); return /^-?\d+(\.\d+)?$/.test(b) ? Number(b) : null; };
for (const q of docs) {
  const rank = [0, 0, 0, 0]; let bad = 0;
  for (const s of samplePathInstances(q, 60)) {
    const inst = s.question; if (!inst) { bad += 1; continue; }
    const ch = inst.choices || []; const keyId = (inst.responseFields || [])[0]?.expected;
    const vals = ch.map((c) => num(c.label)); if (vals.some((v) => v === null)) continue;
    const i = ch.findIndex((c) => c.id === keyId); if (i < 0) continue;
    rank[[...vals].sort((a, b) => a - b).indexOf(vals[i])] += 1;
  }
  const total = rank.reduce((a, b) => a + b, 0) || 1;
  const worst = Math.max(...rank) / total;
  console.log(`${worst >= 0.5 ? 'BIAS' : '  ok'}  ${String(q.id).padEnd(46)} ranks=[${rank.join(',')}] worst=${(worst * 100).toFixed(0)}%${bad ? ` ungenerated=${bad}` : ''}`);
}

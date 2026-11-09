/*
 * My Math Path's wheel draws a red dot beside a skill whose retention check is
 * recommended (the scheduler's concern; an overdue check raises it too). The
 * key under the wheel explained every other mark and not this one, and the
 * skill's name, which a screen reader reads, did not say it either (WCAG
 * 1.1.1). Now both say it, in the words the skill's card uses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a skill with a retention concern says so in its name, and a skill without one does not', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', cacheDir: join(tmpdir(), 'mm-vite-wheel-retention') });
  try {
    const { MyMathPathWheel, RETENTION_CHECK_RECOMMENDED } = await server.ssrLoadModule('/src/components/student/MyMathPathWheel.jsx');
    const { getMasteryStrands, DEFAULT_MASTERY_COURSE_ID } = await server.ssrLoadModule('/src/platform/mastery/strandConfig.js');
    const [concern, stable, lost] = getMasteryStrands(DEFAULT_MASTERY_COURSE_ID).flatMap((strand) => strand.codes);
    const profile = (status, retention) => ({ mastery: { status, estimate: 80 }, signals: { retention } });
    const markup = renderToStaticMarkup(React.createElement(MyMathPathWheel, {
      masteryProfilesByTEKS: {
        [concern]: profile('Mastered', 'concern'),
        [stable]: profile('Secure', 'stable'),
        [lost]: profile('Mastered', 'confirmedLoss'),
      },
    }));
    const skills = [...markup.matchAll(/<g role="button"[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/g>/g)]
      .map(([, name, body]) => ({ name, dot: /fill="#d93025"/.test(body) }));
    assert.ok(skills.length > 3, `the wheel draws its skills (${skills.length})`);
    const named = skills.filter((skill) => skill.name.endsWith(` · ${RETENTION_CHECK_RECOMMENDED}`));
    const dotted = skills.filter((skill) => skill.dot);
    assert.equal(dotted.length, 2, 'the concern and the confirmed loss draw the dot');
    assert.deepEqual(named, dotted, 'every skill with the dot is named for it, and only those');
    assert.ok(skills.some((skill) => !skill.dot && /: Secure$/.test(skill.name)), 'a stable skill reads as before');
  } finally {
    await server.close();
  }
});

test('the colour key explains the dot, in the skill card\'s words', () => {
  const wheel = read('src/components/student/MyMathPathWheel.jsx');
  const words = wheel.match(/export const RETENTION_CHECK_RECOMMENDED = '([^']+)';/)?.[1];
  assert.equal(words, 'Retention check recommended');
  assert.ok(read('src/components/student/SkillDetailCardModal.jsx').includes(`<strong>${words}.</strong>`), 'the skill card says the same');
  const dashboard = read('src/components/student/MyMathPathDashboard.jsx');
  const key = dashboard.slice(dashboard.indexOf('<strong>What the colours mean</strong>'), dashboard.indexOf('numbers around the wheel are the topics'));
  assert.match(key, /<span data-mm-swatch="point" style=\{\{ color: 'var\(--mm-error-text\)', fontWeight: 900 \}\}>●<\/span> \{RETENTION_CHECK_RECOMMENDED\.toLowerCase\(\)\} · $/);
  assert.match(dashboard, /^import MyMathPathWheel, \{ RETENTION_CHECK_RECOMMENDED \} from '\.\/MyMathPathWheel\.jsx';$/m);
});

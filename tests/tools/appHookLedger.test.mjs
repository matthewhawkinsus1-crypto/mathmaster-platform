/*
 * The two tools the App.jsx split leans on.
 *
 * scripts/lib/appHookLedger.mjs says whether a move changed the order React
 * runs App's effects in. scripts/codemods/extract-app-hook.mjs makes the move,
 * and refuses one that could not behave the same. Both are held here on small
 * components where the right answer is known, and the ledger once on the real
 * App, where it has to see through every hook App calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { compareLedgers, createHookLedger, EFFECT_HOOKS } from '../../scripts/lib/appHookLedger.mjs';
import { planExtraction, settleImports } from '../../scripts/codemods/extract-app-hook.mjs';

const ledgerOf = (files, component = 'App') => createHookLedger((path) => files[path] ?? null).ledger('src/App.jsx', component);
const effects = (entries) => entries.filter((entry) => EFFECT_HOOKS.has(entry.hook));

const INLINE = {
  'src/App.jsx': `
    import { useEffect, useState } from 'react';
    export default function App() {
      const [a, setA] = useState(0);
      useEffect(() => { first(a); }, [a]);
      useEffect(() => { second(a); }, [a]);
      useEffect(() => { third(setA); }, []);
      return null;
    }`,
};

test('a hook App calls is read through: its effects are listed where the call is', () => {
  const split = {
    'src/App.jsx': `
      import { useEffect, useState } from 'react';
      import { useSecond } from './app/useSecond.js';
      export default function App() {
        const [a, setA] = useState(0);
        useEffect(() => { first(a); }, [a]);
        useSecond({ a });
        useEffect(() => { third(setA); }, []);
        return null;
      }`,
    'src/app/useSecond.js': `
      import { useEffect } from 'react';
      // A comment, and different indentation: the same code.
      export function useSecond({ a }) {
          useEffect(() => { second(a); }, [a]);
      }`,
  };
  const after = ledgerOf(split);
  assert.deepEqual(effects(after).map((entry) => entry.file), ['src/App.jsx', 'src/app/useSecond.js', 'src/App.jsx']);
  assert.deepEqual(effects(after)[1].via, ['useSecond']);
  const { effects: compared, hooks } = compareLedgers(ledgerOf(INLINE), after);
  assert.equal(compared.same, true);
  assert.equal(hooks.same, true);
});

test('an effect gathered into a hook above its old place is reported with the effects it crossed', () => {
  const gathered = {
    'src/App.jsx': `
      import { useEffect, useState } from 'react';
      import { useThird } from './app/useThird.js';
      export default function App() {
        const [a, setA] = useState(0);
        useThird({ setA });
        useEffect(() => { first(a); }, [a]);
        useEffect(() => { second(a); }, [a]);
        return null;
      }`,
    'src/app/useThird.js': `
      import { useEffect } from 'react';
      export const useThird = ({ setA }) => { useEffect(() => { third(setA); }, []); };`,
  };
  const { effects: compared } = compareLedgers(ledgerOf(INLINE), ledgerOf(gathered));
  assert.equal(compared.same, false);
  assert.equal(compared.moved.length, 1);
  assert.equal(compared.moved[0].after.file, 'src/app/useThird.js');
  assert.equal(compared.moved[0].crossed.length, 2, 'it now runs before the two effects it used to follow');
  assert.deepEqual([compared.added.length, compared.removed.length], [0, 0]);
});

test('an effect whose code or dependencies changed is not called a move', () => {
  const edited = { 'src/App.jsx': INLINE['src/App.jsx'].replace('second(a); }, [a]', 'second(a); }, []') };
  const { effects: compared } = compareLedgers(ledgerOf(INLINE), ledgerOf(edited));
  assert.equal(compared.same, false);
  assert.deepEqual([compared.moved.length, compared.added.length, compared.removed.length], [0, 1, 1]);
});

test('whitespace inside a string, a template or a regular expression is a change', () => {
  const withEffect = (body) => ({ 'src/App.jsx': `
    import { useEffect } from 'react';
    export default function App() { useEffect(() => { ${body} }, []); return null; }` });
  const same = (left, right) => compareLedgers(ledgerOf(withEffect(left)), ledgerOf(withEffect(right))).effects.same;
  assert.equal(same("document.title = 'Exit Ticket';", "document.title   =\n 'Exit Ticket'; // said aloud\n"), true, 'spacing and comments between tokens are not');
  assert.equal(same("document.title = 'Exit Ticket';", "document.title = 'ExitTicket';"), false);
  assert.equal(same('say(`Exit ${kind} ticket`);', 'say(`Exit ${kind}ticket`);'), false);
  assert.equal(same('if (/a b/.test(text)) go();', 'if (/ab/.test(text)) go();'), false);
});

test('a dynamic import is compared as the file it names, so re-aiming its path is not a change', () => {
  const before = { 'src/App.jsx': `
    import { useEffect } from 'react';
    export default function App() { useEffect(() => { import('./platform/engine.js'); }, []); return null; }` };
  const after = {
    'src/App.jsx': `
      import { useEngine } from './app/student/useEngine.js';
      export default function App() { useEngine(); return null; }`,
    'src/app/student/useEngine.js': `
      import { useEffect } from 'react';
      export function useEngine() { useEffect(() => { import('../../platform/engine.js'); }, []); }`,
  };
  assert.equal(compareLedgers(ledgerOf(before), ledgerOf(after)).effects.same, true);
  after['src/app/student/useEngine.js'] = after['src/app/student/useEngine.js'].replace('../../platform/engine.js', '../platform/engine.js');
  assert.equal(compareLedgers(ledgerOf(before), ledgerOf(after)).effects.same, false, 'a path that names another file is a change');
});

test('the real App: every hook under src/app is read through, none left opaque', () => {
  const read = (path) => { const url = new URL(`../../${path}`, import.meta.url); return existsSync(url) ? readFileSync(url, 'utf8') : null; };
  const entries = createHookLedger(read).ledger('src/App.jsx', 'App');
  assert.ok(effects(entries).length > 100, 'App runs over a hundred effects');
  const inAppModules = entries.filter((entry) => entry.file.startsWith('src/app/'));
  assert.ok(inAppModules.length > 0, 'App calls hooks declared under src/app');
  const app = read('src/App.jsx');
  const calledFromApp = [...app.matchAll(/^import \{([^}]*)\} from '\.\/app\/[^']+';$/gm)]
    .flatMap((match) => match[1].split(',').map((name) => name.trim())).filter((name) => /^use[A-Z]/.test(name));
  assert.ok(calledFromApp.length > 0);
  for (const name of calledFromApp) {
    assert.ok(!entries.some((entry) => entry.opaque && entry.hook === name), `${name} was not read through: its effects are missing from the ledger`);
  }
});

const COMPONENT = `import { useEffect, useRef, useState } from 'react';
import { helper, unusedAfter } from './platform/helper.js';
import Other from './Other.jsx';

const LOCAL = 1;

function App() {
  const [user] = useState(null);
  const [count, setCount] = useState(0);
  // The tick.
  const tickRef = useRef(0);
  const double = count * 2;
  useEffect(() => {
    tickRef.current += 1;
    unusedAfter(helper(user), setCount);
    import('./platform/lazy.js');
  }, [user]);
  const late = useRef(null);
  const handler = () => late.current;
  return <Other value={double} onClick={handler} tick={tickRef} />;
}

export default App;
`;
const plan = (spec, source = COMPONENT) => planExtraction({ source: 'src/App.jsx', component: 'App', hook: 'useTick', file: 'src/app/student/useTick.js', ...spec }, () => source);

test('the codemod passes what the statements read, returns what the rest reads, and moves the text unchanged', () => {
  const result = plan({ statements: ['tickRef', '~unusedAfter('] });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.inputList, ['user', 'setCount']);
  assert.deepEqual(result.outputList, ['tickRef']);
  assert.match(result.moduleText, /^import \{ useEffect, useRef \} from 'react';\nimport \{ helper, unusedAfter \} from '\.\.\/\.\.\/platform\/helper\.js';\n\nexport function useTick\(\{ user, setCount \}\) \{\n {2}\/\/ The tick\.\n {2}const tickRef = useRef\(0\);\n/);
  assert.match(result.moduleText, /import\('\.\.\/\.\.\/platform\/lazy\.js'\)/, "a dynamic import's path is re-aimed");
  assert.match(result.moduleText, /\n {2}return \{ tickRef \};\n\}\n$/);
  assert.match(result.rewritten, /const \[count, setCount\] = useState\(0\);\n {2}const \{ tickRef \} = useTick\(\{ user, setCount \}\);\n {2}const double = count \* 2;\n {2}const late/);
  const settled = settleImports('src/App.jsx', result.rewritten, result.hookImport);
  assert.deepEqual(settled.removed.sort(), ['helper', 'unusedAfter', 'useEffect']);
  assert.match(settled.text, /^import \{ useRef, useState \} from 'react';\nimport Other from '\.\/Other\.jsx';\nimport \{ useTick \} from '\.\/app\/student\/useTick\.js';\n/);
});

test('the codemod refuses a move that could not behave the same', () => {
  // The hook would be called above the declaration of something it is passed.
  assert.match(plan({ statements: ['tickRef', 'handler'], callAt: 'tickRef' }).problems.join('\n'), /input late .* is declared after the call site/);
  // The rest of the render reads the hook's result above where the hook would be called.
  assert.match(plan({ statements: ['count', '~unusedAfter('], callAt: '~unusedAfter(' }).problems.join('\n'), /reads output count during render, above the call site/);
  // A handler reading it later is fine: by then the hook has run.
  assert.deepEqual(plan({ statements: ['late'] }).problems, []);
  const assigning = COMPONENT.replace('const double = count * 2;', 'let double = 0;\n  const bump = () => { double = count; };');
  assert.match(plan({ statements: ['bump'] }, assigning).problems.join('\n'), /assigns to double/);
  const local = COMPONENT.replace('tickRef.current += 1;', 'tickRef.current += LOCAL;');
  assert.match(plan({ statements: ['~unusedAfter('] }, local).problems.join('\n'), /uses LOCAL, declared at the top of src\/App\.jsx/);
});

test('the codemod can leave handlers to an object that may not be there yet, by position, and refuses a hook among them', () => {
  const from = { object: 'kit', fallback: 'NO_CONTROLS', positional: true };
  const source = COMPONENT.replace('const handler = () => late.current;', 'const handler = () => late.current;\n  const other = () => helper(count, setCount);');
  const result = plan({ hook: 'createTickControls', file: 'src/app/teacher/controls/tickControls.js', from, statements: ['handler', 'other'] }, source.replace('onClick={handler}', 'onClick={handler} onOther={other}'));
  assert.deepEqual(result.problems, []);
  assert.equal(result.hookImport, null, 'the source does not import it: the object hands it out');
  assert.match(result.moduleText, /export function createTickControls\(count, setCount, late\) \{\n {2}const handler = \(\) => late\.current;\n {2}const other = \(\) => helper\(count, setCount\);\n {2}return \[handler, other\];\n\}\n$/);
  assert.match(result.rewritten, /\n {2}const \[handler, other\] = kit \? kit\.createTickControls\(count, setCount, late\) : NO_CONTROLS;\n/);
  assert.match(plan({ hook: 'createTickControls', file: 'src/app/teacher/controls/tickControls.js', from, statements: ['late', 'handler'] }).problems.join('\n'), /calls a hook, and createTickControls would be called only when kit is there/);
});

test('the codemod can seam a hook by position, which leaves no names in the bundle', () => {
  const result = plan({ positional: true, statements: ['tickRef', '~unusedAfter('] });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.hookImport, { name: 'useTick', from: './app/student/useTick.js' }, 'a hook is still imported and called on every render');
  assert.match(result.moduleText, /\nexport function useTick\(user, setCount\) \{\n {2}\/\/ The tick\.\n {2}const tickRef = useRef\(0\);\n/);
  assert.match(result.moduleText, /\n {2}return \[tickRef\];\n\}\n$/);
  assert.match(result.rewritten, /\n {2}const \[tickRef\] = useTick\(user, setCount\);\n {2}const double = count \* 2;\n/);
});

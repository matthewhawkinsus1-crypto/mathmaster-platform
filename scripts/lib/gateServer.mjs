/*
 * ONE DEV SERVER FOR THE BROWSER GATES — STARTED WARM, HELD STILL.
 *
 *   import { GATES, startGateServer } from './lib/gateServer.mjs';
 *   const gate = await startGateServer(GATES['draft-persistence'], { port: 5203 });
 *   // drive a browser at gate.origin
 *   await gate.close();
 *
 *   npm run gates:serve -- draft-persistence --port 5203   # the same server, by hand
 *
 * A gate used to start `vite` with its harness config and call the server ready
 * as soon as `/` answered. That is the moment it LISTENS, not the moment it can
 * serve the harness, so every cold-start cost landed inside the browser's first
 * page timeout — which is how the draft certification came to need 180 s for
 * one `page.goto`, and why the durable-outbox certification failed outright
 * from a cold cache. Most of that cost was the harness config's own swap
 * plugins (tests/browser/emulator/swapModules.mjs); what is left is handled
 * here (docs/qa/platform-quirks-audit.md, PQ-033):
 *
 *   server.hmr: false   A gate tests one build of src/. Editing a file while a
 *                       long gate runs must not hot-reload the harness
 *                       mid-scene (seen once as `revealWorkViewTarget is not
 *                       defined`).
 *   cacheDir            node_modules/.vite-gates/<gate>. Dev servers sharing
 *                       node_modules/.vite can re-bundle each other's
 *                       dependencies under a running page. A checkout whose
 *                       node_modules is shared with other checkouts (git
 *                       worktrees) gets a cache of its own.
 *   optimizeDeps        `entries` is the gate's own harness pages — Vite's
 *                       default is every .html under the root, 37 of them —
 *                       and `include` the packages the harness really imports.
 *   MathLive's fonts    served where pre-bundled MathLive looks for them.
 *   readiness           the harness page and its entry modules answer 200, and
 *                       everything they import, statically or by a literal
 *                       dynamic import, has been fetched once — so compile time
 *                       is spent here, under a server budget, and a page
 *                       timeout only ever measures the page.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Generous on purpose: a warm-up measured in seconds should never meet it. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 300_000;

/*
 * THE GATES THIS LAUNCHER KNOWS.
 *
 * `include` is what a cold dependency scan of the harness finds, checked by
 * tests/platform/gateServer.test.mjs against package.json. The React JSX
 * runtimes come from @vitejs/plugin-react itself. jsxgraph and html2canvas are
 * not reachable from either harness, so they are not pre-bundled for them.
 */
export const GATES = Object.freeze({
  'draft-persistence': Object.freeze({
    name: 'draft-persistence',
    configFile: 'tests/browser/emulator/vite.config.mjs',
    harness: Object.freeze(['tests/browser/draftPersistence.html']),
    include: Object.freeze([
      'react', 'react-dom', 'react-dom/client',
      'mathlive', 'mathjs',
      'firebase/app', 'firebase/firestore', 'firebase/functions',
    ]),
  }),
  'durable-outbox': Object.freeze({
    name: 'durable-outbox',
    configFile: 'tests/browser/emulator/vite.config.mjs',
    harness: Object.freeze(['tests/browser/durableOutboxHarness.html']),
    // The outbox, device-identity and disposition modules import no packages.
    include: Object.freeze([]),
  }),
});

/* ------------------------------------------------------------- the cache */

const realpathOr = (target) => {
  try { return realpathSync(target); } catch { return path.resolve(target); }
};

/**
 * Where a gate keeps its pre-bundled dependencies. One directory per gate, and
 * per checkout when node_modules lives outside the checkout — several git
 * worktrees symlinked to one node_modules would otherwise share it.
 */
export const gateCacheDir = (name, { root = REPO_ROOT } = {}) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name))) {
    throw new Error(`A gate name must be kebab-case, got ${JSON.stringify(name)}.`);
  }
  const modules = path.join(root, 'node_modules');
  const shared = path.relative(realpathOr(root), realpathOr(modules)).startsWith('..');
  const key = shared
    ? `${name}-${createHash('sha1').update(realpathOr(root)).digest('hex').slice(0, 8)}`
    : name;
  return path.join(modules, '.vite-gates', key);
};

/** The URL path the server serves a cache directory's pre-bundled deps from. */
export const depsUrlPrefix = ({ root, cacheDir }) => {
  const deps = path.join(cacheDir, 'deps');
  const relative = path.relative(root, deps);
  const posix = (relative.startsWith('..') || path.isAbsolute(relative)
    ? `/@fs/${deps.replace(/^\/+/, '')}`
    : `/${relative}`).split(path.sep).join('/');
  return `${posix}/`;
};

/* -------------------------------------------------------- MathLive assets */

const MATHLIVE_ASSET_TYPES = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

/**
 * MathLive looks for its fonts and keypress sounds NEXT TO ITS OWN SCRIPT.
 * Pre-bundled, that script is <cacheDir>/deps/mathlive.js, so it asks for
 * <cacheDir>/deps/fonts/KaTeX_Main-Regular.woff2: a file that does not exist,
 * which Vite's SPA fallback answers with index.html and a 200. The font fails
 * to decode, MathLive marks the page `ML__fonts-did-not-load`, and every math
 * field in the harness typesets in a fallback serif — the reason four
 * harnesses set `MathfieldElement.fontsDirectory` by hand.
 *
 * Returns the asset's path inside the mathlive package ("fonts/<file>") for a
 * request it should answer, else null.
 */
export const mathliveAssetPath = (url, depsPrefix) => {
  let pathname;
  try { pathname = decodeURIComponent(String(url || '').split(/[?#]/)[0]); } catch { return null; }
  if (!pathname.startsWith(depsPrefix)) return null;
  const match = /^(fonts|sounds)\/([A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.exec(pathname.slice(depsPrefix.length));
  return match ? `${match[1]}/${match[2]}` : null;
};

const mathlivePackageDir = (root) => {
  try {
    return path.dirname(createRequire(path.join(root, 'package.json')).resolve('mathlive'));
  } catch {
    return path.join(root, 'node_modules', 'mathlive');
  }
};

/** Serves MathLive's own fonts/ and sounds/ at the URL pre-bundled MathLive asks for. */
export const mathliveAssetsPlugin = () => ({
  name: 'mm-gate:mathlive-assets',
  apply: 'serve',
  configureServer(server) {
    const prefix = depsUrlPrefix(server.config);
    const packageDir = mathlivePackageDir(server.config.root);
    server.middlewares.use((request, response, next) => {
      const asset = mathliveAssetPath(request.url, prefix);
      if (!asset) return next();
      const file = path.join(packageDir, asset);
      if (!existsSync(file) || !statSync(file).isFile()) {
        // A real 404. Falling through would answer with index.html again.
        response.statusCode = 404;
        response.end(`MathLive has no ${asset}`);
        return undefined;
      }
      response.setHeader('Content-Type', MATHLIVE_ASSET_TYPES[path.extname(file)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'max-age=31536000,immutable');
      createReadStream(file).pipe(response);
      return undefined;
    });
  },
});

/* ---------------------------------------------------------------- config */

/**
 * The inline config a gate server runs with, layered over the harness config
 * file. `appType: 'mpa'` because a harness page is a file: a URL that names no
 * file must 404, never quietly become index.html with a 200 — which is how a
 * missing harness page, or MathLive's font folder, used to look served.
 */
export const gateServerConfig = (gate, { host = '127.0.0.1', port, root = REPO_ROOT, customLogger } = {}) => ({
  configFile: path.resolve(root, gate.configFile),
  cacheDir: gateCacheDir(gate.name, { root }),
  appType: 'mpa',
  clearScreen: false,
  ...(customLogger ? { customLogger } : {}),
  server: { host, port, strictPort: true, hmr: false },
  optimizeDeps: { entries: [...gate.harness], include: [...gate.include] },
  plugins: [mathliveAssetsPlugin()],
});

/* ------------------------------------------------------------- readiness */

const IMPORT_SOURCE_TYPES = new Set(['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration']);

/**
 * The module specifiers a piece of served JavaScript imports: static imports
 * and re-exports, plus dynamic `import("literal")` when `deep` (a lazily
 * loaded tool is still something the gate will open). Template-literal
 * imports are skipped; Vite rewrites the ones it can into literal maps.
 */
export const importSpecifiers = (parseAst, code, { deep = true } = {}) => {
  const found = new Set();
  const program = parseAst(code);
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (IMPORT_SOURCE_TYPES.has(node.type) && typeof node.source?.value === 'string') found.add(node.source.value);
    if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') found.add(node.source.value);
    if (!deep) return;
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (value && typeof value === 'object') visit(value);
    }
  };
  if (deep) visit(program);
  else program.body.forEach(visit);
  return [...found];
};

/** The module scripts an HTML page starts: `src` attributes and inline imports. */
export const moduleScriptUrls = (parseAst, html) => {
  const urls = new Set();
  for (const [, attributes, body] of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\btype\s*=\s*["']?module\b/i.test(attributes)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (src) {
      urls.add(src);
      continue;
    }
    try {
      importSpecifiers(parseAst, body).forEach((specifier) => urls.add(specifier));
    } catch { /* not JavaScript the page could run either */ }
  }
  return [...urls];
};

const sameOriginPath = (specifier, fromUrl, origin) => {
  let url;
  try { url = new URL(specifier, fromUrl); } catch { return null; }
  return url.origin === origin ? `${url.pathname}${url.search}` : null;
};

const firstLine = (text) => String(text || '').trim().split('\n')[0].slice(0, 240);

const OPTIMIZER_EVENT = /dependenc(?:y|ies) optimized|optimized dependencies changed/i;
// eslint-disable-next-line no-control-regex
const stripAnsi = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Start a gate's server and return once it is warm.
 *
 * Resolves to { origin, cacheDir, readiness, summary, logTail(), lateRebundles(), close() }.
 * Rejects — with the server closed and its log attached — when the harness
 * page or one of its entry modules does not answer 200 within the budget.
 */
export const startGateServer = async (gate, {
  host = '127.0.0.1',
  port,
  root = REPO_ROOT,
  startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
  concurrency = 6,
} = {}) => {
  if (!Number.isInteger(port) || port <= 0) throw new Error(`${gate.name}: a gate server needs an explicit port, got ${port}.`);
  const missing = gate.harness.filter((page) => !existsSync(path.resolve(root, page)));
  if (missing.length) throw new Error(`${gate.name}: no harness page at ${missing.join(', ')}.`);
  const { createLogger, createServer, parseAst } = await import('vite');

  const started = Date.now();
  const deadline = started + startupTimeoutMs;
  const log = [];
  const optimizerEvents = [];
  let phase = 'warm-up';
  const loggedErrors = new WeakSet();
  const logger = createLogger('info', { allowClearScreen: false });
  const record = (level) => (message, options) => {
    const line = stripAnsi(message);
    log.push({ level, line });
    if (log.length > 400) log.shift();
    if (options?.error) loggedErrors.add(options.error);
    if (OPTIMIZER_EVENT.test(line)) optimizerEvents.push({ phase, line, atMs: Date.now() - started });
  };
  const warned = new Set();
  Object.assign(logger, {
    info: record('info'),
    warn: record('warn'),
    warnOnce: (message, options) => { if (!warned.has(message)) { warned.add(message); record('warn')(message, options); } },
    error: record('error'),
    clearScreen: () => {},
    hasErrorLogged: (error) => loggedErrors.has(error),
  });

  const server = await createServer(gateServerConfig(gate, { host, port, root, customLogger: logger }));
  const origin = `http://${host}:${port}`;
  const logTail = (count = 40) => log.slice(-count).map(({ level, line }) => `  [${level}] ${line}`).join('\n');
  const notWarm = (url) => new Error(`${gate.name}: the gate server was not warm within ${startupTimeoutMs} ms (waiting on ${url}).`);

  const get = async (url, accept = '*/*') => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw notWarm(url);
    try {
      const response = await fetch(`${origin}${url}`, { headers: { accept }, signal: AbortSignal.timeout(remaining) });
      return { status: response.status, type: response.headers.get('content-type') || '', text: await response.text() };
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw notWarm(url);
      throw error;
    }
  };

  /*
   * Everything the entries import. A dependency the scanner missed is found
   * here, and if bundling it reloads the module graph that happens now, with
   * no page open — so the graph is walked again until a pass ends without one.
   */
  const crawl = async (entries, depsPrefix) => {
    const seen = new Set(entries);
    const queue = [...entries];
    const problems = [];
    let modules = 0;
    let deps = 0;
    const visit = async (url) => {
      const answer = await get(url);
      if (answer.status !== 200) {
        problems.push(`${answer.status} ${url}: ${firstLine(answer.text)}`);
        return [];
      }
      const isDep = url.startsWith(depsPrefix);
      if (isDep) deps += 1; else modules += 1;
      if (!/javascript/.test(answer.type)) return [];
      let specifiers;
      try { specifiers = importSpecifiers(parseAst, answer.text, { deep: !isDep }); } catch { return []; }
      return specifiers.map((specifier) => sameOriginPath(specifier, `${origin}${url}`, origin)).filter(Boolean);
    };
    await new Promise((resolve, reject) => {
      let active = 0;
      let failed = false;
      const pump = () => {
        if (failed) return;
        if (!queue.length && !active) { resolve(); return; }
        while (active < concurrency && queue.length) {
          const url = queue.shift();
          active += 1;
          visit(url)
            .then((found) => found.forEach((next) => { if (!seen.has(next)) { seen.add(next); queue.push(next); } }))
            .then(() => { active -= 1; pump(); }, (error) => { failed = true; reject(error); });
        }
      };
      pump();
    });
    return { modules, deps, problems };
  };

  const warmUp = async () => {
    try {
      await server.listen();
    } catch (error) {
      throw new Error(`${gate.name}: the gate server could not listen on ${origin}: ${error.message}`);
    }
    const listenMs = Date.now() - started;

    /* The harness pages and their entry modules: these must answer 200. */
    const entries = new Set();
    for (const page of gate.harness) {
      const url = `/${page.replace(/^\/+/, '')}`;
      const answer = await get(url, 'text/html');
      if (answer.status !== 200 || !/text\/html/.test(answer.type)) {
        throw new Error(`${gate.name}: ${url} answered ${answer.status} ${answer.type}, not the harness page.`);
      }
      moduleScriptUrls(parseAst, answer.text)
        .map((specifier) => sameOriginPath(specifier, `${origin}${url}`, origin))
        .filter(Boolean)
        .forEach((entry) => entries.add(entry));
    }
    if (!entries.size) throw new Error(`${gate.name}: the harness page starts no module script.`);
    for (const entry of entries) {
      const answer = await get(entry);
      if (answer.status !== 200) {
        throw new Error(`${gate.name}: the harness entry ${entry} answered ${answer.status}: ${firstLine(answer.text)}`);
      }
    }

    const depsPrefix = depsUrlPrefix(server.config);
    let passes = 0;
    let pass;
    for (;;) {
      const eventsBefore = optimizerEvents.length;
      pass = await crawl(entries, depsPrefix);
      passes += 1;
      const reloaded = optimizerEvents.slice(eventsBefore).some(({ line }) => /changed/i.test(line));
      if (!reloaded || passes >= 3) break;
    }
    return { listenMs, entries: [...entries], passes, ...pass };
  };

  let warm;
  try {
    warm = await warmUp();
  } catch (error) {
    await server.close().catch(() => {});
    const failure = new Error(`${error.message}\n  server log (last lines):\n${logTail() || '  (empty)'}`);
    failure.gateLog = log;
    throw failure;
  }
  phase = 'run';

  const readiness = {
    ...warm,
    warmMs: Date.now() - started,
    optimizerEvents: optimizerEvents.map(({ line }) => line),
  };
  const { passes } = readiness;
  const relativeCache = path.relative(root, server.config.cacheDir);
  const summary = `[gate:${gate.name}] warm in ${(readiness.warmMs / 1000).toFixed(1)} s at ${origin} — `
    + `${readiness.modules} modules, ${readiness.deps} pre-bundled files, cache ${relativeCache}`
    + (passes > 1 ? `, ${passes} passes (the optimizer re-bundled during warm-up)` : '')
    + (readiness.problems.length ? `\n[gate:${gate.name}] ${readiness.problems.length} imported module(s) did not answer 200:\n  ${readiness.problems.slice(0, 10).join('\n  ')}` : '');

  return {
    origin,
    cacheDir: server.config.cacheDir,
    server,
    readiness,
    summary,
    logTail,
    /*
     * The optimizer re-bundling AFTER the server was declared warm means a
     * page was reloaded under the gate. The runner says so, by name, with
     * the dependency to add to this gate's `include`.
     */
    lateRebundles: () => optimizerEvents.filter((event) => event.phase === 'run').map(({ line }) => line),
    close: () => server.close(),
  };
};

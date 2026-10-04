#!/usr/bin/env node
/*
 * DARK MODE 2.0 MIGRATION: hard-coded light-palette colors -> semantic tokens.
 *
 *   TYPESCRIPT_MODULE=<path to typescript> node scripts/codemods/tokenize-theme-colors.mjs [--write] [--report]
 *
 * One-shot and re-runnable (it is idempotent: a var(--mm-*) is not a literal).
 * Kept so the migration can be audited and repeated on a branch that predates
 * it. It needs the TypeScript compiler only as a JSX parser; CI does not run it
 * (scripts/audit-theme-colors.mjs, which uses the same classifier, guards new
 * code instead).
 *
 * WHAT IT CHANGES
 *   In .js/.jsx: a string or template piece holding a hex color, when it is the
 *   value of a style property (background, color, border*, outline*) in a
 *   style-like object literal, or of a tone-map key (bg, fg, text, chip). The
 *   role comes from the key; the token from scripts/lib/themeColorRoles.mjs.
 *   In .css: the same roles by property name, outside dark/print blocks.
 *
 * WHAT IT NEVER TOUCHES
 *   - SVG presentation attributes (fill=, stroke=) and fill/stroke keys:
 *     var() is not reliable there, and graphs have their own --mm-graph-*.
 *   - A `color` key in an object that is not style-like ({ label, color } chart
 *     series feed canvas/SVG, where var() does not resolve).
 *   - Canvas, PDF and print-document generators (EXCLUDED_FILES).
 *   - Saturated fills, white text, deliberately dark banners (the classifier
 *     returns null for them).
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyThemeColor, roleForProperty } from '../../src/theme/themeColorRoles.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WRITE = process.argv.includes('--write');
const REPORT = process.argv.includes('--report');

// Draw to canvas, build PDFs/print documents, or own a separate token system.
export const EXCLUDED_FILES = new Set([
  'src/platform/preflight/teacherReviewScreenshotCapture.js',
  'src/platform/preflight/worksheetPrintPreflight.js',
  'src/LoginScreen.css', // its own .mm-login tokens, themed in that file
  'src/components/rewards/rewards.css', // its own --rw-* tokens, themed in that file
  'src/theme/tokens.css',
]);

const CSS_KEYS = new Set([
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'fontSize', 'fontWeight', 'lineHeight', 'borderRadius', 'display', 'background', 'backgroundColor', 'border', 'borderColor', 'borderTop',
  'borderBottom', 'borderLeft', 'borderRight', 'boxShadow', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'gap',
  'textAlign', 'cursor', 'alignItems', 'justifyContent', 'flex', 'flexWrap', 'flexDirection', 'position', 'opacity', 'outline',
  'whiteSpace', 'overflow', 'textTransform', 'letterSpacing', 'gridTemplateColumns', 'bg', 'fg', 'chip',
]);
const TONE_KEYS = new Set(['bg', 'fg', 'text', 'chip', 'border', 'borderColor', 'background', 'surface']);

const loadTs = () => {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.TYPESCRIPT_MODULE, 'typescript', '/opt/node22/lib/node_modules/typescript'].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* next */ }
  }
  throw new Error('This codemod needs the TypeScript compiler as a JSX parser. Set TYPESCRIPT_MODULE.');
};

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;

const propertyName = (ts, node, sf) => {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return null;
  return node.getText(sf);
};

const styleLikeObject = (ts, object, sf) => {
  let parent = object.parent;
  while (parent && (ts.isParenthesizedExpression(parent) || ts.isConditionalExpression(parent) || ts.isBinaryExpression(parent))) parent = parent.parent;
  if (parent && ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) && parent.parent.name.getText(sf) === 'style') return true;
  return object.properties.some((prop) => {
    if (!prop.name) return false;
    const name = propertyName(ts, prop.name, sf);
    return name && name !== 'color' && CSS_KEYS.has(name);
  });
};

/** The style property a literal is the value of, through ternaries and template spans. */
const owningProperty = (ts, literal) => {
  let node = literal.parent;
  while (node) {
    if (ts.isPropertyAssignment(node)) return node;
    if (ts.isJsxAttribute(node) || ts.isFunctionLike(node) || ts.isBlock(node) || ts.isCallExpression(node)
      || ts.isVariableDeclaration(node) || ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) return null;
    node = node.parent;
  }
  return null;
};

/*
 * ROLES FROM USAGE. A literal that is not itself the value of a style key gets
 * a role from where it ends up:
 *   - a helper's parameter (`const pill = (bg, fg) => ({ background: bg, color: fg })`)
 *     takes the role of the style key it feeds, so `pill('#fce8e6', '#a50e0e')`
 *     maps its arguments;
 *   - a constant (`const tone = x ? '#a50e0e' : '#137333'`, or a palette map
 *     `const STRENGTH = { hard: '#a50e0e' }`) takes the role of every place it
 *     is read — and is skipped entirely if ANY read is unsafe for var(): an SVG
 *     attribute, a canvas/DOM property, a hex+alpha concatenation (`${c}22`), or
 *     an argument to anything that is not a known style helper.
 * When a value feeds several roles, text wins (its contrast rule is strictest).
 */
const ROLE_PRIORITY = { text: 3, border: 2, background: 1 };
const strongest = (roles) => [...roles].sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a])[0] || null;

const unwrapUse = (ts, node) => {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return { site: null, node: current };
    if (ts.isParenthesizedExpression(parent) || ts.isConditionalExpression(parent) && parent.condition !== current
      || ts.isBinaryExpression(parent) && ['||', '??'].includes(parent.operatorToken.getText())
      || ts.isElementAccessExpression(parent) && parent.expression === current
      || ts.isPropertyAccessExpression(parent) && parent.expression === current && !/^(fillStyle|strokeStyle|style|setAttribute)$/.test(parent.name.text)) {
      current = parent;
      continue;
    }
    return { site: parent, node: current };
  }
};

const collectUsageRoles = (ts, sf) => {
  // A key only carries a CSS role inside an object that is a style (or a
  // bg/fg tone record). `{ id, label, color }` is data — strand colors feed
  // SVG wheel fills — and must not be read as text color.
  const styleRole = (key, object) => {
    const role = roleForProperty(key);
    if (!role || !object || !ts.isObjectLiteralExpression(object)) return null;
    return TONE_KEYS.has(key) || styleLikeObject(ts, object, sf) ? role : null;
  };
  const helpers = new Map(); // name -> [role|null per parameter]
  const constants = new Map(); // name -> declaration initializer
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) helpers.set(node.name.text, init);
      else constants.set(node.name.text, init);
    }
    if (ts.isFunctionDeclaration(node) && node.name) helpers.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const references = new Map();
  const collectRefs = (node) => {
    if (ts.isIdentifier(node) && !(ts.isVariableDeclaration(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !ts.isParameter(node.parent)) {
      if (!references.has(node.text)) references.set(node.text, []);
      references.get(node.text).push(node);
    }
    ts.forEachChild(node, collectRefs);
  };
  collectRefs(sf);

  // Helper parameter roles.
  const helperRoles = new Map();
  for (const [name, fn] of helpers) {
    const params = fn.parameters.map((param) => (ts.isIdentifier(param.name) ? param.name.text : null));
    const roles = params.map(() => new Set());
    const unsafe = params.map(() => false);
    const scan = (node) => {
      if (ts.isIdentifier(node) && params.includes(node.text) && !ts.isParameter(node.parent)) {
        const index = params.indexOf(node.text);
        if (ts.isShorthandPropertyAssignment(node.parent)) {
          const role = styleRole(node.text, node.parent.parent);
          if (role) roles[index].add(role); else unsafe[index] = true;
        } else {
          const { site, node: used } = unwrapUse(ts, node);
          if (site && ts.isPropertyAssignment(site) && site.initializer === used) {
            const role = styleRole(site.name.getText(sf), site.parent);
            if (role) roles[index].add(role); else unsafe[index] = true;
          } else if (site && ts.isTemplateSpan(site)) {
            const tail = site.literal.text;
            let owner = site.parent;
            while (owner && !ts.isPropertyAssignment(owner)) owner = owner.parent;
            const role = owner ? roleForProperty(owner.name.getText(sf)) : null;
            if (role && !/^[0-9a-fA-F]/.test(tail)) roles[index].add(role); else unsafe[index] = true;
          } else unsafe[index] = true;
        }
      }
      ts.forEachChild(node, scan);
    };
    scan(fn.body);
    helperRoles.set(name, roles.map((set, index) => (unsafe[index] || (set.has('text') && set.has('background')) ? null : strongest(set))));
  }

  // Constant roles, from every read.
  const constantRoles = new Map();
  for (const [name] of constants) {
    const reads = references.get(name) || [];
    const roles = new Set();
    let unsafe = reads.length === 0;
    for (const ref of reads) {
      const { site, node: used } = unwrapUse(ts, ref);
      if (site && ts.isPropertyAssignment(site) && site.initializer === used) {
        const role = styleRole(site.name.getText(sf), site.parent);
        if (role) roles.add(role); else unsafe = true;
      } else if (site && ts.isShorthandPropertyAssignment(site)) {
        const role = styleRole(site.name.text, site.parent);
        if (role) roles.add(role); else unsafe = true;
      } else if (site && ts.isTemplateSpan(site)) {
        let owner = site.parent;
        while (owner && !ts.isPropertyAssignment(owner)) owner = owner.parent;
        const role = owner ? roleForProperty(owner.name.getText(sf)) : null;
        if (role && !/^[0-9a-fA-F]/.test(site.literal.text)) roles.add(role); else unsafe = true;
      } else if (site && ts.isCallExpression(site) && ts.isIdentifier(site.expression) && helperRoles.has(site.expression.text)) {
        const role = helperRoles.get(site.expression.text)[site.arguments.indexOf(used)];
        if (role) roles.add(role); else unsafe = true;
      } else unsafe = true;
    }
    // Text AND fill: one value cannot be both a light dark-mode text color and
    // a fill behind white text. Leave it for a person.
    if (roles.has('text') && roles.has('background')) unsafe = true;
    if (!unsafe && roles.size) constantRoles.set(name, strongest(roles));
  }
  return { helperRoles, constantRoles, constants };
};

const transformScript = (ts, file, source) => {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
  const edits = [];
  const { helperRoles, constantRoles, constants } = collectUsageRoles(ts, sf);
  const usageRole = (literal) => {
    // An argument to a style helper.
    const { site, node: used } = unwrapUse(ts, literal);
    if (site && ts.isCallExpression(site) && ts.isIdentifier(site.expression) && helperRoles.has(site.expression.text)) {
      return helperRoles.get(site.expression.text)[site.arguments.indexOf(used)] || null;
    }
    // Part of a constant's initializer (the literal itself, a ternary branch,
    // or a value in a flat palette map).
    for (let node = literal.parent; node; node = node.parent) {
      if (ts.isVariableDeclaration(node)) {
        if (!ts.isIdentifier(node.name) || constants.get(node.name.text) !== node.initializer) return null;
        return constantRoles.get(node.name.text) || null;
      }
      if (ts.isFunctionLike(node) || ts.isBlock(node) || ts.isCallExpression(node) || ts.isArrayLiteralExpression(node) || ts.isJsxAttribute(node)) return null;
      if (ts.isObjectLiteralExpression(node) && !ts.isVariableDeclaration(node.parent)) return null;
    }
    return null;
  };
  const visit = (node) => {
    const isText = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    if (isText) {
      const raw = source.slice(node.getStart(sf), node.end);
      const isWhite = ts.isStringLiteral(node) && /^white$/i.test(node.text);
      if (HEX.test(raw) || isWhite) {
        HEX.lastIndex = 0;
        const prop = owningProperty(ts, node);
        const name = prop && propertyName(ts, prop.name, sf);
        // `accent` in a tone record ({ bg, accent } / { chip, accent }) is the
        // record's text/eyebrow color; elsewhere it is a chart or game color.
        const toneAccent = name === 'accent' && prop.parent && ts.isObjectLiteralExpression(prop.parent)
          && prop.parent.properties.some((sibling) => sibling.name && ['bg', 'background', 'chip', 'surface', 'border'].includes(propertyName(ts, sibling.name, sf)));
        const role = name && (toneAccent ? 'text' : roleForProperty(name));
        const object = prop?.parent;
        const directRole = role && object && ts.isObjectLiteralExpression(object)
          && (TONE_KEYS.has(name) || toneAccent || styleLikeObject(ts, object, sf)) ? role : null;
        const effectiveRole = directRole || (!prop || (object && ts.isObjectLiteralExpression(object) && ts.isVariableDeclaration(object.parent)) ? usageRole(node) : null);
        if (effectiveRole) {
          const role = effectiveRole;
          const start = node.getStart(sf);
          if (isWhite) {
            const hit = classifyThemeColor('white', role);
            if (hit) edits.push({ start: start + 1, end: start + 1 + node.text.length, text: `var(${hit.token})`, from: 'white', role });
          } else {
            for (const match of raw.matchAll(HEX)) {
              const hit = classifyThemeColor(match[0], role);
              if (hit) edits.push({ start: start + match.index, end: start + match.index + match[0].length, text: `var(${hit.token})`, from: match[0].toLowerCase(), role });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edits;
};

// CSS: declarations outside @media print / prefers-color-scheme blocks and
// outside rules already scoped to a theme.
const transformCss = (source) => {
  const edits = [];
  const skipRanges = [];
  for (const match of source.matchAll(/@media[^{]*(print|prefers-color-scheme)[^{]*\{/g)) {
    let depth = 0;
    let index = match.index + match[0].length - 1;
    for (; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') { depth -= 1; if (depth === 0) break; }
    }
    skipRanges.push([match.index, index]);
  }
  const inSkip = (offset) => skipRanges.some(([a, b]) => offset >= a && offset <= b);
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  for (const rule of source.matchAll(ruleRe)) {
    const selector = rule[1];
    if (/data-theme|prefers-color-scheme/.test(selector)) continue;
    const bodyStart = rule.index + rule[0].indexOf('{') + 1;
    if (inSkip(bodyStart)) continue;
    for (const decl of rule[2].matchAll(/(^|;|\n)\s*([a-z-]+)\s*:\s*([^;]+)/g)) {
      const role = roleForProperty(decl[2]);
      if (!role || decl[2].startsWith('--')) continue;
      const valueOffset = bodyStart + decl.index + decl[0].length - decl[3].length;
      for (const hex of decl[3].matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\bwhite\b/g)) {
        const hit = classifyThemeColor(hex[0], role);
        if (hit) edits.push({ start: valueOffset + hex.index, end: valueOffset + hex.index + hex[0].length, text: `var(${hit.token})`, from: hex[0].toLowerCase(), role });
      }
    }
  }
  return edits;
};

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(jsx?|css)$/.test(entry.name)) files.push(file);
  }
};
walk(path.join(repo, 'src'));

const ts = loadTs();
const summary = {};
let total = 0;
for (const file of files) {
  const relative = path.relative(repo, file).replaceAll('\\', '/');
  // src/platform/resources/ builds PDFs and print documents, where var() never resolves.
  if (EXCLUDED_FILES.has(relative) || relative.startsWith('src/curriculum/') || relative.startsWith('src/platform/resources/')) continue;
  const source = readFileSync(file, 'utf8');
  const edits = file.endsWith('.css') ? transformCss(source) : transformScript(ts, file, source);
  if (!edits.length) continue;
  total += edits.length;
  summary[relative] = edits.length;
  if (REPORT) edits.forEach((edit) => console.log(`${relative}\t${edit.role}\t${edit.from}\t${edit.text}`));
  if (WRITE) {
    let next = source;
    [...edits].sort((a, b) => b.start - a.start).forEach((edit) => { next = next.slice(0, edit.start) + edit.text + next.slice(edit.end); });
    writeFileSync(file, next);
  }
}
if (!REPORT) {
  Object.entries(summary).sort((a, b) => b[1] - a[1]).forEach(([file, count]) => console.log(`${String(count).padStart(5)}  ${file}`));
}
console.log(`${WRITE ? 'Rewrote' : 'Would rewrite'} ${total} literal(s) in ${Object.keys(summary).length} file(s).`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findWorkViewRevealTarget,
  findWorkViewScroller,
  revealWorkViewTarget,
  workViewRevealDelta,
} from '../../src/platform/workView/workViewReveal.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// A tiny stand-in DOM: boxes are page coordinates, and scrolling a node moves
// every descendant's box up by the same amount.
const node = ({ box = null, style = {}, attrs = {}, scrollHeight = 0, clientHeight = 0 } = {}) => {
  const self = {
    attrs, style, children: [], parentElement: null, scrollTop: 0, scrollHeight, clientHeight,
    append(...kids) { kids.forEach((kid) => { kid.parentElement = self; self.children.push(kid); }); return self; },
    offset() {
      let shift = 0;
      for (let up = self.parentElement; up; up = up.parentElement) shift += up.scrollTop;
      return shift;
    },
    getBoundingClientRect() {
      if (!box) return { top: 0, bottom: 0, width: 0, height: 0 };
      const shift = self.offset();
      return { top: box.top - shift, bottom: box.bottom - shift, width: 300, height: box.bottom - box.top };
    },
    querySelectorAll(selector) {
      const [, name, value] = selector.match(/^\[([\w-]+)="([^"]+)"\]$/) || [];
      const found = [];
      const walk = (parent) => parent.children.forEach((kid) => {
        if (kid.attrs[name] === value) found.push(kid);
        walk(kid);
      });
      walk(self);
      return found;
    },
  };
  return self;
};
const styleOf = (element) => element.style;

// The measured phone scene: the surface is overflow hidden, the workflow body
// (304px, 1192px of content) is the scroller, and the plane is ~700px down.
const stagedPhoneScene = () => {
  const surface = node({ box: { top: 78, bottom: 557 }, style: { overflowY: 'hidden' }, scrollHeight: 477, clientHeight: 477 });
  const body = node({ box: { top: 181, bottom: 485 }, style: { overflowY: 'auto' }, scrollHeight: 1192, clientHeight: 304 });
  const hiddenStagePlane = node({ attrs: { 'data-work-view-reveal': 'true' } });
  const table = node({ box: { top: 181, bottom: 330 } });
  const plane = node({ box: { top: 340, bottom: 595 }, attrs: { 'data-work-view-reveal': 'true' } });
  surface.append(body);
  body.append(hiddenStagePlane, table, plane);
  return { surface, body, plane };
};

test('the staged phone Work View scrolls the workflow body, not the hidden-overflow surface', () => {
  const { surface, body, plane } = stagedPhoneScene();
  const found = findWorkViewRevealTarget(surface);
  assert.equal(found.target, plane, 'the hidden stage (empty box) is skipped');
  assert.equal(found.align, 'nearest');
  assert.equal(findWorkViewScroller(plane, surface, styleOf), body);

  const moved = revealWorkViewTarget(surface, styleOf);
  assert.ok(moved > 0);
  assert.equal(surface.scrollTop, 0, 'the overflow-hidden surface is never written');
  const planeBox = plane.getBoundingClientRect();
  const bodyBox = body.getBoundingClientRect();
  assert.ok(planeBox.top >= bodyBox.top && planeBox.bottom <= bodyBox.bottom, 'the whole plane is on screen');
  // Least scroll: the plane's bottom sits just inside the body, so what is above
  // it (the table the student plots from) keeps as much room as fits.
  assert.equal(Math.round(bodyBox.bottom - planeBox.bottom), 8);
});

test('a live-work region still wins and is aligned to the top', () => {
  const surface = node({ box: { top: 0, bottom: 600 }, style: { overflowY: 'auto' }, scrollHeight: 2000, clientHeight: 600 });
  const plane = node({ box: { top: 100, bottom: 300 }, attrs: { 'data-work-view-reveal': 'true' } });
  const board = node({ box: { top: 900, bottom: 1300 }, attrs: { 'data-work-view-focus': 'true' } });
  surface.append(plane, board);
  const found = findWorkViewRevealTarget(surface);
  assert.equal(found.target, board);
  assert.equal(found.align, 'start');
  revealWorkViewTarget(surface, styleOf);
  assert.equal(board.getBoundingClientRect().top, 8);
});

test('nothing moves when the target is already fully visible', () => {
  assert.equal(workViewRevealDelta({ targetBox: { top: 50, bottom: 200 }, scrollerBox: { top: 0, bottom: 600 } }), 0);
  const surface = node({ box: { top: 0, bottom: 600 }, style: { overflowY: 'auto' }, scrollHeight: 2000, clientHeight: 600 });
  surface.append(node({ box: { top: 50, bottom: 200 }, attrs: { 'data-work-view-reveal': 'true' } }));
  assert.equal(revealWorkViewTarget(surface, styleOf), 0);
  assert.equal(surface.scrollTop, 0);
});

test('a target taller than the scroller shows its top, not its bottom', () => {
  assert.equal(workViewRevealDelta({ targetBox: { top: 500, bottom: 1200 }, scrollerBox: { top: 100, bottom: 400 } }), 392);
  assert.equal(workViewRevealDelta({ targetBox: { top: 500, bottom: 1200 }, scrollerBox: { top: 100, bottom: 400 }, align: 'start' }), 392);
});

test('the Work View shell runs the reveal on open, and only the shell reads the reveal marker', () => {
  const shell = read('src/components/common/EnlargeableFigure.jsx');
  const effect = shell.slice(shell.indexOf('OPEN ON THE STUDENT\'S CURRENT WORK'), shell.indexOf('// Focus goes back where it came from'));
  assert.match(effect, /if \(!enlarged \|\| typeof window === 'undefined'\) return undefined;/);
  assert.match(effect, /revealWorkViewTarget\(hostRef\.current\?\.querySelector\?\.\('\.mathmaster-work-view-surface'\)\)/);
  assert.match(shell, /import \{ revealWorkViewTarget \} from '\.\.\/\.\.\/platform\/workView\/workViewReveal\.js';/);

  // App.jsx lands every opened question on data-work-view-focus. The plane
  // must not use that marker, or every embedded plotting question would open
  // scrolled past its prompt and data table.
  assert.doesNotMatch(read('src/App.jsx'), /data-work-view-reveal/);
  const workspace = read('src/InteractiveGraphWorkspace.jsx');
  assert.match(workspace, /<figure className="mathmaster-function-workspace-graph" data-work-view-reveal="true"/);
  assert.doesNotMatch(workspace, /data-work-view-focus/);
});

test('a portrait Work View puts the plane before the point list at every width, and landscape keeps its columns', () => {
  const css = read('src/components/common/WorkViewShell.css');
  // Portrait, any width: one column, plane first. The iPad (820x1180) had a
  // 256x182 plane beside the point list; phones had the plane 0% on screen.
  assert.match(css, /\[data-open="true"\]\[data-orientation="portrait"\] \.workflow-focus__active-stage \.mathmaster-function-workspace-grid \{\s*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(css, /\[data-open="true"\]\[data-orientation="portrait"\] \.workflow-focus__active-stage \.mathmaster-function-workspace-graph \{\s*order: -1;/);
  // The old sidebar-first rule tied with App.css's graph-first rule, so DOM
  // order put the five point cards above the plane.
  assert.doesNotMatch(css, /\.mathmaster-function-workspace-sidebar \{\s*order: -1;/);
  // The plane never outgrows the stage body it scrolls in.
  assert.match(css, /\.workflow-focus__active-stage \.mathmaster-function-workspace-graph svg \{\s*max-height: max\(200px, calc\(var\(--mm-work-view-height, 100dvh\) - 280px\)\);/);

  const app = read('src/App.css');
  const enlarged = app.slice(app.indexOf('ENLARGING A PLOTTING WORKSPACE ON A PHONE'), app.indexOf('Enlarged domain/range analysis'));
  assert.match(enlarged, /@media \(max-width: 700px\) and \(orientation: portrait\) \{/);
});

test('picking a point card on touch brings the plane back into view', async () => {
  const { revealInNearestScroller } = await import('../../src/platform/workView/workViewReveal.js');
  const { body, plane } = stagedPhoneScene();
  body.scrollTop = 600; // the student scrolled down to the point cards
  assert.ok(revealInNearestScroller(plane, styleOf) < 0);
  const planeBox = plane.getBoundingClientRect();
  const bodyBox = body.getBoundingClientRect();
  assert.ok(planeBox.top >= bodyBox.top && planeBox.bottom <= bodyBox.bottom);

  const workspace = read('src/InteractiveGraphWorkspace.jsx');
  assert.match(workspace, /setActiveTaskId\(task\.id\); setKeyboardAnnouncement\([^;]*\); if \(mobileInteraction\.isMobile\) revealPlaneForPlacement\(\);/);
  assert.match(workspace, /window\.requestAnimationFrame\(\(\) => revealInNearestScroller\(svgRef\.current\)\)/);
});

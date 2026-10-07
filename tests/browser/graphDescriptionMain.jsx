// Graphs speak: CoordinatePlane planes for tests/browser/graphDescription.mjs.
//
//   Graph A, Graph B   two different read-only planes (a rising line with a
//                      labelled point; a parabola with a dashed guide)
//   Graph C            read-only, inside a card that is itself a button, so it
//                      must not render a nested "Show data table" button
//   Plot here          an interactive plane; Enter plots at the crosshair
//
// All data is synthetic.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CoordinatePlane from '../../src/tools/shared/CoordinatePlane.jsx';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/ui/uiKit.css';

const parabola = (x) => x * x - 4;
const LINE_A = [{ m: 2, b: 2 }];
const POINTS_A = [{ x: 3, y: -2, label: 'A' }];
const LINE_C = [{ m: -1, b: 1 }];

function Harness() {
  const [plotted, setPlotted] = useState([]);
  return (
    <main style={{ padding: 16, display: 'grid', gap: 24, maxWidth: 640, fontFamily: 'system-ui' }}>
      <section data-graph="a">
        <h2>Graph A</h2>
        <CoordinatePlane ariaLabel="Graph A" xMin={-6} xMax={6} yMin={-6} yMax={6} lines={LINE_A} points={POINTS_A} />
      </section>
      <section data-graph="b">
        <h2>Graph B</h2>
        <CoordinatePlane ariaLabel="Graph B" xMin={-6} xMax={6} yMin={-6} yMax={10} functions={[parabola]} verticalLines={[3]} />
      </section>
      <section data-graph="c">
        <button type="button" style={{ width: '100%' }}>
          <strong>Graph C</strong>
          <CoordinatePlane ariaLabel="Graph C" enlargeable={false} xMin={-6} xMax={6} yMin={-6} yMax={6} lines={LINE_C} />
        </button>
      </section>
      <section data-graph="d">
        <h2>Plot here</h2>
        <CoordinatePlane ariaLabel="Plot here" xMin={-6} xMax={6} yMin={-6} yMax={6} points={plotted} onPlot={(point) => setPlotted((list) => [...list, point])} />
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

/*
 * WHAT A FIGURE OR A TOOL PUBLISHES TO READ ALOUD, CAPTURED IN A SERVER RENDER.
 *
 * A figure publishes its reading from an effect (src/platform/language/
 * figureReadings.js), and a server render runs no effects. This Vite server
 * records each <PublishFigureReading>'s entry as it renders, normalized by the
 * real module, so a test renders a real figure or tool and reads exactly what
 * QuestionEngine's reader would get from it, beside the markup it draws.
 *
 *   const capture = await figureCaptureServer();
 *   const { default: Tool } = await capture.load('/src/tools/…/Tool.jsx');
 *   const { markup, entries } = capture.render(React.createElement(Tool, props));
 *   await capture.close();
 */
import { renderToStaticMarkup } from 'react-dom/server';

const PUBLISH = /(export function PublishFigureReading\(\{ entry \}\) \{\s*usePublishFigureReading\(entry\);)/;

export const figureCaptureServer = async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({
    plugins: [{
      name: 'capture-figure-readings',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/platform/language/figureReadings.js')) return null;
        if (!PUBLISH.test(code)) throw new Error('PublishFigureReading changed shape: update tests/platform/helpers/figureCapture.mjs');
        return code.replace(PUBLISH, '$1 globalThis.__figureEntries?.push(normalizeEntry(entry));');
      },
    }],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  const render = (element) => {
    globalThis.__figureEntries = [];
    try {
      const markup = renderToStaticMarkup(element);
      return { markup, entries: globalThis.__figureEntries.filter(Boolean) };
    } finally {
      globalThis.__figureEntries = undefined;
    }
  };
  return { render, load: (path) => vite.ssrLoadModule(path), close: () => vite.close() };
};

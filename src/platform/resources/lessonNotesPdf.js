import html2canvas from 'html2canvas';
import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;
const PAGE_PADDING = 56;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_PADDING * 2;
const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_PADDING * 2 - 46;

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const el = (tag, styles = {}, text = null) => {
  const node = document.createElement(tag);
  Object.assign(node.style, styles);
  if (text != null) node.textContent = text;
  return node;
};

const addMath = (parent, latex, block = true) => {
  const wrapper = el(block ? 'div' : 'span', {
    margin: block ? '8px 0' : '0 3px',
    fontSize: block ? '20px' : 'inherit',
    lineHeight: '1.35',
    overflow: 'visible',
  });
  wrapper.innerHTML = convertLatexToMarkup(clean(latex));
  parent.appendChild(wrapper);
  return wrapper;
};

const sectionNode = (section) => {
  const wrap = el('section', { margin: '0 0 14px', breakInside: 'avoid' });
  if (section.heading) wrap.appendChild(el('h2', {
    fontSize: '18px', margin: '0 0 6px', color: '#174ea6', lineHeight: '1.2',
  }, section.heading));
  asArray(section.content).filter(Boolean).forEach((paragraph) => {
    wrap.appendChild(el('p', {
      margin: '0 0 7px', fontSize: '14px', lineHeight: '1.45', color: '#202124',
    }, paragraph));
  });
  if (section.bullets?.length) {
    const list = el('ul', { margin: '4px 0 8px', paddingLeft: '22px', color: '#202124' });
    section.bullets.forEach((bullet) => list.appendChild(el('li', {
      margin: '0 0 4px', fontSize: '14px', lineHeight: '1.4',
    }, bullet)));
    wrap.appendChild(list);
  }
  (section.equations || []).forEach((latex) => addMath(wrap, latex, true));
  if (section.callout) {
    wrap.appendChild(el('div', {
      borderLeft: '4px solid #1a73e8', background: '#f2f7ff', padding: '8px 10px',
      borderRadius: '0 7px 7px 0', fontSize: '13px', lineHeight: '1.42', margin: '8px 0',
    }, section.callout));
  }
  if (section.workedExample) {
    const box = el('div', {
      border: '1px solid #d7e3f6', background: '#fbfdff', borderRadius: '9px', padding: '10px 12px', marginTop: '8px',
    });
    box.appendChild(el('div', { fontWeight: '800', fontSize: '13px', color: '#174ea6', marginBottom: '5px' }, section.workedExample.title || 'Worked Example'));
    if (section.workedExample.problem) box.appendChild(el('div', { fontSize: '13px', lineHeight: '1.4', marginBottom: '5px' }, section.workedExample.problem));
    if (section.workedExample.steps?.length) {
      const ol = el('ol', { margin: '4px 0 0', paddingLeft: '22px' });
      section.workedExample.steps.forEach((step) => ol.appendChild(el('li', { fontSize: '13px', lineHeight: '1.4', marginBottom: '3px' }, step)));
      box.appendChild(ol);
    }
    if (section.workedExample.answerLatex) {
      const answerRow = el('div', { marginTop: '7px', fontSize: '13px' });
      answerRow.appendChild(el('strong', {}, 'Result: '));
      addMath(answerRow, section.workedExample.answerLatex, false);
      box.appendChild(answerRow);
    } else if (section.workedExample.answer) {
      box.appendChild(el('div', { marginTop: '7px', fontSize: '13px' }, `Result: ${section.workedExample.answer}`));
    }
    wrap.appendChild(box);
  }
  return wrap;
};

const headerNode = ({ assignment, notes }) => {
  const header = el('header', { marginBottom: '15px', paddingBottom: '12px', borderBottom: '2px solid #1a73e8' });
  header.appendChild(el('div', { fontSize: '11px', letterSpacing: '.09em', fontWeight: '800', color: '#5f6368', textTransform: 'uppercase' }, 'MathMaster Student Notes'));
  header.appendChild(el('h1', { fontSize: '25px', lineHeight: '1.15', margin: '4px 0 4px', color: '#202124' }, notes.title || assignment?.title || 'Lesson Notes'));
  if (notes.subtitle) header.appendChild(el('div', { fontSize: '13px', color: '#5f6368', lineHeight: '1.35' }, notes.subtitle));
  if (notes.learningGoal) {
    const goal = el('div', { marginTop: '8px', padding: '8px 10px', background: '#e8f0fe', borderRadius: '7px', fontSize: '13px', lineHeight: '1.38' });
    goal.appendChild(el('strong', {}, 'Learning goal: '));
    goal.appendChild(document.createTextNode(notes.learningGoal));
    header.appendChild(goal);
  }
  return header;
};

const pageNode = ({ assignment, notes, pageNumber, pageCount, firstPage }) => {
  const page = el('div', {
    width: `${PAGE_WIDTH}px`, height: `${PAGE_HEIGHT}px`, boxSizing: 'border-box',
    padding: `${PAGE_PADDING}px`, background: '#fff', color: '#202124',
    fontFamily: 'Arial, Helvetica, sans-serif', position: 'relative', overflow: 'hidden',
  });
  const content = el('div', { width: `${CONTENT_WIDTH}px` });
  if (firstPage) content.appendChild(headerNode({ assignment, notes }));
  page.appendChild(content);
  const footer = el('footer', {
    position: 'absolute', left: `${PAGE_PADDING}px`, right: `${PAGE_PADDING}px`, bottom: '30px',
    display: 'flex', justifyContent: 'space-between', color: '#80868b', fontSize: '10px',
    borderTop: '1px solid #e8eaed', paddingTop: '7px',
  });
  footer.appendChild(el('span', {}, notes.footer || 'MathMaster • Student Notes'));
  footer.appendChild(el('span', {}, `Page ${pageNumber} of ${pageCount}`));
  page.appendChild(footer);
  return { page, content };
};

const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const buildRenderedPages = async ({ assignment, notes }) => {
  const host = el('div', {
    position: 'fixed', left: '-10000px', top: '0', width: `${PAGE_WIDTH}px`,
    pointerEvents: 'none', opacity: '1', zIndex: '-1', background: '#fff',
  });
  document.body.appendChild(host);
  try {
    const sectionNodes = (notes.sections || []).map(sectionNode);
    if (!sectionNodes.length) {
      sectionNodes.push(sectionNode({
        heading: 'Lesson Overview',
        content: [`Use these notes as a reference while you complete ${assignment?.title || 'this MathMaster lesson'}.`],
        bullets: [], equations: [], workedExample: null, callout: '',
      }));
    }
    // Measure using the same content width as the finished page.
    const measure = el('div', { width: `${CONTENT_WIDTH}px`, fontFamily: 'Arial, Helvetica, sans-serif' });
    host.appendChild(measure);
    const measured = [];
    for (const node of sectionNodes) {
      measure.appendChild(node);
      await waitForPaint();
      measured.push({ node, height: Math.ceil(node.getBoundingClientRect().height) + 4 });
      measure.removeChild(node);
    }
    measure.remove();

    const targetPages = Number(notes.targetPages) === 1 ? 1 : 2;
    const allocations = Array.from({ length: targetPages }, () => []);
    const used = Array.from({ length: targetPages }, () => 0);
    // The first page has a variable header; reserve enough space for title + goal.
    const firstReserve = notes.learningGoal ? 150 : 105;
    const capacity = allocations.map((_, index) => PAGE_CONTENT_HEIGHT - (index === 0 ? firstReserve : 0));
    let pageIndex = 0;
    for (const item of measured) {
      if (pageIndex < targetPages - 1 && used[pageIndex] + item.height > capacity[pageIndex]) pageIndex += 1;
      allocations[pageIndex].push(item.node);
      used[pageIndex] += item.height;
    }
    if (used[targetPages - 1] > capacity[targetPages - 1] + 16) {
      throw new Error(`The AI-authored notes are too long for ${targetPages} page(s). Shorten the notes sections or choose 2 pages.`);
    }

    const pages = [];
    for (let index = 0; index < allocations.length; index += 1) {
      // Do not emit a blank second page if everything fit on page 1.
      if (index > 0 && allocations[index].length === 0) continue;
      const built = pageNode({ assignment, notes, pageNumber: pages.length + 1, pageCount: allocations.filter((items, i) => i === 0 || items.length).length, firstPage: index === 0 });
      allocations[index].forEach((node) => built.content.appendChild(node));
      host.appendChild(built.page);
      pages.push(built.page);
    }
    await waitForPaint();
    return { host, pages };
  } catch (error) {
    host.remove();
    throw error;
  }
};

const dataUrlBytes = (dataUrl) => {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const asciiBytes = (value) => new TextEncoder().encode(value);

const concatBytes = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
};

const buildImagePdf = (images) => {
  const chunks = [];
  const offsets = [0];
  let byteLength = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? asciiBytes(chunk) : chunk;
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  push('%PDF-1.4\n%MM\n');

  const objectCount = 2 + images.length * 3;
  const addObject = (id, bodyParts) => {
    offsets[id] = byteLength;
    push(`${id} 0 obj\n`);
    bodyParts.forEach(push);
    push('\nendobj\n');
  };

  addObject(1, [`<< /Type /Catalog /Pages 2 0 R >>`]);
  const pageObjectIds = images.map((_, index) => 3 + index * 3);
  addObject(2, [`<< /Type /Pages /Count ${images.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`]);

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    addObject(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
    addObject(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      '\nendstream',
    ]);
    const command = `q\n612 0 0 792 0 0 cm\n/Im${index + 1} Do\nQ\n`;
    addObject(contentId, [`<< /Length ${asciiBytes(command).length} >>\nstream\n${command}endstream`]);
  });

  const xrefOffset = byteLength;
  push(`xref\n0 ${objectCount + 1}\n`);
  push('0000000000 65535 f \n');
  for (let id = 1; id <= objectCount; id += 1) {
    push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return concatBytes(chunks);
};

export const generateLessonNotesPdfBlob = async ({ assignment = {}, notesPdf = {} } = {}) => {
  if (typeof document === 'undefined') throw new Error('PDF notes can only be generated in the teacher browser.');
  const { host, pages } = await buildRenderedPages({ assignment, notes: notesPdf });
  try {
    const images = [];
    for (const page of pages) {
      // A 2x raster keeps equations/fractions crisp when Classroom opens the PDF.
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      });
      images.push({
        width: canvas.width,
        height: canvas.height,
        bytes: dataUrlBytes(canvas.toDataURL('image/jpeg', 0.96)),
      });
    }
    const pdfBytes = buildImagePdf(images);
    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      pageCount: images.length,
      byteLength: pdfBytes.length,
    };
  } finally {
    host.remove();
  }
};

export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error('Could not read the generated PDF.'));
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.readAsDataURL(blob);
});

export const notesPdfSummary = (notesPdf = {}) => ({
  enabled: notesPdf?.enabled === true,
  title: clean(notesPdf?.title),
  fileName: clean(notesPdf?.fileName),
  targetPages: Number(notesPdf?.targetPages) === 1 ? 1 : 2,
  sectionCount: Array.isArray(notesPdf?.sections) ? notesPdf.sections.length : 0,
  hasAsset: Boolean(notesPdf?.asset?.url),
});

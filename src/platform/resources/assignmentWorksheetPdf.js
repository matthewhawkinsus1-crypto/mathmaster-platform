import html2canvas from 'html2canvas';
import { convertLatexToMarkup } from 'mathlive';
import 'mathlive/static.css';
import { isMathSegment, splitMathSegments, unwrapMathSegment } from '../../components/common/mathSegments.js';
import { PRINT_OUTPUT_MODES, worksheetFileName } from './assignmentWorksheetPdfModel.js';
import { renderWorksheetVisual } from './assignmentWorksheetVisuals.js';

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;
const PAGE_PADDING = 50;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_PADDING * 2;
const CONTENT_BOTTOM = 995;

const el = (tag, styles = {}, text = null) => {
  const node = document.createElement(tag);
  Object.assign(node.style, styles);
  if (text != null) node.textContent = text;
  return node;
};

const appendRichText = (parent, value, { size = 15, weight = 400 } = {}) => {
  const line = el('div', { fontSize: `${size}px`, fontWeight: String(weight), lineHeight: '1.45', whiteSpace: 'pre-wrap' });
  splitMathSegments(String(value ?? '')).forEach((segment) => {
    if (!isMathSegment(segment)) {
      line.appendChild(document.createTextNode(segment));
      return;
    }
    const math = unwrapMathSegment(segment);
    const span = el(math.inline ? 'span' : 'div', {
      display: math.inline ? 'inline-block' : 'block',
      margin: math.inline ? '0 2px' : '8px 0',
      fontSize: math.inline ? `${size}px` : `${Math.max(size + 3, 18)}px`,
      verticalAlign: 'middle',
    });
    span.innerHTML = convertLatexToMarkup(math.value);
    line.appendChild(span);
  });
  parent.appendChild(line);
  return line;
};

const graphWorkspace = () => {
  const wrap = el('div', { marginTop: '12px', display: 'flex', justifyContent: 'center' });
  const size = 220;
  const center = size / 2;
  const lines = [];
  for (let x = 10; x < size; x += 10) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${size}" stroke="#e2e6ea" stroke-width="1"/>`);
  for (let y = 10; y < size; y += 10) lines.push(`<line x1="0" y1="${y}" x2="${size}" y2="${y}" stroke="#e2e6ea" stroke-width="1"/>`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.border = '1px solid #9aa0a6';
  svg.innerHTML = `${lines.join('')}<line x1="${center}" y1="0" x2="${center}" y2="${size}" stroke="#5f6368" stroke-width="2"/><line x1="0" y1="${center}" x2="${size}" y2="${center}" stroke="#5f6368" stroke-width="2"/>`;
  wrap.appendChild(svg);
  return wrap;
};

const linedWorkspace = (height = 118) => {
  const box = el('div', {
    height: `${height}px`, marginTop: '12px', border: '1px solid #c7cdd4', borderRadius: '8px',
    backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #e2e6ea 28px)',
    backgroundColor: '#fff',
  });
  return box;
};

const questionNode = (question, outputMode = PRINT_OUTPUT_MODES.STUDENT) => {
  question = { ...question, outputMode };
  const card = el('article', {
    border: '1px solid #d7dce2', borderRadius: '10px', padding: '14px 16px', margin: '0 0 14px',
    breakInside: 'avoid', background: '#fff', color: '#202124', boxSizing: 'border-box',
  });
  const header = el('div', { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' });
  header.appendChild(el('div', {
    width: '28px', height: '28px', borderRadius: '50%', background: '#e8f0fe', color: '#174ea6',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '13px', flex: '0 0 auto',
  }, String(question.number)));
  header.appendChild(el('div', { fontSize: '11px', fontWeight: '800', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '.06em' }, 'Question'));
  card.appendChild(header);

  if (question.directions) appendRichText(card, question.directions, { size: 12, weight: 650 });
  if (question.scenario) {
    const scenario = el('div', { margin: '7px 0 9px', padding: '9px 11px', background: '#f8f9fa', borderLeft: '4px solid #9aa0a6', borderRadius: '0 6px 6px 0' });
    appendRichText(scenario, question.scenario, { size: 13, weight: 400 });
    card.appendChild(scenario);
  }
  appendRichText(card, question.prompt || 'Complete this question.', { size: 16, weight: 650 });

  const givens = Array.isArray(question.givens) ? question.givens.filter(Boolean) : [];
  if (givens.length) {
    const givenBox = el('div', {
      marginTop: '10px', padding: '9px 11px', border: '1px solid #d7dce2', borderRadius: '8px',
      background: '#fbfcfe',
    });
    givenBox.appendChild(el('div', {
      fontSize: '10.5px', fontWeight: '900', color: '#5f6368',
      textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px',
    }, 'Given'));
    givens.forEach((line) => appendRichText(givenBox, line, { size: 13, weight: 600 }));
    card.appendChild(givenBox);
  }

  if (question.choices?.length) {
    const choices = el('div', { display: 'grid', gap: '7px', marginTop: '11px' });
    question.choices.forEach((choice) => {
      const row = el('div', { display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px' });
      row.appendChild(el('div', {
        width: '22px', height: '22px', border: '1.5px solid #5f6368', borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '800', flex: '0 0 auto', marginTop: '1px',
      }, choice.label));
      const body = el('div', { flex: '1 1 auto' });
      appendRichText(body, choice.text, { size: 14, weight: 400 });
      row.appendChild(body);
      choices.appendChild(row);
    });
    card.appendChild(choices);
  }

  const visuals = Array.isArray(question.visuals) ? question.visuals : [];
  visuals.forEach((visual) => {
    const node = renderWorksheetVisual(visual);
    if (node) card.appendChild(node);
  });

  const answerLines = Array.isArray(question.answerLines) ? question.answerLines.filter(Boolean) : [];
  const solutionLines = Array.isArray(question.solutionLines) ? question.solutionLines.filter(Boolean) : [];
  if (answerLines.length) {
    const answerBox = el('div', {
      marginTop: '12px', padding: '10px 12px', border: '1px solid #81c995', borderRadius: '8px',
      background: '#e6f4ea', color: '#137333',
    });
    answerBox.appendChild(el('div', { fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }, 'Answer'));
    answerLines.forEach((line) => appendRichText(answerBox, line, { size: 13, weight: 700 }));
    card.appendChild(answerBox);
  }
  if (solutionLines.length) {
    const solutionBox = el('div', {
      marginTop: '9px', padding: '10px 12px', border: '1px solid #c5d5ef', borderRadius: '8px',
      background: '#f8fbff', color: '#3c4043',
    });
    solutionBox.appendChild(el('div', { fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px', color: '#174ea6' }, 'Solution / explanation'));
    solutionLines.forEach((line, index) => appendRichText(solutionBox, `${index + 1}. ${line}`, { size: 12, weight: 500 }));
    card.appendChild(solutionBox);
  }

  if (question.outputMode !== PRINT_OUTPUT_MODES.ANSWER_KEY) {
    const type = String(question.type || '').toLowerCase();
    const visualKinds = new Set(visuals.map((visual) => visual?.kind).filter(Boolean));
    const hasConstructionWorkspace = ['blankGraph', 'numberLine', 'mapping'].some((kind) => visualKinds.has(kind));
    const tableCarriesResponseSpace = visualKinds.has('table');
    if (!hasConstructionWorkspace && !tableCarriesResponseSpace) {
      const height = type.includes('step') || type.includes('system') || type.includes('literal')
        ? 150
        : visualKinds.has('graph') || visualKinds.has('graphChoices') ? 92 : 108;
      card.appendChild(linedWorkspace(height));
    } else if (type === 'multianswer' || type === 'relationshipmodel' || type === 'relationmapping') {
      card.appendChild(linedWorkspace(72));
    }
  }
  return card;
};

const pageNode = ({ model, firstPage }) => {
  const page = el('div', {
    width: `${PAGE_WIDTH}px`, minHeight: `${PAGE_HEIGHT}px`, height: `${PAGE_HEIGHT}px`, boxSizing: 'border-box',
    padding: `${PAGE_PADDING}px`, background: '#fff', color: '#202124', fontFamily: 'Arial, Helvetica, sans-serif',
    position: 'relative', overflow: 'hidden',
  });
  const content = el('div', { width: `${CONTENT_WIDTH}px` });
  if (firstPage) {
    content.appendChild(el('div', { fontSize: '11px', fontWeight: '800', color: '#5f6368', letterSpacing: '.09em', textTransform: 'uppercase' }, `MathMaster ${model.documentLabel || 'Printable Assignment'}`));
    content.appendChild(el('h1', { fontSize: '26px', margin: '5px 0 8px', lineHeight: '1.15' }, model.title));
    const meta = el('div', { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px', fontSize: '12.5px', color: '#3c4043', paddingBottom: '12px', marginBottom: '14px', borderBottom: '2px solid #1a73e8' });
    if (model.outputMode === PRINT_OUTPUT_MODES.STUDENT) {
      meta.appendChild(el('div', {}, `Student: ${model.studentName || '____________________________'}`));
      meta.appendChild(el('div', {}, `Class: ${model.classPeriod || '________________'}`));
    } else {
      meta.appendChild(el('div', {}, `Version: ${model.studentName || 'Shared assignment version'}`));
      meta.appendChild(el('div', {}, model.outputMode === PRINT_OUTPUT_MODES.ANSWER_KEY ? 'Teacher use only · compact answer key' : 'Teacher use only · answers and available solutions included'));
    }
    if (model.dueAt) {
      const date = new Date(model.dueAt);
      meta.appendChild(el('div', {}, `Due: ${Number.isNaN(date.getTime()) ? String(model.dueAt) : date.toLocaleString()}`));
    }
    if (model.outputMode === PRINT_OUTPUT_MODES.STUDENT) {
      meta.appendChild(el('div', {}, 'Show your work. Submit answers in MathMaster unless your teacher says otherwise.'));
    }
    content.appendChild(meta);
  } else {
    const carry = el('div', { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '11px', color: '#5f6368', paddingBottom: '8px', marginBottom: '12px', borderBottom: '1px solid #d7dce2' });
    carry.appendChild(el('span', {}, model.title));
    carry.appendChild(el('span', {}, model.outputMode === PRINT_OUTPUT_MODES.STUDENT ? (model.studentName || 'Student') : (model.documentLabel || 'Teacher Copy')));
    content.appendChild(carry);
  }
  page.appendChild(content);
  const footer = el('footer', {
    position: 'absolute', left: `${PAGE_PADDING}px`, right: `${PAGE_PADDING}px`, bottom: '24px',
    display: 'flex', justifyContent: 'space-between', color: '#80868b', fontSize: '10px', borderTop: '1px solid #e8eaed', paddingTop: '6px',
  });
  footer.dataset.worksheetFooter = 'true';
  footer.appendChild(el('span', {}, `MathMaster • ${model.documentLabel || 'Printable Assignment'}`));
  footer.appendChild(el('span', {}, 'Page'));
  page.appendChild(footer);
  return { page, content };
};

const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const buildPages = async (model) => {
  const host = el('div', { position: 'fixed', left: '-10000px', top: '0', width: `${PAGE_WIDTH}px`, zIndex: '-1', pointerEvents: 'none', background: '#fff' });
  document.body.appendChild(host);
  const pages = [];
  let current = pageNode({ model, firstPage: true });
  host.appendChild(current.page);
  pages.push(current.page);

  const newPage = () => {
    current = pageNode({ model, firstPage: false });
    host.appendChild(current.page);
    pages.push(current.page);
  };

  try {
    for (const section of model.sections || []) {
      let heading = el('h2', { fontSize: '17px', color: '#174ea6', margin: '10px 0 9px', lineHeight: '1.2' }, section.label);
      current.content.appendChild(heading);
      await waitForPaint();
      if (current.content.getBoundingClientRect().bottom > current.page.getBoundingClientRect().top + CONTENT_BOTTOM) {
        heading.remove();
        newPage();
        heading = el('h2', { fontSize: '17px', color: '#174ea6', margin: '10px 0 9px', lineHeight: '1.2' }, section.label);
        current.content.appendChild(heading);
      }

      for (const question of section.questions || []) {
        const node = questionNode(question, model.outputMode);
        current.content.appendChild(node);
        await waitForPaint();
        const overflow = current.content.getBoundingClientRect().bottom > current.page.getBoundingClientRect().top + CONTENT_BOTTOM;
        if (overflow && current.content.children.length > 2) {
          node.remove();
          newPage();
          current.content.appendChild(el('h2', { fontSize: '17px', color: '#174ea6', margin: '10px 0 9px', lineHeight: '1.2' }, `${section.label} · continued`));
          current.content.appendChild(node);
          await waitForPaint();
          const stillOverflows = current.content.getBoundingClientRect().bottom > current.page.getBoundingClientRect().top + CONTENT_BOTTOM;
          if (stillOverflows) {
            throw new Error(
              `Question ${question.number || '?'} in "${section.label}" is taller than one printable page. Shorten the prompt/solution or reduce the visual/table size before exporting.`,
            );
          }
        }
      }
    }
    pages.forEach((page, index) => {
      const footer = page.querySelector('[data-worksheet-footer="true"]');
      if (footer?.lastChild) footer.lastChild.textContent = `Page ${index + 1} of ${pages.length}`;
    });
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
  addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  const pageObjectIds = images.map((_, index) => 3 + index * 3);
  addObject(2, [`<< /Type /Pages /Count ${images.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`]);
  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    addObject(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
    addObject(imageId, [`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`, image.bytes, '\nendstream']);
    const command = `q\n612 0 0 792 0 0 cm\n/Im${index + 1} Do\nQ\n`;
    addObject(contentId, [`<< /Length ${asciiBytes(command).length} >>\nstream\n${command}endstream`]);
  });
  const xrefOffset = byteLength;
  push(`xref\n0 ${objectCount + 1}\n`);
  push('0000000000 65535 f \n');
  for (let id = 1; id <= objectCount; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return concatBytes(chunks);
};

export const generateAssignmentWorksheetPdfBlob = async (model) => {
  if (typeof document === 'undefined') throw new Error('Assignment PDFs can only be generated in the browser.');
  if (!model?.sections?.some((section) => section.questions?.length)) throw new Error('No currently available assignment questions can be exported yet.');
  const { host, pages } = await buildPages(model);
  try {
    const images = [];
    for (const page of pages) {
      const canvas = await html2canvas(page, {
        backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false, width: PAGE_WIDTH, height: PAGE_HEIGHT,
      });
      images.push({ width: canvas.width, height: canvas.height, bytes: dataUrlBytes(canvas.toDataURL('image/jpeg', 0.96)) });
    }
    const pdfBytes = buildImagePdf(images);
    return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), pageCount: images.length, byteLength: pdfBytes.length };
  } finally {
    host.remove();
  }
};

export const downloadAssignmentWorksheetPdf = async ({ model } = {}) => {
  const result = await generateAssignmentWorksheetPdfBlob(model);
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = worksheetFileName({ assignmentTitle: model?.title, studentName: model?.studentName, outputMode: model?.outputMode });
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
};

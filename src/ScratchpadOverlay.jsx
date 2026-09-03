import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QuestionPrompt from './QuestionPrompt';
import useUndoHistory from './useUndoHistory';
import {
  MAX_SCRATCHPAD_PAGES,
  canAddScratchpadPage,
} from './platform/student/scratchpadPages.js';

const COLORS = [
  { id: 'black', label: 'Black', value: '#202124' },
  { id: 'blue', label: 'Blue', value: '#1a73e8' },
  { id: 'red', label: 'Red', value: '#d93025' },
];

const MAX_EXPORT_WIDTH = 1200;
const MAX_EXPORT_HEIGHT = 900;
const MAX_DATA_URL_LENGTH = 700_000;

const drawStroke = (context, stroke, scaleX = 1, scaleY = 1) => {
  if (!stroke?.points?.length) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color || '#202124';
  context.lineWidth = (stroke.tool === 'eraser' ? 26 : 3.2) * ((scaleX + scaleY) / 2);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point[0] * scaleX;
    const y = point[1] * scaleY;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (stroke.points.length === 1) {
    const [x, y] = stroke.points[0];
    context.lineTo(x * scaleX + 0.01, y * scaleY + 0.01);
  }
  context.stroke();
  context.restore();
};

const eventPoint = (event, canvas) => {
  const rectangle = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return [
    ((clientX - rectangle.left) / rectangle.width) * canvas.width,
    ((clientY - rectangle.top) / rectangle.height) * canvas.height,
  ];
};

const buildCompressedDataUrl = (sourceCanvas) => {
  const scale = Math.min(
    1,
    MAX_EXPORT_WIDTH / sourceCanvas.width,
    MAX_EXPORT_HEIGHT / sourceCanvas.height,
  );
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const context = exportCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

  for (const quality of [0.78, 0.66, 0.54, 0.42]) {
    const value = exportCanvas.toDataURL('image/webp', quality);
    if (value.length <= MAX_DATA_URL_LENGTH) return value;
  }
  return exportCanvas.toDataURL('image/jpeg', 0.42);
};

export default function ScratchpadOverlay({
  open,
  questionDetails,
  initialDataUrl = '',
  initialPages = null,
  onSave,
  onClose,
  readOnly = false,
}) {
  const canvasRef = useRef(null);
  const backgroundRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const clearBackupRef = useRef(null);
  const [clearBackupAvailable, setClearBackupAvailable] = useState(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#202124');
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const strokeHistory = useUndoHistory([]);
  const strokes = strokeHistory.value;

  // Pages the student is not currently drawing on are held as flattened images,
  // exactly as they are stored. Only the visible page carries live strokes.
  const [pageImages, setPageImages] = useState(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const pageCount = pageImages.length;

  const compactQuestion = useMemo(
    () => String(questionDetails || 'Use this space to show your work.').slice(0, 700),
    [questionDetails],
  );

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (backgroundRef.current) {
      context.drawImage(backgroundRef.current, 0, 0, canvas.width, canvas.height);
    }
    strokes.forEach((stroke) => drawStroke(context, stroke));
    context.restore();
  };

  useEffect(() => {
    if (!open) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resize = () => {
      const rectangle = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(720, Math.round(rectangle.width * ratio));
      const height = Math.max(520, Math.round(rectangle.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        redraw();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [open]);

  // Draw one page's stored image behind the live strokes. Shared by opening the
  // scratchpad and by turning to another page.
  const loadPageImage = useCallback((dataUrl) => {
    strokeHistory.reset([]);
    clearBackupRef.current = null;
    setClearBackupAvailable(false);
    backgroundRef.current = null;
    if (!dataUrl) {
      window.requestAnimationFrame(redraw);
      return;
    }
    const image = new Image();
    image.onload = () => {
      backgroundRef.current = image;
      redraw();
    };
    image.onerror = () => {
      setMessage('That page could not be loaded. A blank page is ready in its place.');
      redraw();
    };
    image.src = dataUrl;
    // redraw and strokeHistory are stable enough for this overlay's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const stored = Array.isArray(initialPages) && initialPages.length
      ? initialPages
      : [initialDataUrl || ''];
    setPageImages(stored);
    setPageIndex(0);
    setDirty(false);
    setConfirmingClose(false);
    setMessage('');
    loadPageImage(stored[0] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDataUrl, initialPages]);

  useEffect(() => {
    if (open) redraw();
  }, [strokes, open]);

  const startStroke = (event) => {
    const canvas = canvasRef.current;
    if (!canvas || saving || readOnly) return;
    const point = eventPoint(event, canvas);
    if (!point) return;
    clearBackupRef.current = null;
    setClearBackupAvailable(false);
    activeStrokeRef.current = {
      tool,
      color,
      points: [point],
    };
    setDrawing(true);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const extendStroke = (event) => {
    const canvas = canvasRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !drawing || !stroke) return;
    const point = eventPoint(event, canvas);
    if (!point) return;
    const previous = stroke.points[stroke.points.length - 1];
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 2) return;
    stroke.points.push(point);
    redraw();
    drawStroke(canvas.getContext('2d'), stroke);
  };

  const finishStroke = (event) => {
    const canvas = canvasRef.current;
    if (!drawing || !activeStrokeRef.current) return;
    setDrawing(false);
    canvas?.releasePointerCapture?.(event.pointerId);
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    strokeHistory.setValue((current) => [...current, finished]);
    setDirty(true);
  };

  const clearAll = () => {
    clearBackupRef.current = {
      strokes: [...strokes],
      background: backgroundRef.current,
    };
    setClearBackupAvailable(true);
    strokeHistory.reset([]);
    backgroundRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
    setDirty(true);
    setMessage('This page was cleared. Undo will bring it back.');
  };

  const undoScratchpad = () => {
    if (strokeHistory.canUndo) {
      strokeHistory.undo();
      setMessage('Last stroke removed.');
      return;
    }
    if (clearBackupRef.current) {
      backgroundRef.current = clearBackupRef.current.background;
      strokeHistory.reset(clearBackupRef.current.strokes);
      clearBackupRef.current = null;
      setClearBackupAvailable(false);
      window.requestAnimationFrame(redraw);
      setMessage('Cleared work restored.');
    }
  };

  // Flatten what is on screen back into the page list. Every page turn, page
  // add and save goes through here, so live strokes can never be left behind on
  // a page the student has navigated away from.
  const captureCurrentPage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return pageImages;
    const dataUrl = buildCompressedDataUrl(canvas);
    if (dataUrl.length > MAX_DATA_URL_LENGTH * 1.25) {
      throw new Error('This page is too detailed to save. Erase some marks and try again.');
    }
    const next = [...pageImages];
    next[pageIndex] = dataUrl;
    return next;
  }, [pageImages, pageIndex]);

  const goToPage = (target) => {
    if (readOnly) {
      if (target < 0 || target >= pageCount) return;
      setPageIndex(target);
      loadPageImage(pageImages[target] || '');
      return;
    }
    if (target < 0 || target >= pageCount || target === pageIndex || saving) return;
    try {
      const captured = captureCurrentPage();
      setPageImages(captured);
      setPageIndex(target);
      loadPageImage(captured[target] || '');
      setMessage('');
    } catch (error) {
      setMessage(error?.message || 'That page could not be set aside.');
    }
  };

  const addPage = () => {
    if (readOnly || saving || !canAddScratchpadPage(pageImages)) return;
    try {
      // The page being left is flattened first, which is the entire point:
      // more room without erasing the working already done.
      const captured = captureCurrentPage();
      const next = [...captured, ''];
      setPageImages(next);
      setPageIndex(next.length - 1);
      loadPageImage('');
      setDirty(true);
      setMessage(`Page ${next.length} added. Page ${next.length - 1} is kept.`);
    } catch (error) {
      setMessage(error?.message || 'A new page could not be added.');
    }
  };

  const save = async ({ close = true } = {}) => {
    const canvas = canvasRef.current;
    if (!canvas || saving || readOnly) return;
    setSaving(true);
    setMessage('');
    try {
      const pages = captureCurrentPage();
      await onSave?.(pages, {
        width: canvas.width,
        height: canvas.height,
        byteEstimate: Math.round((pages.join('').length * 3) / 4),
      });
      setPageImages(pages);
      setDirty(false);
      setConfirmingClose(false);
      if (close) {
        onClose?.();
        return;
      }
      setMessage(pages.length === 1 ? 'Work saved.' : `All ${pages.length} pages saved.`);
    } catch (error) {
      setMessage(error?.message || 'The scratchpad could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  // CLOSING USED TO THROW THE WORK AWAY. The button called onClose directly, and
  // the overlay resets its strokes on the next open, so a student who drew for
  // five minutes and pressed Close lost all of it with nothing said. Unsaved
  // work now has to be dismissed on purpose.
  const requestClose = () => {
    if (readOnly || !dirty || saving) {
      onClose?.();
      return;
    }
    setConfirmingClose(true);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full-screen scratchpad"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30000,
        background: '#f4f6f8',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        animation: 'scratchpadSlideUp 220ms ease-out',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 18px',
          background: '#fff',
          borderBottom: '1px solid #dfe3e7',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div>
          <strong style={{ fontSize: '18px', color: '#202124' }}>Student Scratchpad</strong>
          <div style={{ fontSize: '12px', color: '#5f6368', marginTop: '2px' }}>
            {readOnly
              ? 'This saved scratchpad is read-only because the question is locked.'
              : dirty
                ? 'Unsaved work on this page.'
                : 'Draw with a mouse, stylus, or finger.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => goToPage(pageIndex - 1)}
            disabled={pageIndex === 0 || saving}
            aria-label="Previous page"
            style={{ minHeight: 44, minWidth: 44, border: '1px solid #c5d5ef', borderRadius: '8px', background: '#fff', fontWeight: 'bold', opacity: pageIndex === 0 ? 0.45 : 1 }}
          >
            ‹
          </button>
          <span aria-live="polite" style={{ fontSize: '13px', fontWeight: 800, color: '#3c4043', minWidth: '86px', textAlign: 'center' }}>
            Page {pageIndex + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => goToPage(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1 || saving}
            aria-label="Next page"
            style={{ minHeight: 44, minWidth: 44, border: '1px solid #c5d5ef', borderRadius: '8px', background: '#fff', fontWeight: 'bold', opacity: pageIndex >= pageCount - 1 ? 0.45 : 1 }}
          >
            ›
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={addPage}
              disabled={saving || !canAddScratchpadPage(pageImages)}
              title={canAddScratchpadPage(pageImages) ? 'Keep this page and start a new one' : `A scratchpad holds up to ${MAX_SCRATCHPAD_PAGES} pages`}
              style={{ minHeight: 44, padding: '9px 14px', border: '1px solid #c5d5ef', borderRadius: '8px', background: '#fff', color: '#174ea6', fontWeight: 'bold', opacity: canAddScratchpadPage(pageImages) ? 1 : 0.45 }}
            >
              + Add page
            </button>
          )}
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            style={{ minHeight: 44, border: '1px solid #c5d5ef', borderRadius: '8px', padding: '9px 14px', background: '#fff', fontWeight: 'bold' }}
          >
            Close
          </button>
        </div>
      </header>

      <main style={{ position: 'relative', minHeight: 0, padding: '14px' }}>
        <div
          style={{
            position: 'absolute',
            top: '26px',
            left: '26px',
            zIndex: 3,
            maxWidth: 'min(520px, calc(100% - 52px))',
            padding: '10px 13px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.86)',
            border: '1px solid rgba(26,115,232,0.28)',
            backdropFilter: 'blur(4px)',
            pointerEvents: 'none',
            color: '#3c4043',
            fontSize: '13px',
          }}
        >
          <strong style={{ color: '#174ea6' }}>Current question</strong>
          <QuestionPrompt variant="plain" style={{ margin: '4px 0 0', fontSize: '13px', lineHeight: 1.45, color: '#3c4043', textAlign: 'left' }}>
            {compactQuestion}
          </QuestionPrompt>
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={(event) => drawing && finishStroke(event)}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            minHeight: 0,
            borderRadius: '14px',
            background: '#fff',
            boxShadow: '0 10px 30px rgba(60,64,67,0.16)',
            touchAction: readOnly ? 'auto' : 'none',
            cursor: readOnly ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
          }}
        />
      </main>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #dfe3e7',
        }}
      >
        {readOnly ? (
          <strong style={{ color: '#5f6368' }}>Read-only saved student work</strong>
        ) : <>
        <button type="button" onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} style={{ padding: '9px 13px', borderRadius: '8px', border: tool === 'pen' ? '2px solid #1a73e8' : '1px solid #c5d5ef', background: tool === 'pen' ? '#e8f0fe' : '#fff', fontWeight: 'bold' }}>✎ Pen</button>
        {COLORS.map((item) => (
          <button
            type="button"
            key={item.id}
            title={`${item.label} ink`}
            aria-label={`${item.label} ink`}
            onClick={() => { setColor(item.value); setTool('pen'); }}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              border: color === item.value && tool === 'pen' ? '4px solid #f9ab00' : '3px solid #fff',
              outline: `1px solid ${item.value}`,
              background: item.value,
            }}
          />
        ))}
        <button type="button" onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} style={{ padding: '9px 13px', borderRadius: '8px', border: tool === 'eraser' ? '2px solid #1a73e8' : '1px solid #c5d5ef', background: tool === 'eraser' ? '#e8f0fe' : '#fff', fontWeight: 'bold' }}>▱ Eraser</button>
        <button type="button" onClick={undoScratchpad} disabled={!strokeHistory.canUndo && !clearBackupAvailable} style={{ padding: '9px 13px', borderRadius: '8px', border: '1px solid #c5d5ef', background: '#fff', fontWeight: 'bold', opacity: strokeHistory.canUndo || clearBackupAvailable ? 1 : 0.45 }}>↶ Undo</button>
        <button type="button" onClick={clearAll} style={{ padding: '9px 13px', borderRadius: '8px', border: '1px solid #e0b4b0', background: '#fff', color: '#a50e0e', fontWeight: 'bold' }}>Clear All</button>
        <button type="button" onClick={() => save({ close: false })} disabled={saving} style={{ minHeight: 44, padding: '10px 16px', borderRadius: '8px', border: '1px solid #9bb8e8', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={() => save({ close: true })} disabled={saving} style={{ minHeight: 44, padding: '10px 18px', borderRadius: '8px', border: 'none', background: saving ? '#dadce0' : '#188038', color: '#fff', fontWeight: 'bold' }}>{saving ? 'Saving…' : 'Save & Close'}</button>
        </>}
        {message && <span role="status" style={{ width: '100%', textAlign: 'center', color: message.includes('could not') || message.includes('too detailed') ? '#c5221f' : '#137333', fontWeight: 'bold', fontSize: '13px' }}>{message}</span>}
      </footer>

      {confirmingClose && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Unsaved scratchpad work"
          style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', padding: '20px' }}
        >
          <div style={{ width: 'min(460px, 100%)', padding: '22px 24px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 60px rgba(15,23,42,0.35)', textAlign: 'left' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#202124' }}>Save your work first?</h2>
            <p style={{ margin: '0 0 18px', color: '#3c4043', lineHeight: 1.5 }}>
              {pageCount === 1
                ? 'You have drawn on this scratchpad since it was last saved. Closing without saving deletes it.'
                : `You have ${pageCount} pages, with changes since the last save. Closing without saving deletes them.`}
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => save({ close: true })} disabled={saving} style={{ minHeight: 44, padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#188038', color: '#fff', fontWeight: 'bold' }}>
                {saving ? 'Saving…' : 'Save and close'}
              </button>
              <button type="button" onClick={() => setConfirmingClose(false)} disabled={saving} style={{ minHeight: 44, padding: '10px 16px', borderRadius: '8px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>
                Keep working
              </button>
              <button type="button" onClick={() => { setConfirmingClose(false); onClose?.(); }} disabled={saving} style={{ minHeight: 44, padding: '10px 16px', borderRadius: '8px', border: '1px solid #e0b4b0', background: '#fff', color: '#a50e0e', fontWeight: 'bold' }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

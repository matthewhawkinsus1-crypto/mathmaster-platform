import { MAX_SCREENSHOT_DATA_URL_BYTES, screenshotByteSize } from './teacherReviewScreenshot.js';

/*
 * Browser-side capture. Kept apart from teacherReviewScreenshot.js so the rules
 * about size and shape stay testable in node while the canvas work lives where
 * it can only run — in a browser.
 *
 * Screenshots arrive at whatever the teacher's display is, which on a modern
 * laptop means several megabytes. Refusing those would be technically correct
 * and useless: the teacher took the right picture. So MathMaster shrinks it
 * first and only refuses if it is still too big afterwards.
 */

const MAX_EDGE = 1600;

const loadImage = (dataUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('MathMaster could not read that image file.'));
  image.src = dataUrl;
});

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('MathMaster could not read that image file.'));
  reader.readAsDataURL(file);
});

/**
 * Shrink until it fits, then hand back a data URL.
 *
 * Quality is stepped down before dimensions are, because a smaller JPEG of the
 * whole screen stays readable while a cropped one loses the context that made
 * the screenshot worth taking.
 */
export const prepareScreenshotDataUrl = async (source) => {
  const original = typeof source === 'string' ? source : await readFileAsDataUrl(source);
  if (!/^data:image\//.test(original)) {
    throw new Error('Attach an image — a screenshot of the question as the student sees it.');
  }
  if (screenshotByteSize(original) > 0 && screenshotByteSize(original) <= MAX_SCREENSHOT_DATA_URL_BYTES) {
    return original;
  }

  const image = await loadImage(original);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width || 1, image.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.height || 1) * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare screenshots for upload.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const candidate = canvas.toDataURL('image/jpeg', quality);
    if (candidate.length <= MAX_SCREENSHOT_DATA_URL_BYTES) return candidate;
  }

  throw new Error('That screenshot is too large even after resizing. Capture just the part of the screen that is wrong.');
};

/** The clipboard path: teachers paste far more often than they pick a file. */
export const screenshotFileFromPaste = (event) => {
  const items = Array.from(event?.clipboardData?.items || []);
  const image = items.find((item) => String(item.type || '').startsWith('image/'));
  return image ? image.getAsFile() : null;
};

export default { prepareScreenshotDataUrl, screenshotFileFromPaste };

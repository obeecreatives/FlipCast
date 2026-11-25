import {
  createId,
  ImageElement,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from '../types/whiteboard';

const MAX_ENCODED_DIMENSION = 960;
const MAX_DATA_URL_CHARS = 165_000;
const MAX_INITIAL_DISPLAY_W = 780;
const MAX_INITIAL_DISPLAY_H = 500;

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal membaca file gambar.'));
    };
    img.src = objectUrl;
  });
}

function encodeCanvasCompact(canvas: HTMLCanvasElement): string {
  const attempts: { mime: string; quality: number }[] = [
    { mime: 'image/webp', quality: 0.84 },
    { mime: 'image/jpeg', quality: 0.82 },
    { mime: 'image/webp', quality: 0.68 },
    { mime: 'image/jpeg', quality: 0.66 },
    { mime: 'image/jpeg', quality: 0.5 },
  ];

  let best = '';
  for (const { mime, quality } of attempts) {
    try {
      const url = canvas.toDataURL(mime, quality);
      if (!url || !url.startsWith('data:image/')) continue;
      if (!best || url.length < best.length) {
        best = url;
      }
      if (url.length <= MAX_DATA_URL_CHARS) {
        return url;
      }
    } catch {
      // Try next encoder
    }
  }
  return best;
}

/**
 * Compresses & resizes a pasted/dropped/uploaded image Blob into a lightweight
 * ImageElement positioned cleanly on the 1280x720 virtual board so teachers can
 * immediately annotate over screenshots or exercises with zero lag across P2P & Cloud.
 */
export async function createImageElementFromBlob(
  blob: Blob,
  options?: { centerX?: number; centerY?: number }
): Promise<ImageElement> {
  if (!blob.type.startsWith('image/')) {
    throw new Error('File yang dipilih bukan gambar.');
  }

  const img = await loadImageFromBlob(blob);
  const origW = Math.max(1, img.naturalWidth || img.width);
  const origH = Math.max(1, img.naturalHeight || img.height);

  // Downscale pixel dimensions while keeping text/diagrams razor-sharp on 1280x720
  let encW = origW;
  let encH = origH;
  const maxDim = Math.max(origW, origH);
  if (maxDim > MAX_ENCODED_DIMENSION) {
    const ratio = MAX_ENCODED_DIMENSION / maxDim;
    encW = Math.max(1, Math.round(origW * ratio));
    encH = Math.max(1, Math.round(origH * ratio));
  }

  const offscreen = document.createElement('canvas');
  offscreen.width = encW;
  offscreen.height = encH;
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    throw new Error('Kanvas browser tidak tersedia.');
  }

  // Fill white backing before JPEG fallback so transparent PNG screenshots stay crisp
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, encW, encH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, encW, encH);

  let dataUrl = encodeCanvasCompact(offscreen);

  // Extra safety pass for ultra-dense screenshots so WebRTC & Firestore never choke
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    const shrink = document.createElement('canvas');
    shrink.width = Math.max(1, Math.round(encW * 0.7));
    shrink.height = Math.max(1, Math.round(encH * 0.7));
    const sCtx = shrink.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#FFFFFF';
      sCtx.fillRect(0, 0, shrink.width, shrink.height);
      sCtx.drawImage(offscreen, 0, 0, shrink.width, shrink.height);
      dataUrl = encodeCanvasCompact(shrink);
    }
  }

  // Initial board display size preserving exact aspect ratio
  const fitScale = Math.min(
    1,
    MAX_INITIAL_DISPLAY_W / origW,
    MAX_INITIAL_DISPLAY_H / origH
  );
  const minBoost = Math.max(origW, origH) < 220 ? Math.min(2, 260 / Math.max(origW, origH)) : 1;
  const displayW = Math.max(100, Math.round(origW * fitScale * minBoost));
  const displayH = Math.max(70, Math.round(origH * fitScale * minBoost));

  const targetCx = options?.centerX ?? VIRTUAL_WIDTH / 2;
  const targetCy = options?.centerY ?? VIRTUAL_HEIGHT / 2;
  const x = Math.round(
    Math.max(24, Math.min(VIRTUAL_WIDTH - displayW - 24, targetCx - displayW / 2))
  );
  const y = Math.round(
    Math.max(24, Math.min(VIRTUAL_HEIGHT - displayH - 24, targetCy - displayH / 2))
  );

  return {
    id: createId('img'),
    type: 'image',
    color: '#0F172A',
    size: 2,
    opacity: 1,
    x,
    y,
    width: displayW,
    height: displayH,
    src: dataUrl,
    naturalWidth: origW,
    naturalHeight: origH,
  };
}

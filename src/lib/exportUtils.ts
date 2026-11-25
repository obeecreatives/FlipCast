import { jsPDF } from 'jspdf';
import { FlipchartPage, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../types/whiteboard';
import { preloadElementsImages, renderBoardCanvas } from './canvasRenderer';

function renderPageToDataURL(page: FlipchartPage, scale = 2, footerLabel?: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = VIRTUAL_WIDTH * scale;
  canvas.height = VIRTUAL_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);
  renderBoardCanvas(ctx, page.background, page.elements);

  if (footerLabel) {
    ctx.save();
    ctx.font = '500 14px "DM Sans", system-ui, sans-serif';
    ctx.fillStyle =
      page.background === 'chalkboard' ? 'rgba(248, 250, 252, 0.55)' : 'rgba(15, 23, 42, 0.45)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(footerLabel, VIRTUAL_WIDTH - 24, VIRTUAL_HEIGHT - 16);
    ctx.restore();
  }

  return canvas.toDataURL('image/png', 1.0);
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function safeFileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'flipcast'
  );
}

export async function exportPageAsPNG(page: FlipchartPage, roomCode: string) {
  await preloadElementsImages(page.elements);
  const dataUrl = renderPageToDataURL(page, 2);
  if (!dataUrl) return;
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(dataUrl, `${safeFileSlug(roomCode)}-${safeFileSlug(page.name)}-${stamp}.png`);
}

export async function exportAllPagesAsPDF(
  pages: FlipchartPage[],
  roomTitle: string,
  roomCode: string
) {
  if (pages.length === 0) return;

  await Promise.all(pages.map((p) => preloadElementsImages(p.elements)));

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [VIRTUAL_WIDTH, VIRTUAL_HEIGHT],
    hotfixes: ['px_scaling'],
  });

  pages.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage([VIRTUAL_WIDTH, VIRTUAL_HEIGHT], 'landscape');
    }
    const footer = `${page.name}  ·  Halaman ${index + 1} / ${pages.length}`;
    const imgData = renderPageToDataURL(page, 1.5, footer);
    if (imgData) {
      pdf.addImage(imgData, 'PNG', 0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, undefined, 'FAST');
    }
  });

  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save(`${safeFileSlug(roomTitle || roomCode)}-flipcast-${stamp}.pdf`);
}

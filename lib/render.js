// 截圖合成：原圖 + 標註（紅框 / 遮蔽 / 文字）。原圖永不修改，匯出時才「扁平化」，
// 確保遮蔽後的機敏資料不會殘留在匯出的 HTML / PDF 中。
import { getImage } from './model.js';

const bitmapCache = new Map();
export async function loadBitmap(imageId) {
  if (bitmapCache.has(imageId)) return bitmapCache.get(imageId);
  const rec = await getImage(imageId);
  if (!rec) return null;
  const bmp = await createImageBitmap(rec.blob);
  bitmapCache.set(imageId, bmp);
  return bmp;
}

export const DEFAULT_TEXT_STYLE = { fontSize: 0, color: '#ffffff', bg: '#dc2626', border: '#dc2626' };

export function lineWidthFor(w, h) { return Math.max(3, Math.round(Math.max(w, h) / 320)); }
export function defaultFontSize(w, h) { return Math.max(16, Math.round(Math.max(w, h) / 60)); }

export function drawAnnotations(ctx, annotations, imgW, imgH, { selectedId = null } = {}) {
  const lw = lineWidthFor(imgW, imgH);
  for (const a of annotations || []) {
    ctx.save();
    if (a.kind === 'mask') {
      ctx.fillStyle = a.color || '#111827';
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (a.kind === 'box') {
      ctx.strokeStyle = a.color || '#e11d48';
      ctx.lineWidth = lw;
      ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = lw;
      roundRect(ctx, a.x, a.y, a.w, a.h, lw * 1.5);
      ctx.stroke();
    } else if (a.kind === 'text') {
      const fs = a.fontSize || defaultFontSize(imgW, imgH);
      ctx.font = `600 ${fs}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif`;
      const lines = String(a.text || '').split('\n');
      const pad = Math.round(fs * 0.45);
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), fs);
      const th = lines.length * fs * 1.3;
      a.w = tw + pad * 2; a.h = th + pad * 2; // 文字框大小由內容決定，供點選偵測使用
      if (a.bg && a.bg !== 'transparent') { ctx.fillStyle = a.bg; roundRect(ctx, a.x, a.y, a.w, a.h, pad * 0.6); ctx.fill(); }
      if (a.border && a.border !== 'transparent') { ctx.strokeStyle = a.border; ctx.lineWidth = Math.max(2, lw * 0.7); roundRect(ctx, a.x, a.y, a.w, a.h, pad * 0.6); ctx.stroke(); }
      ctx.fillStyle = a.color || '#fff';
      ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, a.x + pad, a.y + pad + i * fs * 1.3 + fs * 0.1));
    }
    ctx.restore();
    if (a.id === selectedId) {
      ctx.save();
      ctx.setLineDash([lw * 3, lw * 2]);
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = Math.max(2, lw * 0.6);
      ctx.strokeRect(a.x - lw * 2, a.y - lw * 2, a.w + lw * 4, a.h + lw * 4);
      ctx.restore();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderStep(canvas, step, opts = {}) {
  if (!step.imageId) return false;
  const bmp = await loadBitmap(step.imageId);
  if (!bmp) return false;
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  drawAnnotations(ctx, step.annotations, bmp.width, bmp.height, opts);
  return true;
}

// 匯出用：扁平化成單一圖片的 data URL
export async function flattenStep(step, { maxWidth = 1600, type = 'image/png', quality = 0.92 } = {}) {
  const full = document.createElement('canvas');
  if (!(await renderStep(full, step))) return null;
  if (full.width <= maxWidth) return full.toDataURL(type, quality);
  const s = maxWidth / full.width;
  const c = document.createElement('canvas');
  c.width = maxWidth; c.height = Math.round(full.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, c.width, c.height);
  return c.toDataURL(type, quality);
}

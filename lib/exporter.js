// 匯出：單一自足 HTML（圖片內嵌），可直接寄送、上傳內網，或列印／另存 PDF。
import { BRAND, fmtTime } from './model.js';
import { flattenStep } from './render.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const para = (s) => esc(s).replace(/\n/g, '<br>');

export async function buildHTML({ title, steps, meta = {} }, { format = 'png' } = {}) {
  const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const items = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const img = s.imageId ? await flattenStep(s, { type }) : null;
    items.push(`
    <section class="step" id="step-${i + 1}">
      <div class="num">${i + 1}</div>
      <div class="body">
        <h2>${esc(s.title || `步驟 ${i + 1}`)}</h2>
        ${s.description ? `<p>${para(s.description)}</p>` : ''}
        ${img ? `<img src="${img}" alt="步驟 ${i + 1} 截圖">` : ''}
      </div>
    </section>`);
  }
  const toc = steps.map((s, i) => `<li><a href="#step-${i + 1}">${esc(s.title || `步驟 ${i + 1}`)}</a></li>`).join('');
  const metaLine = [
    meta.version ? `版本 v${meta.version}` : '草稿',
    meta.publisher ? `發布者：${esc(meta.publisher)}` : '',
    `產出時間：${fmtTime(meta.at || Date.now())}`,
    `共 ${steps.length} 個步驟`,
  ].filter(Boolean).join('　·　');

  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="${esc(BRAND.name)} · ${BRAND.site}">
<title>${esc(title)}</title>
<style>
  :root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--brand:#1e3a8a;--accent:#e11d48}
  *{box-sizing:border-box} body{margin:0;background:#f8fafc;color:var(--ink);font:16px/1.7 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
  header{background:linear-gradient(120deg,#0f2a5f,#1e40af);color:#fff;padding:40px 24px}
  header .wrap,main,footer .wrap{max-width:960px;margin:0 auto}
  header h1{margin:0 0 8px;font-size:30px;line-height:1.3} header .meta{opacity:.85;font-size:14px}
  main{padding:24px 16px 48px}
  nav{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:24px}
  nav h3{margin:0 0 6px;font-size:15px;color:var(--muted)} nav ol{margin:0;padding-left:22px} nav a{color:var(--brand);text-decoration:none}
  .step{display:flex;gap:16px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:20px;break-inside:avoid}
  .num{flex:0 0 36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;display:grid;place-items:center}
  .body{flex:1;min-width:0} .body h2{margin:2px 0 6px;font-size:19px} .body p{margin:0 0 12px;color:#334155}
  .body img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
  footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px;padding:16px 24px;text-align:center}
  footer a{color:var(--brand)}
  @media print{body{background:#fff}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}nav{display:none}.step{border:none;padding:8px 0;page-break-inside:avoid}.num{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body>
<header><div class="wrap"><h1>${esc(title)}</h1><div class="meta">${metaLine}</div></div></header>
<main>
  ${steps.length > 1 ? `<nav><h3>目錄</h3><ol>${toc}</ol></nav>` : ''}
  ${items.join('\n')}
</main>
<footer><div class="wrap">本手冊由 ${esc(BRAND.name)} 製作 · 顧問服務與更多工具：<a href="${BRAND.url}">${BRAND.site}</a></div></footer>
</body></html>`;
}

export function downloadText(filename, text, mime = 'text/html') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFilename(s) {
  return (String(s || 'manual').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)) || 'manual';
}

// 列印 / 另存 PDF：在隱藏 iframe 中載入匯出內容後呼叫瀏覽器列印
export function printHTML(html) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const w = iframe.contentWindow;
    const imgs = [...iframe.contentDocument.images];
    Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))).then(() => {
      w.focus(); w.print();
      setTimeout(() => iframe.remove(), 60000);
    });
  };
  iframe.srcdoc = html;
}

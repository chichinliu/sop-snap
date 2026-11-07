// 背景 service worker：三種截圖範圍、滑鼠點擊錄製、快捷鍵、寫入目前手冊。
import * as M from './lib/model.js';

const CAPTURE_INTERVAL_MS = 550;      // Chrome 限制 captureVisibleTab 每秒最多 2 次
const MAX_FULLPAGE_PX = 30000;        // OffscreenCanvas 單邊上限約 32767px
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 擷取節流佇列 ----------
let captureChain = Promise.resolve();
let lastCaptureAt = 0;
function captureVisible(windowId) {
  const p = captureChain.then(async () => {
    const wait = lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCaptureAt = Date.now();
    return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  });
  captureChain = p.catch(() => {});
  return p;
}

async function dataURLToBitmap(dataURL) {
  const blob = await (await fetch(dataURL)).blob();
  return createImageBitmap(blob);
}
async function canvasToBlob(canvas) {
  return canvas.convertToBlob({ type: 'image/png' });
}

async function exec(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res ? res.result : undefined;
}

// ---------- 寫入手冊（含「單一步驟重新截圖」） ----------
let writeChain = Promise.resolve();
function addCapture(payload) {
  const p = writeChain.then(() => doAddCapture(payload));
  writeChain = p.catch(() => {});
  return p;
}

async function doAddCapture({ blob, width, height, title, description = '', annotations = [], source }) {
  const imageId = await M.saveImage(blob, width, height);
  const { retakeTarget } = await chrome.storage.local.get('retakeTarget');
  const settings = await M.getSettings();

  // 補上缺漏的截圖屬於基本功能，各方案皆可；替換既有截圖才是標準版功能
  if (retakeTarget && (M.can(settings, 'retake') || retakeTarget.fill)) {
    await chrome.storage.local.remove('retakeTarget');
    try {
      // 保留標題、說明與順序，只換截圖；舊標註座標已不適用，改用新的自動焦點。
      await M.updateDraft(retakeTarget.draftId, (d) => {
        const s = d.steps.find((x) => x.id === retakeTarget.stepId);
        if (!s) throw new Error('要重新截圖的步驟已不存在');
        s.imageId = imageId; s.type = 'image'; s.annotations = annotations; s.source = source; s.needsCapture = false;
        if (s.description && s.description.startsWith('⚠ 點擊後頁面立即跳轉')) s.description = '';
      });
      notify(retakeTarget.draftId, '已替換步驟截圖');
      return { replaced: true };
    } catch (err) {
      console.warn('[SOP Snap] retake failed, append instead:', err);
    }
  }

  const draft = await M.ensureCurrentDraft();
  if (!M.canEdit(settings, draft)) throw new Error('目前手冊為唯讀（角色或審核狀態限制）');
  const step = M.newStep({ title, description, imageId, annotations, source });
  await M.updateDraft(draft.id, (d) => { d.steps.push(step); });
  notify(draft.id, `已新增步驟 ${draft.steps.length + 1}`);
  return { added: true, stepId: step.id };
}

function notify(draftId, message) {
  chrome.runtime.sendMessage({ type: 'draft-updated', draftId, message }).catch(() => {});
  flashBadge('✓', '#16a34a');
}

async function flashBadge(text, color) {
  const rec = await recordingTabs();
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  setTimeout(async () => {
    const r = await recordingTabs();
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    await chrome.action.setBadgeText({ text: r.length ? 'REC' : '' });
  }, 1200);
  return rec;
}

// ---------- 三種截圖範圍 ----------
async function captureVisibleStep(tab) {
  const dataURL = await captureVisible(tab.windowId);
  const bmp = await dataURLToBitmap(dataURL);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  return addCapture({
    blob: await canvasToBlob(c), width: bmp.width, height: bmp.height,
    title: `擷取畫面：${tab.title || ''}`.trim(), source: { url: tab.url, mode: 'visible' },
  });
}

// 在頁面注入框選遮罩，回傳使用者拖曳的矩形（CSS px，viewport 座標）
function pageSelectRegion() {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(15,23,42,.25);';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;border:2px dashed #2563eb;background:rgba(37,99,235,.08);box-shadow:0 0 0 99999px rgba(15,23,42,.35);display:none;';
    const tip = document.createElement('div');
    tip.textContent = '拖曳框選擷取範圍（Esc 取消）';
    tip.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:6px 12px;border-radius:6px;';
    root.append(box, tip);
    document.documentElement.appendChild(root);
    let sx = 0, sy = 0, dragging = false;
    const done = (val) => {
      root.remove(); window.removeEventListener('keydown', onKey, true);
      // 等兩個 frame 讓遮罩從畫面上消失後再截圖
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(val)));
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('mousedown', (e) => {
      e.preventDefault(); dragging = true; sx = e.clientX; sy = e.clientY;
      root.style.background = 'transparent'; tip.style.display = 'none';
      Object.assign(box.style, { display: 'block', left: sx + 'px', top: sy + 'px', width: '0px', height: '0px' });
    });
    root.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - sx) + 'px', height: Math.abs(e.clientY - sy) + 'px' });
    });
    root.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      if (w < 8 || h < 8) { done(null); return; }
      done({ x, y, w, h, vw: window.innerWidth, vh: window.innerHeight });
    });
  });
}

async function captureRegionStep(tab) {
  const rect = await exec(tab.id, pageSelectRegion);
  if (!rect) return { cancelled: true };
  const dataURL = await captureVisible(tab.windowId);
  const bmp = await dataURLToBitmap(dataURL);
  const scale = bmp.width / rect.vw;
  const sx = Math.round(rect.x * scale), sy = Math.round(rect.y * scale);
  const w = Math.max(1, Math.min(Math.round(rect.w * scale), bmp.width - sx));
  const h = Math.max(1, Math.min(Math.round(rect.h * scale), bmp.height - sy));
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').drawImage(bmp, sx, sy, w, h, 0, 0, w, h);
  return addCapture({
    blob: await canvasToBlob(c), width: w, height: h,
    title: `框選擷取：${tab.title || ''}`.trim(), source: { url: tab.url, mode: 'region' },
  });
}

// 全頁捲動截圖：逐屏捲動擷取後拼接；第 2 屏起隱藏 fixed / sticky 元素避免重複出現。
// 很多 SPA 後台把內容放在「內層捲動容器」，文件本身不會捲動。
// 文件不可捲動時，找出畫面上面積最大、可垂直捲動的元素，改捲動它。
function pageMetrics() {
  const se = document.scrollingElement || document.documentElement;
  const vh = window.innerHeight, vw = window.innerWidth;
  const sh = Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const out = { sh, vh, vw, sx: window.scrollX, sy: window.scrollY, scroller: null };
  if (sh > vh + 4) return out;
  let best = null, bestArea = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollHeight <= el.clientHeight + 20 || el.clientHeight < 100) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (w * h > bestArea) { best = el; bestArea = w * h; }
  }
  if (!best || bestArea < vw * vh * 0.2) return out;
  document.querySelectorAll('[data-sopsnap-scroller]').forEach((n) => n.removeAttribute('data-sopsnap-scroller'));
  best.setAttribute('data-sopsnap-scroller', '');
  const r = best.getBoundingClientRect();
  // clientTop/clientLeft 扣掉邊框，clientWidth/clientHeight 不含捲軸
  out.scroller = {
    left: r.left + best.clientLeft, top: r.top + best.clientTop,
    w: best.clientWidth, h: best.clientHeight, sh: best.scrollHeight, st: best.scrollTop,
  };
  return out;
}
function pageScrollTo(y, inner) {
  return new Promise((resolve) => {
    const el = inner ? document.querySelector('[data-sopsnap-scroller]') : null;
    if (el) el.scrollTop = y; else window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    setTimeout(() => resolve(el ? el.scrollTop : window.scrollY), 250); // 給 lazy-load 與重繪一點時間
  });
}
function pageCleanupScroller() {
  document.querySelectorAll('[data-sopsnap-scroller]').forEach((n) => n.removeAttribute('data-sopsnap-scroller'));
}
function pageHideFixed(hide) {
  if (hide) {
    for (const el of document.querySelectorAll('body *')) {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        el.setAttribute('data-sopsnap-hidden', el.style.visibility || '');
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    }
  } else {
    for (const el of document.querySelectorAll('[data-sopsnap-hidden]')) {
      const prev = el.getAttribute('data-sopsnap-hidden');
      el.style.removeProperty('visibility');
      if (prev) el.style.visibility = prev;
      el.removeAttribute('data-sopsnap-hidden');
    }
  }
}

async function captureFullStep(tab) {
  const m = await exec(tab.id, pageMetrics);
  const sc = m.scroller;                       // 內層捲動模式
  const viewH = sc ? sc.h : m.vh;
  const totalCss = sc ? sc.sh : m.sh;
  const frames = [];
  let truncated = false;
  try {
    let y = 0;
    for (let i = 0; ; i++) {
      const actualY = await exec(tab.id, pageScrollTo, [y, !!sc]);
      if (i === 1) await exec(tab.id, pageHideFixed, [true]);
      const bmp = await dataURLToBitmap(await captureVisible(tab.windowId));
      frames.push({ y: actualY, bmp });
      const scale = bmp.width / m.vw;
      if (actualY + viewH >= totalCss - 1) break;
      if ((actualY + m.vh) * scale >= MAX_FULLPAGE_PX) { truncated = true; break; }
      if (i > 0 && actualY <= frames[i - 1].y) break; // 無法再捲動
      y = actualY + viewH;
    }
  } finally {
    await exec(tab.id, pageHideFixed, [false]).catch(() => {});
    await exec(tab.id, pageScrollTo, [sc ? sc.st : m.sy, !!sc]).catch(() => {});
    if (sc) await exec(tab.id, pageCleanupScroller).catch(() => {});
  }
  const scale = frames[0].bmp.width / m.vw;
  const last = frames[frames.length - 1];
  let c;
  if (!sc) {
    const totalH = Math.min(Math.round(last.y * scale + last.bmp.height), MAX_FULLPAGE_PX);
    c = new OffscreenCanvas(frames[0].bmp.width, totalH);
    const ctx = c.getContext('2d');
    for (const f of frames) ctx.drawImage(f.bmp, 0, Math.round(f.y * scale));
  } else {
    // 第一屏完整保留（含頁首、側欄）；之後每屏只裁切容器區塊，往下延伸拼接；
    // 容器下方若還有內容（例如頁尾），取最後一屏接在最底部。
    const S = (v) => Math.round(v * scale);
    const box = { x: S(sc.left), y: S(sc.top), w: S(sc.w), h: S(sc.h) };
    const extra = S(last.y);
    const below = Math.max(0, last.bmp.height - (box.y + box.h));
    const totalH = Math.min(box.y + extra + box.h + below, MAX_FULLPAGE_PX);
    c = new OffscreenCanvas(frames[0].bmp.width, totalH);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(frames[0].bmp, 0, 0, frames[0].bmp.width, box.y + box.h, 0, 0, frames[0].bmp.width, box.y + box.h);
    for (const f of frames.slice(1)) {
      ctx.drawImage(f.bmp, box.x, box.y, box.w, box.h, box.x, box.y + S(f.y), box.w, box.h);
    }
    if (below) ctx.drawImage(last.bmp, 0, box.y + box.h, last.bmp.width, below, 0, box.y + extra + box.h, last.bmp.width, below);
  }
  return addCapture({
    blob: await canvasToBlob(c), width: c.width, height: c.height,
    title: `全頁截圖：${tab.title || ''}`.trim(),
    description: truncated ? '（頁面過長，已截取前段）' : '',
    source: { url: tab.url, mode: sc ? 'full-inner' : 'full' },
  });
}

// ---------- 滑鼠點擊錄製 ----------
async function recordingTabs() {
  const { recording } = await chrome.storage.session.get('recording');
  return recording || [];
}
async function setRecording(tabId, on) {
  let r = await recordingTabs();
  r = r.filter((id) => id !== tabId);
  if (on) r.push(tabId);
  await chrome.storage.session.set({ recording: r });
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  await chrome.action.setBadgeText({ text: r.length ? 'REC' : '' });
  if (on) {
    // 錄製開始前就已開啟的分頁沒有 content script，補注入一次（已載入時為 no-op）
    await chrome.scripting.executeScript({ target: { tabId }, files: ['recorder.js'] }).catch(() => {});
    await chrome.tabs.sendMessage(tabId, { type: 'recorder-start' }).catch(() => {});
  } else await chrome.tabs.sendMessage(tabId, { type: 'recorder-stop' }).catch(() => {});
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  baselines.delete(tabId);
  const r = await recordingTabs();
  if (r.includes(tabId)) await setRecording(tabId, false);
});

// 點擊後頁面若立刻跳轉，captureVisibleTab 會失敗（image readback failed）。
// 因此每次頁面載入完成時先拍一張「基準畫面」，擷取失敗時用它補位；連基準畫面都沒有時，
// 仍保留步驟並提示補截圖，絕不默默漏掉步驟。
const baselines = new Map(); // tabId -> { url, scrollY, dataURL }

async function refreshBaseline(tab, scrollY) {
  try {
    const t = await chrome.tabs.get(tab.id);
    if (!t.active || t.url !== tab.url) return;
    const dataURL = await captureVisible(t.windowId);
    const now = await chrome.tabs.get(tab.id);
    if (now.url === tab.url) baselines.set(tab.id, { url: tab.url, scrollY, dataURL });
  } catch (err) { /* 基準畫面只是備援，失敗不影響主流程 */ }
}

function addPlaceholderStep({ title, description, source }) {
  const p = writeChain.then(async () => {
    const draft = await M.ensureCurrentDraft();
    const step = M.newStep({ title, description, source });
    step.needsCapture = true;
    await M.updateDraft(draft.id, (d) => { d.steps.push(step); });
    chrome.runtime.sendMessage({ type: 'draft-updated', draftId: draft.id, message: '有一步未能截圖，已標示待補' }).catch(() => {});
    flashBadge('!', '#d97706');
    return { added: true, placeholder: true, stepId: step.id };
  });
  writeChain = p.catch(() => {});
  return p;
}

async function onRecordedClick(msg, sender) {
  const tab = sender.tab;
  let dataURL = null, fromBaseline = false, shotScrollY = msg.scrollY || 0;
  try {
    dataURL = await captureVisible(tab.windowId);
  } catch (err) {
    console.warn('[SOP Snap] click capture failed, trying fallback:', err.message);
    const now = await chrome.tabs.get(tab.id).catch(() => null);
    if (now && now.url === tab.url && now.status === 'complete') {
      try { dataURL = await captureVisible(tab.windowId); } catch { /* fall through */ }
    }
    const b = baselines.get(tab.id);
    if (!dataURL && b && b.url === tab.url) { dataURL = b.dataURL; fromBaseline = true; shotScrollY = b.scrollY; }
  }
  if (!dataURL) {
    return addPlaceholderStep({
      title: msg.label,
      description: '⚠ 點擊後頁面立即跳轉，這一步未能截圖。請按「補上截圖」，回到該頁面重新擷取。',
      source: { url: tab.url, mode: 'click' },
    });
  }
  const bmp = await dataURLToBitmap(dataURL);
  const scale = bmp.width / msg.vw;
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  const pad = 6 * scale;
  const r = msg.rect;
  // 基準畫面若與點擊時的捲動位置不同，換算元素在基準畫面中的位置
  const dy = (msg.scrollY || 0) - shotScrollY;
  const y = (r ? r.y + dy : 0) * scale;
  const annotations = r && r.w > 0 && r.h > 0 && y + r.h * scale > 0 && y < bmp.height ? [{
    id: M.uid('a_'), kind: 'box', auto: true,
    x: Math.max(0, r.x * scale - pad), y: Math.max(0, y - pad),
    w: r.w * scale + pad * 2, h: r.h * scale + pad * 2,
  }] : [];
  return addCapture({
    blob: await canvasToBlob(c), width: bmp.width, height: bmp.height,
    title: msg.label, annotations,
    description: fromBaseline ? '（點擊後頁面立即跳轉，截圖取自進入此頁時的畫面）' : '',
    source: { url: tab.url, mode: 'click' },
  });
}

// ---------- 指令路由 ----------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function runCapture(mode, tab) {
  tab = tab || await activeTab();
  if (!tab || !/^(https?|file):/.test(tab.url || '')) {
    throw new Error('此頁面無法擷取（Chrome 內部頁面或擴充功能商店受瀏覽器保護）');
  }
  if (mode === 'visible') return captureVisibleStep(tab);
  if (mode === 'region') return captureRegionStep(tab);
  if (mode === 'full') return captureFullStep(tab);
  throw new Error('未知的擷取模式');
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  try {
    if (command === 'toggle-recording') {
      tab = tab || await activeTab();
      const on = !(await recordingTabs()).includes(tab.id);
      await setRecording(tab.id, on);
      return;
    }
    await runCapture(command.replace('capture-', ''), tab);
  } catch (err) {
    console.warn('[SOP Snap]', err);
    flashBadge('ERR', '#dc2626');
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    capture: () => runCapture(msg.mode),
    'recorded-click': () => onRecordedClick(msg, sender),
    'set-recording': async () => { await setRecording(msg.tabId, msg.on); return { on: msg.on }; },
    'get-recording': async () => ({ tabs: await recordingTabs() }),
    'recorder-hello': async () => ({ recording: !!sender.tab && (await recordingTabs()).includes(sender.tab.id) }),
    'recorder-baseline': async () => {
      if (sender.tab && (await recordingTabs()).includes(sender.tab.id)) refreshBaseline(sender.tab, msg.scrollY || 0);
      return {};
    },
  };
  const h = handlers[msg && msg.type];
  if (!h) return false;
  h().then((r) => sendResponse({ ok: true, ...(r || {}) }), (err) => {
    console.warn('[SOP Snap]', msg.type, err);
    if (msg.type === 'recorded-click') flashBadge('ERR', '#dc2626');
    sendResponse({ ok: false, error: String(err.message || err) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?welcome=1') });
});

// 供自動化測試與除錯使用（DevTools console：__sopsnap.runCapture('visible')）
globalThis.__sopsnap = { runCapture, setRecording };

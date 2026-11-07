import * as M from './lib/model.js';
import { renderStep, drawAnnotations, loadBitmap, defaultFontSize, flattenStep } from './lib/render.js';
import { buildHTML, downloadText, safeFilename, printHTML } from './lib/exporter.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
};

const state = { settings: null, draft: null, drafts: [], q: '', folder: '', retake: null };
const cards = new Map(); // stepId -> { root, sig }

function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false; t.classList.toggle('err', err);
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
const editable = () => M.canEdit(state.settings, state.draft);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- 載入 ----------
async function init() {
  state.settings = await M.getSettings();
  const params = new URLSearchParams(location.search);
  if (params.get('welcome')) $('welcome').hidden = false;
  const wanted = params.get('id');
  if (wanted && await M.getDraft(wanted)) await M.setCurrentDraftId(wanted);
  await loadCurrent();
  bindStatic();
}

async function loadCurrent() {
  state.draft = await M.ensureCurrentDraft();
  const { retakeTarget } = await chrome.storage.local.get('retakeTarget');
  state.retake = retakeTarget || null;
  await renderAll();
}

async function reloadDraft() {
  const d = await M.getDraft(state.draft.id);
  if (!d) return loadCurrent();
  state.draft = d;
  renderHeader(); renderSteps(); renderLibrary();
}

async function renderAll() {
  applyPlanVisibility();
  renderHeader();
  await renderLibrary();
  renderSteps();
}

function applyPlanVisibility() {
  for (const node of document.querySelectorAll('[data-feature]')) {
    node.hidden = !M.can(state.settings, node.dataset.feature);
  }
  const plan = M.PLANS[state.settings.plan];
  $('planBadge').textContent = plan.label;
  $('libTitle').textContent = M.can(state.settings, 'library') ? '團隊手冊庫' : M.can(state.settings, 'multiDraft') ? '我的手冊' : '目前手冊';
}

// ---------- 標題列 / 工作流程 ----------
function renderHeader() {
  const d = state.draft, s = state.settings;
  const titleInput = $('title');
  if (document.activeElement !== titleInput) titleInput.value = d.title;
  titleInput.disabled = !editable();
  $('status').className = `status ${d.status}`;
  $('status').textContent = M.STATUS[d.status] + (d.latestVersion ? `・現行 v${d.latestVersion}` : '');
  $('status').hidden = !M.can(s, 'review');
  const folder = $('folder');
  if (document.activeElement !== folder) folder.value = d.folder || '';
  folder.disabled = !editable();
  $('meta').textContent = `${d.steps.length} 個步驟・最後更新 ${M.fmtTime(d.updatedAt)}`;
  $('btnDeleteDraft').hidden = !M.can(s, 'multiDraft') || (M.can(s, 'roles') && s.role !== 'admin');
  $('btnAddText').disabled = !editable();

  const ro = $('readonlyBanner');
  if (!editable()) {
    ro.hidden = false;
    ro.textContent = s.role === 'viewer'
      ? '你目前的角色是「檢視者」，只能查閱與匯出手冊。'
      : '此手冊正在審核中，管理員核准或退回前無法編輯。';
  } else ro.hidden = true;

  const rb = $('restoredBanner');
  if (d.restoredFrom && d.status === 'draft') {
    rb.hidden = false;
    rb.innerHTML = '';
    rb.append(`已將 v${d.restoredFrom.version} 恢復為草稿（${M.fmtTime(d.restoredFrom.at)}），請編修後重新送審。 `,
      el('button', { text: '撤銷恢復', onclick: undoRestore }), ' ',
      el('button', { text: '隱藏', onclick: () => M.updateDraft(d.id, (x) => { x.restoredFrom = null; }, { content: false }).then(reloadDraft) }));
  } else rb.hidden = true;

  renderWorkflow();
}

function renderWorkflow() {
  const box = $('workflow');
  box.innerHTML = '';
  const s = state.settings, d = state.draft;
  if (!M.can(s, 'review')) return;
  const isAdmin = M.canPublish(s);
  if (d.status === 'in_review') {
    const info = d.review ? `${d.review.by || '同仁'} 於 ${M.fmtTime(d.review.at)} 送審` : '';
    if (isAdmin) {
      box.append(
        el('button', { class: 'primary', text: '核准發布', title: info, onclick: () => openPublish('approve') }),
        el('button', { text: '退回修改', onclick: rejectReview }),
      );
    } else box.append(el('span', { class: 'small', text: `審核中 ${info}` }));
  } else if (s.role !== 'viewer') {
    if (d.status !== 'published' || !d.latestVersion) {
      box.append(el('button', { text: '送審', disabled: !d.steps.length, onclick: () => openPublish('submit') }));
      if (isAdmin) box.append(el('button', { class: 'primary', text: '直接發布', disabled: !d.steps.length, onclick: () => openPublish('publish') }));
    }
  }
  if (d.latestVersion) box.append(el('button', { text: `檢視現行版 v${d.latestVersion}`, onclick: viewCurrentVersion }));
}

// ---------- 手冊庫 ----------
async function renderLibrary() {
  const s = state.settings;
  let drafts = M.can(s, 'multiDraft') ? await M.listDrafts() : [state.draft];
  state.drafts = drafts;
  // 資料夾選項
  const folders = [...new Set(drafts.map((d) => d.folder).filter(Boolean))].sort();
  const ff = $('folderFilter');
  const keep = state.folder;
  ff.innerHTML = '';
  ff.append(el('option', { value: '', text: '全部資料夾' }), ...folders.map((f) => el('option', { value: f, text: f })));
  ff.value = folders.includes(keep) ? keep : '';
  $('folderOptions').innerHTML = '';
  $('folderOptions').append(...folders.map((f) => el('option', { value: f })));

  if (M.can(s, 'library')) {
    const q = state.q.trim().toLowerCase();
    drafts = drafts.filter((d) => (!state.folder || d.folder === state.folder) &&
      (!q || d.title.toLowerCase().includes(q) || d.steps.some((st) => `${st.title} ${st.description}`.toLowerCase().includes(q))));
  }
  const list = $('draftList');
  list.innerHTML = '';
  for (const d of drafts) {
    const li = el('li', { class: d.id === state.draft.id ? 'active' : '', onclick: () => switchDraft(d.id) },
      el('span', { class: 't', text: d.title }),
      el('span', { class: 's' },
        d.folder && M.can(s, 'library') ? el('span', { class: 'folder-tag', text: d.folder }) : null,
        `${d.steps.length} 步・${M.can(s, 'review') ? M.STATUS[d.status] + '・' : ''}${M.fmtTime(d.updatedAt)}`));
    list.append(li);
  }
  if (!drafts.length) list.append(el('li', { class: 'muted', text: '找不到符合的手冊' }));
}

async function switchDraft(id) {
  if (id === state.draft.id) return;
  await M.setCurrentDraftId(id);
  cards.clear();
  $('steps').innerHTML = '';
  await loadCurrent();
}

// ---------- 步驟 ----------
const stepSig = (s, i, ro) => JSON.stringify([s.imageId, s.annotations, i, ro, state.retake && state.retake.stepId === s.id]);

function renderSteps() {
  const d = state.draft;
  const wrap = $('steps');
  $('empty').hidden = d.steps.length > 0;
  const ro = !editable();
  const seen = new Set();
  const multi = M.can(state.settings, 'retake');

  d.steps.forEach((s, i) => {
    seen.add(s.id);
    let c = cards.get(s.id);
    const sig = stepSig(s, i, ro);
    if (c && c.hasImage !== !!s.imageId) { c.root.remove(); c.insert.remove(); cards.delete(s.id); c = null; } // 補上截圖後改建卡片
    if (!c) {
      c = buildCard(s);
      cards.set(s.id, c);
    }
    // 更新文字（不打斷正在輸入的欄位）
    const t = c.root.querySelector('.st-title'), ds = c.root.querySelector('.st-desc');
    if (document.activeElement !== t) t.value = s.title || '';
    if (document.activeElement !== ds) ds.value = s.description || '';
    t.disabled = ds.disabled = ro;
    c.root.querySelector('.num').textContent = i + 1;
    c.root.classList.toggle('retake-pending', !!(state.retake && state.retake.stepId === s.id));
    for (const b of c.root.querySelectorAll('.ops button, .shot-actions button, .needs-capture button')) b.disabled = ro;
    const retakeBtn = c.root.querySelector('.btn-retake');
    if (retakeBtn) retakeBtn.hidden = !multi;
    c.root.querySelector('.btn-up').disabled = ro || i === 0;
    c.root.querySelector('.btn-down').disabled = ro || i === d.steps.length - 1;
    c.root.draggable = false;
    if (c.sig !== sig) {
      c.sig = sig;
      const canvas = c.root.querySelector('canvas');
      if (canvas) renderStep(canvas, s);
    }
  });
  for (const [id, c] of cards) if (!seen.has(id)) { c.root.remove(); c.insert.remove(); cards.delete(id); }

  // 依序排列（只有順序不同時才移動節點，避免輸入框失焦）
  const desired = d.steps.flatMap((s) => [cards.get(s.id).root, cards.get(s.id).insert]);
  const current = [...wrap.children];
  if (desired.length !== current.length || desired.some((n, i) => n !== current[i])) wrap.append(...desired);
}

function buildCard(s) {
  const id = s.id;
  const saver = (field) => debounce((value) => M.updateDraft(state.draft.id, (d) => {
    const st = d.steps.find((x) => x.id === id); if (st) st[field] = value;
  }).then((d) => { state.draft = d; renderHeader(); renderLibrary(); }).catch((err) => toast(err.message, true)), 400);
  const saveTitle = saver('title'), saveDesc = saver('description');

  const shot = s.imageId ? el('div', { class: 'shot', onclick: (e) => { if (!e.target.closest('button') && editable()) openAnnotator(id); } },
    el('canvas'),
    el('div', { class: 'shot-actions' },
      el('button', { text: '編輯標註', onclick: () => openAnnotator(id) }),
      el('button', { class: 'btn-retake', text: '重新截圖', title: '下一次擷取將取代這一步的截圖，保留標題、說明與順序', onclick: () => startRetake(id) }))) : null;

  const root = el('article', { class: `step${s.imageId ? '' : ' text-step'}`, 'data-id': id },
    el('div', { class: 'handle', title: '拖曳排序', text: '⋮⋮',
      onmousedown: () => { if (editable()) root.draggable = true; } }),
    el('div', { class: 'num' }),
    el('div', { class: 'content' },
      el('input', { class: 'st-title', placeholder: s.imageId ? '操作說明（例如：點擊「新增」按鈕）' : '段落標題', oninput: (e) => saveTitle(e.target.value) }),
      el('textarea', { class: 'st-desc', rows: 2, placeholder: '補充說明（選填）', oninput: (e) => saveDesc(e.target.value) }),
      shot,
      !s.imageId && s.needsCapture ? el('div', { class: 'needs-capture' },
        el('span', { text: '這一步還沒有截圖' }),
        el('button', { class: 'primary', text: '補上截圖', onclick: () => startRetake(id) })) : null,
      s.source && s.source.url ? el('div', { class: 'src', text: s.source.url, title: s.source.url }) : null),
    el('div', { class: 'ops' },
      el('button', { class: 'btn-up', title: '上移', text: '↑', onclick: () => moveStep(id, -1) }),
      el('button', { class: 'btn-down', title: '下移', text: '↓', onclick: () => moveStep(id, 1) }),
      el('button', { title: '刪除步驟', text: '✕', onclick: () => deleteStep(id) })));

  root.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/sopsnap-step', id); e.dataTransfer.effectAllowed = 'move'; root.classList.add('dragging'); });
  root.addEventListener('dragend', () => { root.classList.remove('dragging'); root.draggable = false; clearDrop(); });
  root.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/sopsnap-step')) { e.preventDefault(); clearDrop(); root.classList.add('drop-before'); } });
  root.addEventListener('drop', (e) => {
    e.preventDefault(); clearDrop();
    const from = e.dataTransfer.getData('text/sopsnap-step');
    if (from && from !== id) reorder(from, id);
  });

  const insert = el('div', { class: 'insert' }, el('button', { text: '＋ 在此插入文字步驟', onclick: () => addTextStep(id) }));
  return { root, insert, sig: null, hasImage: !!s.imageId };
}
function clearDrop() { document.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before')); }

async function mutate(fn, opts) {
  try {
    state.draft = await M.updateDraft(state.draft.id, fn, opts);
    renderHeader(); renderSteps(); renderLibrary();
  } catch (err) { toast(err.message, true); }
}

function moveStep(id, delta) {
  return mutate((d) => {
    const i = d.steps.findIndex((s) => s.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= d.steps.length) return;
    [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]];
  });
}
function reorder(fromId, beforeId) {
  return mutate((d) => {
    const i = d.steps.findIndex((s) => s.id === fromId);
    const [st] = d.steps.splice(i, 1);
    const j = d.steps.findIndex((s) => s.id === beforeId);
    d.steps.splice(j, 0, st);
  });
}
function deleteStep(id) {
  const s = state.draft.steps.find((x) => x.id === id);
  if (!confirm(`刪除步驟「${s.title || '未命名'}」？`)) return;
  return mutate((d) => { d.steps = d.steps.filter((x) => x.id !== id); });
}
function addTextStep(afterId) {
  const st = M.newStep({ title: '', description: '' });
  return mutate((d) => {
    const i = afterId ? d.steps.findIndex((s) => s.id === afterId) : -1;
    if (i >= 0) d.steps.splice(i + 1, 0, st); else d.steps.push(st);
  }).then(() => { const c = cards.get(st.id); if (c) c.root.querySelector('.st-title').focus(); });
}

async function startRetake(id) {
  const s = state.draft.steps.find((x) => x.id === id);
  const idx = state.draft.steps.indexOf(s) + 1;
  const target = { draftId: state.draft.id, stepId: id, label: `步驟 ${idx}：${s.title || ''}`, fill: !s.imageId };
  await chrome.storage.local.set({ retakeTarget: target });
  state.retake = target;
  renderSteps();
  toast('請切換到目標網頁，用工具列圖示或快捷鍵擷取；新截圖會取代這一步。');
}

async function undoRestore() {
  const prev = state.draft.restoredFrom && state.draft.restoredFrom.previousSteps;
  if (!prev) return;
  await mutate((d) => { d.steps = prev; d.restoredFrom = null; }, { content: false });
  toast('已撤銷恢復，回到原本的草稿內容');
}

// ---------- 標註編輯器 ----------
const ann = { stepId: null, list: [], history: [], future: [], tool: 'select', selected: null, bmp: null, drag: null };

async function openAnnotator(stepId) {
  if (!editable()) return;
  const s = state.draft.steps.find((x) => x.id === stepId);
  if (!s || !s.imageId) return;
  ann.stepId = stepId;
  ann.list = JSON.parse(JSON.stringify(s.annotations || []));
  ann.history = []; ann.future = []; ann.selected = null; ann.drag = null;
  ann.bmp = await loadBitmap(s.imageId);
  setTool('box');
  $('annDlg').showModal();
  drawAnn(); renderProps();
}

function setTool(t) {
  if (t === 'text' && !M.can(state.settings, 'textAnnotation')) t = 'select';
  ann.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t);
  $('annCanvas').style.cursor = t === 'select' ? 'default' : 'crosshair';
}
function pushHistory() { ann.history.push(JSON.stringify(ann.list)); ann.future = []; if (ann.history.length > 100) ann.history.shift(); }

function drawAnn() {
  const c = $('annCanvas');
  c.width = ann.bmp.width; c.height = ann.bmp.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(ann.bmp, 0, 0);
  drawAnnotations(ctx, ann.list, c.width, c.height, { selectedId: ann.selected });
  if (ann.drag && ann.drag.mode === 'create') {
    const r = normRect(ann.drag);
    ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
  }
  $('annUndo').disabled = !ann.history.length;
  $('annRedo').disabled = !ann.future.length;
  $('annDelete').disabled = !ann.selected;
  $('annRemoveAuto').disabled = !ann.list.some((a) => a.auto);
}
const normRect = (d) => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });

function toImg(e) {
  const c = $('annCanvas'), r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height), k: c.width / r.width };
}
function hit(p) {
  for (let i = ann.list.length - 1; i >= 0; i--) {
    const a = ann.list[i];
    if (p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h) return a;
  }
  return null;
}

function bindAnnotator() {
  const c = $('annCanvas');
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  c.addEventListener('pointerdown', (e) => {
    const p = toImg(e);
    c.setPointerCapture(e.pointerId);
    if (ann.tool === 'select') {
      const sel = ann.list.find((a) => a.id === ann.selected);
      const handle = 14 * p.k;
      if (sel && sel.kind !== 'text' && Math.abs(p.x - (sel.x + sel.w)) < handle && Math.abs(p.y - (sel.y + sel.h)) < handle) {
        pushHistory(); ann.drag = { mode: 'resize', a: sel, ox: p.x, oy: p.y, ow: sel.w, oh: sel.h };
      } else {
        const a = hit(p);
        ann.selected = a ? a.id : null;
        if (a) { pushHistory(); ann.drag = { mode: 'move', a, ox: p.x - a.x, oy: p.y - a.y, moved: false }; }
      }
      renderProps();
    } else if (ann.tool === 'text') {
      pushHistory();
      const a = { id: M.uid('a_'), kind: 'text', x: p.x, y: p.y, w: 0, h: 0, text: '說明文字',
        fontSize: defaultFontSize(c.width, c.height), color: '#ffffff', bg: '#e11d48', border: '#e11d48' };
      ann.list.push(a); ann.selected = a.id;
      setTool('select'); renderProps();
      setTimeout(() => { const ta = $('annProps').querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } }, 0);
    } else {
      ann.drag = { mode: 'create', x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
    drawAnn();
  });
  c.addEventListener('pointermove', (e) => {
    if (!ann.drag) {
      if (ann.tool === 'select') {
        const p = toImg(e); const sel = ann.list.find((a) => a.id === ann.selected);
        const near = sel && sel.kind !== 'text' && Math.abs(p.x - (sel.x + sel.w)) < 14 * p.k && Math.abs(p.y - (sel.y + sel.h)) < 14 * p.k;
        c.style.cursor = near ? 'nwse-resize' : hit(p) ? 'move' : 'default';
      }
      return;
    }
    const p = toImg(e), d = ann.drag;
    if (d.mode === 'create') { d.x1 = p.x; d.y1 = p.y; }
    else if (d.mode === 'move') { d.a.x = p.x - d.ox; d.a.y = p.y - d.oy; d.moved = true; }
    else if (d.mode === 'resize') { d.a.w = Math.max(8, d.ow + p.x - d.ox); d.a.h = Math.max(8, d.oh + p.y - d.oy); }
    drawAnn();
  });
  c.addEventListener('pointerup', () => {
    const d = ann.drag; ann.drag = null;
    if (!d) return;
    if (d.mode === 'create') {
      const r = normRect(d);
      if (r.w > 6 && r.h > 6) {
        pushHistory();
        const a = { id: M.uid('a_'), kind: ann.tool, ...r };
        ann.list.push(a); ann.selected = a.id; renderProps();
      }
    } else if (d.mode === 'move' && !d.moved) ann.history.pop();
    drawAnn();
  });

  $('annDelete').onclick = () => { if (!ann.selected) return; pushHistory(); ann.list = ann.list.filter((a) => a.id !== ann.selected); ann.selected = null; renderProps(); drawAnn(); };
  $('annRemoveAuto').onclick = () => { pushHistory(); ann.list = ann.list.filter((a) => !a.auto); ann.selected = null; renderProps(); drawAnn(); };
  $('annUndo').onclick = () => { if (!ann.history.length) return; ann.future.push(JSON.stringify(ann.list)); ann.list = JSON.parse(ann.history.pop()); ann.selected = null; renderProps(); drawAnn(); };
  $('annRedo').onclick = () => { if (!ann.future.length) return; ann.history.push(JSON.stringify(ann.list)); ann.list = JSON.parse(ann.future.pop()); ann.selected = null; renderProps(); drawAnn(); };
  $('annReset').onclick = () => { if (!ann.list.length) return; pushHistory(); ann.list = []; ann.selected = null; renderProps(); drawAnn(); };
  $('annCancel').onclick = () => $('annDlg').close();
  $('annSave').onclick = async () => {
    const list = ann.list, id = ann.stepId;
    $('annDlg').close();
    await mutate((d) => { const s = d.steps.find((x) => x.id === id); if (s) s.annotations = list; });
    toast('標註已儲存');
  };
  $('annDlg').addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && ann.selected) { e.preventDefault(); $('annDelete').click(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('annRedo') : $('annUndo')).click(); }
  });
}

function renderProps() {
  const box = $('annProps');
  const a = ann.list.find((x) => x.id === ann.selected);
  box.innerHTML = '';
  if (!a) {
    box.append(el('p', { class: 'muted' }, '工具：▢ 紅框框定重點、■ 遮蔽機敏資料' + (M.can(state.settings, 'textAnnotation') ? '、T 在圖上加文字。' : '。'),
      el('br'), '選取模式可拖曳移動，拖曳右下角可縮放。', el('br'), '遮蔽區塊在匯出時會直接燒進圖片，原始內容不會外流。'));
    return;
  }
  const kindName = { box: '紅框', mask: '遮蔽', text: '文字標註' }[a.kind];
  box.append(el('b', { text: kindName + (a.auto ? '（自動焦點）' : '') }));
  const change = (fn) => { pushHistory(); fn(); drawAnn(); };
  const colorField = (label, key, allowNone, def) => {
    const none = el('input', { type: 'checkbox' });
    const inp = el('input', { type: 'color', value: a[key] && a[key] !== 'transparent' ? a[key] : def });
    none.checked = a[key] === 'transparent';
    inp.disabled = none.checked;
    inp.oninput = () => { change(() => { a[key] = inp.value; }); };
    none.onchange = () => { inp.disabled = none.checked; change(() => { a[key] = none.checked ? 'transparent' : inp.value; }); };
    return el('label', {}, label, el('span', { class: 'color-row' }, inp, allowNone ? el('span', { class: 'small' }, none, ' 無') : null));
  };
  if (a.kind === 'text') {
    const ta = el('textarea', { rows: 3 }); ta.value = a.text;
    let first = true;
    ta.oninput = () => { if (first) { pushHistory(); first = false; } a.text = ta.value; drawAnn(); };
    const fs = el('input', { type: 'number', min: 8, max: 200, value: Math.round(a.fontSize) });
    fs.onchange = () => change(() => { a.fontSize = Math.max(8, Number(fs.value) || 16); });
    box.append(el('label', {}, '文字內容', ta), el('label', {}, '字級（px）', fs),
      colorField('字色', 'color', false, '#ffffff'), colorField('底色', 'bg', true, '#e11d48'), colorField('邊框色', 'border', true, '#e11d48'));
  } else {
    box.append(colorField(a.kind === 'mask' ? '遮蔽色' : '框線色', 'color', false, a.kind === 'mask' ? '#111827' : '#e11d48'));
  }
  box.append(el('button', { text: '刪除此標註', onclick: () => $('annDelete').click() }));
}

// ---------- 版本控管 ----------
async function openVersions() {
  const vs = await M.listVersions(state.draft.id);
  const list = $('verList');
  list.innerHTML = '';
  $('diffOut').innerHTML = '';
  if (!vs.length) list.append(el('p', { class: 'muted', text: '尚未發布任何版本。發布後，每次的版本號、發布者、時間與變更摘要都會保留在這裡。' }));
  else {
    const canRestore = editable() && state.settings.role !== 'viewer';
    list.append(el('table', { class: 'ver-table' },
      el('thead', {}, el('tr', {}, ...['版本', '發布者', '時間', '變更摘要', '步驟數', ''].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...vs.map((v) => el('tr', {},
        el('td', { text: `v${v.version}${v.version === state.draft.latestVersion ? '（現行）' : ''}` }),
        el('td', { text: v.publisher }), el('td', { text: M.fmtTime(v.publishedAt) }),
        el('td', { text: v.changeNote || '—' }), el('td', { text: String(v.snapshot.steps.length) }),
        el('td', { class: 'actions-cell' },
          el('button', { text: '檢視', onclick: () => viewVersion(v) }), ' ',
          el('button', { text: '恢復為草稿', disabled: !canRestore, onclick: () => restore(v) })))))));
  }
  const opts = (sel, def) => {
    sel.innerHTML = '';
    sel.append(...vs.map((v) => el('option', { value: v.id, text: `v${v.version}（${M.fmtTime(v.publishedAt)}）` })), el('option', { value: 'draft', text: '目前草稿' }));
    sel.value = def;
  };
  opts($('cmpA'), vs[0] ? vs[0].id : 'draft');
  opts($('cmpB'), 'draft');
  $('verDlg').showModal();
}

async function snapshotFor(key) {
  if (key === 'draft') return { label: '目前草稿', title: state.draft.title, steps: state.draft.steps };
  const v = await M.getVersion(key);
  return { label: `v${v.version}`, title: v.snapshot.title, steps: v.snapshot.steps };
}

function wordDiff(a = '', b = '') {
  if (a === b) return document.createTextNode(b);
  const frag = document.createDocumentFragment();
  if (a) frag.append(el('del', { text: a }), ' ');
  if (b) frag.append(el('ins', { text: b }));
  return frag;
}

async function compare() {
  const A = await snapshotFor($('cmpA').value), B = await snapshotFor($('cmpB').value);
  const rows = M.diffSteps(A.steps, B.steps);
  const out = $('diffOut');
  out.innerHTML = '';
  const changed = rows.filter((r) => r.status !== 'unchanged');
  const label = { added: '新增', removed: '刪除', modified: '修改' };
  const fieldName = { title: '標題', description: '說明', image: '截圖', annotations: '標註', order: '順序' };
  out.append(el('h4', { text: `${A.label} → ${B.label}：${changed.length ? `${changed.length} 處差異` : '內容相同'}` }));
  if (A.title !== B.title) out.append(el('div', { class: 'diff-row modified' }, el('b', { text: '手冊名稱：' }), wordDiff(A.title, B.title)));
  for (const r of changed) {
    const s = r.new || r.old;
    const idx = r.status === 'removed' ? `原步驟 ${r.oldIndex + 1}` : `步驟 ${r.newIndex + 1}`;
    const row = el('div', { class: `diff-row ${r.status}` },
      el('span', { class: `tag ${r.status}`, text: label[r.status] }),
      el('b', { text: `${idx}：` }),
      r.status === 'modified' ? wordDiff(r.old.title, r.new.title) : (s.title || '（未命名）'),
      r.changes.length ? el('div', { class: 'small muted', text: '變更：' + r.changes.map((c) => fieldName[c] + (c === 'order' ? `（${r.oldIndex + 1} → ${r.newIndex + 1}）` : '')).join('、') }) : null);
    if (r.changes.includes('description')) row.append(el('div', { class: 'small' }, '說明：', wordDiff(r.old.description, r.new.description)));
    if (r.changes.includes('image') || r.changes.includes('annotations')) {
      const [a, b] = await Promise.all([flattenStep(r.old, { maxWidth: 520, type: 'image/jpeg' }), flattenStep(r.new, { maxWidth: 520, type: 'image/jpeg' })]);
      row.append(el('div', { class: 'diff-cols' },
        el('div', {}, el('div', { class: 'small muted', text: A.label }), a ? el('img', { src: a }) : el('span', { class: 'muted', text: '（無截圖）' })),
        el('div', {}, el('div', { class: 'small muted', text: B.label }), b ? el('img', { src: b }) : el('span', { class: 'muted', text: '（無截圖）' }))));
    }
    out.append(row);
  }
}

async function restore(v) {
  if (!confirm(`將 v${v.version} 恢復為草稿？目前草稿內容會被取代（可在提示列「撤銷恢復」）。`)) return;
  state.draft = await M.restoreVersion(state.draft.id, v.id);
  $('verDlg').close();
  renderAll();
  toast(`已將 v${v.version} 恢復為草稿`);
}

async function openHTMLInTab(html) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function viewVersion(v) {
  toast('產生預覽中…');
  openHTMLInTab(await buildHTML({ title: v.snapshot.title, steps: v.snapshot.steps, meta: { version: v.version, publisher: v.publisher, at: v.publishedAt } }, { format: state.settings.imageFormat }));
}
async function viewCurrentVersion() {
  const vs = await M.listVersions(state.draft.id);
  const v = vs.find((x) => x.version === state.draft.latestVersion);
  if (v) viewVersion(v);
}

// ---------- 送審 / 發布 ----------
let pubMode = null;
function openPublish(mode) {
  pubMode = mode;
  $('pubTitle').textContent = { submit: '送審', publish: '發布新版本', approve: '核准並發布' }[mode];
  $('pubNote').value = mode === 'approve' && state.draft.review ? state.draft.review.note || '' : '';
  $('pubNote').placeholder = mode === 'submit' ? '給審核者的說明：這次改了什麼？' : '變更摘要（會記錄在版本紀錄中）';
  $('pubDlg').returnValue = '';
  $('pubDlg').showModal();
}
async function onPublishClose() {
  if ($('pubDlg').returnValue !== 'ok') return;
  const note = $('pubNote').value.trim();
  const who = state.settings.userName || M.ROLES[state.settings.role];
  if (pubMode === 'submit') {
    await mutate((d) => { d.status = 'in_review'; d.review = { by: who, at: Date.now(), note }; }, { content: false });
    toast('已送審，等待管理員核准');
  } else {
    if (!M.canPublish(state.settings)) return toast('只有管理員可以發布', true);
    const v = await M.publish(state.draft.id, { publisher: who, changeNote: note });
    await reloadDraft();
    toast(`已發布 v${v.version}`);
  }
}
async function rejectReview() {
  const reason = prompt('退回原因（會顯示給編輯者）', '');
  if (reason === null) return;
  await mutate((d) => { d.status = 'draft'; d.review = { ...(d.review || {}), rejected: reason, rejectedAt: Date.now() }; }, { content: false });
  toast('已退回修改');
}

// ---------- 匯出 ----------
async function exportHTML() {
  if (!state.draft.steps.length) return toast('手冊沒有任何步驟', true);
  toast('產生 HTML 中…');
  const html = await buildHTML({ title: state.draft.title, steps: state.draft.steps, meta: {} }, { format: state.settings.imageFormat });
  downloadText(`${safeFilename(state.draft.title)}.html`, html);
}
async function printPDF() {
  if (!state.draft.steps.length) return toast('手冊沒有任何步驟', true);
  toast('準備列印中…（在列印視窗選擇「另存為 PDF」）');
  printHTML(await buildHTML({ title: state.draft.title, steps: state.draft.steps, meta: {} }, { format: state.settings.imageFormat }));
}
async function sharePackage() {
  const pkg = await M.exportPackage(state.draft.id);
  downloadText(`${safeFilename(state.draft.title)}.sopsnap.json`, JSON.stringify(pkg), 'application/json');
  toast('已匯出分享套件，同仁可在「匯入手冊套件」接手續編');
}

// ---------- 設定 ----------
async function openSettings() {
  const s = state.settings;
  for (const r of document.querySelectorAll('input[name=plan]')) r.checked = r.value === s.plan;
  $('setName').value = s.userName; $('setRole').value = s.role; $('setFormat').value = s.imageFormat;
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate();
    $('storageInfo').textContent = `本機已使用約 ${(e.usage / 1048576).toFixed(1)} MB（所有手冊與截圖都只存在這台電腦）。`;
  }
  $('setDlg').returnValue = '';
  $('setDlg').showModal();
}
async function onSettingsClose() {
  if ($('setDlg').returnValue !== 'ok') return;
  const plan = document.querySelector('input[name=plan]:checked').value;
  state.settings = await M.saveSettings({ plan, userName: $('setName').value.trim(), role: $('setRole').value, imageFormat: $('setFormat').value });
  cards.clear(); $('steps').innerHTML = '';
  await loadCurrent();
  toast('設定已儲存');
}

// ---------- 綁定 ----------
function bindStatic() {
  const saveTitle = debounce((v) => mutate((d) => { d.title = v || '未命名手冊'; }), 400);
  $('title').oninput = (e) => saveTitle(e.target.value.trim());
  const saveFolder = debounce((v) => mutate((d) => { d.folder = v; }, { content: false }), 500);
  $('folder').oninput = (e) => saveFolder(e.target.value.trim());
  $('search').oninput = debounce((e) => { state.q = e.target.value; renderLibrary(); }, 200);
  $('folderFilter').onchange = (e) => { state.folder = e.target.value; renderLibrary(); };
  $('btnNewDraft').onclick = async () => {
    const t = prompt('新手冊名稱', '');
    if (t === null) return;
    const d = await M.createDraft(t.trim());
    if (state.folder) await M.updateDraft(d.id, (x) => { x.folder = state.folder; }, { content: false });
    cards.clear(); $('steps').innerHTML = '';
    await loadCurrent();
  };
  $('btnDeleteDraft').onclick = async () => {
    if (!confirm(`永久刪除「${state.draft.title}」與其所有版本紀錄？此動作無法復原。`)) return;
    await M.deleteDraft(state.draft.id);
    cards.clear(); $('steps').innerHTML = '';
    await loadCurrent();
    toast('已刪除手冊');
  };
  $('btnAddText').onclick = () => addTextStep(null);
  $('btnExport').onclick = exportHTML;
  $('btnPrint').onclick = printPDF;
  $('btnSharePkg').onclick = sharePackage;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      await M.importPackage(JSON.parse(await f.text()));
      cards.clear(); $('steps').innerHTML = '';
      await loadCurrent();
      toast('已匯入手冊，可直接接手續編');
    } catch (err) { toast(err.message, true); }
  };
  $('btnVersions').onclick = openVersions;
  $('btnCompare').onclick = compare;
  $('btnSettings').onclick = openSettings;
  $('setDlg').addEventListener('close', onSettingsClose);
  $('pubDlg').addEventListener('close', onPublishClose);
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => b.closest('dialog').close();
  for (const a of document.querySelectorAll('.open-shortcuts')) a.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); };
  $('closeWelcome').onclick = () => { $('welcome').hidden = true; history.replaceState(null, '', 'editor.html'); };
  bindAnnotator();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'draft-updated') {
      chrome.storage.local.get('retakeTarget').then(({ retakeTarget }) => { state.retake = retakeTarget || null; });
      if (msg.draftId === state.draft.id) { reloadDraft(); if (msg.message) toast(msg.message); }
      else renderLibrary();
    }
  });
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.retakeTarget) { state.retake = changes.retakeTarget.newValue || null; renderSteps(); }
    if (changes.currentDraftId && changes.currentDraftId.newValue && changes.currentDraftId.newValue !== state.draft.id) {
      cards.clear(); $('steps').innerHTML = ''; await loadCurrent();
    }
    if (changes.settings) { state.settings = await M.getSettings(); renderAll(); }
  });
}

init().catch((err) => { console.error(err); toast(String(err.message || err), true); });

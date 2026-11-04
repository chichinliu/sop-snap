import * as M from './lib/model.js';

const $ = (id) => document.getElementById(id);
let settings;

function showMsg(text, err = false) {
  const m = $('msg');
  m.textContent = text; m.hidden = false; m.classList.toggle('err', err);
}

async function refreshDrafts() {
  settings = await M.getSettings();
  $('planLabel').textContent = `${M.PLANS[settings.plan].label}・${M.PLANS[settings.plan].tagline}`;
  const multi = M.can(settings, 'multiDraft');
  const current = await M.ensureCurrentDraft();
  const drafts = multi ? await M.listDrafts() : [current];
  const sel = $('draftSel');
  sel.innerHTML = '';
  for (const d of drafts) {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.title; o.selected = d.id === current.id;
    sel.appendChild(o);
  }
  sel.disabled = !multi;
  $('newDraft').hidden = !multi;
  $('draftInfo').textContent = `${current.steps.length} 個步驟・${M.STATUS[current.status]}` +
    (M.canEdit(settings, current) ? '' : '・唯讀');

  const { retakeTarget } = await chrome.storage.local.get('retakeTarget');
  const box = $('retake');
  if (retakeTarget) {
    box.hidden = false;
    box.innerHTML = `<span>重新截圖模式：下一次擷取將取代「${retakeTarget.label || '指定步驟'}」</span><button id="cancelRetake">取消</button>`;
    $('cancelRetake').onclick = async () => { await chrome.storage.local.remove('retakeTarget'); refreshDrafts(); };
  } else box.hidden = true;
}

async function refreshRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.runtime.sendMessage({ type: 'get-recording' });
  const on = res.tabs.includes(tab.id);
  const b = $('rec');
  b.classList.toggle('on', on);
  b.textContent = on ? '■ 停止點擊錄製' : '● 開始點擊錄製';
  b.onclick = async () => {
    const r = await chrome.runtime.sendMessage({ type: 'set-recording', tabId: tab.id, on: !on });
    if (!r.ok) return showMsg(r.error, true);
    if (!on) window.close(); else refreshRecording();
  };
}

$('draftSel').onchange = async (e) => { await M.setCurrentDraftId(e.target.value); refreshDrafts(); };
$('newDraft').onclick = async () => {
  const title = prompt('新手冊名稱', '');
  if (title === null) return;
  await M.createDraft(title.trim());
  refreshDrafts();
};

for (const b of document.querySelectorAll('.cap')) {
  b.onclick = async () => {
    const mode = b.dataset.mode;
    if (mode === 'region') {
      // 框選需要使用者在頁面上操作，先關閉彈出視窗
      chrome.runtime.sendMessage({ type: 'capture', mode });
      window.close();
      return;
    }
    b.disabled = true;
    showMsg(mode === 'full' ? '全頁擷取中，請勿操作頁面…' : '擷取中…');
    const r = await chrome.runtime.sendMessage({ type: 'capture', mode });
    b.disabled = false;
    if (!r.ok) return showMsg(r.error, true);
    showMsg(r.replaced ? '已替換步驟截圖' : '已加入手冊');
    refreshDrafts();
  };
}

$('openEditor').onclick = async () => {
  const url = chrome.runtime.getURL('editor.html');
  const [existing] = await chrome.tabs.query({ url: url + '*' });
  if (existing) { await chrome.tabs.update(existing.id, { active: true }); await chrome.windows.update(existing.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
  window.close();
};
$('shortcuts').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); };

refreshDrafts();
refreshRecording();

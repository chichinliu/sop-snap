// 滑鼠點擊錄製：每次點擊自動截圖，並以被點擊元素的位置產生「自動焦點」紅框。
// 以靜態 content script 在 document_start 載入，換頁後立即就緒，不會漏掉換頁後的第一次點擊；
// 只有當背景確認「這個分頁正在錄製」才會掛上監聽。
(() => {
  if (window.__sopsnapRecorderLoaded) return;
  window.__sopsnapRecorderLoaded = true;
  let active = false;
  const THROTTLE_MS = 700;
  let last = 0;

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n = 40) => (s.length > n ? s.slice(0, n) + '…' : s);

  function describe(el) {
    const target = el.closest('button,a,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[onclick]') || el;
    const tag = target.tagName.toLowerCase();
    const aria = clean(target.getAttribute('aria-label'));
    const text = clean(target.innerText);
    // 表單欄位優先使用畫面上看得到的標籤文字（<label>、aria-labelledby），其次才是 placeholder；
    // name / id 屬性多半是工程命名（例如 "c"、"amt"），不適合當步驟標題。
    const labelText = () => {
      const l = target.labels && target.labels[0] && clean(target.labels[0].innerText);
      if (l) return l;
      const by = target.getAttribute('aria-labelledby');
      if (by) { const t = clean(by.split(/\s+/).map((i) => (document.getElementById(i) || {}).innerText || '').join(' ')); if (t) return t; }
      return '';
    };
    if (tag === 'input' || tag === 'textarea') {
      const type = (target.getAttribute('type') || 'text').toLowerCase();
      const name = labelText() || aria || clean(target.placeholder) || clean(target.title);
      if (['checkbox', 'radio'].includes(type)) return { target, label: `勾選「${cut(name || '選項')}」` };
      if (['submit', 'button'].includes(type)) return { target, label: `點擊「${cut(clean(target.value) || name || '按鈕')}」` };
      return { target, label: `在「${cut(name || '輸入欄位')}」輸入內容` };
    }
    if (tag === 'select') return { target, label: `選擇「${cut(labelText() || aria || clean(target.title) || '下拉選單')}」` };
    const name = aria || text || clean(target.title) || clean(target.getAttribute('alt')) ||
      clean(target.querySelector && target.querySelector('img[alt]') && target.querySelector('img[alt]').alt);
    return { target, label: name ? `點擊「${cut(name)}」` : '點擊此處' };
  }

  function onPointerDown(e) {
    if (!e.isTrusted || e.button !== 0) return;
    const now = Date.now();
    if (now - last < THROTTLE_MS) return;
    last = now;
    const { target, label } = describe(e.target);
    const r = target.getBoundingClientRect();
    // 元素超大（例如整個版面容器）時，改以點擊位置為中心的小框
    const huge = r.width * r.height > window.innerWidth * window.innerHeight * 0.4;
    const rect = huge
      ? { x: e.clientX - 40, y: e.clientY - 20, w: 80, h: 40 }
      : { x: r.left, y: r.top, w: r.width, h: r.height };
    chrome.runtime.sendMessage({ type: 'recorded-click', label, rect, scrollY: window.scrollY, vw: window.innerWidth, vh: window.innerHeight }).catch(() => {});
  }

  // 頁面載入完成後通知背景拍一張基準畫面，供「點擊後立即跳轉」時補位
  function sendBaseline() {
    const go = () => setTimeout(() => {
      if (active) chrome.runtime.sendMessage({ type: 'recorder-baseline', scrollY: window.scrollY }).catch(() => {});
    }, 300);
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }
  function start() {
    if (active) return;
    active = true;
    window.addEventListener('pointerdown', onPointerDown, true);
    sendBaseline();
  }
  function stop() {
    active = false;
    window.removeEventListener('pointerdown', onPointerDown, true);
  }
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'recorder-start') start();
    if (msg && msg.type === 'recorder-stop') stop();
  });
  chrome.runtime.sendMessage({ type: 'recorder-hello' })
    .then((r) => { if (r && r.recording) start(); })
    .catch(() => {});
})();

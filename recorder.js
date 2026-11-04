// 滑鼠點擊錄製：每次點擊自動截圖，並以被點擊元素的位置產生「自動焦點」紅框。
(() => {
  if (window.__sopsnapRecorder) return;
  const THROTTLE_MS = 700;
  let last = 0;

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n = 40) => (s.length > n ? s.slice(0, n) + '…' : s);

  function describe(el) {
    const target = el.closest('button,a,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[onclick]') || el;
    const tag = target.tagName.toLowerCase();
    const aria = clean(target.getAttribute('aria-label'));
    const text = clean(target.innerText);
    if (tag === 'input' || tag === 'textarea') {
      const type = (target.getAttribute('type') || 'text').toLowerCase();
      const name = aria || clean(target.placeholder) || clean(target.labels && target.labels[0] && target.labels[0].innerText) || clean(target.name);
      if (['checkbox', 'radio'].includes(type)) return { target, label: `勾選「${cut(name || '選項')}」` };
      if (['submit', 'button'].includes(type)) return { target, label: `點擊「${cut(clean(target.value) || name || '按鈕')}」` };
      return { target, label: `在「${cut(name || '輸入欄位')}」輸入內容` };
    }
    if (tag === 'select') return { target, label: `選擇「${cut(aria || clean(target.name) || '下拉選單')}」` };
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
    chrome.runtime.sendMessage({ type: 'recorded-click', label, rect, vw: window.innerWidth, vh: window.innerHeight }).catch(() => {});
  }

  function stop() {
    window.removeEventListener('pointerdown', onPointerDown, true);
    chrome.runtime.onMessage.removeListener(onMsg);
    window.__sopsnapRecorder = false;
  }
  function onMsg(msg) { if (msg && msg.type === 'recorder-stop') stop(); }

  window.addEventListener('pointerdown', onPointerDown, true);
  chrome.runtime.onMessage.addListener(onMsg);
  window.__sopsnapRecorder = true;
})();

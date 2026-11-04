// IndexedDB 存取層：手冊草稿、截圖原檔、發布版本都存在本機。
// 背景 service worker 與擴充頁面共用同一個資料庫（同一個 extension origin）。

const DB_NAME = 'sopsnap';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
      // 截圖一經寫入即不可變（retake 會產生新的 imageId），版本快照因此只需引用 id。
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('versions')) {
        const v = db.createObjectStore('versions', { keyPath: 'id' });
        v.createIndex('draftId', 'draftId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode) {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return wrap((await store(name, 'readonly')).get(key)); }
export async function put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); }
export async function del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); }
export async function getAll(name) { return wrap((await store(name, 'readonly')).getAll()); }
export async function getAllByIndex(name, index, key) {
  return wrap((await store(name, 'readonly')).index(index).getAll(key));
}

// 在單一 readwrite 交易內「讀取 → 修改 → 寫回」，避免背景擷取與編輯器同時寫入時互相覆蓋。
// fn 必須是同步函式；回傳值（或被就地修改的 draft）會被寫回。
export async function update(name, key, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    let result;
    const g = s.get(key);
    g.onsuccess = () => {
      if (!g.result) { tx.abort(); reject(new Error(`${name}/${key} 不存在`)); return; }
      try {
        result = fn(g.result) || g.result;
      } catch (err) { tx.abort(); reject(err); return; }
      s.put(result);
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

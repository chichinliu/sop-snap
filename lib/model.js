// 資料模型與商業規則：方案權限、手冊草稿、步驟、版本控管、差異比對。
import * as db from './db.js';

export const BRAND = { name: 'SOP Snap 圖文手冊', site: 'chichinliu.com', url: 'https://chichinliu.com' };

// ---------- 方案（社群版 / 標準版 / 團隊版） ----------
export const PLANS = {
  community: { label: '社群版', tagline: '快速製作與分享手冊' },
  standard: { label: '標準版', tagline: '管理並持續更新手冊' },
  team: { label: '團隊版', tagline: '共同維護與發布 SOP' },
};
const PLAN_RANK = { community: 0, standard: 1, team: 2 };
const FEATURE_MIN_PLAN = {
  multiDraft: 'standard',      // 多份草稿、命名、續編
  textAnnotation: 'standard',  // 圖上文字標註
  retake: 'standard',          // 單一步驟重新截圖
  library: 'team',             // 團隊手冊庫：資料夾、搜尋、分享套件
  roles: 'team',               // 成員角色與編輯權限
  review: 'team',              // 審核發布
  versions: 'team',            // 版本控管
};
export function can(settings, feature) {
  const need = FEATURE_MIN_PLAN[feature];
  if (!need) return true;
  return PLAN_RANK[settings.plan] >= PLAN_RANK[need];
}

export const ROLES = { admin: '管理員', editor: '編輯者', viewer: '檢視者' };
export const STATUS = { draft: '草稿', in_review: '審核中', published: '已發布' };

const DEFAULT_SETTINGS = { plan: 'team', userName: '', role: 'admin', imageFormat: 'png' };

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

// 角色權限（團隊版才生效；其他方案一律視為擁有者）
export function canEdit(settings, draft) {
  if (!can(settings, 'roles')) return true;
  if (settings.role === 'viewer') return false;
  if (draft && draft.status === 'in_review' && settings.role !== 'admin') return false;
  return true;
}
export function canPublish(settings) {
  return !can(settings, 'roles') || settings.role === 'admin';
}

// ---------- 通用 ----------
export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 手冊草稿 ----------
export function newDraft(title) {
  const now = Date.now();
  return {
    id: uid('d_'), title: title || `未命名手冊 ${fmtTime(now)}`, folder: '', status: 'draft',
    steps: [], createdAt: now, updatedAt: now, latestVersion: 0,
  };
}

export async function listDrafts() {
  const all = await db.getAll('drafts');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getDraft = (id) => db.get('drafts', id);

export async function createDraft(title) {
  const d = newDraft(title);
  await db.put('drafts', d);
  await setCurrentDraftId(d.id);
  return d;
}

export async function deleteDraft(id) {
  await db.del('drafts', id);
  const versions = await db.getAllByIndex('versions', 'draftId', id);
  for (const v of versions) await db.del('versions', v.id);
  if ((await getCurrentDraftId()) === id) await chrome.storage.local.remove('currentDraftId');
}

// 內容變動：已發布的手冊一經修改即回到「草稿」，現行版仍保留在版本紀錄中供同仁查閱。
export function updateDraft(id, fn, { content = true } = {}) {
  return db.update('drafts', id, (d) => {
    const out = fn(d) || d;
    out.updatedAt = Date.now();
    if (content && out.status === 'published') out.status = 'draft';
    return out;
  });
}

export async function getCurrentDraftId() {
  const { currentDraftId } = await chrome.storage.local.get('currentDraftId');
  return currentDraftId || null;
}
export async function setCurrentDraftId(id) {
  await chrome.storage.local.set({ currentDraftId: id });
}

// 社群版只保留一份手冊：永遠沿用第一份；其他方案沿用「目前手冊」，沒有則新建。
export async function ensureCurrentDraft() {
  const settings = await getSettings();
  let id = await getCurrentDraftId();
  let d = id ? await getDraft(id) : null;
  if (!d && !can(settings, 'multiDraft')) {
    const all = await listDrafts();
    d = all[all.length - 1] || null;
    if (d) await setCurrentDraftId(d.id);
  }
  if (!d) d = await createDraft();
  return d;
}

// ---------- 截圖 ----------
export async function saveImage(blob, width, height) {
  const id = uid('i_');
  await db.put('images', { id, blob, width, height, createdAt: Date.now() });
  return id;
}
export const getImage = (id) => db.get('images', id);

export function newStep({ title = '', description = '', imageId = null, annotations = [], source = null } = {}) {
  return { id: uid('s_'), type: imageId ? 'image' : 'text', title, description, imageId, annotations, source, createdAt: Date.now() };
}

// ---------- 版本控管 ----------
function snapshotOf(d) {
  return { title: d.title, steps: JSON.parse(JSON.stringify(d.steps)) };
}

export async function listVersions(draftId) {
  const vs = await db.getAllByIndex('versions', 'draftId', draftId);
  return vs.sort((a, b) => b.version - a.version);
}

export async function publish(draftId, { publisher, changeNote }) {
  const d = await getDraft(draftId);
  const version = (d.latestVersion || 0) + 1;
  const v = {
    id: uid('v_'), draftId, version, publisher: publisher || '未具名', changeNote: changeNote || '',
    publishedAt: Date.now(), snapshot: snapshotOf(d),
  };
  await db.put('versions', v);
  await updateDraft(draftId, (x) => { x.status = 'published'; x.latestVersion = version; x.review = null; }, { content: false });
  return v;
}

// 舊版恢復為新草稿：覆蓋目前步驟（目前內容若未發布，會先自動保留在 undo 欄位）
export async function restoreVersion(draftId, versionId) {
  const v = await db.get('versions', versionId);
  return updateDraft(draftId, (d) => {
    d.restoredFrom = { version: v.version, at: Date.now(), previousSteps: d.steps };
    d.title = v.snapshot.title;
    d.steps = JSON.parse(JSON.stringify(v.snapshot.steps));
    d.status = 'draft';
  }, { content: false });
}
export const getVersion = (id) => db.get('versions', id);

// 步驟層級差異比對：以 step.id 對齊，偵測新增 / 刪除 / 修改（標題、說明、截圖、標註）與順序變動。
export function diffSteps(oldSteps, newSteps) {
  const oldMap = new Map(oldSteps.map((s, i) => [s.id, { s, i }]));
  const newIds = new Set(newSteps.map((s) => s.id));
  const rows = [];
  newSteps.forEach((s, i) => {
    const o = oldMap.get(s.id);
    if (!o) { rows.push({ status: 'added', new: s, newIndex: i, changes: [] }); return; }
    const changes = [];
    if (o.s.title !== s.title) changes.push('title');
    if (o.s.description !== s.description) changes.push('description');
    if (o.s.imageId !== s.imageId) changes.push('image');
    if (JSON.stringify(o.s.annotations || []) !== JSON.stringify(s.annotations || [])) changes.push('annotations');
    if (o.i !== i) changes.push('order');
    rows.push({ status: changes.length ? 'modified' : 'unchanged', old: o.s, new: s, oldIndex: o.i, newIndex: i, changes });
  });
  oldSteps.forEach((s, i) => {
    if (!newIds.has(s.id)) rows.push({ status: 'removed', old: s, oldIndex: i, changes: [] });
  });
  return rows;
}

// ---------- 分享套件（.sopsnap.json）：讓團隊成員互相交接手冊 ----------
const blobToDataURL = (blob) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob);
});

export async function exportPackage(draftId) {
  const d = await getDraft(draftId);
  const images = {};
  for (const s of d.steps) {
    if (s.imageId && !images[s.imageId]) {
      const img = await getImage(s.imageId);
      if (img) images[s.imageId] = { width: img.width, height: img.height, dataURL: await blobToDataURL(img.blob) };
    }
  }
  return { format: 'sopsnap', formatVersion: 1, exportedAt: Date.now(), by: BRAND.site, draft: { ...d, restoredFrom: undefined }, images };
}

export async function importPackage(pkg) {
  if (!pkg || pkg.format !== 'sopsnap') throw new Error('不是有效的 SOP Snap 手冊套件');
  const idMap = {};
  for (const [oldId, img] of Object.entries(pkg.images || {})) {
    const blob = await (await fetch(img.dataURL)).blob();
    idMap[oldId] = await saveImage(blob, img.width, img.height);
  }
  const d = newDraft(pkg.draft.title);
  d.folder = pkg.draft.folder || '';
  d.steps = (pkg.draft.steps || []).map((s) => ({ ...s, imageId: s.imageId ? idMap[s.imageId] || null : null }));
  await db.put('drafts', d);
  await setCurrentDraftId(d.id);
  return d;
}

/* =====================================================================
   Where everything is kept: IndexedDB in the user's own browser, for
   this site's address. Nothing is sent anywhere. Users move their work
   between computers, or hand it in, by exporting a file (exportAll)
   and importing it (importData).

   Stores
     patients  one record per patient (the proband), with their
               phenotypes, family and pedigree drawing
     variants  sequence variants and CNVs, each with its patient's id,
               annotation and classification
     cache     answers from the online services, so that a variant
               opens quickly the next time (and offline)
     meta      settings and counters
   ===================================================================== */
import { bus, nowISO, uid } from './core.js';

const DB_NAME = 'varint';
const DB_VERSION = 1;
export const FORMAT = 'variant-interpreter';
export const FORMAT_VERSION = 1;

let dbp = null;
let memory = null; // used when IndexedDB is not available (some private windows)

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      memory = memory || { patients: new Map(), variants: new Map(), cache: new Map(), meta: new Map() };
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('patients')) db.createObjectStore('patients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('variants')) {
        const v = db.createObjectStore('variants', { keyPath: 'id' });
        v.createIndex('patientId', 'patientId', { unique: false });
      }
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('IndexedDB is not available; work will be kept only until the page is closed', req.error);
      memory = memory || { patients: new Map(), variants: new Map(), cache: new Map(), meta: new Map() };
      resolve(null);
    };
    req.onblocked = () => console.warn('IndexedDB upgrade blocked by another tab');
  });
  return dbp;
}

export async function persistent() {
  await open();
  return !memory;
}

function txp(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let out;
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    out = fn(tx);
  });
}
const reqp = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function getAll(store) {
  const db = await open();
  if (!db) return Array.from(memory[store].values()).map(clone);
  return txp(db, [store], 'readonly', (tx) => reqp(tx.objectStore(store).getAll())).then((x) => x);
}
async function getOne(store, key) {
  const db = await open();
  if (!db) return clone(memory[store].get(key)) || null;
  let res = null;
  await txp(db, [store], 'readonly', (tx) => {
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => (res = r.result || null);
  });
  return res;
}
async function putOne(store, value) {
  const db = await open();
  if (!db) {
    memory[store].set(value[store === 'cache' || store === 'meta' ? 'key' : 'id'], clone(value));
    return value;
  }
  await txp(db, [store], 'readwrite', (tx) => tx.objectStore(store).put(value));
  return value;
}
async function delOne(store, key) {
  const db = await open();
  if (!db) {
    memory[store].delete(key);
    return;
  }
  await txp(db, [store], 'readwrite', (tx) => tx.objectStore(store).delete(key));
}
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

/* ---------------- a journal of saves in progress ----------------
   A save to IndexedDB finishes a moment after it starts, and a page that is reloaded or closed in that moment
   can lose it. So each save of a patient or a variant is first copied to localStorage (written at once), and
   the copy removed when IndexedDB has it; a copy still there when the site next opens is put back. */
const JKEY = 'varint:journal:';
function journal(store, rec) {
  try {
    localStorage.setItem(JKEY + store + ':' + rec.id, JSON.stringify(rec));
  } catch (e) {
    /* storage full or not allowed: the save to IndexedDB still goes ahead */
  }
}
function unjournal(store, id) {
  try {
    localStorage.removeItem(JKEY + store + ':' + id);
  } catch (e) {
    /* not allowed */
  }
}
/** put back the saves a reload or a closed tab interrupted; returns how many */
export async function replayJournal() {
  let keys = [];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(JKEY));
  } catch (e) {
    return 0;
  }
  let n = 0;
  for (const k of keys) {
    const [store, ...rest] = k.slice(JKEY.length).split(':');
    const id = rest.join(':');
    let rec = null;
    try {
      rec = JSON.parse(localStorage.getItem(k));
    } catch (e) {
      rec = null;
    }
    if (rec && rec.id === id && (store === 'patients' || store === 'variants')) {
      const cur = await getOne(store, id);
      if (!cur || String(cur.updated || '') <= String(rec.updated || '')) {
        await putOne(store, rec);
        n++;
      }
    }
    unjournal(store, id);
  }
  return n;
}

/* ---------------- meta: settings and counters ---------------- */
export async function getMeta(key, fallback) {
  const r = await getOne('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) {
  await putOne('meta', { key, value });
}
async function nextNumber(name, start) {
  const n = (await getMeta('counter:' + name, start - 1)) + 1;
  await setMeta('counter:' + name, n);
  return n;
}

/* ---------------- patients ---------------- */
export function blankPatient() {
  return {
    id: null,
    ref: '',
    created: null,
    updated: null,
    sex: 'unknown',
    karyotype: '',
    age: { years: null, months: null },
    prenatal: false,
    gestation: null,
    onset: '',
    ancestry: '',
    consanguinity: 'unknown',
    referral: '',
    summary: '',
    familyHistory: '',
    test: { type: '', panel: null, lab: '', date: '' },
    phenotypes: [],
    family: [],
    pedigree: null,
    probandPerson: null,
    notes: '',
    tags: [],
    caseId: null,
    log: []
  };
}

export async function listPatients() {
  const ps = await getAll('patients');
  return ps.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}
export const getPatient = (id) => getOne('patients', String(id));

export async function savePatient(p, what) {
  const isNew = !p.id;
  if (isNew) {
    // the next number not already used (patients imported from a file keep theirs, which the counter doesn't know)
    let id;
    do id = String(await nextNumber('patient', 1001));
    while (await getPatient(id));
    p.id = id;
    p.created = nowISO();
  }
  p.updated = nowISO();
  if (what) logTo(p, what);
  const rec = clone(p);
  journal('patients', rec);
  await putOne('patients', rec);
  unjournal('patients', rec.id);
  bus.emit('db:patients', { id: p.id, isNew });
  return p;
}
function logTo(rec, what) {
  rec.log = rec.log || [];
  rec.log.unshift({ at: nowISO(), what });
  if (rec.log.length > 200) rec.log.length = 200;
}

export async function deletePatient(id) {
  const vs = await variantsOf(id);
  for (const v of vs) {
    unjournal('variants', v.id);
    await delOne('variants', v.id);
  }
  unjournal('patients', String(id));
  await delOne('patients', String(id));
  bus.emit('db:patients', { id, deleted: true });
}

/* ---------------- variants ---------------- */
export async function variantsOf(patientId) {
  const db = await open();
  let out;
  if (!db) out = Array.from(memory.variants.values()).filter((v) => v.patientId === String(patientId)).map(clone);
  else out = await txp(db, ['variants'], 'readonly', (tx) => reqp(tx.objectStore('variants').index('patientId').getAll(String(patientId))));
  return (out || []).sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
}
export const allVariants = () => getAll('variants');
export const getVariant = (id) => getOne('variants', id);

export async function saveVariant(v, what) {
  if (!v.id) {
    v.id = uid('v');
    v.created = nowISO();
  }
  v.updated = nowISO();
  if (what) logTo(v, what);
  const rec = clone(v);
  journal('variants', rec);
  await putOne('variants', rec);
  unjournal('variants', rec.id);
  bus.emit('db:variants', { id: v.id, patientId: v.patientId });
  if (v.patientId) {
    const p = await getPatient(v.patientId);
    if (p) {
      p.updated = v.updated;
      await putOne('patients', p);
    }
  }
  return v;
}
export async function deleteVariant(id) {
  const v = await getVariant(id);
  unjournal('variants', id);
  await delOne('variants', id);
  bus.emit('db:variants', { id, patientId: v && v.patientId, deleted: true });
}

/* ---------------- the cache of answers from online services ---------------- */
export async function cacheGet(key, maxAgeDays) {
  const r = await getOne('cache', key);
  if (!r) return null;
  if (maxAgeDays != null && Date.now() - r.t > maxAgeDays * 864e5) return null;
  return r;
}
export async function cachePut(key, value) {
  try {
    await putOne('cache', { key, t: Date.now(), value });
  } catch (e) {
    console.warn('could not cache', key, e);
  }
}
export async function cacheClear() {
  const db = await open();
  if (!db) {
    memory.cache.clear();
    return;
  }
  await txp(db, ['cache'], 'readwrite', (tx) => tx.objectStore('cache').clear());
}
export async function cacheSize() {
  const db = await open();
  if (!db) return memory.cache.size;
  return txp(db, ['cache'], 'readonly', (tx) => reqp(tx.objectStore('cache').count())).then((x) => x);
}

/* ---------------- moving work in and out ---------------- */
/** everything, or some patients, as one object to save as a file */
export async function exportData(patientIds, extra) {
  const all = await listPatients();
  const ps = patientIds ? all.filter((p) => patientIds.includes(p.id)) : all;
  const vs = [];
  for (const p of ps) vs.push(...(await variantsOf(p.id)));
  return Object.assign({
    format: FORMAT,
    version: FORMAT_VERSION,
    exported: nowISO(),
    app: 'Variant interpreter',
    patients: ps,
    variants: vs.map((v) => Object.assign({}, v, { annotation: v.annotation ? { ...v.annotation, cachedOnly: true } : null }))
  }, extra || {});
}

/** check a file before importing it: { ok, patients, variants, message } */
export function checkImport(doc) {
  if (!doc || typeof doc !== 'object') return { ok: false, message: 'This file doesn’t contain work from the Variant interpreter.' };
  if (doc.format !== FORMAT) return { ok: false, message: 'This file can’t be from the Variant interpreter, because it has no "format": "variant-interpreter" entry. Check that you chose the right file.' };
  if ((doc.version || 1) > FORMAT_VERSION) return { ok: false, message: 'This file was saved by a newer version of the Variant interpreter. Reload the page to get the newest version, then try again.' };
  if (!Array.isArray(doc.patients)) return { ok: false, message: 'This file has no patients in it, so there’s nothing to open.' };
  return { ok: true, patients: doc.patients.length, variants: (doc.variants || []).length, caseTitle: doc.case && doc.case.title };
}

/** add the patients and variants of a file. Patients get new numbers when theirs are taken.
    Returns { patients: [new ids], map: {oldId: newId} } */
export async function importData(doc, opts = {}) {
  const chk = checkImport(doc);
  if (!chk.ok) throw new Error(chk.message);
  const map = {};
  const newIds = [];
  for (const src of doc.patients) {
    const p = Object.assign(blankPatient(), clone(src));
    const old = p.id;
    const taken = old ? await getPatient(old) : null;
    // patients are numbered here: a case file's own ids (e.g. "case-tp53") and taken numbers get the next number
    if (!old || taken || opts.renumber || !/^\d+$/.test(String(old))) {
      p.id = null;
    }
    if (opts.caseId) p.caseId = opts.caseId;
    // a case file's brief and tasks go with its patient, to be read on the patient's page
    if (doc.case && (doc.case.brief || (doc.case.tasks || []).length)) {
      const c = doc.case;
      p.case = { id: c.id || opts.caseId || null, title: c.title || '', brief: c.brief || '', tasks: Array.isArray(c.tasks) ? c.tasks.map(String) : [], source: c.source || '' };
      if (!p.caseId && c.id) p.caseId = c.id;
    }
    logTo(p, `Imported from a file${doc.case && doc.case.title ? ` (${doc.case.title})` : ''}`);
    const saved = await savePatient(p);
    map[old] = saved.id;
    newIds.push(saved.id);
  }
  for (const src of doc.variants || []) {
    const v = clone(src);
    if (!(v.patientId in map)) continue;
    v.patientId = map[v.patientId];
    v.id = null;
    await saveVariant(v);
  }
  bus.emit('db:patients', { imported: newIds });
  return { patients: newIds, map };
}

/** remove everything this site keeps in the browser */
export async function wipeAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(JKEY)).forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* not allowed */
  }
  const db = await open();
  if (!db) {
    Object.values(memory).forEach((m) => m.clear());
  } else {
    await txp(db, ['patients', 'variants', 'cache', 'meta'], 'readwrite', (tx) => {
      ['patients', 'variants', 'cache', 'meta'].forEach((s) => tx.objectStore(s).clear());
    });
  }
  bus.emit('db:patients', { wiped: true });
}

/** how much of the browser's storage the site uses, when the browser says */
export async function usage() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch (e) {
    /* ignore */
  }
  return null;
}
/** ask the browser not to clear the site's storage when space runs low */
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) {
    /* ignore */
  }
  return false;
}

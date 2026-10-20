/* =====================================================================
   UCSC's track files (bigBed), read a piece at a time: the copy-number
   variants in ClinVar, the Database of Genomic Variants' gold standard
   set and ClinGen's dosage curations, for any region, from UCSC's copy
   of its files on Amazon (the same files the genome browser draws). The
   page asks only for the bytes it needs, with HTTP range requests.

   The format is UCSC's (Kent et al. 2010, Bioinformatics 26:2204; the
   layout is in bbiFile.h, bPlusTree.h and cirTree.h of its source): a
   header; a B+ tree of the chromosomes; the records, in blocks that are
   each compressed with zlib; and an R tree that says which blocks hold
   which stretch of which chromosome.

     bigBedRegion(url, chrom, start, end) → [{ chrom, start, end, f: {field: text} }]
       start and end 1-based and inclusive (as the rest of the site);
       the records' own start is 0-based in the file, given back 1-based.
   ===================================================================== */
import { fetchWithTimeout } from '../core.js';
import { cacheGet, cachePut } from '../db.js';
import { normChrom } from '../parse.js';

const BIGBED_MAGIC = 0x8789f2eb;
const CHROM_TREE_MAGIC = 0x78ca8c91;
const RTREE_MAGIC = 0x2468ace0;
const files = new Map();
const text = new TextDecoder();

/** bytes start .. start+length-1 of a file */
async function range(url, start, length) {
  const r = await fetchWithTimeout(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } }, 45000);
  const buf = new Uint8Array(await r.arrayBuffer());
  // a server that does not do ranges sends the whole file: take the part asked for
  if (r.status === 200 && buf.length > length) return buf.subarray(start, start + length);
  return buf;
}

/** zlib-compressed bytes, inflated (the browser does it: DecompressionStream) */
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u64 = (dv, o, le) => Number(dv.getBigUint64(o, le));

/** the names of the fields, from the file's autoSql */
export function fieldsOfAutoSql(sql) {
  const out = [];
  const body = String(sql || '').split('(').slice(1).join('(');
  for (const line of body.split('\n')) {
    const m = /^\s*([a-z]+)(?:\[[^\]]*\])?\s+([A-Za-z_][\w]*)\s*;/.exec(line);
    if (m) out.push(m[2]);
  }
  return out;
}

/** what a file holds: its header, chromosomes, fields and index (read once per page) */
function open(url) {
  if (files.has(url)) return files.get(url);
  const p = (async () => {
    const head = await range(url, 0, 64);
    let dv = view(head);
    let le = true;
    if (dv.getUint32(0, true) !== BIGBED_MAGIC) {
      if (dv.getUint32(0, false) === BIGBED_MAGIC) le = false;
      else throw new Error('this isn’t a bigBed file');
    }
    const H = {
      version: dv.getUint16(4, le),
      zoomLevels: dv.getUint16(6, le),
      chromTreeOffset: u64(dv, 8, le),
      fullDataOffset: u64(dv, 16, le),
      fullIndexOffset: u64(dv, 24, le),
      fieldCount: dv.getUint16(32, le),
      definedFieldCount: dv.getUint16(34, le),
      autoSqlOffset: u64(dv, 36, le),
      totalSummaryOffset: u64(dv, 44, le),
      uncompressBufSize: dv.getUint32(52, le)
    };
    // the chromosomes: a B+ tree, read whole (it is a few kilobytes)
    const ctLen = Math.max(32, Math.min(H.fullDataOffset - H.chromTreeOffset, 4 << 20));
    const ct = await range(url, H.chromTreeOffset, ctLen);
    const cdv = view(ct);
    if (cdv.getUint32(0, le) !== CHROM_TREE_MAGIC) throw new Error('the list of chromosomes couldn’t be read');
    const keySize = cdv.getUint32(8, le);
    const chroms = new Map();
    const readNode = (off) => {
      const isLeaf = cdv.getUint8(off);
      const count = cdv.getUint16(off + 2, le);
      let q = off + 4;
      for (let i = 0; i < count; i++) {
        let key = text.decode(ct.subarray(q, q + keySize));
        const z = key.indexOf('\0');
        if (z >= 0) key = key.slice(0, z);
        q += keySize;
        if (isLeaf) {
          chroms.set(key, { id: cdv.getUint32(q, le), size: cdv.getUint32(q + 4, le) });
          q += 8;
        } else {
          const child = u64(cdv, q, le);
          q += 8;
          readNode(child - H.chromTreeOffset);
        }
      }
    };
    readNode(32);
    // the fields: the autoSql text (it lies between the header and the summary)
    let fields = [];
    if (H.autoSqlOffset) {
      const next = [H.totalSummaryOffset, H.chromTreeOffset].filter((x) => x > H.autoSqlOffset);
      const len = Math.max(64, Math.min((next.length ? Math.min(...next) : H.autoSqlOffset + 16384) - H.autoSqlOffset, 65536));
      const sql = await range(url, H.autoSqlOffset, len);
      const z = sql.indexOf(0);
      fields = fieldsOfAutoSql(text.decode(z >= 0 ? sql.subarray(0, z) : sql));
    }
    if (!fields.length) fields = ['chrom', 'chromStart', 'chromEnd', 'name', 'score', 'strand'];
    // the index: its header (48 bytes); the root node follows it
    const ih = await range(url, H.fullIndexOffset, 48);
    const idv = view(ih);
    if (idv.getUint32(0, le) !== RTREE_MAGIC) throw new Error('the file’s index couldn’t be read');
    return { url, le, H, chroms, fields, blockSize: idv.getUint32(4, le), root: H.fullIndexOffset + 48 };
  })();
  p.catch(() => files.delete(url));
  files.set(url, p);
  return p;
}

/** the file's name for a chromosome ('chr22', or '22' in some files) */
function chromName(F, chrom) {
  const c = normChrom(chrom);
  for (const n of [`chr${c === 'MT' ? 'M' : c}`, c, `chr${c}`]) if (F.chroms.has(n)) return n;
  return null;
}

/** the blocks of records that may hold anything in [s, e) of chromosome cid: [{offset, size}] */
async function blocksFor(F, cid, s, e) {
  const { le } = F;
  const out = [];
  const over = (sc, sb, ec, eb) => (sc < cid || (sc === cid && sb < e)) && (ec > cid || (ec === cid && eb > s));
  const visit = async (off) => {
    const buf = await range(F.url, off, 4 + F.blockSize * 32);
    const dv = view(buf);
    const isLeaf = dv.getUint8(0);
    const count = dv.getUint16(2, le);
    const kids = [];
    for (let i = 0; i < count; i++) {
      if (isLeaf) {
        const q = 4 + i * 32;
        if (q + 32 > buf.length) break;
        if (over(dv.getUint32(q, le), dv.getUint32(q + 4, le), dv.getUint32(q + 8, le), dv.getUint32(q + 12, le))) out.push({ offset: u64(dv, q + 16, le), size: u64(dv, q + 24, le) });
      } else {
        const q = 4 + i * 24;
        if (q + 24 > buf.length) break;
        if (over(dv.getUint32(q, le), dv.getUint32(q + 4, le), dv.getUint32(q + 8, le), dv.getUint32(q + 12, le))) kids.push(u64(dv, q + 16, le));
      }
    }
    await Promise.all(kids.map(visit));
  };
  await visit(F.root);
  return out.sort((a, b) => a.offset - b.offset);
}

/** the records of a file in a region; start and end are 1-based and inclusive. Cached for 30 days */
export async function bigBedRegion(url, chrom, start, end, opts = {}) {
  const key = `bb:${url}:${normChrom(chrom)}:${start}-${end}`;
  if (!opts.fresh) {
    const c = await cacheGet(key, 30);
    if (c) return c.value;
  }
  const F = await open(url);
  const name = chromName(F, chrom);
  if (!name) return [];
  const cid = F.chroms.get(name).id;
  const s = Math.max(0, start - 1), e = end;
  const blocks = await blocksFor(F, cid, s, e);
  // neighbouring blocks are fetched together
  const runs = [];
  for (const b of blocks) {
    const last = runs[runs.length - 1];
    if (last && b.offset === last.offset + last.size && last.size + b.size < (8 << 20)) {
      last.size += b.size;
      last.parts.push(b);
    } else runs.push({ offset: b.offset, size: b.size, parts: [b] });
  }
  const out = [];
  const max = opts.max || 20000;
  for (const run of runs) {
    const bytes = await range(F.url, run.offset, run.size);
    for (const b of run.parts) {
      const part = bytes.subarray(b.offset - run.offset, b.offset - run.offset + b.size);
      const data = F.H.uncompressBufSize > 0 ? await inflate(part) : part;
      const dv = view(data);
      let q = 0;
      while (q + 12 <= data.length) {
        const id = dv.getUint32(q, F.le);
        const rs = dv.getUint32(q + 4, F.le);
        const re = dv.getUint32(q + 8, F.le);
        q += 12;
        let z = data.indexOf(0, q);
        if (z < 0) z = data.length;
        if (id === cid && rs < e && re > s) {
          const rest = text.decode(data.subarray(q, z)).split('\t');
          const f = {};
          F.fields.slice(3).forEach((k, i) => {
            if (rest[i] !== undefined) f[k] = rest[i];
          });
          out.push({ chrom: normChrom(chrom), start: rs + 1, end: re, f });
        }
        q = z + 1;
      }
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  if (!opts.noCache) await cachePut(key, out);
  return out;
}

export const _test = { fieldsOfAutoSql, open, files };

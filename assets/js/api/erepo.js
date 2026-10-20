/* =====================================================================
   ClinGen's Evidence Repository (ERepo): the classifications that
   ClinGen's expert panels (VCEPs) have approved, with each criterion
   they found met or not met and, in their words, why. For a student,
   the expert panel's answer to compare with their own.
   https://erepo.clinicalgenome.org (its data format is a prototype)
   ===================================================================== */
import { fetchJSON, limiter } from '../core.js';
import { cacheGet, cachePut } from '../db.js';

const BASE = 'https://erepo.clinicalgenome.org/evrepo/api';
const queue = limiter(2, 200);

/** a ClinGen allele ID as the registry writes it: gnomAD gives 'CA434', the registry 'CA000434' */
export function normCaid(caid) {
  const m = /^(?:CAR:)?CA0*(\d+)$/i.exec(String(caid || '').trim());
  return m ? 'CA' + m[1].padStart(6, '0') : null;
}

/** the expert panels' classifications of a ClinGen allele (CA…): [{uuid, condition, outcome, guideline, panel, codes}] */
export async function byCaid(caid) {
  const id = normCaid(caid);
  if (!id) return [];
  const key = 'erepo:' + id;
  const c = await cacheGet(key, 14);
  if (c) return c.value;
  const d = await queue(() => fetchJSON(`${BASE}/classifications?matchMode=exact&caid=${id}&format=json`, {}, 30000));
  const out = (d.variantInterpretations || []).map((v) => {
    const g = (v.guidelines || [])[0] || {};
    const agent = (g.agents || [])[0] || {};
    return {
      uuid: v.uuid,
      condition: v.condition ? v.condition.label : '',
      mondo: v.condition ? v.condition['@id'] : '',
      outcome: g.outcome ? g.outcome.label : '',
      guideline: g.label || '',
      version: g.version || '',
      panel: agent.affiliation || '',
      codes: (agent.evidenceCodes || []).map((e) => ({ label: e.label, status: e.status }))
    };
  });
  await cachePut(key, out);
  return out;
}

/** the panel's reasons, criterion by criterion: { PS3: 'In vitro assays …', … } */
export async function reasons(uuid) {
  const key = 'erepo-i:' + uuid;
  const c = await cacheGet(key, 30);
  if (c) return c.value;
  const d = await queue(() => fetchJSON(`${BASE}/interpretation/${encodeURIComponent(uuid)}`, {}, 30000));
  const out = {};
  const comments = (x, acc) => {
    if (Array.isArray(x)) x.forEach((y) => comments(y, acc));
    else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) {
        if (k === 'comments' && typeof v === 'string') acc.push(v);
        else comments(v, acc);
      }
    }
    return acc;
  };
  const visit = (x) => {
    if (Array.isArray(x)) return x.forEach(visit);
    if (!x || typeof x !== 'object') return;
    if (x.type === 'CriterionAssessment' && x.criterion && x.criterion.label) {
      const txt = comments(x.evidenceLine || [], []).join(' ');
      if (txt) out[x.criterion.label] = (out[x.criterion.label] ? out[x.criterion.label] + ' ' : '') + txt;
      return;
    }
    for (const v of Object.values(x)) visit(v);
  };
  visit(d.evidenceLine || []);
  await cachePut(key, out);
  return out;
}

/** a code as the panel writes it (PM2_Supporting) → { code, strength } */
const STRENGTH_WORDS = { verystrong: 'VS', vstr: 'VS', vs: 'VS', strong: 'S', str: 'S', moderate: 'M', mod: 'M', supporting: 'P', sup: 'P', standalone: 'SA' };
export function parseCode(label) {
  // the repository writes "PM3_Very Strong" as well as "PM2_Supporting"
  const m = /^\s*([PB](?:VS|S|M|P|A)\d)(?:[_\s-]+(.+?))?\s*$/i.exec(String(label || ''));
  if (!m) return { code: label, strength: null };
  const key = (m[2] || '').toLowerCase().replace(/[\s_-]+/g, '');
  return { code: m[1].toUpperCase(), strength: key ? STRENGTH_WORDS[key] || null : null };
}
/** a strength a panel's reason gives for a criterion listed without one ("PS4_VERY STRONG APPLIED") */
export function strengthInText(code, text) {
  const m = new RegExp(`\\b${code}[_\\s-]*(very[\\s_-]*strong|strong|moderate|supporting)\\b`, 'i').exec(String(text || ''));
  return m ? STRENGTH_WORDS[m[1].toLowerCase().replace(/[\s_-]+/g, '')] || null : null;
}

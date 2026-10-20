/* =====================================================================
   The site's settings (assets/js/config.js, set by whoever runs the
   site) and each user's own choices (kept in this browser).
   ===================================================================== */
import { store, bus } from './core.js';

export const CFG = Object.assign({
  title: 'Variant interpreter',
  defaultAssembly: 'GRCh38',
  suggestions: 'button',
  framework: 'acgs2024',
  allowCompare: true,
  services: {},
  cases: 'data/cases/index.json'
}, window.VI_CONFIG || {});

const DEFAULTS = {
  name: '',                 // the name that goes on classifications and reports
  framework: null,          // null: the site's default; 'acgs2024', 'clingen' or 'acmg2015' (see acmg/frameworks.js)
  vusBands: true,           // show the bands of a VUS (hot … ice cold: GeNotes' six, by points; ACGS 2024 groups them in three)
  showDeprecated: false,    // offer PP5 and BP6, which ClinGen's SVI advises against
  suggestions: null,        // null: follow the site's setting
  predictor: 'REVEL',       // the missense predictor whose calibrated thresholds PP3/BP4 suggestions use
  assembly: null,           // null: the site's default
  ancestry: 'grpmax'        // gnomAD group for frequency comparisons: 'grpmax' (FAF of the group with the highest)
};

let mine = Object.assign({}, DEFAULTS, store.get('settings', {}));

export function get(key) {
  // a course that switches suggestions off (e.g. for an assessment) overrides a student's own choice
  if (key === 'suggestions') return CFG.suggestions === 'never' ? 'never' : (mine.suggestions || CFG.suggestions || 'button');
  if (key === 'assembly') return mine.assembly || CFG.defaultAssembly || 'GRCh38';
  if (key === 'framework') return mine.framework || CFG.framework || 'acgs2024';
  return mine[key];
}
export function set(key, value) {
  mine[key] = value;
  store.set('settings', mine);
  bus.emit('settings', { key, value });
}
export const all = () => Object.assign({}, mine);
export function reset() {
  mine = Object.assign({}, DEFAULTS);
  store.set('settings', mine);
  bus.emit('settings', {});
}

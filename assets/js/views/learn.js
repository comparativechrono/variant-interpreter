/* =====================================================================
   The guide (#/learn/:topic?): how to interpret a variant, a page for
   each of the 28 ACMG/AMP criteria (#/learn/PVS1 … #/learn/BP7, which
   the classification panel links to), the three sets of guidelines,
   how evidence is combined, copy-number variants, using the site, a
   glossary and the references.

   The facts and numbers come from the modules the site classifies with
   (acmg/*.js, cnv/rubric.js, genes.js), so that the guide says what the
   site does. The pages themselves are in learn-criteria.js and
   learn-topics.js.
   ===================================================================== */
import { h, icon } from '../core.js';
import { link } from '../router.js';
import { page, crumbs, linkBtn } from '../ui.js';
import { CRITERIA, BY_CODE } from '../acmg/criteria.js';
import { criteriaIndex, criterionPage, evidenceChart } from './learn-criteria.js';
import { TOPIC_PAGES } from './learn-topics.js';

/* the topics, in reading order (the criteria's own pages come after "The 28 criteria") */
export const TOPICS = [
  { key: 'workflow', title: 'How to interpret a variant', icon: 'route', blurb: 'From the patient to a signed classification: the steps this site follows, and how it compares with the platforms laboratories use.' },
  { key: 'criteria', title: 'The 28 criteria', icon: 'list', blurb: 'Every ACMG/AMP criterion: what it means, the strengths it may take, and where on a variant’s page its evidence is.' },
  { key: 'frameworks', title: 'Three sets of guidelines', icon: 'scale', blurb: 'The ACGS 2024 guidelines, ClinGen’s guidance and the original 2015 rules: where they differ.' },
  { key: 'combining', title: 'Combining the evidence', icon: 'sigma', blurb: 'The 2015 combining rules, Tavtigian’s points and probabilities, and the bands of uncertain significance.' },
  { key: 'cnv', title: 'Copy-number variants', icon: 'chromosome', blurb: 'The ACMG/ClinGen points for gains and losses (Riggs et al. 2020), section by section.' },
  { key: 'site', title: 'Using this site', icon: 'home', blurb: 'Patients, phenotypes, families, variants, the genome browser, reports, and keeping your work.' },
  { key: 'glossary', title: 'Glossary', icon: 'text', blurb: 'The words and numbers of variant interpretation, briefly.' },
  { key: 'references', title: 'References', icon: 'book', blurb: 'The guidelines and papers the site and this guide follow.' }
];
const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.key, t]));

/* every page in reading order: the contents, the topics, and the criteria after "The 28 criteria" */
function readingOrder() {
  const out = [{ key: '', title: 'Contents' }];
  for (const t of TOPICS) {
    out.push({ key: t.key, title: t.title });
    if (t.key === 'criteria') for (const c of CRITERIA) out.push({ key: c.code, title: `${c.code}: ${c.name}`, code: c.code });
  }
  return out;
}
const pathOf = (key) => (key ? '/learn/' + key : '/learn');

export async function render(root, params) {
  const raw = params.topic ? String(params.topic) : '';
  const code = BY_CODE[raw.toUpperCase()] ? raw.toUpperCase() : null;
  const key = code || raw.toLowerCase();
  const p = page('learn-page');
  root.appendChild(p);
  const article = h('article.learn-article');
  const nav = contents(key);
  p.appendChild(h('div.learn', nav, article));

  // the crumbs, then the page
  const trail = [['Guide', '/learn']];
  if (code) trail.push(['The 28 criteria', '/learn/criteria'], [code]);
  else if (TOPIC[key]) trail.push([TOPIC[key].title]);
  else if (key) trail.push(['Not found']);
  if (key) article.appendChild(crumbs(trail));

  if (!key) contentsPage(article);
  else if (code) criterionPage(article, code);
  else if (key === 'criteria') criteriaIndex(article);
  else if (TOPIC_PAGES[key]) await TOPIC_PAGES[key](article);
  else {
    article.appendChild(h('h1', 'There is no such page in the guide'));
    article.appendChild(h('p', `The guide has no page called “${raw}”. `, h('a', { href: link('/learn') }, 'See its contents'), '.'));
    return closeNav;
  }
  if (TOPIC[key] || code || !key) article.appendChild(prevNext(key));
  return closeNav;
}

/* ---------------- the side contents ---------------- */
let navMedia = null;
let navListener = null;
function closeNav() {
  if (navMedia && navListener) navMedia.removeEventListener('change', navListener);
  navMedia = navListener = null;
}

function contents(current) {
  const list = h('ol.learn-toc-list');
  const item = (key, title, ic) => {
    const a = h('a', { href: link(pathOf(key)), 'aria-current': key === current ? 'page' : null }, ic ? h('span.learn-toc-ic', { html: icon(ic) }) : null, h('span', title));
    return h('li', a);
  };
  list.appendChild(item('', 'Contents', 'list'));
  for (const t of TOPICS) {
    const li = item(t.key, t.title, t.icon);
    if (t.key === 'criteria') {
      // the 28 codes, pathogenic then benign, as a compact grid of links
      for (const [dir, label] of [['P', 'Pathogenic'], ['B', 'Benign']]) {
        const grid = h('div.learn-codes', { role: 'list', 'aria-label': `${label} criteria` });
        for (const c of CRITERIA.filter((x) => x.dir === dir)) {
          grid.appendChild(h('a', {
            role: 'listitem', href: link('/learn/' + c.code), title: c.name, 'aria-current': c.code === current ? 'page' : null,
            class: (c.deprecated ? 'retired ' : '') + (dir === 'B' ? 'b' : 'p')
          }, c.code));
        }
        li.appendChild(grid);
      }
    }
    list.appendChild(li);
  }
  const det = h('details.learn-toc', h('summary', h('span', { html: icon('list') }), 'Contents of the guide'), h('nav', { 'aria-label': 'The guide' }, list));
  // open beside the page on a wide screen; closed above it on a narrow one
  closeNav();
  try {
    navMedia = window.matchMedia('(min-width: 981px)');
    det.open = navMedia.matches;
    navListener = () => (det.open = navMedia.matches);
    navMedia.addEventListener('change', navListener);
  } catch (e) {
    det.open = true;
  }
  return h('aside.learn-nav', det);
}

/* ---------------- the first page ---------------- */
function contentsPage(article) {
  article.append(
    h('h1', 'Guide to variant interpretation'),
    h('p.learn-lede', 'How to classify a sequence variant or a copy-number variant with the ACMG/AMP criteria, as clinical laboratories in the UK and elsewhere do, and how this site helps you do it.'));
  const ol = h('ol.learn-topics');
  for (const t of TOPICS) {
    ol.appendChild(h('li', h('a', { href: link('/learn/' + t.key) },
      h('span.lt-ic', { html: icon(t.icon) }),
      h('span.lt-t', t.title),
      h('span.lt-b', t.blurb))));
  }
  article.appendChild(ol);
  article.append(
    h('h2', 'The criteria at a glance'),
    h('p', 'The 28 criteria of Richards et al. (2015), laid out as in their Figure 1: by the kind of evidence (the rows) and the strength each has by default (the columns), benign on the left and pathogenic on the right. Choose one for its page.'),
    evidenceChart(),
    h('p.small.muted', 'Struck through: PP5 and BP6, which ClinGen and the ACGS no longer use.'),
    h('div.btn-row', { style: { marginTop: '18px' } }, linkBtn('Start with how to interpret a variant', '/learn/workflow', { cls: 'primary', icon: 'route' }), linkBtn('Go to the criteria', '/learn/criteria', { icon: 'list' })));
}

/* ---------------- previous and next ---------------- */
function prevNext(key) {
  const order = readingOrder();
  const i = order.findIndex((x) => x.key === key);
  const prev = i > 0 ? order[i - 1] : null;
  const next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  const card = (x, which) => (x ? h('a.' + which, { href: link(pathOf(x.key)), rel: which === 'next' ? 'next' : 'prev' },
    h('span.pn-l', which === 'next' ? 'Next' : 'Previous'),
    h('span.pn-t', x.title)) : h('span'));
  return h('nav.learn-pn', { 'aria-label': 'Previous and next pages of the guide' }, card(prev, 'prev'), card(next, 'next'));
}

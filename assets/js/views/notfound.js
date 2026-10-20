import { h } from '../core.js';
import { page, empty, linkBtn } from '../ui.js';

export function render(root) {
  const p = page('narrow');
  p.appendChild(h('h1', 'There is no page at this address'));
  p.appendChild(h('p.lede', 'The address may have been mistyped, or the page may have moved.'));
  p.appendChild(empty('Where next?', 'Start from your patients, or search for a gene, a variant or a phenotype in the box at the top.', [linkBtn('Your patients', '/patients', { cls: 'primary' }), linkBtn('Home', '/')]));
  root.appendChild(p);
}

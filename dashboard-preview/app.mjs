import { dashboardEntries, searchDashboard } from '../shared/tool-registry.mjs?v=49a5725d';
const query = document.getElementById('query');
const cards = [...document.querySelectorAll('[data-entry]')];
const filters = [...document.querySelectorAll('[data-workspace]')];
let workspace = 'all';
function render() {
  const hits = new Set(
    searchDashboard(query.value, { workspace }).map((entry) => entry.id),
  );
  for (const card of cards) card.hidden = !hits.has(card.dataset.entry);
  for (const filter of filters)
    filter.setAttribute(
      'aria-pressed',
      String(filter.dataset.workspace === workspace),
    );
  document.getElementById('count').textContent =
    `Showing ${hits.size} of ${dashboardEntries().length} studios and tools`;
  document.getElementById('empty').hidden = hits.size > 0;
}
document.querySelector('.finder').hidden = false;
query.addEventListener('input', render);
for (const filter of filters)
  filter.addEventListener('click', () => {
    workspace = filter.dataset.workspace;
    render();
  });
document.getElementById('reset').addEventListener('click', () => {
  workspace = 'all';
  query.value = '';
  render();
  query.focus();
});
render();

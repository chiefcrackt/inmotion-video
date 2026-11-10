import {
  dashboardEntries,
  TOOLS,
  WORKSPACES,
  getWorkspace,
  pageName,
  pageTitle,
} from '../shared/tool-registry.mjs';
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// The live homepage shares the preview's registry-driven navigation, with paths
// resolved from the repository root rather than the preview directory.
export function renderHomepage() {
  return renderDashboard()
    .replaceAll('href="../', 'href="')
    .replaceAll('src="../', 'src="')
    .replace('href="style.css"', 'href="dashboard-preview/style.css"')
    .replace('src="app.mjs"', 'src="dashboard-preview/app.mjs"')
    .replace(/<title>[^<]*<\/title>/, '<title>T.IM Studio</title>')
    .replace('<tim-studio-bar></tim-studio-bar>', '<nav aria-label="T.IM Studio" style="padding:16px 24px"><strong>T.IM Studio</strong></nav>')
    .replace('<span class="preview-label">Dashboard preview</span>', '')
    .replace('This preview does not replace the current dashboard.', 'Choose a studio above, or open an original tool directly.')
    .replace(/ +$/gm, '');
}

export function renderDashboard() {
  const entries = dashboardEntries();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0e1a2e">
  <title>${escape(pageTitle(pageName('dashboard-preview/')))}</title>
  <link rel="icon" href="../favicon.svg">
  <link rel="stylesheet" href="../shared/fonts.css">
  <link rel="stylesheet" href="style.css">
  <script type="module" src="app.mjs"></script>
  <link rel="stylesheet" href="../shared/studio-bar.css">
  <script type="module" src="../shared/studio-bar.mjs"></script>
</head>
<body>
<tim-studio-bar></tim-studio-bar>
<main>
  <header><p class="eyebrow">T.IM / YOUR CREATIVE WORKSPACE</p><h1>What are we making?</h1><p>Open a studio, or jump straight into a familiar tool.</p><span class="preview-label">Dashboard preview</span></header>
  <section class="finder" aria-label="Find a studio" hidden>
    <label for="query">Find a studio or tool<input id="query" type="search" placeholder="Titles, race, thumbnails…"></label>
    <div class="filters" role="group" aria-label="Workspace filters"><button type="button" data-workspace="all" aria-pressed="true">All</button>${WORKSPACES.map((w) => `<button type="button" data-workspace="${escape(w.id)}" aria-pressed="false">${escape(w.name)}</button>`).join('')}</div>
    <button type="button" id="reset">Clear filters</button>
  </section>
  <p id="count" role="status" aria-live="polite">${entries.length} studios and tools</p>
  <p id="empty" hidden>No matches. Try another word or clear the filters.</p>
  <section class="cards" aria-label="Studios and tools">${entries
    .map(
      (entry) => `
    <article data-entry="${escape(entry.id)}">
      <p class="category">${escape(entry.workspaces.map((id) => getWorkspace(id).name).join(' · '))}</p>
      <h2><a class="primary" href="../${escape(entry.href)}">${escape(entry.name)} <span aria-hidden="true">↗</span></a></h2>
      <p>${escape(entry.description)}</p>
      ${entry.modes ? `<div class="modes" aria-label="${escape(entry.name)} modes">${entry.originals.map((tool, i) => entry.modes[i] ? `<a href="../${escape(entry.href)}#${escape(entry.modes[i])}">${escape(tool.name)}</a>` : '').join('')}</div>` : ''}
    </article>`,
    )
    .join('')}
  </section>
  <details id="originals"><summary>Original tools &amp; asset packs · ${TOOLS.length}</summary><p>Every original editor and collection is still available.</p><ul>${TOOLS.map((tool) => `<li><a href="../${escape(tool.href)}">${escape(tool.name)}</a></li>`).join('')}</ul></details>
  <footer><p>Original projects and links remain available. This preview does not replace the current dashboard.</p></footer>
</main>
</body>
</html>
`;
}

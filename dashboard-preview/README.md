# Consolidated dashboard preview

Open `/dashboard-preview/` locally after `npm run preview`. It presents 14 main
choices instead of 27 original tools/collections. Six studio groups and the
existing Asset Animator/library are followed by the focused standalone tools.
Each studio offers mode shortcuts. All 27 original destinations remain available
under Original tools & asset packs, including without JavaScript.

The consolidated dashboard is now the live homepage. This directory retains
the preview route and supplies shared rendering, styling and search.
Tool URLs, project IDs, storage, saved setups and export behavior are unchanged. No editor has been
retired. Group definitions live beside the original tool registry in
`shared/tool-registry.mjs`; preview names, descriptions, workspace assignments,
search terms, links and counts are derived from that data. Original `TOOLS`,
`getTool` continue to use their canonical routes.

Search accepts old tool names, descriptions and keywords. An exact old tool name
selects its containing studio; broader queries search the members' metadata.
Workspace filters preserve multi-workspace placement. All links are present in
the generated HTML, so navigation does not depend on JavaScript. Search/filter
controls appear only when the module initializes.

Run `node dashboard-preview/build.mjs` to regenerate the preview and homepage HTML.
`npm run build` includes that step. The HTML is intentionally excluded from
Prettier because its generator owns formatting. Run `npm run test:dashboard` to
verify complete original-tool coverage, supported mode shortcuts, search,
filters/reset, canonical-route preservation and generator consistency. These
are non-UI checks; they do not establish visual layout or browser accessibility.

Browser Use was unavailable during this preview's implementation. Before
publishing or promoting this page, visually review desktop/phone widths, test
keyboard and screen-reader navigation, verify search/filter operation in a real
browser, and visit every studio/mode/original link with and without JavaScript.
The live actual-device sharing checks remain incomplete. Treat dashboard promotion as a
separate rollout step, preserving the fallback links.

Rollback: remove this directory and its registry grouping exports, test and
package/static-check entries. Original tools and data need no restoration.

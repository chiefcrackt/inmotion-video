# Unified Content Planner preview

Open `/content-studio/` locally after `npm run preview`. The Ideas, Videos and
Shoot views bring Idea Vault, Content Planner and its existing Shoot Planner
together. Use `#ideas` or `#projects` to link to a main view. Shoot lives inside each project. An explicit project
link uses `?project=<encoded-project-id>#shoot` (or `#projects`). Older `#videos` and `#shoot` links still work.

The host keeps one persistent Idea Vault frame and one persistent planner frame.
Videos and Shoot share the same selected project and checklist; there is no
second planner instance writing to storage. The visible frame scrolls within
the workspace so idea-editor overlays and filming dialogs fit its viewport.
Opening a view never creates a project or migrates stored data.

Capture an idea in Ideas, save it, switch to Videos and choose Create from idea.
The picker now refreshes when local ideas change and when returning to the video
view. Promotion reads the latest title, notes, document link, stage and due date
instead of a page-load snapshot. Repeating promotion opens the existing linked
project, preserving its checklist, notes and attachments.

Both original storage keys and backup formats remain unchanged. The existing
pipeline link still reconciles stage/status and publish/due date; titles and
outlines remain separately editable after promotion. Existing revision clocks,
conflict copies, sync queues, deletion markers and Google authorization scopes
are retained. No new cloud files or migration process are introduced.

Switching away from an open idea editor requires Save or Close, preserving the
existing draft behavior. Exit filming mode before changing views. Quick Capture
drafts stay mounted while switching. Each original editor retains its own Google
connection and sync controls; tokens and cloud APIs have not been combined.

The original tool URLs, homepage and registry remain available. The standalone
link provides a fallback. Without JavaScript, the three view links open their
original tools. Local previews have a different browser-storage origin from
GitHub Pages, so hosted ideas/plans appear locally only if imported from backups.

Run `npm run test:content-studio:browser` for capture/promotion, duplicate
prevention, two-way stage/date updates, checklist/take-note retention, editor and
filming guards, original-format backup transfer, malformed-store protection,
desktop/mobile layout and no-JavaScript fallback. Also run `npm test`,
`npm run test:planner`,
`node tests/idea-vault-due-browser.cjs`, and `npm run build`.

Rollback: remove this directory and its test/package/static-check entries, then
remove the `TimPlanningEditor` bridges. The live-picker fix can remain in the
original planner independently. No saved-data migration or restoration is needed.

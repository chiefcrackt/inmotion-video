# Hosted sharing and Drive validation — 2026-11-03

## Status: incomplete; do not treat as release sign-off

Browser inventory and repeated browser-list requests report: **Local browser use
is disabled in Work settings**. The user is enabling it. No Google consent,
account selection, native share sheet, live upload or live cross-device sync
was exercised in this session. No Google Drive files were modified or uploaded.

## Read-only hosted checks

HTTPS requests returned 200 for these deployed paths:

- `celebration-studio/`
- `content-studio/`
- `publishing-studio/`
- `runner-animator/`
- `social-post-studio/`
- `shared/drive-export.mjs`
- `idea-vault/config.js`

Requests to `text-and-titles/` did not complete because of TLS/connection errors
in this environment. Some other paths also initially failed before succeeding
on retry. Certificate validation was not bypassed. These transport failures are
not enough evidence to conclude an application bug or a successful live check.

For Content Planner and the shared Drive module/configuration, the successful
responses contained no CSP, X-Frame-Options or Permissions-Policy header. This
is a header observation, not proof of Google or browser permission behavior.

The five media-studio hosts explicitly delegate `autoplay; web-share` to their
same-origin editor frames and do not sandbox them. The planning host does not
perform native media sharing. HTTPS and iframe permissions are prerequisites;
actual share UI, file-type support and user-activation handling remain untested.

## Picker integration finding and local fix

Both the folder Picker in `shared/project-drive.mjs` and document Picker in
`idea-vault/app.js` omitted `PickerBuilder.setOrigin`. Google's documentation
specifies setting the top-level origin when the app runs in an iframe. All
current studio frames share their host's origin, so both builders now explicitly
set `window.location.origin` in the source fix accompanying this report.

This addresses missing iframe configuration. A real Picker failure was not
observed, because browser UI is unavailable. The fix is included in this source
update and must still be checked on the hosted origin after deployment. It does not alter requested scopes,
credentials, file selection, folder validation or account checks.

Three new non-UI tests execute the actual Picker routines with a fake API and
verify the published origin, folder cancellation without preference changes,
and rejection of a document other than the linked one. Browser-test Picker
doubles also accept and validate the origin for later runs. `npm test` passes
154 tests, and static-entry checks pass. Browser tests were not run while
Browser Use was disabled.

## Real-account checks still required

Use a clearly named disposable test project, with synthetic content only. Keep
the original drafts and files intact. Complete Google sign-in/consent manually
when required; do not expose tokens in logs or copy credentials.

1. Open hosted Content Planner and connect the intended Google account. Confirm
   account selection, consent, cancellation, and reconnect behavior.
2. Open Choose parent folder inside the embedded view. Confirm the Picker opens,
   cancellation keeps the old choice, and selection uses the intended folder.
3. Open an existing linked Google Doc in Ideas. Confirm document Picker and
   read-only viewing, including cancellation and wrong-document rejection.
4. Export one synthetic PNG to the test project's Drive folder. Verify name,
   MIME type, size and folder in Drive; download and inspect the result.
5. Check Save another version vs Update last matching asset using only those
   test files, then save/edit an editable setup from another clean session.
6. Verify failed-upload download/retry without duplicating or discarding the
   asset, and ensure the job survives switching studio modes.
7. Sync a test checklist edit across two independent sessions. Verify status,
   take notes, reconnect and conflict handling without overwriting real plans.

## Real-device sharing checks still required

On actual iPhone/iPad Safari (and Android Chrome if supported), use synthetic
content and the original output types each tool supports. Confirm a user-clicked
Save opens the share sheet, cancellation leaves a usable editor, and Save Video/
Save Image creates a playable/viewable file in Photos. Check fallback downloads
when sharing is unsupported. Do not count a desktop mobile viewport or a mocked
`navigator.share` call as a real device pass. Compare standalone vs studio mode
if either fails, so pre-existing tool limitations are distinguished from hosting
regressions. Download-only modes retain their original behavior.

## References

- [Google Picker setOrigin](https://developers.google.com/workspace/drive/picker/reference/picker.pickerbuilder.setorigin)
- [Google token model and user-driven consent](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Web Share API prerequisites and errors](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)

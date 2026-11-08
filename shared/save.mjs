// Shared save path for T.IM Studio tools. Order: the artifact "downloads"
// capability when present, then the phone share sheet (Save Video / Save Image
// goes to Photos), then a plain download link. Tools call saveFile() and show
// the status string it reports.

export function typeFor(name) {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.wav$/i.test(name)) return 'audio/wav';
  if (/\.mp4$/i.test(name)) return 'video/mp4';
  return 'video/webm';
}

let downloads = null;
let downloadsPromise = null;

// Resolves to the downloads capability, or null when the page has none.
// Safe to call more than once; the request is made only once.
export function downloadsReady() {
  if (!downloadsPromise) {
    downloadsPromise =
      window.claude && window.claude.use
        ? window.claude
            .use('downloads')
            .then((d) => {
              downloads = d || null;
              return downloads;
            })
            .catch(() => null)
        : Promise.resolve(null);
  }
  return downloadsPromise;
}

const SHARE_DEVICE = /iPhone|iPad|iPod|Android/i;
function isPhoneOrTablet() {
  return (
    SHARE_DEVICE.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

// onStatus(message, isError) is called with the outcome.
export function saveFile(name, data, onStatus) {
  const report = onStatus || function () {};
  if (window.TimDriveExport && window.TimDriveExport.route && window.TimDriveExport.route(data, name)) return;
  if (!downloads) {
    fallbackSave(name, data, report);
    return;
  }
  downloads
    .save({ filename: name, data: data })
    .then((r) => report(r && r.status === 'saved' ? 'Saved ' + name + '.' : 'Sent ' + name + '.'))
    .catch((e) => {
      const c = e && e.code;
      report(
        c === 'declined'
          ? 'Not saved.'
          : c === 'rate_limited'
            ? 'A save is already open. Finish that one first.'
            : c === 'too_large'
              ? 'That file is too large to save here.'
              : 'Couldn’t save the file here.',
        c !== 'declined',
      );
    });
}

function fallbackSave(name, data, report) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: typeFor(name) });
  let file = null;
  try {
    file = new File([blob], name, { type: blob.type || typeFor(name) });
  } catch (e) {}
  function anchor() {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
    report('Downloaded ' + name + '.');
  }
  if (file && isPhoneOrTablet() && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator
      .share({ files: [file] })
      .then(() => report('Done. If you picked Save Video, it’s in Photos.'))
      .catch((e) => {
        if (e && e.name === 'AbortError') report('Not saved.');
        else anchor();
      });
    return;
  }
  anchor();
}

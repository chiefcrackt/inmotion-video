// Shared save path for T.IM Studio tools (window.TimSave). Videos, PNGs, WAVs
// and ZIPs all go the same way:
//   1. the host's "downloads" capability, when the page runs somewhere that
//      offers one (window.claude.use('downloads'));
//   2. the share sheet on phones and tablets, where "Save Video" / "Save Image"
//      puts the file in Photos;
//   3. a plain download link.
//
// navigator.share only works straight from a tap, so save() reaches it without
// waiting on anything first. Keep it that way.
(function (global) {
  'use strict';

  function typeFor(name) {
    if (/\.png$/i.test(name)) return 'image/png';
    if (/\.wav$/i.test(name)) return 'audio/wav';
    if (/\.zip$/i.test(name)) return 'application/zip';
    if (/\.mp4$/i.test(name)) return 'video/mp4';
    if (/\.webm$/i.test(name)) return 'video/webm';
    return 'application/octet-stream';
  }

  var downloads = null;
  var readyPromise = null;

  // Asks for the downloads capability once. Resolves to
  // { host, downloads, failed }: host is false on an ordinary web page.
  function ready() {
    if (!readyPromise) {
      var host = !!(global.claude && global.claude.use);
      readyPromise = host
        ? global.claude.use('downloads').then(
            function (d) {
              downloads = d || null;
              return { host: true, downloads: downloads, failed: false };
            },
            function () {
              return { host: true, downloads: null, failed: true };
            },
          )
        : Promise.resolve({ host: false, downloads: null, failed: false });
    }
    return readyPromise;
  }

  // The share sheet is for phones and tablets; computers download directly,
  // even though desktop Chrome and Edge say they can share files. iPadOS
  // reports itself as a Mac, hence the touch check.
  function isPhoneOrTablet() {
    var ua = navigator.userAgent;
    return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function link(blob, name, revokeMs) {
    var url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, revokeMs || 5000);
    return { via: 'download', status: 'downloaded' };
  }

  // save(name, data, options) → Promise of what happened:
  //   { via: 'downloads', status: 'saved' | 'sent' }
  //   { via: 'downloads', status: 'error', code: 'declined' | 'rate_limited' | 'too_large' | 'failed' }
  //   { via: 'share', status: 'shared' | 'aborted' }
  //   { via: 'download', status: 'downloaded' }
  // options: share 'phone' (default) | 'any' | 'never'; shareTitle; revokeMs.
  function save(name, data, options) {
    var o = options || {};
    if (downloads) {
      return downloads.save({ filename: name, data: data }).then(
        function (r) {
          return { via: 'downloads', status: r && r.status === 'saved' ? 'saved' : 'sent' };
        },
        function (e) {
          var code = e && e.code;
          return {
            via: 'downloads',
            status: 'error',
            code: code === 'declined' || code === 'rate_limited' || code === 'too_large' ? code : 'failed',
          };
        },
      );
    }
    var blob = data instanceof Blob ? data : new Blob([data], { type: typeFor(name) });
    var file = null;
    try {
      file = new File([blob], name, { type: blob.type || typeFor(name) });
    } catch (e) {}
    var mayShare = o.share === 'any' || (o.share !== 'never' && isPhoneOrTablet());
    var shareable = false;
    try {
      shareable = !!(file && mayShare && navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) {}
    if (shareable) {
      var payload = { files: [file] };
      if (o.shareTitle) payload.title = o.shareTitle;
      var shared;
      try {
        shared = navigator.share(payload);
      } catch (e) {
        return Promise.resolve(link(blob, name, o.revokeMs));
      }
      return shared.then(
        function () {
          return { via: 'share', status: 'shared' };
        },
        function (e) {
          if (e && e.name === 'AbortError') return { via: 'share', status: 'aborted' };
          return link(blob, name, o.revokeMs);
        },
      );
    }
    return Promise.resolve(link(blob, name, o.revokeMs));
  }

  // The status line the tools show after a save. `words` replaces any phrase.
  function describe(result, name, words) {
    var w = words || {};
    var r = result || {};
    var key =
      r.via === 'downloads'
        ? r.status === 'error'
          ? r.code
          : r.status
        : r.via === 'share'
          ? r.status
          : 'downloaded';
    if (w[key] !== undefined) return w[key];
    switch (key) {
      case 'saved':
        return 'Saved ' + name + '.';
      case 'sent':
        return 'Sent ' + name + '.';
      case 'declined':
      case 'aborted':
        return 'Not saved.';
      case 'rate_limited':
        return 'A save is already open. Finish that one first.';
      case 'too_large':
        return 'That file is too large to save here.';
      case 'failed':
        return 'Couldn’t save the file here.';
      case 'shared':
        return /\.(mp4|webm|mov)$/i.test(name)
          ? 'Done. If you picked Save Video, it’s in Photos.'
          : /\.png$/i.test(name)
            ? 'Done. If you picked Save Image, it’s in Photos.'
            : 'Done. If you picked Save to Files, it’s in Files.';
      default:
        return 'Downloaded ' + name + '.';
    }
  }

  // Saves and writes the outcome into a status element (or calls a function).
  function saveTo(name, data, note, options) {
    var o = options || {};
    return save(name, data, o).then(function (result) {
      var text = describe(result, name, o.words);
      if (typeof note === 'function') note(text, result);
      else if (note) note.textContent = text;
      return result;
    });
  }

  global.TimSave = {
    typeFor: typeFor,
    ready: ready,
    isPhoneOrTablet: isPhoneOrTablet,
    save: save,
    saveTo: saveTo,
    describe: describe,
  };
})(typeof window !== 'undefined' ? window : globalThis);

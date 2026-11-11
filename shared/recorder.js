// Shared canvas recording lifecycle for T.IM Studio tools (window.TimRecorder).
//
// The tool keeps everything that decides what a recording looks and sounds
// like: it draws each frame, schedules its sound, and sets its own pre-roll and
// tail with session.after(). This file owns the parts that were copied into
// every tool: choosing a format, building the MediaRecorder, collecting the
// data, stopping on a hidden tab, and releasing tracks, timers and listeners
// on every outcome (finished, cancelled, failed) so recording again works.
//
// Plain script on purpose: most tools are plain inline scripts, and module
// tools can use the same global.
(function (global) {
  'use strict';

  // MP4 (H.264 + AAC) first for iPhone and CapCut, then WebM.
  var STANDARD_TYPES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  // First supported type from the list. '' means the browser records but
  // supports none of them (the recorder then picks its own format); null
  // means it cannot record at all.
  function pickType(list) {
    if (!global.MediaRecorder) return null;
    var types = list || STANDARD_TYPES;
    for (var i = 0; i < types.length; i++) {
      try {
        if (global.MediaRecorder.isTypeSupported(types[i])) return types[i];
      } catch (e) {}
    }
    return '';
  }

  function baseType(type) {
    return String(type || '').split(';')[0];
  }
  function extensionFor(type) {
    return baseType(type).indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  }

  // start(options) → session, or null when recording could not begin (onError
  // has already been called by then).
  //
  //   canvas              the canvas to capture
  //   fps                 capture rate (30)
  //   mimeTypes           preference order (STANDARD_TYPES)
  //   allowDefaultType    when none of mimeTypes is supported, let the browser
  //                       pick its own format (true) or fail with 'no-format'
  //   videoBitsPerSecond, audioBitsPerSecond
  //   audioTracks         MediaStreamTrack[] or a function returning them,
  //                       called once after the support check
  //   audioWithoutType    also send audioBitsPerSecond when the browser picks
  //                       the format (false, as the tools always did)
  //   stream              'new' builds a MediaStream from the tracks (default);
  //                       'capture' adds audio tracks to the canvas stream
  //   stopAudioTracks     also stop the audio tracks when the session ends
  //   timeslice           ms between data chunks; omit for one chunk at stop
  //   maxBytes            cancel with reason 'too-large' past this size
  //   watchdogMs          cancel with reason 'watchdog' after this long
  //   hiddenTab           'cancel' (default) or 'ignore'
  //   rejectEmpty         report an empty recording as error 'empty'
  //   beforeStart()       called once the recorder exists, just before it
  //                       starts: draw the first frame and lock the UI here
  //   onDone({blob, mimeType, ext, size})
  //   onCancel(reason)    'user' | 'hidden' | 'watchdog' | 'too-large' | custom
  //   onError({code, error})  code: 'unsupported' | 'no-format' | 'construct'
  //                       | 'start' | 'recorder' | 'empty'
  //
  // session.stop()         finish and keep the file → onDone
  // session.cancel(reason) finish and discard → onCancel
  // session.after(ms, fn)  a timer that is dropped when the session ends
  // session.active         true until the session has ended
  function start(options) {
    var o = options || {};
    var canvas = o.canvas;
    function fail(code, error) {
      if (o.onError) o.onError({ code: code, error: error || null });
      return null;
    }

    var type = pickType(o.mimeTypes);
    if (type === null || !canvas || !canvas.captureStream) return fail('unsupported');
    if (type === '' && o.allowDefaultType === false) return fail('no-format');

    var audio = [];
    var capture = null;
    var recorder = null;
    var chunks = [];
    var bytes = 0;
    var timers = [];
    var watchdog = 0;
    var ended = false;
    var cancelReason = null;
    var failure = null;

    function stopTracks() {
      if (capture) {
        var tracks = o.stopAudioTracks || o.stream === 'capture' ? capture.getTracks() : capture.getVideoTracks();
        tracks.forEach(function (track) {
          try {
            track.stop();
          } catch (e) {}
        });
      }
      if (o.stopAudioTracks)
        audio.forEach(function (track) {
          try {
            track.stop();
          } catch (e) {}
        });
    }
    function release() {
      timers.forEach(clearTimeout);
      timers = [];
      clearTimeout(watchdog);
      document.removeEventListener('visibilitychange', onVisibility);
      if (recorder) recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      stopTracks();
    }

    try {
      audio = (typeof o.audioTracks === 'function' ? o.audioTracks() : o.audioTracks) || [];
      audio = Array.prototype.slice.call(audio);
      capture = canvas.captureStream(o.fps || 30);
      var media;
      if (o.stream === 'capture') {
        media = capture;
        audio.forEach(function (track) {
          capture.addTrack(track);
        });
      } else media = new MediaStream(capture.getVideoTracks().slice().concat(audio));
      var settings = {};
      if (o.videoBitsPerSecond) settings.videoBitsPerSecond = o.videoBitsPerSecond;
      if (type) settings.mimeType = type;
      if (o.audioBitsPerSecond && (type || o.audioWithoutType)) settings.audioBitsPerSecond = o.audioBitsPerSecond;
      recorder = new global.MediaRecorder(media, settings);
    } catch (e) {
      stopTracks();
      return fail('construct', e);
    }

    function finish() {
      if (ended) return;
      ended = true;
      session.active = false;
      var mime = baseType((recorder && recorder.mimeType) || type || 'video/webm');
      release();
      if (failure) {
        chunks = [];
        if (o.onError) o.onError(failure);
        return;
      }
      if (cancelReason !== null) {
        chunks = [];
        if (o.onCancel) o.onCancel(cancelReason);
        return;
      }
      if (o.rejectEmpty && !bytes) {
        if (o.onError) o.onError({ code: 'empty', error: null });
        return;
      }
      var blob = new Blob(chunks, { type: mime });
      chunks = [];
      if (o.onDone) o.onDone({ blob: blob, mimeType: mime, ext: extensionFor(mime), size: blob.size });
    }
    // Stops the recorder; its stop event (after the last data) ends the session.
    function halt() {
      if (ended) return;
      timers.forEach(clearTimeout);
      timers = [];
      clearTimeout(watchdog);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        else finish();
      } catch (e) {
        finish();
      }
    }
    function cancel(reason) {
      if (ended || cancelReason !== null) return;
      cancelReason = reason || 'user';
      halt();
    }
    function onVisibility() {
      if (document.hidden) cancel('hidden');
    }

    var session = {
      active: true,
      mimeType: type,
      recorder: recorder,
      stop: function () {
        halt();
      },
      cancel: cancel,
      after: function (ms, fn) {
        if (ended) return 0;
        var id = setTimeout(function () {
          if (!ended) fn();
        }, ms);
        timers.push(id);
        return id;
      },
    };

    recorder.ondataavailable = function (e) {
      if (!e.data || !e.data.size) return;
      bytes += e.data.size;
      if (o.maxBytes && bytes > o.maxBytes) cancel('too-large');
      else chunks.push(e.data);
    };
    recorder.onstop = finish;
    recorder.onerror = function (e) {
      if (!failure) failure = { code: 'recorder', error: (e && e.error) || null };
      halt();
    };
    if (o.hiddenTab !== 'ignore') document.addEventListener('visibilitychange', onVisibility);

    try {
      if (o.beforeStart) o.beforeStart(session);
      if (o.timeslice) recorder.start(o.timeslice);
      else recorder.start();
    } catch (e) {
      failure = { code: 'start', error: e };
      halt();
      return null;
    }
    if (o.watchdogMs)
      watchdog = setTimeout(function () {
        cancel('watchdog');
      }, o.watchdogMs);
    return session;
  }

  // The wording most tools show. Tools with their own wording don't use these.
  function errorMessage(e) {
    var code = e && e.code,
      name = (e && e.error && e.error.name) || 'Error';
    if (code === 'construct' || code === 'start') return 'Recording couldn’t start in this browser (' + name + ').';
    if (code === 'recorder') return 'Recording was interrupted. Try again with this page open.';
    if (code === 'empty') return 'The recording came out empty. Try again.';
    if (code === 'no-format') return 'This browser has no video format these tools can record.';
    return 'This browser can’t record video. Try Safari on iPhone or Chrome on a computer.';
  }
  function cancelMessage(reason) {
    if (reason === 'hidden') return 'Recording stopped because this page went to the background. Keep it open while recording, then record again.';
    if (reason === 'watchdog') return 'Recording timed out. Keep this page open and try again.';
    if (reason === 'too-large') return 'Recording stopped: the file got too large. Try a shorter one.';
    return 'Recording cancelled.';
  }

  global.TimRecorder = {
    errorMessage: errorMessage,
    cancelMessage: cancelMessage,
    STANDARD_TYPES: STANDARD_TYPES,
    pickType: pickType,
    baseType: baseType,
    extensionFor: extensionFor,
    start: start,
  };
})(typeof window !== 'undefined' ? window : globalThis);

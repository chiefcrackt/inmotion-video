// Shared canvas recorder for T.IM Studio tools. The tool draws each frame as a
// function of time and supplies run(done), which starts the animation and its
// sound and calls done() when it finishes. This module handles the format
// choice, the short blank pre-roll and tail, and packaging the file.

const CODECS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

// Returns the first MediaRecorder type this browser supports, '' when it
// records but none of the listed types, or null when it cannot record at all.
export function pickMimeType() {
  if (!window.MediaRecorder) return null;
  for (const c of CODECS) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch (e) {}
  }
  return '';
}

// canvas: the canvas to capture. audioTracks: MediaStreamTrack[] to mix in
// (for example from a MediaStreamDestination). run(done): start the animation.
// blank(): draw the first frame before recording starts. onDone({blob, ext,
// mimeType}) gets the finished file; onError(message) gets a readable reason.
export function startRecording({
  canvas,
  audioTracks = [],
  run,
  blank,
  onDone,
  onError,
  bitrate = 12e6,
  preRollMs = 250,
  tailMs = 300,
}) {
  const type = pickMimeType();
  if (type === null || !canvas.captureStream) {
    onError('This browser can’t record video. Try Safari on iPhone or Chrome on a computer.');
    return null;
  }
  const stream = canvas.captureStream(30);
  const tracks = stream.getVideoTracks().slice().concat(audioTracks);
  let mr;
  try {
    mr = new MediaRecorder(
      new MediaStream(tracks),
      type
        ? { mimeType: type, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192e3 }
        : { videoBitsPerSecond: bitrate },
    );
  } catch (e) {
    onError('Recording couldn’t start in this browser (' + e.name + ').');
    return null;
  }
  const chunks = [];
  mr.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  mr.onstop = () => {
    stream.getVideoTracks().forEach((tr) => tr.stop());
    const mt = (mr.mimeType || type || 'video/webm').split(';')[0];
    const ext = mt.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    onDone({ blob: new Blob(chunks, { type: mt }), ext, mimeType: mt });
  };
  if (blank) blank();
  mr.start();
  // blank pre-roll so the first frame is already in the file, then the animation
  setTimeout(() => {
    run(() => {
      setTimeout(() => {
        try {
          mr.stop();
        } catch (e) {}
      }, tailMs);
    });
  }, preRollMs);
  return mr;
}

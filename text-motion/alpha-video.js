// WebM alpha uses a second VP9 bitstream in BlockAdditional, BlockAddID 1.
// https://www.matroska.org/technical/elements.html (AlphaMode, BlockAdditions)
(() => {
  const join = (parts) => {
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
    return bytes;
  };
  const uint = (n) => {
    const bytes = [];
    do {
      bytes.unshift(n % 256);
      n = Math.floor(n / 256);
    } while (n);
    return new Uint8Array(bytes);
  };
  const size = (n) => {
    let length = 1;
    while (n >= 2 ** (7 * length) - 1) length++;
    const bytes = new Uint8Array(length);
    for (let i = length - 1; i >= 0; i--) {
      bytes[i] = n % 256;
      n = Math.floor(n / 256);
    }
    bytes[0] |= 1 << (8 - length);
    return bytes;
  };
  const element = (id, body) => join([uint(id), size(body.length), body]);
  const number = (id, n) => element(id, uint(n));
  const text = (id, s) => element(id, new TextEncoder().encode(s));
  const master = (id, parts) => element(id, join(parts));
  const float = (id, n) => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, n);
    return element(id, bytes);
  };
  function mux(frames, w, h, fps) {
    const header = master(0x1a45dfa3, [
      number(0x4286, 1),
      number(0x42f7, 1),
      number(0x42f2, 4),
      number(0x42f3, 8),
      text(0x4282, 'webm'),
      number(0x4287, 4),
      number(0x4285, 2),
    ]);
    const info = master(0x1549a966, [
      number(0x2ad7b1, 1000000),
      text(0x4d80, 'T.im'),
      text(0x5741, 'Text Motion'),
      float(0x4489, (frames.length / fps) * 1000),
    ]);
    const tracks = master(0x1654ae6b, [
      master(0xae, [
        number(0xd7, 1),
        number(0x73c5, 1),
        number(0x83, 1),
        number(0x9c, 0),
        number(0x55ee, 1),
        text(0x86, 'V_VP9'),
        number(0x23e383, Math.round(1e9 / fps)),
        master(0xe0, [number(0xb0, w), number(0xba, h), number(0x53c0, 1)]),
      ]),
    ]);
    const clusters = frames.map((frame, i) =>
      master(0x1f43b675, [
        number(0xe7, Math.round((i / fps) * 1000)),
        master(0xa0, [
          element(0xa1, join([new Uint8Array([0x81, 0, 0, 0]), frame.color])),
          number(
            0x9b,
            Math.round(((i + 1) / fps) * 1000) - Math.round((i / fps) * 1000),
          ),
          master(0x75a1, [
            master(0xa6, [number(0xee, 1), element(0xa5, frame.alpha)]),
          ]),
        ]),
      ]),
    );
    return new Blob([header, master(0x18538067, [info, tracks, ...clusters])], {
      type: 'video/webm',
    });
  }
  window.exportAlphaVideo = async function (canvas, draw, seconds, progress) {
    if (!window.VideoEncoder || !window.VideoFrame)
      throw Error(
        'Transparent video needs a browser with WebCodecs VP9 encoding, such as Chrome or Edge. PNG exports are still available.',
      );
    const w = canvas.width,
      h = canvas.height,
      fps = 30;
    const config = {
      codec: 'vp09.00.10.08',
      width: w,
      height: h,
      framerate: fps,
      bitrate: 8000000,
      latencyMode: 'realtime',
      hardwareAcceleration: 'prefer-software',
    };
    if (!(await VideoEncoder.isConfigSupported(config)).supported)
      throw Error(
        'This browser cannot encode transparent WebM. Try Chrome or Edge, or use the PNG sequence.',
      );
    const colorCanvas = document.createElement('canvas'),
      alphaCanvas = document.createElement('canvas');
    for (const c of [colorCanvas, alphaCanvas]) {
      c.width = w;
      c.height = h;
    }
    const colorCtx = colorCanvas.getContext('2d'),
      alphaCtx = alphaCanvas.getContext('2d');
    const colorPixels = colorCtx.createImageData(w, h),
      alphaPixels = alphaCtx.createImageData(w, h);
    const source = canvas.getContext('2d');
    const frames = [];
    let failure = null,
      colorBytes,
      alphaBytes;
    const copy = (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      return bytes;
    };
    const colorEncoder = new VideoEncoder({
      output: (chunk) => {
        colorBytes = copy(chunk);
      },
      error: (e) => {
        failure = e;
      },
    });
    const alphaEncoder = new VideoEncoder({
      output: (chunk) => {
        alphaBytes = copy(chunk);
      },
      error: (e) => {
        failure = e;
      },
    });
    try {
      colorEncoder.configure(config);
      alphaEncoder.configure({ ...config, bitrateMode: 'quantizer' });
      for (let i = 0; i < seconds * fps; i++) {
        draw(i / fps);
        const pixels = source.getImageData(0, 0, w, h).data;
        for (let p = 0; p < pixels.length; p += 4) {
          colorPixels.data[p] = pixels[p];
          colorPixels.data[p + 1] = pixels[p + 1];
          colorPixels.data[p + 2] = pixels[p + 2];
          colorPixels.data[p + 3] = 255;
          alphaPixels.data[p] =
            alphaPixels.data[p + 1] =
            alphaPixels.data[p + 2] =
              pixels[p + 3];
          alphaPixels.data[p + 3] = 255;
        }
        colorCtx.putImageData(colorPixels, 0, 0);
        alphaCtx.putImageData(alphaPixels, 0, 0);
        const options = {
          timestamp: Math.round((i / fps) * 1e6),
          duration: Math.round(1e6 / fps),
        };
        const colorFrame = new VideoFrame(colorCanvas, options),
          alphaFrame = new VideoFrame(alphaCanvas, options);
        colorBytes = alphaBytes = null;
        try {
          colorEncoder.encode(colorFrame, { keyFrame: true });
          alphaEncoder.encode(alphaFrame, {
            keyFrame: true,
            vp9: { quantizer: 0 },
          });
        } finally {
          colorFrame.close();
          alphaFrame.close();
        }
        await Promise.all([colorEncoder.flush(), alphaEncoder.flush()]);
        if (failure) throw failure;
        if (!colorBytes || !alphaBytes)
          throw Error('Video encoder did not return a frame.');
        frames.push({ color: colorBytes, alpha: alphaBytes });
        progress((i + 1) / (seconds * fps));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return mux(frames, w, h, fps);
    } finally {
      if (colorEncoder.state !== 'closed') colorEncoder.close();
      if (alphaEncoder.state !== 'closed') alphaEncoder.close();
    }
  };
})();
